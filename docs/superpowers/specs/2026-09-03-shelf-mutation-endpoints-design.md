# Videothèque · Shelf mutation endpoints and data layer

Date: 2026-09-03
Status: approved for planning

## Goal

Give the browser a way to change a shelf's contents. Adding a film, removing
one, and applying a drag-and-drop reordering each become an HTTP endpoint
backed by a shared data layer over Supabase.

Fourth sub-project in the work order (TMDB proxy → Supabase layer → auth →
**shelf mutations** → port the shelf). It is the last piece of back end the
shelf UI needs before it can be built: the front cannot store anything until
it knows who it is talking to.

Deliverable: `src/lib/shelves.ts` (the data layer), `src/lib/shelf-actions.ts`
(the three operations as pure handlers), three routes under
`src/pages/api/shelves/`, a pure TMDB mapping module both sides can import,
and `index.astro` refactored to read through the data layer instead of
querying Supabase inline.

## Scope

In scope:

- `src/lib/tmdb-mapping.ts`: `TmdbMovie`, `FilmRow` and `toFilmRow` moved out
  of the browser-only `tmdb.ts` so server code can import them.
- `src/lib/http.ts`: `json` / `errorJson`, lifted out of `tmdb-proxy.ts` where
  they are private today, so the three new handlers answer with the same
  shape (and the same `Cache-Control: no-store` on every failure) instead of
  a second copy of them — plus the named responses they return
  (`unauthorized`, `badRequest`, `notFound`, `conflict`, `internalError`,
  `badGateway`, `noContent`). See decision 9.
- `src/lib/tmdb-proxy.ts`: extract `fetchTmdbMovie` and add
  `TmdbUnavailableError`, so the proxy and the film cache share the one place
  that talks to TMDB, and the add handler can tell an upstream failure (`502`)
  from its own (`500`).
- `src/lib/shelves.ts`: `findOwnShelf`, `shelfItemCount`, `shelfHasFilm`,
  `ensureFilmCached`, `placeFilm`, `removeFilm`, `reorderShelf`,
  `listOwnShelves`.
- `src/lib/shelf-actions.ts`: `handleAddFilm`, `handleRemoveFilm`,
  `handleReorderShelf` — pure, dependency-injected, returning a `Response`.
- `src/pages/api/shelves/[id]/films/index.ts` (POST),
  `src/pages/api/shelves/[id]/films/[filmId].ts` (DELETE),
  `src/pages/api/shelves/[id]/order.ts` (PUT).
- `src/constants/index.ts`: `SHELF_CAPACITY`, the shelf-full message, the HTTP
  status codes these routes add.
- `src/pages/index.astro`: same rendered output, but the query moves into
  `listOwnShelves`.
- Unit tests for the data layer and the three handlers.

Out of scope:

- Every visual concern. No components, no colour extraction, no
  drag-and-drop, no `styles/`. The shelf UI is the next spec.
- `readShelf` (a whole shelf with `select('position, films(*)')`). Nothing
  calls it until `/e/[slug]` exists, and that page belongs to the next spec.
- Shelf CRUD: creating, renaming, recolouring, publishing or deleting a
  shelf. The sign-up trigger already gives every user one shelf, which is
  what the shelf UI needs. See decision 7 for the consequence.
- Changing `films.spine_color`'s storage format. Considered and rejected;
  see decision 6.

## Decisions

### 1. Mutations go through our own endpoints, not straight to Supabase

`CLAUDE.md` says row level security is what lets the browser talk directly to
the database. For reads that still holds. For writes it does not survive
contact with the session design: `@supabase/ssr` keeps the session in cookies
managed on the server, and `browserClient()` exists only for the login form.

So every write goes through `src/pages/api/`, using the request-scoped client
the middleware already puts on `Astro.locals`. What this buys:

- The session cookies stay server-managed. No access token is handed to page
  scripts.
- A whole reordering travels as one request, matching `reorder_shelf`'s
  one-call contract.
- `@supabase/supabase-js` stays out of the browser bundle, which is what
  `CLAUDE.md`'s runtime-library rule wants.

The cost is three thin route files that would not otherwise exist.

### 2. REST routes per operation, with the guard in one place

