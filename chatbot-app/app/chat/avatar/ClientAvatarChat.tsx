'use client';

import React, { useEffect, useState } from 'react';
import { ChatInterfaceScreen } from '../../../components/ChatInterfaceScreen';
import MoodCheckIn from '../../../components/MoodCheckIn';
import { sendUserMessage } from '@/lib/messages';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
};

export default function ClientAvatarChat() {
  const router = useRouter();
  const params = useSearchParams();               // safe here (client)
  const conversationId = params.get('convo');     // null for anonymous

  const [mood, setMood] = useState<{
    feeling: string;
    intensity: number;
    reason?: string;
    support?: string;
    timestamp: Date;
  } | null>(null);

  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [isTyping, setIsTyping] = useState(false);

  const handleNavigation = (screen: string) => {
    switch (screen) {
      case 'home':
      case '/':
        router.push('/');
        break;
      case 'profile':
        router.push('/profile');
        break;
      case 'settings':
        router.push('/settings');
        break;
      case 'summary':
        router.push('/chat/summary');
        break;
      default:
        console.log(`Navigate to: ${screen}`);
    }
  };

  const handleMoodComplete = (m: { feeling: string; intensity: number; reason?: string; support?: string; }) =>
    setMood({ ...m, timestamp: new Date() });
  const handleSkip = () => setMood(null);

  // Initial fetch + realtime
  useEffect(() => {
    if (!conversationId) return;

    let mounted = true;

    (async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('id, conversation_id, sender_id, role, content, created_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .limit(50);
      if (!mounted) return;
      if (!error) setMessages(data ?? []);
    })();

    const ch = supabase
      .channel(`msgs:${conversationId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const m = payload.new as MessageRow;
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(ch);
    };
  }, [conversationId]);

  // Simple AI stub — replace with your model call
  async function getAdamReply(userText: string): Promise<string> {
    const canned = [
      "I hear you — that sounds like a lot to carry. What would help you feel a little safer right now?",
      "Thank you for sharing that. What support around you has felt helpful, even a little?",
      "That seems really tough. I'm here to listen. What would you like me to understand most about this?",
      "You're not alone. Would it help to break this down into smaller steps together?",
      "You're doing the right thing by talking about it. What might make the next hour a bit easier?",
    ];
    return canned[Math.floor(Math.random() * canned.length)];
  }

  // Optimistic send + persist user + assistant
  const handleSend = async (text: string) => {
    if (!text.trim()) return;
    try {
      if (!conversationId) return; // anonymous: no DB writes
      setIsTyping(true);

      // optimistic user
      const tempUserId = `temp-user-${Date.now()}`;
      setMessages(prev => [...prev, {
        id: tempUserId,
        conversation_id: conversationId,
        sender_id: 'me',
        role: 'user',
        content: text,
        created_at: new Date().toISOString(),
      }]);

      // persist user
      const savedUser = await sendUserMessage(conversationId, text);
      setMessages(prev => {
        const withoutTemp = prev.filter(m => m.id !== tempUserId);
        if (withoutTemp.some(m => m.id === savedUser.id)) return withoutTemp;
        return [...withoutTemp, savedUser];
      });

      // assistant
      const assistantText = await getAdamReply(text);
      const tempBotId = `temp-bot-${Date.now()}`;
      setMessages(prev => [...prev, {
        id: tempBotId,
        conversation_id: conversationId,
        sender_id: 'bot',
        role: 'assistant',
        content: assistantText,
        created_at: new Date().toISOString(),
      }]);

      const res = await fetch('/api/assistant-message', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ conversationId, content: assistantText }),
      });
      const savedBot = await res.json();
      setMessages(prev => {
        const withoutTemp = prev.filter(m => m.id !== tempBotId);
        if (savedBot?.id && !withoutTemp.some(m => m.id === savedBot.id)) {
          return [...withoutTemp, savedBot];
        }
        return withoutTemp;
      });

    } catch (e) {
      console.error('send failed:', e);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-100 via-pink-50 to-blue-100">
      {mood === null && <MoodCheckIn onComplete={handleMoodComplete} onSkip={handleSkip} />}

      <ChatInterfaceScreen
        onNavigate={handleNavigation}
        chatMode="avatar"
        user={{ id: '1', username: 'User123' }}
        currentAvatar={{ name: 'Alex', type: 'custom' }}
        currentMood={mood}
        onSend={handleSend}
        messages={messages}
        isTyping={isTyping}
      />
    </div>
  );
}
