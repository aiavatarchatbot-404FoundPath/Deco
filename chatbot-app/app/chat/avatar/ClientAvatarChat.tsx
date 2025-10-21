'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { ChatInterfaceScreen } from '../../../components/ChatInterfaceScreen';
import MoodCheckIn from '../../../components/MoodCheckIn';
import AnonymousExitWarning from '../../../components/chat/AnonymousExitWarning';
//import { sendUserMessage } from '@/lib/messages';
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
  const ta = new Date(a.created_at).getTime();
  const tb = new Date(b.created_at).getTime();
  if (ta !== tb) return ta - tb;

  // same timestamp → user above assistant, system last
  const rank = (r: MessageRow['role']) => (r === 'user' ? 0 : r === 'assistant' ? 1 : 2);
  const rdiff = rank(a.role) - rank(b.role);
  if (rdiff !== 0) return rdiff;

  // sending before sent to keep optimistic bubble stable
  const sa = a.status === 'sending' ? 0 : 1;
  const sb = b.status === 'sending' ? 0 : 1;
  if (sa !== sb) return sa - sb;

  // final tie-breaker: id lexicographic
  return (a.id || '').localeCompare(b.id || '');
}


function upsertAndSort(prev: MessageRow[], next: MessageRow) {
  const exists = prev.some((m) => m.id === next.id);
  const arr = exists ? prev.map((m) => (m.id === next.id ? next : m)) : [...prev, next];
  return arr.slice().sort(sortMsgs);
}

