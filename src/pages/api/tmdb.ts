import type { APIRoute } from 'astro';
import { handleTmdbRequest } from '../../lib/tmdb-proxy';

export const prerender = false;

// One `ALL` export so every method routes through handleTmdbRequest and the
// 405 for non-GET comes from our handler, not Astro's default.
export const ALL: APIRoute = ({ request }) =>
  handleTmdbRequest({
    searchParams: new URL(request.url).searchParams,
    method: request.method,
    token: import.meta.env.TMDB_ACCESS_TOKEN ?? process.env.TMDB_ACCESS_TOKEN,
    fetch,
  });
