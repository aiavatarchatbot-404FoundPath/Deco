"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { ChatInterfaceScreen } from "../../../components/ChatInterfaceScreen";
import type { DbMessage } from "../../../components/ChatInterfaceScreen";
import MoodCheckIn from "../../../components/MoodCheckIn";
import AnonymousExitWarning from "../../../components/chat/AnonymousExitWarning";
import type { User as SupaUser } from "@supabase/supabase-js";
import type { Route } from "next";

type MsgStatus = "sending" | "sent" | "failed";

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
  status?: MsgStatus;
};

type MoodData = { feeling: string; intensity: number; reason?: string; support?: string };
type MoodState = (MoodData & { timestamp: Date }) | null;

const LS_CONVO_KEY = "simple:conversation_id";

/* ---------- helpers ---------- */
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

function upsertById(prev: MessageRow[], next: MessageRow) {
  const idx = prev.findIndex((m) => m.id === next.id);
  if (idx !== -1) {
    const copy = prev.slice();
    copy[idx] = next;
    return copy.sort(sortMsgs);
  }
  return [...prev, next].sort(sortMsgs);
}

export default function ClientSimpleChat() {
  const router = useRouter();

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [conversationId, setConversationId] = useState<string>("");

  const [entryMood, setEntryMood] = useState<MoodState>(null);
  const [showEntryMoodCheck, setShowEntryMoodCheck] = useState(true);
  const [showExitMoodCheck, setShowExitMoodCheck] = useState(false);
  const [showAnonymousWarning, setShowAnonymousWarning] = useState(false);
  const [pendingNavigate, setPendingNavigate] = useState<string | null>(null);

  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const cleanupFns = React.useRef<Array<() => void>>();

  // timing (DB-backed when logged in)
  const [accumulatedSeconds, setAccumulatedSeconds] = useState(0);
  const [activeSince, setActiveSince] = useState<Date | null>(null);
  const [sessionSeconds, setSessionSeconds] = useState(0);

  // timing (LOCAL when anonymous)
  const [localActiveSince, setLocalActiveSince] = useState<Date | null>(null);
  const [localAccumulated, setLocalAccumulated] = useState(0);

  // auth (live)
  const [authUser, setAuthUser] = useState<SupaUser | null>(null);
  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setAuthUser(data.user ?? null);
      setIsAuthenticated(!!data.user);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!mounted) return;
      setAuthUser(session?.user ?? null);
      setIsAuthenticated(!!session?.user);
    });
    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  /* conversation id: support ?convo=<id> to continue, ?new=1 to start fresh */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const cidParam = params.get("convo");
    const startFresh = params.get("new") === "1";
    if (cidParam) {
      localStorage.setItem(LS_CONVO_KEY, cidParam);
      setConversationId(cidParam);
      return;
    }
    if (startFresh) {
      localStorage.removeItem(LS_CONVO_KEY);
      const cid = crypto.randomUUID();
      localStorage.setItem(LS_CONVO_KEY, cid);
      setConversationId(cid);
      return;
    }
    let cid = localStorage.getItem(LS_CONVO_KEY);
    if (!cid) {
      cid = crypto.randomUUID();
      localStorage.setItem(LS_CONVO_KEY, cid);
    }
    setConversationId(cid);
  }, []);

  /* ensure conversation exists (messages still need a convo), but do NOT write timing for anon */
  useEffect(() => {
    if (!conversationId) return;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        await fetch("/api/conversations/ensure-ownership", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(user?.id ? { "x-user-id": user.id } : {}),
          },
          body: JSON.stringify({ conversationId }),
        });
      } catch (e) {
        console.warn("ensure-ownership failed (non-fatal):", e);
      }
    })();
  }, [conversationId]);

  /* mark simple mode once */
  useEffect(() => {
    if (!conversationId) return;
    (async () => {
      try {
        await supabase
          .from("conversations")
          .update({ chat_mode: "simple" })
          .eq("id", conversationId)
          .is("chat_mode", null);
      } catch {}
    })();
  }, [conversationId]);

  /* initial messages + realtime */
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
      setMessages(((data ?? []) as MessageRow[]).slice().sort(sortMsgs));
    })();

    const ch = supabase
      .channel(`msgs:${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => setMessages((prev) => upsertById(prev, payload.new as MessageRow))
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(ch);
    };
  }, [conversationId]);

  /* load timing snapshot (DB) — skip when anonymous */
  useEffect(() => {
    if (!conversationId || !isAuthenticated) return;
    (async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select("accumulated_seconds, active_since")
        .eq("id", conversationId)
        .single();
      if (!error && data) {
        setAccumulatedSeconds(data.accumulated_seconds ?? 0);
        if (data.active_since) setActiveSince(new Date(data.active_since));
      }
    })();
  }, [conversationId, isAuthenticated]);

  /* live ticking: choose DB-backed when logged in, local when anonymous */
  useEffect(() => {
    const tick = () => {
      if (isAuthenticated) {
        const live = activeSince
          ? Math.max(0, Math.floor((Date.now() - activeSince.getTime()) / 1000))
          : 0;
        setSessionSeconds(accumulatedSeconds + live);
      } else {
        const live = localActiveSince
          ? Math.max(0, Math.floor((Date.now() - localActiveSince.getTime()) / 1000))
          : 0;
        setSessionSeconds(localAccumulated + live);
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [
    isAuthenticated,
    // DB source
    accumulatedSeconds, activeSince,
    // local source
    localAccumulated, localActiveSince,
  ]);

  /* resume/pause: branch by auth so anon never writes timing to DB */
  async function resumeTimer() {
    if (!conversationId) return;

    if (!isAuthenticated) {
      if (!localActiveSince) setLocalActiveSince(new Date());
      return;
    }

    if (activeSince) return;
    const nowIso = new Date().toISOString();
    const { error } = await supabase
      .from("conversations")
      .update({ active_since: nowIso })
      .eq("id", conversationId);
    if (!error) setActiveSince(new Date(nowIso));
  }

  async function pauseTimer() {
    if (!conversationId) return;

    if (!isAuthenticated) {
      if (!localActiveSince) return;
      const deltaSec = Math.max(0, Math.floor((Date.now() - localActiveSince.getTime()) / 1000));
      setLocalAccumulated((prev) => prev + deltaSec);
      setLocalActiveSince(null);
      return;
    }

    if (!activeSince) return;
    const deltaSec = Math.max(0, Math.floor((Date.now() - activeSince.getTime()) / 1000));
    const nextAccum = accumulatedSeconds + deltaSec;

    const { error } = await supabase
      .from("conversations")
      .update({ accumulated_seconds: nextAccum, active_since: null })
      .eq("id", conversationId);

    if (!error) {
      setAccumulatedSeconds(nextAccum);
      setActiveSince(null);
    }
  }

  /* mount/visibility handling: same API for both modes */
  useEffect(() => {
    if (!conversationId) return;
    resumeTimer();
    const onVis = () => { if (document.hidden) pauseTimer(); else resumeTimer(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      pauseTimer();
    };
  }, [
    conversationId,
    isAuthenticated,
    // include these so the closure sees latest
    activeSince, accumulatedSeconds,
    localActiveSince, localAccumulated,
  ]);

  /* navigation: only End/Home shows MoodCheckIn; others just pause→push */
  const handleNavigation = async (screen: string) => {
    if (screen === "home" || screen === "endchat") {
      setPendingNavigate("/");
      if (!isAuthenticated) { setShowAnonymousWarning(true); return; }
      setShowExitMoodCheck(true);
      return;
    }

    // bank time but do NOT end
    await pauseTimer();

    switch (screen) {
      case "end-and-summary": {
        // End conversation immediately and go to summary (skip mood check)
        const cid = conversationId;
        await endConversation();
        if (cid) router.push(`/chat/summary?convo=${cid}` as Route);
        else router.push("/chat/summary" as Route);
        break;
      }
      case "summary": router.push("/chat/summary"); break;
      case "/": router.push("/"); break;
      case "profile": router.push("/profile"); break;
      case "settings": router.push("/settings"); break;
      default: console.log(`Navigate to: ${screen}`);
    }
  };

  /* mood handlers (entry) */
  const handleMoodComplete = async (moodData: MoodData) => {
    setEntryMood({ ...moodData, timestamp: new Date() });
    setShowEntryMoodCheck(false);
    // Persist initial mood only if logged in
    try {
      if (isAuthenticated && conversationId) {
        await supabase
          .from("conversations")
          .update({ initial_mood: moodData })
          .eq("id", conversationId);
      }
    } catch (e) {
      console.warn("initial_mood update failed (non-fatal):", e);
    }
  };
  const handleSkip = () => { setEntryMood(null); setShowEntryMoodCheck(false); };

  /* end chat (only when MoodCheckIn confirm/skip) */
  const endConversation = async () => {
    if (!conversationId) return;
    try {
      await pauseTimer(); // finalize time (local/DB as appropriate)
      if (isAuthenticated) {
        await supabase
          .from("conversations")
          .update({
            status: "ended",
            ended_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", conversationId);
      }
    } catch (e) {
      console.warn("end convo update failed:", e);
    }
    if (typeof window !== "undefined") localStorage.removeItem(LS_CONVO_KEY);
  };

  const handleExitMoodComplete = async (moodData: MoodData) => {
    setShowExitMoodCheck(false);
    // Save final mood only if logged in
    try {
      if (isAuthenticated && conversationId) {
        await supabase
          .from("conversations")
          .update({
            final_mood: moodData,
            status: "ended",
            ended_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", conversationId);
      }
    } catch (e) {
      console.warn("final_mood update failed (non-fatal):", e);
    }
    await endConversation();
    router.push((pendingNavigate ?? "/") as Route);
    setPendingNavigate(null);
  };

  const handleExitSkip = async () => {
    setShowExitMoodCheck(false);
    await endConversation();
    router.push((pendingNavigate ?? "/") as Route);
    setPendingNavigate(null);
  };

  const handleAnonymousContinue = () => { setShowAnonymousWarning(false); setShowExitMoodCheck(true); };
  const handleAnonymousClose = () => setShowAnonymousWarning(false);
  const handleAnonymousCreateAccount = () => {
    setShowAnonymousWarning(false);
    const current = typeof window !== "undefined"
      ? `${window.location.pathname}${window.location.search}`
      : "/chat/simple";
    router.push((`/login?redirect=${encodeURIComponent(current)}`) as Route);
  };

  /* send flow */
  const handleSend = async (text: string) => {
    const t = text.trim();
    if (!t || !conversationId) return;

    const { data: { user } } = await supabase.auth.getUser();
    const uid = user?.id || null;

    const tempId = `temp-${Date.now()}`;
    const nowIso = new Date().toISOString();
    const optimisticUser: MessageRow = {
      id: tempId,
      conversation_id: conversationId,
      sender_id: uid,
      role: "user",
      content: t,
      created_at: nowIso,
      status: "sending",
    };
    setMessages((prev) => upsertById(prev, optimisticUser));
    setIsTyping(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(uid ? { "x-user-id": uid } : {}),
        },
        body: JSON.stringify({ conversationId, userMessage: t }),
      });

      const raw = await res.text();
      if (!res.ok) throw new Error(raw || "chat error");

      const data = JSON.parse(raw) as {
        answer: string;
        rows?: { user?: MessageRow; assistant?: MessageRow };
      };

      setIsTyping(false);

      setMessages((prev) => {
        let out = prev.filter((m) => m.id !== tempId);

        const savedUser = data.rows?.user;
        const savedAssistant = data.rows?.assistant;

        if (savedUser) out = upsertById(out, { ...savedUser, status: "sent" });
        else out = upsertById(out, { ...optimisticUser, status: "sent" });

        if (savedAssistant) {
          out = upsertById(out, { ...savedAssistant, status: "sent" });
        } else {
          const localAssistant: MessageRow = {
            id: `local-assistant-${Date.now()}`,
            conversation_id: conversationId,
            sender_id: "bot",
            role: "assistant",
            content: data.answer || "Sorry, I couldn't generate an answer right now.",
            created_at: new Date().toISOString(),
            status: "sent",
          };
          out = upsertById(out, localAssistant);
        }

        return out;
      });
    } catch (e) {
      console.error("send failed:", e);
      setIsTyping(false);
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, status: "failed" } : m)));
    }
  };

  /* derive props */
  const sortedMessages = useMemo(() => messages.slice().sort(sortMsgs), [messages]);
  const uiMessages: DbMessage[] = useMemo(
    () =>
      sortedMessages.map((m) => ({
        id: m.id,
        conversation_id: m.conversation_id,
        sender_id: m.sender_id ?? (m.role === "assistant" ? "bot" : "anon"),
        role: m.role,
        content: m.content,
        created_at: m.created_at,
      })),
    [sortedMessages]
  );
  const onlyUserCount = useMemo(
    () => uiMessages.filter((m) => m.role === "user").length,
    [uiMessages]
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-100 via-pink-50 to-blue-100">
      {showAnonymousWarning && (
        <AnonymousExitWarning
          onContinue={handleAnonymousContinue}
          onCreateAccount={handleAnonymousCreateAccount}
          onClose={handleAnonymousClose}
        />
      )}

      {showEntryMoodCheck && <MoodCheckIn onComplete={handleMoodComplete} onSkip={handleSkip} />}
      {showExitMoodCheck && (
        <MoodCheckIn
          title="How are you feeling now? ✨"
          previousMood={entryMood ? { feeling: entryMood.feeling, intensity: entryMood.intensity } : null}
          confirmLabel="Save & End Chat"
          onComplete={handleExitMoodComplete}
          onSkip={handleExitSkip}
        />
      )}

      <ChatInterfaceScreen
        onNavigate={handleNavigation}
        chatMode="standard"
        companionAvatar={{ name: "Adam", type: "default", url: undefined }}
        currentMood={entryMood}
        user={
          authUser
            ? {
                id: authUser.id,
                username:
                  (authUser.user_metadata?.username as string) ||
                  (authUser.email ? authUser.email.split("@")[0] : "You"),
              }
            : undefined
        }
        onSend={handleSend}
        messages={uiMessages}
        isTyping={isTyping}
        stats={{ sessionSeconds, messageCount: onlyUserCount }}
      />
    </div>
  );
}
