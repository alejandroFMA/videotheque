import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleAuthConfirm } from '../src/lib/auth-confirm';

const FAIL = '/login?error=link';

function ctx(qs: string, verifyOtp = vi.fn().mockResolvedValue({ error: null })) {
  return { params: new URLSearchParams(qs), verifyOtp };
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('handleAuthConfirm', () => {
  it('verifies the token and redirects home on success, logging nothing', async () => {
    const c = ctx('token_hash=abc&type=email');
    const res = await handleAuthConfirm(c);
    expect(c.verifyOtp).toHaveBeenCalledWith({ token_hash: 'abc', type: 'email' });
    expect(res).toEqual({ status: 303, location: '/' });
    expect(console.warn).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  it('honours a safe same-origin `next`', async () => {
    const res = await handleAuthConfirm(ctx('token_hash=abc&type=email&next=/shelf/xyz'));
    expect(res.location).toBe('/shelf/xyz');
  });

  it.each(['//evil.com', 'https://evil.com', 'evil', '/\\evil'])(
    'ignores an unsafe `next` (%s) and redirects home',
    async (next) => {
      const res = await handleAuthConfirm(
        ctx(`token_hash=abc&type=email&next=${encodeURIComponent(next)}`),
      );
      expect(res.location).toBe('/');
    },
  );

  it('falls back to type=email for an unknown `type`', async () => {
    const c = ctx('token_hash=abc&type=bogus');
    await handleAuthConfirm(c);
    expect(c.verifyOtp).toHaveBeenCalledWith({ token_hash: 'abc', type: 'email' });
  });

  it('redirects to the link error and warns when token_hash is missing', async () => {
    const c = ctx('type=email');
    const res = await handleAuthConfirm(c);
    expect(c.verifyOtp).not.toHaveBeenCalled();
    expect(res).toEqual({ status: 303, location: FAIL });
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('[auth/confirm]'));
  });

  it('redirects to the link error and warns when verifyOtp returns an error', async () => {
    const c = ctx(
      'token_hash=abc&type=email',
      vi.fn().mockResolvedValue({ error: new Error('expired') }),
    );
    expect((await handleAuthConfirm(c)).location).toBe(FAIL);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('[auth/confirm]'),
      expect.any(Error),
    );
  });

  it('redirects to the link error and logs an error when verifyOtp throws', async () => {
    const c = ctx('token_hash=abc&type=email', vi.fn().mockRejectedValue(new Error('boom')));
    expect((await handleAuthConfirm(c)).location).toBe(FAIL);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('[auth/confirm]'),
      expect.any(Error),
    );
  });
});