One route per operation (`POST …/films`, `DELETE …/films/[filmId]`,
`PUT …/order`) rather than a single endpoint with an `op` discriminator. HTTP
methods carry the semantics.

The obvious cost of that choice is a preamble repeated three times: is there
a session, is this shelf yours, is the body well formed. It is not repeated.
The three operations live in `src/lib/shelf-actions.ts` as pure handlers that
share `requireOwnShelf`, and each route is five lines that read
`Astro.locals`, inject the TMDB token and `fetch`, and delegate. This is the
same shape as `/api/tmdb` + `lib/tmdb-proxy.ts`, and it is what makes the
handlers testable without a server.

An earlier option — Astro Actions — was rejected: it pulls `zod` in as a
runtime dependency, which `CLAUDE.md` allows only with a written
justification, and this needs three field checks, not a schema library.

### 3. The browser sends a TMDB id and a colour, nothing else

`POST …/films` takes `{ tmdbId, spineColor, spineDark }`. The endpoint fetches
the film from TMDB itself and builds the row with `toFilmRow`.

The alternative was for the client to send the mapped `FilmRow` and have the
endpoint insert it as received. That saves one TMDB call per first-time add,
but the server would then believe any title, year or director it is handed,
and the `films` cache is global: one client's bad row is every shelf's bad
row.

So the only field the browser is trusted with is the one only a browser can
produce — the spine colour, computed from the poster with a canvas. This also
keeps the TMDB → `films` mapping in a single place as `tmdb.ts:65` already
promises, so caching a new field later is a migration plus one line in
`toFilmRow`, with no dependency on what old clients happen to send.

### 4. Ownership is checked explicitly, not left to RLS

RLS already stops a stranger from writing to someone else's shelf. It does so
silently: `reorder_shelf` is `security invoker`, its `UPDATE` matches no rows
under the policy, and it returns normally. A stranger would get `204` and
believe the write landed. The `DELETE` behaves the same way.

So every handler starts with `requireOwnShelf`, which selects the shelf by id
scoped to `user.sub` and turns a miss into `404`. RLS stays as the backstop it
is meant to be; the endpoint is what produces an honest status code.

`404` — not `403` — for both "no such shelf" and "not yours", so the API does
not confirm which shelf ids exist.

### 5. The 20-film cap is enforced by the endpoint

`POST …/films` responds `409` with
`{ error: 'shelf_full', message: SHELF_FULL_MESSAGE }` once a shelf holds
`SHELF_CAPACITY` films, where

```ts
export const SHELF_CAPACITY = 20;
export const SHELF_FULL_MESSAGE =
  'Tienes la estantería llena, crea otra para seguir añadiendo películas';
```

and `SHELF_FULL_MESSAGE` is the first user-facing string in the codebase. See
decision 8 for why it is in Spanish. One source of truth, and the front only has to render
the message it is given.

This overrides the note in `CLAUDE.md` calling the cap a client concern; that
note must be updated as part of this work.

Two consequences the implementation has to respect:

- `place_film` is idempotent. The count is checked **only when the film is
  not already on that shelf**, so re-adding a film you already have never
  hits `409`, cap or no cap.
- The database still has no such constraint, and gains none. Raising the cap
  stays a one-constant change.

The front is expected to warn before the user hits the wall, using the count
of spines it has already rendered — no extra endpoint. That belongs to the
shelf UI spec.

### 6. `spine_color` stays a text `hsl()` string

Storing the colour as three `smallint` columns (`spine_h/s/l`) would be the
better design: Postgres validates it with a `check` constraint instead of a
regex, the front derives darker variants arithmetically instead of re-parsing
a string it generated, and `spine_dark` stops needing a column of its own.

Rejected for now because it costs a migration, an edit to `films`, a
rewritten `CLAUDE.md` note and a decision about `spine_dark` — a database
spec inside an endpoint spec — to save a regex written once. If it is ever
done, it goes first, as its own migration and its own PR.

The format the client produces is `hsl(H S% L%)` with integers and spaces, per
`shelf-prototype.html:298`. The endpoint validates exactly that shape and the
component ranges.

### 7. The shelf-full message names an action that does not exist yet