export default function ClientAvatarChat() {
  const router = useRouter();
  const params = useSearchParams();

  // Reset any global loading states when component mounts
  useEffect(() => {
    // This helps clear loading states from previous pages
    const timer = setTimeout(() => {
      // If there are any global loading states, they should be cleared here
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('resetGlobalLoading'));
      }
    }, 100);
    
    return () => clearTimeout(timer);
  }, []);

  // URL params
  const conversationId = params.get('convo');        // UUID or null
  const sessionIdFromParams = params.get('sid');     // anon session id
  const companionUrlFromParams = params.get('companionUrl');
  const companionNameFromParams = params.get('companionName');
  const userUrlFromParams = params.get('userUrl');

  const [profile, setProfile] = useState<Profile | null>(null);
  const [mood, setMood] = useState<MoodState>(null);
  const [showExitMoodCheckIn, setShowExitMoodCheckIn] = useState(false);
  const [showEntryMoodCheckIn, setShowEntryMoodCheckIn] = useState(false);
  const [showAnonymousExitWarning, setShowAnonymousExitWarning] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const [messageCount, setMessageCount] = useState(0);
  const [convStartedAt, setConvStartedAt] = useState<Date | null>(null);
  const [convEndedAt, setConvEndedAt] = useState<Date | null>(null);
  const [accumulatedSeconds, setAccumulatedSeconds] = useState(0);
  const [activeSince, setActiveSince] = useState<Date | null>(null);

  // local-only timer for anonymous sessions
  const [localActiveSince, setLocalActiveSince] = useState<Date | null>(null);
  const [localAccumulated, setLocalAccumulated] = useState(0);

  // If we fetch a temp avatar, stash it here (for anonymous users)
  const [tempUserUrl, setTempUserUrl] = useState<string | null>(null);

  /* ---------- Navigation / Exit ---------- */
  const handleNavigation = (screen: string) => {
    if (screen === 'home' || screen === 'endchat') {
      if (!isAuthenticated) {
         setShowAnonymousExitWarning(true);
        return;
      }
      setShowExitMoodCheckIn(true);
      return;
    }
    switch (screen) {
      case 'end-and-summary':
        (async () => {
          try {
            await pauseTimer();
            if (conversationId) {
              await supabase
                .from('conversations')
                .update({ status: 'ended', ended_at: new Date().toISOString() })
                .eq('id', conversationId);
              router.push(`/chat/summary?convo=${conversationId}`);
            } else {
              router.push('/chat/summary');
            }
          } catch (e) {
            console.error('Failed to end-and-summary:', e);
            router.push('/chat/summary');
          }
        })();
        break;
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
      case 'login':
        router.push('/login');
        break;
      default:
        console.log(`Navigate to: ${screen}`);
    }
  };

   useEffect(() => {
      if (!conversationId) return;
      (async () => {
        try {
          await supabase
            .from("conversations")
            .update({ chat_mode: "avatar" })
            .eq("id", conversationId)
            .is("chat_mode", null);
        } catch {}
      })();
    }, [conversationId]);

  const completeExit = async (finalMood?: MoodData) => {
    try {
      await pauseTimer(); // finalize time first
    if (conversationId) {
      const patch: any = { status: 'ended', ended_at: new Date().toISOString() };
      if (finalMood) patch.final_mood = finalMood;
      await supabase.from('conversations').update(patch).eq('id', conversationId);}
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

  const handleAnonymousExitContinue = () => {
    setShowAnonymousExitWarning
    
    
    
    (false);
    setShowExitMoodCheckIn(true);
  };

  const handleAnonymousExitClose = () => {
    setShowAnonymousExitWarning(false);
  };

  const handleAnonymousCreateAccount = () => {
    setShowAnonymousExitWarning(false);
    const current = typeof window !== 'undefined'
      ? `${window.location.pathname}${window.location.search}`
      : '/chat/avatar';
    router.push(`/login?redirect=${encodeURIComponent(current)}`);
  };

  const persistMoodState = (state: MoodState) => {
    if (typeof window === 'undefined') return;
    if (!state) {
      sessionStorage.removeItem(MOOD_SESSION_KEY);
      return;
    }
    const payload = {
      ...state,
      timestamp:
        state.timestamp instanceof Date ? state.timestamp.toISOString() : state.timestamp,
    };
    sessionStorage.setItem(MOOD_SESSION_KEY, JSON.stringify(payload));
  };
  
  useEffect(() => {
  (async () => {
    if (!conversationId) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) return;

    try {
      await fetch("/api/conversations/ensure-ownership", {
        method: "POST",
        headers: { "content-type": "application/json", "x-user-id": user.id },
        body: JSON.stringify({ conversationId }),
      });
    } catch {}
  })();
}, [conversationId]);


  const handleEntryMoodComplete = async (moodData: MoodData) => {
    const record: MoodState = { ...moodData, timestamp: new Date() };
    setMood(record);
    persistMoodState(record);
    setShowEntryMoodCheckIn(false);
    // Persist initial mood to the conversation (if we have an id)
    try {
      if (conversationId) {
        await supabase
          .from('conversations')
          .update({ initial_mood: moodData })
          .eq('id', conversationId);
      }
    } catch (e) {
      console.warn('initial_mood update failed (non-fatal):', e);
    }
  };
  type Persona = 'neutral' | 'adam' | 'eve' | 'custom';

function personaToCompanion(p?: Persona) {
  if (p === 'adam') return { name: 'Adam', url: COMPANIONS.ADAM.url } as const;
  if (p === 'eve')  return { name: 'Eve',  url: COMPANIONS.EVE.url }  as const;
  return null;
}

// NEW: conversation meta
type ConvoMeta = { id: string; persona: Persona | null; style_tokens?: any | null };
const [convoMeta, setConvoMeta] = useState<ConvoMeta | null>(null);

  const handleEntryMoodSkip = () => {
    const skippedRecord: MoodState = { skipped: true, timestamp: new Date() };
    setMood(skippedRecord);
    persistMoodState(skippedRecord);
    setShowEntryMoodCheckIn(false);
  };
  useEffect(() => {
  if (!conversationId) {
    setConvoMeta(null);
    return;
  }
  (async () => {
    const { data, error } = await supabase
      .from('conversations')
      .select('id, persona, style_tokens')
      .eq('id', conversationId)
      .single();
    if (!error && data) {
      setConvoMeta({
        id: data.id,
        persona: (data.persona ?? null) as Persona | null,
        style_tokens: data.style_tokens ?? null,
      });
    }
  })();
}, [conversationId]);

useEffect(() => {
  if (!conversationId) return;
  if (!convoMeta) return;
  if (convoMeta.persona) return; // already set, do nothing

  // Derive from URL if present, else from profile fallback, else default ADAM
  const fromUrl = (companionNameFromParams || '').toUpperCase();
  const derived: Persona =
    fromUrl === 'EVE' ? 'eve'
    : fromUrl === 'ADAM' ? 'adam'
    : (profile?.rpm_companion_url === COMPANIONS.EVE.url ? 'eve'
      : 'adam');

  (async () => {
    const { error } = await supabase
      .from('conversations')
      .update({ persona: derived })
      .eq('id', conversationId);
    if (!error) {
      setConvoMeta((prev) => (prev ? { ...prev, persona: derived } : prev));
    }
  })();
}, [conversationId, convoMeta, companionNameFromParams, profile?.rpm_companion_url]);


  /* ---------- Profile ---------- */
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setIsAuthenticated(!!user);
      if (!user) {
        setProfile(null);
        return;
      }
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
    if (typeof window === 'undefined') return;
    const stored = sessionStorage.getItem(MOOD_SESSION_KEY);
    if (!stored) {
      setShowEntryMoodCheckIn(true);
      return;
    }
    try {
      const parsed = JSON.parse(stored);
      if (parsed?.timestamp) {
        parsed.timestamp = new Date(parsed.timestamp);
      }
      setMood(parsed as MoodState);
      setShowEntryMoodCheckIn(false);
    } catch {
      sessionStorage.removeItem(MOOD_SESSION_KEY);
      setShowEntryMoodCheckIn(true);
    }
  }, []);
  async function callChatRoute(conversationId: string, userText: string, uid?: string | null) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(uid ? { 'x-user-id': uid } : {}),
    },
    body: JSON.stringify({ conversationId, userMessage: userText }),
  });

  const raw = await res.text();
  if (!res.ok) {
    console.error('CHAT error:', raw);
    throw new Error(raw || 'chat error');
  }
  return JSON.parse(raw) as {
    answer: string;
    rows: { user?: MessageRow; assistant?: MessageRow };
  };
}

  // ensure we have a start time for anon so the sidebar shows time right away
  useEffect(() => {
  if (!isAuthenticated && !convStartedAt) {
    setConvStartedAt(new Date());
  }
}, [isAuthenticated, convStartedAt]);
  

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

  /* ---------- Session time & message count ---------- */
  // Fetch conversation timestamps
  useEffect(() => {
  if (!conversationId || !isAuthenticated) return;  // ⬅️ skip for anon
  (async () => {
    const { data, error } = await supabase
      .from('conversations')
      .select('created_at, ended_at, accumulated_seconds, active_since')
      .eq('id', conversationId)
      .single();
    if (!error && data) {
      setConvStartedAt(new Date(data.created_at));
      setConvEndedAt(data.ended_at ? new Date(data.ended_at) : null);
      setAccumulatedSeconds(data.accumulated_seconds ?? 0);
      setActiveSince(data.active_since ? new Date(data.active_since) : null);
    }
  })();
}, [conversationId, isAuthenticated]);


   // Drive the live session timer
  useEffect(() => {
  // For anon, start ticking as soon as convStartedAt exists (we set it above)
  if (!convStartedAt) return;

  const tick = () => {
    if (isAuthenticated) {
      const live = activeSince
        ? Math.max(0, Math.floor((Date.now() - activeSince.getTime()) / 1000))
        : 0;
      setSessionSeconds(accumulatedSeconds + live);
    } else {
      const live = localActiveSince
        ? Math.max(0, Math.floor((Date.now() - localActiveSince.getTime()) / 1000))
        : 0;
      setSessionSeconds(localAccumulated + live);
    }
  };

  tick();
  const id = setInterval(tick, 1000);
  return () => clearInterval(id);
}, [
  convStartedAt,
  isAuthenticated,
  // DB-backed
  activeSince,
  accumulatedSeconds,
  // anon-backed
  localActiveSince,
  localAccumulated,
]);


  useEffect(() => {
  if (!conversationId) return;

  // resume on mount for both modes
  resumeTimer();

  const onVis = () => {
    if (document.hidden) pauseTimer();
    else resumeTimer();
  };
  document.addEventListener('visibilitychange', onVis);

  return () => {
    document.removeEventListener('visibilitychange', onVis);
    pauseTimer();
  };
}, [conversationId, isAuthenticated, activeSince, accumulatedSeconds, localActiveSince, localAccumulated]);

  async function resumeTimer() {
  if (!conversationId) return;

  if (!isAuthenticated) {
    // local-only: don't touch DB
    if (!localActiveSince) setLocalActiveSince(new Date());
    return;
  }

  // logged-in: DB-backed
  if (activeSince) return;
  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from('conversations')
    .update({ active_since: nowIso })
    .eq('id', conversationId);
  if (!error) setActiveSince(new Date(nowIso));
}

