import { describe, expect, it, vi } from 'vitest';
import {
  createShelf,
  deleteShelf,
  moveFilmToShelf,
  removeFilmFromShelf,
  saveShelfLabel,
  saveShelfOrder,
  saveShelvesOrder,
} from '../src/lib/shelf-api';

const ok = () => vi.fn().mockResolvedValue(new Response(null, { status: 204 }));

describe('shelf-api', () => {
  it('removes a film with a DELETE on its composite path', async () => {
    const doFetch = ok();
    expect(await removeFilmFromShelf('s1', 603, doFetch)).toBe(true);
    expect(doFetch).toHaveBeenCalledWith('/api/shelves/s1/films/603', { method: 'DELETE' });
  });

  it('saves an order as the body the endpoint parses', async () => {
    const doFetch = ok();
    expect(await saveShelfOrder('s1', [3, 1, 2], doFetch)).toBe(true);
    const [url, init] = doFetch.mock.calls[0];
    expect(url).toBe('/api/shelves/s1/order');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body)).toEqual({ order: [3, 1, 2] });
  });

  it('creates a shelf with a bare POST', async () => {
    const doFetch = ok();
    expect(await createShelf(doFetch)).toBe(true);
    expect(doFetch).toHaveBeenCalledWith('/api/shelves', { method: 'POST' });
  });

  it('saves a label with a PATCH on the shelf', async () => {
    const doFetch = ok();
    const label = { name: 'Terror', accentColor: '#9e2f26', textColor: '#ffffff' };
    expect(await saveShelfLabel('s1', label, doFetch)).toBe(true);
    const [url, init] = doFetch.mock.calls[0];
    expect(url).toBe('/api/shelves/s1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual(label);
  });

  it("moves a film with a POST on the target's moves path", async () => {
    const doFetch = ok();
    const move = { filmId: 603, fromShelfId: 's1', order: [603, 11] };
    expect(await moveFilmToShelf('s2', move, doFetch)).toBe(true);
    const [url, init] = doFetch.mock.calls[0];
    expect(url).toBe('/api/shelves/s2/moves');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual(move);
  });

  it('deletes a shelf with a DELETE on its path', async () => {
    const doFetch = ok();
    expect(await deleteShelf('s1', doFetch)).toBe(true);
    expect(doFetch).toHaveBeenCalledWith('/api/shelves/s1', { method: 'DELETE' });
  });

  it('saves the shelves order with a PUT', async () => {
    const doFetch = ok();
    expect(await saveShelvesOrder(['s2', 's1'], doFetch)).toBe(true);
    const [url, init] = doFetch.mock.calls[0];
    expect(url).toBe('/api/shelves/order');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body)).toEqual({ order: ['s2', 's1'] });
  });

  it('reports false for an error status', async () => {
    const doFetch = vi.fn().mockResolvedValue(new Response(null, { status: 500 }));
    expect(await saveShelfOrder('s1', [1], doFetch)).toBe(false);
  });

  it('reports false, without rejecting, when the network throws', async () => {
    const doFetch = vi.fn().mockRejectedValue(new Error('offline'));
    await expect(removeFilmFromShelf('s1', 603, doFetch)).resolves.toBe(false);
  });
});
