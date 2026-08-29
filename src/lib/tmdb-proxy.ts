export interface TmdbRequestContext {
  searchParams: URLSearchParams;
  method: string;
  token: string | undefined;
  fetch: typeof globalThis.fetch;
}

const TMDB_BASE = 'https://api.themoviedb.org/3';

function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

/** Like `json()` but marks the response uncacheable — every 4xx/5xx goes through here. */
function errorJson(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return json(body, status, { 'Cache-Control': 'no-store', ...headers });
}

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

  const sMaxAge = op === 'movie' ? 86400 : 600;
  return json(body, 200, { 'Cache-Control': `public, s-maxage=${sMaxAge}` });
}
