/**
 * What the back of the 3D case draws beyond the basic film fields, carried
 * from the server to the browser as one JSON attribute on the shelf slot.
 * Pure: no DOM, so the billing-block layout is testable in node.
 */
import type { Company, CrewCredit, CrewJob, FilmRow } from './tmdb-mapping';
import type { ScoreFields } from './scores';

/** The scores for the front stickers. */
export interface CaseScores {
  rt: number | null;
  imdb: number | null;
}

export interface CaseDetails {
  backdrops: string[];
  cast: string[];
  crew: CrewCredit[];
  companies: Company[];
  scores: CaseScores;
}

const NO_SCORES: CaseScores = { rt: null, imdb: null };

export const EMPTY_DETAILS: CaseDetails = {
  backdrops: [],
  cast: [],
  crew: [],
  companies: [],
  scores: NO_SCORES,
};

type CaseFields = Pick<FilmRow, 'backdrop_paths' | 'cast_names' | 'crew' | 'companies'> &
  Pick<ScoreFields, 'rt_score' | 'imdb_rating'>;

export function toCaseJson(film: CaseFields): string {
  const details: CaseDetails = {
    backdrops: film.backdrop_paths,
    cast: film.cast_names,
    crew: film.crew,
    companies: film.companies,
    scores: {
      rt: film.rt_score,
      // PostgREST may hand numeric(3,1) back as a string.
      imdb: film.imdb_rating === null ? null : Number(film.imdb_rating),
    },
  };
  return JSON.stringify(details);
}

const arrayOr = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

const MAX_PERCENT = 100;
const MAX_IMDB = 10;

const numberIn = (value: unknown, min: number, max: number) =>
  typeof value === 'number' && value >= min && value <= max ? value : null;

function parseScores(value: unknown): CaseScores {
  if (typeof value !== 'object' || value === null) return NO_SCORES;
  const v = value as Record<string, unknown>;
  return { rt: numberIn(v.rt, 0, MAX_PERCENT), imdb: numberIn(v.imdb, 0, MAX_IMDB) };
}

/** Never throws: a film cached before the backfill, or a malformed attribute,
 *  reads as empty details and the back degrades instead of failing. */
export function parseCaseDetails(json: string | undefined): CaseDetails {
  if (!json) return EMPTY_DETAILS;
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return EMPTY_DETAILS;
  }
  if (typeof raw !== 'object' || raw === null) return EMPTY_DETAILS;
  const r = raw as Record<string, unknown>;
  return {
    backdrops: arrayOr<string>(r.backdrops),
    cast: arrayOr<string>(r.cast),
    crew: arrayOr<CrewCredit>(r.crew),
    companies: arrayOr<Company>(r.companies),
    scores: parseScores(r.scores),
  };
}

// Spanish typography: a narrow no-break space before the percent sign, and a
// decimal comma.
const NARROW_NBSP = '\u202F';
const IMDB_DECIMALS = 1;

export const rtSticker = (score: number) => `${score}${NARROW_NBSP}%`;
export const imdbSticker = (rating: number) => rating.toFixed(IMDB_DECIMALS).replace('.', ',');

/** One printed line per job: label, then up to two names joined by `and`.
 *  The director, when given, closes the block, as on a 90s sleeve. */
export function crewLines(
  crew: CrewCredit[],
  labels: Record<CrewJob, string>,
  and: string,
  director?: { label: string; name: string | null },
): string[] {
  const lines = crew.map(({ job, names }) =>
    `${labels[job]} ${names.join(` ${and} `)}`.toUpperCase(),
  );
  if (director?.name) lines.push(`${director.label} ${director.name}`.toUpperCase());
  return lines;
}

