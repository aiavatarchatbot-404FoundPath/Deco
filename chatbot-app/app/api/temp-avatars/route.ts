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
