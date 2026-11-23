/**
 * The faint glow the 3D case gives off as it leaves its slot: a CSS
 * drop-shadow on the WebGL canvas, so it follows the case's silhouette as it
 * turns. Pure, so the timing and colour are testable without a browser.
 */
import { SPINE_COLOR_PATTERN } from './spine';

/** Share of the flight after the lift over which the glow dies out. */
const GLOW_FADE_SHARE = 0.4;
// A dark spine glowing in its own lightness would not show on the dimmed shelf.
const GLOW_MIN_LIGHTNESS = 70;
const GLOW_FALLBACK = { h: 36, s: 100, l: 92 };
const TIGHT_BLUR_PX = 3;
const WIDE_BLUR_PX = 12;
const TIGHT_ALPHA = 0.55;
const WIDE_ALPHA = 0.3;
const ALPHA_DECIMALS = 3;

const easeOut = (t: number) => 1 - (1 - t) ** 3;
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

/** `t` is the open run's progress; the glow peaks as the lift ends. */
export function glowOnOpen(t: number, liftShare: number): number {
  if (t <= 0) return 0;
  if (t < liftShare) return easeOut(t / liftShare);
  const fade = GLOW_FADE_SHARE * (1 - liftShare);
  return 1 - easeOut(clamp01((t - liftShare) / fade));
}

/** The mirror of `glowOnOpen`: it peaks as the case starts dropping home. */
export function glowOnClose(t: number, dropShare: number): number {
  const dropAt = 1 - dropShare;
  if (t >= dropAt) return 1 - easeOut(clamp01((t - dropAt) / dropShare));
  const fade = GLOW_FADE_SHARE * dropAt;
  return easeOut(clamp01((t - (dropAt - fade)) / fade));
}

function glowColour(spineColor: string): { h: number; s: number; l: number } {
  const m = SPINE_COLOR_PATTERN.exec(spineColor);
  if (!m) return GLOW_FALLBACK;
  return { h: Number(m[1]), s: Number(m[2]), l: Math.max(Number(m[3]), GLOW_MIN_LIGHTNESS) };
}

export function glowFilter(spineColor: string, level: number): string {
  if (level <= 0) return 'none';
  const { h, s, l } = glowColour(spineColor);
  const shadow = (blur: number, alpha: number) =>
    `drop-shadow(0 0 ${blur}px hsl(${h} ${s}% ${l}% / ${Number((alpha * level).toFixed(ALPHA_DECIMALS))}))`;
  return `${shadow(TIGHT_BLUR_PX, TIGHT_ALPHA)} ${shadow(WIDE_BLUR_PX, WIDE_ALPHA)}`;
}
