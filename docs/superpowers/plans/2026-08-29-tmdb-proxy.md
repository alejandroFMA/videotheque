# Astro Scaffold + TMDB Proxy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Astro project and a tested `/api/tmdb` proxy that hides the TMDB token behind two whitelisted operations.

**Architecture:** Astro (Vercel adapter, `output: 'server'`, strict TS). The proxy's behaviour lives in a plain, pure module `src/lib/tmdb-proxy.ts` (`handleTmdbRequest`), which takes its inputs — including `fetch` and the token — as arguments so it is unit-testable with no network and no Astro runtime. The `.astro` endpoint is a one-line wrapper. The proxy passes TMDB's JSON through unchanged; the TMDB-shape → `films`-row mapping lives only in `src/lib/tmdb.ts::toFilmRow`.

**Tech Stack:** Astro 7, `@astrojs/vercel` 11, TypeScript 7, Vitest 4, Node 24.

**Spec:** `docs/superpowers/specs/2026-08-29-tmdb-proxy-design.md`

## Global Constraints

- Pinned versions: `astro@^7.2.9`, `@astrojs/vercel@^11.0.8`, `typescript@^7.0.0`, `@types/node@^24.0.0`, `vitest@^4.1.11`. If `astro/tsconfigs/strict` fails to load under TypeScript 7, fall back to `typescript@^5.9.0`.
- `astro.config.mjs`: `output: 'server'`, `adapter: vercel()`, `server: { port: 3000 }` (3000 matches `supabase/config.toml` `site_url`, for the later auth cycle).
- The TMDB bearer token is read only server-side, from `import.meta.env.TMDB_ACCESS_TOKEN` (with a `process.env` fallback) in the endpoint wrapper. It must never appear in any response body, response header, or log line.
- The proxy is a **passthrough**: it does not pick, rename, or derive fields from TMDB responses.
- Whitelisted operations only: `?op=search` and `?op=movie`. `include_adult=true` is hardcoded into the search call. `append_to_response=credits` is hardcoded into the movie call.
- Error contract: non-GET → 405; missing/unknown `op` → 400 `{ error: 'unknown op' }`; missing/invalid required param → 400; missing token → 500; upstream 404 → 404; any other upstream failure or thrown fetch → 502 `{ error: 'tmdb upstream' }`. All responses are `application/json`.
- Cache headers on success: `public, s-maxage=86400` for `movie`, `public, s-maxage=600` for `search`.
- `npm test` must pass with no network access and no `TMDB_ACCESS_TOKEN` set.
- Commit after every task. Conventional-commit style messages.

---

### Task 1: Astro project scaffold

**Files:**
- Create: `package.json`
- Create: `astro.config.mjs`
- Create: `tsconfig.json`
- Create: `src/env.d.ts`
- Create: `src/pages/index.astro`
- Create: `.env.example`
- Modify: `.gitignore` (add generated/build dirs)
- Modify: `.env` (append the token line — file is already gitignored)

**Interfaces:**
- Consumes: nothing.
- Produces: a buildable Astro app. Later tasks rely on `import.meta.env.TMDB_ACCESS_TOKEN` being typed (via `src/env.d.ts`) and on `npm run dev` serving on port 3000.

This task has no unit test; its deliverable is verified by a successful build and a served placeholder page.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "videotheque",
  "type": "module",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview",
    "astro": "astro",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "astro": "^7.2.9",
    "@astrojs/vercel": "^11.0.8"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "typescript": "^7.0.0",
    "vitest": "^4.1.11"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `npm install`
Expected: completes without error; `package-lock.json` is created. Commit the lockfile with the rest of the task.

- [ ] **Step 3: Create `astro.config.mjs`**

```js
// @ts-check
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: vercel(),
  server: { port: 3000 },
});
```

- [ ] **Step 4: Create `tsconfig.json`**

```json
{
  "extends": "astro/tsconfigs/strict",
  "include": [".astro/types.d.ts", "**/*"],
  "exclude": ["dist"]
}
```

- [ ] **Step 5: Create `src/env.d.ts`**

