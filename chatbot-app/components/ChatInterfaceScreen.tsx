// components/ChatInterfaceScreen.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import AvatarDisplay from "./chat/AvatarDisplay";
import ChatHeader from "./chat/ChatHeader";
import MessageList from "./chat/MessageList";
import MessageInput from "./chat/MessageInput";
import Sidebar from "./chat/Sidebar";
import Navbar from "./Navbar";

interface ChatInterfaceScreenProps {
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
}

interface Message {
  id: string;
  sender: "user" | "ai";
  content: string;
  timestamp: Date;
  type?: "safety-check" | "escalation" | "normal" | "mood-aware";
  anonymous?: boolean; // used by MessageList to show “Anonymous”
}

export function ChatInterfaceScreen({
  onNavigate,
  chatMode,
  user,
  currentAvatar,
  currentMood,
}: ChatInterfaceScreenProps) {
  /** Build the very first mood-aware greeting */
  const getMoodAwareGreeting = () => {
    if (!currentMood) {
      return `Hi there! I'm Adam, your Avatar Companion. I'm here to listen and support you in a safe, confidential space. How are you feeling today?`;
    }
    const feeling = currentMood.feeling.toLowerCase();
    const intensity = currentMood.intensity;

    if (feeling === "happy" || feeling === "calm") {
      return `Hi! I'm Adam. I can see you're feeling ${feeling} — that's wonderful. What's been going well today?`;
    } else if (feeling === "sad" || feeling === "anxious") {
      const supportLevel = intensity > 3 ? "really" : "a bit";
      return `Hello, I'm Adam. I understand you're feeling ${supportLevel} ${feeling}. Thank you for sharing — I'm here to listen and support you.`;
    } else if (feeling === "frustrated") {
      return `Hi there, I'm Adam. Feeling frustrated is understandable. I'm here without judgment if you'd like to talk it through.`;
    } else if (feeling === "tired") {
      return `Hello, I'm Adam. It sounds like you're feeling tired. I'm here for you — share as much or as little as you like.`;
    }
    return `Hi! I'm Adam. Thanks for letting me know you're feeling ${feeling}. What would be most helpful for you today?`;
  };

  /** Messages state */
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      sender: "ai",
      content: getMoodAwareGreeting(),
      timestamp: new Date(),
      type: currentMood ? "mood-aware" : "normal",
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isAnonymous, setIsAnonymous] = useState(true);

  /** simple response generator need replace with backend */
  const generateAIResponse = (userMessage: string) => {
    const base = [
      "I hear you — that sounds like a lot to carry. What would help you feel a little safer right now?",
      "Thank you for sharing that. What support around you has felt helpful, even a little?",
      "That seems really tough. I'm here to listen. What would you like me to understand most about this?",
      "You're not alone. Would it help to break this down into smaller steps together?",
      "You're doing the right thing by talking about it. What might make the next hour a bit easier?",
    ];
    return base[Math.floor(Math.random() * base.length)];
  };

  /** Send handler */
  const handleSendMessage = async (content: string) => {
    const trimmed = content.trim();
    if (!trimmed) return;

    setMessages((prev) => [
      ...prev,
      {
        id: `${Date.now()}`,
        sender: "user",
        content: trimmed,
        timestamp: new Date(),
        type: "normal",
        anonymous: isAnonymous,
      },
    ]);

    setIsTyping(true);

    const delay = 900 + Math.random() * 1200;
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now() + 1}`,
          sender: "ai",
          content: generateAIResponse(trimmed),
          timestamp: new Date(),
          type: "normal",
        },
      ]);
      setIsTyping(false);
    }, delay);
  };


const injectSystemMessage = (content: string) => {
  setMessages(prev => [
    ...prev,
    {
      id: `${Date.now()}`,
      sender: "ai",
      content,
      timestamp: new Date(),
      type: "escalation", // or "normal" if you prefer
    },
  ]);
};

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-purple-100 via-pink-50 to-blue-100">
      {/* Navbar (left untouched) */}
      <Navbar onNavigate={onNavigate} isLoggedIn={!!user} />

      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Sidebar (hosts Crisis/Find Counselor/End Chat) */}
        <Sidebar onNavigate={onNavigate} onInjectMessage={injectSystemMessage}/>

        {/* Avatar pane ONLY in avatar mode */}
        {chatMode === "avatar" && (
        <div className="flex items-center justify-center w-[40%] border-r border-gray-200 bg-gradient-to-br from-purple-50 to-pink-50">
          <AvatarDisplay
            userAvatar={currentAvatar}
            aiAvatar={{ name: "Adam" }}
          />
        </div>
        )}

        {/* Main chat column */}
        <div className="flex-1 flex flex-col bg-white min-h-0">
          {/* Header with current mode & mood badge */}
        <div className="flex-1 flex flex-col bg-white">
          <ChatHeader currentMood={currentMood} chatMode={chatMode} />
          <MessageList messages={messages} isTyping={isTyping} chatMode={chatMode} />
          <MessageInput
            value={inputValue}
            onChange={setInputValue}
            onSendMessage={handleSendMessage}
            isAnonymous={isAnonymous}
            onToggleAnonymous={setIsAnonymous}
            disabled={isTyping}
          />
        </div>
        </div>
      </div>
    </div>
  );
}
