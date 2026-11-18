/**
 * What the back of the 3D case draws beyond the basic film fields, carried
 * from the server to the browser as one JSON attribute on the shelf slot.
 * Pure: no DOM, so the billing-block layout is testable in node.
 */
import type { Company, CrewCredit, CrewJob, FilmRow } from './tmdb-mapping';

export interface CaseDetails {
  backdrops: string[];
  cast: string[];
  crew: CrewCredit[];
  companies: Company[];
}

export const EMPTY_DETAILS: CaseDetails = { backdrops: [], cast: [], crew: [], companies: [] };

type CaseFields = Pick<FilmRow, 'backdrop_paths' | 'cast_names' | 'crew' | 'companies'>;

export function toCaseJson(film: CaseFields): string {
  const details: CaseDetails = {
    backdrops: film.backdrop_paths,
    cast: film.cast_names,
    crew: film.crew,
    companies: film.companies,
  };
  return JSON.stringify(details);
}

const arrayOr = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

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
  };
}

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
