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

  it('keeps the three most-voted textless backdrops', () => {
    expect(toFilmRow(movieFixture).backdrop_paths).toEqual([
      '/scene-b.jpg',
      '/scene-d.jpg',
      '/scene-a.jpg',
    ]);
  });

  it('keeps the first six cast names in billing order', () => {
    const { cast_names } = toFilmRow(movieFixture);
    expect(cast_names).toHaveLength(6);
    expect(cast_names[0]).toBe('Keanu Reeves');
    expect(cast_names).not.toContain('Marcus Chong');
  });

  it('groups crew by job in print order, two distinct names at most', () => {
    const { crew } = toFilmRow(movieFixture);
    expect(crew.map((c) => c.job)).toEqual([
      'screenplay',
      'music',
      'photography',
      'editing',
      'producer',
    ]);
    expect(crew.find((c) => c.job === 'producer')!.names).toEqual(['Joel Silver', 'Bruce Berman']);
  });

  it('leaves out a job nobody is credited for', () => {
    const row = toFilmRow({ id: 1, title: 'X', credits: { crew: [{ job: 'Editor', name: 'A' }] } });
    expect(row.crew).toEqual([{ job: 'editing', names: ['A'] }]);
  });

  it('keeps three companies with their logo path or null', () => {
    expect(toFilmRow(movieFixture).companies).toEqual([
      { name: 'Village Roadshow Pictures', logo_path: '/village.png' },
      { name: 'Groucho II Film Partnership', logo_path: null },
      { name: 'Silver Pictures', logo_path: '/silver.png' },
    ]);
  });

  it('defaults every new field to empty when TMDB sends nothing', () => {
    expect(toFilmRow({ id: 1, title: 'X' })).toMatchObject({
      backdrop_paths: [],
      cast_names: [],
      crew: [],
      companies: [],
    });
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
