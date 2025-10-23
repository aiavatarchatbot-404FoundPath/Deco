import { supabase } from './supabaseClient';

// Returns user id if logged in, else null 
export async function getSessionUserId(): Promise<string | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.warn('getSession error:', error.message);
    return null;
  }
  return data.session?.user?.id ?? null;
}
