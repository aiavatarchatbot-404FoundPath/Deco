// components/ChatInterfaceScreen.tsx
'use client';

import React, { useState } from 'react'; 
import { AvatarDisplay } from './chat/AvatarDisplay';
import ChatHeader from './chat/ChatHeader';
import MessageList from './chat/MessageList';
import MessageInput from './chat/MessageInput';
import Sidebar from './chat/Sidebar';
import Navbar from './Navbar';

/** Public props from the pages */
interface ChatInterfaceScreenProps {
  onNavigate: (screen: string) => void;
  chatMode: 'avatar' | 'standard';
  user?: {
    id?: string;
    username?: string;
    avatarUrl?: string;
  } | null;
  currentAvatar?: { name?: string; url?: string } | null;
  currentMood?: {
    feeling: string;
    intensity: number;
    reason?: string;
    support?: string;
    timestamp: Date;
  } | null;
}

/** Internal message shape (kept compatible with your MessageList) */
interface Message {
  id: string;
  sender: 'user' | 'ai';
  content: string;
  timestamp: Date;
  type?: 'safety-check' | 'escalation' | 'normal' | 'mood-aware';
}

export function ChatInterfaceScreen({
  onNavigate,
  chatMode,
  user,
  currentAvatar,
  currentMood,
}: ChatInterfaceScreenProps) {
  // -------------------- Trauma-informed controls (Header) --------------------
  const [paused, setPaused] = useState(false);                 // Pause / Resume AI replies
  const [pace, setPace] = useState<'slow' | 'normal'>('normal'); // Reply pacing (affects delay)
  const [motionSafe, setMotionSafe] = useState(true);          // Reduce motion toggle

  // -------------------- Composer & conversation state -----------------------
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);             // AI typing indicator
  const [isAnonymous, setIsAnonymous] = useState(true);

  // Initial greeting (mood-aware copy stays the same as yours)
  const [messages, setMessages] = useState<Message[]>(() => {
    const getMoodAwareGreeting = () => {
      if (!currentMood) {
        return "Hi there! I'm Adam, your Avatar Companion. I'm here to listen and support you in a safe, confidential space. How are you feeling today?";
      }
      const feeling = currentMood.feeling.toLowerCase();
      const intensity = currentMood.intensity;

      if (feeling === 'happy' || feeling === 'calm') {
        return `Hi! I'm Adam. I can see you're feeling ${feeling} right now - that's wonderful! I'm here to chat and support you. What's been going well for you today?`;
      } else if (feeling === 'sad' || feeling === 'anxious') {
        const supportLevel = intensity > 3 ? 'really' : 'a bit';
        return `Hello, I'm Adam. I understand you're feeling ${supportLevel} ${feeling} right now. Thank you for sharing that with me - it takes courage. I'm here to listen and support you through this. You're not alone.`;
      } else if (feeling === 'frustrated') {
        return `Hi there, I'm Adam. I can see you're feeling frustrated right now. That's completely understandable - we all have those days. I'm here to listen without judgment and help you work through whatever is on your mind.`;
      } else if (feeling === 'tired') {
        return `Hello, I'm Adam. I understand you're feeling tired right now. Sometimes our minds need rest just as much as our bodies do. I'm here for you - feel free to share as much or as little as you'd like.`;
      } else {
        return `Hi! I'm Adam. Thanks for letting me know you're feeling ${feeling}. I'm here to provide a safe, supportive space for you. What would be most helpful for you in our conversation today?`;
      }
    };

    return [
      {
        id: 'welcome-1',
        sender: 'ai',
        content: getMoodAwareGreeting(),
        timestamp: new Date(),
        type: currentMood ? 'mood-aware' : 'normal',
      },
    ];
  });

  // -------------------- Fake AI reply (replace with your backend later) -----
  const generateAIResponse = (userMessage: string) => {
    const responses = [
      "I hear you. That sounds like it's really weighing on your mind. Can you tell me more about what's making you feel this way?",
      "Thank you for sharing that with me. It takes courage to open up about how you're feeling. What do you think might help you feel a bit better right now?",
      "I understand this is difficult for you. You're doing the right thing by talking about it. What support do you have around you at the moment?",
      "That sounds really challenging. I'm here to listen and support you through this. What's the most important thing you'd like me to understand about your situation?",
      "I can hear how much this is affecting you. You're being very brave by sharing these feelings. What would make you feel most supported right now?",
    ];
    return responses[Math.floor(Math.random() * responses.length)];
  };

  const handleSendMessage = (content: string) => {
    if (!content.trim()) return;

    // 1) Add the user message immediately
    const userMessage: Message = {
      id: crypto.randomUUID(),
      sender: 'user',
      content: content.trim(),
      timestamp: new Date(),
      type: 'normal',
    };
    setMessages((prev) => [...prev, userMessage]);

    // 2) If AI is paused, do not respond (respect agency)
    if (paused) return;

    // 3) Simulate the AI typing and replying after a delay based on pace
    setIsTyping(true);
    const delay = pace === 'slow' ? 1400 : 700;
    setTimeout(() => {
      const aiMessage: Message = {
        id: crypto.randomUUID(),
        sender: 'ai',
        content: generateAIResponse(content),
        timestamp: new Date(),
        type: 'normal',
      };
      setMessages((prev) => [...prev, aiMessage]);
      setIsTyping(false);
    }, delay);
  };

  // -------------------- Render ------------------------------------------------
  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-purple-100 via-pink-50 to-blue-100">
      {/* Top navigation (logo/profile) */}
      <Navbar onNavigate={onNavigate} isLoggedIn={!!user} />

      <div className="flex-1 flex overflow-hidden">
        {/* Support sidebar (can hide on small screens if you want) */}
        <Sidebar onNavigate={onNavigate} />

        {/* Avatar panel (only in avatar mode) */}
        {chatMode === 'avatar' && (
          <AvatarDisplay
            // AI avatar (image is optional — name fallback will render)
            aiAvatar={{ name: 'Adam', url: currentAvatar?.url }}
            // User avatar (optional)
            userAvatar={{ name: user?.username || 'You', url: user?.avatarUrl }}
            // Show calm speaking dot when AI is typing
            speaking={isTyping}
            // Respect reduced motion toggle
            motionSafe={motionSafe}
          />
        )}

        {/* Main chat column */}
        <div className="flex-1 flex flex-col bg-white">
          {/* Header: title, mood, and (optional) controls */}
          <ChatHeader
            chatMode={chatMode}
            currentMood={currentMood}
            paused={paused}
            pace={pace}
            motionSafe={motionSafe}
            onTogglePaused={() => setPaused((p) => !p)}
            onPaceChange={setPace}
            onToggleMotion={() => setMotionSafe((m) => !m)}
          />

          {/* Messages list */}
          <MessageList messages={messages} isTyping={isTyping} chatMode={chatMode} />

          {/* Composer (message input) */}
          <MessageInput
            value={inputValue}
            onChange={setInputValue}
            onSendMessage={handleSendMessage}
            isAnonymous={isAnonymous}
            onToggleAnonymous={setIsAnonymous}
            disabled={isTyping /* prevent double-sends while AI is typing */}
            // Optional: set a character limit
            // maxLength={1000}
          />
        </div>
      </div>
    </div>
  );
}
