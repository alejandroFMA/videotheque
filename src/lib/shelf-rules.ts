import {
  SHELF_CAPACITY,
  SHELF_COUNT_TOKEN,
  SHELF_DELETE_FILMS_MANY,
  SHELF_DELETE_FILMS_ONE,
  SHELF_DELETE_NAMED,
  SHELF_DELETE_UNNAMED,
  SHELF_FILMS_TOKEN,
  SHELF_NAME_TOKEN,
} from '../constants';

/** A film can always go back where it came from; elsewhere it needs room. */
export function canDropOn(targetFilmCount: number, isOriginShelf: boolean): boolean {
  return isOriginShelf || targetFilmCount < SHELF_CAPACITY;
}

function filmsClause(filmCount: number): string {
  if (filmCount === 0) return '';
  if (filmCount === 1) return SHELF_DELETE_FILMS_ONE;
  return SHELF_DELETE_FILMS_MANY.replace(SHELF_COUNT_TOKEN, String(filmCount));
}

/** `label` is null for a shelf without a postit. */
export function deleteShelfTitle(label: string | null, filmCount: number): string {
  const template = (label ? SHELF_DELETE_NAMED : SHELF_DELETE_UNNAMED).replace(
    SHELF_FILMS_TOKEN,
    filmsClause(filmCount),
  );
  // The owner's label goes in last, and through a function, so a label that
  // happens to contain a token or a `$&` pattern is printed as typed.
  return label ? template.replace(SHELF_NAME_TOKEN, () => label) : template;
}

/** How close to the top or bottom of the viewport a carried spine or shelf
 *  starts scrolling the page, and the fastest it scrolls, per frame. */
export const AUTO_SCROLL_EDGE_PX = 60;
export const AUTO_SCROLL_MAX_PX = 14;

/**
 * Pixels to scroll this frame while something is carried. Once a finger has
 * lifted a spine the page cannot scroll under it, so on a phone this is the
 * only way to reach a shelf that is off screen.
 */
export function edgeScrollStep(pointerY: number, viewportHeight: number): number {
  const fromTop = AUTO_SCROLL_EDGE_PX - pointerY;
  const fromBottom = pointerY - (viewportHeight - AUTO_SCROLL_EDGE_PX);
  const depth = Math.max(fromTop, fromBottom, 0);
  if (depth === 0) return 0;
  const step = Math.round(
    (Math.min(depth, AUTO_SCROLL_EDGE_PX) / AUTO_SCROLL_EDGE_PX) * AUTO_SCROLL_MAX_PX,
  );
  return fromTop > 0 ? -step : step;
}

/** How far a mouse travels before a press becomes a drag. A postit is also
 *  the button that edits the label, so lifting its shelf asks for more: a
 *  click's jitter must stay a click. */
export const SPINE_DRAG_THRESHOLD_PX = 6;
export const SHELF_DRAG_THRESHOLD_PX = 16;

/** A shelf only moves up or down, so only vertical travel counts for it. */
export function movedFarEnough(kind: 'spine' | 'shelf', dx: number, dy: number): boolean {
  if (kind === 'shelf') return Math.abs(dy) >= SHELF_DRAG_THRESHOLD_PX;
  return Math.hypot(dx, dy) >= SPINE_DRAG_THRESHOLD_PX;
}
