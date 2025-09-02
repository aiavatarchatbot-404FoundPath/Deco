// components/chat/MessageList.tsx
"use client";

import React, { useEffect, useRef } from 'react';
import { ScrollArea } from '../ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { User, Bot } from 'lucide-react';

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

export default function MessageList({ messages, isTyping, chatMode }: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const formatTime = (timestamp: Date) => {
    return timestamp.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  };

  const MessageBubble = ({ message }: { message: Message }) => {
    const isAI = message.sender === 'ai';
    
    return (
      <div className={`flex items-start space-x-3 ${isAI ? '' : 'flex-row-reverse space-x-reverse'} mb-6`}>
        {/* Avatar */}
        <Avatar className="h-8 w-8 flex-shrink-0">
          {isAI ? (
            <>
              <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-500 text-white text-xs">
                A
              </AvatarFallback>
            </>
          ) : (
            <>
              <AvatarFallback className="bg-gradient-to-br from-teal-500 to-blue-500 text-white text-xs">
                <User className="h-4 w-4" />
              </AvatarFallback>
            </>
          )}
        </Avatar>

        {/* Message Content */}
        <div className={`flex flex-col max-w-xs lg:max-w-md ${isAI ? 'items-start' : 'items-end'}`}>
          <div
            className={`px-4 py-3 rounded-2xl ${
              isAI
                ? 'bg-gray-100 text-gray-900 rounded-tl-sm'
                : 'bg-blue-500 text-white rounded-tr-sm'
            }`}
          >
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
          </div>
          
          {/* Timestamp */}
          <span className="text-xs text-gray-500 mt-1 px-1">
            {formatTime(message.timestamp)}
          </span>
        </div>
      </div>
    );
  };

  const TypingIndicator = () => (
    <div className="flex items-start space-x-3 mb-6">
      <Avatar className="h-8 w-8 flex-shrink-0">
        <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-500 text-white text-xs">
          A
        </AvatarFallback>
      </Avatar>
      
      <div className="bg-gray-100 px-4 py-3 rounded-2xl rounded-tl-sm max-w-xs">
        <div className="flex space-x-1">
          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
        </div>
      </div>
    </div>
  );

  return (
    <ScrollArea className="flex-1 px-6">
      <div className="py-6 space-y-4">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
        
        {isTyping && <TypingIndicator />}
        
        <div ref={messagesEndRef} />
      </div>
    </ScrollArea>
  );
}