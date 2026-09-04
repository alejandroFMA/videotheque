# Shelf Mutation Endpoints Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the browser three endpoints — add a film, remove a film, reorder
a shelf — backed by a shared Supabase data layer, so the shelf UI has somewhere
to store what the user does.

**Architecture:** Every write goes through `src/pages/api/shelves/`, using the
request-scoped Supabase client the middleware puts on `Astro.locals`. Each
route is a five-line adapter over a pure handler in `src/lib/shelf-actions.ts`,
which in turn calls `src/lib/shelves.ts` for all database access. That is the
same shape as the existing `/api/tmdb` + `lib/tmdb-proxy.ts` pair, and it is
what lets every handler be tested without starting a server.

**Tech Stack:** Astro 7 SSR (Vercel adapter), `@supabase/ssr` +
`@supabase/supabase-js`, Vitest, TypeScript. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-03-shelf-mutation-endpoints-design.md`

## Global Constraints

- **No commit steps.** Per the repo owner's standing rule, this plan contains
  no commit instructions and implementers must not commit. Leave changes
  unstaged for review. The owner commits.
- **`node_modules` is absent in a fresh clone.** Run `npm install` once before
  the first task or every test command fails with "command not found".
- **No new runtime dependencies.** `CLAUDE.md` requires a written
  justification for any runtime library; nothing here needs one.
- **Interface language is Castilian Spanish; code, comments, identifiers,
  specs and commit messages stay in English.** Both directions hold.
- **Every user-facing string lives in `src/constants/`**, never inline in a
  component or handler.
- **No magic values.** A literal that carries meaning gets a name; `0`, `1`,
  `-1` and array indices are exempt (`.claude/.rules/constants-and-types.md`).
- **Comments explain _why_, never _what_** (`.claude/.rules/comments.md`).
- **Rendering a shelf never calls TMDB.** Only `POST …/films` may talk to
  TMDB, and only to fill the cache on a first-time add.
- **`spine_color` / `spine_dark` are written exactly once**, on the film's
  first insert, and never recomputed.
- **The 20-film cap is enforced by the endpoint** (`SHELF_CAPACITY = 20`).
- Test command: `npx vitest run test/<file>` for one file, `npm test` for all.
  Typecheck: `npm run typecheck`.

---

### Task 1: Shared JSON response helpers

`tmdb-proxy.ts` has private `json()` / `errorJson()` helpers. The three new
handlers need the same behaviour (JSON body, `Cache-Control: no-store` on
every failure). Extract them first so nothing is duplicated later.

**Files:**
- Create: `src/lib/http.ts`
- Create: `test/http.test.ts`
- Modify: `src/lib/tmdb-proxy.ts` (delete the two local helpers, import them)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `json(body: unknown, status: number, headers?: Record<string, string>): Response`
  - `errorJson(body: unknown, status: number, headers?: Record<string, string>): Response`
  - `const NO_STORE = 'no-store'`
  - The named responses the new handlers return:
    `unauthorized()`, `badRequest(reason: string)`, `notFound()`,
    `conflict(body: object)`, `internalError()`, `badGateway(reason: string)`,
    `noContent()`.

**Why the named responses and not `HTTP_*` status constants:** a
`HTTP_NOT_FOUND = 404` says nothing that `404` does not already say, and the
repo is already split on this — `tmdb-proxy.ts:56` writes `400` inline while
`constants/index.ts:12` defines `HTTP_SEE_OTHER`, which earns its name because
`303` over `302` is a real decision. The name belongs on the *response*, not
on the number: `notFound()` reads better than
`errorJson({ error: 'not found' }, HTTP_NOT_FOUND)` and keeps every handler's
error body identical without a second place to look. `HTTP_SEE_OTHER` stays
where it is; the auth routes are not in scope.

- [ ] **Step 1: Write the failing test**

Create `test/http.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { errorJson, json } from '../src/lib/http';

describe('json', () => {
  it('serialises the body and sets the JSON content type', async () => {
    const res = json({ ok: true }, 200);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('application/json');
    expect(await res.json()).toEqual({ ok: true });
  });

  it('does not set Cache-Control on its own', () => {
    expect(json({}, 200).headers.get('Cache-Control')).toBeNull();
  });

  it('merges extra headers', () => {
    expect(json({}, 200, { Allow: 'GET' }).headers.get('Allow')).toBe('GET');
  });
});

describe('errorJson', () => {
  it('marks every response no-store', () => {
    expect(errorJson({ error: 'nope' }, 400).headers.get('Cache-Control')).toBe('no-store');
  });

  it('lets an explicit Cache-Control win', () => {
    const res = errorJson({}, 500, { 'Cache-Control': 'max-age=0' });
    expect(res.headers.get('Cache-Control')).toBe('max-age=0');
  });
});

describe('named responses', () => {
  it('carry the right status and an uncacheable body', async () => {
    expect(unauthorized().status).toBe(401);
    expect(badRequest('invalid film id').status).toBe(400);
    expect(notFound().status).toBe(404);
    expect(conflict({ error: 'shelf_full' }).status).toBe(409);
    expect(internalError().status).toBe(500);
    expect(badGateway('tmdb unavailable').status).toBe(502);

    for (const res of [unauthorized(), notFound(), internalError()]) {
      expect(res.headers.get('Cache-Control')).toBe('no-store');
    }
  });

  it('puts the reason in the body of a 400 and a 502', async () => {
    expect(await badRequest('invalid order').json()).toEqual({ error: 'invalid order' });
    expect(await badGateway('tmdb unavailable').json()).toEqual({ error: 'tmdb unavailable' });
  });

  it('gives 404 and 500 a fixed body, so they never leak internals', async () => {
    expect(await notFound().json()).toEqual({ error: 'not found' });
    expect(await internalError().json()).toEqual({ error: 'internal error' });
  });

  it('passes a conflict body through, for the shelf-full message', async () => {
    const res = conflict({ error: 'shelf_full', message: 'lleno' });
    expect(await res.json()).toEqual({ error: 'shelf_full', message: 'lleno' });
  });

  it('answers 204 with no body at all', async () => {
    const res = noContent();
    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
  });
});
```

Update the import at the top of the file to pull in the new names:

```ts
import {
  badGateway,
  badRequest,
  conflict,
  errorJson,
  internalError,
  json,
  noContent,
  notFound,
  unauthorized,
} from '../src/lib/http';
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/http.test.ts`
Expected: FAIL — cannot resolve `../src/lib/http`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/http.ts`:

```ts
export const NO_STORE = 'no-store';

export function json(
  body: unknown,
  status: number,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

/** Like `json()` but marks the response uncacheable — every 4xx/5xx goes
 *  through here, so an error is never served from a cache. */
export function errorJson(
  body: unknown,
  status: number,
  headers: Record<string, string> = {},
): Response {
  return json(body, status, { 'Cache-Control': NO_STORE, ...headers });
}

// The responses the shelf handlers return. The name carries the meaning, so
// the status stays a plain number here and nowhere else — a HTTP_NOT_FOUND
// constant would only restate 404 at every call site.
export const unauthorized = () => errorJson({ error: 'unauthorized' }, 401);
export const badRequest = (reason: string) => errorJson({ error: reason }, 400);
export const badGateway = (reason: string) => errorJson({ error: reason }, 502);
export const conflict = (body: object) => errorJson(body, 409);

/** Deliberately fixed bodies: a 404 must not confirm which ids exist, and a
 *  500 must not reflect a Supabase message back to the client. */
export const notFound = () => errorJson({ error: 'not found' }, 404);
export const internalError = () => errorJson({ error: 'internal error' }, 500);

export const noContent = () => new Response(null, { status: 204 });
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/http.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Point `tmdb-proxy.ts` at the shared helpers**

In `src/lib/tmdb-proxy.ts`, delete the local `json` and `errorJson` function
declarations and add at the top:

```ts
import { errorJson, json } from './http';
```

Change nothing else. Call sites keep the same names and signatures.

- [ ] **Step 6: Verify the refactor changed no behaviour**

Run: `npx vitest run test/tmdb-proxy.test.ts`
Expected: PASS, unchanged, with no edits to that test file. If it fails, the
extraction was not behaviour-preserving — fix `http.ts`, do not touch the test.

---

### Task 2: Server-importable TMDB mapping and movie fetch

`src/lib/tmdb.ts` is browser-only (it fetches a root-relative URL), but the
add-film endpoint needs `toFilmRow` on the server. Move the pure parts out,
and give the endpoint one function that fetches a movie from TMDB.

**Files:**
- Create: `src/lib/tmdb-mapping.ts`
- Create: `test/tmdb-mapping.test.ts`
- Modify: `src/lib/tmdb.ts` (keep the browser fetches, re-export the rest)
- Modify: `src/lib/tmdb-proxy.ts` (add `fetchTmdbMovie`, `TmdbUnavailableError`)
- Modify: `test/tmdb-proxy.test.ts` (append tests for the new export only)

**Interfaces:**
- Consumes: Task 1's `errorJson`.
- Produces:
  - From `tmdb-mapping.ts`: the interfaces `TmdbSearchResult`,
    `TmdbSearchResponse`, `TmdbCrewMember`, `TmdbMovie`, `FilmRow`, plus
    `toFilmRow(movie: TmdbMovie): FilmRow` and
    `posterUrl(path: string | null | undefined, size?: string): string | null`.
  - From `tmdb-proxy.ts`:
    `fetchTmdbMovie(id: number, token: string, fetchImpl: typeof globalThis.fetch): Promise<TmdbMovie>`
    and `class TmdbUnavailableError extends Error { readonly status?: number }`.

- [ ] **Step 1: Write the failing test for the moved module**

Create `test/tmdb-mapping.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { posterUrl, toFilmRow, type TmdbMovie } from '../src/lib/tmdb-mapping';

