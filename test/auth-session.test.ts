import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveUser } from '../src/lib/auth-session';

const claims = {
  iss: 'https://x.supabase.co/auth/v1',
  sub: '11111111-1111-1111-1111-111111111111',
  aud: 'authenticated',
  exp: 1,
  iat: 1,
  role: 'authenticated',
  aal: 'aal1',
  session_id: '22222222-2222-2222-2222-222222222222',
  email: 'a@b.com',
};

const withGetClaims = (impl: () => Promise<unknown>) =>
  ({ auth: { getClaims: impl } }) as Parameters<typeof resolveUser>[0];

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('resolveUser', () => {
  it('returns the claims when getClaims succeeds, logging nothing', async () => {
    const supabase = withGetClaims(async () => ({
      data: { claims, header: { alg: 'RS256', kid: 'k', typ: 'JWT' }, signature: new Uint8Array() },
      error: null,
    }));
    expect(await resolveUser(supabase)).toEqual(claims);
    expect(console.warn).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  it('returns null and logs nothing when there is no session (data null, no error)', async () => {
    const supabase = withGetClaims(async () => ({ data: null, error: null }));
    expect(await resolveUser(supabase)).toBeNull();
    expect(console.warn).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  it('returns null and warns when getClaims resolves an error', async () => {
    const supabase = withGetClaims(async () => ({ data: null, error: new Error('bad jwt') }));
    expect(await resolveUser(supabase)).toBeNull();
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('[auth/session]'),
      expect.any(Error),
    );
  });

  it('returns null and logs an error when getClaims throws (network)', async () => {
    const supabase = withGetClaims(async () => {
      throw new Error('network down');
    });
    expect(await resolveUser(supabase)).toBeNull();
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('[auth/session]'),
      expect.any(Error),
    );
  });
});
