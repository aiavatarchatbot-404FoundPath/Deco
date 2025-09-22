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