const movieFixture = JSON.parse(
  readFileSync(new URL('./fixtures/tmdb-movie-603.json', import.meta.url), 'utf8'),
) as TmdbMovie;

describe('toFilmRow', () => {
  it('maps a real TMDB movie onto a films row', () => {
    const row = toFilmRow(movieFixture);
    expect(row.id).toBe(movieFixture.id);
    expect(row.title).toBe(movieFixture.title);
    expect(row.year).toBe(Number(movieFixture.release_date!.slice(0, 4)));
    expect(row.director).toBe(
      movieFixture.credits!.crew!.find((c) => c.job === 'Director')!.name,
    );
  });

  it('nulls the year when release_date is missing or malformed', () => {
    expect(toFilmRow({ id: 1, title: 'X' }).year).toBeNull();
    expect(toFilmRow({ id: 1, title: 'X', release_date: '' }).year).toBeNull();
    expect(toFilmRow({ id: 1, title: 'X', release_date: 'soon' }).year).toBeNull();
  });

  it('nulls director when no crew member is credited as Director', () => {
    const row = toFilmRow({ id: 1, title: 'X', credits: { crew: [{ job: 'Writer', name: 'A' }] } });
    expect(row.director).toBeNull();
  });
});

describe('posterUrl', () => {
  it('builds an image.tmdb.org URL at the requested size', () => {
    expect(posterUrl('/abc.jpg')).toBe('https://image.tmdb.org/t/p/w500/abc.jpg');
    expect(posterUrl('/abc.jpg', 'w780')).toBe('https://image.tmdb.org/t/p/w780/abc.jpg');
  });

  it('returns null for a missing path', () => {
    expect(posterUrl(null)).toBeNull();
    expect(posterUrl(undefined)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/tmdb-mapping.test.ts`
Expected: FAIL — cannot resolve `../src/lib/tmdb-mapping`.

- [ ] **Step 3: Create the pure module by moving code**

Create `src/lib/tmdb-mapping.ts` and move into it, **unchanged**, from
`src/lib/tmdb.ts`: `TmdbSearchResult`, `TmdbSearchResponse`, `TmdbCrewMember`,
`TmdbMovie`, `FilmRow`, `IMAGE_BASE`, `toFilmRow`, `posterUrl`. Keep the
existing doc comments, including the one on `toFilmRow` about being the single
place that knows the TMDB → `films` mapping.

Add a module header explaining why the split exists:

```ts
/**
 * The pure TMDB → `films` mapping, with no `fetch` and no imports, so both
 * the browser (`tmdb.ts`) and server code (`shelf-actions.ts`) can use it.
 */
```

- [ ] **Step 4: Reduce `tmdb.ts` to the browser half**

`src/lib/tmdb.ts` keeps only its module doc comment, `getJson`, `searchFilms`,
`getFilm`, and re-exports the moved names so existing importers do not change:

```ts
export * from './tmdb-mapping';
import type { TmdbMovie, TmdbSearchResponse } from './tmdb-mapping';
```

- [ ] **Step 5: Run both suites**

Run: `npx vitest run test/tmdb-mapping.test.ts test/tmdb.test.ts`
Expected: PASS. `test/tmdb.test.ts` must pass **unedited** — it imports from
`tmdb.ts`, and the re-export is what keeps that working.

- [ ] **Step 6: Write the failing test for `fetchTmdbMovie`**

Append to `test/tmdb-proxy.test.ts`:

```ts
import { fetchTmdbMovie, TmdbUnavailableError } from '../src/lib/tmdb-proxy';

describe('fetchTmdbMovie', () => {
  it('requests the movie with credits appended and returns the parsed body', async () => {
    const fetchMock = okJson(movieFixture);
    const movie = await fetchTmdbMovie(603, 'test-token', fetchMock);

    expect(movie.id).toBe(movieFixture.id);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.themoviedb.org/3/movie/603?append_to_response=credits');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-token');
  });

  it('throws TmdbUnavailableError carrying the upstream status on a non-2xx', async () => {
    await expect(fetchTmdbMovie(603, 'test-token', failStatus(404))).rejects.toBeInstanceOf(
      TmdbUnavailableError,
    );
    await expect(fetchTmdbMovie(603, 'test-token', failStatus(500))).rejects.toMatchObject({
      status: 500,
    });
  });

  it('throws TmdbUnavailableError when the transport itself fails', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('ECONNRESET'));
    await expect(fetchTmdbMovie(603, 'test-token', fetchMock)).rejects.toBeInstanceOf(
      TmdbUnavailableError,
    );
  });
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `npx vitest run test/tmdb-proxy.test.ts`
Expected: FAIL — `fetchTmdbMovie` is not exported.

- [ ] **Step 8: Implement `fetchTmdbMovie` on top of the existing URL builder**

In `src/lib/tmdb-proxy.ts`:

```ts
/** A TMDB call that did not produce a usable response. Handlers turn this
 *  into 502 — the failure is upstream, not in the request we were given. */
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
    res = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } });
  } catch (err) {
    throw new TmdbUnavailableError(`tmdb transport failure: ${String(err)}`);
  }
  if (!res.ok) throw new TmdbUnavailableError(`tmdb responded ${res.status}`, res.status);
  return (await res.json()) as TmdbMovie;
}
```

Reuse whatever header shape `handleTmdbRequest` already sends upstream; if it
differs from `Authorization: Bearer`, match it and adjust the test's
assertion to the real shape rather than inventing a second convention.

- [ ] **Step 9: Route `handleTmdbRequest`'s movie op through it**

Refactor the `op === 'movie'` path of `handleTmdbRequest` to call
`fetchTmdbMovie`, so the URL is built in exactly one place. Preserve the
existing external behaviour exactly: the same status codes and the same error
bodies the current tests assert.

- [ ] **Step 10: Verify nothing regressed**

Run: `npx vitest run` then `npm run typecheck`
Expected: PASS. Every pre-existing assertion in `test/tmdb-proxy.test.ts` must
still hold — that is the check that the extraction preserved behaviour.

---

### Task 3: The Supabase data layer

**Files:**
- Create: `src/lib/shelves.ts`
- Create: `test/helpers/fake-supabase.ts`
- Create: `test/shelves.test.ts`
- Modify: `src/pages/index.astro` (query moves into `listOwnShelves`)

**Interfaces:**
- Consumes: Task 2's `FilmRow`.
- Produces:

```ts
type Db = Pick<SupabaseClient, 'from' | 'rpc'>;

export interface ShelfRef { id: string; slug: string }
export interface SpineColour { spine_color: string; spine_dark: boolean }
export interface FilmRecord extends FilmRow, SpineColour { fetched_at: string }
export interface ShelfSummary {
  id: string; name: string; slug: string;
  accent_color: string | null; is_public: boolean;
}

export function findOwnShelf(sb: Db, shelfId: string, owner: string): Promise<ShelfRef | null>;
export function shelfItemCount(sb: Db, shelfId: string): Promise<number>;
export function shelfHasFilm(sb: Db, shelfId: string, filmId: number): Promise<boolean>;
export function ensureFilmCached(
  sb: Db, row: FilmRow, spine: SpineColour,
): Promise<{ film: FilmRecord; created: boolean }>;
export function placeFilm(sb: Db, shelfId: string, filmId: number): Promise<number>;
export function removeFilm(sb: Db, shelfId: string, filmId: number): Promise<void>;
export function reorderShelf(sb: Db, shelfId: string, order: number[]): Promise<void>;
export function listOwnShelves(sb: Db, owner: string): Promise<ShelfSummary[]>;
```

Every function takes the client as its first argument and never constructs
one — the middleware owns its lifetime. Every function throws on a Supabase
error; handlers turn a throw into `500`.

- [ ] **Step 1: Write the Supabase test double**

Create `test/helpers/fake-supabase.ts`:

```ts
import { vi } from 'vitest';

export interface FakeResult {
  data?: unknown;
  error?: { message: string } | null;
  count?: number;
}

export type RecordedOp = [string, ...unknown[]];

/**
 * A chainable stand-in for the PostgREST query builder. It records the
 * operations called on it and resolves to a canned result, which is what lets
 * the tests assert on filters (`.eq('owner', …)`) rather than only on outputs.
 */
class FakeBuilder implements PromiseLike<FakeResult> {
  readonly ops: RecordedOp[] = [];
  constructor(private readonly result: FakeResult) {}

  private push(op: string, ...args: unknown[]): this {
    this.ops.push([op, ...args]);
    return this;
  }

  select = (...a: unknown[]) => this.push('select', ...a);
  insert = (...a: unknown[]) => this.push('insert', ...a);
  upsert = (...a: unknown[]) => this.push('upsert', ...a);
  delete = (...a: unknown[]) => this.push('delete', ...a);
  eq = (...a: unknown[]) => this.push('eq', ...a);
  order = (...a: unknown[]) => this.push('order', ...a);
  maybeSingle = () => this.push('maybeSingle');
  single = () => this.push('single');

  then<R1 = FakeResult, R2 = never>(
    onOk?: ((v: FakeResult) => R1 | PromiseLike<R1>) | null,
    onErr?: ((r: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return Promise.resolve(this.result).then(onOk, onErr);
  }
}

export function fakeSupabase(
  tables: Record<string, FakeResult | FakeResult[]>,
  rpcResults: Record<string, FakeResult> = {},
) {
  const builders: { table: string; builder: FakeBuilder }[] = [];
  const queues = new Map<string, FakeResult[]>(
    Object.entries(tables).map(([t, r]) => [t, Array.isArray(r) ? [...r] : [r]]),
  );

  const rpc = vi.fn(async (name: string) => rpcResults[name] ?? { data: null, error: null });

  const from = vi.fn((table: string) => {
    const queue = queues.get(table) ?? [];
    // A one-result table answers every call; a list is consumed in order, so a
    // test can make the same table behave differently on a second query.
    const result = queue.length > 1 ? queue.shift()! : (queue[0] ?? { data: null, error: null });
    const builder = new FakeBuilder(result);
    builders.push({ table, builder });
    return builder;
  });

  return {
    client: { from, rpc } as never,
    from,
    rpc,
    /** Ops recorded for the nth query against a table, in call order. */
    opsFor(table: string, nth = 0): RecordedOp[] {
      return builders.filter((b) => b.table === table)[nth]?.builder.ops ?? [];
    },
    tableCalls(table: string): number {
      return builders.filter((b) => b.table === table).length;
    },
  };
}
```

- [ ] **Step 2: Write the failing tests for the data layer**

Create `test/shelves.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { fakeSupabase } from './helpers/fake-supabase';
import {
  ensureFilmCached,
  findOwnShelf,
  listOwnShelves,
  placeFilm,
  removeFilm,
  reorderShelf,
  shelfHasFilm,
  shelfItemCount,
} from '../src/lib/shelves';

const SHELF = '11111111-2222-3333-4444-555555555555';
const OWNER = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const FILM_ROW = {
  id: 603,
  title: 'The Matrix',
  original_title: 'The Matrix',
  year: 1999,
  poster_path: '/abc.jpg',
  overview: 'Neo',
  director: 'Lana Wachowski',
};
const SPINE = { spine_color: 'hsl(210 42% 40%)', spine_dark: true };

describe('findOwnShelf', () => {
  it('scopes the lookup by id and owner', async () => {
    const sb = fakeSupabase({ shelves: { data: { id: SHELF, slug: 'abc' }, error: null } });
    const shelf = await findOwnShelf(sb.client, SHELF, OWNER);

    expect(shelf).toEqual({ id: SHELF, slug: 'abc' });
    expect(sb.opsFor('shelves')).toEqual(
      expect.arrayContaining([
        ['eq', 'id', SHELF],
        ['eq', 'owner', OWNER],
      ]),
    );
  });

  it('returns null when the shelf is absent or owned by someone else', async () => {
    const sb = fakeSupabase({ shelves: { data: null, error: null } });
    expect(await findOwnShelf(sb.client, SHELF, OWNER)).toBeNull();
  });

  it('throws when Supabase reports an error', async () => {
    const sb = fakeSupabase({ shelves: { data: null, error: { message: 'boom' } } });
    await expect(findOwnShelf(sb.client, SHELF, OWNER)).rejects.toThrow(/boom/);
  });
});

describe('shelfItemCount', () => {
  it('asks for an exact head count scoped to the shelf', async () => {
    const sb = fakeSupabase({ shelf_items: { data: null, error: null, count: 7 } });
    expect(await shelfItemCount(sb.client, SHELF)).toBe(7);
    expect(sb.opsFor('shelf_items')).toEqual(
      expect.arrayContaining([['eq', 'shelf_id', SHELF]]),
    );
    const [, options] = sb.opsFor('shelf_items').find(([op]) => op === 'select')!;
    expect(options).toMatchObject({ count: 'exact', head: true });
  });

  it('reports 0 when the count comes back null', async () => {
    const sb = fakeSupabase({ shelf_items: { data: null, error: null } });
    expect(await shelfItemCount(sb.client, SHELF)).toBe(0);
  });
});

describe('shelfHasFilm', () => {
  it('is true when the composite row exists', async () => {
    const sb = fakeSupabase({ shelf_items: { data: { film_id: 603 }, error: null } });
    expect(await shelfHasFilm(sb.client, SHELF, 603)).toBe(true);
    expect(sb.opsFor('shelf_items')).toEqual(
      expect.arrayContaining([
        ['eq', 'shelf_id', SHELF],
        ['eq', 'film_id', 603],
      ]),
    );
  });

  it('is false when it does not', async () => {
    const sb = fakeSupabase({ shelf_items: { data: null, error: null } });
    expect(await shelfHasFilm(sb.client, SHELF, 603)).toBe(false);
  });
});

describe('ensureFilmCached', () => {
  it('inserts the row with the spine colour and reports it as created', async () => {
    const inserted = { ...FILM_ROW, ...SPINE, fetched_at: '2026-09-03T00:00:00Z' };
    const sb = fakeSupabase({ films: { data: [inserted], error: null } });

    const { film, created } = await ensureFilmCached(sb.client, FILM_ROW, SPINE);

    expect(created).toBe(true);
    expect(film).toEqual(inserted);
    const [, payload, options] = sb.opsFor('films').find(([op]) => op === 'upsert')!;
    expect(payload).toMatchObject({ id: 603, ...SPINE });
    expect(options).toMatchObject({ ignoreDuplicates: true });
    expect(sb.tableCalls('films')).toBe(1);
  });

  it('falls back to a select and reports created=false when the film was already cached', async () => {
    const existing = { ...FILM_ROW, spine_color: 'hsl(0 0% 10%)', spine_dark: true, fetched_at: 'x' };
    const sb = fakeSupabase({ films: [{ data: [], error: null }, { data: existing, error: null }] });

    const { film, created } = await ensureFilmCached(sb.client, FILM_ROW, SPINE);

    expect(created).toBe(false);
    // The colour stored first wins; CLAUDE.md forbids recomputing it.
    expect(film.spine_color).toBe('hsl(0 0% 10%)');
    expect(sb.tableCalls('films')).toBe(2);
  });
});

describe('placeFilm', () => {
  it('calls the place_film RPC with the argument names the migration declares', async () => {
    const sb = fakeSupabase({}, { place_film: { data: 4, error: null } });
    expect(await placeFilm(sb.client, SHELF, 603)).toBe(4);
    expect(sb.rpc).toHaveBeenCalledWith('place_film', { p_shelf: SHELF, p_film: 603 });
  });
});

describe('reorderShelf', () => {
  it('calls the reorder_shelf RPC with the whole ordering', async () => {
    const sb = fakeSupabase({}, { reorder_shelf: { data: null, error: null } });
    await reorderShelf(sb.client, SHELF, [3, 1, 2]);
    expect(sb.rpc).toHaveBeenCalledWith('reorder_shelf', { p_shelf: SHELF, p_order: [3, 1, 2] });
  });
});

describe('removeFilm', () => {
  it('deletes the one composite row', async () => {
    const sb = fakeSupabase({ shelf_items: { data: null, error: null } });
    await removeFilm(sb.client, SHELF, 603);
    expect(sb.opsFor('shelf_items')).toEqual(
      expect.arrayContaining([
        ['delete'],
        ['eq', 'shelf_id', SHELF],
        ['eq', 'film_id', 603],
      ]),
    );
  });
});

describe('listOwnShelves', () => {
  it('filters by owner, because the SELECT policy also exposes public shelves', async () => {
    const sb = fakeSupabase({ shelves: { data: [], error: null } });
    await listOwnShelves(sb.client, OWNER);
    expect(sb.opsFor('shelves')).toEqual(
      expect.arrayContaining([['eq', 'owner', OWNER]]),
    );
  });

  it('orders oldest first and returns an array when data is null', async () => {
    const sb = fakeSupabase({ shelves: { data: null, error: null } });
    expect(await listOwnShelves(sb.client, OWNER)).toEqual([]);
    expect(sb.opsFor('shelves')).toEqual(
      expect.arrayContaining([['order', 'created_at', { ascending: true }]]),
    );
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run test/shelves.test.ts`
Expected: FAIL — cannot resolve `../src/lib/shelves`.

- [ ] **Step 4: Implement the data layer**

Create `src/lib/shelves.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FilmRow } from './tmdb-mapping';

type Db = Pick<SupabaseClient, 'from' | 'rpc'>;

export interface ShelfRef {
  id: string;
  slug: string;
}

/** The two spine fields, together, because they are written together and
 *  exactly once — on the film's first insert. Names match the columns, so the
 *  object goes straight into the insert. */
export interface SpineColour {
  spine_color: string;
  spine_dark: boolean;
}

export interface FilmRecord extends FilmRow, SpineColour {
  fetched_at: string;
}

export interface ShelfSummary {
  id: string;
  name: string;
  slug: string;
  accent_color: string | null;
  is_public: boolean;
}

const SHELF_SUMMARY_COLUMNS = 'id, name, slug, accent_color, is_public';

function fail(operation: string, error: { message: string }): never {
  throw new Error(`[shelves] ${operation} failed: ${error.message}`);
}

/** The shelf if it exists and belongs to `owner`, else null. Callers turn null
 *  into 404: a shelf that is not yours is a shelf that is not there. */
export async function findOwnShelf(
  sb: Db,
  shelfId: string,
  owner: string,
): Promise<ShelfRef | null> {
  const { data, error } = await sb
    .from('shelves')
    .select('id, slug')
    .eq('id', shelfId)
    .eq('owner', owner)
    .maybeSingle();
  if (error) fail('findOwnShelf', error);
  return (data as ShelfRef | null) ?? null;
}

export async function shelfItemCount(sb: Db, shelfId: string): Promise<number> {
  const { count, error } = await sb
    .from('shelf_items')
    .select('film_id', { count: 'exact', head: true })
    .eq('shelf_id', shelfId);
  if (error) fail('shelfItemCount', error);
  return count ?? 0;
}

export async function shelfHasFilm(sb: Db, shelfId: string, filmId: number): Promise<boolean> {
  const { data, error } = await sb
    .from('shelf_items')
    .select('film_id')
    .eq('shelf_id', shelfId)
    .eq('film_id', filmId)
    .maybeSingle();
  if (error) fail('shelfHasFilm', error);
  return data !== null;
}

/**
 * Insert the film into the global cache if absent and return the stored row.
 * `ignoreDuplicates` makes two tabs adding the same film race harmlessly: the
 * first-written spine colour wins, and per CLAUDE.md it is never recomputed.
 * An empty insert result means someone else already cached it, so the row is
 * read back rather than overwritten.
 */
export async function ensureFilmCached(
  sb: Db,
  row: FilmRow,
  spine: SpineColour,
): Promise<{ film: FilmRecord; created: boolean }> {
  const { data: insertedRows, error: insertError } = await sb
    .from('films')
    .upsert({ ...row, ...spine }, { ignoreDuplicates: true })
    .select();
  if (insertError) fail('ensureFilmCached insert', insertError);

  const inserted = (insertedRows as FilmRecord[] | null) ?? [];
  if (inserted.length > 0) return { film: inserted[0], created: true };

  const { data: existing, error: selectError } = await sb
    .from('films')
    .select('*')
    .eq('id', row.id)
    .single();
  if (selectError) fail('ensureFilmCached select', selectError);
  return { film: existing as FilmRecord, created: false };
}

/** Appends the film at the end of the shelf's order and returns its position.
 *  The server assigns it: a client-side max() lets two tabs collide. */
export async function placeFilm(sb: Db, shelfId: string, filmId: number): Promise<number> {
  const { data, error } = await sb.rpc('place_film', { p_shelf: shelfId, p_film: filmId });
  if (error) fail('placeFilm', error);
  return data as number;
}

export async function removeFilm(sb: Db, shelfId: string, filmId: number): Promise<void> {
  const { error } = await sb
    .from('shelf_items')
    .delete()
    .eq('shelf_id', shelfId)
    .eq('film_id', filmId);
  if (error) fail('removeFilm', error);
}

export async function reorderShelf(sb: Db, shelfId: string, order: number[]): Promise<void> {
  const { error } = await sb.rpc('reorder_shelf', { p_shelf: shelfId, p_order: order });
  if (error) fail('reorderShelf', error);
}

/**
 * `.eq('owner', …)` is REQUIRED: the shelves SELECT policy also exposes other
 * users' public shelves (for /e/[slug]), so RLS alone would not scope this
 * list to the signed-in user.
 */
export async function listOwnShelves(sb: Db, owner: string): Promise<ShelfSummary[]> {
  const { data, error } = await sb
    .from('shelves')
    .select(SHELF_SUMMARY_COLUMNS)
    .eq('owner', owner)
    .order('created_at', { ascending: true });
  if (error) fail('listOwnShelves', error);
  return (data as ShelfSummary[] | null) ?? [];
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run test/shelves.test.ts`
Expected: PASS (14 tests).

- [ ] **Step 6: Refactor `index.astro` to read through the data layer**

Replace the inline query in `src/pages/index.astro`'s frontmatter. The
`.eq('owner')` comment moves to `listOwnShelves`, so it does not stay
duplicated here:

```astro
---
import { LOGIN_PATH, SIGNOUT_PATH } from '../constants';
import { listOwnShelves, type ShelfSummary } from '../lib/shelves';

export const prerender = false;

const { user, supabase } = Astro.locals;
if (!user) return Astro.redirect(LOGIN_PATH);

let shelves: ShelfSummary[] = [];
let loadError: string | null = null;
try {
  shelves = await listOwnShelves(supabase, user.sub as string);
} catch (err) {
  loadError = err instanceof Error ? err.message : String(err);
  console.error('[index] shelves query failed', err);
}
---
```

In the markup, replace the `{error && …}` block with `loadError` and
`{(shelves ?? []).map(…)}` with `{shelves.map(…)}`. The rendered output must
be unchanged — same list, same "(private)" marker, same sign-out form.

- [ ] **Step 7: Verify the page still typechecks and the suite is green**

Run: `npm run typecheck && npx vitest run`
Expected: PASS. `listOwnShelves` now throws instead of returning `{ error }`,
which is why the page needs the `try/catch` — without it a failed query would
500 the whole page instead of rendering the alert it renders today.

---

### Task 4: Shared guard, validation, and the remove endpoint

The simplest of the three operations, done first because it establishes the
preamble the other two reuse: signed in, valid UUID, shelf is yours.

**Files:**
- Create: `src/lib/shelf-actions.ts`
- Create: `src/pages/api/shelves/[id]/films/[filmId].ts`
- Create: `test/shelf-actions.test.ts`
- Modify: `src/constants/index.ts`

**Interfaces:**
- Consumes: Task 1's `errorJson`; Task 3's `findOwnShelf`, `removeFilm`.
- Produces:

```ts
export interface RemoveFilmContext {
  supabase: SupabaseClient;
  owner: string | undefined;
  shelfId: string | undefined;
  filmId: unknown;
}
export function handleRemoveFilm(ctx: RemoveFilmContext): Promise<Response>;
```

and, from `src/constants/index.ts`:

```ts
export const SHELF_CAPACITY = 20;
export const SHELF_FULL_MESSAGE: string;
```

No `HTTP_*` status constants — see Task 1. The two values here earn their
names: one is a limit, the other is user-facing copy.

- [ ] **Step 1: Add the constants**

Append to `src/constants/index.ts`:

```ts
// A shelf holds at most this many films. Enforced by POST /api/shelves/[id]/films,
// not by the database: raising the cap must stay a one-constant change.
export const SHELF_CAPACITY = 20;

// The first user-facing string in the codebase. The interface is in Castilian
// Spanish for v1; code and comments stay in English.
export const SHELF_FULL_MESSAGE =
  'Tienes la estantería llena, crea otra para seguir añadiendo películas';
```

- [ ] **Step 2: Write the failing tests**

Create `test/shelf-actions.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeSupabase } from './helpers/fake-supabase';
import { handleRemoveFilm } from '../src/lib/shelf-actions';

const SHELF = '11111111-2222-3333-4444-555555555555';
const OWNER = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

/** A fake whose shelves lookup succeeds, i.e. the shelf is the caller's. */
function ownedShelf(extra: Record<string, unknown> = {}) {
  return fakeSupabase({
    shelves: { data: { id: SHELF, slug: 'abc' }, error: null },
    shelf_items: { data: null, error: null },
    ...extra,
  });
}

describe('handleRemoveFilm — guard', () => {
  it('401 when there is no session, without touching the database', async () => {
    const sb = ownedShelf();
    const res = await handleRemoveFilm({
      supabase: sb.client,
      owner: undefined,
      shelfId: SHELF,
      filmId: '603',
    });
    expect(res.status).toBe(401);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(sb.from).not.toHaveBeenCalled();
  });

  it('400 when the shelf id is not a UUID', async () => {
    const sb = ownedShelf();
    const res = await handleRemoveFilm({
      supabase: sb.client,
      owner: OWNER,
      shelfId: 'not-a-uuid',
      filmId: '603',
    });
    expect(res.status).toBe(400);
    expect(sb.from).not.toHaveBeenCalled();
  });

  it('404 when the shelf is absent or belongs to someone else', async () => {
    const sb = fakeSupabase({ shelves: { data: null, error: null } });
    const res = await handleRemoveFilm({
      supabase: sb.client,
      owner: OWNER,
      shelfId: SHELF,
      filmId: '603',
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not found' });
  });

  it('does not distinguish "not yours" from "does not exist"', async () => {
    // Both cases reach findOwnShelf as a null row, so the body and status must
    // be identical — the API must not confirm which shelf ids exist.
    const sb = fakeSupabase({ shelves: { data: null, error: null } });
    const res = await handleRemoveFilm({
      supabase: sb.client,
      owner: OWNER,
      shelfId: SHELF,
      filmId: '603',
    });
    expect(res.status).toBe(404);
    expect(res.status).not.toBe(403);
  });

  it('500 when the shelf lookup itself fails', async () => {
    const sb = fakeSupabase({ shelves: { data: null, error: { message: 'boom' } } });
    const res = await handleRemoveFilm({
      supabase: sb.client,
      owner: OWNER,
      shelfId: SHELF,
      filmId: '603',
    });
    expect(res.status).toBe(500);
    // The Supabase message is logged, never reflected to the client.
    expect(JSON.stringify(await res.json())).not.toContain('boom');
    expect(console.error).toHaveBeenCalled();
  });
});

describe('handleRemoveFilm — film id validation', () => {
  it.each([['abc'], [''], ['0'], ['-3'], ['1.5'], [undefined]])(
    'rejects %s with 400',
    async (filmId) => {
      const sb = ownedShelf();
      const res = await handleRemoveFilm({
        supabase: sb.client,
        owner: OWNER,
        shelfId: SHELF,
        filmId,
      });
      expect(res.status).toBe(400);
    },
  );
});

describe('handleRemoveFilm — happy path', () => {
  it('deletes the row and answers 204 with no body', async () => {
    const sb = ownedShelf();
    const res = await handleRemoveFilm({
      supabase: sb.client,
      owner: OWNER,
      shelfId: SHELF,
      filmId: '603',
    });
    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
    expect(sb.opsFor('shelf_items')).toEqual(
      expect.arrayContaining([
        ['delete'],
        ['eq', 'shelf_id', SHELF],
        ['eq', 'film_id', 603],
      ]),
    );
  });

  it('is idempotent: removing a film that is not there still answers 204', async () => {
    // The DELETE matches no rows; PostgREST reports no error, and a caller
    // retrying after a dropped response must not see a failure.
    const sb = ownedShelf();
    const res = await handleRemoveFilm({
      supabase: sb.client,
      owner: OWNER,
      shelfId: SHELF,
      filmId: '999999',
    });
    expect(res.status).toBe(204);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run test/shelf-actions.test.ts`
Expected: FAIL — cannot resolve `../src/lib/shelf-actions`.

- [ ] **Step 4: Implement the guard and the remove handler**

Create `src/lib/shelf-actions.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { badRequest, internalError, noContent, notFound, unauthorized } from './http';
import { findOwnShelf, removeFilm } from './shelves';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface RemoveFilmContext {
  supabase: SupabaseClient;
  owner: string | undefined;
  shelfId: string | undefined;
  filmId: unknown;
}

/** A rejection to return as-is, or the shelf the caller may act on. RLS is the
 *  backstop, but `reorder_shelf` and the DELETE silently affect zero rows for a
 *  stranger, so only this check can produce an honest status code. */
async function requireOwnShelf(
  supabase: SupabaseClient,
  owner: string | undefined,
  shelfId: string | undefined,
): Promise<Response | { id: string }> {
  if (!owner) return unauthorized();
  if (!shelfId || !UUID_PATTERN.test(shelfId)) return badRequest('invalid shelf id');

  let shelf: Awaited<ReturnType<typeof findOwnShelf>>;
  try {
    shelf = await findOwnShelf(supabase, shelfId, owner);
  } catch (err) {
    console.error('[api/shelves] shelf lookup failed', err);
    return internalError();
  }
  // Absent and not-yours are the same answer, so the API never confirms which
  // shelf ids exist.
  if (!shelf) return notFound();
  return { id: shelf.id };
}

function parseFilmId(raw: unknown): number | null {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : null;
}

export async function handleRemoveFilm(ctx: RemoveFilmContext): Promise<Response> {
  const guard = await requireOwnShelf(ctx.supabase, ctx.owner, ctx.shelfId);
  if (guard instanceof Response) return guard;

  const filmId = parseFilmId(ctx.filmId);
  if (filmId === null) return badRequest('invalid film id');

  try {
    await removeFilm(ctx.supabase, guard.id, filmId);
  } catch (err) {
    console.error('[api/shelves] remove failed', err);
    return internalError();
  }
  return noContent();
}
```

Note `Number('')` is `0`, so the empty string fails the `> 0` check — that is
why the test asserts `''` is a `400`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run test/shelf-actions.test.ts`
Expected: PASS (13 tests).

- [ ] **Step 6: Add the route**

Create `src/pages/api/shelves/[id]/films/[filmId].ts`:

```ts
import type { APIRoute } from 'astro';
import { handleRemoveFilm } from '../../../../../lib/shelf-actions';

export const prerender = false;

// Only DELETE is exported, so Astro answers any other method with its own 405.
export const DELETE: APIRoute = ({ locals, params }) =>
  handleRemoveFilm({
    supabase: locals.supabase,
    owner: locals.user?.sub as string | undefined,
    shelfId: params.id,
    filmId: params.filmId,
  });
```

- [ ] **Step 7: Verify the route compiles**

Run: `npm run typecheck && npx vitest run`
Expected: PASS. Fix the relative import depth if the typecheck complains — the
route sits five levels below `src/`.

---

### Task 5: The reorder endpoint

**Files:**
- Create: `src/pages/api/shelves/[id]/order.ts`
- Modify: `src/lib/shelf-actions.ts`
- Modify: `test/shelf-actions.test.ts`

**Interfaces:**
- Consumes: Task 4's `requireOwnShelf` (module-private), Task 3's `reorderShelf`.
- Produces:

```ts
export interface ReorderContext {
  supabase: SupabaseClient;
  owner: string | undefined;
  shelfId: string | undefined;
  body: unknown;
}
export function handleReorderShelf(ctx: ReorderContext): Promise<Response>;
export function readJson(request: Request): Promise<unknown>;  // null on malformed JSON
```

- [ ] **Step 1: Write the failing tests**

Append to `test/shelf-actions.test.ts` (reusing `SHELF`, `OWNER` and
`ownedShelf` from Task 4):

```ts
import { handleReorderShelf } from '../src/lib/shelf-actions';

describe('handleReorderShelf — guard', () => {
  it('401 without a session and 400 for a bad UUID', async () => {
    const sb = ownedShelf();
    expect(
      (await handleReorderShelf({ supabase: sb.client, owner: undefined, shelfId: SHELF, body: { order: [1] } })).status,
    ).toBe(401);
    expect(
      (await handleReorderShelf({ supabase: sb.client, owner: OWNER, shelfId: 'nope', body: { order: [1] } })).status,
    ).toBe(400);
  });

  it('404 when the shelf is not the caller\'s', async () => {
    const sb = fakeSupabase({ shelves: { data: null, error: null } });
    const res = await handleReorderShelf({
      supabase: sb.client, owner: OWNER, shelfId: SHELF, body: { order: [1] },
    });
    expect(res.status).toBe(404);
  });
});

describe('handleReorderShelf — order validation', () => {
  it.each([
    ['a missing body', null],
    ['a non-object body', 'order'],
    ['a missing order key', {}],
    ['a non-array order', { order: 3 }],
    ['an empty order', { order: [] }],
    ['non-integer members', { order: [1, 2.5] }],
    ['non-numeric members', { order: [1, 'two'] }],
    ['zero or negative ids', { order: [1, 0] }],
    ['duplicate ids', { order: [1, 2, 1] }],
  ])('rejects %s with 400 and does not call the RPC', async (_label, body) => {
    const sb = ownedShelf();
    const res = await handleReorderShelf({
      supabase: sb.client, owner: OWNER, shelfId: SHELF, body,
    });
    expect(res.status).toBe(400);
    expect(sb.rpc).not.toHaveBeenCalled();
  });
});

describe('handleReorderShelf — happy path', () => {
  it('passes the whole ordering to reorder_shelf and answers 204', async () => {
    const sb = ownedShelf();
    const res = await handleReorderShelf({
      supabase: sb.client, owner: OWNER, shelfId: SHELF, body: { order: [7, 3, 9] },
    });
    expect(res.status).toBe(204);
    expect(sb.rpc).toHaveBeenCalledWith('reorder_shelf', { p_shelf: SHELF, p_order: [7, 3, 9] });
  });

  it('accepts ids that are not on the shelf', async () => {
    // reorder_shelf simply does not match them; that is not an error.
    const sb = ownedShelf();
    const res = await handleReorderShelf({
      supabase: sb.client, owner: OWNER, shelfId: SHELF, body: { order: [424242] },
    });
    expect(res.status).toBe(204);
  });

  it('500 when the RPC fails', async () => {
    const sb = fakeSupabase(
      { shelves: { data: { id: SHELF, slug: 'abc' }, error: null } },
      { reorder_shelf: { data: null, error: { message: 'boom' } } },
    );
    const res = await handleReorderShelf({
      supabase: sb.client, owner: OWNER, shelfId: SHELF, body: { order: [1] },
    });
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('boom');
  });
});

describe('readJson', () => {
  it('parses a JSON body and returns null for malformed input', async () => {
    const { readJson } = await import('../src/lib/shelf-actions');
    expect(await readJson(new Request('http://x/', { method: 'PUT', body: '{"a":1}' }))).toEqual({ a: 1 });
    expect(await readJson(new Request('http://x/', { method: 'PUT', body: 'not json' }))).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run test/shelf-actions.test.ts`
Expected: FAIL — `handleReorderShelf` is not exported.

- [ ] **Step 3: Implement the handler**

Add to `src/lib/shelf-actions.ts`:

```ts
import { reorderShelf } from './shelves';

export interface ReorderContext {
  supabase: SupabaseClient;
  owner: string | undefined;
  shelfId: string | undefined;
  body: unknown;
}

/** The parsed JSON body, or null when it is absent or malformed — which the
 *  handlers turn into 400 rather than letting the route throw. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function parseOrder(body: unknown): number[] | null {
  if (typeof body !== 'object' || body === null) return null;
  const order = (body as { order?: unknown }).order;
  if (!Array.isArray(order) || order.length === 0) return null;
  if (!order.every((id) => typeof id === 'number' && Number.isInteger(id) && id > 0)) return null;
  if (new Set(order).size !== order.length) return null;
  return order as number[];
}

export async function handleReorderShelf(ctx: ReorderContext): Promise<Response> {
  const guard = await requireOwnShelf(ctx.supabase, ctx.owner, ctx.shelfId);
  if (guard instanceof Response) return guard;

  const order = parseOrder(ctx.body);
  if (order === null) return badRequest('invalid order');

  try {
    await reorderShelf(ctx.supabase, guard.id, order);
  } catch (err) {
    console.error('[api/shelves] reorder failed', err);
    return internalError();
  }
  return noContent();
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run test/shelf-actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the route**

Create `src/pages/api/shelves/[id]/order.ts`:

```ts
import type { APIRoute } from 'astro';
import { handleReorderShelf, readJson } from '../../../../lib/shelf-actions';

export const prerender = false;

export const PUT: APIRoute = async ({ locals, params, request }) =>
  handleReorderShelf({
    supabase: locals.supabase,
    owner: locals.user?.sub as string | undefined,
    shelfId: params.id,
    body: await readJson(request),
  });
```

- [ ] **Step 6: Verify**

Run: `npm run typecheck && npx vitest run`
Expected: PASS.

---

### Task 6: The add-film endpoint

The one that talks to TMDB, fills the cache and enforces the cap.

**Files:**
- Create: `src/pages/api/shelves/[id]/films/index.ts`
- Modify: `src/lib/shelf-actions.ts`
- Modify: `test/shelf-actions.test.ts`

**Interfaces:**
- Consumes: Task 2's `fetchTmdbMovie`, `TmdbUnavailableError`, `toFilmRow`;
  Task 3's `ensureFilmCached`, `placeFilm`, `shelfHasFilm`, `shelfItemCount`;
  Task 4's `requireOwnShelf`, `parseFilmId`, `SHELF_CAPACITY`,
  `SHELF_FULL_MESSAGE`.
- Produces:

```ts
export interface AddFilmContext {
  supabase: SupabaseClient;
  owner: string | undefined;
  shelfId: string | undefined;
  body: unknown;
  token: string | undefined;
  fetch: typeof globalThis.fetch;
}
export function handleAddFilm(ctx: AddFilmContext): Promise<Response>;
```

- [ ] **Step 1: Write the failing tests**

Append to `test/shelf-actions.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { handleAddFilm } from '../src/lib/shelf-actions';
import { SHELF_CAPACITY, SHELF_FULL_MESSAGE } from '../src/constants';

const movieFixture = JSON.parse(
  readFileSync(new URL('./fixtures/tmdb-movie-603.json', import.meta.url), 'utf8'),
);
const VALID_BODY = { tmdbId: 603, spineColor: 'hsl(210 42% 40%)', spineDark: true };

function tmdbOk() {
  return vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => movieFixture });
}

/** A fake where the shelf is the caller's, holds `count` films, does not have
 *  the film yet, and whose film insert reports a fresh cache row. */
function addFilmFake({ count = 0, hasFilm = false, cached = false } = {}) {
  const filmRow = { ...movieFixture, spine_color: VALID_BODY.spineColor, spine_dark: true, fetched_at: 'x' };
  return fakeSupabase(
    {
      shelves: { data: { id: SHELF, slug: 'abc' }, error: null },
      shelf_items: [
        { data: null, error: null, count },            // shelfItemCount
        { data: hasFilm ? { film_id: 603 } : null, error: null }, // shelfHasFilm
      ],
      films: cached
        ? [{ data: [], error: null }, { data: filmRow, error: null }]
        : { data: [filmRow], error: null },
    },
    { place_film: { data: 5, error: null } },
  );
}

describe('handleAddFilm — guard and validation', () => {
  it('401 without a session, 400 for a bad UUID, 404 when not the caller\'s', async () => {
    const sb = addFilmFake();
    expect((await handleAddFilm({ supabase: sb.client, owner: undefined, shelfId: SHELF, body: VALID_BODY, token: 't', fetch: tmdbOk() })).status).toBe(401);
    expect((await handleAddFilm({ supabase: sb.client, owner: OWNER, shelfId: 'nope', body: VALID_BODY, token: 't', fetch: tmdbOk() })).status).toBe(400);

    const missing = fakeSupabase({ shelves: { data: null, error: null } });
    expect((await handleAddFilm({ supabase: missing.client, owner: OWNER, shelfId: SHELF, body: VALID_BODY, token: 't', fetch: tmdbOk() })).status).toBe(404);
  });

  it.each([
    ['a missing body', null],
    ['a missing tmdbId', { spineColor: 'hsl(210 42% 40%)', spineDark: true }],
    ['a non-integer tmdbId', { ...VALID_BODY, tmdbId: 1.5 }],
    ['a zero tmdbId', { ...VALID_BODY, tmdbId: 0 }],
    ['a missing spineColor', { tmdbId: 603, spineDark: true }],
    ['a comma-separated hsl', { ...VALID_BODY, spineColor: 'hsl(210, 42%, 40%)' }],
    ['a hex colour', { ...VALID_BODY, spineColor: '#3366aa' }],
    ['an out-of-range hue', { ...VALID_BODY, spineColor: 'hsl(400 42% 40%)' }],
    ['an out-of-range lightness', { ...VALID_BODY, spineColor: 'hsl(210 42% 140%)' }],
    ['a non-boolean spineDark', { ...VALID_BODY, spineDark: 'yes' }],
  ])('rejects %s with 400 and never calls TMDB', async (_label, body) => {
    const sb = addFilmFake();
    const fetchMock = tmdbOk();
    const res = await handleAddFilm({
      supabase: sb.client, owner: OWNER, shelfId: SHELF, body, token: 't', fetch: fetchMock,
    });
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('500 when the TMDB token is missing', async () => {
    const sb = addFilmFake();
    const res = await handleAddFilm({
      supabase: sb.client, owner: OWNER, shelfId: SHELF, body: VALID_BODY, token: undefined, fetch: tmdbOk(),
    });
    expect(res.status).toBe(500);
    expect(console.error).toHaveBeenCalled();
  });
});

describe('handleAddFilm — the capacity cap', () => {
  it(`409 with the Spanish message once the shelf holds ${SHELF_CAPACITY} films`, async () => {
    const sb = addFilmFake({ count: SHELF_CAPACITY });
    const fetchMock = tmdbOk();
    const res = await handleAddFilm({
      supabase: sb.client, owner: OWNER, shelfId: SHELF, body: VALID_BODY, token: 't', fetch: fetchMock,
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'shelf_full', message: SHELF_FULL_MESSAGE });
    // Rejected before spending a TMDB call.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not 409 when the shelf is full but already holds that film', async () => {
    // place_film is idempotent, so re-adding a film you already have can never
    // exceed the cap.
    const sb = addFilmFake({ count: SHELF_CAPACITY, hasFilm: true, cached: true });
    const res = await handleAddFilm({
      supabase: sb.client, owner: OWNER, shelfId: SHELF, body: VALID_BODY, token: 't', fetch: tmdbOk(),
    });
    expect(res.status).toBe(200);
  });

  it(`allows the ${SHELF_CAPACITY}th film`, async () => {
    const sb = addFilmFake({ count: SHELF_CAPACITY - 1 });
    const res = await handleAddFilm({
      supabase: sb.client, owner: OWNER, shelfId: SHELF, body: VALID_BODY, token: 't', fetch: tmdbOk(),
    });
    expect([200, 201]).toContain(res.status);
  });
});

describe('handleAddFilm — happy path', () => {
  it('201 with the position and the cached row when the film is new to the cache', async () => {
    const sb = addFilmFake();
    const res = await handleAddFilm({
      supabase: sb.client, owner: OWNER, shelfId: SHELF, body: VALID_BODY, token: 't', fetch: tmdbOk(),
    });
    expect(res.status).toBe(201);
    const payload = await res.json();
    expect(payload.position).toBe(5);
    expect(payload.film.id).toBe(603);
    expect(payload.film.spine_color).toBe(VALID_BODY.spineColor);
    expect(sb.rpc).toHaveBeenCalledWith('place_film', { p_shelf: SHELF, p_film: 603 });
  });

  it('200 when the film was already in the global cache', async () => {
    const sb = addFilmFake({ cached: true });
    const res = await handleAddFilm({
      supabase: sb.client, owner: OWNER, shelfId: SHELF, body: VALID_BODY, token: 't', fetch: tmdbOk(),
    });
    expect(res.status).toBe(200);
  });

  it('stores the row TMDB returned, not fields the client might have sent', async () => {
    const sb = addFilmFake();
    await handleAddFilm({
      supabase: sb.client,
      owner: OWNER,
      shelfId: SHELF,
      body: { ...VALID_BODY, title: 'Injected', director: 'Nobody' },
      token: 't',
      fetch: tmdbOk(),
    });
    const [, payload] = sb.opsFor('films').find(([op]) => op === 'upsert')!;
    expect(payload).toMatchObject({ title: movieFixture.title });
    expect(payload).not.toMatchObject({ director: 'Nobody' });
  });
});

describe('handleAddFilm — failures', () => {
  it('502 when TMDB is unreachable', async () => {
    const sb = addFilmFake();
    const res = await handleAddFilm({
      supabase: sb.client,
      owner: OWNER,
      shelfId: SHELF,
      body: VALID_BODY,
      token: 't',
      fetch: vi.fn().mockRejectedValue(new Error('ECONNRESET')),
    });
    expect(res.status).toBe(502);
  });

  it('502 when TMDB answers non-2xx', async () => {
    const sb = addFilmFake();
    const res = await handleAddFilm({
      supabase: sb.client,
      owner: OWNER,
      shelfId: SHELF,
      body: VALID_BODY,
      token: 't',
      fetch: vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }),
    });
    expect(res.status).toBe(502);
  });

  it('500 when place_film fails', async () => {
    const sb = fakeSupabase(
      {
        shelves: { data: { id: SHELF, slug: 'abc' }, error: null },
        shelf_items: [{ data: null, error: null, count: 0 }, { data: null, error: null }],
        films: { data: [{ ...movieFixture, spine_color: 'hsl(210 42% 40%)', spine_dark: true, fetched_at: 'x' }], error: null },
      },
      { place_film: { data: null, error: { message: 'boom' } } },
    );
    const res = await handleAddFilm({
      supabase: sb.client, owner: OWNER, shelfId: SHELF, body: VALID_BODY, token: 't', fetch: tmdbOk(),
    });
    expect(res.status).toBe(500);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run test/shelf-actions.test.ts`
Expected: FAIL — `handleAddFilm` is not exported.

- [ ] **Step 3: Implement the handler**

Add to `src/lib/shelf-actions.ts`:

```ts
import { fetchTmdbMovie, TmdbUnavailableError } from './tmdb-proxy';
import { toFilmRow } from './tmdb-mapping';
import { ensureFilmCached, placeFilm, shelfHasFilm, shelfItemCount, type SpineColour } from './shelves';
import { SHELF_CAPACITY, SHELF_FULL_MESSAGE } from '../constants';
import { badGateway, conflict, json } from './http';

// 201 tells the caller the film was new to the global cache, 200 that it was
// already there. Both mean it now sits on the shelf.
const CREATED = 201;
const OK = 200;

// The colour the browser computes from the poster, as CSS space-separated hsl()
// with integer components — the format shelf-prototype.html produces.
const SPINE_COLOR_PATTERN = /^hsl\((\d{1,3}) (\d{1,3})% (\d{1,3})%\)$/;
const MAX_HUE = 360;
const MAX_PERCENT = 100;

export interface AddFilmContext {
  supabase: SupabaseClient;
  owner: string | undefined;
  shelfId: string | undefined;
  body: unknown;
  token: string | undefined;
  fetch: typeof globalThis.fetch;
}

interface AddFilmRequest {
  tmdbId: number;
  spine: SpineColour;
}

function parseSpineColor(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const match = SPINE_COLOR_PATTERN.exec(raw);
  if (!match) return null;
  const [, hue, saturation, lightness] = match.map(Number);
  if (hue > MAX_HUE || saturation > MAX_PERCENT || lightness > MAX_PERCENT) return null;
  return raw;
}

function parseAddFilm(body: unknown): AddFilmRequest | null {
  if (typeof body !== 'object' || body === null) return null;
  const { tmdbId, spineColor, spineDark } = body as Record<string, unknown>;

  const id = parseFilmId(tmdbId);
  const colour = parseSpineColor(spineColor);
  if (id === null || colour === null || typeof spineDark !== 'boolean') return null;

  return { tmdbId: id, spine: { spine_color: colour, spine_dark: spineDark } };
}

export async function handleAddFilm(ctx: AddFilmContext): Promise<Response> {
  const guard = await requireOwnShelf(ctx.supabase, ctx.owner, ctx.shelfId);
  if (guard instanceof Response) return guard;

  const request = parseAddFilm(ctx.body);
  if (!request) return badRequest('invalid film payload');

  if (!ctx.token) {
    console.error('[api/shelves] TMDB_ACCESS_TOKEN is not set');
    return internalError();
  }

  try {
    // The cap is checked only for a film the shelf does not already hold:
    // place_film is idempotent, so re-adding cannot grow the shelf.
    const alreadyOnShelf = await shelfHasFilm(ctx.supabase, guard.id, request.tmdbId);
    if (!alreadyOnShelf && (await shelfItemCount(ctx.supabase, guard.id)) >= SHELF_CAPACITY) {
      return conflict({ error: 'shelf_full', message: SHELF_FULL_MESSAGE });
    }

    // Only the spine colour is taken from the browser; every other field comes
    // from TMDB, because the films cache is global and one bad row would reach
    // every shelf.
    const movie = await fetchTmdbMovie(request.tmdbId, ctx.token, ctx.fetch);
    const { film, created } = await ensureFilmCached(
      ctx.supabase,
      toFilmRow(movie),
      request.spine,
    );
    const position = await placeFilm(ctx.supabase, guard.id, request.tmdbId);

    return json({ position, film }, created ? CREATED : OK);
  } catch (err) {
    if (err instanceof TmdbUnavailableError) {
      console.error('[api/shelves] TMDB lookup failed', err);
      return badGateway('tmdb unavailable');
    }
    console.error('[api/shelves] add failed', err);
    return internalError();
  }
}
```

`parseFilmId` and `requireOwnShelf` come from Task 4 in the same module; do
not redefine them. The `shelfHasFilm` call must precede `shelfItemCount` so
the fake's queued `shelf_items` results line up with the test.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run test/shelf-actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the route**

Create `src/pages/api/shelves/[id]/films/index.ts`:

```ts
import type { APIRoute } from 'astro';
import { getSecret } from 'astro:env/server';
import { handleAddFilm, readJson } from '../../../../../lib/shelf-actions';

export const prerender = false;

export const POST: APIRoute = async ({ locals, params, request }) =>
  handleAddFilm({
    supabase: locals.supabase,
    owner: locals.user?.sub as string | undefined,
    shelfId: params.id,
    body: await readJson(request),
    // A real runtime read, so rotating the token on Vercel needs no rebuild.
    token: getSecret('TMDB_ACCESS_TOKEN'),
    fetch,
  });
```

- [ ] **Step 6: Verify the whole suite and the types**

Run: `npm test && npm run typecheck && npm run lint`
Expected: PASS on all three.

---

### Task 7: Update `CLAUDE.md`

Three statements in `CLAUDE.md` are now false. Leaving them is worse than
never having written them, because the next reader will trust them.

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: everything above. Produces: nothing code depends on.

- [ ] **Step 1: Correct the cap claim**

In the `shelves` bullet under **Database**, find:

```
`slug` drives the public URL,
  `is_public` controls access without a session. The ~20-films-per-shelf cap is
  a client concern, not a database constraint.
```

Replace with:

```
`slug` drives the public URL,
  `is_public` controls access without a session. The 20-films-per-shelf cap is
  `SHELF_CAPACITY` in `src/constants/`, enforced by
  `POST /api/shelves/[id]/films` with a `409`. It is still not a database
  constraint, so raising it stays a one-constant change.
```

- [ ] **Step 2: Correct the direct-database claim**

Under **Rejected decisions, and why**, find:

```
- **Mongo**: the data is relational and would need manual joins. Postgres also
  gives row level security, which is what lets the browser talk straight to the
  database without an API layer policing permissions.
```

Replace with:

```
- **Mongo**: the data is relational and would need manual joins. Postgres also
  gives row level security, which is what lets the browser read straight from
  the database without an API layer policing permissions. Writes turned out to
  need one anyway — the session lives in server-managed cookies, so mutations
  go through `src/pages/api/shelves/` with RLS as the backstop — but the
  relational argument is untouched.
```

- [ ] **Step 3: Record the language split**

Add as the last bullet of **Stack**:

```
- The interface is in Castilian Spanish for v1. Code, comments, identifiers,
  specs and commit messages stay in English. Every user-facing string lives in
  `src/constants/`, never inline in a component — which is what would make a
  second language possible later without hunting through markup.
```

- [ ] **Step 4: Add the new rule that does not bend**

Add to the end of the "Rules that do not bend" list:

```
- **The browser is trusted with the spine colour and nothing else.** Every
  other `films` field is fetched from TMDB server-side by
  `POST /api/shelves/[id]/films`. The cache is global, so one client's bad row
  would be every shelf's bad row.
```

- [ ] **Step 5: Verify the docs still format**

Run: `npx prettier --check CLAUDE.md`
Expected: PASS. If it reformats, run `npx prettier --write CLAUDE.md`.

---

## Verification

Run before handing the branch back:

```bash
npm test              # every suite, including the untouched tmdb tests
npm run typecheck
npm run lint
npm run format:check
```

What the suite does **not** cover, and why: no test exercises a real Supabase
instance, so RLS policies, the `place_film` / `reorder_shelf` SQL bodies and
the composite primary key are verified only by
`supabase/tests/schema_checks.sql` and by hand. The first manual check worth
doing after this branch is a signed-in `POST /api/shelves/<your shelf>/films`
against a local Supabase, confirming the row lands in `films` **and**
`shelf_items`, then the same call from a second account against the first
account's shelf id, confirming `404`.
