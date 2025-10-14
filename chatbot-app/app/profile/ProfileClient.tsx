"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import Navbar from "@/components/Navbar";
import ConversationList from "@/components/conversation";
import DeleteHistoryModal from "@/components/chat/DeleteHistoryModal";
import DeleteConversationModal from "@/components/chat/DeleteConversationModal";
import { ReadyPlayerMeSelector } from "./ReadyPlayerMeSelector";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import {
  ArrowLeft,
  BookmarkCheck,
  Clock,
  MessageCircle,
  Settings as SettingsIcon,
  Trash2,
  User,
} from "lucide-react";

/* --------------------------------- Utils --------------------------------- */

function normalizeMoodValue(raw: unknown): string | null {
  if (!raw) return null;
  if (typeof raw === "object") {
    const anyRaw = raw as { feeling?: string; intensity?: number };
    if (anyRaw && typeof anyRaw.feeling === "string") return anyRaw.feeling;
    return null;
  }
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.feeling === "string") return parsed.feeling;
    } catch {
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
    happy: { emoji: "😀", label: "Happy" },
    calm: { emoji: "🙂", label: "Calm" },
    neutral: { emoji: "😐", label: "Neutral" },
    anxious: { emoji: "😟", label: "Anxious" },
    sad: { emoji: "😞", label: "Sad" },
    angry: { emoji: "😡", label: "Angry" },
    overwhelmed: { emoji: "😵", label: "Overwhelmed" },
    reflective: { emoji: "🤔", label: "Reflective" },
    frustrated: { emoji: "😤", label: "Frustrated" },
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

function MoodTrajectory({ initial, final }: { initial: unknown; final: unknown }) {
  const i = moodMeta(initial);
  const f = moodMeta(final);
  const same = i.label.toLowerCase() === f.label.toLowerCase() && i.label !== "No mood";
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <MoodPill mood={initial} />
      <span className={same ? "opacity-40" : "opacity-70"}>→</span>
      <MoodPill mood={final} />
    </div>
  );
}

type Tab = "conversations" | "avatars" | "saved" | "settings";

interface ReadyPlayerMeAvatar {
  id: string;
  name: string;
  url: string;
  type: "user" | "companion";
  thumbnail?: string;
  isCustom?: boolean;
}

function toThumbnail(url?: string | null): string | null {
  if (!url) return null;
  if (url.endsWith(".png")) return url;
  if (url.endsWith(".glb")) return url.replace(".glb", ".png");
  try {
    const last = url.split("/").pop() || "";
    const id = last.replace(".glb", "");
    if (id && id.length > 10) return `https://api.readyplayer.me/v1/avatars/${id}.png`;
  } catch {}
  return null;
}

function idFromUrl(url: string): string {
  const last = url.split("/").pop() || "";
  return last.replace(".glb", "") || `custom-${Date.now()}`;
}

/* --------------------------------- Types --------------------------------- */

type Profile = {
  id: string;
  username: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
  session_mode?: string | null;
  rpm_user_url?: string | null;
};

type SavedConvo = {
  id: string;
  title: string | null;
  updated_at: string;
  initial_mood: unknown;
  final_mood: unknown;
};

/* ------------------------------ Component ------------------------------- */

