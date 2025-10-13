"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import ConversationList from '@/components/conversation';
import Navbar from "@/components/Navbar";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import DeleteHistoryModal from "@/components/chat/DeleteHistoryModal";
import DeleteConversationModal from "@/components/chat/DeleteConversationModal";
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
import { getSessionUserId } from '@/lib/auth';
import { ReadyPlayerMeSelector } from './ReadyPlayerMeSelector';

function normalizeMoodValue(raw: unknown): string | null {
  if (!raw) return null;

  // If Supabase returned a JSON object (json/jsonb)
  if (typeof raw === "object") {
    const anyRaw = raw as { feeling?: string; intensity?: number };
    if (anyRaw && typeof anyRaw.feeling === "string") return anyRaw.feeling;
    return null;
  }

  // If it’s a string, it might be plain text or a JSON string
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.feeling === "string") return parsed.feeling;
    } catch {
      // Not JSON → treat as a label
      return raw;
    }
  }

  return null;
}

function moodMeta(raw: unknown) {
  const mood = normalizeMoodValue(raw);
  if (!mood) return { emoji: "🟡", label: "No mood selected" };

  const key = String(mood).toLowerCase();
  const map: Record<string, { emoji: string; label: string }> = {
    happy:       { emoji: "😀", label: "Happy" },
    calm:        { emoji: "🙂", label: "Calm" },
    neutral:     { emoji: "😐", label: "Neutral" },
    anxious:     { emoji: "😟", label: "Anxious" },
    sad:         { emoji: "😞", label: "Sad" },
    angry:       { emoji: "😡", label: "Angry" },
    overwhelmed: { emoji: "😵", label: "Overwhelmed" },
    reflective:  { emoji: "🤔", label: "Reflective" },
    frustrated:  { emoji: "😤", label: "Frustrated" }, // common value you mentioned
  };

  return map[key] ?? { emoji: "🙂", label: String(mood) };
}

function MoodPill({ mood }: { mood: unknown }) {
  const m = moodMeta(mood);
  return (
    <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs text-muted-foreground bg-background">
      <span>{m.emoji}</span>
      <span>{m.label}</span>
    </span>
  );
}

function MoodTrajectory({
  initial,
  final,
}: {
  initial: unknown;
  final: unknown;
}) {
  const i = moodMeta(initial);
  const f = moodMeta(final);
  const same =
    i.label.toLowerCase() === f.label.toLowerCase() && i.label !== "No mood";

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <MoodPill mood={initial} />
      <span className={same ? "opacity-40" : "opacity-70"}>→</span>
      <MoodPill mood={final} />
    </div>
  );
}


type Tab = "conversations" | "avatars" | "saved" | "settings";

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
};


// Soft-delete ALL conversations for this user
/*const applyDeleteHistory = async () => {
  if (!profile?.id) return;
  try {
    setDeletingAll(true);
    const { error } = await supabase
      .from("conversations")
      .update({ status: "deleted", deleted_at: new Date().toISOString() })
      .eq("created_by", profile.id)
      .neq("status", "deleted");
    if (error) throw error;

    // Clear client state
    setSavedConvos([]);
    setOngoingConvos([]);
    setShowDeleteHistory(false);
  } catch (e) {
    console.error("Delete history (soft) error:", e);
  } finally {
    setDeletingAll(false);
  }
}; */

// Soft-delete ONE conversation (by id)
/*const applyDeleteOne = async () => {
  if (!pendingDeleteConvo) return;
  try {
    setDeletingOne(true);
    const { error } = await supabase
      .from("conversations")
      .update({ status: "deleted", deleted_at: new Date().toISOString() })
      .eq("id", pendingDeleteConvo);
    if (error) throw error;

    // Remove from saved list UI
    setSavedConvos(prev => prev.filter(c => c.id !== pendingDeleteConvo));
    setPendingDeleteConvo(null);
    setPendingDeleteTitle(null);
  } catch (e) {
    console.error("Delete (soft) error:", e);
  } finally {
    setDeletingOne(false);
  }
};*/


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


