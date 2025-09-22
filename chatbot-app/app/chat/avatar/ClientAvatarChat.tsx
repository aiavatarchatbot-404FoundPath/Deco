'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { ChatInterfaceScreen } from '../../../components/ChatInterfaceScreen';
import MoodCheckIn from '../../../components/MoodCheckIn';
import { sendUserMessage } from '@/lib/messages';

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

type MoodState =
  | (MoodData & { timestamp: Date })
  | { skipped: true; timestamp: Date }
  | null;

const MOOD_SESSION_KEY = 'moodCheckedIn:v1';

// Ensure we always hand a .glb to the viewer
const ensureGlb = (u?: string | null) =>
  !u ? null : u.endsWith('.glb') ? u : `${u}.glb`;

// Hardcoded companion choices (Adam/Eve)
const COMPANIONS = {
  ADAM: { name: 'Adam', url: 'https://models.readyplayer.me/68be69db5dc0cec769cfae75.glb' },
  EVE:  { name: 'Eve',  url: 'https://models.readyplayer.me/68be6a2ac036016545747aa9.glb' },
} as const;

export default function ClientAvatarChat() {
  const router = useRouter();
  const params = useSearchParams();

  // URL params
  const conversationId = params.get('convo');        // UUID or null
  const sessionIdFromParams = params.get('sid');     // anon session id
  const companionUrlFromParams = params.get('companionUrl');
  const companionNameFromParams = params.get('companionName');
  const userUrlFromParams = params.get('userUrl');

  const [profile, setProfile] = useState<Profile | null>(null);
  const [mood, setMood] = useState<MoodState>(null);
  const [showExitMoodCheckIn, setShowExitMoodCheckIn] = useState(false);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [isTyping, setIsTyping] = useState(false);

  // If we fetch a temp avatar, stash it here (for anonymous users)
  const [tempUserUrl, setTempUserUrl] = useState<string | null>(null);

  // ---------------- Nav / Exit ----------------
  const handleNavigation = (screen: string) => {
    if (screen === 'home') {
      setShowExitMoodCheckIn(true);
      return;
    }
    switch (screen) {
      case 'summary':
        router.push('/chat/summary');
        break;
      case '/':
        router.push('/');
        break;
      case 'profile':
        router.push(`/profile?convo=${conversationId ?? ''}`);
        break;
      case 'settings':
        router.push(`/settings?convo=${conversationId ?? ''}`);
        break;
      default:
        console.log(`Navigate to: ${screen}`);
    }
  };

  const completeExit = async (finalMood?: MoodData) => {
    try {
      if (conversationId) {
        const patch: any = {
          status: 'ended',
          ended_at: new Date().toISOString(),
        };
        if (finalMood) patch.final_mood = finalMood;

        const { error } = await supabase.from('conversations').update(patch).eq('id', conversationId);
        if (error) console.error('Failed to update conversation on exit:', error);
      }
    } catch (e) {
      console.error('Exit error:', e);
    } finally {
      sessionStorage.removeItem(MOOD_SESSION_KEY);
      router.push('/');
    }
  };

  const handleExitMoodComplete = (moodData: MoodData) => {
    setShowExitMoodCheckIn(false);
    completeExit(moodData);
  };
  const handleExitSkip = () => {
    setShowExitMoodCheckIn(false);
    completeExit();
  };

  // ---------------- Profile ----------------
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, rpm_user_url, rpm_companion_url')
        .eq('id', user.id)
        .single();
      if (error) {
        console.error('Error fetching profile', error);
        return;
      }
      if (data) setProfile(data);
    })();
  }, []);

  // ---------------- Mood (entry from session storage) ----------------
  useEffect(() => {
    const stored = sessionStorage.getItem(MOOD_SESSION_KEY);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored);
      if (parsed.timestamp) parsed.timestamp = new Date(parsed.timestamp);
      setMood(parsed);
    } catch {
      setMood({ skipped: true, timestamp: new Date() });
    }
  }, []);

  // ---------------- Messages (initial + realtime) ----------------
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

  // ---------------- Temp avatar fallback (anonymous) ----------------
  useEffect(() => {
    if (!conversationId || !sessionIdFromParams) return;

    const alreadyHasUrl = !!userUrlFromParams || !!profile?.rpm_user_url;
    if (alreadyHasUrl) return;

    (async () => {
      try {
        const q = new URLSearchParams({ conversationId, sessionId: sessionIdFromParams });
        const res = await fetch(`/api/temp-avatars?${q.toString()}`);
        if (!res.ok) return;
        const json = await res.json(); // { rpm_url, thumbnail } | null
        if (json?.rpm_url) {
          setTempUserUrl(json.rpm_url as string);
          // populate a lightweight profile so downstream UI has a name/id
          setProfile((p) =>
            p ?? { id: 'anon', username: 'You', rpm_user_url: json.rpm_url, rpm_companion_url: null }
          );
        }
      } catch (e) {
        console.error('Failed to fetch temporary avatar:', e);
      }
    })();
  }, [conversationId, sessionIdFromParams, userUrlFromParams, profile?.rpm_user_url]);

  // ---------------- AI stub (replace with your model) ----------------
  async function getAdamReply(_: string): Promise<string> {
    const canned = [
      "I hear you — that sounds like a lot to carry. What would help you feel a little safer right now?",
      'Thank you for sharing that. What support around you has felt helpful, even a little?',
      "That seems really tough. I'm here to listen. What would you like me to understand most about this?",
      "You're not alone. Would it help to break this down into smaller steps together?",
      "You're doing the right thing by talking about it. What might make the next hour a bit easier?",
    ];
    return canned[Math.floor(Math.random() * canned.length)];
  }

  // ---------------- Send flow ----------------
  const handleSend = async (text: string) => {
    if (!text.trim()) return;

    if (text.trim().toLowerCase() === 'exit chat') {
      setShowExitMoodCheckIn(true);
      return;
    }
    if (!conversationId) return;

    const tempUserId = `temp-user-${Date.now()}`;
    const tempBotId = `temp-bot-${Date.now()}`;

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
    setMessages((prev) => [...prev, optimisticUserMessage]);

    try {
      const [savedUser, assistantText] = await Promise.all([
        sendUserMessage(conversationId, text),
        assistantTextPromise,
      ]);

      setIsTyping(false);

      setMessages((prev) => {
        const withoutTemp = prev.filter((m) => m.id !== tempUserId);
        if (!withoutTemp.some((m) => m.id === savedUser.id)) {
          withoutTemp.push({ ...savedUser, status: 'sent' });
        }
        return withoutTemp;
      });

      const optimisticBotMessage: MessageRow = {
        id: tempBotId,
        conversation_id: conversationId,
        sender_id: 'bot',
        role: 'assistant',
        content: assistantText,
        created_at: new Date().toISOString(),
        status: 'sending',
      };
      setMessages((prev) => [...prev, optimisticBotMessage]);

      const savedBot = await fetch('/api/assistant-message', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ conversationId, content: assistantText }),
      }).then((res) => res.json());

      setMessages((prev) => {
        const withoutTemp = prev.filter((m) => m.id !== tempBotId);
        if (savedBot?.id && !withoutTemp.some((m) => m.id === savedBot.id)) {
          withoutTemp.push({ ...savedBot, status: 'sent' });
        }
        return withoutTemp;
      });
    } catch (e) {
      console.error('send failed:', e);
      setMessages((prev) =>
        prev.map((m) => (m.id === tempUserId || m.id === tempBotId ? { ...m, status: 'failed' } : m))
      );
      setIsTyping(false);
    }
  };

  // ---------------- Avatars (normalize to .glb) ----------------
