'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { ChatInterfaceScreen } from '../../../components/ChatInterfaceScreen';
import MoodCheckIn from '../../../components/MoodCheckIn';
import { sendUserMessage } from '@/lib/messages';
import { useValidatedRpmGlb } from '@/lib/rpm';

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

// Hardcoded companion choices (Adam/Eve)
const COMPANIONS = {
  ADAM: { name: 'Adam', url: 'https://models.readyplayer.me/68be69db5dc0cec769cfae75.glb' },
  EVE:  { name: 'Eve',  url: 'https://models.readyplayer.me/68be6a2ac036016545747aa9.glb' },
} as const;

/* ---------- Deterministic ordering helpers ---------- */
function sortMsgs(a: MessageRow, b: MessageRow) {
  if (a.created_at === b.created_at) {
    // Supabase ids are strings; compare numerically when possible, else lexically
    const ai = Number(a.id);
    const bi = Number(b.id);
    if (!Number.isNaN(ai) && !Number.isNaN(bi)) return ai - bi;
    return a.id.localeCompare(b.id);
  }
  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
}

function upsertAndSort(prev: MessageRow[], next: MessageRow) {
  const exists = prev.some((m) => m.id === next.id);
  const arr = exists ? prev.map((m) => (m.id === next.id ? next : m)) : [...prev, next];
  return arr.slice().sort(sortMsgs);
}

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

  /* ---------- Navigation / Exit ---------- */
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

  /* ---------- Profile ---------- */
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

  /* ---------- Mood (entry from session storage) ---------- */
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

  /* ---------- Messages (initial load + realtime) ---------- */
  useEffect(() => {
    if (!conversationId) return;
    let mounted = true;

    (async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('id, conversation_id, sender_id, role, content, created_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true }) // chronological
        .order('id',         { ascending: true }) // TIE-BREAK when created_at is equal
        .limit(200);
      if (!mounted) return;
      if (error) {
        console.error('Initial messages fetch failed:', error);
        return;
      }
      setMessages((data ?? []).slice().sort(sortMsgs));
    })();

    // Realtime inserts — upsert + sort so order is always correct
    const ch = supabase
      .channel(`msgs:${conversationId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const m = payload.new as MessageRow;
          setMessages((prev) => upsertAndSort(prev, m));
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(ch);
    };
  }, [conversationId]);

  /* ---------- Anonymous/Temp avatar fallback ---------- */
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
          setProfile((p) =>
            p ?? { id: 'anon', username: 'You', rpm_user_url: json.rpm_url, rpm_companion_url: null }
          );
        }
      } catch (e) {
        console.error('Failed to fetch temporary avatar:', e);
      }
    })();
  }, [conversationId, sessionIdFromParams, userUrlFromParams, profile?.rpm_user_url]);

  /* ---------- Model call stub ---------- */
  async function getAdamReply(userText: string): Promise<string> {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ conversationId, userMessage: userText }),
      // POSTs aren't cached, so no-store is not required here
    });

    const raw = await res.text();
    console.log('CHAT RAW RESPONSE:', raw);
    if (!res.ok) return "Sorry, I couldn't process that just now.";

    const data = JSON.parse(raw);
    return data.answer ?? "Sorry, I couldn't find enough info to answer.";
  }

  /* ---------- Send flow (optimistic + replace + sort) ---------- */
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

    // Optimistic user message
    const optimisticUserMessage: MessageRow = {
      id: tempUserId,
      conversation_id: conversationId,
      sender_id: 'me',
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
      status: 'sending',
    };
    setMessages((prev) => upsertAndSort(prev, optimisticUserMessage));

    try {
      const [savedUser, assistantText] = await Promise.all([
        sendUserMessage(conversationId, text),
        assistantTextPromise,
      ]);

      setIsTyping(false);

      // Replace optimistic user → saved user
      setMessages((prev) => {
        const withoutTemp = prev.filter((m) => m.id !== tempUserId);
        if (!withoutTemp.some((m) => m.id === savedUser.id)) {
          return upsertAndSort(withoutTemp, { ...savedUser, status: 'sent' });
        }
        return withoutTemp.slice().sort(sortMsgs);
      });

      // Optimistic assistant message
      const optimisticBotMessage: MessageRow = {
        id: tempBotId,
        conversation_id: conversationId,
        sender_id: 'bot',
        role: 'assistant',
        content: assistantText,
        created_at: new Date().toISOString(),
        status: 'sending',
      };
      setMessages((prev) => upsertAndSort(prev, optimisticBotMessage));

      // Persist assistant message to DB, then replace optimistic
      const savedBot = await fetch('/api/assistant-message', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ conversationId, content: assistantText }),
      }).then(async (res) => {
        if (!res.ok) throw new Error(await res.text());
        return res.json();
      });

      setMessages((prev) => {
        const withoutTemp = prev.filter((m) => m.id !== tempBotId);
        if (savedBot?.id && !withoutTemp.some((m) => m.id === savedBot.id)) {
          return upsertAndSort(withoutTemp, { ...savedBot, status: 'sent' });
        }
        return withoutTemp.slice().sort(sortMsgs);
      });

    } catch (e) {
      console.error('send failed:', e);
      setIsTyping(false);
      setMessages((prev) =>
        prev
          .map((m) =>
            m.id === tempUserId || m.id === tempBotId ? { ...m, status: 'failed' } : m
          )
          
      );
    }
  };

  /* ---------- Avatars (normalize & validate .glb) ---------- */
  type AvatarShape = { name: string; type: 'custom' | 'default'; url: string | null };

  const rawUser = userUrlFromParams || profile?.rpm_user_url || tempUserUrl;
  const userGlb = useValidatedRpmGlb(rawUser);

  const key = (companionNameFromParams || 'ADAM').toUpperCase() as 'ADAM' | 'EVE';
  const fallbackComp = COMPANIONS[key] ?? COMPANIONS.ADAM;

  const rawComp =
    companionUrlFromParams ||
    profile?.rpm_companion_url ||
    fallbackComp.url;

  const compGlb = useValidatedRpmGlb(rawComp);

  const userAvatar: AvatarShape = {
    name: profile?.username || 'You',
    type: rawUser ? 'custom' : 'default',
    url: userGlb,
  };

  const companionAvatar: AvatarShape = {
    name: companionNameFromParams || (profile?.rpm_companion_url ? 'Custom Companion' : fallbackComp.name),
    type: (companionUrlFromParams || profile?.rpm_companion_url) ? 'custom' : 'default',
    url: compGlb,
  };

  /* ---------- Render ---------- */
  const chatInterfaceMood = useMemo(() => {
    if (mood && 'feeling' in mood) return mood;
    return null;
  }, [mood]);

  // Optional extra safety: always pass sorted messages to the UI
  const sortedMessages = useMemo(() => messages.slice().sort(sortMsgs), [messages]);

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
        messages={sortedMessages}
        isTyping={isTyping}
      />
    </div>
  );
}
