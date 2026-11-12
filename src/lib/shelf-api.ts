/**
 * The browser's side of `src/pages/api/shelves/`. Each call resolves to whether
 * it worked and never rejects: every caller's failure path is the same "put it
 * back and say so", which a boolean expresses and a thrown error does not.
 */

const SHELVES_PATH = '/api/shelves';

const JSON_HEADERS = { 'content-type': 'application/json' };

async function succeeded(request: () => Promise<Response>): Promise<boolean> {
  try {
    return (await request()).ok;
  } catch {
    return false;
  }
}

export function removeFilmFromShelf(
  shelfId: string,
  filmId: number,
  doFetch: typeof fetch = fetch,
): Promise<boolean> {
  return succeeded(() =>
    doFetch(`${SHELVES_PATH}/${shelfId}/films/${filmId}`, { method: 'DELETE' }),
  );
}

/** `order` is every film id on the shelf, left to right. */
export function saveShelfOrder(
  shelfId: string,
  order: number[],
  doFetch: typeof fetch = fetch,
): Promise<boolean> {
  return succeeded(() =>
    doFetch(`${SHELVES_PATH}/${shelfId}/order`, {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ order }),
    }),
  );
}

export function createShelf(doFetch: typeof fetch = fetch): Promise<boolean> {
  return succeeded(() => doFetch(SHELVES_PATH, { method: 'POST' }));
}

/** A null `accentColor` takes the postit off; otherwise the whole label is sent. */
export function saveShelfLabel(
  shelfId: string,
  label: { name: string; accentColor: string; textColor: string } | { accentColor: null },
  doFetch: typeof fetch = fetch,
): Promise<boolean> {
  return succeeded(() =>
    doFetch(`${SHELVES_PATH}/${shelfId}`, {
      method: 'PATCH',
      headers: JSON_HEADERS,
      body: JSON.stringify(label),
    }),
  );
}

/** `order` is the target shelf's films after the move, the moved one included. */
export function moveFilmToShelf(
  toShelfId: string,
  move: { filmId: number; fromShelfId: string; order: number[] },
  doFetch: typeof fetch = fetch,
): Promise<boolean> {
  return succeeded(() =>
    doFetch(`${SHELVES_PATH}/${toShelfId}/moves`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(move),
    }),
  );
}

export function deleteShelf(shelfId: string, doFetch: typeof fetch = fetch): Promise<boolean> {
  return succeeded(() => doFetch(`${SHELVES_PATH}/${shelfId}`, { method: 'DELETE' }));
}

/** `order` is every one of the owner's shelf ids, top to bottom. */
export function saveShelvesOrder(order: string[], doFetch: typeof fetch = fetch): Promise<boolean> {
  return succeeded(() =>
    doFetch(`${SHELVES_PATH}/order`, {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ order }),
    }),
  );
}
