export interface TmdbSearchResult {
  id: number;
  title: string;
  release_date?: string;
  poster_path?: string | null;
  overview?: string;
}

export interface TmdbSearchResponse {
  page: number;
  total_pages: number;
  total_results: number;
  results: TmdbSearchResult[];
}

export interface TmdbCrewMember {
  job?: string;
  name?: string;
}

export interface TmdbMovie {
  id: number;
  title: string;
  original_title?: string;
  release_date?: string;
  poster_path?: string | null;
  overview?: string;
  credits?: { crew?: TmdbCrewMember[] };
}

/** The shape inserted into `public.films`, minus spine_color/spine_dark (browser-computed). */
export interface FilmRow {
  id: number;
  title: string;
  original_title: string | null;
  year: number | null;
  poster_path: string | null;
  overview: string | null;
  director: string | null;
}

const IMAGE_BASE = 'https://image.tmdb.org/t/p/';

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

/** Map a TMDB movie (with credits appended) to a `films` row. The one place that
 *  knows the TMDB → films mapping; add a cached field here and in the migration. */
export function toFilmRow(movie: TmdbMovie): FilmRow {
  const release = movie.release_date ?? '';
  return {
    id: movie.id,
    title: movie.title,
    original_title: movie.original_title ?? null,
    year: /^\d{4}/.test(release) ? Number(release.slice(0, 4)) : null,
    poster_path: movie.poster_path ?? null,
    overview: movie.overview ?? null,
    director: movie.credits?.crew?.find((c) => c.job === 'Director')?.name ?? null,
  };
}

export function posterUrl(path: string | null | undefined, size = 'w500'): string | null {
  return path ? `${IMAGE_BASE}${size}${path}` : null;
}
