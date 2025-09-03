"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

import Navbar from "@/components/Navbar";

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
} from "lucide-react";

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
};

const MOCK_CONVERSATIONS: Conversation[] = [
  { id: "1", title: "DB schema & Supabase setup", status: "completed", lastMessage: "Aug 30" },
  { id: "2", title: "Coping strategies", status: "ongoing", lastMessage: "Aug 29" },
  { id: "3", title: "Career plan & outreach", status: "completed", lastMessage: "Aug 27" },
  { id: "4", title: "Mindfulness routine", status: "completed", lastMessage: "Aug 25" },
];

const MOCK_SAVED: SavedItem[] = [
  {
    id: "s1",
    title: "Supabase RLS cheat-sheet",
    content: "Enable RLS, then add select/insert/update self policies…",
    timestamp: Date.now() - 1000 * 60 * 60 * 24 * 2,
    type: "note",
  },
  {
    id: "s2",
    title: "Prompt style guide",
    content: "Keep system role minimal, add examples, avoid over-long context…",
    timestamp: Date.now() - 1000 * 60 * 60 * 24 * 5,
    type: "snippet",
  },
];

/* -------------------------------- component ------------------------------ */

export default function ProfilePage() {
  const router = useRouter();

  // profile from Supabase
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  // local UI state
  const [activeTab, setActiveTab] = useState<"conversations" | "saved" | "settings">("conversations");
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
      setProfile(data ?? { id: user.id, username: user.email ?? "Anonymous" });
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

  // actions
  const handleExportData = () => {
    // placeholder; wire to your export endpoint later
    alert("Export started (placeholder).");
  };

  const handleDeleteAccount = async () => {
    // In real app: call a server action / API route that uses service_role to delete user + profile
    alert("Account deletion flow (placeholder). Implement server-side with service role.");
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

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login"); // redirect after logout
  };



  return (
    <div className="min-h-screen bg-background">
      <Navbar onNavigate={handleNavigation as any} />

      <main className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-8">
        {/* back */}
        <Button variant="ghost" onClick={handleBackToHome} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Home
        </Button>

        {/* welcome */}
        <h1 className="text-xl font-semibold mb-4">Welcome, {displayName}</h1>

        {/* header */}
        <section className="rounded-2xl border bg-card p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row gap-5 sm:items-center">
            <Avatar className="h-20 w-20 ring-2 ring-foreground/10">
              <AvatarImage
                src={`https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}`}
                alt="User Avatar"
              />
              <AvatarFallback className="text-xl">
                {displayName.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <h2 className="text-2xl font-semibold tracking-tight">{displayName}</h2>
              <p className="text-sm text-muted-foreground mt-1">
                <Clock className="inline mr-1 h-4 w-4" />
                Last active: {new Date().toLocaleDateString()}
              </p>
              <div className="mt-2 flex gap-3 text-sm text-muted-foreground">
                <span>12 conversations</span>
                <span>•</span>
                <span>3 saved chats</span>
                <div className="flex justify-end"></div>
                <Button variant="outline" onClick={handleLogout}>
                  Log out
                </Button>
                </div>
              </div>
            </div>
          
           
        </section>

        {/* content */}
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
          <section className="lg:col-span-2">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
              <TabsList className="w-full grid grid-cols-3 rounded-full bg-muted/60 p-1">
                <TabsTrigger value="conversations" className="rounded-full data-[state=active]:bg-background">
                  <MessageCircle className="mr-2 h-4 w-4" /> Conversations
                </TabsTrigger>
                <TabsTrigger value="saved" className="rounded-full data-[state=active]:bg-background">
                  <BookmarkCheck className="mr-2 h-4 w-4" /> Saved
                </TabsTrigger>
                <TabsTrigger value="settings" className="rounded-full data-[state=active]:bg-background">
                  <SettingsIcon className="mr-2 h-4 w-4" /> Settings
                </TabsTrigger>
              </TabsList>

             

              {/* conversations */}
              <TabsContent value="conversations" className="mt-6">
                <div className="space-y-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search chats…"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>

                  <div className="space-y-3">
                    {filteredConversations.length === 0 ? (
                      <Card className="rounded-xl">
                        <CardContent className="p-8 text-center text-muted-foreground">
                          <p>No chats match “{searchQuery}”.</p>
                        </CardContent>
                      </Card>
                    ) : (
                      filteredConversations.map((c) => (
                        <div key={c.id} onClick={() => setSelectedConversation(c)}>
                          <ConversationRow conversation={c} onContinue={handleNavigateToChat} />
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </TabsContent>

              {/* saved */}
              <TabsContent value="saved" className="mt-6">
                <div className="space-y-4">
                  {MOCK_SAVED.map((item) => (
                    <Card key={item.id} className="rounded-xl hover:shadow-md transition-shadow">
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="text-base font-medium mb-1">{item.title}</h3>
                            <p className="text-sm text-muted-foreground mb-2 line-clamp-2">{item.content}</p>
                            <p className="text-xs text-muted-foreground">
                              Saved on{" "}
                              {new Date(item.timestamp).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })}
                            </p>
                          </div>
                          <Badge variant="outline" className="shrink-0 capitalize">
                            {item.type}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>

              {/* settings */}
              <TabsContent value="settings" className="mt-6">
                <div className="space-y-6">
                  <SettingsCard
                    title="Appearance"
                    description="Customize how your app looks and feels"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">Dark mode</div>
                        <p className="text-sm text-muted-foreground">
                          Toggle between light and dark themes
                        </p>
                      </div>
                      <Switch checked={isDarkMode} onCheckedChange={setIsDarkMode} />
                    </div>
                  </SettingsCard>

                  <SettingsCard
                    title="AI Preferences"
                    description="Configure your chat experience"
                  >
                    <div className="space-y-2">
                      <div className="font-medium">Default model</div>
                      <Select value={defaultModel} onValueChange={setDefaultModel}>
                        <SelectTrigger>
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
                  </SettingsCard>

                  <SettingsCard
                    title="Data Management"
                    description="Manage your personal data and account"
                  >
                    <div className="flex flex-col sm:flex-row gap-3">
                      <Button
                        variant="outline"
                        onClick={handleExportData}
                        className="sm:w-auto"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Export my data
                      </Button>

                      <Button
                        variant="destructive"
                        onClick={() => {
                          const ok = window.confirm(
                            "Are you absolutely sure?\n\nThis will permanently delete your account and remove all your data."
                          );
                          if (ok) handleDeleteAccount();
                        }}
                        className="sm:w-auto"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete account
                      </Button>
                    </div>
                  </SettingsCard>
                </div>
              </TabsContent>
            </Tabs>
          </section>

          {/* right panel */}
          {selectedConversation && (
            <aside className="lg:col-span-1">
              <Card className="sticky top-6 rounded-2xl shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Session Summary</CardTitle>
                  <CardDescription className="truncate">
                    {selectedConversation.title}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm leading-6 text-muted-foreground">
                    {selectedConversation.id === "1" &&
                      "Discussed project database schema and Supabase setup. Explored best practices for data modeling and API design patterns."}
                    {selectedConversation.id === "2" &&
                      "Worked through anxiety management techniques and developed personalized coping strategies for challenging situations."}
                    {selectedConversation.id === "3" &&
                      "Explored career development opportunities and created an action plan for skill building and networking."}
                    {selectedConversation.id === "4" &&
                      "Practiced mindfulness exercises and discussed the benefits of regular meditation for mental wellbeing."}
                  </p>

                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="capitalize">
                      {selectedConversation.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      Last: {selectedConversation.lastMessage}
                    </span>
                  </div>

                  <Button className="w-full rounded-full" onClick={handleNavigateToChat}>
                    Resume Conversation
                  </Button>
                </CardContent>
              </Card>
            </aside>
          )}
        </div>
      </main>
    </div>
  );
}

/* ------------------------------ subcomponents ----------------------------- */

function ConversationRow({
  conversation,
  onContinue,
}: {
  conversation: Conversation;
  onContinue: () => void;
}) {
  const isOngoing = conversation.status === "ongoing";
  return (
    <Card className="group cursor-pointer rounded-xl border shadow-sm transition-all hover:shadow-md">
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h3 className="truncate text-base font-medium">{conversation.title}</h3>
              <Badge variant={isOngoing ? "default" : "secondary"} className="uppercase">
                {isOngoing ? "Ongoing" : "Completed"}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground truncate">
              Last message: {conversation.lastMessage}
            </p>
          </div>
          <Button
            onClick={(e) => {
              e.stopPropagation();
              onContinue();
            }}
            className="rounded-full px-4"
          >
            Continue
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SettingsCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}
