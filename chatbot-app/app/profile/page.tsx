"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import ConversationList from '@/components/conversation';
import Navbar from "@/components/Navbar";
import { Loading } from "@/components/ui/loading";
import { ReadyPlayerMeSelector } from "./ReadyPlayerMeSelector";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
// at top of your Profile page file:
//import { useEffect, useMemo, useState } from 'react';
//import { supabase } from '@/lib/supabaseClient';
import { getSessionUserId } from '@/lib/auth';
//import { useRouter } from 'next/navigation';

type ConversationRow = {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
};

type LastByConvo = Record<string, { content: string; created_at: string }>;

interface ReadyPlayerMeAvatar {
  id: string;
  name: string;
  url: string;
  type: "user" | "companion";
  thumbnail?: string; 
  isCustom?: boolean;
}


// GLB --> Png
function toThumbnail(url?: string | null): string | null {
  if (!url) return null;
  if (url.endsWith(".png")) return url;
  if (url.endsWith(".glb")) return url.replace(".glb", ".png");

  // Try to extract avatar id and use the official PNG endpoint
  try {
    const last = url.split("/").pop() || "";
    const id = last.replace(".glb", "");
    if (id && id.length > 10) {
      return `https://api.readyplayer.me/v1/avatars/${id}.png`;
    }
  } catch {}
  return null;
}

function idFromUrl(url: string): string {
  const last = url.split("/").pop() || "";
  return last.replace(".glb", "") || `custom-${Date.now()}`;
}

// JUST FOR NOW ITS THE mock data
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

  
  rpm_user_url?: string | null;
  rpm_companion_url?: string | null;
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

// This component should be defined outside of the ProfilePageSupabase component
// to prevent it from being recreated on every render.
function ProfileConversationsTab() {
  const router = useRouter();
  return (
    <ConversationList
      onSelect={(id) => router.push(`/chat/avatar?convo=${id}`)}
      showSearch
      mineOnly={true}
    />
  );
}

export default function ProfilePageSupabase() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromChatConvoId = searchParams.get('convo');

  // STATE of profile from DB....
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true); 
  // loading.....

  // FOR UI!!!!
  const [activeTab, setActiveTab] = useState<"conversations" | "avatars" | "saved" | "settings">("conversations");
  const [searchQuery, setSearchQuery] = useState(""); // for search
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [defaultModel, setDefaultModel] = useState("gpt-4o-mini");

  // derived
  const displayName = useMemo(() => profile?.username ?? "Anonymous", [profile]);

