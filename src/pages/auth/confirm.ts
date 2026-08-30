import type { APIRoute } from 'astro';
import { HTTP_SEE_OTHER, LINK_ERROR_QUERY, LOGIN_PATH } from '../../constants';
import { handleAuthConfirm } from '../../lib/auth-confirm';
import { serverClient } from '../../lib/supabase';

export const prerender = false;

export const GET: APIRoute = async ({ cookies, request, url }) => {
  // Own the response headers so verifyOtp's no-store cache headers survive.
  const headers = new Headers();
  const supabase = serverClient(cookies, request.headers, headers);

  const { status, location } = await handleAuthConfirm({
    params: url.searchParams,
    verifyOtp: (args) => supabase.auth.verifyOtp(args),
  });

  try {
    headers.set('Location', location);
    return new Response(null, { status, headers });
  } catch (err) {
    console.error('[auth/confirm] failed to build the redirect response', err);
    return new Response(null, {
      status: HTTP_SEE_OTHER,
      headers: new Headers({ Location: `${LOGIN_PATH}?${LINK_ERROR_QUERY}` }),
    });
  }
};
