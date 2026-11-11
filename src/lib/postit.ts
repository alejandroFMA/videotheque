/**
 * A shelf's postit colour: any `#rrggbb` the owner picks. No imports, so the
 * endpoint, the server render and the editor's script all share one check.
 */

/** The only form `shelves.accent_color` is written in. The value is put into a
 *  style attribute on a page strangers can open, so nothing looser will do. */
export const POSTIT_COLOR_PATTERN = /^#[0-9a-f]{6}$/;

const INK_ON_DARK = '#ffffff';
const INK_ON_LIGHT = '#171412';

const HEX = 16;
const MAX_CHANNEL = 255;
// Rec. 709 luma weights.
const RED_WEIGHT = 0.2126;
const GREEN_WEIGHT = 0.7152;
const BLUE_WEIGHT = 0.0722;
// Above this the card is pale enough that white lettering washes out.
const LIGHT_CARD_LUMA = 0.6;

const RED_AT = 1;
const GREEN_AT = 3;
const BLUE_AT = 5;
const CHANNEL_DIGITS = 2;

/** Lower-cased when valid, null otherwise. */
export function parsePostitColor(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const colour = raw.toLowerCase();
  return POSTIT_COLOR_PATTERN.test(colour) ? colour : null;
}

/** The owner can pick any colour, so the lettering has to follow it. */
export function postitInk(colour: string): string {
  const channel = (at: number) =>
    parseInt(colour.slice(at, at + CHANNEL_DIGITS), HEX) / MAX_CHANNEL;
  const luma =
    RED_WEIGHT * channel(RED_AT) +
    GREEN_WEIGHT * channel(GREEN_AT) +
    BLUE_WEIGHT * channel(BLUE_AT);
  return luma > LIGHT_CARD_LUMA ? INK_ON_LIGHT : INK_ON_DARK;
}
