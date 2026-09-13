import { SHELF_CAPACITY } from '../constants';
import type { Spine } from './colors';

/**
 * Where a film picked from search lands. Films get dragged into order
 * afterwards, so the landing shelf only has to be reasonable, not chosen.
 */

const SHELF_FULL_STATUS = 409;

/** The path is built here rather than in `src/constants/`, which stays
 *  declarations-only. */
const shelfFilmsPath = (shelfId: string) => `/api/shelves/${shelfId}/films`;

export interface ShelfSlot {
  id: string;
  filmCount: number;
}

export type AddOutcome =
  { ok: true; shelfId: string; position: number } | { ok: false; reason: 'all_full' | 'failed' };

function hasRoom(shelf: ShelfSlot): boolean {
  return shelf.filmCount < SHELF_CAPACITY;
}

function hasNumericPosition(body: unknown): body is { position: number } {
  return (
    typeof body === 'object' &&
    body !== null &&
    typeof (body as { position?: unknown }).position === 'number'
  );
}

export function firstShelfWithRoom(shelves: ShelfSlot[]): ShelfSlot | null {
  return shelves.find(hasRoom) ?? null;
}

/** Walks down the shelves with room. The counts come from the page render, so a
 *  second tab can have filled a shelf since: a 409 means "stale, try the next
 *  one", not "give up". */
export async function addFilmToFirstShelfWithRoom(
  shelves: ShelfSlot[],
  film: { tmdbId: number } & Spine,
  doFetch: typeof fetch = fetch,
): Promise<AddOutcome> {
  for (const shelf of shelves.filter(hasRoom)) {
    let response: Response;
    try {
      response = await doFetch(shelfFilmsPath(shelf.id), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(film),
      });
    } catch {
      return { ok: false, reason: 'failed' };
    }

    if (response.ok) {
      // Parsed separately from the doFetch try/catch above: a malformed
      // success body is a real bug in the endpoint, distinct from a network
      // failure, but the caller still only needs to know the add did not work.
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        return { ok: false, reason: 'failed' };
      }
      if (!hasNumericPosition(body)) return { ok: false, reason: 'failed' };
      return { ok: true, shelfId: shelf.id, position: body.position };
    }
    if (response.status !== SHELF_FULL_STATUS) return { ok: false, reason: 'failed' };
  }

  return { ok: false, reason: 'all_full' };
}
