-- =====================================================================
--  Videothèque · owner-chosen shelf order, and moving a film between
--  shelves
--
--  Shelves were drawn oldest first. The owner now drags them into an
--  order of their own, so that order has to live in the database:
--  shelves.position, assigned by the server like shelf_items.position.
--
--  A film lives on at most one of an owner's shelves (the app refuses a
--  second add). Moving it is therefore one statement on one row, inside
--  one function call: it can never end up on two shelves, or on none.
-- =====================================================================


-- ---------------------------------------------------------------------
--  shelves.position · 1-based display order within one owner's shelves
--
--  Existing rows keep the order they were drawn in (created_at), with
--  id as a tie-break for shelves created in the same transaction.
-- ---------------------------------------------------------------------
alter table public.shelves add column if not exists position integer;

update public.shelves s
   set position = ranked.idx
  from (
    select id, row_number() over (partition by owner order by created_at, id) as idx
      from public.shelves
  ) ranked
 where s.id = ranked.id
   and s.position is null;

alter table public.shelves alter column position set not null;

create index if not exists shelves_owner_position_idx
  on public.shelves (owner, position);


-- ---------------------------------------------------------------------
--  New shelves are appended after the owner's last one. A trigger rather
--  than a column default, because the default cannot see other rows; it
--  also covers the shelf handle_new_user seeds at sign-up.
-- ---------------------------------------------------------------------
create or replace function public.assign_shelf_position()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.position is null then
    select coalesce(max(position), 0) + 1 into new.position
      from public.shelves
     where owner = new.owner;
  end if;
  return new;
end;
$$;

revoke execute on function public.assign_shelf_position() from public, anon, authenticated;

drop trigger if exists shelves_assign_position on public.shelves;
create trigger shelves_assign_position
  before insert on public.shelves
  for each row execute function public.assign_shelf_position();


-- =====================================================================
--  reorder_shelves · apply a drag-and-drop ordering of shelves in one call
--
--  p_order is the owner's shelf ids in the desired order; position
--  becomes the 1-based index. Runs as the caller and filters on
--  auth.uid(), so a non-owner updates nothing.
-- =====================================================================
create or replace function public.reorder_shelves(p_order uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.shelves s
     set position = ord.idx::integer
    from unnest(p_order) with ordinality as ord(shelf_id, idx)
   where s.id = ord.shelf_id
     and s.owner = (select auth.uid());
end;
$$;


-- =====================================================================
--  move_film · take a film off one shelf and onto another
--
--  p_order is the target shelf's full film list after the move, the
--  moved film included, so the server assigns every position. Runs as
--  the caller: the shelf_items update policy checks the old row and the
--  new one, so both shelves must be the caller's. Zero rows updated —
--  the film was not on p_from, or p_from is not the caller's — raises,
--  so the endpoint never reports a move that did not happen.
-- =====================================================================
create or replace function public.move_film(
  p_film  integer,
  p_from  uuid,
  p_to    uuid,
  p_order integer[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.shelf_items
     set shelf_id = p_to
   where shelf_id = p_from
     and film_id  = p_film;

  if not found then
    raise exception 'film % is not on shelf %', p_film, p_from;
  end if;

  perform public.reorder_shelf(p_to, p_order);
end;
$$;
