# Videothèque · Database foundation

Date: 2026-08-28
Status: approved for planning

## Goal

Lock down the database layer so implementation can start on top of a stable
schema. Deliverable is SQL and migration tooling only: no Astro project, no
server code, no auth wiring yet.

The current `schema.sql` at the repo root is already close. This spec records
the deltas, the migration structure, the Supabase workflow, and the matching
edit to `CLAUDE.md`.

## Scope

In scope:

- Move `schema.sql` into a versioned Supabase migration.
- Revise the schema: drop the visible spine-number concept, add drag-and-drop
  ordering, tighten one RLS policy, harden `place_film`.
- Add a `reorder_shelf` function.
- Set up the Supabase CLI workflow (init, link, `db push`).
- Update `CLAUDE.md` so it matches the decisions below.
- A lightweight verification checklist for the schema.

Out of scope (later sub-projects):

- `/api/tmdb` proxy and any server code.
- Supabase client library (`src/lib/supabase.ts`).
- Magic-link auth and SSR sessions.
- Porting `shelf-prototype.html` to Astro components.
- Local Supabase stack via Docker (add only if destructive-migration testing
  becomes necessary).

## Decisions

### 1. Films cache is written by the client

The first time anyone adds a film, the browser inserts the row into `films`
using the anon key, with `spine_color` / `spine_dark` computed in the browser
from the public poster on `image.tmdb.org` (canvas, as the prototype already
does). `/api/tmdb` stays a read-only proxy whose only job is to hide the key.

Trade-off accepted: the `films` insert policy is `with check (true)`, so any
signed-in user can write any row into the shared cache. With two trusted users
on the free tier this is acceptable; the shared cache relies on trust. If that
ever stops being acceptable, the fix is to move the insert into `/api/tmdb`
with the service-role key and drop the client insert policy — a contained
change.

### 2. No visible spine number

Spines render without a number. `CLAUDE.md` previously described a permanent
per-film "spine number" in the Criterion style; that is dropped at the user's
request. Consequences:

- `shelf_items` needs no immutable numbering column. `position` alone carries
  the display order.
- Gaps in `position` (from deletions) are fine and are never compacted. The
  frontend renders items in `position` order and does not care about gaps.

### 3. Ordering is drag-and-drop

`position` is the visual order within one shelf. It is set once when the film
is added (appended at the end) and rewritten wholesale by `reorder_shelf` when
the user drags a spine. Reordering is a server function so two tabs cannot
compute conflicting orders client-side with a prior `max()`.

### 4. Sharing is read-only

Unchanged from the current schema: `shelves.is_public` plus the `/e/[slug]`
route serve a shelf without a session. "Edit mode" is `index.astro`, gated to
the owner. Each user's shelf — its items and their order — is fully
independent. The only thing users share is the `films` cache row when they
happen to add the same title.

### 5. Supabase workflow: CLI + hosted, no local Docker

Use the Supabase CLI with versioned migrations in `supabase/migrations/`,
linked to the hosted project, applied with `supabase db push`. No `supabase
start` / Docker for now — it is not needed to author or apply migrations.

Rationale: `CLAUDE.md` already mandates `supabase/migrations/` as the
structure. Pasting SQL by hand into the web editor loses history and
reproducibility. Cost is a one-time `supabase link` (project ref + database
password) and installing the CLI.

## File structure

```
supabase/
  config.toml                        # from `supabase init`
  migrations/
    <timestamp>_initial_schema.sql   # the whole schema, one initial migration
  tests/
    schema_checks.sql                # verification script (see Testing)
  README.md                          # link + db push steps, RLS note
```

One initial migration. The schema of a greenfield project has no value split
across files. `schema.sql` at the repo root is removed once its contents move
into the migration.

## Schema

Base is the current `schema.sql`. Only the deltas are listed here.

### `films` — unchanged

Global TMDB cache, primary key is the TMDB id, `spine_color` and `spine_dark`
precomputed and stored. RLS: anyone reads, authenticated users insert
(`with check (true)`), no update or delete from the client.

### `shelves` — unchanged

One per user, `slug` drives the public URL, `is_public` gates sessionless
access. RLS unchanged.

### `shelf_items` — documentation only

Columns unchanged: `(shelf_id, film_id)` composite primary key, `position
integer not null`, `added_at`. Every comment that calls `position` the "spine
number" is rewritten to describe it as the display order maintained by
`place_film` (on insert) and `reorder_shelf` (on drag-and-drop). No immutable
numbering column is added.

