import type { SupabaseClient } from '@supabase/supabase-js';
import type { FilmRow } from './tmdb-mapping';

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

export interface ShelfSummary {
  id: string;
  name: string;
  slug: string;
  accent_color: string | null;
  is_public: boolean;
}

const SHELF_SUMMARY_COLUMNS = 'id, name, slug, accent_color, is_public';

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

/** `.eq('owner', …)` is REQUIRED: the SELECT policy also exposes other users'
 *  public shelves, so RLS alone would not scope this list to the caller. */
export async function listOwnShelves(sb: Db, owner: string): Promise<ShelfSummary[]> {
  const { data, error } = await sb
    .from('shelves')
    .select(SHELF_SUMMARY_COLUMNS)
    .eq('owner', owner)
    .order('created_at', { ascending: true });
  if (error) fail('listOwnShelves', error);
  return (data as ShelfSummary[] | null) ?? [];
}
