# Videothèque

A film shelf. Each user owns one or more themed shelves and fills them by
searching TMDB. Films are drawn as case spines standing on a wooden board, in an
order the owner sets by dragging. Visual reference: thecriterioncloset.com

## Stack

- Astro with the Vercel adapter, server-side rendering
- Supabase: Postgres, magic-link auth, row level security
- TMDB as the data source, always through our own proxy
- No UI framework. Astro components and plain JavaScript for the app shell.
- Runtime libraries are allowed only with a written justification: what it
  buys, its cost in shipped KB and complexity, and why plain JS will not do.
  Accepted so far: **Three.js**, for the pulled-out 3D film case only (the
  shelf itself stays CSS/DOM). See
  `docs/superpowers/specs/2026-08-29-shelf-visual-direction-design.md`.
- Deployed on Vercel
- The interface is in Castilian Spanish for v1. Code, comments, identifiers,
  specs and commit messages stay in English. Every user-facing string lives in
  `src/constants/`, never inline in a component — which is what would make a
  second language possible later without hunting through markup.

## Structure

```
src/
  pages/
    index.astro        own shelves, requires a session
    e/[slug].astro     anyone's public shelf, no login
    api/tmdb.ts        TMDB proxy
  components/          Shelf, Spine, SearchBar, FilmCase
  lib/                 supabase.ts, tmdb.ts, colors.ts
  types/               cross-cutting interfaces and type aliases
  constants/           cross-cutting constant values
  styles/
supabase/migrations/   <timestamp>_initial_schema.sql
```

## Ways of working

@.claude/.rules/constants-and-types.md
@.claude/.rules/git-workflow.md
@.claude/.rules/commit-messages.md
@.claude/.rules/comments.md
@.claude/.rules/model-selection.md

## Database

Three tables, normalised from the start. Full SQL with policies lives in
`supabase/migrations/`.

- `films`: global TMDB cache. Primary key is the TMDB id. Filled the first time
  anyone adds that film, written by that user's browser with the anon key.
- `shelves`: a user owns one or more themed shelves; sign-up seeds the first.
  `name` labels a shelf, `accent_color` tints it, `slug` drives the public URL,
  `is_public` controls access without a session. The 20-films-per-shelf cap is
  `SHELF_CAPACITY` in `src/constants/`, enforced by
  `POST /api/shelves/[id]/films` with a `409`. It is still not a database
  constraint, so raising it stays a one-constant change.
- `shelf_items`: composite primary key (shelf_id, film_id). `position` is the
  display order within the shelf: `place_film` sets it when the film is added,
  `reorder_shelf` rewrites it on drag-and-drop. It is never shown, and gaps
  left by deletion are not compacted.

Rules that do not bend:

- **Rendering a shelf never calls TMDB.** Everything comes from the `films`
  cache. If a field is missing, add it to the cache rather than querying TMDB
  from the client.
- **The TMDB key never reaches the browser.** It lives only as an environment
  variable inside `/api/tmdb`.
- **The server assigns list position.** `place_film` appends a new film at the
  end of the order; `reorder_shelf` applies a whole drag-and-drop reordering in
  one call. Computing positions client-side with a prior `max()` lets two tabs
  collide.
- **Spine colour is computed once**, in the browser of the first user to add
  the film, from the public poster, and stored in `films.spine_color`. It is
  not recomputed afterwards.
- **The browser is trusted with the spine colour and nothing else.** Every
  other `films` field is fetched from TMDB server-side by
  `POST /api/shelves/[id]/films`. The cache is global, so one client's bad row
  would be every shelf's bad row.

Reading a shelf takes one call: PostgREST follows the foreign key with
`.select('position, films(*)')`. The join is not written by hand.

## Rejected decisions, and why

- **Mongo**: the data is relational and would need manual joins. Postgres also
  gives row level security, which is what lets the browser read straight from
  the database without an API layer policing permissions. Writes turned out to
  need one anyway — the session lives in server-managed cookies, so mutations
  go through `src/pages/api/shelves/` with RLS as the backstop — but the
  relational argument is untouched.
- **One JSON blob per user instead of tables**: simpler for two people, but it
  loses the shared film cache and forces a migration later.
- **Monorepo**: there is a single package. Workspaces add configuration without
  solving any problem we have.
- **Native app**: everything worth doing here is linkable, and an app breaks the
  shared link. A PWA covers the mobile case.
- **Polaroid of four picks** (the feature in the reference site): dropped on
  purpose. Do not reintroduce.
- **Link preview image when sharing a shelf**: out of scope for v1. Revisit only
  if its absence actually bothers us in use.

## State

`shelf-prototype.html` has the shelf working in a single file: colour
extraction, the pull-out animation, the search box. Treat it as an interface
reference, not as code to lift verbatim.

Work order: TMDB proxy -> Supabase layer -> auth -> port the shelf to components.

## Constraints

- TMDB requires visible attribution and its free licence is non-commercial.
- Posters are served from image.tmdb.org and never rehosted. That keeps both
  Supabase and Vercel bandwidth near zero.
