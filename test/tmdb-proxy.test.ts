import { describe, expect, it, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { handleTmdbRequest, type TmdbRequestContext } from '../src/lib/tmdb-proxy';

const searchFixture = JSON.parse(
  readFileSync(new URL('./fixtures/tmdb-search-matrix.json', import.meta.url), 'utf8'),
);
const movieFixture = JSON.parse(
  readFileSync(new URL('./fixtures/tmdb-movie-603.json', import.meta.url), 'utf8'),
);

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

function makeCtx(qs: string, overrides: Partial<TmdbRequestContext> = {}): TmdbRequestContext {
  return {
    searchParams: new URLSearchParams(qs),
    method: 'GET',
    token: 'test-token',
    fetch: vi.fn(),
    ...overrides,
  };
}

function okJson(body: unknown) {
  return vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body });
}
function failStatus(status: number) {
  return vi.fn().mockResolvedValue({ ok: false, status, json: async () => ({}) });
}

describe('handleTmdbRequest — validation', () => {
  it('rejects non-GET with 405 + Allow: GET and does not call fetch', async () => {
    const ctx = makeCtx('op=search&query=matrix', { method: 'POST' });
    const res = await handleTmdbRequest(ctx);
    expect(res.status).toBe(405);
    expect(res.headers.get('Allow')).toBe('GET');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(ctx.fetch).not.toHaveBeenCalled();
  });

  it('treats HEAD like GET (not 405)', async () => {
    const fetchMock = okJson(searchFixture);
    const ctx = makeCtx('op=search&query=matrix', { method: 'HEAD', fetch: fetchMock });
    const res = await handleTmdbRequest(ctx);
    expect(res.status).not.toBe(405);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('returns 400 { error: "unknown op" } when op is missing', async () => {
    const res = await handleTmdbRequest(makeCtx(''));
    expect(res.status).toBe(400);
    expect(res.headers.get('Content-Type')).toContain('application/json');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toEqual({ error: 'unknown op' });
  });

  it('returns 400 for an unknown op', async () => {
    expect((await handleTmdbRequest(makeCtx('op=bogus'))).status).toBe(400);
  });

  it('returns 400 when search has no query', async () => {
    expect((await handleTmdbRequest(makeCtx('op=search'))).status).toBe(400);
  });

  it('returns 400 when movie has no id', async () => {
    expect((await handleTmdbRequest(makeCtx('op=movie'))).status).toBe(400);
  });

  it('returns 400 when movie id is not a positive integer', async () => {
    expect((await handleTmdbRequest(makeCtx('op=movie&id=abc'))).status).toBe(400);
    expect((await handleTmdbRequest(makeCtx('op=movie&id=0'))).status).toBe(400);
    expect((await handleTmdbRequest(makeCtx('op=movie&id=-3'))).status).toBe(400);
  });

  it('returns 500 when the token is missing, without calling fetch', async () => {
    const ctx = makeCtx('op=search&query=matrix', { token: undefined });
    const res = await handleTmdbRequest(ctx);
    expect(res.status).toBe(500);
    expect(ctx.fetch).not.toHaveBeenCalled();
  });
});

describe('handleTmdbRequest — search', () => {
  it('calls TMDB search with the bearer token and passes the body through', async () => {
    const fetchMock = okJson(searchFixture);
    const ctx = makeCtx('op=search&query=the matrix', { fetch: fetchMock });
    const res = await handleTmdbRequest(ctx);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('https://api.themoviedb.org/3/search/movie');
    expect(url).toContain('query=the+matrix');
    expect(url).toContain('include_adult=true');
    expect(url).toContain('page=1');
    expect(init.headers.Authorization).toBe('Bearer test-token');

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('application/json');
    expect(res.headers.get('Cache-Control')).toContain('s-maxage=600');
    expect(await res.json()).toEqual(searchFixture);
  });

  it('defaults page to 1 when page is not a positive integer', async () => {
    const fetchMock = okJson(searchFixture);
    await handleTmdbRequest(makeCtx('op=search&query=matrix&page=abc', { fetch: fetchMock }));
    expect(fetchMock.mock.calls[0][0]).toContain('page=1');
  });

  it('forwards a valid page number', async () => {
    const fetchMock = okJson(searchFixture);
    await handleTmdbRequest(makeCtx('op=search&query=matrix&page=3', { fetch: fetchMock }));
    expect(fetchMock.mock.calls[0][0]).toContain('page=3');
  });

  it('clamps page to TMDB max of 500', async () => {
    const fetchMock = okJson(searchFixture);
    await handleTmdbRequest(makeCtx('op=search&query=matrix&page=9999', { fetch: fetchMock }));
    expect(fetchMock.mock.calls[0][0]).toContain('page=500');
  });

  it('never puts the token in the response body or headers', async () => {
    const res = await handleTmdbRequest(
      makeCtx('op=search&query=matrix', { fetch: okJson(searchFixture), token: 'SUPERSECRET-abc123' }),
    );
    const bodyText = await res.text();
    expect(bodyText).not.toContain('SUPERSECRET-abc123');
    expect([...res.headers.values()].join(' | ')).not.toContain('SUPERSECRET-abc123');
  });
});

describe('handleTmdbRequest — movie', () => {
  it('calls TMDB movie with credits appended and passes the body through', async () => {
    const fetchMock = okJson(movieFixture);
    const res = await handleTmdbRequest(makeCtx('op=movie&id=603', { fetch: fetchMock }));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('https://api.themoviedb.org/3/movie/603');
    expect(url).toContain('append_to_response=credits');
    expect(init.headers.Authorization).toBe('Bearer test-token');

    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toContain('s-maxage=86400');
    expect(await res.json()).toEqual(movieFixture);
  });
});

describe('handleTmdbRequest — upstream failures', () => {
  it('maps upstream 404 to 404', async () => {
    const ctx = makeCtx('op=movie&id=999999999', { fetch: failStatus(404) });
    expect((await handleTmdbRequest(ctx)).status).toBe(404);
  });

  it('maps any other upstream status to 502', async () => {
    const ctx = makeCtx('op=search&query=matrix', { fetch: failStatus(500) });
    const res = await handleTmdbRequest(ctx);
    expect(res.status).toBe(502);
    expect(res.headers.get('Content-Type')).toContain('application/json');
    expect(await res.json()).toEqual({ error: 'tmdb upstream' });
  });

  it('maps a thrown fetch to 502', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    const ctx = makeCtx('op=search&query=matrix', { fetch: fetchMock });
    const res = await handleTmdbRequest(ctx);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'tmdb upstream' });
  });

  it('maps a 200 with a non-JSON body to 502', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token < in JSON');
      },
    });
    const ctx = makeCtx('op=search&query=matrix', { fetch: fetchMock });
    const res = await handleTmdbRequest(ctx);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'tmdb upstream' });
  });
});
