import { supabase } from '@/services/supabase';

/** Local session read — faster than getUser() for routing and athlete id. */
export async function getAuthUserId(): Promise<string | undefined> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user?.id;
}
