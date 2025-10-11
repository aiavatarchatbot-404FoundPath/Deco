"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { ChatInterfaceScreen } from "../../../components/ChatInterfaceScreen";
import type { DbMessage } from "../../../components/ChatInterfaceScreen";
import MoodCheckIn from "../../../components/MoodCheckIn";
import AnonymousExitWarning from "../../../components/chat/AnonymousExitWarning";
import type { User as SupaUser } from "@supabase/supabase-js";

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

  /* auth */
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setIsAuthenticated(!!user);
    })();
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

  // state (near your other useState calls)
const [authUser, setAuthUser] = useState<SupaUser | null>(null);

// replace your existing "auth" effect with this (so it updates live)
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

  /* ensure conversation exists (works for anon too because created_by is nullable) */
  useEffect(() => {
    if (!conversationId) return;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      try {
        await fetch("/api/conversations/ensure-ownership", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(user?.id ? { "x-user-id": user.id } : {}),
          },
          body: JSON.stringify({ conversationId }),
        });
      } catch {}
    })();
  }, [conversationId]);

  /* mark this conv as simple mode (only once) */
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

  /* initial load + realtime — single messages table */
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
      if (error) {
        console.error("Initial messages fetch failed:", error);
        return;
      }
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

  /* navigation */
  const handleNavigation = (screen: string) => {
    if (screen === "home" || screen === "endchat") {
      setPendingNavigate("/");
      if (!isAuthenticated) { setShowAnonymousWarning(true); return; }
      setShowExitMoodCheck(true);
      return;
    }
    switch (screen) {
      case "summary": router.push("/chat/summary"); break;
      case "/": router.push("/"); break;
      case "profile": router.push("/profile"); break;
      case "settings": router.push("/settings"); break;
      default: console.log(`Navigate to: ${screen}`);
    }
  };

  /* mood handlers */
  const handleMoodComplete = (moodData: MoodData) => { setEntryMood({ ...moodData, timestamp: new Date() }); setShowEntryMoodCheck(false); };
  const handleSkip = () => { setEntryMood(null); setShowEntryMoodCheck(false); };

  /* end chat */
  const endConversation = async () => {
    if (!conversationId) return;
    try {
      await supabase
        .from("conversations")
        .update({
          status: "ended",
          ended_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", conversationId);
    } catch (e) {
      console.warn("end convo update failed:", e);
    }
    if (typeof window !== "undefined") localStorage.removeItem(LS_CONVO_KEY);
  };

  const handleExitMoodComplete = async () => { setShowExitMoodCheck(false); await endConversation(); router.push((pendingNavigate ?? "/") as any); setPendingNavigate(null); };
  const handleExitSkip = async () => { setShowExitMoodCheck(false); await endConversation(); router.push((pendingNavigate ?? "/") as any); setPendingNavigate(null); };

  const handleAnonymousContinue = () => { setShowAnonymousWarning(false); setShowExitMoodCheck(true); };
  const handleAnonymousClose = () => setShowAnonymousWarning(false);
  const handleAnonymousCreateAccount = () => {
    setShowAnonymousWarning(false);
    const current = typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : "/chat/simple";
    router.push(`/login?redirect=${encodeURIComponent(current)}`);
  };

  /* ------- SEND: optimistic user + consume API reply + realtime safety net ------- */
  const handleSend = async (text: string) => {
    const t = text.trim();
    if (!t || !conversationId) return;

    const { data: { user } } = await supabase.auth.getUser();
    const uid = user?.id || null;

    // optimistic user bubble
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
          // fallback: show assistant locally so anon users SEE the reply
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
    () => sortedMessages.filter((m) => m.role === "user").length,
    [sortedMessages]
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
  // ⬇️ prevents any GLB loading in simple chat paths
  companionAvatar={{ name: "Adam", type: "default", url: undefined }}
  currentMood={entryMood}
   user={
    authUser
      ? {
          id: authUser.id,
          username:
            (authUser.user_metadata?.username as string) ||
            (authUser.email ? authUser.email.split("@")[0] : "You"),
          // avatar is optional; omit or fill if you have it
        }
      : undefined // will use the default anon until auth loads
  }
  onSend={handleSend}
  messages={uiMessages}
  isTyping={isTyping}
  stats={{ sessionSeconds: 0, messageCount: onlyUserCount }}
/>
    </div>
  );
}
