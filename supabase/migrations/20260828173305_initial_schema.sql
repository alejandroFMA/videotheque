-- =====================================================================
--  Videothèque · initial schema
-- =====================================================================

-- ---------------------------------------------------------------------
--  films · global TMDB cache
--
--  One row per film, shared by every shelf. Written by the client with
--  the anon key the first time anyone adds it. spine_color / spine_dark
--  are computed in that user's browser from the public poster and stored
--  here; they are never recomputed afterwards. Rendering a shelf reads
--  only from this table, never from TMDB.
-- ---------------------------------------------------------------------
create table public.films (
  id             integer primary key,          -- TMDB id
  title          text    not null,
  original_title text,
  year           smallint,
  poster_path    text,                          -- relative path, no host
  overview       text,
  director       text,
  spine_color    text    not null,              -- precomputed hsl()
  spine_dark     boolean not null default false,
  fetched_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------
--  shelves · one shelf per person
--
--  slug drives the public URL /e/<slug>; is_public gates access without
--  a session. Kept separate from name so a rename does not break links.
-- ---------------------------------------------------------------------
create table public.shelves (
  id         uuid primary key default gen_random_uuid(),
  owner      uuid not null references auth.users on delete cascade,
  name       text not null default 'My shelf',
  slug       text not null unique,
  is_public  boolean not null default true,
  created_at timestamptz not null default now()
);

create index shelves_owner_idx on public.shelves (owner);

-- ---------------------------------------------------------------------
--  shelf_items · which film sits on which shelf, and in what order
--
--  The composite primary key gives "cannot add the same film twice" for
--  free. position is the display order within one shelf: place_film sets
--  it when the film is added (appended at the end), reorder_shelf
--  rewrites it on drag-and-drop. It is not a spine number, it is never
--  shown, and gaps left by deletion are not compacted.
-- ---------------------------------------------------------------------
create table public.shelf_items (
  shelf_id  uuid    not null references public.shelves on delete cascade,
  film_id   integer not null references public.films,
  position  integer not null,
  added_at  timestamptz not null default now(),
  primary key (shelf_id, film_id)
);

create index shelf_items_order_idx on public.shelf_items (shelf_id, position);

-- =====================================================================
--  Row level security
--
--  With this in place the browser talks straight to the database with
--  the anon key; Postgres filters every query by who you are.
-- =====================================================================
alter table public.films       enable row level security;
alter table public.shelves     enable row level security;
alter table public.shelf_items enable row level security;

-- films: open catalogue for reads, signed-in users may cache new rows.
-- Nothing updates or deletes films from the client.
create policy "anyone reads the catalogue"
  on public.films for select
  using (true);

create policy "signed-in users cache new films"
  on public.films for insert to authenticated
  with check (true);

-- shelves: you see public ones and your own; you only touch your own.
create policy "public or own shelves"
  on public.shelves for select
  using (is_public or owner = (select auth.uid()));

create policy "create your own shelf"
  on public.shelves for insert to authenticated
  with check (owner = (select auth.uid()));

create policy "edit your own shelf"
  on public.shelves for update to authenticated
  using      (owner = (select auth.uid()))
  with check (owner = (select auth.uid()));

create policy "delete your own shelf"
  on public.shelves for delete to authenticated
  using (owner = (select auth.uid()));

-- shelf_items: permission is inherited from the parent shelf.
create policy "read items on a visible shelf"
  on public.shelf_items for select
  using (exists (
    select 1 from public.shelves s
    where s.id = shelf_id
      and (s.is_public or s.owner = (select auth.uid()))
  ));

create policy "place films on your own shelf"
  on public.shelf_items for insert to authenticated
  with check (exists (
    select 1 from public.shelves s
    where s.id = shelf_id and s.owner = (select auth.uid())
  ));

-- both using and with check, so a row cannot be moved onto a shelf you
-- do not own.
create policy "reorder your own shelf"
  on public.shelf_items for update to authenticated
  using (exists (
    select 1 from public.shelves s
    where s.id = shelf_id and s.owner = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.shelves s
    where s.id = shelf_id and s.owner = (select auth.uid())
  ));

create policy "remove films from your own shelf"
  on public.shelf_items for delete to authenticated
  using (exists (
    select 1 from public.shelves s
    where s.id = shelf_id and s.owner = (select auth.uid())
  ));

-- =====================================================================
--  Give every new user a shelf on sign-up
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
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
