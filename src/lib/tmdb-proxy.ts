import { errorJson, json } from './http';
import type { TmdbMovie } from './tmdb-mapping';

export interface TmdbRequestContext {
  searchParams: URLSearchParams;
  method: string;
  token: string | undefined;
  fetch: typeof globalThis.fetch;
}

const TMDB_BASE = 'https://api.themoviedb.org/3';

const MOVIE_S_MAXAGE = 86400;
const SEARCH_S_MAXAGE = 600;

/** Build the upstream TMDB URL for a whitelisted op, or null if params are invalid. */
function buildUpstreamUrl(op: 'search' | 'movie', params: URLSearchParams): string | null {
  if (op === 'search') {
    const query = params.get('query')?.trim();
    if (!query) return null;
    const pageRaw = Number(params.get('page'));
    let page = Number.isInteger(pageRaw) && pageRaw >= 1 ? pageRaw : 1;
    page = Math.min(page, 500); // TMDB rejects page > 500
    const u = new URL(`${TMDB_BASE}/search/movie`);
    u.searchParams.set('query', query);
    u.searchParams.set('page', String(page));
    u.searchParams.set('include_adult', 'true');
    return u.toString();
  }

  const id = params.get('id') ?? '';
  if (!/^\d+$/.test(id) || Number(id) <= 0) return null;
  const u = new URL(`${TMDB_BASE}/movie/${id}`);
  u.searchParams.set('append_to_response', 'credits');
  return u.toString();
}

/** An upstream failure, which callers answer with 502. */
export class TmdbUnavailableError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'TmdbUnavailableError';
  }
}

export async function fetchTmdbMovie(
  id: number,
  token: string,
  fetchImpl: typeof globalThis.fetch,
): Promise<TmdbMovie> {
  const url = buildUpstreamUrl('movie', new URLSearchParams({ id: String(id) }));
  if (!url) throw new TmdbUnavailableError(`invalid tmdb id ${id}`);

  let res: Response;
  try {
    res = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
  } catch (err) {
    throw new TmdbUnavailableError(`tmdb transport failure: ${String(err)}`);
  }
  if (!res.ok) throw new TmdbUnavailableError(`tmdb responded ${res.status}`, res.status);
  return (await res.json()) as TmdbMovie;
}

export async function handleTmdbRequest(ctx: TmdbRequestContext): Promise<Response> {
  // HEAD is GET without a body (RFC 9110); the transport strips the body for us.
  if (ctx.method !== 'GET' && ctx.method !== 'HEAD') {
    return errorJson({ error: 'method not allowed' }, 405, { Allow: 'GET' });
  }
  if (!ctx.token) {
    console.error('[api/tmdb] TMDB_ACCESS_TOKEN is not set');
    return errorJson({ error: 'server misconfigured' }, 500);
  }

  const op = ctx.searchParams.get('op');
  if (op !== 'search' && op !== 'movie') {
    return errorJson({ error: 'unknown op' }, 400);
  }

  const upstreamUrl = buildUpstreamUrl(op, ctx.searchParams);
  if (!upstreamUrl) {
    return errorJson({ error: op === 'search' ? 'query required' : 'id required' }, 400);
  }

  if (op === 'movie') {
    try {
      const movie = await fetchTmdbMovie(Number(ctx.searchParams.get('id')), ctx.token, ctx.fetch);
      return json(movie, 200, { 'Cache-Control': `public, s-maxage=${MOVIE_S_MAXAGE}` });
    } catch (err) {
      // An upstream 404 is the client's answer, not an outage.
      if (err instanceof TmdbUnavailableError && err.status === 404) {
        return errorJson({ error: 'not found' }, 404);
      }
      console.error('[api/tmdb] movie lookup failed', err);
      return errorJson({ error: 'tmdb upstream' }, 502);
    }
  }

  let upstream: Response;
  try {
    upstream = await ctx.fetch(upstreamUrl, {
      headers: { Authorization: `Bearer ${ctx.token}`, Accept: 'application/json' },
    });
  } catch (err) {
    console.error('[api/tmdb] upstream fetch threw', err);
    return errorJson({ error: 'tmdb upstream' }, 502);
  }

  if (!upstream.ok) {
    if (upstream.status === 404) return errorJson({ error: 'not found' }, 404);
    console.error('[api/tmdb] upstream returned', upstream.status);
    return errorJson({ error: 'tmdb upstream' }, 502);
  }

  let body: unknown;
  try {
    body = await upstream.json();
  } catch (err) {
    // A 200 with a non-JSON body (CDN error page, truncated response) would
    // otherwise reject and let Astro render an HTML 500.
    console.error('[api/tmdb] upstream returned non-JSON', err);
    return errorJson({ error: 'tmdb upstream' }, 502);
  }

  return json(body, 200, { 'Cache-Control': `public, s-maxage=${SEARCH_S_MAXAGE}` });
}