/** Greedy wrap that never splits an item, so a name always stays on one line. */
export function wrapItems(
  items: string[],
  sep: string,
  maxWidth: number,
  measure: (text: string) => number,
): string[] {
  const lines: string[] = [];
  let line = '';
  for (const item of items) {
    const next = line ? line + sep + item : item;
    if (line && measure(next) > maxWidth) {
      lines.push(line);
      line = item;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** The images the back frames as scenes: the backdrops that actually loaded,
 *  else the poster, else none. Decided on what loaded, not on what the cache
 *  lists, so a blocked or slow backdrop still gets the poster crop. */
export function sceneSources<T>(loadedBackdrops: T[], poster: T | null): T[] {
  if (loadedBackdrops.length) return loadedBackdrops;
  return poster ? [poster] : [];
}

const meanDifference = (a: number[], b: number[]) =>
  a.reduce((sum, v, i) => sum + Math.abs(v - (b[i] ?? v)), 0) / a.length;

/** Indices of the scenes worth framing: TMDB often lists the same still twice
 *  under different files, so a scene whose sampled greyscale grid is within
 *  `threshold` of one already kept is dropped. A scene that could not be
 *  sampled (null) is kept, since nothing says it is a repeat. */
export function distinctScenes(grids: (number[] | null)[], threshold: number): number[] {
  const kept: number[] = [];
  grids.forEach((grid, i) => {
    const repeat =
      grid && kept.some((k) => grids[k] && meanDifference(grid, grids[k]!) < threshold);
    if (!repeat) kept.push(i);
  });
  return kept;
}

export interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
}

const MAX_SCENES = 3;

/** One frame per distinct image, never a repeat: three images get one large
 *  over two small, two sit side by side, one is framed large on its own. */
export function sceneFrames(
  count: number,
  x: number,
  y: number,
  width: number,
  gap: number,
  ratio: number,
): Frame[] {
  const n = Math.min(count, MAX_SCENES);
  if (n === 0) return [];
  const big: Frame = { x, y, w: width, h: width * ratio };
  if (n === 1) return [big];
  const smallW = (width - gap) / 2;
  const smallY = n === MAX_SCENES ? y + big.h + gap : y;
  const small = (left: number): Frame => ({ x: left, y: smallY, w: smallW, h: smallW * ratio });
  const pair = [small(x), small(x + smallW + gap)];
  return n === MAX_SCENES ? [big, ...pair] : pair;
}

/** Rotten Tomatoes calls a film fresh at a Tomatometer of 60 % or more. */
const RT_FRESH_MIN = 60;

export type RtVerdict = 'fresh' | 'rotten';

export const rtVerdict = (score: number): RtVerdict => (score >= RT_FRESH_MIN ? 'fresh' : 'rotten');

export function firstLoaded<T>(items: (T | null)[]): T | null {
  return items.find((item): item is T => item !== null) ?? null;
}

export interface SpineLayout {
  thumb: { left: number; top: number; width: number; height: number } | null;
  titleTop: number;
  titleMax: number;
  markMiddle: number;
  markHeight: number;
  logo: { top: number; maxWidth: number; maxHeight: number } | null;
}

// In canvas px of the case spine (a 200px strip); signed off on the prototype.
const SPINE = {
  thumbWidth: 0.84,
  thumbRatio: 1.15,
  thumbTop: 40,
  thumbGap: 46,
  markHeight: 64,
  titleGap: 40,
  logoMaxWidth: 130,
  logoMaxHeight: 80,
  footGap: 16,
  bottom: 48,
};
// Without a thumbnail the title starts where the shelf spine's does.
const SHELF_SPINE_HEIGHT = 172;
const SHELF_TITLE_TOP_PX = 13;
const SHELF_TITLE_TOP = SHELF_TITLE_TOP_PX / SHELF_SPINE_HEIGHT;

/** Top to bottom: poster thumbnail, title, the "VHS" mark, the studio logo.
 *  A missing thumbnail or logo takes no room. */
export function spineLayout(
  width: number,
  height: number,
  hasThumb: boolean,
  hasLogo: boolean,
): SpineLayout {
  const thumbW = width * SPINE.thumbWidth;
  const thumb = hasThumb
    ? {
        left: (width - thumbW) / 2,
        top: SPINE.thumbTop,
        width: thumbW,
        height: thumbW * SPINE.thumbRatio,
      }
    : null;
  const titleTop = thumb ? thumb.top + thumb.height + SPINE.thumbGap : height * SHELF_TITLE_TOP;

  const logoTop = height - SPINE.bottom - SPINE.logoMaxHeight;
  const logo = hasLogo
    ? { top: logoTop, maxWidth: SPINE.logoMaxWidth, maxHeight: SPINE.logoMaxHeight }
    : null;
  const markBottom = logo ? logo.top - SPINE.footGap : height - SPINE.bottom;
  const markMiddle = markBottom - SPINE.markHeight / 2;
  const titleMax = markBottom - SPINE.markHeight - SPINE.titleGap - titleTop;

  return { thumb, titleTop, titleMax, markMiddle, markHeight: SPINE.markHeight, logo };
}
