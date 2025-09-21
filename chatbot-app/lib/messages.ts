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
