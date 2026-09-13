import { describe, expect, it, vi } from 'vitest';
import { addFilmToFirstShelfWithRoom, firstShelfWithRoom } from '../src/lib/shelf-target';
import { SHELF_CAPACITY } from '../src/constants';

const FILM = { tmdbId: 603, spineColor: 'hsl(210 42% 40%)', spineDark: true };
const full = (id: string) => ({ id, filmCount: SHELF_CAPACITY });
const room = (id: string) => ({ id, filmCount: 1 });

function reply(status: number, body: unknown = {}) {
  return new Response(JSON.stringify(body), { status });
}

describe('firstShelfWithRoom', () => {
  it('returns null when there are no shelves', () => {
    expect(firstShelfWithRoom([])).toBeNull();
  });

  it('returns null when every shelf is full', () => {
    expect(firstShelfWithRoom([full('a'), full('b')])).toBeNull();
  });

  it('picks the first shelf with room, top to bottom', () => {
    expect(firstShelfWithRoom([full('a'), room('b'), room('c')])?.id).toBe('b');
  });

  it('treats an over-full shelf as full', () => {
    expect(firstShelfWithRoom([{ id: 'a', filmCount: SHELF_CAPACITY + 5 }])).toBeNull();
  });
});

describe('addFilmToFirstShelfWithRoom', () => {
  it('posts the film and its spine to the first shelf with room', async () => {
    const doFetch = vi.fn().mockResolvedValue(reply(201, { position: 4 }));

    const outcome = await addFilmToFirstShelfWithRoom([full('a'), room('b')], FILM, doFetch);

    expect(outcome).toEqual({ ok: true, shelfId: 'b', position: 4 });
    expect(doFetch).toHaveBeenCalledTimes(1);
    const [url, init] = doFetch.mock.calls[0];
    expect(url).toBe('/api/shelves/b/films');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual(FILM);
  });

  it('moves to the next shelf when the counts were stale and the server says 409', async () => {
    const doFetch = vi
      .fn()
      .mockResolvedValueOnce(reply(409, { error: 'shelf_full' }))
      .mockResolvedValueOnce(reply(201, { position: 0 }));

    const outcome = await addFilmToFirstShelfWithRoom([room('a'), room('b')], FILM, doFetch);

    expect(outcome).toEqual({ ok: true, shelfId: 'b', position: 0 });
    expect(doFetch.mock.calls.map(([url]) => url)).toEqual([
      '/api/shelves/a/films',
      '/api/shelves/b/films',
    ]);
  });

  it('reports all_full when every shelf refuses', async () => {
    const doFetch = vi.fn().mockResolvedValue(reply(409, { error: 'shelf_full' }));

    expect(await addFilmToFirstShelfWithRoom([room('a'), room('b')], FILM, doFetch)).toEqual({
      ok: false,
      reason: 'all_full',
    });
  });

  it('reports all_full without calling the server when nothing has room', async () => {
    const doFetch = vi.fn();

    expect(await addFilmToFirstShelfWithRoom([full('a')], FILM, doFetch)).toEqual({
      ok: false,
      reason: 'all_full',
    });
    expect(doFetch).not.toHaveBeenCalled();
  });

  it('stops on a non-409 failure rather than retrying every shelf', async () => {
    const doFetch = vi.fn().mockResolvedValue(reply(500));

    expect(await addFilmToFirstShelfWithRoom([room('a'), room('b')], FILM, doFetch)).toEqual({
      ok: false,
      reason: 'failed',
    });
    expect(doFetch).toHaveBeenCalledTimes(1);
  });

  it('reports failed when the network throws', async () => {
    const doFetch = vi.fn().mockRejectedValue(new Error('offline'));

    expect(await addFilmToFirstShelfWithRoom([room('a')], FILM, doFetch)).toEqual({
      ok: false,
      reason: 'failed',
    });
  });
});