async function pauseTimer() {
  if (!conversationId) return;

  if (!isAuthenticated) {
    // local-only: bank into localAccumulated
    if (!localActiveSince) return;
    const deltaSec = Math.max(0, Math.floor((Date.now() - localActiveSince.getTime()) / 1000));
    setLocalAccumulated((prev) => prev + deltaSec);
    setLocalActiveSince(null);
    return;
  }

  // logged-in: DB-backed
  if (!activeSince) return;
  const deltaSec = Math.max(0, Math.floor((Date.now() - activeSince.getTime()) / 1000));
  const nextAccum = accumulatedSeconds + deltaSec;

  const { error } = await supabase
    .from('conversations')
    .update({ accumulated_seconds: nextAccum, active_since: null })
    .eq('id', conversationId);

  if (!error) {
    setAccumulatedSeconds(nextAccum);
    setActiveSince(null);
  }
}


  // Keep message count synced with DB-backed messages (only user queries)
  useEffect(() => {
  const onlyUserMsgs = messages.filter((m) => m.role === "user").length;
  setMessageCount(onlyUserMsgs);
  }, [messages]);

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

  // get the current uid (works for anon or logged-in)
  const { data: { user } } = await supabase.auth.getUser();
  const uid = user?.id || null;

  // optimistic user bubble
  const tempId = `temp-${Date.now()}`;
  const optimisticUserMessage: MessageRow = {
    id: tempId,
    conversation_id: conversationId,
    sender_id: uid || 'me',
    role: 'user',
    content: text,
    created_at: new Date().toISOString(),
    status: 'sending',
  };
  setMessages((prev) => upsertAndSort(prev, optimisticUserMessage));
  setIsTyping(true);

  try {
    // single server call — writes BOTH rows and returns them
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(uid ? { 'x-user-id': uid } : {}),
      },
      body: JSON.stringify({ conversationId, userMessage: text }),
    });

    const raw = await res.text();
    if (!res.ok) throw new Error(raw || 'chat error');
    const data = JSON.parse(raw) as {
      answer: string;
      rows: { user?: MessageRow; assistant?: MessageRow };
    };
    

    setIsTyping(false);

    // replace optimistic + upsert assistant row
    setMessages((prev) => {
      let out = prev.filter((m) => m.id !== tempId);

      const savedUser = data.rows.user;
      if (savedUser && !out.some((m) => m.id === savedUser.id)) {
        out = upsertAndSort(out, { ...savedUser, status: 'sent' });
      }

      const savedBot = data.rows.assistant;
      if (savedBot && !out.some((m) => m.id === savedBot.id)) {
        out = upsertAndSort(out, { ...savedBot, status: 'sent' });
      }

      return out;
    });
  } catch (e) {
    console.error('send failed:', e);
    setIsTyping(false);
    setMessages((prev) =>
      prev.map((m) => (m.id === tempId ? { ...m, status: 'failed' } : m))
    );
  }
};


 // ---------- Avatars (normalize & validate .glb) ----------