```ts
/// <reference types="astro/client" />

interface ImportMetaEnv {
  /** TMDB v4 "API Read Access Token" (Bearer). Server-only. */
  readonly TMDB_ACCESS_TOKEN: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare namespace NodeJS {
  interface ProcessEnv {
    TMDB_ACCESS_TOKEN?: string;
  }
}
```

- [ ] **Step 6: Create `src/pages/index.astro` (placeholder)**

```astro
---
export const prerender = false;
---

<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width" />
    <title>Videothèque</title>
  </head>
  <body>
    <main>
      <h1>Videothèque</h1>
      <p>Coming soon.</p>
    </main>
  </body>
</html>
```

- [ ] **Step 7: Create `.env.example`**

```ini
# TMDB v4 "API Read Access Token" (Bearer), from https://www.themoviedb.org/settings/api
# Server-only: it is never sent to the browser.
TMDB_ACCESS_TOKEN=
```

- [ ] **Step 8: Append the token line to `.env`**

Add this line to the existing (gitignored) `.env`, pasting the real token after the `=`:

```ini
TMDB_ACCESS_TOKEN=
```

- [ ] **Step 9: Update `.gitignore`**

Add these lines to `.gitignore`:

```
dist/
.vercel/
.astro/
```

- [ ] **Step 10: Verify the build**

Run: `npm run build`
Expected: PASS. Astro runs `astro sync` (generating `.astro/types.d.ts`), then builds to `dist/` with the Vercel adapter. No TypeScript errors.

- [ ] **Step 11: Verify the dev server serves the placeholder**

Run: `npm run dev` in one shell, then in another:
`curl -s http://localhost:3000/`
Expected: HTML containing `<h1>Videothèque</h1>` and `Coming soon.`
Stop the dev server afterwards.

- [ ] **Step 12: Commit**

```bash
git add package.json package-lock.json astro.config.mjs tsconfig.json src/env.d.ts src/pages/index.astro .env.example .gitignore
git commit -m "chore: scaffold Astro app with Vercel SSR adapter"
```

---

### Task 2: `handleTmdbRequest` proxy handler + unit suite

**Files:**
- Create: `src/lib/tmdb-proxy.ts`
- Create: `vitest.config.ts`
- Create: `test/fixtures/tmdb-search-matrix.json`
- Create: `test/fixtures/tmdb-movie-603.json`
- Create: `test/tmdb-proxy.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (pure module).
- Produces:
  ```ts
  export interface TmdbRequestContext {
    searchParams: URLSearchParams;
    method: string;
    token: string | undefined;
    fetch: typeof globalThis.fetch;
  }
  export function handleTmdbRequest(ctx: TmdbRequestContext): Promise<Response>;
  ```
  Task 3 (the `.astro` endpoint) calls `handleTmdbRequest`.

- [ ] **Step 1: Create `vitest.config.ts`**

```ts
/// <reference types="vitest/config" />
import { getViteConfig } from 'astro/config';

