// components/ChatInterfaceScreen.tsx
"use client";

import React, { useMemo, useState } from "react";
import AvatarDisplay from "./chat/AvatarDisplay";
import ChatHeader from "./chat/ChatHeader";
import MessageList from "./chat/MessageList";
import MessageInput from "./chat/MessageInput";
import Sidebar from "./chat/Sidebar";
import Navbar from "./Navbar";

export type DbMessage = {
  id: string;
  conversation_id: string;
  sender_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
};

type UIMsg = {
  id: string;
  sender: "user" | "ai";
  content: string;
  timestamp: Date;
  type?: "safety-check" | "escalation" | "normal" | "mood-aware";
  anonymous?: boolean;
};

type ChatInterfaceScreenProps = {
  onNavigate: (screen: string) => void;
  chatMode: "avatar" | "standard";
  user?: any;
  currentAvatar?: any;
  currentMood?: {
    feeling: string;
    intensity: number;
    reason?: string;
    support?: string;
    timestamp: Date;
  } | null;
  onSend?: (text: string) => void;
  messages?: DbMessage[];     // from DB (page)
  isTyping?: boolean;
};

function moodGreeting(mood?: ChatInterfaceScreenProps["currentMood"]) {
  if (!mood) {
    return `Hi there! I'm Adam, your Avatar Companion. I'm here to listen and support you in a safe, confidential space. How are you feeling today?`;
  }
  const feeling = mood.feeling.toLowerCase();
  const intensity = mood.intensity;
  if (["happy", "calm"].includes(feeling)) {
    return `Hi! I'm Adam. I can see you're feeling ${feeling} — that's wonderful. What's been going well today?`;
  }
  if (["sad", "anxious"].includes(feeling)) {
    const supportLevel = intensity > 3 ? "really" : "a bit";
    return `Hello, I'm Adam. I understand you're feeling ${supportLevel} ${feeling}. Thank you for sharing — I'm here to listen and support you.`;
  }
  if (feeling === "frustrated") {
    return `Hi there, I'm Adam. Feeling frustrated is understandable. I'm here without judgment if you'd like to talk it through.`;
  }
  if (feeling === "tired") {
    return `Hello, I'm Adam. It sounds like you're feeling tired. I'm here for you — share as much or as little as you like.`;
  }
  return `Hi! I'm Adam. Thanks for letting me know you're feeling ${feeling}. What would be most helpful for you today?`;
}

export function ChatInterfaceScreen({
  onNavigate,
  chatMode,
  user,
  currentAvatar,
  currentMood,
  onSend,
  messages = [],
  isTyping = false,
}: ChatInterfaceScreenProps) {
  const [inputValue, setInputValue] = useState("");
  const [uiOnlySystem, setUiOnlySystem] = useState<UIMsg[]>([]); // sidebar-injected notes (not persisted)

  // Transform DB rows -> UI rows expected by MessageList
  const uiFromDb: UIMsg[] = useMemo(
    () =>
      messages.map((m) => ({
        id: m.id,
        sender: m.role === "assistant" ? "ai" : "user",
        content: m.content,
        timestamp: new Date(m.created_at),
        type: m.role === "system" ? "safety-check" : "normal",
      })),
    [messages]
  );

  // If no DB messages yet, show a one-time greeting
  const allMessages: UIMsg[] = useMemo(() => {
    if (uiFromDb.length === 0) {
      return [
        {
          id: "greeting",
          sender: "ai",
          content: moodGreeting(currentMood || undefined),
          timestamp: new Date(),
          type: currentMood ? "mood-aware" : "normal",
        },
        ...uiOnlySystem,
      ];
    }
    return [...uiFromDb, ...uiOnlySystem];
  }, [uiFromDb, uiOnlySystem, currentMood]);

  // Sidebar “inject” message (UI-only)
  const injectSystemMessage = (content: string) => {
    setUiOnlySystem((prev) => [
      ...prev,
      {
        id: `sys_${Date.now()}`,
        sender: "ai",
        content,
        timestamp: new Date(),
        type: "escalation",
      },
    ]);
  };

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-purple-100 via-pink-50 to-blue-100">
      <Navbar onNavigate={onNavigate} isLoggedIn={!!user} />

      <div className="flex-1 flex overflow-hidden min-h-0">
        <Sidebar onNavigate={onNavigate} onInjectMessage={injectSystemMessage} />

        {chatMode === "avatar" && (
          <div className="flex items-center justify-center w-[40%] border-r border-gray-200 bg-gradient-to-br from-purple-50 to-pink-50">
            <AvatarDisplay userAvatar={currentAvatar} aiAvatar={{ name: "Adam" }} />
          </div>
        )}

        <div className="flex-1 flex flex-col bg-white min-h-0">
          <ChatHeader currentMood={currentMood} chatMode={chatMode} />

          <MessageList messages={allMessages} isTyping={isTyping} chatMode={chatMode} />

          <MessageInput
            value={inputValue}
            onChange={setInputValue}
            onSendMessage={(text) => {
              const t = text.trim();
              if (!t) return;
              (onSend ?? (() => {}))(t);           // parent saves to DB; realtime will render it here
              setInputValue("");
            }}
            isAnonymous={true}
            onToggleAnonymous={() => {}}
            disabled={false}
          />
        </div>
      </div>
    </div>
  );
}
