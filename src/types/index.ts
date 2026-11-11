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
