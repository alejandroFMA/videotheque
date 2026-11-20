/**
 * The score stickers on the front of the case: the Rotten Tomatoes
 * Tomatometer and the IMDb rating, both read from OMDb. Pure, with no `fetch`
 * and no runtime imports, so it loads under plain Node for the backfill
 * script as well as through Vite.
 */

/** The `films` columns this module fills. */
export interface ScoreFields {
  /** Tomatometer, 0–100. */
  rt_score: number | null;
  /** One decimal, 0–10. */
  imdb_rating: number | null;
  /** Null until OMDb has been asked and answered. */
  scores_checked_at: string | null;
}

export const EMPTY_SCORES: ScoreFields = {
  rt_score: null,
  imdb_rating: null,
  scores_checked_at: null,
};

export type OmdbScores = Pick<ScoreFields, 'rt_score' | 'imdb_rating'>;

const RT_SOURCE = 'Rotten Tomatoes';
const PERCENT = /^(\d{1,3})%$/;
const MAX_PERCENT = 100;
const MAX_IMDB = 10;

/** The scores in an OMDb answer, or null when the body is not one. An OMDb
 *  error (`Response: 'False'`, e.g. an unknown id) is still an answer: the
 *  film simply has no scores. */
export function parseOmdb(json: unknown): OmdbScores | null {
  if (typeof json !== 'object' || json === null || !('Response' in json)) return null;
  const body = json as { imdbRating?: unknown; Ratings?: unknown };

  const imdb = Number(body.imdbRating);
  const ratings = Array.isArray(body.Ratings)
    ? (body.Ratings as { Source?: unknown; Value?: unknown }[])
    : [];
  const rt = ratings.find((r) => typeof r === 'object' && r !== null && r.Source === RT_SOURCE);
  const percent = typeof rt?.Value === 'string' ? PERCENT.exec(rt.Value) : null;
  const rtScore = percent ? Number(percent[1]) : NaN;

  return {
    rt_score: rtScore >= 0 && rtScore <= MAX_PERCENT ? rtScore : null,
    imdb_rating: typeof body.imdbRating === 'string' && imdb >= 0 && imdb <= MAX_IMDB ? imdb : null,
  };
}
