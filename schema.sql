-- =====================================================================
--  Videotheque · initial schema
--  Run top to bottom in the Supabase SQL editor.
-- =====================================================================


-- ---------------------------------------------------------------------
--  films · global TMDB cache
--
--  One row per film, shared by every shelf. Filled the first time anyone
--  adds it. From then on, rendering a shelf never calls TMDB.
--
--  The primary key is the TMDB id rather than our own uuid: it is
--  already unique and stable, and it saves a lookup table.
-- ---------------------------------------------------------------------
create table public.films (
  id             integer primary key,          -- TMDB id
  title          text    not null,
  original_title text,
  year           smallint,
  poster_path    text,                         -- relative path, no host
  overview       text,
  director       text,
  spine_color    text    not null,             -- precomputed hsl()
  spine_dark     boolean not null default false, -- dark text on the spine
  fetched_at     timestamptz not null default now()
);


-- ---------------------------------------------------------------------
--  shelves · one shelf per person, for now
--
--  The slug is what goes in the public URL: /e/olivia. Kept separate
--  from the name so a shelf can be renamed without breaking links that
--  are already out there.
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
--  shelf_items · which film sits on which shelf
--
--  The composite primary key gives "you cannot add the same film twice"
--  for free: the duplicate insert fails in the database, so the client
--  never has to check first.
--
--  position is the spine number. On insert: max(position) + 1.
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
--  With this in place the browser can talk straight to the database
--  using the anon key. Postgres filters every query by who you are.
--  No hand-written API layer is needed to police permissions.
--
--  auth.uid() is wrapped in (select ...) on purpose: that way Postgres
--  evaluates it once per query instead of once per row.
-- =====================================================================

alter table public.films       enable row level security;
alter table public.shelves     enable row level security;
alter table public.shelf_items enable row level security;


-- films: open catalogue for reads, only signed-in users may cache.
-- Nothing edits or deletes films from the client; the proxy function
-- does that with the service role key.
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

create policy "reorder your own shelf"
  on public.shelf_items for update to authenticated
  using (exists (
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
--
--  Without this, a new user signs in and has nowhere to put anything.
--  security definer because the trigger runs before a session exists.
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
    -- provisional slug from the uuid; the user can change it later
    substr(replace(new.id::text, '-', ''), 1, 10)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- =====================================================================
--  Place a film on a shelf
--
--  Resolves the spine number server-side. Computing it in the client
--  with a prior max() lets two open tabs claim the same number.
-- =====================================================================
create or replace function public.place_film(p_shelf uuid, p_film integer)
returns integer
language plpgsql
security invoker          -- respects the policies above
set search_path = ''
as $$
declare
  next_pos integer;
begin
  select coalesce(max(position), 0) + 1
    into next_pos
    from public.shelf_items
   where shelf_id = p_shelf;

  insert into public.shelf_items (shelf_id, film_id, position)
  values (p_shelf, p_film, next_pos)
  on conflict (shelf_id, film_id) do nothing;

  return next_pos;
end;
$$;


-- =====================================================================
--  Reading a whole shelf from the client, in one call:
--
--    const { data } = await supabase
--      .from('shelf_items')
--      .select('position, films(*)')
--      .eq('shelf_id', id)
--      .order('position');
--
--  PostgREST follows the foreign key and nests the film inside each
--  item. The join is not written by hand.
-- =====================================================================