// getViteConfig merges Astro's Vite setup so tests resolve the same way the app does.
// If it fails to load here (e.g. the Vercel adapter throws without credentials),
// replace the import with `import { defineConfig } from 'vitest/config'` and call
// defineConfig(...) with the same `test` object — tests import only plain .ts modules.
export default getViteConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
```

- [ ] **Step 2: Create the fixtures**

`test/fixtures/tmdb-movie-603.json` (a trimmed real `GET /3/movie/603?append_to_response=credits` body — no secrets; refresh by re-running that call with a real token):

```json
{
  "id": 603,
  "title": "The Matrix",
  "original_title": "The Matrix",
  "release_date": "1999-03-30",
  "poster_path": "/p96dm7sCMn4VYAStA6siNz30G1r.jpg",
  "overview": "Set in the 22nd century, The Matrix tells the story of a computer hacker who joins a group of underground insurgents fighting the vast and powerful computers who now rule the earth.",
  "runtime": 136,
  "credits": {
    "cast": [
      { "name": "Keanu Reeves", "character": "Neo" }
    ],
    "crew": [
      { "job": "Director", "name": "Lana Wachowski", "department": "Directing" },
      { "job": "Director", "name": "Lilly Wachowski", "department": "Directing" },
      { "job": "Producer", "name": "Joel Silver", "department": "Production" }
    ]
  }
}
```

`test/fixtures/tmdb-search-matrix.json` (a trimmed real `GET /3/search/movie?query=matrix` body):

```json
{
  "page": 1,
  "total_pages": 5,
  "total_results": 87,
  "results": [
    {
      "id": 603,
      "title": "The Matrix",
      "release_date": "1999-03-30",
      "poster_path": "/p96dm7sCMn4VYAStA6siNz30G1r.jpg",
      "overview": "Set in the 22nd century..."
    },
    {
      "id": 604,
      "title": "The Matrix Reloaded",
      "release_date": "2003-05-15",
      "poster_path": "/9TGHDvWrqKBzwDxDodHYXEmOE6J.jpg",
      "overview": "Six months after the events of The Matrix..."
    }
  ]
}
```

- [ ] **Step 3: Write the failing test — `test/tmdb-proxy.test.ts`**

```ts
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
  it('rejects non-GET with 405 and does not call fetch', async () => {
    const ctx = makeCtx('op=search&query=matrix', { method: 'POST' });
    const res = await handleTmdbRequest(ctx);
    expect(res.status).toBe(405);
    expect(ctx.fetch).not.toHaveBeenCalled();
  });

  it('returns 400 { error: "unknown op" } when op is missing', async () => {
    const res = await handleTmdbRequest(makeCtx(''));
    expect(res.status).toBe(400);
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
    expect((await handleTmdbRequest(ctx)).status).toBe(502);
  });

  it('maps a thrown fetch to 502', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    const ctx = makeCtx('op=search&query=matrix', { fetch: fetchMock });
    expect((await handleTmdbRequest(ctx)).status).toBe(502);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npx vitest run test/tmdb-proxy.test.ts`
Expected: FAIL — cannot resolve `../src/lib/tmdb-proxy`.

- [ ] **Step 5: Write `src/lib/tmdb-proxy.ts`**

```ts
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
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run test/tmdb-proxy.test.ts`
Expected: PASS — all cases green, no console noise.

- [ ] **Step 7: Commit**

```bash
git add vitest.config.ts src/lib/tmdb-proxy.ts test/
git commit -m "feat: add /api/tmdb proxy handler with unit tests"
```

---

### Task 3: Wire the Astro endpoint

**Files:**
- Create: `src/pages/api/tmdb.ts`

**Interfaces:**
- Consumes: `handleTmdbRequest` from `src/lib/tmdb-proxy.ts` (Task 2).
- Produces: a live `GET /api/tmdb` route. Task 4's client helpers call it by URL. Task 5 documents its smoke test.

- [ ] **Step 1: Create `src/pages/api/tmdb.ts`**

```ts
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
```

- [ ] **Step 2: Verify the route compiles**

Run: `npm run build`
Expected: PASS. The build lists `/api/tmdb` among the routes. No token needed at build time.

- [ ] **Step 3: Manual smoke test (skip if no real token)**

With a real `TMDB_ACCESS_TOKEN` in `.env`, run `npm run dev`, then:
`curl -s 'http://localhost:3000/api/tmdb?op=search&query=matrix'`
Expected: JSON with a `results` array.
`curl -s 'http://localhost:3000/api/tmdb?op=movie&id=603'`
Expected: JSON with `"title":"The Matrix"` and a `"credits"` object.
`curl -s 'http://localhost:3000/api/tmdb?op=movie&id=603' -i | grep -i cache-control`
Expected: `cache-control: public, s-maxage=86400`.
Confirm the token string appears in none of the outputs. Stop the dev server.

- [ ] **Step 4: Commit**

```bash
git add src/pages/api/tmdb.ts
git commit -m "feat: expose the /api/tmdb endpoint"
```

---

### Task 4: Client helpers `src/lib/tmdb.ts` + tests

**Files:**
- Create: `src/lib/tmdb.ts`
- Create: `test/tmdb.test.ts`

**Interfaces:**
- Consumes: the `GET /api/tmdb` route (Task 3), by URL only.
- Produces:
  ```ts
  export interface TmdbSearchResult { id: number; title: string; release_date?: string; poster_path?: string | null; overview?: string; }
  export interface TmdbSearchResponse { page: number; total_pages: number; total_results: number; results: TmdbSearchResult[]; }
  export interface TmdbCrewMember { job?: string; name?: string; }
  export interface TmdbMovie { id: number; title: string; original_title?: string; release_date?: string; poster_path?: string | null; overview?: string; credits?: { crew?: TmdbCrewMember[] }; }
  export interface FilmRow { id: number; title: string; original_title: string | null; year: number | null; poster_path: string | null; overview: string | null; director: string | null; }
  export function searchFilms(query: string, page?: number): Promise<TmdbSearchResponse>;
  export function getFilm(id: number): Promise<TmdbMovie>;
  export function toFilmRow(movie: TmdbMovie): FilmRow;
  export function posterUrl(path: string | null | undefined, size?: string): string | null;
  ```

- [ ] **Step 1: Write the failing test — `test/tmdb.test.ts`**

```ts
import { describe, expect, it, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { getFilm, posterUrl, searchFilms, toFilmRow, type TmdbMovie } from '../src/lib/tmdb';

const movieFixture: TmdbMovie = JSON.parse(
  readFileSync(new URL('./fixtures/tmdb-movie-603.json', import.meta.url), 'utf8'),
);

describe('toFilmRow', () => {
  it('maps a full TMDB movie to a films row', () => {
    expect(toFilmRow(movieFixture)).toEqual({
      id: 603,
      title: 'The Matrix',
      original_title: 'The Matrix',
      year: 1999,
      poster_path: '/p96dm7sCMn4VYAStA6siNz30G1r.jpg',
      overview: movieFixture.overview,
      director: 'Lana Wachowski',
    });
  });

  it('returns year null when release_date is missing or malformed', () => {
    expect(toFilmRow({ id: 1, title: 'x' }).year).toBeNull();
    expect(toFilmRow({ id: 1, title: 'x', release_date: '' }).year).toBeNull();
    expect(toFilmRow({ id: 1, title: 'x', release_date: 'soon' }).year).toBeNull();
  });

  it('returns director null when the crew has no Director', () => {
    expect(toFilmRow({ id: 1, title: 'x' }).director).toBeNull();
    expect(
      toFilmRow({ id: 1, title: 'x', credits: { crew: [{ job: 'Producer', name: 'P' }] } }).director,
    ).toBeNull();
  });

  it('coerces missing optional fields to null', () => {
    const row = toFilmRow({ id: 7, title: 'Bare' });
    expect(row.original_title).toBeNull();
    expect(row.poster_path).toBeNull();
    expect(row.overview).toBeNull();
  });
});

describe('posterUrl', () => {
  it('builds an image.tmdb.org URL at the default size', () => {
    expect(posterUrl('/abc.jpg')).toBe('https://image.tmdb.org/t/p/w500/abc.jpg');
  });
  it('honours an explicit size', () => {
    expect(posterUrl('/abc.jpg', 'original')).toBe('https://image.tmdb.org/t/p/original/abc.jpg');
  });
  it('returns null with no path', () => {
    expect(posterUrl(null)).toBeNull();
    expect(posterUrl(undefined)).toBeNull();
  });
});

describe('searchFilms / getFilm', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('searchFilms hits the proxy with an encoded query and page', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [] }) });
    vi.stubGlobal('fetch', fetchMock);
    await searchFilms('the matrix', 2);
    expect(fetchMock).toHaveBeenCalledWith('/api/tmdb?op=search&query=the%20matrix&page=2');
  });

  it('searchFilms defaults page to 1', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [] }) });
    vi.stubGlobal('fetch', fetchMock);
    await searchFilms('matrix');
    expect(fetchMock).toHaveBeenCalledWith('/api/tmdb?op=search&query=matrix&page=1');
  });

  it('getFilm hits the proxy with the id', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 603 }) });
    vi.stubGlobal('fetch', fetchMock);
    await getFilm(603);
    expect(fetchMock).toHaveBeenCalledWith('/api/tmdb?op=movie&id=603');
  });

  it('throws when the proxy responds non-ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 502, json: async () => ({}) }),
    );
    await expect(getFilm(1)).rejects.toThrow('tmdb proxy 502');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/tmdb.test.ts`
Expected: FAIL — cannot resolve `../src/lib/tmdb`.

- [ ] **Step 3: Write `src/lib/tmdb.ts`**

```ts
export interface TmdbSearchResult {
  id: number;
  title: string;
  release_date?: string;
  poster_path?: string | null;
  overview?: string;
}

