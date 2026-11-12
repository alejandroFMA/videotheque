import type { SupabaseClient } from '@supabase/supabase-js';
import type { FilmRow } from './tmdb-mapping';
import type { ShelfSlot } from './shelf-target';

type Db = Pick<SupabaseClient, 'from' | 'rpc'>;

export interface ShelfRef {
  id: string;
  slug: string;
}

/** Written together and exactly once, on the film's first insert. */
export interface SpineColour {
  spine_color: string;
  spine_dark: boolean;
}

export interface FilmRecord extends FilmRow, SpineColour {
  fetched_at: string;
}

export interface ShelfItem {
  position: number;
  films: FilmRecord;
}

export interface ShelfWithFilms {
  id: string;
  name: string;
  slug: string;
  accent_color: string | null;
  /** Null letters the postit automatically, by the card's luminance. */
  accent_text_color: string | null;
  is_public: boolean;
  shelf_items: ShelfItem[];
}

/** Either the postit goes, or it is replaced whole: a name with no colour
 *  draws nothing, so the two are never written apart. */
export type ShelfLabelChange =
  { accent_color: null } | { name: string; accent_color: string; accent_text_color: string };

const SHELF_WITH_FILMS_COLUMNS =
  'id, name, slug, accent_color, accent_text_color, is_public, shelf_items(position, films(*))';

/** Sorted here rather than in the query: the order is the whole point of
 *  `position`, so it should not hang on an embedded-resource option. */
export function filmsInOrder(shelf: ShelfWithFilms): FilmRecord[] {
  return [...shelf.shelf_items].sort((a, b) => a.position - b.position).map((item) => item.films);
}

/** The shape the browser's add flow needs: id and how full it is. */
export function toShelfSlots(shelves: ShelfWithFilms[]): ShelfSlot[] {
  return shelves.map((shelf) => ({ id: shelf.id, filmCount: shelf.shelf_items.length }));
}

/** Every film id on these shelves, for the search dropdown's "already there"
 *  badge. */
export function shelvedFilmIds(shelves: ShelfWithFilms[]): number[] {
  return shelves.flatMap((shelf) => shelf.shelf_items.map((item) => item.films.id));
}

function fail(operation: string, error: { message: string }): never {
  throw new Error(`[shelves] ${operation} failed: ${error.message}`);
}

/** Null when the shelf is absent or not the caller's; callers turn both into 404. */
export async function findOwnShelf(
  sb: Db,
  shelfId: string,
  owner: string,
): Promise<ShelfRef | null> {
  const { data, error } = await sb
    .from('shelves')
    .select('id, slug')
    .eq('id', shelfId)
    .eq('owner', owner)
    .maybeSingle();
  if (error) fail('findOwnShelf', error);
  return (data as ShelfRef | null) ?? null;
}

export async function shelfItemCount(sb: Db, shelfId: string): Promise<number> {
  const { count, error } = await sb
    .from('shelf_items')
    .select('film_id', { count: 'exact', head: true })
    .eq('shelf_id', shelfId);
  if (error) fail('shelfItemCount', error);
  return count ?? 0;
}

export async function shelfHasFilm(sb: Db, shelfId: string, filmId: number): Promise<boolean> {
  const { data, error } = await sb
    .from('shelf_items')
    .select('film_id')
    .eq('shelf_id', shelfId)
    .eq('film_id', filmId)
    .maybeSingle();
  if (error) fail('shelfHasFilm', error);
  return data !== null;
}

/** `ignoreDuplicates` lets two tabs race harmlessly: the first-written spine
 *  colour wins and is never recomputed, so an empty insert result means the row
 *  must be read back rather than overwritten. */
export async function ensureFilmCached(
  sb: Db,
  row: FilmRow,
  spine: SpineColour,
): Promise<{ film: FilmRecord; created: boolean }> {
  const { data: insertedRows, error: insertError } = await sb
    .from('films')
    .upsert({ ...row, ...spine }, { ignoreDuplicates: true })
    .select();
  if (insertError) fail('ensureFilmCached insert', insertError);

  const inserted = (insertedRows as FilmRecord[] | null) ?? [];
  if (inserted.length > 0) return { film: inserted[0], created: true };

  const { data: existing, error: selectError } = await sb
    .from('films')
    .select('*')
    .eq('id', row.id)
    .single();
  if (selectError) fail('ensureFilmCached select', selectError);
  return { film: existing as FilmRecord, created: false };
}