export default function ProfileClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [showDeleteHistory, setShowDeleteHistory] = useState(false);
  const [pendingDeleteConvo, setPendingDeleteConvo] = useState<string | null>(null);
  const [pendingDeleteTitle, setPendingDeleteTitle] = useState<string | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);
  const [deletingOne, setDeletingOne] = useState(false);

  // STATE of profile from DB....
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  // loading.....

  // FOR UI!!!!
  const [searchQuery, setSearchQuery] = useState(""); // for search
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [defaultModel, setDefaultModel] = useState("gpt-4o-mini");

  // derived
  const displayName = useMemo(() => profile?.username ?? "Anonymous", [profile]);

  const initialTab = (() => {
    const t = searchParams.get("tab");
    return (t === "conversations" || t === "avatars" || t === "saved" || t === "settings")
      ? (t as Tab)
      : "conversations";
  })();

  // your existing state — change the generic to use our Tab type
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);

  type SavedConvo = {
      id: string;
      title: string | null;
      updated_at: string;
      initial_mood: unknown;
      final_mood: unknown;
    };

  const [savedConvos, setSavedConvos] = useState<SavedConvo[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(false);

  // keep state in sync if the query param changes (e.g., client nav)
  useEffect(() => {
    const t = searchParams.get("tab");
    if (t && t !== activeTab && (t === "conversations" || t === "avatars" || t === "saved" || t === "settings")) {
      setActiveTab(t as Tab);
    }
  }, [searchParams, activeTab]);
  

  useEffect(() => {
      if (!profile?.id) return;
      if (activeTab !== "saved") return;

      let cancelled = false;

      (async () => {
        try {
          setLoadingSaved(true);
          const { data, error } = await supabase
            .from("conversations")
            .select("id, title, updated_at, initial_mood, final_mood")
            .eq("created_by", profile.id)
            .in("status", ["ongoing", "ended"])
            .order("updated_at", { ascending: false });

          if (error) throw error;
          if (!cancelled) setSavedConvos(data ?? []);
        } catch (e) {
          console.error("load saved convos failed:", e);
          if (!cancelled) setSavedConvos([]);
        } finally {
          if (!cancelled) setLoadingSaved(false);
        }
      })();

  return () => { cancelled = true; };
}, [profile?.id, activeTab]);

// ProfileConversationsTab component moved outside useEffect
function ProfileConversationsTab() {
  const router = useRouter();
  const [resolving, setResolving] = useState<string | null>(null);

  const handleSelect = async (id: string) => {
    setResolving(id);
    try {
      const { data, error } = await supabase
        .from("conversations")
        .select("chat_mode")
        .eq("id", id)
        .single();
      if (error) throw error;
      const mode = (data?.chat_mode ?? "simple") as "simple" | "avatar";
      router.push(mode === "avatar" ? `/chat/avatar?convo=${id}` : `/chat/simple?convo=${id}`);
    } catch (e) {
      // Safe fallback: open in Simple Chat
      router.push(`/chat/simple?convo=${id}`);
    } finally {
      setResolving(null);
    }
  };

}


type OngoingConvo = { id: string; title: string | null; updated_at: string };

const [ongoingConvos, setOngoingConvos] = useState<OngoingConvo[]>([]);
const [loadingOngoing, setLoadingOngoing] = useState(false);




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
        router.replace(`/login?redirect=${encodeURIComponent("/profile")}`);
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, full_name, avatar_url, session_mode, rpm_user_url")
        .eq("id", u.id)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        console.warn("profiles load error:", error);
        setProfile({
          id: u.id,
          username: u.email ?? "Anonymous",
          rpm_user_url: null,
        });
      } else {
        setProfile(
          data ?? {
            id: u.id,
            username: u.email ?? "Anonymous",
            rpm_user_url: null,
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
    // Only handle user avatars now, no custom companions
    if (type === "user") {
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              rpm_user_url: avatar.url,
            }
          : prev
      );
    }
  };

  const handleDeleteSaved = async (convoId: string) => {
  try {
    // optimistic: hide it from the list immediately
    setSavedConvos((prev) => prev.filter((c) => c.id !== convoId));

    // soft delete in DB: status → "deleted" + deleted_at timestamp
    const { error } = await supabase
      .from("conversations")
      .update({ status: "deleted", deleted_at: new Date().toISOString() })
      .eq("id", convoId);

    if (error) {
      console.error("Failed to soft-delete conversation:", error);
      // (optional) show a toast + re-fetch list
    }
  } catch (e) {
    console.error("Delete (soft) error:", e);
  }
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

  // No more custom companions - using built-in Adam/Eve from avatar builder

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
 const handleNavigateToChat = () => router.push("/chat/simple?new=1"); // 👈 forces fresh chat

  const handleNavigation = (href: string) => router.push(href as any);

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

  const handleOpenConversation = async (id: string) => {
  try {
    const { data, error } = await supabase
      .from("conversations")
      .select("chat_mode")
      .eq("id", id)
      .single();
    if (error) throw error;

    const mode = (data?.chat_mode ?? "simple") as "simple" | "avatar";
    router.push(mode === "avatar" ? `/chat/avatar?convo=${id}` : `/chat/simple?convo=${id}`);
  } catch (e) {
    // Safe fallback
    router.push(`/chat/simple?convo=${id}`);
  }
};


  const handleDeleteHistory = async (skipConfirm = false) => {
  if (!skipConfirm) {
    const confirmed = window.confirm(
      "Are you absolutely sure?\n\nThis will mark ALL your conversations as Deleted."
    );
    if (!confirmed) return;
  }

  try {
    if (!profile?.id) return;

    const { error } = await supabase
      .from("conversations")
      .update({ status: "deleted", deleted_at: new Date().toISOString() })
      .eq("created_by", profile.id)
      .neq("status", "deleted");

    if (error) {
      console.error("Failed to soft-delete all conversations:", error);
      return;
    }

    // Clear client-side lists & close modal
    setSavedConvos([]);
    setOngoingConvos([]);
    setShowDeleteHistory(false);
  } catch (e) {
    console.error("Delete history (soft) error:", e);
  }
};

  if (loadingProfile) return <p className="p-6">Loading profile…</p>;
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
    <div className="min-h-screen bg-gradient-to-br from-purple-100 via-pink-50 to-blue-100">
      <Navbar onNavigate={handleNavigation as any} currentPage="profile" isLoggedIn={true} isLoading={false} />

      <main className="mx-auto w-full max-w-7xl px-4 sm:px-6 py-6">
        {/* Back Button */}
        <Button variant="ghost" onClick={handleBackToHome} className="mb-6 trauma-safe gentle-focus">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Home
        </Button>

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
            <Tabs
              value={activeTab}
              onValueChange={(v) => {
                const next = v as Tab;
                setActiveTab(next);

                // write the tab to the URL so refresh/deeplink stays correct
                const sp = new URLSearchParams(Array.from(searchParams.entries()));
                sp.set("tab", next);
                router.replace(`?${sp.toString()}`); // stays on /profile but updates query
              }}
              className="w-full"
            >
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
                  Past Conversations
                </TabsTrigger>
                <TabsTrigger value="settings" className="trauma-safe gentle-focus">
                  <SettingsIcon className="w-4 h-4 mr-2" />
                  Settings
                </TabsTrigger>
              </TabsList>

              {/* Conversations Tab */}

              <TabsContent value="conversations" className="mt-6">
  <ConversationList
    onSelect={handleOpenConversation}   // ← use the handler above
    showSearch
    mineOnly={true}
  />
</TabsContent>



              {/* 3D Avatars Tab */}
              <TabsContent value="avatars" className="mt-6">
                <ReadyPlayerMeSelector
                  onAvatarSelect={handleReadyPlayerMeAvatarSelect}
                  currentUserAvatar={currentUserAvatarFromDB}
                  currentCompanionAvatar={undefined}
                />
              </TabsContent>

              {/* Saved Tab */}
              <TabsContent value="saved" className="mt-6">
                  {loadingSaved ? (
                    <Card className="trauma-safe">
                      <CardContent className="p-8 text-center text-muted-foreground">
                        Loading saved chats…
                      </CardContent>
                    </Card>
                  ) : savedConvos.length === 0 ? (
                    <Card className="trauma-safe">
                      <CardContent className="p-8 text-center text-muted-foreground">
                        No saved chats yet.
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="space-y-3">
                      {savedConvos.map((c) => (
                        <Card key={c.id} className="trauma-safe calm-hover">
                          <CardContent className="p-4">
                              <div className="w-full flex justify-center mb-3">
                                <MoodTrajectory initial={c.initial_mood} final={c.final_mood} />
                              </div>
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <div className="flex items-center space-x-3 mb-2">
                                  <h3>{c.title || "Untitled Chat"}</h3>
                                  <Badge variant="secondary" className="trauma-safe">
                                    {new Date(c.updated_at).toLocaleDateString()}
                                  </Badge>
                                </div>
                              </div>
                              <div className="flex flex-col items-center justify-center gap-2 min-w-[160px] text-center">
                                  <Button
                                    size="sm"
                                    onClick={() => router.push(`/chat/summary?convo=${c.id}`)}
                                    className="trauma-safe gentle-focus"
                                  >
                                    View
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => { setPendingDeleteConvo(c.id); setPendingDeleteTitle(c.title || "Untitled Chat"); }}
                                    className="border-red-300 text-red-600 hover:bg-red-50"
                                  >
                                    Delete
                                  </Button>

                                </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
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
                      <Button onClick={() => setShowDeleteHistory(true)} className="w-full sm:w-auto trauma-safe gentle-focus" variant="destructive">
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete History
                      </Button>

                      <div>
                        <Button
                          variant="destructive"
                          onClick={handleDeleteAccount}
                          className="w-full sm:w-auto trauma-safe gentle-focus"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete Account
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
      {showDeleteHistory && (
          <DeleteHistoryModal
            onClose={() => setShowDeleteHistory(false)}
            onConfirm={async () => { await handleDeleteHistory(true); }}
          />
        )}

      {pendingDeleteConvo && (
          <DeleteConversationModal
            onClose={() => { setPendingDeleteConvo(null); setPendingDeleteTitle(null); }}
            onConfirm={async () => {
              if (pendingDeleteConvo) {
                await handleDeleteSaved(pendingDeleteConvo);  // << reuse old logic
              }
              setPendingDeleteConvo(null);
              setPendingDeleteTitle(null); // close modal after action
            }}
            title={pendingDeleteTitle}
          />
        )}
    </div>
  );
}