`SHELF_FULL_MESSAGE` tells the user to create another shelf, and shelf CRUD is
out of scope here. The `409` is still correct — the shelf really is full — but
until the shelf UI can create a shelf, the message points at an action the
interface does not offer. Recorded as a dependency for the shelf UI spec, not
a reason to widen this one.

### 8. The interface is in Spanish for v1; the codebase stays in English

`SHELF_FULL_MESSAGE` is the first string a user will ever read, so it settles
a question nothing else has had to answer. For v1 the interface is in
Castilian Spanish. Code, comments, commit messages, specs and identifiers stay
in English, as they are today.

The split is deliberate and holds in both directions: no English copy leaking
into the UI, no Spanish leaking into identifiers or comments. Every
user-facing string lives in `src/constants/`, never inline in a component —
which is what would make a second language possible later without hunting
through markup. That is the only concession to translation made here: no
i18n library, no message catalogue, no locale negotiation. None of it is
needed for one language.

### 9. Named responses, not `HTTP_*` status constants

`.claude/.rules/constants-and-types.md` lists "an HTTP status" among the
literals that should get a name, and the codebase is already split on it:
`constants/index.ts:12` defines `HTTP_SEE_OTHER` while `tmdb-proxy.ts:56`
writes `400` inline.

Both are right, for different numbers. `303` earns a name because choosing it
over `302` is a decision a reader would otherwise have to reconstruct.
`HTTP_NOT_FOUND = 404` earns nothing: it restates the number in more
characters, and the call site reads worse.

So the name goes on the response instead of the number. `src/lib/http.ts`
exports `notFound()`, `unauthorized()`, `badRequest(reason)`,
`conflict(body)`, `internalError()`, `badGateway(reason)` and `noContent()`,
each wrapping `errorJson` with its status. That satisfies what the rule is
actually for — no bare, unexplained literals at call sites — and additionally
fixes the error body in one place, which is what keeps a `404` from ever
confirming an id exists and a `500` from ever echoing a Supabase message.

The two statuses that stay plain numbers are `201` and `200` in the add
handler, named as local constants where the distinction between them is
explained. `HTTP_SEE_OTHER` stays as it is; the auth routes are out of scope.

## File structure

```
src/
  lib/
    http.ts             NEW  json / errorJson, shared with the TMDB proxy
    tmdb-mapping.ts     NEW  pure TMDB → films mapping, both sides import it
    tmdb.ts             EDIT browser fetches; re-exports the mapping
    tmdb-proxy.ts       EDIT extract fetchTmdbMovie
    shelves.ts          NEW  the data layer over Supabase
    shelf-actions.ts    NEW  the three operations as pure handlers
  pages/
    api/shelves/[id]/
      films/index.ts    NEW  POST
      films/[filmId].ts NEW  DELETE
      order.ts          NEW  PUT
    index.astro         EDIT reads through listOwnShelves
  constants/index.ts    EDIT SHELF_CAPACITY, message, status codes
test/
  shelves.test.ts       NEW
  shelf-actions.test.ts NEW
CLAUDE.md               EDIT the cap is now enforced server-side
```

## Modules

### `src/lib/tmdb-mapping.ts`

Takes `TmdbSearchResult`, `TmdbSearchResponse`, `TmdbCrewMember`, `TmdbMovie`,
`FilmRow`, `toFilmRow` and `posterUrl` from `tmdb.ts` unchanged. No `fetch`,
no imports — importable from a route handler.

`tmdb.ts` keeps `searchFilms` and `getFilm` (which are browser-only, because
they fetch a root-relative URL) and re-exports everything above, so existing
importers do not change.

### `src/lib/tmdb-proxy.ts`

```ts
export async function fetchTmdbMovie(
  id: number,
  token: string,
  fetchImpl: typeof globalThis.fetch,
): Promise<TmdbMovie>;
```

Wraps the `movie` branch of `buildUpstreamUrl` — the same
`append_to_response=credits` URL — plus the upstream call. Throws on a non-2xx
upstream. `handleTmdbRequest` is refactored to route its `movie` op through
it, so the URL is built in one place and the existing proxy tests keep
passing.

### `src/lib/shelves.ts`

