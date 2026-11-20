/**
 * The server-side OMDb lookup behind the score stickers. Called when a film
 * is first cached and by the backfill script; never while rendering.
 *
 * Imports carry their `.ts` extension so the backfill can load this module
 * under plain Node, outside Vite.
 */
import { EMPTY_SCORES, parseOmdb, type ScoreFields } from './scores.ts';
import type { TmdbMovie } from './tmdb-mapping.ts';

const OMDB_URL = 'https://www.omdbapi.com/';
/** An add waits on this, so a slow OMDb must not hold it for long. */
export const SCORES_TIMEOUT_MS = 4000;

let warnedMissingKey = false;

/** Never rejects: a failed lookup yields no scores and an unchecked row, so
 *  the backfill retries it, and the add goes on without them. */
export async function lookupScores(
  movie: TmdbMovie,
  key: string | undefined,
  fetchImpl: typeof globalThis.fetch,
  now: () => Date = () => new Date(),
): Promise<ScoreFields> {
  if (!key) {
    if (!warnedMissingKey) console.warn('[scores] OMDB_API_KEY is not set; skipping scores');
    warnedMissingKey = true;
    return EMPTY_SCORES;
  }
  // TMDB knows no IMDb id for this film: OMDb has nothing to say about it.
  if (!movie.imdb_id) return { ...EMPTY_SCORES, scores_checked_at: now().toISOString() };

  const url = new URL(OMDB_URL);
  url.searchParams.set('i', movie.imdb_id);
  url.searchParams.set('apikey', key);
  try {
    const res = await fetchImpl(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(SCORES_TIMEOUT_MS),
    });
    const scores = res.ok ? parseOmdb(await res.json()) : null;
    return scores ? { ...scores, scores_checked_at: now().toISOString() } : EMPTY_SCORES;
  } catch {
    return EMPTY_SCORES;
  }
}