type AvatarShape = { name: string; type: 'custom' | 'default'; url: string | null };

const toAvatar = (name: string, url: string | null): AvatarShape => ({
  name,
  type: url ? 'custom' : 'default',
  url,
});

const userAvatar = useMemo(() => {
  const raw = userUrlFromParams || profile?.rpm_user_url || tempUserUrl;
  const url = ensureGlb(raw);
  return toAvatar(profile?.username || 'You', url);
}, [profile?.username, profile?.rpm_user_url, userUrlFromParams, tempUserUrl]);

const companionAvatar = useMemo(() => {
  if (companionUrlFromParams) {
    return toAvatar(companionNameFromParams || 'Companion', ensureGlb(companionUrlFromParams));
  }
  if (profile?.rpm_companion_url) {
    return toAvatar('Custom Companion', ensureGlb(profile.rpm_companion_url));
  }
  const key = (companionNameFromParams || 'ADAM').toUpperCase() as 'ADAM' | 'EVE';
  const pick = COMPANIONS[key] ?? COMPANIONS.ADAM;
  return toAvatar(pick.name, pick.url);
}, [profile?.rpm_companion_url, companionUrlFromParams, companionNameFromParams]);

  // ---------------- Render ----------------
  const chatInterfaceMood = useMemo(() => {
  if (mood && 'feeling' in mood) return mood;
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
        user={
          profile
            ? { id: profile.id, username: profile.username || 'User', avatar: userAvatar }
            : { id: 'anon', username: 'You', avatar: userAvatar }
        }
        companionAvatar={companionAvatar}
        currentMood={chatInterfaceMood}
        onSend={handleSend}
        messages={messages}
        isTyping={isTyping}
      />
    </div>
  );
}