export interface TmdbSearchResponse {
  page: number;
  total_pages: number;
  total_results: number;
  results: TmdbSearchResult[];
}

export interface TmdbCrewMember {
  job?: string;
  name?: string;
}

export interface TmdbMovie {
  id: number;
  title: string;
  original_title?: string;
  release_date?: string;
  poster_path?: string | null;
  overview?: string;
  credits?: { crew?: TmdbCrewMember[] };
}

/** The shape inserted into `public.films`, minus spine_color/spine_dark (browser-computed). */
export interface FilmRow {
  id: number;
  title: string;
  original_title: string | null;
  year: number | null;
  poster_path: string | null;
  overview: string | null;
  director: string | null;
}

const IMAGE_BASE = 'https://image.tmdb.org/t/p/';

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`tmdb proxy ${res.status}`);
  return res.json() as Promise<T>;
}

export function searchFilms(query: string, page = 1): Promise<TmdbSearchResponse> {
  return getJson<TmdbSearchResponse>(
    `/api/tmdb?op=search&query=${encodeURIComponent(query)}&page=${page}`,
  );
}

export function getFilm(id: number): Promise<TmdbMovie> {
  return getJson<TmdbMovie>(`/api/tmdb?op=movie&id=${id}`);
}

/** Map a TMDB movie (with credits appended) to a `films` row. The one place that
 *  knows the TMDB → films mapping; add a cached field here and in the migration. */
