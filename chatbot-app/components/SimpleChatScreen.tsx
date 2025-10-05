"use client";

import React, { useState } from "react";

type UIMsg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  pending?: boolean;
  error?: boolean;
};

export default function SimpleChatScreen() {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<UIMsg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function send() {
    const content = text.trim();
    if (!content || busy) return;

    setText("");
    setBusy(true);

    // optimistic user bubble
    const tempId = `temp-${Date.now()}`;
    setMsgs((m) => [...m, { id: tempId, role: "user", content, pending: true }]);

    try {
      const res = await fetch("/api/simple-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: conversationId ?? undefined, content }),
      });

      if (!res.ok) {
        throw new Error((await res.json()).error ?? "Send failed");
      }
      const data = await res.json() as {
        conversationId: string;
        userMessageId: string;
        assistantMessageId: string;
        assistant: string;
      };

      // swap temp user bubble id to real one & clear pending
      setMsgs((m) =>
        m.map((x) =>
          x.id === tempId ? { ...x, id: data.userMessageId, pending: false } : x
        )
      );

      // push assistant bubble
      setMsgs((m) => [
        ...m,
        { id: data.assistantMessageId, role: "assistant", content: data.assistant },
      ]);

      setConversationId(data.conversationId);
    } catch (e) {
      console.error(e);
      // mark the optimistic message as failed
      setMsgs((m) =>
        m.map((x) => (x.id === tempId ? { ...x, pending: false, error: true } : x))
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl h-[80vh] flex flex-col gap-3">
      <div className="flex-1 overflow-auto rounded-xl border p-4 space-y-3 bg-background">
        {msgs.map((m) => (
          <div
            key={m.id}
            className={`rounded-lg px-3 py-2 ${
              m.role === "user" ? "bg-blue-500/10 border border-blue-500/30" : "bg-muted"
            }`}
          >
            <div className="text-xs opacity-70 mb-1">
              {m.role} {m.pending ? "• sending..." : m.error ? "• failed" : ""}
            </div>
            <div className="whitespace-pre-wrap">{m.content}</div>
          </div>
        ))}
        {msgs.length === 0 && (
          <div className="text-sm opacity-60">Start a new chat below…</div>
        )}
      </div>

      <div className="flex gap-2">
        <input
          className="flex-1 rounded-lg border px-3 py-2"
          placeholder="Type a message…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          disabled={busy}
        />
        <button
          className="rounded-lg border px-4 py-2"
          onClick={send}
          disabled={busy}
        >
          Send
        </button>
      </div>
    </div>
  );
}
