import { describe, expect, it } from 'vitest';
import { fakeSupabase } from './helpers/fake-supabase';
import { getOwnProfile } from '../src/lib/profiles';

const USER = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const ROW = { id: USER, display_name: 'alexfmarquez', avatar_url: null };

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