export function toFilmRow(movie: TmdbMovie): FilmRow {
  const release = movie.release_date ?? '';
  return {
    id: movie.id,
    title: movie.title,
    original_title: movie.original_title ?? null,
    year: /^\d{4}/.test(release) ? Number(release.slice(0, 4)) : null,
    poster_path: movie.poster_path ?? null,
    overview: movie.overview ?? null,
    director: movie.credits?.crew?.find((c) => c.job === 'Director')?.name ?? null,
  };
}

export function posterUrl(path: string | null | undefined, size = 'w500'): string | null {
  return path ? `${IMAGE_BASE}${size}${path}` : null;
}
```

- [ ] **Step 4: Run the whole suite**

Run: `npm test`
Expected: PASS — both `test/tmdb-proxy.test.ts` and `test/tmdb.test.ts`, no network, no token.

- [ ] **Step 5: Verify the build still passes**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/tmdb.ts test/tmdb.test.ts
git commit -m "feat: add TMDB client helpers and film-row mapping"
```

---

### Task 5: Rewrite the root `README.md`

**Files:**
- Modify: `README.md` (overwrite the two-line stub)

**Interfaces:**
- Consumes: everything built in Tasks 1–4 (scripts, ports, endpoint) plus the
  existing `supabase/` workflow and `CLAUDE.md`.
- Produces: nothing code depends on. Deliverable is the document itself.

This task has no unit test. It is done when the file contains all 11 sections
below, every command matches what the repo actually does, and it links to
`supabase/README.md` instead of duplicating its psql/RLS cheatsheet.

- [ ] **Step 1: Overwrite `README.md` with this content**

````markdown
# Videothèque

