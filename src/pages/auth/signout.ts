import type { APIRoute } from 'astro';
import { LOGIN_PATH } from '../../constants';
import { serverClient } from '../../lib/supabase';

export const prerender = false;

export const POST: APIRoute = async ({ cookies, request }) => {
  const headers = new Headers();
  const supabase = serverClient(cookies, request.headers, headers);

  const { error } = await supabase.auth.signOut();
  if (error) console.error('[api/auth/signout] signOut failed', error);

  // Redirect regardless — the user asked to leave; a failed signOut is logged,
  // and /login will re-check the session.
  headers.set('Location', LOGIN_PATH);
  return new Response(null, { status: 303, headers });
};
