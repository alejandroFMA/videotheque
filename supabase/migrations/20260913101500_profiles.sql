-- =====================================================================
--  profiles · the name and face the app header shows
--
--  One row per account, seeded at sign-up. Sign-up is a magic link with a
--  single field, so the display name starts as the email's local part and
--  the settings page (not built yet) is what makes it editable.
-- =====================================================================
create table public.profiles (
  id           uuid primary key references auth.users on delete cascade,
  display_name text not null,
  avatar_url   text,                       -- filled by the settings page, later
  created_at   timestamptz not null default now()
);

-- The ensure_rls event trigger already enabled RLS on create; this is
-- stated anyway so the file reads as a complete description of the table.
alter table public.profiles enable row level security;

-- No insert policy: the sign-up trigger is the only writer. No delete
-- policy either: the cascade from auth.users is the only remover.
create policy "read your own profile"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

create policy "edit your own profile"
  on public.profiles for update to authenticated
  using      (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- =====================================================================
--  Seed the profile alongside the first shelf
--
--  Replaces the function from the initial schema. One trigger keeps
--  owning "what a new account comes with".
-- =====================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.shelves (owner, slug)
  values (
    new.id,
    substr(replace(new.id::text, '-', ''), 1, 10)
  );

  insert into public.profiles (id, display_name)
  values (new.id, split_part(new.email, '@', 1));

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