export default function ProfileClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  /* Modals */
  const [showDeleteHistory, setShowDeleteHistory] = useState(false);
  const [pendingDeleteConvo, setPendingDeleteConvo] = useState<string | null>(null);
  const [pendingDeleteTitle, setPendingDeleteTitle] = useState<string | null>(null);

  /* Profile */
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  /* UI state */
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [defaultModel, setDefaultModel] = useState("gpt-4o-mini");

  /* Tabs */
  const initialTab = (() => {
    const t = searchParams.get("tab");
    return (t === "conversations" || t === "avatars" || t === "saved" || t === "settings") ? (t as Tab) : "conversations";
  })();
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);

  /* Saved tab data */
  const [savedConvos, setSavedConvos] = useState<SavedConvo[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(false);

  /* Header metrics */
  const [counts, setCounts] = useState({ total: 0, ongoing: 0, ended: 0 });
  const [lastActiveAt, setLastActiveAt] = useState<string | null>(null);

  /* ---------------------------- Helpers/Derived --------------------------- */

  const displayName = useMemo(() => profile?.username ?? "Anonymous", [profile]);
  const headerThumb = toThumbnail(profile?.rpm_user_url);

  // Keep tab in sync with query param changes
  useEffect(() => {
    const t = searchParams.get("tab");
    if (t && t !== activeTab && (t === "conversations" || t === "avatars" || t === "saved" || t === "settings")) {
      setActiveTab(t as Tab);
    }
  }, [searchParams, activeTab]);

  /* ------------------------------ Auth/Profile ---------------------------- */

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
          setProfile({ id: u.id, username: u.email ?? "Anonymous", rpm_user_url: null });
        } else {
          setProfile(
            data ?? { id: u.id, username: u.email ?? "Anonymous", rpm_user_url: null }
          );
        }
      } catch (e) {
        console.error("profile load exception:", e);
        if (!cancelled) setProfile(null);
      } finally {
        if (!cancelled) setLoadingProfile(false);
      }
    }

    load();

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

  /* ---------------------------- Header metrics ---------------------------- */

  // Helper so we can refresh counts after deletes too
  const refreshHeader = async (userId: string) => {
    const [totalRes, ongoingRes, endedRes, lastRes] = await Promise.all([
      supabase
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .eq("created_by", userId)
        .neq("status", "deleted"),
      supabase
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .eq("created_by", userId)
        .eq("status", "ongoing"),
      supabase
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .eq("created_by", userId)
        .eq("status", "ended"),
      supabase
        .from("conversations")
        .select("updated_at")
        .eq("created_by", userId)
        .neq("status", "deleted")
        .order("updated_at", { ascending: false })
        .limit(1),
    ]);

    setCounts({
      total: totalRes.count ?? 0,
      ongoing: ongoingRes.count ?? 0,
      ended: endedRes.count ?? 0,
    });

    const ts = (Array.isArray(lastRes.data) && (lastRes.data as any[])[0]?.updated_at) || null;
    setLastActiveAt(ts ?? null);
  };

  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;

    (async () => {
      try {
        await refreshHeader(profile.id);
      } catch (e) {
        if (!cancelled) {
          setCounts({ total: 0, ongoing: 0, ended: 0 });
          setLastActiveAt(null);
          console.error("Failed to load header metrics:", e);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [profile?.id]);

  /* ------------------------------ Saved (ended) --------------------------- */

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
          .eq("status", "ended") // ← only saved/ended
          .order("updated_at", { ascending: false });

        if (error) throw error;
        if (!cancelled) setSavedConvos((data ?? []) as SavedConvo[]);
      } catch (e) {
        console.error("load saved convos failed:", e);
        if (!cancelled) setSavedConvos([]);
      } finally {
        if (!cancelled) setLoadingSaved(false);
      }
    })();

    return () => { cancelled = true; };
  }, [profile?.id, activeTab]);

  /* ------------------------------- Handlers ------------------------------- */

  const handleBackToHome = () => router.push("/");
  const handleNavigateToChat = () => router.push("/chat/simple?new=1");

  const handleNavigation = (href: string) => router.push(href as any);

  const handleDeleteAccount = async () => {
    const confirmed = window.confirm("Are you absolutely sure?\n\nThis will permanently delete your account and data.");
    if (confirmed) alert("Account deletion flow (server route + service role).");
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
    } catch {
      router.push(`/chat/simple?convo=${id}`);
    }
  };

  const handleReadyPlayerMeAvatarSelect = (avatar: ReadyPlayerMeAvatar, type: "user" | "companion") => {
    if (type === "user") {
      setProfile((prev) =>
        prev ? { ...prev, rpm_user_url: avatar.url } : prev
      );
    }
  };

  const handleDeleteSaved = async (convoId: string) => {
    try {
      // Optimistic remove from list
      setSavedConvos((prev) => prev.filter((c) => c.id !== convoId));

      const { error } = await supabase
        .from("conversations")
        .update({ status: "deleted", deleted_at: new Date().toISOString() })
        .eq("id", convoId);

      if (error) throw error;

      if (profile?.id) await refreshHeader(profile.id); // refresh counts
    } catch (e) {
      console.error("Delete (soft) error:", e);
    }
  };

  const handleDeleteHistory = async (skipConfirm = false) => {
    if (!skipConfirm) {
      const confirmed = window.confirm("Are you absolutely sure?\n\nThis will mark ALL your conversations as Deleted.");
      if (!confirmed) return;
    }
    try {
      if (!profile?.id) return;
      const { error } = await supabase
        .from("conversations")
        .update({ status: "deleted", deleted_at: new Date().toISOString() })
        .eq("created_by", profile.id)
        .neq("status", "deleted");
      if (error) throw error;

      setSavedConvos([]);
      setShowDeleteHistory(false);
      await refreshHeader(profile.id);
    } catch (e) {
      console.error("Delete history (soft) error:", e);
    }
  };

  /* --------------------------------- Render -------------------------------- */

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
                Last active: {lastActiveAt ? new Date(lastActiveAt).toLocaleDateString() : "—"}
              </p>
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                <span>{counts.ongoing} active conversations</span>
                <span>•</span>
                <span>{counts.ended} saved chats</span>
                {/* If you want total too: 
                  <>
                    <span>•</span>
                    <span>{counts.total} total</span>
                  </>
                */}
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
                const sp = new URLSearchParams(Array.from(searchParams.entries()));
                sp.set("tab", next);
                router.replace(`?${sp.toString()}`);
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
                <ConversationList onSelect={handleOpenConversation} showSearch mineOnly />
                <div className="mt-4">
                  <Button onClick={handleNavigateToChat} className="trauma-safe gentle-focus">
                    Start New Conversation
                  </Button>
                </div>
              </TabsContent>

              {/* 3D Avatars Tab */}
              <TabsContent value="avatars" className="mt-6">
                <ReadyPlayerMeSelector
                  onAvatarSelect={handleReadyPlayerMeAvatarSelect}
                  currentUserAvatar={
                    profile?.rpm_user_url
                      ? {
                          id: idFromUrl(profile.rpm_user_url),
                          name: "Custom Avatar",
                          url: profile.rpm_user_url,
                          type: "user",
                          thumbnail: toThumbnail(profile.rpm_user_url) ?? undefined,
                          isCustom: true,
                        }
                      : undefined
                  }
                  currentCompanionAvatar={undefined}
                />
              </TabsContent>

              {/* Saved Tab (ended only) */}
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
                                onClick={() => {
                                  setPendingDeleteConvo(c.id);
                                  setPendingDeleteTitle(c.title || "Untitled Chat");
                                }}
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
                      <Button
                        onClick={() => setShowDeleteHistory(true)}
                        className="w-full sm:w-auto trauma-safe gentle-focus"
                        variant="destructive"
                      >
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
            if (pendingDeleteConvo) await handleDeleteSaved(pendingDeleteConvo);
            setPendingDeleteConvo(null);
            setPendingDeleteTitle(null);
          }}
          title={pendingDeleteTitle}
        />
      )}
    </div>
  );
}
