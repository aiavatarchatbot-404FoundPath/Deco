"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { ChatInterfaceScreen } from "../../../components/ChatInterfaceScreen";
import MoodCheckIn from "../../../components/MoodCheckIn";
import AnonymousExitWarning from "../../../components/chat/AnonymousExitWarning";
import { useValidatedRpmGlb } from "@/lib/rpm";

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
  status?: "sending" | "sent" | "failed";
};

type Profile = {
  id: string;
  username: string | null;
  rpm_user_url: string | null;
  rpm_companion_url: string | null;
};

type MoodData = {
  feeling: string;
  intensity: number;
  reason?: string;
  support?: string;
};

type MoodState =
  | (MoodData & { timestamp: Date })
  | { skipped: true; timestamp: Date }
  | null;

const MOOD_SESSION_KEY = "moodCheckedIn:v1";
const LS_AVATAR_KEY = "avatar:conversation_id";

// Hardcoded companion choices (Adam/Eve)
const COMPANIONS = {
  ADAM: { name: "Adam", url: "https://models.readyplayer.me/68be69db5dc0cec769cfae75.glb" },
  EVE:  { name: "Eve",  url: "https://models.readyplayer.me/68be6a2ac036016545747aa9.glb" },
} as const;

/* ---------- Deterministic ordering helpers ---------- */
function sortMsgs(a: MessageRow, b: MessageRow) {
  const ta = new Date(a.created_at).getTime();
  const tb = new Date(b.created_at).getTime();
  if (ta !== tb) return ta - tb;
  const rank = (r: MessageRow["role"]) => (r === "user" ? 0 : r === "assistant" ? 1 : 2);
  const rdiff = rank(a.role) - rank(b.role);
  if (rdiff !== 0) return rdiff;
  const sa = a.status === "sending" ? 0 : 1;
  const sb = b.status === "sending" ? 0 : 1;
  if (sa !== sb) return sa - sb;
  return (a.id || "").localeCompare(b.id || "");
}
function upsertAndSort(prev: MessageRow[], next: MessageRow) {
  const exists = prev.some((m) => m.id === next.id);
  const arr = exists ? prev.map((m) => (m.id === next.id ? next : m)) : [...prev, next];
  return arr.slice().sort(sortMsgs);
}

