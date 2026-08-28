# Supabase

One migration, `migrations/20260828173305_initial_schema.sql`, holds the whole
schema: the `films` / `shelves` / `shelf_items` tables, their RLS policies, the
`handle_new_user` sign-up trigger, and the `place_film` / `reorder_shelf`
functions.

## Local development

```bash
supabase start          # boots Postgres + auth on localhost (needs Docker)
supabase db reset       # drops everything and replays the migration
```

Local connection string:

```
postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

## Verify the schema

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -f tests/schema_checks.sql
```

The script runs in a transaction and rolls back, so it is safe to re-run. It
switches Postgres roles to exercise RLS as `anon` and `authenticated`.

## Apply to a hosted project

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase db push        # applies pending migrations to the linked project
```

RLS is enabled on all three tables. The browser uses the anon key; the
`films` cache is writable by any signed-in user by design (trust-based for
v1).
