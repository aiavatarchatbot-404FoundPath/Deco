"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

import Navbar from "@/components/Navbar";
import { ReadyPlayerMeSelector } from './ReadyPlayerMeSelector';

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  Search,
  MessageCircle,
  BookmarkCheck,
  Settings as SettingsIcon,
  Clock,
  Download,
  Trash2,
  ArrowLeft,
  User,
  Check,
  Crown,
} from "lucide-react";

interface ReadyPlayerMeAvatar {
  id: string;
  name: string;
  url: string;
  type: 'user' | 'companion';
  thumbnail?: string;
  isCustom?: boolean;
}

/* ----------------------------- types & mocks ----------------------------- */

type Conversation = {
  id: string;
  title: string;
  status: "ongoing" | "completed";
  lastMessage: string;
};

type SavedItem = {
  id: string;
  title: string;
  content: string;
  timestamp: number;
  type: "note" | "clip" | "snippet";
};

type Profile = {
  id: string;
  username: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
  session_mode?: string | null;
  readyPlayerMeAvatars?: {
    userAvatar?: ReadyPlayerMeAvatar;
    companionAvatar?: ReadyPlayerMeAvatar;
  };
};

const MOCK_CONVERSATIONS: Conversation[] = [
  { id: "1", title: "Chat with Mentor", status: "ongoing", lastMessage: "Yesterday · 14:05" },
  { id: "2", title: "Anxiety Support Session", status: "completed", lastMessage: "Aug 28 · 16:30" },
  { id: "3", title: "Career Guidance Chat", status: "ongoing", lastMessage: "Aug 27 · 10:15" },
  { id: "4", title: "Mindfulness Practice", status: "completed", lastMessage: "Aug 25 · 19:45" },
];

const MOCK_SAVED: SavedItem[] = [
  {
    id: "s1",
    title: "Pinned Answer — Data pipeline explanation",
    content: "Detailed explanation about setting up data pipelines with best practices...",
    timestamp: Date.now() - 1000 * 60 * 60 * 24 * 2,
    type: "note",
  },
  {
    id: "s2",
    title: "Coping Strategies for Stress",
    content: "Five effective techniques for managing stress in challenging situations...",
    timestamp: Date.now() - 1000 * 60 * 60 * 24 * 5,
    type: "snippet",
  },
  {
    id: "s3",
    title: "Career Resources List",
    content: "Comprehensive list of career development resources and tools...",
    timestamp: Date.now() - 1000 * 60 * 60 * 24 * 10,
    type: "clip",
  },
];

/* -------------------------------- component ------------------------------ */

