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
variables) in the Vercel project settings. It is read at runtime via
`astro:env/server` (`getSecret`), so rotating it needs no rebuild.

### Follow-ups before a public deploy

- **`/api/tmdb` is currently unauthenticated.** Abuse control (origin check +
  rate limit) lands with the auth cycle. Do not deploy the proxy on a public URL
  before then.

### Security notes

- `npm audit` reports a `path-to-regexp` ReDoS advisory in `@astrojs/vercel`'s
  dependency tree (`@vercel/routing-utils`). It runs at **build time** on
  developer-authored route patterns, never on request input, so it is not
  exploitable here, and there is no forward fix compatible with Astro 7 (the only
  `npm` remedy is a major downgrade to `@astrojs/vercel@8`). Do not run
  `npm audit fix --force`. Re-check when `@astrojs/vercel` bumps the dependency.

## Attribution

This product uses the TMDB API but is not endorsed or certified by TMDB.
Posters are served from `image.tmdb.org` and never rehosted. TMDB's free API
licence is non-commercial.
