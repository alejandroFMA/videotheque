/**
 * The pure TMDB → `films` mapping, with no `fetch` and no imports, so both
 * the browser (`tmdb.ts`) and server code (`shelf-actions.ts`) can use it.
 */

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
  imdb_id?: string | null;
  release_date?: string;
  poster_path?: string | null;
  overview?: string;
  credits?: { cast?: { name?: string }[]; crew?: TmdbCrewMember[] };
  images?: { backdrops?: TmdbBackdrop[] };
  production_companies?: { name: string; logo_path: string | null }[];
}

export interface TmdbBackdrop {
  file_path: string;
  /** Null for a backdrop with no text on it. */
  iso_639_1: string | null;
  vote_count: number;
}

/** The jobs the back cover's billing block prints, in print order. */
export type CrewJob = 'screenplay' | 'music' | 'photography' | 'editing' | 'producer';

export interface CrewCredit {
  job: CrewJob;
  names: string[];
}

export interface Company {
  name: string;
  logo_path: string | null;
}

/** TMDB job titles behind each billing-block job. Key order is the print order. */
export const CREW_JOBS: Record<CrewJob, readonly string[]> = {
  screenplay: ['Screenplay', 'Writer'],
  music: ['Original Music Composer', 'Music'],
  photography: ['Director of Photography'],
  editing: ['Editor'],
  producer: ['Producer'],
};

const MAX_BACKDROPS = 3;
const MAX_CAST = 6;
const MAX_NAMES_PER_JOB = 2;
const MAX_COMPANIES = 3;

/** The shape inserted into `public.films`, minus spine_color/spine_dark (browser-computed). */
export interface FilmRow {
  id: number;
  title: string;
  original_title: string | null;
  year: number | null;
  poster_path: string | null;
  overview: string | null;
  director: string | null;
  backdrop_paths: string[];
  cast_names: string[];
  crew: CrewCredit[];
  companies: Company[];
}

const IMAGE_BASE = 'https://image.tmdb.org/t/p/';

function textlessBackdrops(movie: TmdbMovie): string[] {
  return (movie.images?.backdrops ?? [])
    .filter((b) => b.iso_639_1 === null)
    .sort((a, b) => b.vote_count - a.vote_count)
    .slice(0, MAX_BACKDROPS)
    .map((b) => b.file_path);
}

function billingCrew(crew: TmdbCrewMember[]): CrewCredit[] {
  return (Object.keys(CREW_JOBS) as CrewJob[]).flatMap((job) => {
    const names: string[] = [];
    for (const member of crew) {
      if (
        member.name &&
        member.job &&
        CREW_JOBS[job].includes(member.job) &&
        !names.includes(member.name)
      ) {
        names.push(member.name);
      }
    }
    return names.length ? [{ job, names: names.slice(0, MAX_NAMES_PER_JOB) }] : [];
  });
}

/** Map a TMDB movie (with credits and images appended) to a `films` row,
 *  including what the back of the 3D case draws: backdrops, cast, crew and
 *  companies. The one place that knows the TMDB → films mapping; add a cached
 *  field here and in the migration. */
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
    backdrop_paths: textlessBackdrops(movie),
    cast_names: (movie.credits?.cast ?? [])
      .flatMap((c) => (c.name ? [c.name] : []))
      .slice(0, MAX_CAST),
    crew: billingCrew(movie.credits?.crew ?? []),
    companies: (movie.production_companies ?? [])
      .slice(0, MAX_COMPANIES)
      .map((c) => ({ name: c.name, logo_path: c.logo_path ?? null })),
  };
}

/** `w154` is reserved for the spine-colour canvas read in `colors.ts`. Rendering
 *  a poster at that size elsewhere would cache a CORS-less response for the URL
 *  the extraction needs, and every spine would silently fall back. */
export function posterUrl(path: string | null | undefined, size = 'w500'): string | null {
  return path ? `${IMAGE_BASE}${size}${path}` : null;
}
