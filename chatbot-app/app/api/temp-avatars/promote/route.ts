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
