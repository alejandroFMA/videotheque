-- Schema verification. Run with:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -f supabase/tests/schema_checks.sql
-- Runs in one transaction and rolls back, so it is safe to re-run.

\set ON_ERROR_STOP on
begin;

-- ---- fixtures (as superuser: RLS and grants bypassed) ----------------
insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111',
   '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'a@test.dev', '',
   '{}', '{}', now(), now()),
  ('22222222-2222-2222-2222-222222222222',
   '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'b@test.dev', '',
   '{}', '{}', now(), now());

-- handle_new_user should have created exactly one shelf per user
do $$
declare n int;
begin
  select count(*) into n from public.shelves
   where owner in ('11111111-1111-1111-1111-111111111111',
                   '22222222-2222-2222-2222-222222222222');
  assert n = 2, 'handle_new_user did not create one shelf per user (got ' || n || ')';
end $$;

update public.shelves set is_public = true,  slug = 'shelf-a'
 where owner = '11111111-1111-1111-1111-111111111111';
update public.shelves set is_public = false, slug = 'shelf-b'
 where owner = '22222222-2222-2222-2222-222222222222';

insert into public.films (id, title, spine_color)
values (603, 'The Matrix', 'hsl(200 40% 40%)');

-- ---- as anon --------------------------------------------------------
set local role anon;
set local "request.jwt.claims" = '';

do $$
declare n int;
begin
  select count(*) into n from public.shelves where slug = 'shelf-b';
  assert n = 0, 'anon must not see a private shelf';

  select count(*) into n from public.shelves where slug = 'shelf-a';
  assert n = 1, 'anon must see a public shelf';
end $$;

do $$
declare wrote boolean := false;
begin
  begin
    insert into public.films (id, title, spine_color)
    values (999999, 'Nope', 'hsl(0 0% 0%)');
    wrote := true;
  exception when insufficient_privilege then
    null;  -- expected: RLS blocks the write
  end;
  assert not wrote, 'anon must not be able to write to the films cache';
end $$;

reset role;
rollback;

\echo 'schema_checks.sql: all assertions passed'