Every function takes the `SupabaseClient` as its first argument and never
constructs one; the middleware owns the client's lifetime.

Its own types stay co-located here, per `.claude/.rules/constants-and-types.md`
— `shelves.ts` is the only module that owns them, so nothing goes into
`src/types/`.

```ts
export interface ShelfRef { id: string; slug: string }

/** The two spine fields, together, because they are written together and
 *  exactly once — on the film's first insert into the cache. Field names
 *  match the columns, so the object goes straight into the insert. */
export interface SpineColour { spine_color: string; spine_dark: boolean }

/** A full `public.films` row: `FilmRow` plus the spine fields and
 *  `fetched_at`. What `POST …/films` returns as `film`. */
export interface FilmRecord extends FilmRow, SpineColour { fetched_at: string }

/** The shelf fields `index.astro` renders today. */
export interface ShelfSummary {
  id: string;
  name: string;
  slug: string;
  accent_color: string | null;
  is_public: boolean;
}

/** The shelf if it exists and belongs to `owner`, else null. Callers turn
 *  null into 404 — a shelf that is not yours is a shelf that is not there. */
export function findOwnShelf(sb, shelfId: string, owner: string): Promise<ShelfRef | null>;

export function shelfItemCount(sb, shelfId: string): Promise<number>;
export function shelfHasFilm(sb, shelfId: string, filmId: number): Promise<boolean>;

/** Insert the film into the global cache if absent, and return the stored row.
 *  `spine_color`/`spine_dark` are only ever written on that first insert —
 *  per CLAUDE.md the colour is never recomputed. `created` is what lets the
 *  endpoint answer 201 rather than 200. */
export function ensureFilmCached(
  sb, row: FilmRow, spine: SpineColour,
): Promise<{ film: FilmRecord; created: boolean }>;

export function placeFilm(sb, shelfId: string, filmId: number): Promise<number>;   // rpc place_film
export function removeFilm(sb, shelfId: string, filmId: number): Promise<void>;
export function reorderShelf(sb, shelfId: string, order: number[]): Promise<void>;  // rpc reorder_shelf

export function listOwnShelves(sb, owner: string): Promise<ShelfSummary[]>;
```

`ensureFilmCached` inserts with `on conflict do nothing` semantics
(`.upsert(row, { ignoreDuplicates: true })`) and then selects the row, so two
tabs adding the same film race harmlessly and the first-written colour wins.

`listOwnShelves` carries over the `.eq('owner', …)` filter and the comment
explaining it from `index.astro`: the shelves SELECT policy also exposes other
users' public shelves, so RLS alone would not scope the list.

### `src/lib/shelf-actions.ts`

Each operation declares the context it actually needs, rather than one wide
interface the others carve up with `Omit` — the remove handler has no business
holding a TMDB token:

```ts
interface ShelfScope {
  supabase: SupabaseClient;
  owner: string | undefined;      // user.sub, undefined when signed out
  shelfId: string | undefined;    // straight from params, validated here
}

export interface RemoveFilmContext extends ShelfScope { filmId: unknown }
export interface ReorderContext extends ShelfScope { body: unknown }
export interface AddFilmContext extends ShelfScope {
  body: unknown;                  // already JSON-parsed by the route
  token: string | undefined;      // TMDB_ACCESS_TOKEN
  fetch: typeof globalThis.fetch;
}

export function handleAddFilm(ctx: AddFilmContext): Promise<Response>;
export function handleRemoveFilm(ctx: RemoveFilmContext): Promise<Response>;
export function handleReorderShelf(ctx: ReorderContext): Promise<Response>;

/** The parsed JSON body, or null when absent or malformed, which the handlers
 *  turn into 400 instead of letting the route throw. */
export function readJson(request: Request): Promise<unknown>;
```

Each handler, in order: reject when `owner` is undefined (`401`); validate
`shelfId` as a UUID (`400`); `findOwnShelf`, null → `404`; validate the body
(`400`); act. Errors are JSON with `Cache-Control: no-store`, matching
`tmdb-proxy.ts`'s `errorJson`.

