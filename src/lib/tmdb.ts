/**
 * Browser-only. `searchFilms`/`getFilm` fetch the root-relative `/api/tmdb`,
 * which only resolves in the browser — server code must not import this module.
 * (Per CLAUDE.md, rendering a shelf never calls TMDB anyway.)
 */

export * from './tmdb-mapping';
import type { TmdbMovie, TmdbSearchResponse } from './tmdb-mapping';

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`tmdb proxy ${res.status}`);
  return res.json() as Promise<T>;
}

export function searchFilms(query: string, page = 1): Promise<TmdbSearchResponse> {
  return getJson<TmdbSearchResponse>(
    `/api/tmdb?op=search&query=${encodeURIComponent(query)}&page=${page}`,
  );
}

export function getFilm(id: number): Promise<TmdbMovie> {
  return getJson<TmdbMovie>(`/api/tmdb?op=movie&id=${id}`);
}