export default function ClientAvatarChat() {
  const router = useRouter();
  const params = useSearchParams();

  const [conversationId, setConversationId] = useState<string>("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [mood, setMood] = useState<MoodState>(null);
  const [showExitMoodCheckIn, setShowExitMoodCheckIn] = useState(false);
  const [showEntryMoodCheckIn, setShowEntryMoodCheckIn] = useState(false);
  const [showAnonymousExitWarning, setShowAnonymousExitWarning] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const [messageCount, setMessageCount] = useState(0);
  const [convStartedAt, setConvStartedAt] = useState<Date | null>(null);
  const [convEndedAt, setConvEndedAt] = useState<Date | null>(null);
  const [accumulatedSeconds, setAccumulatedSeconds] = useState(0);
  const [activeSince, setActiveSince] = useState<Date | null>(null);

  const [tempUserUrl, setTempUserUrl] = useState<string | null>(null);

  // other URL params (non-id)
  const sessionIdFromParams = params.get("sid");
  const companionUrlFromParams = params.get("companionUrl");
  const companionNameFromParams = params.get("companionName");
  const userUrlFromParams = params.get("userUrl");

  // clear global loaders shortly after mount
  useEffect(() => {
    const t = setTimeout(() => {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("resetGlobalLoading"));
      }
    }, 100);
    return () => clearTimeout(t);
  }, []);

  // conversation id: ?convo=<id> to continue, ?new=1 to start fresh, else reuse sticky
  useEffect(() => {
    if (typeof window === "undefined") return;
    const search = new URLSearchParams(window.location.search);
    const cidParam = search.get("convo");
    const startFresh = search.get("new") === "1";

    if (cidParam) {
      localStorage.setItem(LS_AVATAR_KEY, cidParam);
      setConversationId(cidParam);
      return;
    }
    if (startFresh) {
      localStorage.removeItem(LS_AVATAR_KEY);
      const cid = crypto.randomUUID();
      localStorage.setItem(LS_AVATAR_KEY, cid);
      setConversationId(cid);
      return;
    }
    let cid = localStorage.getItem(LS_AVATAR_KEY);
    if (!cid) {
      cid = crypto.randomUUID();
      localStorage.setItem(LS_AVATAR_KEY, cid);
    }
    setConversationId(cid);
  }, []);

  /* ensure conversation exists (works for anon) */
  useEffect(() => {
    (async () => {
      if (!conversationId) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) return;
      try {
        await fetch("/api/conversations/ensure-ownership", {
          method: "POST",
          headers: { "content-type": "application/json", "x-user-id": user.id },
          body: JSON.stringify({ conversationId }),
        });
      } catch {}
    })();
  }, [conversationId]);

  // Backfill chat_mode once
  useEffect(() => {
    if (!conversationId) return;
    (async () => {
      try {
        await supabase
          .from("conversations")
          .update({ chat_mode: "avatar" })
          .eq("id", conversationId)
          .is("chat_mode", null);
      } catch {}
    })();
  }, [conversationId]);

  /* ---------- Navigation / Exit ---------- */
  const handleNavigation = (screen: string) => {
    if (screen === "home" || screen === "endchat") {
      if (!isAuthenticated) {
        setShowAnonymousExitWarning(true);
        return;
      }
      setShowExitMoodCheckIn(true);
      return;
    }
    switch (screen) {
      case "summary":  router.push("/chat/summary"); break;
      case "/":        router.push("/"); break;
      case "profile":  router.push(`/profile?convo=${conversationId ?? ""}`); break;
      case "settings": router.push(`/settings?convo=${conversationId ?? ""}`); break;
      default:         console.log(`Navigate to: ${screen}`);
    }
  };

  const pauseTimer = async () => {
    if (!conversationId) return;
    if (!activeSince) return;
    const deltaSec = Math.max(0, Math.floor((Date.now() - activeSince.getTime()) / 1000));
    const nextAccum = accumulatedSeconds + deltaSec;
    const { error } = await supabase
      .from("conversations")
      .update({ accumulated_seconds: nextAccum, active_since: null })
      .eq("id", conversationId);
    if (!error) { setAccumulatedSeconds(nextAccum); setActiveSince(null); }
  };
  const resumeTimer = async () => {
    if (!conversationId) return;
    if (activeSince) return;
    const nowIso = new Date().toISOString();
    const { error } = await supabase
      .from("conversations")
      .update({ active_since: nowIso })
      .eq("id", conversationId);
    if (!error) setActiveSince(new Date(nowIso));
  };

  const completeExit = async (finalMood?: MoodData) => {
    try {
      await pauseTimer();
      if (conversationId) {
        const patch: any = {
          status: "ended",
          ended_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        if (finalMood) patch.final_mood = finalMood;
        await supabase.from("conversations").update(patch).eq("id", conversationId);
      }
    } catch (e) {
      console.error("Exit error:", e);
    } finally {
      sessionStorage.removeItem(MOOD_SESSION_KEY);
      try { localStorage.removeItem(LS_AVATAR_KEY); } catch {}
      router.push("/");
    }
  };
  const handleExitMoodComplete = (moodData: MoodData) => { setShowExitMoodCheckIn(false); completeExit(moodData); };
  const handleExitSkip         = () => { setShowExitMoodCheckIn(false); completeExit(); };

  const handleAnonymousExitContinue = () => { setShowAnonymousExitWarning(false); setShowExitMoodCheckIn(true); };
  const handleAnonymousExitClose    = () => setShowAnonymousExitWarning(false);
  const handleAnonymousCreateAccount = () => {
    setShowAnonymousExitWarning(false);
    const current = typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : "/chat/avatar";
    router.push(`/login?redirect=${encodeURIComponent(current)}`);
  };

  const persistMoodState = (state: MoodState) => {
    if (typeof window === "undefined") return;
    if (!state) { sessionStorage.removeItem(MOOD_SESSION_KEY); return; }
    const payload = { ...state, timestamp: state.timestamp instanceof Date ? state.timestamp.toISOString() : state.timestamp };
    sessionStorage.setItem(MOOD_SESSION_KEY, JSON.stringify(payload));
  };
  const handleEntryMoodComplete = (moodData: MoodData) => { const record: MoodState = { ...moodData, timestamp: new Date() }; setMood(record); persistMoodState(record); setShowEntryMoodCheckIn(false); };
  const handleEntryMoodSkip     = () => { const skipped: MoodState = { skipped: true, timestamp: new Date() }; setMood(skipped); persistMoodState(skipped); setShowEntryMoodCheckIn(false); };

  // Fetch conversation timestamps
  useEffect(() => {
    if (!conversationId) return;
    (async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select("created_at, ended_at, accumulated_seconds, active_since")
        .eq("id", conversationId)
        .single();
      if (!error && data) {
        setConvStartedAt(new Date(data.created_at));
        setConvEndedAt(data.ended_at ? new Date(data.ended_at) : null);
        setAccumulatedSeconds(data.accumulated_seconds ?? 0);
        setActiveSince(data.active_since ? new Date(data.active_since) : null);
      }
    })();
  }, [conversationId]);

  // Live session timer
  useEffect(() => {
    if (!convStartedAt) return;
    const tick = () => {
      const live = activeSince ? Math.max(0, Math.floor((Date.now() - activeSince.getTime()) / 1000)) : 0;
      setSessionSeconds(accumulatedSeconds + live);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [convStartedAt, activeSince, accumulatedSeconds]);

  useEffect(() => {
    if (!conversationId) return;
    resumeTimer();
    const onVis = () => { if (document.hidden) pauseTimer(); else resumeTimer(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { document.removeEventListener("visibilitychange", onVis); pauseTimer(); };
  }, [conversationId, activeSince, accumulatedSeconds]);

  // message count (only user messages)
  useEffect(() => {
    setMessageCount(messages.filter((m) => m.role === "user").length);
  }, [messages]);

  /* ---------- Profile ---------- */
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setIsAuthenticated(!!user);
      if (!user) { setProfile(null); return; }
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, rpm_user_url, rpm_companion_url")
        .eq("id", user.id)
        .single();
      if (error) { console.error("Error fetching profile", error); return; }
      if (data) setProfile(data);
    })();
  }, []);

  /* ---------- Mood (entry from session storage) ---------- */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = sessionStorage.getItem(MOOD_SESSION_KEY);
    if (!stored) { setShowEntryMoodCheckIn(true); return; }
    try {
      const parsed = JSON.parse(stored);
      if (parsed?.timestamp) parsed.timestamp = new Date(parsed.timestamp);
      setMood(parsed as MoodState);
      setShowEntryMoodCheckIn(false);
    } catch {
      sessionStorage.removeItem(MOOD_SESSION_KEY);
      setShowEntryMoodCheckIn(true);
    }
  }, []);

  /* ---------- Messages (initial load + realtime) ---------- */
  useEffect(() => {
    if (!conversationId) return;
    let mounted = true;

    (async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, conversation_id, sender_id, role, content, created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .limit(200);
      if (!mounted) return;
      if (error) { console.error("Initial messages fetch failed:", error); return; }
      setMessages((data ?? []).slice().sort(sortMsgs));
    })();

    const ch = supabase
      .channel(`msgs:${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => setMessages((prev) => upsertAndSort(prev, payload.new as MessageRow))
      )
      .subscribe();

    return () => { mounted = false; supabase.removeChannel(ch); };
  }, [conversationId]);

  /* ---------- Send flow (optimistic + replace + sort) ---------- */
  const handleSend = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || !conversationId) return;
    if (trimmed.toLowerCase() === "exit chat") { setShowExitMoodCheckIn(true); return; }

    const { data: { user } } = await supabase.auth.getUser();
    const uid = user?.id || null;

    const tempId = `temp-${Date.now()}`;
    const optimisticUserMessage: MessageRow = {
      id: tempId,
      conversation_id: conversationId,
      sender_id: uid || "me",
      role: "user",
      content: trimmed,
      created_at: new Date().toISOString(),
      status: "sending",
    };
    setMessages((prev) => upsertAndSort(prev, optimisticUserMessage));
    setIsTyping(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json", ...(uid ? { "x-user-id": uid } : {}) },
        body: JSON.stringify({ conversationId, userMessage: trimmed ,  chatMode: "avatar"}),
      });

      // mark convo ongoing + ensure mode
      try {
        await supabase
          .from("conversations")
          .update({ status: "ongoing", updated_at: new Date().toISOString(), chat_mode: "avatar" })
          .eq("id", conversationId);
      } catch (e) { console.warn("update convo meta (avatar) failed:", e); }

      const raw = await res.text();
      if (!res.ok) throw new Error(raw || "chat error");
      const data = JSON.parse(raw) as { answer: string; rows: { user?: MessageRow; assistant?: MessageRow } };

      setIsTyping(false);
      setMessages((prev) => {
        let out = prev.filter((m) => m.id !== tempId);
        const savedUser = data.rows.user;
        if (savedUser && !out.some((m) => m.id === savedUser.id)) out = upsertAndSort(out, { ...savedUser, status: "sent" });
        const savedBot = data.rows.assistant;
        if (savedBot && !out.some((m) => m.id === savedBot.id)) out = upsertAndSort(out, { ...savedBot, status: "sent" });
        return out;
      });
    } catch (e) {
      console.error("send failed:", e);
      setIsTyping(false);
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, status: "failed" } : m)));
    }
  };

  /* ---------- Avatars (normalize & validate .glb) ---------- */
  type AvatarShape = { name: string; type: "custom" | "default"; url: string | null };

  const rawUser = userUrlFromParams || profile?.rpm_user_url || tempUserUrl;
  const userGlb = useValidatedRpmGlb(rawUser);
  const key = (companionNameFromParams || "ADAM").toUpperCase() as "ADAM" | "EVE";
  const fallbackComp = COMPANIONS[key] ?? COMPANIONS.ADAM;
  const rawComp = companionUrlFromParams || profile?.rpm_companion_url || fallbackComp.url;
  const compGlb = useValidatedRpmGlb(rawComp);

  const userAvatar: AvatarShape = {
    name: profile?.username || "You",
    type: rawUser ? "custom" : "default",
    url: userGlb,
  };
  const companionAvatar: AvatarShape = {
    name: companionNameFromParams
      ? companionNameFromParams
      : (() => {
          if (profile?.rpm_companion_url === COMPANIONS.ADAM.url) return "Adam";
          if (profile?.rpm_companion_url === COMPANIONS.EVE.url) return "Eve";
          return fallbackComp.name;
        })(),
    type: (companionUrlFromParams || profile?.rpm_companion_url) ? "custom" : "default",
    url: compGlb,
  };

  /* ---------- Render ---------- */
  const chatInterfaceMood = useMemo(() => (mood && "feeling" in mood ? mood : null), [mood]);
  const sortedMessages = useMemo(() => messages.slice().sort(sortMsgs), [messages]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-100 via-pink-50 to-blue-100">
      {showAnonymousExitWarning && (
        <AnonymousExitWarning
          onContinue={handleAnonymousExitContinue}
          onCreateAccount={handleAnonymousCreateAccount}
          onClose={handleAnonymousExitClose}
        />
      )}

      {showEntryMoodCheckIn && (
        <MoodCheckIn onComplete={handleEntryMoodComplete} onSkip={handleEntryMoodSkip} />
      )}

      {showExitMoodCheckIn && (
        <MoodCheckIn
          title="How are you feeling now? ✨"
          previousMood={mood && "feeling" in mood ? { feeling: mood.feeling, intensity: mood.intensity } : null}
          confirmLabel="Save & End Chat"
          onComplete={handleExitMoodComplete}
          onSkip={handleExitSkip}
        />
      )}

      <ChatInterfaceScreen
        onNavigate={handleNavigation}
        chatMode="avatar"
        user={profile ? { id: profile.id, username: profile.username || "User", avatar: userAvatar }
                      : { id: "anon", username: "You", avatar: userAvatar }}
        companionAvatar={companionAvatar}
        currentMood={chatInterfaceMood}
        onSend={handleSend}
        messages={sortedMessages}
        isTyping={isTyping}
        stats={{ sessionSeconds, messageCount }}
      />
    </div>
  );
}
