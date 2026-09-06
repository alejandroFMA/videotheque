import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { posterUrl, toFilmRow, type TmdbMovie } from '../src/lib/tmdb-mapping';

const movieFixture = JSON.parse(
  readFileSync(new URL('./fixtures/tmdb-movie-603.json', import.meta.url), 'utf8'),
) as TmdbMovie;

describe('toFilmRow', () => {
  it('maps a real TMDB movie onto a films row', () => {
    const row = toFilmRow(movieFixture);
    expect(row.id).toBe(movieFixture.id);
    expect(row.title).toBe(movieFixture.title);
    expect(row.year).toBe(Number(movieFixture.release_date!.slice(0, 4)));
    expect(row.director).toBe(movieFixture.credits!.crew!.find((c) => c.job === 'Director')!.name);
  });

  it('nulls the year when release_date is missing or malformed', () => {
    expect(toFilmRow({ id: 1, title: 'X' }).year).toBeNull();
    expect(toFilmRow({ id: 1, title: 'X', release_date: '' }).year).toBeNull();
    expect(toFilmRow({ id: 1, title: 'X', release_date: 'soon' }).year).toBeNull();
  });

  it('nulls director when no crew member is credited as Director', () => {
    const row = toFilmRow({ id: 1, title: 'X', credits: { crew: [{ job: 'Writer', name: 'A' }] } });
    expect(row.director).toBeNull();
  });
});

describe('posterUrl', () => {
  it('builds an image.tmdb.org URL at the requested size', () => {
    expect(posterUrl('/abc.jpg')).toBe('https://image.tmdb.org/t/p/w500/abc.jpg');
    expect(posterUrl('/abc.jpg', 'w780')).toBe('https://image.tmdb.org/t/p/w780/abc.jpg');
  });

  it('returns null for a missing path', () => {
    expect(posterUrl(null)).toBeNull();
    expect(posterUrl(undefined)).toBeNull();
  });
});
