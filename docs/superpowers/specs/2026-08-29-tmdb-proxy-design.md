# Videothèque · Astro scaffold + TMDB proxy

Date: 2026-08-29
Status: approved for planning

## Goal

Stand up the Astro project and the `/api/tmdb` proxy, with tests. This is the
first code sub-project after the database foundation and the first step of the
`CLAUDE.md` work order (*TMDB proxy → Supabase layer → auth → port the shelf*).

Deliverable: a running Astro app with one working server endpoint, its client
helper module, and a Vitest suite. No Supabase client wiring, no auth, no UI
beyond a placeholder page.

## Scope

In scope:

- Scaffold Astro with the Vercel adapter, SSR (`output: 'server'`), strict
  TypeScript.
- `src/lib/tmdb-proxy.ts`: the proxy logic as a pure, testable function.
- `src/pages/api/tmdb.ts`: a thin endpoint wrapper around it.
- `src/lib/tmdb.ts`: client-side helpers (`searchFilms`, `getFilm`,
  `toFilmRow`, `posterUrl`) and shared types.
- Vitest set up via `getViteConfig()`, with committed TMDB fixtures.
- `.env` gains `TMDB_ACCESS_TOKEN`; `.env.example` is committed.
- `src/pages/index.astro` placeholder.

Out of scope (later sub-projects):

- `src/lib/supabase.ts` and any Supabase client usage.
- Magic-link auth and SSR sessions.
- `SearchBar`, `Shelf`, `Spine`, `FilmCase` components and the visible TMDB
  attribution they carry.