A film shelf. Each user owns one or more themed shelves and fills them by
searching [TMDB](https://www.themoviedb.org/). Films stand on a wooden board as
case spines in an order the owner sets by dragging. A shelf marked public is
shareable at `/e/<slug>` with no login. Visual reference:
[thecriterioncloset.com](https://www.thecriterioncloset.com/).

## Stack

- **Astro** with the Vercel adapter, server-side rendering
- **Supabase** — Postgres, magic-link auth, row level security
- **TMDB** as the data source, always through the `/api/tmdb` proxy
- No UI framework: Astro components and plain JavaScript
- Deployed on **Vercel**

See `CLAUDE.md` for the architecture rules and rejected alternatives.

## Prerequisites

- Node 24+ and npm
- Docker Desktop (runs the local Supabase stack)
- Supabase CLI — installed globally, or use `npx supabase ...` everywhere below

## Getting started

```bash
npm install
cp .env.example .env          # then paste your TMDB_ACCESS_TOKEN
supabase start                # boots local Postgres + Auth in Docker
npm run dev                   # http://localhost:3000
```

The dev server runs on port **3000** to match `site_url` in
`supabase/config.toml`. Useful while `supabase start` is up:

- `supabase status` — every local URL, port, and key
- Studio (tables, SQL, auth users): http://127.0.0.1:54323
- Inbucket (catches magic-link emails, no real mail is sent): http://127.0.0.1:54324

Stop the stack with `supabase stop`.

## Environment variables

Set in `.env` locally (gitignored) and in the Vercel dashboard for deploys.

| Variable | Required | Notes |
| --- | --- | --- |
| `TMDB_ACCESS_TOKEN` | yes | TMDB v4 "API Read Access Token" (Bearer). Server-only — never sent to the browser. Get one at <https://www.themoviedb.org/settings/api>. |

Supabase URL / anon-key variables are added in the Supabase-layer cycle.

## Database — local workflow

Migrations are **hand-authored SQL** in `supabase/migrations/`. The project does
not use declarative schemas (`config.toml` has `[db.migrations] schema_paths =
[]`).

```bash
supabase start                      # start the local stack
supabase db reset                   # replay every migration from scratch
                                    #   (+ supabase/seed.sql if present)
```

To make a schema change:

```bash
supabase migration new <slug>       # creates supabase/migrations/<timestamp>_<slug>.sql
# write the SQL by hand — follow the existing files: a header comment
# explaining the why, idempotent DDL (create or replace / drop if exists) where
# reasonable
supabase db reset                   # confirm it applies clean from zero
supabase db advisors                # security/perf lint — fix what it flags
```

For throwaway exploration use `supabase db query "..."` (or the Supabase MCP
`execute_sql`). Do **not** use `apply_migration` for local iteration — it
writes a history entry per call and breaks `db diff`/`db pull`.

Deeper database reference — psql cheatsheet, browsing data, reproducing what a
browser session sees under RLS — is in [`supabase/README.md`](supabase/README.md).

## Database — propagate to hosted

The repo is linked to a hosted Supabase project (`project_id` in
`supabase/config.toml`; ref cached in `supabase/.temp/linked-project.json`).

```bash
supabase login                              # one-time
supabase link --project-ref <project-ref>   # one-time, if not already linked
supabase migration list                     # shows local vs remote drift
supabase db push                            # apply pending migrations to hosted
```

Hosted `auth.users` is a separate database from local — users created in one do
not appear in the other. See [`supabase/README.md`](supabase/README.md) ("Users").

## Testing

```bash
npm test           # Vitest, one run — no network or token needed
npm run test:watch
```

`npm test` mocks `fetch`, so the TMDB proxy is covered without hitting the real
API. For an end-to-end check against real TMDB (needs `TMDB_ACCESS_TOKEN` in
`.env`):

```bash
npm run dev
curl 'http://localhost:3000/api/tmdb?op=search&query=matrix'
curl 'http://localhost:3000/api/tmdb?op=movie&id=603'
```

The first returns a TMDB search page; the second a movie object with a `credits`
field. Neither response contains the token.

## Project layout

```
src/
  pages/
    index.astro        own shelves, requires a session
    e/[slug].astro     anyone's public shelf, no login
    api/tmdb.ts         TMDB proxy endpoint (wraps src/lib/tmdb-proxy.ts)
  components/           Shelf, Spine, SearchBar, FilmCase
  lib/                  tmdb.ts, tmdb-proxy.ts, supabase.ts, colors.ts
  styles/
supabase/
  migrations/           hand-authored schema history
  tests/schema_checks.sql
test/                    Vitest suites + fixtures
docs/superpowers/        specs and implementation plans
```

Not every file exists yet — see the work order in `CLAUDE.md`.

## Deployment

Pushed to Vercel. The `@astrojs/vercel` adapter turns the SSR routes into Vercel
functions at build time. Set `TMDB_ACCESS_TOKEN` (and, later, the Supabase
variables) in the Vercel project settings.

## Attribution

This product uses the TMDB API but is not endorsed or certified by TMDB.
Posters are served from `image.tmdb.org` and never rehosted. TMDB's free API
licence is non-commercial.
````

- [ ] **Step 2: Verify links and commands**

- `grep -n "supabase/README.md" README.md` → at least two matches (linked, not
  duplicated).
- Confirm every fenced command is one the repo actually supports: `npm run dev`,
  `npm test`, `npm run test:watch` exist in `package.json` (Tasks 1–2);
  `supabase start` / `db reset` / `migration new` / `db advisors` / `db push`
  are current CLI verbs (`supabase <cmd> --help` if unsure).
- Render check: open `README.md` in a Markdown preview; no broken tables or code
  fences.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: rewrite README with project overview and DB workflow guides"
```

---

## Self-Review

**1. Spec coverage**

| Spec section | Task |
| --- | --- |
| Scaffold Astro (Vercel adapter, SSR, strict TS) | Task 1 |
| `.env` gains `TMDB_ACCESS_TOKEN`; `.env.example` committed | Task 1 (steps 7–8) |
| `.gitignore` covers `dist/`, `.vercel/` | Task 1 (step 9; `.astro/` added too) |
| `src/pages/index.astro` placeholder | Task 1 (step 6) |
| `src/env.d.ts` typing | Task 1 (step 5) |
| Decision 1 — thin passthrough, no shaping | Task 2 (`handleTmdbRequest` returns `body` unchanged); Task 4 (`toFilmRow` is the only mapper) |
| Decision 2 — whitelist `search`/`movie`, `include_adult=true`, `append_to_response=credits` | Task 2 (`buildUpstreamUrl`, tests assert both query params) |
| Decision 3 — logic in a plain module, `.astro` is a wrapper | Task 2 (`src/lib/tmdb-proxy.ts`), Task 3 (`src/pages/api/tmdb.ts`) |
| Decision 4 — Vitest via `getViteConfig()` | Task 2 (step 1, with documented fallback) |
| Error contract (405/400/500/404/502) | Task 2 (steps 3 & 5, all cases tested) |
| Cache headers `s-maxage` 86400 / 600 | Task 2 (implementation + assertions) |
| Token never in body/header/log | Task 2 (only `console.error`s status/messages, never the token); Task 3 (step 3 verifies) |
| `src/lib/tmdb.ts`: `searchFilms`, `getFilm`, `toFilmRow`, `posterUrl` + types | Task 4 |
| `toFilmRow` year/director derivation, null handling | Task 4 (step 1 tests, step 3 impl) |
| Fixtures committed, token-free tests | Task 2 (step 2) |
| Manual smoke test documented | Task 5 (README "Testing" section) |
| Root `README.md`: description + run/DB/migration/hosted guides, 11 sections | Task 5 (step 1) |
| Root `README.md` links `supabase/README.md`, no psql/RLS duplication | Task 5 (steps 1–2) |
| Acceptance: `npm install && npm run build` | Task 1 (step 10) |
| Acceptance: `npm test` with no network/token | Task 4 (step 4) |
| Acceptance: real-token curl returns JSON with `credits` | Task 3 (step 3) |

No gaps.

**2. Placeholder scan** — no `TBD`/`TODO`/"handle edge cases"/"similar to". Every code step carries full code.

**3. Type consistency** — `TmdbRequestContext` is defined in Task 2's Interfaces and `src/lib/tmdb-proxy.ts`, imported by name in Task 2's test and Task 3's wrapper. `TmdbMovie`/`FilmRow` are defined once in Task 4's Interfaces and `src/lib/tmdb.ts`, imported in Task 4's test. `handleTmdbRequest(ctx)` signature is identical across the Interfaces block, the implementation, the test, and the endpoint wrapper. `toFilmRow` returns the same 7 keys in the type, the impl, and the test's `toEqual`.
