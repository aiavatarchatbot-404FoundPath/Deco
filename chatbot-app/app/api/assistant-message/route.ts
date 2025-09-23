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
