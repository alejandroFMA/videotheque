import { describe, expect, it } from 'vitest';
import {
  EMPTY_DETAILS,
  crewLines,
  distinctScenes,
  parseCaseDetails,
  sceneFrames,
  sceneSources,
  toCaseJson,
  imdbSticker,
  rtSticker,
  rtVerdict,
  wrapItems,
  firstLoaded,
  spineLayout,
} from '../src/lib/case-details';
import { CASE_DEPTH } from '../src/lib/case-pose';
import { EMPTY_SCORES } from '../src/lib/scores';
import { CASE_AND, CASE_CREW_LABELS, CASE_DIRECTED_BY } from '../src/constants';

const row = {
  backdrop_paths: ['/a.jpg', '/b.jpg'],
  cast_names: ['Sigourney Weaver', 'Tom Skerritt'],
  crew: [{ job: 'music' as const, names: ['Jerry Goldsmith'] }],
  companies: [{ name: 'Brandywine', logo_path: null }],
  ...EMPTY_SCORES,
  rt_score: 98,
  imdb_rating: 8.5,
};
const NO_SCORES = { rt: null, imdb: null };

describe('parseCaseDetails', () => {
  it('round-trips through the slot attribute', () => {
    expect(parseCaseDetails(toCaseJson(row))).toEqual({
      backdrops: row.backdrop_paths,
      cast: row.cast_names,
      crew: row.crew,
      companies: row.companies,
      scores: { rt: 98, imdb: 8.5 },
    });
  });

  it('reads a slot written before the scores existed as no scores', () => {
    expect(parseCaseDetails('{"cast":["A"]}').scores).toEqual(NO_SCORES);
    expect(EMPTY_DETAILS.scores).toEqual(NO_SCORES);
  });

  it('drops scores that are out of range or the wrong type', () => {
    expect(parseCaseDetails(JSON.stringify({ scores: { rt: '94', imdb: 11 } })).scores).toEqual(
      NO_SCORES,
    );
  });

  it('reads an IMDb rating PostgREST returned as a string', () => {
    const json = toCaseJson({ ...row, imdb_rating: '8.5' as unknown as number });
    expect(parseCaseDetails(json).scores.imdb).toBe(8.5);
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

describe('sticker text', () => {
  it('prints the Tomatometer with a narrow no-break space before the percent sign', () => {
    expect(rtSticker(94)).toBe('94\u202F%');
  });

  it('prints the IMDb rating with a decimal comma and one decimal', () => {
    expect(imdbSticker(7.8)).toBe('7,8');
    expect(imdbSticker(8)).toBe('8,0');
  });
});

describe('rtVerdict', () => {
  it('calls 60 % and up fresh, as Rotten Tomatoes does, and anything lower rotten', () => {
    expect(rtVerdict(60)).toBe('fresh');
    expect(rtVerdict(100)).toBe('fresh');
    expect(rtVerdict(59)).toBe('rotten');
    expect(rtVerdict(0)).toBe('rotten');
  });
});

describe('spineLayout', () => {
  const W = 200;
  const H = W / CASE_DEPTH;

  it('without thumbnail starts the title where the spine does today', () => {
    const l = spineLayout(W, H, false, false);
    expect(l.thumb).toBeNull();
    expect(l.titleTop).toBeCloseTo((H * 13) / 172);
  });

  it('starts the title below the thumbnail', () => {
    const l = spineLayout(W, H, true, true);
    expect(l.titleTop).toBeGreaterThan(l.thumb!.top + l.thumb!.height);
  });

  it('keeps the thumbnail inside the strip width', () => {
    const l = spineLayout(W, H, true, false);
    expect(l.thumb!.left).toBeGreaterThan(0);
    expect(l.thumb!.left + l.thumb!.width).toBeLessThan(W);
  });

  it('ends the title above the VHS mark', () => {
    for (const [thumb, logo] of [
      [false, false],
      [true, false],
      [false, true],
      [true, true],
    ] as const) {
      const l = spineLayout(W, H, thumb, logo);
      expect(l.titleTop + l.titleMax).toBeLessThan(l.markMiddle - l.markHeight / 2);
    }
  });

  it('puts the logo below the mark and inside the strip', () => {
    const l = spineLayout(W, H, true, true);
    expect(l.logo!.top).toBeGreaterThan(l.markMiddle + l.markHeight / 2);
    expect(l.logo!.top + l.logo!.maxHeight).toBeLessThan(H);
    expect(l.logo!.maxWidth).toBeLessThan(W);
  });

  it('reserves no logo room without a logo', () => {
    const withLogo = spineLayout(W, H, true, true);
    const without = spineLayout(W, H, true, false);
    expect(without.logo).toBeNull();
    expect(without.markMiddle).toBeGreaterThan(withLogo.markMiddle);
  });
});

describe('firstLoaded', () => {
  it('returns the first non-null entry, or null', () => {
    expect(firstLoaded([null, 'a', 'b'])).toBe('a');
    expect(firstLoaded([null, null])).toBeNull();
    expect(firstLoaded([])).toBeNull();
  });
});
