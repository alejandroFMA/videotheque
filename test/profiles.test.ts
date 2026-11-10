import { describe, expect, it } from 'vitest';
import { fakeSupabase } from './helpers/fake-supabase';
import { getOwnProfile, getProfileByHandle } from '../src/lib/profiles';

const USER = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const ROW = { id: USER, display_name: 'alexfmarquez', avatar_url: null, handle: 'aaaaaaaabb' };

describe('getOwnProfile', () => {
  it('scopes the lookup to the given user', async () => {
    const sb = fakeSupabase({ profiles: { data: ROW, error: null } });

    expect(await getOwnProfile(sb.client, USER)).toEqual(ROW);
    expect(sb.opsFor('profiles')).toEqual(expect.arrayContaining([['eq', 'id', USER]]));
  });

  it('returns null when the profile is missing', async () => {
    const sb = fakeSupabase({ profiles: { data: null, error: null } });
    expect(await getOwnProfile(sb.client, USER)).toBeNull();
  });

  it('throws when Supabase reports an error', async () => {
    const sb = fakeSupabase({ profiles: { data: null, error: { message: 'boom' } } });
    await expect(getOwnProfile(sb.client, USER)).rejects.toThrow(/boom/);
  });
});

describe('getProfileByHandle', () => {
  it('asks the RPC, because the table is readable only by its owner', async () => {
    const sb = fakeSupabase({}, { profile_by_handle: { data: [ROW], error: null } });

    expect(await getProfileByHandle(sb.client, 'aaaaaaaabb')).toEqual(ROW);
    expect(sb.rpc).toHaveBeenCalledWith('profile_by_handle', { p_handle: 'aaaaaaaabb' });
    expect(sb.from).not.toHaveBeenCalled();
  });

  it('returns null when nobody has that handle', async () => {
    const sb = fakeSupabase({}, { profile_by_handle: { data: [], error: null } });
    expect(await getProfileByHandle(sb.client, 'nobody')).toBeNull();
  });

  it.each(['', 'Has Space', 'UPPER', '../etc', 'a'.repeat(41)])(
    'returns null for %j without asking the database',
    async (handle) => {
      const sb = fakeSupabase({});
      expect(await getProfileByHandle(sb.client, handle)).toBeNull();
      expect(sb.rpc).not.toHaveBeenCalled();
    },
  );

  it('throws when Supabase reports an error', async () => {
    const sb = fakeSupabase({}, { profile_by_handle: { data: null, error: { message: 'boom' } } });
    await expect(getProfileByHandle(sb.client, 'aaaaaaaabb')).rejects.toThrow(/boom/);
  });
});
