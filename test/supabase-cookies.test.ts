import { describe, it, expect, vi } from 'vitest';
import { makeCookieAdapter } from '../src/lib/supabase-cookies';

function setup(cookieHeader = '') {
  const set = vi.fn();
  const req = new Headers(cookieHeader ? { cookie: cookieHeader } : {});
  const res = new Headers();
  return { adapter: makeCookieAdapter({ set }, req, res), set, res };
}

describe('makeCookieAdapter.getAll', () => {
  it('parses the Cookie header into name/value pairs', () => {
    const { adapter } = setup('sb-ref-auth-token=abc; other=xyz');
    expect(adapter.getAll()).toEqual([
      { name: 'sb-ref-auth-token', value: 'abc' },
      { name: 'other', value: 'xyz' },
    ]);
  });

  it('returns [] when there is no Cookie header', () => {
    const { adapter } = setup();
    expect(adapter.getAll()).toEqual([]);
  });
});

describe('makeCookieAdapter.setAll', () => {
  it('writes every cookie through cookies.set with its options', () => {
    const { adapter, set } = setup();
    adapter.setAll(
      [
        { name: 'a', value: '1', options: { path: '/' } },
        { name: 'b', value: '2', options: { path: '/', httpOnly: true } },
      ],
      {},
    );
    expect(set).toHaveBeenNthCalledWith(1, 'a', '1', { path: '/' });
    expect(set).toHaveBeenNthCalledWith(2, 'b', '2', { path: '/', httpOnly: true });
  });

  it('copies response headers onto the response Headers object', () => {
    const { adapter, res } = setup();
    adapter.setAll([], { 'Cache-Control': 'private, no-store', Pragma: 'no-cache' });
    expect(res.get('Cache-Control')).toBe('private, no-store');
    expect(res.get('Pragma')).toBe('no-cache');
  });
});
