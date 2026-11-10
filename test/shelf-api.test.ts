import { describe, expect, it, vi } from 'vitest';
import {
  createShelf,
  removeFilmFromShelf,
  saveShelfLabel,
  saveShelfOrder,
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

  it('reports false for an error status', async () => {
    const doFetch = vi.fn().mockResolvedValue(new Response(null, { status: 500 }));
    expect(await saveShelfOrder('s1', [1], doFetch)).toBe(false);
  });

  it('reports false, without rejecting, when the network throws', async () => {
    const doFetch = vi.fn().mockRejectedValue(new Error('offline'));
    await expect(removeFilmFromShelf('s1', 603, doFetch)).resolves.toBe(false);
  });
});