`handleAddFilm` additionally: if `shelfHasFilm` is false and `shelfItemCount`
is at `SHELF_CAPACITY`, return `409`; otherwise `fetchTmdbMovie` (a throw
becomes `502`), `toFilmRow`, `ensureFilmCached`, `placeFilm`, and respond
`{ position, film }` — `201` when the film was new to the cache, `200` when it
was already there.

### The routes

Five lines each. `films/index.ts`, for instance:

```ts
export const prerender = false;

export const POST: APIRoute = async ({ locals, params, request }) =>
  handleAddFilm({
    supabase: locals.supabase,
    owner: locals.user?.sub,
    shelfId: params.id!,
    body: await readJson(request),          // null on malformed JSON → 400
    token: getSecret('TMDB_ACCESS_TOKEN'),
    fetch,
  });
```

Only the intended method is exported, so Astro answers anything else with its
own `405`. Unlike `/api/tmdb`, there is no reason to own that response here.

## Request contracts

| Route | Method | Body | Success |
| --- | --- | --- | --- |
| `/api/shelves/[id]/films` | POST | `{ tmdbId, spineColor, spineDark }` | `201`/`200` + `{ position, film }` |
| `/api/shelves/[id]/films/[filmId]` | DELETE | — | `204` |
| `/api/shelves/[id]/order` | PUT | `{ order: number[] }` | `204` |

Request bodies are camelCase (`tmdbId`, `spineColor`, `spineDark`); database
rows keep the snake_case PostgREST returns. The handler is where the two
meet: it reads `spineColor`/`spineDark` off the body and builds the
`SpineColour` object the insert takes.

Validation:

- `id`: RFC 4122 UUID shape.
- `tmdbId`, `filmId`: integer > 0.
- `spineColor`: `/^hsl\(\d{1,3} \d{1,3}% \d{1,3}%\)$/`, hue ≤ 360, saturation
  and lightness ≤ 100.
- `spineDark`: boolean.
- `order`: non-empty array of integers > 0, no duplicates. Ids not on the
  shelf are simply not matched by `reorder_shelf`; they are not an error.

## Error handling

| Status | When |
| --- | --- |
| `400` | Malformed JSON, bad UUID, failed field validation |
| `401` | No session |
| `404` | Shelf absent or not the caller's |
| `409` | Shelf already holds `SHELF_CAPACITY` films and the film is new to it |
| `502` | TMDB unreachable or non-2xx |
| `500` | Missing `TMDB_ACCESS_TOKEN`, or an unexpected Supabase error |

Every failure is logged with its route prefix and swallows nothing, following
decision 7 of the auth spec. Supabase errors log `error.message` and return
`500`; they are never reflected to the client verbatim.

## Testing

Vitest, no server, no live Supabase — the pattern of `test/tmdb-proxy.test.ts`.

`test/shelves.test.ts` drives each data-layer function against a hand-written
Supabase double that records the calls it receives, asserting the `.eq('owner')`
scope on `listOwnShelves`, the `ignoreDuplicates` upsert in
`ensureFilmCached`, and that the two RPCs are called with the argument names
the migration declares (`p_shelf`, `p_film`, `p_order`).

`test/shelf-actions.test.ts` covers, per handler: signed out → `401`; bad
UUID → `400`; shelf not owned → `404`; each field validation → `400`; the
happy path. Plus, for `handleAddFilm`: full shelf → `409`; full shelf but the
film is already on it → success, not `409`; TMDB throwing → `502`; a film
already cached → `200` and no second colour write; a film new to the cache →
`201`.

The existing `test/tmdb-proxy.test.ts` must keep passing unchanged after
`fetchTmdbMovie` is extracted — that is the check that the refactor was
behaviour-preserving.

## Documentation

`CLAUDE.md` needs three edits, all consequences of decisions above:

- the `shelf_items` note calling the 20-film cap a client concern — it is now
  enforced by `POST …/films` (decision 5);
- the database section's claim that the browser talks straight to the database
  — true for reads, no longer true for writes (decision 1);
- a new line under the stack or ways-of-working section recording the language
  split: interface in Spanish, codebase in English, user-facing strings in
  `src/constants/` (decision 8). This one is a project-wide convention rather
  than a fact about this feature, so it belongs in `CLAUDE.md` and not only in
  this spec.
