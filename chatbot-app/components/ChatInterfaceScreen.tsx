// components/ChatInterfaceScreen.tsx
"use client";

import React, { useState, useRef, useEffect } from 'react';
import AvatarDisplay from './chat/AvatarDisplay';
import ChatHeader from './chat/ChatHeader';
import MessageList from './chat/MessageList';
import MessageInput from './chat/MessageInput';
import Sidebar from './chat/Sidebar';
import Navbar from './Navbar';

interface ChatInterfaceScreenProps {
  onNavigate: (screen: string) => void;
  chatMode: 'avatar' | 'standard';
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
  currentMood 
}: ChatInterfaceScreenProps) {
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

    return [{
      id: '1',
      sender: 'ai',
      content: getMoodAwareGreeting(),
      timestamp: new Date(),
      type: currentMood ? 'mood-aware' : 'normal'
    }];
  });

  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isAnonymous, setIsAnonymous] = useState(true);

  const handleSendMessage = async (content: string) => {
    if (!content.trim()) return;

    // Add user message immediately
    const userMessage: Message = {
      id: Date.now().toString(),
      sender: 'user',
      content: content.trim(),
      timestamp: new Date(),
      type: 'normal'
    };

    // Update messages state with the new user message
    setMessages(prev => {
      const newMessages = [...prev, userMessage];
      console.log('Messages updated:', newMessages); // Debug log
      return newMessages;
    });
    
    // Clear input and show typing indicator
    setIsTyping(true);

    // Simulate AI response
    setTimeout(() => {
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'ai',
        content: generateAIResponse(content, currentMood),
        timestamp: new Date(),
        type: 'normal'
      };
      
      setMessages(prev => [...prev, aiMessage]);
      setIsTyping(false);
    }, 1000 + Math.random() * 2000);
  };

  const generateAIResponse = (userMessage: string, mood: any) => {
    // Simple response generation - you'd replace this with actual AI integration
    const responses = [
      "I hear you. That sounds like it's really weighing on your mind. Can you tell me more about what's making you feel this way?",
      "Thank you for sharing that with me. It takes courage to open up about how you're feeling. What do you think might help you feel a bit better right now?",
      "I understand this is difficult for you. You're doing the right thing by talking about it. What support do you have around you at the moment?",
      "That sounds really challenging. I'm here to listen and support you through this. What's the most important thing you'd like me to understand about your situation?",
      "I can hear how much this is affecting you. You're being very brave by sharing these feelings. What would make you feel most supported right now?"
    ];
    
    return responses[Math.floor(Math.random() * responses.length)];
  };

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-purple-100 via-pink-50 to-blue-100">
      {/* Navbar */}
      <Navbar onNavigate={onNavigate} isLoggedIn={!!user} />
      
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <Sidebar onNavigate={onNavigate} />
        
        {/* Avatar Display - Only show in avatar mode */}
        {chatMode === 'avatar' && (
          <AvatarDisplay 
            userAvatar={currentAvatar}
            aiAvatar={{ name: 'Adam', type: 'ai' }}
            isAISpeaking={isTyping}
          />
        )}
        
        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col bg-white">
          <ChatHeader 
            currentMood={currentMood}
            chatMode={chatMode}
          />
          
          <MessageList 
            messages={messages}
            isTyping={isTyping}
            chatMode={chatMode}
          />
          
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
  );
}