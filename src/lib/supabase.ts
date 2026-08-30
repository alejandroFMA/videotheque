import { createBrowserClient, createServerClient } from '@supabase/ssr';
import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from 'astro:env/client';
import type { AstroCookies } from 'astro';
import { makeCookieAdapter } from './supabase-cookies';

function credentials(): { url: string; key: string } {
  if (!PUBLIC_SUPABASE_URL || !PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error(
      'PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY must be set — see .env.example',
    );
  }
  return { url: PUBLIC_SUPABASE_URL, key: PUBLIC_SUPABASE_ANON_KEY };
}

/** Request-scoped client for middleware, pages, and endpoints. Never cache it. */
export function serverClient(
  cookies: AstroCookies,
  requestHeaders: Headers,
  responseHeaders: Headers,
) {
  const { url, key } = credentials();
  return createServerClient(url, key, {
    cookies: makeCookieAdapter(cookies, requestHeaders, responseHeaders),
  });
}

/** Browser client for the login form (`signInWithOtp`) and sign-out. */
export function browserClient() {
  const { url, key } = credentials();
  return createBrowserClient(url, key);
}
