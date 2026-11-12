# Videothèque — search and add feedback

**Date:** 2026-11-11
**Status:** approved, ready for an implementation plan.
**Roadmap:** step 1, "Search and add feedback" (`docs/roadmap.md`).
**Touches:** `src/components/SearchBar.astro`, `src/components/Header.astro`,
`src/constants/index.ts`, `src/styles/app.css`. No API, database or TMDB change.

---

## 1. Why

Adding a film takes about a second: the browser extracts the spine colour from
the poster, then `POST /api/shelves/[id]/films` fetches the film from TMDB and
writes it. During that second the screen does not change. `SEARCH_ADDING`
("Añadiendo…") is written only to the screen-reader live region
(`#search-status`); sighted users see nothing until the dropdown repaints with
the "Ya en la estantería" badge, and the dropdown then stays open. The wait
feels longer than it is and the user is not sure the click registered.

The owner's usual flow is **one film per search, then close**. The design is
built around that flow; adding several films from one search is not a goal.

## 2. Goals

- Adding a film shows, in place, that it is being added, then that it was added.
- After a successful add the dropdown closes on its own.
- The search bar is the centre of the header and is larger and easier to read.
- "Ya en la estantería" reads as a confirmation, not as a muted note.

## 3. Non-goals and anti-goals

- **Not** making the add itself faster. The request chain is unchanged.
- **Not** optimistic UI: the spine still appears on the shelf only once the
  server confirms (`FILM_ADDED_EVENT`, as today).
- **No emoji** for the check, and no icon library — an inline SVG.
- **No** change to the mobile placement of the bar (it already takes its own
  full-width row below 640px).
- **No** new runtime library.

## 4. The add sequence

Decided by the owner from mockups (option "A": feedback lives in the row that
was picked).

1. **Pick.** The user clicks a result or presses Enter on the active one.
2. **Adding.** That row shows, right-aligned where the badge goes today, a
   small spinner followed by `SEARCH_ADDING` ("Añadiendo…"). Every other row
   is dimmed (about 45% opacity) and does not respond to clicks, hover or
   Enter while the add is in flight. The live region still announces
   "Añadiendo…".
3. **Added.** The spinner is replaced by the check icon (§5) and the text
   "Película añadida" (new constant, e.g. `SEARCH_ADDED`), in the success
   green. The live region announces "Película añadida".
4. **Close.** After a short dwell the dropdown closes and the search field is
   emptied. The user can close it earlier themselves, exactly as today (Esc,
   pointer down outside, focus leaving the search).

Calls made for the owner, check them:

- **Dwell time:** about 1.2 s, as a named constant in `SearchBar.astro`
  (e.g. `ADDED_DWELL_MS`). Long enough to read two words, short enough not to
  be in the way.
- **Field emptied on auto-close**, focus stays in the field, so the next
  search starts from nothing. If the user types during the dwell, the dwell is
  cancelled and the new search proceeds normally.
- **Failure is unchanged:** on `all_full` or any other failure the dropdown
  shows the existing notice (`SHELF_FULL_MESSAGE` / `ADD_FAILED`) and does not
  close on its own. Dimming is lifted.
- **Closing during the add:** if the user dismisses the dropdown while the add
  is in flight, the add keeps going and the spine still lands on the shelf. On
  success nothing reopens (the field is still emptied). On failure the
  dropdown reopens with the failure notice, because a silent failure is the
  thing this step exists to remove.

Edge cases, all *my call*:

- **Every successful add ends with the field emptied**, whether the dropdown
  auto-closes, the user dismisses it during the dwell (Esc, click outside,
  focus leaving), or it was dismissed during the add. Dismissing during the
  dwell closes immediately and cancels the timer. This differs on purpose
  from a plain Esc, which keeps the text: after a successful add the query
  has done its job.
- **Emptying the field programmatically fires no `input` event**, so the
  close path must do what the `input` handler does for a short query:
  `latest += 1` (an in-flight search must not reopen the list),
  `results = []`, `active = -1`, `close()`.
- **Keyboard during the add:** arrow keys and Enter are ignored; `active`
  and `aria-activedescendant` stay on the picked row. The other rows get
  `aria-disabled="true"` while dimmed.
- **Repaint during the dwell** (e.g. `FILM_REMOVED_EVENT`) keeps showing
  "Película añadida" on the picked row until the dwell ends; the phase lives
  in state, not in the DOM.
- **Failure after the user has already typed a new query:** the newer search
  owns the list, so the failure notice does not replace its results; the
  failure message is still written to the live region. If the field is empty
  or still holds the original query, the notice is shown as above.
- `--success` is scoped to the search dropdown for this step.

Implementation constraints the builder must keep:

