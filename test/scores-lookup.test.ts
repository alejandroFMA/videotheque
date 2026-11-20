import { describe, expect, it, vi } from 'vitest';
import { lookupScores } from '../src/lib/scores-lookup';
import { EMPTY_SCORES } from '../src/lib/scores';
import type { TmdbMovie } from '../src/lib/tmdb-mapping';

const NOW = new Date('2026-11-19T10:00:00Z');
const now = () => NOW;
const KEY = 'o-key';

const movie: TmdbMovie = { id: 949, title: 'Heat', imdb_id: 'tt0113277' };

const OMDB_OK = {
  Response: 'True',
  imdbRating: '8.3',
  Ratings: [{ Source: 'Rotten Tomatoes', Value: '83%' }],
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const fakeFetch = (respond: () => Response | Promise<Response>) =>
  vi.fn(async () => respond()) as unknown as typeof globalThis.fetch & ReturnType<typeof vi.fn>;

describe('lookupScores', () => {
  it('fills both scores and marks the row checked', async () => {
    expect(
      await lookupScores(
        movie,
        KEY,
        fakeFetch(() => json(OMDB_OK)),
        now,
      ),
    ).toEqual({
      rt_score: 83,
      imdb_rating: 8.3,
      scores_checked_at: NOW.toISOString(),
    });
  });

  it('asks OMDb by IMDb id with a timeout', async () => {
    const fetch = fakeFetch(() => json(OMDB_OK));
    await lookupScores(movie, KEY, fetch, now);
    const [input, init] = fetch.mock.calls[0]!;
    const url = new URL(String(input));
    expect(url.searchParams.get('i')).toBe('tt0113277');
    expect(url.searchParams.get('apikey')).toBe(KEY);
    expect((init as RequestInit).signal).toBeInstanceOf(AbortSignal);
  });

  it('leaves the row unchecked when OMDb fails', async () => {
    expect(
      await lookupScores(
        movie,
        KEY,
        fakeFetch(() => json({}, 500)),
        now,
      ),
    ).toEqual(EMPTY_SCORES);
  });

  it('leaves the row unchecked when OMDb times out', async () => {
    const fetch = fakeFetch(() => Promise.reject(new DOMException('timed out', 'TimeoutError')));
    expect(await lookupScores(movie, KEY, fetch, now)).toEqual(EMPTY_SCORES);
  });

  it('leaves the row unchecked on a body that is not an OMDb answer', async () => {
    expect(
      await lookupScores(
        movie,
        KEY,
        fakeFetch(() => json(['nope'])),
        now,
      ),
    ).toEqual(EMPTY_SCORES);
  });

  it('does nothing without a key, so the backfill retries once it exists', async () => {
    const fetch = fakeFetch(() => json(OMDB_OK));
    expect(await lookupScores(movie, undefined, fetch, now)).toEqual(EMPTY_SCORES);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('marks a film with no IMDb id checked without asking OMDb', async () => {
    const fetch = fakeFetch(() => json(OMDB_OK));
    expect(await lookupScores({ ...movie, imdb_id: null }, KEY, fetch, now)).toEqual({
      ...EMPTY_SCORES,
      scores_checked_at: NOW.toISOString(),
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('marks the row checked when OMDb has no scores for the film', async () => {
    const press = await lookupScores(
      movie,
      KEY,
      fakeFetch(() => json({ Response: 'False', Error: 'Incorrect IMDb ID.' })),
      now,
    );
    expect(press).toEqual({ ...EMPTY_SCORES, scores_checked_at: NOW.toISOString() });
  });
});
