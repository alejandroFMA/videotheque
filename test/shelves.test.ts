import { describe, expect, it } from 'vitest';
import { fakeSupabase } from './helpers/fake-supabase';
import {
  ensureFilmCached,
  findOwnShelf,
  listOwnShelves,
  placeFilm,
  removeFilm,
  reorderShelf,
  shelfHasFilm,
  shelfItemCount,
} from '../src/lib/shelves';

const SHELF = '11111111-2222-3333-4444-555555555555';
const OWNER = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const FILM_ROW = {
  id: 603,
  title: 'The Matrix',
  original_title: 'The Matrix',
  year: 1999,
  poster_path: '/abc.jpg',
  overview: 'Neo',
  director: 'Lana Wachowski',
};
const SPINE = { spine_color: 'hsl(210 42% 40%)', spine_dark: true };

describe('findOwnShelf', () => {
  it('scopes the lookup by id and owner', async () => {
    const sb = fakeSupabase({ shelves: { data: { id: SHELF, slug: 'abc' }, error: null } });
    const shelf = await findOwnShelf(sb.client, SHELF, OWNER);

    expect(shelf).toEqual({ id: SHELF, slug: 'abc' });
    expect(sb.opsFor('shelves')).toEqual(
      expect.arrayContaining([
        ['eq', 'id', SHELF],
        ['eq', 'owner', OWNER],
      ]),
    );
  });

  it('returns null when the shelf is absent or owned by someone else', async () => {
    const sb = fakeSupabase({ shelves: { data: null, error: null } });
    expect(await findOwnShelf(sb.client, SHELF, OWNER)).toBeNull();
  });

  it('throws when Supabase reports an error', async () => {
    const sb = fakeSupabase({ shelves: { data: null, error: { message: 'boom' } } });
    await expect(findOwnShelf(sb.client, SHELF, OWNER)).rejects.toThrow(/boom/);
  });
});

describe('shelfItemCount', () => {
  it('asks for an exact head count scoped to the shelf', async () => {
    const sb = fakeSupabase({ shelf_items: { data: null, error: null, count: 7 } });
    expect(await shelfItemCount(sb.client, SHELF)).toBe(7);
    expect(sb.opsFor('shelf_items')).toEqual(expect.arrayContaining([['eq', 'shelf_id', SHELF]]));
    const [, , options] = sb.opsFor('shelf_items').find(([op]) => op === 'select')!;
    expect(options).toMatchObject({ count: 'exact', head: true });
  });

  it('reports 0 when the count comes back null', async () => {
    const sb = fakeSupabase({ shelf_items: { data: null, error: null } });
    expect(await shelfItemCount(sb.client, SHELF)).toBe(0);
  });
});

describe('shelfHasFilm', () => {
  it('is true when the composite row exists', async () => {
    const sb = fakeSupabase({ shelf_items: { data: { film_id: 603 }, error: null } });
    expect(await shelfHasFilm(sb.client, SHELF, 603)).toBe(true);
    expect(sb.opsFor('shelf_items')).toEqual(
      expect.arrayContaining([
        ['eq', 'shelf_id', SHELF],
        ['eq', 'film_id', 603],
      ]),
    );
  });

  it('is false when it does not', async () => {
    const sb = fakeSupabase({ shelf_items: { data: null, error: null } });
    expect(await shelfHasFilm(sb.client, SHELF, 603)).toBe(false);
  });
});

describe('ensureFilmCached', () => {
  it('inserts the row with the spine colour and reports it as created', async () => {
    const inserted = { ...FILM_ROW, ...SPINE, fetched_at: '2026-09-03T00:00:00Z' };
    const sb = fakeSupabase({ films: { data: [inserted], error: null } });

    const { film, created } = await ensureFilmCached(sb.client, FILM_ROW, SPINE);

    expect(created).toBe(true);
    expect(film).toEqual(inserted);
    const [, payload, options] = sb.opsFor('films').find(([op]) => op === 'upsert')!;
    expect(payload).toMatchObject({ id: 603, ...SPINE });
    expect(options).toMatchObject({ ignoreDuplicates: true });
    expect(sb.tableCalls('films')).toBe(1);
  });

  it('falls back to a select and reports created=false when the film was already cached', async () => {
    const existing = {
      ...FILM_ROW,
      spine_color: 'hsl(0 0% 10%)',
      spine_dark: true,
      fetched_at: 'x',
    };
    const sb = fakeSupabase({
      films: [
        { data: [], error: null },
        { data: existing, error: null },
      ],
    });

    const { film, created } = await ensureFilmCached(sb.client, FILM_ROW, SPINE);

    expect(created).toBe(false);
    // The colour stored first wins; CLAUDE.md forbids recomputing it.
    expect(film.spine_color).toBe('hsl(0 0% 10%)');
    expect(sb.tableCalls('films')).toBe(2);
  });
});

describe('placeFilm', () => {
  it('calls the place_film RPC with the argument names the migration declares', async () => {
    const sb = fakeSupabase({}, { place_film: { data: 4, error: null } });
    expect(await placeFilm(sb.client, SHELF, 603)).toBe(4);
    expect(sb.rpc).toHaveBeenCalledWith('place_film', { p_shelf: SHELF, p_film: 603 });
  });
});

describe('reorderShelf', () => {
  it('calls the reorder_shelf RPC with the whole ordering', async () => {
    const sb = fakeSupabase({}, { reorder_shelf: { data: null, error: null } });
    await reorderShelf(sb.client, SHELF, [3, 1, 2]);
    expect(sb.rpc).toHaveBeenCalledWith('reorder_shelf', { p_shelf: SHELF, p_order: [3, 1, 2] });
  });
});

describe('removeFilm', () => {
  it('deletes the one composite row', async () => {
    const sb = fakeSupabase({ shelf_items: { data: null, error: null } });
    await removeFilm(sb.client, SHELF, 603);
    expect(sb.opsFor('shelf_items')).toEqual(
      expect.arrayContaining([['delete'], ['eq', 'shelf_id', SHELF], ['eq', 'film_id', 603]]),
    );
  });
});

describe('listOwnShelves', () => {
  it('filters by owner, because the SELECT policy also exposes public shelves', async () => {
    const sb = fakeSupabase({ shelves: { data: [], error: null } });
    await listOwnShelves(sb.client, OWNER);
    expect(sb.opsFor('shelves')).toEqual(expect.arrayContaining([['eq', 'owner', OWNER]]));
  });

  it('orders oldest first and returns an array when data is null', async () => {
    const sb = fakeSupabase({ shelves: { data: null, error: null } });
    expect(await listOwnShelves(sb.client, OWNER)).toEqual([]);
    expect(sb.opsFor('shelves')).toEqual(
      expect.arrayContaining([['order', 'created_at', { ascending: true }]]),
    );
  });
});