- `paint()` rebuilds the whole list (on arrow keys, on `FILM_REMOVED_EVENT`).
  The adding/added state must be part of what `paint()` draws — e.g. the
  pending film id and a phase — not DOM decoration that a repaint wipes out.
- The existing `adding` set (double-click guard) stays; while any add is in
  flight, picks of other rows are ignored too, matching the dimming.
- A query typed while the dwell runs must not be overwritten by the
  auto-close (see the `latest` ticket pattern already in the file).

## 5. The check icon and the badges

Owner's decision: **a filled green circle with a white check mark**, inline
SVG, drawn with `currentColor`-independent fills so it reads in both themes.

- Used by "Película añadida" (step 3 above) at about 18px.
- Also used by "Ya en la estantería", slightly smaller (about 16px), with the
  badge text in the same green instead of today's `--brass`. *My call:* "you
  have this film" looks the same whether it was just added or was already
  there.
- New design token `--success` in `src/styles/app.css`, defined for light and
  for both dark blocks (the `prefers-color-scheme` block and
  `[data-theme='dark']`). Starting values: light `#2f7d4f` (≈5:1 on
  `--field` white), dark a lighter green around `#5cbf86` on `#131313`. The
  builder may tune them; text on `--field` must stay at WCAG AA for small
  text.
- The spinner is a CSS ring (border with one coloured side), no image. It
  keeps spinning under `prefers-reduced-motion` — it is a status indicator,
  and without motion it would read as a stuck icon. *My call.*

## 6. The search bar: placement and size

Owner's decisions:

- **Centred in the header**, same row as the wordmark (left) and the theme
  toggle + avatar (right). The bar sits at the true centre of the page even
  though the two sides have different widths (e.g. a `1fr auto 1fr` grid
  instead of today's flex row with an auto margin).
- **Larger:** the size shown in the mockup, plus 10%:

  | | today | new |
  |---|---|---|
  | bar width | 280px | ≈440px |
  | bar padding | 9px 16px | ≈13px 22px |
  | bar text | 13px | ≈16.5px |
  | dropdown width | 340px | ≈480px |
  | result row padding | 7px 9px | ≈10px 12px |
  | thumbnail | 34×51 | ≈48×72 |
  | title | 13px | ≈16.5px, medium weight |
  | year | 11.5px | ≈14px |
  | badge text | 11px | ≈13.5px |

  The figures are targets, not pixel law; keep the proportions. The dropdown
  hangs under the bar, centred on it (today it is right-aligned to it);
  below the mobile breakpoint it stays full width, not centred. The
  thumbnail is requested today as `w92` (`THUMBNAIL_SIZE`); at 48 CSS px a
  2× screen wants 96 image px, so `w92` is marginally soft. *My call:* move
  to `w154`, one constant.
- **Placeholder** becomes "Añade una película a tu estantería"
  (`SEARCH_PLACEHOLDER` in `src/constants/index.ts`).
- **Mobile (≤640px):** placement unchanged — the bar keeps its own
  full-width row. It takes the new text and thumbnail sizes.
- **In-between widths** (*my call*): when 440px no longer fits between the
  wordmark and the cluster, the bar shrinks (with a sensible minimum) before
  the layout drops to the mobile two-row form. Today's 640px breakpoint may
  move up if the shrunk bar gets too narrow; the builder picks the number.

The public profile header (`PublicHeader.astro`) has no search and is not
touched.

## 7. Strings

All in `src/constants/index.ts`:

- `SEARCH_PLACEHOLDER` → "Añade una película a tu estantería" (changed).
- `SEARCH_ADDED` → "Película añadida" (new).
- `SEARCH_ADDING`, `SEARCH_ON_SHELF`, `ADD_FAILED`, `SHELF_FULL_MESSAGE`
  unchanged.

## 8. Verification

There are no DOM tests in the repo (`test/` covers `src/lib/`), and this step
is almost entirely markup, CSS and event wiring in one component. Verification
is by hand in the running app, light and dark theme, desktop and a phone-width
viewport:

- pick by click and by Enter: spinner → green check → auto-close, field empty;
- double click / Enter-then-click still adds once;
- clicks on dimmed rows during the add do nothing;
- shelf full and a forced network failure: notice shown, no auto-close;
- Esc during the add: spine still lands, nothing reopens; failure reopens;
- typing during the dwell: the new search wins;
- "Ya en la estantería" shows the green icon; removing a film from the shelf
  while the dropdown is open still clears the badge.

If the builder extracts the row state into a pure helper under `src/lib/`, it
gets a unit test there; otherwise no new automated tests. *My call:* not
required.

## 9. Left to the builder

- Exact markup of the spinner and SVG, and where the icon markup lives
  (inline in the script or a small helper).
- Exact pixel values within §6, the green values within §5, the in-between
  breakpoint.
- How the adding/added phase is stored for `paint()`.