type AvatarShape = { name: string; type: 'custom' | 'default'; url: string | null };

const rawUser = userUrlFromParams || profile?.rpm_user_url || tempUserUrl;
const userGlb = useValidatedRpmGlb(rawUser);

// 1) If convo has persona, that wins
const convPick = personaToCompanion(convoMeta?.persona ?? undefined);

// 2) else fall back to explicit URL param, then name param, then profile, then default
const key = (companionNameFromParams || 'ADAM').toUpperCase() as 'ADAM' | 'EVE';
const fallbackComp = COMPANIONS[key] ?? COMPANIONS.ADAM;

const namedCompanionUrl = companionNameFromParams ? (COMPANIONS[key]?.url ?? null) : null;

const rawComp =
  convPick?.url ||                     // ← primary (per-conversation)
  companionUrlFromParams ||
  namedCompanionUrl ||
  profile?.rpm_companion_url ||
  fallbackComp.url;

const compGlb = useValidatedRpmGlb(rawComp);

const userAvatar: AvatarShape = {
  name: profile?.username || 'You',
  type: rawUser ? 'custom' : 'default',
  url: userGlb,
};

const companionAvatar: AvatarShape = {
  name: convPick?.name ||
        companionNameFromParams ||
        (() => {
          if (profile?.rpm_companion_url === COMPANIONS.ADAM.url) return 'Adam';
          if (profile?.rpm_companion_url === COMPANIONS.EVE.url)  return 'Eve';
          return fallbackComp.name;
        })(),
  type: (convPick?.url || companionUrlFromParams || profile?.rpm_companion_url) ? 'custom' : 'default',
  url: compGlb,
};


  // If the user logs in mid-chat and we have an explicit companionName in the URL,
  // sync that selection into their profile so it persists.
  useEffect(() => {
    (async () => {
      if (!profile?.id) return;
      if (!companionNameFromParams) return;
      const desiredUrl = COMPANIONS[key]?.url;
      if (!desiredUrl) return;
      if (profile.rpm_companion_url === desiredUrl) return;
      try {
        const { error } = await supabase
          .from('profiles')
          .update({ rpm_companion_url: desiredUrl })
          .eq('id', profile.id);
        if (!error) {
          setProfile((p) => (p ? { ...p, rpm_companion_url: desiredUrl } : p));
        }
      } catch (e) {
        console.error('Failed to sync companion selection to profile:', e);
      }
    })();
  // include key so switching name in URL is respected
  }, [profile?.id, profile?.rpm_companion_url, companionNameFromParams, key]);

  /* ---------- Render ---------- */
  const chatInterfaceMood = useMemo(() => {
    if (mood && 'feeling' in mood) return mood;
    return null;
  }, [mood]);

  // Optional extra safety: always pass sorted messages to the UI
  const sortedMessages = useMemo(() => messages.slice().sort(sortMsgs), [messages]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-100 via-pink-50 to-blue-100">
      {showAnonymousExitWarning && (
        <AnonymousExitWarning
          onContinue={handleAnonymousExitContinue}
          onCreateAccount={handleAnonymousCreateAccount}
          onClose={handleAnonymousExitClose}
        />
      )}

      {showEntryMoodCheckIn && (
        <MoodCheckIn onComplete={handleEntryMoodComplete} onSkip={handleEntryMoodSkip} />
      )}

      {showExitMoodCheckIn && (
        <MoodCheckIn
          title="How are you feeling now? ✨"
          previousMood={mood && 'feeling' in mood ? { feeling: mood.feeling, intensity: mood.intensity } : null}
          confirmLabel="Save & End Chat"
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
        stats={{ sessionSeconds, messageCount }}
      />
    </div>
  );
}
