// components/chat/MessageList.tsx
'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ScrollArea } from '../ui/scroll-area';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { User } from 'lucide-react';

interface Message {
  id: string;
  sender: 'user' | 'ai';
  content: string;
  timestamp: Date;
  type?: 'safety-check' | 'escalation' | 'normal' | 'mood-aware';
}

interface MessageListProps {
  messages: Message[];
  isTyping: boolean;
  chatMode: 'avatar' | 'standard';
}

const formatTime = (ts: Date) =>
  new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

export default function MessageList({ messages, isTyping }: MessageListProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (!autoScroll || !endRef.current) return;
    endRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isTyping, autoScroll]);

  const handleScroll = () => {
    const el = viewportRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    setAutoScroll(distance < 60);
  };

  const MessageBubble = ({ message }: { message: Message }) => {
    const isAI = message.sender === 'ai';
    return (
      <div className={`flex items-start gap-3 ${isAI ? '' : 'flex-row-reverse'} mb-5`} role="listitem">
        <Avatar className="h-8 w-8 shrink-0">
          {isAI ? (
            <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-500 text-white text-xs">
              A
            </AvatarFallback>
          ) : (
            <AvatarFallback className="bg-gradient-to-br from-teal-500 to-blue-500 text-white text-xs">
              <User className="h-4 w-4" />
            </AvatarFallback>
          )}
        </Avatar>

        <div className={`flex flex-col max-w-xs lg:max-w-md ${isAI ? 'items-start' : 'items-end'}`}>
          <div
            className={`px-4 py-3 rounded-2xl ${
              isAI ? 'bg-gray-100 text-gray-900 rounded-tl-sm' : 'bg-blue-500 text-white rounded-tr-sm'
            }`}
          >
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
          </div>
          <span className="text-xs text-gray-500 mt-1 px-1">{formatTime(message.timestamp)}</span>
        </div>
      </div>
    );
  };

  const TypingIndicator = () => (
    <div className="flex items-start gap-3 mb-5" role="status" aria-live="polite">
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-500 text-white text-xs">
          A
        </AvatarFallback>
      </Avatar>
      <div className="bg-gray-100 px-4 py-3 rounded-2xl rounded-tl-sm max-w-xs lg:max-w-md">
        <div className="flex gap-1">
          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );

  // ⬇️ IMPORTANT: explicit return of JSX
  return (
    <div className="relative">
      {!autoScroll && (
        <button
          onClick={() => {
            setAutoScroll(true);
            endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
          }}
          className="absolute left-1/2 -translate-x-1/2 -top-8 z-10 text-xs bg-neutral-200 dark:bg-neutral-800 rounded px-2 py-1"
        >
          Jump to latest
        </button>
      )}

      <ScrollArea className="flex-1 px-6" onScrollCapture={handleScroll}>
        <div ref={viewportRef} className="py-6 space-y-4" role="list" aria-label="Conversation">
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}
          {isTyping && <TypingIndicator />}
          <div ref={endRef} />
        </div>
      </ScrollArea>
    </div>
  );
}