useEffect(() => {
  let cancelled = false;

  async function getStableSession() {
    for (let i = 0; i < 10; i++) {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) return session;
      await new Promise((r) => setTimeout(r, 100));
    }
    return null;
  }
  async function load() {
    if (!cancelled) setLoadingProfile(true);
    try {
      const session = await getStableSession();
      const u = session?.user;

      if (!u) {
        if (!cancelled) {
          setProfile(null);
          setLoadingProfile(false);
        }
        router.replace("/login");
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, full_name, avatar_url, session_mode, rpm_user_url, rpm_companion_url")
        .eq("id", u.id)
        .maybeSingle(); 

      if (cancelled) return;

      if (error) {
        console.warn("profiles load error:", error);
        setProfile({
          id: u.id,
          username: u.email ?? "Anonymous",
          rpm_user_url: null,
          rpm_companion_url: null,
        });
      } else {
        setProfile(
          data ?? {
            id: u.id,
            username: u.email ?? "Anonymous",
            rpm_user_url: null,
            rpm_companion_url: null,
          }
        );
      }
    } catch (e) {
      console.error("profile load exception:", e);
      if (!cancelled) setProfile(null);
    } finally {
      if (!cancelled) setLoadingProfile(false);
    }
  }

  // initial load
  load();

  // keep in sync with auth changes
  const { data: sub } = supabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_IN") load();
    if (event === "SIGNED_OUT") {
      if (!cancelled) {
        setProfile(null);
        setLoadingProfile(false);
      }
      router.replace("/login");
    }
  });

  return () => {
    cancelled = true;
    sub.subscription.unsubscribe();
  };
}, [router]);


  // When the selector fires, we update DB via selector (it already saves)
  // and also reflect the new URL immediately in our profile state so the header updates.
  const handleReadyPlayerMeAvatarSelect = (avatar: ReadyPlayerMeAvatar, type: "user" | "companion") => {
    setProfile((prev) =>
      prev
        ? {
            ...prev,
            rpm_user_url: type === "user" ? avatar.url : prev.rpm_user_url ?? null,
            rpm_companion_url: type === "companion" ? avatar.url : prev.rpm_companion_url ?? null,
          }
        : prev
    );
  };

  // Build DB-backed avatar objects for the selector (for its UI)
  const currentUserAvatarFromDB: ReadyPlayerMeAvatar | undefined = useMemo(() => {
    const url = profile?.rpm_user_url ?? null;
    if (!url) return undefined;
    return {
      id: idFromUrl(url),
      name: "Custom Avatar",
      url,
      type: "user",
      thumbnail: toThumbnail(url) ?? undefined,
      isCustom: true,
    };
  }, [profile?.rpm_user_url]);

  const currentCompanionAvatarFromDB: ReadyPlayerMeAvatar | undefined = useMemo(() => {
    const url = profile?.rpm_companion_url ?? null;
    if (!url) return undefined;
    return {
      id: idFromUrl(url),
      name: "Custom Companion",
      url,
      type: "companion",
      thumbnail: toThumbnail(url) ?? undefined,
      isCustom: true,
    };
  }, [profile?.rpm_companion_url]);

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
  const handleBackToChat = () => {
    if (fromChatConvoId) router.push(`/chat/avatar?convo=${fromChatConvoId}`);
  };
  const handleNavigateToChat = () => router.push("/chat/avatar");
  const handleNavigation = (href: string) => router.push(href);

  const handleExportData = () => alert("Export started (placeholder).");
  const handleDeleteAccount = async () => {
    const confirmed = window.confirm(
      "Are you absolutely sure?\n\nThis will permanently delete your account and data."
    );
    if (confirmed) alert("Account deletion flow (placeholder). Use a server route with service role.");
  };
  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  if (loadingProfile) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar onNavigate={handleNavigation as any} currentPage="profile" />
        <Loading message="Loading profile..." />
      </div>
    );
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

  //  Header avatar thumbnail comes straight from DB (per-user)
  const headerThumb = toThumbnail(profile.rpm_user_url);

  return (
    <div className="min-h-screen bg-background">
      <Navbar onNavigate={handleNavigation as any} currentPage="profile" />

      <main className="mx-auto w-full max-w-7xl px-4 sm:px-6 py-6">
        {/* Back Button */}
        {fromChatConvoId ? (
          <Button variant="ghost" onClick={handleBackToChat} className="mb-6 trauma-safe gentle-focus">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Chat
          </Button>
        ) : (
          <Button variant="ghost" onClick={handleBackToHome} className="mb-6 trauma-safe gentle-focus">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Button>
        )}

        {/* Profile Header */}
        <div className="bg-card rounded-lg border border-border p-6 mb-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-4 sm:space-y-0 sm:space-x-6">
            {/* Avatar (DB-backed) */}
            <Avatar className="w-20 h-20">
              {headerThumb ? (
                <AvatarImage src={headerThumb} alt="User Avatar" />
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
                {profile.rpm_user_url && (
                  <>
                    <span>•</span>
                    <span className="text-teal-600 dark:text-teal-400">🎭 3D Avatar Ready</span>
                  </>
                )}
              </div>
              {profile.rpm_companion_url && (
                <div className="mt-2">
                  <Badge variant="secondary" className="bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                    💜 Companion: Custom Companion
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
                <ProfileConversationsTab />
              </TabsContent>


              {/* 3D Avatars Tab */}
              <TabsContent value="avatars" className="mt-6">
                <ReadyPlayerMeSelector
                  onAvatarSelect={handleReadyPlayerMeAvatarSelect}
                  currentUserAvatar={currentUserAvatarFromDB}
                  currentCompanionAvatar={currentCompanionAvatarFromDB}
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
                            <p className="text-sm text-muted-foreground mb-2">{item.content}</p>
                            <p className="text-xs text-muted-foreground">
                              Saved on{" "}
                              {new Date(item.timestamp).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
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
                        <Switch checked={isDarkMode} onCheckedChange={setIsDarkMode} className="trauma-safe" />
                      </div>
                    </CardContent>
                  </Card>

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
                        <p className="text-sm text-muted-foreground">Choose the default model for conversations</p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="trauma-safe">
                    <CardHeader>
                      <CardTitle>Data Management</CardTitle>
                      <CardDescription>Manage your personal data and account</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <Button variant="outline" onClick={handleExportData} className="w-full sm:w-auto trauma-safe gentle-focus">
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
                    {/* placeholder summaries */}
                    {selectedConversation.id === "1" && "Discussed project database schema and Supabase setup."}
                    {selectedConversation.id === "2" && "Worked through anxiety management techniques."}
                    {selectedConversation.id === "3" && "Explored career development opportunities."}
                    {selectedConversation.id === "4" && "Practiced mindfulness exercises."}
                  </p>

                  <div className="flex flex-col space-y-2">
                    <Badge variant="outline" className="w-fit trauma-safe">
                      {selectedConversation.status}
                    </Badge>
                    <p className="text-xs text-muted-foreground">Last activity: {selectedConversation.lastMessage}</p>
                  </div>

                  <Button className="w-full trauma-safe gentle-focus" onClick={handleNavigateToChat}>
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
