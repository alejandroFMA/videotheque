# Supabase

One migration, `migrations/20260828173305_initial_schema.sql`, holds the whole
schema: the `films` / `shelves` / `shelf_items` tables, their RLS policies, the
`handle_new_user` sign-up trigger, and the `place_film` / `reorder_shelf`
functions.

## Local development

```bash
supabase start          # boots Postgres + auth on localhost (needs Docker)
supabase db reset       # drops everything and replays the migration
supabase status         # prints every local URL, port, and key
supabase stop           # shuts the stack down (add --no-backup to wipe data)
```

If the CLI is not on your PATH, prefix every command with `npx --yes`
(`npx --yes supabase start`, ...).

Local endpoints (defaults):

| What                                 | URL                                                       |
| ------------------------------------ | --------------------------------------------------------- |
| Postgres                             | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |
| Studio (table + SQL UI)              | http://127.0.0.1:54323                                    |
| Inbucket (catches magic-link emails) | http://127.0.0.1:54324                                    |
| REST / auth API                      | http://127.0.0.1:54321                                    |

## Browsing and querying

**Studio** (http://127.0.0.1:54323) is the fastest way to see tables, run
SQL, and manage auth users — Table Editor, SQL Editor, and Authentication
in the left rail.

**psql**, connected as the `postgres` superuser (RLS is bypassed for this
role — you see every row):

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
```

If `psql` is not installed, go through the running container:

```bash
docker exec -it supabase_db_videotheque psql -U postgres -d postgres
```

Useful meta-commands once you are in:

```
\dt                     list tables in the public schema
\d shelves               columns, indexes, FKs and RLS policies of one table
\df public.*             list the functions (place_film, reorder_shelf, ...)
\dp shelf_items          show the RLS policies on a table
\du                      list roles (postgres, anon, authenticated, ...)
\x on                    switch to expanded row output (nice for wide tables)
\q                       quit
```

Plain queries:

```sql
select id, name, slug, accent_color, is_public from public.shelves;

-- one shelf with its films in display order (the join the app uses)
select si.position, f.title, f.year
  from public.shelf_items si
  join public.films f on f.id = si.film_id
 where si.shelf_id = '<shelf-uuid>'
 order by si.position;

-- who owns what
select u.email, s.name, s.slug
  from public.shelves s
  join auth.users u on u.id = s.owner
 order by u.email;
```

**Seeing what a browser session would see.** The app connects as `anon`
or `authenticated`, and RLS filters every query. To reproduce that from
psql, switch role inside a transaction:

```sql
begin;
set local role authenticated;
set local "request.jwt.claims" =
  '{"sub":"<your-user-uuid>","role":"authenticated"}';

select * from public.shelves;          -- only public shelves + your own

reset role;
rollback;
```

Set `role` to `anon` with `"request.jwt.claims" = ''` to see the
logged-out view.

## Users

Local auth has no real email delivery — magic-link mails land in Inbucket
(http://127.0.0.1:54324).

- **Create a user:** Studio -> Authentication -> Add user (set a password
  so you can also use it from SQL/tests), or trigger a magic link from the
  app and open it in Inbucket.
- Every new `auth.users` row fires `handle_new_user`, which seeds that
  user's first shelf. Check it:

  ```sql
  select u.email, s.name, s.slug
    from auth.users u
    join public.shelves s on s.owner = u.id;
  ```

- **Your own account:** create it with your real email
  (`alexfmarquez@gmail.com`) once auth is wired to the hosted project;
  there are no per-user database privileges to grant — access is entirely
  RLS-driven from the `owner` column, so owning the row _is_ the
  privilege. The `postgres` role is the only elevated one and is for
  migrations and local debugging, not app use.

## Verify the schema

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -f tests/schema_checks.sql
```

The script runs in a transaction and rolls back, so it is safe to re-run. It
switches Postgres roles to exercise RLS as `anon` and `authenticated`.

## Auth setup (hosted project)

The app uses magic-link (email OTP) auth via `@supabase/ssr`. Configure the
linked project once:

1. **Authentication → Providers → Email:** enable email provider and magic
   link; keep "Enable email signups" on (sign-up is open by design).
2. **Authentication → URL Configuration:**
   - **Site URL:** the production URL (e.g. `https://videotheque.vercel.app`).
   - **Redirect URLs:** exact paths only —
     `http://localhost:3000/auth/confirm` and
     `https://<prod-domain>/auth/confirm`. `signInWithOtp` sends
     `emailRedirectTo` from the browser's origin, so this allowlist is what
     stops a link being aimed elsewhere. For Vercel previews add one narrow
     wildcard (`https://videotheque-*-<team>.vercel.app/auth/confirm`), not
     `**`.
3. **Authentication → Email Templates → Magic Link:** set the link to

   ```
   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email
   ```

   The default template uses `{{ .ConfirmationURL }}`, which drives the PKCE
   `?code` flow instead and breaks cross-device sign-in.

4. **Local `.env`:** set `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY`
   from **Project Settings → API** (Project URL, and the publishable/anon key).

### Testing magic links locally

With the local stack (`supabase start`), emails are caught by Inbucket at
http://127.0.0.1:54324 — no real delivery. The local API URL and anon key come
from `supabase status`. Against the hosted project, real email is sent to the
address you enter.

## Apply to a hosted project

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase db push        # applies pending migrations to the linked project
```

RLS is enabled on all three tables. The browser uses the anon key; the
`films` cache is writable by any signed-in user by design (trust-based for
v1).