### `place_film(p_shelf uuid, p_film integer) returns integer` — hardened

- Inserts with `position = coalesce(max(position), 0) + 1` for that shelf,
  `on conflict (shelf_id, film_id) do nothing`.
- After the insert, reads the row's actual `position` with a `select` and
  returns that. On a conflict the film was already on the shelf at some other
  position; the caller now gets the real stored value instead of the
  discarded computed one.
- Stays `security invoker`, `set search_path = ''`.
- Accepted limitation: two concurrent inserts on the same shelf can still land
  on the same `position` (distinct `film_id`, so the primary key holds). It is
  cosmetic with no visible number and self-heals on the next reorder. No
  advisory lock for two users.

### `reorder_shelf(p_shelf uuid, p_order integer[]) returns void` — new

- `p_order` is the full list of `film_id` for that shelf in the desired order.
- Sets `position` to the 1-based index of each `film_id` in `p_order`, for
  rows matching `p_shelf`.
- `security invoker`, `set search_path = ''`. The `UPDATE` is checked against
  the `shelf_items` update policy, so a non-owner updates zero rows and gets no
  error.
- Client contract: always send the complete ordered list. `film_id`s omitted
  from `p_order` keep their old `position`, which can produce duplicates or
  gaps until the next full reorder.

Reference implementation:

```sql
create or replace function public.reorder_shelf(p_shelf uuid, p_order integer[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.shelf_items si
     set position = ord.idx
    from unnest(p_order) with ordinality as ord(film_id, idx)
   where si.shelf_id = p_shelf
     and si.film_id = ord.film_id;
end;
$$;
```

### `handle_new_user` — unchanged

Creates a shelf on sign-up with a provisional slug from the user's uuid.
Theoretical slug collision on the first ten hex characters is left as-is; the
user renames the slug anyway.

### RLS — one fix

The `shelf_items` update policy ("reorder your own shelf") currently has
`using` but no `with check`. Add a `with check` mirroring the `using` clause so
a row cannot be updated onto a shelf the caller does not own. All other
policies are unchanged.

## CLAUDE.md updates

Applied as an explicit implementation step, in the same change as the schema.

- Intro paragraph: drop "each with its spine number". Replace with wording that
  spines stand in a user-arranged order (drag-and-drop), no number shown.
- `## Database`, `shelf_items` bullet: `position` is the display order, set by
  `place_film` when the film is added and rewritten by `reorder_shelf` on
  drag-and-drop — not a spine number.
- `## Database`, "Rules that do not bend":
  - Rewrite the "server assigns the spine number" rule as: the server assigns
    the initial `position` (append at end) through `place_film`, and all
    reordering goes through `reorder_shelf`; same rationale that a client-side
    `max()` across two tabs collides.
  - Keep the spine-colour rule, clarify it is computed client-side by the first
    user to add the film (from the public poster) and then stored, never
    recomputed afterwards.
  - Add a rule: the client writes to the `films` cache with the anon key; the
    shared cache is trust-based for v1.
- `## Structure`: no change to the component list; `Spine` simply renders no
  number.
- Leave the `## Rejected decisions` section as-is; none of these reverse a
  rejected decision.

## Testing

`supabase/tests/schema_checks.sql` — a plain `psql` script of `DO $$ ... $$`
blocks with `ASSERT`, runnable against a fresh database (hosted dev project, or
a local instance if Docker is added later). Covers:

- Anon reads a public shelf, its `shelf_items`, and joined `films`.
- Anon cannot read a private shelf or its items.
- Authenticated user A cannot insert a `shelf_items` row into user B's shelf.
- `place_film` returns the new `position`; a second call for the same film
  returns the existing `position` and inserts nothing.
- `reorder_shelf` permutes `position` for the owner and is a no-op for a
  non-owner.
- `handle_new_user` creates exactly one shelf for a new `auth.users` row.

Run manually after `supabase db push`. Not wired into CI in this sub-project.

## Acceptance criteria

- `supabase db push` applies the initial migration to a clean database with no
  errors.
- `schema_checks.sql` passes end to end.
- `schema.sql` at the repo root is gone; its content lives in the migration.
- `CLAUDE.md` no longer mentions a visible or permanent spine number and
  describes `reorder_shelf`.
- `supabase/README.md` documents `supabase link` and `supabase db push`.
