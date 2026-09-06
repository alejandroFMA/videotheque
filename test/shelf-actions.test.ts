import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fakeSupabase } from './helpers/fake-supabase';
import {
  handleAddFilm,
  handleRemoveFilm,
  handleReorderShelf,
  readJson,
} from '../src/lib/shelf-actions';
import { SHELF_CAPACITY, SHELF_FULL_MESSAGE } from '../src/constants';

const SHELF = '11111111-2222-3333-4444-555555555555';
const OWNER = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

/** A fake whose shelves lookup succeeds, i.e. the shelf is the caller's. */
function ownedShelf(extra: Record<string, unknown> = {}) {
  return fakeSupabase({
    shelves: { data: { id: SHELF, slug: 'abc' }, error: null },
    shelf_items: { data: null, error: null },
    ...extra,
  });
}

describe('handleRemoveFilm — guard', () => {
  it('401 when there is no session, without touching the database', async () => {
    const sb = ownedShelf();
    const res = await handleRemoveFilm({
      supabase: sb.client,
      owner: undefined,
      shelfId: SHELF,
      filmId: '603',
    });
    expect(res.status).toBe(401);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(sb.from).not.toHaveBeenCalled();
  });

  it('400 when the shelf id is not a UUID', async () => {
    const sb = ownedShelf();
    const res = await handleRemoveFilm({
      supabase: sb.client,
      owner: OWNER,
      shelfId: 'not-a-uuid',
      filmId: '603',
    });
    expect(res.status).toBe(400);
    expect(sb.from).not.toHaveBeenCalled();
  });

  it('404 when the shelf is absent or belongs to someone else', async () => {
    const sb = fakeSupabase({ shelves: { data: null, error: null } });
    const res = await handleRemoveFilm({
      supabase: sb.client,
      owner: OWNER,
      shelfId: SHELF,
      filmId: '603',
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not found' });
  });

  it('does not distinguish "not yours" from "does not exist"', async () => {
    // Both reach findOwnShelf as a null row, so the answer must be identical.
    const sb = fakeSupabase({ shelves: { data: null, error: null } });
    const res = await handleRemoveFilm({
      supabase: sb.client,
      owner: OWNER,
      shelfId: SHELF,
      filmId: '603',
    });
    expect(res.status).toBe(404);
    expect(res.status).not.toBe(403);
  });

  it('500 when the shelf lookup itself fails', async () => {
    const sb = fakeSupabase({ shelves: { data: null, error: { message: 'boom' } } });
    const res = await handleRemoveFilm({
      supabase: sb.client,
      owner: OWNER,
      shelfId: SHELF,
      filmId: '603',
    });
    expect(res.status).toBe(500);
    // The Supabase message is logged, never reflected to the client.
    expect(JSON.stringify(await res.json())).not.toContain('boom');
    expect(console.error).toHaveBeenCalled();
  });
});

describe('handleRemoveFilm — film id validation', () => {
  it.each([['abc'], [''], ['0'], ['-3'], ['1.5'], [undefined]])(
    'rejects %s with 400',
    async (filmId) => {
      const sb = ownedShelf();
      const res = await handleRemoveFilm({
        supabase: sb.client,
        owner: OWNER,
        shelfId: SHELF,
        filmId,
      });
      expect(res.status).toBe(400);
    },
  );
});

describe('handleRemoveFilm — happy path', () => {
  it('deletes the row and answers 204 with no body', async () => {
    const sb = ownedShelf();
    const res = await handleRemoveFilm({
      supabase: sb.client,
      owner: OWNER,
      shelfId: SHELF,
      filmId: '603',
    });
    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
    expect(sb.opsFor('shelf_items')).toEqual(
      expect.arrayContaining([['delete'], ['eq', 'shelf_id', SHELF], ['eq', 'film_id', 603]]),
    );
  });

  it('is idempotent: removing a film that is not there still answers 204', async () => {
    // A retry after a dropped response must not see a failure.
    const sb = ownedShelf();
    const res = await handleRemoveFilm({
      supabase: sb.client,
      owner: OWNER,
      shelfId: SHELF,
      filmId: '999999',
    });
    expect(res.status).toBe(204);
  });
});

describe('handleReorderShelf — guard', () => {
  it('401 without a session and 400 for a bad UUID', async () => {
    const sb = ownedShelf();
    expect(
      (
        await handleReorderShelf({
          supabase: sb.client,
          owner: undefined,
          shelfId: SHELF,
          body: { order: [1] },
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await handleReorderShelf({
          supabase: sb.client,
          owner: OWNER,
          shelfId: 'nope',
          body: { order: [1] },
        })
      ).status,
    ).toBe(400);
  });

  it("404 when the shelf is not the caller's", async () => {
    const sb = fakeSupabase({ shelves: { data: null, error: null } });
    const res = await handleReorderShelf({
      supabase: sb.client,
      owner: OWNER,
      shelfId: SHELF,
      body: { order: [1] },
    });
    expect(res.status).toBe(404);
  });
});

describe('handleReorderShelf — order validation', () => {
  it.each([
    ['a missing body', null],
    ['a non-object body', 'order'],
    ['a missing order key', {}],
    ['a non-array order', { order: 3 }],
    ['an empty order', { order: [] }],
    ['non-integer members', { order: [1, 2.5] }],
    ['non-numeric members', { order: [1, 'two'] }],
    ['zero or negative ids', { order: [1, 0] }],
    ['duplicate ids', { order: [1, 2, 1] }],
  ])('rejects %s with 400 and does not call the RPC', async (_label, body) => {
    const sb = ownedShelf();
    const res = await handleReorderShelf({
      supabase: sb.client,
      owner: OWNER,
      shelfId: SHELF,
      body,
    });
    expect(res.status).toBe(400);
    expect(sb.rpc).not.toHaveBeenCalled();
  });
});

describe('handleReorderShelf — happy path', () => {
  it('passes the whole ordering to reorder_shelf and answers 204', async () => {
    const sb = ownedShelf();
    const res = await handleReorderShelf({
      supabase: sb.client,
      owner: OWNER,
      shelfId: SHELF,
      body: { order: [7, 3, 9] },
    });
    expect(res.status).toBe(204);
    expect(sb.rpc).toHaveBeenCalledWith('reorder_shelf', { p_shelf: SHELF, p_order: [7, 3, 9] });
  });

  it('accepts ids that are not on the shelf', async () => {
    // reorder_shelf simply does not match them; that is not an error.
    const sb = ownedShelf();
    const res = await handleReorderShelf({
      supabase: sb.client,
      owner: OWNER,
      shelfId: SHELF,
      body: { order: [424242] },
    });
    expect(res.status).toBe(204);
  });

  it('500 when the RPC fails', async () => {
    const sb = fakeSupabase(
      { shelves: { data: { id: SHELF, slug: 'abc' }, error: null } },
      { reorder_shelf: { data: null, error: { message: 'boom' } } },
    );
    const res = await handleReorderShelf({
      supabase: sb.client,
      owner: OWNER,
      shelfId: SHELF,
      body: { order: [1] },
    });
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('boom');
  });
});

describe('readJson', () => {
  it('parses a JSON body and returns null for malformed input', async () => {
    expect(await readJson(new Request('http://x/', { method: 'PUT', body: '{"a":1}' }))).toEqual({
      a: 1,
    });
    expect(
      await readJson(new Request('http://x/', { method: 'PUT', body: 'not json' })),
    ).toBeNull();
  });
});

const movieFixture = JSON.parse(
  readFileSync(new URL('./fixtures/tmdb-movie-603.json', import.meta.url), 'utf8'),
);
const VALID_BODY = { tmdbId: 603, spineColor: 'hsl(210 42% 40%)', spineDark: true };

function tmdbOk() {
  return vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => movieFixture });
}

/** The shelf is the caller's, holds `count` films and does not hold the film
 *  yet. shelf_items results are queued in call order: shelfHasFilm, then
 *  shelfItemCount. */
function addFilmFake({ count = 0, hasFilm = false, cached = false } = {}) {
  const filmRow = {
    ...movieFixture,
    spine_color: VALID_BODY.spineColor,
    spine_dark: true,
    fetched_at: 'x',
  };
  return fakeSupabase(
    {
      shelves: { data: { id: SHELF, slug: 'abc' }, error: null },
      shelf_items: [
        { data: hasFilm ? { film_id: 603 } : null, error: null },
        { data: null, error: null, count },
      ],
      films: cached
        ? [
            { data: [], error: null },
            { data: filmRow, error: null },
          ]
        : { data: [filmRow], error: null },
    },
    { place_film: { data: 5, error: null } },
  );
}

describe('handleAddFilm — guard and validation', () => {
  it("401 without a session, 400 for a bad UUID, 404 when not the caller's", async () => {
    const sb = addFilmFake();
    expect(
      (
        await handleAddFilm({
          supabase: sb.client,
          owner: undefined,
          shelfId: SHELF,
          body: VALID_BODY,
          token: 't',
          fetch: tmdbOk(),
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await handleAddFilm({
          supabase: sb.client,
          owner: OWNER,
          shelfId: 'nope',
          body: VALID_BODY,
          token: 't',
          fetch: tmdbOk(),
        })
      ).status,
    ).toBe(400);

    const missing = fakeSupabase({ shelves: { data: null, error: null } });
    expect(
      (
        await handleAddFilm({
          supabase: missing.client,
          owner: OWNER,
          shelfId: SHELF,
          body: VALID_BODY,
          token: 't',
          fetch: tmdbOk(),
        })
      ).status,
    ).toBe(404);
  });

  it.each([
    ['a missing body', null],
    ['a missing tmdbId', { spineColor: 'hsl(210 42% 40%)', spineDark: true }],
    ['a non-integer tmdbId', { ...VALID_BODY, tmdbId: 1.5 }],
    ['a zero tmdbId', { ...VALID_BODY, tmdbId: 0 }],
    ['a missing spineColor', { tmdbId: 603, spineDark: true }],
    ['a comma-separated hsl', { ...VALID_BODY, spineColor: 'hsl(210, 42%, 40%)' }],
    ['a hex colour', { ...VALID_BODY, spineColor: '#3366aa' }],
    ['an out-of-range hue', { ...VALID_BODY, spineColor: 'hsl(400 42% 40%)' }],
    ['an out-of-range lightness', { ...VALID_BODY, spineColor: 'hsl(210 42% 140%)' }],
    ['a non-boolean spineDark', { ...VALID_BODY, spineDark: 'yes' }],
  ])('rejects %s with 400 and never calls TMDB', async (_label, body) => {
    const sb = addFilmFake();
    const fetchMock = tmdbOk();
    const res = await handleAddFilm({
      supabase: sb.client,
      owner: OWNER,
      shelfId: SHELF,
      body,
      token: 't',
      fetch: fetchMock,
    });
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('500 when the TMDB token is missing', async () => {
    const sb = addFilmFake();
    const res = await handleAddFilm({
      supabase: sb.client,
      owner: OWNER,
      shelfId: SHELF,
      body: VALID_BODY,
      token: undefined,
      fetch: tmdbOk(),
    });
    expect(res.status).toBe(500);
    expect(console.error).toHaveBeenCalled();
  });
});

describe('handleAddFilm — the capacity cap', () => {
  it(`409 with the Spanish message once the shelf holds ${SHELF_CAPACITY} films`, async () => {
    const sb = addFilmFake({ count: SHELF_CAPACITY });
    const fetchMock = tmdbOk();
    const res = await handleAddFilm({
      supabase: sb.client,
      owner: OWNER,
      shelfId: SHELF,
      body: VALID_BODY,
      token: 't',
      fetch: fetchMock,
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'shelf_full', message: SHELF_FULL_MESSAGE });
    // Rejected before spending a TMDB call.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not 409 when the shelf is full but already holds that film', async () => {
    // place_film is idempotent, so re-adding cannot exceed the cap.
    const sb = addFilmFake({ count: SHELF_CAPACITY, hasFilm: true, cached: true });
    const res = await handleAddFilm({
      supabase: sb.client,
      owner: OWNER,
      shelfId: SHELF,
      body: VALID_BODY,
      token: 't',
      fetch: tmdbOk(),
    });
    expect(res.status).toBe(200);
  });

  it(`allows the ${SHELF_CAPACITY}th film`, async () => {
    const sb = addFilmFake({ count: SHELF_CAPACITY - 1 });
    const res = await handleAddFilm({
      supabase: sb.client,
      owner: OWNER,
      shelfId: SHELF,
      body: VALID_BODY,
      token: 't',
      fetch: tmdbOk(),
    });
    expect([200, 201]).toContain(res.status);
  });
});

describe('handleAddFilm — happy path', () => {
  it('201 with the position and the cached row when the film is new to the cache', async () => {
    const sb = addFilmFake();
    const res = await handleAddFilm({
      supabase: sb.client,
      owner: OWNER,
      shelfId: SHELF,
      body: VALID_BODY,
      token: 't',
      fetch: tmdbOk(),
    });
    expect(res.status).toBe(201);
    const payload = await res.json();
    expect(payload.position).toBe(5);
    expect(payload.film.id).toBe(603);
    expect(payload.film.spine_color).toBe(VALID_BODY.spineColor);
    expect(sb.rpc).toHaveBeenCalledWith('place_film', { p_shelf: SHELF, p_film: 603 });
  });

  it('200 when the film was already in the global cache', async () => {
    const sb = addFilmFake({ cached: true });
    const res = await handleAddFilm({
      supabase: sb.client,
      owner: OWNER,
      shelfId: SHELF,
      body: VALID_BODY,
      token: 't',
      fetch: tmdbOk(),
    });
    expect(res.status).toBe(200);
  });

  it('stores the row TMDB returned, not fields the client might have sent', async () => {
    const sb = addFilmFake();
    await handleAddFilm({
      supabase: sb.client,
      owner: OWNER,
      shelfId: SHELF,
      body: { ...VALID_BODY, title: 'Injected', director: 'Nobody' },
      token: 't',
      fetch: tmdbOk(),
    });
    const [, payload] = sb.opsFor('films').find(([op]) => op === 'upsert')!;
    expect(payload).toMatchObject({ title: movieFixture.title });
    expect(payload).not.toMatchObject({ director: 'Nobody' });
  });
});

describe('handleAddFilm — failures', () => {
  it('502 when TMDB is unreachable', async () => {
    const sb = addFilmFake();
    const res = await handleAddFilm({
      supabase: sb.client,
      owner: OWNER,
      shelfId: SHELF,
      body: VALID_BODY,
      token: 't',
      fetch: vi.fn().mockRejectedValue(new Error('ECONNRESET')),
    });
    expect(res.status).toBe(502);
  });

  it('502 when TMDB answers non-2xx', async () => {
    const sb = addFilmFake();
    const res = await handleAddFilm({
      supabase: sb.client,
      owner: OWNER,
      shelfId: SHELF,
      body: VALID_BODY,
      token: 't',
      fetch: vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }),
    });
    expect(res.status).toBe(502);
  });

  it('500 when place_film fails', async () => {
    const sb = fakeSupabase(
      {
        shelves: { data: { id: SHELF, slug: 'abc' }, error: null },
        shelf_items: [
          { data: null, error: null },
          { data: null, error: null, count: 0 },
        ],
        films: {
          data: [
            {
              ...movieFixture,
              spine_color: 'hsl(210 42% 40%)',
              spine_dark: true,
              fetched_at: 'x',
            },
          ],
          error: null,
        },
      },
      { place_film: { data: null, error: { message: 'boom' } } },
    );
    const res = await handleAddFilm({
      supabase: sb.client,
      owner: OWNER,
      shelfId: SHELF,
      body: VALID_BODY,
      token: 't',
      fetch: tmdbOk(),
    });
    expect(res.status).toBe(500);
  });
});
