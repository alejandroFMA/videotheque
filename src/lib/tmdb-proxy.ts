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

/** Build the upstream TMDB URL for a whitelisted op, or null if params are invalid. */
function buildUpstreamUrl(op: 'search' | 'movie', params: URLSearchParams): string | null {
  if (op === 'search') {
    const query = params.get('query')?.trim();
    if (!query) return null;
    const pageRaw = Number(params.get('page'));
    const page = Number.isInteger(pageRaw) && pageRaw >= 1 ? pageRaw : 1;
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
  if (ctx.method !== 'GET') {
    return json({ error: 'method not allowed' }, 405);
  }
  if (!ctx.token) {
    console.error('[api/tmdb] TMDB_ACCESS_TOKEN is not set');
    return json({ error: 'server misconfigured' }, 500);
  }

  const op = ctx.searchParams.get('op');
  if (op !== 'search' && op !== 'movie') {
    return json({ error: 'unknown op' }, 400);
  }

  const upstreamUrl = buildUpstreamUrl(op, ctx.searchParams);
  if (!upstreamUrl) {
    return json({ error: op === 'search' ? 'query required' : 'id required' }, 400);
  }

  let upstream: Response;
  try {
    upstream = await ctx.fetch(upstreamUrl, {
      headers: { Authorization: `Bearer ${ctx.token}`, Accept: 'application/json' },
    });
  } catch (err) {
    console.error('[api/tmdb] upstream fetch threw', err);
    return json({ error: 'tmdb upstream' }, 502);
  }

  if (!upstream.ok) {
    if (upstream.status === 404) return json({ error: 'not found' }, 404);
    console.error('[api/tmdb] upstream returned', upstream.status);
    return json({ error: 'tmdb upstream' }, 502);
  }

  const body = await upstream.json();
  const sMaxAge = op === 'movie' ? 86400 : 600;
  return json(body, 200, { 'Cache-Control': `public, s-maxage=${sMaxAge}` });
}
