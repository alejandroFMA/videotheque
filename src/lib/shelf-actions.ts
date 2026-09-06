import type { SupabaseClient } from '@supabase/supabase-js';
import {
  badGateway,
  badRequest,
  conflict,
  internalError,
  json,
  noContent,
  notFound,
  unauthorized,
} from './http';
import {
  ensureFilmCached,
  findOwnShelf,
  placeFilm,
  removeFilm,
  reorderShelf,
  shelfHasFilm,
  shelfItemCount,
  type SpineColour,
} from './shelves';
import { fetchTmdbMovie, TmdbUnavailableError } from './tmdb-proxy';
import { toFilmRow } from './tmdb-mapping';
import { SHELF_CAPACITY, SHELF_FULL_MESSAGE } from '../constants';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface RemoveFilmContext {
  supabase: SupabaseClient;
  owner: string | undefined;
  shelfId: string | undefined;
  filmId: unknown;
}

/** RLS is the backstop, but a stranger's write silently affects zero rows, so
 *  only this check can produce an honest status code. */
async function requireOwnShelf(
  supabase: SupabaseClient,
  owner: string | undefined,
  shelfId: string | undefined,
): Promise<Response | { id: string }> {
  if (!owner) return unauthorized();
  if (!shelfId || !UUID_PATTERN.test(shelfId)) return badRequest('invalid shelf id');

  let shelf: Awaited<ReturnType<typeof findOwnShelf>>;
  try {
    shelf = await findOwnShelf(supabase, shelfId, owner);
  } catch (err) {
    console.error('[api/shelves] shelf lookup failed', err);
    return internalError();
  }
  // Absent and not-yours give the same answer: never confirm which ids exist.
  if (!shelf) return notFound();
  return { id: shelf.id };
}

function parseFilmId(raw: unknown): number | null {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : null;
}

export async function handleRemoveFilm(ctx: RemoveFilmContext): Promise<Response> {
  const guard = await requireOwnShelf(ctx.supabase, ctx.owner, ctx.shelfId);
  if (guard instanceof Response) return guard;

  const filmId = parseFilmId(ctx.filmId);
  if (filmId === null) return badRequest('invalid film id');

  try {
    await removeFilm(ctx.supabase, guard.id, filmId);
  } catch (err) {
    console.error('[api/shelves] remove failed', err);
    return internalError();
  }
  return noContent();
}

export interface ReorderContext {
  supabase: SupabaseClient;
  owner: string | undefined;
  shelfId: string | undefined;
  body: unknown;
}

/** Null for an absent or malformed body, which handlers turn into 400 rather
 *  than letting the route throw. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function parseOrder(body: unknown): number[] | null {
  if (typeof body !== 'object' || body === null) return null;
  const order = (body as { order?: unknown }).order;
  if (!Array.isArray(order) || order.length === 0) return null;
  if (!order.every((id) => typeof id === 'number' && Number.isInteger(id) && id > 0)) return null;
  if (new Set(order).size !== order.length) return null;
  return order as number[];
}

export async function handleReorderShelf(ctx: ReorderContext): Promise<Response> {
  const guard = await requireOwnShelf(ctx.supabase, ctx.owner, ctx.shelfId);
  if (guard instanceof Response) return guard;

  const order = parseOrder(ctx.body);
  if (order === null) return badRequest('invalid order');

  try {
    await reorderShelf(ctx.supabase, guard.id, order);
  } catch (err) {
    console.error('[api/shelves] reorder failed', err);
    return internalError();
  }
  return noContent();
}

// 201 tells the caller the film was new to the global cache, 200 that it was
// already there. Both mean it now sits on the shelf.
const CREATED = 201;
const OK = 200;

// Space-separated hsl() with integer components — what the browser computes
// from the poster.
const SPINE_COLOR_PATTERN = /^hsl\((\d{1,3}) (\d{1,3})% (\d{1,3})%\)$/;
const MAX_HUE = 360;
const MAX_PERCENT = 100;

export interface AddFilmContext {
  supabase: SupabaseClient;
  owner: string | undefined;
  shelfId: string | undefined;
  body: unknown;
  token: string | undefined;
  fetch: typeof globalThis.fetch;
}

interface AddFilmRequest {
  tmdbId: number;
  spine: SpineColour;
}

function parseSpineColor(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const match = SPINE_COLOR_PATTERN.exec(raw);
  if (!match) return null;
  const [, hue, saturation, lightness] = match.map(Number);
  if (hue > MAX_HUE || saturation > MAX_PERCENT || lightness > MAX_PERCENT) return null;
  return raw;
}

function parseAddFilm(body: unknown): AddFilmRequest | null {
  if (typeof body !== 'object' || body === null) return null;
  const { tmdbId, spineColor, spineDark } = body as Record<string, unknown>;

  const id = parseFilmId(tmdbId);
  const colour = parseSpineColor(spineColor);
  if (id === null || colour === null || typeof spineDark !== 'boolean') return null;

  return { tmdbId: id, spine: { spine_color: colour, spine_dark: spineDark } };
}

export async function handleAddFilm(ctx: AddFilmContext): Promise<Response> {
  const guard = await requireOwnShelf(ctx.supabase, ctx.owner, ctx.shelfId);
  if (guard instanceof Response) return guard;

  const request = parseAddFilm(ctx.body);
  if (!request) return badRequest('invalid film payload');

  if (!ctx.token) {
    console.error('[api/shelves] TMDB_ACCESS_TOKEN is not set');
    return internalError();
  }

  try {
    // place_film is idempotent, so a film the shelf already holds cannot grow
    // it past the cap.
    const alreadyOnShelf = await shelfHasFilm(ctx.supabase, guard.id, request.tmdbId);
    if (!alreadyOnShelf && (await shelfItemCount(ctx.supabase, guard.id)) >= SHELF_CAPACITY) {
      return conflict({ error: 'shelf_full', message: SHELF_FULL_MESSAGE });
    }

    // Only the spine colour is taken from the browser: the films cache is
    // global, so one client's bad row would reach every shelf.
    const movie = await fetchTmdbMovie(request.tmdbId, ctx.token, ctx.fetch);
    const { film, created } = await ensureFilmCached(ctx.supabase, toFilmRow(movie), request.spine);
    const position = await placeFilm(ctx.supabase, guard.id, request.tmdbId);

    return json({ position, film }, created ? CREATED : OK);
  } catch (err) {
    if (err instanceof TmdbUnavailableError) {
      console.error('[api/shelves] TMDB lookup failed', err);
      return badGateway('tmdb unavailable');
    }
    console.error('[api/shelves] add failed', err);
    return internalError();
  }
}
