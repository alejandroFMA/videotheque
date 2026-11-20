import { describe, expect, it } from 'vitest';
import { parseOmdb } from '../src/lib/scores';

describe('parseOmdb', () => {
  it('reads the Tomatometer and the IMDb rating', () => {
    expect(
      parseOmdb({
        Response: 'True',
        imdbRating: '7.8',
        Ratings: [
          { Source: 'Internet Movie Database', Value: '7.8/10' },
          { Source: 'Rotten Tomatoes', Value: '94%' },
        ],
      }),
    ).toEqual({ rt_score: 94, imdb_rating: 7.8 });
  });

  it('treats N/A and a missing entry as no score', () => {
    expect(parseOmdb({ Response: 'True', imdbRating: 'N/A', Ratings: [] })).toEqual({
      rt_score: null,
      imdb_rating: null,
    });
  });

  it('treats an OMDb error as an answer with no scores', () => {
    expect(parseOmdb({ Response: 'False', Error: 'Incorrect IMDb ID.' })).toEqual({
      rt_score: null,
      imdb_rating: null,
    });
  });

  it('ignores malformed rating entries', () => {
    expect(parseOmdb({ Response: 'True', imdbRating: '7.1', Ratings: [null] })).toEqual({
      rt_score: null,
      imdb_rating: 7.1,
    });
  });

  it('rejects something that is not an OMDb answer', () => {
    expect(parseOmdb('nope')).toBeNull();
  });
});
