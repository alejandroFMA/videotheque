import { describe, expect, it } from 'vitest';
import {
  EMPTY_DETAILS,
  crewLines,
  distinctScenes,
  parseCaseDetails,
  sceneFrames,
  sceneSources,
  toCaseJson,
  wrapItems,
} from '../src/lib/case-details';
import { CASE_AND, CASE_CREW_LABELS, CASE_DIRECTED_BY } from '../src/constants';

const row = {
  backdrop_paths: ['/a.jpg', '/b.jpg'],
  cast_names: ['Sigourney Weaver', 'Tom Skerritt'],
  crew: [{ job: 'music' as const, names: ['Jerry Goldsmith'] }],
  companies: [{ name: 'Brandywine', logo_path: null }],
};

describe('parseCaseDetails', () => {
  it('round-trips through the slot attribute', () => {
    expect(parseCaseDetails(toCaseJson(row))).toEqual({
      backdrops: row.backdrop_paths,
      cast: row.cast_names,
      crew: row.crew,
      companies: row.companies,
    });
  });

  it('falls back to empty details for a film cached before the backfill', () => {
    expect(parseCaseDetails(undefined)).toEqual(EMPTY_DETAILS);
    expect(parseCaseDetails('not json')).toEqual(EMPTY_DETAILS);
    expect(parseCaseDetails('{"cast":"oops"}').cast).toEqual([]);
  });
});

describe('crewLines', () => {
  it('labels each crew job and joins two names', () => {
    expect(
      crewLines(
        [{ job: 'producer', names: ['Walter Hill', 'Gordon Carroll'] }],
        CASE_CREW_LABELS,
        CASE_AND,
      ),
    ).toEqual(['PRODUCIDA POR WALTER HILL Y GORDON CARROLL']);
  });

  it('closes the block with the director', () => {
    expect(
      crewLines([{ job: 'music', names: ['Jerry Goldsmith'] }], CASE_CREW_LABELS, CASE_AND, {
        label: CASE_DIRECTED_BY,
        name: 'Ridley Scott',
      }),
    ).toEqual(['MÚSICA JERRY GOLDSMITH', 'DIRIGIDA POR RIDLEY SCOTT']);
  });

  it('labels a single name without a joiner', () => {
    expect(
      crewLines([{ job: 'screenplay', names: ["Dan O'Bannon"] }], CASE_CREW_LABELS, CASE_AND),
    ).toEqual(["GUION DAN O'BANNON"]);
  });
});

describe('wrapItems', () => {
  const measure = (t: string) => t.length;

  it('never breaks a name across lines', () => {
    expect(wrapItems(['HARRY DEAN STANTON', 'JOHN HURT', 'IAN HOLM'], '   ', 24, measure)).toEqual([
      'HARRY DEAN STANTON',
      'JOHN HURT   IAN HOLM',
    ]);
  });

  it('puts an item wider than the line on its own line', () => {
    expect(wrapItems(['A', 'VERY LONG NAME INDEED', 'B'], ' ', 5, measure)).toEqual([
      'A',
      'VERY LONG NAME INDEED',
      'B',
    ]);
  });

  it('returns no lines for no items', () => {
    expect(wrapItems([], ' ', 10, measure)).toEqual([]);
  });
});

describe('sceneSources', () => {
  it('uses the backdrops that loaded', () => {
    expect(sceneSources(['a', 'b'], 'poster')).toEqual(['a', 'b']);
  });

  it('falls back to the poster when no backdrop loaded', () => {
    expect(sceneSources([], 'poster')).toEqual(['poster']);
  });

  it('has no scenes without backdrops or poster', () => {
    expect(sceneSources([], null)).toEqual([]);
  });
});

describe('sceneFrames', () => {
  const ratio = 0.5;

  it('lays out one large scene over two small ones for three images', () => {
    expect(sceneFrames(3, 0, 10, 100, 20, ratio)).toEqual([
      { x: 0, y: 10, w: 100, h: 50 },
      { x: 0, y: 80, w: 40, h: 20 },
      { x: 60, y: 80, w: 40, h: 20 },
    ]);
  });

  it('puts two images side by side instead of repeating one', () => {
    expect(sceneFrames(2, 0, 10, 100, 20, ratio)).toEqual([
      { x: 0, y: 10, w: 40, h: 20 },
      { x: 60, y: 10, w: 40, h: 20 },
    ]);
  });

  it('frames a single image once, large', () => {
    expect(sceneFrames(1, 0, 10, 100, 20, ratio)).toEqual([{ x: 0, y: 10, w: 100, h: 50 }]);
  });

  it('has no frames without images and never more than three', () => {
    expect(sceneFrames(0, 0, 10, 100, 20, ratio)).toEqual([]);
    expect(sceneFrames(5, 0, 10, 100, 20, ratio)).toHaveLength(3);
  });
});

describe('distinctScenes', () => {
  const flat = (v: number) => [v, v, v, v];

  it('drops a scene nearly identical to an earlier one', () => {
    expect(distinctScenes([flat(100), flat(110), flat(200)], 22)).toEqual([0, 2]);
  });

  it('keeps scenes that differ enough and ones it could not sample', () => {
    expect(distinctScenes([flat(0), null, flat(30)], 22)).toEqual([0, 1, 2]);
  });
});
