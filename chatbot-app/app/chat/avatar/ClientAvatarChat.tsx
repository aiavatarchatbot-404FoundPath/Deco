'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ChatInterfaceScreen } from '../../../components/ChatInterfaceScreen';
import MoodCheckIn from '../../../components/MoodCheckIn';
import { sendUserMessage } from '@/lib/messages';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { endConversation } from "@/lib/conversations";


type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
  status?: 'sending' | 'sent' | 'failed';
};

type Profile = {
  id: string;
  username: string | null;
  rpm_user_url: string | null;
  rpm_companion_url: string | null;
};

type MoodData = {
  feeling: string;
  intensity: number;
  reason?: string;
  support?: string;
};

type MoodState = (MoodData & { timestamp: Date }) | { skipped: true; timestamp: Date } | null;

const MOOD_SESSION_KEY = 'moodCheckedIn:v1';

export default function ClientAvatarChat() {
  const router = useRouter();
  const params = useSearchParams();               // safe here (client)
  const conversationId = params.get('convo');     // null for anonymous
  const companionUrlFromParams = params.get('companionUrl');
  const userUrlFromParams = params.get('userUrl');
  const [profile, setProfile] = useState<Profile | null>(null);

  const [mood, setMood] = useState<MoodState>(null); // This will be populated by sessionStorage
  const [showExitMoodCheckIn, setShowExitMoodCheckIn] = useState(false);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [isTyping, setIsTyping] = useState(false);

  const handleNavigation = (screen: string) => {
    // The "End Chat" button in the sidebar calls onNavigate('home').
    // We'll use this specific string to trigger the exit mood check-in.
    if (screen === 'home') {
      setShowExitMoodCheckIn(true);
      return;
    }

    // For all other navigation events, navigate directly without a mood check.
    switch (screen) {
      case 'summary':
        router.push('/chat/summary');
        break;
      case '/': // The "Home" button in the Navbar calls onNavigate('/')
        router.push('/');
        break;
      case 'profile':
        router.push(`/profile?convo=${conversationId}`);
        break;
      case 'settings':
        router.push(`/settings?convo=${conversationId}`);
        break;
      case "endchat":
        handleEndChat();
      break;
      default:
        console.log(`Navigate to: ${screen}`);
    }
  };

  const completeExit = async (finalMood?: MoodData) => {
    if (finalMood && conversationId) {
      console.log('Mood after chat:', finalMood);
      try {
        const { error } = await supabase.from('conversations').update({ final_mood: finalMood }).eq('id', conversationId);
        if (error) throw error;
        console.log('Saved final mood to conversation:', conversationId);
      } catch (e) {
        console.error('Failed to save final mood:', e);
      }
    }
    sessionStorage.removeItem(MOOD_SESSION_KEY);
    router.push('/');
  };

  const handleExitMoodComplete = (moodData: MoodData) => {
    setShowExitMoodCheckIn(false);
    completeExit(moodData);
  };

  const handleExitSkip = () => {
    setShowExitMoodCheckIn(false);
    completeExit();
  };

  // Fetch profile to get avatar URLs
  useEffect(() => {
    const fetchProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, username, rpm_user_url, rpm_companion_url')
          .eq('id', user.id)
          .single();
        
        if (error) {
          console.error('Error fetching profile', error);
        } else if (data) {
          setProfile(data);
        }
      }
    };
    fetchProfile();
  }, []);

  // Load initial mood from session storage if it exists from the homepage flow.
  useEffect(() => {
    const storedMood = sessionStorage.getItem(MOOD_SESSION_KEY);
    if (storedMood) {
      try {
        const parsed = JSON.parse(storedMood);
        if (parsed.timestamp) parsed.timestamp = new Date(parsed.timestamp);
        setMood(parsed);
      } catch {
        setMood({ skipped: true, timestamp: new Date() });
      }
    }
  }, []);
  
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

  // to change "ongoing to ended" status on End Chat
  async function handleEndChat() {
  try {
    // Mark it as saved in DB if we have an id
    if (conversationId) {
      await endConversation(conversationId);
    }
    // Go to Profile → Saved tab
    router.push("/profile?tab=saved");
  } catch (e) {
    console.error("Failed to end chat:", e);
    // optional: toast error
  }
}
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

    if (text.trim().toLowerCase() === 'exit chat') {
      setShowExitMoodCheckIn(true);
      return;
    }
    if (!conversationId) return; // anonymous: no DB writes

    const tempUserId = `temp-user-${Date.now()}`;
    const tempBotId = `temp-bot-${Date.now()}`;

    // The AI reply can be fetched while the user message is being saved.
    // We show the typing indicator during this process.
    setIsTyping(true);
    const assistantTextPromise = getAdamReply(text);

    const optimisticUserMessage: MessageRow = {
      id: tempUserId,
      conversation_id: conversationId,
      sender_id: 'me',
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
      status: 'sending',
    };

    // Add the user's message to the UI immediately.
    setMessages(prev => [...prev, optimisticUserMessage]);

    try {
      // Persist the user message and wait for the AI's reply.
      const [savedUser, assistantText] = await Promise.all([
        sendUserMessage(conversationId, text),
        assistantTextPromise,
      ]);

      // Bot is no longer "typing" once we have the text.
      setIsTyping(false);

      // Update the user message from temp to saved.
      setMessages(prev => {
        const withoutTemp = prev.filter(m => m.id !== tempUserId);
        if (!withoutTemp.some(m => m.id === savedUser.id)) {
          withoutTemp.push({ ...savedUser, status: 'sent' });
        }
        return withoutTemp;
      });

      // Add optimistic bot message and persist it.
      const optimisticBotMessage: MessageRow = {
        id: tempBotId,
        conversation_id: conversationId,
        sender_id: 'bot',
        role: 'assistant',
        content: assistantText,
        created_at: new Date().toISOString(),
        status: 'sending',
      };
      setMessages(prev => [...prev, optimisticBotMessage]);

      const savedBot = await fetch('/api/assistant-message', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ conversationId, content: assistantText }) }).then(res => res.json());

      setMessages(prev => {
        const withoutTemp = prev.filter(m => m.id !== tempBotId);
        if (savedBot?.id && !withoutTemp.some(m => m.id === savedBot.id)) {
          withoutTemp.push({ ...savedBot, status: 'sent' });
        }
        return withoutTemp;
      });
    } catch (e) {
      console.error('send failed:', e);
      // If anything fails, mark the optimistic messages as 'failed'.
      setMessages(prev => prev.map(m => (m.id === tempUserId || m.id === tempBotId ? { ...m, status: 'failed' } : m)));
      setIsTyping(false);
    }
  };

  const userAvatar = useMemo(() => {
    const url = userUrlFromParams || profile?.rpm_user_url;
    if (url) {
      return {
        name: 'User',
        type: 'custom' as const,
        url: url,
      };
    }
    // Fallback for anonymous user without a created avatar
    return {
      name: 'User',
      type: 'default' as const,
      url: null,
    };
  }, [profile, userUrlFromParams]);

  const companionAvatar = useMemo(() => {
    if (companionUrlFromParams) {
      return {
        name: 'Custom Companion',
        type: 'custom' as const,
        url: companionUrlFromParams,
      };
    }
    if (profile?.rpm_companion_url) {
      return {
        name: 'Custom Companion',
        type: 'custom' as const,
        url: profile.rpm_companion_url,
      };
    }
    // Default companion
    return {
      name: 'Adam',
      type: 'default' as const,
      url: "https://models.readyplayer.me/68be69db5dc0cec769cfae75.glb",
    };
  }, [profile, companionUrlFromParams]);

  const chatInterfaceMood = useMemo(() => {
    if (mood && 'feeling' in mood) {
      return mood;
    }
    return null;
  }, [mood]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-100 via-pink-50 to-blue-100">
      {showExitMoodCheckIn && (
        <MoodCheckIn
          title="How are you feeling now? ✨"
          onComplete={handleExitMoodComplete}
          onSkip={handleExitSkip}
        />
      )}

      <ChatInterfaceScreen
        onNavigate={handleNavigation}
        chatMode="avatar"
        user={profile ? { id: profile.id, username: profile.username || 'User', avatar: userAvatar } : { id: 'anon', username: 'You', avatar: userAvatar }}
        companionAvatar={companionAvatar}
        currentMood={chatInterfaceMood}
        onSend={handleSend}
        messages={messages}
        isTyping={isTyping}
      />
    </div>
  );
}
