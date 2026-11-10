/**
 * What a spine needs both on the server (the first render) and in the browser
 * (a film added without a reload). No imports, so either side can use it.
 */

/** Space-separated `hsl()` with integer components — what `colors.ts` computes
 *  from the poster and the only form `films.spine_color` should ever hold. */
export const SPINE_COLOR_PATTERN = /^hsl\((\d{1,3}) (\d{1,3})% (\d{1,3})%\)$/;

// The same blank `colors.ts` writes when no colour could be extracted.
const BLANK_SPINE = 'hsl(0 0% 100%)';

// 20 spines share a 756px plank, which leaves 33.5px each on average. The
// spread is what stops a full row from reading as a comb.
const SPINE_WIDTHS = [31, 33, 34, 36];

/** Keyed on the film, not the slot, so a spine keeps its width when dragged. */
export function spineWidth(filmId: number): number {
  return SPINE_WIDTHS[Math.abs(Math.trunc(filmId)) % SPINE_WIDTHS.length];
}

/** The endpoint validates the colour, but RLS also lets a signed-in user insert
 *  a `films` row directly, and this value is written into a style attribute. */
export function safeSpineColor(raw: string | null | undefined): string {
  return typeof raw === 'string' && SPINE_COLOR_PATTERN.test(raw) ? raw : BLANK_SPINE;
}
