import type { SupabaseClient } from '@supabase/supabase-js';

type Db = Pick<SupabaseClient, 'from'>;

export interface Profile {
  id: string;
  display_name: string;
  avatar_url: string | null;
}

const PROFILE_COLUMNS = 'id, display_name, avatar_url';

function fail(operation: string, error: { message: string }): never {
  throw new Error(`[profiles] ${operation} failed: ${error.message}`);
}

/** Null only if the sign-up trigger did not run; callers fall back to the email. */
export async function getOwnProfile(sb: Db, userId: string): Promise<Profile | null> {
  const { data, error } = await sb
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('id', userId)
    .maybeSingle();
  if (error) fail('getOwnProfile', error);
  return (data as Profile | null) ?? null;
}
