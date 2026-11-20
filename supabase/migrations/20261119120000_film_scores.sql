-- ---------------------------------------------------------------------
--  films · the score stickers on the front of the case
-- ---------------------------------------------------------------------
-- The Rotten Tomatoes Tomatometer and the IMDb rating, read from OMDb.
-- Written server-side only: by POST /api/shelves/[id]/films when it inserts
-- a new row, and by scripts/backfill-film-details.ts for rows cached before
-- these columns existed. There is still no update policy on films.
--
-- scores_checked_at is null until OMDb has been asked and answered (a
-- missing API key counts as not asked), so the backfill can tell "never
-- looked up, or OMDb failed" (retry) from "OMDb has no scores" (leave alone).

alter table public.films
  add column rt_score          smallint check (rt_score between 0 and 100),
  add column imdb_rating       numeric(3,1) check (imdb_rating between 0 and 10),
  add column scores_checked_at timestamptz;
