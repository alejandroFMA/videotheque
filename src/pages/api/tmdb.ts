import type { APIRoute } from 'astro';
import { getSecret } from 'astro:env/server';
import { handleTmdbRequest } from '../../lib/tmdb-proxy';

export const prerender = false;

// One `ALL` export so every method routes through handleTmdbRequest and the
// 405 for non-GET comes from our handler, not Astro's default.
export const ALL: APIRoute = ({ request }) =>
  handleTmdbRequest({
    searchParams: new URL(request.url).searchParams,
    method: request.method,
    // `getSecret` is a real runtime read (astro:env, `access: 'secret'`): the
    // token is never inlined into the build, so rotating it on Vercel needs no
    // rebuild, and an empty value falls through to the handler's 500 branch.
    token: getSecret('TMDB_ACCESS_TOKEN'),
    fetch,
  });