/** The server assigns the position: a client-side max() lets two tabs collide. */
export async function placeFilm(sb: Db, shelfId: string, filmId: number): Promise<number> {
  const { data, error } = await sb.rpc('place_film', { p_shelf: shelfId, p_film: filmId });
  if (error) fail('placeFilm', error);
  return data as number;
}

export async function removeFilm(sb: Db, shelfId: string, filmId: number): Promise<void> {
  const { error } = await sb
    .from('shelf_items')
    .delete()
    .eq('shelf_id', shelfId)
    .eq('film_id', filmId);
  if (error) fail('removeFilm', error);
}

export async function reorderShelf(sb: Db, shelfId: string, order: number[]): Promise<void> {
  const { error } = await sb.rpc('reorder_shelf', { p_shelf: shelfId, p_order: order });
  if (error) fail('reorderShelf', error);
}

/** `order` is the target shelf's whole film list after the move, the moved
 *  film included, so the server assigns every position. */
export async function moveFilm(
  sb: Db,
  filmId: number,
  fromShelfId: string,
  toShelfId: string,
  order: number[],
): Promise<void> {
  const { error } = await sb.rpc('move_film', {
    p_film: filmId,
    p_from: fromShelfId,
    p_to: toShelfId,
    p_order: order,
  });
  if (error) fail('moveFilm', error);
}

export async function reorderShelves(sb: Db, order: string[]): Promise<void> {
  const { error } = await sb.rpc('reorder_shelves', { p_order: order });
  if (error) fail('reorderShelves', error);
}

/** The shelf's items go with it (`on delete cascade`); the films cache stays. */
export async function deleteShelf(sb: Db, shelfId: string): Promise<void> {
  const { error } = await sb.from('shelves').delete().eq('id', shelfId);
  if (error) fail('deleteShelf', error);
}

export async function countOwnShelves(sb: Db, owner: string): Promise<number> {
  const { count, error } = await sb
    .from('shelves')
    .select('id', { count: 'exact', head: true })
    .eq('owner', owner);
  if (error) fail('countOwnShelves', error);
  return count ?? 0;
}

/**
 * One call for everything a bookcase draws: PostgREST follows both foreign
 * keys, and nothing here reaches TMDB.
 *
 * `.eq('owner', …)` is REQUIRED: the SELECT policy also exposes other users'
 * public shelves, so RLS alone would not scope this list to one person.
 * `publicOnly` is for a visitor's view of that person, where RLS would hide the
 * private shelves from a stranger but not from the owner looking at their own
 * public page.
 */
export async function listShelvesWithFilms(
  sb: Db,
  owner: string,
  { publicOnly = false }: { publicOnly?: boolean } = {},
): Promise<ShelfWithFilms[]> {
  let query = sb.from('shelves').select(SHELF_WITH_FILMS_COLUMNS).eq('owner', owner);
  if (publicOnly) query = query.eq('is_public', true);
  const { data, error } = await query.order('position', { ascending: true });
  if (error) fail('listShelvesWithFilms', error);
  // The untyped client cannot know `films` is the one side of the foreign key
  // and infers an array, hence the double cast.
  return (data as unknown as ShelfWithFilms[] | null) ?? [];
}

export async function createShelf(sb: Db, owner: string, slug: string): Promise<{ id: string }> {
  const { data, error } = await sb.from('shelves').insert({ owner, slug }).select('id').single();
  if (error) fail('createShelf', error);
  return data as { id: string };
}

export async function updateShelfLabel(
  sb: Db,
  shelfId: string,
  change: ShelfLabelChange,
): Promise<void> {
  const { error } = await sb.from('shelves').update(change).eq('id', shelfId);
  if (error) fail('updateShelfLabel', error);
}