- Writing to the `films` cache (that is the browser's job, in a later cycle).
- End-to-end tests (Playwright, later cycle).
- Server-side response caching beyond HTTP `Cache-Control` headers.

## Decisions

### 1. The proxy is a thin passthrough, not a shaper

`/api/tmdb` validates the request, attaches the bearer token, calls TMDB, and
returns TMDB's JSON body **unmodified**. It does not pick fields, rename them,
or derive new ones.

Rationale: the set of fields the app wants from a film will grow (director now,
maybe keywords/runtime/cast later). A shaping proxy would need editing every
time. Keeping it a passthrough means the only place that knows the
TMDB-shape → `films`-row mapping is `src/lib/tmdb.ts::toFilmRow`, and a new
cached field is a change to that function plus a migration — the proxy is
untouched.

Trade-off accepted: TMDB's response shape reaches the client. Contained by
funnelling every client read through `src/lib/tmdb.ts` so the raw shape is
referenced in exactly one module.

### 2. Whitelist of operations, not path passthrough

The endpoint exposes two named operations selected by `?op=`:

| `op`     | required params      | upstream call                                                            |
| -------- | -------------------- | ----------------------------------------------------------------------- |
| `search` | `query`              | `GET /3/search/movie?query=<q>&page=<p>&include_adult=true`             |
| `movie`  | `id` (integer > 0)   | `GET /3/movie/<id>?append_to_response=credits`                          |

No mechanism lets the client name an arbitrary TMDB path. Adding an operation
is a deliberate code change. `append_to_response=credits` is the extension
point for richer `movie` data later (`credits,keywords,videos,...`).

`include_adult=true` is hardcoded: the collection is for adults and needs to
reach adult-classified titles (e.g. Japanese pinku cinema) that TMDB filters
out by default. It is not a client-controllable parameter.

### 3. Logic lives in a plain module, not the `.astro` file

`src/pages/api/tmdb.ts` is a wrapper that reads `import.meta.env` and delegates.
All behaviour is in `src/lib/tmdb-proxy.ts::handleTmdbRequest`, a pure function
taking its inputs as arguments (including the `fetch` implementation). Tests
call it directly — no Astro runtime, no experimental Container API, no dev
server, no real token.

### 4. Vitest

Astro's documented test framework, wired with `getViteConfig()` from
`astro/config`. Jest is not used (Vitest is the same API without separate
config, sharing Astro's Vite pipeline). Cypress/Playwright are E2E tools for a
later cycle; Playwright is the intended choice there because the drag-and-drop
and multi-tab flows suit it and the Playwright MCP is already configured.

### 5. Local Supabase stack is now running

`supabase start` is up (Docker). Not used by this sub-project directly, but it
means later cycles develop against local auth + Inbucket. Noted here only so
the plan does not re-litigate it.

## File structure

```
package.json                 # astro, @astrojs/vercel, vitest, scripts
astro.config.mjs             # vercel adapter, output: 'server', dev server on port 3000
                             # (matches supabase config.toml site_url, for the later auth cycle)
tsconfig.json                # extends astro/tsconfigs/strict
vitest.config.ts             # getViteConfig({ test: { environment: 'node' } })
.env                         # TMDB_ACCESS_TOKEN=...   (gitignored, already)
.env.example                 # TMDB_ACCESS_TOKEN=      (committed)
src/
  env.d.ts                   # ImportMetaEnv: TMDB_ACCESS_TOKEN
  pages/
    index.astro              # placeholder
    api/
      tmdb.ts                # thin wrapper -> handleTmdbRequest
  lib/
    tmdb-proxy.ts            # handleTmdbRequest (pure)
    tmdb.ts                  # client helpers + shared types
test/
  fixtures/
    tmdb-search-matrix.json  # real GET /3/search/movie?query=matrix body
    tmdb-movie-603.json      # real GET /3/movie/603?append_to_response=credits body
  tmdb-proxy.test.ts
  tmdb.test.ts
```

`.gitignore` gains `dist/` and `.vercel/`.

## Components

### `src/lib/tmdb-proxy.ts`

```ts
interface TmdbRequestContext {
  searchParams: URLSearchParams;
  method: string;
  token: string | undefined;
  fetch: typeof globalThis.fetch;
}

export async function handleTmdbRequest(ctx: TmdbRequestContext): Promise<Response>;
```

Behaviour:

1. `method !== 'GET'` → `405`, body `{ error: 'method not allowed' }`.
2. `!token` → `500`, body `{ error: 'server misconfigured' }`, and
   `console.error` a clear message. Never echo the token.
3. Read `op`:
   - `search`: require non-empty `query`. Optional `page`, parsed as an
     integer, clamped to `>= 1`, default `1`. Build the upstream URL.
   - `movie`: require `id` matching `/^\d+$/` and `> 0`. Build the upstream URL.
   - anything else (including missing) → `400`, body `{ error: 'unknown op' }`.
   - missing/invalid required param → `400`, body `{ error: '<param> required' }`.
4. Call `ctx.fetch(upstreamUrl, { headers: { Authorization: 'Bearer ' + token,
   Accept: 'application/json' } })`.
5. On the upstream response:
   - `res.ok` → `200`, pass the JSON body through unchanged, set
     `Cache-Control`: `public, s-maxage=86400` for `movie`,
     `public, s-maxage=600` for `search`.
   - `res.status === 404` → `404`, body `{ error: 'not found' }`.
   - any other non-ok status → `502`, body `{ error: 'tmdb upstream' }`,
     `console.error` the upstream status (not its body).
   - `ctx.fetch` throws → `502`, body `{ error: 'tmdb upstream' }`,
     `console.error` the error.

All responses are `application/json`.

### `src/pages/api/tmdb.ts`

```ts
import type { APIRoute } from 'astro';
import { handleTmdbRequest } from '../../lib/tmdb-proxy';

export const prerender = false;

export const ALL: APIRoute = ({ request }) =>
  handleTmdbRequest({
    searchParams: new URL(request.url).searchParams,
    method: request.method,
    token: import.meta.env.TMDB_ACCESS_TOKEN,
    fetch,
  });
```

A single `ALL` export routes every method through `handleTmdbRequest`, so the
`405` for non-GET comes from our function rather than Astro's default handler.

### `src/lib/tmdb.ts`

Shared types, kept permissive (most fields optional) — they mirror TMDB, which
we do not control:

```ts
export interface TmdbSearchResponse {
  page: number;
  total_pages: number;
  total_results: number;
  results: TmdbSearchResult[];
}
export interface TmdbSearchResult {
  id: number;
  title: string;
  release_date?: string;
  poster_path?: string | null;
  overview?: string;
}
export interface TmdbMovie {
  id: number;
  title: string;
  original_title?: string;
  release_date?: string;
  poster_path?: string | null;
  overview?: string;
  credits?: { crew?: Array<{ job?: string; name?: string }> };
}
```

Functions:

- `searchFilms(query: string, page = 1): Promise<TmdbSearchResponse>` —
  `fetch('/api/tmdb?op=search&query=' + encodeURIComponent(query) + '&page=' + page)`,
  throws on non-ok.
- `getFilm(id: number): Promise<TmdbMovie>` —
  `fetch('/api/tmdb?op=movie&id=' + id)`, throws on non-ok.
- `toFilmRow(m: TmdbMovie)` → the `films` insert shape **without**
  `spine_color` / `spine_dark` (the browser adds those):
  ```ts
  {
    id: m.id,
    title: m.title,
    original_title: m.original_title ?? null,
    year: /^\d{4}/.test(m.release_date ?? '') ? Number(m.release_date!.slice(0, 4)) : null,
    poster_path: m.poster_path ?? null,
    overview: m.overview ?? null,
    director: m.credits?.crew?.find((c) => c.job === 'Director')?.name ?? null,
  }
  ```
  `year` is `null` when `release_date` is absent or not a 4-digit prefix.
- `posterUrl(path: string | null | undefined, size = 'w500'): string | null` —
  `path ? 'https://image.tmdb.org/t/p/' + size + path : null`.

## Data flow

```
browser  src/lib/tmdb.ts            /api/tmdb (Astro SSR)         api.themoviedb.org
  |  searchFilms('matrix')  ----->  handleTmdbRequest              |
  |                                 validate op+params            |
  |                                 GET /3/search/movie?... ----->|
  |                                 <----- TMDB JSON --------------|
  |  <-------- same JSON, +Cache-Control ---------------------------
  |
  |  getFilm(603)  ------------->   GET /3/movie/603?append_to_response=credits
  |  <-------- TMDB JSON ------------------------------------------
  |  toFilmRow(json)  -> row ready for a `films` insert (later cycle)
```

The bearer token exists only in `import.meta.env` on the server. It is never in
a response body, header echoed to the client, or log line.

## Testing

`npm test` → `vitest run`. `npm run test:watch` → `vitest`.

### `test/tmdb-proxy.test.ts` — `handleTmdbRequest`

`fetch` is a `vi.fn()` stub; no network. Cases:

- `method: 'POST'` → 405.
- no `op` → 400 `unknown op`.
- `op: 'bogus'` → 400 `unknown op`.
- `op: 'search'` with no `query` → 400.
- `op: 'search'`, `query: 'matrix'` → calls `fetch` once with the expected
  `/3/search/movie` URL and an `Authorization: Bearer test-token` header;
  resolves 200; body deep-equals the fixture; `Cache-Control` contains
  `s-maxage=600`.
- `op: 'search'` with `page: 'abc'` → treated as page 1 (no error).
- `op: 'movie'` with no `id` → 400.
- `op: 'movie'`, `id: 'abc'` → 400.
- `op: 'movie'`, `id: '603'` → correct upstream URL incl.
  `append_to_response=credits`; 200; body deep-equals fixture; `Cache-Control`
  contains `s-maxage=86400`.
- `token: undefined` → 500; `fetch` not called.
- upstream resolves `{ ok: false, status: 404 }` → 404.
- upstream resolves `{ ok: false, status: 500 }` → 502.
- `fetch` rejects → 502.

### `test/tmdb.test.ts` — `toFilmRow`, `posterUrl`

Uses `tmdb-movie-603.json`:

- `toFilmRow` extracts `director` (`job === 'Director'` from `credits.crew`),
  `year === 1999`, maps `original_title`, passes `poster_path` through.
- `toFilmRow` on a movie with no `release_date` → `year: null`.
- `toFilmRow` on a movie with `poster_path: null` and no `credits` →
  `poster_path: null`, `director: null`.
- `posterUrl('/abc.jpg')` → `https://image.tmdb.org/t/p/w500/abc.jpg`.
- `posterUrl(null)` → `null`.

### Fixtures

`test/fixtures/*.json` are real TMDB response bodies, fetched once by hand with
the v4 token and committed. They contain no secrets. Document in a top comment
of each test file how to refresh them.

### Manual smoke test

Documented in `README.md` or a comment:

```bash
npm run dev
curl 'http://localhost:3000/api/tmdb?op=search&query=matrix'
curl 'http://localhost:3000/api/tmdb?op=movie&id=603'
```

Requires a real `TMDB_ACCESS_TOKEN` in `.env`.

## Acceptance criteria

- `npm install && npm run build` succeeds.
- `npm test` passes with no network access and no `TMDB_ACCESS_TOKEN` set.
- With a real token in `.env`, `npm run dev` plus the two `curl` calls return
  TMDB JSON; the `movie` response includes a `credits` object.
- No response body, header, or log statement from `/api/tmdb` contains the
  token.
- `.env.example` lists `TMDB_ACCESS_TOKEN`; `.gitignore` covers `dist/` and
  `.vercel/`.
- `src/pages/index.astro` renders a placeholder without error.
