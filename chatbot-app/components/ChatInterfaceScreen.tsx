// components/ChatInterfaceScreen.tsx
"use client";

import React, { useMemo, useState } from "react";
import AvatarDisplay from "./chat/AvatarDisplay";
import type { RpmAnimationConfig } from "./chat/RpmModel";
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

type User = {
  id: string;
  username: string;
  avatar?: Avatar;
};

type Avatar = {
  name: string;
  type: 'custom' | 'default';
  url?: string | null;
  animation?: RpmAnimationConfig;
};

type ChatInterfaceScreenProps = {
  onNavigate: (screen: string) => void;
  chatMode: "avatar" | "standard";
  user?: User;
  companionAvatar?: Avatar;
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

function moodGreeting(companionName: string, mood?: ChatInterfaceScreenProps["currentMood"]) {
  if (!mood || !mood.feeling) {
    return `Hi there! I'm ${companionName}, your Avatar Companion. I'm here to listen and support you in a safe, confidential space. How are you feeling today?`;
  }
  const feeling = mood.feeling.toLowerCase();
  const intensity = mood.intensity;
  if (["happy", "calm"].includes(feeling)) {
    return `Hi! I'm ${companionName}. I can see you're feeling ${feeling} — that's wonderful. What's been going well today?`;
  }
  if (["sad", "anxious"].includes(feeling)) {
    const supportLevel = intensity > 3 ? "really" : "a bit";
    return `Hello, I'm ${companionName}. I understand you're feeling ${supportLevel} ${feeling}. Thank you for sharing — I'm here to listen and support you.`;
  }
  if (feeling === "frustrated") {
    return `Hi there, I'm ${companionName}. Feeling frustrated is understandable. I'm here without judgment if you'd like to talk it through.`;
  }
  if (feeling === "tired") {
    return `Hello, I'm ${companionName}. It sounds like you're feeling tired. I'm here for you — share as much or as little as you like.`;
  }
  return `Hi! I'm ${companionName}. Thanks for letting me know you're feeling ${feeling}. What would be most helpful for you today?`;
}

export function ChatInterfaceScreen({
  onNavigate,
  chatMode,
  user = { id: 'anon', username: 'You', avatar: { name: 'User', type: 'default', url: null, animation: { profile: 'masculine' } } },
  companionAvatar = {
    name: 'Adam',
    type: 'default',
    url: "https://models.readyplayer.me/68be69db5dc0cec769cfae75.glb",
    animation: { profile: 'feminine' }
  },
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
          content: moodGreeting(companionAvatar.name, currentMood || undefined),
          timestamp: new Date(),
          type: currentMood ? "mood-aware" : "normal",
        },
        ...uiOnlySystem,
      ];
    }
    return [...uiFromDb, ...uiOnlySystem];
  }, [uiFromDb, uiOnlySystem, currentMood, companionAvatar.name]);

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
      <Navbar onNavigate={onNavigate} isLoggedIn={!!user && user.id !== 'anon'} />

      <div className="flex-1 flex overflow-hidden min-h-0">
        <Sidebar onNavigate={onNavigate} onInjectMessage={injectSystemMessage} />

        {chatMode === "avatar" && (
          <div className="flex items-center justify-center w-[40%] border-r border-gray-200 bg-gradient-to-br from-purple-50 to-pink-50">
            <AvatarDisplay
              userAvatar={{
                name: user?.avatar?.name ?? 'User',
                url: user?.avatar?.url ?? undefined, // ensure url is string | undefined
                animation: user?.avatar?.animation
              }}
              aiAvatar={{
                name: companionAvatar?.name ?? 'Adam',
                url: companionAvatar?.url ?? undefined, // ensure url is string | undefined
                animation: companionAvatar?.animation
              }}
            />
          </div>
        )}

        <div className="flex-1 flex flex-col bg-white min-h-0">
          <ChatHeader
            currentMood={currentMood}
            chatMode={chatMode}
            companionName={companionAvatar.name}
            companionAvatarUrl={companionAvatar.url}
          />

          <MessageList messages={allMessages} isTyping={isTyping} chatMode={chatMode} />

          <MessageInput
            value={inputValue}
            onChange={setInputValue}
            onSendMessage={(text) => {
              const t = text.trim();
              if (!t) return;
              (onSend ?? (() => {}))(t);
              setInputValue("");
            }}
            isAnonymous={user.id === 'anon'}
            onToggleAnonymous={() => {}}
            disabled={false}
          />
        </div>
      </div>
    </div>
  );
}