export default function ProfilePageSupabase() {
  const router = useRouter();

  // profile from Supabase
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  // local UI state
  const [activeTab, setActiveTab] = useState<"conversations" | "avatars" | "saved" | "settings">("conversations");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [defaultModel, setDefaultModel] = useState("gpt-4o-mini");

  // derived
  const displayName = useMemo(() => profile?.username ?? "Anonymous", [profile]);

  useEffect(() => {
    (async () => {
      setLoadingProfile(true);

      // ensure signed in
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login");
        return;
      }

      // fetch profiles row
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, full_name, avatar_url, session_mode")
        .eq("id", user.id)
        .single();

      if (error) {
        console.error("Error loading profile:", error);
      }
      
      // Load stored ReadyPlayerMe avatars from localStorage
      const storedAvatars = localStorage.getItem('readyPlayerMe_avatars');
      let readyPlayerMeAvatars = undefined;
      if (storedAvatars) {
        try {
          readyPlayerMeAvatars = JSON.parse(storedAvatars);
        } catch (error) {
          console.error('Error parsing stored avatars:', error);
        }
      }

      setProfile({ 
        ...(data ?? { id: user.id, username: user.email ?? "Anonymous" }),
        readyPlayerMeAvatars 
      });
      setLoadingProfile(false);
    })();
  }, [router]);

  // conversations filter
  const filteredConversations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return MOCK_CONVERSATIONS;
    return MOCK_CONVERSATIONS.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.lastMessage.toLowerCase().includes(q) ||
        c.status.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  // nav handlers
  const handleBackToHome = () => router.push("/");
  const handleNavigateToChat = () => router.push("/chat");
  const handleNavigation = (href: string) => router.push(href);

  // ReadyPlayerMe avatar handler
  const handleReadyPlayerMeAvatarSelect = (avatar: ReadyPlayerMeAvatar, type: 'user' | 'companion') => {
    if (!profile) return;

    const updatedProfile = {
      ...profile,
      readyPlayerMeAvatars: {
        ...profile.readyPlayerMeAvatars,
        [type === 'user' ? 'userAvatar' : 'companionAvatar']: avatar
      }
    };
    
    setProfile(updatedProfile);
    
    // Store avatars in localStorage
    localStorage.setItem('readyPlayerMe_avatars', JSON.stringify(updatedProfile.readyPlayerMeAvatars));
  };

  // actions
  const handleExportData = () => {
    // placeholder; wire to your export endpoint later
    alert("Export started (placeholder).");
  };

  const handleDeleteAccount = async () => {
    // In real app: call a server action / API route that uses service_role to delete user + profile
    const confirmed = window.confirm(
      "Are you absolutely sure?\\n\\nThis action cannot be undone. This will permanently delete your account and remove all your data from our servers, including conversations and saved items."
    );
    if (confirmed) {
      alert("Account deletion flow (placeholder). Implement server-side with service role.");
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login"); // redirect after logout
  };

  if (loadingProfile) {
    return <p className="p-6">Loading profile…</p>;
  }

  if (!profile) {
    return (
      <div className="p-6">
        <p>Could not load profile.</p>
        <Button className="mt-4" onClick={() => router.push("/login")}>
          Go to Login
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar onNavigate={handleNavigation as any} />

      <main className="mx-auto w-full max-w-7xl px-4 sm:px-6 py-6">
        {/* Back Button */}
        <Button
          variant="ghost"
          onClick={handleBackToHome}
          className="mb-6 trauma-safe gentle-focus"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Home
        </Button>

        {/* Profile Header */}
        <div className="bg-card rounded-lg border border-border p-6 mb-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-4 sm:space-y-0 sm:space-x-6">
            {/* Avatar */}
            <Avatar className="w-20 h-20">
              {profile?.readyPlayerMeAvatars?.userAvatar?.thumbnail ? (
                <AvatarImage src={profile.readyPlayerMeAvatars.userAvatar.thumbnail} alt="User Avatar" />
              ) : (
                <AvatarImage 
                  src={`https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}`} 
                  alt="User Avatar" 
                />
              )}
              <AvatarFallback className="bg-gradient-to-br from-soft-teal to-soft-lilac text-white text-xl">
                {displayName.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>

            {/* User Info */}
            <div className="flex-1">
              <h1 className="mb-1">{displayName}</h1>
              <p className="text-muted-foreground mb-2">
                <Clock className="w-4 h-4 inline mr-1" />
                Last active: {new Date().toLocaleDateString()}
              </p>
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                <span>12 conversations</span>
                <span>•</span>
                <span>3 saved chats</span>
                {profile?.readyPlayerMeAvatars?.userAvatar && (
                  <>
                    <span>•</span>
                    <span className="text-teal-600 dark:text-teal-400">🎭 3D Avatar Ready</span>
                  </>
                )}
              </div>
              {profile?.readyPlayerMeAvatars?.companionAvatar && (
                <div className="mt-2">
                  <Badge variant="secondary" className="bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                    💜 Companion: {profile.readyPlayerMeAvatars.companionAvatar.name}
                  </Badge>
                </div>
              )}
            </div>
            
            <Button variant="outline" onClick={handleLogout} className="trauma-safe gentle-focus">
              Log out
            </Button>
          </div>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Tabs */}
          <div className="lg:col-span-2">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
              <TabsList className="grid w-full grid-cols-4 trauma-safe">
                <TabsTrigger value="conversations" className="trauma-safe gentle-focus">
                  <MessageCircle className="w-4 h-4 mr-2" />
                  Conversations
                </TabsTrigger>
                <TabsTrigger value="avatars" className="trauma-safe gentle-focus">
                  <User className="w-4 h-4 mr-2" />
                  3D Avatars
                </TabsTrigger>
                <TabsTrigger value="saved" className="trauma-safe gentle-focus">
                  <BookmarkCheck className="w-4 h-4 mr-2" />
                  Saved
                </TabsTrigger>
                <TabsTrigger value="settings" className="trauma-safe gentle-focus">
                  <SettingsIcon className="w-4 h-4 mr-2" />
                  Settings
                </TabsTrigger>
              </TabsList>

              {/* Conversations Tab */}
              <TabsContent value="conversations" className="mt-6">
                <div className="space-y-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search chats…"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 trauma-safe gentle-focus"
                    />
                  </div>

                  <div className="space-y-3">
                    {filteredConversations.length === 0 ? (
                      <Card className="trauma-safe">
                        <CardContent className="p-8 text-center text-muted-foreground">
                          <p>No chats match "{searchQuery}".</p>
                        </CardContent>
                      </Card>
                    ) : (
                      filteredConversations.map((conversation) => (
                        <Card 
                          key={conversation.id} 
                          className="trauma-safe calm-hover cursor-pointer transition-all duration-200"
                          onClick={() => setSelectedConversation(conversation)}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <div className="flex items-center space-x-3 mb-2">
                                  <h3>{conversation.title}</h3>
                                  <Badge 
                                    variant={conversation.status === 'ongoing' ? 'default' : 'secondary'}
                                    className="trauma-safe"
                                  >
                                    {conversation.status === 'ongoing' ? 'Ongoing' : 'Completed'}
                                  </Badge>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  Last message: {conversation.lastMessage}
                                </p>
                              </div>
                              <Button 
                                size="sm" 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleNavigateToChat();
                                }}
                                className="trauma-safe gentle-focus"
                              >
                                Continue
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))
                    )}
                  </div>
                </div>
              </TabsContent>

              {/* 3D Avatars Tab */}
              <TabsContent value="avatars" className="mt-6">
                <ReadyPlayerMeSelector
                  onAvatarSelect={handleReadyPlayerMeAvatarSelect}
                  currentUserAvatar={profile?.readyPlayerMeAvatars?.userAvatar}
                  currentCompanionAvatar={profile?.readyPlayerMeAvatars?.companionAvatar}
                />
              </TabsContent>

              {/* Saved Tab */}
              <TabsContent value="saved" className="mt-6">
                <div className="space-y-4">
                  {MOCK_SAVED.map((item) => (
                    <Card key={item.id} className="trauma-safe calm-hover">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h3 className="mb-2">{item.title}</h3>
                            <p className="text-sm text-muted-foreground mb-2">
                              {item.content}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Saved on {new Date(item.timestamp).toLocaleDateString('en-US', { 
                                month: 'short', 
                                day: 'numeric', 
                                year: 'numeric' 
                              })}
                            </p>
                          </div>
                          <Badge variant="outline" className="ml-3 trauma-safe">
                            {item.type}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>

              {/* Settings Tab */}
              <TabsContent value="settings" className="mt-6">
                <div className="space-y-6">
                  {/* Appearance Settings */}
                  <Card className="trauma-safe">
                    <CardHeader>
                      <CardTitle>Appearance</CardTitle>
                      <CardDescription>Customize how your app looks and feels</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <label className="font-medium">Dark mode</label>
                          <p className="text-sm text-muted-foreground">Toggle between light and dark themes</p>
                        </div>
                        <Switch
                          checked={isDarkMode}
                          onCheckedChange={setIsDarkMode}
                          className="trauma-safe"
                        />
                      </div>
                    </CardContent>
                  </Card>

                  {/* AI Settings */}
                  <Card className="trauma-safe">
                    <CardHeader>
                      <CardTitle>AI Preferences</CardTitle>
                      <CardDescription>Configure your chat experience</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <label className="font-medium">Default model</label>
                        <Select value={defaultModel} onValueChange={setDefaultModel}>
                          <SelectTrigger className="trauma-safe gentle-focus">
                            <SelectValue placeholder="Select AI model" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="gpt-4o-mini">GPT-4o mini</SelectItem>
                            <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                            <SelectItem value="claude-3">Claude 3</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-sm text-muted-foreground">
                          Choose which AI model to use by default for conversations
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Data Management */}
                  <Card className="trauma-safe">
                    <CardHeader>
                      <CardTitle>Data Management</CardTitle>
                      <CardDescription>Manage your personal data and account</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <Button 
                        variant="outline" 
                        onClick={handleExportData}
                        className="w-full sm:w-auto trauma-safe gentle-focus"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Export my data
                      </Button>

                      <div>
                        <Button 
                          variant="destructive" 
                          onClick={handleDeleteAccount}
                          className="w-full sm:w-auto trauma-safe gentle-focus"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete account
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </Tabs>
          </div>

          {/* Right Column - Session Summary */}
          {selectedConversation && (
            <div className="lg:col-span-1">
              <Card className="trauma-safe sticky top-6">
                <CardHeader>
                  <CardTitle>Session Summary</CardTitle>
                  <CardDescription>{selectedConversation.title}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm">
                    {selectedConversation.id === '1' && 
                      "Discussed project database schema and Supabase setup. Explored best practices for data modeling and API design patterns."
                    }
                    {selectedConversation.id === '2' && 
                      "Worked through anxiety management techniques and developed personalized coping strategies for challenging situations."
                    }
                    {selectedConversation.id === '3' && 
                      "Explored career development opportunities and created an action plan for skill building and networking."
                    }
                    {selectedConversation.id === '4' && 
                      "Practiced mindfulness exercises and discussed the benefits of regular meditation for mental wellbeing."
                    }
                  </p>
                  
                  <div className="flex flex-col space-y-2">
                    <Badge variant="outline" className="w-fit trauma-safe">
                      {selectedConversation.status}
                    </Badge>
                    <p className="text-xs text-muted-foreground">
                      Last activity: {selectedConversation.lastMessage}
                    </p>
                  </div>

                  <Button 
                    className="w-full trauma-safe gentle-focus"
                    onClick={handleNavigateToChat}
                  >
                    Resume Conversation
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}