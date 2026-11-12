import { describe, expect, it } from 'vitest';
import { fakeSupabase } from './helpers/fake-supabase';
import {
  countOwnShelves,
  createShelf,
  deleteShelf,
  ensureFilmCached,
  filmsInOrder,
  findOwnShelf,
  listShelvesWithFilms,
  moveFilm,
  placeFilm,
  removeFilm,
  reorderShelf,
  reorderShelves,
  shelfHasFilm,
  shelfItemCount,
  shelvedFilmIds,
  toShelfSlots,
  updateShelfLabel,
  type ShelfWithFilms,
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

const film = (id: number) => ({ ...FILM_ROW, ...SPINE, id, fetched_at: '2026-01-01' });

function shelfWith(id: string, items: [position: number, filmId: number][]): ShelfWithFilms {
  return {
    id,
    name: 'My shelf',
    slug: id,
    accent_color: null,
    accent_text_color: null,
    is_public: true,
    shelf_items: items.map(([position, filmId]) => ({ position, films: film(filmId) })),
  };
}

describe('listShelvesWithFilms', () => {
  it('filters by owner, because the SELECT policy also exposes public shelves', async () => {
    const sb = fakeSupabase({ shelves: { data: [], error: null } });
    await listShelvesWithFilms(sb.client, OWNER);
    expect(sb.opsFor('shelves')).toEqual(expect.arrayContaining([['eq', 'owner', OWNER]]));
    expect(sb.opsFor('shelves')).not.toEqual(expect.arrayContaining([['eq', 'is_public', true]]));
  });

  it('reads the films through the foreign key in the same call', async () => {
    const sb = fakeSupabase({ shelves: { data: [], error: null } });
    await listShelvesWithFilms(sb.client, OWNER);
    const [, columns] = sb.opsFor('shelves')[0];
    expect(columns).toContain('shelf_items(position, films(*))');
    expect(sb.tableCalls('shelves')).toBe(1);
  });

  it("keeps private shelves out of a visitor's view", async () => {
    const sb = fakeSupabase({ shelves: { data: [], error: null } });
    await listShelvesWithFilms(sb.client, OWNER, { publicOnly: true });
    expect(sb.opsFor('shelves')).toEqual(expect.arrayContaining([['eq', 'is_public', true]]));
  });

  it("orders by the owner's chosen position and returns an array when data is null", async () => {
    const sb = fakeSupabase({ shelves: { data: null, error: null } });
    expect(await listShelvesWithFilms(sb.client, OWNER)).toEqual([]);
    expect(sb.opsFor('shelves')).toEqual(
      expect.arrayContaining([['order', 'position', { ascending: true }]]),
    );
  });

  it('throws when Supabase reports an error', async () => {
    const sb = fakeSupabase({ shelves: { data: null, error: { message: 'boom' } } });
    await expect(listShelvesWithFilms(sb.client, OWNER)).rejects.toThrow(/boom/);
  });
});

describe('filmsInOrder', () => {
  it('sorts by position, whatever order the rows came back in', () => {
    const shelf = shelfWith('a', [
      [3, 30],
      [1, 10],
      [2, 20],
    ]);
    expect(filmsInOrder(shelf).map((f) => f.id)).toEqual([10, 20, 30]);
    // The caller's rows are left as they were.
    expect(shelf.shelf_items.map((item) => item.position)).toEqual([3, 1, 2]);
  });
});

describe('toShelfSlots', () => {
  it('counts the films on each shelf', () => {
    expect(
      toShelfSlots([
        shelfWith('a', [
          [1, 10],
          [2, 20],
        ]),
        shelfWith('b', []),
      ]),
    ).toEqual([
      { id: 'a', filmCount: 2 },
      { id: 'b', filmCount: 0 },
    ]);
  });
});

describe('shelvedFilmIds', () => {
  it('collects the ids across every shelf', () => {
    expect(shelvedFilmIds([shelfWith('a', [[1, 603]]), shelfWith('b', [[1, 604]])])).toEqual([
      603, 604,
    ]);
  });
});

describe('createShelf', () => {
  it('inserts a shelf for the owner and returns its id', async () => {
    const sb = fakeSupabase({ shelves: { data: { id: SHELF }, error: null } });
    expect(await createShelf(sb.client, OWNER, 'abc123')).toEqual({ id: SHELF });
    expect(sb.opsFor('shelves')[0]).toEqual(['insert', { owner: OWNER, slug: 'abc123' }]);
  });

  it('throws when Supabase reports an error', async () => {
    const sb = fakeSupabase({ shelves: { data: null, error: { message: 'boom' } } });
    await expect(createShelf(sb.client, OWNER, 'abc123')).rejects.toThrow(/boom/);
  });
});

describe('updateShelfLabel', () => {
  it('writes the change to the one shelf', async () => {
    const sb = fakeSupabase({ shelves: { data: null, error: null } });
    const change = { name: 'Terror', accent_color: '#9e2f26', accent_text_color: '#ffffff' };
    await updateShelfLabel(sb.client, SHELF, change);
    expect(sb.opsFor('shelves')).toEqual([
      ['update', change],
      ['eq', 'id', SHELF],
    ]);
  });
});

describe('moveFilm', () => {
  it('calls move_film with the film, both shelves and the target order', async () => {
    const sb = fakeSupabase({}, { move_film: { data: null, error: null } });
    await moveFilm(sb.client, 603, 'a', 'b', [1, 603]);
    expect(sb.rpc).toHaveBeenCalledWith('move_film', {
      p_film: 603,
      p_from: 'a',
      p_to: 'b',
      p_order: [1, 603],
    });
  });

  it('throws when Supabase reports an error', async () => {
    const sb = fakeSupabase({}, { move_film: { data: null, error: { message: 'boom' } } });
    await expect(moveFilm(sb.client, 603, 'a', 'b', [603])).rejects.toThrow(/boom/);
  });
});

describe('reorderShelves', () => {
  it('calls reorder_shelves with the ids in order', async () => {
    const sb = fakeSupabase({}, { reorder_shelves: { data: null, error: null } });
    await reorderShelves(sb.client, ['b', 'a']);
    expect(sb.rpc).toHaveBeenCalledWith('reorder_shelves', { p_order: ['b', 'a'] });
  });
});

describe('deleteShelf', () => {
  it('deletes the shelf row by id', async () => {
    const sb = fakeSupabase({ shelves: { data: null, error: null } });
    await deleteShelf(sb.client, SHELF);
    expect(sb.opsFor('shelves')).toEqual([['delete'], ['eq', 'id', SHELF]]);
  });

  it('throws when Supabase reports an error', async () => {
    const sb = fakeSupabase({ shelves: { data: null, error: { message: 'boom' } } });
    await expect(deleteShelf(sb.client, SHELF)).rejects.toThrow(/boom/);
  });
});

describe('countOwnShelves', () => {
  it("counts only the owner's shelves", async () => {
    const sb = fakeSupabase({ shelves: { data: null, error: null, count: 2 } });
    expect(await countOwnShelves(sb.client, OWNER)).toBe(2);
    expect(sb.opsFor('shelves')).toEqual(expect.arrayContaining([['eq', 'owner', OWNER]]));
  });
});
