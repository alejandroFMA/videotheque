-- =====================================================================
--  profiles.handle · the address of a public profile, /u/<handle>
--
--  Seeded from the account id, like a shelf's slug, rather than from the
--  email: a handle derived from the address would publish its local part
--  on a page anyone can open. The settings page (not built yet) is what
--  lets the owner pick a readable one.
-- =====================================================================
alter table public.profiles add column handle text;

update public.profiles
   set handle = substr(replace(id::text, '-', ''), 1, 10)
 where handle is null;

alter table public.profiles alter column handle set not null;
alter table public.profiles add constraint profiles_handle_key unique (handle);

-- =====================================================================
--  profile_by_handle · the one public read of a profile
--
--  The table keeps its "read your own profile" policy. A public SELECT
--  policy would let anyone list every account's name and handle through
--  the REST API; this function answers only for a handle the caller
--  already holds, which is what makes an unshared profile unlisted.
--  SECURITY DEFINER is what lets it read past that policy, so it returns
--  the public columns and nothing else.
-- =====================================================================
create or replace function public.profile_by_handle(p_handle text)
returns table (id uuid, display_name text, avatar_url text, handle text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.display_name, p.avatar_url, p.handle
    from public.profiles p
   where p.handle = p_handle;
$$;

revoke execute on function public.profile_by_handle(text) from public;
grant execute on function public.profile_by_handle(text) to anon, authenticated;

-- =====================================================================
--  Seed the handle alongside the profile
--
--  Replaces the function from the profiles migration. One trigger keeps
--  owning "what a new account comes with".
-- =====================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  short_id text := substr(replace(new.id::text, '-', ''), 1, 10);
begin
  insert into public.shelves (owner, slug)
  values (new.id, short_id);

  insert into public.profiles (id, display_name, handle)
  values (new.id, split_part(new.email, '@', 1), short_id);

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
