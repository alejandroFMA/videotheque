import type { JwtPayload, SupabaseClient } from '@supabase/supabase-js';

type WithGetClaims = { auth: Pick<SupabaseClient['auth'], 'getClaims'> };

/**
 * The verified JWT claims for the current request, or `null` when there is no
 * session or the token cannot be trusted. Never throws — a transport failure
 * against the auth server is treated as "signed out" — but a failure is always
 * logged, never swallowed.
 */
export async function resolveUser(supabase: WithGetClaims): Promise<JwtPayload | null> {
  try {
    const { data, error } = await supabase.auth.getClaims();
    if (error) {
      console.warn(
        '[auth/session] getClaims returned an error; request treated as anonymous',
        error,
      );
      return null;
    }
    return data?.claims ?? null;
  } catch (err) {
    console.error('[auth/session] getClaims threw; request treated as anonymous', err);
    return null;
  }
}
