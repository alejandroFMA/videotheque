# Videothèque — shelf visual direction, addendum

**Date:** 2026-09-06
**Status:** closes the axes the parent spec left open. Ready to implement.
**Amends:** `2026-08-29-shelf-visual-direction-design.md`. Everything not
contradicted here still holds.

> Written in English per the `CLAUDE.md` rule ("specs stay in English"), which
> post-dates the Spanish parent spec. The parent is not translated here.

The parent spec deferred several decisions to the artboards
(`https://claude.ai/code/artifact/6748e98b-55b7-4107-aa40-4bf5353cdc79`) and
never addressed small screens at all. This document records what the artboards
already settled, the two direction changes the owner made on 2026-09-06, and
the responsive rules that follow from them.

---

## 1. Chrome is always dark — the wall is themed

**Changed by the owner.** The parent spec themed the whole page, so the
masthead flipped from bone-on-charcoal to charcoal-on-bone. The wordmark lost
half its weight in light mode.

From now on the page splits into two colour scopes:

| Scope | Contents | Behaviour |
|---|---|---|
| **Chrome** | Header bar, search field, search results dropdown, avatar menu, TMDB attribution band | **Always dark.** Never follows the theme. |
| **Wall** | Wall, planks, spines, postits, the pulled-out case and its record | Follows the theme. |

Consequences, all of which follow from the split rather than being separate
decisions:

- The **search field keeps its dark treatment in both themes** (`#131211`
  ground, bone text). A themed field inside a permanent black bar would clash.
- The **results dropdown and the avatar menu stay dark**, because both hang off
  the bar. A bone panel emerging from a black band reads as detached.
- The **attribution sits in a matching dark band at the bottom.** Dark bands top
  and bottom frame the wall like a bookcase unit, which is what stops the light
  theme from reading as an unfinished dark theme.
- **Brass stays on its dark value** (`#b8905a`) inside the chrome, in both
  themes. The light value (`#c98b52`) is only for brass that sits on the wall.

## 2. Typography

**Changed by the owner.** The parent spec listed Anton / Archivo Black / Oswald
as candidates and never picked. The brief was "something like Humane or Melody"
— very tall, ultra-condensed.

- **Melody is rejected on licensing.** Three unrelated faces carry the name; the
  ultra-compact one (BrandSemut) is demo / personal use only, which a deployed
  public site cannot use. ParaType's Melody is a calligraphic script and Hi
  Melody is a Korean handwriting face; neither is the register.
- **Humane** (Rajesh Rajput, v2.0) *is* free for commercial use and stays a
  viable fallback, but Google Fonts carries a close enough analogue with a
  variable weight axis, which avoids shipping four static files.

| Role | Face | Notes |
|---|---|---|
| Wordmark | **Big Shoulders**, weight 800 | The one big gesture. Tall, narrow, squared terminals — reads as shop signage rather than magazine. |
| UI / body | **Archivo** 400–700 | All chrome, menus, search results, metadata, the film record. |
| Spine title | **Archivo Narrow** 700 | Sturdy enough to hold at 12.5px vertical under the specular sheen. |
| Postit | **Permanent Marker** | Hand lettering. The only place it appears. |

Two decisions worth keeping visible:

- **Humane is reserved out of the system entirely, and Big Shoulders is spent
  only on the wordmark.** A second condensed display face on the spines would
  muddy both. The spines belong to the Archivo family, which is why they read as
  UI-grade text rather than as a competing display voice.
- **Every face is self-hosted from `public/fonts/`, including the Google ones.**
  Choosing a Google font does not oblige us to use Google's CDN. Self-hosting
  removes a third-party request and sidesteps the EU case law on serving Google
  Fonts from the CDN. Licence files ship next to the fonts.

## 3. Tokens recovered from the artboards

The parent spec gave `~#1a1a1a` and prose. These are the actual values.

### Colour

