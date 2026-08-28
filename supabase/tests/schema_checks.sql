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

-- Capture the real shelf ids while still superuser (RLS would hide
-- shelf-b from user A later). Stashed in a custom GUC so the DO block
-- below can read it: psql does not interpolate :'vars' inside $$ $$.
select id as shelf_a_id from public.shelves where slug = 'shelf-a' \gset
select id as shelf_b_id from public.shelves where slug = 'shelf-b' \gset
set local "test.shelf_b_id" = :'shelf_b_id';

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

-- ---- as user A ----------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" =
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare
  a_shelf uuid;
  pos int;
begin
  select id into a_shelf from public.shelves where slug = 'shelf-a';

  pos := public.place_film(a_shelf, 603);
  assert pos = 1, 'first place_film should return position 1 (got ' || pos || ')';

  pos := public.place_film(a_shelf, 603);
  assert pos = 1, 'repeat place_film should return existing position 1 (got ' || pos || ')';
  assert (select count(*) from public.shelf_items where shelf_id = a_shelf) = 1,
    'repeat place_film must not add a second row';
end $$;

do $$
declare blocked boolean := false;
begin
  begin
    perform public.place_film(current_setting('test.shelf_b_id')::uuid, 603);
  exception when insufficient_privilege then
    blocked := true;  -- expected: shelf_items insert RLS with-check rejects it
  end;
  assert blocked,
    'user A must be blocked by RLS from placing a film on user B private shelf';
end $$;

reset role;
rollback;

\echo 'schema_checks.sql: all assertions passed'
