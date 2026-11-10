import type { SupabaseClient } from '@supabase/supabase-js';

type Db = Pick<SupabaseClient, 'from' | 'rpc'>;

export interface Profile {
  id: string;
  display_name: string;
  avatar_url: string | null;
  handle: string;
}

const PROFILE_COLUMNS = 'id, display_name, avatar_url, handle';

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

/** What the sign-up trigger seeds and what a settings page could later accept.
 *  Checked before the lookup so a junk path never reaches the database. */
const HANDLE_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/;

/** The public read of someone else's profile. It goes through an RPC because
 *  the table itself is readable only by its owner. */
export async function getProfileByHandle(sb: Db, handle: string): Promise<Profile | null> {
  if (!HANDLE_PATTERN.test(handle)) return null;
  const { data, error } = await sb.rpc('profile_by_handle', { p_handle: handle });
  if (error) fail('getProfileByHandle', error);
  return (data as Profile[] | null)?.[0] ?? null;
}
