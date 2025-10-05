"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { ChatInterfaceScreen } from "../../../components/ChatInterfaceScreen";
import type { DbMessage } from "../../../components/ChatInterfaceScreen";
import MoodCheckIn from "../../../components/MoodCheckIn";
import AnonymousExitWarning from "../../../components/chat/AnonymousExitWarning";

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
function upsertAndSort(prev: MessageRow[], next: MessageRow) {
  const exists = prev.some((m) => m.id === next.id);
  const arr = exists ? prev.map((m) => (m.id === next.id ? next : m)) : [...prev, next];
  return arr.slice().sort(sortMsgs);
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
      const {
        data: { user },
      } = await supabase.auth.getUser();
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

    // default: reuse last conversation if it exists, else create one
    let cid = localStorage.getItem(LS_CONVO_KEY);
    if (!cid) {
      cid = crypto.randomUUID();
      localStorage.setItem(LS_CONVO_KEY, cid);
    }
    setConversationId(cid);
  }, []);

  /* ensure conversation exists (works for anon) */
  useEffect(() => {
    if (!conversationId) return;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
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

  /* initial load + realtime (merge; never clobber) */
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

      const fetched = (data ?? []) as MessageRow[];
      setMessages((prev) => {
        const byId = new Map<string, MessageRow>();
        for (const m of prev) byId.set(m.id, m);
        for (const m of fetched) byId.set(m.id, m);
        return Array.from(byId.values()).sort(sortMsgs);
      });
    })();

    const ch = supabase
      .channel(`msgs:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          setMessages((prev) => upsertAndSort(prev, payload.new as MessageRow));
        }
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
      if (!isAuthenticated) {
        setShowAnonymousWarning(true);
        return;
      }
      setShowExitMoodCheck(true);
      return;
    }
    switch (screen) {
      case "summary":
        router.push("/chat/summary");
        break;
      case "/":
        router.push("/");
        break;
      case "profile":
        router.push("/profile");
        break;
      case "settings":
        router.push("/settings");
        break;
      default:
        console.log(`Navigate to: ${screen}`);
    }
  };

  /* mood handlers */
  const handleMoodComplete = (moodData: MoodData) => {
    setEntryMood({ ...moodData, timestamp: new Date() });
    setShowEntryMoodCheck(false);
  };
  const handleSkip = () => {
    setEntryMood(null);
    setShowEntryMoodCheck(false);
  };

  /* ------- END CHAT helper (2b) ------- */
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
    if (typeof window !== "undefined") {
      localStorage.removeItem(LS_CONVO_KEY);
    }
  };

  const handleExitMoodComplete = async () => {
    setShowExitMoodCheck(false);
    await endConversation();
    router.push((pendingNavigate ?? "/") as any);
    setPendingNavigate(null);
  };
  const handleExitSkip = async () => {
    setShowExitMoodCheck(false);
    await endConversation();
    router.push((pendingNavigate ?? "/") as any);
    setPendingNavigate(null);
  };

  const handleAnonymousContinue = () => {
    setShowAnonymousWarning(false);
    setShowExitMoodCheck(true);
  };
  const handleAnonymousClose = () => setShowAnonymousWarning(false);
  const handleAnonymousCreateAccount = () => {
    setShowAnonymousWarning(false);
    const current =
      typeof window !== "undefined"
        ? `${window.location.pathname}${window.location.search}`
        : "/chat/simple";
    router.push(`/login?redirect=${encodeURIComponent(current)}`);
  };

  /* ------- SEND: optimistic user + consume API reply + keep realtime safety net ------- */
  type ChatResponse = {
    conversationId: string;
    answer: string;
    rows?: { user?: MessageRow; assistant?: MessageRow };
  };

  const handleSend = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || !conversationId) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const uid = user?.id || null;

    // 1) OPTIMISTIC USER BUBBLE (shows immediately)
    const tempId = `local-${crypto.randomUUID()}`;
    const optimisticUser: MessageRow = {
      id: tempId,
      conversation_id: conversationId,
      sender_id: uid,
      role: "user",
      content: trimmed,
      created_at: new Date().toISOString(),
      status: "sending",
    };
    setMessages((prev) => upsertAndSort(prev, optimisticUser));

    setIsTyping(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(uid ? { "x-user-id": uid } : {}),
        },
        body: JSON.stringify({ conversationId, userMessage: trimmed, chatMode: "simple" }),
        cache: "no-store",
      });

      const data: ChatResponse = await res.json().catch(async () => {
        const raw = await res.text();
        try {
          return JSON.parse(raw) as ChatResponse;
        } catch {
          return { answer: raw } as ChatResponse;
        }
      });
      if (!res.ok) throw new Error((data as any)?.error || "chat error");

      // 2) SWAP TEMP USER -> REAL DB ROW (typed to MessageRow to avoid TS widening)
      const serverUser = data?.rows?.user;
      setMessages((prev) => {
        if (!serverUser) {
          // no row returned; mark optimistic as sent and keep temp id
          const next = prev.map<MessageRow>((m) =>
            m.id === tempId ? { ...m, status: "sent" } : m
          );
          return next.sort(sortMsgs);
        }

        const next = prev.map<MessageRow>((m) => {
          if (m.id !== tempId) return m;
          const updated: MessageRow = {
            ...m,
            id: String(serverUser.id),
            created_at:
              typeof serverUser.created_at === "string"
                ? serverUser.created_at
                : m.created_at,
            status: "sent",
          };
          return updated;
        });
        return next.sort(sortMsgs);
      });

      // 3) APPEND ASSISTANT IMMEDIATELY
      const serverAssistant = data?.rows?.assistant;
      if (serverAssistant) {
        const assistantRow: MessageRow = {
          id: String(serverAssistant.id),
          conversation_id: serverAssistant.conversation_id,
          sender_id: serverAssistant.sender_id ?? null,
          role: serverAssistant.role,
          content: serverAssistant.content,
          created_at: String(serverAssistant.created_at),
          status: "sent",
        };
        setMessages((prev) => upsertAndSort(prev, assistantRow));
      } else if (data?.answer) {
        const synthetic: MessageRow = {
          id: `local-${crypto.randomUUID()}`,
          conversation_id: conversationId,
          sender_id: null,
          role: "assistant",
          content: data.answer,
          created_at: new Date().toISOString(),
          status: "sent",
        };
        setMessages((prev) => upsertAndSort(prev, synthetic));
      }

      // ---------- 2a: mark convo ongoing + bump updated_at + set title once ----------
      try {
        const titleGuess = trimmed.split("\n")[0].slice(0, 60);
        await supabase
          .from("conversations")
          .update({
            status: "ongoing",
            updated_at: new Date().toISOString(),
          })
          .eq("id", conversationId);

        await supabase
        .from("conversations")
        .update({ chat_mode: "simple" })
        .eq("id", conversationId)
        .is("chat_mode", null);

      } catch (e) {
        console.warn("update convo meta (client) failed:", e);
      }
      // ------------------------------------------------------------------------------

      // keep/patch conversation id, if server changes it
      if (data?.conversationId && data.conversationId !== conversationId) {
        setConversationId(data.conversationId);
        if (typeof window !== "undefined") {
          localStorage.setItem(LS_CONVO_KEY, data.conversationId);
        }
      }
    } catch (e) {
      console.error("send failed:", e);
      // mark optimistic bubble as failed
      setMessages((prev) =>
        prev.map<MessageRow>((m) => (m.id === tempId ? { ...m, status: "failed" } : m))
      );
    } finally {
      setIsTyping(false);
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
          previousMood={
            entryMood ? { feeling: entryMood.feeling, intensity: entryMood.intensity } : null
          }
          confirmLabel="Save & End Chat"
          onComplete={handleExitMoodComplete}
          onSkip={handleExitSkip}
        />
      )}

      <ChatInterfaceScreen
        onNavigate={handleNavigation}
        chatMode="standard"
        currentMood={entryMood}
        onSend={handleSend}
        messages={uiMessages}
        isTyping={isTyping}
        stats={{ sessionSeconds: 0, messageCount: onlyUserCount }}
      />
    </div>
  );
  
}

