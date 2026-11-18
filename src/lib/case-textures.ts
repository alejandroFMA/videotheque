/**
 * Canvas drawing for every face of the 3D case. Browser-only (canvas, fonts),
 * and free of Three.js so the scene module stays the only one importing it.
 * Values come from the spike the owner signed off; see
 * docs/superpowers/specs/2026-11-16-3d-film-case-design.md.
 */
import { CASE_AND, CASE_CREW_LABELS, CASE_DIRECTED_BY, CASE_FORMAT, WORDMARK } from '../constants';
import { crewLines, sceneFrames, sceneSources, wrapItems, type CaseDetails } from './case-details';
import { CASE_WIDTH } from './case-pose';

export interface CaseFilm {
  id: number;
  title: string;
  year: number | null;
  director: string | null;
  overview: string | null;
  spineColor: string;
  spineDark: boolean;
}

export interface CaseImages {
  poster: HTMLImageElement | null;
  backdrops: HTMLImageElement[];
  /** Index-aligned with `details.companies`; null where TMDB has no logo or it failed. */
  logos: (HTMLImageElement | null)[];
}

const FONT_DISPLAY = '"Big Shoulders", "Arial Narrow", sans-serif';
const FONT_SPINE = '"Archivo Narrow", "Arial Narrow", sans-serif';
const FONT_UI = 'Archivo, system-ui, sans-serif';

const INK_ON_DARK = '#f3eee4';
const INK_ON_LIGHT = '#171412';
const inkFor = (film: CaseFilm) => (film.spineDark ? INK_ON_DARK : INK_ON_LIGHT);

/** Spine and side textures share this width; their height follows the depth. */
const STRIP_WIDTH = 200;

// The shelf spine is 172px tall with its title from 13px, clipped at 146px.
const SPINE_REFERENCE_HEIGHT = 172;
const SPINE_TITLE_TOP = 13;
const SPINE_TITLE_MAX = 146;
const SPINE_TITLE_SIZE = 0.37;
const SPINE_TITLE_TRACKING = 0.045;
const EDGE_SHADE = 0.18;

function canvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = Math.round(width);
  c.height = Math.round(height);
  return [c, c.getContext('2d')!];
}

