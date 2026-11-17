-- ---------------------------------------------------------------------
--  films · what the back of the 3D case draws
-- ---------------------------------------------------------------------
-- Written server-side only: by POST /api/shelves/[id]/films when it inserts
-- a new row, and once by scripts/backfill-film-details.ts for rows cached
-- before these columns existed. There is still no update policy on films:
-- a browser cannot rewrite the global cache.

alter table public.films
  add column backdrop_paths text[] not null default '{}',
  add column cast_names     text[] not null default '{}',
  add column crew           jsonb  not null default '[]',
  add column companies      jsonb  not null default '[]';