| Token | Dark | Light |
|---|---|---|
| Wall | `#1a1a1a` | `#f1ead9` |
| Ink | `#efe9dd` | `#241f1b` |
| Muted | `#8f8880` | `#6f665a` |
| Hairline | `rgba(255,255,255,.10)` | `rgba(0,0,0,.13)` |
| Wood highlight | `#8a5c37` | `#a9764a` |
| Wood top | `#6b4526` | `#8a5a34` |
| Wood shade | `#45291790` | `#6a422290` |
| Wood lip | `#34200f` | `#543310` |
| Brass | `#b8905a` (hover `#a07640`) | `#c98b52` |

Chrome-only, fixed in both themes: search ground `#131211`, avatar ground
`#3a3430`, and the wall's dark values for ink, muted and hairline.

Postit colours come from `shelves.accent_color`. The artboards used `#9e2f26`
and `#2f6f74`; they are examples, not a palette.

### Geometry

| Element | Value |
|---|---|
| Plank (`.unit`) | 756px wide at 20 slots |
| Spine | 172px tall, 3px gap, 14px padding at each end of the run |
| Spine title | 12.5px, `letter-spacing: .045em`, uppercase, vertical-rl, clipped at 146px |
| Board | 22px, pulled up 7px under the spines, 9px front lip |
| Postit | `left: -12px; top: -18px`, `rotate(-2.6deg)`, 17px, 11px pin |
| Between planks | 40px |
| Wordmark | `letter-spacing: .16em`, uppercase |

The 756px plank across 20 slots leaves roughly **33.5px of average spine
width** — that is the budget the parent spec's "slight per-film variation" has
to fit inside.

## 4. The postit does not consume a slot

Worth stating because the parent spec's wording ("a card at the start of the
plank") reads as though it might. It does not: the postit is absolutely
positioned off the plank's top-left corner with a drawn pin. Twenty slots stay
twenty slots.

## 5. Search placement

Resolved by the artboards, which the parent spec deferred: the field sits
**inside the header bar**, between the wordmark and the avatar, `flex: 1` with
`max-width: 500px`. Placeholder: *"Busca una película para archivarla"*.

## 6. Small screens

**New — the parent spec did not mention mobile.** A 756px plank cannot appear on
a 390px viewport, so the plank stops being a fixed width and becomes a function
of its slot count.

**A shelf is always 20 films. A plank is however many fit.** A full shelf draws
as several stacked planks on a narrow screen.

| Viewport | Slots per plank | Planks for a full shelf |
|---|---|---|
| Desktop | 20 | 1 |
| Tablet | 10 | 2 |
| Mobile | **5** | 4 |

Twenty divides evenly at every step, so a full shelf never ends on a ragged
plank. A partly filled shelf still can, which is correct — gaps from deletion
are not compacted either.

**Spine width steps up as the count drops**, and the plank is sized from it
rather than stretched to the viewport:

```
plank width = slots × (spine width + 3px gap) − 3px + 28px padding
```

Mobile uses a 44px spine, which both clears the touch-target minimum and keeps
the VHS proportion near 1:5. That yields a plank of roughly 260px, **centred,
with wall visible on both sides.** This is deliberate and follows the parent
spec's own rule that a plank is exactly as wide as its slots: on a phone the
bookcase is a narrow unit against a wall, not a broken shelf.

Letting five spines fill the full width instead would give each one about 69px
against a 172px height — 1:2.5, which reads as a case front, not a spine. That
is the failure this rule exists to prevent.

On mobile the postit labels a stack of planks rather than a single plank. It
keeps its anchor on the first one.

## 7. Still open

Not decided here, and not blocking the shelf:

- **Where `avatar_url` gets its image.** The parent spec puts the column on a
  `profiles` table but never says whether the user uploads to Supabase Storage,
  points at an external URL, or gets generated initials. The artboards draw
  initials on `#3a3430`, which works as the zero-state whatever we choose.
- **Whether `/e/[slug]` survives.** `src/pages/index.astro` already links to it
  and the route does not exist, so today those links 404. The parent spec defers
  this to the data spec in favour of `/u/[handle]`.
- **Motion.** Durations and easings for the hover peek and the case travel, the
  page-load sequence, and the `prefers-reduced-motion` fallback.
- **Empty-state and error copy**, in Spanish, in `src/constants/`.
