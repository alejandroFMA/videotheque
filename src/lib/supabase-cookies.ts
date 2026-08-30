import { parseCookieHeader } from '@supabase/ssr';
import type { CookieOptions } from '@supabase/ssr';
import type { AstroCookies } from 'astro';

interface CookieToSet {
  name: string;
  value: string;
  options: CookieOptions;
}

/**
 * The `{ getAll, setAll }` pair `@supabase/ssr`'s `createServerClient` needs,
 * wired to a request's `Cookie` header (read), Astro's `cookies.set` (session
 * cookie writes, which Astro serialises onto whatever Response the handler
 * returns), and a `Headers` object for the no-store cache headers that must
 * ride along with any `Set-Cookie`.
 */
export function makeCookieAdapter(
  cookies: Pick<AstroCookies, 'set'>,
  requestHeaders: Headers,
  responseHeaders: Headers,
) {
  return {
    getAll() {
      return parseCookieHeader(requestHeaders.get('cookie') ?? '');
    },
    setAll(cookiesToSet: CookieToSet[], headers: Record<string, string>) {
      for (const { name, value, options } of cookiesToSet) {
        cookies.set(name, value, options as Parameters<AstroCookies['set']>[2]);
      }
      for (const [key, value] of Object.entries(headers)) {
        responseHeaders.set(key, value);
      }
    },
  };
}
