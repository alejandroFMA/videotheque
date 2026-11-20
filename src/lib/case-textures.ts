/**
 * Canvas drawing for every face of the 3D case. Browser-only (canvas, fonts),
 * and free of Three.js so the scene module stays the only one importing it.
 * Values come from the spike the owner signed off; see
 * docs/superpowers/specs/2026-11-16-3d-film-case-design.md.
 */
import {
  CASE_AND,
  CASE_CREW_LABELS,
  CASE_DIRECTED_BY,
  CASE_FORMAT,
  STICKER_IMDB_LABEL,
  WORDMARK,
} from '../constants';
import {
  crewLines,
  spineLayout,
  imdbSticker,
  rtSticker,
  rtVerdict,
  sceneFrames,
  sceneSources,
  wrapItems,
  type CaseDetails,
  type CaseScores,
  type RtVerdict,
} from './case-details';
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

/** What the spine draws besides its title; either may be missing. */
export interface SpineArt {
  poster: HTMLImageElement | null;
  logo: HTMLImageElement | null;
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
const SPINE_TITLE_SIZE = 0.37;
const SPINE_TITLE_TRACKING = 0.045;
const EDGE_SHADE = 0.18;
const THUMB_RULE = 5;
// The thumbnail's frame contrasts with the spine: paper on dark, ink on light.
const THUMB_FRAME_ON_DARK = 'rgba(0,0,0,0.6)';
const THUMB_FRAME_ON_LIGHT = 'rgba(255,255,255,0.85)';

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

/** The same cardboard sleeve as `.spine` in Spine.astro, dressed as a 90s VHS
 *  spine: poster thumbnail, title running down it, "VHS" mark, studio logo. */
export function spineCanvas(film: CaseFilm, depth: number, art: SpineArt): HTMLCanvasElement {
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

  const ink = inkFor(film);
  const layout = spineLayout(w, h, art.poster !== null, art.logo !== null);
  if (art.poster && layout.thumb) {
    const { left, top, width, height } = layout.thumb;
    ctx.fillStyle = film.spineDark ? THUMB_FRAME_ON_DARK : THUMB_FRAME_ON_LIGHT;
    ctx.fillRect(
      left - THUMB_RULE,
      top - THUMB_RULE,
      width + THUMB_RULE * 2,
      height + THUMB_RULE * 2,
    );
    drawCover(ctx, art.poster, left, top, width, height);
  }

  const size = w * SPINE_TITLE_SIZE;
  ctx.font = `700 ${size}px ${FONT_SPINE}`;
  setTracking(ctx, size * SPINE_TITLE_TRACKING);
  ctx.fillStyle = ink;
  ctx.textBaseline = 'middle';
  ctx.save();
  ctx.translate(w / 2, layout.titleTop);
  ctx.rotate(Math.PI / 2);
  ctx.fillText(ellipsize(ctx, film.title.toUpperCase(), layout.titleMax), 0, 0);
  ctx.restore();

  drawFormat(ctx, w / 2, layout.markMiddle, layout.markHeight, ink);

  if (art.logo && layout.logo) {
    const { top, maxWidth, maxHeight } = layout.logo;
    const ratio = art.logo.naturalWidth / art.logo.naturalHeight;
    const lw = Math.min(maxWidth, maxHeight * ratio);
    const lh = lw / ratio;
    ctx.drawImage(tinted(art.logo, ink, lw, lh), (w - lw) / 2, top + (maxHeight - lh) / 2);
  }
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

const FRONT_HEIGHT = 1200;

const STICKER = {
  /** Diameter, as a share of the front's width. */
  size: 0.27,
  /** The white die-cut margin, as a share of the diameter. */
  border: 0.035,
  /** From the top-right corner, as a share of the front's width. */
  inset: 0.05,
  gap: 0.02,
  /** Radians; the two lean opposite ways, as if stuck on by hand. */
  tilt: [0.12, -0.08],
  paper: '#fbf8f1',
  // The tomato or splat names the source, so this one carries no label.
  rt: { fill: '#e0453a', ink: '#fbf8f1', scale: 0.86, number: 0.27, label: 0 },
  imdb: { fill: '#f2c230', ink: '#171412', scale: 0.86, number: 0.36, label: 0.14 },
  labelTracking: 0.004,
  /** The fresh/rotten mark beside the percentage, as a share of the diameter. */
  /** Close to the value's cap height, so mark and figure read as a pair. */
  icon: { size: 0.27, gap: 0.03 },
  tomato: { red: '#e8432c', shade: '#a31f10', leaf: '#4f9a35' },
  /** A pale rim so the tomato still reads on the red sticker. */
  iconRim: { color: '#fbf8f1', width: 0.09 },
  splat: { green: '#6c9a2a', shade: '#4d7419', lobes: 9, seed: 11 },
  /** The label's widest line, as a share of the coloured disc's radius. */
  labelRoom: 1.6,
  /** The value's width, as a share of the coloured disc's radius. */
  valueRoom: 1.6,
  shadow: { color: 'rgba(0,0,0,0.45)', blur: 0.06, offset: 0.025 },
  grain: { cell: 3, alpha: 0.07, seed: 7 },
  sheen: 0.22,
};

// Procedural so no image asset ships: the same pseudo-random speckle each time.
let grainTile: HTMLCanvasElement | null = null;
function paperGrain(): HTMLCanvasElement {
  if (grainTile) return grainTile;
  const { cell, seed } = STICKER.grain;
  const tileCells = 64;
  const [c, ctx] = canvas(tileCells * cell, tileCells * cell);
  let n = seed;
  for (let y = 0; y < tileCells; y++) {
    for (let x = 0; x < tileCells; x++) {
      n = (n * BARCODE_SEED_MUL + BARCODE_SEED_ADD) % BARCODE_SEED_MOD;
      const v = n / BARCODE_SEED_MOD;
      ctx.fillStyle = v > 0.5 ? `rgba(255,255,255,${v - 0.5})` : `rgba(0,0,0,${0.5 - v})`;
      ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }
  grainTile = c;
  return c;
}

type StickerStyle = { fill: string; ink: string; scale: number; number: number; label: number };

/** Our own tomato, not Rotten Tomatoes' artwork: a red disc with a leafy calyx. */
function drawTomato(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  const { red, shade, leaf } = STICKER.tomato;
  ctx.save();
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
  g.addColorStop(0, red);
  g.addColorStop(1, shade);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.06, r, r * 0.92, 0, 0, Math.PI * 2);
  ctx.strokeStyle = STICKER.iconRim.color;
  ctx.lineWidth = r * STICKER.iconRim.width * 2;
  ctx.stroke();
  ctx.fill();
  ctx.fillStyle = leaf;
  const leaves = 5;
  for (let i = 0; i < leaves; i++) {
    const a = -Math.PI / 2 + ((i - (leaves - 1) / 2) * Math.PI) / 5;
    ctx.beginPath();
    ctx.ellipse(
      x + Math.cos(a) * r * 0.28,
      y - r * 0.78 + Math.sin(a) * r * 0.12 + r * 0.12,
      r * 0.3,
      r * 0.1,
      a,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.restore();
}

/** Our own green splat for a rotten score: an irregular blob with droplets. */
function drawSplat(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  const { green, shade, lobes, seed } = STICKER.splat;
  ctx.save();
  let n = seed;
  const rand = () => {
    n = (n * BARCODE_SEED_MUL + BARCODE_SEED_ADD) % BARCODE_SEED_MOD;
    return n / BARCODE_SEED_MOD;
  };
  const g = ctx.createRadialGradient(x, y, r * 0.1, x, y, r);
  g.addColorStop(0, green);
  g.addColorStop(1, shade);
  ctx.fillStyle = g;
  ctx.beginPath();
  for (let i = 0; i <= lobes * 2; i++) {
    const a = (i / (lobes * 2)) * Math.PI * 2;
    const rr = i % 2 ? r * (0.55 + rand() * 0.15) : r * (0.8 + rand() * 0.2);
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  for (let i = 0; i < 3; i++) {
    const a = rand() * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(
      x + Math.cos(a) * r * 1.1,
      y + Math.sin(a) * r * 1.1,
      r * (0.08 + rand() * 0.07),
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.restore();
}

function drawSticker(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  d: number,
  tilt: number,
  style: StickerStyle,
  value: string,
  label: string | null,
  icon: RtVerdict | null,
) {
  const r = d / 2;
  const inner = r * (1 - STICKER.border * 2);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(tilt);

  ctx.save();
  ctx.shadowColor = STICKER.shadow.color;
  ctx.shadowBlur = d * STICKER.shadow.blur;
  ctx.shadowOffsetX = d * STICKER.shadow.offset;
  ctx.shadowOffsetY = d * STICKER.shadow.offset;
  ctx.fillStyle = STICKER.paper;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = style.fill;
  ctx.beginPath();
  ctx.arc(0, 0, inner, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = style.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  // A wide value ("100 %") or a long label shrinks to fit the coloured disc
  // rather than spilling onto the border or being cut.
  const fitText = (
    text: string,
    size: number,
    tracking: number,
    room: number,
    y: number,
    before = 0,
  ) => {
    setTracking(ctx, tracking);
    ctx.font = `800 ${size}px ${FONT_DISPLAY}`;
    let width = ctx.measureText(text).width;
    const scale = Math.min(1, room / (width + before));
    if (scale < 1) {
      ctx.font = `800 ${size * scale}px ${FONT_DISPLAY}`;
      width = ctx.measureText(text).width;
    }
    return { width, scale };
  };

  // The value, with the fresh/rotten mark before it when there is one; the
  // pair is centred as a group and shrinks together when too wide.
  const iconSize = icon ? d * STICKER.icon.size : 0;
  const iconGap = icon ? d * STICKER.icon.gap : 0;
  const numberSize = d * style.number;
  // With no label under it, the value sits on the disc's centre line.
  const valueY = label ? d * 0.08 : numberSize * 0.36;
  const fitted = fitText(
    value,
    numberSize,
    0,
    inner * STICKER.valueRoom,
    valueY,
    iconSize + iconGap,
  );
  const iconW = (iconSize + iconGap) * fitted.scale;
  const groupLeft = -(iconW + fitted.width) / 2;
  if (icon) {
    const r = (iconSize * fitted.scale) / 2;
    const iconCentreY = valueY - numberSize * fitted.scale * 0.36;
    if (icon === 'fresh') drawTomato(ctx, groupLeft + r, iconCentreY, r);
    else drawSplat(ctx, groupLeft + r, iconCentreY, r);
    ctx.fillStyle = style.ink;
  }
  ctx.textAlign = 'left';
  ctx.fillText(value, groupLeft + iconW, valueY);
  ctx.textAlign = 'center';

  if (label) {
    fitText(label, d * style.label, d * STICKER.labelTracking, inner * STICKER.labelRoom, d * 0.25);
    ctx.fillText(label, 0, d * 0.25);
  }

  // Paper over everything, border included: grain, then a diagonal sheen.
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.globalAlpha = STICKER.grain.alpha;
  ctx.fillStyle = ctx.createPattern(paperGrain(), 'repeat')!;
  ctx.fillRect(-r, -r, d, d);
  ctx.globalAlpha = 1;
  ctx.fillStyle = gradient(
    ctx,
    [-r, -r, r, r],
    [
      [0, 'rgba(255,255,255,0)'],
      [0.35, `rgba(255,255,255,${STICKER.sheen})`],
      [0.5, 'rgba(255,255,255,0)'],
      [1, 'rgba(0,0,0,0.08)'],
    ],
  );
  ctx.fillRect(-r, -r, d, d);
  ctx.restore();
}

/** The front: the poster cropped to the sleeve, with the score stickers stuck
 *  on its top-right corner, Tomatometer above IMDb. */
export function frontCanvas(poster: HTMLImageElement, scores: CaseScores): HTMLCanvasElement {
  const [c, ctx] = canvas(FRONT_HEIGHT * CASE_WIDTH, FRONT_HEIGHT);
  drawCover(ctx, poster, 0, 0, c.width, c.height);

  const stickers = [
    scores.rt === null
      ? null
      : ([STICKER.rt, rtSticker(scores.rt), null, rtVerdict(scores.rt)] as const),
    scores.imdb === null
      ? null
      : ([STICKER.imdb, imdbSticker(scores.imdb), STICKER_IMDB_LABEL, null] as const),
  ].filter((s) => s !== null);

  const base = c.width * STICKER.size;
  const right = c.width - c.width * STICKER.inset;
  let top = c.width * STICKER.inset;
  stickers.forEach(([style, value, label, icon], i) => {
    const d = base * style.scale;
    drawSticker(ctx, right - d / 2, top + d / 2, d, STICKER.tilt[i]!, style, value, label, icon);
    top += d + c.width * STICKER.gap;
  });
  return c;
}

// The mark's padding and rule, as shares of its height.
const MARK = { paddingX: 0.22, rule: 0.06 };

/** The format named in our own type, in a thin rule box: not the JVC logo. */
function drawFormat(
  ctx: CanvasRenderingContext2D,
  centreX: number,
  middle: number,
  height: number,
  color: string,
) {
  const { paddingX, rule } = MARK;
  ctx.save();
  ctx.font = `800 ${height * 0.78}px ${FONT_DISPLAY}`;
  setTracking(ctx, height * 0.08);
  ctx.textBaseline = 'middle';
  const boxW = ctx.measureText(CASE_FORMAT).width + height * paddingX * 2;
  ctx.strokeStyle = color;
  ctx.lineWidth = height * rule;
  const left = centreX - boxW / 2;
  ctx.strokeRect(left, middle - height / 2, boxW, height);
  ctx.fillStyle = color;
  ctx.fillText(CASE_FORMAT, left + height * paddingX, middle + height * 0.04);
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