function setTracking(ctx: CanvasRenderingContext2D, px: number) {
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${px}px`;
}

function ellipsize(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

function wrapWords(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  return wrapItems(text.split(/\s+/).filter(Boolean), ' ', max, (t) => ctx.measureText(t).width);
}

function gradient(
  ctx: CanvasRenderingContext2D,
  [x0, y0, x1, y1]: [number, number, number, number],
  stops: [number, string][],
): CanvasGradient {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [at, color] of stops) g.addColorStop(at, color);
  return g;
}

/** Never rejects: a font that fails to load only means the canvas falls back
 *  to the stack's next face, which must not hold the case. */
export async function loadCaseFonts(): Promise<void> {
  await Promise.all([
    document.fonts.load(`700 40px ${FONT_SPINE}`),
    document.fonts.load(`800 40px ${FONT_DISPLAY}`),
    document.fonts.load(`400 20px ${FONT_UI}`),
    document.fonts.load(`700 20px ${FONT_UI}`),
  ]).catch(() => undefined);
}

/** The same cardboard sleeve as `.spine` in Spine.astro, title running down it. */
export function spineCanvas(film: CaseFilm, depth: number): HTMLCanvasElement {
  const w = STRIP_WIDTH;
  const h = w / depth;
  const [c, ctx] = canvas(w, h);
  ctx.fillStyle = film.spineColor;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = gradient(
    ctx,
    [0, 0, w, 0],
    [
      [0, 'rgba(255,255,255,0.2)'],
      [0.22, 'rgba(255,255,255,0)'],
      [0.72, 'rgba(0,0,0,0)'],
      [1, 'rgba(0,0,0,0.24)'],
    ],
  );
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = gradient(
    ctx,
    [0, 0, 0, h],
    [
      [0, 'rgba(0,0,0,0.22)'],
      [0.05, 'rgba(0,0,0,0)'],
      [0.94, 'rgba(0,0,0,0)'],
      [1, 'rgba(0,0,0,0.2)'],
    ],
  );
  ctx.fillRect(0, 0, w, h);

  const size = w * SPINE_TITLE_SIZE;
  ctx.font = `700 ${size}px ${FONT_SPINE}`;
  setTracking(ctx, size * SPINE_TITLE_TRACKING);
  ctx.fillStyle = inkFor(film);
  ctx.textBaseline = 'middle';
  ctx.save();
  ctx.translate(w / 2, (h * SPINE_TITLE_TOP) / SPINE_REFERENCE_HEIGHT);
  ctx.rotate(Math.PI / 2);
  ctx.fillText(
    ellipsize(ctx, film.title.toUpperCase(), (h * SPINE_TITLE_MAX) / SPINE_REFERENCE_HEIGHT),
    0,
    0,
  );
  ctx.restore();
  return c;
}

/** Top and bottom: the spine colour, a little darker. */
export function edgeCanvas(film: CaseFilm): HTMLCanvasElement {
  const size = 8;
  const [c, ctx] = canvas(size, size);
  ctx.fillStyle = film.spineColor;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = `rgba(0,0,0,${EDGE_SHADE})`;
  ctx.fillRect(0, 0, size, size);
  return c;
}

const SIDE = {
  cardboardShade: 0.25,
  wall: 0.075,
  cap: 0.007,
  cassette: '#141414',
  ribBands: [
    [0.04, 0.17],
    [0.83, 0.96],
  ] as const,
  ribStep: 10,
  label: { x: 0.25, w: 0.5, y: 0.23, h: 0.54 },
  wallShadow: 0.2,
  capShadow: 0.012,
  cutEdge: 2,
};

/** The open side: the sleeve's two cardboard walls and the black cassette
 *  sitting back inside them, so it reads as depth, not a flat panel. */
export function sideCanvas(film: CaseFilm, depth: number): HTMLCanvasElement {
  const w = STRIP_WIDTH;
  const h = w / depth;
  const [c, ctx] = canvas(w, h);
  ctx.fillStyle = film.spineColor;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = `rgba(0,0,0,${SIDE.cardboardShade})`;
  ctx.fillRect(0, 0, w, h);

  const x0 = w * SIDE.wall;
  const x1 = w - x0;
  const y0 = h * SIDE.cap;
  const y1 = h - y0;
  ctx.fillStyle = SIDE.cassette;
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);

  // Each rib is a lit ridge over a dark groove, so it reads under the light.
  for (const [from, to] of SIDE.ribBands) {
    for (let y = h * from; y < h * to; y += SIDE.ribStep) {
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.fillRect(x0, y, x1 - x0, 2);
      ctx.fillStyle = '#2a2a2a';
      ctx.fillRect(x0, y + 2, x1 - x0, 3);
      ctx.fillStyle = '#050505';
      ctx.fillRect(x0, y + 5, x1 - x0, 3);
    }
  }

  const { label } = SIDE;
  const lx = w * label.x;
  const lw = w * label.w;
  ctx.fillStyle = gradient(
    ctx,
    [lx, 0, lx + lw, 0],
    [
      [0, '#dcdbd6'],
      [0.5, '#efeeea'],
      [1, '#d6d5d0'],
    ],
  );
  ctx.fillRect(lx, h * label.y, lw, h * label.h);

  ctx.fillStyle = gradient(
    ctx,
    [x0, 0, x1, 0],
    [
      [0, 'rgba(0,0,0,0.9)'],
      [SIDE.wallShadow, 'rgba(0,0,0,0)'],
      [1 - SIDE.wallShadow, 'rgba(0,0,0,0)'],
      [1, 'rgba(0,0,0,0.9)'],
    ],
  );
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  ctx.fillStyle = gradient(
    ctx,
    [0, y0, 0, y1],
    [
      [0, 'rgba(0,0,0,0.8)'],
      [SIDE.capShadow, 'rgba(0,0,0,0)'],
      [1 - SIDE.capShadow, 'rgba(0,0,0,0)'],
      [1, 'rgba(0,0,0,0.8)'],
    ],
  );
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);

  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(x0 - SIDE.cutEdge, 0, SIDE.cutEdge, h);
  ctx.fillRect(x1, 0, SIDE.cutEdge, h);
  return c;
}

const BACK = {
  width: 1000,
  ground: '#0f0e0d',
  margin: 57,
  band: 104,
  footStrip: 22,
  wordmark: { size: 46, tracking: 10 },
  format: { height: 64, paddingX: 0.22, rule: 0.06 },
  scenesTop: 150,
  sceneGap: 34,
  frame: 7,
  frameColor: '#efeadf',
  synopsis: { size: 38, leading: 54, gap: 84, color: '#e6e1d7' },
  cast: { size: 25, leading: 34, color: '#e6e1d7' },
  crew: { size: 21, leading: 30, color: '#9a958c' },
  billingTracking: 2,
  billingSep: '   ',
  billingGap: 36,
  bottomRow: 170,
  barcode: { w: 250, h: 118, pad: 14, bars: 76, digits: 18 },
  logo: { maxH: 64, maxW: 170, gap: 36, tint: '#cfc9be', nameSize: 20 },
  paper: '#f4f1ea',
};

const SCENE_RATIO = 9 / 16;
// A decorative barcode from the TMDB id: same bars for the same film, not an EAN.
const BARCODE_SEED_MUL = 9301;
const BARCODE_SEED_ADD = 49297;
const BARCODE_SEED_MOD = 233280;
const BARCODE_DIGITS = 12;
const BARCODE_PAD_DIGITS = '84';

function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / scale;
  const sh = h / scale;
  ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
}

function framedScene(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  ctx.fillStyle = BACK.frameColor;
  ctx.fillRect(x - BACK.frame, y - BACK.frame, w + BACK.frame * 2, h + BACK.frame * 2);
  drawCover(ctx, img, x, y, w, h);
}

function tinted(img: HTMLImageElement, color: string, w: number, h: number): HTMLCanvasElement {
  const [c, ctx] = canvas(w, h);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, c.width, c.height);
  return c;
}

/** The format named in our own type, in a thin rule box: not the JVC logo. */
function drawFormat(ctx: CanvasRenderingContext2D, right: number, middle: number, color: string) {
  const { height, paddingX, rule } = BACK.format;
  ctx.save();
  ctx.font = `800 ${height * 0.78}px ${FONT_DISPLAY}`;
  setTracking(ctx, height * 0.08);
  ctx.textBaseline = 'middle';
  const boxW = ctx.measureText(CASE_FORMAT).width + height * paddingX * 2;
  ctx.strokeStyle = color;
  ctx.lineWidth = height * rule;
  ctx.strokeRect(right - boxW, middle - height / 2, boxW, height);
  ctx.fillStyle = color;
  ctx.fillText(CASE_FORMAT, right - boxW + height * paddingX, middle + height * 0.04);
  ctx.restore();
}

function drawBarcode(ctx: CanvasRenderingContext2D, filmId: number, x: number, y: number) {
  const { w, h, pad, bars, digits } = BACK.barcode;
  ctx.fillStyle = BACK.paper;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = BACK.ground;
  let seed = filmId * BARCODE_SEED_MUL + BARCODE_SEED_ADD;
  for (let bx = x + pad; bx < x + w - pad;) {
    seed = (seed * BARCODE_SEED_MUL + BARCODE_SEED_ADD) % BARCODE_SEED_MOD;
    const barW = 3 + (seed % 5);
    if (seed % 3) ctx.fillRect(bx, y + 12, barW, bars);
    bx += barW + 3;
  }
  ctx.font = `400 ${digits}px ${FONT_UI}`;
  setTracking(ctx, 1);
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(String(filmId).padStart(BARCODE_DIGITS, BARCODE_PAD_DIGITS), x + 32, y + h - 10);
}

/** The 90s back: scenes, synopsis, billing block, logos, barcode.
 *  Whatever the cache lacks is left out rather than faked. */
export function backCanvas(
  film: CaseFilm,
  details: CaseDetails,
  images: CaseImages,
): HTMLCanvasElement {
  const cw = BACK.width;
  const ch = cw / CASE_WIDTH;
  const [c, ctx] = canvas(cw, ch);
  const pad = BACK.margin;
  const inner = cw - pad * 2;
  const ink = inkFor(film);

  ctx.fillStyle = BACK.ground;
  ctx.fillRect(0, 0, cw, ch);
  ctx.fillStyle = film.spineColor;
  ctx.fillRect(0, 0, cw, BACK.band);
  ctx.fillRect(0, ch - BACK.footStrip, cw, BACK.footStrip);

  ctx.fillStyle = ink;
  ctx.textBaseline = 'middle';
  ctx.font = `800 ${BACK.wordmark.size}px ${FONT_DISPLAY}`;
  setTracking(ctx, BACK.wordmark.tracking);
  ctx.fillText(WORDMARK.toUpperCase(), pad, BACK.band / 2 + 2);
  drawFormat(ctx, cw - pad, BACK.band / 2, ink);

  // Without backdrops the poster stands in; with neither there are no scenes
  // and the text moves up.
  const sources = sceneSources(images.backdrops, images.poster);
  const frames = sceneFrames(
    sources.length,
    pad,
    BACK.scenesTop,
    inner,
    BACK.sceneGap,
    SCENE_RATIO,
  );
  frames.forEach((f, i) => framedScene(ctx, sources[i]!, f.x, f.y, f.w, f.h));
  let y = frames.length ? Math.max(...frames.map((f) => f.y + f.h)) : BACK.scenesTop;

  // Just the synopsis below the scenes: the spine and the front already carry
  // the title and year; the director closes the billing block.
  ctx.textBaseline = 'alphabetic';

  // Bottom up: the logo row, then the billing block, then the synopsis takes
  // whatever height is left.
  const rowY = ch - BACK.bottomRow;
  setTracking(ctx, BACK.billingTracking);
  ctx.font = `700 ${BACK.cast.size}px ${FONT_SPINE}`;
  const castLines = wrapItems(
    details.cast.map((n) => n.toUpperCase()),
    BACK.billingSep,
    inner,
    (t) => ctx.measureText(t).width,
  );
  ctx.font = `700 ${BACK.crew.size}px ${FONT_SPINE}`;
  const crewWrapped = wrapItems(
    crewLines(details.crew, CASE_CREW_LABELS, CASE_AND, {
      label: CASE_DIRECTED_BY,
      name: film.director,
    }),
    BACK.billingSep,
    inner,
    (t) => ctx.measureText(t).width,
  );
  const billingH = castLines.length * BACK.cast.leading + crewWrapped.length * BACK.crew.leading;
  const billingTop = billingH ? rowY - BACK.billingGap - billingH : rowY;

  if (film.overview) {
    ctx.fillStyle = BACK.synopsis.color;
    ctx.font = `400 ${BACK.synopsis.size}px ${FONT_UI}`;
    setTracking(ctx, 0);
    y += BACK.synopsis.gap;
    const room = Math.max(
      0,
      Math.floor((billingTop - BACK.billingGap - y) / BACK.synopsis.leading) + 1,
    );
    const lines = wrapWords(ctx, film.overview, inner);
    lines.slice(0, room).forEach((line, i, shown) => {
      const cut = i === shown.length - 1 && shown.length < lines.length;
      ctx.fillText(
        cut ? ellipsize(ctx, `${line} …`, inner) : line,
        pad,
        y + i * BACK.synopsis.leading,
      );
    });
  }

  ctx.textAlign = 'center';
  setTracking(ctx, BACK.billingTracking);
  let by = billingTop + BACK.cast.leading * 0.75;
  ctx.fillStyle = BACK.cast.color;
  ctx.font = `700 ${BACK.cast.size}px ${FONT_SPINE}`;
  for (const line of castLines) {
    ctx.fillText(line, cw / 2, by);
    by += BACK.cast.leading;
  }
  ctx.fillStyle = BACK.crew.color;
  ctx.font = `700 ${BACK.crew.size}px ${FONT_SPINE}`;
  for (const line of crewWrapped) {
    ctx.fillText(line, cw / 2, by);
    by += BACK.crew.leading;
  }
  ctx.textAlign = 'left';

  drawBarcode(ctx, film.id, pad, rowY);

  // Logos right-aligned; a company that would cross the barcode is dropped.
  const { logo } = BACK;
  const left = pad + BACK.barcode.w + logo.gap;
  const mid = rowY + BACK.barcode.h / 2;
  let right = cw - pad;
  ctx.font = `700 ${logo.nameSize}px ${FONT_SPINE}`;
  ctx.textBaseline = 'middle';
  details.companies.forEach((company, i) => {
    const img = images.logos[i];
    const name = company.name.toUpperCase();
    const h = img ? Math.min(logo.maxH, (logo.maxW * img.naturalHeight) / img.naturalWidth) : 0;
    const w = img ? (h * img.naturalWidth) / img.naturalHeight : ctx.measureText(name).width;
    if (right - w < left) return;
    if (img) ctx.drawImage(tinted(img, logo.tint, w, h), right - w, mid - h / 2);
    else {
      ctx.fillStyle = logo.tint;
      ctx.fillText(name, right - w, mid);
    }
    right -= w + logo.gap;
  });
  return c;
}
