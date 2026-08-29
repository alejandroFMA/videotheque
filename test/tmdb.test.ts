import { describe, expect, it, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { getFilm, posterUrl, searchFilms, toFilmRow, type TmdbMovie } from '../src/lib/tmdb';

const movieFixture: TmdbMovie = JSON.parse(
  readFileSync(new URL('./fixtures/tmdb-movie-603.json', import.meta.url), 'utf8'),
);

describe('toFilmRow', () => {
  it('maps a full TMDB movie to a films row', () => {
    expect(toFilmRow(movieFixture)).toEqual({
      id: 603,
      title: 'The Matrix',
      original_title: 'The Matrix',
      year: 1999,
      poster_path: '/p96dm7sCMn4VYAStA6siNz30G1r.jpg',
      overview: movieFixture.overview,
      director: 'Lana Wachowski',
    });
  });

  it('returns year null when release_date is missing or malformed', () => {
    expect(toFilmRow({ id: 1, title: 'x' }).year).toBeNull();
    expect(toFilmRow({ id: 1, title: 'x', release_date: '' }).year).toBeNull();
    expect(toFilmRow({ id: 1, title: 'x', release_date: 'soon' }).year).toBeNull();
  });

  it('returns director null when the crew has no Director', () => {
    expect(toFilmRow({ id: 1, title: 'x' }).director).toBeNull();
    expect(
      toFilmRow({ id: 1, title: 'x', credits: { crew: [{ job: 'Producer', name: 'P' }] } }).director,
    ).toBeNull();
  });

  it('coerces missing optional fields to null', () => {
    const row = toFilmRow({ id: 7, title: 'Bare' });
    expect(row.original_title).toBeNull();
    expect(row.poster_path).toBeNull();
    expect(row.overview).toBeNull();
  });
});

describe('posterUrl', () => {
  it('builds an image.tmdb.org URL at the default size', () => {
    expect(posterUrl('/abc.jpg')).toBe('https://image.tmdb.org/t/p/w500/abc.jpg');
  });
  it('honours an explicit size', () => {
    expect(posterUrl('/abc.jpg', 'original')).toBe('https://image.tmdb.org/t/p/original/abc.jpg');
  });
  it('returns null with no path', () => {
    expect(posterUrl(null)).toBeNull();
    expect(posterUrl(undefined)).toBeNull();
  });
});

describe('searchFilms / getFilm', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('searchFilms hits the proxy with an encoded query and page', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [] }) });
    vi.stubGlobal('fetch', fetchMock);
    await searchFilms('the matrix', 2);
    expect(fetchMock).toHaveBeenCalledWith('/api/tmdb?op=search&query=the%20matrix&page=2');
  });

  it('searchFilms defaults page to 1', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [] }) });
    vi.stubGlobal('fetch', fetchMock);
    await searchFilms('matrix');
    expect(fetchMock).toHaveBeenCalledWith('/api/tmdb?op=search&query=matrix&page=1');
  });

  it('getFilm hits the proxy with the id', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 603 }) });
    vi.stubGlobal('fetch', fetchMock);
    await getFilm(603);
    expect(fetchMock).toHaveBeenCalledWith('/api/tmdb?op=movie&id=603');
  });

  it('throws when the proxy responds non-ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 502, json: async () => ({}) }),
    );
    await expect(getFilm(1)).rejects.toThrow('tmdb proxy 502');
  });
});
