# Critic's Verdict and Score Stickers Implementation Plan

> **Revised after execution:** the Guardian verdict (Tasks 2–3's Guardian half, the press line in Task 6, the review link in Task 7) was built and then removed — the Guardian Open Platform terms forbid caching its content beyond 24 hours and editing headlines. What shipped is the OMDb score stickers: `src/lib/scores.ts`, `src/lib/scores-lookup.ts`, columns `rt_score`, `imdb_rating`, `scores_checked_at`, and footer credits for OMDb, IMDb and Rotten Tomatoes. See the spec's "Rejected: the Guardian verdict".

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cache a Guardian press line (stars, quote, critic) and OMDb scores (Tomatometer, IMDb) per film, and draw them on the 3D case: the press line on the back, two stacked stickers top-right on the front.

**Architecture:** `POST /api/shelves/[id]/films` already fetches the TMDB movie; right after it, a new server module looks up OMDb (by `imdb_id`) and The Guardian (by English title) in parallel with a timeout, and the results join the `films` insert as new nullable columns. Pure parsing/matching lives in `src/lib/press.ts`; network calls in `src/lib/press-lookup.ts`. The fields ride to the case inside the existing `data-case` JSON. The backfill script is rewritten to write through `psql` with the database password instead of the service-role key.

**Tech Stack:** Astro (SSR, Vercel), Supabase Postgres, TypeScript, Vitest, canvas 2D for case textures (Three.js scene unchanged).

**Spec:** `docs/superpowers/specs/2026-11-19-score-stickers-design.md`

## Global Constraints

- **Do not `git commit`.** Leave every change unstaged for the owner to review (owner's rule). The branch is `feat/critic-verdict`; no worktrees.
- Rendering never calls TMDB, OMDb or The Guardian; the browser writes nothing but the spine colour.
- A review/score lookup failure never fails an add. TMDB remains the only service an add depends on.
- A missing `GUARDIAN_API_KEY` or `OMDB_API_KEY` skips that source (log once per process) and the add still succeeds.
- The quote is verbatim English: never translated, paraphrased or invented. When the Guardian match is in doubt, no quote.
- No Rotten Tomatoes tomato/splat, no IMDb wordmark: stickers are our own design, naming the source in plain type.
- Every user-facing string in `src/constants/index.ts`; no magic values inline (`.claude/.rules/constants-and-types.md`).
- Comments explain *why* only (`.claude/.rules/comments.md`).
- Run checks with `npm test`, `npm run lint`, `npm run typecheck`.

## Review Focus

1. **A Guardian search with a same-prefix film** (`Alien` vs `Aliens review – …`, `Creed` vs `Creed II review`) must not match: the title must be followed directly by ` review`. Test in Task 2.
2. **A headline with a hyphen instead of an en dash, or no dash** (`Heat review: …`, `Heat review - …`): en dash and spaced hyphen yield a quote, no separator yields none. Test in Task 2.
3. **OMDb answering `{"Response":"False"}`, `"N/A"` ratings, or a film with no `imdb_id`**: scores are null and the lookup still counts as answered (or, with no `imdb_id`, OMDb is skipped as answered-empty). Test in Task 3.
4. **A slow or hanging Guardian/OMDb** must not hold the add beyond the timeout, and leaves `press_checked_at` null. Test in Task 3.
5. **A `data-case` attribute written before this step** (no press keys) must parse to "no press" and draw the case exactly as today. Test in Task 5.

---

### Task 1: Schema and row types

**Files:**
- Create: `supabase/migrations/20261119120000_film_press.sql`
- Create: `src/lib/press.ts` (types only in this task)
- Modify: `src/lib/shelves.ts` (`FilmRecord`, `ensureFilmCached` row type)
- Modify: `src/lib/tmdb-mapping.ts` (`TmdbMovie.imdb_id`)

**Interfaces:**
- Produces, in `src/lib/press.ts`:
  ```ts
  export interface PressFields {
    press_quote: string | null;
    press_stars: number | null;   // 4 or 5 when present
    press_byline: string | null;
    press_url: string | null;
    rt_score: number | null;      // 0–100
    imdb_rating: number | null;   // one decimal, e.g. 7.8
    press_checked_at: string | null; // ISO timestamp
  }
  export const EMPTY_PRESS: PressFields; // all null
  ```
- `FilmRecord` becomes `FilmRow & PressFields & SpineColour & { fetched_at }`.
- `ensureFilmCached(sb, row: FilmRow & PressFields, spine)`.
- `TmdbMovie` gains `imdb_id?: string | null` (TMDB movie details already return it; no request change).

- [ ] **Step 1:** Write the migration, with a header comment in the style of `20261116120000_film_case_details.sql` (written server-side only, no update policy):
  ```sql
  alter table public.films
    add column press_quote      text,
    add column press_stars      smallint check (press_stars between 1 and 5),
    add column press_byline     text,
    add column press_url        text,
    add column rt_score         smallint check (rt_score between 0 and 100),
    add column imdb_rating      numeric(3,1) check (imdb_rating between 0 and 10),
    add column press_checked_at timestamptz;
  ```
- [ ] **Step 2:** Add the types above and update `FilmRecord`, `ensureFilmCached`, `TmdbMovie`.
- [ ] **Step 3:** Fix every compile error the type change causes (test fixtures in `test/shelves.test.ts`, `test/shelf-actions.test.ts`, `test/case-details.test.ts` spread `EMPTY_PRESS` into film rows).
- [ ] **Step 4:** Run `npm run typecheck && npm test`. Expected: PASS, no behaviour change.
- [ ] **Step 5:** Apply locally with `npm run db:reset` if the local stack is running; do **not** push to the hosted project (the owner does that, Task 8).

### Task 2: Guardian matching and quote extraction (pure)

**Files:**
- Modify: `src/lib/press.ts`
- Test: `test/press.test.ts`

**Interfaces:**
- Consumes: `PressFields` (Task 1).
- Produces:
  ```ts
  export interface GuardianResult {
    webTitle: string;
    webUrl: string;
    webPublicationDate: string; // ISO
    fields?: { headline?: string; starRating?: string; byline?: string };
  }
  export interface PressVerdict { quote: string; stars: number; byline: string; url: string }
  export function quoteFromHeadline(headline: string): string | null;
  export function pickGuardianReview(
    results: GuardianResult[],
    film: { title: string; releaseDate: string | null }, // TMDB 'YYYY-MM-DD'
  ): PressVerdict | null;
  ```

Rules from the spec: title starts with the film title then ` review` (case-insensitive, punctuation such as `:` ignored on both sides); published no earlier than 1 January of the year before release; `starRating` 4 or 5; among qualifiers, the one published closest **after** the release date (if all are before it, the latest). Quote is the text after the first ` – ` (en dash) or ` - ` (spaced hyphen) in the **headline**; none → no verdict. Byline missing → no verdict (the press line needs a signature).

- [ ] **Step 1: Write the failing tests**
  ```ts
  quoteFromHeadline("Heat review – Michael Mann's crime epic is a masterpiece")
    // → "Michael Mann's crime epic is a masterpiece"
  quoteFromHeadline('Heat review - a masterpiece')   // → 'a masterpiece'
  quoteFromHeadline('Heat review: a masterpiece')    // → null
  quoteFromHeadline('Heat review –   ')              // → null

  // film = { title: 'Alien', releaseDate: '1979-05-25' }
  pickGuardianReview([r('Aliens review – …', '1986-08-29', '5')], film) // → null
  pickGuardianReview([r('Alien review – the perfect nightmare', '2003-10-31', '5')], film)
    // → { quote: 'the perfect nightmare', stars: 5, byline: 'Peter Bradshaw', url }
  pickGuardianReview([r('Alien review – meh', '2003-10-31', '3')], film) // → null
  // film = { title: 'Creed', releaseDate: '2015-11-25' }
  pickGuardianReview([r('Creed II review – …', '2018-11-30', '4')], film) // → null
  // film = { title: 'Mad Max: Fury Road', releaseDate: '2015-05-13' }
  pickGuardianReview([r('Mad Max Fury Road review – …', '2015-05-14', '5')], film) // matches
  // published two years before release → null
  // two qualifiers, 2015-05-14 and 2020-01-01 → picks 2015-05-14
  // missing byline → null; releaseDate null → date rule skipped
  ```
  (`r(webTitle, date, stars)` is a local fixture helper building a `GuardianResult` with `headline` = `webTitle` and byline `'Peter Bradshaw'`.)
- [ ] **Step 2:** Run `npx vitest run test/press.test.ts`. Expected: FAIL (functions not exported).
- [ ] **Step 3:** Implement both functions. Normalise titles by lower-casing and stripping everything but letters, digits and spaces, then collapsing spaces; compare `normalised(webTitle).startsWith(normalised(title) + ' review')`.
- [ ] **Step 4:** Run the test. Expected: PASS.

### Task 3: Network lookups

**Files:**
- Modify: `src/lib/press.ts` (OMDb parsing, pure)
- Create: `src/lib/press-lookup.ts`
- Test: `test/press.test.ts`, `test/press-lookup.test.ts`

**Interfaces:**
- Consumes: `pickGuardianReview`, `PressFields`, `EMPTY_PRESS`, `TmdbMovie`.
- Produces:
  ```ts
  // press.ts
  export interface OmdbScores { rt_score: number | null; imdb_rating: number | null }
  export function parseOmdb(json: unknown): OmdbScores | null; // null = not an OMDb answer
  // press-lookup.ts
  export interface PressKeys { guardian: string | undefined; omdb: string | undefined }
  export async function lookupPress(
    movie: TmdbMovie,
    keys: PressKeys,
    fetchImpl: typeof globalThis.fetch,
    now: () => Date = () => new Date(),
  ): Promise<PressFields>;
  ```

Values: OMDb `https://www.omdbapi.com/?i=<imdb_id>&apikey=<key>`; Guardian `https://content.guardianapis.com/search` with `q="<title>"`, `section=film`, `tag=tone/reviews`, `show-fields=headline,starRating,byline`, `page-size=20`, `api-key=<key>`. Timeout `PRESS_TIMEOUT_MS = 4000` per request via `AbortSignal.timeout`. All URLs and the timeout as named constants at the top of `press-lookup.ts`.

`press_checked_at` = `now().toISOString()` only when **every source that has a key** answered (2xx with parseable JSON, including "nothing found"); null if any configured source failed or if neither key is set. A film with no `imdb_id` counts OMDb as answered-empty. The Guardian search uses `movie.title`.

- [ ] **Step 1: Write the failing tests**
  - `parseOmdb({ Response: 'True', imdbRating: '7.8', Ratings: [{ Source: 'Rotten Tomatoes', Value: '94%' }] })` → `{ rt_score: 94, imdb_rating: 7.8 }`
  - `parseOmdb({ Response: 'True', imdbRating: 'N/A', Ratings: [] })` → `{ rt_score: null, imdb_rating: null }`
  - `parseOmdb({ Response: 'False', Error: 'Incorrect IMDb ID.' })` → `{ rt_score: null, imdb_rating: null }`
  - `parseOmdb('nope')` → `null`
  - `lookupPress` with a fake fetch routing by host: both answer → verdict + scores + `press_checked_at` set; OMDb 500 → scores null, verdict kept, `press_checked_at` null; Guardian fetch rejects with `AbortError` → verdict null, `press_checked_at` null; keys `{ guardian: undefined, omdb: undefined }` → `EMPTY_PRESS` and fetch never called; `imdb_id: null` with only an OMDb key → OMDb not called, `press_checked_at` set.
- [ ] **Step 2:** Run `npx vitest run test/press.test.ts test/press-lookup.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement. Run the two sources with `Promise.all`, each wrapped so it resolves to `{ ok: boolean, value }` and never rejects. Log a missing key once per process with `console.warn('[press] … not set')`.
- [ ] **Step 4:** Run the tests. Expected: PASS.

### Task 4: Wire into the add endpoint

**Files:**
- Modify: `src/lib/shelf-actions.ts` (`AddFilmContext`, `handleAddFilm`)
- Modify: `src/pages/api/shelves/[id]/films/index.ts`
- Modify: `astro.config.mjs` (env schema), `.env.example`
- Test: `test/shelf-actions.test.ts`

**Interfaces:**
- Consumes: `lookupPress`, `PressKeys` (Task 3).
- Produces: `AddFilmContext` gains `pressKeys: PressKeys`. The response's `film` now carries the press columns.

- [ ] **Step 1: Write the failing tests** in the existing `handleAddFilm` block: with a fake fetch that serves TMDB (with `imdb_id`), OMDb and Guardian, the row passed to the `films` insert contains `rt_score: 94`, `imdb_rating: 7.8`, `press_stars: 5` and a non-null `press_checked_at`; with OMDb and Guardian both failing, the add still returns 201 and the inserted row has the press fields null.
- [ ] **Step 2:** Run `npx vitest run test/shelf-actions.test.ts`. Expected: FAIL.
- [ ] **Step 3:** In `handleAddFilm`, after `fetchTmdbMovie`, `const press = await lookupPress(movie, ctx.pressKeys, ctx.fetch)` and pass `{ ...toFilmRow(movie), ...press }` to `ensureFilmCached`. The route passes `pressKeys: { guardian: getSecret('GUARDIAN_API_KEY'), omdb: getSecret('OMDB_API_KEY') }`. Add both to the `astro.config.mjs` schema exactly like `TMDB_ACCESS_TOKEN` (`context: 'server', access: 'secret', optional: true`) and as empty lines in `.env.example`.
- [ ] **Step 4:** Run `npm test && npm run typecheck`. Expected: PASS.

### Task 5: Press data on the slot, and sticker text

**Files:**
- Modify: `src/lib/case-details.ts`
- Modify: `src/constants/index.ts`
- Test: `test/case-details.test.ts`

**Interfaces:**
- Consumes: `PressFields`.
- Produces:
  ```ts
  export interface CasePress {
    quote: string | null; stars: number | null; byline: string | null; url: string | null;
    rt: number | null; imdb: number | null;
  }
  // CaseDetails gains `press: CasePress`; EMPTY_DETAILS.press is all null.
  // toCaseJson accepts the CaseFields pick plus the PressFields it needs.
  export function rtSticker(score: number): string;   // 94 → '94 %' (narrow no-break space U+202F)
  export function imdbSticker(rating: number): string; // 7.8 → '7,8'; 8 → '8,0'
  ```
- Constants: `STICKER_RT_LABEL = 'ROTTEN TOMATOES'`, `STICKER_IMDB_LABEL = 'IMDb'`, `CASE_REVIEW_LINK = 'Leer la crítica en The Guardian'`, `OMDB_ATTRIBUTION` (footer line crediting OMDb, e.g. `'Notas de Rotten Tomatoes e IMDb vía OMDb.'`), `OMDB_URL = 'https://www.omdbapi.com/'`.

- [ ] **Step 1: Write the failing tests:** round-trip `toCaseJson` → `parseCaseDetails` keeps all six press values; a JSON with no `press` key (written before this step) parses to `press` all null; a press with `stars: 3` or a non-numeric `rt` parses to null for that field; a press with `quote` but no `byline` parses to `quote: null` (the press line needs both); `rtSticker(94) === '94 %'`; `imdbSticker(7.8) === '7,8'`; `imdbSticker(8) === '8,0'`.
- [ ] **Step 2:** Run `npx vitest run test/case-details.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement; keep `parseCaseDetails` never-throwing.
- [ ] **Step 4:** Run the test. Expected: PASS.

### Task 6: Draw the stickers and the press line

**Files:**
- Modify: `src/lib/case-textures.ts`
- Modify: `src/lib/case-scene.ts` (front texture source)

**Interfaces:**
- Consumes: `CasePress`, `rtSticker`, `imdbSticker`, the sticker label constants.
- Produces:
  ```ts
  export function frontCanvas(poster: HTMLImageElement, press: CasePress): HTMLCanvasElement;
  // backCanvas(film, details, images) draws details.press between synopsis and billing block.
  ```

Front: draw the poster cropped to the sleeve exactly as the current texture does (`repeat.x = CASE_WIDTH / POSTER_RATIO`, centred), then the stickers top-right, stacked: Tomatometer above (red round), IMDb below (yellow round), each only when its score exists; with one score it takes the top slot. Number large, label small underneath, Big Shoulders. Each sticker reads as stuck on: a thick white die-cut border (roughly 8–12 % of the sticker's diameter), a paper texture over the whole sticker including the border (procedural grain — e.g. a small noise pattern drawn once and composited at low alpha — plus a faint diagonal sheen; no image asset), a soft drop shadow onto the poster, and a slight tilt (a few degrees, opposite directions for the two). Load the poster at the existing `TEXTURE_POSTER_SIZE` (keep the `w780` CORS note). When there is no poster, the front stays as today.

Back: one run of text — filled star shapes (4 or 5, drawn as a five-pointed path in the line's ink, never a glyph), ` – `, the quote in Archivo italic within curly quotes `“…”`, then the byline upright, smaller/dimmer; wraps to the back's inner width; the byline never breaks. The press line has a fixed place directly above the billing block; the synopsis loses that height and still ends in `…` if cut. With no press, the back is pixel-for-pixel as today. Sizes, colours and tilt are builder's choice; put them in the existing `BACK` constants object or a new `STICKER` one.

- [ ] **Step 1:** Implement `frontCanvas` and use it in `case-scene.ts` instead of the bare poster texture.
- [ ] **Step 2:** Add the press line to `backCanvas`, reusing `wrapItems` where it fits.
- [ ] **Step 3:** `npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 4:** Manual check with `npm run dev`, using a film whose row you set locally to a press line and both scores (and one with only `imdb_rating`, one with nothing): stickers stacked top-right, press line above the billing block, unchanged back with no press. Screenshot for the owner (outside the repo).

### Task 7: Record panel link and footer credit

**Files:**
- Modify: `src/components/FilmCase.astro`, `src/components/Bookcase.astro`
- Modify: `src/components/Attribution.astro`

- [ ] **Step 1:** In `FilmCase.astro`'s record, add `<a id="case-review" target="_blank" rel="noopener noreferrer" hidden>{CASE_REVIEW_LINK}</a>` below `#case-meta`, styled like the record's text links.
- [ ] **Step 2:** Where `Bookcase.astro` fills `#case-title`/`#case-meta` on open, set `href` from `parseCaseDetails(slot.dataset.case).press.url` and toggle `hidden` when null. Works in both the 3D and static fallback views.
- [ ] **Step 3:** In `Attribution.astro`, add `OMDB_ATTRIBUTION` linking to `OMDB_URL`, next to the TMDB credit.
- [ ] **Step 4:** `npm run typecheck && npm run lint`, then manual check: link present and opens the review for a film with a verdict, absent otherwise; footer shows the OMDb credit.

### Task 8: Backfill without the service-role key

**Files:**
- Modify: `scripts/backfill-film-details.ts`
- Modify: `CLAUDE.md` (Database section: the new `films` columns and how the backfill writes)
- Modify: `docs/roadmap.md` only if the wording no longer matches what shipped

**Interfaces:**
- Consumes: `toFilmRow`, `lookupPress`, `PressFields`.

Behaviour: run as `node --env-file=.env scripts/backfill-film-details.ts`. Reads `TMDB_ACCESS_TOKEN`, `GUARDIAN_API_KEY`, `OMDB_API_KEY`, `SUPABASE_DB_PASSWORD` (strip `\r` from each value — the owner's `.env` is CRLF) and the connection host from `supabase/.temp/pooler-url` plus `supabase/.temp/project-ref` (user `postgres.<ref>`, `sslmode=require`). Talks to Postgres through the `psql` binary via `execFileSync` with `PGPASSWORD` in the child's env — no new npm dependency, no secret on the command line. Selects rows where (`backdrop_paths = '{}' and cast_names = '{}'`) or `press_checked_at is null`; for each, fetches TMDB (as today; `fetchMovie` keeps its own URL constants since `tmdb-proxy.ts` does not load under plain Node) and `lookupPress`; then one `UPDATE public.films … FROM jsonb_to_recordset($j$…$j$::jsonb)` that sets the step 3 columns only where they are still empty and the press columns only where `press_checked_at` is null. Prints `<id> ok` / `<id> failed: <reason>` per film and the `UPDATE n` count. Refuses to run (clear message) if `psql` is missing or a variable is unset. Header comment updated: local, run by the owner, no service-role key.

Note: `press-lookup.ts` must import only with explicit `.ts`-resolvable paths (or none) so it loads under plain Node like `tmdb-mapping.ts` does; check this when writing Task 3.

- [ ] **Step 1:** Rewrite the script as above.
- [ ] **Step 2:** `npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 3:** Against the local stack (`npm run db:start`), with no Guardian/OMDb keys: the script runs, reports each film, and leaves `press_checked_at` null.
- [ ] **Step 4:** Update the CLAUDE.md Database bullet for `films` with the press columns and the new backfill command.
- [ ] **Step 5 (owner, after the keys exist and the PR is reviewed):** `./node_modules/.bin/supabase db push`, then `node --env-file=.env scripts/backfill-film-details.ts` against the hosted project; check a few films on a phone and on desktop.

### Final verification

- [ ] `npm test && npm run lint && npm run typecheck` all PASS.
- [ ] Leave everything unstaged; report the file list to the owner. No commit.
