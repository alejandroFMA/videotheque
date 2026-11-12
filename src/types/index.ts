import type { FilmRecord } from '../lib/shelves';

/** `detail` of FILM_ADDED_EVENT. */
export interface FilmAddedDetail {
  shelfId: string;
  film: FilmRecord;
}

/** `detail` of FILM_REMOVED_EVENT. */
export interface FilmRemovedDetail {
  shelfId: string;
  filmId: number;
}

/** `detail` of FILM_MOVED_EVENT. */
export interface FilmMovedDetail {
  filmId: number;
  fromShelfId: string;
  toShelfId: string;
}

/** `detail` of SHELVES_REORDERED_EVENT: every shelf id, top to bottom. */
export interface ShelvesReorderedDetail {
  order: string[];
}
