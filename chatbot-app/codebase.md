# .gitignore

```
# See https://help.github.com/articles/ignoring-files/ for more about ignoring files.

# dependencies
/node_modules
/.pnp
.pnp.*
.yarn/*
!.yarn/patches
!.yarn/plugins
!.yarn/releases
!.yarn/versions

# testing
/coverage

# next.js
/.next/
/out/

# production
/build

# misc
.DS_Store
*.pem

# debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*
.pnpm-debug.log*

# env files (can opt-in for committing if needed)
.env*

# vercel
.vercel

# typescript
*.tsbuildinfo
next-env.d.ts

```

# app/api/assistant-message/route.ts

```ts
// app/api/assistant-message/route.ts
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

// Set this to the UUID of your bot user (adam@bot.local)
const BOT_USER_ID = process.env.BOT_USER_ID!;

export async function POST(req: Request) {
  try {
    const { conversationId, content } = await req.json();

    const { data, error } = await supabase
      .from('messages')
      .insert({
        client_id: crypto.randomUUID(),
        conversation_id: conversationId,
        sender_id: BOT_USER_ID,
        role: 'assistant',
        content
      })
      .select('id, conversation_id, sender_id, role, content, created_at')
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}

```

# app/api/conversations/route.ts

```ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const BOT_USER_ID = process.env.BOT_USER_ID!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Server-side Supabase client that reads cookies for current user
function getServerSupabase() {
  return createServerClient(SUPABASE_URL, SUPABASE_ANON, {
    cookies: {
      async get(name: string) {
        return (await cookies()).get(name)?.value;
      },
      set() {
        // no-op for API routes
      },
      remove() {
        // no-op for API routes
      },
    },
  });
}

export async function POST(req: Request) {
  try {
    if (!BOT_USER_ID) {
      return NextResponse.json({ error: 'BOT_USER_ID is not set' }, { status: 500 });
    }

    const body = (await req.json().catch(() => ({}))) as { title?: string };
    const title = body?.title;

    // Detect current user (if logged in)
    const supa = getServerSupabase();
    const { data: { user } } = await supa.auth.getUser();

    // Fallback to BOT_USER_ID when not logged in
    const createdBy = user?.id ?? BOT_USER_ID;

    // Use service-role client so anonymous inserts bypass RLS
    const { data, error } = await supabaseAdmin
      .from('conversations')
      .insert({
        created_by: createdBy,
        is_group: false,
        title: title ?? (user ? 'Chat' : 'Anonymous chat'),
      })
      .select('id')
      .single();

    if (error) throw error;

    return NextResponse.json({ id: data.id });
  } catch (e: any) {
    console.error('[conversations] POST error:', e?.message || e);
    return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 400 });
  }
}

```

# app/api/temp-avatars/promote/route.ts

```ts
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function POST(req: Request) {
  try {
    const { conversationId, sessionId, name } = await req.json();
    if (!conversationId || !sessionId) throw new Error('conversationId & sessionId required');

    const { data, error } = await supabase.rpc('promote_temporary_avatar', {
      _conversation_id: conversationId, _session_id: sessionId, _name: name ?? 'My Avatar'
    });
    if (error) throw error;
    return NextResponse.json({ companionId: data });
  } catch (e:any) { return NextResponse.json({ error: e.message }, { status: 400 }); }
}

```

# app/api/temp-avatars/route.ts

```ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs'; // avoid Edge so server env vars are available

export async function POST(req: Request) {
  try {
    const { conversationId, sessionId, rpmUrl, thumbnail, ownerId = null } = await req.json();

    if (!conversationId || !sessionId || !rpmUrl) {
      return NextResponse.json(
        { error: 'conversationId, sessionId, rpmUrl required' },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('temporary_avatars')
      .insert({
        conversation_id: conversationId,
        session_id: sessionId,
        rpm_url: rpmUrl,
        thumbnail: thumbnail ?? null,
        owner_id: ownerId,
      })
      .select('id, conversation_id, session_id, rpm_url, thumbnail, created_at')
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (e: any) {
    console.error('[temp-avatars POST] error:', e?.message || e);
    return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 400 });
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const conversationId = url.searchParams.get('conversationId');
    const sessionId = url.searchParams.get('sessionId');
    if (!conversationId || !sessionId) {
      return NextResponse.json(
        { error: 'conversationId & sessionId required' },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('latest_temporary_avatar') // the view
      .select('rpm_url, thumbnail, created_at')
      .eq('conversation_id', conversationId)
      .eq('session_id', sessionId)
      .maybeSingle();

    if (error) throw error;
    return NextResponse.json(data ?? null);
  } catch (e: any) {
    console.error('[temp-avatars GET] error:', e?.message || e);
    return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 400 });
  }
}

```

# app/avatarbuilder/page.tsx

```tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import Navbar from "../../components/Navbar";
import AvatarBuilderScreen from "../../components/AvatarBuilderScreen";
import { getOrCreateSessionId } from "@/lib/session";

type AvatarInput = { url: string; thumbnail?: string | null };

export default function AvatarBuilderPage() {
  const router = useRouter();

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // user’s own avatar that gets saved (via Supabase or temp)
  const [conversationId, setConversationId] = useState<string | null>(null);

  // NEW: which AI companion did the user pick? (hardcoded URLs later)
  const [companionChoice, setCompanionChoice] = useState<"ADAM" | "EVE">("ADAM");

  useEffect(() => {
    async function bootstrap() {
      try {
        // ---- load session & profile (your original logic) ----
        const { data: { session } } = await supabase.auth.getSession();
        const currentUser = session?.user ?? null;

        if (!currentUser) {
          setIsLoggedIn(false);
          setUser(null);
        } else {
          setIsLoggedIn(true);
          const { data: profile } = await supabase
            .from("profiles")
            .select(
              "id, username, full_name, avatar_url, session_mode, rpm_user_url, rpm_companion_url"
            )
            .eq("id", currentUser.id)
            .maybeSingle();

          if (profile) {
            setUser(profile);
          } else {
            setUser({
              id: currentUser.id,
              username: currentUser.email?.split("@")[0] || "User",
              rpm_user_url: null,
              rpm_companion_url: null,
            });
          }
        }

        // ---- always ensure a conversation (works for both anon & logged-in) ----
        const res = await fetch("/api/conversations", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title: "Avatar Builder" }),
        });
        const json = await res.json();
        if (res.ok && json?.id) {
          setConversationId(json.id as string);
        } else {
          console.error("Failed to create conversation:", json?.error || res.statusText);
        }
      } catch (err) {
        console.error("Error bootstrapping avatar builder:", err);
      } finally {
        setLoading(false);
      }
    }

    bootstrap();
  }, []);

  const handleNavigation = (screen: string) => {
    switch (screen) {
      case "settings":
        router.push("/settings");
        break;
      case "profile":
        router.push("/profile");
        break;
      case "home":
      case "/":
      case "welcome":
        router.push("/");
        break;
      case "chat":
        router.push("/chat/avatar");
        break;
      default:
        console.log("Navigate to:", screen);
    }
  };

  // SAVE user avatar (not the companion):
  // - Logged-in → write to profile
  // - Anonymous → POST to /api/temp-avatars with { conversationId, sessionId, rpmUrl, thumbnail }
  const handleSaveAvatar = useCallback(
    async (avatar: AvatarInput) => {
      try {
        const sid = getOrCreateSessionId();

        if (isLoggedIn && user?.id) {
          // Persist to profile
          const { error } = await supabase
            .from("profiles")
            .update({ rpm_user_url: avatar.url })
            .eq("id", user.id);
          if (error) throw error;

          setUser((prev: any) => (prev ? { ...prev, rpm_user_url: avatar.url } : prev));
        } else {
          // Anonymous: store TEMP row server-side so it can be auto-purged on end-chat
          if (!conversationId) {
            console.warn("No conversation yet; cannot save temporary avatar.");
            return;
          }
          const res = await fetch("/api/temp-avatars", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              conversationId,
              sessionId: sid,
              rpmUrl: avatar.url,
              thumbnail: avatar.thumbnail ?? null,
            }),
          });
          if (!res.ok) {
            const j = await res.json().catch(() => ({}));
            throw new Error(j?.error || "temp avatar save failed");
          }

          // echo for UI
          setUser((prev: any) =>
            prev ? { ...prev, rpm_user_url: avatar.url } : { rpm_user_url: avatar.url }
          );
        }
      } catch (e) {
        console.error("Save avatar failed:", e);
      }
    },
    [isLoggedIn, user, conversationId]
  );

  // If your builder lets the user tap "Adam" / "Eve", call this
  const handleSelectCompanion = useCallback((key: "ADAM" | "EVE") => {
    setCompanionChoice(key);
  }, []);

  // GO TO CHAT:
  // pass userUrl (from profile or temp), the companion *name* (ADAM/EVE), plus convo + sid.
  const handleNavigateToChat = useCallback(() => {
    const sid = getOrCreateSessionId();
    const params = new URLSearchParams();

    // User avatar (from profile or the local echo after temp save)
    if (user?.rpm_user_url) params.set("userUrl", user.rpm_user_url);

    // Tell chat which companion: ADAM or EVE (chat will map to a hardcoded URL)
    params.set("companionName", companionChoice);

    if (conversationId) params.set("convo", conversationId);
    params.set("sid", sid);

    const qs = params.toString();
    router.push(`/chat/avatar${qs ? `?${qs}` : ""}`);
  }, [user, companionChoice, conversationId, router]);

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div>
      <Navbar onNavigate={handleNavigation} isLoggedIn={isLoggedIn} />

      <AvatarBuilderScreen
        onNavigate={handleNavigation}
        onNavigateToChat={handleNavigateToChat}
        user={user}
        onSaveAvatar={handleSaveAvatar}
        onSelectCompanion={handleSelectCompanion} // This now correctly matches the updated AvatarBuilderScreenProps
      />
    </div>
  );
}

```

# app/chat/avatar/ClientAvatarChat.tsx

```tsx
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

```

# app/chat/avatar/cors.ts

```ts
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
```

# app/chat/avatar/index.ts

```ts
import { corsHeaders } from './cors';


// Define the Mood type (adjust values as needed)
type Mood = 'happy' | 'sad' | 'neutral' | 'angry' | 'excited';


// Define the structure of the webhook payload from Supabase
// initial_mood is set by the mood check-in component (see moodcheckin.tsx)
interface WebhookPayload {
  type: 'UPDATE';
  table: 'conversations';
  record: {
    id: string;
    initial_mood: Mood | null; // Value comes from moodcheckin.tsx
    final_mood: Mood | null;
  };
  old_record: {
    id: string;
    initial_mood: Mood | null;
    final_mood: Mood | null;
  };
}

// Export a handler function for Node.js environments
export async function handler(req: Request, res: any) {
  if (req.method === 'OPTIONS') {
    res.writeHead(200, corsHeaders);
    res.end('ok');
    return;
  }

  try {
    const payload: WebhookPayload = await (
      typeof req.json === 'function'
        ? req.json()
        : JSON.parse(await req.text())
    );

    // Extract the mood from the mood checkin
    const moodCheckin = payload.record.initial_mood;

    // Only respond to relevant updates, but skip analysis and DB update
    if (payload.type !== 'UPDATE' || !payload.record.final_mood || payload.old_record.final_mood) {
      res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders });
      res.end(JSON.stringify({ message: 'Irrelevant change, skipping analysis.' }));
      return;
    }

    // Respond with the mood from the mood checkin
    res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders });
    res.end(JSON.stringify({ success: true, moodCheckin }));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json', ...corsHeaders });
    const errorMessage =
      typeof error === 'object' && error !== null && 'message' in error
        ? (error as { message: string }).message
        : String(error);
    res.end(JSON.stringify({ error: errorMessage }));
  }
}
```

# app/chat/avatar/page.tsx

```tsx
import { Suspense } from 'react';
import ClientAvatarChat from './ClientAvatarChat';

// Server-only exports are fine here:
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6">Loading chat…</div>}>
      <ClientAvatarChat />
    </Suspense>
  );

}

```

# app/chat/simple/page.tsx

```tsx
"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { ChatInterfaceScreen } from "../../../components/ChatInterfaceScreen";
import MoodCheckIn from "../../../components/MoodCheckIn";

/**
 * SimpleChatPage
 * -----------------
 * This page renders the chat interface in "standard mode"
 * (no avatar panel) but still uses MoodCheckIn
 * so the user’s mood personalizes the greeting.
 */
export default function SimpleChatPage() {
  const router = useRouter();

  //Mood state (null until MoodCheckIn completes/skips)
  const [mood, setMood] = useState<{
    feeling: string;
    intensity: number;
    reason?: string;
    support?: string;
    timestamp: Date;
  } | null>(null);

  //Navigation handler (same as avatar page)
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

  //Handlers for MoodCheckIn
  const handleMoodComplete = (moodData: {
    feeling: string;
    intensity: number;
    reason?: string;
    support?: string;
  }) => {
    setMood({
      ...moodData,
      timestamp: new Date(),
    });
  };

  const handleSkip = () => {
    setMood(null); 
  };

  /**
   * Render ChatInterfaceScreen in standard mode
   * - Uses MoodCheckIn overlay first
   * - Passes mood (or null if skipped) to ChatInterfaceScreen
   */
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-100 via-pink-50 to-blue-100">
      {/* MoodCheckIn modal appears on top until user chooses/skip */}
      {mood === null && (
        <MoodCheckIn onComplete={handleMoodComplete} onSkip={handleSkip} />
      )}

      {/* Main chat interface (no avatar panel) */}
      <ChatInterfaceScreen
  onNavigate={handleNavigation}
  chatMode="standard"
  currentMood={mood}
  onSend={() => {}}                 // <-- add this
/>
    </div>
  );
}

```

# app/chat/summary/page.tsx

```tsx
'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import TranscriptScreen from '@/components/TranscriptScreen'; 
/**
 * ConversationSummaryPage
 * -----------------------
 * - Wraps the TranscriptScreen in a Next.js page
 * - Handles navigation (Continue Chatting, Back to Home, etc.)
 */
export default function ConversationSummaryPage() {
  const router = useRouter();

  /**
   * Handle navigation actions passed down from TranscriptScreen
   */
  const handleNavigate = (screen: string) => {
    switch (screen) {
      case 'chat':
        // 👇 decide whether to return user to avatar chat or simple chat
        router.push('/chat/avatar'); 
        break;
      case 'welcome':
      case 'home':
        router.push('/');
        break;
      default:
        console.log(`Navigate to: ${screen}`);
    }
  };

  return <TranscriptScreen onNavigate={handleNavigate} />;
}

```

# app/globals.css

```css
@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
  --color-sidebar-ring: var(--sidebar-ring);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar: var  (--sidebar);
  --color-chart-5: var(--chart-5);
  --color-chart-4: var(--chart-4);
  --color-chart-3: var(--chart-3);
  --color-chart-2: var(--chart-2);
  --color-chart-1: var(--chart-1);
  --color-ring: var(--ring);
  --color-input: var(--input);
  --color-switch-background: var(--switch-background);
  --color-border: var(--border);
  --color-destructive: var(--destructive);
  --color-accent-foreground: var(--accent-foreground);
  --color-accent: var(--accent);
  --color-muted-foreground: var(--muted-foreground);
  --color-muted: var(--muted);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-secondary: var(--secondary);
  --color-primary-foreground: var(--primary-foreground);
  --color-primary: var(--primary);
  --color-popover-foreground: var(--popover-foreground);
  --color-popover: var(--popover);
  --color-card-foreground: var(--card-foreground);
  --color-card: var(--card);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
}

:root {
  --font-size: 14px;

  /* Gamified trauma-informed color palette - light mode */
  --background: #f8fafc; /* soft off-white */
  --foreground: #334155; /* gentle dark blue-gray */
  --card: #ffffff;
  --card-foreground: #334155;
  --popover: #ffffff;
  --popover-foreground: #334155;
  --primary: #14b8a6; /* calming teal */
  --primary-foreground: #ffffff;
  --secondary: #e0f2fe; /* very light blue */
  --secondary-foreground: #0f172a;
  --muted: #f1f5f9; /* light blue-gray */
  --muted-foreground: #64748b;
  --accent: #ddd6fe; /* soft lilac */
  --accent-foreground: #4c1d95;
  --destructive: #ef4444; /* soft red, not harsh */
  --destructive-foreground: #ffffff;
  --border: #e2e8f0;
  --input: transparent;
  --input-background: #f8fafc;
  --switch-background: #cbd5e1;
  --font-weight-medium: 500;
  --font-weight-normal: 400;
  --ring: #14b8a6;

  /* Gamification accent colors */
  --soft-teal: #14b8a6;
  --soft-blue: #3b82f6;
  --soft-lilac: #a78bfa;
  --gamify-gold: #f59e0b;
  --gamify-green: #10b981;
  --gamify-purple: #8b5cf6;
  --success: #10b981;
  --warning: #f59e0b;

  /* Gradient combinations for gamification */
  --gradient-teal: linear-gradient(135deg, #14b8a6, #06b6d4);
  --gradient-lilac: linear-gradient(135deg, #a78bfa, #c084fc);
  --gradient-gold: linear-gradient(135deg, #f59e0b, #f97316);
  --gradient-celebration: linear-gradient(135deg, #f59e0b, #10b981, #a78bfa);

  --chart-1: #14b8a6;
  --chart-2: #10b981;
  --chart-3: #a78bfa;
  --chart-4: #f59e0b;
  --chart-5: #8b5cf6;
  --radius: 1rem; /* More rounded for friendliness */
  --sidebar: #f8fafc;
  --sidebar-foreground: #334155;
  --sidebar-primary: #14b8a6;
  --sidebar-primary-foreground: #ffffff;
  --sidebar-accent: #f1f5f9;
  --sidebar-accent-foreground: #334155;
  --sidebar-border: #e2e8f0;
  --sidebar-ring: #14b8a6;
}

.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.205 0 0);
  --card-foreground: oklch(0.985 0 0);
  --popover: oklch(0.205 0 0);
  --popover-foreground: oklch(0.985 0 0);
  --primary: oklch(0.922 0 0);
  --primary-foreground: oklch(0.205 0 0);
  --secondary: oklch(0.269 0 0);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.269 0 0);
  --muted-foreground: oklch(0.708 0 0);
  --accent: oklch(0.269 0 0);
  --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.704 0.191 22.216);
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 15%);
  --ring: oklch(0.556 0 0);
  --chart-1: oklch(0.488 0.243 264.376);
  --chart-2: oklch(0.696 0.17 162.48);
  --chart-3: oklch(0.769 0.188 70.08);
  --chart-4: oklch(0.627 0.265 303.9);
  --chart-5: oklch(0.645 0.246 16.439);
  --sidebar: oklch(0.205 0 0);
  --sidebar-foreground: oklch(0.985 0 0);
  --sidebar-primary: oklch(0.488 0.243 264.376);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.269 0 0);
  --sidebar-accent-foreground: oklch(0.985 0 0);
  --sidebar-border: oklch(1 0 0 / 10%);
  --sidebar-ring: oklch(0.556 0 0);
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
  }
}








```

# app/layout.tsx

```tsx
import type { Metadata } from "next";
import { Inter, Roboto_Mono } from "next/font/google"; 
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

// Keep your existing CSS variable names so the rest of your app doesn't change
const geistSans = Inter({ subsets: ["latin"], variable: "--font-geist-sans" });
const geistMono = Roboto_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  title: "Create Next App",
  description: "Generated by create next app",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
        <Toaster />
      </body>
    </html>
  );
}


```

# app/login/page.tsx

```tsx
"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, User, Lock, UserPlus, Shield, Info } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();

  
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState(""); 
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleBack = () => router.push("/");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setIsLoading(true);

    try {
      if (isSignUp) {
        if (password !== confirmPassword) {
          setErr("Passwords do not match.");
          return;
        }

        // FOR SIGNUP!!!!!!!!!!! here
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { username: username.trim() || null } },
        });
        if (error) throw error;

         const signIn = async () => {
          await supabase.auth.signInWithOAuth({ provider: 'google' }); // pick any provider you set up
          };
          return <button onClick={signIn}>Sign in</button>;

        // USER HAS. to confm email to work
        alert("Check your email to confirm your account, then log in.");
        setIsSignUp(false); // flip back to login
        setPassword("");
        setConfirmPassword("");
        return;
      } else {
        // Login
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;

        router.push("/profile");
      }
    } catch (e: any) {
      console.error(e);
      setErr(e?.message ?? "Something went wrong.");
    } finally {
      setIsLoading(false);
    }
    
  };
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-100 via-pink-50 to-blue-100">
      <div className="max-w-md mx-auto px-4 py-8">
        
        <Button onClick={handleBack} variant="ghost" className="mb-6 trauma-safe gentle-focus">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Home
        </Button>

        <Card className="trauma-safe">
          <CardHeader className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
              {isSignUp ? <UserPlus className="h-8 w-8 text-white" /> : <User className="h-8 w-8 text-white" />}
            </div>
            <CardTitle className="text-2xl">{isSignUp ? "Create Account" : "Welcome Back"}</CardTitle>
            <p className="text-muted-foreground">
              {isSignUp
                ? "Create an account to save your avatar and preferences"
                : "Login to access your saved avatars and continue your journey"}
            </p>
          </CardHeader>

          <CardContent className="space-y-6">
            
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-medium text-blue-800 dark:text-blue-300 mb-1">Optional & Private</h4>
                  <p className="text-sm text-blue-700 dark:text-blue-400">
                    Creating an account is optional. Your conversations remain private and secure whether you login or
                    chat anonymously.
                  </p>
                </div>
              </div>
            </div>

            
            {err && (
              <div className="text-sm rounded-md border border-red-300 bg-red-50 text-red-700 p-3">
                {err}
              </div>
            )}

           
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="trauma-safe gentle-focus"
                />
              </div>

              {isSignUp && (
                <div>
                  <Label htmlFor="username">Username (shown on profile)</Label>
                  <Input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Choose a username"
                    className="trauma-safe gentle-focus"
                  />
                </div>
              )}

              <div>
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  className="trauma-safe gentle-focus"
                />
              </div>

              {isSignUp && (
                <div>
                  <Label htmlFor="confirmPassword">Confirm Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your password"
                    required
                  />
                </div>
              )}

              <Button type="submit" className="w-full trauma-safe calm-hover" disabled={isLoading}>
                {isLoading ? (
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>{isSignUp ? "Creating Account..." : "Logging In..."}</span>
                  </div>
                ) : (
                  <>
                    <Lock className="h-4 w-4 mr-2" />
                    {isSignUp ? "Create Account" : "Login"}
                  </>
                )}
              </Button>
            </form>

            <Separator />

            {/* login & signup stuff */}
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-3">
                {isSignUp ? "Already have an account?" : "Don't have an account?"}
              </p>
              <Button variant="outline" onClick={() => setIsSignUp(!isSignUp)} className="trauma-safe gentle-focus">
                {isSignUp ? "Login Instead" : "Create Account"}
              </Button>
            </div>

            
            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
              <div className="flex items-center space-x-2 mb-3">
                <Info className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                <h4 className="font-medium text-sm">Benefits of Having an Account</h4>
              </div>
              <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
                <li className="flex items-center space-x-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-current" />
                  <span>Save and customize your avatar</span>
                </li>
                <li className="flex items-center space-x-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-current" />
                  <span>Keep your preferences across sessions</span>
                </li>
                <li className="flex items-center space-x-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-current" />
                  <span>Optional conversation history (with your consent)</span>
                </li>
              </ul>
            </div>

           
            <div className="text-center pt-4 border-t border-border">
              <p className="text-sm text-muted-foreground mb-3">Prefer to stay anonymous?</p>
              <Button variant="ghost" onClick={handleBack} className="trauma-safe gentle-focus">
                Continue Without Account
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

```

# app/page.tsx

```tsx
"use client";

import React, { useEffect, useState } from 'react';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import Navbar from '../components/Navbar'; 
import { createConversation } from '@/lib/conversations'; // adjust path if needed
import { getSessionUserId } from '@/lib/auth';

import { 
  Shield, 
  Heart, 
  Users, 
  Settings,
  Sparkles,
  MessageCircle,
  MessageSquare,
  Crown,
  Zap
} from 'lucide-react';

interface MoodData {
  feeling: string;
  intensity: number;
  reason?: string;
  support?: string;
}

interface StoredMoodData extends MoodData {
  timestamp: Date;
}

const MOOD_SESSION_KEY = 'moodCheckedIn:v1';

interface User {
  username: string;
  rpm_user_url?: string | null;
  currentAvatar?: {
    name: string;
    type: string;
  };
}

// Convert a Ready Player Me URL (.glb) into a displayable PNG
function toThumbnail(url?: string | null): string | null {
  if (!url) return null;
  if (url.endsWith(".png")) return url;
  if (url.endsWith(".glb")) return url.replace(".glb", ".png");

  // extract avatar id and use the official PNG endpoint
  try {
    const last = url.split("/").pop() || "";
    const id = last.replace(".glb", "");
    if (id && id.length > 10) {
      return `https://api.readyplayer.me/v1/avatars/${id}.png`;
    }
  } catch {}
  return null;
}

export default function HomePage() {
  const router = useRouter();
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);
  const [chatMode, setChatMode] = useState<'avatar' | 'standard'>('avatar');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [currentMood, setCurrentMood] = useState<StoredMoodData | null>(null);

  const handleNavigateToProfile = () => {
    router.push('/profile');
  };

  const handleNavigateToChat = async (mode: 'avatar' | 'standard') => {
    // Set session storage so the chat page knows the check-in was intentionally skipped.
    const skippedState = { skipped: true, timestamp: new Date() };
    sessionStorage.setItem(MOOD_SESSION_KEY, JSON.stringify(skippedState));

    // Navigate to chat without mood data
    if (mode === 'avatar') {
      const convoId = await maybeCreateConversation();
      router.push(`/chat/avatar${convoId ? `?convo=${convoId}` : ''}`);
    } else {
      router.push('/chat/simple');
    }
  };

  const handleChatModeChange = (mode: 'avatar' | 'standard') => {
    setChatMode(mode);
  };



  // Navigation handler for the Navbar component
  const handleNavigation = (screen: string) => {
    switch (screen) {
      case 'welcome':
      case '/':
      case 'home':
        // Already on home page, could scroll to top or refresh
        window.scrollTo({ top: 0, behavior: 'smooth' });
        break;
      case 'settings':
        // Navigate to settings page
        router.push('/settings');
        break;
        // Navigate to profile page
      case 'profile':
        router.push('/profile');
        break;
        // Navigate to avatar builder page
      case 'avatarbuilder':
        router.push('/avatarbuilder');
        break;
      // Navigate to login page
      case 'login':
        router.push('/login');
        break;
      default:
        console.log(`Navigate to: ${screen}`);
    }
  };

    async function maybeCreateConversation() {
  const uid = await getSessionUserId();          // null if anonymous
  if (!uid) return null;                         // skip DB write when not logged in
  const convoId = await createConversation('My chat');
  console.log('[chat] created conversation:', convoId);
  return convoId;
    }

  // Load saved mood data and user data on mount
  useEffect(() => {
    // Load user authentication state
    const loadUserData = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const currentUser = session?.user;
        
        if (currentUser) {
          setIsLoggedIn(true);
          
          // Fetch user profile data
          const { data: profile, error } = await supabase
            .from("profiles")
            .select("id, username, full_name, avatar_url, session_mode, rpm_user_url, rpm_companion_url")
            .eq("id", currentUser.id)
            .maybeSingle();
            
          if (profile) {
            setUser({
              username: profile.username || profile.full_name || currentUser.email || 'User',
              rpm_user_url: profile.rpm_user_url,
              currentAvatar: profile.rpm_user_url ? {
                name: 'Custom Avatar',
                type: 'custom'
              } : undefined
            });
          } else {
            // Fallback user data if profile doesn't exist yet
            setUser({
              username: currentUser.email?.split('@')[0] || 'User'
            });
          }
        } else {
          setIsLoggedIn(false);
          setUser(null);
        }
      } catch (error) {
        console.error("Error loading user data:", error);
        setIsLoggedIn(false);
        setUser(null);
      }
    };

    loadUserData();

    
  

    // Load saved mood data
    const savedMood = sessionStorage.getItem(MOOD_SESSION_KEY);
    if (savedMood) {
      try {
        const moodData = JSON.parse(savedMood);
        // Check if mood data is recent 
        if (new Date().getTime() - new Date(moodData.timestamp).getTime() < 4 * 60 * 60 * 1000) {
          setCurrentMood(moodData);
        } else {
          sessionStorage.removeItem(MOOD_SESSION_KEY);
        }
      } catch (error) {
        console.error('Error loading mood data:', error);
        sessionStorage.removeItem(MOOD_SESSION_KEY);
      }
    }
    

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        loadUserData();
      } else if (event === 'SIGNED_OUT') {
        setIsLoggedIn(false);
        setUser(null);
      }
    });

    // Cleanup subscription on unmount
    return () => {
      subscription?.unsubscribe?.();
    };
  }, []);


  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-100 via-pink-50 to-blue-100">
      {/* Use Navbar Component with correct props */}
      <Navbar 
        onNavigate={handleNavigation}
        isLoggedIn={isLoggedIn}
        currentPage="home"
      />
      
      <div className="max-w-6xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        
        {/* User Welcome (if logged in) */}
        {isLoggedIn && user && (
          <div className="mb-8 max-w-md mx-auto">
            <Card className="border-2 border-teal-200 bg-gradient-to-r from-white to-teal-50">
              <CardContent className="p-2">
                <div className="flex items-center space-x-4 text-center justify-center">
                  <div className="w-16 h-16 bg-teal-500 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0">
                    {user.rpm_user_url ? (
                      <img 
                        src={toThumbnail(user.rpm_user_url) || ""}
                        alt="Your Avatar"
                        className="w-18 h-18 object-cover rounded-full scale-120"
                        style={{ objectPosition: 'center top' }}
                        onError={(e) => {
                          // Fallback to initials if avatar image fails to load
                          e.currentTarget.style.display = 'none';
                          const nextElement = e.currentTarget.nextElementSibling as HTMLElement;
                          if (nextElement) {
                            nextElement.style.display = 'flex';
                          }
                        }}
                      />
                    ) : null}
                    <span className={`text-white font-semibold ${user.rpm_user_url ? 'hidden' : ''}`}>
                      {user.username.charAt(0)}
                    </span>
                  </div>
                  <div className="text-left">
                    <h3 className="font-semibold">Welcome back, {user.username}!</h3>
                    <div className="flex flex-col space-y-1 text-sm text-gray-600 mt-1">
                      <span>Ready to continue your journey?</span>
                      {currentMood && (
                        <Badge className="bg-teal-50 text-teal-700 border-teal-200 w-fit">
                          Currently feeling {currentMood.feeling.toLowerCase()}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Safe Space Badge */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center space-x-2 bg-teal-100 px-4 py-2 rounded-full mb-6">
            <Shield className="h-4 w-4 text-teal-600" />
            <span className="text-sm font-medium text-teal-800">
              Safe & Confidential Space
            </span>
          </div>
        </div>

        {/* Hero Section */}
        <div className="text-center mb-12">
          <div className="space-y-6 mb-10">
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-gray-900 leading-tight">
              Meet your
              <br />
              <span className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-500 bg-clip-text text-transparent">
                Avatar Companion
              </span>
              <span className="text-6xl">✨</span>
            </h1>
            
            <p className="text-lg text-gray-600 max-w-2xl mx-auto leading-relaxed">
              A supportive AI companion designed to listen, understand, and help you 
              navigate challenges. Safe, welcoming, and just for you!
            </p>
          </div>

          {/* Trust Indicators */}
          <div className="flex flex-wrap justify-center gap-4 mb-10">
            <Badge className="px-4 py-2 text-sm bg-yellow-100 text-yellow-800 border-yellow-200">
              Private & Secure
            </Badge>
            <Badge className="px-4 py-2 text-sm bg-green-100 text-green-800 border-green-200">
              Trauma-informed
            </Badge>
            <Badge className="px-4 py-2 text-sm bg-blue-100 text-blue-800 border-blue-200">
              Youth-Focused
            </Badge>
          </div>

          {/* Primary CTA */}
          <div className="mb-12">
            <Button
              onClick={() => {
                handleChatModeChange('standard');
                handleNavigateToChat('standard');
              }}
              size="lg"
              className="h-16 px-12 text-xl bg-teal-500 hover:bg-teal-600 text-white border-0 rounded-full shadow-lg hover:shadow-xl transition-all duration-300"
            >
              <Sparkles className="h-7 w-7 mr-3" />
              Start Chat Anonymously
            </Button>
            <div className="mt-6 space-y-2">
              <p className="text-sm text-gray-600">
                No registration required • Completely private • Start immediately
              </p>              
            </div>
          </div>
        </div>

        {/* Chat Mode Selection */}
        <div className="max-w-4xl mx-auto mb-16">
          <h2 className="text-2xl font-semibold text-center mb-8 text-gray-900">
            Choose Your Chat Experience
          </h2>
          
          <div className="grid md:grid-cols-2 gap-8">
            {/* Avatar Chat Mode Card */}
            <Card 
              className={`border-2 transition-all duration-300 cursor-pointer ${
                chatMode === 'avatar' 
                  ? 'border-teal-400 bg-gradient-to-br from-teal-50 to-purple-50 shadow-lg' 
                  : 'border-gray-100 hover:border-teal-200'
              } ${hoveredCard === 'avatar' ? 'transform scale-105' : ''} bg-white`}
              onClick={() => handleChatModeChange('avatar')}
              onMouseEnter={() => setHoveredCard('avatar')}
              onMouseLeave={() => setHoveredCard(null)}
            >
              <CardContent className="p-8">
                <div className="text-center">
                  <div className="w-20 h-20 mx-auto mb-6 bg-teal-100 rounded-full flex items-center justify-center">
                    <span className="text-3xl">🎭</span>
                  </div>
                  
                  <h3 className="text-xl font-semibold mb-3 text-gray-900">
                    Avatar Chat Mode
                  </h3>
                  
                  <p className="text-gray-600 mb-6 leading-relaxed text-sm">
                    Create your own avatar and chat with Adam in a visual, face-to-face environment. 
                    More engaging and personalized!
                  </p>
                  
                  <div className="space-y-3 mb-6 text-sm">
                    <div className="flex items-center justify-start space-x-2">
                      <span className="text-yellow-500">✨</span>
                      <span>Visual avatar interaction</span>
                    </div>
                    <div className="flex items-center justify-start space-x-2">
                      <span className="text-orange-500">🧡</span>
                      <span>Personalized companion</span>
                    </div>
                    <div className="flex items-center justify-start space-x-2">
                      <span className="text-blue-500">⚡</span>
                      <span>No downloads needed</span>
                    </div>
                  </div>

                  {isLoggedIn && user?.currentAvatar && user.currentAvatar.type !== 'default' ? (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                      <div className="flex items-center justify-center space-x-2 mb-2">
                        <Crown className="h-4 w-4 text-yellow-600" />
                        <span className="font-medium text-green-800 text-sm">
                          Your Avatar Ready!
                        </span>
                      </div>
                      <p className="text-xs text-green-700">
                        <strong>{user.currentAvatar.name}</strong> is waiting to chat
                      </p>
                    </div>
                  ) : (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                      <div className="flex items-center justify-center space-x-2 mb-2">
                        <Zap className="h-4 w-4 text-blue-500" />
                        <span className="font-medium text-blue-800 text-sm">
                          Quick Start Available!
                        </span>
                      </div>
                      <p className="text-xs text-blue-700">
                        Start immediately with a default avatar, or customize later
                      </p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Button
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        handleChatModeChange("avatar"); 
                        handleNavigation("avatarbuilder"); 
                      }}
                      className="w-full bg-teal-500 hover:bg-teal-600 text-white"
                    >
                      <MessageCircle className="h-4 w-4 mr-2" />
                      Start Avatar Chat
                    </Button>
                    
                    {!isLoggedIn && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full text-xs text-gray-500 hover:bg-gray-50"
                        onClick={() => {
                        handleNavigation('login');
                      }}
                      >
                        Login to Save Avatars
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Simple Chat Mode Card */}
            <Card 
              className={`border-2 transition-all duration-300 cursor-pointer ${
                chatMode === 'standard' 
                  ? 'border-blue-400 bg-gradient-to-br from-blue-50 to-purple-50 shadow-lg' 
                  : 'border-gray-100 hover:border-blue-200'
              } ${hoveredCard === 'standard' ? 'transform scale-105' : ''} bg-white`}
              onClick={() => handleChatModeChange('standard')}
              onMouseEnter={() => setHoveredCard('standard')}
              onMouseLeave={() => setHoveredCard(null)}
            >
              <CardContent className="p-8">
                <div className="text-center">
                  <div className="w-20 h-20 mx-auto mb-6 bg-blue-100 rounded-full flex items-center justify-center">
                    <span className="text-3xl">💬</span>
                  </div>
                  
                  <h3 className="text-xl font-semibold mb-3 text-gray-900">
                    Simple Chat Mode
                  </h3>
                  
                  <p className="text-gray-600 mb-6 leading-relaxed text-sm">
                    Enjoy a distraction-free chat experience built for focus. Clean design, effortless flow, better conversations
                  </p>
                  
                  <div className="space-y-3 mb-6 text-sm">
                    <div className="flex items-center justify-start space-x-2">
                      <span className="text-yellow-500">✨</span>
                      <span>Clean, minimal interface</span>
                    </div>
                    <div className="flex items-center justify-start space-x-2">
                      <span className="text-yellow-500">⚡</span>
                      <span>Fast and lightweight</span>
                    </div>
                    <div className="flex items-center justify-start space-x-2">
                      <span className="text-yellow-500">🤖</span>
                      <span>Same supportive Adam</span>
                    </div>
                  </div>

                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-4">
                    <div className="flex items-center justify-center space-x-2 mb-2">
                      <Sparkles className="h-4 w-4 text-purple-500" />
                      <span className="font-medium text-purple-800 text-sm">
                        Instant Access!
                      </span>
                    </div>
                    <p className="text-xs text-purple-700">
                      Start chatting instantly - no setup needed
                    </p>
                  </div>

                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleChatModeChange('standard');
                      handleNavigateToChat('standard');
                    }}
                    className="w-full bg-gradient-to-r from-blue-500 to-purple-500 text-white"
                  >
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Start Text Chat
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Privacy Reminder */}
        <div className="max-w-2xl mx-auto mb-16">
          <Card className="bg-gradient-to-r from-purple-50 to-pink-50 border-purple-200">
            <CardContent className="p-6 text-center">
              <div className="flex items-center justify-center space-x-2 mb-3">
                <Shield className="h-5 w-5 text-purple-600" />
                <h3 className="font-medium text-purple-800">
                  You're Always Anonymous by Default
                </h3>
              </div>
              <p className="text-sm text-purple-700 leading-relaxed">
                Your privacy is our top priority. Every conversation is completely anonymous and secure. 
                You control what you share, always.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Features Section */}
        <div className="mb-16">
          <h2 className="text-3xl font-semibold text-center mb-12 text-gray-900">
            Why Avatar Companion?
          </h2>
          
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-20 h-20 mx-auto mb-6 bg-teal-100 rounded-full flex items-center justify-center shadow-lg">
                <Shield className="h-10 w-10 text-teal-600" />
              </div>
              <h3 className="text-xl font-semibold mb-3 text-gray-900">
                Completely Safe
              </h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Your conversations are private and secure. You control what you share, always.
              </p>
            </div>

            <div className="text-center">
              <div className="w-20 h-20 mx-auto mb-6 bg-purple-100 rounded-full flex items-center justify-center shadow-lg">
                <Heart className="h-10 w-10 text-purple-600" />
              </div>
              <h3 className="text-xl font-semibold mb-3 text-gray-900">
                Understanding
              </h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Designed with trauma-informed principles for gentle, supportive interactions.
              </p>
            </div>

            <div className="text-center">
              <div className="w-20 h-20 mx-auto mb-6 bg-yellow-100 rounded-full flex items-center justify-center shadow-lg">
                <Users className="h-10 w-10 text-yellow-600" />
              </div>
              <h3 className="text-xl font-semibold mb-3 text-gray-900">
                Just for You
              </h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Built specifically for young people, understanding your unique experiences.
              </p>
            </div>
          </div>
        </div>


        {/* Bottom Actions */}
        <div className="text-center">
          <p className="text-gray-600 mb-6">
            Want to review preferences or learn more?
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Button
              variant="outline"
              className="border-gray-200 text-gray-600 hover:bg-gray-50"
              onClick={() => handleNavigation('settings')}
            >
              <Settings className="h-4 w-4 mr-2" />
              Preferences
            </Button>
            <Button
              onClick={handleNavigateToProfile}
              variant="default"
              className="trauma-safe gentle-focus"
            >
              👤 View Profile
            </Button>
            
            {!isLoggedIn && (
              <Button
                variant="default"
                className="bg-gray-800 text-white hover:bg-gray-900"
              >
                Create Account (Optional)
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

}
```

# app/profile/page.tsx

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import ConversationList from '@/components/conversation';
import Navbar from "@/components/Navbar";
import { ReadyPlayerMeSelector } from "./ReadyPlayerMeSelector";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Search,
  MessageCircle,
  BookmarkCheck,
  Settings as SettingsIcon,
  Clock,
  Download,
  Trash2,
  ArrowLeft,
  User,
  Check,
  Crown,
} from "lucide-react";
// at top of your Profile page file:
//import { useEffect, useMemo, useState } from 'react';
//import { supabase } from '@/lib/supabaseClient';
import { getSessionUserId } from '@/lib/auth';
//import { useRouter } from 'next/navigation';

type ConversationRow = {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
};

type LastByConvo = Record<string, { content: string; created_at: string }>;

interface ReadyPlayerMeAvatar {
  id: string;
  name: string;
  url: string;
  type: "user" | "companion";
  thumbnail?: string; 
  isCustom?: boolean;
}


// GLB --> Png
function toThumbnail(url?: string | null): string | null {
  if (!url) return null;
  if (url.endsWith(".png")) return url;
  if (url.endsWith(".glb")) return url.replace(".glb", ".png");

  // Try to extract avatar id and use the official PNG endpoint
  try {
    const last = url.split("/").pop() || "";
    const id = last.replace(".glb", "");
    if (id && id.length > 10) {
      return `https://api.readyplayer.me/v1/avatars/${id}.png`;
    }
  } catch {}
  return null;
}

function idFromUrl(url: string): string {
  const last = url.split("/").pop() || "";
  return last.replace(".glb", "") || `custom-${Date.now()}`;
}

// JUST FOR NOW ITS THE mock data
type Conversation = {
  id: string;
  title: string;
  status: "ongoing" | "completed";
  lastMessage: string;
};

type SavedItem = {
  id: string;
  title: string;
  content: string;
  timestamp: number;
  type: "note" | "clip" | "snippet";
};

type Profile = {
  id: string;
  username: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
  session_mode?: string | null;

  
  rpm_user_url?: string | null;
  rpm_companion_url?: string | null;
};

const MOCK_CONVERSATIONS: Conversation[] = [
  { id: "1", title: "Chat with Mentor", status: "ongoing", lastMessage: "Yesterday · 14:05" },
  { id: "2", title: "Anxiety Support Session", status: "completed", lastMessage: "Aug 28 · 16:30" },
  { id: "3", title: "Career Guidance Chat", status: "ongoing", lastMessage: "Aug 27 · 10:15" },
  { id: "4", title: "Mindfulness Practice", status: "completed", lastMessage: "Aug 25 · 19:45" },
];

const MOCK_SAVED: SavedItem[] = [
  {
    id: "s1",
    title: "Pinned Answer — Data pipeline explanation",
    content: "Detailed explanation about setting up data pipelines with best practices...",
    timestamp: Date.now() - 1000 * 60 * 60 * 24 * 2,
    type: "note",
  },
  {
    id: "s2",
    title: "Coping Strategies for Stress",
    content: "Five effective techniques for managing stress in challenging situations...",
    timestamp: Date.now() - 1000 * 60 * 60 * 24 * 5,
    type: "snippet",
  },
  {
    id: "s3",
    title: "Career Resources List",
    content: "Comprehensive list of career development resources and tools...",
    timestamp: Date.now() - 1000 * 60 * 60 * 24 * 10,
    type: "clip",
  },
];

// This component should be defined outside of the ProfilePageSupabase component
// to prevent it from being recreated on every render.
function ProfileConversationsTab() {
  const router = useRouter();
  return (
    <ConversationList
      onSelect={(id) => router.push(`/chat/avatar?convo=${id}`)}
      showSearch
      mineOnly={true}
    />
  );
}

export default function ProfilePageSupabase() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromChatConvoId = searchParams.get('convo');

  // STATE of profile from DB....
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true); 
  // loading.....

  // FOR UI!!!!
  const [activeTab, setActiveTab] = useState<"conversations" | "avatars" | "saved" | "settings">("conversations");
  const [searchQuery, setSearchQuery] = useState(""); // for search
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [defaultModel, setDefaultModel] = useState("gpt-4o-mini");

  // derived
  const displayName = useMemo(() => profile?.username ?? "Anonymous", [profile]);

useEffect(() => {
  let cancelled = false;

  async function getStableSession() {
    for (let i = 0; i < 10; i++) {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) return session;
      await new Promise((r) => setTimeout(r, 100));
    }
    return null;
  }
  async function load() {
    if (!cancelled) setLoadingProfile(true);
    try {
      const session = await getStableSession();
      const u = session?.user;

      if (!u) {
        if (!cancelled) {
          setProfile(null);
          setLoadingProfile(false);
        }
        router.replace("/login");
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, full_name, avatar_url, session_mode, rpm_user_url, rpm_companion_url")
        .eq("id", u.id)
        .maybeSingle(); 

      if (cancelled) return;

      if (error) {
        console.warn("profiles load error:", error);
        setProfile({
          id: u.id,
          username: u.email ?? "Anonymous",
          rpm_user_url: null,
          rpm_companion_url: null,
        });
      } else {
        setProfile(
          data ?? {
            id: u.id,
            username: u.email ?? "Anonymous",
            rpm_user_url: null,
            rpm_companion_url: null,
          }
        );
      }
    } catch (e) {
      console.error("profile load exception:", e);
      if (!cancelled) setProfile(null);
    } finally {
      if (!cancelled) setLoadingProfile(false);
    }
  }

  // initial load
  load();

  // keep in sync with auth changes
  const { data: sub } = supabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_IN") load();
    if (event === "SIGNED_OUT") {
      if (!cancelled) {
        setProfile(null);
        setLoadingProfile(false);
      }
      router.replace("/login");
    }
  });

  return () => {
    cancelled = true;
    sub.subscription.unsubscribe();
  };
}, [router]);


  // When the selector fires, we update DB via selector (it already saves)
  // and also reflect the new URL immediately in our profile state so the header updates.
  const handleReadyPlayerMeAvatarSelect = (avatar: ReadyPlayerMeAvatar, type: "user" | "companion") => {
    setProfile((prev) =>
      prev
        ? {
            ...prev,
            rpm_user_url: type === "user" ? avatar.url : prev.rpm_user_url ?? null,
            rpm_companion_url: type === "companion" ? avatar.url : prev.rpm_companion_url ?? null,
          }
        : prev
    );
  };

  // Build DB-backed avatar objects for the selector (for its UI)
  const currentUserAvatarFromDB: ReadyPlayerMeAvatar | undefined = useMemo(() => {
    const url = profile?.rpm_user_url ?? null;
    if (!url) return undefined;
    return {
      id: idFromUrl(url),
      name: "Custom Avatar",
      url,
      type: "user",
      thumbnail: toThumbnail(url) ?? undefined,
      isCustom: true,
    };
  }, [profile?.rpm_user_url]);

  const currentCompanionAvatarFromDB: ReadyPlayerMeAvatar | undefined = useMemo(() => {
    const url = profile?.rpm_companion_url ?? null;
    if (!url) return undefined;
    return {
      id: idFromUrl(url),
      name: "Custom Companion",
      url,
      type: "companion",
      thumbnail: toThumbnail(url) ?? undefined,
      isCustom: true,
    };
  }, [profile?.rpm_companion_url]);

  // conversations filter
  const filteredConversations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return MOCK_CONVERSATIONS;
    return MOCK_CONVERSATIONS.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.lastMessage.toLowerCase().includes(q) ||
        c.status.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  // nav handlers
  const handleBackToHome = () => router.push("/");
  const handleBackToChat = () => {
    if (fromChatConvoId) router.push(`/chat/avatar?convo=${fromChatConvoId}`);
  };
  const handleNavigateToChat = () => router.push("/chat/avatar");
  const handleNavigation = (href: string) => router.push(href);

  const handleExportData = () => alert("Export started (placeholder).");
  const handleDeleteAccount = async () => {
    const confirmed = window.confirm(
      "Are you absolutely sure?\n\nThis will permanently delete your account and data."
    );
    if (confirmed) alert("Account deletion flow (placeholder). Use a server route with service role.");
  };
  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  if (loadingProfile) return <p className="p-6">Loading profile…</p>;
  if (!profile) {
    return (
      <div className="p-6">
        <p>Could not load profile.</p>
        <Button className="mt-4" onClick={() => router.push("/login")}>
          Go to Login
        </Button>
      </div>
    );
  }

  //  Header avatar thumbnail comes straight from DB (per-user)
  const headerThumb = toThumbnail(profile.rpm_user_url);

  return (
    <div className="min-h-screen bg-background">
      <Navbar onNavigate={handleNavigation as any} currentPage="profile" />

      <main className="mx-auto w-full max-w-7xl px-4 sm:px-6 py-6">
        {/* Back Button */}
        {fromChatConvoId ? (
          <Button variant="ghost" onClick={handleBackToChat} className="mb-6 trauma-safe gentle-focus">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Chat
          </Button>
        ) : (
          <Button variant="ghost" onClick={handleBackToHome} className="mb-6 trauma-safe gentle-focus">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Button>
        )}

        {/* Profile Header */}
        <div className="bg-card rounded-lg border border-border p-6 mb-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-4 sm:space-y-0 sm:space-x-6">
            {/* Avatar (DB-backed) */}
            <Avatar className="w-20 h-20">
              {headerThumb ? (
                <AvatarImage src={headerThumb} alt="User Avatar" />
              ) : (
                <AvatarImage
                  src={`https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}`}
                  alt="User Avatar"
                />
              )}
              <AvatarFallback className="bg-gradient-to-br from-soft-teal to-soft-lilac text-white text-xl">
                {displayName.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>

            {/* User Info */}
            <div className="flex-1">
              <h1 className="mb-1">{displayName}</h1>
              <p className="text-muted-foreground mb-2">
                <Clock className="w-4 h-4 inline mr-1" />
                Last active: {new Date().toLocaleDateString()}
              </p>
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                <span>12 conversations</span>
                <span>•</span>
                <span>3 saved chats</span>
                {profile.rpm_user_url && (
                  <>
                    <span>•</span>
                    <span className="text-teal-600 dark:text-teal-400">🎭 3D Avatar Ready</span>
                  </>
                )}
              </div>
              {profile.rpm_companion_url && (
                <div className="mt-2">
                  <Badge variant="secondary" className="bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                    💜 Companion: Custom Companion
                  </Badge>
                </div>
              )}
            </div>

            <Button variant="outline" onClick={handleLogout} className="trauma-safe gentle-focus">
              Log out
            </Button>
          </div>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Tabs */}
          <div className="lg:col-span-2">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
              <TabsList className="grid w-full grid-cols-4 trauma-safe">
                <TabsTrigger value="conversations" className="trauma-safe gentle-focus">
                  <MessageCircle className="w-4 h-4 mr-2" />
                  Conversations
                </TabsTrigger>
                <TabsTrigger value="avatars" className="trauma-safe gentle-focus">
                  <User className="w-4 h-4 mr-2" />
                  3D Avatars
                </TabsTrigger>
                <TabsTrigger value="saved" className="trauma-safe gentle-focus">
                  <BookmarkCheck className="w-4 h-4 mr-2" />
                  Saved
                </TabsTrigger>
                <TabsTrigger value="settings" className="trauma-safe gentle-focus">
                  <SettingsIcon className="w-4 h-4 mr-2" />
                  Settings
                </TabsTrigger>
              </TabsList>

              {/* Conversations Tab */}
              
              <TabsContent value="conversations" className="mt-6">
                <ProfileConversationsTab />
              </TabsContent>


              {/* 3D Avatars Tab */}
              <TabsContent value="avatars" className="mt-6">
                <ReadyPlayerMeSelector
                  onAvatarSelect={handleReadyPlayerMeAvatarSelect}
                  currentUserAvatar={currentUserAvatarFromDB}
                  currentCompanionAvatar={currentCompanionAvatarFromDB}
                />
              </TabsContent>

              {/* Saved Tab */}
              <TabsContent value="saved" className="mt-6">
                <div className="space-y-4">
                  {MOCK_SAVED.map((item) => (
                    <Card key={item.id} className="trauma-safe calm-hover">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h3 className="mb-2">{item.title}</h3>
                            <p className="text-sm text-muted-foreground mb-2">{item.content}</p>
                            <p className="text-xs text-muted-foreground">
                              Saved on{" "}
                              {new Date(item.timestamp).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })}
                            </p>
                          </div>
                          <Badge variant="outline" className="ml-3 trauma-safe">
                            {item.type}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>

              {/* Settings Tab */}
              <TabsContent value="settings" className="mt-6">
                <div className="space-y-6">
                  <Card className="trauma-safe">
                    <CardHeader>
                      <CardTitle>Appearance</CardTitle>
                      <CardDescription>Customize how your app looks and feels</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <label className="font-medium">Dark mode</label>
                          <p className="text-sm text-muted-foreground">Toggle between light and dark themes</p>
                        </div>
                        <Switch checked={isDarkMode} onCheckedChange={setIsDarkMode} className="trauma-safe" />
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="trauma-safe">
                    <CardHeader>
                      <CardTitle>AI Preferences</CardTitle>
                      <CardDescription>Configure your chat experience</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <label className="font-medium">Default model</label>
                        <Select value={defaultModel} onValueChange={setDefaultModel}>
                          <SelectTrigger className="trauma-safe gentle-focus">
                            <SelectValue placeholder="Select AI model" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="gpt-4o-mini">GPT-4o mini</SelectItem>
                            <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                            <SelectItem value="claude-3">Claude 3</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-sm text-muted-foreground">Choose the default model for conversations</p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="trauma-safe">
                    <CardHeader>
                      <CardTitle>Data Management</CardTitle>
                      <CardDescription>Manage your personal data and account</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <Button variant="outline" onClick={handleExportData} className="w-full sm:w-auto trauma-safe gentle-focus">
                        <Download className="w-4 h-4 mr-2" />
                        Export my data
                      </Button>

                      <div>
                        <Button
                          variant="destructive"
                          onClick={handleDeleteAccount}
                          className="w-full sm:w-auto trauma-safe gentle-focus"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete account
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </Tabs>
          </div>

          {/* Right Column - Session Summary */}
          {selectedConversation && (
            <div className="lg:col-span-1">
              <Card className="trauma-safe sticky top-6">
                <CardHeader>
                  <CardTitle>Session Summary</CardTitle>
                  <CardDescription>{selectedConversation.title}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm">
                    {/* placeholder summaries */}
                    {selectedConversation.id === "1" && "Discussed project database schema and Supabase setup."}
                    {selectedConversation.id === "2" && "Worked through anxiety management techniques."}
                    {selectedConversation.id === "3" && "Explored career development opportunities."}
                    {selectedConversation.id === "4" && "Practiced mindfulness exercises."}
                  </p>

                  <div className="flex flex-col space-y-2">
                    <Badge variant="outline" className="w-fit trauma-safe">
                      {selectedConversation.status}
                    </Badge>
                    <p className="text-xs text-muted-foreground">Last activity: {selectedConversation.lastMessage}</p>
                  </div>

                  <Button className="w-full trauma-safe gentle-focus" onClick={handleNavigateToChat}>
                    Resume Conversation
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

```

# app/profile/ReadyPlayerMeSelector.tsx

```tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Button } from "components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "components/ui/card";
import { Badge } from "components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "components/ui/dialog";
import { User, Bot, Sparkles, Crown, RefreshCw, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";

type AvatarType = "user" | "companion";

interface ReadyPlayerMeAvatar {
  id: string;
  name: string;
  url: string; // often .glb
  type: "user" | "companion";
  thumbnail?: string; // .png
  isCustom?: boolean;
}



interface ReadyPlayerMeSelectorProps {
  onAvatarSelect: (avatar: ReadyPlayerMeAvatar, type: "user" | "companion") => void;
  currentUserAvatar?: ReadyPlayerMeAvatar;        // optional fallback for UI text
  currentCompanionAvatar?: ReadyPlayerMeAvatar;   // optional fallback for UI text
  user?: { id: string; username: string } | null; // not relied on for saving
}

/* ---------- helpers: convert RPM URLs to image thumbnails ---------- */
function toThumbnail(url: string | null | undefined): string | null {
  if (!url) return null;

  // If we already have a .png, use it as-is
  if (url.endsWith(".png")) return url;

  // If it's a .glb from models.readyplayer.me, try the cheap swap
  if (url.endsWith(".glb")) return url.replace(".glb", ".png");

  // Try to extract avatar id and use the official PNG endpoint
  // examples:
  // - https://models.readyplayer.me/68ba6f6e....glb
  // - https://readyplayer.me/avatar/68ba6f6e....
  try {
    const parts = url.split("/");
    const last = parts[parts.length - 1];
    const id = last?.replace(".glb", "");
    if (id && id.length > 10) {
      return `https://api.readyplayer.me/v1/avatars/${id}.png`;
    }
  } catch (_) {
    /* ignore */
  }
  return null;
}

/* --------------------- prebuilt companions list --------------------- */
const COMPANION_AVATARS: ReadyPlayerMeAvatar[] = [
  { id: "adam-gentle", name: "Adam - Gentle Guide", url: "https://models.readyplayer.me/64bfa617e1b2b2a3c7c8f4d1.glb", type: "companion", thumbnail: "https://api.readyplayer.me/v1/avatars/64bfa617e1b2b2a3c7c8f4d1.png", isCustom: false },
  { id: "sarah-supportive", name: "Sarah - Supportive Friend", url: "https://models.readyplayer.me/64bfa617e1b2b2a3c7c8f4d2.glb", type: "companion", thumbnail: "https://api.readyplayer.me/v1/avatars/64bfa617e1b2b2a3c7c8f4d2.png", isCustom: false },
  { id: "alex-confident", name: "Alex - Confident Ally", url: "https://models.readyplayer.me/64bfa617e1b2b2a3c7c8f4d3.glb", type: "companion", thumbnail: "https://api.readyplayer.me/v1/avatars/64bfa617e1b2b2a3c7c8f4d3.png", isCustom: false },
  { id: "jordan-wise", name: "Jordan - Wise Mentor", url: "https://models.readyplayer.me/64bfa617e1b2b2a3c7c8f4d4.glb", type: "companion", thumbnail: "https://api.readyplayer.me/v1/avatars/64bfa617e1b2b2a3c7c8f4d4.png", isCustom: false },
];

export function ReadyPlayerMeSelector({
  onAvatarSelect,
  currentUserAvatar,
  currentCompanionAvatar,
}: ReadyPlayerMeSelectorProps) {
  const [isCreatingUserAvatar, setIsCreatingUserAvatar] = useState(false);
  const [isCreatingCompanionAvatar, setIsCreatingCompanionAvatar] = useState(false);
  const [activeTab, setActiveTab] = useState<"user" | "companion">("user");
  const [isLoading, setIsLoading] = useState(false);

  // The URLs actually used for this signed-in user (from DB)
  const [userUrl, setUserUrl] = useState<string | null>(null);           // stored (likely .glb)
  const [companionUrl, setCompanionUrl] = useState<string | null>(null); // stored (likely .glb)

  /* ----------------- load profile on mount & auth changes ----------------- */
  useEffect(() => {
    let mounted = true;

    async function fetchForCurrentUser() {
      const { data: auth } = await supabase.auth.getUser();
      const u = auth?.user;
      if (!u) {
        setUserUrl(null);
        setCompanionUrl(null);
        return;
      }
      const { data, error } = await supabase
        .from("profiles")
        .select("rpm_user_url, rpm_companion_url")
        .eq("id", u.id)
        .single();

      if (!mounted) return;
      if (error) {
        console.error("load profile error:", error);
        return;
      }
      setUserUrl(data?.rpm_user_url ?? null);
      setCompanionUrl(data?.rpm_companion_url ?? null);
    }

    // initial fetch
    fetchForCurrentUser();

    // refetch on auth change (login/logout/switch user)
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      fetchForCurrentUser();
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  
  const saveAvatarToDB = useCallback(async (type: "user" | "companion", url: string) => {
    const { data: auth } = await supabase.auth.getUser();
    const u = auth?.user;
    if (!u) {
      toast.error("Please sign in to save your avatar.");
      return;
    }

    const payload = type === "user"
      ? { id: u.id, rpm_user_url: url }
      : { id: u.id, rpm_companion_url: url };

    const { data, error } = await supabase
      .from("profiles")
      .upsert(payload, { onConflict: "id" })
      .select("rpm_user_url, rpm_companion_url")
      .single();

    if (error) {
      console.error("upsert error:", error);
      toast.error("Couldn't save avatar. Try again.");
      return;
    }

    
    setUserUrl(data?.rpm_user_url ?? null);
    setCompanionUrl(data?.rpm_companion_url ?? null);
  }, []);

  /* --------------- ReadyPlayerMe --> -->  save to DB ---------------- */
  const handleReadyPlayerMeMessage = (event: MessageEvent) => {
    let avatarUrl: string | null = null;
    if (!event?.data) return;

    if (event.data.eventName && (event.data.eventName.includes("error") || event.data.type === "error")) {
      return;
    }

    if (event.data.eventName === "v1.avatar.exported" && event.data.url) {
      avatarUrl = event.data.url;
    } else if (event.data.url && typeof event.data.url === "string") {
      avatarUrl = event.data.url;
    } else if (event.data.avatar?.url) {
      avatarUrl = event.data.avatar.url;
    } else if (typeof event.data === "string" && event.data.includes("readyplayer.me")) {
      avatarUrl = event.data;
    }

    if (!avatarUrl) return;

    // build object for parent callback (optional)
    const parts = avatarUrl.split("/");
    const last = parts[parts.length - 1] ?? "";
    const avatarId = last.replace(".glb", "");
    const newAvatar: ReadyPlayerMeAvatar = {
      id: avatarId || `custom-${Date.now()}`,
      name: `Custom ${activeTab === "user" ? "Avatar" : "Companion"}`,
      url: avatarUrl,
      type: activeTab,
      thumbnail: toThumbnail(avatarUrl) ?? undefined,
      isCustom: true,
    };

    onAvatarSelect(newAvatar, activeTab);
    void saveAvatarToDB(activeTab, avatarUrl);

    setIsCreatingUserAvatar(false);
    setIsCreatingCompanionAvatar(false);
    setIsLoading(false);

    toast.success(
      activeTab === "user" ? "🎉 Avatar saved!" : "🎉 Companion saved!",
      { description: "It will load automatically next time you sign in." }
    );
  };

  useEffect(() => {
    window.addEventListener("message", handleReadyPlayerMeMessage);
    return () => window.removeEventListener("message", handleReadyPlayerMeMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, saveAvatarToDB]);

  const openReadyPlayerMe = (type: "user" | "companion") => {
    setActiveTab(type);
    setIsLoading(true);
    if (type === "user") setIsCreatingUserAvatar(true);
    else setIsCreatingCompanionAvatar(true);
  };

  const selectCompanionAvatar = (avatar: ReadyPlayerMeAvatar) => {
    onAvatarSelect(avatar, "companion");
    void saveAvatarToDB("companion", avatar.url);
  };

  const refreshAvatar = () => {
    setIsLoading(true);
    setTimeout(() => setIsLoading(false), 800);
  };

  // db
  const userImg = toThumbnail(userUrl) || currentUserAvatar?.thumbnail || null;
  const companionImg = toThumbnail(companionUrl) || currentCompanionAvatar?.thumbnail || null;

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="mb-2">🎭 Choose Your 3D Avatars</h2>
        <p className="text-muted-foreground">Create your personal avatar and choose a companion.</p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "user" | "companion")} className="w-full">
        <TabsList className="grid w-full grid-cols-2 trauma-safe">
          <TabsTrigger value="user" className="trauma-safe gentle-focus">
            <User className="w-4 h-4 mr-2" /> Your Avatar
          </TabsTrigger>
          <TabsTrigger value="companion" className="trauma-safe gentle-focus">
            <Bot className="w-4 h-4 mr-2" /> Chat Companion
          </TabsTrigger>
        </TabsList>

        {/* User Avatar Tab */}
        <TabsContent value="user" className="mt-6">
          <Card className="trauma-safe">
            <CardHeader className="text-center">
              <CardTitle className="flex items-center justify-center space-x-2">
                <User className="w-5 h-5" />
                <span>Your Personal Avatar</span>
              </CardTitle>
              <CardDescription>Create a 3D avatar that represents you</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 rounded-lg p-6">
                <div className="flex items-center space-x-4">
                  <div className="w-20 h-20 bg-gradient-to-br from-teal-500 to-blue-500 rounded-full flex items-center justify-center shadow-lg overflow-hidden">
                    {userImg ? (
                      <img
                        src={userImg}
                        alt="Your avatar"
                        className="w-full h-full object-cover"
                        onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
                      />
                    ) : (
                      <User className="w-10 h-10 text-white" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-1">
                      <h3 className="font-medium">{currentUserAvatar?.name ?? "Your Avatar"}</h3>
                      {(userUrl || currentUserAvatar?.isCustom) && (
                        <Badge variant="secondary" className="bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300">
                          <Crown className="w-3 h-3 mr-1" />
                          Custom
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">Shown for your current login.</p>
                  </div>
                  <Button onClick={refreshAvatar} variant="outline" size="sm" className="trauma-safe gentle-focus" disabled={isLoading}>
                    <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
                  </Button>
                </div>
              </div>

              <div className="text-center">
                <Dialog open={isCreatingUserAvatar} onOpenChange={setIsCreatingUserAvatar}>
                  <DialogTrigger
                    onClick={() => openReadyPlayerMe("user")}
                    className="inline-flex items-center justify-center rounded-md text-sm font-medium
                               h-11 px-8 text-white bg-gradient-to-r from-teal-500 to-emerald-600
                               shadow-lg hover:shadow-xl hover:opacity-90 focus-visible:outline-none
                               focus-visible:ring-2 focus-visible:ring-teal-400 transition-all"
                  >
                    <Sparkles className="w-5 h-5 mr-2" />
                    {userUrl ? "🎨 Customize Avatar" : "✨ Create Your Avatar"}
                  </DialogTrigger>
                  <DialogContent className="max-w-[95vw] h-[95vh] trauma-safe">
                    <DialogHeader>
                      <DialogTitle>Create Your Avatar</DialogTitle>
                      <DialogDescription>Click “Export Avatar” to save.</DialogDescription>
                    </DialogHeader>
                    <div className="flex-1 relative">
                      {isLoading && (
                        <div className="absolute inset-0 bg-background/80 flex items-center justify-center z-10">
                          <div className="text-center">
                            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-primary" />
                            <p>Loading ReadyPlayer.me…</p>
                          </div>
                        </div>
                      )}
                      <iframe
                        src="https://readyplayer.me/avatar?frameApi"
                        className="w-full h-full rounded-lg border"
                        allow="camera *; microphone *"
                        onLoad={() => setIsLoading(false)}
                        title="ReadyPlayer.me Avatar Creator"
                        style={{ minHeight: "700px" }}
                      />
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Companion Avatar Tab */}
        <TabsContent value="companion" className="mt-6">
          <Card className="trauma-safe">
            <CardHeader className="text-center">
              <CardTitle className="flex items-center justify-center space-x-2">
                <Bot className="w-5 h-5" />
                <span>Choose Your Chat Companion</span>
              </CardTitle>
              <CardDescription>Select from pre-designed companions or create your own</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-6">
                <div className="flex items-center space-x-4">
                  <div className="w-20 h-20 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center shadow-lg overflow-hidden">
                    {companionImg ? (
                      <img
                        src={companionImg}
                        alt="Companion avatar"
                        className="w-full h-full object-cover"
                        onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
                      />
                    ) : (
                      <Bot className="w-10 h-10 text-white" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-1">
                      <h3 className="font-medium">{currentCompanionAvatar?.name ?? "Companion"}</h3>
                      {(companionUrl || currentCompanionAvatar) && (
                        <Badge variant="secondary" className="bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                          <Check className="w-3 h-3 mr-1" />
                          Active
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">Shown for your current login.</p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-medium mb-4">💫 Choose a Companion</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {COMPANION_AVATARS.map((avatar) => (
                    <Card
                      key={avatar.id}
                      className={`trauma-safe cursor-pointer border-2 transition-all duration-300 hover:border-purple-200 dark:hover:border-purple-700`}
                      onClick={() => {
                        // SAVEING
                        onAvatarSelect(avatar, "companion");
                        void saveAvatarToDB("companion", avatar.url);
                      }}
                    >
                      <CardContent className="p-6">
                        <div className="flex flex-col items-center space-y-4 text-center">
                          <div className="w-24 h-24 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center flex-shrink-0 shadow-lg overflow-hidden">
                            {avatar.thumbnail ? (
                              <img
                                src={avatar.thumbnail}
                                alt={avatar.name}
                                className="w-full h-full object-cover"
                                onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
                              />
                            ) : (
                              <Bot className="w-12 h-12 text-white" />
                            )}
                          </div>
                          <div className="w-full">
                            <div className="flex items-center justify-center space-x-2 mb-2">
                              <h4 className="font-medium">{avatar.name}</h4>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {avatar.name.includes("Gentle") && "🌱 Supportive & understanding"}
                              {avatar.name.includes("Supportive") && "💚 Friendly & encouraging"}
                              {avatar.name.includes("Confident") && "⚡ Bold & empowering"}
                              {avatar.name.includes("Wise") && "🦉 Thoughtful & insightful"}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>

              <div className="border-t pt-6">
                <div className="text-center">
                  <Dialog open={isCreatingCompanionAvatar} onOpenChange={setIsCreatingCompanionAvatar}>
                    <DialogTrigger
                      onClick={() => openReadyPlayerMe("companion")}
                      className="inline-flex items-center justify-center rounded-md text-sm font-medium h-10 px-4 py-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground trauma-safe gentle-focus"
                    >
                      <Sparkles className="w-4 h-4 mr-2" />
                      🎨 Create Custom Companion
                    </DialogTrigger>
                    <DialogContent className="max-w-[95vw] h-[95vh] trauma-safe">
                      <DialogHeader>
                        <DialogTitle>Create Custom Companion</DialogTitle>
                        <DialogDescription>Click “Export Avatar” to save.</DialogDescription>
                      </DialogHeader>
                      <div className="flex-1 relative">
                        {isLoading && (
                          <div className="absolute inset-0 bg-background/80 flex items-center justify-center z-10">
                            <div className="text-center">
                              <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-primary" />
                              <p>Loading ReadyPlayer.me…</p>
                            </div>
                          </div>
                        )}
                        <iframe
                          src="https://readyplayer.me/avatar?frameApi"
                          className="w-full h-full rounded-lg border"
                          allow="camera *; microphone *"
                          onLoad={() => setIsLoading(false)}
                          title="ReadyPlayer.me Companion Creator"
                          style={{ minHeight: "700px" }}
                        />
                      </div>
                    </DialogContent>
                  </Dialog>
                  <p className="text-xs text-muted-foreground mt-2">Advanced option for unique companions</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

```

# app/settings/page.tsx

```tsx
"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '../../components/Navbar'; 
import SettingsScreen from '../../components/SettingsScreen';

export default function SettingsPage() {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false); // Mocked login state

  const handleNavigation = (screen: string) => {
    switch (screen) {
      case 'settings':
        router.push('/settings');
        break;
      case 'profile':
        router.push('/profile');
        break;
      case 'home':
      case '/':
      case 'welcome':
        router.push('/');
        break;
      case 'chat':
        // Add chat navigation if needed
        router.push('/chat/avatar');
        break;
      default:
        console.log('Navigate to:', screen);
    }
  };

  return (
    <div>
      <Navbar 
        onNavigate={handleNavigation}
        isLoggedIn={isLoggedIn}
        currentPage="settings"
      />

      <SettingsScreen onNavigate={handleNavigation} />
    </div>
  );
}

```

# components.json

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "app/globals.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "iconLibrary": "lucide",
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}

```

# components/AvatarBuilderScreen.tsx

```tsx
import React, { useState, useCallback, useEffect } from 'react';
import { ArrowRight, User, RefreshCw } from 'lucide-react';
import { Button } from './ui/button';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseClient';

interface AvatarBuilderScreenProps {
  onNavigate: (screen: string) => void;
  onNavigateToChat: () => void;
  user?: any;
  onSaveAvatar: (avatar: any) => void;
  onSelectCompanion: (companion: "ADAM" | "EVE") => void;
}

// Convert a Ready Player Me URL (.glb) into a displayable PNG
function toThumbnail(url?: string | null): string | null {
  if (!url) return null;
  if (url.endsWith(".png")) return url;
  if (url.endsWith(".glb")) return url.replace(".glb", ".png");

  // extract avatar using png
  try {
    const last = url.split("/").pop() || "";
    const id = last.replace(".glb", "");
    if (id && id.length > 10) {
      return `https://api.readyplayer.me/v1/avatars/${id}.png`;
    }
  } catch {}
  return null;
}

// Ready Player Me avatar URLs
const readyPlayerMeAvatars = {
  adam: "https://models.readyplayer.me/68be69db5dc0cec769cfae75.glb",
  eve: "https://models.readyplayer.me/68be6a2ac036016545747aa9.glb"
};

export default function AvatarBuilderScreen({ onNavigate, onNavigateToChat, user, onSaveAvatar, onSelectCompanion }: AvatarBuilderScreenProps) {
  const [selectedAvatar, setSelectedAvatar] = useState<string>('ready-adam');
  const router = useRouter();
  const [isCreatingAvatar, setIsCreatingAvatar] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleAvatarSelect = useCallback((avatarId: string) => {
    setSelectedAvatar(avatarId);
    if (avatarId === 'eve') {
      onSelectCompanion('EVE');
    } else if (avatarId === 'ready-adam') {
      onSelectCompanion('ADAM');
    }
  }, [onSelectCompanion]);

  // Set a default companion on initial render
  useEffect(() => {
    if (readyPlayerMeAvatars.adam) {
      handleAvatarSelect('ready-adam');
    }
  }, [handleAvatarSelect]);

  const handleCreateAvatar = () => {
    setIsCreatingAvatar(true);
    setIsLoading(true);
  };

  const saveAvatarToDB = useCallback(async (url: string) => {
    const { data: auth } = await supabase.auth.getUser();
    const u = auth?.user;
    if (!u) {
      // For anonymous users, we don't save to DB, but we still want to use the avatar for the session.
      onSaveAvatar({ url });
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .upsert({ id: u.id, rpm_user_url: url }, { onConflict: "id" });

    if (error) {
      console.error("upsert error:", error);
      toast.error("Couldn't save avatar. Try again.");
      return;
    }
    
    onSaveAvatar({ url });
  }, [onSaveAvatar]);

  const handleReadyPlayerMeMessage = useCallback((event: MessageEvent) => {
    let avatarUrl: string | null = null;
    if (!event?.data) return;

    if (event.data.eventName && (event.data.eventName.includes("error") || event.data.type === "error")) {
      return;
    }

    if (event.data.eventName === "v1.avatar.exported" && event.data.url) {
      avatarUrl = event.data.url;
    } else if (event.data.url && typeof event.data.url === "string") {
      avatarUrl = event.data.url;
    } else if (event.data.avatar?.url) {
      avatarUrl = event.data.avatar.url;
    } else if (typeof event.data === "string" && event.data.includes("readyplayer.me")) {
      avatarUrl = event.data;
    }

    if (!avatarUrl) return;

    void saveAvatarToDB(avatarUrl);

    setIsCreatingAvatar(false);
    setIsLoading(false);

    toast.success("🎉 Avatar saved!", {
      description: "It will now appear as your custom avatar.",
    });
  }, [saveAvatarToDB]);

  useEffect(() => {
    window.addEventListener("message", handleReadyPlayerMeMessage);
    return () => window.removeEventListener("message", handleReadyPlayerMeMessage);
  }, [handleReadyPlayerMeMessage]);

  if (isCreatingAvatar) {
    return (
      <div className="fixed inset-0 z-50 bg-white">
        {isLoading && (
          <div className="absolute inset-0 bg-background/80 flex items-center justify-center z-10">
            <div className="text-center">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-primary" />
              <p>Loading ReadyPlayer.me…</p>
            </div>
          </div>
        )}
        <iframe
          src="https://readyplayer.me/avatar?frameApi"
          className="w-full h-full border-0"
          allow="camera *; microphone *"
          onLoad={() => setIsLoading(false)}
          title="ReadyPlayer.me Avatar Creator"
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-100 via-blue-50 to-indigo-100 flex flex-col items-center justify-center p-4">
      {/* Main Content */}
      <div className="w-full max-w-4xl text-center space-y-8">
        {/* Header */}
        <div className="space-y-4">
          <h1 className="text-3xl font-bold text-gray-900">
            Choose Your AI Avatar 🤖
          </h1>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Personalize your chat experience by selecting an avatar for your AI assistant using Ready Player Me technology! 🎮✨
          </p>
        </div>

        {/* Avatar Selection Grid */}
        <div className="flex justify-center max-w-2xl mx-auto">
          {/* Custom User Avatar - for creation, not selection */}
          <div 
            onClick={handleCreateAvatar}
            className="bg-white rounded-2xl p-8 shadow-lg cursor-pointer transition-all hover:shadow-xl"
          >
            <div className="space-y-4">
              {/* Avatar Image - Show user's custom avatar if available */}
              <div className="w-32 h-32 mx-auto bg-gradient-to-br from-orange-300 to-red-400 rounded-full flex items-center justify-center overflow-hidden">
                {user?.rpm_user_url ? (
                  <img 
                    src={toThumbnail(user.rpm_user_url) || ""} 
                    alt="Your Custom Avatar"
                    className="w-full h-full object-cover rounded-full"
                    onError={(e) => {
                      // Fallback to icon if image fails to load
                      e.currentTarget.style.display = 'none';
                      const nextElement = e.currentTarget.nextElementSibling as HTMLElement;
                      if (nextElement) {
                        nextElement.style.display = 'flex';
                      }
                    }}
                  />
                ) : null}
                <div className={`w-28 h-28 bg-orange-200 rounded-full flex items-center justify-center ${user?.rpm_user_url ? 'hidden' : ''}`}>
                  <User className="w-16 h-16 text-orange-600" />
                </div>
              </div>
              
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {user?.rpm_user_url ? 'Your Custom Avatar' : 'Create Custom Avatar'}
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  {user?.rpm_user_url ? 'Ready Player Me Avatar' : 'Click to create with Ready Player Me'}
                </p>
                {!user?.rpm_user_url && (
                  <div className="mt-3">
                    <span className="inline-block px-3 py-1 bg-purple-100 text-purple-700 text-xs rounded-full">
                      ✨ Create Your Own
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>

        {/* Ready-Made Avatars Section */}
        <div className="space-y-6">
          <h2 className="text-xl font-semibold text-gray-900">
            Select Your AI Companion
          </h2>
          
          <div className="grid md:grid-cols-2 gap-6 max-w-2xl mx-auto">
            {/* Adam */}
            <div 
              onClick={() => handleAvatarSelect('ready-adam')}
              className={`bg-white rounded-2xl p-6 shadow-lg cursor-pointer transition-all ${
                selectedAvatar === 'ready-adam' 
                  ? 'ring-4 ring-blue-300 shadow-xl' 
                  : 'hover:shadow-xl'
              }`}
            >
              <div className="space-y-3">
                <div className="w-32 h-32 mx-auto bg-gradient-to-br from-blue-300 to-indigo-400 rounded-full overflow-hidden flex items-center justify-center">
                  <img 
                    src={toThumbnail(readyPlayerMeAvatars.adam) || ""}
                    alt="Adam Avatar"
                    className="w-full h-full object-cover rounded-full"
                    onError={(e) => {
                      // Fallback to icon if image fails to load
                      e.currentTarget.style.display = 'none';
                      const nextElement = e.currentTarget.nextElementSibling as HTMLElement;
                      if (nextElement) {
                        nextElement.style.display = 'block';
                      }
                    }}
                  />
                  <User className="w-12 h-12 text-blue-700 hidden" />
                </div>
                <div>
                  <h3 className="text-lg font-medium text-gray-900">Adam</h3>
                  <p className="text-xs text-gray-500">Ready Player Me Avatar</p>
                </div>
                {selectedAvatar === 'ready-adam' && (
                  <div className="mt-2">
                    <span className="inline-block px-3 py-1 bg-green-100 text-green-800 text-sm rounded-full">
                      Selected
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Eve */}
            <div 
              onClick={() => handleAvatarSelect('eve')}
              className={`bg-white rounded-2xl p-6 shadow-lg cursor-pointer transition-all ${
                selectedAvatar === 'eve' 
                  ? 'ring-4 ring-blue-300 shadow-xl' 
                  : 'hover:shadow-xl'
              }`}
            >
              <div className="space-y-3">
                <div className="w-32 h-32 mx-auto bg-gradient-to-br from-pink-300 to-purple-400 rounded-full overflow-hidden flex items-center justify-center">
                  <img 
                    src={toThumbnail(readyPlayerMeAvatars.eve) || ""}
                    alt="Eve Avatar"
                    className="w-full h-full object-cover rounded-full"
                    onError={(e) => {
                      // Fallback to icon if image fails to load
                      e.currentTarget.style.display = 'none';
                      const nextElement = e.currentTarget.nextElementSibling as HTMLElement;
                      if (nextElement) {
                        nextElement.style.display = 'block';
                      }
                    }}
                  />
                  <User className="w-12 h-12 text-pink-700 hidden" />
                </div>
                <div>
                  <h3 className="text-lg font-medium text-gray-900">Eve</h3>
                  <p className="text-xs text-gray-500">Ready Player Me Avatar</p>
                </div>
                {selectedAvatar === 'eve' && (
                  <div className="mt-2">
                    <span className="inline-block px-3 py-1 bg-green-100 text-green-800 text-sm rounded-full">
                      Selected
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Start Chatting Button */}
        <div className="pt-2">
          <Button 
            onClick={onNavigateToChat}
            className="bg-emerald-200 hover:bg-emerald-300 text-emerald-700 py-4 rounded-full text-lg font-semibold transition-all hover:shadow-lg flex items-center mx-auto h-10 w-50"
            // style={{ minWidth: '20px', paddingLeft: '100px', paddingRight: '100px' }}
          >
            Start Chatting
            <ArrowRight className="ml-0.5 h-6 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
```

# components/chat/AvatarDisplay.tsx

```tsx
'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { User, Bot } from 'lucide-react';

const RpmViewer = dynamic(() => import('./RpmViewer'), { ssr: false });

type Avatar = { name?: string; url?: string | null };

export default function AvatarDisplay({
  userAvatar,
  aiAvatar,
  assistantTalking = false,
}: {
  userAvatar: Avatar;
  aiAvatar: Avatar;
  assistantTalking?: boolean; // pass isTyping here if you want AI mouth to move
}) {
  const hasAny = !!userAvatar?.url || !!aiAvatar?.url;

  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-4">
      <div className="w-full h-[85%] max-h-[450px] rounded-lg overflow-hidden shadow-inner bg-black/5">
        {hasAny ? (
          <RpmViewer
            userUrl={userAvatar.url ?? null}
            aiUrl={aiAvatar.url ?? null}
            assistantTalking={assistantTalking}
          />
        ) : (
          <div className="w-full h-full bg-gray-200 flex items-center justify-center rounded-lg gap-8">
            <User className="w-24 h-24 text-gray-400" />
            <Bot className="w-24 h-24 text-gray-400" />
          </div>
        )}
      </div>

      <div className="w-full flex justify-around mt-2">
        <p className="w-1/2 text-center font-medium text-gray-700">{userAvatar?.name ?? 'You'}</p>
        <p className="w-1/2 text-center font-medium text-gray-700">{aiAvatar?.name ?? 'Adam'}</p>
      </div>
    </div>
  );
}

```

# components/chat/ChatHeader.tsx

```tsx
"use client";

import React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Badge } from "../ui/badge";

interface ChatHeaderProps {
  currentMood?: {
    feeling: string;
    intensity: number;
    reason?: string;
    support?: string;
    timestamp: Date;
  } | null;
  chatMode: "avatar" | "standard";
  companionName: string;
  companionAvatarUrl?: string | null;
}

// Subtle pastel styles for moods
const feelings = [
  { emoji: "😊", label: "Happy", color: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  { emoji: "😌", label: "Calm", color: "bg-teal-100 text-teal-700 border-teal-200" },
  { emoji: "😔", label: "Sad", color: "bg-blue-100 text-blue-700 border-blue-200" },
  { emoji: "😰", label: "Anxious", color: "bg-purple-100 text-purple-700 border-purple-200" },
  { emoji: "😤", label: "Frustrated", color: "bg-red-100 text-red-700 border-red-200" },
  { emoji: "😴", label: "Tired", color: "bg-gray-100 text-gray-700 border-gray-300" },
  { emoji: "🤔", label: "Confused", color: "bg-indigo-100 text-indigo-700 border-indigo-200" },
  { emoji: "😐", label: "Neutral", color: "bg-gray-100 text-gray-700 border-gray-300" },
];

function toThumbnail(url?: string | null): string | null {
  if (!url) return null;
  if (url.endsWith(".png")) return url;
  if (url.endsWith(".glb")) return url.replace(".glb", ".png");

  // extract avatar id and use the official PNG endpoint
  try {
    const last = url.split("/").pop() || "";
    const id = last.replace(".glb", "");
    if (id && id.length > 10) {
      return `https://api.readyplayer.me/v1/avatars/${id}.png`;
    }
  } catch {}
  return null;
}

export default function ChatHeader({ currentMood, chatMode, companionName, companionAvatarUrl }: ChatHeaderProps) {
  const moodConfig = feelings.find(
    (f) => f.label.toLowerCase() === currentMood?.feeling.toLowerCase()
  );
  const companionThumbnail = toThumbnail(companionAvatarUrl);

  return (
    <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-200">
      {/* Left side: AI Companion info */}
      <div className="flex items-center space-x-3">
        <Avatar className="h-10 w-10">
          <AvatarImage src={companionThumbnail ?? "/adam-avatar.png"} alt={companionName} />
          <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-500 text-white">
            {companionName.charAt(0)}
          </AvatarFallback>
        </Avatar>

        <div>
          <h2 className="font-semibold text-gray-900">{companionName} - Your AI Companion</h2>
          <div className="flex items-center space-x-2 text-sm text-gray-500">
            <span>{chatMode === "avatar" ? "Avatar Chat Mode" : "Standard Chat Mode"}</span>
            <span>•</span>
            <span>Safe & Private</span>
          </div>
        </div>
      </div>

      {/* Right side: Mood badge */}
      <div className="flex items-center space-x-3">
        {currentMood && moodConfig && (
          <Badge
            className={`px-3 py-1 rounded-full ${moodConfig.color}`}
            variant="outline"
          >
            <span className="mr-1">{moodConfig.emoji}</span>
            {currentMood.feeling}
          </Badge>
        )}
      </div>
    </div>
  );
}

```

# components/chat/global.d.ts

```ts
declare namespace JSX {
  interface IntrinsicElements {
    'visage-viewer': React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement>,
      HTMLElement
    > & {
      src?: string;
      style?: React.CSSProperties;
      environment?: 'soft' | 'studio' | 'neutral' | string;
      'idle-rotation'?: boolean;
      scale?: number;
      'camera-initial-distance'?: number;
      'camera-orbit'?: string;
    };
  }
}

```

# components/chat/MessageInput.tsx

```tsx
"use client";

import React, { KeyboardEvent } from 'react';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Switch } from '../ui/switch';
import { Send, Smile } from 'lucide-react';

interface MessageInputProps {
  value: string;                          // current text in the input
  onChange: (value: string) => void;      // called when input changes
  onSendMessage: (content: string) => void; // called when message is sent
  isAnonymous: boolean;                   // whether user is in anonymous mode
  onToggleAnonymous: (anonymous: boolean) => void; // toggles anonymous mode
  disabled?: boolean;                     // disable input during AI typing
}

export default function MessageInput({
  value,
  onChange,
  onSendMessage,
  isAnonymous,
  onToggleAnonymous,
  disabled = false
}: MessageInputProps) {
  
  /**
   * Handle Enter key press
   * - Enter = send message
   * - Shift+Enter = new line
   */
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  /**
   * Handle clicking the Send button or pressing Enter
   * Only sends if value is not empty and not disabled
   */
  const handleSend = () => {
    if (value.trim() && !disabled) {
      onSendMessage(value);
      onChange(''); // clear the input after sending
    }
  };

  return (
    <div className="border-t border-gray-200 bg-white px-6 py-4">
      {/* Anonymous Mode Toggle */}
      <div className="flex items-center justify-end mb-3">
        <div className="flex items-center space-x-2 text-sm text-gray-600">
          <span>Anonymous mode:</span>
          <Switch
            checked={isAnonymous}
            onCheckedChange={onToggleAnonymous}
            className="data-[state=checked]:bg-green-500"
          />
        </div>
      </div>

      {/* Input Area */}
      <div className="flex items-end space-x-3">
        {/* Emoji Button (non-functional placeholder) */}
        <Button 
          variant="ghost" 
          size="sm" 
          className="mb-2 p-2 h-auto"
          disabled={disabled}
        >
          <Smile className="h-5 w-5 text-gray-500" />
        </Button>

        {/* Textarea for message input */}
        <div className="flex-1">
          <Textarea
            placeholder="Type your message here... (Press Enter to Send)"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            className="min-h-[44px] max-h-32 resize-none border-gray-300 focus:border-blue-500 focus:ring-blue-500"
          />
        </div>

        {/* Send Button */}
        <Button
          onClick={handleSend}
          disabled={!value.trim() || disabled}
          className="mb-2 bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-full"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>

      {/* Helper Text (shows shortcuts) */}
      <div className="mt-2 text-xs text-gray-500 text-center">
        Your messages are private and secure. Press Enter to send, Shift+Enter for new line.
      </div>
    </div>
  );
}

```

# components/chat/MessageList.tsx

```tsx
"use client";

import React, { useEffect, useRef } from "react";
import { ScrollArea } from "../ui/scroll-area";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { User } from "lucide-react";

interface Message {
  id: string;
  sender: "user" | "ai";
  content: string;
  timestamp: Date;
  type?: "safety-check" | "escalation" | "normal" | "mood-aware";
  anonymous?: boolean;
}

interface MessageListProps {
  messages: Message[];
  isTyping: boolean;
  chatMode: "avatar" | "standard";
}

export default function MessageList({ messages, isTyping }: MessageListProps) {
  // Auto-scroll helpers 
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  // Small util for timestamps
  const formatTime = (timestamp: Date) =>
    timestamp.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

  // Single bubble component
  const MessageBubble = ({ message }: { message: Message }) => {
    const isAI = message.sender === "ai";

    return (
      <div
        className={`flex items-start space-x-3 ${
          isAI ? "" : "flex-row-reverse space-x-reverse"
        } mb-6`}
      >
        {/* Avatar */}
        <Avatar className="h-8 w-8 flex-shrink-0">
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

        {/* Bubble + meta */}
        <div
          className={`flex flex-col max-w-xs lg:max-w-md ${
            isAI ? "items-start" : "items-end"
          }`}
        >
          <div
            className={`px-4 py-3 rounded-2xl ${
              isAI
                ? "bg-gray-100 text-gray-900 rounded-tl-sm"
                : "bg-blue-500 text-white rounded-tr-sm"
            }`}
          >
            <p className="text-sm leading-relaxed whitespace-pre-wrap">
              {message.content}
            </p>
          </div>

          {/* timestamp + anonymous badge */}
          <div className="flex items-center space-x-2 mt-1 px-1 text-xs text-gray-500">
            <span>{formatTime(message.timestamp)}</span>
            {!isAI && message.anonymous && (
              <span className="px-2 py-0.5 rounded-full bg-gray-200 text-gray-700">
                Anonymous
              </span>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Typing indicator bubble
  const TypingIndicator = () => (
    <div className="flex items-start space-x-3 mb-6">
      <Avatar className="h-8 w-8 flex-shrink-0">
        <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-500 text-white text-xs">
          A
        </AvatarFallback>
      </Avatar>

      <div className="bg-gray-100 px-4 py-3 rounded-2xl rounded-tl-sm max-w-xs">
        <div className="flex space-x-1">
          <div
            className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
            style={{ animationDelay: "0ms" }}
          />
          <div
            className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
            style={{ animationDelay: "150ms" }}
          />
          <div
            className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
            style={{ animationDelay: "300ms" }}
          />
        </div>
      </div>
    </div>
  );

  // Scrollable area
  return (
    <div className="flex-1 min-h-0">
      <ScrollArea className="h-full px-6">
        <div className="py-6 space-y-4">
          {/* actually render messages here */}
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}

          {isTyping && <TypingIndicator />}

          {/* Keeps scroll pinned to bottom */}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>
    </div>
  );
}

```

# components/chat/RpmModel.tsx

```tsx
'use client';
import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useGLTF, useAnimations } from '@react-three/drei';

type Props = {
  src?: string | null;
  /** place in world */
  position?: [number, number, number];
  /** face roughly this yaw (radians) */
  yaw?: number;
  /** world-space target to look at (head only) */
  lookAt?: THREE.Vector3 | null;
  /** adds subtle “talking” micro-motions */
  talk?: boolean;
  /** overall scale */
  scale?: number;
};

export default function RpmModel({
  src,
  position = [0, 0, 0],
  yaw = 0,
  lookAt = null,
  talk = false,
  scale = 1.0,
}: Props) {
  const group = useRef<THREE.Group>(null);

  // If you have a favorite idle/talk animation GLB, append it like:
  // const url = useMemo(() => src ? `${src}?animations=${encodeURIComponent(talkAnimUrl)},${encodeURIComponent(idleAnimUrl)}` : null, [src]);
  const url = useMemo(() => (src ? (src.endsWith('.glb') ? src : `${src}.glb`) : null), [src]);

  const { scene, animations } = useGLTF(url || '', true);
  const cloned = useMemo(() => scene.clone(), [scene]);
  const { actions } = useAnimations(animations, group);

  // Try to find head (RPM rigs usually have “Head”)
  const headRef = useRef<THREE.Bone | null>(null);
  useEffect(() => {
    let found: THREE.Bone | null = null;
    cloned.traverse((o: any) => {
      if (!found && o.type === 'Bone' && /HeadTop_End|Head/i.test(o.name)) found = o as THREE.Bone;
    });
    headRef.current = found;
  }, [cloned]);

  // Start any included animation (safe even if none exist)
  useEffect(() => {
    const name = Object.keys(actions)[0];
    if (name) actions[name]?.reset().fadeIn(0.25).play();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actions]);

  // Idle + head look and talk wobble
  const tmpTarget = useMemo(() => new THREE.Vector3(), []);
  useFrame((state, dt) => {
    const g = group.current;
    if (!g) return;

    // very subtle idle sway
    const t = state.clock.elapsedTime;
    g.rotation.y = THREE.MathUtils.damp(g.rotation.y, yaw, 6, dt);
    g.position.y = 0.02 * Math.sin(t * 1.2);

    // head look-at
    const head = headRef.current;
    if (head && lookAt) {
      tmpTarget.copy(lookAt);
      head.parent?.worldToLocal(tmpTarget); // to head's parent space
      const dir = tmpTarget.sub(head.position).normalize();
      const yawWanted = Math.atan2(dir.x, dir.z);                // left/right
      const pitchWanted = Math.asin(THREE.MathUtils.clamp(dir.y, -0.6, 0.6)); // up/down

      head.rotation.y = THREE.MathUtils.damp(head.rotation.y, THREE.MathUtils.clamp(yawWanted, -0.6, 0.6), 10, dt);
      head.rotation.x = THREE.MathUtils.damp(head.rotation.x, THREE.MathUtils.clamp(-pitchWanted, -0.35, 0.35), 10, dt);
    }

    // simple “talking” micro-motion (head bob & tiny wrist jiggle)
    if (talk && head) {
      head.rotation.z = 0.03 * Math.sin(t * 6);
    }
  });

  return (
    <group ref={group} position={position} scale={scale}>
      {/* drop the body slightly so feet sit in frame nicely */}
      <group position={[0, -0.9, 0]}>
        <primitive object={cloned} />
      </group>
    </group>
  );
}

useGLTF.preload('/noop.glb'); // harmless; keeps hooks happy if src briefly undefined

```

# components/chat/RpmViewer.tsx

```tsx
'use client';
import React, { Suspense, useMemo } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { Environment, OrbitControls } from '@react-three/drei';
import RpmModel from './RpmModel';

type Props =
  | { src?: string | null; userUrl?: never; aiUrl?: never; assistantTalking?: boolean } // single
  | { src?: never; userUrl?: string | null; aiUrl?: string | null; assistantTalking?: boolean }; // duo

export default function RpmViewer(props: Props) {
  // treat as DUO whenever at least one of the two urls is non-null
  const userUrl = (props as any).userUrl ?? null;
  const aiUrl   = (props as any).aiUrl ?? null;
  const duo = userUrl != null || aiUrl != null;

  // layout
  const leftPos:  [number, number, number] = [-0.6, 0, 0];
  const rightPos: [number, number, number] = [ 0.6, 0, 0];
  const leftYaw  = -Math.PI / 2 + 0.08;
  const rightYaw =  Math.PI / 2 - 0.08;

  // world targets for subtle head look-at
  const rightTarget = useMemo(() => new THREE.Vector3(...rightPos), []); // user looks to the right (AI)
  const leftTarget  = useMemo(() => new THREE.Vector3(...leftPos),  []); // AI looks to the left (user)

  const camera = duo
    ? { position: [0, 1.35, 2.8] as [number, number, number], fov: 30 }
    : { position: [0, 1.35, 2.6] as [number, number, number], fov: 30 };

  // helpful debug
  // console.debug('[RpmViewer] duo?', duo, { userUrl, aiUrl });

  return (
    <Canvas camera={camera}>
      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 5, 2]} intensity={0.85} />

      <Suspense fallback={null}>
        {duo ? (
          <>
            {/* USER (left) */}
            {userUrl && (
              <RpmModel
                src={userUrl}
                position={leftPos}
                yaw={leftYaw}
                lookAt={rightTarget}
                talk={false}
                scale={1}
              />
            )}

            {/* AI (right) */}
            {aiUrl && (
              <RpmModel
                src={aiUrl}
                position={rightPos}
                yaw={rightYaw}
                lookAt={leftTarget}
                talk={!!(props as any).assistantTalking}
                scale={1}
              />
            )}
          </>
        ) : (
          // Single
          <RpmModel src={(props as any).src} position={[0, 0, 0]} yaw={0} talk={false} />
        )}

        <Environment preset="city" />
      </Suspense>

      <OrbitControls
        makeDefault
        enablePan={false}
        target={[0, 1.1, 0]}
        minDistance={1.8}
        maxDistance={3.5}
        minPolarAngle={Math.PI / 3}
        maxPolarAngle={Math.PI / 1.9}
      />
    </Canvas>
  );
}

```

# components/chat/SafetyIndicator.tsx

```tsx
"use client";

import React from 'react';
import { Shield, Heart, Lock } from 'lucide-react';

/**
 * SafetyIndicators
 * Shows reassurance indicators (safety, confidentiality, trauma-informed)
 * Helps build trust in the chat experience
 */
export default function SafetyIndicators() {
  // List of safety indicator items
  const indicators = [
    {
      icon: Shield,
      text: "Safety & Support",
      iconColor: "text-green-600"
    },
    {
      icon: Lock,
      text: "Confidential conversation", 
      iconColor: "text-orange-600"
    },
    {
      icon: Heart,
      text: "Trauma-informed responses",
      iconColor: "text-green-600"
    }
  ];

  return (
    <div className="space-y-2">
      {/* Loop through indicators and render each */}
      {indicators.map((indicator, index) => {
        const IconComponent = indicator.icon;
        return (
          <div 
            key={index} 
            className="flex items-center space-x-3"
          >
            {/* Icon with color */}
            <IconComponent className={`h-4 w-4 ${indicator.iconColor}`} />
            
            {/* Label text */}
            <span className="text-sm text-gray-700">
              {indicator.text}
            </span>
          </div>
        );
      })}
    </div>
  );
}

```

# components/chat/Sidebar.tsx

```tsx
"use client";

import React from "react";
import { Button } from "../ui/button";
// Make sure the filename matches: if your file is SafetyIndicators.tsx,
// this path should be "./SafetyIndicators"
import SafetyIndicator from "./SafetyIndicator";

import { Toaster, toast } from "sonner";
import { Phone, User, Settings, FileText, LogOut, Heart } from "lucide-react";

interface SidebarProps {
  onNavigate: (screen: string) => void;
  onInjectMessage?: (content: string) => void;
}

export default function Sidebar({ onNavigate, onInjectMessage }: SidebarProps) {
  // --- Support actions ---
  const handleCrisisSupport = () => {
    onInjectMessage?.(
      "If you’re in immediate danger, please contact emergency services (000) or Lifeline (13 11 14). I’m here with you — you’re not alone."
    );
  };

  const handleFindCounselor = () => {
    onInjectMessage?.(
      "Yes, connecting with a counselor could be helpful. Would you like me to share a few youth-friendly, trauma-informed contacts?"
    );
  };

  const handlePreferences = () => {
    onNavigate("settings");
  };

  const handleShareConversation = () => {
    toast("Opening summary", {
      description: "Preparing your conversation summary…",
    });
    setTimeout(() => onNavigate("summary"), 600);
  };

  const handleEndChat = () => {
    toast("Chat ended", {
      description: "Thanks for chatting. Redirecting to Home…",
    });
    setTimeout(() => onNavigate("home"), 600);
  };

  return (
    <aside className="w-80 shrink-0 bg-gray-50 border-r border-gray-200 flex flex-col">
      <div className="p-5 space-y-6">
        {/* Safety block */}
        <SafetyIndicator/>

        <div className="border-t border-gray-200" />

        {/* Need more help */}
        <div className="flex items-center text-gray-900">
          <Heart className="h-4 w-4 mr-2 text-rose-500" />
          <h3 className="font-semibold">Need more help?</h3>
        </div>

        <div className="space-y-3">
          <Button
            onClick={handleCrisisSupport}
            variant="outline"
            className="w-full justify-start border-red-200 text-red-600 hover:bg-red-50"
          >
            <Phone className="h-4 w-4 mr-2" />
            Crisis Support
          </Button>

          <Button
            onClick={handleFindCounselor}
            variant="outline"
            className="w-full justify-start"
          >
            <User className="h-4 w-4 mr-2" />
            Find Counselor
          </Button>

          <Button
            onClick={handlePreferences}
            variant="outline"
            className="w-full justify-start"
          >
            <Settings className="h-4 w-4 mr-2" />
            Preferences
          </Button>

          <Button
            onClick={handleShareConversation}
            variant="outline"
            className="w-full justify-start"
          >
            <FileText className="h-4 w-4 mr-2" />
            Share Conversation
          </Button>

          <Button
            onClick={handleEndChat}
            variant="outline"
            className="w-full justify-start border-red-200 text-red-600 hover:bg-red-50"
          >
            <LogOut className="h-4 w-4 mr-2" />
            End Chat
          </Button>
        </div>

        {/* tiny session stats */}
        <div className="border-t border-gray-200 pt-4 space-y-2 text-xs text-gray-600">
          <div className="flex justify-between">
            <span>Session time:</span>
            <span>15 minutes</span>
          </div>
          <div className="flex justify-between">
            <span>Messages:</span>
            <span>12</span>
          </div>
          <div className="flex justify-between">
            <span>Status:</span>
            <span className="text-green-600">Secure</span>
          </div>
        </div>
      </div>

      {/* Mount sonner toasts (you can move this to app/layout.tsx if you prefer global) */}
      <Toaster position="bottom-center" richColors />
    </aside>
  );
}

```

# components/chat/VisageWrapper.tsx

```tsx
'use client';
import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';

type VisageEl = HTMLElement & { src?: string; model?: string };

type Props = React.DetailedHTMLProps<
  React.HTMLAttributes<HTMLElement>,
  HTMLElement
> & {
  /** Direct .glb URL */
  src?: string;
};

const VisageWrapper: React.FC<Props> = ({ src, className, style, ...rest }) => {
  const ref = useRef<VisageEl | null>(null);
  const [loading, setLoading] = useState<boolean>(!!src);

  useEffect(() => {
    import('@readyplayerme/visage').catch((e) =>
      console.error('[VisageWrapper] import failed', e)
    );
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const url = src ? (src.endsWith('.glb') ? src : `${src}.glb`) : undefined;

    const done = () => setLoading(false);
    const fail = (e: Event) => {
      setLoading(false);
      console.error('[VisageWrapper] model load error', e);
    };

    const doneEvents = ['model-load-complete', 'model-loaded', 'ready', 'load'];
    const errEvents = ['model-load-error', 'error'];

    doneEvents.forEach((n) => el.addEventListener(n, done as EventListener));
    errEvents.forEach((n) => el.addEventListener(n, fail as EventListener));
    const safety = window.setTimeout(done, 4000);

    if (url) {
      console.log('[VisageWrapper] applying src =', url);
      // set as attribute and property (and alternative name 'model' just in case)
      el.setAttribute('src', url);
      try { (el as any).src = url; } catch {}
      try { (el as any).model = url; } catch {}
      setLoading(true);
    } else {
      console.log('[VisageWrapper] no src');
      setLoading(false);
    }

    return () => {
      window.clearTimeout(safety);
      doneEvents.forEach((n) => el.removeEventListener(n, done as EventListener));
      errEvents.forEach((n) => el.removeEventListener(n, fail as EventListener));
    };
  }, [src]);

  return (
    <div className={`relative ${className ?? ''}`} style={{ minHeight: 260, ...style }}>
      {loading && (
        <div className="absolute inset-0 z-10 grid place-items-center bg-black/5">
          <RefreshCw className="h-7 w-7 animate-spin text-gray-400" />
        </div>
      )}
      <visage-viewer
        ref={ref}
        key={src || 'empty'}
        style={{
          width: '100%',
          height: '100%',
          opacity: loading ? 0 : 1,
          transition: 'opacity .25s',
        }}
        {...rest}
      />
    </div>
  );
};

export default VisageWrapper;

```

# components/ChatInterfaceScreen.tsx

```tsx
// components/ChatInterfaceScreen.tsx
"use client";

import React, { useMemo, useState } from "react";
import AvatarDisplay from "./chat/AvatarDisplay";
import ChatHeader from "./chat/ChatHeader";
import MessageList from "./chat/MessageList";
import MessageInput from "./chat/MessageInput";
import Sidebar from "./chat/Sidebar";
import Navbar from "./Navbar";

export type DbMessage = {
  id: string;
  conversation_id: string;
  sender_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
};

type UIMsg = {
  id: string;
  sender: "user" | "ai";
  content: string;
  timestamp: Date;
  type?: "safety-check" | "escalation" | "normal" | "mood-aware";
  anonymous?: boolean;
};

type User = {
  id: string;
  username: string;
  avatar?: Avatar;
};

type Avatar = {
  name: string;
  type: 'custom' | 'default';
  url?: string | null;
};

type ChatInterfaceScreenProps = {
  onNavigate: (screen: string) => void;
  chatMode: "avatar" | "standard";
  user?: User;
  companionAvatar?: Avatar;
  currentMood?: {
    feeling: string;
    intensity: number;
    reason?: string;
    support?: string;
    timestamp: Date;
  } | null;
  onSend?: (text: string) => void;
  messages?: DbMessage[];     // from DB (page)
  isTyping?: boolean;
};

function moodGreeting(companionName: string, mood?: ChatInterfaceScreenProps["currentMood"]) {
  if (!mood || !mood.feeling) {
    return `Hi there! I'm ${companionName}, your Avatar Companion. I'm here to listen and support you in a safe, confidential space. How are you feeling today?`;
  }
  const feeling = mood.feeling.toLowerCase();
  const intensity = mood.intensity;
  if (["happy", "calm"].includes(feeling)) {
    return `Hi! I'm ${companionName}. I can see you're feeling ${feeling} — that's wonderful. What's been going well today?`;
  }
  if (["sad", "anxious"].includes(feeling)) {
    const supportLevel = intensity > 3 ? "really" : "a bit";
    return `Hello, I'm ${companionName}. I understand you're feeling ${supportLevel} ${feeling}. Thank you for sharing — I'm here to listen and support you.`;
  }
  if (feeling === "frustrated") {
    return `Hi there, I'm ${companionName}. Feeling frustrated is understandable. I'm here without judgment if you'd like to talk it through.`;
  }
  if (feeling === "tired") {
    return `Hello, I'm ${companionName}. It sounds like you're feeling tired. I'm here for you — share as much or as little as you like.`;
  }
  return `Hi! I'm ${companionName}. Thanks for letting me know you're feeling ${feeling}. What would be most helpful for you today?`;
}

export function ChatInterfaceScreen({
  onNavigate,
  chatMode,
  user = { id: 'anon', username: 'You', avatar: { name: 'User', type: 'default', url: null } },
  companionAvatar = { name: 'Adam', type: 'default', url: "https://models.readyplayer.me/68be69db5dc0cec769cfae75.glb" },
  currentMood,
  onSend,
  messages = [],
  isTyping = false,
}: ChatInterfaceScreenProps) {
  const [inputValue, setInputValue] = useState("");
  const [uiOnlySystem, setUiOnlySystem] = useState<UIMsg[]>([]); // sidebar-injected notes (not persisted)

  // Transform DB rows -> UI rows expected by MessageList
  const uiFromDb: UIMsg[] = useMemo(
    () =>
      messages.map((m) => ({
        id: m.id,
        sender: m.role === "assistant" ? "ai" : "user",
        content: m.content,
        timestamp: new Date(m.created_at),
        type: m.role === "system" ? "safety-check" : "normal",
      })),
    [messages]
  );

  // If no DB messages yet, show a one-time greeting
  const allMessages: UIMsg[] = useMemo(() => {
    if (uiFromDb.length === 0) {
      return [
        {
          id: "greeting",
          sender: "ai",
          content: moodGreeting(companionAvatar.name, currentMood || undefined),
          timestamp: new Date(),
          type: currentMood ? "mood-aware" : "normal",
        },
        ...uiOnlySystem,
      ];
    }
    return [...uiFromDb, ...uiOnlySystem];
  }, [uiFromDb, uiOnlySystem, currentMood, companionAvatar.name]);

  // Sidebar “inject” message (UI-only)
  const injectSystemMessage = (content: string) => {
    setUiOnlySystem((prev) => [
      ...prev,
      {
        id: `sys_${Date.now()}`,
        sender: "ai",
        content,
        timestamp: new Date(),
        type: "escalation",
      },
    ]);
  };

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-purple-100 via-pink-50 to-blue-100">
      <Navbar onNavigate={onNavigate} isLoggedIn={!!user && user.id !== 'anon'} />

      <div className="flex-1 flex overflow-hidden min-h-0">
        <Sidebar onNavigate={onNavigate} onInjectMessage={injectSystemMessage} />

        {chatMode === "avatar" && (
          <div className="flex items-center justify-center w-[40%] border-r border-gray-200 bg-gradient-to-br from-purple-50 to-pink-50">
            <AvatarDisplay
              userAvatar={{
                name: user?.avatar?.name ?? 'User',
                url: user?.avatar?.url ?? undefined // ensure url is string | undefined
              }}
              aiAvatar={{
                name: companionAvatar?.name ?? 'Adam',
                url: companionAvatar?.url ?? undefined // ensure url is string | undefined
              }}
            />
          </div>
        )}

        <div className="flex-1 flex flex-col bg-white min-h-0">
          <ChatHeader
            currentMood={currentMood}
            chatMode={chatMode}
            companionName={companionAvatar.name}
            companionAvatarUrl={companionAvatar.url}
          />

          <MessageList messages={allMessages} isTyping={isTyping} chatMode={chatMode} />

          <MessageInput
            value={inputValue}
            onChange={setInputValue}
            onSendMessage={(text) => {
              const t = text.trim();
              if (!t) return;
              (onSend ?? (() => {}))(t);
              setInputValue("");
            }}
            isAnonymous={user.id === 'anon'}
            onToggleAnonymous={() => {}}
            disabled={false}
          />
        </div>
      </div>
    </div>
  );
}
```

# components/conversation.tsx

```tsx
// components/ConversationList.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { getSessionUserId } from '@/lib/auth';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Search } from 'lucide-react';

type ConversationRow = {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
};

type MessagePreview = { conversation_id: string; content: string; created_at: string };
type LastByConvo = Record<string, MessagePreview>;

type Props = {
  /** Called when user clicks a conversation or “Continue” */
  onSelect: (conversationId: string) => void;
  /** Show search box */
  showSearch?: boolean;
  /** Limit number of rows (default: 50) */
  limit?: number;
  /** If false, will show *all* convos the user can read (creator or participant). Default: true (creator only). */
  mineOnly?: boolean;
  /** Optional className for outer container */
  className?: string;
};

export default function ConversationList({
  onSelect,
  showSearch = true,
  limit = 50,
  mineOnly = true,
  className,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<ConversationRow[]>([]);
  const [last, setLast] = useState<LastByConvo>({});
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);

      const uid = await getSessionUserId();
      if (!uid) {
        setRows([]);
        setLast({});
        setLoading(false);
        return;
      }

      // 1) fetch conversations
      let convosRes;
      if (mineOnly) {
        convosRes = await supabase
          .from('conversations')
          .select('id, title, created_at, updated_at, created_by')
          .eq('created_by', uid)
          .order('updated_at', { ascending: false })
          .limit(limit);
      } else {
        // creator OR participant (if you are using conversation_participants)
        convosRes = await supabase
          .rpc('convos_for_user', { p_user: uid }); // optional: create this RPC for speed
        // fallback (no RPC): do two queries & merge – omitted for brevity
      }

      if (cancelled) return;
      if ('error' in convosRes && convosRes.error) {
        setErr(convosRes.error.message);
        setRows([]);
        setLoading(false);
        return;
      }

      const convos: ConversationRow[] =
        'data' in convosRes ? (convosRes.data as any[]) : [];
      setRows(convos ?? []);

      // 2) fetch last message previews (simple approach)
      const ids = convos.map((c) => c.id);
      if (ids.length) {
        const { data: msgs, error: mErr } = await supabase
          .from('messages')
          .select('conversation_id, content, created_at')
          .in('conversation_id', ids)
          .order('created_at', { ascending: false });

        if (!cancelled && !mErr && msgs) {
          const firstByConvo: LastByConvo = {};
          for (const m of msgs as MessagePreview[]) {
            if (!firstByConvo[m.conversation_id]) firstByConvo[m.conversation_id] = m;
          }
          setLast(firstByConvo);
        }
      }

      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [limit, mineOnly]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const title = (r.title ?? 'Untitled').toLowerCase();
      const preview = (last[r.id]?.content ?? '').toLowerCase();
      return title.includes(q) || preview.includes(q);
    });
  }, [rows, last, search]);

  return (
    <div className={className}>
      {showSearch && (
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search chats…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 trauma-safe gentle-focus"
          />
        </div>
      )}

      {loading ? (
        <Card className="trauma-safe">
          <CardContent className="p-8 text-center text-muted-foreground">
            Loading…
          </CardContent>
        </Card>
      ) : err ? (
        <Card className="trauma-safe">
          <CardContent className="p-8 text-center text-red-600">
            {err}
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="trauma-safe">
          <CardContent className="p-8 text-center text-muted-foreground">
            No chats.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((c) => (
            <Card
              key={c.id}
              className="trauma-safe calm-hover cursor-pointer transition-all duration-200"
              onClick={() => onSelect(c.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <h3>{c.title || 'Untitled Chat'}</h3>
                      <Badge variant="secondary" className="trauma-safe">
                        {new Date(c.updated_at).toLocaleDateString()}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Last message: {last[c.id]?.content ?? '—'}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(c.id);
                    }}
                    className="trauma-safe gentle-focus"
                  >
                    Continue
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

```

# components/MoodCheckIn.tsx

```tsx
import React, { useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Heart, Sparkles } from 'lucide-react';

interface MoodData {
  feeling: string;
  intensity: number;
  reason?: string;
  support?: string;
}

interface MoodCheckInProps {
  onComplete: (moodData: MoodData) => void;
  onSkip: () => void;
  title?: string;
}

export default function MoodCheckIn({ onComplete, onSkip, title }: MoodCheckInProps) {
  const [selectedFeeling, setSelectedFeeling] = useState<string>('');

  const feelings = [
    { emoji: '😊', label: 'Happy', color: 'bg-gradient-to-r from-yellow-400 to-orange-400' },
    { emoji: '😌', label: 'Calm', color: 'bg-gradient-to-r from-blue-400 to-teal-400' },
    { emoji: '😔', label: 'Sad', color: 'bg-gradient-to-r from-blue-500 to-purple-500' },
    { emoji: '😰', label: 'Anxious', color: 'bg-gradient-to-r from-purple-400 to-pink-400' },
    { emoji: '😤', label: 'Frustrated', color: 'bg-gradient-to-r from-red-400 to-orange-400' },
    { emoji: '😴', label: 'Tired', color: 'bg-gradient-to-r from-gray-400 to-blue-400' },
    { emoji: '🤔', label: 'Confused', color: 'bg-gradient-to-r from-indigo-400 to-purple-400' },
    { emoji: '😐', label: 'Neutral', color: 'bg-gradient-to-r from-gray-400 to-gray-500' }
  ];

  const handleFeelingSelect = (feeling: string) => {
    setSelectedFeeling(feeling);
  };

  const handleStartChat = () => {
    // Create mood data with default values for intensity
    const moodData: MoodData = {
      feeling: selectedFeeling,
      intensity: 3, // Default moderate intensity
    };
    onComplete(moodData);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-lg trauma-safe border-2 border-teal-200 dark:border-teal-700">
        <CardHeader className="text-center bg-gradient-to-r from-teal-50 to-purple-50 dark:from-teal-900/20 dark:to-purple-900/20 rounded-t-lg">
          <div className="flex items-center justify-center space-x-2 mb-3">
            <Heart className="h-6 w-6 text-teal-600 dark:text-teal-400" />
            <CardTitle className="text-xl">{title || 'How are you feeling today? 💙'}</CardTitle>
          </div>
        </CardHeader>

        <CardContent className="p-6">
          <div className="space-y-6">
            <div className="text-center">
              <h3 className="font-medium mb-2">Choose how you're feeling right now</h3>
              <p className="text-sm text-muted-foreground mb-6">
                It's okay if you're feeling multiple things - just pick what feels strongest 🌟
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {feelings.map((feeling) => (
                <Button
                  key={feeling.label}
                  variant="outline"
                  onClick={() => handleFeelingSelect(feeling.label)}
                  className={`h-auto p-4 trauma-safe border-2 transition-all ${
                    selectedFeeling === feeling.label
                      ? 'border-teal-400 bg-teal-50 dark:bg-teal-900/20 scale-105'
                      : 'border-gray-200 dark:border-gray-700 hover:border-teal-200 dark:hover:border-teal-700'
                  }`}
                >
                  <div className="flex flex-col items-center space-y-2">
                    <span className="text-2xl">{feeling.emoji}</span>
                    <span className="text-sm font-medium">{feeling.label}</span>
                  </div>
                </Button>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between mt-8 pt-6 border-t border-border">
            <Button
              variant="ghost"
              onClick={onSkip}
              className="trauma-safe gentle-focus text-muted-foreground"
            >
              Skip for now
            </Button>

            <Button
              onClick={handleStartChat}
              disabled={!selectedFeeling}
              className="trauma-safe calm-hover gradient-teal"
            >
              <Sparkles className="h-4 w-4 mr-2" />
              Start Chatting ✨
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

# components/Navbar.tsx

```tsx
"use client";

import { Button } from '@/components/ui/button';
import { useRouter } from "next/navigation";

interface NavbarProps {
  onNavigate: (screen: string) => void;
  isLoggedIn: boolean;
  currentPage?: string;
}

export default function Navbar({ onNavigate, isLoggedIn = false, currentPage }: { onNavigate: (s: string) => void; isLoggedIn?: boolean; currentPage?: string }) {
  const router = useRouter();

  return (
    // <nav className="h-14 border-b bg-white flex items-center justify-between px-4">
    //   <button
    //     className="text-sm font-semibold"
    //     onClick={() => onNavigate('home')}
    //     aria-label="Go to home"
    //   >
    //     Adam • Companion
    //   </button>
    <nav className="flex items-center justify-between px-8 py-2 bg-white/80 backdrop-blur-sm border-b border-gray-100">
      <div className="flex items-center space-x-1">
        <span className="font-medium text-gray-700">Your Safe Chat Space</span>
      </div>
      
      <div className="flex items-center space-x-2">
        <Button
          onClick={() => onNavigate('/')}
          variant="ghost"
          size="sm"
          className={`px-4 py-1 rounded-full text-sm ${
            currentPage === 'home' || currentPage === '/' 
              ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' 
              : 'text-gray-600 hover:bg-emerald-100 hover:text-emerald-700'
          }`}
        >
          Home
        </Button>
        <Button
          onClick={() => onNavigate('settings')}
          variant="ghost"
          size="sm"
          className={`px-4 py-1 rounded-full text-sm ${
            currentPage === 'settings' 
              ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' 
              : 'text-gray-600 hover:bg-emerald-100 hover:text-emerald-700'
          }`}
        >
          Preferences
        </Button>
        
        {isLoggedIn ? (
          <Button 
            onClick={() => onNavigate('profile')}
            size="sm" 
            variant="ghost"
            className={`px-4 py-1 rounded-full text-sm ${
              currentPage === 'profile' 
                ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' 
                : 'text-gray-600 hover:bg-emerald-100 hover:text-emerald-700'
            }`}
          >
            Profile
          </Button>
        ) : (
          <Button 
            size="sm" 
            onClick={() => router.push("/login")} 
            variant="ghost"
            className="px-4 py-1 rounded-full text-sm text-gray-600 hover:bg-emerald-100 hover:text-emerald-700"
          >
            Log in
          </Button>
        )}

      </div>
    </nav>
  );
}
```

# components/SettingsScreen.tsx

```tsx
'use client';

import React, { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import { Separator } from './ui/separator';
import { Badge } from './ui/badge';
import {
  Shield,
  Eye,
  FileText,
  Trash2,
  Download,
  Info,
  Lock,
  Globe,
  UserX,
  Clock,
  AlertTriangle,
  ArrowLeft,
} from 'lucide-react';

interface SettingsScreenProps {
  onNavigate: (screen: string) => void;
}

export default function SettingsScreen({ onNavigate }: SettingsScreenProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromChatConvoId = searchParams.get('convo');

  const [settings, setSettings] = useState({
    anonymousMode: true,
    transcriptStorage: false,
    dataSharing: false,
    analytics: false,
    notifications: true,
    autoDelete: true,
  });

  const updateSetting = (key: keyof typeof settings) => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleBackToChat = () => {
    if (fromChatConvoId) {
      router.push(`/chat/avatar?convo=${fromChatConvoId}`);
    }
  };

  const privacyFeatures = [
    {
      icon: UserX,
      title: 'Anonymous by Default',
      description: 'No personal information is required or stored',
      status: 'Always Active',
    },
    {
      icon: Lock,
      title: 'End-to-End Security',
      description: 'Your conversations are encrypted and secure',
      status: 'Always Active',
    },
    {
      icon: Clock,
      title: 'Auto-Delete',
      description: 'Conversations are automatically deleted after 30 days',
      status: settings.autoDelete ? 'Active' : 'Disabled',
    },
    {
      icon: Globe,
      title: 'No Third-Party Sharing',
      description: 'Your data stays private and is never sold or shared',
      status: 'Guaranteed',
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-teal-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      <div className="max-w-4xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Privacy &amp; Settings
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
            You&apos;re in control of your privacy. Review and adjust your settings to feel safe and comfortable.
          </p>
        </div>

        <div className="space-y-6">
          {/* Privacy Features Overview */}
          <Card className="trauma-safe">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Shield className="h-5 w-5 mr-2 text-green-600" />
                Your Privacy Protection
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-4">
                {privacyFeatures.map((feature, idx) => (
                  <div
                    key={idx}
                    className="flex items-start space-x-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg"
                  >
                    <div className="w-8 h-8 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                      <feature.icon className="h-4 w-4 text-green-600 dark:text-green-400" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <h4 className="font-medium text-sm">{feature.title}</h4>
                        <Badge variant="outline" className="text-xs">
                          {feature.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-300">{feature.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Privacy Controls */}
          <Card className="trauma-safe">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Eye className="h-5 w-5 mr-2" />
                Privacy Controls
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Anonymous Mode */}
              <div className="flex items-center justify-between p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-1">
                    <Label htmlFor="anonymous-mode" className="font-medium">
                      Anonymous Mode
                    </Label>
                    <Badge variant="secondary" className="text-xs">
                      Recommended
                    </Badge>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    Chat without providing any personal information. Your conversations remain completely anonymous.
                  </p>
                </div>
                <Switch
                  id="anonymous-mode"
                  checked={settings.anonymousMode}
                  onCheckedChange={() => updateSetting('anonymousMode')}
                  className="trauma-safe ml-4"
                />
              </div>

              <Separator />

              {/* Transcript Storage */}
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-1">
                    <Label htmlFor="transcript-storage" className="font-medium">
                      Save Conversation History
                    </Label>
                    <Info className="h-4 w-4 text-gray-400" />
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    Allow saving conversations to review later or share with trusted adults. Requires your explicit consent.
                  </p>
                </div>
                <Switch
                  id="transcript-storage"
                  checked={settings.transcriptStorage}
                  onCheckedChange={() => updateSetting('transcriptStorage')}
                  className="trauma-safe ml-4"
                />
              </div>

              <Separator />

              {/* Auto-Delete */}
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <Label htmlFor="auto-delete" className="font-medium mb-1 block">
                    Auto-Delete Conversations
                  </Label>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    Automatically delete all conversation data after 30 days for your protection.
                  </p>
                </div>
                <Switch
                  id="auto-delete"
                  checked={settings.autoDelete}
                  onCheckedChange={() => updateSetting('autoDelete')}
                  className="trauma-safe ml-4"
                />
              </div>

              <Separator />

              {/* Analytics */}
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <Label htmlFor="analytics" className="font-medium mb-1 block">
                    Anonymous Usage Analytics
                  </Label>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    Help improve the app by sharing anonymous usage statistics. No personal data is included.
                  </p>
                </div>
                <Switch
                  id="analytics"
                  checked={settings.analytics}
                  onCheckedChange={() => updateSetting('analytics')}
                  className="trauma-safe ml-4"
                />
              </div>
            </CardContent>
          </Card>

          {/* Consent Information */}
          <Card className="trauma-safe">
            <CardHeader>
              <CardTitle className="flex items-center">
                <FileText className="h-5 w-5 mr-2" />
                Understanding Your Rights
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-amber-800 dark:text-amber-300 mb-2">
                      Important: This app is not for emergencies
                    </h4>
                    <p className="text-sm text-amber-700 dark:text-amber-400">
                      If you&apos;re in immediate danger or having thoughts of self-harm, please contact emergency services (000) or Lifeline (13 11 14) immediately.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="font-medium">Your Rights:</h4>
                <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
                  <li className="flex items-start space-x-2">
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-2 flex-shrink-0" />
                    <span>You can stop using this app at any time without consequences</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-2 flex-shrink-0" />
                    <span>You control what information you share</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-2 flex-shrink-0" />
                    <span>You can request deletion of any stored data</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-2 flex-shrink-0" />
                    <span>This AI is not a replacement for professional mental health support</span>
                  </li>
                </ul>
              </div>

              <div className="pt-4 border-t border-border">
                <div className="flex flex-col sm:flex-row gap-3">
                  <Button variant="outline" className="trauma-safe gentle-focus">
                    <FileText className="h-4 w-4 mr-2" />
                    Full Privacy Policy
                  </Button>
                  <Button variant="outline" className="trauma-safe gentle-focus">
                    <Download className="h-4 w-4 mr-2" />
                    Download My Data
                  </Button>
                  <Button
                    variant="outline"
                    className="trauma-safe gentle-focus text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-900/20"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete All Data
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <div className="text-center pt-8">
            <p className="text-gray-600 dark:text-gray-300 mb-6">
              Ready to start a safe, supportive conversation?
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center max-w-md mx-auto">
              {fromChatConvoId ? (
                <Button onClick={handleBackToChat} className="trauma-safe calm-hover">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Chat
                </Button>
              ) : (
                <Button onClick={() => onNavigate('chat')} className="trauma-safe calm-hover">
                  Start Chatting
                </Button>
              )}
              <Button onClick={() => onNavigate('welcome')} variant="outline" className="trauma-safe gentle-focus">
                Back to Home
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

```

# components/TranscriptScreen.tsx

```tsx
import React, { useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { 
  FileText, 
  Download, 
  Share, 
  Eye, 
  EyeOff, 
  Copy, 
  Mail, 
  User, 
  Calendar,
  Shield,
  AlertCircle,
  Check
} from 'lucide-react';

interface TranscriptScreenProps {
  onNavigate: (screen: string) => void;
}

export default function TranscriptScreen({ onNavigate }: TranscriptScreenProps) {
  const [showFullTranscript, setShowFullTranscript] = useState(false);
  const [shareNote, setShareNote] = useState('');
  const [copied, setCopied] = useState(false);

  // Mock conversation data
  const conversationData = {
    date: new Date().toLocaleDateString(),
    duration: "23 minutes",
    messageCount: 12,
    summary: "Discussion about feelings of stress and anxiety related to upcoming court date. Explored coping strategies and identified support networks.",
    transcript: [
      { sender: 'ai', content: "Hi there! I'm Adam, your Avatar Companion. How are you feeling today?" },
      { sender: 'user', content: "I'm feeling really anxious about my court date next week." },
      { sender: 'ai', content: "That sounds really stressful. It's completely normal to feel anxious about court proceedings. Would you like to talk about what's worrying you most?" },
      { sender: 'user', content: "I'm worried about what will happen and if I'll say the wrong thing." },
      { sender: 'ai', content: "Those are very understandable concerns. Many people feel this way before court. Have you been able to talk to your lawyer or support worker about what to expect?" },
      { sender: 'user', content: "Yes, my lawyer explained the process but I'm still nervous." },
      { sender: 'ai', content: "It's great that you've prepared with your lawyer. Being nervous shows you care. What helps you feel calmer when you're anxious?" }
    ]
  };

  const handleCopyTranscript = async () => {
    const transcriptText = conversationData.transcript
      .map(msg => `${msg.sender === 'ai' ? 'Adam' : 'You'}: ${msg.content}`)
      .join('\n\n');
    
    try {
      await navigator.clipboard.writeText(transcriptText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy transcript');
    }
  };

  const handleDownload = () => {
    const transcriptContent = `
Avatar Companion Conversation Summary
Date: ${conversationData.date}
Duration: ${conversationData.duration}

Summary: ${conversationData.summary}

Conversation:
${conversationData.transcript.map(msg => 
  `${msg.sender === 'ai' ? 'Adam' : 'You'}: ${msg.content}`
).join('\n\n')}

---
This conversation was conducted in a safe, confidential environment with AI support.
`;

    const blob = new Blob([transcriptContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `avatar-companion-conversation-${conversationData.date.replace(/\//g, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-teal-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      <div className="max-w-4xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Conversation Summary
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
            Review your conversation and share it with trusted adults who can provide additional support.
          </p>
        </div>

        <div className="space-y-6">
          {/* Privacy Notice */}
          <Card className="trauma-safe border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20">
            <CardContent className="p-4">
              <div className="flex items-start space-x-3">
                <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-medium text-blue-800 dark:text-blue-300 mb-1">
                    Your Privacy is Protected
                  </h3>
                  <p className="text-sm text-blue-700 dark:text-blue-400">
                    This summary contains no personal identifying information. Only share with people you trust, 
                    like a counselor, mentor, or family member who can help support you.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Conversation Overview */}
          <Card className="trauma-safe">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Calendar className="h-5 w-5 mr-2" />
                Conversation Details
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-3 gap-4 mb-6">
                <div className="text-center p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                  <p className="text-2xl font-semibold text-blue-600 dark:text-blue-400">
                    {conversationData.date}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-300">Date</p>
                </div>
                <div className="text-center p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                  <p className="text-2xl font-semibold text-purple-600 dark:text-purple-400">
                    {conversationData.duration}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-300">Duration</p>
                </div>
                <div className="text-center p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                  <p className="text-2xl font-semibold text-teal-600 dark:text-teal-400">
                    {conversationData.messageCount}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-300">Messages</p>
                </div>
              </div>

              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
                <h4 className="font-medium mb-2">Conversation Summary:</h4>
                <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                  {conversationData.summary}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Transcript Preview */}
          <Card className="trauma-safe">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center">
                  <FileText className="h-5 w-5 mr-2" />
                  Conversation Transcript
                </CardTitle>
                <Button
                  onClick={() => setShowFullTranscript(!showFullTranscript)}
                  variant="outline"
                  size="sm"
                  className="trauma-safe gentle-focus"
                >
                  {showFullTranscript ? (
                    <>
                      <EyeOff className="h-4 w-4 mr-2" />
                      Hide Full Transcript
                    </>
                  ) : (
                    <>
                      <Eye className="h-4 w-4 mr-2" />
                      Show Full Transcript
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {showFullTranscript ? (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {conversationData.transcript.map((message, index) => (
                    <div key={index} className="flex space-x-3">
                      <div className="flex-shrink-0">
                        {message.sender === 'ai' ? (
                          <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                            <span className="text-white text-xs font-medium">A</span>
                          </div>
                        ) : (
                          <div className="w-8 h-8 bg-teal-500 rounded-full flex items-center justify-center">
                            <User className="h-4 w-4 text-white" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-1">
                          <span className="font-medium text-sm">
                            {message.sender === 'ai' ? 'Adam' : 'You'}
                          </span>
                        </div>
                        <p className="text-gray-600 dark:text-gray-300 text-sm">
                          {message.content}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                  <FileText className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-600 dark:text-gray-300 mb-2">
                    Transcript preview hidden for privacy
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Click "Show Full Transcript" to review your conversation
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Sharing Options */}
          <Card className="trauma-safe">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Share className="h-5 w-5 mr-2" />
                Share with Trusted Support
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Note for recipient */}
              <div>
                <Label htmlFor="share-note" className="text-sm font-medium mb-2 block">
                  Add a note for the person you're sharing with (optional):
                </Label>
                <Textarea
                  id="share-note"
                  value={shareNote}
                  onChange={(e) => setShareNote(e.target.value)}
                  placeholder="e.g., 'Hi [Name], I had this conversation with my AI companion and thought it might help you understand what I've been going through...'"
                  className="trauma-safe gentle-focus"
                  rows={3}
                />
              </div>

              <Separator />

              {/* Action buttons */}
              <div className="grid sm:grid-cols-2 gap-4">
                <Button
                  onClick={handleDownload}
                  className="w-full trauma-safe calm-hover"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download for Me
                </Button>

                <Button
                  onClick={handleCopyTranscript}
                  variant="outline"
                  className="w-full trauma-safe gentle-focus"
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4 mr-2 text-green-600" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4 mr-2" />
                      Copy Text
                    </>
                  )}
                </Button>
              </div>

              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-amber-800 dark:text-amber-300 mb-1">
                      Sharing Reminder
                    </h4>
                    <p className="text-sm text-amber-700 dark:text-amber-400">
                      Only share this conversation with people you trust, like a counselor, mentor, or family member. 
                      This can help them better understand your experiences and provide appropriate support.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Navigation */}
          <div className="text-center pt-8">
            <div className="flex flex-col sm:flex-row gap-3 justify-center max-w-md mx-auto">
              <Button
                onClick={() => onNavigate('chat')}
                className="trauma-safe calm-hover"
              >
                Continue Chatting
              </Button>
              <Button
                onClick={() => onNavigate('welcome')}
                variant="outline"
                className="trauma-safe gentle-focus"
              >
                Back to Home
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

# components/ui/avatar.tsx

```tsx
"use client";

import * as React from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar";

import { cn } from "@/lib/utils";

function Avatar({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Root>) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      className={cn(
        "relative flex size-10 shrink-0 overflow-hidden rounded-full",
        className,
      )}
      {...props}
    />
  );
}

function AvatarImage({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Image>) {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn("aspect-square size-full", className)}
      {...props}
    />
  );
}

function AvatarFallback({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Fallback>) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(
        "bg-muted flex size-full items-center justify-center rounded-full",
        className,
      )}
      {...props}
    />
  );
}

export { Avatar, AvatarImage, AvatarFallback };

```

# components/ui/badge.tsx

```tsx
import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
        destructive:
          "border-transparent bg-destructive text-white [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span"

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }

```

# components/ui/button.tsx

```tsx
import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
        destructive:
          "bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
        success: "bg-emerald-600 text-white hover:bg-emerald-700"
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }

```

# components/ui/card.tsx

```tsx
import * as React from "react"

import { cn } from "@/lib/utils"

function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn(
        "bg-card text-card-foreground flex flex-col gap-6 rounded-xl border py-6 shadow-sm",
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("leading-none font-semibold", className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-6", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center px-6 [.border-t]:pt-6", className)}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}

```

# components/ui/dialog.tsx

```tsx
"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { XIcon } from "lucide-react";

import { cn } from "@/lib/utils";

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50",
        className,
      )}
      {...props}
    />
  );
}

function DialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-lg",
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4">
          <XIcon />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      {...props}
    />
  );
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  );
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-lg leading-none font-semibold", className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};

```

# components/ui/input.tsx

```tsx
import * as React from "react";

import { cn } from "../../lib/utils";


function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input flex h-9 w-full min-w-0 rounded-md border px-3 py-1 text-base bg-input-background transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        className,
      )}
      {...props}
    />
  );
}

export { Input };

```

# components/ui/label.tsx

```tsx
"use client";

import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cn } from "@/lib/utils";

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    data-slot="label"
    className={cn(
      "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
      className
    )}
    {...props}
  />
));

Label.displayName = LabelPrimitive.Root.displayName;

export { Label };


```

# components/ui/progress.tsx

```tsx
"use client"

import * as React from "react"
import * as ProgressPrimitive from "@radix-ui/react-progress"

import { cn } from "@/lib/utils"

function Progress({
  className,
  value,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn(
        "bg-primary/20 relative h-2 w-full overflow-hidden rounded-full",
        className
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className="bg-primary h-full w-full flex-1 transition-all"
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }

```

# components/ui/scroll-area.tsx

```tsx
"use client"

import * as React from "react"
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area"

import { cn } from "@/lib/utils"

function ScrollArea({
  className,
  children,
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.Root>) {
  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      className={cn("relative", className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        data-slot="scroll-area-viewport"
        className="focus-visible:ring-ring/50 size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:outline-1"
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  )
}

function ScrollBar({
  className,
  orientation = "vertical",
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>) {
  return (
    <ScrollAreaPrimitive.ScrollAreaScrollbar
      data-slot="scroll-area-scrollbar"
      orientation={orientation}
      className={cn(
        "flex touch-none p-px transition-colors select-none",
        orientation === "vertical" &&
          "h-full w-2.5 border-l border-l-transparent",
        orientation === "horizontal" &&
          "h-2.5 flex-col border-t border-t-transparent",
        className
      )}
      {...props}
    >
      <ScrollAreaPrimitive.ScrollAreaThumb
        data-slot="scroll-area-thumb"
        className="bg-border relative flex-1 rounded-full"
      />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
  )
}

export { ScrollArea, ScrollBar }

```

# components/ui/select.tsx

```tsx
"use client";

import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from "lucide-react";

import { cn } from "@/lib//utils";

function Select({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Root>) {
  return <SelectPrimitive.Root data-slot="select" {...props} />;
}

function SelectGroup({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Group>) {
  return <SelectPrimitive.Group data-slot="select-group" {...props} />;
}

function SelectValue({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Value>) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />;
}

function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger> & {
  size?: "sm" | "default";
}) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        "border-input data-[placeholder]:text-muted-foreground [&_svg:not([class*='text-'])]:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 dark:hover:bg-input/50 flex w-full items-center justify-between gap-2 rounded-md border bg-input-background px-3 py-2 text-sm whitespace-nowrap transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 data-[size=default]:h-9 data-[size=sm]:h-8 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDownIcon className="size-4 opacity-50" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

function SelectContent({
  className,
  children,
  position = "popper",
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="select-content"
        className={cn(
          "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 relative z-50 max-h-(--radix-select-content-available-height) min-w-[8rem] origin-(--radix-select-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-md border shadow-md",
          position === "popper" &&
            "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
          className,
        )}
        position={position}
        {...props}
      >
        <SelectScrollUpButton />
        <SelectPrimitive.Viewport
          className={cn(
            "p-1",
            position === "popper" &&
              "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)] scroll-my-1",
          )}
        >
          {children}
        </SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

function SelectLabel({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Label>) {
  return (
    <SelectPrimitive.Label
      data-slot="select-label"
      className={cn("text-muted-foreground px-2 py-1.5 text-xs", className)}
      {...props}
    />
  );
}

function SelectItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "focus:bg-accent focus:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
        className,
      )}
      {...props}
    >
      <span className="absolute right-2 flex size-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <CheckIcon className="size-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

function SelectSeparator({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Separator>) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn("bg-border pointer-events-none -mx-1 my-1 h-px", className)}
      {...props}
    />
  );
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpButton>) {
  return (
    <SelectPrimitive.ScrollUpButton
      data-slot="select-scroll-up-button"
      className={cn(
        "flex cursor-default items-center justify-center py-1",
        className,
      )}
      {...props}
    >
      <ChevronUpIcon className="size-4" />
    </SelectPrimitive.ScrollUpButton>
  );
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownButton>) {
  return (
    <SelectPrimitive.ScrollDownButton
      data-slot="select-scroll-down-button"
      className={cn(
        "flex cursor-default items-center justify-center py-1",
        className,
      )}
      {...props}
    >
      <ChevronDownIcon className="size-4" />
    </SelectPrimitive.ScrollDownButton>
  );
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};

```

# components/ui/separator.tsx

```tsx
"use client"

import * as React from "react"
import * as SeparatorPrimitive from "@radix-ui/react-separator"

import { cn } from "@/lib/utils"

function Separator({
  className,
  orientation = "horizontal",
  decorative = true,
  ...props
}: React.ComponentProps<typeof SeparatorPrimitive.Root>) {
  return (
    <SeparatorPrimitive.Root
      data-slot="separator"
      decorative={decorative}
      orientation={orientation}
      className={cn(
        "bg-border shrink-0 data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px",
        className
      )}
      {...props}
    />
  )
}

export { Separator }

```

# components/ui/switch.tsx

```tsx
"use client";

import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";

import { cn } from "@/lib//utils";

function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer data-[state=checked]:bg-primary data-[state=unchecked]:bg-switch-background focus-visible:border-ring focus-visible:ring-ring/50 dark:data-[state=unchecked]:bg-input/80 inline-flex h-[1.15rem] w-8 shrink-0 items-center rounded-full border border-transparent transition-all outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "bg-card dark:data-[state=unchecked]:bg-card-foreground dark:data-[state=checked]:bg-primary-foreground pointer-events-none block size-4 rounded-full ring-0 transition-transform data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=unchecked]:translate-x-0",
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };

```

# components/ui/tabs.tsx

```tsx
"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "@/lib/utils";

function Tabs({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  );
}

function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "bg-muted text-muted-foreground inline-flex h-9 w-fit items-center justify-center rounded-xl p-[3px] flex",
        className,
      )}
      {...props}
    />
  );
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "data-[state=active]:bg-card dark:data-[state=active]:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 text-foreground dark:text-muted-foreground inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-xl border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };

```

# components/ui/textarea.tsx

```tsx
import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 flex field-sizing-content min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }

```

# components/ui/toaster.tsx

```tsx
"use client";

import { Toaster as Sonner } from "sonner";

export function Toaster() {
  return <Sonner position="bottom-center" />;
}
```

# Deco-RAG/RAG/all_chunks.csv

```csv
file,chunk_id,content
Visiting and contacting a young person in detention _ Department of Youth Justice and Victim Support.pdf,0,"26/08/2025, 15:42 Visiting and contacting a young person in detention | Department of Youth Justice and Victim Support Department of Youth Justice and Victim Support Young people in detention (https://www.youthjustice.qld.gov.au/parents-carers/youth-detention) >> Visiting and contacting a young person in detention Visiting and contacting a young person in detention We encourage you to visit a young person in a detention centre. Regular visits from family and friends help young people reintegrate with the community once they are released. Our youth detention centres are located: Brisbane Youth Detention Centre, 99 Wolston Park Road, Wacol Cleveland Youth Detention Centre, 27–79 Old Common Road, Belgian Gardens, Townsville West Moreton Youth Detention Centre, 99 Wolston Park Road, Wacol. Your visit will be in the ‘visits centre’ of the detention centre. must in advance. You arrange your visit Phone calls You can speak to a young person on the phone while they are in detention. However, a young person must call you. You won’t be able to call them unless it’s an emergency. If you have to tell a young person something that may upset them, let the staff know so they can support the young person. A young person is allowed 120 minutes of call time each week to talk to their family and friends. They can talk for up to 10 minutes at a time. They can also speak to their lawyer or caseworker, or the community visitor. These calls have no time limit and do not count towards their 120 minutes. https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/visiting-and-contacting-a-young-person-in-detention 1/4 26/08/2025, 15:42 Visiting and contacting a young person in detention | Department of Youth Justice and Victim Support Letters You can send as many letters to a young person as you like. Staff at the centre check all letters before young people receive them. Staff also check any letters that a"
Visiting and contacting a young person in detention _ Department of Youth Justice and Victim Support.pdf,1,"15:42 Visiting and contacting a young person in detention | Department of Youth Justice and Victim Support Letters You can send as many letters to a young person as you like. Staff at the centre check all letters before young people receive them. Staff also check any letters that a young person sends to you. Staff will not check letters to or from a young person’s lawyer. Send your letters to: Brisbane Youth Detention Centre PO Box 450 ARCHERFIELD BC QLD 4108 Cleveland Youth Detention Centre 27-79 Old Common Road BELGIAN GARDENS QLD 4810 West Moreton Youth Detention Centre PO Box 450 ARCHERFIELD BC QLD 4108 Your privacy If you agree to being on a young person’s personal visits list and/or a young person’s call list, your approval will apply to the young person’s current stay in youth detention as well as any future stays. You should contact the youth detention centre if you want to withdraw your approval. We will keep a record of: your name your telephone number the date and time of your visit with a young person how long your visit goes for. This is in line with the Youth Justice Act 1992 (Qld) (https://www.legislation.qld.gov.au/view/pdf/inforce/current/act-1992-044). CCTV and body worn cameras are used in youth detention centres. Audio and video footage is recorded. https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/visiting-and-contacting-a-young-person-in-detention 2/4 26/08/2025, 15:42 Visiting and contacting a young person in detention | Department of Youth Justice and Victim Support We will manage your personal information in line with the: Youth Justice Act 1992 (Qld) (https://www.legislation.qld.gov.au/view/pdf/inforce/current/act-1992-044) Information Privacy Act 2009 (Qld) (https://www.legislation.qld.gov.au/view/pdf/inforce/current/act-2009-014) You can read more about our commitment to privacy (https://www.cyjma.qld.gov.au/about-us/our-department/right-information/information- privacy) on our privacy page. More information Learn about: what rights a young person has in detention (https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/life-for-young- people-in-a-detention-centre/your-childs-rights-in-detention) understanding separation in youth detention (https://www.qld.gov.au/law/sentencing- prisons-and-probation/young-offenders-and-the-justice-system/youth- detention/about-youth-detention/separation) the people who are here"
Visiting and contacting a young person in detention _ Department of Youth Justice and Victim Support.pdf,2,"(Qld) (https://www.legislation.qld.gov.au/view/pdf/inforce/current/act-1992-044) Information Privacy Act 2009 (Qld) (https://www.legislation.qld.gov.au/view/pdf/inforce/current/act-2009-014) You can read more about our commitment to privacy (https://www.cyjma.qld.gov.au/about-us/our-department/right-information/information- privacy) on our privacy page. More information Learn about: what rights a young person has in detention (https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/life-for-young- people-in-a-detention-centre/your-childs-rights-in-detention) understanding separation in youth detention (https://www.qld.gov.au/law/sentencing- prisons-and-probation/young-offenders-and-the-justice-system/youth- detention/about-youth-detention/separation) the people who are here to help a young person (https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/helping-young- people-in-detention) Young people in detention (https://www.youthjustice.qld.gov.au/parents- carers/youth-detention) About youth detention in Queensland (https://www.youthjustice.qld.gov.au/parents- carers/youth-detention/about) Visiting and contacting a young person in detention (https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/visiting-and- contacting-a-young-person-in-detention) https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/visiting-and-contacting-a-young-person-in-detention 3/4 26/08/2025, 15:42 Visiting and contacting a young person in detention | Department of Youth Justice and Victim Support Life for young people in a detention centre 〉 (https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/life-for-young- people-in-a-detention-centre) Helping young people in detention (https://www.youthjustice.qld.gov.au/parents- 〉 carers/youth-detention/helping-young-people-in-detention) Accountability in youth detention centres (https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/accountability- in-youth-detention-centres) Last reviewed: 04 June 2025 Last modified: 04 June 2025  Provide feedback (https://www.families.qld.gov.au/feedback?id=34898) This work is licensed under a Creative Commons Attribution 4.0 International (CC BY 4.0) licence (https://creativecommons.org/licenses/by/4.0/) https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/visiting-and-contacting-a-young-person-in-detention 4/4"
Care in detention _ Department of Youth Justice and Victim Support.pdf,0,"26/08/2025, 15:37 Care in detention | Department of Youth Justice and Victim Support Department of Youth Justice and Victim Support Helping young people in detention (https://www.youthjustice.qld.gov.au/parents-carers/youth- detention/helping-young-people-in-detention) >> Care in detention Care in detention There are lots of people in a youth detention centre to help young people, including: detention youth workers caseworkers programs officers psychologists teachers nurses doctors speech and language pathologists cultural staff community visitors Our staff come from many different cultures and backgrounds. Everyone works together to make sure each a young person is safe and well while they are in detention. We help them with their offending behaviour and help them make better choices. We also help parents, carers and young people plan for when the young person returns home to their community. Detention youth workers Detention youth workers supervise young people while they are in detention. They check on a young person regularly through the day and night, and make sure they are okay. https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/helping-young-people-in-detention/care-in-detention 1/6 26/08/2025, 15:37 Care in detention | Department of Youth Justice and Victim Support If a young person needs to go to other areas of the youth detention centre, a detention youth worker takes them. Detention youth workers help young people in detention understand and follow the rules of the centre. A young person can talk to a detention youth worker if they need someone to talk to. Detention youth workers have special training to help keep everyone safe if young people behave inappropriately. Caseworkers Youth detention centres have caseworkers similar to the ones who work in our service centres. A young person’s caseworker meets with them regularly and keeps in contact with: their parent or carer the young person’s lawyer the young person’s youth justice service centre caseworker. The young person can talk to their caseworker if they are"
Care in detention _ Department of Youth Justice and Victim Support.pdf,1,"similar to the ones who work in our service centres. A young person’s caseworker meets with them regularly and keeps in contact with: their parent or carer the young person’s lawyer the young person’s youth justice service centre caseworker. The young person can talk to their caseworker if they are worried about anything to do with court, their family, or anything else. A young person’s caseworker talks to them about what got them into trouble. They also talk to a young person about things that might help them to stay out of trouble when they leave detention. Caseworkers help young people plan and get ready to leave detention and return to the community. This includes programs, services and planning activities in consultation with the youth justice service centre caseworker. Teachers Young people attend the detention centre’s school (https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/helping-young- people-in-detention/education)while they are in detention. The teacher will work with the young person to: https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/helping-young-people-in-detention/care-in-detention 2/6 26/08/2025, 15:37 Care in detention | Department of Youth Justice and Victim Support address any learning gaps they have in literacy or numeracy learn new skills help them develop skills for returning to education, training or employment when they leave detention improve their social skills. Nurses and doctors The youth detention centre has a health centre with nurses who work 24 hours a day, 7 days a week. When a young person arrives at the youth detention centre, a nurse checks their health and their health needs. We will arrange for the young person to see the nurse, doctor or dentist at the youth detention centre when they need to. A young person can also talk to the nurse during daily visits the nurse makes around the detention centre accommodation. The nurse can help them with their health needs including immunisation, sexual health and more. If"
Care in detention _ Department of Youth Justice and Victim Support.pdf,2,"the nurse, doctor or dentist at the youth detention centre when they need to. A young person can also talk to the nurse during daily visits the nurse makes around the detention centre accommodation. The nurse can help them with their health needs including immunisation, sexual health and more. If a young person needs to see a medical specialist or go to hospital, our detention youth workers will take them to these appointments. We will also help a young person access their Medicare card and immunisation records. Speech and language pathologists Speech and language pathologists help young people at the youth detention centre who have difficulties with communication. They can help with skills such as: speaking understanding reading writing social skills. https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/helping-young-people-in-detention/care-in-detention 3/6 26/08/2025, 15:37 Care in detention | Department of Youth Justice and Victim Support Speech and language pathologists help to test and support a young person’s communication needs. They may work with a young person one-on-one or in groups. Cultural units and cultural staff Our cultural units and cultural staff help Aboriginal and Torres Strait Islander young people stay connected to their: family culture community country They give cultural support and information to young people and help with family and cultural visits. Cultural staff also work with Elders and other important community members to provide opportunities for them to talk to young people about their culture. Community visitors Community visitors work for the Office of the Public Guardian (https://www.publicguardian.qld.gov.au/about-us/child-legal-advocacy) and not for the detention centre. Community visitors check on how young people are cared for in detention and support them with any problems they might have. Community visitors talk to young people and listen to what they have to say about their time in detention. If a young person wants to talk to a community visitor, they can:"
Care in detention _ Department of Youth Justice and Victim Support.pdf,3,"on how young people are cared for in detention and support them with any problems they might have. Community visitors talk to young people and listen to what they have to say about their time in detention. If a young person wants to talk to a community visitor, they can: talk to them when they see them walking around the detention centre put a note into one of the secure letter boxes around the detention centre phone them from the phone in their accommodation unit. https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/helping-young-people-in-detention/care-in-detention 4/6 26/08/2025, 15:37 Care in detention | Department of Youth Justice and Victim Support Find out more Read more about what happens in detention (https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/life-for-young- people-in-a-detention-centre) Find out what rights a young person has in detention (https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/life-for-young- people-in-a-detention-centre/your-childs-rights-in-detention) Learn about support programs for young people in detention (https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/helping-young- people-in-detention/support-programs) Helping young people in detention (https://www.youthjustice.qld.gov.au/parents- carers/youth-detention/helping-young-people-in- detention) Care in detention (https://www.youthjustice.qld.gov.au/parents-carers/youth- detention/helping-young-people-in-detention/care-in-detention) Education (https://www.youthjustice.qld.gov.au/parents-carers/youth- detention/helping-young-people-in-detention/education) Support programs (https://www.youthjustice.qld.gov.au/parents-carers/youth- detention/helping-young-people-in-detention/support-programs) Health and wellbeing (https://www.youthjustice.qld.gov.au/parents-carers/youth- detention/helping-young-people-in-detention/health-and-wellbeing) Last reviewed: 26 November 2024 Last modified: 26 November 2024  Provide feedback (https://www.families.qld.gov.au/feedback?id=34926) https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/helping-young-people-in-detention/care-in-detention 5/6 26/08/2025, 15:37 Care in detention | Department of Youth Justice and Victim Support This work is licensed under a Creative Commons Attribution 4.0 International (CC BY 4.0) licence (https://creativecommons.org/licenses/by/4.0/) https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/helping-young-people-in-detention/care-in-detention 6/6"
Sexting.pdf,0,"Sexting What is ‘sexting’? Sexting is creating, sending, possessing or posting sexual messages, photos or videos on phones or over the internet. Is sexting illegal? If the images are of people under 16 years and are sexual they may be classed as “child exploitation material” (commonly referred to as child pornography). It is illegal to make, distribute or possess child exploitation material.1 Child exploitation material is text, images or sound showing a person under 16 in a sexual way that is likely to offend an adult.2 It includes images of: • the person’s breasts, bottom, penis or vagina; or • the person doing something sexual or near someone doing something sexual (such as having sex). Even if the image only shows part of the person, it can still be child pornography - for example, it doesn’t show the faces of the people having sex, or if it is only a part of the body, for example exposed breasts. It doesn’t matter if the images are of you, or someone else who was ok with the image being made: if the image is of someone under 16 years then it is child pornography. It is illegal to do, or try to do, the following with child exploitation material images: • make them • have them (possession) • give them to someone, agree to give to someone by phone or email or post. It is also illegal to: • make someone under 16 years see indecent films, pictures, photos, and written material without a proper reason (for example, it’s ok for a sex education class) • use the internet or phone to get someone under 16 to do a sexual act.3 If you are 16 or 17 you could also be charged for doing similar things under Commonwealth Law. 1 Criminal Code"
Sexting.pdf,1,"without a proper reason (for example, it’s ok for a sex education class) • use the internet or phone to get someone under 16 to do a sexual act.3 If you are 16 or 17 you could also be charged for doing similar things under Commonwealth Law. 1 Criminal Code Act 1899 (Qld) ss 228B-228D. 2 Criminal Code Act 1899 (Qld) ss 228B, 207A. 3 Criminal Code Act 1899 (Qld) s 210(1)(b)-(e). Reviewed 06/08/2025 This sheet is intended to provide general legal information about the law in Queensland. This information is not legal advice. If you have a particular legal problem you should contact a solicitor for legal advice. At the end is a list of agencies that might be able to assist you, including legal agencies. Sexting What if I send sexts to someone who doesn’t want me to? If you send one or more sexts to someone and the material is offensive or harassing or threatening you could be charged with stalking. The person does not need to be afraid or suffer harm, the material just has to be of the type that would usually cause a person to be afraid or suffer harm (See the ‘Treated Unfairly & discrimination’ Fact sheet for further information about Stalking).4 If we are both under 16 is it still against the law? If you have taken a sexual photo / video of yourself and sent it to someone else then you could be charged with three separate charges of: • possessing (having) • making • sending • child exploitation material.5 If you are found guilty of these types of offences, you can be placed on the Sex Offenders Register. This means you may then have to give the Police a lot of information about yourself and any contact you have with"
Sexting.pdf,2,"(having) • making • sending • child exploitation material.5 If you are found guilty of these types of offences, you can be placed on the Sex Offenders Register. This means you may then have to give the Police a lot of information about yourself and any contact you have with people under 18 years of age for up to seven and a half years (See the Fact Sheet on ‘Child Protection Offender Reporting’ for more information). If you share or threaten to share a photo/video of someone else who is under 16 years, which shows them doing something sexual or shows their genital or anal area (even if they are wearing underwear) or their breasts (even if the person in the photo/video agrees to you sharing it) you can be charged with the criminal offence of distributing intimate images.6 This applies even if you are under the age of 16. If the person in the photo/video is over 16 it is an offence to threaten to share it or share it without their consent.7 What if someone sends me a photo or video which might be child pornography? You may now be in possession of child exploitation material. It is illegal to be in possession of child exploitation material. 4 Criminal Code Act 1899 (Qld) ss 359B-359C. 5 Criminal Code Act 1899 (Qld) ss 228B-228D. 6 Criminal Code Act 1899 (Qld) ss 223, 229A. 7 Criminal Code Act 1899 (Qld) ss 223, 229A. Sexting What do I do if I’m being bullied about a photo of myself that I sent to someone else? It is an offence to use the internet or mobile phones to menace, harass or cause offence to someone.8 You can report this to the police. You can also report it to the eSafety Commission (you can"
Sexting.pdf,3,"being bullied about a photo of myself that I sent to someone else? It is an offence to use the internet or mobile phones to menace, harass or cause offence to someone.8 You can report this to the police. You can also report it to the eSafety Commission (you can do this anonymously). You could get the person’s number blocked on your phone so that they can’t contact you or you can report and block them on social media sites like Facebook. You might want to talk to a friend or trusted adult for support. What about sending or posting fights? Queensland law in is the same for images or video of people under 16 being physically abused as for child pornography.9 It is an offence to have, make or give to someone these sorts of images or video.10 8 Criminal Code Act 1899 (Qld) s 474.17. 9 Criminal Code Act 1899 (Qld) s 207A. 10 Criminal Code Act 1899 (Qld) ss 228B-228D. Sexting Who can I contact for support Youth Advocacy Centre (YAC) www.yac.net.au 3356 1002 Aboriginal & Torres Strait Islander Legal Service (24hrs 7 days a week) www.atsils.org.au 3025 3888 or (free call) 1800 012 255 Logan Youth & Family Legal Service www.yfs.org.au 3826 1500 Legal Aid Queensland www.legalaid.qld.gov.au 1300 651 188 Hub Community Legal www.hubcommunity.org.au 3372 7677 Youth Legal Advice Hotline (Monday – Thursday 8am – 9pm; Friday 8am – Sunday 5pm) 1800 527 527 Community Legal Centres (CLCs) see www.naclc.org.au for your nearest CLC About the Youth Advocacy Centre The Youth Advocacy Centre offers free and confidential legal and social support services for young people in Queensland. www.yac.net.au (07) 3356 1002"
Sexting.pdf,4,Youth Advocacy Centre The Youth Advocacy Centre offers free and confidential legal and social support services for young people in Queensland. www.yac.net.au (07) 3356 1002
Child-protection-Offender-reporting.pdf,0,"Child protection – Offender reporting Who has to report? If you have been convicted and a conviction has been recorded for of an offence involving any sexual activity with someone under 16, including sexting more than one time, you can be put on the Child Protection Offender Reporting Register.1 This means you have to report details about yourself and where you are to police. This is so police can keep track of where you are living and working. If you have not been found guilty of a sexual offence against a person under 16, but you have been convicted of another offence and the court thinks you are a sexual risk to anyone under 16 it can order you to report details about yourself and your movements.2 You must be given a written document by a Youth Justice Officer or Police Officer which says what things you have to report to police about. If you think the court should not have made this order speak to your lawyer about an appeal. If you have to report, your details will be put on the Child Protection Offender Reporting Register.3 Only certain people can see this register and they have to keep the information confidential.4 You may also be recorded on a national sex offenders register. Once someone’s name is on the Queensland register it can only be removed if the police agree. There are serious employment consequences for anyone who is recorded on the register, for example they may not be allowed to be a teacher, nurse or child care worker. If you have been ordered to report because of child sex offences in another state of Australia and you come to Queensland for more than 14 days, you must tell the police in Queensland you are here. What do I"
Child-protection-Offender-reporting.pdf,1,"allowed to be a teacher, nurse or child care worker. If you have been ordered to report because of child sex offences in another state of Australia and you come to Queensland for more than 14 days, you must tell the police in Queensland you are here. What do I have to report? 1 Child Protection (Offender Reporting and Offender Prohibition Order) Act 2004 (Qld) s 5. Specifically see section(5)(2)(a) person is not a reportable offender only because the person was convicted of a prescribed offence, if the conviction was not recorded under the Penalties and Sentences Act 1992, section 12 or the Youth Justice Act 1992, section 183. 2 Child Protection (Offender Reporting and Offender Prohibition Order) Act 2004 (Qld), s 12A (Offender reporting order defined), s12B(Making offender reporting order—conviction for offence other than prescribed offence), s 12C(Making offender reporting order—forensic order), s12D(Matters court must consider before making offender reporting order) & s12E (Court may act on own initiative or application). 3 Child Protection (Offender Reporting and Offender Prohibition Order) Act 2004 (Qld), s 68. 4 Child Protection (Offender Reporting and Offender Prohibition Order) Act 2004 (Qld), s 69 (Access to the register to be restricted) & s 70 (Confidentiality). Reviewed July 2023 This sheet is intended to provide general legal information about the law in Queensland. This information is not legal advice. If you have a particular legal problem you should contact a solicitor for legal advice. At the end is a list of agencies that might be able to assist you, including legal agencies. Child protection – Offender reporting You must report all the following information and report when anything in the list changes (including stopping or starting some activity, eg a child living with you) within the time allowed. Information you must report includes: 5 Name"
Child-protection-Offender-reporting.pdf,2,"able to assist you, including legal agencies. Child protection – Offender reporting You must report all the following information and report when anything in the list changes (including stopping or starting some activity, eg a child living with you) within the time allowed. Information you must report includes: 5 Name and address, age and date of birth, any telephone contact number, and any email 24 hours address belonging to anyone under 18 you will have or have had within the previous 24 hours ‘reportable contact’ with. Reportable Contact is physical contact, communication in person, in writing, over the phone or by internet or befriending.6 This applies to children whom you are familiar, friends or children you look after or supervise or children you befriend. Reportable contact does not include contact with children incidental to life for example, buying takeaway food from a shop that has child employees. You also have to report the type of contact you have or will have with the child Your name, any previous name and how long you were known by the previous name 7 days Your date and place of birth 7days Where you live and if you don’t have an address then the area where you are usually. 7days However, if you are subject to an order under the Dangerous Prisoners (Sexual Offenders) Act 2003 (Qld) you must notify of a change in address or locality within 24 days Details of any current, previous or new tattoos or permanent marks on your body 7days If employed, nature of employment, name of employer, address or locality of places of 7days employment Name of any club or organisation you are part of where people under 18 go 7days The make, model, colour and registration number of any: 7days • car you own or drive for"
Child-protection-Offender-reporting.pdf,3,"7days If employed, nature of employment, name of employer, address or locality of places of 7days employment Name of any club or organisation you are part of where people under 18 go 7days The make, model, colour and registration number of any: 7days • car you own or drive for any 7 or more days of the year • caravan or trailer you reside in or that has been attached to a vehicle you have driven for 7 days within the last year If you had to report in another state or country because you were convicted of a sexual 7days offence that involved children under 16 you need to say when and where this happened If you have been in detention since you started reporting, report when and where this 7days was Details of any phone or internet you use or plan to use and the type of service 7days Details of social networking sites you are involved in, registered, or open an account with 7days Details of any email addresses, internet user names or any other user name or identity 7days you use or plan to use on the internet or phones and associated passwords Details of each digital device that you own or have access to including software 7days application stored or accessed by each device7 Your passport number and the country of issue of your passport If you plan to leave Queensland to travel within Australia: 7 days • for 48 hours or more; or before • at least once a month, then you need to say the general reasons for your travel, leaving how often you will travel and generally where you are going. 5 Child Protection (Offender Reporting and Offender Prohibition Order) Act 2004 (Qld) s 10A and Schedule 2, ss 19A-23. 6 Child"
Child-protection-Offender-reporting.pdf,4,"• at least once a month, then you need to say the general reasons for your travel, leaving how often you will travel and generally where you are going. 5 Child Protection (Offender Reporting and Offender Prohibition Order) Act 2004 (Qld) s 10A and Schedule 2, ss 19A-23. 6 Child Protection (Offender Reporting and Offender Prohibition Order) Act 2004 (Qld) s 9A(1)&(2). 7 New amendment through the Child Protection (Offender Reporting and Offender Prohibition Order) and Other Legislation Amendment Bill 2022 that commenced on 22 August 2023. Child protection – Offender reporting When do I have to report? You will be given a Notice of Reporting obligation which will tell you when you need to first report. • Generally you need to report within 7 days of being sentenced for the offence8 • If you are in detention then you will need to report within 7 days of leaving detention9 • If you have just moved to Queensland and you had to report in your previous state or country, then you must contact a police station within 7 days of arriving in Queensland10 You will then be required to make periodic reports starting in the first month following the initial report. If you plan to leave Queensland for 48 hours or more in a row to travel elsewhere in or outside of Australia then at least 7 days before you leave you need to tell the police where you plan to go, the dates and address you will be staying at each place, when you will be back and the details of any contact that you will have with children outside the random contact in everyday life.11 If you change your travel plans or decide not to go you also need to report that within 48 hours.12 The Queensland police"
Child-protection-Offender-reporting.pdf,5,"at each place, when you will be back and the details of any contact that you will have with children outside the random contact in everyday life.11 If you change your travel plans or decide not to go you also need to report that within 48 hours.12 The Queensland police will give a copy of the report of your travel plans to the Australian Federal Police.13 When you return to Queensland, you must report your return within 48 hours remaining and entering in Queensland.14 How long to do I have to report for? The length of time you have to report for depends on the specific offences you have been found guilty of and whether you were later found guilty of further sexual offences against people under 16 years of age.15 Where and how do I report? If you are given a Notice that says you have to report at a particular police station then you need to report at that station in person, otherwise you can report to your local police station in person.16 You should take ID to show who you are or the police officer may take your fingerprints. You must provide a DNA sample to the police if they ask for it.17 8 Child Protection (Offender Reporting and Offender Prohibition Order) Act 2004 (Qld), s14 & schedule 3. 9 Ibid. 10 Ibid. 11 Child Protection (Offender Reporting and Offender Prohibition Order) Act 2004 (Qld) s 20. 12 Child Protection (Offender Reporting and Offender Prohibition Order) Act 2004 (Qld) s 22. 13 Child Protection (Offender Reporting and Offender Prohibition Order) Act 2004 (Qld) s 24. 14 Child Protection (Offender Reporting and Offender Prohibition Order) Act 2004 (Qld) s 22. 15 Child Protection (Offender Reporting and Offender Prohibition Order) Act 2004 (Qld) s 36. 16 17 Child protection"
Child-protection-Offender-reporting.pdf,6,"2004 (Qld) s 22. 13 Child Protection (Offender Reporting and Offender Prohibition Order) Act 2004 (Qld) s 24. 14 Child Protection (Offender Reporting and Offender Prohibition Order) Act 2004 (Qld) s 22. 15 Child Protection (Offender Reporting and Offender Prohibition Order) Act 2004 (Qld) s 36. 16 17 Child protection – Offender reporting You must report in person for your first report, yearly reports, reports about change of address and a report about a new tattoo, removal of tattoo, change to a tattoo or new permanent mark on your body.18 The police officer may require you to be photographed. Other reports can be made by telephone or online to your police station. Speak to the police about organising this. When you report in person you can ask to speak to the police where other people cannot hear and you can have someone with you to support you. As soon as possible after the police receive your report, the police officer must send you a letter with a copy of the information you reported. What if I move to a different state? The law says you have to tell the police in Queensland if you plan to move out of Queensland.19 The law in your new state might also say you have to report to the police once you get there. What if I don’t report when I am meant to or lie when I report? If you don’t comply with the reporting obligations, unless you can prove you have a reasonable excuse, you are committing an offence.20 Can my phone be accessed by police? If the police reasonably believe that you have committed an offence then they have the power to take your electronic devices.21 18 Child Protection (Offender Reporting and Offender Prohibition Order) Act 2004 (Qld) s 10A and"
Child-protection-Offender-reporting.pdf,7,"reasonable excuse, you are committing an offence.20 Can my phone be accessed by police? If the police reasonably believe that you have committed an offence then they have the power to take your electronic devices.21 18 Child Protection (Offender Reporting and Offender Prohibition Order) Act 2004 (Qld) s 10A and Schedule 2. 19 Child Protection (Offender Reporting and Offender Prohibition Order) Act 2004 (Qld) s 19A. 20 Child Protection (Offender Reporting and Offender Prohibition Order) Act 2004 (Qld) s 50. 21 Police Powers and Responsibilities Act 2000 (Qld) s 29(1)-(2). Child protection – Offender reporting Who can I contact for support Youth Advocacy Centre (YAC) www.yac.net.au 3356 1002 Aboriginal & Torres Strait Islander Legal Service (24hrs 7 days a week) www.atsils.org.au 3025 3888 or (free call) 1800 012 255 Logan Youth & Family Legal Service www.yfs.org.au 3826 1500 Legal Aid Queensland www.legalaid.qld.gov.au 1300 651 188 Hub Community Legal www.hubcommunity.org.au 3372 7677 Youth Legal Advice Hotline (Monday – Thursday 8am – 9pm; Friday 8am – Sunday 5pm) 1800 527 527 Community Legal Centres (CLCs) see www.naclc.org.au for your nearest CLC About the Youth Advocacy Centre The Youth Advocacy Centre offers free and confidential legal and social support services for young people in Queensland. www.yac.net.au (07) 3356 1002"
Police-Facts-You-Need-to-Know-November-2023.pdf,0,"POLICE – FACTS YOU NEED TO KNOW This sheet is intended to provide general legal information about the law in Queensland. This information is not legal advice. If you have a particular legal problem you should contact a solicitor for legal advice. At the end is a list of agencies that might be able to assist you, including legal agencies. What do I have to tell the police? You have the right to silence. This applies even if you have been arrested for questioning. This means that do not have to make a statement or answer any questions, except you must give your correct name, address, and age. Not giving your name, address or age is an offence. Remember, there is no such thing as an ‘off-the-record chat.’ If you choose to answer police questions you can choose to answer only some of the questions and not all. It is a good idea to get legal advice before answering police questions. You can get free legal advice from the lawyers listed below. Anything you say can be used (and often is) in a police case against you. Do I have to carry ID on me? No… There is no law that says you have to carry ID, BUT if a police officer believes you have given a false name, address or age, they can detain you to find out who you are. If you are driving a car (including on a ‘L’ or ‘P’ plate) then it is an offence to fail to produce your driver’s licence if the police request it. Do Police have to show their ID? Sometimes… If a police officer is in plain clothes and they want to do something like arrest, search or make you ‘move-on’ the officer must tell you that they are a"
Police-Facts-You-Need-to-Know-November-2023.pdf,1,"to fail to produce your driver’s licence if the police request it. Do Police have to show their ID? Sometimes… If a police officer is in plain clothes and they want to do something like arrest, search or make you ‘move-on’ the officer must tell you that they are a police officer and state their name, rank and station and show you their ID. If they are in uniform, they just have to tell you their name, rank and station. If the officer does not tell you, you can ASK. Do I have to go with a police officer? You do not have to go with a police officer unless you are arrested, but there is a law which states you must go with them if you have witnessed a breach of the peace. The police can arrest you to question you if they believe that you have broken or are breaking the law. If you are arrested for questioning you still do not have to answer any questions except to give your correct name, address and age. Unless the police know a lawyer has been organised for you, the police must contact a representative from a legal aid organisation and inform them before you are questioned. When can the police take my photograph? The police can only photograph you if you are arrested and charged. You do not have to agree to be photographed when being ‘street checked”. All police have body-worn cameras and there are rules police have to follow about how they use these cameras. All police must wear a body-worn camera while they are on-duty, and they can record you. What rules do the police have to follow when using a body-worn camera? • The police cannot record unclothed searches, but can record clothed searches •"
Police-Facts-You-Need-to-Know-November-2023.pdf,2,"to follow about how they use these cameras. All police must wear a body-worn camera while they are on-duty, and they can record you. What rules do the police have to follow when using a body-worn camera? • The police cannot record unclothed searches, but can record clothed searches • The police do not have to stop recording you if you ask • The police generally have to be in uniform, or easily identifiable as a police officer, when using a body-worm camera • Whatever the police record can be used as evidence. If police have Body Worn Cameras they must record if they - • Are investigating a crime (e.g. seizing property or searching you) or arresting someone • Are using physical force against a person • Believe something should be recorded (the police can also start recording after an incident occurs). Do I have to be in a line up or give a DNA sample? No… You do not have to go with a police officer to be in a line up or to give them your DNA even if the police say they think you have broken the law. You should talk to a lawyer before agreeing to either of these things. © Youth Advocacy Centre Inc 1 Can police move me on? Yes, if … • You are in a public place or regulated place; and • Police think you caused (either through your behaviour or by just being there) a certain effect on people like causing anxiety. See our ‘Move On’ Fact Sheet for more information. What if I am arrested? You can ask why you are under arrest, but resisting arrest is an offence. You have the right to ask why the police officer is demanding you go with them. If you are not"
Police-Facts-You-Need-to-Know-November-2023.pdf,3,"causing anxiety. See our ‘Move On’ Fact Sheet for more information. What if I am arrested? You can ask why you are under arrest, but resisting arrest is an offence. You have the right to ask why the police officer is demanding you go with them. If you are not under arrest, then you do not have to go with the police. If you are under arrest, a police officer must tell you why you are under arrest. Even if you have been arrested and charged you do not have to answer police questions. The police usually will not tell you about your right to remain silent unless they have decided to charge you with a criminal offence. A police officer is only allowed to use ‘reasonable force’ to carry out their job. Stay cool and calm and talk to a lawyer later about what you can do if you think the arrest was unfair or wrong or the police injured you. How long can the police hold me? The police can arrest and hold you for questioning for up to 8 hours to investigate an offence and question you about any offences they think you may have committed. They can only question you for 4 hours of that time. The time limit starts at the time you were arrested or were taken by police. The police can ask a JP or Magistrate to allow them to hold you and question you for a longer period of time. Remember, you can be held for questioning but you do not have to answer any questions, except your name, age and address. Who can I have with me during police questioning? Generally, if you are under 18 and questioned by police, you must have a ‘support person’ with you. The support person"
Police-Facts-You-Need-to-Know-November-2023.pdf,4,"can be held for questioning but you do not have to answer any questions, except your name, age and address. Who can I have with me during police questioning? Generally, if you are under 18 and questioned by police, you must have a ‘support person’ with you. The support person should be: • a parent or guardian • a lawyer • a person who is acting for you who works in an agency that deals with the law • a relative or friend you would like to have there. • If none of these are available, then a justice of the peace (JP). You should tell the police which person you would like to have with you. The police should also give you the opportunity to talk to this person in private (where they cannot overhear you) before the questioning starts. If you are arrested the police have to make a reasonable effort to contact your parents, the police must take note if they cannot contact your parents. If you are being questioned about a minor offence such as littering then a ‘support person’ is not required. How much do I have to tell police at the station? You still have the right to silence at the police station. Whether you agree to go with the police or you are under arrest, you do not have to make a statement or answer any questions (in writing, on video or audio). You have the right to say NO to any form of interview BUT you should give your correct name, address and age each time you are asked. The police have to try and contact Legal Aid or the Aboriginal and Torres Strait Islander Legal Service before they interview you about a serious criminal offence (for example an offence that can"
Police-Facts-You-Need-to-Know-November-2023.pdf,5,"of interview BUT you should give your correct name, address and age each time you are asked. The police have to try and contact Legal Aid or the Aboriginal and Torres Strait Islander Legal Service before they interview you about a serious criminal offence (for example an offence that can be tried by a Judge and jury in the District or Supreme Court). If you do participate in a police interview about a serious criminal offence, then the police should record it on video or audio. The police will give you a copy of the DVD after the interview. It is important to keep this DVD. If the police are unable to record your interview, then they can write it down and read it back to you. If you don’t agree with anything in the statement you should tell them at the time and ask them to change it. The police must give you a copy of the written record at the time. Even if you answered the questions you do not have to sign what the police wrote down. Do not sign anything you have not read, do not understand, or do not agree with. You do not have to write any statement. Lying to the police can get you into more trouble. Am I entitled to make a phone call? Yes, as long as it is to speak with a support person or solicitor. © Youth Advocacy Centre Inc 2 What if I am charged with an offence? If you are under 18 then you may be cautioned, sent to a Youth Restorative Justice Conference, sent to a Drug Diversion Assessment Program or sent to court. See our ‘If I am Charged’ Fact Sheet for more information. Treated unfairly? If the police do not treat you fairly and"
Police-Facts-You-Need-to-Know-November-2023.pdf,6,"If you are under 18 then you may be cautioned, sent to a Youth Restorative Justice Conference, sent to a Drug Diversion Assessment Program or sent to court. See our ‘If I am Charged’ Fact Sheet for more information. Treated unfairly? If the police do not treat you fairly and politely you have the right to complain about it without the threat of being harassed. You can speak to the Crime and Corruption Commission on the phone number below. See our ‘Treated Unfairly’ Fact Sheet for more information. Who can help? Youth Advocacy Centre (YAC) www.yac.net.au ...................................................................... 3356 1002 Youth Legal Advice Hotline………………………………………………………………………………………………………………………………………1800 527 527 (Monday - Thursday 8am – 9pm; Friday 8am – Sunday 5pm) Hub Community Legal www.hubcommunity.org.au ................................................................. 3372 7677 Logan Youth & Family Legal Service www.yfs.org.au .............................................................. 3826 1500 Legal Aid Queensland www.legalaid.qld.gov.au ...................................................................... 1300 651 188 Aboriginal & Torres Strait Islander Legal Service www.atsils.org.au ........................................ 3025 3888 or (free call) 1800 012 255 (24hrs 7 days a week) Crime and Corruption Commission www.ccc.qld.gov.au ......................................................... 33606060 (free call outside Brisbane) 1800 061 611 Community Legal Centres (CLCs) see www.naclc.org.au for your nearest CLC This information was last reviewed and updated in November 2023. The Youth Advocacy Centre does not accept responsibility for any action or outcome as a result of anyone relying on the information provided. © Youth Advocacy Centre Inc 3"
Supporting your young person through the youth justice system _ Department of Youth Justice and Victim Support.pdf,0,"26/08/2025, 15:32 Supporting your young person through the youth justice system | Department of Youth Justice and Victim Support Department of Youth Justice and Victim Support Young people and the youth justice system (https://www.youthjustice.qld.gov.au/parents-carers/youth- justice-system) >> Supporting your young person through the youth justice system Supporting your young person through the youth justice system This page will help understand a young person's journey through the youth justice system, and your responsibilities at each step. Our youth justice system aims to provide a fair and balanced response to young people who come in contact with the law. We hold young people accountable for their actions, encourage them to integrate into the community, provide them with skills to create a better future for themselves, and promote community safety. Find out more about the youth justice principles, policy and practices (https://www.qld.gov.au/law/sentencing-prisons-and-probation/young-offenders-and-the- justice-system/youth-justice-in-queensland/how-the-youth-justice-system-works) under the Youth Justice Act 1992 (Qld). Contact with police If a young person is believed to have committed an offence, they may be cautioned by the police or given the opportunity to participate in a restorative justice conference (a facilitated meeting with a victim or their representative). Otherwise, the police may decide to start court proceedings. This means a young person would be charged and either given a notice to appear in court, or arrested and held in a watch-house or detention centre until they can be seen in court. https://www.youthjustice.qld.gov.au/parents-carers/youth-justice-system/supporting-your-child-through-the-youth-justice-system 1/8 26/08/2025, 15:32 Supporting your young person through the youth justice system | Department of Youth Justice and Victim Support Learn more about what happens when arrested (https://www.qld.gov.au/law/crime-and- police/being-arrested-and-police-custody). Restorative justice conferences If a young person breaks the law, the police or court may refer the young person to a youth justice or restorative justice conference. A restorative justice conference (https://www.qld.gov.au/law/sentencing-prisons-and- probation/young-offenders-and-the-justice-system/youth-justice-community-programs- and-services/restorative-justice-conferences) (formerly known as a youth justice"
Supporting your young person through the youth justice system _ Department of Youth Justice and Victim Support.pdf,1,"Support Learn more about what happens when arrested (https://www.qld.gov.au/law/crime-and- police/being-arrested-and-police-custody). Restorative justice conferences If a young person breaks the law, the police or court may refer the young person to a youth justice or restorative justice conference. A restorative justice conference (https://www.qld.gov.au/law/sentencing-prisons-and- probation/young-offenders-and-the-justice-system/youth-justice-community-programs- and-services/restorative-justice-conferences) (formerly known as a youth justice conference) is a meeting between a young offender who has committed a crime and the people affected by that crime. It is designed to hold the young person accountable for their actions, help them understand the harm they’ve caused and for parties to agree on ways to make amends. Legal support Every young person charged with an offence has the right to free legal representation. A duty lawyer is automatically appointed. If your child identifies as Aboriginal or Torres Strait Islander, they will have access to the Aboriginal and Torres Strait Islander Legal Service (http://www.legalaid.qld.gov.au/Find-legal-information/Criminal-justice/Criminal-court- process/Criminal-law-duty-lawyer) (ATSILS). Your child may wish to choose their own lawyer, which may be funded through a Legal Aid application. Find out more about: when you or your child may need a lawyer (http://www.legalaid.qld.gov.au/Get-legal- help/Going-to-court-and-getting-a-lawyer) and how to access that advice for your child where to find a community legal centre (http://communitylegalqld.org.au/find-legal- help). https://www.youthjustice.qld.gov.au/parents-carers/youth-justice-system/supporting-your-child-through-the-youth-justice-system 2/8 26/08/2025, 15:32 Supporting your young person through the youth justice system | Department of Youth Justice and Victim Support Appearing in court If a young person has been charged with an offence committed before their 17th birthday, they first go to the Childrens Court. This court has a magistrate and is usually closed to the general public and the media. Not all matters can be finalised at the first court appearance. Some matters are postponed, or adjourned, until a later date. Find out more about what happens in the Childrens Court (https://www.qld.gov.au/law/sentencing-prisons-and-probation/young-offenders-and-the- justice-system/your-child-in-court), how you can support a young person"
Supporting your young person through the youth justice system _ Department of Youth Justice and Victim Support.pdf,2,"is usually closed to the general public and the media. Not all matters can be finalised at the first court appearance. Some matters are postponed, or adjourned, until a later date. Find out more about what happens in the Childrens Court (https://www.qld.gov.au/law/sentencing-prisons-and-probation/young-offenders-and-the- justice-system/your-child-in-court), how you can support a young person in court, and what happens after a young person attends court. There may be grounds for the charges against a young person to be dismissed. For example, the matter could be dismissed if there is not enough evidence. Possible outcomes from appearing in court If your child’s matter can’t be finalised, the magistrate will decide whether your child is granted bail or remanded (i.e. held) in custody during the adjournment period. If the matter is finalised, your child may be sentenced or have their charges dismissed. Open all Adjournment The matter is postponed until a later date. Bail The court may release a young person into the community. Sometimes bail will have conditions. Young people must sign a bail undertaking after court and this paperwork will note all conditions of bail (https://www.qld.gov.au/law/sentencing-prisons-and-probation/young-offenders-and- the-justice-system/sentencing-young-offenders/bail-and-bail-with-conditions). https://www.youthjustice.qld.gov.au/parents-carers/youth-justice-system/supporting-your-child-through-the-youth-justice-system 3/8 26/08/2025, 15:32 Supporting your young person through the youth justice system | Department of Youth Justice and Victim Support A curfew may be included as a condition of bail. This will usually mean a young person must stay at a particular address between certain hours of the day or night. A young person may be given a conditional bail program and may be allocated a Youth Justice case worker. During the bail period the case worker may help a young person engage with a range of community-based support services. They may also organise activities to help a young person comply with their bail conditions. While on bail a young person may also be ordered to"
Supporting your young person through the youth justice system _ Department of Youth Justice and Victim Support.pdf,3,"Youth Justice case worker. During the bail period the case worker may help a young person engage with a range of community-based support services. They may also organise activities to help a young person comply with their bail conditions. While on bail a young person may also be ordered to take part in a restorative justice process during the adjournment period. This is known as a ‘pre-sentence referral’. During this facilitated conference a young person will meet with a victim or their representative. Remand If a young person is remanded (or held) in custody they are housed in either Brisbane Youth Detention Centre or Cleveland Youth Detention Centre in Townsville. A young person is allocated a case worker for the duration of the remand period. The case worker will contact you to let you know how a young person is going. They will also liaise with the young person lawyer, agencies and support services to ensure the young person is supported while in custody. The worker will develop a case plan that aims to address the young persons’ needs and plans for their transition back into the community. Visits from family members or significant others can be arranged but require prior approval. Sentencing The magistrate will make the final decision on an appropriate sentence. This may be influenced by things like the number and seriousness of the offences, a young person’s previous criminal history, and the risk of further offending. https://www.youthjustice.qld.gov.au/parents-carers/youth-justice-system/supporting-your-child-through-the-youth-justice-system 4/8 26/08/2025, 15:32 Supporting your young person through the youth justice system | Department of Youth Justice and Victim Support A young person’s sentence will depend on the offence they’ve been charged with. If the young person pleads or is found guilty, the court has a range of sentencing options. (https://www.qld.gov.au/law/sentencing-prisons-and-probation/young- offenders-and-the-justice-system/sentencing-young-offenders) Caution —the court may dismiss a young"
Supporting your young person through the youth justice system _ Department of Youth Justice and Victim Support.pdf,4,"youth justice system | Department of Youth Justice and Victim Support A young person’s sentence will depend on the offence they’ve been charged with. If the young person pleads or is found guilty, the court has a range of sentencing options. (https://www.qld.gov.au/law/sentencing-prisons-and-probation/young- offenders-and-the-justice-system/sentencing-young-offenders) Caution —the court may dismiss a young person’s charge and instead issue, or ask police to issue, a caution. Reprimand —a warning issued by the court. Good behaviour order —the court may determine a period of time that a young person must remain of good behaviour. Court diversion referral —a young person may be directed to take part in a restorative justice process, which can involve meeting with the victim of their offence. Probation order —a young person may be ordered to regularly report to a Youth Justice office for a specified period of time and engage in activities that address identified risks and needs. Community service order —a young person may be ordered to complete a specified number of voluntary work hours, supervised by Youth Justice staff. Graffiti removal order —a young person may be ordered to engage in activities specifically related to the removal of graffiti, supervised by Youth Justice staff. Restorative justice order — a young person may be ordered to take part in a facilitated conference with a victim or a victim’s representative. Intensive supervision order —if a young person is under 13, they may be ordered to participate in a more intensive program of activities as directed by Youth Justice staff. Conditional release order —a community-based alternative to detention. A young person will be ordered to take part in an intensive program of activities for up to 3 months. Detention —a young person may be sentenced to detention in either Brisbane Youth Detention Centre or Cleveland Youth Detention Centre in Townsville. The"
Supporting your young person through the youth justice system _ Department of Youth Justice and Victim Support.pdf,5,"release order —a community-based alternative to detention. A young person will be ordered to take part in an intensive program of activities for up to 3 months. Detention —a young person may be sentenced to detention in either Brisbane Youth Detention Centre or Cleveland Youth Detention Centre in Townsville. The magistrate or judge will determine the length of the detention order. A percentage of that order will usually be served in the community as a supervised release order (https://www.qld.gov.au/law/sentencing-prisons- and-probation/young-offenders-and-the-justice-system/sentencing-young- offenders/youth-court-orders/supervised-release-orders). https://www.youthjustice.qld.gov.au/parents-carers/youth-justice-system/supporting-your-child-through-the-youth-justice-system 5/8 26/08/2025, 15:32 Supporting your young person through the youth justice system | Department of Youth Justice and Victim Support Learn more about youth detention (https://www.qld.gov.au/law/sentencing- prisons-and-probation/young-offenders-and-the-justice-system/youth- detention), including: – the rules – a young person’s rights – access to education – how we manage the centres – how to complain about a youth detention centre. Monetary orders —the magistrate may order a young person to pay a fine, restitution or compensation depending on the nature of their offence and their capacity to pay. Dismissal There may be grounds for the charges against a young person to be dismissed. For example, the matter could be dismissed if there is not enough evidence. Our role Youth Justice is advised whenever a young person is charged with an offence. If a young person is held in custody at a youth detention centre before their court appearance, they will be supported by detention centre staff. Detention centre staff will ensure a young person contacts you as soon as possible. Contact the Brisbane or Cleveland youth detention centres (https://www.qld.gov.au/law/sentencing-prisons-and- probation/young-offenders-and-the-justice-system/youth-detention/about-youth- detention) if you have any concerns. A court officer will also attend court with a young person. They may speak to you and the young person to gain information to assist the court. Court officers represent us in court but have separate"
Supporting your young person through the youth justice system _ Department of Youth Justice and Victim Support.pdf,6,"Brisbane or Cleveland youth detention centres (https://www.qld.gov.au/law/sentencing-prisons-and- probation/young-offenders-and-the-justice-system/youth-detention/about-youth- detention) if you have any concerns. A court officer will also attend court with a young person. They may speak to you and the young person to gain information to assist the court. Court officers represent us in court but have separate roles to defence lawyers and police. After court, the officer may speak to the young person to help explain any outcomes. Depending on the outcome, a young person may be directed to have ongoing contact with a local youth justice service centre (https://www.qld.gov.au/law/sentencing-prisons- https://www.youthjustice.qld.gov.au/parents-carers/youth-justice-system/supporting-your-child-through-the-youth-justice-system 6/8 26/08/2025, 15:32 Supporting your young person through the youth justice system | Department of Youth Justice and Victim Support and-probation/young-offenders-and-the-justice-system/youth-justice-in- queensland/youth-justice-centre-locations). Find out more about a young person in court. (https://www.qld.gov.au/law/sentencing-prisons-and-probation/young-offenders-and-the- justice-system/your-child-in-court/going-to-court-with-your-child) Parent or guardian responsibilities It’s very important for a parent or guardian to attend court (https://www.qld.gov.au/law/sentencing-prisons-and-probation/young-offenders-and-the- justice-system/your-child-in-court/going-to-court-with-your-child) with a young person. The magistrate may not hear a young person’s matter if you are not present and may order them to attend on a future date. You may be asked for further information about a young person while in court to help the magistrate make a decision. If a young person is referred to a youth/restorative justice conference (https://www.qld.gov.au/law/sentencing-prisons-and-probation/young-offenders-and-the- justice-system/youth-justice-community-programs-and-services/restorative-justice- conferences), you will receive more information after court. We encourage you to take part in this process to support a young person and help prevent reoffending. Information and support In the first instance you may be able to speak with the court officer and/or our representative in court who was present during a young person’s hearing. Youth Justice staff will be able to provide you further contact details for the youth justice service centre (https://www.qld.gov.au/law/sentencing-prisons-and-probation/young- offenders-and-the-justice-system/youth-justice-in-queensland/youth-justice-centre- locations) a young person may need to report to, or the contact details for the detention centre (https://www.qld.gov.au/law/sentencing-prisons-and-probation/young-offenders-"
Supporting your young person through the youth justice system _ Department of Youth Justice and Victim Support.pdf,7,"our representative in court who was present during a young person’s hearing. Youth Justice staff will be able to provide you further contact details for the youth justice service centre (https://www.qld.gov.au/law/sentencing-prisons-and-probation/young- offenders-and-the-justice-system/youth-justice-in-queensland/youth-justice-centre- locations) a young person may need to report to, or the contact details for the detention centre (https://www.qld.gov.au/law/sentencing-prisons-and-probation/young-offenders- and-the-justice-system/youth-detention/about-youth-detention) a young person will be transferred to. Young people and the youth justice system (https://www.youthjustice.qld.gov.au/parents- https://www.youthjustice.qld.gov.au/parents-carers/youth-justice-system/supporting-your-child-through-the-youth-justice-system 7/8 26/08/2025, 15:32 Supporting your young person through the youth justice system | Department of Youth Justice and Victim Support carers/youth-justice-system) Supporting your young person through the youth justice system (https://www.youthjustice.qld.gov.au/parents-carers/youth-justice- system/supporting-your-child-through-the-youth-justice-system) How the youth justice system works (https://www.youthjustice.qld.gov.au/parents- carers/youth-justice-system/how-it-works) Sentencing young offenders (https://www.youthjustice.qld.gov.au/parents- 〉 carers/youth-justice-system/sentencing-young-offenders) Last reviewed: 28 November 2024 Last modified: 28 November 2024  Provide feedback (https://www.families.qld.gov.au/feedback?id=34828) This work is licensed under a Creative Commons Attribution 4.0 International (CC BY 4.0) licence (https://creativecommons.org/licenses/by/4.0/) https://www.youthjustice.qld.gov.au/parents-carers/youth-justice-system/supporting-your-child-through-the-youth-justice-system 8/8"
Who We Are - PCYC Queensland.pdf,0,"26/08/2025, 15:51 Who We Are - PCYC Queensland Contact Us Work With Us News Events Sunshine Lottery Make a donation Locations Get School Our Get Our Near You Active Services Programs Involved Impact Make a donation Locations Near Get School Our Get Our You Active Services Programs Involved Impact Contact Us Work With Us News Events Sunshine Lottery Home / Our Impact / Who We Are About PCYC Queensland Police-Citizens Youth Clubs (PCYC) Queensland is an award-winning charity providing youth and community programs, services and facilities. https://www.pcyc.org.au/our-impact/who-we-are/ 1/7 26/08/2025, 15:51 Who We Are - PCYC Queensland About Us PCYC Queensland builds safer, healthier communities through youth development. We deliver programs and services for young people which focus on raising their gaze, improving wellbeing, promoting leadership, and celebrating who they are while encouraging them to strive for their full potential. When our young people thrive, so do our communities. Everything we do across our youth programs is driven by our key pillars: youth development, crime prevention and community engagement. While our core programs share the same philosophies, we operate across a diverse range of socio-economic environments, and tailor the way we deliver programs and activities based on the needs of each community. We’re also one of Queensland’s largest providers of sport and recreation activities through our Gym+Fitness centres and clubs, which offer activities ranging from Gymnastics, Boxing, and Little n Active for our under-fives. Additionally, PCYC Queensland is one of the state’s largest providers of outside school hours care. Our Fun Squads have almost 100 services, where a child- centred approach and highly https://www.pcyc.org.au/our-impact/who-we-are/ 2/7 26/08/2025, 15:51 Who We Are - PCYC Queensland experienced educators deliver a program that is both Seriously Fun and focusses on wellbeing, resilience, leadership and confidence. Mission and Vision Our vision: Building safer, healthier communities through"
Who We Are - PCYC Queensland.pdf,1,"Squads have almost 100 services, where a child- centred approach and highly https://www.pcyc.org.au/our-impact/who-we-are/ 2/7 26/08/2025, 15:51 Who We Are - PCYC Queensland experienced educators deliver a program that is both Seriously Fun and focusses on wellbeing, resilience, leadership and confidence. Mission and Vision Our vision: Building safer, healthier communities through youth development. Our mission: PCYC Queensland, in partnership with the QPS, provides young people with an environment that supports individual development, encourages community connection, and celebrates diversity. Our services and programs aim to develop and support, as well as challenge and inspire and are designed to meet the unique needs of communities right across Queensland. Each day our staff, volunteers and QPS officers work with our members to help them reach their potential and make positive life choices. Together, we are building safer, healthier communities through youth development. https://www.pcyc.org.au/our-impact/who-we-are/ 3/7 26/08/2025, 15:51 Who We Are - PCYC Queensland Social Impact PCYC Queensland currently has: 97 Fun Squad sites 55 clubs 6 discrete community locations 1200+ staff 1925 volunteers *Stats as at November 2024 In 12 months PCYC Queensland has had: https://www.pcyc.org.au/our-impact/who-we-are/ 4/7 26/08/2025, 15:51 Who We Are - PCYC Queensland 4,460,000+1,320,000+215,000 Engagements with Sport and First Nations youth young people Recreation program under 21 attendances engagements QPS and PCYC Queensland PCYC Queensland has proudly partnered with the Queensland Police Service (QPS) for more than 75 years. Our partnership with QPS helps enhance our ability to connect with youth, families, First Nations communities and anyone who engages with their local PCYC Queensland club. It also helps foster positive relationships between QPS and young Queenslanders. Each club has a QPS Youth and Community Program Manager (YCPM), who is crucial to the delivery of our core youth programs: https://www.pcyc.org.au/our-impact/who-we-are/ 5/7 26/08/2025, 15:51 Who We Are - PCYC Queensland After Dark Drop In Rise"
Who We Are - PCYC Queensland.pdf,2,"Queensland club. It also helps foster positive relationships between QPS and young Queenslanders. Each club has a QPS Youth and Community Program Manager (YCPM), who is crucial to the delivery of our core youth programs: https://www.pcyc.org.au/our-impact/who-we-are/ 5/7 26/08/2025, 15:51 Who We Are - PCYC Queensland After Dark Drop In Rise Up Be Yourself (RUBY) Braking the Cycle (BTC) Team Up Youth Leadership Team Cadet Club Club and Culture In 2019, we signed a Deed of Agreement to formally recognise the history of our partnership and its future of meeting youth and community needs. More about PCYC Governance News Queensland Events Child Safety Building safer, healthier communities through youth development. Locations Near You Get Active https://www.pcyc.org.au/our-impact/who-we-are/ 6/7 26/08/2025, 15:51 Who We Are - PCYC Queensland School Services Explore Our Locations Make a Donation Our Programs Please support young Queenslanders Get Involved Our Impact Get In Touch Contact us 07 3909 9555 admin@pcyc.org.au SIGN UP FOR THE LATEST UPDATES ABOUT PCYC QUEENSLAND Enter your email address FOLLOW US     PCYC Queensland would like to acknowledge and pay our respects to the traditional custodians of the lands on which our clubs are placed and their continuing connection to the land, sea and community. We also acknowledge and pay our respects to Elders, past and present. Aboriginal and Torres Strait Islander peoples should be aware that this website may contain the images, voices or names of people who have passed away. PCYC Queensland is a leading registered charity. Safeguarding Commitment Privacy Policy Terms of use ABN: 58 009 666 193 © 2025 PCYC Queensland Website by https://www.pcyc.org.au/our-impact/who-we-are/ 7/7"
Who We Are - PCYC Queensland.pdf,3,Policy Terms of use ABN: 58 009 666 193 © 2025 PCYC Queensland Website by https://www.pcyc.org.au/our-impact/who-we-are/ 7/7
What-are-rights-1.pdf,0,"What are ‘rights’? In 1990 the Australian Government entered an agreement to adopt the United Nations Convention on the Rights of the Child (CROC). This is a formal protection of human rights for children, that is, everyone under 18 years of age. This Convention is the most widely ratified human rights treaty in the world. This means that, along with many other countries in the world, Australia has agreed that people under 18 have rights, that is, they must be treated fairly and they also need some protections. Unfortunately, governments in Australia do not always ensure this happens. Here are some examples of rights which young people have under the Convention: • Right to a name, to be part of a country and to be known and cared for by your parents • Right to say what you think and to be listened to • Right to look for information, receive it and pass it on by writing, speaking, art, etc • Right to freedom of thought, conscience and religion • Right to meet with others and to join or form groups • Right to privacy • Right to not be abused, neglected or exploited • Right to the best possible health and medical care • Right to an education • Right to enjoy your own culture, religion and language • If you have been accused of breaking the law, the right to be treated with respect and to have legal help • If you are in care, the right to suitable alternative care with a family or institution and for regular checks that this is working well for you. You can see more on the Convention on the UNICEF website. The Human Rights and Equal Opportunity Commission (HREOC) should check that the Convention on the Rights of the Child"
What-are-rights-1.pdf,1,"to suitable alternative care with a family or institution and for regular checks that this is working well for you. You can see more on the Convention on the UNICEF website. The Human Rights and Equal Opportunity Commission (HREOC) should check that the Convention on the Rights of the Child is being followed and you can contact them if you are having hassles. Queensland also has a Human Rights Act (the Act) which includes some of these rights and others. These rights apply regardless of your skin colour, sex, religion, disability etc. The Act sets out some important rights that apply to young people under 18, including the right to privacy, education and protection, the right to enjoy culture and language, right to legal advice and representation, being held separately from adults if in custody on a charge, and the right to go to trial as quickly as possible.1 The Youth Justice Act overrides some of these rights. 1 Human Rights Act 2019 (Qld) ss 25, 36, 26, 27, 28, 31, 33. Reviewed 24/07/2025 This sheet is intended to provide general legal information about the law in Queensland. This information is not legal advice. If you have a particular legal problem you should contact a solicitor for legal advice. At the end is a list of agencies that might be able to assist you, including legal agencies. What are ‘rights’? If you feel that you have been treated unfairly by a state government agency (e.g. school, police, Child Safety) or someone providing a service to you that is paid for by the government (e.g. a residential) it may be best to try to talk to the person who is being unfair and explain why you feel you are being treated unfairly. If you are not happy with their response you"
What-are-rights-1.pdf,2,someone providing a service to you that is paid for by the government (e.g. a residential) it may be best to try to talk to the person who is being unfair and explain why you feel you are being treated unfairly. If you are not happy with their response you can then put a complaint into the Queensland Human Rights Commission. They can investigate what you say happened and decide whether the Human Rights Act 2019 (Qld) has been breached.2 2 Human Rights Act 2019 (Qld) s 77. What are ‘rights’? Who can I contact for support Youth Advocacy Centre (YAC) www.yac.net.au 3356 1002 Aboriginal & Torres Strait Islander Legal Service (24hrs 7 days a week) www.atsils.org.au 3025 3888 or (free call) 1800 012 255 Logan Youth & Family Legal Service www.yfs.org.au 3826 1500 Legal Aid Queensland www.legalaid.qld.gov.au 1300 651 188 Hub Community Legal www.hubcommunity.org.au 3372 7677 Youth Legal Advice Hotline (Monday – Thursday 8am – 9pm; Friday 8am – Sunday 5pm) 1800 527 527 Community Legal Centres (CLCs) see www.naclc.org.au for your nearest CLC About the Youth Advocacy Centre The Youth Advocacy Centre offers free and confidential legal and social support services for young people in Queensland. www.yac.net.au (07) 3356 1002
Searches-Updated-July-2023WM1.pdf,0,"SEARCHES This sheet is intended to provide general legal information about the law in Queensland. It is not legal advice. If you have a particular legal problem you should contact a solicitor for legal advice. At the end is a list of agencies that might be able to assist you, including legal agencies. Searches The police do not have a general right to search you or your property or to come into the place where you are living. When a police officer searches you without a legal right to do so, in circumstances where you have not agreed to be searched, they may be breaking the law themselves (assault). If the police come into the place where you are living without your agreement and they have no legal right of entry they are trespassing. When can the police search me or my bag? The police can ask to search you (including on the street) if they have reason to believe that you have: • a drug • a weapon, knife or explosive • stolen property • property that you have as the result of breaking the law • things that can be used for breaking into places, cars or taking drugs • anything else which may be evidence of an offence (such as something that can be used to graffiti) • alcohol that has been supplied to a minor without responsible supervision • things that can be used to hurt yourself or someone else; OR if the police believe you are going to break a law about casinos, racing, betting or prisons. The police will usually tell you the reason for the search - if not, ASK. UNDER REVIEW If the police give you a reason for the search (they tell you that they think you have got one of"
Searches-Updated-July-2023WM1.pdf,1,"are going to break a law about casinos, racing, betting or prisons. The police will usually tell you the reason for the search - if not, ASK. UNDER REVIEW If the police give you a reason for the search (they tell you that they think you have got one of the things in the list above) even if you think it’s unfair, you should let the police search otherwise you could be charged with an offence. The police officer must first warn you that it is an offence to obstruct a police officer who is doing a lawful search. You can tell the police you are not consenting to the search but allowing it because they say they have a legal right for the search. You should contact a solicitor as soon as possible afterwards if you want to speak to someone about what happened. When can police search me with a hand held scanner? Police can stop and search you or your belongings for knives or other weapons using a hand held scanner. Police can do this without a warrant, but only where: - • they have been given lawful authority by a senior police officer to conduct the search in the area; and • the search occurs within certain areas such as night club precincts, public transport, railway platforms and bus interchanges. Before a police officer searches you, they must provide their identification to you if you ask for it. The police officer must tell you that you must allow them to search you with a hand held scanner to see if you a carrying a knife or other weapon. They must also give you written information about the search if you ask for it. When searching you, they must do it in the least invasive way and"
Searches-Updated-July-2023WM1.pdf,2,"must allow them to search you with a hand held scanner to see if you a carrying a knife or other weapon. They must also give you written information about the search if you ask for it. When searching you, they must do it in the least invasive way and where possible, the police officer must be of the same sex. If the hand held scanner detects something, police can ask you to give the item to them or they can search you again using the hand held scanner. You should let the police search you and follow their directions. If you don’t, you could be charged with an offence. If you are unhappy with the search, contact a solicitor to talk about what happened and get some help. © Youth Advocacy Centre Inc. 1 Can I be strip searched in public? NO. Usually if you are in a public place the police can only ask you to take off a jacket or jumper, turn out your pockets or empty a bag. If they want you to remove any other clothing then the police officer (who must be of the same sex as you) should take you somewhere private. BUT if a police officer thinks that a search must be done straight away and it is urgent (for example, you have a bomb or a firearm or a knife hidden somewhere on your body) then a police officer can do an immediate strip search in public. If the police want to strip search you because they believe you have one of the things listed in ‘when can the police search me or my bag’ then a strip search can be done in a private place with a police officer of the same sex as you. Police officers cannot touch your"
Searches-Updated-July-2023WM1.pdf,3,"to strip search you because they believe you have one of the things listed in ‘when can the police search me or my bag’ then a strip search can be done in a private place with a police officer of the same sex as you. Police officers cannot touch your genital or anal regions. Remember to ask the police why they want to search you and, if you are unhappy about the search contact a lawyer to talk about it. Again, you can tell the police you are not consenting to the search but allowing it because they say they have a legal right for the search. You should contact a solicitor as soon as possible afterwards if you want to speak to someone about what happened. Can I be searched inside my body for drugs? If the police have reason to believe that you have hidden drugs inside any part of your body, they may want you to undertake a body cavity search. This can only be done with your agreement or by an Order of the court. If you are under 18 your agreement to do this must be given in front of your parent or guardian, your lawyer, an adult friend or if none of these people are available, a Justice of the Peace. The search must be carried out by a doctor. You can ask for a non-police person to be with you during the search. The police may use ‘reasonable’ force so that the doctor can do these searches or take these samples. What kind of searches can be done at a watch house? If you are arrested and in custody you can be searched. The rules about strip searches and body cavity searches still apply in the watch house. If the police want to"
Searches-Updated-July-2023WM1.pdf,4,"can do these searches or take these samples. What kind of searches can be done at a watch house? If you are arrested and in custody you can be searched. The rules about strip searches and body cavity searches still apply in the watch house. If the police want to get: UNDER REVIEW • body fluid samples (blood, saliva, urine) • hair samples • a copy of your teeth • anything from your body that the police think will help with their case, then they need your agreement in front of your parent or guardian, your lawyer or an adult friend and if none of these can be there, a Justice of the Peace or they need a Court Order. You can have someone with you when the doctor or dentist does this. Police can use ‘reasonable force’ so that the doctor or dentist can do this. Can the police take a DNA sample? Police are only allowed to take a DNA sample from you if they have a Court Order. The police need to tell you, your parent or guardian AND the Department of Youth Justice in writing before they ask the court to make this Order. If you have been told that the police want to do this, you should immediately talk to a lawyer or one of the agencies listed under ‘Who can help?’ Can my car be searched? Police can search your car if: they have a warrant (they should show you a copy of the warrant and if they don’t ASK to see it) or if they say they have reason to believe you have:  a weapon, knife or explosive  a person in the car the police want to arrest  a drug  alcohol that has been supplied to a minor without"
Searches-Updated-July-2023WM1.pdf,5,"warrant and if they don’t ASK to see it) or if they say they have reason to believe you have:  a weapon, knife or explosive  a person in the car the police want to arrest  a drug  alcohol that has been supplied to a minor without responsible supervision  stolen property  property that is the result of breaking the law  anything else that may be evidence of an offence  things that can be used for breaking into places or cars or used to take drugs  things that can be used to hurt yourself or someone else; or they have reason to believe that:  the car has been taken by you or someone else without permission  you are going to break a law about racing, betting, prisons or nature conservation. © Youth Advocacy Centre Inc. 2 The police should tell you the reason for the search and if they do not, ASK. If the police tell you a reason for the search (for example they tell you that they think you have one of the things in the list above) even if you think it is unfair, you should let the police search. If you do not, you could be charged with an offence. BUT you can tell the police you are unhappy about the search and contact a solicitor or an agency under ‘Who can help?’ as soon as possible afterwards. Police can make all people who are in the car at the time of the search stay at the car while the search is being done. What if the police come to search the place where I am living? Police officers can come into the place where you are living if they come to: • make an arrest •"
Searches-Updated-July-2023WM1.pdf,6,"car at the time of the search stay at the car while the search is being done. What if the police come to search the place where I am living? Police officers can come into the place where you are living if they come to: • make an arrest • catch someone who has escaped • prevent violence • stop excessive noise (loud music, parties) • breath test you for drink driving • take alcohol that has been supplied to a minor without supervision. Police can also search the place where you are living if they: • have a warrant • have reason to believe you have drugs • have reason to believe you have an unlawful weapon in the place • have reason to believe that there may be evidence of an offence which may be hidden or destroyed if the police do not search immediately. It is a good idea to follow the police around when they are searching so that you can watch what they do. Sometimes the police may not allow you to do this, BUT you should ask anyway. If they have a warrant, the police must have it with them and some written information about your rights and responsibilities. They must provide you with a copy of the warrant and give you a statement of their specific powers under the warrant. This may include removing tiles, taking pictures and digging in your garden etUc. The pNolice cDan takeE away aRnything illRegal fouEnd durVing a sIeaErch. W If the police have received noise complaints (such as loud music from a CD player) and you have already been warned to turn the music down, the police can: • take away the thing which is making the noise • make it so it can no longer make"
Searches-Updated-July-2023WM1.pdf,7,"sIeaErch. W If the police have received noise complaints (such as loud music from a CD player) and you have already been warned to turn the music down, the police can: • take away the thing which is making the noise • make it so it can no longer make noise (for example take the cord to the CD player) • direct that you not make excessive noise for up to 96 hours. If the police have taken away your CD player or any other thing used to make noise, you can collect it from the police the day following the end of the direction about the noise. What are my rights? You have the right to see the warrant or ask the police why they think they have a right to search you. If the police cannot give you a reason for the search or do not show you the warrant then they have no right to search you, your car or the place where you live. You should tell the police that you are not consenting to the search and are only allowing it because they claim to have a legal right. Do not stop them as you may be charged with obstructing police if you misjudge the situation. You should contact a lawyer afterwards. You have the right to know the identity (name, rank and station) of the police officers that are asking to search you, your car or where you are living. If anything is taken from you, you have the right to know where it is being taken and to be given a receipt for the property. You have the right not to answer any questions BUT you should give your correct name, address and age as you may be breaking the law if you"
Searches-Updated-July-2023WM1.pdf,8,"from you, you have the right to know where it is being taken and to be given a receipt for the property. You have the right not to answer any questions BUT you should give your correct name, address and age as you may be breaking the law if you do not do this. REMEMBER anything you say while a search is being done, will be written down later by the police and used in the police case against you. Treated unfairly? The police should treat you fairly and politely. If they don't, you have the right to complain without the threat of being harassed. It is a good idea to write down exactly what happened including the time and date and the names of any witnesses and the police involved. You should do this as soon as possible. If you were hurt, try to get to a hospital or to a doctor as soon as possible and get some colour photographs of the injuries. You can complain to the Crime and Corruption Commission on © Youth Advocacy Centre Inc. 3 3360 6060 who are not part of the police service, or to the Commissioner of Police on 3364 6464 who must investigate your complaint. Contact one of the agencies below if you want legal advice or some help in making a complaint. Who can help? Youth Advocacy Centre (YAC) www.yac.net.au ...................................................................... 3356 1002 Youth Legal Advice Hotline ...................................................................................................... 1800 527 527 South West Brisbane Community Legal Centre www.communitylegal.org.au .......................... 3372 7677 Logan Youth & Family Legal Service www.yfs.org.au .............................................................. 3826 1500 Legal Aid Queensland www.legalaid.qld.gov.au ....................................................................... 1300 651 188 Aboriginal & Torres Strait Islander Legal Service www.atsils.org.au ........................................ 3025 3888 or (free call) 1800 012 255 (24hrs 7 days a week) Refugee and Immigration Legal Service www.rails.org.au ...................................................... 3846"
Searches-Updated-July-2023WM1.pdf,9,3372 7677 Logan Youth & Family Legal Service www.yfs.org.au .............................................................. 3826 1500 Legal Aid Queensland www.legalaid.qld.gov.au ....................................................................... 1300 651 188 Aboriginal & Torres Strait Islander Legal Service www.atsils.org.au ........................................ 3025 3888 or (free call) 1800 012 255 (24hrs 7 days a week) Refugee and Immigration Legal Service www.rails.org.au ...................................................... 3846 9300 Translating & Interpreting Services (24hrs) .............................................................................. 131 450 Community Legal Centres (CLCs) see www.naclc.org.au for your nearest CLC This sheet was last reviewed and updated in July 2023.The Youth Advocacy Centre does not accept responsibility for any action or outcome as a result of anyone relying on the information provided. UNDER REVIEW © Youth Advocacy Centre Inc. 4
When-can-I.pdf,0,"When can I? At 10 years old: • you can be charged and taken to court if the police believe you broke the law.1 At 11 years old: • you can have a delivery job (if your parents’ consent) but you cannot work before 6.00am or after 6.00pm.2 At 12 years old: • you must agree before your parents can change and register a different surname.3 At 13 years old: • you can get a part-time job if: • you do not work during any time you are supposed to be in school (until you turn 16)4 • you work for no more than 4 hours a day on a school day between 6am and 10pm5 • you work no more than 12 hours during Monday to Friday in school semesters6 But… outside school days you can work up to 8 hours a day - on school holidays you can work up to a maximum of 38 hours a week. - At 15 years old: • you can get your own Medicare card7 1 Criminal Code Act 1899 (Qld) s 29. 2 Child Employment Regulation 2016 (Qld) ss 4(3), 5, 7(2). 3 Births, Deaths and Marriages Registration Act 2003 (Qld) s 18. 4 Child Employment Act 2006 (Qld) s 11(1). 5 Child Employment Regulation 2016 (Qld) ss 7(1), 9(1)(c). 6 Child Employment Regulation 2016 (Qld) s 9(1)(a). 7 Social Security Act 1991 (Cth) ss 540, 543A, 1067A (definition of ‘independent’). Reviewed 10/07/2025 This sheet is intended to provide general legal information about the law in Queensland. This information is not legal advice. If you have a particular legal problem you should contact a solicitor for legal advice. At the end is a list of agencies that might be able to assist you, including legal agencies. When can I? • if"
When-can-I.pdf,1,"information about the law in Queensland. This information is not legal advice. If you have a particular legal problem you should contact a solicitor for legal advice. At the end is a list of agencies that might be able to assist you, including legal agencies. When can I? • if you have completed year 10 and have a certificate III or IV you can get a full-time or part- time job (you can get a part-time job before this if it is outside school hours)8 • you can get Youth Allowance (if you are regarded as independent). At 16 years old: • you can get Youth Allowance (if certain conditions are met)9 • you can have sex with another person (including same sex) who is also 16 or older, if they agree, without breaking the law10 • you can get a learner driver permit11 • you can enrol to vote but will not be able to vote until you turn 1812 • You can use a social media account.13 At 17 years old: • you can get a provisional driver licence At 18 years old: You are now in control of your life. The law says you are an adult and you don't need your parents' permission to do anything. You can: • be taken to the adult courts if you break the law • be sent to an adult jail if a court orders you to be locked up for an offence • and MUST vote (you must enrol to vote within 21 days of turning 18)14 • buy alcohol and go to a public bar15 • buy cigarettes16 • be held responsible for any agreement you make (for example, if you borrow money, rent a flat, sign any contract)17 8 Education (General Provisions) Act 2006 (Qld) ss 9(2),"
When-can-I.pdf,2,"to vote within 21 days of turning 18)14 • buy alcohol and go to a public bar15 • buy cigarettes16 • be held responsible for any agreement you make (for example, if you borrow money, rent a flat, sign any contract)17 8 Education (General Provisions) Act 2006 (Qld) ss 9(2), 204, 231. S204 speaks to an exemption for traineeships and apprenticeships under Further Education and Training Act 2014 (Qld). 9 Social Security Act 1991 (Cth) ss 540, 543A, 1067A (definition of ‘independent’). 10 Criminal Code Act 1899 (Qld) s 215. 11 Transport (Road Use Management-Driver Licensing) Regulation 2021 (Qld) ss13(1), 23. 12 Electoral Act 1992 (Qld) s 66. 13 Online Safety Act 2021 (Cth) Part 4A. 14 Commonwealth Electoral Act 1918 (Cth) s 93; Electoral Act 1992 (Qld) s 175(2). 15 Liquor Act 1992 (Qld) ss 155, 157. 16 Tobacco and Other Smoking Products Act 1998 (Qld) ss 5 (definition of ‘responsible adult’), 19. 17 Ryder v Wombwell (1868) LR4Exch 90; (1868) 17 LT 609. Law Reform Act 1995 (Qld) s 17. When can I? • get married without anyone’s permission18 • get a tattoo19 • make a valid will20 • buy a can of spray paint21 • change your name without anyone’s permission22 • have your genitalia including the nipples pierced23 • apply for an Australian passport without your parent’s consent.24 At any age: • you can buy condoms • you can open a bank account providing you can sign your own name • you can apply for your own Australian passport (if you are under 18, you will need your parents’ agreement) • you can get legal advice • you can give evidence at court • you can complain about government departments and their staff (police, teachers, child safety officers) or any other agencies you have contact with"
When-can-I.pdf,3,"own Australian passport (if you are under 18, you will need your parents’ agreement) • you can get legal advice • you can give evidence at court • you can complain about government departments and their staff (police, teachers, child safety officers) or any other agencies you have contact with • you can see a doctor and get medical advice and ask to have information about you kept confidential (but this may not happen in certain circumstances particularly if the doctor thinks you are at risk of harm) • you can smoke cigarettes BUT you will be breaking the law if you give or sell a cigarette to a person under 18 • if there is a court application about you being adopted, and you understand what is being proposed, you must be given information and any other support you need and you can have your say about what is proposed for you and the court must consider your views. 18 Marriage Act 1961 (Cth) s 11. 19 Summary Offences Act (Qld) s 19. 20 Succession Act 1981 (Qld) s 9. 21 Summary Offences Act 2005 (Qld) s 23B. 22 Births, Deaths and Marriages Registration Act 2003 (Qld) s 16. 23 Summary Offences Act 2005 (Qld) s 18. 24 Australian Passports Act 2005 (Cth) s 6 (definition of ‘child’), 11. When can I? Who can I contact for support Youth Advocacy Centre (YAC) www.yac.net.au 3356 1002 Aboriginal & Torres Strait Islander Legal Service (24hrs 7 days a week) www.atsils.org.au 3025 3888 or (free call) 1800 012 255 Logan Youth & Family Legal Service www.yfs.org.au 3826 1500 Legal Aid Queensland www.legalaid.qld.gov.au 1300 651 188 Hub Community Legal www.hubcommunity.org.au 3372 7677 Youth Legal Advice Hotline (Monday – Thursday 8am – 9pm; Friday 8am – Sunday 5pm) 1800 527 527 Community Legal Centres"
When-can-I.pdf,4,3888 or (free call) 1800 012 255 Logan Youth & Family Legal Service www.yfs.org.au 3826 1500 Legal Aid Queensland www.legalaid.qld.gov.au 1300 651 188 Hub Community Legal www.hubcommunity.org.au 3372 7677 Youth Legal Advice Hotline (Monday – Thursday 8am – 9pm; Friday 8am – Sunday 5pm) 1800 527 527 Community Legal Centres (CLCs) see www.naclc.org.au for your nearest CLC About the Youth Advocacy Centre The Youth Advocacy Centre offers free and confidential legal and social support services for young people in Queensland. www.yac.net.au (07) 3356 1002
QMHC_Qld_Trauma_Strategy_FINAL.pdf,0,"The Queensland Trauma Strategy 2024–2029 Acknowledgements Recognition of First Nations peoples We respectfully acknowledge First Nations peoples in Queensland as the Traditional Owners and Custodians © Queensland Mental Health Commission 2024 of the lands, waters and seas. We acknowledge those of the past, who have imparted their wisdom and whose Published by the Queensland Mental Health Commission strength has nurtured this land. We acknowledge Elders July 2024 for their leadership and ongoing efforts to protect and ISBN 978-0-6458941-5-8 promote First Nations peoples and cultures. Queensland Mental Health Commission We recognise that it is our collective effort and responsibility PO Box 13027, George Street QLD 4003 as individuals, communities and governments to ensure equity, recognition and advancement of First Nations Phone: 1300 855 945 Queenslanders across all aspects of society and everyday life. Email: info@qmhc.qld.gov.au We walk together in our shared journey of Reconciliation. An electronic copy of this document is available Recognition of lived-living experience at www.qmhc.qld.gov.au. We acknowledge trauma experienced by individuals, families Feedback and communities across Queensland. We recognise your journey navigating services and systems, and your resilience, We value the views of our readers and invite resourcefulness and strength in the face of adversity. your feedback on this report. We recognise with gratitude the leadership of individuals, Please contact the Queensland Mental Health families, carers and kin with lived-living experience. Commission on 1300 855 945 or via email at Your courage and generosity in sharing your expertise, info@qmhc.qld.gov.au. insights and recommendations are invaluable to advancing toward a more understanding, trauma-informed Queensland. Thank you for your commitment to partnering with us as we move forward together. We sincerely thank the broader Queensland community for its vital contribution to crafting this strategy. Your insights Translation and feedback were foundational in our journey to shape The Queensland Government is committed"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,1,"more understanding, trauma-informed Queensland. Thank you for your commitment to partnering with us as we move forward together. We sincerely thank the broader Queensland community for its vital contribution to crafting this strategy. Your insights Translation and feedback were foundational in our journey to shape The Queensland Government is committed to providing a trauma-informed Queensland. Your courage and openness accessible services to Queenslanders from all culturally in sharing your experiences has guided us towards meaningful and linguistically diverse backgrounds. If you require and impactful change. an interpreter, please contact us on 1300 855 945 and we will arrange one for you. We acknowledge the professionalism and commitment of the mental health, alcohol and other drugs, suicide prevention, and related workforces. We thank you for your concerted efforts to support quality-of-life outcomes for all Queenslanders. The Commission’s role Document licence The Queensland Mental Health Commission (the Commission) is an independent statutory body established to drive This report is licensed by the State of Queensland ongoing reform towards a more integrated, evidence-based, (Queensland Mental Health Commission) under recovery-oriented mental health, alcohol and other drugs, a Creative Commons Attribution 4.0 International and suicide prevention system. (CC BY 4.0) licence. To view a copy of this licence, visit https://creativecommons.org/licenses/by/4.0/. In essence, you are free to copy, communicate and adapt this report as long as you attribute the work to the Queensland Mental Health Commission. Contents Message from the Premier and Minister 2 ............................................................ Foreword: Queensland Mental Health Commissioner 3 ........................... At a glance 4 ........................................................................................................................................ Language matters 6 ..................................................................................................................... What is trauma? 6 .......................................................................................................................... Impacts of trauma 9 .................................................................................................................... What is healing and resilience? 15 .................................................................................. What are trauma-informed approaches? 16 .......................................................... Towards a trauma-informed Queensland 18 ......................................................... The policy landscape 19 ........................................................................................................... Principles 21 ........................................................................................................................................ Focus area 1: Prioritise prevention 22 ......................................................................... Focus"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,2,"........................................................................................................................................ Language matters 6 ..................................................................................................................... What is trauma? 6 .......................................................................................................................... Impacts of trauma 9 .................................................................................................................... What is healing and resilience? 15 .................................................................................. What are trauma-informed approaches? 16 .......................................................... Towards a trauma-informed Queensland 18 ......................................................... The policy landscape 19 ........................................................................................................... Principles 21 ........................................................................................................................................ Focus area 1: Prioritise prevention 22 ......................................................................... Focus area 2: Early support 26 .......................................................................................... Focus area 3: Foster healing 30 ........................................................................................ Focus area 4: Enable reform 34 ......................................................................................... Next steps 39 ..................................................................................................................................... Glossary 40 .......................................................................................................................................... Appendix 1: Types of trauma 42 ....................................................................................... Appendix 2: The policy landscape 44 .......................................................................... References 46 .................................................................................................................................... Need help? 53 .................................................................................................................................... The Queensland Trauma Strategy 2024–2029 1 Message From the Premier and Minister We know that approximately 75 per cent of Australians The diverse needs, perspectives and recommendations have experienced at least one potentially traumatic event of people with lived-living experience have contributed in their lifetime, with many experiencing two or more events. to the development of the strategy, which aims to ensure More than two-thirds will experience a potentially traumatic that all systems—both within and beyond Queensland event by the age of 18 years. Government agencies—are adaptable and responsive to the needs of the individuals, families and communities In recent years, the mental health and wellbeing of we support. Queenslanders has been significantly challenged due to the COVID-19 pandemic, as well as natural disasters The strategy highlights the importance of a comprehensive such as floods and droughts, compounded by the and shared approach within and across all tiers of rising cost of living. government and the community. Our aim is to create a nurturing and resilient Queensland where prevention Despite these hardships, the remarkable resilience and and early support are prioritised. enduring spirit of Queenslanders has shone through, showcasing individual and community strength in the Our government is committed to ensuring that"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,3,"living. government and the community. Our aim is to create a nurturing and resilient Queensland where prevention Despite these hardships, the remarkable resilience and and early support are prioritised. enduring spirit of Queenslanders has shone through, showcasing individual and community strength in the Our government is committed to ensuring that Queenslanders face of adversity. receive the right support, as early as possible, in their community. Our collective effort will be critical in achieving This strategy is supported by the Queensland Government’s this goal, and ensuring a healthier, more supportive future $1.645 billion Better Care Together funding package, for everyone. delivering a significant investment in improving the quality-of-life of all Queenslanders. The Honourable Steven Miles MP The Queensland Trauma Strategy 2024–2029 (the strategy) Premier of Queensland seeks to proactively prevent and reduce trauma, support healing and strengthen systems to provide full support to The Honourable Shannon Fentiman MP individuals, families and carers, and the broader community. Minister for Health, Mental Health and Ambulance Services It aims to create a safety net for all Queenslanders—ensuring and Minister for Women there is no wrong door to access help, but rather a place of welcome and safety, where every interaction offers support. 2 The Queensland Trauma Strategy 2024–2029 Foreword Queensland Mental Health Commissioner Each of us, at some point in our lives, will face moments The strategy prioritises safety and trust, ensuring that of vulnerability, adversity or trauma—whether individually the principle of doing no harm, or no further harm, or collectively—and the experience and impact of trauma is instilled into every interaction and service provided. can vary significantly from person to person. Understanding By supporting the person first—including their extended the diversity in our very human experiences and natural support networks—we can foster a culture of compassion, responses to trauma is critical to reducing"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,4,"impact of trauma is instilled into every interaction and service provided. can vary significantly from person to person. Understanding By supporting the person first—including their extended the diversity in our very human experiences and natural support networks—we can foster a culture of compassion, responses to trauma is critical to reducing stigma and dignity and respect. fostering a safe, compassionate and supportive community. Addressing the root causes of trauma, including the Queenslanders have shared profound insights into their pivotal role of social determinants, is integral to this experiences of trauma within various services and systems. strategy’s success. By focusing on these underlying They emphasised their need to be acknowledged as factors—such as economic stability, education, social individuals, families, carers and communities, with an inclusion, stable and affordable housing, and access to approach that prioritises humanity first. They told us it is care—we aim to reduce the sources of trauma and foster important not to be defined or judged by the challenges a healthier, more resilient and compassionate community. they face, particularly by the systems and services they access for support. This feedback serves as a reminder The strategy also highlights the importance of prevention of the importance of compassionate support and the need and early intervention, aiming to proactively prevent and for safe, welcoming environments. These insights shape reduce the impact of trauma, including reducing stigma our commitment to reforming systems and services, and promoting social inclusivity. where the humanity of every individual and community Extensive consultation has been vital to developing the is seen, heard and valued. strategy, with over 800 individuals, families, carers and The Queensland Trauma Strategy 2024–2029 is stakeholders consulted in communities across the state. Queensland’s whole-of-government, whole-of-community I express my deep thanks to everyone who entrusted us with trauma strategy that takes forward the Queensland their"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,5,"developing the is seen, heard and valued. strategy, with over 800 individuals, families, carers and The Queensland Trauma Strategy 2024–2029 is stakeholders consulted in communities across the state. Queensland’s whole-of-government, whole-of-community I express my deep thanks to everyone who entrusted us with trauma strategy that takes forward the Queensland their stories, recommendations and hope for a better future. Government’s ongoing commitment to enhance the But the work does not stop here. Putting the strategy into wellbeing of all Queenslanders. action requires partnership and collaboration across all Importantly, this strategy emphasises a non-judgemental systems and sectors. By working together, we can achieve and strengths-based approach that reassures us all that a trauma-informed Queensland where every individual, it’s okay to not be okay. family and community has the opportunity to lead healthy and fulfilling lives. The strategy is a proactive and comprehensive commitment to prevent, support and heal from trauma and its impacts. As we developed the strategy, we heard many stories Ivan Frkovic that speak to the strength and resilience of ordinary Queensland Mental Health Commissioner Queenslanders, but equally we heard about the need for more attuned support during times of distress and vulnerability. The Queensland Trauma Strategy 2024–2029 3 At a glance The Queensland trauma strategy Vision A compassionate, supportive and resilient Queensland, where communities are connected, and systems and services prevent, recognise and respond to trauma, ensuring everyone can lead healthy and fulfilling lives Guiding principles The strategy is underpinned by the following guiding principles: Human rights and dignity Social justice and equity Culture matters Hope and healing Lived-living experience led Accountability Inclusive Gender safe and affirming Continuous improvement Person-led, family and friends inclusive Address stigma and discrimination 4 The Queensland Trauma Strategy 2024–2029 saera sucoF Focus area 1 Focus area 2 Prioritise prevention Early support Prioritise the foundations"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,6,"Social justice and equity Culture matters Hope and healing Lived-living experience led Accountability Inclusive Gender safe and affirming Continuous improvement Person-led, family and friends inclusive Address stigma and discrimination 4 The Queensland Trauma Strategy 2024–2029 saera sucoF Focus area 1 Focus area 2 Prioritise prevention Early support Prioritise the foundations Enhance early and for prevention compassionate support Strengthen individual and Holistic and social supports community awareness of trauma Early support, Address and actively challenge including across the life course all types of stigma and discrimination Enhance services Build safe, inclusive and respectful environments and supports Prevent traumatic experiences related to economic, employment and housing insecurity Prevent system-related trauma Focus area 3 Focus area 4 Foster healing Enable reform Reduce the impact of trauma Strengthen the systemic enablers and foster healing for reform Prioritise First Nations’ healing Strengthen human rights approaches to trauma Address system-related Build trauma-informed workforces re-traumatisation Strengthen governance and Strengthen community-led accountability mechanisms and place-based initiatives Prioritise lived-living experience Trauma-informed justice systems leadership and expertise Fund and resource for sustainable implementation Enhance cross-sector partnership and collaboration Improve innovation, evaluation and knowledge translation The Queensland Trauma Strategy 2024–2029 5 What is trauma? At some point in our lives, everyone will experience vulnerability, adversity or trauma in different ways and to different extents. Latest research indicates that approximately 75 per cent of Australians have experienced at least one potentially traumatic event in their lifetime,1 with many experiencing two or more events. More than two-thirds of people will experience a potentially traumatic event by the age of 18 years.2 When talking about trauma, it is important to distinguish emotionally harmful or life-threatening and has a negative between a potentially traumatic circumstance and a effect on a person’s functioning and mental, physical, traumatic response. Trauma is a state of high arousal that"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,7,"traumatic event by the age of 18 years.2 When talking about trauma, it is important to distinguish emotionally harmful or life-threatening and has a negative between a potentially traumatic circumstance and a effect on a person’s functioning and mental, physical, traumatic response. Trauma is a state of high arousal that social, emotional and spiritual wellbeing.4 These experiences is one possible response to a potentially traumatic event differ for everyone and not all individuals exposed to the or circumstance, such as violence, injury or adversity. same event will experience a traumatic response. Trauma may arise from a single experience, a series of events, or ongoing circumstances. While adverse events A degree of distress is very common in the early aftermath and experiences can leave lasting negative effects on of exposure to traumatic circumstances and is a natural physical and/or mental wellbeing, the impacts of trauma human response.5 For most people, experiences of distress are unique to each person. Healing, growth and resilience settle down in the initial days and weeks following the are achievable with timely and appropriate support.3 traumatic event as they come to terms with their experience, using their usual coping strategies and support networks.6 A potentially traumatic event or circumstance can present For some people, feelings of distress can continue well in a range of ways and may involve actual, threatened or after the traumatic event has passed, potentially leading perceived risks of serious harm to an individual’s physical to anxiety, depression or the emergence of post-traumatic or mental health, safety or wellbeing, whether experienced stress disorder (PTSD).7, 8 For the purpose of this strategy, directly or indirectly. A traumatic response is when this the word ‘trauma’ is used to refer specifically to traumatic event or circumstance is experienced as physically and/or responses. Language matters Language is important."
QMHC_Qld_Trauma_Strategy_FINAL.pdf,8,"mental health, safety or wellbeing, whether experienced stress disorder (PTSD).7, 8 For the purpose of this strategy, directly or indirectly. A traumatic response is when this the word ‘trauma’ is used to refer specifically to traumatic event or circumstance is experienced as physically and/or responses. Language matters Language is important. It shapes our perceptions, approaches and responses to trauma, and significantly influences people’s experiences. How we use language can communicate a sense of compassion, safety and care. However, an inappropriate use of language can inadvertently perpetuate harm and stigma. The preferences and interpretations of language can vary significantly among different stakeholders. Currently, there is no clear consensus on the language that is used to talk about trauma and related concepts in Queensland. As our knowledge of trauma, trauma-informed practice and healing is continuously emerging, a shared understanding of trauma and trauma-informed approaches is also evolving. This language is dynamic and continuously progressing. We will continue to work towards a shared and contemporary understanding of key terms and phrases. 6 The Queensland Trauma Strategy 2024–2029 What is trauma? Prevalence and impact of trauma 7 75 Around % of Australians % 1.5 of Australian adults or over million people10 have experienced a traumatic event at will experience PTSD at any given point some point in their life.9 – with rates higher in females.11 More than Queensland 1.8 million is the most disaster-prone state cases in Australia—with 100 of depressive, anxiety, over and alcohol and other drug disorders disaster events could be prevented if childhood maltreatment reported since 2011.14 was eradicated.12 80 70 In Australia, % Up to % of people with problematic AOD use of older adults have experienced have experienced a a traumatic event psychologically traumatic with most experiencing multiple traumas.13 event in their life.15 The Queensland Trauma Strategy 2024–2029 7"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,9,"if childhood maltreatment reported since 2011.14 was eradicated.12 80 70 In Australia, % Up to % of people with problematic AOD use of older adults have experienced have experienced a a traumatic event psychologically traumatic with most experiencing multiple traumas.13 event in their life.15 The Queensland Trauma Strategy 2024–2029 7 What is trauma? Types of trauma Trauma is one possible response to an Trauma can be experienced event or circumstance that is experienced by an individual as physically or emotionally harmful or directly or indirectly.17 life-threatening that has lasting effects Indirect trauma is on a person’s functioning and sometimes referred to mental, physical, social, emotional as vicarious trauma.18 and spiritual wellbeing.16 Trauma exposure may encompass Historical trauma encompasses a a single potentially traumatic exposure generational aspect but is experienced or event, or it may result from repeated by a group of people who share a exposure to the same or multiple common identity or circumstance.20 potentially traumatic events over time. Unresolved historical trauma can be This type of trauma is called passed down across generations and cumulative trauma.19 manifest as intergenerational trauma. Potentially traumatic events Collective trauma involves or experiences involve actual, populations of people who experience threatened or perceived risk a potentially traumatic event together, of serious harm to physical or such as a war, acts of terrorism, mental health, safety or wellbeing.21 or natural disasters.22 Complex trauma involves cumulative System-related trauma can occur traumatic experiences that are from a potentially traumatic event invasive and interpersonal in nature. within a system or institution. These experiences often (but not always) For example, invasive or restrictive occur in childhood and involve feelings practices, child removals, of shame, being unsafe and/or trapped seclusion or intimidation.24 and unable to trust.23 8 The Queensland Trauma Strategy 2024–2029 Impacts of trauma A person’s response to"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,10,"a system or institution. These experiences often (but not always) For example, invasive or restrictive occur in childhood and involve feelings practices, child removals, of shame, being unsafe and/or trapped seclusion or intimidation.24 and unable to trust.23 8 The Queensland Trauma Strategy 2024–2029 Impacts of trauma A person’s response to a potentially traumatic event can be freeze or fawn. This refers to facing the perceived threat shaped by a range of interrelated factors. This may include (fight), leaving the circumstances (flight), being unable genetic factors, specific circumstances surrounding the to move or respond (freeze), or attempting to please event, and what happens in the immediate, short and longer to avoid conflict or threat (fawn). term after the event. It can also include factors such as the intensity of the event, the availability of support, resources Experiences of trauma and traumatic stress can be that the person may have access to, and the individual’s associated with functional and chemical changes in the sense of control or agency over the situation.25, 26 A person’s limbic area and brain stem, particularly when potentially response to these events can occur on a spectrum, and traumatic events occur at key times during brain this continuum of responses is influenced by a complex set development, such as early childhood. Early exposure of biological, psychological and social factors.27 to potentially traumatic events and adversity, especially when prolonged and without support, can heighten Trauma can affect a person’s body, mind, and social, a child’s stress response. This heightened stress can cultural and spiritual life. In the short term, a person may hinder the development of biological systems essential experience different physical responses to potentially for long-term health, such as the neural/nervous systems, traumatic circumstances or experiences, and these immune system, hormonal balance, digestive functions physiological responses are often"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,11,"stress can cultural and spiritual life. In the short term, a person may hinder the development of biological systems essential experience different physical responses to potentially for long-term health, such as the neural/nervous systems, traumatic circumstances or experiences, and these immune system, hormonal balance, digestive functions physiological responses are often described as fight, flight, and cardiovascular health. Prevalence and impact of trauma Children and young people 2 3 Children who are brought Nearly in to the attention of child protection systems as a result of abuse, neglect, Australians have experienced at or parental incapacity are at least least one form of child maltreatment prior to the age of 18.28 9 times more likely to come under the supervision Young people aged 16–24 years By the age of 10–11 years, of youth justice services.32 with experience of 53 child maltreatment are almost % 3 times of Australian children more likely to have a have been exposed to mental health disorder at least two family Nationally, there were than those who do not.29 adversities.30 275,000 Suicide is the leading cause of death notifications of alleged maltreatment of children in young people aged 15–24.31 in 2021–22.33 The Queensland Trauma Strategy 2024–2029 9 Impacts of trauma These experiences can significantly impact a child’s The experience of potentially traumatic events can also development, particularly when the child is subjected to have a range of psychological impacts. For some people, ongoing traumatic events or circumstances, leading to the experience of distress may persist long after the event significant challenges in areas such as organisation, has occurred and result in a diagnosis of a mental illness, emotion recognition and regulation, social skills and which may include an adjustment disorder, anxiety, relationships. Trauma can manifest in physical ways, depression or the development of post-traumatic stress particularly in young"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,12,"event significant challenges in areas such as organisation, has occurred and result in a diagnosis of a mental illness, emotion recognition and regulation, social skills and which may include an adjustment disorder, anxiety, relationships. Trauma can manifest in physical ways, depression or the development of post-traumatic stress particularly in young children, who may struggle to articulate disorder (PTSD).35, 36 PTSD is characterised by at least and process their experiences verbally. These responses one month of intense, disturbing thoughts, images and can vary with developmental age, and in young children, feelings related to their experience, ongoing anxiety and it may appear as emotional or behavioural issues.34 hypervigilance to threat, the re-living of events through flashbacks or nightmares, persistent feelings of sadness, Trauma can disrupt a child’s bond with their primary fear or anger, and thoughts of shame and self-blame.37 caregiver, increasing the risk of long-term hardships. Children may also be diagnosed with trauma-related mental Collectively, these issues can impair cognitive and illness, however the criteria for diagnosis is different to adults. language development, delay learning and skill acquisition, and affect the ability to form relationships and regulate Trauma can also impact a person’s social, cultural and spiritual emotions. Positive childhood experiences, such as life. This includes the way a person thinks, feels and interacts nurturing relationships, stable environments and supportive with others, which also may impact a person’s relationships educational opportunities can significantly protect children with others and influence their help-seeking and engagement from the impacts of early potentially traumatic experiences with support.38, 39 Conversely, engagement with social, cultural and stress. These positive experiences foster resilience, and spiritual activities and communities can promote positive enhancing a child’s ability to cope with challenges, outcomes for people who experience trauma. and promote healthy development. Frequency, severity, duration and whether the type of trauma"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,13,"with support.38, 39 Conversely, engagement with social, cultural and stress. These positive experiences foster resilience, and spiritual activities and communities can promote positive enhancing a child’s ability to cope with challenges, outcomes for people who experience trauma. and promote healthy development. Frequency, severity, duration and whether the type of trauma Trauma can also have ongoing physical and biological is experienced as single occasion, cumulative, complex, impacts on adults, including an increase or reduction in vicarious, collective, intergenerational or historical trauma sleep, appetite and energy levels. Chronic traumatic stress can have different impacts. Some people are more likely can also disrupt the functioning of the nervous and immune to experience potentially traumatic events due to contextual systems, potentially resulting in a range of chronic health factors such as age, supports available to them, and conditions. situational or environmental factors. This includes First Nations peoples, refugees and people seeking asylum, veterans and people working in occupations that are regularly exposed to potentially traumatic circumstances, either directly or indirectly. Prevalence and impact of trauma First Nations Older First Nations members In communities with higher cultural of the Stolen Generation and social engagement among are more likely to face First Nations people—marked by increased participation in cultural events, adverse health and ceremonies and community activities wellbeing outcomes —young people experienced a compared to their peers 37 lower who were not removed % from their families.40 suicide rate.41 10 The Queensland Trauma Strategy 2024–2029 Impacts of trauma Prevalence and impact of trauma Women 1 4 Australian Australian and in international research women suggests that have experienced emotional abuse 1 3 by a current or former partner up to in since the age of 15.42 women identify their birth experience as traumatic.46 70–90 Among women aged % 18–44 years of perinatal women violence against women who"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,14,"Australian Australian and in international research women suggests that have experienced emotional abuse 1 3 by a current or former partner up to in since the age of 15.42 women identify their birth experience as traumatic.46 70–90 Among women aged % 18–44 years of perinatal women violence against women who have engaged with is the mental health services perinatal single biggest risk factor at some point during 1 4 in contributing to disease burden, their perinatal journey women more than smoking, disclosed experiences drinking or obesity.43 of trauma.45 and approximately 1 15 in men Studies indicate between will develop perinatal 70–90% anxiety and depression during pregnancy and in the postnatal period, of women in correctional centres requiring treatment.47 nationally have experienced family, domestic and sexual violence.44 The Queensland Trauma Strategy 2024–2029 11 Impacts of trauma Table 1: Possible negative impacts of trauma across the life course The experience of traumatic stress can impact wellbeing at any point across the life course. Our experiences and responses are unique and produce varying levels of intensity.48 Across all age groups, timely, effective and appropriate support can assist with healing and growth.49 Perinatal period Young people The perinatal period, spanning from conception In young people from ages 12 to 25 years, the to two years postpartum, can be a pivotal time filled experience of potentially traumatic circumstances with hope, expectation and opportunity. For some, may impact their mental wellbeing, relationships, however, this can be a challenging time marked and education or employment outcomes. Exposure by difficult and adverse experiences and complex to trauma during adolescence and early adulthood emotions. This period can also introduce significant is linked to an increased likelihood of experiencing vulnerabilities for expecting and new parents. mental health issues, alcohol and other drug use The effects of unsupported historical trauma, concerns,"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,15,"by difficult and adverse experiences and complex to trauma during adolescence and early adulthood emotions. This period can also introduce significant is linked to an increased likelihood of experiencing vulnerabilities for expecting and new parents. mental health issues, alcohol and other drug use The effects of unsupported historical trauma, concerns, self-harm and suicidal behaviour. Beyond alongside intergenerational, childhood and acute the psychological and emotional impacts of potentially (environmental or event-related) trauma, often present traumatic events, there may also be significant adverse significant barriers for parents to access essential physical health outcomes, including impact on the services for their families. nervous and immune systems.53 Additionally, children and young people may come into contact with the youth justice system due to a complex Infants and young children interplay of historical, environmental, institutional and systemic factors. Many of these young people may have neurodevelopmental disorders or other In infants and young children, the experience of conditions that often remain undiagnosed, as well potentially traumatic circumstances may disrupt as exposure to potentially traumatic experiences, healthy brain development and further impact their including experiencing severe maltreatment.54 cognitive, emotional and social development. This underscores the need for growth-promoting In Australia, children involved with child protection and nurturing environments.50, 51 Early exposure to services are markedly more likely to also be engaged trauma and adversity, especially when prolonged with youth justice services. The connection between and without support, can heighten a child’s stress childhood adversity and later contact with the response. This heightened stress can affect the criminal justice system is complex and influenced development of biological systems essential for by multiple factors. This can include experiences of long-term health, such as the neural/nervous systems, racism, socioeconomic disadvantage, family conflict, immune system, hormonal balance, digestive limited parental involvement and the challenges of functions and cardiovascular health.52 Additionally,"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,16,"criminal justice system is complex and influenced development of biological systems essential for by multiple factors. This can include experiences of long-term health, such as the neural/nervous systems, racism, socioeconomic disadvantage, family conflict, immune system, hormonal balance, digestive limited parental involvement and the challenges of functions and cardiovascular health.52 Additionally, out-of-home care.55 These are further compounded by trauma can disrupt a child’s bond with their primary continued inequities that result in a disproportionate caregiver. These issues can impair cognitive and representation of particular groups of young people language development, delay learning and skill involved with tertiary systems (e.g. Aboriginal and acquisition, and affect the ability to form relationships Torres Strait Islander young people). and regulate emotions. 12 The Queensland Trauma Strategy 2024–2029 Impacts of trauma Adults Older adults In adults, there are a range of common reactions Older adults can often face unique challenges related that might be seen following the experience of a to physical health, social isolation and mental potentially traumatic event. People might experience wellbeing, which can be further complicated by difficulty sleeping, muscle tension, aches, an past traumatic experiences.59 At least 70 per cent increased heart rate, changes in appetite, digestive of older adults have experienced a traumatic event issues, headaches or teeth grinding. Responses can at some point in their lives.60 Although many go include hypervigilance, an exaggerated startle reflex, on to lead happy and fulfilling lives, the impact of avoidance of trauma reminders, social withdrawal and traumatic experiences may persist, and this includes diminished interest in activities they once enjoyed.56 affecting emotional regulation, behaviour and overall functioning, particularly in care settings. These Some may experience increased alcohol and other environments may contribute to the experience of drug use or engage in risk-taking behaviours. Cognitive trauma and/or re-traumatisation by evoking past challenges such as poor"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,17,"interest in activities they once enjoyed.56 affecting emotional regulation, behaviour and overall functioning, particularly in care settings. These Some may experience increased alcohol and other environments may contribute to the experience of drug use or engage in risk-taking behaviours. Cognitive trauma and/or re-traumatisation by evoking past challenges such as poor concentration, decision- trauma or restricting autonomy, choice and control. making difficulties and short-term memory problems may occur alongside intrusive memories like persistent The onset of conditions such as dementia can trigger thoughts or nightmares. Emotionally, feelings of the re-emergence of traumatic stress symptoms tension, fear, anxiety, sadness, detachment or anger that have previously been dormant. Common care are common, as are guilt, shame and a sense of practices, such as assistance with personal care, or vulnerability. These responses may alter a person’s features like locked wards, can trigger distress in older self-perception and worldview, potentially leading people who have experienced trauma. This distress them to see their surroundings as dangerous and may manifest in behaviours of aggression, agitation or others as untrustworthy.57 In adults, these experiences withdrawal. The connection between these behaviours may pose challenges to physical and mental wellbeing and trauma in geriatric and dementia care is not often and may contribute to impacts experienced in well understood. relationships and work.58 These behaviours can lead to the use of chemical restraints, which are not only minimally effective but also carry significant side effects, as well as human rights concerns. Emerging evidence suggests that symptoms of post-traumatic stress disorder may be mistakenly attributed to behavioural and psychological symptoms of dementia, highlighting a critical area of concern in geriatric care practices.61 The Queensland Trauma Strategy 2024–2029 13 Impacts of trauma Prevalence and impact of trauma Further groups impacted Nationally, the LGBTQIA+ community in Australia experiences a disproportionate amount of distress and"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,18,"be mistakenly attributed to behavioural and psychological symptoms of dementia, highlighting a critical area of concern in geriatric care practices.61 The Queensland Trauma Strategy 2024–2029 13 Impacts of trauma Prevalence and impact of trauma Further groups impacted Nationally, the LGBTQIA+ community in Australia experiences a disproportionate amount of distress and trauma compared to the general population.64 Between 31–46 % of newly arrived humanitarian migrants 90 have moderate or severe Up to % psychological distress62 — but just of emergency services workers engage in 1 5 in help-seeking experience life-threatening incidents or witness deaths behaviour.63 and severe injuries at work.65 Over half between of Australians 57–73 % with disability and have experienced of people with disability physical or sexual violence experience violence.66 14 The Queensland Trauma Strategy 2024–2029 What is healing and resilience? Healing can mean different things to different people At an individual level, just as people’s responses to events and communities. Leading healing our way: Queensland and circumstances can vary, so too can their approaches Aboriginal and Torres Strait Islander Healing Strategy to healing. For example, support might include a range 2020–2040 (Leading healing our way) is Queensland’s of biological, psychological, social, cultural and spiritual strategy for First Nations healing and was developed through approaches. Some people may never disclose a traumatic an extensive community-led process. It highlights that experience or event to another person, while some people ‘healing enables people to address distress, overcome may seek professional help or assistance, and others may trauma and restore wellbeing. It occurs at a community, prefer to engage in broader community activities or seek family and individual level and continues throughout individual support through their partner, family or friend, a person’s lifetime and across generations.’ While this or their medical practitioner, community or faith leader. definition was developed by First Nations"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,19,"occurs at a community, prefer to engage in broader community activities or seek family and individual level and continues throughout individual support through their partner, family or friend, a person’s lifetime and across generations.’ While this or their medical practitioner, community or faith leader. definition was developed by First Nations peoples, it provides a holistic frame through which healing Definitions of individual healing suggest that ‘the goal can be understood across all communities. of healing is not the eradication of all symptoms but the creation of an empowered and connected life’.67 It can Some people prefer to use words other than healing to involve integrating and making sense of experiences, describe the desired outcome of minimising the negative finding ways to cope with their effects, and moving towards and longer-term impact of trauma. For example, resilience is a sense of wholeness and wellbeing. This is sometimes also used and can be applied at an individual or community referred to as post-traumatic growth, and can involve level. While acknowledging that there is no consensus education, developing regulation skills, accessing support on language, for the purpose of this strategy we have from others, developing resilience and creating safety. predominantly used the word healing. Ultimately, healing from trauma enables individuals to reaffirm their agency and autonomy, restore a sense There are unique challenges experienced by different of self and safety, and move forward with renewed hope. groups, whether due to socio-economic disparities, systemic inequalities, current and historical injustices, Regardless of the approach, it is critical that people who or other causes. These challenges can disrupt healing have experienced trauma can access early support that may from potentially traumatic events, regardless of a person’s be informal and formal, based on their needs, preferences or community’s actions or efforts to remain safe. There is and"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,20,"is critical that people who or other causes. These challenges can disrupt healing have experienced trauma can access early support that may from potentially traumatic events, regardless of a person’s be informal and formal, based on their needs, preferences or community’s actions or efforts to remain safe. There is and experiences. Across all modes or approaches to healing, a need to create and strengthen environments that prevent, the emphasis is on promoting choice and agency by having understand and provide early support for people, groups and a range of options that are accessible and readily available, communities impacted by trauma. This includes enhancing as soon after the traumatic event or circumstance as community-based settings and environments where people possible. Through consultations, Queenslanders have voiced can feel safe and connected. Strengthening government and a strong preference for a comprehensive, whole-of-person non-government systems and sectors to provide inclusive, approach that considers not only physical health but also culturally safe and responsive, trauma-informed approaches mental, emotional, spiritual and social wellbeing. This is also critical to support healing and wellbeing. recognises these factors work together and underscores the necessity for comprehensive and integrated strategies The strategy acknowledges that to support whole- at all levels (individual, community and system).68 of-community healing, Queensland must embed the learnings, journeys and wisdom of First Nations people. This includes through processes such as truth-telling and Treaty, prioritising actions that support self-determination, and embedding First Nations healing frameworks into systems and communities across Queensland. First Nations Queenslanders have voiced that an approach acknowledging cultural wisdom, authority and connection is needed to truly embed systemic and collective healing. The Queensland Trauma Strategy 2024–2029 15 What are trauma- informed approaches? ‘Trauma-informed approach’ is an all-encompassing term choice, and humility and respect for diverse needs, used to describe different levels of knowledge, skill,"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,21,"an approach acknowledging cultural wisdom, authority and connection is needed to truly embed systemic and collective healing. The Queensland Trauma Strategy 2024–2029 15 What are trauma- informed approaches? ‘Trauma-informed approach’ is an all-encompassing term choice, and humility and respect for diverse needs, used to describe different levels of knowledge, skill, preferences and experiences, including historical, cultural capability and capacity, including environments, culture, and gender perspectives.69, 70 These approaches must polices, practices and procedures required to support seek to emphasise the importance of respect, dignity healing. Trauma-informed approaches encourage a shift in and hope, focus on the entire context, and actively resist perspective from ‘what’s wrong with you?’ to ‘what do you re-traumatisation.71 need to feel safe?’. Trauma-informed approaches emphasise understanding the impact of past and present experiences Figure 1 provides a framework to understand the different on a person’s physiological, psychological and psychosocial levels of trauma-informed knowledge, capability and responses to current circumstances. Queenslanders capacity that are required across systems and workforces, told us the quality of the response a person receives can communities and individuals. The figure proposes four levels significantly impact how the experience of trauma will affect of trauma-informed knowledge and response, and their them in the long term. We all have a part to play in creating application across different settings. These four practice trauma-informed social, emotional and built environments levels create an integrated trauma-informed practice that enhance safety. framework that facilitates a coherent way of working within organisations, agencies, systems and the Queenslanders have further identified several principles broader community. to guide and underpin a whole-of-government, whole- of-community strategy. These principles have been Figure 1 describes the interplay between universal incorporated as foundational elements of the strategy, and specialist approaches, all operating within a drawing upon diverse frameworks and emphasising trauma-informed framework. It acknowledges that"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,22,"identified several principles broader community. to guide and underpin a whole-of-government, whole- of-community strategy. These principles have been Figure 1 describes the interplay between universal incorporated as foundational elements of the strategy, and specialist approaches, all operating within a drawing upon diverse frameworks and emphasising trauma-informed framework. It acknowledges that safety, trustworthiness and transparency, peer support, people move between these levels based on their needs, collaboration and mutuality, empowerment, voice and in a non-linear way. Figure 1: A trauma-informed Queensland, adapted from Trauma-Informed Wales: A Societal Approach to Understanding, Preventing and Supporting the Impacts of Trauma and Adversity.72 Systems and Communities Individuals workforces Trauma aware: Everyone has a role to play in understanding trauma and awareness-raising. These approaches promote connection, inclusion, compassion, equity, prevention, help-seeking and help-offering, and apply at all levels. Trauma skilled: The provision of basic support and a fundamental approach to trauma, regardless of whether the trauma is disclosed or known. This applies to most organisations, workforces and communities responding to individuals who are likely to have experienced trauma. Trauma enhanced: Specific methods are used by professions and workers, in identified systems and workforces, who provide support to people who have experienced traumatic events. Trauma specialised: Specialised and formalised interventions or support delivered by people with expertise in trauma, including people with lived-living experience and other specialist professions. This can include organisational, systems and built environment design. 16 The Queensland Trauma Strategy 2024–2029 What are trauma-informed approaches? With up to 75 per cent of adults experiencing events community needs. This can also differ across First Nations that could lead to trauma, all parts of the system and peoples, the LGBTQIA+ community, people who are culturally communities must work together in a way that acknowledges and linguistically diverse, and people with disability. and responds to trauma appropriately. While"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,23,"community needs. This can also differ across First Nations that could lead to trauma, all parts of the system and peoples, the LGBTQIA+ community, people who are culturally communities must work together in a way that acknowledges and linguistically diverse, and people with disability. and responds to trauma appropriately. While systems, communities and individuals are interrelated, not everyone Some settings and workforces will require more advanced needs to be an expert in trauma and healing. However, trauma-related knowledge, capability and capacity all people should have a foundational level of trauma depending on their function within the system, the awareness. frequency with which they are likely to respond to people with experiences of trauma, and the duration of this Similarly, in some communities there should be some exposure. As this level of knowledge, capability and people who are not just trauma aware, but also trauma capacity increases, we use the terms trauma enhanced, skilled and can provide a higher level of trauma-informed and finally, trauma specialised. knowledge, awareness and response, depending on Potential benefits of trauma-informed approaches Individuals • Improved health and social and emotional wellbeing • Enhanced quality of life • Enhanced choice, agency and autonomy • Increased safety and reduced incidence of system-related traumatisation and re-traumatisation • Better interpersonal relationships Communities • Enhanced cultural safety and responsiveness • Increased sense of community safety, leading to higher participation and engagement • Increased community resilience, leadership and capacity • Enhanced access to education (e.g. by having trauma-informed schools) • Enhanced access to healthcare and social supports Systems and workforces • Better workforce wellbeing, retention, satisfaction and sustainability • Reduced pressure on tertiary systems (e.g. hospital, justice, homelessness) • Reduced use of restrictive practices (e.g. seclusion and restraint) • Increased access, equitable support and consistency of response across systems (e.g. justice, education,"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,24,"to healthcare and social supports Systems and workforces • Better workforce wellbeing, retention, satisfaction and sustainability • Reduced pressure on tertiary systems (e.g. hospital, justice, homelessness) • Reduced use of restrictive practices (e.g. seclusion and restraint) • Increased access, equitable support and consistency of response across systems (e.g. justice, education, health and human services) • Increased efficiency and impact (e.g. through better-aligned policies and processes that recognise and prevent re-traumatisation, increase integration, and improve data, research and evaluation, including with people with lived-living experience) The Queensland Trauma Strategy 2024–2029 17 Towards a trauma- informed Queensland The strategy establishes a whole-of-government, whole- Focus area 2 emphasises the role of early and of-community approach for integrating trauma-informed compassionate support, prioritising timely support that practice across Queensland. It is a five-year strategy that is both suitable and easily accessible. It also underscores seeks to ensure we create the best possible conditions the importance of an integrated, system-wide approach for individuals, families and carers, and communities to where services are accessible, regardless of where a person receive the right support as early as possible. This strategy lives in Queensland. Applying a ‘no wrong door’ approach, is structured around four key focus areas: the strategy seeks to ensure that individuals, their families and carers are supported to receive an integrated service • Prioritise prevention response across programs, service providers or sectors, • Early support reducing barriers and enhancing support. • Foster healing Focus area 3 seeks to reduce the long-term effects of trauma • Enable reform. by creating an environment in Queensland that fosters healing and enables those who have experienced trauma to To move towards a more trauma-informed Queensland, pursue what healing means to them. It strongly emphasises a collaborative, partnership-based approach is required strengthening community-led and community-based support across government and the community."
QMHC_Qld_Trauma_Strategy_FINAL.pdf,25,"reform. by creating an environment in Queensland that fosters healing and enables those who have experienced trauma to To move towards a more trauma-informed Queensland, pursue what healing means to them. It strongly emphasises a collaborative, partnership-based approach is required strengthening community-led and community-based support across government and the community. All touchpoints systems. By enhancing community-led approaches, focus a person has across systems should include a focus on area 3 aims to support communities to facilitate collective preventing trauma, providing accessible support early, healing and drive sustainable change from within. This enabling people and communities who have experienced approach builds on the foundational efforts delivered across trauma to explore what healing means to them, and the system to recognise the far-reaching impacts of trauma. enabling reform to strengthen the systemic enablers for change. Implementation of the strategy will prioritise Focus area 4 targets the foundational elements necessary the needs, preferences and experiences of individuals, for systemic change, requiring coordinated effort, strong families and communities in regional, rural and remote areas partnership, leadership and dedicated resources across all of Queensland. Recognising the inherent strengths and levels. This includes integrating trauma-informed principles resilience of our communities, this strategy seeks to and practice frameworks within government agencies to lead ensure that the system adapts to provide consistent the changes to the system that are required to address the and tailored support, when, where and how it is needed. root causes of trauma and adversity. The activity in focus area 4 includes an emphasis on coordinated and evidence- Focus area 1 is centred on prevention, aiming to minimise based policy development and strategic planning, supported the occurrence and impact of potentially traumatic by fit-for-purpose investment and funding models, as well as events across the life course and significant life contexts. a focus on building"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,26,"on coordinated and evidence- Focus area 1 is centred on prevention, aiming to minimise based policy development and strategic planning, supported the occurrence and impact of potentially traumatic by fit-for-purpose investment and funding models, as well as events across the life course and significant life contexts. a focus on building trauma-informed workforces. This focus This involves equipping individuals, families and area also includes an emphasis on leadership by people communities with the knowledge, skills and resources with lived-living experience of trauma alongside shared needed to prevent potentially traumatic experiences. governance and leadership structures. This seeks to ensure This includes a focus on preventing unintended system- that individuals, families and carers are actively enabled to related trauma for individuals, families and communities participate in shaping the programs and services that impact engaging with different agencies. them, fostering a sense of ownership, respect and inclusion. 18 The Queensland Trauma Strategy 2024–2029 The policy landscape The strategy provides the authorising environment and b) considers how trauma-informed practice can be shared foundations for embedding trauma-informed embedded in service provision in human services areas, approaches across the Queensland Government and the including health, housing, education, corrective services broader community. It responds to recommendation 6 and child safety.73 of the Mental Health Select Committee Inquiry into the opportunities to improve mental health outcomes for Implementing the strategy will involve collaboration Queenslanders. across Queensland Government agencies and broader stakeholders to build on the work that is already underway The Mental Health Select Committee recommended the to drive system change. This strategy contributes to Queensland Government develop a whole-of-government and builds onto the considerable efforts and investment trauma strategy to be implemented by the Queensland in improving outcomes for all Queenslanders, such as Government, and that the strategy: Putting Queensland Kids First: Giving our kids the a) considers"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,27,"system change. This strategy contributes to Queensland Government develop a whole-of-government and builds onto the considerable efforts and investment trauma strategy to be implemented by the Queensland in improving outcomes for all Queenslanders, such as Government, and that the strategy: Putting Queensland Kids First: Giving our kids the a) considers multidisciplinary trauma research and opportunity of a lifetime. The development of the strategy implements best practice strategies for responding was informed by reforms that are occurring at the to people who have experienced trauma, including international, national and state levels (see Table 2 and but not limited to physical and sexual abuse, domestic Appendix 2 for a more extensive list of reforms). The strategy and family violence, and adverse childhood experiences. aims to bridge existing gaps and strengthen the collective effort towards establishing a trauma-informed Queensland. Table 2: Examples of international, national and state plans and approaches International conventions National policy, frameworks and programs • Universal Declaration of Human Rights • National Agreement on Closing the Gap • United Nations Declaration on the Rights of Indigenous • Gayaa Dhuwi (Proud Spirit) Declaration Peoples • National Strategic Framework for Aboriginal and • United Nations Convention on the Rights of Persons Torres Strait Islander People’s Mental Health and with Disabilities Social and Emotional Wellbeing • United Nations Convention on the Rights of the Child • The National Mental Health and Suicide Prevention Agreement and the Bilateral Schedule on Mental Health and Suicide Prevention: Queensland • The National Plan to End Violence against Women and Children 2022–2032 • National Strategy to Prevent and Respond to Child Sexual Abuse 2021–2030 • Australia’s Disability Strategy 2021–2031 • Beyond Urgent: National LGBTIQ+ Mental Health and Suicide Prevention Strategy 2021–2026 • National Drug Strategy 2017–2026 • National Disaster Mental Health and Wellbeing Framework Continued over page... The"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,28,"Women and Children 2022–2032 • National Strategy to Prevent and Respond to Child Sexual Abuse 2021–2030 • Australia’s Disability Strategy 2021–2031 • Beyond Urgent: National LGBTIQ+ Mental Health and Suicide Prevention Strategy 2021–2026 • National Drug Strategy 2017–2026 • National Disaster Mental Health and Wellbeing Framework Continued over page... The Queensland Trauma Strategy 2024–2029 19 The policy landscape Table 2: Examples of international, national and state plans and approaches (continued) Relevant state-based policy, frameworks State mental health, alcohol and other and programs drug, and suicide prevention strategies • Queensland’s commitment to Path to Treaty and frameworks • Reframing the Relationship Plan • Shifting minds: The Queensland Mental Health, Alcohol and Other Drugs, and Suicide Prevention • Queensland’s Framework for Action–Reshaping Strategic Plan 2023–2028 our approach to Aboriginal and Torres Strait Islander domestic and family violence • Achieving balance: The Queensland Alcohol and Other Drugs Plan 2022–2027 • Leading healing our way: Queensland Aboriginal and Torres Strait Islander Healing Strategy 2020–2040 • Every life: The Queensland Suicide Prevention Plan 2019–2029 Phase Two • Better Justice Together: Queensland’s Aboriginal and Torres Strait Islander Justice Strategy 2024–2031 • Better Care Together: A plan for Queensland’s state-funded mental health, alcohol and other drug services to 2027 • Communities 2032 and Communities 2032: Action Plan 2022–2025 • Queensland Alcohol and Other Drug Treatment Service Delivery Framework • Making Tracks Together–Queensland’s Aboriginal and Torres Strait Islander Health Equity Framework • Regional mental health, alcohol and other drugs and suicide prevention plans • Queensland Multicultural Policy: Our story, our future and Queensland Multicultural Action Plan 2024–25 to 2026–27 • Our way: A generational strategy for Aboriginal and Relevant inquiries and reviews Torres Strait Islander children and families 2017–2037 • Hear her voice – Report one – Addressing coercive control and action plans and domestic and family violence"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,29,"story, our future and Queensland Multicultural Action Plan 2024–25 to 2026–27 • Our way: A generational strategy for Aboriginal and Relevant inquiries and reviews Torres Strait Islander children and families 2017–2037 • Hear her voice – Report one – Addressing coercive control and action plans and domestic and family violence in Queensland • Queensland women’s strategy 2022–27 • Hear her voice – Report two – Women and girls’ • Queensland Women and Girls’ Health Strategy 2032 experiences across the criminal justice system • Queensland’s Plan for the Primary Prevention of Violence and Queensland Government Response Against Women 2024–2028 • Mental Health Select Committee Inquiry into the • Putting Queensland Kids First: Giving our kids the opportunities to improve mental health outcomes opportunity of a lifetime for Queenslanders • Queensland’s Disability Plan 2022–27: Together, • A call for change: Commission of Inquiry into Queensland a better Queensland Police Service responses to domestic and family violence • Future Directions for an Age-Friendly Queensland • Royal Commission into Violence, Abuse, Neglect and Exploitation of People with Disability • A Safer Queensland – Queensland Youth Justice Strategy 2024–2028 • Bringing them Home—Report of the National Inquiry into the Separation of Aboriginal and Torres Strait Islander • Even better public sector for Queensland strategy Children from Their Families 2024–2028 20 The Queensland Trauma Strategy 2024–2029 Principles Principle We aim to demonstrate this: We uphold and prioritise By actively safeguarding the human rights and dignity of all individuals, the human rights and dignity groups and communities across age, race, culture, gender, sexuality of all people. and socioeconomic status. We are committed to By addressing social, cultural, historical and structural determinants of health. social justice and equity. We seek to ensure that all individuals, families and communities have equal opportunities to receive support, as early as possible"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,30,"across age, race, culture, gender, sexuality of all people. and socioeconomic status. We are committed to By addressing social, cultural, historical and structural determinants of health. social justice and equity. We seek to ensure that all individuals, families and communities have equal opportunities to receive support, as early as possible and for as long as it is needed, in their community. We uphold the social and By recognising the protective value of cultural rights and traditions. emotional wellbeing of all First Nations Queenslanders. By working to enhance culturally safe and responsive support across all interactions and environments, embedding First Nations leadership and expertise. By committing to truth-telling and healing to address historical and ongoing injustices. We are led by people with By working to embed the leadership, expertise and voices of people with lived-living experience of trauma lived-living experience and their families and carers, including the provision and their families, kin and carers. of peer support. We are person-led, family By promoting understanding and seeking to offer compassionate and holistic and carer inclusive. support tailored to the diverse and individual needs of each person. We prioritise gender safety By designing our environments, policies and practices to prioritise gender and affirmation in all our safety and inclusivity, and by engaging with community voices to continuously environments, interactions refine our approach. and initiatives. By committing to creating gender-safe and affirming environments that respect and value every person, and uphold the dignity and safety of all individuals, groups, and communities. We are committed to inclusivity, By proactively addressing power imbalances, being adaptable and responsive, regardless of people’s background, and creating environments, programs and services that are welcoming, location, ability or circumstances. trustworthy and accessible. We are committed to fostering By working to enhance compassionate support, we foster an environment hope and healing as"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,31,"to inclusivity, By proactively addressing power imbalances, being adaptable and responsive, regardless of people’s background, and creating environments, programs and services that are welcoming, location, ability or circumstances. trustworthy and accessible. We are committed to fostering By working to enhance compassionate support, we foster an environment hope and healing as foundational of optimism and care that leverages our individual and collective strengths, elements of our approach. enabling growth and healing. We address and eliminate all forms By actively challenging myths and stereotypes about the impacts of trauma and of stigma and discrimination. adversity, to encourage help-seeking and embed trauma-informed responses. We prioritise partnership, By acknowledging the shared responsibility of government, private, public collective responsibility and non-government sectors and industries, along with communities and and accountability. individuals, to promote wellbeing and enhance outcomes. We facilitate best practice By sharing our learnings, data and evaluations, and undertaking activities and continuous improvement. that build our knowledge base and experience. The Queensland Trauma Strategy 2024–2029 21 Focus area 1 Prioritise prevention Prioritise the foundations for prevention An effective response to trauma must start with prevention. This includes strategies that aim to promote wellbeing and create safe and supportive environments for all. To strengthen our approach to preventing trauma, strategies must seek to support life’s big settings—where we are born, live, work, play and age. Priority areas Strengthen individual and community Address and actively challenge all types awareness of trauma of stigma and discrimination Promoting a comprehensive understanding of adversity, Stigma has a significant impact on mental health and trauma and healing at an individual and community level wellbeing outcomes for people with lived-living experience is vital for preventing and reducing the impact of trauma. of trauma. Stigma often serves as a barrier to seeking help, Creating an environment that recognises trauma encourages deterring those"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,32,"on mental health and trauma and healing at an individual and community level wellbeing outcomes for people with lived-living experience is vital for preventing and reducing the impact of trauma. of trauma. Stigma often serves as a barrier to seeking help, Creating an environment that recognises trauma encourages deterring those in need and isolating them from potential both help-seeking and help-offering. support. Widespread community education and open conversations about trauma can challenge misconceptions This strategy aims to enhance awareness and literacy and stereotypes about trauma. about trauma across the community. Collaboration, education and compassion will strengthen the capacity By promoting a more informed and compassionate and capability of individuals, families and communities understanding of trauma and its effects, we can break down to recognise and respond to trauma. The way traumatic the stigma that actively discourages individuals, families events and circumstances are reported by the media and carers from talking about trauma and from seeking can also contribute to trauma and re-traumatisation. and accessing support. Through consultations, we heard Solutions should be co-designed with people with about the experiences of stigma across various systems lived-living experience, including families, carers and and sectors, including health, justice, welfare, and within support people to ensure they are effective and responsive the community. to the needs of the community. 22 The Queensland Trauma Strategy 2024–2029 Focus area 1: Prioritise prevention For example, people who use drugs experience significant Education is a vital protective factor for lifelong wellbeing. stigma and discrimination in Queensland. These Educational settings play an essential role in supporting experiences not only deter people from seeking support the social and emotional development and wellbeing but also influence the way support is provided, resulting of children and young people.76 But for some children, in inequitable support, care and treatment. Comprehensive school may not"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,33,"settings play an essential role in supporting experiences not only deter people from seeking support the social and emotional development and wellbeing but also influence the way support is provided, resulting of children and young people.76 But for some children, in inequitable support, care and treatment. Comprehensive school may not be a safe or supportive environment, and multifaceted approaches are required that address which can further complicate their ability to thrive individual attitudes and behaviours alongside approaches academically or socially. Comprehensive, whole-of-school that are focused on societal structures and systems. approaches in all Queensland schools will ensure that This includes building the cross-sector workforce capacity students who may have emotional or behavioural challenges in sectors such as health, housing, child safety and justice and experiences of trauma will receive more appropriate to reduce stigma through ongoing training and professional responses to support academic engagement. development led by people with lived-living experience.74 Promoting mentally healthy workplaces can prevent and LGBTQIA+ people also often face high levels of reduce the impact of trauma. Mentally healthy workplaces discrimination, prejudice, violence, abuse and judgement, foster a culture of psychological safety where employees significantly impacting mental health and wellbeing. feel empowered to voice concerns without fear of reprisal. In 2019, the Private Lives 3 survey estimated that 61 per cent This includes integrating trauma-informed practices of respondents had experienced intimate partner violence, into existing frameworks and ensuring that all employees and 81 per cent of those with severe disabilities had receive adequate training and support. In addition, experienced family violence.75 Understanding the drivers of there is a need to ensure the rights, freedom from stigma family violence within LGBTQIA+ communities is essential and discrimination, and personal safety of sex workers, for targeting prevention efforts and providing early support. ensuring access to comprehensive and tailored support"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,34,"In addition, experienced family violence.75 Understanding the drivers of there is a need to ensure the rights, freedom from stigma family violence within LGBTQIA+ communities is essential and discrimination, and personal safety of sex workers, for targeting prevention efforts and providing early support. ensuring access to comprehensive and tailored support Repeated experiences of stigma and discrimination can services, upheld by strong protections. lower the expectations of LGBTQIA+ people regarding the right to be treated equally and with respect. This, combined Queensland’s legislative framework for managing with broader societal violence, can normalise experiences psychosocial risks and hazards in the workplace is of violence within family or intimate partner contexts. designed to ensure workplaces are accountable and support mental health in the workplace. Further effort An integrated approach must be led and co-designed by the to enhance compliance, fully implement codes of practice, LGBTQIA+ community to ensure relevance and effectiveness. and establish clear guidelines for risk assessment and In this way, an intersectional approach can be adopted that management should be considered to minimise trauma listens to the diverse needs, experiences, identities and and enhance wellbeing outcomes. preferences of the LGBTQIA+ community. The strategy recognises the critical importance of fostering Build safe, inclusive and respectful safe and supportive environments across all professions, and that some workplaces present a greater risk of exposure environments to traumatic experiences than others. This includes police Fostering healthy relationships and connections is officers, ambulance officers, firefighters, emergency service fundamental to preventing and reducing the impact of workers, corrective services officers and defence force trauma. These bonds provide emotional support, enhance personnel. These professions are inherently exposed to resilience, and offer a sense of security and belonging high stress environments and require systems that aim that can buffer against the effects of stress and adversity. to prevent trauma,"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,35,"corrective services officers and defence force trauma. These bonds provide emotional support, enhance personnel. These professions are inherently exposed to resilience, and offer a sense of security and belonging high stress environments and require systems that aim that can buffer against the effects of stress and adversity. to prevent trauma, but also mitigate its effects when Schools, communities, workplaces and families can all prevention is not possible. play a significant role in nurturing these connections, so every individual can access supportive and enriching This could be through comprehensive training programs that relationships that contribute to their overall wellbeing. focus on recognising the signs of trauma, employing effective coping strategies, and fostering resilience to support better employee outcomes. The Queensland Trauma Strategy 2024–2029 23 Focus area 1: Prioritise prevention Prevent traumatic experiences related Prevent system-related trauma to economic, employment and housing Some interactions or experiences with systems can insecurity unintentionally cause harm and this can undermine their intended positive impacts. This could include issues with Our mental health and wellbeing are shaped by the the physical environment, disrespectful or inappropriate conditions in which we are born, live, work, play and age. language used by workers, or processes and procedures Strengthening the social determinants of mental health that can have negative impacts. and wellbeing is key to preventing and reducing the impact of adversity and trauma, as well as fostering Enhanced training for the people who work within these healing and resilience. systems to recognise and appropriately respond to trauma is important to minimise the risk of traumatising people. A secure and nurturing home environment extends beyond emotional support to include access to the material The active involvement of people with lived-living experience basics and essential services. Factors that influence in co-designing and reviewing policies, programs and mental health and wellbeing outcomes"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,36,"to minimise the risk of traumatising people. A secure and nurturing home environment extends beyond emotional support to include access to the material The active involvement of people with lived-living experience basics and essential services. Factors that influence in co-designing and reviewing policies, programs and mental health and wellbeing outcomes include access legislation is necessary to build a more trauma-informed to safe and affordable housing, stable employment and Queensland. Adopting a co-design approach ensures that healthcare. Economic stability can be addressed through people who are affected by changes have their voices at income security, reducing poverty, and reliable and the centre of this process. This tailors services more closely affordable transport, which enable economic participation to the needs of those they seek to support, and can also and access to essential services and supports. enhance the overall effectiveness and compassion of the care provided. It is well evidenced that women experience a lifetime of economic inequality and insecurity despite performing First Nations peoples, LGBTQIA+ people, people who are essential roles in both paid and unpaid capacities.77 culturally and linguistically diverse, people with disability, These roles include caring for and educating children, people who use drugs, and women who have experienced as well as providing care for elderly family members and domestic and family or sexual violence report experiencing others, and paid employment. Additionally, there is strong system-related trauma, including through negative evidence that connects economic insecurity with intimate experiences navigating systems and structures intended partner violence. Opportunities to create and embed safe, to provide support. secure, flexible and equitable work opportunities to support the economic participation of women are critical. To further protect against system-related harm, there is a need to establish trauma-informed oversight mechanisms In order to reduce the impact of trauma, there is a need and review processes."
QMHC_Qld_Trauma_Strategy_FINAL.pdf,37,"embed safe, to provide support. secure, flexible and equitable work opportunities to support the economic participation of women are critical. To further protect against system-related harm, there is a need to establish trauma-informed oversight mechanisms In order to reduce the impact of trauma, there is a need and review processes. These mechanisms will work towards to address the social, economic and environmental issues identifying and responding appropriately to instances that influence it. This includes cost of living hardship, of harm and enhance protections for human rights. unaffordable housing, and educational disparities that can This particularly includes groups such as First Nations significantly impact people’s response and capacity to heal. communities, LGBTQIA+ people, people who are culturally In addition, it is imperative that we continue our commitment and linguistically diverse, people with disability, and people to supportive pathways out of homelessness. This includes with lived-living experience of mental ill-health, problematic no discharge or exit to homelessness from hospital or alcohol and other drug use, or suicidality. custodial settings. It is also important to consider cultural factors. For First Nations peoples, cultural determinants are factors that promote resilience, foster a sense of identity, and support good mental and physical health and wellbeing for individuals, families and communities. These cultural determinants centre on First Nations-led definitions of the domains of social and emotional wellbeing, including physical, social, emotional, spiritual and ecological wellbeing for the individual and the community. To holistically address the individual and collective wellbeing of First Nations peoples, both social and cultural determinants must be prioritised to elevate a strengths-based approach to First Nations’ social and emotional wellbeing.78 24 The Queensland Trauma Strategy 2024–2029 Focus area 1: Prioritise prevention Actions Strengthen individual and community awareness Prevent traumatic experiences related to economic, of trauma employment and housing insecurity 1. Develop and promote"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,38,"cultural determinants must be prioritised to elevate a strengths-based approach to First Nations’ social and emotional wellbeing.78 24 The Queensland Trauma Strategy 2024–2029 Focus area 1: Prioritise prevention Actions Strengthen individual and community awareness Prevent traumatic experiences related to economic, of trauma employment and housing insecurity 1. Develop and promote a shared language and 9. Review through a trauma-informed approach, common understanding of trauma that is co-produced opportunities to enhance initiatives for people with people with a lived-living experience. experiencing financial hardship and housing insecurity. 2. Encourage media reporting and communication on traumatic events and traumatic experiences 10. Develop and implement a range of tenancy that positively supports community awareness sustainment and supportive housing options and reduces the impact of harmful content. for vulnerable Queenslanders, including a commitment to ‘Housing First’ models. 3. Enhance community awareness of trauma to improve understanding and recognition, and 11. Increase the availability of programs specifically to encourage help-seeking and help-offering. for people with lived-living experience of trauma that support pathways to employment, with a specific focus on people who seek asylum, Address and actively challenge all types of stigma people from refugee backgrounds and First Nations Queenslanders. and discrimination 4. Build community capacity and capability to address discrimination and stigma in relation to alcohol Prevent system-related trauma and other drugs, mental ill-health, suicide and eating disorders. 12. Develop and trial a tool in consultation with people with lived-living experience to support government 5. Implement activities to address discrimination, agencies to undertake a trauma-informed self challenge misconceptions and stereotypes about assessment of appropriate policies and practices. trauma through socially inclusive approaches across all health and human service provision 13. Enhance oversight mechanisms and complaint contexts and settings. processes to be trauma-informed, including to identify and appropriately respond to system-related harm and enhance human rights protections."
QMHC_Qld_Trauma_Strategy_FINAL.pdf,39,"challenge misconceptions and stereotypes about assessment of appropriate policies and practices. trauma through socially inclusive approaches across all health and human service provision 13. Enhance oversight mechanisms and complaint contexts and settings. processes to be trauma-informed, including to identify and appropriately respond to system-related harm and enhance human rights protections. Build safe, inclusive and respectful environments 6. Promote evidence-based, whole school approaches to student engagement and wellbeing that incorporate trauma-informed practice. 7. Enhance workplaces’ capability to identify, address and respond to workplace risks and hazards as early as possible, including compliance with the Work Health and Safety Act 2011 (Qld) and the Managing the risk of psychosocial hazards at work Code of Practice 2022. 8. Improve trauma awareness and workplace capacity to prevent (where possible) and reduce primary and vicarious trauma in professions likely to respond directly to traumatic circumstances such as police, ambulance and fire services, emergency services, and corrective services officers. The Queensland Trauma Strategy 2024–2029 25 Focus area 2 Early support Enhance early and compassionate support To reduce the impact of trauma, it is essential to enhance early and compassionate support for individuals, families and communities. It is important to provide timely, culturally safe and holistic support by addressing specific stressors, life stages and transition points, such as adolescence, parenthood or retirement. By tailoring our approaches to these pivotal moments, we can more effectively assist people navigating life’s challenges and changes and promote smoother transitions and healthier outcomes. Priority areas Holistic and social supports Early support, including across the Supports need to include both traditional medical models life course and models that consider the person in the context of their The experience and impact of adversity, trauma and healing broader social and emotional wellbeing. Aboriginal and can impact a person differently at different times in their Torres"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,40,"across the Supports need to include both traditional medical models life course and models that consider the person in the context of their The experience and impact of adversity, trauma and healing broader social and emotional wellbeing. Aboriginal and can impact a person differently at different times in their Torres Strait Islander Community Controlled Health Services life. It is important that timely support is available across provide an example of how holistic and social supports all aspects of a person’s life. This begins before a person is can be provided in a healthcare setting. Another example born and extends to childhood and adolescence, as well as includes models of social prescribing, where healthcare in older age. Timely support can help to reduce the impacts professionals have a stronger focus on addressing social of traumatic experiences and this can prevent distress. determinants of health through linking people to support outside the traditional health system. These models can Perinatal: Some parents in the perinatal period may have include elements of community engagement, enhancing their own experiences of trauma, and women are at an social support systems, and providing greater access to increased risk of experiencing violence from an intimate psychosocial support in addition to clinical support, and partner during pregnancy. It is estimated that 2 in 5 women can contribute to improving issues such as social inequity, experience violence during pregnancy and 1 in 6 experience stigma and discrimination, and systemic barriers that violence for the first time during pregnancy.79 perpetuate trauma. Additionally, during the perinatal period, experiences of Reducing the impact of trauma begins with early trauma, including historical experiences, can be activated. identification and support. This strategy is committed This can significantly impact the mental wellbeing of to enhancing the identification of trauma by implementing individuals and non-birthing partners, further"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,41,"Additionally, during the perinatal period, experiences of Reducing the impact of trauma begins with early trauma, including historical experiences, can be activated. identification and support. This strategy is committed This can significantly impact the mental wellbeing of to enhancing the identification of trauma by implementing individuals and non-birthing partners, further complicating reliable, safe and proactive measures across all points their care. of contact within the community. This approach highlights the notion that every interaction can provide support, First Nations-led and owned Birthing on Country services and either through immediate aid or by connecting individuals facilities are important for cultural safety and offer the best to additional resources. start in life for First Nations families. All perinatal parents must receive access to timely, culturally safe and responsive, and comprehensive support, enabling them to overcome barriers and nurture a healthy family environment.80 26 The Queensland Trauma Strategy 2024–2029 Focus area 2: Early support Infants and children: Every child should be well-supported Older people: Promoting optimal mental health and and equipped to navigate challenges and be protected wellbeing for older people supports their overall quality- as much as possible from traumatic experiences and of-life outcomes. It is particularly important to create their effects. This goes hand in hand with efforts to ensure environments—both physical and social—that nurture that children are provided optimal opportunities to thrive.81 wellbeing and enable people to pursue fulfilling activities. Without timely intervention early in childhood, the effects Targeted approaches for early intervention among vulnerable of early adversity can extend over a person’s life.82 older people and communities where potential trauma may arise may include initiatives that reduce financial insecurity, Recent studies, including research within Australia, suggest ensure safe housing and accessible transportation, foster that a comprehensive approach is required to support robust social support networks and promote healthy lifestyle"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,42,"over a person’s life.82 older people and communities where potential trauma may arise may include initiatives that reduce financial insecurity, Recent studies, including research within Australia, suggest ensure safe housing and accessible transportation, foster that a comprehensive approach is required to support robust social support networks and promote healthy lifestyle childhood wellbeing. This includes ensuring services choices. Cultivating social connections is central to these for children are family-centred, and those for adults are efforts, which not only enhance mental wellbeing but also child-aware.83 This can enhance public and caregiver reduce risks, including social isolation and loneliness. understanding of child development and trauma prevention, Additionally, protecting against ageism and abuse through ensure universal access to developmental and health policy measures and support for caregivers is paramount screening, enhance family-based support and services, to ensuring the dignity and wellbeing of older people. and provide integrated service responses to those facing trauma or with complex needs. Women: Women can experience trauma through many different experiences and stages of their life, including, but Young people: A multifaceted approach is required to not limited to the perinatal period and related instances of effectively prevent and reduce the impact of trauma on young violence. In Australia, a quarter of women who experience people. This entails the full implementation of respectful gendered violence report multiple forms of interpersonal relationships education across all Queensland schools, victimisation throughout their lives, including child sexual addressing alcohol consumption among young adults, and abuse, domestic and family violence, sexual assault and enhancing public health initiatives targeting intimate partner stalking.85 Women of all ages face gender-based violence and sexual violence. Integrating respectful relationships in various forms, such as sexual abuse, harassment into schools can be further enhanced by incorporating and technology-facilitated abuse, across all settings.86 specific gender-based considerations. This includes practical advice to"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,43,"public health initiatives targeting intimate partner stalking.85 Women of all ages face gender-based violence and sexual violence. Integrating respectful relationships in various forms, such as sexual abuse, harassment into schools can be further enhanced by incorporating and technology-facilitated abuse, across all settings.86 specific gender-based considerations. This includes practical advice to support gender self-identification and supporting The experiences of violence among women and children the needs, preferences and experiences of LGBTQIA+ are diverse and unique. Certain environments, and the relationships among young people. intersection of gender inequality with other forms of disadvantage and discrimination, can intensify violence In addition, developing and implementing trauma-informed against women and children. This can be less visible and evidence-based approaches will support re-engagement and less understood by some groups in the community.87 with educational environments for children, young people and families experiencing school refusal. The consequences of violence include a heightened risk of PTSD, depression and anxiety among women.88 Addressing It is important to integrate trauma-informed support for structural barriers is essential for supporting long-term children and young people at risk of, or in contact with positive outcomes. This involves preventing and eliminating systems such as child safety and youth justice. Strategies system-related harms, creating safe environments for victim- to support children and young people at risk of, or in survivors through safe, appropriate and affordable housing, contact with the youth justice system are required to and improving justice responses. reduce and respond early to trauma, including enhanced diversionary responses and more appropriate alternatives to youth detention and watchhouses. For young people, services need to ensure access to safe, appropriate and stable housing, and consider access to diverse supports and services. These may include cultural connection, local community services, mental health, alcohol and other drug services, domestic and family violence support services, education, employment, and connection"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,44,"detention and watchhouses. For young people, services need to ensure access to safe, appropriate and stable housing, and consider access to diverse supports and services. These may include cultural connection, local community services, mental health, alcohol and other drug services, domestic and family violence support services, education, employment, and connection with pro-social peers and activities.84 The Queensland Trauma Strategy 2024–2029 27 Focus area 2: Early support High risk professions: Enhancing early intervention and all suicide prevention initiatives from prevention to providing tailored support for professions that directly intervention and postvention—particularly given the respond to traumatic circumstances is key to addressing the potential for trauma resulting from suicide-related distress impact of cumulative trauma. This includes defence force and/or the loss of a loved one to suicide. personnel and other first responders such as firefighters, police officers, and ambulance and emergency medical Service integration is important, so people do not fall staff. To effectively reduce trauma among professions more through the gaps, particularly for those people who are frequently exposed to traumatic circumstances, evidence- exiting custodial or hospital-based settings. Additionally, based support systems that are specifically designed adopting a ‘no wrong door’ approach means that people to meet the unique needs of these groups are needed. can access integrated services wherever they present, This may include specialised training in resilience and without the need to re-tell their story, fostering a sense stress management, access to mental health professionals of safety and validation. who are familiar with the specific challenges faced by This should include mechanisms that allow people to first responders, and the establishment and expansion safely express concerns when services do not meet their of peer support networks. expectations, such as through structured and accessible Natural disasters: Australia is facing increased frequency feedback processes, the ability to change practitioners, and impact"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,45,"should include mechanisms that allow people to first responders, and the establishment and expansion safely express concerns when services do not meet their of peer support networks. expectations, such as through structured and accessible Natural disasters: Australia is facing increased frequency feedback processes, the ability to change practitioners, and impact of climate-related disasters, particularly affecting and flexible service access. rural and remote communities. Effective disaster recovery People in rural and remote areas have need for a wider relies on coordinated efforts that integrate the social factors range of clinical and psychosocial services. While telehealth necessary for mental health recovery and positive longer- and digital mental health services are increasingly identified term mental health outcomes. Responses driven by local as beneficial, they should complement, not replace, services with established community ties are known to be community-based and locally-led services. Strengthening effective, though capacity can be limited if staff are also local community capacity and fostering peer-to-peer impacted by a disaster. To ensure support is effectively support is essential for building resilience and connection, tailored, approaches must be grounded in the needs, particularly in terms of prevention and early support. preferences and experiences of diverse ages, groups Strengthened integration and coordination of services and communities. can support the healing process and improve outcomes. Enhance services and supports Integrating considerations of adverse childhood experiences The experience of trauma is highly individual, as is the path into supports and interventions can proactively address towards healing, and it is important that people have agency the potential long-term impacts of trauma. By focusing on in this process. It is also important to ensure that appropriate the early identification of adverse childhood experiences, support is available as soon as possible within peoples’ we can intervene sooner, potentially reducing the impact community of choice. During the consultation process,"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,46,"potential long-term impacts of trauma. By focusing on in this process. It is also important to ensure that appropriate the early identification of adverse childhood experiences, support is available as soon as possible within peoples’ we can intervene sooner, potentially reducing the impact community of choice. During the consultation process, of adverse outcomes. women and girls, in particular, expressed their experiences of dismissal, gender-based discrimination, and not being There is increased recognition that service provision should believed or heard when seeking help from services. extend beyond immediate crisis intervention services and Negative past experiences can serve as a significant should ensure that support is available to people when deterrent to accessing support. Equally, families and carers they are ready to seek support. This could be achieved by emphasised the importance of feeling heard and valued initiatives such as expanding the availability and eligibility when seeking support for those they care for. of crisis supports—including domestic and family violence and sexual violence services—to focus on providing Young Queenslanders also emphasised the need for person-led support beyond the initial point of crisis. accessible, affordable, age-appropriate options, both place-based and online, that support confidentiality Creating a safe environment, both physically and and prioritise the needs of young people. emotionally, requires the intentional and comprehensive integration of trauma-informed principles and practices Traumatic events can have a profound and lasting impact on into the overarching structure, service delivery and culture. mental health, ultimately increasing a person’s vulnerability This requires a review of current practices and procedures to suicide.89 It is vital to foster supportive environments and and taking steps to incorporate trauma-informed approaches ensure that a trauma-informed approach is applied across within policies and practices. 28 The Queensland Trauma Strategy 2024–2029 Focus area 2: Early support Actions Holistic and social supports Early support, including across"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,47,"procedures to suicide.89 It is vital to foster supportive environments and and taking steps to incorporate trauma-informed approaches ensure that a trauma-informed approach is applied across within policies and practices. 28 The Queensland Trauma Strategy 2024–2029 Focus area 2: Early support Actions Holistic and social supports Early support, including across the life course (continued) 14. Explore opportunities to extend the range of psychosocial programs and whole-of-person 22. Strengthen diversionary responses for children wellbeing supports available to people following and young people known to the criminal justice exposure to traumatic circumstances. system, with a particular focus on regional and remote communities, while promoting community safety. Early support, including across the life course 23. Build and strengthen trauma responses tailored to older people across multiple settings and contexts, 15. Extend community-based support (including home including strengthening recognition and response visiting services) that are family and carer inclusive to elder abuse. in the perinatal period and the first 2,000 days. 24. Enhance early intervention and tailored supports for 16. Enhance and expand supports available to people individuals who work in professions that commonly who have experienced trauma in the perinatal period, respond to traumatic incidences, such as first including termination of pregnancy, early pregnancy responders and frontline staff. loss, stillbirth and birth trauma. 25. Expand access to specialist alcohol and other drug 17. Enhance access to culturally safe and responsive treatment and harm reduction services, including for support, including trauma-informed maternity and pregnant women, non-birthing partners and people perinatal care practices that incorporate cultural with young infants. healing. 26. Ensure disaster management frameworks are trauma- 18. Increase the availability of parenting programs informed and promote person-led trauma responses and supports for families with infants and children, across the life course. ensuring these services are culturally safe and responsive, and tailored to support the"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,48,"cultural with young infants. healing. 26. Ensure disaster management frameworks are trauma- 18. Increase the availability of parenting programs informed and promote person-led trauma responses and supports for families with infants and children, across the life course. ensuring these services are culturally safe and responsive, and tailored to support the needs of diverse communities. Enhanced services and supports 19. Implement respectful relationships education for 27. Increase the availability and ease of access to services young people in all Queensland schools as a whole and supports for people following exposure to trauma school primary prevention approach to contribute or adversity. to the prevention of domestic, family and sexual violence. 28. Integrate consideration of adverse childhood experiences into all relevant supports and 20. Strengthen trauma-informed service integration interventions to address potential long-term impacts (e.g. multi-agency coordination panels) for children as early as possible. and young people at risk of, or in contact with multiple tertiary systems, such as youth justice, child safety 29. Explore opportunities to expand support services or a child and youth mental health service. for people who have experienced historical trauma, including historical experiences of domestic and 21. Support students to remain engaged with school by family violence and sexual violence, to ensure promoting a whole school approach to supporting appropriate support is available beyond the point student wellbeing. of crisis. The Queensland Trauma Strategy 2024–2029 29 Focus area 3 Foster healing Reduce the impact of trauma and foster healing A strong theme from the evidence, policy review and consultations is the concept of ‘healing’. Healing is a complex concept for many people with lived and living experience of trauma, and healing means something different to each person. The aspiration of this strategy is to create an environment in Queensland that fosters healing and enables people who have experienced"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,49,"consultations is the concept of ‘healing’. Healing is a complex concept for many people with lived and living experience of trauma, and healing means something different to each person. The aspiration of this strategy is to create an environment in Queensland that fosters healing and enables people who have experienced trauma to pursue what healing means to them. Priority areas Prioritise First Nations’ healing In Queensland, as in other parts of Australia, the cultural experiences including the perpetuation of racism and knowledge of First Nations peoples endures as the discrimination.91 The legacy of these policies continues to foundation for strong identity and connection. It is the impact people who were removed from their families and source of resilience, survival and excellence for all First their descendants. These impacts significantly disrupted the Nations peoples. Queensland is the second largest state social and emotional wellbeing of First Nations people and in Australia, with many diverse First Nations communities their connections to healing practices, body, mind, spirit, that have different traditions, cultures, identities and culture, and the land and seas. experiences of both intergenerational trauma and their own healing journeys. All Queenslanders have a part to play in the healing and truth-telling journey—to respect First Nations cultural For First Nations peoples, healing is a holistic process that authority and leadership, to acknowledge shared history, addresses mental, physical, emotional, and importantly and to actively address the ongoing discrimination and spiritual needs, through connection to culture, kin, family, racism experienced by First Nations peoples. A lack of shared and the land and sea.90 understanding is often a source of intergenerational trauma for many First Nations people and inhibits the healing Healing initiatives for First Nations peoples must be journey. Leading healing our way identifies that ‘more than grounded in Aboriginal and Torres Strait Islander ways"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,50,"lack of shared and the land and sea.90 understanding is often a source of intergenerational trauma for many First Nations people and inhibits the healing Healing initiatives for First Nations peoples must be journey. Leading healing our way identifies that ‘more than grounded in Aboriginal and Torres Strait Islander ways of 85 per cent of Australians believe it is important to learn knowing, doing and being. It is important to acknowledge about our shared history, including the occurrence of mass that healing initiatives are often based on generational and killings, incarceration, forced removal of children from cultural wisdom and do not fit within western frameworks. families, from land and restriction of movement’. By openly To prioritise First Nations healing, we must listen to the acknowledging past injustices and committing to shared voices of First Nations leaders and Elders and embed cultural perspectives and practices that recognise the resilience, futures through Treaty and truth-telling processes, we can wisdom and strengths of First Nations cultures. foster trust and Reconciliation, creating a solid foundation and promoting ongoing healing across generations. While the experience and impact of colonisation may differ between communities within Queensland, many First Queensland supported the development of Leading Nations communities continue to experience the ongoing healing our way. This strategy builds on the Queensland impacts of intergenerational trauma caused by colonisation Government’s First Nations reform agenda, including the and ongoing oppressive practices. This includes epidemic Path to Treaty, Making Tracks Together – Queensland’s disease that caused an immediate loss of life, occupation of Aboriginal and Torres Strait Islander Health Equity land by settlers, violent oppression of First Nations peoples, Framework, Leading healing our way, Local Thriving and forcibly moving First Nations peoples to missions. Communities Action Plan and Better Justice Together: This also extended to harmful government policies in more"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,51,"life, occupation of Aboriginal and Torres Strait Islander Health Equity land by settlers, violent oppression of First Nations peoples, Framework, Leading healing our way, Local Thriving and forcibly moving First Nations peoples to missions. Communities Action Plan and Better Justice Together: This also extended to harmful government policies in more Queensland’s Aboriginal and Torres Strait Islander Justice recent times, including the Stolen Generations and ongoing Strategy 2024–2031. 30 The Queensland Trauma Strategy 2024–2029 Focus area 3: Foster healing This strategy promotes the continued implementation of Consultations identified the need for more tailored Leading healing our way and aims to support all First Nations responses to meet cultural and gender-specific needs, peoples and communities to move through healing journeys particularly in institutional settings where potential at the right time and pace for them. This includes supporting traumatisation and re-traumatisation can arise. Tailored local leadership and community decision-making on all approaches that are sensitive and responsive to the diverse decisions that affect First Nations peoples, including the needs, experiences and preferences of people, and that timing and extent of support, investment, and action needed facilitate more effective, respectful and compassionate from government and other services. interactions and environments are necessary. The trauma strategy particularly emphasises the need for a Consideration of the specific needs of children and young comprehensive and multifaceted approach to address the people at risk of, or in contact with the child safety and impacts of intergenerational trauma—led by First Nations youth justice systems is important. These are areas where peoples—that also promotes the social and emotional improved responses can significantly impact young lives. wellbeing of First Nations peoples and communities. By evaluating the effectiveness of existing responses and Truth-telling and Treaty are also critical to the healing and identifying potential gaps, we can develop more robust social and"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,52,"where peoples—that also promotes the social and emotional improved responses can significantly impact young lives. wellbeing of First Nations peoples and communities. By evaluating the effectiveness of existing responses and Truth-telling and Treaty are also critical to the healing and identifying potential gaps, we can develop more robust social and emotional wellbeing of First Nations peoples protections and support mechanisms for these vulnerable and communities, and are foundational to our shared groups. The aim is to enhance these systems, so they not commitment to healing. only prevent further trauma but also actively contribute to the healing and development of young people. Through careful Address system-related re-traumatisation assessment and tailored improvements, we can foster a Re-traumatisation that occurs within systems—whether safer, more supportive environment that further promotes healthcare, justice or social services—can severely impact the wellbeing and future outcomes of all children and young the healing process and make existing trauma worse. people within these systems. The system needs to be more trauma-informed to prevent Improving the collection and analysis of data on system- these outcomes. By identifying and changing the practices related harm is also important. Enhanced data collection that contribute to re-traumatisation, we aim to create safer, will inform responses and preventive measures, help reduce more supportive environments for people. This involves the incidence of trauma, and enhance interventions that are training staff, revising protocols and integrating a trauma- both effective and compassionate. informed philosophy across all levels of service delivery, to enhance supportive interactions that help rather than Strengthen community-led and place-based harm those seeking help. initiatives Holistic and integrated approaches help to effectively This strategy is committed to strengthening communities’ address and reduce the impact of trauma across various capacity and capability to reduce the impact of trauma and service settings. This includes enhancing health-based foster healing."
QMHC_Qld_Trauma_Strategy_FINAL.pdf,53,"Strengthen community-led and place-based harm those seeking help. initiatives Holistic and integrated approaches help to effectively This strategy is committed to strengthening communities’ address and reduce the impact of trauma across various capacity and capability to reduce the impact of trauma and service settings. This includes enhancing health-based foster healing. This approach recognises that communities responses for people who use drugs. By emphasising themselves are best placed to lead localised and tailored health-oriented approaches to alcohol and other drugs, approaches that reflect and respond to their needs. This rather than criminal justice measures, we aim to reduce includes prioritising community-led initiatives that enable system-related trauma. This also requires addressing local groups to develop and implement trauma-informed stigma and discrimination, strengthening and upholding strategies. It also involves a deliberate focus on building human rights protections, and considering the legislative capacity and capability through intentional, collaborative environment through a trauma-informed lens. processes. Simultaneously, there is a need for renewed effort to Putting communities at the forefront ensures solutions significantly reduce and eliminate restrictive practices are informed and actively shaped by the people who best in health and human services settings. This includes understand the local context. Enabling communities to lead transitioning away from the use of seclusion and restraint the co-design of approaches assists in developing strategies toward methods that uphold the autonomy and dignity of that are culturally safe and responsive, sustainable, and people with lived-living experience, their families and kin, deeply embedded in the local fabric. This approach extends carers and support people. By exploring and implementing beyond consultation to active leadership by community alternative approaches, health and human services can members. enhance the care they provide to foster a more effective healing process. The Queensland Trauma Strategy 2024–2029 31 Focus area 3: Foster healing Strengthening the capabilities of a"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,54,"and support people. By exploring and implementing beyond consultation to active leadership by community alternative approaches, health and human services can members. enhance the care they provide to foster a more effective healing process. The Queensland Trauma Strategy 2024–2029 31 Focus area 3: Foster healing Strengthening the capabilities of a broad range of A program of this nature would support comprehensive community groups and organisations—from local sports assessment, treatment and care while in custody and clubs and social groups to community-based services—is through transition back into the community. Supportive an important component of identifying and addressing programs that are trauma-informed and gender responsive, trauma. Better equipping these services means they can address mental health issues, and facilitate healing from provide both an initial contact point for individuals, families trauma, including trauma arising from domestic and and communities impacted by trauma, as well as ongoing family violence and sexual violence, can address factors support networks. Strengthening community resilience contributing to offending behaviour and help reduce provides a buffer against adversity, such as natural disasters, the risk of re-offending. and is the basis for quick and effective recovery, that promotes longer-term support and healing. First Nations children, young people and adults are disproportionately represented across adult and youth Trauma-informed justice systems justice systems, largely due to First Nations peoples being more likely to experience systemic disadvantage Comprehensively integrating trauma-informed approaches in the context of ongoing racism, intergenerational across systems in Queensland will help improve outcomes trauma and disconnection from culture. The rate of adult for individuals, groups and communities impacted by imprisonment among First Nations people is highest for trauma. This includes exploring opportunities to refine the males aged 30–39.92 Culturally appropriate early intervention legal and justice systems to better enable them to respond initiatives and programs should be developed to support"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,55,"of adult for individuals, groups and communities impacted by imprisonment among First Nations people is highest for trauma. This includes exploring opportunities to refine the males aged 30–39.92 Culturally appropriate early intervention legal and justice systems to better enable them to respond initiatives and programs should be developed to support to trauma, prevent re-traumatisation and improve justice families and people who are at risk and to reduce the outcomes for all Queenslanders. likelihood of First Nations boys and men entering the As women are overwhelmingly impacted by trauma— criminal justice system. Initiatives and programs must particularly trauma related to domestic and family violence build on existing strengths in First Nations communities and sexual violence—opportunities to strengthen gender- and be grounded in strong connection to community, family, responsive and trauma-informed approaches are needed culture and country. across the criminal justice system. This approach should Justice initiatives that are more inclusive and supportive be designed to support women and girls who are seeking of those impacted by trauma—such as expanding the support of the criminal justice system, or are at risk of, legal representation and advocacy—need consideration, or already engaged with the criminal justice system. especially in circumstances where people face significant Research indicates that women in the criminal justice system challenges without sufficient legal support. It is also are overwhelmingly victim-survivors of male-perpetrated important to identify and reduce barriers to justice and violence. An appropriate and trauma-informed response to make justice more attainable and less intimidating, gender-based violence should enhance support and improve including initiatives that promote people’s understanding outcomes for victim-survivors. Improving equitable justice of their rights and obligations within these processes. outcomes for all victim-survivors is essential, including The strategy recognises the importance of aligning existing eliminating barriers to reporting, enhancing access to legal laws and policies with trauma-informed"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,56,"and improve including initiatives that promote people’s understanding outcomes for victim-survivors. Improving equitable justice of their rights and obligations within these processes. outcomes for all victim-survivors is essential, including The strategy recognises the importance of aligning existing eliminating barriers to reporting, enhancing access to legal laws and policies with trauma-informed care principles to representation, building workforce capability to provide help support therapeutic approaches, help prevent trauma appropriate supports, and strengthening the capacity and avoid further harm. A comprehensive approach to of legal services, police, judiciary and corrections is vital. embedding trauma-informed practice across the legal and Stakeholders indicated an urgent need to establish a justice system will help promote the rights and wellbeing of specialist mental health and trauma support program for individuals impacted by trauma and reduce cumulative harm women and girls in custody in Queensland, including those caused by cross-system interactions. on remand. Consideration should be given to the unique needs and vulnerabilities of children whose parents are involved with the criminal justice system, including those who reside with their mothers in correctional centres. This ensures that the rights of the child are safeguarded, and less restrictive and reasonable alternative approaches to maintain the connection between mother and child are explored. 32 The Queensland Trauma Strategy 2024–2029 Focus area 3: Foster healing Actions Prioritise First Nations’ healing Strengthen community-led and place-based initiatives 30. Progress truth-telling and healing, including prioritising a trauma-informed approach to ensure the 39. Actively engage with communities impacted by safety of all people involved with the Truth-telling and trauma to design and develop community-led and Healing Inquiry and to foster community engagement. place-based activities, focused on building mentally healthy and resilient communities, through existing 31. Progress the implementation of Leading healing our infrastructure such as neighbourhood centres, way: Queensland Aboriginal and Torres Strait Islander men’s"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,57,"the Truth-telling and trauma to design and develop community-led and Healing Inquiry and to foster community engagement. place-based activities, focused on building mentally healthy and resilient communities, through existing 31. Progress the implementation of Leading healing our infrastructure such as neighbourhood centres, way: Queensland Aboriginal and Torres Strait Islander men’s sheds, local sporting clubs and faith-based Healing Strategy 2020–2040 across whole-of-system organisations. and whole-of-community, including community-led healing through culture, and developing First Nations- 40. Enhance the resources, capacity and capability of the led evaluation frameworks. community non-government service system to provide trauma-informed responses appropriate to the people 32. Assess the feasibility of Queensland implementing they work with, and in the communities they are an accountability framework led by First Nations based. peoples to address institutional and systemic racism, disadvantage and re-traumatisation of First Nations peoples. Trauma-informed justice systems 33. Grow and strengthen community-led responses, 41. Continue to implement in full the Queensland awareness and education on the impacts of Government response to the recommendations of historical and intergenerational trauma on the Women’s Safety and Justice Taskforce series of First Nations communities in Queensland. reports, Hear her voice, as well as the Commission of Inquiry into Police Responses to Domestic and Family Violence as a Queensland Government priority. Address system-related re-traumatisation 42. Review and evaluate existing restorative justice 34. Enhance help-seeking and prevent system-related activities and opportunities for expansion with trauma for people who use drugs by continuing a trauma-informed approach. to shift toward health-related responses, including human rights and the legislative environment. 43. Increase access to navigation and advocacy supports for victim-survivors and people in contact with the 35. Work toward the elimination of restrictive practices criminal justice system. in health settings, and further develop alternatives to seclusion and restraint. 44. Explore options for peer and lived-living experience- based support"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,58,"legislative environment. 43. Increase access to navigation and advocacy supports for victim-survivors and people in contact with the 35. Work toward the elimination of restrictive practices criminal justice system. in health settings, and further develop alternatives to seclusion and restraint. 44. Explore options for peer and lived-living experience- based support approaches within the criminal justice, 36. Improve cultural and gender-specific responses court and custodial systems. required to prevent re-traumatisation, particularly in institutional settings. 45. Expand delivery of trauma-informed and culturally appropriate supports tailored to children and young 37. Review system responses to children and young people in detention, particularly for First Nations people where trauma can be experienced, including children and young people who are disproportionately for those in contact with, or at risk of contact with represented in the criminal justice system. child safety and youth justice. 38. Enhance data on system-related harm to better inform responses and actions and prevent traumatic experiences. The Queensland Trauma Strategy 2024–2029 33 Focus area 4 Enable reform Strengthen the systemic enablers for reform Strengthening the foundational enablers that underpin effective reform is key to achieving a more trauma-informed Queensland. These are the critical elements and systemic changes required to prevent and reduce the impact of trauma and promote mental health and wellbeing for Queenslanders. An emphasis on human rights, workforces, governance and accountability, lived-living experience leadership, co-design, funding and cross-sector partnerships is critical. Priority areas For further consideration An effective evidence-based approach to trauma Strengthen human rights approaches to trauma requires a human rights focus. This is consistent with what we heard during consultations for Queensland was the first jurisdiction in Australia to have a the strategy: dedicated human rights conciliation process, with positive outcomes delivered to date across health, housing, education “All roads lead back and council service delivery, underpinned by"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,59,"human rights focus. This is consistent with what we heard during consultations for Queensland was the first jurisdiction in Australia to have a the strategy: dedicated human rights conciliation process, with positive outcomes delivered to date across health, housing, education “All roads lead back and council service delivery, underpinned by legislation and the to human rights.” Queensland Government Human Rights Strategy. The Human Rights Act 2019 (Qld) protects and promotes 23 fundamental Human rights human rights of all Queenslanders. These rights include equality before the law; protection from torture and cruel, inhumane or A system that embeds human rights enables degrading treatment; cultural rights; humane treatment when equitable rights, protection of autonomy, deprived of liberty; rights in criminal proceedings; and the right agency, active citizenship, dignity, choice and to health services. The Human Rights Act 2019 (Qld) is currently control. There is a need for system responses undergoing an independent review. that recognise and respect the inherent value of people seeking treatment and support, While Queensland has made significant progress, there is more including families and carers; has effective to do to strengthen human rights protections and reduce harm safeguards to protect human rights; and through a person-led, trauma-informed and culturally competent delivers least restrictive practices. system that supports and protects people impacted by trauma. Much can be learned from examining A commitment to human rights leadership, accountability developments in other jurisdictions, both and culture must be embedded across the system to cultivate nationally and internationally, to ensure environments that do not perpetuate trauma. Human rights Queensland’s human rights protections and must be enshrined in the places we live, work and learn—and culture is underpinned by evidence and best this starts with government action and commitment to foster practice. A culture of continually reviewing inclusive practice and policies that embed"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,60,"do not perpetuate trauma. Human rights Queensland’s human rights protections and must be enshrined in the places we live, work and learn—and culture is underpinned by evidence and best this starts with government action and commitment to foster practice. A culture of continually reviewing inclusive practice and policies that embed human rights practices, including legislative provisions and leadership and culture. their effectiveness, is important to cultivate environments that do not inadvertently Promoting stronger human rights practices and approaches perpetuate trauma. This involves challenging across systems goes hand in hand with better outcomes for and revising existing frameworks that fail to people with lived-living experience of trauma and includes support or protect people impacted by trauma, governance, leadership and accountability mechanisms. to ensure that all system interactions are built on principles of safety, dignity and respect. 34 The Queensland Trauma Strategy 2024–2029 Focus area 4: Enable reform Build trauma-informed workforces Research93 indicates that cultivating healthy workplaces A strong and supported workforce is integral to requires clearly defined roles, appropriate training, boundary improving mental health and wellbeing outcomes for setting, peer connection, workload control and task diversity. all Queenslanders. This means building the capacity It also includes promoting reflective practice and providing and capability of our workforce to identify and reduce supervision tailored to both professional and personal the impacts of trauma. Recognising trauma should lead needs, alongside policies to identify and address critical to tailored adjustments in approach, aiming to eliminate and potentially traumatic events in the workplace. barriers and create environments that promote safety, Creating safe, supportive work conditions can mitigate risks dignity and healing. Each interaction is designed to like burnout and chronic stress, which can contribute to not only prevent harm but also reinforce the strengths absenteeism and lower job satisfaction. and resilience of the Queensland community. Care"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,61,"environments that promote safety, Creating safe, supportive work conditions can mitigate risks dignity and healing. Each interaction is designed to like burnout and chronic stress, which can contribute to not only prevent harm but also reinforce the strengths absenteeism and lower job satisfaction. and resilience of the Queensland community. Care and support are particularly vital for those directly Many people come into contact with systems and services involved in supporting individuals impacted by trauma or during times of distress, crisis or hardship. This presents an in roles where exposure to traumatic experiences is likely. opportunity to provide trauma-informed responses to ensure These roles carry an increased risk of vicarious trauma, people receive the right support as early as possible. This moral injury and compassion fatigue. Without the requisite focus extends to monitoring for signs of vicarious trauma knowledge and skills to understand the impacts of trauma within our workforces and understanding its dynamics— and adequately support those who may be impacted, including identifying risk factors and protective measures. repeated exposure to traumatic experiences may lead to a disconnection from professional values and compromise There are four practice levels to trauma-informed approaches safety and wellbeing. outlined in this strategy—trauma aware, trauma skilled, trauma enhanced and trauma specialised. These levels Strengthen governance and accountability form a continuum of knowledge, skill and understanding mechanisms designed to support the diverse needs of individuals, During consultations, stakeholders overwhelmingly families and carers impacted by trauma. It is common identified the need to strengthen governance, oversight for individuals to require support across various levels and accountability frameworks across government to simultaneously, highlighting the need for a system that promote and foster greater transparency and accountability is person-led, integrated and responsive to meet diverse in organisational decision-making. This includes needs effectively. strengthened complaints processes, acknowledging mistakes and/or wrongdoing"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,62,"individuals to require support across various levels and accountability frameworks across government to simultaneously, highlighting the need for a system that promote and foster greater transparency and accountability is person-led, integrated and responsive to meet diverse in organisational decision-making. This includes needs effectively. strengthened complaints processes, acknowledging mistakes and/or wrongdoing when it occurs, and addressing service delivery issues. “Human rights recognise the inherent value of each person, regardless of background, where we live, what we look like, what we think or what we believe. They are based on principles of dignity, equality and mutual respect, which are shared across cultures, religions and philosophies. They are about being treated fairly, treating others fairly and having the ability to make genuine choices in our daily lives.” (Australian Human Rights Commission) The Queensland Trauma Strategy 2024–2029 35 Focus area 4: Enable reform These themes are consistent with findings from Let the Fund and resource for sustainable sunshine in: Review of culture and accountability in the implementation Queensland public sector, completed in 2022 by Professor A well-structured funding approach that supports resilient Peter Coaldrake. The review was undertaken in response infrastructure will enhance mental health and wellbeing to community and stakeholder concerns about transparency, outcomes for Queenslanders. Effective, early and sustained accountability and integrity within the public sector. implementation of a broad range of initiatives across the continuum of need will also help support improved trauma Effective governance strengthens our systems and responses. The availability of resources, without disruption, approaches by fostering accountability and transparency, is particularly important to support people, families and and emphasising sustainable, system-wide improvement. communities during times of crisis. Collaboration and partnership that extends beyond the healthcare system and engages diverse systems and The multifaceted nature of domestic and family violence sectors—spanning tiers of government, non-government, and its trauma impacts"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,63,"transparency, is particularly important to support people, families and and emphasising sustainable, system-wide improvement. communities during times of crisis. Collaboration and partnership that extends beyond the healthcare system and engages diverse systems and The multifaceted nature of domestic and family violence sectors—spanning tiers of government, non-government, and its trauma impacts require particular focus. peak and professional bodies, industry, and primary and Enhanced coordination and integration across Queensland community sectors—also improves systems and approaches. Government agencies—including health, education, housing and justice—plus the strategic allocation of resources is Enhancing accountability is essential for successful necessary to enhance the effectiveness of interventions. implementation of trauma-informed strategies that genuinely Strengthening cross-sector approaches will create a more improve the mental health and wellbeing of Queenslanders. cohesive and comprehensive response system. This would Key to this approach is a commitment to transparency not only address immediate safety concerns, but also and accountability at every level. By embedding robust support long-term healing and prevention efforts. accountability frameworks within our governance structures, we aim to cultivate a culture of continuous learning The strategic allocation of resources using funding models and improvement. that are innovative and flexible will support enhanced service delivery, service integration and partnership, Prioritise lived-living experience awareness and education, community engagement, and leadership and expertise capacity building. Outcomes-based funding can increase Prioritising lived-living experience leadership and expertise the adaptability of our efforts, allowing for real-time at all levels will help achieve meaningful outcomes and adjustments based on actual needs and effectiveness. foster the understanding that people are experts in their own lives. These experiences must be used to inform changes to the system, to ensure it continuously improves for people who have experienced trauma. Anchored in the principle, ‘nothing about us, without us’, the strategy emphasises genuine co-design and co-production at all levels. This includes the"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,64,"are experts in their own lives. These experiences must be used to inform changes to the system, to ensure it continuously improves for people who have experienced trauma. Anchored in the principle, ‘nothing about us, without us’, the strategy emphasises genuine co-design and co-production at all levels. This includes the integration of lived-living experience leadership across systems and the active involvement of individuals, families and carers in shaping policies, programs and service delivery, as well as overseeing their implementation and effectiveness, including evaluation. People with lived-living experience, families and carers play a vital role in ensuring that services are tailored to meet the needs of those who use them, and those who support them. Prioritising and growing the peer workforce is essential to the healing journey, providing unparalleled understanding and support. This approach will ensure that solutions are not only effective but also owned by the broader Queensland community. 36 The Queensland Trauma Strategy 2024–2029 Focus area 4: Enable reform Enhance cross-sector partnership Improve innovation, evaluation and collaboration and knowledge translation Robust collaboration and partnership across sectors are The strategy prioritises the expertise of people with important to effectively prevent and reduce the impact of lived-living experience, as well as their families and trauma. There is genuine commitment from many systems caregivers. Enabling quality-of-life outcomes for people and services to provide trauma-informed service delivery. with lived-living experience, families and carers requires However, more can be done to support these systems prioritising co-designed and lived-living experience-led with foundational knowledge or internal resources, reduce research and evaluation to improve approaches effectively. operational silos and promote systemic collaboration. This effort involves adopting a coordinated approach The strategy prioritises approaches that are co-designed across sectors such as child safety, education, housing, and person-led, ensuring solutions are innovative and health and the justice system. informed"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,65,"resources, reduce research and evaluation to improve approaches effectively. operational silos and promote systemic collaboration. This effort involves adopting a coordinated approach The strategy prioritises approaches that are co-designed across sectors such as child safety, education, housing, and person-led, ensuring solutions are innovative and health and the justice system. informed by the perspectives of those most impacted by them. Leveraging collaborative approaches and This must include partnerships within and beyond partnerships includes sharing and harnessing new ideas Queensland Government agencies, including with the and research. Data-driven insights, innovation and private and non-government sector, academia and industry. evaluation methodologies that are co-designed are a priority. This approach will help prevent and respond to trauma by creating a connected, responsive wrap-around system Data sharing and linkages will enhance accountability that is informed by community needs and feedback. and transparency while also respecting confidentiality and consent. Continuous learning and adaptation are central Strategic leadership will foster collaboration at all levels to the implementation of this strategy, with feedback of government and service provision, integrating trauma- welcomed and used to refine services. The aim is to build informed care into service delivery and decision-making and strengthen a sustainable, resilient system that is processes. This creates a more comprehensive and effective continually improving and delivering better outcomes response to preventing and reducing the impact of trauma, at the individual, community and system levels. by improving collaboration and communication between services to ensure access to information with consent, and enhancing service delivery and client care. By implementing these strategies, we can build a more resilient and effective system where collaboration is embedded in the operational culture, and ensure that all sectors work together seamlessly to support people impacted by trauma. This enhances efficacy and fosters a more compassionate and comprehensive community response. The Queensland Trauma Strategy"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,66,"implementing these strategies, we can build a more resilient and effective system where collaboration is embedded in the operational culture, and ensure that all sectors work together seamlessly to support people impacted by trauma. This enhances efficacy and fosters a more compassionate and comprehensive community response. The Queensland Trauma Strategy 2024–2029 37 Focus area 4: Enable reform Actions Strengthen human rights approaches to trauma Prioritise lived-living leadership and expertise 46. Explore the intersection between trauma and 52. Engage with people who have experienced trauma human rights within the current legislative context to design, deliver and evaluate policies, processes to determine if changes are needed. and systems where appropriate. 47. Embed human rights leadership and culture across all of government, including meeting Fund and resource for sustainable implementation statutory obligations to include relevant information relating to human rights in annual reports. 53. Ensure security of longer-term funding arrangements to enhance sustainability, growth, workforce retention, and accessibility and availability Build trauma-informed workforces of supports and services for people who have experienced trauma or adversity. 48. Co-produce with people with a lived-living experience, a Queensland trauma core competencies framework, 54. Explore opportunities to enable a holistic approach training program and evaluation tool across the to resourcing domestic and family violence-informed four practice levels, to build a shared approach responses across Queensland Government agencies. and understanding of focus and scope in responding to trauma. Enhance cross-sector partnership and collaboration 49. Enhance support and sustainability strategies (including comprehensive planning, training, 55. Enhance collaboration, information sharing and recruitment, retention and specialist programs) cross-agency training to foster a shared for workforces and professions that frequently understanding of trauma-informed principles respond to traumatic incidents, such as emergency across Queensland Government agencies. services, police, and other health and human service workforces. Improve innovation, evaluation and knowledge 50. Embed evidence-based"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,67,"and recruitment, retention and specialist programs) cross-agency training to foster a shared for workforces and professions that frequently understanding of trauma-informed principles respond to traumatic incidents, such as emergency across Queensland Government agencies. services, police, and other health and human service workforces. Improve innovation, evaluation and knowledge 50. Embed evidence-based trauma-related curriculum translation in higher education courses for a wide range of professions that work across health and human 56. Ensure Queensland Government policies and services. planning across all portfolio areas reflect contemporary evidence about trauma and trauma- informed practice, including trauma experienced Strengthen governance and accountability in diverse contexts and diverse groups, communities mechanisms and population groups. 51. Develop trauma-informed leadership across 57. Enhance data collection and linkage methods, Queensland Government agencies for greater tools, frameworks and practice protocols across accountability, promoting transparency and Queensland Government agencies that build facilitating continuous improvement. knowledge of how to prevent and minimise the impacts of traumatic experiences and how to better implement trauma-informed responses across multiple settings and contexts. 38 The Queensland Trauma Strategy 2024–2029 Next steps Accountability for Measuring, monitoring implementation and reporting This strategy aims to build on the progress already achieved To monitor and report on the progress of the strategy, through existing policies, programs and funding across a robust monitoring and evaluation framework will be government and across sectors. Several government established. A process will be implemented to ensure initiatives in areas such as health, mental health, justice, continuous learning and the effective translation of education, and domestic and family violence are already knowledge into practice, maintaining the strategy’s supporting the overarching objectives. relevance and appropriateness. A more detailed implementation plan, developed in The Commission will lead the oversight, review and reporting collaboration with government departments, will further on the strategy’s implementation. In collaboration with the develop the"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,68,"and family violence are already knowledge into practice, maintaining the strategy’s supporting the overarching objectives. relevance and appropriateness. A more detailed implementation plan, developed in The Commission will lead the oversight, review and reporting collaboration with government departments, will further on the strategy’s implementation. In collaboration with the develop the reforms outlined in the strategy, including Strategic Leadership Group, the Commission will develop a focus on regional, rural and remote areas. It will involve and refine the approaches to implementing and evaluating phased and sequenced actions to support the priorities the strategy, including establishing review timelines. and identify lead agencies and key deliverables across the Queensland Government. To support implementation, the Commission will explore the establishment of a centre of excellence to build the capacity and capability of Queensland Government agencies. A dedicated trauma centre of excellence could provide access to the latest evidence and insights in trauma-informed practice and support improved outcomes. Additionally, a centre could also provide services for those requiring highly specialised support and treatment beyond the tertiary service system. The whole-of-government Shifting Minds Strategic Leadership Group comprised of senior government representatives and sector leaders, including lived-living experience peak bodies, will oversee implementation and provide the authorising environment to drive reform through a collaborative, coordinated and integrated approach. The Strategic Leadership Group will ensure the reforms outlined in the strategy are connected to and leverage cross-sector strategies and activities. This includes reforms in education, child safety, youth justice, domestic and family violence, and other key areas. The Queensland Trauma Strategy 2024–2029 39 Glossary Adversity A difficult or unpleasant situation, set of circumstances or experiences.94 Co-design is a way of bringing people with lived-living experience, their families and carers, and other stakeholders together to improve services. It involves planning, designing and implementing services with people who have experience"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,69,"Queensland Trauma Strategy 2024–2029 39 Glossary Adversity A difficult or unpleasant situation, set of circumstances or experiences.94 Co-design is a way of bringing people with lived-living experience, their families and carers, and other stakeholders together to improve services. It involves planning, designing and implementing services with people who have experience with the problem or service to Co-design find a solution more likely to meet their needs. It creates an equal and reciprocal relationship between all stakeholders, enabling them to design and deliver services in partnership with each other.95 Cultural safety involves professionals and organisations providing treatment and supports to people with consideration of, and respect to the historical, cultural and social contexts in Cultural safety which they exist. This involves examining their knowledge, assumptions, skills and attitudes, and consists of shifting to the worldview of people and communities.96 Culturally responsive services respect diverse populations’ health beliefs, practices, culture, Culturally responsive language and faith, and are accessible, approachable, accommodating, affordable and care appropriate.97 Early support includes identifying signs of mental ill-health and other risk factors early, Early support followed by timely care and support to reduce their severity, duration and recurrence, and promote recovery and wellbeing. The term ‘families and carers’ is used to refer to a broad group of people who have an interest in a person’s wellbeing or provide unpaid care and support to another person. It may refer Families and carers to a family of origin or choice, kinship group or friends, and includes informal carers98 and people under 18 years old. Integrated care refers to the provision of connected, effective and efficient care that accounts for and is organised around a person’s health and social needs, across the spectrum of needs Integrated care and in partnership with the person with lived-living experience, carers and family members. In"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,70,"under 18 years old. Integrated care refers to the provision of connected, effective and efficient care that accounts for and is organised around a person’s health and social needs, across the spectrum of needs Integrated care and in partnership with the person with lived-living experience, carers and family members. In addition, integrated care takes several key forms, including horizontal and vertical integration, cross-sector integration, people-centred integration, and whole-of-system integration.99 Lived experience refers to a person’s experience of mental ill-health, problematic alcohol and other drug use, suicidal thoughts, surviving a suicide attempt, or being bereaved by Lived-living experience suicide. This strategy uses the term lived-living experience to conceptualise a continuum of experiences that people may have at different times in their lives. The use of the hyphen signifies the fluidity or changing nature of experiences along this continuum. 40 The Queensland Trauma Strategy 2024–2029 Glossary A state of mental wellbeing in which every person realises their own potential, can cope with Mental health the normal stresses of life, can work productively and fruitfully, and is able to contribute and wellbeing to their community.100 Person-led approaches respond to the person as the leader of their life in ways that foster Person-led personal agency and the capacity to manage challenges. In addition, person-led approaches require service providers to be accountable to the person.101 Psychosocial support refers to a range of services that improve mental wellbeing and build people’s capacity to live well in their communities. This includes helping people to manage Psychosocial support daily activities, rebuild and maintain connections, build social skills, participate in education and employment, and facilitate recovery in the community.102 Reconciliation is about strengthening relationships between Aboriginal and Torres Strait Islander peoples and non-Indigenous peoples, for the benefit of all Australians. Reconciliation Reconciliation is based and measured on five dimensions:"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,71,"daily activities, rebuild and maintain connections, build social skills, participate in education and employment, and facilitate recovery in the community.102 Reconciliation is about strengthening relationships between Aboriginal and Torres Strait Islander peoples and non-Indigenous peoples, for the benefit of all Australians. Reconciliation Reconciliation is based and measured on five dimensions: historical acceptance, race relations, equality and equity, institutional integrity and unity.103 This term acknowledges the diverse ways that First Nations people and communities Social and emotional understand, conceptualise and describe a person’s overall physical, mental, emotional wellbeing and social wellness. It recognises the importance of connection to community, family, Country, land, sea, culture and spirituality on a person’s wellbeing.104 The determinants of health are the social, cultural, political, economic, personal and environmental conditions in which people are born, live, work and age. The determinants Social determinants of health are interrelated with experiences of mental health and wellbeing, alcohol and of health other drug use, suicide, and the likelihood of poorer outcomes. Uneven distribution of these determinants results in health inequities.105 Several principles underpin trauma-informed approaches. Although diverse frameworks adopt different terminologies, and these concepts continue to evolve, the core concepts Trauma-informed remain consistent. These principles can be tailored and adapted to diverse settings, contexts principles and sectors, incorporating the underlying values of safety, trustworthiness and transparency, peer support, collaboration and mutuality, empowerment, voice and choice, humility, and respect for diverse needs, experiences, and preferences.106, 107 The Queensland Trauma Strategy 2024–2029 41 Appendix 1 Types of trauma Although there are many ways in which a person can respond to potentially traumatic events or circumstances, these experiences can be broadly categorised as interpersonal, external or environmental.108 Each experience can have unique challenges and implications. Trauma can potentially arise from a single traumatic Trauma can also extend beyond the individual experience, circumstance or"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,72,"ways in which a person can respond to potentially traumatic events or circumstances, these experiences can be broadly categorised as interpersonal, external or environmental.108 Each experience can have unique challenges and implications. Trauma can potentially arise from a single traumatic Trauma can also extend beyond the individual experience, circumstance or event or may result from repeated encompassing vicarious interactions where people may exposure to the same or multiple types of circumstances become impacted by witnessing or learning about others’ or experiences over time. This is often referred to as traumatic experiences. This type of trauma, referred to cumulative trauma.109 Complex trauma, particularly common as vicarious trauma, is particularly common among those in women,110 is associated with the enduring effects of employed in professions that regularly work with others continuous, potentially traumatic circumstances or events who are exposed to or who have personally experienced that are difficult to leave and often involve interpersonal potentially traumatic events or circumstances.116 dynamics. Examples include family and domestic violence, encompassing physical abuse, emotional abuse, sexual Some professions are traditionally recognised as being violence and elder abuse, as well as medical trauma and at high risk of experiencing trauma due to their frontline witnessing or experiencing community violence.111, 112 nature, including the defence force, police and emergency People experiencing complex trauma often feel trapped, services, such as ambulance, fire and rescue, lifesaving unsafe and unable to trust, leading to feelings of shame. and state emergency services—many of which rely heavily This can further result in challenges in managing emotions on volunteers. It can also extend to other sectors such as and in adopting healthy coping strategies. healthcare workers, journalists, and those in the legal and justice systems, as well as some individuals in the mining Potentially traumatic circumstances or events can occur and construction industries. at"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,73,"in managing emotions on volunteers. It can also extend to other sectors such as and in adopting healthy coping strategies. healthcare workers, journalists, and those in the legal and justice systems, as well as some individuals in the mining Potentially traumatic circumstances or events can occur and construction industries. at any time in a person’s life. Adverse childhood experiences is an umbrella term that refers to potentially traumatic Trauma can extend across generations and communities, experiences that occur during childhood. These experiences manifesting as intergenerational or collective trauma. are commonly characterised by abuse, which can be Intergenerational trauma occurs within families, where the physical, sexual or emotional in nature and encompass effects of past traumas are passed from one generation emotional or physical neglect; household adversities, to the next. Collective trauma refers to groups experiencing including mental ill-health, problematic alcohol and other a traumatic event together, such as during wars, terrorist drug use, parental separation, parental incarceration, attacks or natural disasters. family and domestic violence; and other adversities First Nations Queenslanders experience contemporary, such as bullying and/or victimisation, or exposure to a historical and intergenerational trauma and this trauma is natural disaster, war or terrorism.113 The protective factors ongoing and persists.117 The enduring effects of colonisation, in children’s lives, such as supportive relationships and systemic racism and discriminatory practices, such as engagement with education, can also play a positive role in the forcible removal of children, dispossession of land, minimising the impact of adverse childhood experiences.114 and loss of cultural identity have further compounded Experiences of adversity and trauma in early life can the ongoing challenges and intergenerational trauma significantly disrupt a child’s developmental journey, with experienced by many First Nations families and long-lasting and potentially intergenerational impacts.115 communities.118, 119 Intergenerational trauma is not only an individual experience but can"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,74,"identity have further compounded Experiences of adversity and trauma in early life can the ongoing challenges and intergenerational trauma significantly disrupt a child’s developmental journey, with experienced by many First Nations families and long-lasting and potentially intergenerational impacts.115 communities.118, 119 Intergenerational trauma is not only an individual experience but can be embedded in the community’s history. It encompasses the physical, emotional, mental and spiritual distress passed down through generations. Acknowledging truth is fundamental to healing. By acknowledging these truths, communities can begin to address the root causes of trauma, and foster a shared path towards healing and Reconciliation.120 42 The Queensland Trauma Strategy 2024–2029 Appendix 1 Types of trauma Collective trauma can be experienced and exacerbated by As our environment changes, Queenslanders are also things such as marginalisation, stigma, discrimination and increasingly facing exposure to more potentially traumatic racism. For example, refugees and people seeking asylum circumstances and experiences due to more frequent and often experience a profound range of potentially traumatic severe natural disasters. Queensland is the most disaster- events in the context of war, persecution or displacement.121 prone state in Australia. The natural hazards predominantly These experiences can include loss, torture, ongoing affecting Queensland communities include bushfires, uncertainty, isolation and detention, and violence. droughts, floods, storms and cyclones.122 Since 2011, These challenges significantly contribute to a variety of Queensland has reported over 100 instances of natural issues related to physical and mental health, and social disasters.123 Infants, children and young people in particular and emotional wellbeing. The complexity of trauma face the prospect of living with the long-term effects of experienced by refugees and people seeking asylum extends climate change, including floods, bushfires and heat waves. from before arrival in Australia, during the migration process, These extreme weather events not only threaten immediate and continues after settlement. physical"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,75,"of trauma face the prospect of living with the long-term effects of experienced by refugees and people seeking asylum extends climate change, including floods, bushfires and heat waves. from before arrival in Australia, during the migration process, These extreme weather events not only threaten immediate and continues after settlement. physical safety but also lead to broader societal impacts such as food and water shortages, community displacement, Systems and services designed to support people may and disruption to essential services, heightening the risk unintentionally cause harm. System-related trauma arises of trauma. Research indicates that natural disasters can from interactions with institutional systems that compound significantly increase family-related challenges, which existing trauma and/or create new traumatic experiences. may compound or prolong distress, particularly in infants, These interactions can challenge the principles of human children and adolescents.124 rights, particularly when marked by insufficient knowledge and capability to respond appropriately. Capacity and resourcing issues in these environments can further alienate and distress people. This underscores the need for systemic reform to reduce these effects and prevent additional trauma. It is critical that systems recognise the various aspects and points of contact that can be potentially unsafe for people and communities who have experienced traumatic events and circumstances. Without doing so, any intended positive outcomes are likely to be disrupted. Potentially unsafe aspects encompass the physical environment, legislative requirements, culture, practices, use of language, processes, policies and procedures. It is critical that understanding of system impacts is led from the perspective of the person, family and carers involved, through co-design, and by ensuring lived-living experience voices and needs are central. The Queensland Trauma Strategy 2024–2029 43 Appendix 2 The policy landscape International, national and state plans and approaches International conventions National policy, frameworks and programs Human rights are both protections and aspirations, • National Agreement"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,76,"and carers involved, through co-design, and by ensuring lived-living experience voices and needs are central. The Queensland Trauma Strategy 2024–2029 43 Appendix 2 The policy landscape International, national and state plans and approaches International conventions National policy, frameworks and programs Human rights are both protections and aspirations, • National Agreement on Closing the Gap enabling a long-term strong and trauma-informed • Gayaa Dhuwi (Proud Spirit) Declaration Queensland community. A human rights approach focuses on collective action for community change, • Implementation Plan for the Gayaa Dhuwi (Proud Spirit) which is a key part of the healing process for people Declaration (pending) with lived-living experience of trauma. • National Aboriginal and Torres Strait Islander Suicide Prevention Strategy (pending) There have been significant advancements in the protection of human rights to embed these protections • National Strategic Framework for Aboriginal and as international norms, including: Torres Strait Islander People’s Mental Health and Social and Emotional Wellbeing • Universal Declaration of Human Rights which establishes fundamental human rights to be universally protected • The National Mental Health and Suicide Prevention Agreement and the Bilateral Schedule on Mental Health • United Nations Declaration on the Rights of Indigenous and Suicide Prevention: Queensland Peoples which establishes human rights standards and fundamental freedoms for Indigenous peoples • The National Plan to End Violence against Women and Children 2022–2032 • United Nations Convention on the Rights of Persons with Disabilities which promotes, protects and ensures • National Strategy to Prevent and Respond to Child the inherent rights of people with disability including Sexual Abuse 2021–2030 social, economic, civil and political rights • Safe and Supported: The National Framework • United Nations Convention on the Rights of the Child for Protecting Australia’s Children 2021–2031 which promotes, protects and ensures the inherent • National Disability Insurance Scheme (NDIS) rights"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,77,"of people with disability including Sexual Abuse 2021–2030 social, economic, civil and political rights • Safe and Supported: The National Framework • United Nations Convention on the Rights of the Child for Protecting Australia’s Children 2021–2031 which promotes, protects and ensures the inherent • National Disability Insurance Scheme (NDIS) rights of children, including the right of a child to grow up • Australia’s Disability Strategy 2021–2031 in a family environment in an atmosphere of happiness, love and understanding. • Working together to deliver the NDIS • National Suicide Prevention Adviser – Final Advice • Beyond Urgent: National LGBTIQ+ Mental Health and Suicide Prevention Strategy 2021–2026 • National Drug Strategy 2017–2026 • The National Lived Experience (Peer) Workforce Development Guidelines • National Disaster Mental Health and Wellbeing Framework 44 The Queensland Trauma Strategy 2024–2029 Appendix 2 The policy landscape Relevant state-based policy, frameworks and programs • Queensland’s commitment to Path to Treaty • A Safer Queensland 2024–2028 Youth Justice Strategy Queensland women’s strategy 2022–27 • Reframing the Relationship Plan 2023–2024 • Queensland’s Plan for the Primary Prevention of Violence • Queensland’s Framework for Action – Reshaping Against Women 2024–2028 our approach to Aboriginal and Torres Strait Islander domestic and family violence • Pride in Our Communities: 2024–2032 • Queensland: Good Jobs, Better Services, Great Lifestyle • Putting Queensland Kids First: Giving our kids the opportunity of a lifetime • Leading healing our way: Queensland Aboriginal and Torres Strait Islander Healing Strategy 2020–2040 • Domestic and Family Violence Training and Change Management Framework • HEALTHQ32: A vision for Queensland’s health system • Future Directions for an Age-Friendly Queensland • Queensland Women and Girls’ Health Strategy 2032 • Queensland’s Disability Plan 2022–27: Together, • Communities 2032 and Communities 2032: Action Plan a better Queensland 2022–2025 • A Safer Queensland – Queensland Youth Justice"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,78,"Framework • HEALTHQ32: A vision for Queensland’s health system • Future Directions for an Age-Friendly Queensland • Queensland Women and Girls’ Health Strategy 2032 • Queensland’s Disability Plan 2022–27: Together, • Communities 2032 and Communities 2032: Action Plan a better Queensland 2022–2025 • A Safer Queensland – Queensland Youth Justice Strategy • Local Thriving Communities Action Plan 2024–2028 • Making Tracks Together – Queensland’s Aboriginal • Prevent. Support. Believe. Queensland’s framework and Torres Strait Islander Health Equity Framework to address Sexual Violence • Queensland Multicultural Policy: Our story, our future and • Managing the risk of psychosocial hazards at work Queensland Multicultural Action Plan 2024–25 to 2026–27 Code of Practice 2022 • Our way: A generational strategy for Aboriginal and • Better Justice Together: Queensland’s Aboriginal and Torres Strait Islander children and families 2017–2037 Torres Strait Islander Justice Strategy 2024–2031 and action plans • Queensland State Disaster Management Plan • Be healthy, be safe, be well framework • Queensland Disaster Management Arrangements • Gambling harm minimisation plan for Queensland 2021–25 • Queensland Disaster Management Guideline • Homes for Queenslanders • Even better public sector for Queensland strategy 2024–2028 • Domestic and Family Violence Prevention Strategy 2016–2026 Our state mental health, alcohol and Relevant inquiries and reviews other drug and suicide prevention • Hear her voice – Report one – Addressing coercive control strategies and frameworks and domestic and family violence in Queensland • Shifting minds: The Queensland Mental Health, • Hear her voice – Report two – Women and girls’ Alcohol and Other Drugs, and Suicide Prevention experiences across the criminal justice system Strategic Plan 2023–2028 and Queensland Government Response • Achieving balance: The Queensland Alcohol and • Mental Health Select Committee Inquiry into the Other Drugs Plan 2022–2027 opportunities to improve mental health outcomes for Queenslanders • Every life:"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,79,"Alcohol and Other Drugs, and Suicide Prevention experiences across the criminal justice system Strategic Plan 2023–2028 and Queensland Government Response • Achieving balance: The Queensland Alcohol and • Mental Health Select Committee Inquiry into the Other Drugs Plan 2022–2027 opportunities to improve mental health outcomes for Queenslanders • Every life: The Queensland Suicide Prevention Plan 2019–2029 Phase Two • A call for change: Commission of Inquiry into Queensland Police Service responses to domestic and family violence • Better Care Together: A plan for Queensland’s state-funded mental health, alcohol and other drug services to 2027 • Royal Commission into Violence Abuse, Neglect and Exploitation of People with Disability • Queensland Alcohol and Other Drug Treatment Service Delivery Framework • Bringing them Home—Report of the National Inquiry into the Separation of Aboriginal and Torres Strait Islander • Regional mental health, alcohol and other drugs Children from Their Families and suicide prevention plans The Queensland Trauma Strategy 2024–2029 45 References 1 Australian Government (Productivity Commission) 2020, 10 Phoenix Australia Centre for Posttraumatic Mental Mental Health, Report no. 95, Australian Government, Health 2024, Can you see PTSD, viewed 25 June 2024, Canberra. Available online at https://www.pc.gov.au/ https://www.phoenixaustralia.org/ptsd-awareness- inquiries/completed/mental-health#report. day/. 2 Mathews B, Pacella R, Scott JG, et al 2023, ‘The 11 Phoenix Australia Centre for Posttraumatic Mental Health prevalence of child maltreatment in Australia: findings 2020, Australian Guidelines for the Prevention and from a national survey’ survey’, The Medical Journal Treatment of Acute Stress Disorder, Posttraumatic Stress of Australia, vol. 218, no. S6, pp S13-S18, DOI:10.5694/ Disorder and Complex Posttraumatic Stress Disorder, mja2.51873. viewed 7 May 2024, https://www.phoenixaustralia.org/ wp-content/uploads/2022/07/3.-PTSD-Guidelines- 3 Sweetland, J 2024, Framing Adversity, Trauma, Executive-summary.pdf. and Resilience, viewed 22 May 2024, https://www. frameworksinstitute.org/publication/framing-adversity- 12 Grummit, L, Baldwin, JR, Lafoa’I, J, Keyes KM & Barrett, trauma-and-resilience/. E 2024, ‘Burden of Mental Disorders and"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,80,"S13-S18, DOI:10.5694/ Disorder and Complex Posttraumatic Stress Disorder, mja2.51873. viewed 7 May 2024, https://www.phoenixaustralia.org/ wp-content/uploads/2022/07/3.-PTSD-Guidelines- 3 Sweetland, J 2024, Framing Adversity, Trauma, Executive-summary.pdf. and Resilience, viewed 22 May 2024, https://www. frameworksinstitute.org/publication/framing-adversity- 12 Grummit, L, Baldwin, JR, Lafoa’I, J, Keyes KM & Barrett, trauma-and-resilience/. E 2024, ‘Burden of Mental Disorders and Suicide Attributable to Childhood Maltreatment’, JAMA 4 Blue Knot Foundation n.d., What is trauma, viewed Psychiatry, published online 8 May 2024 ahead of print. 1 May 2024, https://blueknot.org.au/resources/ DOI:10.1001/jamapsychiatry.2024.0804. understanding-trauma-and-abuse/. 13 Dore, G, Mills, K, Murray, R, Teesson, M, & Farrugia, P 5 Phoenix Australia 2022, Australian Guidelines for the 2012, ‘Post-traumatic stress disorder, depression and Prevention and Treatment of Acute Stress Disorder, suicidality in inpatients with substance use disorders’ Posttraumatic Stress Disorder and Complex PTSD, in Drug and Alcohol Review, vol.31, no.3, pp.294-302. viewed 7 May 2024, https://www.phoenixaustralia.org/ https://doi.org/10.1111/j.1465-3362.2011.00314.x. wp-content/uploads/2022/07/3.-PTSD-Guidelines- Executive-summary.pdf. 14 Queensland Government (Queensland Reconstruction Authority) 2024, Getting To Know The Risk of Disaster 6 Crozier, T, Howard, A, Watson, L & Sadler, N 2024, In Queensland, viewed 18 June 2024, https:// ‘The prevalence and impacts of trauma in adults’, www.getready.qld.gov.au/understand-your-risk/ Consultation paper developed for the Queensland disaster-risk#:~:text=Since%202011%2C%20 Mental Health Commission, viewed 1 May 2024, Queenslanders%20have%20faced,cyclones%2C%20 https://6232990.fs1.hubspotusercontent-na1. storm%20tides%20and%20floods. net/hubfs/6232990/Phoenix%20Australia%20 -%20QMHC%20paper%20prevalence%20and%20 15 Couzner, L, Spence, N, Fausto, K, Huo, Y, Vale, L, Elkins, impact%20of%20trauma%20in%20adults_FINAL_.pdf. S, Saltis, J & Cations, M 2022, ‘Delivering Trauma- Informed Care in a Hospital Ward for Older Adults with 7 Blake, J, Kato, A & Scott, J 2024, ‘Whole-of-government Dementia: An Illustrative Case Series’, Frontiers in trauma strategy’, Consultation paper developed for Rehabilitation Sciences, vol. 3, article 934099, pp. 1-7, the Queensland Mental Health Commission, viewed DOI:10.3389/fresc.2022.934099. 1 May 2024, https://6232990.fs1.hubspotusercontent- na1.net/hubfs/6232990/QMHC%20Discussion%20 16 Huang LN, Flatow R, Biggs T, et al 2014, SAMHSA’s paper%20-%20Trauma%20Introduction-plain-text_ Concept of Trauma and Guidance for a Trauma-Informed version2.pdf. Approach, HHS"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,81,"in trauma strategy’, Consultation paper developed for Rehabilitation Sciences, vol. 3, article 934099, pp. 1-7, the Queensland Mental Health Commission, viewed DOI:10.3389/fresc.2022.934099. 1 May 2024, https://6232990.fs1.hubspotusercontent- na1.net/hubfs/6232990/QMHC%20Discussion%20 16 Huang LN, Flatow R, Biggs T, et al 2014, SAMHSA’s paper%20-%20Trauma%20Introduction-plain-text_ Concept of Trauma and Guidance for a Trauma-Informed version2.pdf. Approach, HHS Publication No. 14-4884. Rockville, MD 8 Scotland Government (NHS Education for Scotland) 17 Blake, J, Kato, A & Scott, J 2024, ‘Whole-of-government 2017, Transforming psychological trauma: a knowledge trauma strategy’, Consultation paper developed for and skills framework for the Scottish Workforce, viewed the Queensland Mental Health Commission, viewed 9 May 2024, https://traumatransformation.scot/app/ 1 May 2024, https://6232990.fs1.hubspotusercontent- uploads/2023/09/nationaltraumatrainingframework- na1.net/hubfs/6232990/QMHC%20Discussion%20 final.pdf. paper%20-%20Trauma%20Introduction-plain-text_ version2.pdf. 9 Australian Government (Productivity Commission) 2020, Mental Health, Report no. 95, Australian Government, 18 Jones S 2017, ‘Describing the Mental Health Profile Canberra. Available online at https://www.pc.gov.au/ of First Responders: A Systematic Review’, Journal inquiries/completed/mental-health#report. of the American Psychiatric Association, vol. 23, no. 3, pp. 200-214, DOI:10.1177/1078390317695266. 46 The Queensland Trauma Strategy 2024–2029 References 19 Phoenix Australia Centre for Posttraumatic Mental 27 Blake, J, Kato, A & Scott, J 2024, ‘Whole-of-government Health 2020, Australian Guidelines for the Prevention trauma strategy’, Consultation paper developed for and Treatment of Acute Stress Disorder, Posttraumatic the Queensland Mental Health Commission, viewed Stress Disorder and Complex PTSD, Phoenix Australia, 1 May 2024, https://6232990.fs1.hubspotusercontent- Melbourne. Available at https://www.phoenixaustralia. na1.net/hubfs/6232990/QMHC%20Discussion%20 org/australian-guidelines-for-ptsd/. paper%20-%20Trauma%20Introduction-plain-text_ version2.pdf. 20 Mohatt NV, Thompson AB, Thai ND, & Tebes, JK 2014, ‘Historical trauma as public narrative: A conceptual 28 Matthews, B et al 2023, ‘The Australian Child review of how history impacts present-day health’, Maltreatment Study: National prevalence and Social Science & Medicine, vol. 106, pp. 128-136, associated health outcomes of child abuse and DOI:10.1016/j.socscimed.2014.01.043. neglect’, The Medical Journal of Australia, vol. 218, no. 6, pp. S1-S51. 21 Crozier, T, Howard, A, Watson,"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,82,"2023, ‘The Australian Child review of how history impacts present-day health’, Maltreatment Study: National prevalence and Social Science & Medicine, vol. 106, pp. 128-136, associated health outcomes of child abuse and DOI:10.1016/j.socscimed.2014.01.043. neglect’, The Medical Journal of Australia, vol. 218, no. 6, pp. S1-S51. 21 Crozier, T, Howard, A, Watson, L & Sadler, N 2024, ‘The prevalence and impacts of trauma in adults’, 29 Matthews, B et al 2023, ‘The Australian Child Consultation paper developed for the Queensland Maltreatment Study: National prevalence and Mental Health Commission, viewed 22 May 2024, associated health outcomes of child abuse and https://6232990.fs1.hubspotusercontent-na1. neglect’, The Medical Journal of Australia, vol. 218, net/hubfs/6232990/Phoenix%20Australia%20 no. 6, pp. S1-S51. -%20QMHC%20paper%20prevalence%20and%20 30 O’Connor, M. et al 2020, ‘Inequalities in the distribution impact%20of%20trauma%20in%20adults_ of childhood adversity from birth to 11 years’, Academic FINAL_070524.pdf. Pediatrics, vol. 20, no.5, pp 609-618, DOI:10.1016/j. 22 Hirschberger G 2018, ‘Collective Trauma and the Social acap.2019.12.004. Construction of Meaning’, Frontiers in Psychology, vol. 9, 31 Australian Government (Australian Institute of Health article 1441, pp. 1-14, DOI:10.3389/fpsyg.2018.01441. and Welfare) 2024, Deaths by suicide among young 23 Cook, A, Spinazzola, J, Ford, J, Lanktree, C, Blaustein, M, people, viewed 27 May 2024, https://www.aihw.gov.au/ Cloitre, M, DeRosa, R, Hubbard, R, Kagan, R, Liautaud, J, suicide-self-harm-monitoring/data/populations-age- Mallah, K, Olafson, E, & Van Der Kolk, B 2005 ‘Complex groups/suicide-among-young-people. trauma in children and adolescents’ in Psychiatric 32 Baidawi, S & Sheehan, R 2019, ‘Crossover kids’: Annals, vol. 35, no. 5), pp. 390–398. Offending by child protection-involved youth, in Trends 24 Blake, J, Kato, A & Scott, J 2024, ‘Whole-of-government & issues in crime and criminal justice, no. 582. trauma strategy’, Consultation paper developed for 33 Australian Institute of Health and Welfare 2024, Child the Queensland Mental Health Commission, viewed protection Australia 2021–22, viewed 18 June 2024, 1 May 2024, https://6232990.fs1.hubspotusercontent- https://www.aihw.gov.au/reports/child-protection/"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,83,"J, Kato, A & Scott, J 2024, ‘Whole-of-government & issues in crime and criminal justice, no. 582. trauma strategy’, Consultation paper developed for 33 Australian Institute of Health and Welfare 2024, Child the Queensland Mental Health Commission, viewed protection Australia 2021–22, viewed 18 June 2024, 1 May 2024, https://6232990.fs1.hubspotusercontent- https://www.aihw.gov.au/reports/child-protection/ na1.net/hubfs/6232990/QMHC%20Discussion%20 child-protection-australia-2021-22/contents/insights/ paper%20-%20Trauma%20Introduction-plain-text_ how-is-child-maltreatment-determined. version2.pdf. 34 Blake, J, Kato, A & Scott, J 2024, ‘Whole-of-government 25 Bendall, S, Eastwood, O, Spelman, T, McGorry, P, Hickie, trauma strategy’, Consultation paper developed for I, Yung, A R, Amminger, P, Wood, S J, Pantelis, C, Purcell, the Queensland Mental Health Commission, viewed R, & Phillips, L 2023, ‘Childhood trauma is prevalent 1 May 2024, https://6232990.fs1.hubspotusercontent- and associated with co-occurring depression, anxiety, na1.net/hubfs/6232990/QMHC%20Discussion%20 mania and psychosis in young people attending paper%20-%20Trauma%20Introduction-plain-text_ Australian youth mental health services’, The Australian version2.pdf. and New Zealand Journal of Psychiatry, vol. 57 no. 12, pp. 1518-1526, DOI: 10.1177/00048674231177223. 35 Kuzminskaite, E, Penninx, B W J H, van Harmelen, A L, Elzinga, B M, Hovens, J G F M, & Vinkers, C H 2021, 26 Blue Knot Foundation n.d., What is trauma, viewed ‘Childhood Trauma in Adult Depressive and Anxiety 1 May 2024, https://blueknot.org.au/resources/ Disorders: An Integrated Review on Psychological and understanding-trauma-and-abuse/. Biological Mechanisms in the NESDA Cohort’, Journal of Affective Disorders, vol. 283, pp. 179-191, DOI:10.1016/j. jad.2021.01.054. The Queensland Trauma Strategy 2024–2029 47 References 36 Sahle, B W, Reavley, N J, Li, W, Morgan, A J, Yap, M B H, 47 Rawlinson, C 2024, ‘Pregnancy and Early Parenting’, Reupert, A, & Jorm, A F 2022, ‘The association between Consultation paper developed for the Queensland adverse childhood experiences and common mental Mental Health Commission, viewed 3 May 2024, disorders and suicidality: an umbrella review of https://6232990.fs1.hubspotusercontent-na1.net/ systematic reviews and meta-analyses’, European Child hubfs/6232990/QMHC%20Trauma%20Strategy%20 & Adolescent Psychiatry, vol. 31, no. 10,"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,84,"A, & Jorm, A F 2022, ‘The association between Consultation paper developed for the Queensland adverse childhood experiences and common mental Mental Health Commission, viewed 3 May 2024, disorders and suicidality: an umbrella review of https://6232990.fs1.hubspotusercontent-na1.net/ systematic reviews and meta-analyses’, European Child hubfs/6232990/QMHC%20Trauma%20Strategy%20 & Adolescent Psychiatry, vol. 31, no. 10, pp. 1489-1499, -%20Pregnancy%20and%20Early%20Parenting-1.pdf. DOI:10.1007/s00787-021-01745-2. 48 Crozier, T, Howard, A, Watson, L & Sadler, N 2024, 37 American Psychiatric Association 2022, What is ‘The prevalence and impacts of trauma in adults’, Posttraumatic Stress Disorder (PTSD)?, Viewed Consultation paper: development of whole-of- 2 May 2024, https://www.psychiatry.org/patients- government Trauma Strategy for Queensland, viewed families/ptsd/what-is-ptsd. 22 May 2024, https://6232990.fs1.hubspotusercontent- na1.net/hubfs/6232990/Phoenix%20Australia%20 38 Blue Knot Foundation n.d., What is trauma, viewed -%20QMHC%20paper%20prevalence%20and%20 1 May 2024, https://blueknot.org.au/resources/ impact%20of%20trauma%20in%20adults_ understanding-trauma-and-abuse/. FINAL_070524.pdf. 39 Scotland Government (NHS Education for Scotland) 49 Sweetland, J 2024, Framing Adversity, Trauma, and 2017, Transforming psychological trauma: a knowledge Resilience, Frame Works, viewed 22 May 2024, and skills framework for the Scottish workforce, viewed https://www.frameworksinstitute.org/publication/ 9 May 2024, https://traumatransformation.scot/app/ framing-adversity-trauma-and-resilience/. uploads/2023/09/nationaltraumatrainingframework- final.pdf. 50 Emerging Minds 2022, Trauma responses in children aged 0–24 months, viewed 22 May 2024, 40 Darwin L, Vervoort S, Vollert E & Blustein S, 2023, https://d2p3kdr0nr4o3z.cloudfront.net/content/ Intergenerational trauma and mental health, Catalogue uploads/2022/08/16141112/Tipsheet-Trauma- number IMH 18, Australian Institute of Health and responses-in-children-aged-0-24-months-final-Aug-22. Welfare, Australian Government. pdf. 41 Gibson, M., Stuart, J., Leske, S., Ward, R. & Vidyattama, 51 Hoehn, E & De Young, A 2024, ‘Infants and young Y. 2021, ‘Does community cultural connectedness children’, Consultation paper: development of whole- reduce the influence of area disadvantage on Aboriginal of-government Trauma Strategy for Queensland, viewed and Torres Strait Islander young peoples’ suicide?’, 22 May 2024, https://6232990.fs1.hubspotusercontent- Australian and New Zealand Journal of Public Health, na1.net/hubfs/6232990/QMHC%20Trauma%20 vol. 45, no. 6, pp. 643-650, DOI:10.1111/1753-6405.13164. Strategy%20-%20Infant%20and%20Early%20 42 Australian Institute of Health and Welfare 2024, Family, Childhood%20Updated.pdf."
QMHC_Qld_Trauma_Strategy_FINAL.pdf,85,"influence of area disadvantage on Aboriginal of-government Trauma Strategy for Queensland, viewed and Torres Strait Islander young peoples’ suicide?’, 22 May 2024, https://6232990.fs1.hubspotusercontent- Australian and New Zealand Journal of Public Health, na1.net/hubfs/6232990/QMHC%20Trauma%20 vol. 45, no. 6, pp. 643-650, DOI:10.1111/1753-6405.13164. Strategy%20-%20Infant%20and%20Early%20 42 Australian Institute of Health and Welfare 2024, Family, Childhood%20Updated.pdf. domestic and sexual violence. FDSV summary. Canberra. 52 Choi, KR., Stewart, T., Fein, E., McCreary, M., Kenan, 43 Webster, K 2016, A preventable burden: Measuring KN., Davies, JD., Naureckas, S., & Zima, BT. 2020, ‘The and addressing the prevalence and health impacts of Impact of Attachment-Disrupting Adverse Childhood intimate partner violence in Australian women, Compass Experiences on Child Behavioral Health’, The Journal 07/2016, Australia’s National Research Organisation of Pediatrics, vol. 221, pp. 224–229, DOI:10.1016/j. for Women’s Safety (ANROWS), viewed 05 June 2024, jpeds.2020.03.006. https://anrows-2019.s3.ap-southeast-2.amazonaws. 53 Blake, J, Kato, A & Scott, J 2024, ‘Trauma in young com/wp-content/uploads/2019/01/19025309/28-10- people’, Consultation paper developed for the 16-BOD-Compass.pdf. Queensland Mental Health Commission, viewed 44 Australian Institute of Health and Welfare 2024, FDSV 3 May 2024, https://6232990.fs1.hubspotusercontent- summary, viewed 04 July 2024, https://www.aihw.gov. na1.net/hubfs/6232990/QMHC%20Discussion%20 au/family-domestic-and-sexual-violence/resources/ paper%20-%20Trauma%20in%20young%20people- fdsv-summary. plain-text-1.pdf. 45 Delap, N 2021, ‘Trauma-Informed Care of Perinatal 54 Youth Justice Reform Select Committee 2024, Interim Women]’ Abbott, L. (eds) 2021, Complex Social Issues Report: Inquiry into ongoing reforms to the youth and the Perinatal Woman, Springer Cham, DOI: justice system and support for victims of crime, viewed 10.1007/978-3-030-58085-8_2. 27 May 2024, https://documents.parliament.qld.gov. 46 PANDA 2023, Submission to the NSW Upper House au/tp/2024/5724T612-1B7E.pdf. Select Committee: Inquiry into Birth Trauma, viewed 55 Queensland Government (Queensland Treasury) 2021, 31 May 2024, https://www.parliament.nsw.gov.au/ Youth offending research brief, viewed 24 May 2024, lcdocs/submissions/80734/0241%20Perinatal%20 https://www.qgso.qld.gov.au/issues/10321/youth- Anxiety%20and%20Depression%20Australia%20 offending-april-2021-edn.pdf. (PANDA).pdf. 48 The Queensland Trauma Strategy 2024–2029 References 56 Crozier, T, Howard, A, Watson, L & Sadler, N 2024, 64 Nguyen, T 2023, Trauma in"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,86,"Birth Trauma, viewed 55 Queensland Government (Queensland Treasury) 2021, 31 May 2024, https://www.parliament.nsw.gov.au/ Youth offending research brief, viewed 24 May 2024, lcdocs/submissions/80734/0241%20Perinatal%20 https://www.qgso.qld.gov.au/issues/10321/youth- Anxiety%20and%20Depression%20Australia%20 offending-april-2021-edn.pdf. (PANDA).pdf. 48 The Queensland Trauma Strategy 2024–2029 References 56 Crozier, T, Howard, A, Watson, L & Sadler, N 2024, 64 Nguyen, T 2023, Trauma in the Australian LGBTQIA+ ‘The prevalence and impacts of trauma in adults’, Community, Centre for Clinical Psychology, viewed Consultation paper: development of whole-of- 31 May 2024, https://ccp.net.au/trauma-in-the- government Trauma Strategy for Queensland, viewed australian-lgbtqia-community/#:~:text=The%20 22 May 2024, https://6232990.fs1.hubspotusercontent- LGBTQIA%2B%20community%20in%20 na1.net/hubfs/6232990/Phoenix%20Australia%20 Australia,family%20and%20society%2C%20and%20 -%20QMHC%20paper%20prevalence%20and%20 violence. impact%20of%20trauma%20in%20adults_ 65 Skeffington, PM., Rees, CS., & Mazzucchelli, T. 2017, FINAL_070524.pdf. ‘Trauma exposure and post-traumatic stress disorder 57 Crozier, T, Howard, A, Watson, L & Sadler, N 2024, within fire and emergency services in Western Australia’, ‘The prevalence and impacts of trauma in adults’, Australian Journal of Psychology, vol. 69, no. 1, Consultation paper: development of whole-of- pp. 20-28, DOI:10.1111/ajpy.12120. government Trauma Strategy for Queensland, viewed 66 Royal Commission into Violence, Neglect and 22 May 2024, https://6232990.fs1.hubspotusercontent- Exploitation of People with Disability (DRC) 2023, na1.net/hubfs/6232990/Phoenix%20Australia%20 Final Report: Executive Summary, Our vision for -%20QMHC%20paper%20prevalence%20and%20 an inclusive Australia and Recommendations, impact%20of%20trauma%20in%20adults_ Australian Government, Canberra. FINAL_070524.pdf. 67 Blue Knot Foundation 2024, direct quote. 58 Phoenix Australia 2024, Most people will experience a traumatic event during their life, viewed 22 May 2024, 68 Lynch J 2020, A whole person approach to wellbeing: https://www.phoenixaustralia.org/your-recovery/. building sense of safety, Routledge, New York. 59 Mitchell, L 2024, ‘Trauma in an older adult context’, 69 Blue Knot n.d., Applying Trauma-Informed Principles Consultation paper developed for the Queensland to Conversations About Trauma, viewed 18 June 2024, Mental Health Commission, viewed 3 May 2024, https://blueknot.org.au/resources/blue-knot-fact- https://6232990.fs1.hubspotusercontent-na1.net/ sheets/talking-about-trauma/applying-trauma- hubfs/6232990/TraumaOlderAdults_finaldraft.pdf. informed-principles-to-conversations-about-trauma/. 60 Couzner, L, Spence, N, Fausto, K, Huo, Y, Vale, L, Elkins, 70 SAMHSA 2023, Practical Guide for Implementing"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,87,"Knot n.d., Applying Trauma-Informed Principles Consultation paper developed for the Queensland to Conversations About Trauma, viewed 18 June 2024, Mental Health Commission, viewed 3 May 2024, https://blueknot.org.au/resources/blue-knot-fact- https://6232990.fs1.hubspotusercontent-na1.net/ sheets/talking-about-trauma/applying-trauma- hubfs/6232990/TraumaOlderAdults_finaldraft.pdf. informed-principles-to-conversations-about-trauma/. 60 Couzner, L, Spence, N, Fausto, K, Huo, Y, Vale, L, Elkins, 70 SAMHSA 2023, Practical Guide for Implementing a S, Saltis, J & Cations, M 2022, ‘Delivering Trauma- Trauma-Informed Approach, viewed 18 June 2024, Informed Care in a Hospital Ward for Older Adults With https://store.samhsa.gov/sites/default/files/pep23- Dementia: An Illustrative Case Series’, in Frontiers in 06-05-005.pdf. Rehabilitation Sciences, vol. 3, article 934099, pp. 1-7, 71 Blue Knot n.d., Applying Trauma-Informed Principles DOI:10.3389/fresc.2022.934099. to Conversations About Trauma, viewed 18 June 2024, 61 Couzner, L, Spence, N, Fausto, K, Huo, Y, Vale, L, Elkins, https://blueknot.org.au/resources/blue-knot-fact- S, Saltis, J & Cations, M 2022, ‘Delivering Trauma- sheets/talking-about-trauma/applying-trauma- Informed Care in a Hospital Ward for Older Adults With informed-principles-to-conversations-about-trauma/. Dementia: An Illustrative Case Series’, in Frontiers in 72 Public Health Wales NHS Trust 2022, Trauma-Informed Rehabilitation Sciences, vol. 3, article 934099, pp. 1-7, Wales: A Societal Approach to Understanding, DOI:10.3389/fresc.2022.934099. Preventing and Supporting the Impacts of Trauma 62 De Maio, J., Gatina-Bhote, L., Rioseco, P., & Edwards, B. and Adversity, viewed 2 May 2024, https:// (Australian Institute of Family Studies) 2017, Risk traumaframeworkcymru.com/wp-content/ of psychological distress among recently arrived uploads/2022/07/Trauma-Informed-Wales-Framework. humanitarian migrants, viewed 2 May 2024, https:// pdf. aifs.gov.au/sites/default/files/publication-documents/ 73 Queensland Parliament (Mental Health Select bnla-researchsummary-mentalhealth-oct17_0.pdf. Committee), 2022, Inquiry into the opportunities to 63 Slewa-Younan, S, Uribe Guajardo, M G, Heriseanu, A, improve mental health outcomes for Queenslanders. & Hasan, T 2015, ‘A systematic review of post-traumatic Available online at https://documents.parliament.qld. stress disorder and depression amongst Iraqi refugees gov.au/tp/2022/5722T743-64F1.pdf. located in Western countries’, Journal of Immigrant and Minority Health, vol. 17, no. 4, pp. 1231-1239, DOI:10.1007/s10903-014-0046-3. The Queensland Trauma Strategy 2024–2029 49 References 74 Queensland"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,88,"outcomes for Queenslanders. & Hasan, T 2015, ‘A systematic review of post-traumatic Available online at https://documents.parliament.qld. stress disorder and depression amongst Iraqi refugees gov.au/tp/2022/5722T743-64F1.pdf. located in Western countries’, Journal of Immigrant and Minority Health, vol. 17, no. 4, pp. 1231-1239, DOI:10.1007/s10903-014-0046-3. The Queensland Trauma Strategy 2024–2029 49 References 74 Queensland Government (Queensland Mental Health 81 Morson, S & Hogan, M 2024, ‘The experience of trauma Commission) 2018, Changing attitudes, changing lives by Queensland children’ Consultation paper developed Options to reduce stigma and discrimination for people for the Queensland Mental Health Commission, viewed experiencing problematic alcohol and other drug use, 3 May 2024, https://6232990.fs1.hubspotusercontent- viewed 26 June 2024, https://www.qmhc.qld.gov.au/ na1.net/hubfs/6232990/Trauma%20Strategy%20 sites/default/files/downloads/changing_attitudes_ Consultation%20Papers/QMHC%20Trauma%20 changing_lives_options_to_reduce_stigma_and_ Strategy%20Consultation%20Paper_Children-1.pdf. discrimination_for_people_experiencing_problematic_ 82 Morson, S & Hogan, M 2024, ‘The experience of trauma alcohol_and_other_drug_use.pdf. by Queensland children’ Consultation paper developed 75 O, Bourne, A, McNair, R, Carman, M & Lyons, A 2020, for the Queensland Mental Health Commission, viewed Private Lives 3: The health and wellbeing of LGBTIQ 3 May 2024, https://6232990.fs1.hubspotusercontent- people in Australia, ARCSHS Monograph Series No. 122. na1.net/hubfs/6232990/Trauma%20Strategy%20 Melbourne, Australia: Australian Research Centre in Sex, Consultation%20Papers/QMHC%20Trauma%20 Health and Society, La Trobe University. Strategy%20Consultation%20Paper_Children-1.pdf. 76 Morson, S & Hogan, M 2024, ‘The experience of trauma 83 Morson, S & Hogan, M 2024, ‘The experience of trauma by Queensland children’ Consultation paper developed by Queensland children’ Consultation paper developed for the Queensland Mental Health Commission, viewed for the Queensland Mental Health Commission, viewed 3 May 2024, https://6232990.fs1.hubspotusercontent- 3 May 2024, https://6232990.fs1.hubspotusercontent- na1.net/hubfs/6232990/Trauma%20Strategy%20 na1.net/hubfs/6232990/Trauma%20Strategy%20 Consultation%20Papers/QMHC%20Trauma%20 Consultation%20Papers/QMHC%20Trauma%20 Strategy%20Consultation%20Paper_Children-1.pdf. Strategy%20Consultation%20Paper_Children-1.pdf. 77 Australian Government (Department of the Prime 84 Queensland Government (Queensland Family and Minister and Cabinet) 2023, A 10-year-plan to unleash Child Commission), 2024, Exiting youth detention: the full capacity and contribution of women to the preventing crime by improving post-release support, Australian economy 2023–2033, viewed 28 June 2024, viewed"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,89,"77 Australian Government (Department of the Prime 84 Queensland Government (Queensland Family and Minister and Cabinet) 2023, A 10-year-plan to unleash Child Commission), 2024, Exiting youth detention: the full capacity and contribution of women to the preventing crime by improving post-release support, Australian economy 2023–2033, viewed 28 June 2024, viewed 26 June 2024, https://www.qfcc.qld.gov.au/ https://www.pmc.gov.au/sites/default/files/resource/ sites/default/files/202406/Exiting%20youth%20 download/womens-economic-equality-taskforce-final- detention%20report%20June%202024.pdf. report.pdf. 85 ANROWS 2020, Constructions of complex trauma and 78 Australian Government (Department of Health) 2017, implications for women’s wellbeing and safety from My Life My Lead: Opportunities for strengthening violence, viewed 26 June 2024, https://www.anrows. approaches to the social determinants and org.au/project/constructions-of-complex-trauma-and- cultural determinants of Indigenous health: implications-for-womens-wellbeing-and-safety-from- Report on the national consultations, viewed violence/. 24 May 2024, http://www.health.gov.au/internet/ 86 Our Watch 2021, Change the Story: A shared framework main/publishing.nsf/Content/D2F6B905F3F 38 for the primary prevention of violence against women in 667DACA2580D400014BF1/$File/My%20Life%20 Australia, 2nd edn, viewed 26 June 2024, https://assets. My%20Lead%20Consult ation%20Report.pdf. ourwatch.org.au/assets/Key-frameworks/Change-the- 79 Rawlinson, C 2024, ‘Pregnancy and Early Parenting’, story-Our-Watch-AA.pdf. Consultation paper developed for the Queensland 87 Commonwealth of Australia (Department of Social Mental Health Commission, viewed 3 May 2024, Services), National Plan to End Violence against Women https://6232990.fs1.hubspotusercontent-na1.net/ and Children 2022–2032, Executive Summary, viewed hubfs/6232990/QMHC%20Trauma%20Strategy%20 26 June 2024, https://www.dss.gov.au/sites/default/ -%20Pregnancy%20and%20Early%20Parenting-1.pdf. files/documents/12_2023/national-plan-executive- 80 Rawlinson, C. 2024, ‘Pregnancy and Early Parenting’, summary.pdf. Consultation paper developed for the Queensland 88 Phoenix Australia National Centre of Excellence in Mental Health Commission, viewed 3 May 2024, Posttraumatic Mental Health 2023, The mental health https://6232990.fs1.hubspotusercontent-na1.net/ impacts of family violence, viewed 26 June 2024, hubfs/6232990/QMHC%20Trauma%20Strategy%20 https://www.phoenixaustralia.org/news/the-mental- -%20Pregnancy%20and%20Early%20Parenting-1.pdf. health-impacts-of-family-violence/. 50 The Queensland Trauma Strategy 2024–2029 References 89 Procter, N, Ferguson, M, Loughead, M & McIntyre, 100 World Health Organization 2022, Mental health, viewed H 2024, ‘Trauma-informed approaches to suicide 27 April 2023, https://www.who.int/news-room/ prevention’, Consultation paper developed for the fact-sheets/detail/mental-health-strengthening-our- Queensland Mental Health Commission, viewed 05 response."
QMHC_Qld_Trauma_Strategy_FINAL.pdf,90,"-%20Pregnancy%20and%20Early%20Parenting-1.pdf. health-impacts-of-family-violence/. 50 The Queensland Trauma Strategy 2024–2029 References 89 Procter, N, Ferguson, M, Loughead, M & McIntyre, 100 World Health Organization 2022, Mental health, viewed H 2024, ‘Trauma-informed approaches to suicide 27 April 2023, https://www.who.int/news-room/ prevention’, Consultation paper developed for the fact-sheets/detail/mental-health-strengthening-our- Queensland Mental Health Commission, viewed 05 response. July 2024,https://6232990.fs1.hubspotusercontent- 101 Queensland Alliance for Mental Health 2022, Wellbeing na1.net/hubfs/6232990/2024-04-16%20 First, Second edition, November 2022, viewed Evidence%20summary-%20Trauma%20informed%20 2 May 2024, https://www.qamh.org.au/wellbeing/ approaches%20to%20suicide%20prevention_.pdf. wellbeing-first/. 90 Healing Foundation 2024, Community Healing, 102 Australian Government (Productivity Commission) 2020, viewed 7 July 2024, https://healingfoundation.org.au/ Mental Health, Report no. 95, Australian Government, community-healing/. Canberra. Available online at https://www.pc.gov.au/ 91 Australian Institute of Health and Welfare 2024, inquiries/completed/mental-health#report. Determinants of health for First Nations people, 103 Reconciliation Australia 2024, What is reconciliation? viewed 7 July 2024, https://www.aihw.gov.au/reports/ viewed 27 May 2024, https://www.reconciliation.org. australias-health/social-determinants-and-indigenous- au/reconciliation/what-is-reconciliation/. health. 104 Australian Government (Australian Health Ministers’ 92 Australian Institute of Health and Welfare 2024, Contact Advisory Council) 2017, National Strategic Framework with the Criminal Justice System, viewed 18 June 2024, for Aboriginal and Torres Strait Islander Peoples’ Mental https://www.indigenoushpf.gov.au/measures/2-11- Health and Social and Emotional Wellbeing 2017–2023, contact-with-the-criminal-justice-system. Australian Government, Canberra. Available online at 93 Australian Government (Productivity Commission) 2020, https://www.niaa.gov.au/resource-centre/national- Mental Health, Report no. 95, Australian Government, strategic-framework-aboriginal-and-torres-strait- Canberra. Available online at https://www.pc.gov.au/ islander-peoples-mental. inquiries/completed/mental-health#report. 105 World Health Organization 2021, Health Promotion 94 Public Health Wales NHS Trust 2022, Trauma-Informed Glossary of Terms 2021, World Health Organisation, Wales: A Societal Approach to Understanding, Geneva. Available online at https://www.who.int/ Preventing and Supporting the Impacts of Trauma publications/i/item/9789240038349. and Adversity, viewed 27 May 2024, https:// 106 Blue Knot n.d., Applying Trauma-Informed Principles traumaframeworkcymru.com/wp-content/ to Conversations About Trauma, viewed 18 June 2024, uploads/2022/07/Trauma-Informed-Wales-Framework. https://blueknot.org.au/resources/blue-knot-fact- pdf. sheets/talking-about-trauma/applying-trauma- 95 Agency for Clinical Innovation n.d., Co-design toolkit, informed-principles-to-conversations-about-trauma/. NSW Government, viewed 26 June 2024, https://aci. 107"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,91,"Supporting the Impacts of Trauma publications/i/item/9789240038349. and Adversity, viewed 27 May 2024, https:// 106 Blue Knot n.d., Applying Trauma-Informed Principles traumaframeworkcymru.com/wp-content/ to Conversations About Trauma, viewed 18 June 2024, uploads/2022/07/Trauma-Informed-Wales-Framework. https://blueknot.org.au/resources/blue-knot-fact- pdf. sheets/talking-about-trauma/applying-trauma- 95 Agency for Clinical Innovation n.d., Co-design toolkit, informed-principles-to-conversations-about-trauma/. NSW Government, viewed 26 June 2024, https://aci. 107 SAMHSA 2023, Practical Guide for Implementing a health.nsw.gov.au/projects/co-design. Trauma-Informed Approach, viewed 18 June 2024, 96 Victorian Transcultural Mental Health 2021, An https://store.samhsa.gov/sites/default/files/pep23- Integrated Approach to Diversity Equity and Inclusion 06-05-005.pdf. in Mental Health Service Provision in Victoria: A Position 108 Blake, J, Kato, A & Scott, J 2024, ‘Whole-of-government Paper, Victorian Transcultural Mental Health, viewed trauma strategy’, Consultation paper developed for 28 June 2024, https://vtmh.org.au/wp-content/ the Queensland Mental Health Commission, viewed uploads/2021/10/VTMHPositionPaper2021_.pdf. 1 May 2024, https://6232990.fs1.hubspotusercontent- 97 Victorian Transcultural Mental Health 2021, An na1.net/hubfs/6232990/QMHC%20Discussion%20 Integrated Approach to Diversity Equity and Inclusion paper%20-%20Trauma%20Introduction-plain-text_ in Mental Health Service Provision in Victoria: A Position version2.pdf. Paper, Victorian Transcultural Mental Health, viewed 109 Blake, J, Kato, A & Scott, J 2024, ‘Whole-of-government 28 June 2024, https://vtmh.org.au/wp-content/ trauma strategy’, Consultation paper developed for uploads/2021/10/VTMHPositionPaper2021_.pdf. the Queensland Mental Health Commission, viewed 98 Australian Government (Productivity Commission) 2020, 1 May 2024, https://6232990.fs1.hubspotusercontent- Mental Health, Report no. 95, Australian Government, na1.net/hubfs/6232990/QMHC%20Discussion%20 Canberra. Available online at https://www.pc.gov.au/ paper%20-%20Trauma%20Introduction-plain-text_ inquiries/completed/mental-health#report. version2.pdf. 99 Goodwin, N 2016, ‘Understanding integrated care’, International Journal of Integrated Care, vol. 16, no. 4, article 6, pp. 4-6, DOI:10.5334/ijic.2530. The Queensland Trauma Strategy 2024–2029 51 References 110 de Boer, K, Arnold, C, Mackelprang, J & Nedeljovic, M 118 Atkinson, J 2024, ‘Prevalence and impacts of trauma in 2022, ‘Barriers and facilitators to treatment seeking First Nations communities in Queensland’ Consultation and engagement amongst women with complex trauma paper developed for the Queensland Mental Health histories’ in Health Soc Care Community, vol. 30, no. 6, Commission, viewed 1"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,92,"118 Atkinson, J 2024, ‘Prevalence and impacts of trauma in 2022, ‘Barriers and facilitators to treatment seeking First Nations communities in Queensland’ Consultation and engagement amongst women with complex trauma paper developed for the Queensland Mental Health histories’ in Health Soc Care Community, vol. 30, no. 6, Commission, viewed 1 May 2024, https://6232990. pp. 4303-4310. fs1.hubspotusercontent-na1.net/hubfs/6232990/ Trauma%20Strategy%20Consultation%20Papers/ 111 Australian Institute of Health and Welfare 2024, Family, Prevalence%20and%20Impacts%20of%20Trauma%20 domestic and sexual violence, viewed 6 June 2024, in%20First%20Nations%20Communities%20QLD.pdf. https://www.aihw.gov.au/family-domestic-and-sexual- violence/resources/fdsv-summary. 119 Queensland Government (former Department of Seniors, Disability Services and Aboriginal and Torres 112 State of Victoria 2021, Royal Commission into Victoria’s Strait Islander Partnerships) 2021, Treaty Advancement Mental Health System, viewed 2 May 2024, https:// Committee Report, viewed 3 May 2024, https://www. content.vic.gov.au/sites/default/files/2024-01/ dsdsatsip.qld.gov.au/resources/dsdsatsip/work/atsip/ RCVMHS_FinalReport_Vol1_Accessible.pdf. reform-tracks-treaty/path-treaty/treaty-advancement- 113 Felitti, VJ., Anda, RF., Nordenberg, D., et al. ‘Relationship committee-report.pdf. of childhood abuse and household dysfunction to many 120 Atkinson, J 2024, ‘Prevalence and impacts of trauma in of the leading causes of death in adults: The Adverse First Nations communities in Queensland’, Consultation Childhood Experiences (ACE) Study’, American Journal paper developed for the Queensland Mental Health of Preventive Medicine, vol. 14, no. 4, pp. 245-258, Commission, viewed 1 May 2024, https://6232990. DOI:10.1016/S0749-3797(98)00017-8. fs1.hubspotusercontent-na1.net/hubfs/6232990/ 114 Morson, S & Hogan, M 2024, ‘The experience of trauma Trauma%20Strategy%20Consultation%20Papers/ by Queensland children’, Consultation paper developed Prevalence%20and%20Impacts%20of%20Trauma%20 for the Queensland Mental Health Commission, viewed in%20First%20Nations%20Communities%20QLD.pdf. 2 May 2024, https://6232990.fs1.hubspotusercontent- 121 Kronick, R 2017, ‘Mental Health of Refugees and Asylum na1.net/hubfs/6232990/Trauma%20Strategy%20 Seekers: Assessment and Intervention’, Canadian Consultation%20Papers/QMHC%20Trauma%20 Journal of Psychiatry, vol. 63, no. 5, pp. 290-296, Strategy%20Consultation%20Paper_Children-1.pdf. DOI:10.1177/0706743717746665. 115 Hoehn, E & De Young, A 2024, ‘Infants and Young 122 Ranse, J & Jones, R 2024, ‘Disaster preparation, Children’, Consultation paper developed for the response, and recovery’, Consultation paper developed Queensland Mental Health Commission, viewed for the Queensland Mental"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,93,"Psychiatry, vol. 63, no. 5, pp. 290-296, Strategy%20Consultation%20Paper_Children-1.pdf. DOI:10.1177/0706743717746665. 115 Hoehn, E & De Young, A 2024, ‘Infants and Young 122 Ranse, J & Jones, R 2024, ‘Disaster preparation, Children’, Consultation paper developed for the response, and recovery’, Consultation paper developed Queensland Mental Health Commission, viewed for the Queensland Mental Health Commission, viewed 3 May 2024, https://6232990.fs1.hubspotusercontent- 1 May 2024, https://6232990.fs1.hubspotusercontent- na1.net/hubfs/6232990/QMHC%20Trauma%20 na1.net/hubfs/6232990/Disaster%20guidance%20 Strategy%20-%20Infant%20and%20Early%20 consultation%20paper.pdf. Childhood%20Updated.pdf. 123 Queensland Government (Queensland Reconstruction 116 Phoenix Australia Centre for Posttraumatic Mental Authority) 2024, Disaster Risk, viewed 18 June 2024, Health 2024, ‘Prevalence and impact of trauma in https://www.getready.qld.gov.au/understand-your- high-risk professions’, Consultation paper developed risk/disaster-risk#:~:text=Since%202011%2C%20 for the Queensland Mental Health Commission, viewed Queenslanders%20have%20faced,cyclones%2C%20 1 May 2024, https://6232990.fs1.hubspotusercontent- storm%20tides%20and%20floods. na1.net/hubfs/6232990/Trauma%20Strategy%20 Consultation%20Papers/QMHC%20Trauma%20 124 Blake, J, Kato, A & Scott, J 2024, ‘Whole-of-government Strategy%20Consultation%20Paper_High-risk%20 trauma strategy’, Consultation paper developed for professions.pdf. the Queensland Mental Health Commission, viewed 1 May 2024, https://6232990.fs1.hubspotusercontent- 117 Darwin L, Vervoort S, Vollert E & Blustein S, 2023, na1.net/hubfs/6232990/QMHC%20Discussion%20 Intergenerational trauma and mental health, paper%20-%20Trauma%20Introduction-plain-text_ Catalogue number IMH 18, Australian Institute version2.pdf. of Health and Welfare, Australian Government. 52 The Queensland Trauma Strategy 2024–2029 Need help? Thinking and reading about mental ill-health, problematic alcohol and other drug use, and suicide can be distressing. If you need help, please ask for the support you need. No one needs to face their problems alone. National 24/7 support services Lifeline 13 11 14 www.lifeline.org.au/gethelp Suicide Call Back Service 1300 659 467 www.suicidecallbackservice.org.au MensLine Australia 1300 789 978 www.mensline.org.au Beyond Blue Support Service 1300 224 636 www.beyondblue.org.au 13YARN 13 92 76 www.13yarn.org.au SANE Australia Helpline 1800 187 263 www.sane.org QLife (LGBTQIA+) 1800 184 527 www.qlife.org.au Kids Helpline 1800 551 800 www.kidshelpline.com.au Defence Family Helpline 1800 624 608 www.defence.gov.au/dco/defence-helpline.asp Alcohol and other drugs support services National Alcohol and Other Drug Hotline 1800 250 015 www.health.gov.au/contacts/national-alcohol- and-other-drug-hotline adis 1800"
QMHC_Qld_Trauma_Strategy_FINAL.pdf,94,"13YARN 13 92 76 www.13yarn.org.au SANE Australia Helpline 1800 187 263 www.sane.org QLife (LGBTQIA+) 1800 184 527 www.qlife.org.au Kids Helpline 1800 551 800 www.kidshelpline.com.au Defence Family Helpline 1800 624 608 www.defence.gov.au/dco/defence-helpline.asp Alcohol and other drugs support services National Alcohol and Other Drug Hotline 1800 250 015 www.health.gov.au/contacts/national-alcohol- and-other-drug-hotline adis 1800 177 833 www.adis.health.qld.gov.au Family Drug Support 1300 368 186 www.fds.org.au Post suicide bereavement support services StandBy Response Service 1300 727 247 www.standbysupport.com.au Thirrili Postvention Suicide Support 1800 805 801 www.thirrili.com.au/find-support Telephone Interpreter Service If you require translation support, please ask the telephone support service to use the Translating and Interpreting Service by phoning 1800 131 450. Hearing impaired callers Dial 106 by TTY or in an emergency use National Relay Services TTY number 1800 555 677."
State-school-exclusions.pdf,0,"State school exclusions Please note: the information in this sheet applies to state schools only. If you are attending a private school, the school will have its own processes for exclusion and you should ask for a copy of these. When can I be excluded? You can be excluded from school for:1 • persistent disobedience (repeatedly not doing what the teacher or principal asks you to do) • misbehaviour • conduct, even things done outside of school, that adversely affects other students or that is harmful to the proper running of the school such as being disruptive in class, damaging school property, fighting in the playground or possessing or dealing in drugs in or outside of school • being a risk to the safety or wellbeing of other students or staff. AND • your behaviour is so serious that being suspended is not enough. You can also be excluded if you are convicted of an offence. It doesn’t matter if the offence has nothing to do with the school or if it happened outside of school hours or even if it did not happen in Queensland and would not be in the best interests of other students and staff for you to be enrolled at the school.2 Usually principals will make the decision to exclude. If the principal thinks someone else needs to make the decision, then they can ask the head of Education Queensland, the Chief Executive, to consider excluding you.3 Exclusion is a last resort and should only be used where other ways to try and address your behaviour have failed. If you are charged with a very serious offence, you may be suspended or excluded as the first option because, for example, they think you may be a risk to other students or staff. 1 Education (General"
State-school-exclusions.pdf,1,"be used where other ways to try and address your behaviour have failed. If you are charged with a very serious offence, you may be suspended or excluded as the first option because, for example, they think you may be a risk to other students or staff. 1 Education (General Provisions) Act 2006 (Qld) s 292(1), (3). 2 Education (General Provisions) Act 2006 (Qld) s 292(2). 3 Education (General Provisions) Act 2006 (Qld) s 297. Reviewed 06/08/2025 This sheet is intended to provide general legal information about the law in Queensland. This information is not legal advice. If you have a particular legal problem you should contact a solicitor for legal advice. At the end is a list of agencies that might be able to assist you, including legal agencies. State school exclusions What happens if the Principal or the Chief Executive wants to exclude me? You cannot be excluded without written notice. You must first be given a written notice (Proposed Exclusion Notice) telling you that they intend to exclude you. This is usually a letter from the school,4 but the letter could come from the Chief Executive.5 If you have not already been suspended the notice will also say that you are suspended until a decision is made whether to exclude you or not. A principal can only exclude you from their school.6 A principal can exclude you for either up to 1 year or permanently.7 The Chief Executive can exclude you from all state schools or specific state schools for up to 1 year or permanently.8 You cannot be excluded for longer than the period set out in the written notice/letter. Once you have been given the Proposed Exclusion Notice, if you haven’t already been suspended, you will be immediately suspended.9 The suspension lasts until a final"
State-school-exclusions.pdf,2,"state schools for up to 1 year or permanently.8 You cannot be excluded for longer than the period set out in the written notice/letter. Once you have been given the Proposed Exclusion Notice, if you haven’t already been suspended, you will be immediately suspended.9 The suspension lasts until a final decision of the proposed exclusion is made. Do I have to do school work while I am suspended while an exclusion decision is made? The Principal or Chief Executive must arrange for you to be able to access an educational program so you can continue with your education during the suspension.10 You will be assigned a Regional Case Manager who will support you to engage in another education or training program. What happens next? If you have been given a Proposed Exclusion Notice threatening to exclude you from your school, the person sending the notice has up to 20 days to make a decision about excluding you from that school.11 If the Chief Executive is considering excluding you from all state schools or specified state schools they have 30 days from when they send the Proposed Exclusion Notice to you to make a decision.12 The principal or Chief Executive must consider your reasons properly before making a final decision. If you want help to write a letter it is best to seek advice as soon as you get the Proposed Exclusion Notice. 4 Education (General Provisions) Act 2006 (Qld) s 293(2). 5 Education (General Provisions) Act 2006 (Qld) s 300(2). 6 Education (General Provisions) Act 2006 (Qld) s 291(1). 7 Education (General Provisions) Act 2006 (Qld) s 295(3). 8 Education (General Provisions) Act 2006 (Qld) s 302(3). 9 Education (General Provisions) Act 2006 (Qld) ss 293 (Principal), 300 (Chief Executive). 10 Education (General Provisions) Act 2006 (Qld) ss 294 (Principal),"
State-school-exclusions.pdf,3,"6 Education (General Provisions) Act 2006 (Qld) s 291(1). 7 Education (General Provisions) Act 2006 (Qld) s 295(3). 8 Education (General Provisions) Act 2006 (Qld) s 302(3). 9 Education (General Provisions) Act 2006 (Qld) ss 293 (Principal), 300 (Chief Executive). 10 Education (General Provisions) Act 2006 (Qld) ss 294 (Principal), 301 (Chief Executive). 11 Education (General Provisions) Act 2006 (Qld) s 295(1). 12 Education (General Provisions) Act 2006 (Qld) s 302. State school exclusions Do I have to put my reasons in writing? Usually your reasons need to be in writing. You can see if someone (like the guidance officer, or one of the agencies under ‘Who can I contact for support?’ below) can meet with you so you can explain why you shouldn’t be excluded. The guidance officer may help you write up the list of reasons you shouldn’t be excluded. If you do not agree with what has been written down DO NOT sign it. You should ask the guidance officer to change anything you don’t agree with before you sign it. Can I have more time to write my reasons for not being excluded? You can ask for more time to prepare your letter. You will only be given more time if you have good reasons. If they decide to give you more time it will usually only be a few days. What if the decision is not to exclude me? If the principal or Chief Executive decides not to exclude you, they must tell you this as soon as they can and advise you that your suspension is over and you can come back to school.13 You will be sent a letter which tells you this and the reasons for it.14 You may be put on a behaviour plan which you should follow or you will"
State-school-exclusions.pdf,4,"as soon as they can and advise you that your suspension is over and you can come back to school.13 You will be sent a letter which tells you this and the reasons for it.14 You may be put on a behaviour plan which you should follow or you will risk further suspensions and possible exclusion. Returning to school If you are not excluded or your exclusion was not permanent, the principal may meet with you (and your parents) to talk about a plan for when you return to school. If you were already on a behaviour plan you will need to do what is in the plan when you return to school. What if the Principal or Chief Executive decides to exclude me? If you are excluded from a school you can ask the Chief Executive to review the decision. You must do this in writing. You have 30 days to make the submission starting from when you were given the written notice of your exclusion.15 You must clearly set out the reasons why you say the decision is wrong and any other information that supports your side of the story. Also look at the procedures about exclusion set out in the “Student Discipline Procedure” document on Education Queensland’s website at https://ppr.qed.qld.gov.au/attachment/student-discipline-procedure.pdf to see if the principal or Chief Executive has followed them. If the principal or Chief Executive have not followed those procedures you should include that information in the letter. Contact one of the agencies under ‘Who can I contact for support?’ below if you want help with the letter. You can also make an application to the Supreme Court for Judicial Review but you should talk to a lawyer if you are considering this. 13 Education (General Provisions) Act 2006 (Qld) ss 295(2)(a) (Principal), 302(2)(a) (Chief"
State-school-exclusions.pdf,5,"can I contact for support?’ below if you want help with the letter. You can also make an application to the Supreme Court for Judicial Review but you should talk to a lawyer if you are considering this. 13 Education (General Provisions) Act 2006 (Qld) ss 295(2)(a) (Principal), 302(2)(a) (Chief Executive). 14 Education (General Provisions) Act 2006 (Qld) ss 295(2)(b) (Principal), 302(2)(b) (Chief Executive). 15 Education (General Provisions) Act 2006 (Qld) s 312(2). State school exclusions What can the Chief Executive do? The Chief Executive can:16 • confirm you are excluded • exclude you but make different decisions about how long you are excluded for OR where you are excluded from • cancel/set aside the decision (which means you are not excluded) and possibly make a different decision (such as suspend rather than exclude you).17 Once the Chief Executive makes a decision they must tell you as soon as they can. Within 7 days of telling you, they must also give you a written notice including the reasons for their decision. If you are allowed back at school, they will arrange for you to return to school. This can include an interview with the principal and your parents. What if I disagree with the decision of the Chief Executive? If the Chief Executive excludes you from one or some specific state schools (whether permanently of not) you can ask the Chief Executive to review that decision (consider everything everyone concerned has to say and to make a decision). You have 30 days to ask for the review18 and then the Chief Executive has 40 days from when they receive your letter to make a decision.19 While you are waiting you may be able to enrol in the School of Distance Education. If the Chief Executive excludes you from all state"
State-school-exclusions.pdf,6,"30 days to ask for the review18 and then the Chief Executive has 40 days from when they receive your letter to make a decision.19 While you are waiting you may be able to enrol in the School of Distance Education. If the Chief Executive excludes you from all state schools (whether permanently or not) you can apply to QCAT to have the decision reviewed.20 If the Chief Executive excludes you from one or some particular state schools (whether permanently or not) you can make an application to the Supreme Court for Judicial Review but you should talk to a lawyer if you are considering this. How does QCAT work? QCAT’s job is to review decisions made by government departments like the Department of Education. QCAT can review the decision by the Chief Executive to exclude you. You have 28 days after you get the notice telling you that you’re excluded to apply to QCAT for them to look at your case again.21 You will need to use QCAT Form 23 which you can find on the QCAT website www.qcat.qld.gov.au or by calling the number below. For help with filling out the form contact one of the people below. Once you send the form to QCAT they will send you a letter to let you know what is happening. QCAT might decide to contact Education Queensland to invite them to have another look at the decision to exclude you. Contact a lawyer who can help you with this review to QCAT. 16 Education (General Provisions) Act 2006 (Qld) s 313(1). 17 Education (General Provisions) Act 2006 (Qld) s 313(2). 18 Education (General Provisions) Act 2006 (Qld) s 312(2). 19 Education (General Provisions) Act 2006 (Qld) s 313(1). 20 Education (General Provisions) Act 2006 (Qld) ss 401, 402. 21 Queensland Civil"
State-school-exclusions.pdf,7,"QCAT. 16 Education (General Provisions) Act 2006 (Qld) s 313(1). 17 Education (General Provisions) Act 2006 (Qld) s 313(2). 18 Education (General Provisions) Act 2006 (Qld) s 312(2). 19 Education (General Provisions) Act 2006 (Qld) s 313(1). 20 Education (General Provisions) Act 2006 (Qld) ss 401, 402. 21 Queensland Civil and Administrative Tribunal Act 2009 (Qld) s 33(3). State school exclusions What do I have to do if I am not going to school? If you are excluded from all state schools, the Chief Executive has to arrange for you to have access to an educational program.22 This is usually called an ‘alternate education program’. What else can I do? You could contact the Queensland Ombudsman. It is their job to investigate complaints about Queensland Government Departments like Education Queensland. The Ombudsman may make recommendations to Education Queensland after their investigation of your complaint. If you are permanently excluded from school you can also write to the Chief Executive each year up until you turn 24 asking for the decision to be revoked.23 You may be able to go back to school if you are able to show that your behaviour has improved or you are no longer a risk to school staff or students. The Chief Executive has forty (40) days to consider your submission and tell you the decision.24 22 Education (General Provisions) Act 2006 (Qld) s 304. 23 Education (General Provisions) Act 2006 (Qld) s 315. 24 Education (General Provisions) Act 2006 (Qld) s 315(4). State school exclusions Who can I contact for support Youth Advocacy Centre (YAC) www.yac.net.au 3356 1002 Aboriginal & Torres Strait Islander Legal Service (24hrs 7 days a week) www.atsils.org.au 3025 3888 or (free call) 1800 012 255 Logan Youth & Family Legal Service www.yfs.org.au 3826 1500 Legal Aid Queensland www.legalaid.qld.gov.au 1300 651"
State-school-exclusions.pdf,8,exclusions Who can I contact for support Youth Advocacy Centre (YAC) www.yac.net.au 3356 1002 Aboriginal & Torres Strait Islander Legal Service (24hrs 7 days a week) www.atsils.org.au 3025 3888 or (free call) 1800 012 255 Logan Youth & Family Legal Service www.yfs.org.au 3826 1500 Legal Aid Queensland www.legalaid.qld.gov.au 1300 651 188 Hub Community Legal www.hubcommunity.org.au 3372 7677 Youth Legal Advice Hotline (Monday – Thursday 8am – 9pm; Friday 8am – Sunday 5pm) 1800 527 527 Community Legal Centres (CLCs) see www.naclc.org.au for your nearest CLC About the Youth Advocacy Centre The Youth Advocacy Centre offers free and confidential legal and social support services for young people in Queensland. www.yac.net.au (07) 3356 1002
Family.pdf,0,"Family What are my parents' responsibilities? It is expected that your parents will care for you until you reach 18. Your parents are able to make decisions for you BUT as you get older, you have the right to have a say in decisions about you and their role should become more about giving advice. The law says that when you are under 16 your parents or carer must: • provide you with food, clothing, and shelter • protect you from risk to your personal safety and health • ensure you go to school • ensure you are not left unsupervised for an unreasonable length of time if you are under 12.1 If your parents do not look after you properly and Child Safety Services believes you are at risk of harm, then they may ask a court to grant a Child Protection Order.2 If the court does this then Child Safety Services can become your carer or guardian. Parents can discipline you, but they could be charged by the police if they go too far; for example, if they hit you anywhere hard enough to leave bruises or if they hit you anywhere on the head.3 Also if discipline causes injuries or psychological damage then Child Safety Services may also want to apply for a Child Protection Order.4 Who is my legal guardian? Your birth parents are usually your legal guardians until you reach 18,5even if you leave home, unless: • there is a Family Court Order about who is your legal guardian • you have a Child Protection Order (then your parents or Child Safety Services may be your legal guardian) • you are adopted (then your adoptive parents are your legal guardians) • your birth father is not named on your birth certificate and there is no"
Family.pdf,1,"is your legal guardian • you have a Child Protection Order (then your parents or Child Safety Services may be your legal guardian) • you are adopted (then your adoptive parents are your legal guardians) • your birth father is not named on your birth certificate and there is no other court order, then only your mother is your legal guardian.6 1 Criminal Code Act 1899 (Qld) s 286(1), ss 364-364A; Education (General Provisions) 2006 (Qld) s 239(1). 2 Child Protection Act 1999 (Qld) ss 10, 54. 3 Criminal Code Act 1899 (Qld) ss 280, 283. 4 Child Protection Act 1999 (Qld) ss 10, 54. 5 Family Law Act 1975 (Cth) s 61C. 6 Child Protection Act 1999 (Qld) s 61, Adoption Act 2009 (Qld) s 4,12 & 13, Births Deaths and Marriages Registration Act 2003 (Qld) s 10. Reviewed 12/08/2025 This sheet is intended to provide general legal information about the law in Queensland. This information is not legal advice. If you have a particular legal problem you should contact a solicitor for legal advice. At the end is a list of agencies that might be able to assist you, including legal agencies. Family What if my parents split up? If your parents separate, they may come to an agreement about where you will live and who you will spend time with as well as other specific issues, such as: • who is responsible for your day-to-day care or your long-term welfare and development • where you will go to school • who will be your doctor. They can do this by a written agreement (a Parenting Plan or Consent Order).7Consent Orders need to be approved by the Federal Circuit and Family Court of Australia and can be enforced by the law.8 If your parents cannot agree then the"
Family.pdf,2,"to school • who will be your doctor. They can do this by a written agreement (a Parenting Plan or Consent Order).7Consent Orders need to be approved by the Federal Circuit and Family Court of Australia and can be enforced by the law.8 If your parents cannot agree then the court will have to decide these things and make a Parenting Order.9 The court will consider what you want to happen and look at what is best for you. Sometimes this may be done through a solicitor called an Independent Children’s Lawyer. Independent Children’s Lawyers are appointed by the court. Their role is to tell the court your wishes and also to tell the court what they think is best for you after collecting information about your situation from a variety of people. Who pays maintenance if my parents split up? If your parents are separated, maintenance is now generally done through the Child Support Agency.10 The money is paid to the parent or adult with whom you are living.11 It is not possible for you to claim maintenance from the Child Support Agency. If you have issues about claiming money to support yourself from a parent where your parents have separated, you may be able to go to court. See a lawyer for advice. Can my parents cut me out of their will? You have the right (no matter what your age) to apply to a court for money out of your deceased parent's estate. You can exercise this right if your parent has not left you anything or has not organised things so that there is enough money for your general living expenses. If you previously relied on them for this and if the court is convinced that you continue to require this financial support, you should apply"
Family.pdf,3,"right if your parent has not left you anything or has not organised things so that there is enough money for your general living expenses. If you previously relied on them for this and if the court is convinced that you continue to require this financial support, you should apply to the court within nine months of your parent's death. See a lawyer for advice. Can my parents spend money left to me in a will? Until you are 18 years of age you are not able to make decisions about anything left to you in a will. Usually, your parents are given the job of looking after this property until you are 18 years old. It is not your parents' property to use as they want. It must be used for your benefit. 7 Family Law Act 1975 (Cth) ss 63A-63C, 64C. 8 Family Law Act 1975 (Cth) Part VII. 9 Family Law Act 1975 (Cth) ss 65A-65B. 10 Child Support (Assessment) Act 1989 (Cth) ss 2-3, 19-21. 11 Child Support (Assessment) Act 1989 (Cth) s 7B. Family If you are having hassles about what your parents are doing you should contact a lawyer. They may be able to investigate what is happening for you. It is also possible to ask the Supreme Court to make an Order that someone else look after your property. You should get legal help to do this. Adopted If you are under 18, you can apply for your birth parents’ names, date of birth and last known address along with what your name was before you were adopted. To get this information you will need both your adoptive parents and birth parents to say that it’s ok.12 If you were adopted when you were a child and you are now over 18, then"
Family.pdf,4,"birth and last known address along with what your name was before you were adopted. To get this information you will need both your adoptive parents and birth parents to say that it’s ok.12 If you were adopted when you were a child and you are now over 18, then you can apply to the Department of Families, Seniors, Disability Services and Child Safety to find out the identity of your birth parent(s). You can get details about your birth parents including full names and dates of birth. You will only get their addresses if your birth parents say this is ok. You can then contact your birth parents. Remember you can get into trouble if you harass, annoy or threaten them. To get this information contact the state government adoption services in the Department of Families, Seniors, Disability Services and Child Safety. If your birth parent has said they do not want their details to be given out to you and do not want any contact with you, you will not get the information you asked for. If they are prepared to have the details given to you but do not want to be contacted, then you will get the information you wanted.13 When can I change my name? You may use any name you wish as long as you don't intend to defraud anyone (e.g. try to get more money from Centrelink). If you are under 18, you should get your parents’ agreement. It is not necessary to register your change of name with the Registry of Births, Deaths, and Marriages. It is enough just to use the new name. However, this does not change your legal name. This means the Australian Passport Office, Queensland Transport and other government departments will want evidence of your change of name"
Family.pdf,5,"register your change of name with the Registry of Births, Deaths, and Marriages. It is enough just to use the new name. However, this does not change your legal name. This means the Australian Passport Office, Queensland Transport and other government departments will want evidence of your change of name with the Registry of Births, Deaths and Marriages explaining why your name is different to that on your birth certificate. If you are under 12 your parents can change your name without your consent. If you are aged 12 to 17, your parent(s) must have your consent to officially register you under a different name. If you are under 18 you can usually only change your first name once before you turn 18 but your second name can be changed once every 12 months or more often if there is a real need to change. Once you turn 18 you may apply to register a new name. There are different rules if you are born overseas, and you should talk to a lawyer about that. 12 Adoption Act 2009 (Qld) ss 256. 13 Adoption Act 2009 (Qld) ss 269, 271. Family Who can I contact for support Youth Advocacy Centre (YAC) www.yac.net.au 3356 1002 Aboriginal & Torres Strait Islander Legal Service (24hrs 7 days a week) www.atsils.org.au 3025 3888 or (free call) 1800 012 255 Logan Youth & Family Legal Service www.yfs.org.au 3826 1500 Legal Aid Queensland www.legalaid.qld.gov.au 1300 651 188 Hub Community Legal www.hubcommunity.org.au 3372 7677 Youth Legal Advice Hotline (Monday – Thursday 8am – 9pm; Friday 8am – Sunday 5pm) 1800 527 527 Community Legal Centres (CLCs) see www.naclc.org.au for your nearest CLC About the Youth Advocacy Centre The Youth Advocacy Centre offers free and confidential legal and social support services for young people in Queensland. www.yac.net.au (07)"
Family.pdf,6,Hotline (Monday – Thursday 8am – 9pm; Friday 8am – Sunday 5pm) 1800 527 527 Community Legal Centres (CLCs) see www.naclc.org.au for your nearest CLC About the Youth Advocacy Centre The Youth Advocacy Centre offers free and confidential legal and social support services for young people in Queensland. www.yac.net.au (07) 3356 1002
Bail and Bail with conditions _ Department of Youth Justice and Victim Support.pdf,0,"26/08/2025, 15:31 Bail and Bail with conditions | Department of Youth Justice and Victim Support Department of Youth Justice and Victim Support Sentencing young offenders (https://www.youthjustice.qld.gov.au/parents-carers/youth-justice- system/sentencing-young-offenders) >> Bail and Bail with conditions Bail and Bail with conditions A young person may ask for bail if they go to court for an offence. If a young person is granted bail, they will be released into the community straight away. They will have to sign a document to say that they will come back to court when they are told to. Sometimes a young person’s bail will have conditions such as: a curfew reporting to their local police station on a regular basis taking part in our conditional bail program. Conditional bail program Our conditional bail program helps a young person to comply with their bail conditions until their next court date. As part of the program, we will give a young person help and support to reduce their risk of offending or breaching their bail conditions. We do this by getting a young person to take part in positive activities and helping them to access services and develop skills. Who is it for A conditional bail program is for young offenders who the court thinks are at risk of not following their bail conditions. If the court does not give a young person a conditional bail program, they might be put in detention while they are on remand. A young person may get a conditional bail program if they: https://www.youthjustice.qld.gov.au/parents-carers/youth-justice-system/sentencing-young-offenders/bail-and-bail-with-conditions 1/4 26/08/2025, 15:31 Bail and Bail with conditions | Department of Youth Justice and Victim Support have been refused watch-house bail and had their bail refused at their first court appearance have a history of failing to appear or not doing what their bail conditions say are in breach of"
Bail and Bail with conditions _ Department of Youth Justice and Victim Support.pdf,1,"1/4 26/08/2025, 15:31 Bail and Bail with conditions | Department of Youth Justice and Victim Support have been refused watch-house bail and had their bail refused at their first court appearance have a history of failing to appear or not doing what their bail conditions say are in breach of a community based order are at risk of being placed in custody while a pre-sentence report is prepared. How to get one A young person’s legal representative will make an application for bail for the young person. They will ask us to suggest a suitable program to the court. Our youth justice officers will talk to you and the young person to develop the conditional bail program. We will then give it to the court to consider. If the court grants bail with a condition that the young person participates in a conditional bail program, a young person will go to their local youth justice centre (https://www.qld.gov.au/law/sentencing-prisons-and-probation/young-offenders-and-the- justice-system/youth-justice-in-queensland/youth-justice-centre-locations)to meet with youth justice officers and discuss the days, times and details of their program. What is involved A conditional bail program can give a young person help and support from a youth justice officer for up to 32 hours per week. The youth worker will help a young person develop skills and access services that will help them in the future, including: TAFE or other education apprenticeships, traineeships or work skills programs cultural development programs sporting and recreational programs health services life skills and social skills programs community supports. https://www.youthjustice.qld.gov.au/parents-carers/youth-justice-system/sentencing-young-offenders/bail-and-bail-with-conditions 2/4 26/08/2025, 15:31 Bail and Bail with conditions | Department of Youth Justice and Victim Support Rules It is important that a young person understands that the program is a condition of their bail. A young person must agree to participate and follow the lawful instructions of a youth justice officer."
Bail and Bail with conditions _ Department of Youth Justice and Victim Support.pdf,2,"26/08/2025, 15:31 Bail and Bail with conditions | Department of Youth Justice and Victim Support Rules It is important that a young person understands that the program is a condition of their bail. A young person must agree to participate and follow the lawful instructions of a youth justice officer. If a young person does not do what the bail conditions say, they could be arrested by police and taken back to court. If a young person does not participate as required, they may be in breach of their bail and have to go back to court. The court may decide to place a young person in custody until their next court date. Committing an offence on bail It is important that a young person does not offend while on bail. If a young person is on bail and they commit another offence there are consequences. This can also influence the court when it decides whether it's best to: grant further bail for the young person; or remand them in custody in a detention centre to stop them from committing other offences. Sentencing young offenders (https://www.youthjustice.qld.gov.au/parents- carers/youth-justice-system/sentencing-young- offenders) Pre-sentence report (https://www.youthjustice.qld.gov.au/parents-carers/youth- justice-system/sentencing-young-offenders/pre-sentence-report) Youth court orders (https://www.youthjustice.qld.gov.au/parents-carers/youth- justice-system/sentencing-young-offenders/youth-court-orders) Bail and Bail with conditions (https://www.youthjustice.qld.gov.au/parents- carers/youth-justice-system/sentencing-young-offenders/bail-and-bail-with- conditions) https://www.youthjustice.qld.gov.au/parents-carers/youth-justice-system/sentencing-young-offenders/bail-and-bail-with-conditions 3/4 26/08/2025, 15:31 Bail and Bail with conditions | Department of Youth Justice and Victim Support Last reviewed: 28 November 2024 Last modified: 28 November 2024  Provide feedback (https://www.families.qld.gov.au/feedback?id=34844) This work is licensed under a Creative Commons Attribution 4.0 International (CC BY 4.0) licence (https://creativecommons.org/licenses/by/4.0/) https://www.youthjustice.qld.gov.au/parents-carers/youth-justice-system/sentencing-young-offenders/bail-and-bail-with-conditions 4/4"
Bail and Bail with conditions _ Department of Youth Justice and Victim Support.pdf,3,licence (https://creativecommons.org/licenses/by/4.0/) https://www.youthjustice.qld.gov.au/parents-carers/youth-justice-system/sentencing-young-offenders/bail-and-bail-with-conditions 4/4
Getting-my-stuff-back-Updated-November-2023-WM1.pdf,0,"GETTING MY STUFF BACK This sheet is intended to provide general legal information about the law in Queensland. This information is not legal advice. If you have a particular legal problem you should contact a solicitor for legal advice. At the end is a list of agencies that might be able to assist you, including legal agencies. Sometimes when you leave where you are staying, you might have to leave some things behind. Here are some ways to try to get those things back. Make a list Start by making a list of everything that’s yours that you want back. E.g. your phone, clothes, shoes, DVDs, CDs, books - anything you might have bought for yourself or that was given to you. When you are making this list you should keep a couple of things in mind. Does the thing belong to me or to someone else? One way to figure this out is based on who paid for it. If you paid for it, it’s yours but it will help if you have receipts or can show in your banking records that you paid for it. If someone else paid for it but it was a gift, for example a Christmas or birthday present, you may have a right to it. Sometimes if you attach something permanently to the property you will lose ownership of it. Examples of this may include putting up shelves, installing air conditioning systems or toilets. Ask a lawyer if you are not sure if you own an item of property. If you leave a place owing rent it is an offence for the owner of the house to sell your property to cover the rent debt. Is it worth it? IsU the thinNg you wDant baEck worRth argui ng Rabout? EYou mVight asIk yEourselfW"
Getting-my-stuff-back-Updated-November-2023-WM1.pdf,1,"you own an item of property. If you leave a place owing rent it is an offence for the owner of the house to sell your property to cover the rent debt. Is it worth it? IsU the thinNg you wDant baEck worRth argui ng Rabout? EYou mVight asIk yEourselfW questions like: • Is it something that is really important to me? • Is it something that is worth a lot of money? • Could I get another one if I need to? For example, you might decide that you don’t really need your football but your warm clothes or shoes are really important. Once you have made a list, it might be worth talking to a youth worker to get some advice about the things you have decided to include or not include in your list. What is against the law when I try to get my stuff back? You can try to get your things back yourself but you should know that the following things are against the law: • Trespass - If you no longer live at the address and you have not been given permission to enter the house you could be trespassing by going into the house. • Breaking and Entering – if you break into a house and then take something which might not actually be yours, you could be charged for Breaking and Entering as well as Stealing. • Burglary – if you enter the house planning on committing an offence such as stealing or you commit an offence in the dwelling you could be charged with Burglary. • Wilful Damage - if you do damage to someone’s property while trying to get your property back you could be charged with Wilful Damage. • Assault – getting into a fight over the things"
Getting-my-stuff-back-Updated-November-2023-WM1.pdf,2,"stealing or you commit an offence in the dwelling you could be charged with Burglary. • Wilful Damage - if you do damage to someone’s property while trying to get your property back you could be charged with Wilful Damage. • Assault – getting into a fight over the things - remember assault can be as simple as touching someone without their permission. Try talking to whoever has your stuff calmly about the things that you want. It might help to have a trusted adult to support you during this talk. See if they will agree on a time to go to collect your belongings or if they will drop it somewhere safe for you to pick up. © Youth Advocacy Centre Inc 1 More options If it is not possible to get your things back yourself or to talk to the person without the risk of getting into trouble or because there is a risk to your safety, you still have options. Can I call the Police? If you think that someone is holding your property without your permission you can contact the police. If the police think someone is breaking the law they may get your stuff and charge the person. When the police are trying to decide if someone has your stuff illegally, they may want some proof to show that you own the property like receipts or bank records. You can also tell them how, when and where you got the thing to help the police understand it is yours. If the police think they do not have enough evidence to charge the person, you can still ask the police to come with you to get your things. The police may try to help make sure things don’t get out of hand but they cannot force"
Getting-my-stuff-back-Updated-November-2023-WM1.pdf,3,"understand it is yours. If the police think they do not have enough evidence to charge the person, you can still ask the police to come with you to get your things. The police may try to help make sure things don’t get out of hand but they cannot force the person to give your things back. Can I get legal advice? You can seek legal advice and ask a lawyer to write a letter of demand to the person who has your stuff asking them to give your things back within a period of time and advising them that if they don’t that you will go to court. What about going to court? You can go to court to get a judge to make an Order to the person to return your property, but it is best to get legal advice first before going to court. If you are under 18 you cannot make a claim against someone else without a litigation guardian. This is an adult who agrees to pay court costs if you are ordered to pay costs and whose name will be on the court documents. Usually, a parent would be the litigation guardian but this won’t be possible if you are claiming against your parents. Who can help? Youth Advocacy Centre (YAC) www.yac.net.au ...................................................................... 3356 1002 UNDER REVIEW Logan Youth & Family Legal Service www.yfs.org.au .............................................................. 3826 1500 Legal Aid Queensland www.legalaid.qld.gov.au ....................................................................... 1300 651 188 Youth Legal Advice Hotline ................................................................................................................. 1800 527 527 (Monday - Thursday 8am – 9pm; Friday 8am – Sunday 5pm) Aboriginal & Torres Strait Islander Legal Service www.atsils.org.au ........................................ 3025 3888 or 1800 012 255 (free call) 24hrs 7 days a week) Women’s Legal Service ............................................................................................................ 3392 0644 or 1800 957 957 (free call) Youth Service in your area www.mycommunitydirectory.com.au"
Getting-my-stuff-back-Updated-November-2023-WM1.pdf,4,- Thursday 8am – 9pm; Friday 8am – Sunday 5pm) Aboriginal & Torres Strait Islander Legal Service www.atsils.org.au ........................................ 3025 3888 or 1800 012 255 (free call) 24hrs 7 days a week) Women’s Legal Service ............................................................................................................ 3392 0644 or 1800 957 957 (free call) Youth Service in your area www.mycommunitydirectory.com.au Community Legal Centres (CLCs) see www.naclc.org.au for your nearest CLC This sheet was last reviewed and updated in November 2023. The Youth Advocacy Centre does not accept responsibility for any action or outcome as a result of anyone relying on the information provided. © Youth Advocacy Centre Inc 2
Education _ Department of Youth Justice and Victim Support.pdf,0,"26/08/2025, 15:37 Education | Department of Youth Justice and Victim Support Department of Youth Justice and Victim Support Helping young people in detention (https://www.youthjustice.qld.gov.au/parents-carers/youth- detention/helping-young-people-in-detention) >> Education Education If a young person is in detention, they need to participate in education and training programs 5 days a week. Each youth detention centre has a school and a training centre located inside it. West Moreton Education and Training Centre (https://byetc.eq.edu.au/) is located at the West Moreton Youth Detention Centre. Brisbane Youth Education and Training Centre (https://byetc.eq.edu.au) is located at the Brisbane Youth Detention Centre. Cleveland Education and Training Centre (https://clevelandetc.eq.edu.au) is located at the Cleveland Youth Detention Centre. A principal leads each school with highly qualified teachers taking all classes. Teachers and detention centre staff work together on programs that meet each young person’s individual learning needs and work towards their rehabilitation. Classes are small and every young person gets individual attention and instruction at his or her level. Teachers work with young people to: catch them up if they have any learning gaps in literacy or numeracy help them learn new skills support them to develop skills for returning to education, training or employment when they leave detention improve their social skills https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/helping-young-people-in-detention/education 1/3 26/08/2025, 15:37 Education | Department of Youth Justice and Victim Support Teachers and detention centre staff deliver programs that aim to support a young person’s successful re-entry into the community. Young people may also work to gain qualifications while in detention. The junior schools draw their programs from the Australian Curriculum. We send school reports home every 3 months. Support for young people During the school program young people can also get help from: special education teachers guidance officers speech and language pathologists occupational therapists Young people get advice about returning to school, as well as"
Education _ Department of Youth Justice and Victim Support.pdf,1,"programs from the Australian Curriculum. We send school reports home every 3 months. Support for young people During the school program young people can also get help from: special education teachers guidance officers speech and language pathologists occupational therapists Young people get advice about returning to school, as well as careers, employment and skilling opportunities that will be available to them when they leave detention. This helps their return to the community providing a focus for the young person after detention. Other programs Young people have access to a range of other programs (https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/helping-young- people-in-detention/support-programs)at their detention centre, including: behavioural programs social programs cultural programs More information Learn more: about support programs in detention (https://www.youthjustice.qld.gov.au/parents- carers/youth-detention/helping-young-people-in-detention/support-programs) https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/helping-young-people-in-detention/education 2/3 26/08/2025, 15:37 Education | Department of Youth Justice and Victim Support about health and wellbeing in detention (https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/helping-young- people-in-detention/health-and-wellbeing) Helping young people in detention (https://www.youthjustice.qld.gov.au/parents- carers/youth-detention/helping-young-people-in- detention) Care in detention (https://www.youthjustice.qld.gov.au/parents-carers/youth- detention/helping-young-people-in-detention/care-in-detention) Education (https://www.youthjustice.qld.gov.au/parents-carers/youth- detention/helping-young-people-in-detention/education) Support programs (https://www.youthjustice.qld.gov.au/parents-carers/youth- detention/helping-young-people-in-detention/support-programs) Health and wellbeing (https://www.youthjustice.qld.gov.au/parents-carers/youth- detention/helping-young-people-in-detention/health-and-wellbeing) Last reviewed: 26 November 2024 Last modified: 26 November 2024  Provide feedback (https://www.families.qld.gov.au/feedback?id=34930) This work is licensed under a Creative Commons Attribution 4.0 International (CC BY 4.0) licence (https://creativecommons.org/licenses/by/4.0/) https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/helping-young-people-in-detention/education 3/3"
Driving-Drugs-and-Alcohol-Updated-October-2023WM1.pdf,0,"DRIVING, DRUGS AND ALCOHOL This sheet is intended to provide general legal information about the law in Queensland. It is not legal advice. If you have a particular legal problem you should contact a solicitor for legal advice. At the end is a list of agencies that might be able to assist you, including legal agencies. What is a vehicle? A vehicle is any type of transport with wheels and includes: • motor vehicle • bicycle • a non-motorised ‘wheeled recreational device’ {rollerblades, roller-skates, skateboard, and scooter (including a foot scooter with an electric motor less than 200 watts)}. What is a motor vehicle? Motor vehicles are cars, motorbikes, jet skis, boats and any other vehicle with an engine but not motorised scooters or bicycles. What if I am driving and I have been drinking or taking drugs? It is an offence for you to have any alcohol at all and drive or try to drive a motor vehicle if you are a learner (on L Plates) or a person on P Plates, as your blood-alcohol level has to be 0.00. When you are off your P plates, the limit is generally 0.05. But this does not apply if driving is your job; or if you are on a probationary licence following your driver’s licence being suspended. It is also an offence to drive, try to drive, or be ‘in charge’ of – • A motor vehicle anywhere if you are affected by alcohol, illegal drugs, or legal drugs which a doctor has prescribed for you. • Any other type of vehicle it is an offence if you are on a road. A ‘road’ includes streets and car parks. UNDER REVIEW So, it would be an offence to be ‘under the influence’ of (affected by) drugs or alcohol and have"
Driving-Drugs-and-Alcohol-Updated-October-2023WM1.pdf,1,"a doctor has prescribed for you. • Any other type of vehicle it is an offence if you are on a road. A ‘road’ includes streets and car parks. UNDER REVIEW So, it would be an offence to be ‘under the influence’ of (affected by) drugs or alcohol and have your skateboard at the local shopping centre car park but this would not be the case if you were on the grassed area of the local park. (BUT: you could still be picked up for being drunk in a public place). What does being ‘in charge’ of a motor vehicle mean? Being ‘in charge’ of a motor vehicle can include having the keys to a car or being the only person in the car even though the engine isn’t running. Being asleep in the back of a parked car can be enough for police to charge you if the police breath test you, and you are over the limit that applies to you. Can I ride my bicycle if affected by drugs or alcohol? No. It is an offence to be affected by drugs or alcohol and be in charge of any vehicle like a bicycle or animal on a road such as a horse. When can the police ask for a breath test? A police officer can stop you and ask you to take a breath test if: • you are driving or trying to drive a motor vehicle (car, motorbike, jet ski, any other vehicle with an engine or a boat) • you are the person who seems to be ‘in charge’ of the motor vehicle • the police officer believes that, during the three hours before asking you to take the breath test, you drove or tried to drive a motor vehicle or were in charge of"
Driving-Drugs-and-Alcohol-Updated-October-2023WM1.pdf,2,"or a boat) • you are the person who seems to be ‘in charge’ of the motor vehicle • the police officer believes that, during the three hours before asking you to take the breath test, you drove or tried to drive a motor vehicle or were in charge of a motor vehicle) • the motor vehicle has been involved in an accident and the police officer believes you were the driver or person in charge. For any vehicle (including bicycle, rollerblades, roller skates, skateboard, and scooter), if a police officer has arrested you because they think that you are affected by alcohol – for example because of the way you are driving or riding – the officer can ask you to take a breath test. For any vehicles (including scooters and bicycles), police can ask to take a breath test in certain situations such as if you are arrested for:- • driving under the influence of drugs or alcohol; or © Youth Advocacy Centre Inc 1 • driving carelessly or dangerously resulting in an accident. Can I refuse to take a breath test? It is an offence to refuse to take a breath test. If the police want to breath test you in relation to a motor vehicle, and you refuse to take the test, you may also be charged with a more serious drink driving offence even though you may not have had any alcohol at all. The police officer can take you to the nearest police station - by using reasonable force if necessary. What about saliva, blood, or urine tests? There are similar laws for saliva tests for drugs and driving as for breath tests. You could also be asked to take a blood or a urine test if the police think your behaviour shows you"
Driving-Drugs-and-Alcohol-Updated-October-2023WM1.pdf,3,"- by using reasonable force if necessary. What about saliva, blood, or urine tests? There are similar laws for saliva tests for drugs and driving as for breath tests. You could also be asked to take a blood or a urine test if the police think your behaviour shows you are affected by alcohol or drugs but the levels of the breath or saliva tests you took were low or nil. You can be charged with an offence if you refuse to take these tests. These tests must be done by a doctor or a nurse. What will happen if the police think I have been drinking or taking drugs? If the police believe you were driving, trying to drive or were ‘in charge’ of any vehicle when affected by alcohol or drugs; or you have an alcohol limit above what applies to you for a motor vehicle, then: • you can be arrested, taken to the police station and have to go to court • if found guilty, you can be given a fine or another sentence. If you are found guilty of offences involving a motor vehicle: • your licence can be cancelled • you can be disqualified from holding a licence for a certain amount of time. Who can help? Remember that drug use can be harmful to your general health. A conviction for a drug offence may cause you problems in the future, for example when applying for a job or if you are going overseas. If you want more information UNDER REVIEW call: Youth Advocacy Centre (YAC) www.yac.net.au ....................................................................... 3356 1002 Legal Aid Queensland www.legalaid.qld.gov.au ....................................................................... 1300 651 188 Youth Legal Advice Hotline …………………………………………………………………………………………………………………………………… 1800 527 527 (Monday - Thursday 8am – 9pm; Friday 8am – Sunday 5pm) YFS Legal www.yfs.org.au ....................................................................................................... 3826 1500 Brisbane"
Driving-Drugs-and-Alcohol-Updated-October-2023WM1.pdf,4,If you want more information UNDER REVIEW call: Youth Advocacy Centre (YAC) www.yac.net.au ....................................................................... 3356 1002 Legal Aid Queensland www.legalaid.qld.gov.au ....................................................................... 1300 651 188 Youth Legal Advice Hotline …………………………………………………………………………………………………………………………………… 1800 527 527 (Monday - Thursday 8am – 9pm; Friday 8am – Sunday 5pm) YFS Legal www.yfs.org.au ....................................................................................................... 3826 1500 Brisbane Youth Service www.brisyouth.org .............................................................................. 3620 2400 Adolescent Drug and Alcohol Withdrawal Service (ADAWS) www.kidsinmind.org.au .............. 3163 8400 Hothouse (Drug and Alcohol Counselling Youth Program) ....................................................... 38375633 Aboriginal & Torres Strait Islander Legal Service www.atsils.org.au ........................................ 3025 3888 or (free call) 1800 012 255 (24hrs 7 days a week) H.A.D.S. (Queensland Health) .................................................................................................. 3646 8704 Alcohol & Drug Information Service (24hrs) .............................................................................. 1800 177 833 QLD Injectors Health Network (QuIHN) www.quihn.org .......................................................... 1800 172 076 Aboriginal and Torres Strait Islander Community Health Service (ATSICHS) ...................... 3240 8900 Translating & Interpreting Service (24hrs) ............................................................................... 13 14 50 Child Safety After Hours Service (24hrs) (DOC) ....................................................................... 3235 9999 or (free call) 1800 177 135 Community Legal Centres (CLCs) see www.naclc.org.au for your nearest CLC This sheet was last reviewed and updated in October 2023. The Youth Advocacy Centre does not accept responsibility for any action or outcome as a result of anyone relying on the information provided. © Youth Advocacy Centre Inc 2
State-school-enrolment-cancelled.pdf,0,"State school enrolment cancelled What are the reasons that my enrolment can be cancelled? You can only have your enrolment cancelled if:1 • You are over 16 or you have completed year 10 AND • You refuse to participate in the school’s education program (participation means more than just turning up at school). Who decides to cancel my enrolment if I am over 16 and refuse to participate in school? If the principal decides to cancel your enrolment, the school must give you a written notice telling you:2 • your enrolment at the school is cancelled • you cannot apply to re-enrol for a certain period (less than 12 months from the date of the notice) • you can write to the Head of Education Queensland (Chief Executive) saying why your enrolment should not be cancelled.3 How do I change the decision? You can write to the Chief Executive and ask them to review the Principal’s decision.4 There is no time limit on when you can ask for a review. You must clearly set out the reasons why you say the decision is wrong and any other information that supports your side of the story. For example, you need to be able to point out to the Chief Executive where the Principal made a mistake, was biased against you or did not properly consider relevant information in making their decision. You can also make an application to the Supreme Court for Judicial Review but you should talk to a lawyer if you are considering this. What can the Chief Executive do? The Chief Executive can: • agree with the original decision to cancel your enrolment; or 1 Education (General Provisions) Act 2006 (Qld) s 9 (defines compulsory school age), s316(1) & 317. 2 Education (General Provisions) Act 2006 (Qld) ss"
State-school-enrolment-cancelled.pdf,1,"if you are considering this. What can the Chief Executive do? The Chief Executive can: • agree with the original decision to cancel your enrolment; or 1 Education (General Provisions) Act 2006 (Qld) s 9 (defines compulsory school age), s316(1) & 317. 2 Education (General Provisions) Act 2006 (Qld) ss 318 and 320. 3 Education (General Provisions) Act 2006 (Qld) s 319(2) & (3). 4 Education (General Provisions) Act 2006 (Qld) s 319. Reviewed 24/07/2025 This sheet is intended to provide general legal information about the law in Queensland. This information is not legal advice. If you have a particular legal problem you should contact a solicitor for legal advice. At the end is a list of agencies that might be able to assist you, including legal agencies. State school enrolment cancelled • vary the original decision; or • make a new decision in place of the original decision.5 5 Education (General Provisions) Act 2006 (Qld) s 392(2). State school enrolment cancelled Who can I contact for support Youth Advocacy Centre (YAC) www.yac.net.au 3356 1002 QAI if you have a disability www.qai.org.au/ 1300 130 582 Logan Youth & Family Legal Service www.yfs.org.au 3826 1500 Legal Aid Queensland www.legalaid.qld.gov.au 1300 651 188 Hub Community Legal www.hubcommunity.org.au 3372 7677 About the Youth Advocacy Centre The Youth Advocacy Centre offers free and confidential legal and social support services for young people in Queensland. www.yac.net.au (07) 3356 1002"
Moving-OutWM1.pdf,0,"MOVING OUT This sheet is intended to provide general legal information about the law in Queensland. It is not legal advice. If you have a particular legal problem you should contact a solicitor for legal advice. At the end is a list of agencies that might be able to assist you, including legal agencies. Moving Out? If you are thinking of leaving home and are It is also a good idea to think about what under 18, it is a good idea to talk to someone personal things you might need to take with you you trust OR call one of the agencies under if you decide to leave home (such as ID, school ‘Who can help?’ They should keep things records, clothing). confidential or you can contact them without giving your name. What about my parents? If your parents do not know where you are and When can I leave home? are concerned about you, they will usually call Generally, you can leave home when you are the police or Child Safety and you will be listed 18 years old. as a missing person. This means the police will be asked to look out for you. If the police find Under 18? you they will want to know why you left home. There is no legal age for when you can leave The police and Child Safety have a duty to home. However if you are under 18 years of listen to you and investigate your story. You age and there is a: have the right to feel safe and should tell the  Court Order which says who you must police or Child Safety where you want to go if live with or there are reasons why you do not feel safe or  if you are on"
Moving-OutWM1.pdf,1,"and there is a: have the right to feel safe and should tell the  Court Order which says who you must police or Child Safety where you want to go if live with or there are reasons why you do not feel safe or  if you are on a Child Protection Order able to go home. You should not be sent home this may make it more difficult to leave home. straight away. If you do leave home before you are 18, there If you have left home without your parents' is a chanUce thatN Child SDafety SEerviceRs (Child R ag E reeme V nt, it is I a E good id W ea to call them or the Safety) may become involved if they believe police to let them know you are safe. You will you are at risk of harm. not be taken off the missing persons list until you: In practice, this means if you are under 18 and  go into a police station and prove who you Child Safety or the police are told or find out are AND that you are not living at home, they will need  give police the address of where you are to be convinced that you can care for your basic living. necessities of life. This means looking at whether you: Taken into care?  have somewhere appropriate to live Child Safety can ask the court for an order if  can adequately care for your basic they think you are not safe within your home or needs (food, shelter, clothing, medical, unable to look after yourself properly. These mental health) orders can mean you will not be able to live with your family for a long time. You should get legal  have adequate supervision."
Moving-OutWM1.pdf,2,"basic they think you are not safe within your home or needs (food, shelter, clothing, medical, unable to look after yourself properly. These mental health) orders can mean you will not be able to live with your family for a long time. You should get legal  have adequate supervision. advice if you think this may happen to you. If any of these seem to be a problem, Child Will shelters or Crisis Care tell my parents Safety will assess whether your living situation is likely to cause you physical, emotional or where I am? mental harm. They will then look at how great There is no law that says services such as that risk is to determine whether and how youth shelters must tell your parents where you quickly they will step in. are. If you are concerned about this, ask about the rules of the place where you are staying. This means the younger you are the more Crisis Care may tell your parents where you are difficult it will be to convince Child Safety that IF: you are able to look after yourself properly,  you are under 16 years of age OR especially if you are not living with a  you are on a Child Protection Order. responsible adult like a friend's family member. If the police or Child Safety are not convinced A place to live? that you are safe and able to look after yourself, You will need to contact one of the agencies they may apply to the court for a Child under ‘Who can help?’ for information on the Protection Order (see below for what this types of housing listed below. You can also means). contact the Queensland Youth Housing © Youth Advocacy Centre Inc 1 Coalition on 0439 739 747"
Moving-OutWM1.pdf,3,"agencies they may apply to the court for a Child under ‘Who can help?’ for information on the Protection Order (see below for what this types of housing listed below. You can also means). contact the Queensland Youth Housing © Youth Advocacy Centre Inc 1 Coalition on 0439 739 747 or visit be paid or rules about having people over) www.qyhc.org.au for information and before you decide to move into a share house. resources. Anyone can apply for private rental In an emergency? accommodation. If you are under 18, you are If you need somewhere to stay for a short time able to sign a tenancy agreement if it is deemed there are emergency youth shelters, refuges or to be a contract of necessity. Accommodation hostels where you may be able to stay for up to contracts are generally considered to be 3 months. They are usually supervised by contracts of necessity. workers on a 24-hour basis. Sometimes a landlord may be unsure about The amount (if any) you pay to stay there renting to you because of your age. You should depends on how long you stay and whether try to explain that you can’t be discriminated you have an income. against (treated unfairly) because of your age. Laws about renting and leaving (including Sometimes emergency youth shelters might bond, rent, rights and responsibilities of the not be able to help because they are full. If you landlord & tenants) are complicated. If you need emergency assistance you can contact have any hassles with your landlord contact the Homeless Persons Information Queensland on Tenants Union of Queensland for advice or ask 1800 474 753. This is a State government free to get their Fast fact sheets. call number that assists people to find crisis accommodation. If you are under"
Moving-OutWM1.pdf,4,"contact have any hassles with your landlord contact the Homeless Persons Information Queensland on Tenants Union of Queensland for advice or ask 1800 474 753. This is a State government free to get their Fast fact sheets. call number that assists people to find crisis accommodation. If you are under 17 they will Social housing? refer you to the Kids Help Line. Social housing in Queensland is housing that you rent from the government (what used to be Squatting? called public housing or housing commission) Squatting means moving into an empty or from a community housing service. You can building or house and living there. Squatting is apply for social housing as long as you receive illegal and police can arrest you for ‘breaking a certain level of income. This means that you and entering’ or ‘trespassing’. If you have can rent at any age as long as you have an UNDER REVIEW nowhere to go and are thinking of moving into income to support yourself. a squat, it is a good idea to call one of the agencies under ‘Who can help?’ You can apply for social housing by filling out the standard form called Application for Caravan Parks? Housing Assistance Form 7 This choice can sometimes be cheaper than (http://www.hpw.qld.gov.au/SiteCollectionDoc privately renting. Contact the Tenants uments/HAssist.pdf). This means you only Queensland or a Tenant Advice and Advocacy have to fill out one form to get your name on the (TAAS) service near you. housing register. This form is available from the Queensland Government website or from Medium term places? your local Department of Housing Area Office. You can usually stay in this type of If you don’t know where your nearest office is accommodation for up to 12 months. It you can call one of the agencies under"
Moving-OutWM1.pdf,5,"available from the Queensland Government website or from Medium term places? your local Department of Housing Area Office. You can usually stay in this type of If you don’t know where your nearest office is accommodation for up to 12 months. It you can call one of the agencies under ‘Who depends on what ‘set up’ the service offers as can help?’ to whether their workers live in, are only there during the day, or just drop by from time to time. In Queensland, to obtain social housing, you Community Housing Services offer a range of have to be able to show that you are on a low options, from sharing with other young people, income AND that there are other reasons why to living in a single flat. You will usually have to you need social housing. Some of these pay an amount each week (usually 25% of your reasons include: income) to stay there. This is worked out by  if you cannot access private rental looking at how much income you receive from housing Centrelink or employment.  the private rental market does not meet your needs (including if you have not Share house? been able to keep a tenancy) Privately renting can be very expensive and  you have a medical condition sharing may be a way around this. The choice  you have a disability to move into a share house with other people is  other reasons, including if you are something that you will need to think about homeless or at risk of homelessness. carefully. It is a good idea to ask lots of questions (how phone bills and electricity will The Application Form will help the Department of Housing understand the reasons why you © Youth Advocacy Centre Inc 2 need housing"
Moving-OutWM1.pdf,6,"will need to think about homeless or at risk of homelessness. carefully. It is a good idea to ask lots of questions (how phone bills and electricity will The Application Form will help the Department of Housing understand the reasons why you © Youth Advocacy Centre Inc 2 need housing assistance. This form will also If you want someone to go with you to the want you to list where you want to live. The interview call one of the agencies under ‘Who areas you list will be used to decide when you can help?’ will be offered housing and how long you will have to wait. This form requires a lot of There may be times where the Department of information from you because it helps Housing may tell you that you cannot be determine your level of housing need and housed in social housing immediately because whether you meet the eligibility criteria. It is there are other people who may be in greater important to fill this form out properly. If you need. This does not mean they will not put need help filling it out call one of the agencies your name on the housing register, however, it under ‘Who Can Help?’ might mean that it could take a very long time. If this happens to you the Department of This process will require you to have an Housing should offer you other forms of interview with the Department of Housing to go assistance or you could call one of the through your application. If you do not go to an agencies under ‘Who can help?’ to find other interview the department will not progress your accommodation. request and you may have to start over again. Who can help? Youth Advocacy Centre (YAC) www.yac.net.au ...................................................................... 3356 1002"
Moving-OutWM1.pdf,7,call one of the through your application. If you do not go to an agencies under ‘Who can help?’ to find other interview the department will not progress your accommodation. request and you may have to start over again. Who can help? Youth Advocacy Centre (YAC) www.yac.net.au ...................................................................... 3356 1002 Child Safety After Hours Service (24hrs) (DOC) www.communities.qld.gov.au ....................... 3235 9999 or (free call) 1800 177 135 Tenants Queensland (Tenancy advice including for caravans and mobile homes) .................. 3832 9447 or 1300 744 263 Residential Tenancies Authority www.rta.qld.gov.au ............................................................... 1300 366 311 UNDER REVIEW Translating & Interpreting Services (24hrs) .............................................................................. 131 450 Queensland Youth Housing Coalition www.qyhc.org.au .......................................................... 3876 2088 or 1800 061 142 Community Legal Centres (CLCs) see www.naclc.org.au for your nearest CLC This sheet was last reviewed and updated in January 2020. The Youth Advocacy Centre does not accept responsibility for any action or outcome as a result of anyone relying on the information provided. © Youth Advocacy Centre Inc 3
Being-in-Care-Making-Decisions-Updated-November-2023WM1.pdf,0,"BEING IN CARE – MAKING DECISIONS AND CHANGES This sheet is intended to provide general legal information about the law in Queensland. This information is not legal advice. If you have a particular legal problem you should contact a solicitor for legal advice. At the end is a list of agencies that might be able to assist you, including legal agencies. This sheet is for young people who are in the care of Child Safety. There is information on: 1. Making decisions for myself 2. What if I’m unhappy with my case plan? 3. Things I disagree with and what I can do about it 4. What to do if my needs are not being met 5. What to do if I’m unhappy with my Child Protection Order Making decisions for myself If you are in the care of Child Safety then some decisions that are really important will be decided by a group of adults and you. These decisions are usually made at a Family Group Meeting. At this meeting, your parents, carers, Child Safety Officer (the person from Child Safety whose job is to make sure your needs are met), cultural representative, your youth worker, your lawyer and you talk about what you need to have a good life. This is put into a case plan which says things like who you live with and where you go to school. As you get older you may get better at making decisions. The law says that as you get better at understanding what a decision is about and what will happen if you choose different options, then what you want will be more important when deciding what happens in your life. The more important the decision is, the more you will need to show that you understand what the"
Being-in-Care-Making-Decisions-Updated-November-2023WM1.pdf,1,"better at understanding what a decision is about and what will happen if you choose different options, then what you want will be more important when deciding what happens in your life. The more important the decision is, the more you will need to show that you understand what the decision is about and how it affects you. If you feel like you are ready to have more of a say in decisions about your life you can talk to an adult that you trust which may be: • Your Child Safety Officer • If you are Indigenous then your local Indigenous group or community member who have been approved by Child Safety • A Community Visitor from the Public Guardian UNDER REVIEW • If you are in ‘residential care’ then your Case Manager • Youth Worker - see contact details at the end of the sheet • Teacher • Lawyer - see contact details at the end of the sheet What if I’m unhappy about my case plan? Your case plan should be reviewed regularly by Child Safety and you have to be given a chance to participate in the review. If you think that your case plan needs to be changed then you can also speak to any of the other people listed above in the section ’Making Decisions for myself’. The best place to have your case plan changed is at the next Family Group Meeting. To find out when the next Family Group Meeting is you should ask your Child Safety Officer. Things I may disagree with and what I can do about them There are 5 types of decisions made by Child Safety that you can ask to be reviewed by someone outside of Child Safety. These are: • not to let your parents know"
Being-in-Care-Making-Decisions-Updated-November-2023WM1.pdf,2,"should ask your Child Safety Officer. Things I may disagree with and what I can do about them There are 5 types of decisions made by Child Safety that you can ask to be reviewed by someone outside of Child Safety. These are: • not to let your parents know where you are living. • to limit or stop you from seeing your parents, brother or sister. • that you are to live with a particular person or in a particular place. • that you are no longer allowed to live with a person who was your carer. • refusing to review your case plan when requested if you are under a long-term Guardianship Order. To have the decision reviewed means that the Queensland Civil and Administrative Tribunal (QCAT) will look into the decision. Other people, like your parents or carers, can also ask for a decision to be reviewed. There will be a day where you can go to QCAT (you can take a support person; you don’t need a lawyer but you can have one if you wish) and say what you think should happen. The decision can either be changed or be left as it is. It is the job of QCAT to give you information and help so you can apply for a review and participate in the process. You have only 28 days after you get the letter from Child Safety telling you about the decision to put your application for a review in at QCAT. If you don’t get a letter telling you about the decision, you may still be able to have the decision reviewed. This won’t cost you anything. To get help with this call one of the legal services at the end of this sheet or QCAT. © Youth Advocacy Centre"
Being-in-Care-Making-Decisions-Updated-November-2023WM1.pdf,3,"QCAT. If you don’t get a letter telling you about the decision, you may still be able to have the decision reviewed. This won’t cost you anything. To get help with this call one of the legal services at the end of this sheet or QCAT. © Youth Advocacy Centre Inc 1 What to do if my needs are not being met? You can call the Public Guardian. It is separate from Child Safety and is there to help you if you feel like you are not having your needs met. See their contact details at the end of this sheet. Create is a non-government organisation which supports young people who are in care and transitioning to independence from care. See their contact details at the end of this sheet. What if I am unhappy with the Child Protection Order? (CPO) A Child Protection Order can be made by the Childrens Court if the court decides that you are unsafe and there is not a parent able to make you safe at the moment. The aim of the Order is to make you safe. If the court makes a CPO about you and you disagree with it, you can ask the court to cancel or change the Order. For the court to cancel the Order you will need to show the court that you will be safe from harm without a CPO. For the court to change your CPO you will have to show the court that the change you want to make will still keep you safe from harm. If there has been an application to the court for an Order, there will be a number of court hearings – it won’t all be sorted out on one day. While this is happening the court can say that Child"
Being-in-Care-Making-Decisions-Updated-November-2023WM1.pdf,4,"want to make will still keep you safe from harm. If there has been an application to the court for an Order, there will be a number of court hearings – it won’t all be sorted out on one day. While this is happening the court can say that Child Safety will decide where you are to live or that Child Safety can come and check on your safety. The court might decide that you are to live with someone other than your parents until a final Order is made. If you disagree with this you may be able to appeal. This appeal must be made within 28 days of the court making this Order. You will need some help with this appeal so it is best to call one of the lawyers at the end of this sheet. Your Mum, Dad or other people involved in the Child Protection Order also may be able to appeal the Court Order. They can call Legal Aid on 1300 651 188. Who can help? Youth Advocacy Centre (YAC) www.yac.net.au ...................................................................... 3356 1002 Hub Community Legal www.hubcommunity.org.au ................................................................. 3372 7677 Logan Youth & Family Legal Service www.yfs.org.au .............................................................. 3826 1500 UNDER REVIEW Legal Aid Queensland www.legalaid.qld.gov.au ....................................................................... 1300 651 188 Aboriginal & Torres Strait Islander Legal Service www.atsils.org.au ........................................ 3025 3888 or (free call) 1800 012 255 (24hrs 7 days a week) Translating & Interpreting Services (24hrs) .............................................................................. 131 450 Crime and Corruption Commission www.ccc.qld.gov.au ......................................................... 3360 6060 or 1800 061 611 CREATE www.create.org.au/qld .............................................................................................. 1800 655 105 Queensland Ombudsman www.ombudsman.qld.gov.au ......................................................... 1800 068 908 Office of the Public Guardian www.publicguardian.qld.gov.au/child-advocate ........................ 1800 661 533 Queensland Civil and Administrative Tribunal www.qcat.qld.gov.au ....................................... 1300 753 228 Community Legal Centres (CLCs) see www.naclc.org.au for your nearest CLC This information was last reviewed and updated in"
Being-in-Care-Making-Decisions-Updated-November-2023WM1.pdf,5,www.create.org.au/qld .............................................................................................. 1800 655 105 Queensland Ombudsman www.ombudsman.qld.gov.au ......................................................... 1800 068 908 Office of the Public Guardian www.publicguardian.qld.gov.au/child-advocate ........................ 1800 661 533 Queensland Civil and Administrative Tribunal www.qcat.qld.gov.au ....................................... 1300 753 228 Community Legal Centres (CLCs) see www.naclc.org.au for your nearest CLC This information was last reviewed and updated in November 2023.Youth Advocacy Centre does not accept responsibility for any action or outcome as a result of anyone relying on the information provided. © Youth Advocacy Centre Inc 2
Sex.pdf,0,"Sex When can I have sex? You can have sex with a person (of the same or different sex) without breaking the law if you are both 16 and over and you both want to do this.1It is against the law for two (or more) people to have sex if any (or all) of them are under 16.2 It is unlawful for a person to do any of the following to a young person under 16: • touch the young person on the genitals, bottom or chest or somewhere else in a sexual way • expose themselves to the young person • take inappropriate photos of the young person.3 It is against the law for a parent, grandparent, aunt, uncle, brother or sister to have sex with you.4 This is called incest. It includes that group if you are related through a de facto relationship, step family, adopted family or foster family.5It is also against the law to have sex with an animal.6 If the police or Child Safety Services believe you are at risk of harm because of your sexual behaviour, they may ask the Court to order that you be placed in the care and protection of Child Safety Services.7 Get some legal advice if you think this might happen. If any adult, including your parents, has reasonable belief that a sexual offence has occurred to child under 16 (or under 18 if the child has a disability) then they must report it to the police.8 What is safe sex? ‘Safe sex’ means not swapping any bodily fluids with the person you are having sex with. Practising safe sex can protect you from sexually transmitted infections (STIs), and unwanted pregnancies. Having safe sex means using protection (like a condom) each time you have sex. Other forms of contraception"
Sex.pdf,1,"safe sex? ‘Safe sex’ means not swapping any bodily fluids with the person you are having sex with. Practising safe sex can protect you from sexually transmitted infections (STIs), and unwanted pregnancies. Having safe sex means using protection (like a condom) each time you have sex. Other forms of contraception like the Pill make pregnancy less likely but do not protect you from STIs. You can get free condoms from some of the agencies listed under ‘Who Can I Contact for Support?’ 1 Criminal Code Act 1899 (Qld) s 215. 2 Criminal Code Act 1899 (Qld) s 215. 3 Criminal Code Act 1899 (Qld) s 210(1). 4 Criminal Code Act 1899 (Qld) s 222(1). 5 Criminal Code Act 1899 (Qld) s 222(5)-(6). 6 Criminal Code Act 1899 (Qld) s 211. 7 Child Protection Act 1999 (Qld) ss 10, 18, 59. 8 Criminal Code Act 1899 (Qld) s 229BC. Reviewed 15/08/2025 This sheet is intended to provide general legal information about the law in Queensland. This information is not legal advice. If you have a particular legal problem you should contact a solicitor for legal advice. At the end is a list of agencies that might be able to assist you, including legal agencies. Sex When can I get contraceptives? There is no age limit for buying contraceptives (for example the Pill, condoms) BUT young women will need to get a prescription from a doctor or some pharmacists for contraceptives such as the Pill. Generally, you may receive contraceptive advice and treatment without your parents being told. You should check your pharmacist or doctor’s practice if this is an issue for you. Usually, the Family Planning Association will respect your right to privacy and will not contact your parents. What about my parents? If a doctor agrees to treat you, including"
Sex.pdf,2,"treatment without your parents being told. You should check your pharmacist or doctor’s practice if this is an issue for you. Usually, the Family Planning Association will respect your right to privacy and will not contact your parents. What about my parents? If a doctor agrees to treat you, including providing you with contraception, then the doctor must keep information about you confidential (this might apply to a pharmacist providing you with contraception). This means that information about you should not be given to anyone else without your agreement. This includes your parents unless the doctor believes you are not able to understand the treatment and its consequences. If you are unsure who to trust, contact one of the agencies listed under ‘Who can I Contact for Support?’ STIs? Anybody can get an STI (a sexually transmitted infection) by having unprotected sex with someone who is infected. STIs (for example, HIV, genital warts, herpes or hepatitis) are very common, and you can catch them easily. You are much less likely to catch an STI from kissing, hugging or massage. It is important to see a doctor if you have had unprotected sex and you think you may have an STI. If you have an STI and do not tell the person you are having sex with, you can be committing an offence for infecting someone else.9 What if I'm pregnant? It is a good idea to talk to someone you trust about what you want to do, as there are choices and you need to understand what those choices will mean for you. If you do not have anyone you can trust contact one of the agencies listed under ‘Who Can Help?’ In Queensland it is legal to have an abortion up to twenty-two weeks of pregnancy. After twenty-two weeks"
Sex.pdf,3,"choices and you need to understand what those choices will mean for you. If you do not have anyone you can trust contact one of the agencies listed under ‘Who Can Help?’ In Queensland it is legal to have an abortion up to twenty-two weeks of pregnancy. After twenty-two weeks two doctors “sign off” before the abortion can be performed. If the doctor has agreed to treat you then the doctor must keep information about you confidential, that is, not tell anyone unless you agree. Anyone wanting to stop you having a legal abortion or trying to make you have an abortion that you don't want would need to ask a court to order this. You should tell the doctor what you want to happen and see a lawyer if you are worried about what may be happening. Can I be forced to have sex? NO. If you are forced to have sex against your will this is called rape or sexual assault and it is against the law. (See sheet on ‘Victim of Crime’ for more information about this). It includes a wide variety of acts such as oral sex, touching another’s genitals, and groping. Factors including the use of alcohol may affect whether you are able to consent to the sexual activity. Rape or sexual assault is not something that can only happen with a stranger – date rape can happen when the person you are dating forces you into sexual activity that you do not want. Just because you 9 Criminal Code Act 1899 (Qld) ss 317(1), 320. Sex know the person and agreed to go out with them does not mean that you can be forced to have sex. People who are married cannot force their partners to have sex. You can take back your consent"
Sex.pdf,4,"because you 9 Criminal Code Act 1899 (Qld) ss 317(1), 320. Sex know the person and agreed to go out with them does not mean that you can be forced to have sex. People who are married cannot force their partners to have sex. You can take back your consent to sex at any time and the other person has to stop or they are breaking the law. You should get support from someone you trust or contact one of the agencies listed under ‘Who Can I Contact for Support ?’ to find out what you can do if this happens to you. What if I'm a sex worker? It is not against the law for you to work as a sex worker however if you are under 18, any person who gets commercial (for money) sexual services from you commits an offence. It is against the law for a person to provide commercial sexual services to any person under 18.10 You can legally carry as much safe sex material (like condoms) as you wish. If you do contract certain STIs and are aware of it, it is against the law to put someone at risk of getting it.11 There are health and safety issues for sex workers. If you are under 18 and working as a sex worker the police or Child Safety Services may decide that you are at risk of harm and apply to the court for a Child Protection Order and put you in the care of Child Safety Services. Get legal advice if you think this may happen to you. 10 Criminal Code Act 1899 (Qld) ss 217B,217C and 229L. 11 Sex Who can I contact for support Youth Advocacy Centre (YAC) www.yac.net.au 3356 1002 Aboriginal & Torres Strait Islander Legal Service (24hrs 7 days"
Sex.pdf,5,"of Child Safety Services. Get legal advice if you think this may happen to you. 10 Criminal Code Act 1899 (Qld) ss 217B,217C and 229L. 11 Sex Who can I contact for support Youth Advocacy Centre (YAC) www.yac.net.au 3356 1002 Aboriginal & Torres Strait Islander Legal Service (24hrs 7 days a week) www.atsils.org.au 3025 3888 or (free call) 1800 012 255 Logan Youth & Family Legal Service www.yfs.org.au 3826 1500 Legal Aid Queensland www.legalaid.qld.gov.au 1300 651 188 Hub Community Legal www.hubcommunity.org.au 3372 7677 Youth Legal Advice Hotline (Monday – Thursday 8am – 9pm; Friday 8am – Sunday 5pm) 1800 527 527 Community Legal Centres (CLCs) see www.naclc.org.au for your nearest CLC About the Youth Advocacy Centre The Youth Advocacy Centre offers free and confidential legal and social support services for young people in Queensland. www.yac.net.au (07) 3356 1002"
Your child's rights in detention _ Department of Youth Justice and Victim Support.pdf,0,"26/08/2025, 15:38 Your child's rights in detention | Department of Youth Justice and Victim Support Department of Youth Justice and Victim Support Life for young people in a detention centre (https://www.youthjustice.qld.gov.au/parents-carers/youth- detention/life-for-young-people-in-a-detention-centre) >> Your child's rights in detention Your child's rights in detention Every child has rights, including children in detention. When a young person arrives at the detention centre (https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/about), we will give them information about their rights, in language that they can understand. Right to be safe and well Youth detention staff will keep a young person safe. Young people will not be treated unfairly because of their: gender sexuality race religion disability We will look after a young person’s physical and mental wellbeing. A young person will have access to health care services including: seeing a doctor or nurse when they need to mental health care (and transfer to a mental health facility if needed) help if they have problems with drugs and/or alcohol access to treatments for special health needs. https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/life-for-young-people-in-a-detention-centre/your-childs-rights-in-detention 1/4 26/08/2025, 15:38 Your child's rights in detention | Department of Youth Justice and Victim Support Right to be rehabilitated While a young person is in detention, we will help them to address the issues that led to their offending behaviour. A young person will: take part in activities and programs that help with their rehabilitation have a say in decisions about their rehabilitation and other issues affecting them go to school (https://www.youthjustice.qld.gov.au/parents-carers/youth- detention/helping-young-people-in-detention/education) or complete training to learn useful work skills Right to practise their cultural and religious beliefs A young person has the right to practise and take part in services that respect and promote their cultural background while they are in detention. This includes: cultural activities and celebrations seeing religious or spiritual advisers Each detention centre has a dedicated cultural unit who"
Your child's rights in detention _ Department of Youth Justice and Victim Support.pdf,1,"their cultural and religious beliefs A young person has the right to practise and take part in services that respect and promote their cultural background while they are in detention. This includes: cultural activities and celebrations seeing religious or spiritual advisers Each detention centre has a dedicated cultural unit who can help young people connect to their culture, family and community. Right to appropriate discipline If a young person behaves inappropriately while in detention, we will deal with them in line with the rules of the centre (https://www.youthjustice.qld.gov.au/parents- carers/youth-detention/life-for-young-people-in-a-detention-centre/detention-centre- rules). While a young person might lose privileges or complete extra chores, we will not discipline them by taking away their basic rights. We will protect and promote a young person's rights in all our decision making and interactions with them. A young person will not: be punished unfairly have force or restraints used on them as punishment be separated from other young people as punishment – separation will only be used to keep a young person or others safe https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/life-for-young-people-in-a-detention-centre/your-childs-rights-in-detention 2/4 26/08/2025, 15:38 Your child's rights in detention | Department of Youth Justice and Victim Support be searched without reason and appropriate approval If a young person breaks the law while in detention, we may refer them to the police. A young person will always be treated with respect and dignity. We also encourage a young person to treat others with the same respect and dignity. Right to maintain relationships with family and other significant people We will help a young person to maintain appropriate relationships and establish new relationships that will provide them support while in youth detention and when they return to their community. A young person can have regular contact with their family and friends through visits, phone calls and mail. Right to be heard We will"
Your child's rights in detention _ Department of Youth Justice and Victim Support.pdf,2,"young person to maintain appropriate relationships and establish new relationships that will provide them support while in youth detention and when they return to their community. A young person can have regular contact with their family and friends through visits, phone calls and mail. Right to be heard We will allow a young person to take part in planning processes and when possible have a say about what happens to them. A young person has the right to complain (https://www.qld.gov.au/law/sentencing-prisons- and-probation/young-offenders-and-the-justice-system/youth-detention/complain-about- a-youth-detention-centre) about something that has or has not happened to them in the youth detention centre. You can also complain about something that has or has not happened at the youth detention centre, on their behalf. Further information Learn about the rules in detention centres (https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/life-for-young- people-in-a-detention-centre/detention-centre-rules). Find out more about daily life in detention (https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/life-for-young- people-in-a-detention-centre/routine-in-detention). https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/life-for-young-people-in-a-detention-centre/your-childs-rights-in-detention 3/4 26/08/2025, 15:38 Your child's rights in detention | Department of Youth Justice and Victim Support See how we care for young people in detention (https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/helping-young- people-in-detention/care-in-detention). Life for young people in a detention centre (https://www.youthjustice.qld.gov.au/parents- carers/youth-detention/life-for-young-people-in-a- detention-centre) Routine in detention (https://www.youthjustice.qld.gov.au/parents-carers/youth- detention/life-for-young-people-in-a-detention-centre/routine-in-detention) Detention centre rules (https://www.youthjustice.qld.gov.au/parents-carers/youth- detention/life-for-young-people-in-a-detention-centre/detention-centre-rules) Your child's rights in detention (https://www.youthjustice.qld.gov.au/parents- carers/youth-detention/life-for-young-people-in-a-detention-centre/your-childs- rights-in-detention) Last reviewed: 26 November 2024 Last modified: 26 November 2024  Provide feedback (https://www.families.qld.gov.au/feedback?id=34922) This work is licensed under a Creative Commons Attribution 4.0 International (CC BY 4.0) licence (https://creativecommons.org/licenses/by/4.0/) https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/life-for-young-people-in-a-detention-centre/your-childs-rights-in-detention 4/4"
Assault-and-Bullying-YAC-Infosheet.pdf,0,"Assault and Bullying What is assault? A person can be charged with assault in Queensland if they apply force to another without their consent or threaten to apply force to another person. The person charged must appear to have the ability to carry out the threat. You can be charged with assaulting a person even if you did not actually touch them, but you did move/act towards them in a way that would make them feel afraid of violence. The more harm you cause a person when you assault them, the more serious the charge against you can be. For example, • If you hit a person and they do not suffer injury you may be charged with ‘common assault’. • If you hit a person and cause an injury, you may be charged with assault causing bodily harm. • If you hit a person and they bleed, you may be charged with ‘wounding’. • If you hit a person, and you cause an injury that will not heal without medical help you can be charged with ‘grievous bodily harm’. If someone hits me first, can I hit back to protect myself? Yes, but you will have to be able to show that any force you used was needed to defend yourself or somebody else. Can I be charged if I agree to a fight? Yes, you can. It is illegal to be in a fight in public. In some circumstances even if you agree to be in a fight, you may be charged if you injure somebody. This can include fights at school and fights at sporting activities. What is bullying and can I get in trouble for it? Bullying describes many different types of behaviour that is repeated to cause harm. Many of these actions may be illegal,"
Assault-and-Bullying-YAC-Infosheet.pdf,1,"you may be charged if you injure somebody. This can include fights at school and fights at sporting activities. What is bullying and can I get in trouble for it? Bullying describes many different types of behaviour that is repeated to cause harm. Many of these actions may be illegal, including: if someone is threatened with assault if someone uses a phone or other electronic device to harass or menace if someone stalks another person (see below) What is ‘unlawful stalking’? ‘Unlawful stalking’ happens when someone does any of the following things either over a period of time, or on more than one occasion to another person: • follows, loiters or watches someone or a place that the person goes to regularly This sheet is intended to provide general legal information about the law in Queensland. This information is not legal advice. If you have a particular legal problem you should contact a solicitor for legal advice. At the end is a list of agencies that might be able to assist you, including legal agencies. Information sheet - Assault and Bullying • contacts the person in any way (including using technology such as mobile phones or email) • leaves or gives a person offensive material • commits intimidating, harassing, or threatening acts against a person or their property (including threats of violence). AND this behaviour causes the person fear and/or harm. Who can I contact for support? Youth Advocacy Centre (YAC) www.yac.net.au 3356 1002 Brisbane Childrens Court brisbane.childrenscourt@justice.qld.gov.au 3235 9841 Hub Community Legal www.communitylegal.org.au 3372 7677 YFS Legal www.yfs.org.au 3826 1500 Legal Aid Queensland www.legalaid.qld.gov.au 1300 651 188 Youth Legal Advice Hotline 1800 527 527 Aboriginal & Torres Strait Islander Legal Service www.atsils.org.au 3025 3888 or (free call) 1800 012 255 (24hrs 7 days a week) Translating & Interpreting Services"
Assault-and-Bullying-YAC-Infosheet.pdf,2,Hub Community Legal www.communitylegal.org.au 3372 7677 YFS Legal www.yfs.org.au 3826 1500 Legal Aid Queensland www.legalaid.qld.gov.au 1300 651 188 Youth Legal Advice Hotline 1800 527 527 Aboriginal & Torres Strait Islander Legal Service www.atsils.org.au 3025 3888 or (free call) 1800 012 255 (24hrs 7 days a week) Translating & Interpreting Services (24hrs) 131 450 Community Legal Centres (CLCs) see www.naclc.org.au for your nearest CLC E-safety Commissioner https://www.esafety.gov.au/young-people Alannah & Madeline Foundation www.alannahandmadeline.org.au Note: This sheet was last reviewed and updated in November 2023. The Youth Advocacy Centre does not accept responsibility for any action or outcome as a result of anyone relying on the information provided. About the Youth Advocacy Centre The Youth Advocacy Centre offers free and confidential legal and social support services for young people in Queensland. www.yac.net.au (07) 3356 1002
First Nations Action Board _ Department of Youth Justice and Victim Support.pdf,0,"26/08/2025, 15:56 First Nations Action Board | Department of Youth Justice and Victim Support Department of Youth Justice and Victim Support Governance (https://www.youthjustice.qld.gov.au/our-department/who-we-are/governance) >> First Nations Action Board First Nations Action Board The First Nations Action Board (FNAB) is an innovative group, the first of its kind in Australia. It is a unique response to the extremely high rates of Aboriginal and Torres Strait Islander young people in the youth justice system. The board was established in February 2016 to help the department develop culturally appropriate ways to reduce over-representation of Aboriginal and Torres Strait Islander people in the youth justice system. Composition of the board The FNAB is made up of Aboriginal and/or Torres Strait Islander Youth Justice staff members from across Queensland. They work in a range of positions from frontline staff to managers. Every member is a strong advocate and leader within Youth Justice and their local communities. Impact on Youth Justice The FNAB has already had a significant impact on our work. A cultural unit based in our central office helps us ensure that priorities are put into practice. It aims to make sure that the way we work takes cultural factors into account and enhances our workforce cultural capability. Representatives sit on the Executive Board of Management to ensure Youth Justice policy, programs and interventions are appropriate for Aboriginal and Torres Strait Islander young people, their families and communities. https://www.youthjustice.qld.gov.au/our-department/who-we-are/governance/action-board 1/2 26/08/2025, 15:56 First Nations Action Board | Department of Youth Justice and Victim Support Future goals Members of the FNAB hope to inspire similar initiatives across all Australian states and territories. They aim to be bold in their leadership and help to lower the extremely high rates of Aboriginal and Torres Strait Islander young people in the youth justice system. Governance (https://www.youthjustice.qld.gov.au/our- department/who-we-are/governance) Governance"
First Nations Action Board _ Department of Youth Justice and Victim Support.pdf,1,Future goals Members of the FNAB hope to inspire similar initiatives across all Australian states and territories. They aim to be bold in their leadership and help to lower the extremely high rates of Aboriginal and Torres Strait Islander young people in the youth justice system. Governance (https://www.youthjustice.qld.gov.au/our- department/who-we-are/governance) Governance framework (https://www.youthjustice.qld.gov.au/our-department/who- we-are/governance/governance-framework) First Nations Action Board (https://www.youthjustice.qld.gov.au/our- department/who-we-are/governance/action-board) Cultural units (https://www.youthjustice.qld.gov.au/our-department/who-we- are/governance/cultural-units) https://www.youthjustice.qld.gov.au/our-department/who-we-are/governance/action-board 2/2
Parties-and-Police-Updated-January-2024WM1.pdf,0,"PARTIES AND POLICE – Things to know This sheet is intended to provide general information only, not advice. If you have a particular legal problem you should contact a solicitor. Each section ends with a list of agencies who might be able to assist you, including legal agencies. This legal information is relevant to Queensland, Australia. Alcohol and cigarettes It is against the law for anyone to sell or give alcohol or cigarettes to anyone under 18. If you are under 18 and in your house then an adult can give you alcohol provided they are your parent or standing in for your parent. The adult must be responsible for you and make sure you are safe – they must not be drunk and must watch how much you drink and how quickly and whether you are eating while you drink. The adult can be charged if they are not supervising you properly and the police can take the alcohol. If you put alcohol or a drug, or something you think is alcohol or a drug, in a person’s drink without their knowledge you could be charged with drink spiking. It is against the law for anyone to be drunk in public and to drink in public. It is against the law to smoke in many places, including in a car if there is anyone under 16 in the car. If you are under 18 you cannot have alcohol, even an unopened bottle, in your possession in a public place. Police can take the alcohol from you and, if it is open, pour it out. It is against the law to pretend to be 18 to buy alcohol, vapes or cigarettes, e.g. by using a false ID. Other drugs It is against the law for anyone to be under the"
Parties-and-Police-Updated-January-2024WM1.pdf,1,"Police can take the alcohol from you and, if it is open, pour it out. It is against the law to pretend to be 18 to buy alcohol, vapes or cigarettes, e.g. by using a false ID. Other drugs It is against the law for anyone to be under the influence of drugs in public. It is against the law to possess any amount of illegal drugs no matter how small or if it is only for personal use. It is also illegal to possess things (utensils) that have been or are being used to take drugs, such as syringes, spoons and bongs. Possession includes having the drugs or things in your control e.g. in your car. UNDER REVIEW If there is a reasonable suspicion that things in your possession are connected to using drugs, then it is up to you to prove to the court that the things were not connected to drug use. If you are having a party and someone brings drugs or utensils to the party then you can be charged with an offence even if you didn’t know the drugs were there. If you did not know the drugs or utensils were on your property it is up to you to prove that to the court. If you are sharing drugs you can be charged with a serious offence – supplying dangerous drugs. Noise There is no set time for when you have to stop making noise at a party but if someone nearby feels the noise is too loud they can call the police. If the police think the noise is too loud they can come inside the house and direct you stop the noise immediately. If the noise continues after the police leave and the police come back they can take away the"
Parties-and-Police-Updated-January-2024WM1.pdf,2,"the noise is too loud they can call the police. If the police think the noise is too loud they can come inside the house and direct you stop the noise immediately. If the noise continues after the police leave and the police come back they can take away the thing causing the noise e.g. portable speakers. Once police are in the house they can take action if anything illegal is happening, for example if they are there about noise but someone is using drugs they can charge them. Fights Touching someone or hitting them with something without their consent is an assault, for example pouring a can of soft drink over someone. If someone is seriously injured or killed you can be charged with a very serious offences, even if you think they wanted to fight you. If you are not actually in the fight but you are encouraging the fight you could be charged as well. The penalties for assaulting certain people are much higher, for example spitting on or biting police is up to 14 years imprisonment. You are entitled to defend yourself if you are attacked or to help someone else defend themselves, so long as you only use enough force to reasonably defend yourself or the other person. If you badly injure the other person it will be harder to show you used “reasonable” force. © Youth Advocacy Centre Inc Street Offences There are lots of laws about how people must behave in public including walking along the street or driving in a car. Begging, swearing or fighting in public are offences. Being a nuisance or behaving indecently, for example urinating in public is an offence. As well as charging you police can move you on from public places and stop you coming back for"
Parties-and-Police-Updated-January-2024WM1.pdf,3,"walking along the street or driving in a car. Begging, swearing or fighting in public are offences. Being a nuisance or behaving indecently, for example urinating in public is an offence. As well as charging you police can move you on from public places and stop you coming back for up to 24 hours if you are you are making anyone feel anxious or disrupting the orderly conduct of an event, even if you aren’t doing anything. It is an offence to disobey a lawful direction given to you by police. The police must give you their name, rank and station when ordering you to move on. If you want to avoid drawing police attention to you in public you should remember these rules. Searches Police have powers which allow them to search you or your bags without a warrant, for example if they reasonably suspect you have drugs, a weapon or stolen property on you If police want to search you they have to “detain” you and tell you why. Before doing a search they should ask if you will agree. It is up to you whether you agree to the police doing a search, for example turning out your pockets for them, but if you do agree anything they find can be used as evidence in court. If you feel pressured into letting the police search then it is possible the court might say the search was unlawful. Asking you to take off outer clothing is not a strip search. Police cannot strip search you without a support person (parent or adult) being there unless it is an emergency. If you are strip searched you should be given privacy and be allowed to keep some clothes on e.g. put your top back on before removing your pants. Sex"
Parties-and-Police-Updated-January-2024WM1.pdf,4,"strip search. Police cannot strip search you without a support person (parent or adult) being there unless it is an emergency. If you are strip searched you should be given privacy and be allowed to keep some clothes on e.g. put your top back on before removing your pants. Sex and sexting Having sex (including anal sex) under 16 is a serious offence. It doesn’t matter if you both want to have sex and you are both under 16. As well as sex it is also against the law to do sexual things to each other (like touching genitals). It is against the law for a parent, grandparent, brother or sister (including adopted or step siblings and foster siblings) to have sex with you. This is called UNDER REVIEW incest. There are also laws against taking and sharing indecent photos or videos of people under 16, even if they agree. This can include sending images of yourself. Child pornography is text, images or sound showing a person under 16 in a sexual way that is likely to offend an adult. It includes images of • the person’s breasts, bottom, penis or vagina; or • the person doing something sexual or near someone doing something sexual (such as having sex). Dealing with Police Police are not always in uniform. If a person in plain clothes says they are police ask for their ID. If a uniformed police officer is not wearing a name badge ask them their name and what station they are from. Stay cool and calm if the police approach you and treat them with respect. They are there to protect everyone in the community, including you. Remember being drunk or high is not a defence to breaking the law. Being drunk or high can badly affect your behaviour,"
Parties-and-Police-Updated-January-2024WM1.pdf,5,"they are from. Stay cool and calm if the police approach you and treat them with respect. They are there to protect everyone in the community, including you. Remember being drunk or high is not a defence to breaking the law. Being drunk or high can badly affect your behaviour, especially how you treat other people. Parties at houses When at other people’s houses remember to take care of their property. If you take or damage their property without their permission, there may be legal consequences. Who can help? Youth Advocacy Centre (YAC) www.yac.net.au .............................................................................. 3356 1002 Youth Legal Advice Hotline ............................................................................................................... 1800 527 527 (Monday - Thursday 8am – 9pm; Friday 8am – Sunday 5pm) Hub Community Legal www.hubcommunity.org.au ........................................................................ 3372 7677 Logan Youth & Family Legal Service www.yfs.org.au ....................................................................... 3826 1500 © Youth Advocacy Centre Inc Legal Aid Queensland www.legalaid.qld.gov.au ............................................................................... 1300 651 188 Aboriginal & Torres Strait Islander Legal Service www.atsils.org.au................................................. 3025 3888 (24hrs 7 days a week) or (free call) 1800 012 255 Translating & Interpreting Services (24hrs) ....................................................................................... 131 450 Community Legal Centres (CLCs) see www.naclc.org.au for your nearest CLC This information was last reviewed and updated in January 2024. The Youth Advocacy Centre does not accept responsibility for any action or outcome as a result of anyone relying on the information provided. UNDER REVIEW Page 3 of 3"
Youth court orders _ Department of Youth Justice and Victim Support.pdf,0,"26/08/2025, 15:30 Youth court orders | Department of Youth Justice and Victim Support Department of Youth Justice and Victim Support Sentencing young offenders (https://www.youthjustice.qld.gov.au/parents-carers/youth-justice- system/sentencing-young-offenders) >> Youth court orders Youth court orders Open all Restorative justice presentence referral If a young person pleads guilty or is found guilty of an offence, the court may ask for a restorative justice conference (https://www.youthjustice.qld.gov.au/programs- initiatives/initiatives/restorative-justice-conferences) to take place prior to sentencing. Purpose The purpose of a presentence restorative justice conference is to: address the young person’s offending behaviour provide consequences for the offence allow victims to take part in the justice process for the crimes committed against them help the court decide on a sentence considering the young person’s participation in the conference and their actions taken to complete the restorative justice agreement (https://www.youthjustice.qld.gov.au/programs- initiatives/initiatives/restorative-justice-conferences/process#reflection-and- agreement-22622-351). If a conference is held and an agreement is made, the court will be notified of all relevant conference details to assist in sentencing. The court will also be notified if the young person does not attend the conference or complete the agreement. https://www.youthjustice.qld.gov.au/parents-carers/youth-justice-system/sentencing-young-offenders/youth-court-orders 1/20 26/08/2025, 15:30 Youth court orders | Department of Youth Justice and Victim Support Unlike other restorative justice referrals (https://www.youthjustice.qld.gov.au/programs-initiatives/initiatives/restorative- justice-conferences/for-young-people), presentence restorative justice conferences must be completed by way of a restorative justice conference. Voluntary If the victim does not want to be involved in the restorative justice conference, the restorative justice convenor must ask a representative from an organisation that works with victims of crime to attend the conference instead. Restorative justice orders If a young person pleads guilty or is found guilty of an offence, they may be sentenced to a restorative justice order. Restorative justice orders must be completed within 12 months. As part of the order, the young person must attend a restorative justice conference (https://www.youthjustice.qld.gov.au/programs-initiatives/initiatives/restorative- justice-conferences). Purpose"
Youth court orders _ Department of Youth Justice and Victim Support.pdf,1,"justice orders If a young person pleads guilty or is found guilty of an offence, they may be sentenced to a restorative justice order. Restorative justice orders must be completed within 12 months. As part of the order, the young person must attend a restorative justice conference (https://www.youthjustice.qld.gov.au/programs-initiatives/initiatives/restorative- justice-conferences). Purpose The purpose of a restorative justice order is to: address the young person’s offending behaviour provide consequences for the offence allow victims to take part in the justice process for the crimes committed against them allow the court to make another supervised order (https://www.youthjustice.qld.gov.au/parents-carers/youth-justice- system/sentencing-young-offenders/youth-court-orders#supervised-release- orders-34867-345) if the young person does not comply with the restorative justice order. Rules There are other requirements of a restorative justice order. The young person must: https://www.youthjustice.qld.gov.au/parents-carers/youth-justice-system/sentencing-young-offenders/youth-court-orders 2/20 26/08/2025, 15:30 Youth court orders | Department of Youth Justice and Victim Support report in person to a youth justice officer within 1 business day after the order is made not break the law follow every reasonable direction of youth justice officers report and receive visits as directed by a youth justice officer notify a youth justice officer within 2 business days of a change to their address, employment or school not leave Queensland while the order is in force, unless approved by a youth justice officer. Requirements The young person will have completed their restorative justice order if they: attend pre-conference meetings attend the conference complete a restorative justice agreement (https://www.youthjustice.qld.gov.au/programs- initiatives/initiatives/restorative-justice-conferences/process#reflection-and- agreement-22622-351), and comply with all other requirements of the order. If the young person does not meet the requirements of the order, a contravention process will commence that includes a formal warning and, if required, an application to the court to find that the young person has breached the order. Unlike some other restorative justice referrals (https://www.youthjustice.qld.gov.au/programs-initiatives/initiatives/restorative- justice-conferences/process#referral-22618-339), restorative justice orders must be"
Youth court orders _ Department of Youth Justice and Victim Support.pdf,2,"person does not meet the requirements of the order, a contravention process will commence that includes a formal warning and, if required, an application to the court to find that the young person has breached the order. Unlike some other restorative justice referrals (https://www.youthjustice.qld.gov.au/programs-initiatives/initiatives/restorative- justice-conferences/process#referral-22618-339), restorative justice orders must be completed by way of a restorative justice conference. If a victim does not want to be involved in the restorative justice conference, the referral is returned back to the court to determine the outcome. Alternatively, a representative of an organisation that advocates on behalf of victims can attend the restorative justice conference in the victim’s place. https://www.youthjustice.qld.gov.au/parents-carers/youth-justice-system/sentencing-young-offenders/youth-court-orders 3/20 26/08/2025, 15:30 Youth court orders | Department of Youth Justice and Victim Support Voluntary If the victim does not want to be involved in the restorative justice conference, the restorative justice convenor must ask a representative from an organisation that works with victims of crime to attend the conference instead. Community service orders If a young person pleads guilty to or is found guilty of an offence, a court can order that they do unpaid work in the community for a certain number of hours. The Queensland Government organises the work and arranges for the young person to be supervised while they’re doing it. A young person will also be allocated a Youth Justice officer. For the court to make this type of order, the young person has to: be 13 or older agree to do community service. The court can only make this order if a young person is found guilty of an offence that an adult could go to jail for. Purpose Community service orders provide a real consequence for young offenders. They help young people do something good for the community while making amends for their crime. Completing these"
Youth court orders _ Department of Youth Justice and Victim Support.pdf,3,"make this order if a young person is found guilty of an offence that an adult could go to jail for. Purpose Community service orders provide a real consequence for young offenders. They help young people do something good for the community while making amends for their crime. Completing these orders can help a young person become part of the community again. They: show that they have accepted the consequences of their actions gain skills and knowledge through work become more mature as they organise their life and responsibilities can feel good about doing something worthwhile. https://www.youthjustice.qld.gov.au/parents-carers/youth-justice-system/sentencing-young-offenders/youth-court-orders 4/20 26/08/2025, 15:30 Youth court orders | Department of Youth Justice and Victim Support Hours The court decides how much work a young person must do—generally at least 20 hours. If the young person is under 15, the most they can do is 100 hours, with no more than 4 hours a day. If the young person is 15 years or over, they might have to do up to 200 hours, with no more than 8 hours a day. The court will also set a time frame for a young person to complete the work. This can be 12 months or less. Type of work A young person may do their community service with a Youth Justice youth worker or be matched with an agency that arranges the work, depending on: the nature and seriousness of the offence the young person’s skills and ability the young person’s age and cultural background. Rules A young person must: report to a Youth Justice officer within 1 business day of the order being made not break the law do the work in a satisfactory way follow all reasonable directions of their Youth Justice officer or youth worker tell their Youth Justice officer within 2 days if"
Youth court orders _ Department of Youth Justice and Victim Support.pdf,4,"young person must: report to a Youth Justice officer within 1 business day of the order being made not break the law do the work in a satisfactory way follow all reasonable directions of their Youth Justice officer or youth worker tell their Youth Justice officer within 2 days if they change address, school or job not leave Queensland without permission from a Youth Justice officer. What a young person should bring If a young person is working outside, they need to bring a hat and sunscreen. They should also bring enough food and water to last the whole workday. The Youth Justice officer or supervisor at the job tells the young person if they need any protective clothing or equipment. Either the Queensland Government or the agency in charge of the job will supply protective clothing or equipment if it is https://www.youthjustice.qld.gov.au/parents-carers/youth-justice-system/sentencing-young-offenders/youth-court-orders 5/20 26/08/2025, 15:30 Youth court orders | Department of Youth Justice and Victim Support required. What a young person should not bring A young person should not bring: alcohol drugs weapons their friends. Moving house If you move house, you or the young person must tell their Youth Justice officer your new address within 2 days of moving. The young person must get permission from their Youth Justice officer to leave Queensland. Problems If the young person is sick and can’t attend work, they must provide a medical certificate. They must also tell their Youth Justice officer and supervisor. If the young person is having problems with the community service work, they must tell their Youth Justice officer and supervisor as soon as possible. A young person must attend work when they’re supposed to. They need a very good reason for not going. Supervised release orders When a young person has been ordered to spend time in"
Youth court orders _ Department of Youth Justice and Victim Support.pdf,5,"the community service work, they must tell their Youth Justice officer and supervisor as soon as possible. A young person must attend work when they’re supposed to. They need a very good reason for not going. Supervised release orders When a young person has been ordered to spend time in a detention centre, they’ll spend the last part of their sentence outside the centre in the community. Generally, young people will spend about 70% of their sentence in detention before being let out on a supervised release order. https://www.youthjustice.qld.gov.au/parents-carers/youth-justice-system/sentencing-young-offenders/youth-court-orders 6/20 26/08/2025, 15:30 Youth court orders | Department of Youth Justice and Victim Support Purpose Supervised release orders ensure a young person is supervised by authorities for a period after they’re released. This type of order helps a young person re-integrate with their community and family. Before release Before a young person is released from detention, you will be asked to attend a meeting with: the young person a detention centre officer a Youth Justice service centre officer a transition officer. The meeting will talk about: the conditions and activities for the order when the young person must report to authorities a plan for the young person’s release. The young person’s release When a young person first leaves detention, they must meet with a Youth Justice officer. You should go to this meeting too. The Youth Justice officer and a team leader will discuss the order conditions and ensure a young person understands what they have to do. They also discuss what help a young person might need in following the order. The young person must talk to their Youth Justice officer if they have any problems with their order. Rules Under a supervised release order, a young person must: https://www.youthjustice.qld.gov.au/parents-carers/youth-justice-system/sentencing-young-offenders/youth-court-orders 7/20 26/08/2025, 15:30 Youth court orders | Department of Youth"
Youth court orders _ Department of Youth Justice and Victim Support.pdf,6,"what help a young person might need in following the order. The young person must talk to their Youth Justice officer if they have any problems with their order. Rules Under a supervised release order, a young person must: https://www.youthjustice.qld.gov.au/parents-carers/youth-justice-system/sentencing-young-offenders/youth-court-orders 7/20 26/08/2025, 15:30 Youth court orders | Department of Youth Justice and Victim Support not break the law report to a Youth Justice officer satisfactorily attend all programs as directed by their Youth Justice officer comply with all reasonable directions from their Youth Justice officer notify the Youth Justice officer within 2 days if the young person changes address, school or job not leave Queensland without permission from a Youth Justice officer. Breaching the order It is a very serious matter if a young person breaks the law again while on a supervised release order. They may have to go back to court and detention. If a young person does not follow the order conditions, they may have to go back to court and could be sent back to detention. You must talk to the young person's Youth Justice officer if you or the young person are having any problems with the conditions of the order. Probation orders If a young person pleads guilty or is found guilty of an offence, they may get a probation order. A probation order will help a young person find ways to stop offending while they continue to live in the community. The purpose of a probation order is to: address a young person’s offending behaviour through counselling and programs provide consequences for a young person’s offending behaviour let a young person take part in community and family life in a supervised and supported way help a young person continue with study and work. https://www.youthjustice.qld.gov.au/parents-carers/youth-justice-system/sentencing-young-offenders/youth-court-orders 8/20 26/08/2025, 15:30 Youth court orders | Department of"
Youth court orders _ Department of Youth Justice and Victim Support.pdf,7,"offending behaviour through counselling and programs provide consequences for a young person’s offending behaviour let a young person take part in community and family life in a supervised and supported way help a young person continue with study and work. https://www.youthjustice.qld.gov.au/parents-carers/youth-justice-system/sentencing-young-offenders/youth-court-orders 8/20 26/08/2025, 15:30 Youth court orders | Department of Youth Justice and Victim Support A youth justice officer will supervise a young person for the period of the order. The young person must follow rules, take part in activities, and frequently go and see their youth justice officer. They may also receive home visits. How long it lasts Generally, a young person can be sentenced to a probation order for up to 2 years. In serious cases, this can be extended up to 3 years. What it involves A young person will complete activities and programs to help them not offend. A young person’s youth justice officer will give them help and advice about the support they need to do things like get back into education and find a job. Rules There are rules a young person must follow when they are on a probation order. A young person must: not break the law go to the programs that their youth justice officers tell them to follow every reasonable direction given by their youth justice officer get permission from their youth justice officer if they wish to leave Queensland. You or a young person must also tell us if a young person’s details—address, school, or work—change (this must happen within 2 business days of the change). Sometimes the court will add other conditions to a young person's probation order. Extra conditions are added when the court thinks that a young person needs extra supervision, counselling or help in the community. These conditions are just as important, and a young"
Youth court orders _ Department of Youth Justice and Victim Support.pdf,8,"within 2 business days of the change). Sometimes the court will add other conditions to a young person's probation order. Extra conditions are added when the court thinks that a young person needs extra supervision, counselling or help in the community. These conditions are just as important, and a young person must follow them. https://www.youthjustice.qld.gov.au/parents-carers/youth-justice-system/sentencing-young-offenders/youth-court-orders 9/20 26/08/2025, 15:30 Youth court orders | Department of Youth Justice and Victim Support Breaking the rules If a young person does not follow the rules of their order, a young person’s youth justice officer will talk to a young person about this. The young person may also be given a written warning. If a young person does not get back on track after their warning, they may have to go back to court. The court will then decide whether they can continue on the probation order. The court can decide to give them a different order. It is a very serious matter if a young person breaks the law while they are on probation. The court can hold them in breach of their probation order and give them more penalties. If you or a young person think they are having problems following the rules of their order you should talk to the young person's youth justice officer. Graffiti removal orders If a young person is over the age of 12 and pleads guilty or is found guilty by a court of intentionally damaging property with graffiti, they will be ordered to attend a graffiti removal program, doing unpaid work removing graffiti in the community. This is a mandatory sentence called a graffiti removal order. What is a graffiti removal program? A graffiti removal program is organised by us. On the program a young person will normally have to remove their own graffiti; however, if"
Youth court orders _ Department of Youth Justice and Victim Support.pdf,9,"removal program, doing unpaid work removing graffiti in the community. This is a mandatory sentence called a graffiti removal order. What is a graffiti removal program? A graffiti removal program is organised by us. On the program a young person will normally have to remove their own graffiti; however, if this is not possible, they may have to do other work, removing graffiti or cleaning up the neighbourhood. We will: organise the graffiti removal work arrange for a young person to be supervised allocate a young person a youth justice officer. Find out more about graffiti removal programs (https://www.qld.gov.au/law/sentencing-prisons-and-probation/young-offenders-and- the-justice-system/youth-justice-community-programs-and-services/graffiti-removal- https://www.youthjustice.qld.gov.au/parents-carers/youth-justice-system/sentencing-young-offenders/youth-court-orders 10/20 26/08/2025, 15:30 Youth court orders | Department of Youth Justice and Victim Support programs). What does a graffiti removal order achieve? Graffiti removal orders provide real consequences for young offenders and deter them from committing more graffiti vandalism in the future. Through a graffiti removal order a young person will: experiences a direct and relevant consequence for their behaviour makes amends to the community for their crime understands the negative impact of graffiti on the community. How long does a graffiti removal order last? The court will decide how much graffiti removal work a young person must do depending on their age. They must be 12 or older to be sentenced to a graffiti removal order; if they are aged 11 or younger, they will be dealt with differently by the court. If they are aged: 12 they can be sentenced to up to 5 hours graffiti removal work 13 or 14 they can be sentenced to up to 10 hours graffiti removal work 15 years and older they can be sentenced to up to 20 hours graffiti removal work. The court will also set a time frame for a young person to complete the required number of"
Youth court orders _ Department of Youth Justice and Victim Support.pdf,10,"work 13 or 14 they can be sentenced to up to 10 hours graffiti removal work 15 years and older they can be sentenced to up to 20 hours graffiti removal work. The court will also set a time frame for a young person to complete the required number of work hours. This can be up to 12 months. Rules When under a graffiti removal order a young person must: report to a youth justice officer within one business day of the order being made or any longer period as specified in the order not break the law do the work allocated to them in a satisfactory way https://www.youthjustice.qld.gov.au/parents-carers/youth-justice-system/sentencing-young-offenders/youth-court-orders 11/20 26/08/2025, 15:30 Youth court orders | Department of Youth Justice and Victim Support follow all reasonable directions of their youth justice officer or youth worker tell their youth justice officer within 2 days if they change address, school or job not leave Queensland without permission from a youth justice officer. If you move house If you move house, you or the young person must tell their youth justice officer your new address within 2 days of moving. A young person must get permission from their youth justice officer to leave Queensland. If a young person is sick or is having other problems If a young person is sick and cannot go to work, they must: tell their youth justice officer tell their supervisor provide a medical certificate proving they were sick and unable to work. If a young person is having other problems with the graffiti removal work, they must tell their youth justice officer and supervisor as soon as possible. Conditional release orders If a young person pleads guilty to—or is found guilty of—offences when they go to court, a young person can be sentenced to detention. The court"
Youth court orders _ Department of Youth Justice and Victim Support.pdf,11,"having other problems with the graffiti removal work, they must tell their youth justice officer and supervisor as soon as possible. Conditional release orders If a young person pleads guilty to—or is found guilty of—offences when they go to court, a young person can be sentenced to detention. The court may decide not to send a young person immediately to detention and instead make a conditional release order. This means a young person will be released into the community straight away, to take part in a structured program with strict conditions. Usually, the court will only make this order if a young person has already been on other orders. A conditional release order will help deal with a young person’s offending while they continue to live in the community. The purpose of a conditional release order is to: address a young person’s offending behaviour through counselling and programs https://www.youthjustice.qld.gov.au/parents-carers/youth-justice-system/sentencing-young-offenders/youth-court-orders 12/20 26/08/2025, 15:30 Youth court orders | Department of Youth Justice and Victim Support provide consequences for a young person’s offending behaviour let a young person take part in community and family life in a supervised and supported way help a young person continue with their study and work commitments. A youth justice officer will supervise a young person for the period of the order. A young person must follow rules, take part in activities, and frequently go to see their youth justice officer. They may also receive home visits. What it involves A conditional release order means that a young person must take part in a specially designed program that the court has agreed to. This program may take up to 3 months. A young person will meet with a youth justice officer before they are sentenced. The young person and the youth justice officer will put together a structured"
Youth court orders _ Department of Youth Justice and Victim Support.pdf,12,"person must take part in a specially designed program that the court has agreed to. This program may take up to 3 months. A young person will meet with a youth justice officer before they are sentenced. The young person and the youth justice officer will put together a structured conditional release order program. This program has 3 parts: activities to stop them from offending work, school or training activities activities to help them be involved in your family and their community in a positive way. There are rules a young person must follow when they are on a conditional release order. A young person must: not break the law take part in all of the activities they agreed to in their program go to the programs that their youth justice officer tells them to follow every reasonable direction given by their youth justice officer get permission from their youth justice officer if they wish to leave Queensland. https://www.youthjustice.qld.gov.au/parents-carers/youth-justice-system/sentencing-young-offenders/youth-court-orders 13/20 26/08/2025, 15:30 Youth court orders | Department of Youth Justice and Victim Support You or the young person must also tell us if their details—address, school, or work— change (this must happen within 2 business days of the change). Sometimes the court will add other conditions to a young person’s conditional release order. Extra conditions are added when the court thinks that a young person needs extra supervision, counselling or help in the community. These conditions are just as important, and a young person must follow them. Breaking the rules If a young person does not follow the rules of their order, a young person’s youth justice officer will talk to them about this. A young person may also be given a written warning. If a young person does not get back on track after their warning, they may have"
Youth court orders _ Department of Youth Justice and Victim Support.pdf,13,"If a young person does not follow the rules of their order, a young person’s youth justice officer will talk to them about this. A young person may also be given a written warning. If a young person does not get back on track after their warning, they may have to go back to court. The court can decide to give them a different order, including sending them to a youth detention centre. It is a very serious matter if a young person breaks the law while they are on a conditional release order. The court may hold them in breach of their order and place a young person in a youth detention centre. If you or a young person think they are having problems following the rules of their order you should talk to a young person’s youth justice officer. Intensive supervision orders If a court finds a young person—under the age of 13 years—guilty of an offence, it may make an intensive supervision order. Usually, this order is only made if a young person has already been on other orders, and they are now at risk of going to detention. The purpose of an intensive supervision order is to: address a young person’s offending behaviour through participation in counselling and other programs establish support systems to help a young person in the long-term provide consequences for a young person’s offending behaviour https://www.youthjustice.qld.gov.au/parents-carers/youth-justice-system/sentencing-young-offenders/youth-court-orders 14/20 26/08/2025, 15:30 Youth court orders | Department of Youth Justice and Victim Support let a young person take part in community and family life in a supervised and supported way help a young person to continue with their study and work commitments. A youth justice officer will supervise a young person for the period of the intensive supervision order. A young person must follow certain"
Youth court orders _ Department of Youth Justice and Victim Support.pdf,14,"young person take part in community and family life in a supervised and supported way help a young person to continue with their study and work commitments. A youth justice officer will supervise a young person for the period of the intensive supervision order. A young person must follow certain rules, participate in certain activities, and must frequently go and to see their youth justice officer. They may also receive home visits How long it lasts A court may sentence a young person to an intensive supervision order for up to 6 months. What it involves Before sentencing, a young person will meet with a youth justice officer. A young person and the youth justice officer will put together an intensive supervision order program. This program will include: activities to stop them from offending school or an alternative education program activities to help them be involved in your family and their community in a positive way. Rules There are rules a young person must follow when they are on an intensive supervision order. A young person must: take part in all of the activities they agree to in their program not break the law follow every reasonable direction given by their youth justice officer https://www.youthjustice.qld.gov.au/parents-carers/youth-justice-system/sentencing-young-offenders/youth-court-orders 15/20 26/08/2025, 15:30 Youth court orders | Department of Youth Justice and Victim Support get permission from their youth justice officer if they wish to leave Queensland. You or the young person must also tell us if their details—address, school, or work— change (this must happen within 2 business days of the change). Sometimes the court will add other conditions to a young person’s intensive supervision order. Extra conditions are added when the court thinks that a young person needs extra supervision, counselling or help in the community. These conditions are just as important as"
Youth court orders _ Department of Youth Justice and Victim Support.pdf,15,"happen within 2 business days of the change). Sometimes the court will add other conditions to a young person’s intensive supervision order. Extra conditions are added when the court thinks that a young person needs extra supervision, counselling or help in the community. These conditions are just as important as the main rules and a young person must follow them. Breaking the rules If a young person does not follow the rules of their order, a young person’s youth justice officer will talk to them about this. A young person may be given a written warning. If a young person does not get back on track after their warning, they may have to go back to court. The court will then decide whether they can continue on the intensive supervision order. The court may decide to give them a different order. It is a very serious matter if a young person breaks the law while they are on an intensive supervision order. The court may hold them in breach of their intensive supervision order and give them another punishment. If you or the young person thinks they are having problems following the rules of their order you should talk to the young person’s youth justice officer. Detention orders Find out what it means when a young person is given a detention order. If a young person pleads guilty to—or is found guilty of—offences when they go to court, they can be sentenced to a detention order. This means that a young person must spend a set amount of time in a youth detention centre (https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/about) .. https://www.youthjustice.qld.gov.au/parents-carers/youth-justice-system/sentencing-young-offenders/youth-court-orders 16/20 26/08/2025, 15:30 Youth court orders | Department of Youth Justice and Victim Support A detention order starts on the day a young person is sentenced. A young person may have spent time"
Youth court orders _ Department of Youth Justice and Victim Support.pdf,16,"young person must spend a set amount of time in a youth detention centre (https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/about) .. https://www.youthjustice.qld.gov.au/parents-carers/youth-justice-system/sentencing-young-offenders/youth-court-orders 16/20 26/08/2025, 15:30 Youth court orders | Department of Youth Justice and Victim Support A detention order starts on the day a young person is sentenced. A young person may have spent time in a youth detention centre before they received their detention order. This usually counts as part of a young person's detention order. There are 2 parts of a detention order: time in a youth detention centre time in the community on a supervised release order (https://www.youthjustice.qld.gov.au/parents-carers/youth-justice- system/sentencing-young-offenders/youth-court-orders#supervised-release- orders-34867-345). The court will decide how long each of these parts goes for. The court can order a young person to spend 50 to 70% of their order in detention and the rest of their time on a supervised release order. What it involves A young person will be transported to a youth detention centre. Queensland has 3 youth detention centres—2 in Brisbane and 1 in Townsville. When a young person arrives at the detention centre, a nurse will check that they are well. A young person will meet youth detention staff who will: check that they understand what is happening explain how the detention centre works give a young person a booklet that tells them about the detention centre. A young person will work with youth justice officers to: understand why they broke the law learn how to change their behaviour (https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/helping- young-people-in-detention/support-programs) and stop offending. A young person will follow a set routine (https://www.youthjustice.qld.gov.au/parents- carers/youth-detention/life-for-young-people-in-a-detention-centre). They will: https://www.youthjustice.qld.gov.au/parents-carers/youth-justice-system/sentencing-young-offenders/youth-court-orders 17/20 26/08/2025, 15:30 Youth court orders | Department of Youth Justice and Victim Support go to school in the centre (https://www.youthjustice.qld.gov.au/parents- carers/youth-detention/helping-young-people-in-detention/education) do sports activities do other programs do chores in their unit have a set bedtime. Rules There are rules (https://www.youthjustice.qld.gov.au/parents-carers/youth- detention/life-for-young-people-in-a-detention-centre/detention-centre-rules)a"
Youth court orders _ Department of Youth Justice and Victim Support.pdf,17,"set routine (https://www.youthjustice.qld.gov.au/parents- carers/youth-detention/life-for-young-people-in-a-detention-centre). They will: https://www.youthjustice.qld.gov.au/parents-carers/youth-justice-system/sentencing-young-offenders/youth-court-orders 17/20 26/08/2025, 15:30 Youth court orders | Department of Youth Justice and Victim Support go to school in the centre (https://www.youthjustice.qld.gov.au/parents- carers/youth-detention/helping-young-people-in-detention/education) do sports activities do other programs do chores in their unit have a set bedtime. Rules There are rules (https://www.youthjustice.qld.gov.au/parents-carers/youth- detention/life-for-young-people-in-a-detention-centre/detention-centre-rules)a young person must follow when they are in detention. There are also rules that you must follow when you visit your child (https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/visiting-and- contacting-a-young-person-in-detention) at the detention centre. You must not bring prohibited items, like drugs and cigarettes, into the centre. If you try to do this, you may not be able to visit your child again. Other young offender orders and sentences Other orders that the court may sentence a young person to. If a young person pleads guilty to—or is found guilty of—offences when they go to court, a young person will be sentenced. The court can sentence a young person to orders where our youth justice officers will work closely with them, or orders with little or no supervision. Types of orders and sentences Reprimand A court may decide to give a formal warning to a young person. Good behaviour order https://www.youthjustice.qld.gov.au/parents-carers/youth-justice-system/sentencing-young-offenders/youth-court-orders 18/20 26/08/2025, 15:30 Youth court orders | Department of Youth Justice and Victim Support A court can order that a young person must be on good behaviour for up to 1 year. This means that the court expects a young person to obey the law for the time they are on the order. If the young person breaks the law again while on a good behaviour order, the court can consider this and give them a more serious punishment. Fine A court may order that a young person has to pay money to the court registry. The court will consider if the young person is"
Youth court orders _ Department of Youth Justice and Victim Support.pdf,18,"young person breaks the law again while on a good behaviour order, the court can consider this and give them a more serious punishment. Fine A court may order that a young person has to pay money to the court registry. The court will consider if the young person is able to pay within a certain amount of time. Drug assessment and education If the court finds a young person guilty of an eligible drug offence, such as possession of a dangerous drug (personal use quantities), they may refer a young person to a drug assessment and education session. This means that a young person must go to a meeting to discuss their drug use. If a young person does not go, the matter may be returned to court for them to be sentenced again. Restitution and compensation A court may order that the young person must pay money to make up for property loss or for an injury suffered by a victim of their offence. The court will consider if the young person is able to pay within a certain amount of time. License disqualification A court can stop a young person from having or getting their driver license for a certain amount of time. More information: Learn more about young people and the justice system (https://www.youthjustice.qld.gov.au/parents-carers/youth-justice-system) Locate your closest youth justice service centre (https://www.youthjustice.qld.gov.au/contact-us/detention-centres) https://www.youthjustice.qld.gov.au/parents-carers/youth-justice-system/sentencing-young-offenders/youth-court-orders 19/20 26/08/2025, 15:30 Youth court orders | Department of Youth Justice and Victim Support Read about how you can help and support a young person (https://www.youthjustice.qld.gov.au/parents-carers/youth-justice-system/supporting- your-child-through-the-youth-justice-system) Sentencing young offenders (https://www.youthjustice.qld.gov.au/parents- carers/youth-justice-system/sentencing-young- offenders) Pre-sentence report (https://www.youthjustice.qld.gov.au/parents-carers/youth- justice-system/sentencing-young-offenders/pre-sentence-report) Youth court orders (https://www.youthjustice.qld.gov.au/parents-carers/youth- justice-system/sentencing-young-offenders/youth-court-orders) Bail and Bail with conditions (https://www.youthjustice.qld.gov.au/parents- carers/youth-justice-system/sentencing-young-offenders/bail-and-bail-with- conditions) Last reviewed: 28 November 2024 Last modified: 28 November 2024  Provide feedback (https://www.families.qld.gov.au/feedback?id=34840) This work is licensed under a Creative Commons Attribution"
Youth court orders _ Department of Youth Justice and Victim Support.pdf,19,young person (https://www.youthjustice.qld.gov.au/parents-carers/youth-justice-system/supporting- your-child-through-the-youth-justice-system) Sentencing young offenders (https://www.youthjustice.qld.gov.au/parents- carers/youth-justice-system/sentencing-young- offenders) Pre-sentence report (https://www.youthjustice.qld.gov.au/parents-carers/youth- justice-system/sentencing-young-offenders/pre-sentence-report) Youth court orders (https://www.youthjustice.qld.gov.au/parents-carers/youth- justice-system/sentencing-young-offenders/youth-court-orders) Bail and Bail with conditions (https://www.youthjustice.qld.gov.au/parents- carers/youth-justice-system/sentencing-young-offenders/bail-and-bail-with- conditions) Last reviewed: 28 November 2024 Last modified: 28 November 2024  Provide feedback (https://www.families.qld.gov.au/feedback?id=34840) This work is licensed under a Creative Commons Attribution 4.0 International (CC BY 4.0) licence (https://creativecommons.org/licenses/by/4.0/) https://www.youthjustice.qld.gov.au/parents-carers/youth-justice-system/sentencing-young-offenders/youth-court-orders 20/20
Pre-sentence report _ Department of Youth Justice and Victim Support.pdf,0,"26/08/2025, 15:31 Pre-sentence report | Department of Youth Justice and Victim Support Department of Youth Justice and Victim Support Sentencing young offenders (https://www.youthjustice.qld.gov.au/parents-carers/youth-justice- system/sentencing-young-offenders) >> Pre-sentence report Pre-sentence report If a court finds a young person guilty of an offence, the magistrate or judge may ask for a pre-sentence report to help them decide what the sentence will be. The report gives the court information about what led a young person to break the law, sentence options, and programs and services available to help them. The court must ask for a report if it is considering giving a young person: an intensive supervision order a conditional release order a detention order. Interview First, a Youth Justice officer interviews you and a young person to try to understand: why a young person broke the law how they feel about it how they feel about any victims. The caseworker may interview you more than once and other people as well. The interview process usually takes about 3 weeks. Questions The Youth Justice officer may ask you about: https://www.youthjustice.qld.gov.au/parents-carers/youth-justice-system/sentencing-young-offenders/pre-sentence-report 1/3 26/08/2025, 15:31 Pre-sentence report | Department of Youth Justice and Victim Support your family the young person’s school or work the offence the young person’s attitude to the victim any consequences or punishment the young person has experienced already the young person’s behaviour since those consequences any other information that the court has requested. The Youth Justice officer might also talk to you about the court’s options for sentencing and whether the young person would agree to them. Viewing the report The Youth Justice officer talks to you about what the final report says but the court decides whether you can see it. Copies go to: the young person’s solicitor the police prosecutor the court. You can also speak to the young person's"
Pre-sentence report _ Department of Youth Justice and Victim Support.pdf,1,"person would agree to them. Viewing the report The Youth Justice officer talks to you about what the final report says but the court decides whether you can see it. Copies go to: the young person’s solicitor the police prosecutor the court. You can also speak to the young person's solicitor about the report. Disagreeing with the report If you have a problem with the report, contact either the Youth Justice officer who wrote it, or their team leader. You can also speak to the young person's solicitor. More information What happens when your child goes to court (https://www.qld.gov.au/law/sentencing- prisons-and-probation/young-offenders-and-the-justice-system/your-child-in-court). https://www.youthjustice.qld.gov.au/parents-carers/youth-justice-system/sentencing-young-offenders/pre-sentence-report 2/3 26/08/2025, 15:31 Pre-sentence report | Department of Youth Justice and Victim Support Sentencing young offenders (https://www.youthjustice.qld.gov.au/parents- carers/youth-justice-system/sentencing-young- offenders) Pre-sentence report (https://www.youthjustice.qld.gov.au/parents-carers/youth- justice-system/sentencing-young-offenders/pre-sentence-report) Youth court orders (https://www.youthjustice.qld.gov.au/parents-carers/youth- justice-system/sentencing-young-offenders/youth-court-orders) Bail and Bail with conditions (https://www.youthjustice.qld.gov.au/parents- carers/youth-justice-system/sentencing-young-offenders/bail-and-bail-with- conditions) Last reviewed: 28 November 2024 Last modified: 28 November 2024  Provide feedback (https://www.families.qld.gov.au/feedback?id=34836) This work is licensed under a Creative Commons Attribution 4.0 International (CC BY 4.0) licence (https://creativecommons.org/licenses/by/4.0/) https://www.youthjustice.qld.gov.au/parents-carers/youth-justice-system/sentencing-young-offenders/pre-sentence-report 3/3"
Your-rights-in-Queensland-when-speaking-to-police.pdf,0,"Your rights in Queensland when speaking to police You should be aware of the following information when speaking to the police whether on the street or at a police station: • You have the right to remain silent1 • The only thing you need to tell police is your name, age and address.2 If a police officer believes you have given a false name, age or address, the officer can insist that you prove who you are.3 The police can charge you if you refuse to give them your correct name, age and address when asked. If you are not sure whether to answer other questions, don’t4 • You must have your driver licence if you are driving on your P or L plates5 • If a police officer is searching or questioning you, you have right to know their name, rank and station, and the reason they are searching or questioning you6 • The police need to tell you a reason or show you a warrant to search you. The police can search you, your bag or your vehicle if they suspect you have illegal drugs, weapons, stolen property, or evidence of offences.7 Do not stop the police from searching you as you could be charged.8 Talk to a lawyer afterwards • You do not have to go with police unless they say you are under arrest or there is a law that states you must go with them (e.g. some traffic matters). You have the right to legal advice.9 The police can arrest you for questioning purposes only if they suspect that you have broken the law. You still do not need to answer questions (except your correct name, age and address)10 • Police must call your parents or guardian if you have been arrested11 • If you"
Your-rights-in-Queensland-when-speaking-to-police.pdf,1,"advice.9 The police can arrest you for questioning purposes only if they suspect that you have broken the law. You still do not need to answer questions (except your correct name, age and address)10 • Police must call your parents or guardian if you have been arrested11 • If you are interviewed by police, you have the right to have a support person (parent, adult friend or youth worker) AND a lawyer with you during the interview. You should tell the police which person 1 Police Powers and Responsibilities Act 2000 (Qld) s 397. 2 Police Powers and Responsibilities Act 2000 (Qld) s 40(1). 3 Police Powers and Responsibilities Act 2000 (Qld) s 40(2). 4 Police Powers and Responsibilities Act 2000 (Qld) ss 790, 791. 5 Transport Operations (Road Use Management) Act 1995 (Qld) s 49. 6 Police Powers and Responsibilities Act 2000 (Qld) ss 19, 20, 31, 32, 158, 160-162. 7 Police Powers and Responsibilities Act 2000 (Qld) ss 29, 30, 150, 157. 8 Police Powers and Responsibilities Act 2000 (Qld) s 790. 9 Police Powers and Responsibilities Act 2000 (Qld) s 421. 10 Police Powers and Responsibilities Act 2000 (Qld) s 40(1). 11 Police Powers and Responsibilities Act 2000 (Qld) s 392. Reviewed 24/07/2025 This sheet is intended to provide general legal information about the law in Queensland. This information is not legal advice. If you have a particular legal problem you should contact a solicitor for legal advice. At the end is a list of agencies that might be able to assist you, including legal agencies. Your rights in Queensland when speaking to police you would like to have with you. If there is no one, the police may arrange a justice of the peace to be there12 • If you are not charged, the police can"
Your-rights-in-Queensland-when-speaking-to-police.pdf,2,"might be able to assist you, including legal agencies. Your rights in Queensland when speaking to police you would like to have with you. If there is no one, the police may arrange a justice of the peace to be there12 • If you are not charged, the police can only detain you for questioning for 8 hours and can interview you for 4 of those hours. Remember, you do not have to answer questions if you do not want to • If you are under 18 and have not been arrested, the police cannot take your fingerprints or photographs unless they get an order from the court, and you have a support person with you13 • If you are found not guilty, or the case against you is dismissed your fingerprints and photographs must be destroyed14 • If you 14 years old or over, you can consent to give a forensic sample to the police. If you are under 14 years old, the police can ask your parents to agree to give some types of samples15 • If you have been charged, the police must get an order from the court if they want to take your DNA (samples, blood or urine)16 Remember to STAY COOL AND CALM and try to write down all the details of what happened. A solicitor can help you lodge a complaint with the Crime and Misconduct Commission if you feel you have been treated unfairly. 12 Police Powers and Responsibilities Act 2000 (Qld) s 421 and Schedule 6 (definition of a ‘support person’). 13 Police Powers and Responsibilities Act 2000 (Qld) s 458; Youth Justice Act 1992 (Qld) s 25. 14 Police Powers and Responsibilities Act 2000 (Qld) s 474(4)(a); Youth Justice Act 1992 (Qld) ss 21, 24A. 15 Police Powers and Responsibilities"
Your-rights-in-Queensland-when-speaking-to-police.pdf,3,"s 421 and Schedule 6 (definition of a ‘support person’). 13 Police Powers and Responsibilities Act 2000 (Qld) s 458; Youth Justice Act 1992 (Qld) s 25. 14 Police Powers and Responsibilities Act 2000 (Qld) s 474(4)(a); Youth Justice Act 1992 (Qld) ss 21, 24A. 15 Police Powers and Responsibilities Act 2000 (Qld) ss 447, 451. 16 Police Powers and Responsibilities Act 2000 (Qld) s 488. Your rights in Queensland when speaking to police Who can I contact for support Youth Advocacy Centre (YAC) www.yac.net.au 3356 1002 Aboriginal & Torres Strait Islander Legal Service (24hrs 7 days a week) www.atsils.org.au 3025 3888 or (free call) 1800 012 255 Logan Youth & Family Legal Service www.yfs.org.au 3826 1500 Legal Aid Queensland www.legalaid.qld.gov.au 1300 651 188 Hub Community Legal www.hubcommunity.org.au 3372 7677 Youth Legal Advice Hotline (Monday – Thursday 8am – 9pm; Friday 8am – Sunday 5pm) 1800 527 527 Community Legal Centres (CLCs) see www.naclc.org.au for your nearest CLC About the Youth Advocacy Centre The Youth Advocacy Centre offers free and confidential legal and social support services for young people in Queensland. www.yac.net.au (07) 3356 1002"
Court-Orders-YAC-Infosheet.pdf,0,"Court orders If you are under 18 and have to go to court, and you agree you did what the police say you did (plead guilty), or the court decides that you did it (finds you guilty), the court can carry out a number of orders. You must agree, before the court can order you to do any of the orders below, except for detention. If you do not agree, the court will give you another order which might include detention. Unsupervised Orders 1. Drug Assessment and Education Session If you are charged with having some small quantities of drugs and utensils, you may be eligible to attend a Drug Assessment and Education Session. You must agree to do this session before the court can order you to go. The session may take about 2 hours. You will be told at court the date and the place where you need to go to see the drug counsellor. If you go to the session, then the matter will not go back to court and a conviction will not be recorded (see the ‘What if I am convicted?’ factsheet for more information). If you do not go to the session, then you must go back to court and another order can be made. 2. Restorative Justice Process Instead of sentencing you, the court can order that you take part in a restorative justice conference or attend an alternative diversion program. At a restorative justice conference, you will have the opportunity to discuss the consequences of committing the offence with the people who were affected by it, such as the victim. You have the right to have a lawyer, an adult member of your family or another adult of your choice with you (for example, a youth worker). Your parent can attend. The"
Court-Orders-YAC-Infosheet.pdf,1,"the consequences of committing the offence with the people who were affected by it, such as the victim. You have the right to have a lawyer, an adult member of your family or another adult of your choice with you (for example, a youth worker). Your parent can attend. The victim or their lawyer and a member of their family may also attend, but the victim does not have to attend. A convenor, who runs the conference, will also be present. At the conference you will be asked to reach an agreement fix the impact of what you did. For example: • agree to pay the victim some money • apologise • do some voluntary work • get some counselling An alternative diversion program is something designed to help you understand the harm caused by your behaviour and give you opportunity to take responsibility for the offence you committed. You must agree to do the program. This sheet is intended to provide general legal information about the law in Queensland. This information is not legal advice. If you have a particular legal problem you should contact a solicitor for legal advice. At the end is a list of agencies that might be able to assist you, including legal agencies. Information sheet - Court orders You can be taken back to court to be resentenced if you do not complete the diversion program, or if you fail to turn up at a conference, or an agreement cannot be worked out, or you do not do what you agreed. You should get legal advice about what a conference or alternative diversion program will mean for you. 3. Reprimand This means a court gives you a warning about your behaviour. The court will usually only do this if it is your first time"
Court-Orders-YAC-Infosheet.pdf,2,"you do not do what you agreed. You should get legal advice about what a conference or alternative diversion program will mean for you. 3. Reprimand This means a court gives you a warning about your behaviour. The court will usually only do this if it is your first time at court or the offence you committed was not very serious. No conviction will be recorded. 4. Good Behaviour Order This requires that you to not break the law for a period of time up to one year. No conviction will be recorded. If you commit an offence while on a Good Behaviour Order, the court will consider that you did not stay out of trouble as you agreed when sentencing you for the new offence/s. 5. Fine. If a court believes you have your own money (for example, because you have a job) then it may order you to pay a sum of money as a punishment. A conviction can be recorded against you. If you do not pay the money in the time given, the court may be able to order you to do some community service. Supervised Orders 6. Graffiti Removal Order If you are at least 12 years old and found guilty of Wilful Damage by Graffiti the court MUST order you to do unpaid work to remove graffiti unless the court believes that, because of your physical or mental capacity, you are not capable of complying with the order. The court may take into account your age, maturity and abilities when determining the length of your order. If the court orders that you be held in detention for a graffiti offence, then you have to do the graffiti removal work when you are released from detention. Length Conditions Age 12 – You must maximum 5hrs"
Court-Orders-YAC-Infosheet.pdf,3,"your age, maturity and abilities when determining the length of your order. If the court orders that you be held in detention for a graffiti offence, then you have to do the graffiti removal work when you are released from detention. Length Conditions Age 12 – You must maximum 5hrs • not break the law • report to Youth Justice within 1 day of the Order being Age 13-14 – made maximum 10hrs • not leave the State of Queensland without approval of Age 15 or older – maximum 20hrs your Youth Justice caseworker • do as the caseworker tells you and perform the work in a satisfactory way and in the time set by the Order • tell the caseworker within 2 days if you change address. Information sheet - Court orders 7. Probation Order The court can order extra conditions to help stop you offending but only if you agree to do the things the court orders. If you do not do what the court has ordered, what your caseworker tells you or you do not comply with the conditions you can be taken back to court (breached) and another order can be made. A conviction can be recorded against you. You will be supervised by a Youth Justice caseworker while you are on the order. Length Conditions Maximum 1 year before a • Cannot break the law Magistrate; • Must follow the reasonable directions of Youth Justice Maximum of 2 years before a Judge, • Must report to, and attend Programs as directed by Youth unless a Serious Offence and then Justice 3 years can be ordered • Cannot leave the State of Queensland without your caseworker’s permission Unless it is an ‘adult crime, adult • Must supply change of address, school, or job to Youth time’"
Court-Orders-YAC-Infosheet.pdf,4,"to, and attend Programs as directed by Youth unless a Serious Offence and then Justice 3 years can be ordered • Cannot leave the State of Queensland without your caseworker’s permission Unless it is an ‘adult crime, adult • Must supply change of address, school, or job to Youth time’ offence (see our ‘adult crime, Justice within 2 business days adult time’ information sheet) then the maximum is 3 years by either a Magistrate or a Judge 8. Community Service Order A court can only give you a Community Service Order if you agree. If you do not finish the work or do not do it properly or do not comply with any of the other conditions in the Order then you may be taken back to court (breached) and another Order can be made. The court will only make this order if the court believes that you are suitable to do community service work and there is suitable work available for you to do. If you have got hassles about your community service and want extra help from your caseworker then it is up to you to ask for help. Also, if you have an interest in doing a particular kind of work, then you should talk to your caseworker to see if it is possible to do community work in this area. Length Conditions Age 13 or 14: Up to 100 hours of community You must service - not leave the State of Queensland without approval of your Youth Justice caseworker Age 15 or older: Up to 200 hours of community - not break the law service - do as the caseworker tells you - tell the caseworker if you change address, your school or job Information sheet - Court orders 9. Intensive Supervision Order If you are"
Court-Orders-YAC-Infosheet.pdf,5,"Youth Justice caseworker Age 15 or older: Up to 200 hours of community - not break the law service - do as the caseworker tells you - tell the caseworker if you change address, your school or job Information sheet - Court orders 9. Intensive Supervision Order If you are under 13, the court may make an Intensive Supervision Order. The court must first get a report about you from a Youth Justice caseworker. This is called a pre-sentence report. The report will outline what you will be required to do under the Order. This is called the ‘program’. You need to understand what you will have to do under the program and you should ask a lawyer to explain the program to you. Before the court can make the Order, the court must know that you are willing to do the program. Length Conditions The program may be for up to six months. You must also comply with the other conditions of the Order: for example, you must: • not leave the State of Queensland without approval of your Youth Justice caseworker • not break the law • do as your caseworker tells you • tell your caseworker if you change address, your school or job. If you do not comply with the conditions of the Order including doing everything you are told to do by your caseworker and under the program then you can be brought back to court and another Order can be made. 10. Restorative Justice Order A court can also order that you take part in a restorative justice conference as part of a Restorative Justice Order (see above Restorative Justice Process). This order will also require you to keep to the same conditions as a Probation Order, until you have done what you agreed"
Court-Orders-YAC-Infosheet.pdf,6,"Order A court can also order that you take part in a restorative justice conference as part of a Restorative Justice Order (see above Restorative Justice Process). This order will also require you to keep to the same conditions as a Probation Order, until you have done what you agreed to do at the conference. The court cannot order a Restorative Justice Order for an ‘adult crime, adult time’ offence (see our ‘adult crime, adult time’ information sheet). If you fail to turn up at a conference, or an agreement cannot be worked out, or you do not do what you agreed, you can be taken back to court and given another order (including detention). Information sheet - Court orders Detention Orders 11. Conditional Release Order If a court thinks that you should be sentenced to detention but is prepared to ‘give you a last chance to stay in the community’ it may make a Conditional Release Order. This is a type of detention order that you do in the community rather than in the detention centre. Before giving you this order, the court must get a report about you from Youth Justice (this is called a Pre-sentence Report). You must agree to the order. A conviction can be recorded against you. This order will mean that you will have to take part in an intensive, strictly supervised community program. If you do not do everything you are told to do by your caseworker or comply with the conditions of the Conditional Release Order then the court can order you to spend some time in a youth detention centre. Length Conditions Up to 7 days per week, for a period not more than You must 3 months - not break the law - not leave the State of Queensland without"
Court-Orders-YAC-Infosheet.pdf,7,"the Conditional Release Order then the court can order you to spend some time in a youth detention centre. Length Conditions Up to 7 days per week, for a period not more than You must 3 months - not break the law - not leave the State of Queensland without approval of your Youth Justice caseworker - do as your caseworker tells you - tell your caseworker if you change address, your school or job. 12. Detention Order A court can order you to spend time in a youth detention centre, which is a jail for people under 18. The court must first get a report about you from a Youth Justice caseworker. This is called a pre-sentence report. If you are found guilty of an offence by a Magistrate then generally you can be sentenced to detention for up to 12 months. If you are found guilty of an ‘adult crime, adult time’ offence then you can be sentenced to detention for up to 3 years (see our ‘adult crime, adult time’ information sheet). If you are found guilty of an offence before a Judge, depending on how serious the charge is, they can sentence you to a number of years in detention. The time varies and, in some circumstances, (for example, murder) you can be sentenced to life in detention. If you are found guilty of an ‘adult crime, adult time’ offence then you can be sentenced to detention for the same maximum period that an adult can be sent to prison (see our ‘adult crime, adult time’ information sheet). If you are on a Detention Order less than life, you must be released from detention after being there for 70% of your sentence (for example, if sentenced to 12 months, you would spend 8.5 months in custody)."
Court-Orders-YAC-Infosheet.pdf,8,"be sent to prison (see our ‘adult crime, adult time’ information sheet). If you are on a Detention Order less than life, you must be released from detention after being there for 70% of your sentence (for example, if sentenced to 12 months, you would spend 8.5 months in custody). A court can also order an earlier release date (up to 50% of your sentence). Unless you are sentenced for an ‘adult crime, adult time’ offence, the court can order your release at any time. When you are released, you will be put on a Supervised Release Order. You must also comply with the other conditions of the order. For example you must: • not leave the State of Queensland without approval of your Youth Justice caseworker • not break the law • do as your caseworker tells you • tell your caseworker if you change address, your school or job. Information sheet - Court orders If the caseworker believes you have not done what you were required to do under the Supervised Release Order or you do not comply with the conditions you may be required to go back to court. The caseworker must warn you before taking you back to court. The court may order you to spend the rest of your sentence in detention. After you turn 18, you will be transferred to an adult prison (see our ‘adult crime, adult time’ information sheet). If you have previously been sentenced to at least one detention order for certain serious offences, the Court can declare that you are a ’serious repeat offender’. The Court must consider the pre-sentence report and the following: • your previous criminal and bail history • attempts you have made to rehabilitate; and • other factors the Court sees as relevant. The Court after"
Court-Orders-YAC-Infosheet.pdf,9,"certain serious offences, the Court can declare that you are a ’serious repeat offender’. The Court must consider the pre-sentence report and the following: • your previous criminal and bail history • attempts you have made to rehabilitate; and • other factors the Court sees as relevant. The Court after considering the above matters, can only declare that you are ‘serious repeat offender’ if it thinks there is a high probability you will commit a further offence. If you are declared a serious repeat offender, the declaration will remain current for 12 months. It will also impact how the Court sentences you especially if you commit further certain serious offences during this period. Breaching an Order You may be required to go back to court (breached) if your caseworker believes that you have not done what you were supposed to do under your: • Graffiti Removal Order • Probation Order • Community Service Order • Intensive Supervision Order • Conditional Release Order • Supervised Release Order • Restorative Justice Order You should see a lawyer. If the court believes that you breached your order the court may: • allow you to continue on the order • change the conditions of your order or make it longer (except for a Supervised Release Order) • make a different order for your charges (except for a Supervised Release Order) • for a Supervised Release Order, the court can return you to detention Information sheet - Court orders What happens if I'm convicted? If you are found guilty of an offence and a conviction is recorded, that is formally noted, you will have a criminal record. This means that even after you turn 18 people can be told about this offence. This may cause problems, for example, when you try to get a job"
Court-Orders-YAC-Infosheet.pdf,10,"you are found guilty of an offence and a conviction is recorded, that is formally noted, you will have a criminal record. This means that even after you turn 18 people can be told about this offence. This may cause problems, for example, when you try to get a job or want to travel overseas. If you do not break the law again for five years, in some situations you may be able to say that you have no conviction. You must see a lawyer before you say this to make sure this is correct for your situation as there are many circumstances after 5 years where this will not apply. You could be committing an offence of fraud by wrongly denying you have a conviction. When can I be sent to jail? You cannot be sent to an adult jail if you are under 18, but you can be sent to a youth detention centre. Once you turn 18 you will be moved an adult prison. If you are moved to an adult jail, you must still be released on the date your Supervised Release Order would have started (see the section Make a Detention Order). You may be placed on parole. Parole means being allowed to live in the community under the supervision of a parole officer for the rest of your sentence. If you do not do what you are told by the parole officer or your Parole Order, you can be sent back to prison. If you are sentenced to life imprisonment, the rules for adults surrounding parole apply. Can I be made to go to counselling? If the court orders you to go to counselling (eg. for drugs/alcohol) then you must go, but the court will only make this type of order if you agree."
Court-Orders-YAC-Infosheet.pdf,11,"you are sentenced to life imprisonment, the rules for adults surrounding parole apply. Can I be made to go to counselling? If the court orders you to go to counselling (eg. for drugs/alcohol) then you must go, but the court will only make this type of order if you agree. If you do not agree, the court may consider another type of order, including detention. You may be ordered to attend counselling under the following: • Drug Diversion Assessment Program • Probation Order • Conditional Release Order • Intensive Supervision Order Can I be ordered to pay restitution or compensation? A court can make you pay for any damage done, such as the cost of replacing damaged property or for medical costs or compensation for injury. A court can only do this if you have the money to pay for it. Restitution or compensation is not a sentence; it is for the victim of the offence to be paid for what they have lost or suffered and so the court can also make one of the other Orders listed above at the same time. Your parents can also be ordered to pay for damage or injury caused by you if it seems you broke the law because your parents did not supervise you properly. Information sheet - Court orders Treated unfairly? If you think that you were wrongly found guilty or that your sentence was unfair, you need to talk to your solicitor immediately about an appeal - getting a (different) Judge to look at your case again. You only have a short time to ask for this to happen. If you think you are not being fairly treated on a Conditional Release, Probation, Community Service or Intensive Supervision Order, you should tell your caseworker. If you are still not"
Court-Orders-YAC-Infosheet.pdf,12,"(different) Judge to look at your case again. You only have a short time to ask for this to happen. If you think you are not being fairly treated on a Conditional Release, Probation, Community Service or Intensive Supervision Order, you should tell your caseworker. If you are still not happy you may wish to speak to a solicitor. If you have a complaint about your treatment in detention, ask to speak to the manager, the community visitor or ask to contact your solicitor. If you think that your solicitor has not done their best for you, talk to them about it. If you are still unhappy, you can complain to the Queensland Law Society - talk to one of the agencies under ‘Who can help’ about this. If you are under 18 and have to go to court, and you agree you did what the police say you did (plead guilty), or the court decides that you did it (finds you guilty), the court can carry out a number of Orders. You must agree, before the court can order you to do any of the orders below, except for detention. If you do not agree, the court will give you another order which might include detention. Who can I contact for support? Youth Advocacy Centre (YAC) www.yac.net.au 3356 1002 Brisbane Childrens Court brisbane.childrenscourt@justice.qld.gov.au 3235 9841 Hub Community Legal www.communitylegal.org.au 3372 7677 YFS Legal www.yfs.org.au 3826 1500 Legal Aid Queensland www.legalaid.qld.gov.au 1300 651 188 Youth Legal Advice Hotline 1800 527 527 Aboriginal & Torres Strait Islander Legal Service www.atsils.org.au 3025 3888 or (free call) 1800 012 255 (24hrs 7 days a week) Translating & Interpreting Services (24hrs) 131 450 Community Legal Centres (CLCs) see www.naclc.org.au for your nearest CLC Note: This sheet was last reviewed and updated in December 2024."
Court-Orders-YAC-Infosheet.pdf,13,527 Aboriginal & Torres Strait Islander Legal Service www.atsils.org.au 3025 3888 or (free call) 1800 012 255 (24hrs 7 days a week) Translating & Interpreting Services (24hrs) 131 450 Community Legal Centres (CLCs) see www.naclc.org.au for your nearest CLC Note: This sheet was last reviewed and updated in December 2024. The Youth Advocacy Centre does not accept responsibility for any action or outcome as a result of anyone relying on the information provided. Information sheet - Court orders About the Youth Advocacy Centre The Youth Advocacy Centre offers free and confidential legal and social support services for young people in Queensland. www.yac.net.au (07) 3356 1002
If-I-am-Charged-Updated-January-2024WM1.pdf,0,"IF I AM CHARGED This sheet is intended to provide general legal information about the law in Queensland. It is not legal advice. If you have a particular legal problem you should contact a solicitor for legal advice. At the end is a list of agencies that might be able to assist you, including legal agencies. What happens if the police believe I have broken the law? If you are under 18 and the police believe you have broken the law, then they can take you to court for your matter to be dealt with. What if the police decide to take me to court? The police will consider the following in deciding whether to charge and send you to court: • whether you admitted you broke the law • how much trouble you have been in, in the past • how serious the matter is. If the police: • Summons you: you are allowed to leave the police station but later the police will bring some papers (the summons) around to you. These papers will tell you where and when you must go to court; or • Give you a Notice to Appear: they give you a form (Notice to Appear) ‘on the spot’ and will tell you when and where you must go to court. If you are given a Notice to Appear the police must make a reasonable effort to contact your parents, the police must take note if they cannot contact your parents, or • Arrest and charge you: this means you are not free to leave, and if you are not already at the police station, you will be taken there. The police will usually fingerprint and photograph you and decide whether to let you go until your court date (give you bail). You should"
If-I-am-Charged-Updated-January-2024WM1.pdf,1,"and charge you: this means you are not free to leave, and if you are not already at the police station, you will be taken there. The police will usually fingerprint and photograph you and decide whether to let you go until your court date (give you bail). You should ask the police to give you a Notice to Appear if you think they are going to arrest and charge you. If you are arrested the police have tUo makeN a reasDonable Eeffort tRo conta ct yRour parEents. TVhe polIiceE must rWecord if they cannot contact your parents. What about bail? If you are arrested and charged and the police do not want to give you bail (they do not want to let you go until you go to court) you can ask to make a phone call to someone who may be able to help you. If you are unsure who to call, you can phone one of the agencies under ‘Who can help?’ If bail is refused and you are under 18 you should be placed in a youth detention centre or watch house. When you get to court, you can ask the court to give you bail until your case is resolved. What if I am put in a watch house? If you are under 18, the police should make sure you are: • separated from adults (unless the police think it is better for you that you be with an adult) • safe at all times • not kept in a watch house longer than is necessary (if you cannot be taken to court, you must be taken to a youth detention centre). If it is impossible to get you to a youth detention centre the next day, you should not be in a watch house"
If-I-am-Charged-Updated-January-2024WM1.pdf,2,"• not kept in a watch house longer than is necessary (if you cannot be taken to court, you must be taken to a youth detention centre). If it is impossible to get you to a youth detention centre the next day, you should not be in a watch house longer than is necessary. Fingerprints, palm prints and photographs? The police can take your fingerprints, palm prints, footprints and voiceprints (‘identifying particulars’), and photograph you and any tattoos, old and new injuries and other things on your body that may be used to identify you if you are arrested and charged. They can also take your photograph at the place where you are arrested. If you are given a summons or Notice to Appear and the police want to take your prints, they will have to get a Court Order. You can argue that you should not have to give the prints and you should get a lawyer © Youth Advocacy Centre Inc 1 to help you. If the court orders you to give your prints and you do not do so, you can be charged and the police can arrest you. If you give your prints under a Court Order you must have one of the people listed under ‘Who can I have with me during a police questioning?’ with you. Can the police keep my prints & photographs? If you were arrested and charged and you have not been in trouble for other offences, then your prints and photographs must be destroyed if: • the police decide later not to take your case to court • the court decides you did not break the law. If the court ordered you to give your prints and you have not been in trouble for other offences, they must be destroyed"
If-I-am-Charged-Updated-January-2024WM1.pdf,3,"photographs must be destroyed if: • the police decide later not to take your case to court • the court decides you did not break the law. If the court ordered you to give your prints and you have not been in trouble for other offences, they must be destroyed if: • the court decides you did not break the law • the court decides you did break the law but dismisses the charge/s and gives you a Caution or a Restorative Justice Process (which you successfully complete). Should I get legal advice? If the police want to arrange for you and your parent to come down to the police station to be questioned, then you should get legal advice before you attend an interview. It is useful to have a lawyer with you during the police questioning. If you have to go to court you should get legal advice. This will help you to understand if you have broken the law, and what your choices are in answering questions. If you are in a youth detention centre, you can ask your caseworker to arrange for you to get legal advice. If you have not been able to see a lawyer before going to court, it is important that you see the duty lawyer at court toU get somNe advicDe abouEt your cRase. REVIEW Legal Aid has a Youth Legal Advice Hotline which you can call from anywhere in Queensland to speak to a lawyer for free (see ‘Who can help’ below for details). For more details about the type of orders the court can make if you are guilty of a crime, see our fact sheet ‘Court Orders.’ What about security officers? Security officers are not police officers and do not have the same powers. For example, they can"
If-I-am-Charged-Updated-January-2024WM1.pdf,4,"help’ below for details). For more details about the type of orders the court can make if you are guilty of a crime, see our fact sheet ‘Court Orders.’ What about security officers? Security officers are not police officers and do not have the same powers. For example, they can arrest you for breaking the law (as can anyone), but they will need to be very sure you have committed an offence or you can take them to court for false arrest and assault. If they do arrest you, they must hand you over to the police as soon as possible. They cannot search you, take your prints or do other things the police have the power to do. Security can order you to leave private property (which includes shopping centres) and use reasonable force to make you leave if you do not go when you are asked. At Southbank in Brisbane, security officers have special powers to ban people from the park. By law, a person cannot work as a security officer or bouncer if they ‘show dishonesty or a lack of integrity, use harassing tactics or have been convicted of a criminal offence’. You do not have to give your personal details to a security guard. Some exceptions apply to this general rule. Security guards can ask for ID for proof of age if they believe that you are below 18 and on a licenced premise. You are also required to provide your name and address if you are trespassing. Treated unfairly? By police: The police should treat you fairly and politely. If they do not, you have the right to complain about it without the threat of being harassed. © Youth Advocacy Centre Inc 2 It is a good idea to write down exactly what happened including"
If-I-am-Charged-Updated-January-2024WM1.pdf,5,"are trespassing. Treated unfairly? By police: The police should treat you fairly and politely. If they do not, you have the right to complain about it without the threat of being harassed. © Youth Advocacy Centre Inc 2 It is a good idea to write down exactly what happened including time and date and the names of any witnesses and the police involved. If you were hurt, try to get to a hospital or to a doctor as soon as possible and take colour photographs of the injuries. You can complain to the Commissioner of Police (131 444) who must investigate, or the Crime and Corruption Commission (07 3360 6060) which is not part of the police service. By security officers: if you have been treated unfairly by a security officer or a bouncer you should make a complaint as soon as you can to the manager of the place you are in (such as a nightclub or the centre manager of the shopping centre). If you are at Southbank go to the corporation’s management office (near ‘Southbank Streets Beach’ on site) and complain to the manager. If you have been excluded from Southbank you are able to ask a tribunal (QCAT) to review the decision. For advice about this see ‘Who can help’ below for details. Remember to stay cool and calm and do as you are directed and then phone the manager. As soon as you can you should write down everything you remember about: • what happened • the time and date • the name of any witnesses • any details about the security guards involved (names and a description). If you were hurt try to get to a hospital or doctor as soon as possible and take colour photographs of your injuries. You should also make"
If-I-am-Charged-Updated-January-2024WM1.pdf,6,"• the time and date • the name of any witnesses • any details about the security guards involved (names and a description). If you were hurt try to get to a hospital or doctor as soon as possible and take colour photographs of your injuries. You should also make your complaint to the police and the Office of Fair Trading (OFT). OFT must investigate the complaint and the security officer/bouncer could lose their job if OFT is satisfied they acted in an inappropriate manner under the law. This could include being found guilty of a criminal offence (such as assaulting you). UNDER REVIEW If you want help or advice to make a complaint against police or security officers/bouncers, contact one of the agencies below. Who can help? Youth Advocacy Centre (YAC) www.yac.net.au ................................................................................. 3356 1002 Youth Legal Advice Hotline ................................................................................................................. 1800 527 527 (Monday - Thursday 8am – 9pm; Friday 8am – Sunday 5pm) Hub Community Legal www.hubcommunity.org.au .................................................................................. 3372 7677 Logan Youth & Family Legal Service www.yfs.org.au ......................................................................... 3826 1500 Legal Aid Queensland www.legalaid.qld.gov.au .................................................................................. 1300 651 188 Aboriginal & Torres Strait Islander Legal Service www.atsils.org.au ................................................... 3025 3888 or (24hrs 7 days a week) 1800 012 255 (Free call) Translating & Interpreting Services (24hrs) ......................................................................................... 131 450 Community Legal Centres (CLCs) see www.naclc.org.au for your nearest CLC This information was last reviewed and updated in January 2024. The Youth Advocacy Centre does not accept responsibility for any action or outcome as a result of anyone relying on the information provided. © Youth Advocacy Centre Inc 3"
If-I-am-Charged-Updated-January-2024WM1.pdf,7,the information provided. © Youth Advocacy Centre Inc 3
Detention centre rules _ Department of Youth Justice and Victim Support.pdf,0,"26/08/2025, 15:38 Detention centre rules | Department of Youth Justice and Victim Support Department of Youth Justice and Victim Support Life for young people in a detention centre (https://www.youthjustice.qld.gov.au/parents-carers/youth- detention/life-for-young-people-in-a-detention-centre) >> Detention centre rules Detention centre rules If a young person is sentenced to a detention order (https://www.youthjustice.qld.gov.au/parents-carers/youth-justice-system/sentencing- young-offenders/youth-court-orders#detention-orders-34867-355), they will go to a youth detention centre (https://www.youthjustice.qld.gov.au/parents-carers/youth- detention/about). If a young person is remanded in custody, they will also go to a youth detention centre. In detention, a young person is expected to: be respectful be safe be responsible be active. This means as part of their day-to-day life in detention they will: go to school take part in programs show respect to staff and other young people follow staff instructions do chores in their unit use good manners maintain good hygiene go to bed at bedtime. By following the rules and programs in detention they must not: https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/life-for-young-people-in-a-detention-centre/detention-centre-rules 1/5 26/08/2025, 15:38 Detention centre rules | Department of Youth Justice and Victim Support refuse to go to school refuse to engage in programs graffiti or damage property swear at or verbally abuse other people bully, be aggressive or harm other people stir other young people up to be aggressive, harm other people or damage property have inappropriate physical contact with other young people. Behaviour support Effective behaviour support in youth detention centres is critical to the safety and wellbeing of young people and staff. Behaviour support establishes appropriate expectations. It provides privileges and incentives for positive behaviour and ensures there are appropriate consequences for inappropriate behaviour. It also gives young people the chance to take responsibility for their behaviour and learn about the impact of their actions on others. Behaviour support in youth detention is built on trauma-informed practice principles and is tailored to each young person’s individual needs."
Detention centre rules _ Department of Youth Justice and Victim Support.pdf,1,"there are appropriate consequences for inappropriate behaviour. It also gives young people the chance to take responsibility for their behaviour and learn about the impact of their actions on others. Behaviour support in youth detention is built on trauma-informed practice principles and is tailored to each young person’s individual needs. To understand the support each young person needs we consider their: personal circumstances age culture gender developmental level abilities/disabilities cognitive functioning. Positive behaviour Youth detention staff will help a young person be aware of their behaviour and encourage them to make good decisions by promoting and reinforcing good behaviour. https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/life-for-young-people-in-a-detention-centre/detention-centre-rules 2/5 26/08/2025, 15:38 Detention centre rules | Department of Youth Justice and Victim Support We will always treat young people with respect and dignity, encouraging a young person to treat others with respect and dignity too. When a young person demonstrates positive behaviour, they can earn access to rewards and incentives like special activities. Inappropriate behaviour A young person has rights (https://www.youthjustice.qld.gov.au/parents-carers/youth- detention/life-for-young-people-in-a-detention-centre/your-childs-rights-in-detention), including human rights, while they are in detention. We will not take away a young person’s basic rights and entitlements to punish them. There will be consequences if young people behave inappropriately at the centre. If a young person breaks the rules or behaves inappropriately, they will lose privileges. They may also have to do restorative activities, such as cleaning up graffiti. A young person’s consequences will not include: being deprived of sleep, food or visitors physical punishment including being separated from other young people shaming or bullying having mail kept from them losing access to a telephone or other communication being excluded from cultural, educational or vocational programs. Youth detention staff may use reasonable force to protect each young person, other people or property if a young person is behaving in a way that could hurt"
Detention centre rules _ Department of Youth Justice and Victim Support.pdf,2,"bullying having mail kept from them losing access to a telephone or other communication being excluded from cultural, educational or vocational programs. Youth detention staff may use reasonable force to protect each young person, other people or property if a young person is behaving in a way that could hurt someone. Staff may also need to limit a young person’s access to certain objects or areas of the centre to keep everyone safe if a young person’s behaviour has the potential to hurt someone. Offending A young person may be charged with a criminal offence and must go to court if they break the law while in detention, including if they: https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/life-for-young-people-in-a-detention-centre/detention-centre-rules 3/5 26/08/2025, 15:38 Detention centre rules | Department of Youth Justice and Victim Support assault someone, including a staff member or another young person sexually harass someone, including a staff member or another young person discriminate against someone, including a staff member or another young person deliberately damage property, including breaking things or graffiti touch or damage fire alarms, sprinklers, cameras or security devices in the centre. More information Find out more about daily life in detention (https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/life-for-young- people-in-a-detention-centre/routine-in-detention). Read about programs and supports to help change a young person’s behaviour (https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/helping-young- people-in-detention). Life for young people in a detention centre (https://www.youthjustice.qld.gov.au/parents- carers/youth-detention/life-for-young-people-in-a- detention-centre) Routine in detention (https://www.youthjustice.qld.gov.au/parents-carers/youth- detention/life-for-young-people-in-a-detention-centre/routine-in-detention) Detention centre rules (https://www.youthjustice.qld.gov.au/parents-carers/youth- detention/life-for-young-people-in-a-detention-centre/detention-centre-rules) Your child's rights in detention (https://www.youthjustice.qld.gov.au/parents- carers/youth-detention/life-for-young-people-in-a-detention-centre/your-childs- rights-in-detention) Last reviewed: 28 November 2024 Last modified: 28 November 2024  Provide feedback (https://www.families.qld.gov.au/feedback?id=34918) https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/life-for-young-people-in-a-detention-centre/detention-centre-rules 4/5 26/08/2025, 15:38 Detention centre rules | Department of Youth Justice and Victim Support This work is licensed under a Creative Commons Attribution 4.0 International (CC BY 4.0) licence (https://creativecommons.org/licenses/by/4.0/) https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/life-for-young-people-in-a-detention-centre/detention-centre-rules 5/5"
Detention centre rules _ Department of Youth Justice and Victim Support.pdf,3,"26/08/2025, 15:38 Detention centre rules | Department of Youth Justice and Victim Support This work is licensed under a Creative Commons Attribution 4.0 International (CC BY 4.0) licence (https://creativecommons.org/licenses/by/4.0/) https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/life-for-young-people-in-a-detention-centre/detention-centre-rules 5/5"
Bail.pdf,0,"Bail What is bail? If you are arrested and charged with an offence then you may be: • held in custody until your next court date OR • you may be granted bail, which means that you can live in the community, until your next court date. Bail is a written agreement (you have to consent) that you will come to court on your next court date. If you don’t agree to some of the conditions then you may not get bail. When do I get bail? If you are arrested and charged by police, they can give you bail.1 If the police do not give you bail then you can ask the court to give you bail.2 For help with a bail application, speak to a lawyer. See ‘who can help’ at the end of this sheet. How do I get a lawyer to help me get bail? You can call one of the legal services listed at the end of this fact sheet and they may be able to help you. If you are in custody, the police must tell a legal service that they want to question you (the legal service is free). What does the court or police think about when deciding whether to give me bail? The court or police will think about: • will you come to your next court date? • will you break the law (commit an offence) while you are on bail? • will you be a danger to someone or to the community generally? • will you speak to a witness in your matter or try to interfere with the police looking into your matter?3 The court or police will also consider: • how serious the charges are • your criminal history • who you spend time with (for example"
Bail.pdf,1,"to the community generally? • will you speak to a witness in your matter or try to interfere with the police looking into your matter?3 The court or police will also consider: • how serious the charges are • your criminal history • who you spend time with (for example online groups who promote violence) • your home environment • whether you have a job 1 Bail Act 1980 (Qld) s 7; Youth Justice Act 1992 (Qld) s 47. 2 Bail Act 1980 (Qld) s 8. 3 Youth Justice Act 1992 (Qld) s 48AAA. Reviewed 07/02/2025 This sheet is intended to provide general legal information about the law in Queensland. This information is not legal advice. If you have a particular legal problem you should contact a solicitor for legal advice. At the end is a list of agencies that might be able to assist you, including legal agencies. Bail • if you have had bail in the past, you came to court when you should have, or you breached any conditions • how much evidence the police have that you broke the law • the sentence you might get if you are found guilty • your age and maturity • anything told to the court by a representative of a community justice group in your community if you are an Aboriginal and/or Torres Strait Islander person4 If you do not have accommodation or family to support you and keep you safe this cannot be the only reason for the court to refuse bail.5 The court must refuse bail if it decides: • that there is an unacceptable risk you will commit an offence that endangers the safety of the community, or another person • and that any bail condition will not change this.6 What if my life is at"
Bail.pdf,2,"court to refuse bail.5 The court must refuse bail if it decides: • that there is an unacceptable risk you will commit an offence that endangers the safety of the community, or another person • and that any bail condition will not change this.6 What if my life is at risk if I’m granted bail? If the court or police have no way to keep you safe other than by keeping you in custody, because your life is at risk due to the offence you committed, then you will likely not be granted bail.7 What conditions can be put on my bail? The court or police can give you bail with conditions that you must follow.8 These conditions could be that: • you live at a certain place • you have a curfew during certain hours of the night (that means you are not allowed out of your house during those hours) • someone pays a certain amount of money if you don’t show up to court • you do not contact a particular person • you stay away from a certain place • you regularly check in at a youth justice service centre and sometimes a police station • you wear an electronic monitoring device (EMD). Can I get an Electronic Monitoring Device (EMD)? You can only be ordered to wear an EMD if: • Youth justice assess that you are suitable • you have previously been found guilty of certain offences9 • you are 15 years of age and older 4 Youth Justice Act 1992 (Qld) s 48AA. 5 Youth Justice Act 1992 (Qld) s 48AE(3). 6 Youth Justice Act 1992 (Qld) s 48AAA(2). 7 Youth Justice Act 1992 (Qld) s 48AE(2). 8 Youth Justice Act 1992 (Qld) s 52. 9 Youth Justice Act 1992 (Qld) s 52AA(1)(c)(ii)."
Bail.pdf,3,"and older 4 Youth Justice Act 1992 (Qld) s 48AA. 5 Youth Justice Act 1992 (Qld) s 48AE(3). 6 Youth Justice Act 1992 (Qld) s 48AAA(2). 7 Youth Justice Act 1992 (Qld) s 48AE(2). 8 Youth Justice Act 1992 (Qld) s 52. 9 Youth Justice Act 1992 (Qld) s 52AA(1)(c)(ii). Bail • you live and go to court in certain places • you have been charged with certain offences.10 You do not have to agree to wear a EMD, but if you refuse wear an EMD you might not be given bail and you might have to stay in custody until your next court date. What is a Conditional Bail Program (CBP)? If the police do not grant you bail, the court might give you bail with a Conditional Bail Program (CBP). A CBP is a program of activities (often 5-6 days a week) that you must do. You do not have to agree to do a CBP, but if you refuse to do a CBP you might not be given bail and you might have to stay in custody until your next court date. Can I get my bail conditions changed? Yes, you can. If you want to get your bail conditions changed (for example because you are changing address) speak to your lawyer about this. How do I find out what my bail conditions are? Your bail conditions are on the piece of paper you signed. You, your lawyer, or a trusted adult can contact the court or police who gave you bail to check what your bail conditions are. I have breached my bail conditions, what should I do? You should speak to a lawyer as soon as possible. You may be able to have your bail continued with a lawyer’s help. In the meantime, it is"
Bail.pdf,4,"police who gave you bail to check what your bail conditions are. I have breached my bail conditions, what should I do? You should speak to a lawyer as soon as possible. You may be able to have your bail continued with a lawyer’s help. In the meantime, it is very important to keep following your bail conditions. What if I am charged with another offence when I am already on bail? If you are on bail and you are charged with another offence, it is usually very difficult to get bail again. What if I do not get bail at court? If the Childrens Court Magistrate does not give you bail, then you can apply to a Childrens Court Judge for bail.11 Speak to a lawyer about this. Can I be released without bail? Yes, the police or a court can release you without bail.12 If they release you without bail they will place a condition on your release that you come to your next court date.13 Can I leave the state on bail? Yes, unless there is a condition on your bail that says you are not to leave the state. If you are not sure speak to your lawyer. 10 Youth Justice Act 1992 (Qld) s 52A(5), 52AA. 11 Youth Justice Act 1992 (Qld) s 59. 12 Youth Justice Act 1992 (Qld) ss 50, 51 & 55. 13 Youth Justice Act 1992 (Qld) ss 51, 55(2). Bail Who can I contact for support Youth Advocacy Centre (YAC) www.yac.net.au 3356 1002 Aboriginal & Torres Strait Islander Legal Service (24hrs 7 days a week) www.atsils.org.au 3025 3888 or (free call) 1800 012 255 Logan Youth & Family Legal Service www.yfs.org.au 3826 1500 Legal Aid Queensland www.legalaid.qld.gov.au 1300 651 188 Hub Community Legal www.hubcommunity.org.au 3372 7677 Youth Legal Advice Hotline"
Bail.pdf,5,www.yac.net.au 3356 1002 Aboriginal & Torres Strait Islander Legal Service (24hrs 7 days a week) www.atsils.org.au 3025 3888 or (free call) 1800 012 255 Logan Youth & Family Legal Service www.yfs.org.au 3826 1500 Legal Aid Queensland www.legalaid.qld.gov.au 1300 651 188 Hub Community Legal www.hubcommunity.org.au 3372 7677 Youth Legal Advice Hotline (Monday – Thursday 8am – 9pm; Friday 8am – Sunday 5pm) 1800 527 527 Community Legal Centres (CLCs) see www.naclc.org.au for your nearest CLC About the Youth Advocacy Centre The Youth Advocacy Centre offers free and confidential legal and social support services for young people in Queensland. www.yac.net.au (07) 3356 1002
Move-On-Updated-July-2023WM1.pdf,0,"MOVE ON This sheet is intended to provide general legal information about the law in Queensland. It is not legal advice. If you have a particular legal problem you should contact a solicitor for legal advice. At the end is a list of agencies that might be able to assist you, including legal agencies. Shopping centres, parks and other public spaces are used by young people to hang out, meet friends and get from place to place. Young people and the things they do are often judged because they are in groups and use public space differently to adults. These views alongside the way they dress, the way they look, and what they do all impact on how they are treated. When can the police ask me to ‘move on’? You can be asked to move on if the police ‘reasonably suspect’ that your behaviour (or just you being where you are): • is causing or has caused anxiety to someone and that feeling of anxiety is reasonable in the cirucumstances • is or has been getting in the way of people going in or out of somewhere • is disrupting or has disrupted an event, entertainment or a gathering place and you are in or near: • a ‘public place’ • a ‘prescribed place’ – places which are named in the ‘move on’ laws • any Government owned place that has its own laws which say you can be moved on: for example, Southbank Parklands. The police can also move you on at these places if they believe your behaviour is, or has been, disorderly, indecent, offensive or threatening (for example swearing at or threatening someone goingU into or Nleaving Dplaces Elike shoRpping c enRtres) or EbecausVe yourI beEhaviouWr makes them believe you are soliciting for prostitution. What is"
Move-On-Updated-July-2023WM1.pdf,1,"move you on at these places if they believe your behaviour is, or has been, disorderly, indecent, offensive or threatening (for example swearing at or threatening someone goingU into or Nleaving Dplaces Elike shoRpping c enRtres) or EbecausVe yourI beEhaviouWr makes them believe you are soliciting for prostitution. What is a ‘public place’ ? • anywhere which is not owned specifically by someone where people are legally able to go such as a road, park or beach • anywhere which is private property but which is often open to the public such as a café, shopping centre, restaurant or cinema. What is a ‘prescribed place’? • Shop • Child care centre, preschool and school • Hotel or place that sells alcohol • Railway station or land • ATM • Mall, for example Brisbane – China Town o Brisbane – City Mall o Ipswich – Ipswich Mall o Townsville – Townsville Mall o Gold Coast – Cavill Avenue o • Racecourse • War Memorial For example, you can be moved on by a police officer if a shop owner complains and you are blocking the entrance to a shop or disrupting the business in another way. What happens if the police want to move me on? If a police officer reasonably believes the situation allows them to direct you to move on, then you can be given a direction by the police officer to leave the area for up to 24 hours. The police officer must tell you why you are being moved on. If you do not leave then the police can charge you with not © Youth Advocacy Centre Inc 1 complying with a lawful direction. If you are charged with this, it is a good idea to get some legal advice about your situation before you go to"
Move-On-Updated-July-2023WM1.pdf,2,"being moved on. If you do not leave then the police can charge you with not © Youth Advocacy Centre Inc 1 complying with a lawful direction. If you are charged with this, it is a good idea to get some legal advice about your situation before you go to court. The police officers can only move you a reasonable distance away. It is not reasonable to move you 100m if you are blocking the doorway of a shop, for example. Security and local council officers do not have the powers of police officers to move you from public or private places but they can ask you to leave and call the police if you do not go. Can security officers and local council officers move me on? Generally, security and local council officers do not have the powers of police officers to move you from public or private places, but they can ask you to leave and call the police if you do not go. If they are ‘protective services officers’ who provide security for Government buildings and connected surrounding areas, they have similar powers of police to move you on. They can do this if you: • Behave in a disorderly, indecent, offensive or threatening way to persons entering, at or leaving the building; or • Refuse to provide your name, address and reason for entering the building. • Refuse the officer’s request to be subject to security screening processes. • Do not have a lawful reason to enter or be at the building. If the protective services officer reasonably believes the situation allows them to move you on, they can direct you to leave the building or its outside precincts for up to 24 hours and use reasonable force if necessary to remove you from the building."
Move-On-Updated-July-2023WM1.pdf,3,"enter or be at the building. If the protective services officer reasonably believes the situation allows them to move you on, they can direct you to leave the building or its outside precincts for up to 24 hours and use reasonable force if necessary to remove you from the building. What should I do if asked to move on? Whether you decide to move on or not, remember to stay cool and calm. You can ASK the police why you are bUeing mNoved oDn. It isE a goRod idea toR write dEown eVverythIingE you reWmember about what happened in case you want to do something about it later. Information that you can write down can include: • Date and time • Where it happened • What happened: • Name of anyone who saw what happened • Name and badge number of police officers Treated unfairly? If you think the police treated you unfairly in moving you on, you can contact YAC on 3356 1002 for further information and advice. If you want to complain about being moved on by security or the way you were treated by security, you should contact the Office of Fair Trading on 13 74 68. If you think the move on power laws are unfair, you can contact your State Politician (listed in the front of the White pages under government information) and tell them you think that the laws are unfair and that the law should be changed. Who can help? If you need legal advice or want help in making a complaint, you can contact one of the agencies listed below: Youth Advocacy Centre (YAC) www.yac.net.au ...................................................................... 3356 1002 Hub Community Legal www.hubcommunity.org.au ................................................................ 3372 7677 YFS Legal www.yfs.org.au ....................................................................................................... 3826 1500 © Youth Advocacy Centre Inc 2 Legal Aid Queensland www.legalaid.qld.gov.au ......................................................................."
Move-On-Updated-July-2023WM1.pdf,4,"legal advice or want help in making a complaint, you can contact one of the agencies listed below: Youth Advocacy Centre (YAC) www.yac.net.au ...................................................................... 3356 1002 Hub Community Legal www.hubcommunity.org.au ................................................................ 3372 7677 YFS Legal www.yfs.org.au ....................................................................................................... 3826 1500 © Youth Advocacy Centre Inc 2 Legal Aid Queensland www.legalaid.qld.gov.au ....................................................................... 1300 651 188 Youth Legal Advice Hotline………………………………………………………………………………………………………………………………….1800527 527 (Monday - Thursday 8am – 9pm; Friday 8am – Sunday 5pm) Aboriginal & Torres Strait Islander Legal Service www.atsils.org.au ........................................ 3025 3888 or (free call)1800 012 255 (24hrs 7 days a week) Refugee and Immigration Legal Service www.rails.org.au ...................................................... 3846 9300 Youth Affairs Network of Queensland www.yanq.org.au ......................................................... 3844 7713 Translating & Interpreting Services (24hrs) .............................................................................. 131 450 Community Legal Centres (CLCs) see www.naclc.org.au for your nearest CLC This sheet was last reviewed and updated in July 2023. The Youth Advocacy Centre does not accept responsibility for any action or outcome as a result of anyone relying on the information provided. UNDER REVIEW © Youth Advocacy Centre Inc 3"
Parties-and-Police-Updated-January-2024WM1 (1).pdf,0,"PARTIES AND POLICE – Things to know This sheet is intended to provide general information only, not advice. If you have a particular legal problem you should contact a solicitor. Each section ends with a list of agencies who might be able to assist you, including legal agencies. This legal information is relevant to Queensland, Australia. Alcohol and cigarettes It is against the law for anyone to sell or give alcohol or cigarettes to anyone under 18. If you are under 18 and in your house then an adult can give you alcohol provided they are your parent or standing in for your parent. The adult must be responsible for you and make sure you are safe – they must not be drunk and must watch how much you drink and how quickly and whether you are eating while you drink. The adult can be charged if they are not supervising you properly and the police can take the alcohol. If you put alcohol or a drug, or something you think is alcohol or a drug, in a person’s drink without their knowledge you could be charged with drink spiking. It is against the law for anyone to be drunk in public and to drink in public. It is against the law to smoke in many places, including in a car if there is anyone under 16 in the car. If you are under 18 you cannot have alcohol, even an unopened bottle, in your possession in a public place. Police can take the alcohol from you and, if it is open, pour it out. It is against the law to pretend to be 18 to buy alcohol, vapes or cigarettes, e.g. by using a false ID. Other drugs It is against the law for anyone to be under the"
Parties-and-Police-Updated-January-2024WM1 (1).pdf,1,"Police can take the alcohol from you and, if it is open, pour it out. It is against the law to pretend to be 18 to buy alcohol, vapes or cigarettes, e.g. by using a false ID. Other drugs It is against the law for anyone to be under the influence of drugs in public. It is against the law to possess any amount of illegal drugs no matter how small or if it is only for personal use. It is also illegal to possess things (utensils) that have been or are being used to take drugs, such as syringes, spoons and bongs. Possession includes having the drugs or things in your control e.g. in your car. UNDER REVIEW If there is a reasonable suspicion that things in your possession are connected to using drugs, then it is up to you to prove to the court that the things were not connected to drug use. If you are having a party and someone brings drugs or utensils to the party then you can be charged with an offence even if you didn’t know the drugs were there. If you did not know the drugs or utensils were on your property it is up to you to prove that to the court. If you are sharing drugs you can be charged with a serious offence – supplying dangerous drugs. Noise There is no set time for when you have to stop making noise at a party but if someone nearby feels the noise is too loud they can call the police. If the police think the noise is too loud they can come inside the house and direct you stop the noise immediately. If the noise continues after the police leave and the police come back they can take away the"
Parties-and-Police-Updated-January-2024WM1 (1).pdf,2,"the noise is too loud they can call the police. If the police think the noise is too loud they can come inside the house and direct you stop the noise immediately. If the noise continues after the police leave and the police come back they can take away the thing causing the noise e.g. portable speakers. Once police are in the house they can take action if anything illegal is happening, for example if they are there about noise but someone is using drugs they can charge them. Fights Touching someone or hitting them with something without their consent is an assault, for example pouring a can of soft drink over someone. If someone is seriously injured or killed you can be charged with a very serious offences, even if you think they wanted to fight you. If you are not actually in the fight but you are encouraging the fight you could be charged as well. The penalties for assaulting certain people are much higher, for example spitting on or biting police is up to 14 years imprisonment. You are entitled to defend yourself if you are attacked or to help someone else defend themselves, so long as you only use enough force to reasonably defend yourself or the other person. If you badly injure the other person it will be harder to show you used “reasonable” force. © Youth Advocacy Centre Inc Street Offences There are lots of laws about how people must behave in public including walking along the street or driving in a car. Begging, swearing or fighting in public are offences. Being a nuisance or behaving indecently, for example urinating in public is an offence. As well as charging you police can move you on from public places and stop you coming back for"
Parties-and-Police-Updated-January-2024WM1 (1).pdf,3,"walking along the street or driving in a car. Begging, swearing or fighting in public are offences. Being a nuisance or behaving indecently, for example urinating in public is an offence. As well as charging you police can move you on from public places and stop you coming back for up to 24 hours if you are you are making anyone feel anxious or disrupting the orderly conduct of an event, even if you aren’t doing anything. It is an offence to disobey a lawful direction given to you by police. The police must give you their name, rank and station when ordering you to move on. If you want to avoid drawing police attention to you in public you should remember these rules. Searches Police have powers which allow them to search you or your bags without a warrant, for example if they reasonably suspect you have drugs, a weapon or stolen property on you If police want to search you they have to “detain” you and tell you why. Before doing a search they should ask if you will agree. It is up to you whether you agree to the police doing a search, for example turning out your pockets for them, but if you do agree anything they find can be used as evidence in court. If you feel pressured into letting the police search then it is possible the court might say the search was unlawful. Asking you to take off outer clothing is not a strip search. Police cannot strip search you without a support person (parent or adult) being there unless it is an emergency. If you are strip searched you should be given privacy and be allowed to keep some clothes on e.g. put your top back on before removing your pants. Sex"
Parties-and-Police-Updated-January-2024WM1 (1).pdf,4,"strip search. Police cannot strip search you without a support person (parent or adult) being there unless it is an emergency. If you are strip searched you should be given privacy and be allowed to keep some clothes on e.g. put your top back on before removing your pants. Sex and sexting Having sex (including anal sex) under 16 is a serious offence. It doesn’t matter if you both want to have sex and you are both under 16. As well as sex it is also against the law to do sexual things to each other (like touching genitals). It is against the law for a parent, grandparent, brother or sister (including adopted or step siblings and foster siblings) to have sex with you. This is called UNDER REVIEW incest. There are also laws against taking and sharing indecent photos or videos of people under 16, even if they agree. This can include sending images of yourself. Child pornography is text, images or sound showing a person under 16 in a sexual way that is likely to offend an adult. It includes images of • the person’s breasts, bottom, penis or vagina; or • the person doing something sexual or near someone doing something sexual (such as having sex). Dealing with Police Police are not always in uniform. If a person in plain clothes says they are police ask for their ID. If a uniformed police officer is not wearing a name badge ask them their name and what station they are from. Stay cool and calm if the police approach you and treat them with respect. They are there to protect everyone in the community, including you. Remember being drunk or high is not a defence to breaking the law. Being drunk or high can badly affect your behaviour,"
Parties-and-Police-Updated-January-2024WM1 (1).pdf,5,"they are from. Stay cool and calm if the police approach you and treat them with respect. They are there to protect everyone in the community, including you. Remember being drunk or high is not a defence to breaking the law. Being drunk or high can badly affect your behaviour, especially how you treat other people. Parties at houses When at other people’s houses remember to take care of their property. If you take or damage their property without their permission, there may be legal consequences. Who can help? Youth Advocacy Centre (YAC) www.yac.net.au .............................................................................. 3356 1002 Youth Legal Advice Hotline ............................................................................................................... 1800 527 527 (Monday - Thursday 8am – 9pm; Friday 8am – Sunday 5pm) Hub Community Legal www.hubcommunity.org.au ........................................................................ 3372 7677 Logan Youth & Family Legal Service www.yfs.org.au ....................................................................... 3826 1500 © Youth Advocacy Centre Inc Legal Aid Queensland www.legalaid.qld.gov.au ............................................................................... 1300 651 188 Aboriginal & Torres Strait Islander Legal Service www.atsils.org.au................................................. 3025 3888 (24hrs 7 days a week) or (free call) 1800 012 255 Translating & Interpreting Services (24hrs) ....................................................................................... 131 450 Community Legal Centres (CLCs) see www.naclc.org.au for your nearest CLC This information was last reviewed and updated in January 2024. The Youth Advocacy Centre does not accept responsibility for any action or outcome as a result of anyone relying on the information provided. UNDER REVIEW Page 3 of 3"
State-school-suspensions.pdf,0,"State school suspensions When can I be suspended? The principal can ask you to stay away from school if you have been suspended or excluded.1 Suspension should only be used after other ways of addressing the problem have been tried e.g. a discipline improvement plan. Any student in any grade can be suspended.2 You can be suspended from a state school for:3 • disobedience (not doing what the teacher, staff member or principal asks you to do) • misbehaviour • conduct that the school thinks affects other students or is harmful to the proper running of the school (being disruptive in class, damaging school property or fighting in the playground) • being a risk to other students or staff • being charged by police with any offence. For some minor offences such as public nuisance you can only be suspended if the principal thinks it would not be in the best interests of other students or staff for you to be at school. It doesn’t matter whether the charge has anything to do with the school or if it happened outside of school hours or even that it did not happen in Queensland. You cannot be suspended from school for not complying with the school dress code, but you can be disciplined in another way such as not being allowed to engage in a certain school activity.4 How long can I be suspended for? You can be suspended from school by the principal for either 1 - 10 days or 10 – 20 days for serious grounds of suspensions.5 If you are suspended because you have been charged with an offence, then you are suspended until the court has decided your case.6 The principal can decide to lift the suspension, even though the court has not decided your case, if"
State-school-suspensions.pdf,1,"10 – 20 days for serious grounds of suspensions.5 If you are suspended because you have been charged with an offence, then you are suspended until the court has decided your case.6 The principal can decide to lift the suspension, even though the court has not decided your case, if you can show the principal that you being at school would not be harmful to the staff or other students.7 1 Education (General Provisions) Act 2006 (Qld) ss 200, 281(1). 2 Education (General Provisions) Act 2006 (Qld) ss 9, 200. 3 Education (General Provisions) Act 2006 (Qld) s 282. 4 Education (General Provisions) Act 2006 (Qld) s 326. 5 Education (General Provisions) Act 2006 (Qld) s 283. 6 Education (General Provisions) Act 2006 (Qld) s 288(1)-(2). 7 Education (General Provisions) Act 2006 (Qld) s 289. Reviewed 06/08/2025 This sheet is intended to provide general legal information about the law in Queensland. This information is not legal advice. If you have a particular legal problem you should contact a solicitor for legal advice. At the end is a list of agencies that might be able to assist you, including legal agencies. State school suspensions Who decides to suspend me? It is up to the principal to decide whether to suspend you and for how long: 1 - 10 days or 10 – 20 days.8 Generally - the more serious the alleged misbehaviour, the longer the suspension. The principal has to follow a process before they can suspend you, including giving you a chance to speak for yourself.9 When does the suspension start? Suspension starts when you are told by the principal. As soon as practical the principal has to give you a form which says you have been suspended.10 If you are suspended for 10 - 20 days or because you"
State-school-suspensions.pdf,2,"a chance to speak for yourself.9 When does the suspension start? Suspension starts when you are told by the principal. As soon as practical the principal has to give you a form which says you have been suspended.10 If you are suspended for 10 - 20 days or because you were charged with an offence the form must also tell you that you have the right to have the decision to suspend you reviewed (get the head of Education Queensland, the Chief Executive, to look at the matter).11 Do I have to do school work while I am suspended? If you are suspended, the principal must arrange for you to continue with your education during the suspension. This can mean doing anything that the principal thinks will help you improve your education. For example: • an alternate learning program: a list of programs can be found on the Education Queensland website • doing work at your school in an out of the way room supervised by a teacher’s aid, or • going to another school.12 Can I get the decision of the principal to suspend me for 1 - 10 days changed? The principal has the final say if you are being suspended for 1 – 10 days BUT you can make a complaint to Education Queensland about how the principal treated you or about how the decision was made if you think you it was unfair.13 You can also make an application to the Supreme Court for a Judicial Review but you should talk to a lawyer if you are considering this. 8 Education (General Provisions) Act 2006 (Qld) s 283. 9 Education (General Provisions) Act 2006 (Qld) s 283. 10 Education (General Provisions) Act 2006 (Qld) s 283. 11 Education (General Provisions) Act 2006 (Qld) s 283. 12"
State-school-suspensions.pdf,3,"Review but you should talk to a lawyer if you are considering this. 8 Education (General Provisions) Act 2006 (Qld) s 283. 9 Education (General Provisions) Act 2006 (Qld) s 283. 10 Education (General Provisions) Act 2006 (Qld) s 283. 11 Education (General Provisions) Act 2006 (Qld) s 283. 12 Education (General Provisions) Act 2006 (Qld) s 283. 13 Education (General Provisions) Act 2006 (Qld) s 46. State school suspensions How can I get the decision of the principal to suspend me for 10 – 20 days changed? You can ask the Chief Executive of Education Queensland to change the decision. You must write a letter to the Chief Executive and give as much information as possible about why you think the suspension is wrong or unfair.14 You should write the letter as soon as possible. Include all the important facts and anything else to support your case such as the names of people who will support what you say and any letters or emails. Also look at the procedures about suspension set out in the “School Discipline Procedure” document on Education Queensland’s website to see if the Principal has followed the rules. If not, you should include that information in the letter. The Chief Executive must review the decision to suspend you as soon as practical and then tell you and the Principal their decision.15 Contact one of the agencies under ‘Who can I contact for support?’ below if you want help with the letter. You can also make an application to the Supreme Court for Judicial Review but you should talk to a lawyer if you are considering this. What can the Chief Executive decide? The Chief Executive can decide to: • confirm you are suspended (say the decision of the principal was right) • vary the suspension"
State-school-suspensions.pdf,4,an application to the Supreme Court for Judicial Review but you should talk to a lawyer if you are considering this. What can the Chief Executive decide? The Chief Executive can decide to: • confirm you are suspended (say the decision of the principal was right) • vary the suspension (still suspend you but make the length of time you are suspended shorter or longer) • cancel the suspension (say that you are not suspended) • give you another punishment like exclusion from school (for more info see our sheet on Exclusion from State Schools). If you have been suspended you cannot enrol at another school unless the Chief Executive allows you to.16 How will I know about the Chief Executive’s decision? The Chief Executive has to tell you about his/her decision as soon as practical after they receive your letter - they may ring you and let you know the decision.17 You will then get the decision in writing which sets out the reasons for the decision.18 If you disagree with the decision you can make an application to the Supreme Court for Judicial Review but you should talk to a lawyer if you are considering this. 14 Education (General Provisions) Act 2006 (Qld) s 285. 15 Education (General Provisions) Act 2006 (Qld) s 286. 16 Education (General Provisions) Act 2006 (Qld) s 329. 17 Education (General Provisions) Act 2006 (Qld) s 286(2). 18 Education (General Provisions) Act 2006 (Qld) s 286(3). State school suspensions Who can I contact for support Youth Advocacy Centre (YAC) www.yac.net.au 3356 1002 Aboriginal & Torres Strait Islander Legal Service (24hrs 7 days a week) www.atsils.org.au 3025 3888 or (free call) 1800 012 255 Logan Youth & Family Legal Service www.yfs.org.au 3826 1500 Legal Aid Queensland www.legalaid.qld.gov.au 1300 651 188 Hub Community Legal www.hubcommunity.org.au
State-school-suspensions.pdf,5,for support Youth Advocacy Centre (YAC) www.yac.net.au 3356 1002 Aboriginal & Torres Strait Islander Legal Service (24hrs 7 days a week) www.atsils.org.au 3025 3888 or (free call) 1800 012 255 Logan Youth & Family Legal Service www.yfs.org.au 3826 1500 Legal Aid Queensland www.legalaid.qld.gov.au 1300 651 188 Hub Community Legal www.hubcommunity.org.au 3372 7677 Youth Legal Advice Hotline (Monday – Thursday 8am – 9pm; Friday 8am – Sunday 5pm) 1800 527 527 Community Legal Centres (CLCs) see www.naclc.org.au for your nearest CLC About the Youth Advocacy Centre The Youth Advocacy Centre offers free and confidential legal and social support services for young people in Queensland. www.yac.net.au (07) 3356 1002
How the youth justice system works _ Department of Youth Justice and Victim Support.pdf,0,"26/08/2025, 15:29 How the youth justice system works | Department of Youth Justice and Victim Support Department of Youth Justice and Victim Support Young people and the youth justice system (https://www.youthjustice.qld.gov.au/parents-carers/youth- justice-system) >> How the youth justice system works How the youth justice system works Our goal is to provide a fair and balanced response to young people in contact with the youth justice system. This response: holds young people accountable for their actions encourages young people to reintegrate into the community gives young people skills to create a better future promotes community safety. The youth justice process The youth justice process can be divided into the following 3 parts. Open all 1. The police process Police are usually the first point of contact for a young offender. When a young person commits a crime, police could decide to: take no further action after completing their investigation issue a caution refer the young person to a restorative justice conferencing process. A restorative justice conference brings victims and offenders together to reach agreement on how to repair the harm caused by the offence. It encourages the young person to take responsibility for their actions. https://www.youthjustice.qld.gov.au/parents-carers/youth-justice-system/how-it-works 1/4 26/08/2025, 15:29 How the youth justice system works | Department of Youth Justice and Victim Support pursue other legal processes, for example, a drug diversion or graffiti removal program pursue prosecution through the court. Officers always consider alternatives to divert a young person from entering or continuing in the justice system. 2. The court process If police consider the alleged offending is serious enough for a young person to go further into the justice system, court action is required. A young person can stay in the community until the outcome of the court process has been finalised, or can be held in custody. Most offending"
How the youth justice system works _ Department of Youth Justice and Victim Support.pdf,1,"If police consider the alleged offending is serious enough for a young person to go further into the justice system, court action is required. A young person can stay in the community until the outcome of the court process has been finalised, or can be held in custody. Most offending by young people will be heard by a magistrate sitting in the Childrens Court. Townsville also has a Youth Court that makes sure all identified high risk and repeat young offenders (aged 10–17) appear in court before the same magistrate. Courts interpret and apply the laws made by Parliament. The Youth Justice Act 1992 (https://www.legislation.qld.gov.au/view/html/inforce/current/act-1992-044) is the main piece of legislation that applies to young offenders (10–17 years). The magistrate works with the young person, their legal representatives and government departments to: hold them accountable keep the community safe work towards preventing the young person from reoffending. 3. The sentencing process If a young person pleads guilty to—or is found guilty of—offences when they go to court, they will be sentenced. Types of orders and sentences may include: fines reprimands good behaviour orders https://www.youthjustice.qld.gov.au/parents-carers/youth-justice-system/how-it-works 2/4 26/08/2025, 15:29 How the youth justice system works | Department of Youth Justice and Victim Support graffiti removal orders community service orders restorative justice orders probation orders conditional release orders intensive supervision orders detention orders supervised release orders Read more about sentencing options and youth court orders (https://www.youthjustice.qld.gov.au/parents-carers/youth-justice-system/sentencing- young-offenders). Sentencing options Courts must decide on a sentence for each young person based on their actions and their current situation. Sentencing must be for 1 (or more) of the following reasons. To: punish an offender for their actions change (rehabilitate) their behaviour discourage them and others from committing the same or similar crimes formally denounce an offender's actions protect the community from the offender. In deciding"
How the youth justice system works _ Department of Youth Justice and Victim Support.pdf,2,"and their current situation. Sentencing must be for 1 (or more) of the following reasons. To: punish an offender for their actions change (rehabilitate) their behaviour discourage them and others from committing the same or similar crimes formally denounce an offender's actions protect the community from the offender. In deciding what penalty is appropriate, the court considers the level of harm experienced by the victim, police reports, and other government agencies such as Youth Justice and Child Safety, or people connected to the young offender. If the young offender is an Aboriginal or Torres Strait Islander person, a submission from their community justice group may also be considered. Where necessary, detention is an option. Read more about youth detention in Queensland (https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/about). https://www.youthjustice.qld.gov.au/parents-carers/youth-justice-system/how-it-works 3/4 26/08/2025, 15:29 How the youth justice system works | Department of Youth Justice and Victim Support Young people and the youth justice system (https://www.youthjustice.qld.gov.au/parents- carers/youth-justice-system) Supporting your young person through the youth justice system (https://www.youthjustice.qld.gov.au/parents-carers/youth-justice- system/supporting-your-child-through-the-youth-justice-system) How the youth justice system works (https://www.youthjustice.qld.gov.au/parents- carers/youth-justice-system/how-it-works) Sentencing young offenders (https://www.youthjustice.qld.gov.au/parents- 〉 carers/youth-justice-system/sentencing-young-offenders) https://www.youthjustice.qld.gov.au/parents-carers/youth-justice-system/how-it-works 4/4"
About youth detention in Queensland _ Department of Youth Justice and Victim Support.pdf,0,"26/08/2025, 15:42 About youth detention in Queensland | Department of Youth Justice and Victim Support Department of Youth Justice and Victim Support Young people in detention (https://www.youthjustice.qld.gov.au/parents-carers/youth-detention) >> About youth detention in Queensland About youth detention in Queensland If a young person is refused bail (https://www.youthjustice.qld.gov.au/parents- carers/youth-justice-system/sentencing-young-offenders/bail-and-bail-with-conditions), they go to a youth remand centre or youth detention centre. When a court sentences a young person to time in custody, they go to a youth detention centre. Youth remand centres and youth detention centres are secure places for people aged 10 to 18. They exist to: protect the safety of the community provide consequences for offending prepare detained young people to live productively in the community. Rules are set down when a young person enters the centre. Poor behaviour is monitored and responded to. There is a structured routine that usually begins at 7am and ends by 7.45pm, when lights are out. All young people in the centre must follow the structured routine. Movement of young people around the centre is closely monitored. Current centres Queensland currently has a youth remand centre and 3 youth detention centres. Wacol Youth Remand Centre Wacol Youth Remand Centre (WYRC) (https://www.youthjustice.qld.gov.au/contact- us/detention-centres)is located in Wacol (Brisbane). It has a bed capacity of 76 and houses young people from across the state, as required. While legally designated a youth https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/about 1/6 26/08/2025, 15:42 About youth detention in Queensland | Department of Youth Justice and Victim Support detention centre, WYRC has a different operating model and infrastructure to our other centres. WYRC features state of the art security management systems, exercise areas and access to educational, medical and other programs. Young people will also be able to access programs at the nearby youth detention centres as required. WYRC is a temporary facility that will transfer back to"
About youth detention in Queensland _ Department of Youth Justice and Victim Support.pdf,1,"to our other centres. WYRC features state of the art security management systems, exercise areas and access to educational, medical and other programs. Young people will also be able to access programs at the nearby youth detention centres as required. WYRC is a temporary facility that will transfer back to the Queensland Police Service for its operational use in the future. Cleveland Youth Detention Centre Cleveland Youth Detention Centre (CYDC) (https://www.youthjustice.qld.gov.au/contact- us/detention-centres) is located in Townsville. It has a bed capacity of 112 and houses young people north of Rockhampton, as far north as Cape York and the Torres Strait, and up to Mount Isa and the Northern Territory border in the west. This area includes Townsville. Many young people at CYDC are Aboriginal and/or Torres Strait Islander. The school based at CYDC have implemented curriculum and practices that work with Aboriginal English to help young people learn Standard Australian English. CYDC also has regular Elders visits to keep young people connected to culture. Brisbane Youth Detention Centre Brisbane Youth Detention Centre (BYDC) (https://www.youthjustice.qld.gov.au/contact- us/detention-centres) is located in Wacol (Brisbane). It has a bed capacity of 162 and a catchment south of Rockhampton and out to the Northern Territory border. BYDC has built strong connections with several local community organisations and churches who help support young people who are transitioning back to the Brisbane and local communities. West Moreton Youth Detention Centre West Moreton Youth Detention Centre (WMYDC) (https://www.youthjustice.qld.gov.au/contact-us/detention-centres) is located in Wacol (Brisbane) next to BYDC. It has a bed capacity of 32. The centre focuses on working: https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/about 2/6 26/08/2025, 15:42 About youth detention in Queensland | Department of Youth Justice and Victim Support inside-out – keeping an outward focus for young people and building community contacts for them from the point of entry outside-in – bringing the"
About youth detention in Queensland _ Department of Youth Justice and Victim Support.pdf,2,"bed capacity of 32. The centre focuses on working: https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/about 2/6 26/08/2025, 15:42 About youth detention in Queensland | Department of Youth Justice and Victim Support inside-out – keeping an outward focus for young people and building community contacts for them from the point of entry outside-in – bringing the community into the centre to work with young people. Detention centre programs Our youth detention centres are dedicated to rehabilitating young people and improving their life outcomes. We provide a range of intervention programs and services to support their development during their time in detention. Structured programs delivered to young people inside the detention centre include: schooling, vocational education and training (run by the Department of Education) Aboriginal and Torres Strait Islander cultural programs life skills programs speech and language programs health programs (run by Queensland Health), including mental health and wellbeing, group therapy programs, and problematic substance use intervention sport, recreation and fitness programs programs and supports to help change behaviour. Read our youth detention centre services road map (PDF, 1.9MB) (https://www.publications.qld.gov.au/ckan-publications-attachments- prod/resources/1078dabf-3172-408a-9b01-a187d3f69be4/yj-detention-services-road- map.pdf?ETag=ecbe70dd0030bed878113d7a34188c05) to learn more about what programs a young person may undertake during their time in detention. Detention centre staff There is a high ratio of youth detention centre staff to young people in our centres (https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/helping-young- people-in-detention). Detention centre staff are trained to work with young people, helping them develop their independence in a healthy way and preparing them for adulthood and employment. https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/about 3/6 26/08/2025, 15:42 About youth detention in Queensland | Department of Youth Justice and Victim Support Staff are employed by the Queensland Government and are committed to providing a safe environment for young people in detention and everyone else who enters the centre. Education A modified school year for young people in youth detention centres has been in place since the"
About youth detention in Queensland _ Department of Youth Justice and Victim Support.pdf,3,"Youth Justice and Victim Support Staff are employed by the Queensland Government and are committed to providing a safe environment for young people in detention and everyone else who enters the centre. Education A modified school year for young people in youth detention centres has been in place since the beginning of 2022. Each youth detention centre has a school and young people attend classes for 48 weeks a year. New infrastructure The Queensland Government has committed to build 2 new therapeutic youth detention centres while also looking at a range of interim options to increase capacity. One of the new centres will be located in Woodford (South East Queensland). (https://www.youthjustice.qld.gov.au/our-department/strategies-reform/new-youth- detention-centres/woodford) Operating model Legislation and our philosophy of youth detention (https://www.qld.gov.au/law/sentencing-prisons-and-probation/young-offenders-and-the- justice-system/youth-detention/managing-youth-detention-centres/philosophy-of-youth- detention-services) inform: youth detention operational policies (https://www.youthjustice.qld.gov.au/our- department/resources#youth-detention-operational-policies-7) the Youth Detention Centre operational manual local practices. This is demonstrated visually in our youth detention policy and procedure framework (DOCX, 468KB) (https://www.publications.qld.gov.au/dataset/e79976ad-27d3-4019-94d5- 15a76950ce4f/resource/8061f812-cad4-49cb-ad4e-fa8a918a1803/download/ydc- operational-policy-procedure-framework.docx) or (PDF, 477KB) (https://www.publications.qld.gov.au/dataset/e79976ad-27d3-4019-94d5- 15a76950ce4f/resource/1ba1aaf3-0aa0-4937-bc20-90cf3534351f/download/ydc- operational-policy-procedure-framework.pdf). https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/about 4/6 26/08/2025, 15:42 About youth detention in Queensland | Department of Youth Justice and Victim Support A centralised team is responsible for: practice reform, support and development maintenance and publishing of youth detention policies and procedures maintenance and publishing of the Youth Detention Centre operational manual, related appendices and other documents. To ensure the manual and policies remain relevant and accurate, this team works with youth detention centre staff and other stakeholders, and considers relevant findings and recommendations made by oversight agencies (https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/accountability-in- youth-detention-centres). There is also a central practice support consultative committee that oversees all youth detention issues across the state, and reports to an agency consultative committee. Each youth detention centre is managed by an executive director who reports to the Senior Executive Director, Youth Detention Operations and Reform. All youth detention centres maintain similar"
About youth detention in Queensland _ Department of Youth Justice and Victim Support.pdf,4,"a central practice support consultative committee that oversees all youth detention issues across the state, and reports to an agency consultative committee. Each youth detention centre is managed by an executive director who reports to the Senior Executive Director, Youth Detention Operations and Reform. All youth detention centres maintain similar internal governance arrangements designed to enhance the successful service delivery to young people in detention. These governance arrangements include opportunities for staff to participate in decision-making about the operations of each centre through a range of forums including local consultative committees. Each centre also facilitates a range of meetings developed to meet statutory and accountability requirements, including: risk assessment planning for individual young people budget and human resource management. More information Learn about: visiting a young person in detention (https://www.youthjustice.qld.gov.au/parents- carers/youth-detention/visiting-and-contacting-a-young-person-in-detention) https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/about 5/6 26/08/2025, 15:42 About youth detention in Queensland | Department of Youth Justice and Victim Support young people on remand in a detention centre (https://www.qld.gov.au/law/sentencing-prisons-and-probation/young-offenders-and- the-justice-system/youth-detention/about-youth-detention/being-on-remand-in-a- youth-detention-centre) what happens in a youth detention centre (https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/life-for-young- people-in-a-detention-centre) contacts for youth detention centres (https://www.youthjustice.qld.gov.au/contact- us/detention-centres). Young people in detention (https://www.youthjustice.qld.gov.au/parents- carers/youth-detention) About youth detention in Queensland (https://www.youthjustice.qld.gov.au/parents- carers/youth-detention/about) Visiting and contacting a young person in detention (https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/visiting-and- contacting-a-young-person-in-detention) Life for young people in a detention centre 〉 (https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/life-for-young- people-in-a-detention-centre) Helping young people in detention (https://www.youthjustice.qld.gov.au/parents- 〉 carers/youth-detention/helping-young-people-in-detention) Accountability in youth detention centres (https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/accountability- in-youth-detention-centres) https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/about 6/6"
Accountability in youth detention centres _ Department of Youth Justice and Victim Support.pdf,0,"26/08/2025, 15:42 Accountability in youth detention centres | Department of Youth Justice and Victim Support Department of Youth Justice and Victim Support Young people in detention (https://www.youthjustice.qld.gov.au/parents-carers/youth-detention) >> Accountability in youth detention centres Accountability in youth detention centres Youth detention centres in Queensland have a broad range of oversight. Oversight refers to the actions taken to review and monitor youth detention and youth detention centres, including policies, to make sure they are compliant with laws, regulations and ethical standards. Oversight takes place separately and outside of everyday youth detention operations. Internal oversight Internal oversight functions in the department, but outside of youth detention centres, include: internal audit internal practice and improvement reviews operational performance reviews professional standards youth detention inspection team. Youth detention inspection team The youth detention inspection team visits youth detention centres every 3 months. They monitor and assess them against criteria in Youth Detention Inspectorate Expectations for Queensland Youth Detention Centres (https://publications.qld.gov.au/dataset/youth-detention- centre-expectations-document) (the expectations document). The expectations document is based on a British model but has been amended to reflect Queensland laws and recommendations from inquiries such as the: Forde Inquiry (https://fordefoundation.org.au/resources/the-forde-inquiry) Royal Commission into Aboriginal Deaths in Custody (https://www.naa.gov.au/explore-collection/first-australians/royal-commission- aboriginal-deaths-custody) there are also international laws, conventions and standards about the rights of children in detention that Australia must follow. These are reflected in the expectations document. The inspection reports contain independent assessments on the: security and management of detention centres safety, custody and wellbeing of young people detained in detention centres. The reports include recommendations from research and best practice in other parts of Australia and the world. The recommendations are only advisory, but we use them to: promote continuous improvement develop strategies to lower risk increase professionalism of our staff. The inspection team focuses on the safe custody and wellbeing of vulnerable young people"
Accountability in youth detention centres _ Department of Youth Justice and Victim Support.pdf,1,"from research and best practice in other parts of Australia and the world. The recommendations are only advisory, but we use them to: promote continuous improvement develop strategies to lower risk increase professionalism of our staff. The inspection team focuses on the safe custody and wellbeing of vulnerable young people in detention. Their work helps improve the accountability, integrity and performance of detention centres. Inspections are conducted according to the: inspection framework (https://publications.qld.gov.au/dataset/youth-detention-centre-inspections) https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/accountability-in-youth-detention-centres 1/2 26/08/2025, 15:42 Accountability in youth detention centres | Department of Youth Justice and Victim Support inspection charter (https://publications.qld.gov.au/dataset/youth-detention-centre-inspections). Inspectors check to see if the recommendations have been implemented as intended in December each year. You can view summaries of inspection reports (https://publications.qld.gov.au/dataset/youth-detention-centres-quarterly-reports) for our youth detention centres online or make a right to information application (https://www.youthjustice.qld.gov.au/our-department/right-to- information/publication-scheme) if you want to see the entire report. External oversight Independent agencies also help to ensure that we keep improving service delivery to young people in detention. These include the: Crime and Corruption Commission (https://www.ccc.qld.gov.au) Inspector of Detention Services (https://www.ombudsman.qld.gov.au/detention-inspection) Office of the Public Guardian (https://www.publicguardian.qld.gov.au) Queensland Audit Office (https://www.qao.qld.gov.au) Queensland Family and Child Commission (https://www.qfcc.qld.gov.au) Queensland Human Rights Commission (https://www.qhrc.qld.gov.au) Queensland Ombudsman (https://www.ombudsman.qld.gov.au) United Nations Subcommittee on the Prevention of Torture and other Cruel, Inhuman or Degrading Treatment or Punishment (https://aus01.safelinks.protection.outlook.com/?url=https%3A%2F%2Fwww.ohchr.org%2Fen%2Ftreaty- bodies%2Fspt&data=05%7C02%7CKaren.Ashton%40youthjustice.qld.gov.au%7Cddd00eabdfb54103997508dd0d18aca8%7C95b907c2752b48 Young people in detention (https://www.youthjustice.qld.gov.au/parents- carers/youth-detention) About youth detention in Queensland (https://www.youthjustice.qld.gov.au/parents- carers/youth-detention/about) Visiting and contacting a young person in detention (https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/visiting-and-contacting- a-young-person-in-detention) Life for young people in a detention centre (https://www.youthjustice.qld.gov.au/parents- 〉 carers/youth-detention/life-for-young-people-in-a-detention-centre) Helping young people in detention (https://www.youthjustice.qld.gov.au/parents- 〉 carers/youth-detention/helping-young-people-in-detention) Accountability in youth detention centres (https://www.youthjustice.qld.gov.au/parents- carers/youth-detention/accountability-in-youth-detention-centres) Last reviewed: 26 November 2024 Last modified: 26 November 2024  Provide feedback (https://www.families.qld.gov.au/feedback?id=34910) This work is licensed under a Creative Commons Attribution 4.0 International (CC BY 4.0) licence (https://creativecommons.org/licenses/by/4.0/) https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/accountability-in-youth-detention-centres 2/2"
Accountability in youth detention centres _ Department of Youth Justice and Victim Support.pdf,2,young people in detention (https://www.youthjustice.qld.gov.au/parents- 〉 carers/youth-detention/helping-young-people-in-detention) Accountability in youth detention centres (https://www.youthjustice.qld.gov.au/parents- carers/youth-detention/accountability-in-youth-detention-centres) Last reviewed: 26 November 2024 Last modified: 26 November 2024  Provide feedback (https://www.families.qld.gov.au/feedback?id=34910) This work is licensed under a Creative Commons Attribution 4.0 International (CC BY 4.0) licence (https://creativecommons.org/licenses/by/4.0/) https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/accountability-in-youth-detention-centres 2/2
Children-Court-Queensland-Infosheet.pdf,0,"Childrens Court of Queensland What Courts do Young People under 18 go to? In Queensland if you are under 18 and the police charge you with an offence you will always go to a Childrens Court first. For some types of offences (called indictable offences) a defendant can choose a higher level court with a Judge to deal with it. Sometimes the Magistrate can decide the case must go to a higher court even if the young person does not choose this. If the indictable offence is a ‘serious’ offence under the Youth Justice Act or the person wants their case to go to the higher court to be decided, the Magistrate has to look at the police evidence to decide if the evidence is good enough for the case to go the higher court. After listening to the witnesses the Magistrate might decide there is not enough evidence and that is the end of the case. If a young person is found guilty or pleads guilty, a Magistrate will sometimes decide they cannot give the young person a serious enough sentence and they will send it to the higher court which has more power. The CCQ, District Court and Supreme Court in Brisbane are in the large courts complex in George Street in Brisbane, near the Roma Street train station. There are many Court Rooms and Judges in the complex. There are no duty lawyers in the CCQ, District or Supreme Courts. If you have to go to one of these courts it is important you see a lawyer beforehand. Childrens Court of Queensland (CCQ) If adult cases go to a higher court they go to either the District Court or if the matter is very serious, like murder or drug matters such as trafficking, to the Supreme Court."
Children-Court-Queensland-Infosheet.pdf,1,"of these courts it is important you see a lawyer beforehand. Childrens Court of Queensland (CCQ) If adult cases go to a higher court they go to either the District Court or if the matter is very serious, like murder or drug matters such as trafficking, to the Supreme Court. If a young person’s case is sent to a higher court, it is usually sent to the Childrens Court of Queensland (CCQ) with a special Judge from the District Court. Matters involving young people can only be heard in the adult District Court or Supreme Court of Queensland if: • the child is charged after they turn 18 • the Magistrate has sent the case to the District Court because of special circumstances, for example, if a child is charged with committing the offence with an adult • the matter is very serious and has to be sent to the Supreme Court. If you plead not guilty in the CCQ you can choose to have a jury (a group of 12 people) listen to the witnesses and decide if you broke the law or you can choose to have the Judge do this. If you are in the District or Supreme Court and plead not guilty, then a jury has to decide whether you broke the law. If you plead or are found guilty in any of these courts, the Judge decides what sentence you get. This sheet is intended to provide general legal information about the law in Queensland. This information is not legal advice. If you have a particular legal problem you should contact a solicitor for legal advice. At the end is a list of agencies that might be able to assist you, including legal agencies. Information sheet - Childrens Court of Queensland Who will be in"
Children-Court-Queensland-Infosheet.pdf,2,"This information is not legal advice. If you have a particular legal problem you should contact a solicitor for legal advice. At the end is a list of agencies that might be able to assist you, including legal agencies. Information sheet - Childrens Court of Queensland Who will be in the Court Room? The Judge will have an assistant who reads out the charge and there are also bailiffs who help the court, for example by passing around exhibits. No one is allowed to publish information identifying the person who is charged. District or Supreme Courts are open to the public so anyone can come in (eg groups of school students looking at how the courts work). What to do in Court? If you have to go to court, either because you have been charged with an offence or because you are a victim of crime or a witness, you should act respectfully. • Make sure your phone is turned off while you are in court • You should dress appropriately (no thongs or bare mid-riffs) • Remove your cap if you are wearing one • You should not laugh or giggle (even if you are nervous) • Answer questions respectfully – do not swear • Pay attention to what is being said • Look at the person when answering their questions • The Judge is called ‘Your Honour’ (always be respectful when speaking to them). If you treat the process seriously you will give yourself the best chance of being listened to. People in court need to focus on listening to what you are saying, not looking at what you are wearing. If you disrespect the court you can be charged with another offence. How long will I have to be at court? Most courts start at 9am but"
Children-Court-Queensland-Infosheet.pdf,3,"being listened to. People in court need to focus on listening to what you are saying, not looking at what you are wearing. If you disrespect the court you can be charged with another offence. How long will I have to be at court? Most courts start at 9am but you should check your paperwork and ask your lawyer about start times. If you do not have a lawyer you should get to court early (8.30am) so that you can find the court room and be ready when your name is called. If you are running late, call your lawyer or the court and let them know. Usually the court will have a lot of matters to get through on the one day so you may have to wait for your turn. Sometimes this can take a few hours so make sure you bring something suitable to do as well as something to eat. The bailiff will come outside the courtroom to the waiting area and call your name when it is your turn. If you are not there when your name is called (even if you were there at the start and later left) the Magistrate or Judge may order the police to find you and bring you to the court (issue a warrant for your arrest). If you have been charged with an offence you need to be in the courtroom the whole time your matter is being discussed with the Judge. If you are a witness you will be able to leave the court building once you have finished giving your evidence. Witnesses cannot be in the courtroom while other witnesses are giving their evidence. Courts normally break for lunch at 1pm for about an hour and sometimes will have a break for morning and/or afternoon tea."
Children-Court-Queensland-Infosheet.pdf,4,will be able to leave the court building once you have finished giving your evidence. Witnesses cannot be in the courtroom while other witnesses are giving their evidence. Courts normally break for lunch at 1pm for about an hour and sometimes will have a break for morning and/or afternoon tea. Courts usually finish no later than 5pm. If your matter is not finished you may need to come back the next day. There is no set time limit for how long a court matter can take. Information sheet - Childrens Court of Queensland Who can I contact for support? Youth Advocacy Centre (YAC) www.yac.net.au 3356 1002 Brisbane Childrens Court brisbane.childrenscourt@justice.qld.gov.au 3235 9841 Hub Community Legal www.communitylegal.org.au 3372 7677 YFS Legal www.yfs.org.au 3826 1500 Legal Aid Queensland www.legalaid.qld.gov.au 1300 651 188 Youth Legal Advice Hotline 1800 527 527 Aboriginal & Torres Strait Islander Legal Service www.atsils.org.au 3025 3888 or (free call) 1800 012 255 (24hrs 7 days a week) Translating & Interpreting Services (24hrs) 131 450 Community Legal Centres (CLCs) see www.naclc.org.au for your nearest CLC Note: This sheet was last reviewed and updated in June 2023. The Youth Advocacy Centre does not accept responsibility for any action or outcome as a result of anyone relying on the information provided. About the Youth Advocacy Centre The Youth Advocacy Centre offers free and confidential legal and social support services for young people in Queensland. www.yac.net.au (07) 3356 1002
What we do _ Mission Australia.pdf,0,"26/08/2025, 15:52 What we do | Mission Australia SSttoorriieess MMeeddiiaa PPuubblliiccaattiioonnss CCaarreeeerrss AAbboouutt CCoonnttaacctt Search WWhhaatt FFiinndd aa TTaakkee GGiivvee wwee DDoonnaattee sseerrvviiccee aaccttiioonn mmoonntthhllyy ddoo WWhhaatt wwee ddoo Home Share Mission Australia's integrated nationwide services help people MMiissssiioonn AAuussttrraalliiaa || TThhee ssttoorryy …… nd safe and affordable housing, support disadvantaged children and families, empower troubled young people, assist people with mental illness and disability, and much more. Early intervention and prevention is at the heart of our work as we pursue our vision of an Australia where all of us have a safe home and can thrive. We are dedicated to serving people and communities in need in line with our values of compassion, respect, integrity, perseverance and celebration. 개인정보 보호 - 약관 https://www.missionaustralia.com.au/what-we-do 1/4 26/08/2025, 15:52 What we do | Mission Australia We’re committed to keeping children and young people safe, and to a ‘Speak Up & Speak Out’ culture reecting the highest standards of legal, ethical and moral behaviour. Mission Australia has a long history of working with government at all levels, as both a service provider and inuencer. The majority of services we deliver are government-funded, through a transparent tender process to secure contracts for a determined period. Other services rely on the generosity of our partners and tens of thousands of everyday Australians who give us their support. Need help? Independence is something we all strive for, but life rarely turns out as planned. Don't be afraid to reach out for help. Search for a service Ask us a question or Our services Homelessness & Children, youth, Mental health, social families & alcohol housing support communities & other drugs We believe every person in Early intervention and With the right support, Australia should have prevention allows us to people can improve their access to safe"
What we do _ Mission Australia.pdf,1,"service Ask us a question or Our services Homelessness & Children, youth, Mental health, social families & alcohol housing support communities & other drugs We believe every person in Early intervention and With the right support, Australia should have prevention allows us to people can improve their access to safe and secure address issues before they mental health or break the housing. become major setbacks. cycle of addiction https://www.missionaustralia.com.au/what-we-do 2/4 26/08/2025, 15:52 What we do | Mission Australia Disability Other inclusion Employment, skills services & support & training We equip people to Disability, visible or not, Employment can benet a manage their nances and shouldn’t prevent a person person's health and also help people from being active in their wellbeing, as well as their interacting with the justice community. nancial situation. and corrections system. Latest news, media & blog articles Read about what we’ve been working on, our stance on important social issues and how you make a difference to vulnerable Australians' lives. People and communities Media releases Opinion Special ways to Mission Australia Homelessness connect this to deliver vital Week: Home is Father’s Day tenancy support at where hope begins new East Perth 25 August 2025 24 July 2025 Common Ground 05 August 2025 https://www.missionaustralia.com.au/what-we-do 3/4 26/08/2025, 15:52 What we do | Mission Australia See all blog & media articles Our founding purpose - 'Inspired by Jesus Christ, Mission Australia exists to meet human need and to spread the knowledge of the love of God' What we do Take action Find a service Careers Stories Media Publications About Contact Donate Give monthly Supporter enquiries Get the latest news 1800 88 88 68 Register here Connect with us © Copyright 2024 Mission Australia | Donations $2 & over are tax deductible in Australia | ABN 15 000 002 522 |"
What we do _ Mission Australia.pdf,2,action Find a service Careers Stories Media Publications About Contact Donate Give monthly Supporter enquiries Get the latest news 1800 88 88 68 Register here Connect with us © Copyright 2024 Mission Australia | Donations $2 & over are tax deductible in Australia | ABN 15 000 002 522 | Privacy | Sitemap | Terms & Conditions https://www.missionaustralia.com.au/what-we-do 4/4
Drugs-and-Alcohol-Updated-November-2023WM1.pdf,0,"DRUGS & ALCOHOL This sheet is intended to provide general legal information about the law in Queensland. This information is not legal advice. If you have a particular legal problem you should contact a solicitor for legal advice. At the end is a list of agencies that might be able to assist you, including legal agencies. When can I start smoking cigarettes? There is no law that says when you can or can’t smoke cigarettes BUT it is against the law for an adult to sell or give you cigarettes if you are under 18. Shopkeepers can ask to see ID to prove you are 18. If someone like a police officer sees you being sold or given cigarettes and they ask for your name, age and address, you must tell them or you will be breaking the law. The police can take the cigarettes away for evidence against the person who sold/gave them to you and they do not have to give them back to you. Electronic Cigarettes are subject to the same laws as cigarettes. Electronic Cigarettes that contain nicotine are illegal in Queensland. When can I drink or buy alcohol? It is against the law for a person to sell someone under 18 alcohol. You can be asked to show ID to prove you are 18 or over before someone sells you alcohol. It is an offence to: • pretend to be 18 or over to try to get alcohol • fake an ID • change an ID Uto makeN you loDok 18 oEr over R REVIEW • give someone your ID to use. Can I drink alcohol when I am at home? If you are under 18 then a responsible adult can only supply you alcohol if you are on private premises AND you have a"
Drugs-and-Alcohol-Updated-November-2023WM1.pdf,1,"ID Uto makeN you loDok 18 oEr over R REVIEW • give someone your ID to use. Can I drink alcohol when I am at home? If you are under 18 then a responsible adult can only supply you alcohol if you are on private premises AND you have a responsible adult supervising you. A responsible adult means your parent, step-parent, guardian or an adult who has parental rights and responsibility for you. The adult can be fined if they are not supervising you responsibly and the police can also confiscate (take and dispose of) the alcohol. To decide if you are being responsibly supervised the factors that can be considered are: • whether the adult or you are drinking or drunk • how old you are • whether you have eaten • the quantity of alcohol being consumed • whether the adult is with you and checking on how much you are drinking and what effect it is having on you • how much alcohol you are drinking over what period of time. Can I drink in a public place? If you are under 18 you are not allowed to drink alcohol in a public place. Generally no-one can drink in a public place unless there is a sign which says they can (for example, certain places at South Bank in Brisbane). However, people under 18 are not allowed to drink alcohol even in those areas unless they are with a responsible adult who is supervising the drinking. A public place includes cinemas, shopping centres, malls, buses, parks or the street. If you are under 18 you cannot carry alcohol in public. This includes carrying it for your friends or parents. It does not matter whether the alcohol is sealed or open. Can I be picked up for being"
Drugs-and-Alcohol-Updated-November-2023WM1.pdf,2,"public place includes cinemas, shopping centres, malls, buses, parks or the street. If you are under 18 you cannot carry alcohol in public. This includes carrying it for your friends or parents. It does not matter whether the alcohol is sealed or open. Can I be picked up for being drunk? Yes. It is an offence to be drunk in a public place (no matter what your age). Using obscene or insulting language or behaving violently, disorderly or indecently is also an offence. These offences are called public nuisance offences. It is also an offence to be drunk or disorderly in a licensed place (such as a bar or a club). If you are acting drunk, creating a disturbance or enter without being allowed then the club may ask you to leave. They can use force that is reasonable and necessary if you fail to leave when asked. When can I be charged with a drug offence? You can be charged with a drug offence if you: • have possession of a dangerous drug (including marijuana, heroin, cocaine, LSD, ecstasy or speed) • have possession of property which police believe is to be used to commit a drug offence. This can include having a bong or a pipe on you, as well as scales or scissors. This does not apply to a syringe or needle if stored/disposed of properly. (See below for how to store or dispose of syringes and needles). • supply a dangerous drug (give, sell, deliver a drug to someone else or offer to do any of these). • produce a dangerous drug (grow, prepare or package a dangerous drug or offer to do any of these). • you live in a place and you allow it to be used for drug offences. This is important for"
Drugs-and-Alcohol-Updated-November-2023WM1.pdf,3,"drug to someone else or offer to do any of these). • produce a dangerous drug (grow, prepare or package a dangerous drug or offer to do any of these). • you live in a place and you allow it to be used for drug offences. This is important for people in share accommodation who know housemates or friends of housemates are using drugs on the property. You have to prove that you didn't know there were drugs on your property. • are trafficking a dangerous drug (dealing, carrying on a business even if you do not make a profit). The sentence for these offences will depend on the drug and how much there is of it. What does ""possession"" mean? You can be charged with ""possession"" if: • you have the drugs on you, in your pocket or room (even for a very short time) UNDER REVIEW • in a school locker where you have the only key • in a bag that you give to a friend • you try and hide drugs to protect a friend when the police are about to search a room. More than one person can be ""in possession"" of drugs at the same time. For example if a number of people in a room are smoking marijuana, they may all be ""in possession"" of the drug being smoked or the thing being used to smoke it. It is not just the person who is actually using it when the police arrive that could be charged. Can I be sent to the drug diversion assessment program instead of going to court? Yes. You may be sent to a drug diversion assessment program if you have been charged with possession of any type of dangerous drug and certain prescribed medications. This will depend on"
Drugs-and-Alcohol-Updated-November-2023WM1.pdf,4,"could be charged. Can I be sent to the drug diversion assessment program instead of going to court? Yes. You may be sent to a drug diversion assessment program if you have been charged with possession of any type of dangerous drug and certain prescribed medications. This will depend on the drug and the amount. What happens at the drug diversion assessment program? See the topic ‘Court Orders’. Is it illegal to carry needles or syringes? No. It is not an offence to carry needles or syringes on you either: • clean (but they must be carried safely); or • used (they must be in a ""puncture proof, hard, resealable container"" and if the police ""trace test"" them you can be charged with ""possession"" of the drug that may be left in them). Remember you do not have to answer any questions, except you must give your correct name, age and address. If you admit to using and have a used fit on you, the police can use this in gathering evidence against you. © Youth Advocacy Centre Inc 2 What about a sharps container? It is not against the law to have a sharps container (disposal unit issued by the Health Department) - only the drug in the used fits or dirty syringe is illegal. You must dispose of your fits in a ""puncture proof, hard, resealable container"" (the disposal unit from the Health Department or another unit like a Milo tin) and then in a garbage bag in the rubbish or return them back to the needle exchange. Any other way of disposal is illegal and you could be charged. Can the police search me if they suspect I have drugs on me? Yes. See fact sheet on 'Searches'. Can a police officer take away things I am"
Drugs-and-Alcohol-Updated-November-2023WM1.pdf,5,"the rubbish or return them back to the needle exchange. Any other way of disposal is illegal and you could be charged. Can the police search me if they suspect I have drugs on me? Yes. See fact sheet on 'Searches'. Can a police officer take away things I am using to inhale? Yes. If a police officer believes that you are using an inhalant or about to use an inhalant (chroming) then the police can take away whatever you are using to do this. It does not matter if it is not something illegal. For example if you have some glue. Although it is not an offence to have the glue, the police have the power to take the glue from you and you cannot get it back. The police officer can ask you if you have a reason for having the substance. If you do have a good reason (for example you have some glue because your parents asked you to buy it) then the police can allow you to keep it. The police will decide whether you can keep it. You should also remember not to mislead or lie to the police because you could be charged with obstructing police. Can police take me to a safe place if I am drunk or have been inhaling or ingesting (chroming) volatile substances? Yes, the police can take you to a safe place. A safe place is a place where you can receive treatment or care to allow you to recover. For example; your home, a hospital or a place which is set up to help you recover from chroming. A police station is NOT a UNDER REVIEW safe place under this law. Who can help? Remember that drug use can be harmful to your general health. A conviction"
Drugs-and-Alcohol-Updated-November-2023WM1.pdf,6,"to recover. For example; your home, a hospital or a place which is set up to help you recover from chroming. A police station is NOT a UNDER REVIEW safe place under this law. Who can help? Remember that drug use can be harmful to your general health. A conviction for a drug offence may cause you problems in the future, for example when applying for a job or if you are going overseas. If you want more information call: Youth Advocacy Centre 3356 1002 Youth Legal Advice Hotline ………………………………………………………………………………………………1800 527 527 (Monday - Thursday 8am – 9pm; Friday 8am – Sunday 5pm) Brisbane Youth Service 3620 2400 Logan Youth & Family Service 3826 1500 Adolescent Drug and Withdrawal Service (ADAWS) 3163 8400 Hothouse (Youth Program) 38375633 H.A.D.S. 3646 8704 Alcohol & Drug Information Service (24 hr) 3837 5989 Outside Brisbane 1800 177 833 QLD Intravenous AIDS Association (QuIVVA) 36208111 Indigenous Youth Health Service 3240 8071 Translating & Interpreting Service (24 hr) 13 1450 Child Safety After Hours Service Centre 1800 177 135 Youth Legal Advice Hotline 1800 527 527 This sheet was last reviewed and updated in November 2023. The Youth Advocacy Centre does not accept responsibility for any action or outcome as a result of anyone relying on the information provided. © Youth Advocacy Centre Inc 3"
Domestic-Violence-Updated-November-2023WM1.pdf,0,"DOMESTIC section (below on this factsheet), Department of Child Safety on 13 74 68, or the police. Child VIOLENCE Safety or the police may decide that it is not safe This sheet is intended to provide for you to live at home and may apply to the court general legal information about for you to be taken into care for a while. the law in Queensland. This information is not legal However, if a young person does something to a advice. If you have a particular family member which is against the law, such as legal problem you should contact a solicitor for legal advice. physically hurting their parent, or damaging their At the end is a list of agencies that might be able to assist you, including legal agencies. property, then the parent can call the police and have their child charged with breaking the law. What is Domestic and Family Violence? Domestic and family violence is about people in Young people as partners certain relationships being treated badly. There Domestic violence laws apply to all couples, are laws to protect people who are victims of regardless of the age of the parties. The law domestic and family violence. includes couples where either one or both partners are under 18 (but remember it is unlawful The law defines domestic violence very broadly – for any person to have sex with someone under you don’t have to be physically harmed to be a 16, see ‘Sex’ factsheet). In deciding if you are a victim of domestic violence. Domestic and family couple the police and court will want to know: violence can include a person: • how dependent you are on each other • hurting someone– physically, emotionally • how committed you are to each other (do or psychologically – such"
Domestic-Violence-Updated-November-2023WM1.pdf,1,"you are a victim of domestic violence. Domestic and family couple the police and court will want to know: violence can include a person: • how dependent you are on each other • hurting someone– physically, emotionally • how committed you are to each other (do or psychologically – such as by hitting you live together, do you share money and them, grabbing hold of them, criticising possessions) them, or making them feel useless or • how long you have been together worthless • how often you are with each other • controlling them – including by stopping • are you in a sexual relationship them seeing friends and family; stopping • whether the relationship is exclusive them getting a job; not letting them If you are experiencing domestic violence in your access money or things they own; relationship and either of you were under 16 when following or repeatedly texting them (like the relationship started, you should talk to a stalking someone); monitoring where lawyer because there are legal issues for young thUey are gNoing or Dwho theEy are wRith RpeEople inV relatioInshEips unWder 16: See the “Who • threatening them or someone or Can Help” list below and “Sex” Fact Sheet. something they care about (like a pet) - even threatening to harm or kill themselves, or threatening to tell others What action can the police take when someone about their sexual orientation if the other under 18 is in a couple relationship and there is person doesn’t do what they want. domestic violence? Police can: What relationships are covered? • Give a person they believe has committed The laws apply to people who are: domestic violence a Police Protection • married, have been married, are Notice (PPN) to stop the person doing engaged, are a couple, or"
Domestic-Violence-Updated-November-2023WM1.pdf,2,"do what they want. domestic violence? Police can: What relationships are covered? • Give a person they believe has committed The laws apply to people who are: domestic violence a Police Protection • married, have been married, are Notice (PPN) to stop the person doing engaged, are a couple, or have been a more harm once the police leave (for couple (including same sex couples) example, the notice could ban the person • family members or relatives – related from the house for up to 24 hours). either by blood, marriage, or cultural • Where they have already given a PPN, connections also take the person who is committing • helping to care for other people who domestic violence to a police station and need help with things like meals, hold them for 4 hours (or 8 hours if they are shopping, getting dressed (this doesn’t drunk/under the influence of drugs). include parents and their children under • Go to court and ask for a Protection Order 18). for up to 5 years. How do Domestic and Family Violence laws apply Police can decide to do these things even if the to young people? victim does not want anything to happen Young people within the family and Orders relating to domestic violence between if the police think that there has been domestic family members or relatives can only be made violence where both the victim and the person using the and either — violence are 18 and over. This means young • someone is in danger of being injured by people under 18 cannot get Domestic Violence another person; or Orders against their family members and family • there is likely to be damage to property. members cannot get Domestic Violence Orders against children who are under 18. The police"
Domestic-Violence-Updated-November-2023WM1.pdf,3,"young • someone is in danger of being injured by people under 18 cannot get Domestic Violence another person; or Orders against their family members and family • there is likely to be damage to property. members cannot get Domestic Violence Orders against children who are under 18. The police should only take a young person under 18 into custody for domestic violence: If you feel unsafe in your family, you can contact one of the agencies under the ‘Who Can Help’ • when they have no alternatives © Youth Advocacy Centre Inc 1 • and for as short a time as possible court. Punishment can include being sent to • and must tell a parent. detention or jail. If the young person is on an order under Child Who can help? Safety the police must let Child Safety know. Youth Advocacy Centre (YAC) 3356 1002 Young people must be held separately from any www.yac.net.au adults being held in custody at the same place. Hub Community Legal 3372 7677 If a young person is banned from their home for www.hubcommunity.org.au 24 hours, the police officer must— Logan Youth & Family Legal Service 3826 1500 • arrange temporary accommodation for the www.yfs.org.au young person; and Legal Aid Queensland 1300 651 188 • transport, or arrange for the transport of, www.legalaid.qld.gov.au the young person to the accommodation. Youth Legal Advice Hotline 1800 527 527 (Monday - Thursday 8am – 9pm; Friday 8am – Sunday If the ‘domestic violence’ is also a crime (for 5pm) example, stalking, or assault), then the Police can Aboriginal & Torres Strait Islander Legal Service 3025 arrest and charge the person with that offence as 3888 or (free call) 1800 012 255 (24hrs 7 days a well as taking action under domestic violence week) www.atsils.org.au laws For example,"
Domestic-Violence-Updated-November-2023WM1.pdf,4,"(for 5pm) example, stalking, or assault), then the Police can Aboriginal & Torres Strait Islander Legal Service 3025 arrest and charge the person with that offence as 3888 or (free call) 1800 012 255 (24hrs 7 days a well as taking action under domestic violence week) www.atsils.org.au laws For example, if one parent hits another Translating & Interpreting Services (24hrs) 131 450 parent, then the police can charge the violent Community Legal Centres (CLCs) see parent and issue a police protection notice www.naclc.org.au for your nearest CLC banning them from the home for 24 hours. What can the courts do? A Magistrate can make a Domestic Violence This sheet was last reviewed and updated in October Order against a person if they decide that an 2023. The Youth Advocacy Centre does not accept responsibility for any action or outcome as a result of Order is needed to protect a person from anyone relying on the information provided. domestic violence. For someone under 18, this is only where young people are in, or have been in, a “couple” or “informal care” relationship. The Court can make Orders to keep the person away and stop them committing domestic UNDER REVIEW violence (including making them leave the house and live somewhere else). The Order can stay in place for up to 5 years. If an Order is made to protect one of your parents and you are under 18 and living at home, the Order can name you as someone protected by the Order. This can happen even if you did not ask to be protected, and do not want to be named. The order may include no contact with the person against whom the order is made. What conditions can be put on Domestic Violence Orders (including Police Protection Notices)? All Domestic"
Domestic-Violence-Updated-November-2023WM1.pdf,5,"Order. This can happen even if you did not ask to be protected, and do not want to be named. The order may include no contact with the person against whom the order is made. What conditions can be put on Domestic Violence Orders (including Police Protection Notices)? All Domestic Violence Orders MUST include the condition that the person: • be of good behaviour, and • not commit domestic violence towards the other person The Order can also include conditions, like: • not to contact a particular person or people (including their children) • to stay away from certain places (for example, school, home, or work) • or any other conditions that the courts believe are necessary or desirable to protect the victim. What happens if someone breaches a Domestic Violence Order (including Police Protection Notices)? It is a criminal offence to breach (break the conditions) of a Domestic Violence Order (including Police Protection Notice) and the person can be charged and be punished by the © Youth Advocacy Centre Inc 2"
Victim-of-a-crime.pdf,0,"Victim of a crime Who is a victim? There are different types of victims of crimes. • Primary victims are those who are directly injured by the crime (for example you were assaulted while at a shopping centre) • Secondary victims are those who are injured because of witnessing a crime (for example developing anxiety after seeing an assault) • Parent secondary victims are parents who have been injured as a result from violence against their child (for example the parent becomes depressed) • A related victim is a close family member of a primary victim who has died, so they suffer an injury (for example the son of a father who is murdered suffers a trauma related injury). Can I get compensation? If you are a victim and have experienced harm, then you may be able to get a payment from the government.1 One way is through the Victims Assist Program. This program assists victims of certain offences. For more information on whether you can apply, it is best to speak to a lawyer or call Legal Aid Queensland for free legal advice on 1300 651 188. For victims under the age of 18, you will have 3 years after the day you turn 18 to make an application for compensation.2 There may be other options for compensation. Please refer to one of the legal agencies listed under ‘Who can I contact?’ Survivors of sexual assault Sexual assault is against the law.3 It includes rape and incest - having sex with a relative including step, adopted or foster siblings as well as touching or kissing someone without their consent.4 You have the right to feel safe and protected. Seeking support can be difficult but getting information from someone you trust may help you decide what you would like to"
Victim-of-a-crime.pdf,1,"sex with a relative including step, adopted or foster siblings as well as touching or kissing someone without their consent.4 You have the right to feel safe and protected. Seeking support can be difficult but getting information from someone you trust may help you decide what you would like to do. What happens if I tell someone? It is your choice whether to tell someone what has happened to you. You do not have to report a sexual assault to the police BUT there is a law which says that if an adult believes you have been the victim of a 1 Victims of Crime Assistance Act 2009 (Qld) ss 5, 21, 26. 2 Victims of Crime Assistance Act 2009 (Qld) s 54(1)(c). 3 Criminal Code Act 1899 (Qld) ss 349, 352, 222. 4 Criminal Code Act 1899 (Qld) ss 222(1)(2), 352. Reviewed 24/07/2025 This sheet is intended to provide general legal information about the law in Queensland. This information is not legal advice. If you have a particular legal problem you should contact a solicitor for legal advice. At the end is a list of agencies that might be able to assist you, including legal agencies. Victim of a crime sexual offence (like a sexual assault or rape) then the adult must tell the police (They also have to do this if you have a conversation with any adult and tell them about sexual activity you have had while you were under 16 with another adult (someone 18 or older) even if you agreed).5 If you tell a person from Child Safety Services or the police about the sexual assault then they must investigate it. If you are under 18, need medical treatment and a doctor believes you have been sexually assaulted, then they must tell the police or"
Victim-of-a-crime.pdf,2,"older) even if you agreed).5 If you tell a person from Child Safety Services or the police about the sexual assault then they must investigate it. If you are under 18, need medical treatment and a doctor believes you have been sexually assaulted, then they must tell the police or Child Safety Services.6 Any medical report may be important later to support your story if the matter goes to court. You do not have to answer questions or give any information to anyone if you do not want to. A doctor cannot refuse to treat you because you do not give full details of what happened and who was involved. It is important to look after yourself by seeing a doctor as soon as possible for sexually transmitted infections, pregnancy and your general health. If a teacher reasonably believes a child at the school has been sexually abused by another person, they must report it to the principal who must report it to the police.7 If the Office of the Public Guardian (OPG) is told about abuse they must report it to the Department of Child Safety and the police.8 It is important to check that whoever you talk to (youth worker or friend) respects your right to decide whether to report your assault to the police or Child Safety Services. Call one of the agencies under ‘Who can I contact for support?’ if you are unsure who to trust. What happens if a sexual assault is reported? Before you report a sexual assault you can contact one of the agencies under ‘Who can I contact for support?’. The steps below give you an idea of what happens if a sexual assault is reported to the police or Child Safety: • You make a complaint/ask for help • You are"
Victim-of-a-crime.pdf,3,"report a sexual assault you can contact one of the agencies under ‘Who can I contact for support?’. The steps below give you an idea of what happens if a sexual assault is reported to the police or Child Safety: • You make a complaint/ask for help • You are interviewed by police (usually videoed) or a Child Safety officer • Police gather other evidence (for example, medical report, other witnesses). The police or Child Safety may ask you to undergo a medical examination • The person you say assaulted you is interviewed by police (the person can refuse to be interviewed) • Police or Child Safety Services make a decision about what should happen next: if the police believe there is enough evidence to show that the person has broken the - law, the person is charged and is taken to court if Child Safety Services believes you are not being cared for or you are not safe from - further harm they may take out a Child Protection Order (which means that Child Safety Services may become your guardian and make decisions about you). 5 Criminal Code Act 1899 (Qld) s 229BC. 6 Child Protection Act 1999 (Qld) s13E(1). 7 Child Protection Act 1999 (Qld) s13E(1). 8 Child Protection Act 1999 (Qld) ss13E(1), 13G. Victim of a crime Reporting a sexual assault can be difficult as it will mean you will have to talk about what has happened to you in detail to people you do not know. You will need to think about what going to court will mean for you. It is important to know your rights. If you report the assault, you may not be able to control what happens and decisions may be taken out of your hands. Do I have to have a"
Victim-of-a-crime.pdf,4,"You will need to think about what going to court will mean for you. It is important to know your rights. If you report the assault, you may not be able to control what happens and decisions may be taken out of your hands. Do I have to have a medical examination? NO. But sometimes the police may want you to have a medical examination, to gather evidence for the case. This is your decision. If you say no, the police may not be able to take the offender to court because there may not be enough evidence. A court can order a medical examination if Child Safety is assessing whether you are at risk of further harm and a Child Protection Order should be taken out. You should get your own legal advice if this is happening to you. What happens if I change my mind? If you change your mind about going to court you can ask the police for a ‘Withdrawal of Complaint’ form. This form should be completed as soon as possible. It is a police decision whether to drop your case. This may depend on a few things such as whether they have completed their investigations into your case and have found enough evidence to continue to court. The police will not necessarily drop the case because you no longer want to go to court. If you change your mind it is a good idea to contact one of the agencies under ‘Who can help?’ to support you in telling the police your decision. What about court? If the police decide that there is enough evidence, the case will be taken to court. If the case is not taken to court, it is because the police do not have enough evidence. This does not necessarily"
Victim-of-a-crime.pdf,5,"to support you in telling the police your decision. What about court? If the police decide that there is enough evidence, the case will be taken to court. If the case is not taken to court, it is because the police do not have enough evidence. This does not necessarily mean that the police do not believe you. Will I have to be a witness at court? If you are the victim and the alleged offender (defendant) says they are not guilty, it is very likely that you will have to give evidence to a court. If you are under 16 your statement will be recorded on video. This will be used as your evidence at the committal (the initial court proceedings). It will also be used as your evidence at the trial. The lawyer for the defendant can still ask you questions at a pre-trial hearing (the pre-recording), however there are rules about the type of questions that they can ask. It is also possible to give evidence through an audio-visual link and not actually be in the court room. If this option is not available then you are entitled to give evidence from behind a screen so you do not have to see the defendant. Being a witness can be difficult because you have to say what happened to you and answer questions from the alleged offender's lawyer. Court can take a long time and the offender may be found not guilty. This does not necessarily mean that the court did not believe you. Victim of a crime Will I need to prepare a victim impact statement? You may need to consider preparing a victim impact statement. A victim impact statement is where you can explain how the crime has affected you (for example the physical, emotional and"
Victim-of-a-crime.pdf,6,"the court did not believe you. Victim of a crime Will I need to prepare a victim impact statement? You may need to consider preparing a victim impact statement. A victim impact statement is where you can explain how the crime has affected you (for example the physical, emotional and financial impacts of the crime). It is a written statement that can include things like a medical report or letter from your counsellor. Sometimes the court may want to ask you questions about anything you have included in your victim impact statement. Often other people affected by the crime, such as your parents, are also able to submit a victim impact statement. The court can then consider the information in your statement when sentencing of the offender. Victim of a crime Who can I contact for support Youth Advocacy Centre (YAC) www.yac.net.au 3356 1002 Aboriginal & Torres Strait Islander Legal Service (24hrs 7 days a week) www.atsils.org.au 3025 3888 or (free call) 1800 012 255 Logan Youth & Family Legal Service www.yfs.org.au 3826 1500 Legal Aid Queensland www.legalaid.qld.gov.au 1300 651 188 Hub Community Legal www.hubcommunity.org.au 3372 7677 Youth Legal Advice Hotline (Monday – Thursday 8am – 9pm; Friday 8am – Sunday 5pm) 1800 527 527 Community Legal Centres (CLCs) see www.naclc.org.au for your nearest CLC About the Youth Advocacy Centre The Youth Advocacy Centre offers free and confidential legal and social support services for young people in Queensland. www.yac.net.au (07) 3356 1002"
Youth Justice cultural units _ Department of Youth Justice and Victim Support.pdf,0,"26/08/2025, 15:56 Youth Justice cultural units | Department of Youth Justice and Victim Support Department of Youth Justice and Victim Support Governance (https://www.youthjustice.qld.gov.au/our-department/who-we-are/governance) >> Cultural units Youth Justice cultural units Importance of a cultural unit A cultural unit is a point of contact to: ensure we best support Aboriginal and Torres Strait Islander young people in the youth justice system give cultural advice and information communicate with the right people about cultural matters. As well as supporting Aboriginal and Torres Strait Islander young people in the youth justice system, our cultural units have helped Aboriginal and Torres Strait Islander staff members to broaden their skills and experience. Youth Justice Cultural Unit The Youth Justice Cultural Unit works with other teams across Youth Justice, including regions. They embed Aboriginal and Torres Strait Islander cultural perspectives, knowledge, participation and capability across the youth justice system. The Youth Justice Cultural Unit provides secretariat support to the First Nations Action Board (https://www.youthjustice.qld.gov.au/our-department/who-we- are/governance/action-board) and works in consultation with the Board. The cultural unit also: provides cultural guidance and input in senior departmental forums facilitates cultural capability training https://www.youthjustice.qld.gov.au/our-department/who-we-are/governance/cultural-units 1/2 26/08/2025, 15:56 Youth Justice cultural units | Department of Youth Justice and Victim Support helps the Department of Youth Justice, Employment, Small Business and Training to develop operational policies, procedures, programs and systems. Youth detention centre cultural units Cultural units and cultural liaison officers provide cultural support in youth detention centres by: working with the leadership team directly supporting Aboriginal and Torres Strait Islander young people in detention centres engaging with internal and external stakeholders to provide essential frontline support to promote, establish and maintain young people's cultural identities and connections providing training to staff and key stakeholders to ensure that engagement and services are culturally appropriate encouraging centre-wide participation in significant cultural traditions, customs"
Youth Justice cultural units _ Department of Youth Justice and Victim Support.pdf,1,"people in detention centres engaging with internal and external stakeholders to provide essential frontline support to promote, establish and maintain young people's cultural identities and connections providing training to staff and key stakeholders to ensure that engagement and services are culturally appropriate encouraging centre-wide participation in significant cultural traditions, customs and protocols participating in case planning processes to support young people's transition and reintegration back into their communities. Governance (https://www.youthjustice.qld.gov.au/our- department/who-we-are/governance) Governance framework (https://www.youthjustice.qld.gov.au/our-department/who- we-are/governance/governance-framework) First Nations Action Board (https://www.youthjustice.qld.gov.au/our- department/who-we-are/governance/action-board) Cultural units (https://www.youthjustice.qld.gov.au/our-department/who-we- are/governance/cultural-units) https://www.youthjustice.qld.gov.au/our-department/who-we-are/governance/cultural-units 2/2"
Routine in detention _ Department of Youth Justice and Victim Support.pdf,0,"26/08/2025, 15:38 Routine in detention | Department of Youth Justice and Victim Support Department of Youth Justice and Victim Support Life for young people in a detention centre (https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/life-for-young-people-in-a-detention-centre) >> Routine in detention Routine in detention Young people are busy most of the day in the detention centre. They follow a routine that includes going to school at the centre, as well as taking part in programs and activities. The detention centre supplies the young person with clothes, shoes and everything else they need. When they arrive at the centre, we take all their personal belongings and store them until they are released (except for dangerous items). The young person is allowed to keep family photographs in their room. Family members and friends can also send some to them. Read our youth detention centre - daily routine (https://www.publications.qld.gov.au/dataset/e79976ad-27d3-4019-94d5- 15a76950ce4f/resource/8f8b9561-75c2-4561-96f2-a207cba75330/download/youth-detention-centre-daily-routine.pdf) to learn more about what daily routines a young person may undertake during their time in detention. Sleeping The centre has several accommodation units. Each has: a kitchen a lounge and dining room a quiet area an outdoor area multiple young people's bedrooms. Each young person's room has a bed, toilet, shower, desk and shelf. We supply sheets, blankets, a pillow and toiletries. Each young person is safe in their secure room. There are times during the day and night when they will be locked in their room. When a young person is locked in their room (including overnight), we check on them every 15 minutes. Food In detention, a young person gets breakfast, lunch and dinner, as well as morning and afternoon tea each day. Dieticians review menus with a focus on the needs of young people to make sure they offer appropriate nutrition and variety. Kitchen staff at the detention centre cook most of the meals on site. Kitchen"
Routine in detention _ Department of Youth Justice and Victim Support.pdf,1,"person gets breakfast, lunch and dinner, as well as morning and afternoon tea each day. Dieticians review menus with a focus on the needs of young people to make sure they offer appropriate nutrition and variety. Kitchen staff at the detention centre cook most of the meals on site. Kitchen staff can cater for health, cultural or religious dietary needs. A young person should tell staff about these when they enter the centre. School Each young person attends school at the detention centre (https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/helping- young-people-in-detention/education) from Monday to Friday during school terms. The school can also offer vocational courses through TAFE. Other programs and activities On weekends and outside of school hours, the youth detention centre holds other programs and activities, such as art, music, Indigenous dance and sport. https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/life-for-young-people-in-a-detention-centre/routine-in-detention 1/3 26/08/2025, 15:38 Routine in detention | Department of Youth Justice and Victim Support During NAIDOC Week (http://www.naidoc.org.au), the centre celebrates the achievements of Aboriginal and Torres Strait Islander peoples. Schedule While at a youth detention centre, a young person follows a structured routine each day. Daily routine begins at 7am and usually ends between 7.30pm and 7.45pm. Monday to Friday wake, shower, get dressed and clean room breakfast and housekeeping school or program morning tea school or program lunch school or program afternoon tea school or program dinner, housekeeping and unit time bedtime Weekends and public/school holidays wake, shower, get dressed and clean room breakfast, housekeeping and unit activities programs lunch programs rest or free time programs dinner bedtime (5h.jtptpgs)://www.youthjustice.qld.gov.au(6/h._jtp_tdpgas)t:/a//wawsswe.tyso/iumthajgues/t0ic0e2.q2/ld3.5g7o4v3.a/au(7c/h.c_jtp_otdpgmas)mt:/a/o/wadwsaswteio.tysno/-iumthajgues/t0ic0e2.q3/ld3.5g7o4v4.a/au(8c/h.c_jtp_otdpgmas)mt:/a/o/wadwsaswteio.tysno/-iumthajgues/t0ic0e2.q4/ld3.5g7o4v5.a/au (1h.jtptpgs)://www.youthjustice.qld.gov.au(1/h._jtp_tdpgas)t:/a//wawsswe.tyso/iumthajgues/t0ic0e2.q6/ld3.5g7o4v7.a/cu(a/hr_te_td-past:/a//wawsswe.tyso/iumthajgues/t0ic0e2.q7/ld3.5g7o4v8.a/fua(/hc_ti_ltidptiaset:s/a/-/wawsswe.tyso/iumthajgues/t0ic0e2.q8/ld3.5g7o4v9.a/ium (https://www.youthjustice.qld.gov.au(1/h._jtp_tdpgas)t:/a//wawsswe.tyso/iumthajgues/t0ic0e2.q1/ld3.5g7o5v1.a/ium(2/h._gjtp_t_dpg5as)7t:2/a/5/wa.jwspsgwe).tyso/iumthajgues/t0ic0e2.q2/ld3.5g7o5v2.a/su(3c/hh._jtp_otdpgoas)l-t:/a//wawsswe.tyso/iumthajgues/t0ic0e2.q3/ld3.5g7o5v3.a/su (phlattcpes-:1/./jwpgw)w.youthjustice.qld.gov.au(p/hl_at_tcdpeas-t:3/a./j/wpagwss)we.tyso/iumthajgues/t0ic0e2.q5/ld3.5g7o5v5.a/su(pe/hlc_at_utcdpreeas--t:4/a./j/wpagwss)we.tyso/iumthajgues/t0ic0e2.q6/ld3.5g7o5v6.a/su(4e/h.c_jtp_utdpgreas)-t:/a//wawsswe.tyso/iumthajgues/t0ic0e2.q7/ld3.5g7o5v7.a/su More information Learn about the rules in detention centres (https://www.dcssds.qld.gov.au/_youth-justice/parents-carers/youth-detention/life-for-young- people-in-a-detention-centre/detention-centre-rules). Find out what rights a young person has in detention (https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/life-for- young-people-in-a-detention-centre/your-childs-rights-in-detention). Life for young people in a detention centre (https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/life-for- https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/life-for-young-people-in-a-detention-centre/routine-in-detention 2/3 26/08/2025, 15:38 Routine in detention | Department of Youth Justice and Victim"
Routine in detention _ Department of Youth Justice and Victim Support.pdf,2,"(5h.jtptpgs)://www.youthjustice.qld.gov.au(6/h._jtp_tdpgas)t:/a//wawsswe.tyso/iumthajgues/t0ic0e2.q2/ld3.5g7o4v3.a/au(7c/h.c_jtp_otdpgmas)mt:/a/o/wadwsaswteio.tysno/-iumthajgues/t0ic0e2.q3/ld3.5g7o4v4.a/au(8c/h.c_jtp_otdpgmas)mt:/a/o/wadwsaswteio.tysno/-iumthajgues/t0ic0e2.q4/ld3.5g7o4v5.a/au (1h.jtptpgs)://www.youthjustice.qld.gov.au(1/h._jtp_tdpgas)t:/a//wawsswe.tyso/iumthajgues/t0ic0e2.q6/ld3.5g7o4v7.a/cu(a/hr_te_td-past:/a//wawsswe.tyso/iumthajgues/t0ic0e2.q7/ld3.5g7o4v8.a/fua(/hc_ti_ltidptiaset:s/a/-/wawsswe.tyso/iumthajgues/t0ic0e2.q8/ld3.5g7o4v9.a/ium (https://www.youthjustice.qld.gov.au(1/h._jtp_tdpgas)t:/a//wawsswe.tyso/iumthajgues/t0ic0e2.q1/ld3.5g7o5v1.a/ium(2/h._gjtp_t_dpg5as)7t:2/a/5/wa.jwspsgwe).tyso/iumthajgues/t0ic0e2.q2/ld3.5g7o5v2.a/su(3c/hh._jtp_otdpgoas)l-t:/a//wawsswe.tyso/iumthajgues/t0ic0e2.q3/ld3.5g7o5v3.a/su (phlattcpes-:1/./jwpgw)w.youthjustice.qld.gov.au(p/hl_at_tcdpeas-t:3/a./j/wpagwss)we.tyso/iumthajgues/t0ic0e2.q5/ld3.5g7o5v5.a/su(pe/hlc_at_utcdpreeas--t:4/a./j/wpagwss)we.tyso/iumthajgues/t0ic0e2.q6/ld3.5g7o5v6.a/su(4e/h.c_jtp_utdpgreas)-t:/a//wawsswe.tyso/iumthajgues/t0ic0e2.q7/ld3.5g7o5v7.a/su More information Learn about the rules in detention centres (https://www.dcssds.qld.gov.au/_youth-justice/parents-carers/youth-detention/life-for-young- people-in-a-detention-centre/detention-centre-rules). Find out what rights a young person has in detention (https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/life-for- young-people-in-a-detention-centre/your-childs-rights-in-detention). Life for young people in a detention centre (https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/life-for- https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/life-for-young-people-in-a-detention-centre/routine-in-detention 2/3 26/08/2025, 15:38 Routine in detention | Department of Youth Justice and Victim Support young-people-in-a-detention-centre) Routine in detention (https://www.youthjustice.qld.gov.au/parents-carers/youth- detention/life-for-young-people-in-a-detention-centre/routine-in-detention) Detention centre rules (https://www.youthjustice.qld.gov.au/parents-carers/youth- detention/life-for-young-people-in-a-detention-centre/detention-centre-rules) Your child's rights in detention (https://www.youthjustice.qld.gov.au/parents-carers/youth- detention/life-for-young-people-in-a-detention-centre/your-childs-rights-in-detention) Last reviewed: 18 March 2025 Last modified: 18 March 2025  Provide feedback (https://www.families.qld.gov.au/feedback?id=35730) This work is licensed under a Creative Commons Attribution 4.0 International (CC BY 4.0) licence (https://creativecommons.org/licenses/by/4.0/) https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/life-for-young-people-in-a-detention-centre/routine-in-detention 3/3"
youth-justice-pocket-stats-september-2024.pdf,0,"Department of Youth Justice and Victim Support Youth Justice Pocket Stats Sep 2024* Proven offences Offender Profile Did you know… 44,475 total finalised charges proven 43% of young people who have a finalised court 3229 young people had at least one proven offence appearance never return to the Youth Justice Systema 71% Male 55% Aboriginal and Torres Strait Islander 59% 7% 70% Reoffended within 12 monthsb PROPERTYc VIOLENT 455 Serious repeat offenders on an average day There were 76 Serious repeat offender declarations at 26 Sep 2024 577,462 3% 0.2% 31% Complexity of young offenders (Census 2023) DRUG SEXUAL OTHERd children aged 10 to 17 years in 81% have used at least one substance Queensland in 2024 38% in youth justice custodye have used ice or other methamphetamines Custodye (on an average day) 53% have experienced or been impacted by domestic young people in custody 1 in 179 Queensland children aged and family violence 311 (71% Aboriginal and Torres Strait Islander) 10 to 17 had a proven offence (0.6%) 44% have a mental health and/or behavioural disorder young people in unsentenced custodyf 271 1 in 485 Queensland children aged 10 to 17 (diagnosed or suspected) (69% Aboriginal and Torres Strait Islander) were supervised in the community on an average day (0.2%) 48% are disengaged from education, training or 53 days average sentenced duration employment 1 in 1859 Queensland children aged 10 to 17 25% have at least one parent who spent time in adult 49 days average unsentencedf duration were in custody on an average day (0.05%) custody 30% in unstable and/or unsuitable accommodation Orders Notes: a. Based on the number of lifetime court appearances for the cohort of 44% have a disability (assessed or suspected) young people with a finalised court appearance between 1 Oct 2023 1594 young people"
youth-justice-pocket-stats-september-2024.pdf,1,"in custody on an average day (0.05%) custody 30% in unstable and/or unsuitable accommodation Orders Notes: a. Based on the number of lifetime court appearances for the cohort of 44% have a disability (assessed or suspected) young people with a finalised court appearance between 1 Oct 2023 1594 young people received a total of 3195 supervised and 26 Sep 2024 who were eligible to have an offence finalised in the youth justice system. Aboriginal and Torres Strait Islander representation: orders b. For young people who had a new charged offence within 12 months of t 2 h 6 e S ir e e p a r 2 li 0 e 2 s 3 t . finalisation with a proven offence between 1 Oct 2022 and C To o r m re p s a S re tr d a i t t o I s n l o an n d -I e n r d y ig o e u n n o g u p s e y o o p u l n e g w p e e r o e p : le, Aboriginal and 1498 young people received a total of 2825 community- c. Includes theft, break and enter and unlawful use of motor vehicle based orders d. Includes traffic-related offences, public order offences, fraud and miscellaneous offences 15 x as likely to have a proven offence e. Custody is defined as young people in a youth detention centre on pre- 84% of community-based orders were successfully court custody, remand or sentence or in a police watchhouse/other 23 x as likely to receive a supervised order completed custody location (e.g. in police transit, court cells, hospital) on remand or sentence. It excludes young people on pre-court custody in locations 30 x other than a"
youth-justice-pocket-stats-september-2024.pdf,2,"orders were successfully court custody, remand or sentence or in a police watchhouse/other 23 x as likely to receive a supervised order completed custody location (e.g. in police transit, court cells, hospital) on remand or sentence. It excludes young people on pre-court custody in locations 30 x other than a youth detention centre. as likely to be held in Youth Justice custody 2936 restorative justice referrals received f. Includes both pre-court custody and remand. (64% court-referred; 36% police referred) 27 x as likely to be on remand * Data accurate as at 26 Sep 2024; This end date is due to the Department transitioning to a new information system, making data currently unavailable after 26 Sep 2024. The 2024 Sep data are operational and may represent a marginal undercount."
Police-Facts-You-Need-to-Know-November-2023 (1).pdf,0,"POLICE – FACTS YOU NEED TO KNOW This sheet is intended to provide general legal information about the law in Queensland. This information is not legal advice. If you have a particular legal problem you should contact a solicitor for legal advice. At the end is a list of agencies that might be able to assist you, including legal agencies. What do I have to tell the police? You have the right to silence. This applies even if you have been arrested for questioning. This means that do not have to make a statement or answer any questions, except you must give your correct name, address, and age. Not giving your name, address or age is an offence. Remember, there is no such thing as an ‘off-the-record chat.’ If you choose to answer police questions you can choose to answer only some of the questions and not all. It is a good idea to get legal advice before answering police questions. You can get free legal advice from the lawyers listed below. Anything you say can be used (and often is) in a police case against you. Do I have to carry ID on me? No… There is no law that says you have to carry ID, BUT if a police officer believes you have given a false name, address or age, they can detain you to find out who you are. If you are driving a car (including on a ‘L’ or ‘P’ plate) then it is an offence to fail to produce your driver’s licence if the police request it. Do Police have to show their ID? Sometimes… If a police officer is in plain clothes and they want to do something like arrest, search or make you ‘move-on’ the officer must tell you that they are a"
Police-Facts-You-Need-to-Know-November-2023 (1).pdf,1,"to fail to produce your driver’s licence if the police request it. Do Police have to show their ID? Sometimes… If a police officer is in plain clothes and they want to do something like arrest, search or make you ‘move-on’ the officer must tell you that they are a police officer and state their name, rank and station and show you their ID. If they are in uniform, they just have to tell you their name, rank and station. If the officer does not tell you, you can ASK. Do I have to go with a police officer? You do not have to go with a police officer unless you are arrested, but there is a law which states you must go with them if you have witnessed a breach of the peace. The police can arrest you to question you if they believe that you have broken or are breaking the law. If you are arrested for questioning you still do not have to answer any questions except to give your correct name, address and age. Unless the police know a lawyer has been organised for you, the police must contact a representative from a legal aid organisation and inform them before you are questioned. When can the police take my photograph? The police can only photograph you if you are arrested and charged. You do not have to agree to be photographed when being ‘street checked”. All police have body-worn cameras and there are rules police have to follow about how they use these cameras. All police must wear a body-worn camera while they are on-duty, and they can record you. What rules do the police have to follow when using a body-worn camera? • The police cannot record unclothed searches, but can record clothed searches •"
Police-Facts-You-Need-to-Know-November-2023 (1).pdf,2,"to follow about how they use these cameras. All police must wear a body-worn camera while they are on-duty, and they can record you. What rules do the police have to follow when using a body-worn camera? • The police cannot record unclothed searches, but can record clothed searches • The police do not have to stop recording you if you ask • The police generally have to be in uniform, or easily identifiable as a police officer, when using a body-worm camera • Whatever the police record can be used as evidence. If police have Body Worn Cameras they must record if they - • Are investigating a crime (e.g. seizing property or searching you) or arresting someone • Are using physical force against a person • Believe something should be recorded (the police can also start recording after an incident occurs). Do I have to be in a line up or give a DNA sample? No… You do not have to go with a police officer to be in a line up or to give them your DNA even if the police say they think you have broken the law. You should talk to a lawyer before agreeing to either of these things. © Youth Advocacy Centre Inc 1 Can police move me on? Yes, if … • You are in a public place or regulated place; and • Police think you caused (either through your behaviour or by just being there) a certain effect on people like causing anxiety. See our ‘Move On’ Fact Sheet for more information. What if I am arrested? You can ask why you are under arrest, but resisting arrest is an offence. You have the right to ask why the police officer is demanding you go with them. If you are not"
Police-Facts-You-Need-to-Know-November-2023 (1).pdf,3,"causing anxiety. See our ‘Move On’ Fact Sheet for more information. What if I am arrested? You can ask why you are under arrest, but resisting arrest is an offence. You have the right to ask why the police officer is demanding you go with them. If you are not under arrest, then you do not have to go with the police. If you are under arrest, a police officer must tell you why you are under arrest. Even if you have been arrested and charged you do not have to answer police questions. The police usually will not tell you about your right to remain silent unless they have decided to charge you with a criminal offence. A police officer is only allowed to use ‘reasonable force’ to carry out their job. Stay cool and calm and talk to a lawyer later about what you can do if you think the arrest was unfair or wrong or the police injured you. How long can the police hold me? The police can arrest and hold you for questioning for up to 8 hours to investigate an offence and question you about any offences they think you may have committed. They can only question you for 4 hours of that time. The time limit starts at the time you were arrested or were taken by police. The police can ask a JP or Magistrate to allow them to hold you and question you for a longer period of time. Remember, you can be held for questioning but you do not have to answer any questions, except your name, age and address. Who can I have with me during police questioning? Generally, if you are under 18 and questioned by police, you must have a ‘support person’ with you. The support person"
Police-Facts-You-Need-to-Know-November-2023 (1).pdf,4,"can be held for questioning but you do not have to answer any questions, except your name, age and address. Who can I have with me during police questioning? Generally, if you are under 18 and questioned by police, you must have a ‘support person’ with you. The support person should be: • a parent or guardian • a lawyer • a person who is acting for you who works in an agency that deals with the law • a relative or friend you would like to have there. • If none of these are available, then a justice of the peace (JP). You should tell the police which person you would like to have with you. The police should also give you the opportunity to talk to this person in private (where they cannot overhear you) before the questioning starts. If you are arrested the police have to make a reasonable effort to contact your parents, the police must take note if they cannot contact your parents. If you are being questioned about a minor offence such as littering then a ‘support person’ is not required. How much do I have to tell police at the station? You still have the right to silence at the police station. Whether you agree to go with the police or you are under arrest, you do not have to make a statement or answer any questions (in writing, on video or audio). You have the right to say NO to any form of interview BUT you should give your correct name, address and age each time you are asked. The police have to try and contact Legal Aid or the Aboriginal and Torres Strait Islander Legal Service before they interview you about a serious criminal offence (for example an offence that can"
Police-Facts-You-Need-to-Know-November-2023 (1).pdf,5,"of interview BUT you should give your correct name, address and age each time you are asked. The police have to try and contact Legal Aid or the Aboriginal and Torres Strait Islander Legal Service before they interview you about a serious criminal offence (for example an offence that can be tried by a Judge and jury in the District or Supreme Court). If you do participate in a police interview about a serious criminal offence, then the police should record it on video or audio. The police will give you a copy of the DVD after the interview. It is important to keep this DVD. If the police are unable to record your interview, then they can write it down and read it back to you. If you don’t agree with anything in the statement you should tell them at the time and ask them to change it. The police must give you a copy of the written record at the time. Even if you answered the questions you do not have to sign what the police wrote down. Do not sign anything you have not read, do not understand, or do not agree with. You do not have to write any statement. Lying to the police can get you into more trouble. Am I entitled to make a phone call? Yes, as long as it is to speak with a support person or solicitor. © Youth Advocacy Centre Inc 2 What if I am charged with an offence? If you are under 18 then you may be cautioned, sent to a Youth Restorative Justice Conference, sent to a Drug Diversion Assessment Program or sent to court. See our ‘If I am Charged’ Fact Sheet for more information. Treated unfairly? If the police do not treat you fairly and"
Police-Facts-You-Need-to-Know-November-2023 (1).pdf,6,"If you are under 18 then you may be cautioned, sent to a Youth Restorative Justice Conference, sent to a Drug Diversion Assessment Program or sent to court. See our ‘If I am Charged’ Fact Sheet for more information. Treated unfairly? If the police do not treat you fairly and politely you have the right to complain about it without the threat of being harassed. You can speak to the Crime and Corruption Commission on the phone number below. See our ‘Treated Unfairly’ Fact Sheet for more information. Who can help? Youth Advocacy Centre (YAC) www.yac.net.au ...................................................................... 3356 1002 Youth Legal Advice Hotline………………………………………………………………………………………………………………………………………1800 527 527 (Monday - Thursday 8am – 9pm; Friday 8am – Sunday 5pm) Hub Community Legal www.hubcommunity.org.au ................................................................. 3372 7677 Logan Youth & Family Legal Service www.yfs.org.au .............................................................. 3826 1500 Legal Aid Queensland www.legalaid.qld.gov.au ...................................................................... 1300 651 188 Aboriginal & Torres Strait Islander Legal Service www.atsils.org.au ........................................ 3025 3888 or (free call) 1800 012 255 (24hrs 7 days a week) Crime and Corruption Commission www.ccc.qld.gov.au ......................................................... 33606060 (free call outside Brisbane) 1800 061 611 Community Legal Centres (CLCs) see www.naclc.org.au for your nearest CLC This information was last reviewed and updated in November 2023. The Youth Advocacy Centre does not accept responsibility for any action or outcome as a result of anyone relying on the information provided. © Youth Advocacy Centre Inc 3"
Support programs _ Department of Youth Justice and Victim Support.pdf,0,"26/08/2025, 15:37 Support programs | Department of Youth Justice and Victim Support Department of Youth Justice and Victim Support Helping young people in detention (https://www.youthjustice.qld.gov.au/parents-carers/youth- detention/helping-young-people-in-detention) >> Support programs Support programs Programs and supports to help change behaviour In youth detention centres, we have programs and supports to help young people change their behaviour and make better choices. When a young person arrives at the youth detention centre, we will assess them. This helps us to identify which programs may help the young person, and we can tailor our support for that young person. Programs are designed at a level that matches the young person’s: age experience cognitive development social and emotional development educational background This happens for all young people whether they have been sentenced to a detention order or are on remand. Who runs the programs The staff who run these programs include: psychologists speech-language pathologists caseworkers https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/helping-young-people-in-detention/support-programs 1/4 26/08/2025, 15:37 Support programs | Department of Youth Justice and Victim Support Aboriginal and Torres Strait Islander program officers program officers Types of programs We run our programs and services in line with trauma-informed practice principles. Aggression replacement training Aggression replacement training (https://www.youthjustice.qld.gov.au/programs- initiatives/programs/all#helping-young-people-manage-their-anger-and-aggression- through-positive-thinking-22723-339) (ART) helps young people to deal with their anger and aggression. ART includes learning appropriate ways to respond to situations, how to keep control and calm down, and how to think about what it’s like to be in someone else’s shoes. Black chicks talking Black chicks talking (BCT) (https://www.youthjustice.qld.gov.au/programs- initiatives/programs/all#bringing-aboriginal-and-torres-strait-islander-young-women- together-22747-339) is a cultural program for Aboriginal and/or Torres Strait Islander young women. It supports cultural connections to community and identity and explores cultural histories through storytelling and yarning circles. Changing habits and reaching targets Changing habits and reaching targets (https://www.youthjustice.qld.gov.au/programs- initiatives/programs/all#helping-at-risk-young-people-change-their-behaviour-22715-339) (CHART) aims to reduce the risk of reoffending. It includes units on"
Support programs _ Department of Youth Justice and Victim Support.pdf,1,"program for Aboriginal and/or Torres Strait Islander young women. It supports cultural connections to community and identity and explores cultural histories through storytelling and yarning circles. Changing habits and reaching targets Changing habits and reaching targets (https://www.youthjustice.qld.gov.au/programs- initiatives/programs/all#helping-at-risk-young-people-change-their-behaviour-22715-339) (CHART) aims to reduce the risk of reoffending. It includes units on problem-solving, lifestyle balance, healthy relationships, and motivation to change. Emotional regulation and impulse control Emotional regulation and impulse control (ERIC) (https://www.youthjustice.qld.gov.au/programs-initiatives/programs/all#encouraging- healthy-social-and-emotional-development-22711-339) looks at underlying issues that young people have with emotional regulation and impulse control instead of targeting each mental health, justice or substance use issue separately. It includes skills and processes to manage emotions, urges and decision-making. https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/helping-young-people-in-detention/support-programs 2/4 26/08/2025, 15:37 Support programs | Department of Youth Justice and Victim Support Men’s project Men’s project is an evidence-informed program for young men aged 16+ years old who have shown domestic and family violence behaviours or are at significant risk of this. The program explores violence-based beliefs through conversation to allow the opportunity for growth. Staff help young men to unpack the complexities that relationships bring and allow them to explore skills and experiences to make alternative choices through critical reflection. Re-navigating anger and guilty emotions Re-navigating anger and guilty emotions (RAGE) is an anger management program. It is a strengths-based programs that is hands on and practical. It helps young people learn about anger including triggers, the cycle of anger, healthy expressions of anger, and the importance of relaxation, exercise and diet on their state of mind and emotions. Re-thinking our attitude towards driving Re-thinking our attitude towards driving (ROAD) (https://www.youthjustice.qld.gov.au/programs-initiatives/programs/all#exploring-the- motivations-behind-unsafe-motor-vehicle-behaviours-22719-339)is a program targeted at young people with motor vehicle offences, or at risk of becoming involved with motor vehicle offences. It identifies and explores motivations behind unsafe motor vehicle behaviours and challenges thoughts and behaviours associated"
Support programs _ Department of Youth Justice and Victim Support.pdf,2,"emotions. Re-thinking our attitude towards driving Re-thinking our attitude towards driving (ROAD) (https://www.youthjustice.qld.gov.au/programs-initiatives/programs/all#exploring-the- motivations-behind-unsafe-motor-vehicle-behaviours-22719-339)is a program targeted at young people with motor vehicle offences, or at risk of becoming involved with motor vehicle offences. It identifies and explores motivations behind unsafe motor vehicle behaviours and challenges thoughts and behaviours associated with them. It also helps increase young people’s empathy for victims. Supports A young person will work with their caseworker and our psychologists to identify goals. We will help a young person with evidence-based psychological interventions to address underlying issues behind their behaviours and substance use. We will use a variety of types of therapy to do this. More information Read more about mental health support in detention (https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/helping-young- people-in-detention/health-and-wellbeing). https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/helping-young-people-in-detention/support-programs 3/4 26/08/2025, 15:37 Support programs | Department of Youth Justice and Victim Support Learn who else is here to help (https://www.youthjustice.qld.gov.au/parents- carers/youth-detention/helping-young-people-in-detention) young people in detention. Helping young people in detention (https://www.youthjustice.qld.gov.au/parents- carers/youth-detention/helping-young-people-in- detention) Care in detention (https://www.youthjustice.qld.gov.au/parents-carers/youth- detention/helping-young-people-in-detention/care-in-detention) Education (https://www.youthjustice.qld.gov.au/parents-carers/youth- detention/helping-young-people-in-detention/education) Support programs (https://www.youthjustice.qld.gov.au/parents-carers/youth- detention/helping-young-people-in-detention/support-programs) Health and wellbeing (https://www.youthjustice.qld.gov.au/parents-carers/youth- detention/helping-young-people-in-detention/health-and-wellbeing) Last reviewed: 27 November 2024 Last modified: 27 November 2024  Provide feedback (https://www.families.qld.gov.au/feedback?id=34934) This work is licensed under a Creative Commons Attribution 4.0 International (CC BY 4.0) licence (https://creativecommons.org/licenses/by/4.0/) https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/helping-young-people-in-detention/support-programs 4/4"
Parents-and-Police-Updated-January-2024WM1.pdf,0,"PARENTS AND POLICE This sheet is intended to provide general legal information about the law in Queensland. This information is not legal advice. If you have a particular legal problem you should contact a solicitor for legal advice. At the end is a list of agencies that might be able to assist you, including legal agencies. At the end is a list of agencies that might be able to assist you, but please note that the Youth Advocacy Centre does not take direct enquiries from parents. Parents will commonly first learn that their child may have broken the law when the police phone or arrive at the door. It is important to: • keep calm • find out as much as possible about what the police say the young person has done – remember a complaint to police does not automatically mean your child has broken the law (even if they have done something wrong) • ask why the police want to speak with your child. It is recommended your child tells police that they will decide whether to give a statement or answer questions after they have spoken with a lawyer. Your child may call the Youth Hotline on 1800 527 527 or if your child identifies as Aboriginal or Torres Strait Islander, they may call ATSILS on 1800 012 255. For information on what your child does or does not have to do in relation to police, and what happens if they have to go to court, see the YAC Info sheets: Police – Facts You Need to Know; If I am Charged; Court; Childrens Court Queensland; Court Orders. The rest of this sheet is info for you as a parent. Are police allowed to come into my home or search my car? There are a number of"
Parents-and-Police-Updated-January-2024WM1.pdf,1,"the YAC Info sheets: Police – Facts You Need to Know; If I am Charged; Court; Childrens Court Queensland; Court Orders. The rest of this sheet is info for you as a parent. Are police allowed to come into my home or search my car? There are a number of ways the police can legally conduct a search. The three main ways are: • Search warrant - if police seek to enter your home or examine your car with a search warrant you UNDER REVIEW have the right to get a copy of this warrant and the name, rank and station of the police officer. • Reasonable suspicion - police can enter a private place, such as your home or car, without a warrant, if they have ‘reasonable suspicion’ that they will find evidence of an offence and this evidence may be hidden or destroyed unless the place is immediately searched. • Consent - if you give police permission to search, then the police can stay in your home or keep searching your car until such time as you withdraw that consent and then they have to leave unless they have a specific power they are relying on to stay and search. If police take away any property belonging to you or your child the police must provide a field property receipt. As a parent, do I have to call the police if I think my child may have broken the law? If you are concerned your child may have broken the law you do not have to contact the police: however, there are potential consequences for parents if their child brings some things into the home. For example, if you think your child is using drugs then you are not under a legal obligation to let police know. However,"
Parents-and-Police-Updated-January-2024WM1.pdf,2,"broken the law you do not have to contact the police: however, there are potential consequences for parents if their child brings some things into the home. For example, if you think your child is using drugs then you are not under a legal obligation to let police know. However, if police find drugs belonging to your child at your home, it is assumed you had knowledge of the drugs since you are deemed to have control of the house. You may have to prove you did not know the drugs were there and that you had no reason to suspect the drugs were there. If you try to hide evidence of an offence or do something like putting items you think have been stolen in the bin, you could also be charged with breaking the law. This means you do not have to tell police about anything your child may have done, but you also cannot do anything to cover up what they may have done. If your child is over 18 and you have a reasonable suspicion that they have committed a sexual offence against a child, you are required to report this to police. As a parent do I have to go with police or give a statement to police? During an investigation police may seek to gather information from many sources including parents, even if the parents are not directly involved. There is, however, no legal obligation for a person to talk to police about any matter. You do not have to go anywhere with police, such as to the police station, unless you are under arrest. The police might want to question you about where your child was at a certain time. If the police approach you to give a statement it is important to"
Parents-and-Police-Updated-January-2024WM1.pdf,3,"matter. You do not have to go anywhere with police, such as to the police station, unless you are under arrest. The police might want to question you about where your child was at a certain time. If the police approach you to give a statement it is important to know that you do not have to say anything, but you should never lie to police, or try to mislead police as this may lead to you being charged (e.g. you should not say your child was at home at a certain time when you know they were not). © Youth Advocacy Centre Inc 1 If the police approach you or your child it is best to give your correct name, address, and age as it can be an offence not to do this. Be aware that anything you say (even on the street) may be tape-recorded without you knowing. There is no such thing as an ‘informal’ or ‘off the record’ chat or interview What is a support person’s role in a police recorded interview? A person under 18 years of age must have a support person at a police interview. This support person has to make sure the child understands the process and their rights, that they can exercise those rights, and to ensure that the police conduct the interview fairly. If your child decides to agree to an interview, one of the best ways to support them is to organise for the interview to take place after your child has spoken with a lawyer. Unless the police know a lawyer has been organised for your child, the police must contact a representative from a legal aid organisation and inform them before they question your child. See the list below for phone numbers for free legal help. If"
Parents-and-Police-Updated-January-2024WM1.pdf,4,"your child has spoken with a lawyer. Unless the police know a lawyer has been organised for your child, the police must contact a representative from a legal aid organisation and inform them before they question your child. See the list below for phone numbers for free legal help. If you are angry with your child, then your ability to be a support person can be a problem. Before the interview you should confirm that your child wants you to be their support person or if they might want another trusted objective adult to support them. What is a parent’s role if the young person formally admits that they broke the law and the police: • Caution the young person (give them a formal warning) because they have not been in much trouble before or have not committed a serious offence. The police must ensure either an adult chosen by the child or a parent is present for the Caution. There is no obligation on a parent to be present but if you do not attend and there is no other adult the child wants there then the police will not be able to issue the Caution which may mean they charge the young person instead and your child will have to go to court. • let the young person attend a Restorative Justice Conference where they will have the opportunity to discuss the consequences of committing the offence with the people they affected, such as the victim. The aim of the conference is that both parties agree on how the young person will make amends such as: an apology; agreeing to pay the victim some money or agreeing to attend a program. The young person must have a support person at the conference. Parents are entitled to be there"
Parents-and-Police-Updated-January-2024WM1.pdf,5,"of the conference is that both parties agree on how the young person will make amends such as: an apology; agreeing to pay the victim some money or agreeing to attend a program. The young person must have a support person at the conference. Parents are entitled to be there even if the young person is supported by another adUult. NDER REVIEW • offer a Drug Diversion Assessment Program if drugs were involved and the police believe a Caution is not suitable. The Drug Diversion Assessment Program is one session with a drug counsellor that lasts around two hours. Parents do not need to attend the program. If the young person is charged and has to go to court - do I have to be there as a parent? If a young person has to go to court, the court usually requires the parent to be there. If no parent attends, the court will want to know where the parents are and why they are not present. The court can issue a notice ordering the parents to come to court, and if they still do not attend the parents can be fined by the court. When the Magistrate/Judge chooses the most appropriate court order (sentence) for the young person, they will consider how the young person’s parent has responded to the alleged offence. Helping your child to learn from the event and to change their behaviour will be viewed positively by the courts. What if my child is the victim of a crime? It is the role of police to investigate crime. People do not have to report the crime to the police. If you have a reasonable suspicion that a sexual offence has occurred against a child by an adult, then you are required to report this to police."
Parents-and-Police-Updated-January-2024WM1.pdf,6,"of a crime? It is the role of police to investigate crime. People do not have to report the crime to the police. If you have a reasonable suspicion that a sexual offence has occurred against a child by an adult, then you are required to report this to police. It is important to understand what may happen if a matter is reported to police. It may be useful to talk to a lawyer first. If young people decide to report crime to police, the police decide if they are going to charge someone. Your child may be eligible for victim’s compensation and should speak to a lawyer about this. YAC can provide support to young people appearing as complainants or witnesses in court matters and help them to manage the process. See contact details below. How can I withdraw a complaint to police about my child? Sometimes parents complain to or call the police about their child and the police then charge the young person with an offence – such as with wilful damage or assault. Parents should be aware of the legal and non-legal consequences of this and should get some advice before speaking with the police. If a parent later decides that they don’t want the matter to go to court, they can seek to withdraw their complaint at any time, including after the young person has been charged and court proceedings have started. Any officer at a police station counter can assist the parent in filling out a ‘Withdrawal of Complaint’ form. The form will then be brought to the attention of the arresting officer, who will assess what steps are to be taken, such as having the charge formally dismissed by the © Youth Advocacy Centre Inc 2 court. However, if there is other evidence"
Parents-and-Police-Updated-January-2024WM1.pdf,7,"out a ‘Withdrawal of Complaint’ form. The form will then be brought to the attention of the arresting officer, who will assess what steps are to be taken, such as having the charge formally dismissed by the © Youth Advocacy Centre Inc 2 court. However, if there is other evidence about the offence, the police can still decide to proceed and the parent may still have to give evidence in court against their child if the child decides to plead “not guilty”. Who can help? Youth Advocacy Centre (YAC) www.yac.net.au ...................................................................... 3356 1002 Hub Community Legal www.hubcommunity.org.au ................................................................. 3372 7677 Legal Aid Queensland www.legalaid.qld.gov.au ....................................................................... 1300 651 188 Youth Legal Advice Hotline…………………………………………………………………………………………………………1800 527 527 (Monday - Thursday 8am – 9pm; Friday 8am – Sunday 5pm) Aboriginal & Torres Strait Islander Legal Service www.atsils.org.au ........................................ 3025 3888 or (24hrs 7 days a week) 1800 012 255 (Free call) Community Legal Centres (CLCs) see www.naclc.org.au for your nearest CLC This sheet was last reviewed and updated in January 2024.The Youth Advocacy Centre does not accept responsibility for any action or outcome as a result of anyone relying on the information provided. UNDER REVIEW © Youth Advocacy Centre Inc 3"
Legal-Info-Sheet-Making-Queensland-Safer-Bill-2024-1.pdf,0,"What do the new “adult crime, adult time” laws say? Queensland has new laws about youth crime. If you commit an offence while you are under 18 this is what the changes may mean for you. What is “adult crime, adult time”? There are now 13 offences for which children can receive the same penalty as an adult. The offence must have been committed after the 12th December 2024 for this to apply. The 13 offences are: • Unlawful use of a motor vehicle • Unlawful entry of a vehicle • Dangerous operations of a motor vehicle • Break and enter premises • Burglary • Robbery • Serious assault • Wounding • Acts intended to cause grievous bodily harm • Grievous bodily harm • Unlawful striking causing death • Manslaughter • Murder For these offences a magistrate may now sentence you to up to three years probation or detention. A judge can give you the same maximum penalty that an adult can get. A court can no longer order a restorative justice order for these offences. The court can still send you to another type of restorative justice process, like a pre-sentence (before sentence) referral. A mandatory sentence is a sentence that the court must give. If these apply to adults for the 13 offences they now apply to you as a child. This sheet is intended to provide general legal information about the law in Queensland. This information is not legal advice. If you have a particular legal problem you should contact a solicitor for legal advice. At the end is a list of agencies that might be able to assist you, including legal agencies. What do the new “adult crime, adult time” laws say? What if I've committed an offence on or before the 12th December 2024? The"
Legal-Info-Sheet-Making-Queensland-Safer-Bill-2024-1.pdf,1,"you should contact a solicitor for legal advice. At the end is a list of agencies that might be able to assist you, including legal agencies. What do the new “adult crime, adult time” laws say? What if I've committed an offence on or before the 12th December 2024? The “adult crime, adult time” laws won’t apply: you will be sentenced as the law was before these changes. If you are over 18, the laws about you being held in or moved to an adult prison will apply even if your offence took place on or before the 12th December 2024. How has sentencing changed? If you are found guilty for any offence committed as a child after the 12th of December then the matters to be considered to determine your penalty has changed. The new law says the court cannot consider that detention should be a last resort and that it would be preferable for you to stay in the community.1 The new law now requires a court to primarily consider the impact of the offence on any victim when sentencing you. What does the impact to a victim mean? The impact to a victim could mean how the offending affected the victim’s mental health, physical and emotional wellbeing, financial wellbeing, the cost of repairs, the time taken off work, the impact of not having a car and their feelings of safety. What criminal history is considered when I go to court? There are changes about when your criminal history can be given to an adult court and what can be included on your criminal history including cautions and restorative justice processes. These changes have not started yet. I am in a youth detention centre and will turn 18 before I am released. When will I need to be"
Legal-Info-Sheet-Making-Queensland-Safer-Bill-2024-1.pdf,2,"history can be given to an adult court and what can be included on your criminal history including cautions and restorative justice processes. These changes have not started yet. I am in a youth detention centre and will turn 18 before I am released. When will I need to be moved to an adult prison? Under the new laws, if you are in detention and you turn 18 you will usually be transferred to an adult prison. This will occur within 30 days of your 18th birthday. In limited circumstances, Youth Justice may allow you to stay in the detention centre if they think you are not a threat to the centre or people in it. If you are transferred to an adult prison and you are on a sentence, you will be released on parole on the day you would have been released from detention. If you are on remand and you are sentenced to a period of detention you will serve the sentence in an adult prison. If you believe you will turn 18 while in detention you should talk to your lawyer and case worker. They may be able to talk to Youth Justice about where you will stay. 1 Making Queensland Safer Bill 2024 (Qld) cl 15. What do the new “adult crime, adult time” laws say? Who is now able to come into the Childrens Court? Members of the public have always been able to attend most Childrens Courts where there is a judge. This has not changed. Most members of the public cannot be in a Childrens Court when the matter is before a magistrate. Your parents, the victims of the offence, and other people involved in your matter have always been able to come into the court before a magistrate. Under the new"
Legal-Info-Sheet-Making-Queensland-Safer-Bill-2024-1.pdf,3,"has not changed. Most members of the public cannot be in a Childrens Court when the matter is before a magistrate. Your parents, the victims of the offence, and other people involved in your matter have always been able to come into the court before a magistrate. Under the new laws, a victim’s relative and a victim’s representative may also come into court. Media people like news people, journalist, reporters can now also be in court and any person the court believes has a proper interest in being there. It is still an offence for anyone to publish anything that would identify a child charged with an offence, including their name, photo or address. If you are in court, remember that whatever you say might be reported in the media. Who can I contact for support Youth Advocacy Centre (YAC) www.yac.net.au 3356 1002 Aboriginal & Torres Strait Islander Legal Service (24hrs 7 days a week) www.atsils.org.au 3025 3888 or (free call) 1800 012 255 Logan Youth & Family Legal Service www.yfs.org.au 3826 1500 Legal Aid Queensland www.legalaid.qld.gov.au 1300 651 188 Hub Community Legal www.hubcommunity.org.au 3372 7677 Youth Legal Advice Hotline (Monday – Thursday 8am – 9pm; Friday 8am – Sunday 5pm) 1800 527 527 Community Legal Centres (CLCs) see www.naclc.org.au for your nearest CLC About the Youth Advocacy Centre The Youth Advocacy Centre offers free and confidential legal and social support services for young people in Queensland. www.yac.net.au (07) 3356 1002"
Treated-unfairly-discrimination.pdf,0,"Treated unfairly & discrimination What is discrimination? There are laws in Australia and Queensland which protect you from being treated unfairly. If you are treated unfairly or differently from other people because: • of your skin colour • of your cultural background • you are from a different country • you have a physical or intellectual disability • you have a physical or mental illness (including HIV/AIDS) • you are LGBTIQ+ • of your gender • you are young or old • you are single or married • you have a criminal record • you are pregnant or breastfeeding • you have particular religious or political ideas or beliefs • you are in a trade union.1 AND this treatment happens: • at work • at school, college or university • when getting goods or using services • looking for accommodation • getting into places or facilities • joining clubs • in advertisements • when getting a loan 1 Anti-Discrimination Act 1991 (Qld) ss 7, 10, 11. Reviewed 06/08/2025 This sheet is intended to provide general legal information about the law in Queensland. This information is not legal advice. If you have a particular legal problem you should contact a solicitor for legal advice. At the end is a list of agencies that might be able to assist you, including legal agencies. Treated unfairly & discrimination • when dealing with local councils or the government • when dealing with superannuation or insurance • if you are buying land.2 Then you have been discriminated against. Examples of discrimination are: • paying workers from a different cultural heritage less money than white workers • excluding a young woman from school because she is pregnant • refusing to rent a flat to someone who is from a different country • refusing to let a"
Treated-unfairly-discrimination.pdf,1,"been discriminated against. Examples of discrimination are: • paying workers from a different cultural heritage less money than white workers • excluding a young woman from school because she is pregnant • refusing to rent a flat to someone who is from a different country • refusing to let a gay child join their local sports team • inappropriate sexual comments in the workplace. What is sexual harassment? This is another form of discrimination. This means that you are being intimidated, offended and/or humiliated in a sexual way. It can include someone suggesting or trying to get you to have sex, trying to touch you in a way you don't like, or displaying photographs that upset or offend you. Sexual harassment is against the law in Queensland.3 What can I do? Some laws on discrimination apply all over Australia. These are dealt with by the Australian Human Rights Commission (AHRC). Other laws apply only in Queensland and complaints go to the Queensland Human Rights Commission (QHRC). Not all discrimination is against the law. You will need to check with AHRC and QHRC to see what you can do in your situation. You can call the AHRC on 1300 369 711 and the QHRC on 1300 130 670. If you feel you are being treated unfairly or differently to others, you can talk to the person who is being unfair. Sometimes telling them how you feel may be enough to make them stop. You could ask someone else to go with you when you talk to the person. If this doesn't work or you aren't able to talk to them, make sure you write down: • what happened to you • who the other person or agency was • when and where it happened • any other people who saw or"
Treated-unfairly-discrimination.pdf,2,"you when you talk to the person. If this doesn't work or you aren't able to talk to them, make sure you write down: • what happened to you • who the other person or agency was • when and where it happened • any other people who saw or heard it. This will make it easier if you decide to make a complaint. 2 Anti-Discrimination Act 1991 (Qld) ss 7, 10, 11. 3 Anti-Discrimination Act 1991 (Qld) s 118. Treated unfairly & discrimination What is Stalking? Stalking is another form of harassment. It involves making a person fear that some violence may be done to them, their property or someone close to them. Things that might make them scared include: • being followed or watched • telephone calls which are threatening or keep happening even when the person has been asked not to call • interfering with their property • leaving stuff around which they would find offensive. It does not matter if the victim was afraid or suffered any harm. It only matters that the behaviour would typically cause people to feel afraid or suffer harm.4 Stalking is a crime.5 If you think this is happening to you, you should keep a record of what's going on with dates and times. You can report it to the police or talk to someone under ‘Who can help?’ first to find out more. Treated unfairly by Police or Security Officers See the ‘If I am Charged’ Fact Sheet. Centrelink You should first talk with the person who made the decision. If you still disagree with the decision, you can make a complaint by filling in a ‘Tell Us What You Think’ comment card (available at the Centrelink Office) or phone the Centrelink Feedback and Complaints Line on 1800 132 468."
Treated-unfairly-discrimination.pdf,3,"should first talk with the person who made the decision. If you still disagree with the decision, you can make a complaint by filling in a ‘Tell Us What You Think’ comment card (available at the Centrelink Office) or phone the Centrelink Feedback and Complaints Line on 1800 132 468. If you still do not agree, you can ask for an Authorised Review Officer to look at your case again. You should do this within 3 months of the original decision. If you still think you have been treated unfairly you can appeal to the Administrative Review Tribunal (ART). You can fill in an appeal form (available at Centrelink) and then send it to the ART at GPO Box 9955 Brisbane 4001, or phone on 1800 228 333. The ART is separate from Centrelink. If you want to appeal a decision, you should do this as soon as possible. 4 Criminal Code Act 1899 (Qld) s 359B. 5 Criminal Code Act 1899 (Qld) s 359E. Treated unfairly & discrimination Court or Solicitor complaints If you think you were wrongly found guilty (that you believe you did not break the law) or that your sentence was unfair, you should talk to your lawyer immediately about an appeal, which means getting a (different) Judge to look at your case again. If you think your solicitor has not done their best for you, talk to them about it. If you are still unhappy you can complain to the Queensland Law Society or talk to one of the agencies under ‘Who can help?’ about this. Youth Justice or Child Protection issues If you think that you have done your best on a Probation Order or Community Service Order, but you are being taken back to court by your Youth Justice caseworker, make sure you"
Treated-unfairly-discrimination.pdf,4,"to one of the agencies under ‘Who can help?’ about this. Youth Justice or Child Protection issues If you think that you have done your best on a Probation Order or Community Service Order, but you are being taken back to court by your Youth Justice caseworker, make sure you speak to a lawyer. If you have a complaint about your treatment in the Detention Centre ask to speak to the manager or the official visitor, or ask to contact your lawyer. If you are in the Brisbane Youth Detention Centre or the West Moreton Detention Centre, the Youth Advocacy Centre lawyer may be able to visit you. If you are in the care of Child Safety Services and have a complaint about what is happening to you, contact the Public Guardian or speak to a lawyer from the ‘Who can I contact for support’ section below. Who can help The Child Guardian The Office of the Public Guardian (OPG) helps to protects the rights of children and young people in care. The OPG deals with complaints about how children in the care of Child Safety are treated. The OPG promotes the rights, welfare, and views of young people in care. You can call them on 1300 653 187. The Ombudsman The job of the Ombudsman is investigate government departments. It is important to try to sort the matter out first with the person or people who you think are treating you unfairly, but if this does not work then you can go to the Ombudsman. The Ombudsman can investigate for example, the decision of a principal to suspend or exclude a young person from a state school or bad treatment of a young person in detention. The Ombudsman do not investigate the police (see ‘If I am Charged’ Fact"
Treated-unfairly-discrimination.pdf,5,"you can go to the Ombudsman. The Ombudsman can investigate for example, the decision of a principal to suspend or exclude a young person from a state school or bad treatment of a young person in detention. The Ombudsman do not investigate the police (see ‘If I am Charged’ Fact Sheet). There is a State Ombudsman for decisions made by State Government bodies including Child Safety. Their phone number is 3005 7000 or 1800 068 908 (outside of Brisbane). The Commonwealth Ombudsman looks at decisions made by Commonwealth Government bodies call 1300 362 072. If you ring and tell them a bit about your matter, they will put you through to the right person. Treated unfairly & discrimination Who can I contact for support Youth Advocacy Centre (YAC) www.yac.net.au 3356 1002 Aboriginal & Torres Strait Islander Legal Service (24hrs 7 days a week) www.atsils.org.au 3025 3888 or (free call) 1800 012 255 Logan Youth & Family Legal Service www.yfs.org.au 3826 1500 Legal Aid Queensland www.legalaid.qld.gov.au 1300 651 188 Hub Community Legal www.hubcommunity.org.au 3372 7677 Youth Legal Advice Hotline (Monday – Thursday 8am – 9pm; Friday 8am – Sunday 5pm) 1800 527 527 Community Legal Centres (CLCs) see www.naclc.org.au for your nearest CLC About the Youth Advocacy Centre The Youth Advocacy Centre offers free and confidential legal and social support services for young people in Queensland. www.yac.net.au (07) 3356 1002"
Health and wellbeing _ Department of Youth Justice and Victim Support.pdf,0,"26/08/2025, 15:36 Health and wellbeing | Department of Youth Justice and Victim Support Department of Youth Justice and Victim Support Helping young people in detention (https://www.youthjustice.qld.gov.au/parents-carers/youth- detention/helping-young-people-in-detention) >> Health and wellbeing Health and wellbeing Young people who are admitted to our youth detention centres may have a variety of mental health concerns, including: depression anxiety self-harming behaviours substance misuse anger and difficulties regulating emotions challenges developing social skills. Some may also have been diagnosed with impairments or disabilities, such as: attention deficit hyperactivity disorder (ADHD) autism spectrum disorder (ASD) foetal alcohol spectrum disorder (FASD). We have supports in place to help young people with their mental health and wellbeing while they are in youth detention centres. Our youth detention centres also use trauma- informed practices. Who is here to help Multidisciplinary staff We employ specialist staff in our youth detention centres, including: psychologists https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/helping-young-people-in-detention/health-and-wellbeing 1/5 26/08/2025, 15:36 Health and wellbeing | Department of Youth Justice and Victim Support speech-language pathologists caseworkers. Forensic child and youth mental health service This mental health service operated by Queensland Health provides on-site services during business hours, as well as after-hours support. Service staff include: psychiatrists clinical psychologists Indigenous health workers speech-language pathologists occupational therapists social workers. Detention youth workers and other operational staff All youth detention operational staff are trained in: aspects of mental health complex behaviour suicide and self-harm response communication and de-escalation techniques. Detention youth workers will support young people in their daily activities and record observations. Staff participate in daily suicide risk assessment meetings and will refer a young person to specialist staff if they think that young person needs extra support. Arriving at a youth detention centre Each young person must undertake a health assessment when they arrive at the youth detention centre. This includes assessing risk of self-harm or"
Health and wellbeing _ Department of Youth Justice and Victim Support.pdf,1,"risk assessment meetings and will refer a young person to specialist staff if they think that young person needs extra support. Arriving at a youth detention centre Each young person must undertake a health assessment when they arrive at the youth detention centre. This includes assessing risk of self-harm or suicide. The young person will be asked if they have any existing mental health concerns and if they are on medication. Queensland Health will help the young person to get support and medication while they are in detention. https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/helping-young-people-in-detention/health-and-wellbeing 2/5 26/08/2025, 15:36 Health and wellbeing | Department of Youth Justice and Victim Support Self-harm and suicide risk Youth detention staff regularly discuss and update each young person’s suicide prevention plan. The updates are based on: current risks current needs their protective factors (things in their life that help connect and support them) how they are engaging in therapeutic interventions. If we assess a young person as having suicide risk, our staff will make scheduled checks on them and document this along with any changes in their behaviour. We will review the young person each day to see if those observations need to increase or decrease and if they need extra support. Our caseworkers and psychologists provide intensive support to reduce the young person’s risks over time. Assessment and therapeutic support Our team will assess the young person to see if they need support and intervention to help their mental health and wellbeing. Our multidisciplinary staff may do a range of formal assessments if they are needed. We tailor our support to each young person. Our staff use several therapeutic styles and strategies, including: cognitive behavioural therapy motivational interviewing acceptance and commitment therapy dialectical behaviour therapy solution-focused brief therapy. We will help the young person set up goals they wish to"
Health and wellbeing _ Department of Youth Justice and Victim Support.pdf,2,"formal assessments if they are needed. We tailor our support to each young person. Our staff use several therapeutic styles and strategies, including: cognitive behavioural therapy motivational interviewing acceptance and commitment therapy dialectical behaviour therapy solution-focused brief therapy. We will help the young person set up goals they wish to work towards during their sessions with the multi-disciplinary team and help them identify their strengths and build confidence to achieve those goals. We will also help young people: https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/helping-young-people-in-detention/health-and-wellbeing 3/5 26/08/2025, 15:36 Health and wellbeing | Department of Youth Justice and Victim Support identify and understand their emotions learn how to regulate their emotions identify their triggers identify maladaptive thought patterns (false, irrational, negative and persistent thoughts) learn to seek help learn to make better choices learn to advocate for themselves. Our speech-language pathologists will support a young person if they have additional communication needs and provide help for speech or language. They will also talk to staff at the youth detention centre’s school to make sure they get the right support needed. National Disability Insurance Scheme If a young person has a disability and is eligible to get help from the National Disability Insurance Scheme (NDIS), our staff will help with their application. More information Read more about what happens in detention (https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/life-for-young- people-in-a-detention-centre). Learn who else is here to help young people in detention. (https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/helping-young- people-in-detention/care-in-detention) https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/helping-young-people-in-detention/health-and-wellbeing 4/5 26/08/2025, 15:36 Health and wellbeing | Department of Youth Justice and Victim Support Helping young people in detention (https://www.youthjustice.qld.gov.au/parents- carers/youth-detention/helping-young-people-in- detention) Care in detention (https://www.youthjustice.qld.gov.au/parents-carers/youth- detention/helping-young-people-in-detention/care-in-detention) Education (https://www.youthjustice.qld.gov.au/parents-carers/youth- detention/helping-young-people-in-detention/education) Support programs (https://www.youthjustice.qld.gov.au/parents-carers/youth- detention/helping-young-people-in-detention/support-programs) Health and wellbeing (https://www.youthjustice.qld.gov.au/parents-carers/youth- detention/helping-young-people-in-detention/health-and-wellbeing) Last reviewed: 26 November 2024 Last modified: 26 November 2024  Provide feedback (https://www.families.qld.gov.au/feedback?id=34938) This work is licensed under a Creative Commons Attribution 4.0 International (CC BY 4.0) licence (https://creativecommons.org/licenses/by/4.0/) https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/helping-young-people-in-detention/health-and-wellbeing 5/5"
Health and wellbeing _ Department of Youth Justice and Victim Support.pdf,3,detention) Care in detention (https://www.youthjustice.qld.gov.au/parents-carers/youth- detention/helping-young-people-in-detention/care-in-detention) Education (https://www.youthjustice.qld.gov.au/parents-carers/youth- detention/helping-young-people-in-detention/education) Support programs (https://www.youthjustice.qld.gov.au/parents-carers/youth- detention/helping-young-people-in-detention/support-programs) Health and wellbeing (https://www.youthjustice.qld.gov.au/parents-carers/youth- detention/helping-young-people-in-detention/health-and-wellbeing) Last reviewed: 26 November 2024 Last modified: 26 November 2024  Provide feedback (https://www.families.qld.gov.au/feedback?id=34938) This work is licensed under a Creative Commons Attribution 4.0 International (CC BY 4.0) licence (https://creativecommons.org/licenses/by/4.0/) https://www.youthjustice.qld.gov.au/parents-carers/youth-detention/helping-young-people-in-detention/health-and-wellbeing 5/5
Going-to-Court.pdf,0,"Going to court Which Court? If you are under 18 and the police believe you have broken the law and decide to take you to court, you will first go to a Childrens Court where there is a Magistrate.1 The paperwork the police give you will let you know where the court is. Later, you may have your case sent to a Childrens Court Judge.2 If you are charged with the most serious offences like murder, or drug matters like trafficking, then your case will have to be sent to the Supreme Court. What happens if I don't turn up to court? The court can issue a warrant for your arrest (this is an order that the police find you and bring you to the court).3 If your case cannot be dealt with on the day that the police find you, you will probably be kept in custody (locked up) until the court can deal with your case. You may also be charged with ‘failing to appear’ (not going to court when told to).4 The court will then have a record that you did not turn up and this may make it harder for you to get bail (be able to live in the community while your case is being dealt with) in the future. What are my choices when I get to court? There should be a duty lawyer at court to help you with your case and you should ask to see them before going into court. The duty lawyer is free. You can: • plead guilty (agree you did what the police say) • plead not guilty (you do not agree with the police or you want them to prove you did it) • have your case brought back to court on another day so you can"
Going-to-Court.pdf,1,"duty lawyer is free. You can: • plead guilty (agree you did what the police say) • plead not guilty (you do not agree with the police or you want them to prove you did it) • have your case brought back to court on another day so you can first get some legal advice about • what you should do5 You should get legal advice to be sure whether or not you have broken the law and get information about the consequences of your choice. If there is no duty lawyer you can ask the court to adjourn your case (set another date or time to deal with your case) so that a lawyer can be at court with you. What if my case isn’t wrapped up on the day? 1 Youth Justice Act 1992 (Qld) ss 64, 4, sch 4 (‘Dictionary’). 2 Youth Justice Act 1992 (Qld) s 62. 3 Youth Justice Act 1992 (Qld) ss 57, 58; Bail Act 1980 (Qld) s 28A. 4 Bail Act 1980 (Qld) s 33. 5 Justices Act 1886 (Qld) ss 113, 145, 146(1). Reviewed Dec 2024 This sheet is intended to provide general legal information about the law in Queensland. This information is not legal advice. If you have a particular legal problem you should contact a solicitor for legal advice. At the end is a list of agencies that might be able to assist you, including legal agencies. Going to court If you plead ‘guilty’ your lawyer can often have your case finished with that day. If you plead ‘not guilty’ or you are not sure what to do, your lawyer will ask for another date for the court to consider your case. This may also happen if the police have not got their case ready. If you were kept"
Going-to-Court.pdf,2,"your case finished with that day. If you plead ‘not guilty’ or you are not sure what to do, your lawyer will ask for another date for the court to consider your case. This may also happen if the police have not got their case ready. If you were kept in custody until coming to court you will need the help of the duty lawyer to try to get bail. The duty lawyer should tell you about legal aid (free legal help from a solicitor who can also go to court with you) and give you a form to apply for legal aid. Ask for a form if the duty lawyer doesn't give you one. Am I allowed to have an interpreter with me in court? Yes. If English is not the language you best understand, the court may allow an interpreter, or another person you choose to be in court to interpret for you. If there is no interpreter available at court, you can ask the court to arrange this for you. Do my parents have to be in court? Yes. If your parents are not there the court can decide to adjourn your case (set another date or time to deal with your case) so that the court can be sure a parent knows about your case and that they can be there. The Court can also order your parents to be there, and if they do not go, they can be fined. If your parent, guardian or foster parent was not at court when your case was heard they can ask the court that your case be heard again with them there.6 Who else will be in court? Childrens (Magistrates) Courts where young people under 18 appear on criminal matters are closed to members of the public.7"
Going-to-Court.pdf,3,"foster parent was not at court when your case was heard they can ask the court that your case be heard again with them there.6 Who else will be in court? Childrens (Magistrates) Courts where young people under 18 appear on criminal matters are closed to members of the public.7 Some people will always be allowed to be in court. They are: • the police prosecutor • your lawyer • a representative of Youth Justice (a government department) • a parent or member of your family • a person giving evidence in court (a witness) • a person from an organisation supporting you if you are Aboriginal and/or Torres Strait Islander (for example a Community Justice Group) • someone who can help the Magistrate in dealing with the specific matter or who the Magistrate thinks has a proper reason to be there (such as someone in court doing approved research) • the victim of the crime or their representative • a relative of a deceased victim and their representative • a person who the court believes has a proper interest in the proceed • an accredited media entity, for example a reporter The media will not be able to report details about your identity when you are appearing on any criminal matter. However, the court can allow publication if you have committed a violent offence, including offences that you can be sentenced to the same period as an adult (see the ‘adult crime. adult time’ info 6 Youth Justice Act 1992 (Qld) ss 69-71. 7 Childrens Court Act 1992 (Qld) s 20. Going to court sheet), and8 it is particularly terrible ‘heinous’ (for example murder or attempted murder; robbery with violence in company).9 It is an offence for anyone to publish identifying information about you without an order of the"
Going-to-Court.pdf,4,"1992 (Qld) ss 69-71. 7 Childrens Court Act 1992 (Qld) s 20. Going to court sheet), and8 it is particularly terrible ‘heinous’ (for example murder or attempted murder; robbery with violence in company).9 It is an offence for anyone to publish identifying information about you without an order of the court. Can I be charged as an adult with a crime I committed when I was a child? When you turn 18 you generally must go to an adult court. If you are 19 or over, and the police say you broke the law when you were under 18, it is most likely that you will be dealt with as an adult.10 If you are not yet 19 and the police say you broke the law when you were under 18, then your case will generally go to a Childrens Court. If you agree you broke the law, or the court decides that you did, then you will be sentenced as if you were under 18.11 If you are over 18 years and sentenced to detention you serve your term in an adult prison. Can police take my photograph and fingerprints? If you are arrested by police and then taken to the police station and charged the police can usually photograph you (including photos of scars and tattoos) and take your fingerprints and other identifying particulars (things specific to you that could prove who you are).12 For some offences,13 if the police have charged you but did not arrest you on the spot the police might ask the Childrens Court magistrate to let them take those photos, fingerprints or other identifying particulars (such as your footprints or recording of your voice or a measurement of any part of your body - but not genital or anal area, buttocks or, for"
Going-to-Court.pdf,5,"on the spot the police might ask the Childrens Court magistrate to let them take those photos, fingerprints or other identifying particulars (such as your footprints or recording of your voice or a measurement of any part of your body - but not genital or anal area, buttocks or, for a female, breasts).14 The police have to tell you and your parent (if they can be found) that they are going to ask the court for the order to get your identifying particulars. You or your lawyer can go to court to say why the police should not be able to get these details.15 If you or your lawyer don’t go to court when the police are asking for the order the court can still give the police permission to get the particulars.16 The court will only make this order if the police can show that they already have some evidence (eg fingerprints) that shows an offence has been committed and they have reason to think you have committed the offence.17 The order will help the police do their investigation by letting them compare your particulars to the evidence they already have. If the order is 8 Youth Justice Act 1992 (Qld) ss 234. 9 Youth Justice Act 1992 (Qld) ss 301. 10 Youth Justice Act 1992 (Qld) ss 140. 11 Youth Justice Act 1992 (Qld) ss 134. 12 Police Powers and Responsibilities Act 1999 (Qld) s 467(1), Schedule 6 definition of identifying particulars offence. 13 Youth Justice Act 1992 (Qld) s 13(1), Police Powers and Responsibilities Act 1999 (Qld) ss 365(1) and (3); and Schedule 4 definition of arrest offence. 14 Youth Justice Act 1992 (Qld) ss 25. 15 Youth Justice Act 1992 (Qld) ss 25(3). 16 Youth Justice Act 1992 (Qld) ss 25(4). 17 Youth Justice Act 1992"
Going-to-Court.pdf,6,"(Qld) s 13(1), Police Powers and Responsibilities Act 1999 (Qld) ss 365(1) and (3); and Schedule 4 definition of arrest offence. 14 Youth Justice Act 1992 (Qld) ss 25. 15 Youth Justice Act 1992 (Qld) ss 25(3). 16 Youth Justice Act 1992 (Qld) ss 25(4). 17 Youth Justice Act 1992 (Qld) ss 25(6). Going to court made you will have to go a specific police station within 7 days so they can take your particulars.18 It is an offence not to go and let the police take you particulars.19 If you are found not guilty the police have to destroy all of your identifying particulars – including anything they got under the order.20 If you pleaded guilty but the court referred you for a restorative justice process, then your particulars will be destroyed after you have done everything you said you would do under the restorative justice agreement.21 If you are found guilty of the offence, but you were not arrested and fingerprinted or photographed or the police did not get an order to take any other identifying particulars about you during their investigation, the court may be able to order that your identifying particulars be taken at the end of the case.22 18 Youth Justice Act 1992 (Qld) ss 25(8) 19 Youth Justice Act 1992 (Qld) ss 25(9) 20 Youth Justice Act 1992 (Qld) s 27; Police Powers and Responsibilities Act 1999 (Qld) s 474. 21 Police Powers and Responsibilities Act 1999 (Qld) s 474(4A). 22 Youth Justice Act 1992 (Qld) s 225. Going to court Who can I contact for support Youth Advocacy Centre (YAC) www.yac.net.au 3356 1002 Aboriginal & Torres Strait Islander Legal Service (24hrs 7 days a week) www.atsils.org.au 3025 3888 or (free call) 1800 012 255 Logan Youth & Family Legal Service www.yfs.org.au 3826 1500"
Going-to-Court.pdf,7,1992 (Qld) s 225. Going to court Who can I contact for support Youth Advocacy Centre (YAC) www.yac.net.au 3356 1002 Aboriginal & Torres Strait Islander Legal Service (24hrs 7 days a week) www.atsils.org.au 3025 3888 or (free call) 1800 012 255 Logan Youth & Family Legal Service www.yfs.org.au 3826 1500 Legal Aid Queensland www.legalaid.qld.gov.au 1300 651 188 Hub Community Legal www.hubcommunity.org.au 3372 7677 Youth Legal Advice Hotline (Monday – Thursday 8am – 9pm; Friday 8am – Sunday 5pm) 1800 527 527 Community Legal Centres (CLCs) see www.naclc.org.au for your nearest CLC About the Youth Advocacy Centre The Youth Advocacy Centre offers free and confidential legal and social support services for young people in Queensland. www.yac.net.au (07) 3356 1002
Government-Security-Officers-Updated-June-2023WM1.pdf,0,"GOVERNMENT SECURITY OFFICERS This sheet is intended to provide general legal information about the law in Queensland. This information is not legal advice. If you have a particular legal problem you should contact a solicitor for legal advice. At the end is a list of agencies that might be able to assist you, including legal agencies. Government security officers are protective security officers, who are not police officers, are hired by the government to monitor state buildings and facilities. The main purpose of security officers is to act as security guards to state buildings. At times they may also work as guards for buildings which are not state buildings. If they are NOT working at a STATE building, they are not considered “government security officers” and only have the powers of a regular security guard – see the security guard fact sheet. What are the powers of protective security officers? If you are inside or within the precinct of a state building, a protective security officer may ask:-  Your name and address  Evidence of your name or address (driver’s licence, student ID card etc)  Your reason for being at the building. If you provide the officer with false information, do not provide any information, do not provide any evidence of your name or address, or provide the officer with a fake ID, or an ID card that contains someone else’s details – then you will have committed an offence. If the building that you are entering has electronic screening devices such as a metal detector, an x- ray machine or hand held scanner, the officer can ask you to:  walk through the metal detector  pass your things through an X-ray machine  allow the officer to scan you and/or your belongings with a hand held"
Government-Security-Officers-Updated-June-2023WM1.pdf,1,"electronic screening devices such as a metal detector, an x- ray machine or hand held scanner, the officer can ask you to:  walk through the metal detector  pass your things through an X-ray machine  allow the officer to scan you and/or your belongings with a hand held scanner. UNDER REVIEW What is a state building?  A state building is any building that is owned by the government (State libraries, public service buildings, council offices).  This also includes any outside part of the building like a courtyard, garden, park. Powers of a protective security officer If an officer considers it necessary for the security of a state building, they can ask you to:  let them look through your things,  take off outer garments for inspection (jackets, jumpers etc),  empty all of your pockets,  open your things for inspection,  open a vehicle or part of it for inspection,  take something off the vehicle for inspection, and  park the vehicle in a specified place. If an officer believes you are using one of your belongings to hide something dangerous or an unlawful item (weapon or drugs) then they can ask you to put the item in a certain place. If you are in possession of an unlawful item, they may seize it. Other powers  If you fail to provide them with your name and address, or are acting in a way which makes them think you are not there for a “good and lawful” purpose they can ask you to leave the building.  If you do not leave when asked, the officer and other officers can use necessary force to remove you from the building.  You can be fined up to $2,200.00 if you provide false details like"
Government-Security-Officers-Updated-June-2023WM1.pdf,2,"a “good and lawful” purpose they can ask you to leave the building.  If you do not leave when asked, the officer and other officers can use necessary force to remove you from the building.  You can be fined up to $2,200.00 if you provide false details like your name to the protective security officer or you do not leave a state building when asked. © Youth Advocacy Centre Inc 1 What a protective security officer needs to do:  They can only inspect the outer clothes you are wearing if they have provided you the reason for the request and the officer is the same sex as you. Otherwise, they must get another officer or adult assisting the officer of the same sex to search you or your clothing.  If the officer wants you to take off an outer garment, they must tell you the reason for the request and ask you to do this in a room out of the public view.  They need to inspect you in a way that does not embarrass you and ensure the protection of you dignity.  Provided your things are not unlawful to possess, a security officer must give back your things when you ask for them and it is clear that you are actually going to leave the building.  If you tell an officer before or during a search of you or your things that you do not want to be searched and are going to leave the building, you will need to leave and the officer must not give you a direction to enter or leave the building or take your belongings.  BEFORE a security officer asks you to provide your name and address or leave a government building they need to warn"
Government-Security-Officers-Updated-June-2023WM1.pdf,3,"to leave the building, you will need to leave and the officer must not give you a direction to enter or leave the building or take your belongings.  BEFORE a security officer asks you to provide your name and address or leave a government building they need to warn you that if you do not follow their request then you will be committing an offence. Can protective security officers arrest me? If the protective security officer thinks that you have committed an offence then they can, with the help of other protective security officers, use necessary force to detain you. However, they must quickly hand you over to police. Try to remain calm and not fight back because assaulting or resisting a security officer is an offence – with a maximum penalty of 6 months imprisonment. UNDER REVIEW Where it happened: Date: Time: What happened: Name of anyone who saw what happened: Name and badge number of police officers: Treated unfairly? If you think you have been treated unfairly, you can contact YAC on 3356 1002 for further information and advice. If you want to complain about being moved on by security or the way you were treated by security, you should contact the Office of Fair Trading on 13 74 68. If you think the Protective Security Officer laws are unfair, you can contact your State Politician (listed in the front of the White pages under government information) and tell them you think that the laws are unfair and that the law should be changed. Who can help? If you need legal advice or want help in making a complaint, you can contact one of the agencies listed below: Youth Advocacy Centre (YAC) www.yac.net.au ...................................................................... 3356 1002 © Youth Advocacy Centre Inc 2 Youth Legal Advice Hotline ......................................................................................................"
Government-Security-Officers-Updated-June-2023WM1.pdf,4,"and that the law should be changed. Who can help? If you need legal advice or want help in making a complaint, you can contact one of the agencies listed below: Youth Advocacy Centre (YAC) www.yac.net.au ...................................................................... 3356 1002 © Youth Advocacy Centre Inc 2 Youth Legal Advice Hotline ...................................................................................................... 1800 527 527 South West Brisbane Community Legal Centre www.communitylegal.org.au .......................... 3372 7677 Logan Youth & Family Legal Service www.yfs.org.au .............................................................. 3826 1500 Legal Aid Queensland www.legalaid.qld.gov.au ....................................................................... 1300 651 188 Aboriginal & Torres Strait Islander Legal Service www.atsils.org.au ........................................ 3025 3888 or (free call)1800 012 255 (24hrs 7 days a week) Translating & Interpreting Services (24hrs) .............................................................................. 131 450 Community Legal Centres (CLCs) see www.naclc.org.au for your nearest CLC This sheet was last reviewed and updated in June 2023. The Youth Advocacy Centre does not accept responsibility for any action or outcome as a result of anyone relying on the information provided. UNDER REVIEW © Youth Advocacy Centre Inc 3"

```

# Deco-RAG/RAG/rag_v1.py

```py
import os
import faiss
import numpy as np
from pypdf import PdfReader
from openai import OpenAI

# OPTIONAL (only if using CSV word chunks)
try:
    import pandas as pd
except ImportError:
    pd = None  # won't be needed if you use PDFs

# =========================
# Config: choose ONE input
# =========================
USE_CSV_CHUNKS = True   # True = load from Excel; False = parse PDFs
CSV_PATH = ""  # columns: file, chunk_id, content

PDF_FOLDER = ""

# --- OpenAI ---
# Prefer env var: export OPENAI_API_KEY="..."
client = OpenAI(api_key="")  # replace with your actual key


# --- Step 1a: Load PDFs ---
def load_pdfs(folder):
    texts = []
    for file in os.listdir(folder):
        if file.lower().endswith(".pdf"):
            reader = PdfReader(os.path.join(folder, file))
            text = ""
            for page in reader.pages:
                try:
                    t = page.extract_text()
                    if t:
                        text += t + "\n"
                except Exception:
                    pass
            if text.strip():
                texts.append(text)
    return texts

# --- Step 1b: Load chunks from CSV (file,chunk_id,content) ---
def load_chunks_from_csv(csv_path):
    df = pd.read_csv(csv_path)
    required = {"file", "chunk_id", "content"}
    if not required.issubset(df.columns):
        raise ValueError(f"CSV must contain columns: {required}")
    # return just the chunk texts
    return [str(c) for c in df["content"].fillna("") if str(c).strip()]

# --- Step 2: Chunk text (only used for PDFs) ---
def chunk_text(text, size=500, overlap=50):
    words = text.split()
    step = max(1, size - overlap)
    return [" ".join(words[i:i+size]) for i in range(0, len(words), step)]

# --- Step 3: Embed chunks (with batching for stability) ---
def embed(texts, batch_size=128):
    out = []
    for i in range(0, len(texts), batch_size):
        batch = texts[i:i+batch_size]
        resp = client.embeddings.create(model="text-embedding-3-small", input=batch)
        out.extend([d.embedding for d in resp.data])
    return out

# -------------------------
# Build corpus (chunks)
# -------------------------
if USE_CSV_CHUNKS:
    print(f" Using chunks from CSV: {CSV_PATH}")
    chunks = load_chunks_from_csv(CSV_PATH)
else:
    print(" Parsing PDFs and creating chunks...")
    docs = load_pdfs(PDF_FOLDER)
    chunks = [c for doc in docs for c in chunk_text(doc)]

if not chunks:
    raise SystemExit("No text chunks found. Check your input settings/paths.")

print(f"✅ Loaded {len(chunks)} text chunks")

# -------------------------
# Embeddings + FAISS
# -------------------------
print("Creating embeddings...")
embeddings = embed(chunks)
dimension = len(embeddings[0])

index = faiss.IndexFlatL2(dimension)
index.add(np.array(embeddings, dtype="float32"))

# -------------------------
# Retrieval
# -------------------------
def retrieve(query, k=3):
    q_emb = embed([query])[0]
    D, I = index.search(np.array([q_emb], dtype="float32"), k)
    return [chunks[i] for i in I[0]]

# -------------------------
# Chatbot
# -------------------------
def ask(query):
    context = "\n".join(retrieve(query))
    resp = client.chat.completions.create(
        model="gpt-5-nano",
        # This part is how to change the tone and control the responses of the model
        messages=[
            {"role":"system","content":"You are a helpful, supportive chatbot for young people in Queensland's youth justice system. Prioritise the provided context when answering. If the context is incomplete, you may also use your general knowledge, at max 3 sentences in this case. Be concise and empathetic."},
            {"role":"user","content": f"Context:\n{context}\n\nQuestion: {query}"}
        ]
        
    )
    return resp.choices[0].message.content

# For analysing the user's emotion
negative_words = [
    # Emotions & Feelings
    "sad", "unhappy", "depressed", "lonely", "miserable",
    "anxious", "stressed", "overwhelmed", "hopeless", "worthless",

    # Judgments / Self-talk
    "stupid", "dumb", "failure", "useless", "weak",
    "horrible", "awful", "bad", "terrible", "disgusting",

    # Conflict / Anger
    "hate", "angry", "mad", "frustrated", "annoyed",
    "upset", "pissed", "furious", "jealous", "resent",

    # Fear / Worry
    "scared", "afraid", "worried", "nervous", "insecure",
    "panicked", "trapped", "stuck", "danger"
]

positive_words = [
    # Emotions & Feelings
    "happy", "joyful", "content", "cheerful", "excited",
    "relaxed", "calm", "peaceful", "grateful", "hopeful",

    # Self-talk / Confidence
    "confident", "strong", "capable", "smart", "worthy",
    "successful", "brave", "resilient", "motivated", "proud",

    # Praise / Goodness
    "amazing", "fantastic", "wonderful", "great", "awesome",
    "excellent", "beautiful", "kind", "positive", "good",

    # Love / Connection
    "love", "caring", "friendly", "supportive", "compassionate",
    "generous", "loyal", "respectful", "trusting", "connected"
]

happy_emojis = {"😊", "😃", "😄", "😁", "🥳", "🥰", "😂", "😎", "🤠"}
sad_emojis   = {"😢", "😭", "😞", "☹️", "😔", "🙁", "😩", "😡", "😠"}

def ai_emotion_analyser(query):
    # Case 1: Checks emotion based on capitalization of user's query
    if query.isupper():
        if any(word in query.lower() for word in negative_words):
            return "Negative"
        elif any(word in query.lower() for word in positive_words):
            return "Positive"
        else:
            return "Neutral"

    # Case 2: Detects whether there are any emojis used in user's query
    if any(emoji in query for emoji in happy_emojis):
        return "Positive"
    elif any(emoji in query for emoji in sad_emojis):
        return "Negative"
    else:
        return "Neutral"

    # Initializes the count of negative and positive words when checking for emotions in the user query
    count_neg = 0 
    count_pos = 0
        

    # Case 3: Count is updated based on whether a negative or positive word is detected in the query
    for word in query.split():
        if word in negative_words:
            count_neg += 1
        elif word in positive_words:
            count_pos += 1

    # Returns the user's emotion based on the number of negative and positive words in the query
    if count_neg < count_pos:
        return "Positive"
    elif count_neg > count_pos:
        return "Negative"
    else:
        return "Neutral"

def ai_tier_classifier(query, emotion):
    # Intensity is used to measure how strong of an emotion the user is experiencing
    intensity = 0

    # Calculates level of intensity based on capitalisation, punctuation, words and emojis 
    if emotion == "Negative":
        if query.isupper():
            intensity += 2

        for word in query.split():
            if word in ["suicide", "kill", "die", "death"]:
                intensity += 10

            intensity += query.count("!")
            intensity += sum(query.count(e) for e in sad_emojis)
            intensity += sum(query.count(word) for word in negative_words)
    else:
        return None # If emotion is not negative

    # Classifies tier based on level of intensity
    if intensity <= 2:
        tier = "Low"
    elif intensity <= 5:
        tier = "Moderate"
    elif intensity <= 8:
        tier = "High"
    else:
        tier = "Imminent Danger"

    return tier
        
# -------------------------
# Run Chat Loop
# -------------------------
print("\n 🤖 “Hey, I’m Adam. I can share information about youth justice, your rights, and where to find support. What would you like to talk about?” (Type 'exit' to quit)\n")
while True:
    user_q = input("You: ")
    if user_q.lower() in ["exit", "quit"]:
        print("👋 Goodbye!")
        break
    try:
        answer = ask(user_q)
        print(f"Bot: {answer}\n")
    except Exception as e:
        print(f"⚠️ Error: {e}\n")

```

# Deco-RAG/RAG/README.md

```md
# RAG Model (Local Setup)

This repository contains a **Retrieval-Augmented Generation (RAG) model** powered by **OpenAI’s `gpt-5-nano`**.  
Currently, the model can only be run in a **local environment**.

---

## Getting Started

To run the model, you need to provide two inputs in the code:

1. **API Key**  
   A ChatGPT API key is a unique, secret code that allows your application to programmatically access OpenAI’s language models.

2. **CSV_PATH**  
   The file path to the CSV file stored in your local environment.

### Optional Input
The code is designed to handle **both CSV chunks and PDFs**:
- To use PDFs directly, set:
  \`\`\`python
  USE_CSV_CHUNKS = False
  PDF_FOLDER = "<path_to_pdf_folder>"


## Modifying the Model

You can customize the model’s behavior by editing the `ask()` function in the code.

### Adjusting Response Style
The `message` prompt inside `ask()` can be changed to modify the **tone** and **control how responses are generated**.  
Example:
\`\`\`text
"Prioritize the provided context when answering. If the context is incomplete, you may also use your general knowledge (limit to 3 sentences)."

For more specific responses, it is recommended to add domain-specific information to your data chunks.


```

# lib/auth.ts

```ts
// lib/auth.ts
import { supabase } from './supabaseClient';

// Returns user id if logged in, else null (no throw)
export async function getSessionUserId(): Promise<string | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.warn('getSession error:', error.message);
    return null;
  }
  return data.session?.user?.id ?? null;
}

```

# lib/companions.ts

```ts
export const COMPANIONS = {
  ADAM: {
    name: 'Adam',
    url: 'https://models.readyplayer.me/68be69db5dc0cec769cfae75.glb',
  },
  EVE: {
    name: 'Eve',
    url: 'https://models.readyplayer.me/68be6a2ac036016545747aa9.glb',
  },
} as const;

export type CompanionKey = keyof typeof COMPANIONS;

```

# lib/conversations.ts

```ts
import { supabase } from './supabaseClient';
import { getSessionUserId } from './auth';

export async function createConversation(title?: string) {
  const me = await getSessionUserId();
  if (!me) {
    console.log('[createConversation] no session; skipping insert');
    return null; // anonymous: don't write
  }
  const { data, error } = await supabase
    .from('conversations')
    .insert({ created_by: me, is_group: false, title: title ?? null })
    .select('id')
    .single();

  if (error) throw new Error(error.message);
  return data.id as string;
}

```

# lib/messages.ts

```ts
// lib/messages.ts
import { supabase } from '@/lib/supabaseClient';
import { getSessionUserId } from '@/lib/auth';

export type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
};

export async function sendUserMessage(conversationId: string, content: string) {
  const me = await getSessionUserId();
  if (!me) throw new Error('Not signed in');

  const client_id = crypto.randomUUID();

  const { data, error } = await supabase
    .from('messages')
    .insert({
      client_id,
      conversation_id: conversationId,
      sender_id: me,
      role: 'user',
      content
    })
    .select('id, conversation_id, sender_id, role, content, created_at')
    .single();

  if (error) throw new Error(error.message);
  return data as MessageRow;
}

```

# lib/session.ts

```ts
export function getOrCreateSessionId(): string {
  if (typeof window === 'undefined') return 'server';
  const k = 'anonSessionId:v1';
  let v = localStorage.getItem(k);
  if (!v) { v = crypto.randomUUID(); localStorage.setItem(k, v); }
  return v;
}


```

# lib/supabaseAdmin.ts

```ts
import { createClient } from '@supabase/supabase-js';

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);
```

# lib/supabaseClient.ts

```ts
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
```

# lib/utils.ts

```ts
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

```

# next-env.d.ts

```ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />

// NOTE: This file should not be edited
// see https://nextjs.org/docs/app/building-your-application/configuring/typescript for more information.

```

# next.config.mjs

```mjs
// next.config.mjs
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // add any experimental flags you previously had, or leave empty
  },
  // images: { domains: ['…'] },
  // transpilePackages: ['@readyplayerme/visage'], // only if you had it before
};

export default nextConfig;

```

# package.json

```json
{
  "name": "chatbot-app",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "dev:turbo": "next dev --turbopack",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "@radix-ui/react-avatar": "^1.1.10",
    "@radix-ui/react-dialog": "^1.1.15",
    "@radix-ui/react-label": "^2.1.7",
    "@radix-ui/react-progress": "^1.1.7",
    "@radix-ui/react-scroll-area": "^1.2.10",
    "@radix-ui/react-select": "^2.2.6",
    "@radix-ui/react-separator": "^1.1.7",
    "@radix-ui/react-slot": "^1.2.3",
    "@radix-ui/react-switch": "^1.1.3",
    "@radix-ui/react-tabs": "^1.1.13",
    "@react-three/drei": "^9.108.4",
    "@react-three/fiber": "^8.16.8",
    "@readyplayerme/visage": "^6.16.0",
    "@supabase/ssr": "^0.7.0",
    "@supabase/supabase-js": "^2.57.0",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "framer-motion": "^12.23.12",
    "lucide-react": "^0.542.0",
    "next": "14.2.10",
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "sonner": "^2.0.7",
    "tailwind-merge": "^3.3.1",
    "three": "^0.166.1"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@types/node": "^20",
    "@types/react": "^18.2.73",
    "@types/react-dom": "^18.2.25",
    "@types/uuid": "^10.0.0",
    "tailwindcss": "^4",
    "tw-animate-css": "^1.3.7",
    "typescript": "^5"
  },
  "overrides": {
    "react": "18.3.1",
    "react-dom": "18.3.1"
  }
}

```

# postcss.config.mjs

```mjs
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
export default config;
```

# public/file.svg

This is a file of the type: SVG Image

# public/globe.svg

This is a file of the type: SVG Image

# public/next.svg

This is a file of the type: SVG Image

# public/vercel.svg

This is a file of the type: SVG Image

# public/window.svg

This is a file of the type: SVG Image

# README.md

```md
# 12P – Trust-Building AI Avatar Conversations for Youth Justice 
> **Note**: This is a **university project** for the course **DECO3801 – Studio 3: Build** at the University of Queensland.  
> It is a research and educational prototype only, not intended for production use. 
## Team Name: 404 Found path
  - Sai Raghavi Koganti
  - Shafa Kirana Mulia
  - Arunkumar
  - Jiwhan Oh
  - Ong Pin Kang
  - Praneel Guptan

Mentor: People Technology Revolution

An **AI-powered avatar chatbot** designed to help young people in the **youth justice system** express themselves safely and build trust through **trauma-informed, culturally inclusive, and engaging conversations**.  

---

## About the Project  

Many young people in youth justice find it difficult or distressing to speak directly with official services due to trauma, distrust, or past experiences. Traditional intake and support processes often feel impersonal and intimidating.  

This project provides a **safe, avatar-based conversational space** where users can:  
- Create and personalise their own avatar (via **Ready Player Me**)  
- Chat with **Adam**, a supportive AI avatar powered by **Retrieval-Augmented Generation (RAG)**  
- Reflect on their mood with a **Mood Check-In**  
- Optionally **save/share transcripts** with caseworkers or mentors  

The system prioritises **trauma-informed design**, **youth-friendly UX**, and **ethical safeguards** to ensure anonymity, trust, and accessibility:contentReference[oaicite:2]{index=2}.  

---

## Key Features  

- **Avatar Creation** – Youth can design their own digital identity or choose from safe defaults.  
- **Conversational AI (Adam)** – RAG chatbot grounded in vetted wellbeing resources.  
- **Mood Check-In** – Gamified, supportive way to reflect before each chat.  
- **Privacy & Consent** – Anonymous by default, with opt-in transcript sharing.  
- **Trauma-Informed Design** – Calming colors, clear consent flows, neutral tone, and cultural sensitivity.  
- **Transcripts & Summaries** – Sessions can be anonymised and exported to help professionals support youth better.  

---

## Tech Stack  

- **Frontend:** Next.js (React), Tailwind CSS, ShadCN components, Three.js / Ready Player Me API  
- **Backend:** Serverless APIs (Vercel), Supabase (Auth, DB, Storage)  
- **AI Integration:** OpenAI API (chat + moderation), LangChain RAG pipeline  
- **Avatar System:** Ready Player Me (custom & default avatars)  
- **Deployment:** Vercel + Supabase (AU regions for data residency)  
- **Security:** JWT Auth, RLS policies, HTTPS/TLS encryption  

---
## Setup 
**1. Clone Repository**
\`\`\`
  git clone https://github.com/<org>/<repo>.git
  cd ai-avatar-chatbot
\`\`\`

**2. Install Dependencies**

  `npm install`

**3. Environment Variables**
  Create a .env.local file:
\`\`\`
  NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
  NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_key
  OPENAI_API_KEY=your_openai_api_key
\`\`\`

**4. Run Locally**

  `npm run dev`


App runs on `http://localhost:3000`

---
## License & IP

**IP Agreement**: Teams may be required to agree to a UQ project IP agreement.

**Moral Rights**: Teams retain rights to showcase the project in their portfolios.

```

# tsconfig.json

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./*"],
      "components/*": ["./components/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts", "components/chat/global.d.ts"],
  "exclude": ["node_modules"]
}

```

