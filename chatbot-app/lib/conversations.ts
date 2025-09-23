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

export async function endConversation(conversationId: string) {
  const { data, error } = await supabase
    .from("conversations")
    .update({
      status: "saved",
      ended_at: new Date().toISOString(),
    })
    .eq("id", conversationId)
    .select("id, status, ended_at"); // force PostgREST to return something

  console.log("[endConversation] result:", { data, error, conversationId });

  if (error) throw new Error(error.message);
}
