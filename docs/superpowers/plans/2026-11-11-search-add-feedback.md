# Search and add feedback — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Picking a search result shows "adding" and then "added" in its own
row, the dropdown closes itself after success, and the search bar becomes the
larger centrepiece of the header.

**Architecture:** A small pure module, `src/lib/add-flow.ts`, decides what each
result row shows given the in-flight add and the shelved set; `SearchBar.astro`
keeps that state and lets `paint()` draw it, so repaints never lose it.
`Header.astro` switches from a flex row to a three-column grid to centre the
bar. Everything else is CSS and two strings.

**Tech Stack:** Astro SSR, plain JavaScript in component `<script>` blocks,
Vitest (node environment, `test/**/*.test.ts`). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-11-search-add-feedback-design.md`

## Global Constraints

- **No commits.** Implement only and leave every change unstaged; the owner
  commits after review.
- No new runtime library; the check is an inline SVG, never an emoji.
- Every user-facing string in `src/constants/index.ts`, Castilian Spanish:
  `SEARCH_PLACEHOLDER = 'Añade una película a tu estantería'`,
  `SEARCH_ADDED = 'Película añadida'`.
- Code, identifiers and comments in English; comments only for a non-obvious
  _why_ (`.claude/.rules/comments.md`).
- No magic values: timings and sizes used by script get named constants.
- No API, database or TMDB change. The spine still appears only on
  `FILM_ADDED_EVENT`, after the server confirms.

## Review Focus

1. **Esc / click outside during the add, then success** — nothing reopens,
   field ends empty, spine lands. Manual check in Task 2.
2. **Typing during the 1.2 s dwell** — timer cancelled, new search paints and
   is not closed by the old timer. Manual check in Task 2.
3. **`FILM_REMOVED_EVENT` repaint during the dwell, for the film just added**
   — the row keeps "Película añadida" until the dwell ends. Pinned by the
   `rowState` test "pending wins over shelved set" in Task 1.
4. **Failure or success after the user typed a new query during the add** —
   new results are not replaced by the notice, nor closed and emptied by the
   dwell. Pinned by the `addOwnsList` tests in Task 1.
5. **Widths between 641px and ~900px** — the bar shrinks and never overlaps
   the wordmark or the avatar cluster. Manual check in Task 3.

---

### Task 1: Row state helper

**Files:**
- Create: `src/lib/add-flow.ts`
- Test: `test/add-flow.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type AddPhase = 'adding' | 'added';
  export interface PendingAdd { filmId: number; phase: AddPhase; query: string }
  export type RowState = 'idle' | 'shelved' | 'adding' | 'added' | 'disabled';
  export function rowState(filmId: number, pending: PendingAdd | null, shelved: ReadonlySet<number>): RowState;
  export function addOwnsList(pending: PendingAdd, currentQuery: string): boolean;
  ```
  `query` is the trimmed query that produced the picked result.

- [ ] **Step 1: Write the failing tests** in `test/add-flow.test.ts`:

  - `rowState` — no pending, film not shelved → `'idle'`.
  - no pending, film shelved → `'shelved'`.
  - pending `{ filmId: 1, phase: 'adding' }`: film 1 → `'adding'`, film 2 → `'disabled'`.
  - pending phase `'added'`: film 1 → `'added'`, film 2 → `'disabled'`.
  - "pending wins over shelved set": pending `{ filmId: 1, phase: 'added' }`,
    shelved set **without** 1 (it was just removed) → `'added'`; and with 1 → `'added'`.
  - shelved film 2 while film 1 is pending → `'disabled'`.
  - `addOwnsList` — current query `''` → `true`; equal to `pending.query` →
    `true`; equal after trimming (`'  azul '` vs `'azul'`) → `true`; a different
    query → `false`.

- [ ] **Step 2: Run** `npx vitest run test/add-flow.test.ts` — expected: FAIL,
  module not found.

- [ ] **Step 3: Implement** both functions in `src/lib/add-flow.ts`. Precedence
  in `rowState`: the pending film's phase, then `'disabled'` for any other row
  while something is pending, then `'shelved'`, then `'idle'`. Types stay
  co-located in this file (used only by `SearchBar.astro`).

- [ ] **Step 4: Run** `npx vitest run test/add-flow.test.ts` — expected: PASS.

---

### Task 2: The add sequence in the dropdown

**Files:**
- Modify: `src/components/SearchBar.astro` (script: `pick`, `paint`, close
  paths, keydown, list click; styles: rows, badges, spinner, check)
- Modify: `src/constants/index.ts` (`SEARCH_PLACEHOLDER`, new `SEARCH_ADDED`)
- Modify: `src/styles/app.css` (`--success` token)

**Interfaces:**
- Consumes: `rowState`, `addOwnsList`, `PendingAdd` from Task 1.

- [ ] **Step 1: Strings and token.** Change `SEARCH_PLACEHOLDER` and add
  `SEARCH_ADDED` (values in Global Constraints). Add `--success` to all three
  theme blocks of `app.css`: light `#2f7d4f`; both dark blocks `#5cbf86`.

- [ ] **Step 2: State.** In the script add `let pending: PendingAdd | null = null`,
  `let dwellTimer: number | undefined`, and `const ADDED_DWELL_MS = 1200`.
  Change `THUMBNAIL_SIZE` to `'w154'`. Keep the existing `adding` set.

- [ ] **Step 3: `paint()` draws `rowState`.** For each result:
  - `'adding'` → badge = spinner element + `SEARCH_ADDING`;
  - `'added'` → badge = check icon (18px) + `SEARCH_ADDED`, class for green;
  - `'shelved'` → badge = check icon (16px) + `SEARCH_ON_SHELF`, green;
  - `'disabled'` → row gets a dimmed class and `aria-disabled="true"`.
  The check icon is one small function returning an SVG element: a filled
  circle in `var(--success)` and a white check path (the mockup used
  `viewBox="0 0 12 12"`, path `M2.5 6.3l2.3 2.3 4.7-5`, stroke 1.8, round caps).
  Build it with `document.createElementNS`.

- [ ] **Step 4: `pick()`.** Return early if `pending` is set (in addition to the
  current guards). Set `pending = { filmId, phase: 'adding', query: input.value.trim() }`
  and `paint()` before awaiting. Then, whatever the outcome, first check
  `addOwnsList(pending, input.value)`: if it is `false` the user has typed a
  new query, so set `pending = null`, write the outcome message to `status`,
  dispatch `FILM_ADDED_EVENT` on success as today, `paint()` if the list is
  open (to undim the new results) and stop — no dwell, no notice, field
  untouched. Otherwise:
  - **Success:** `pending.phase = 'added'`, `status.textContent = SEARCH_ADDED`,
    dispatch `FILM_ADDED_EVENT` as today; if the list is open, `paint()` and
    start `dwellTimer = setTimeout(finishAdd, ADDED_DWELL_MS)`; if it was
    dismissed, `finishAdd()` straight away (no reopen).
  - **Failure:** `pending = null`, message to `status`, `notice(message)` —
    which also reopens a dismissed list.

- [ ] **Step 5: `finishAdd()` — the one success close path.** Clears
  `dwellTimer`, sets `pending = null`, empties `input.value`, and then does
  what the `input` handler does for a short query: `latest += 1`,
  `results = []`, `close()`. Focus stays on the input.

- [ ] **Step 6: Wire the edges.**
  - `close()` called by Esc, pointer down outside, or focus leaving while
    `pending?.phase === 'added'` → call `finishAdd()` instead (field emptied).
    While `phase === 'adding'`, closing just hides the list; `pending` stays.
  - `input` event while `phase === 'added'` → clear `dwellTimer`, set
    `pending = null`, do **not** empty the field; the normal search proceeds.
  - Keydown: while `pending` is set, ArrowUp/ArrowDown/Enter do nothing
    (Escape still closes). `active` stays on the picked row.
  - List click on a row whose `rowState` is `'disabled'` does nothing (already
    true via the `pick` guard; keep it explicit for clarity only if needed).

- [ ] **Step 7: Styles.** Spinner: a CSS ring (~14px, 2px border, one side
  `var(--ink)`, rest `var(--hairline)`), spinning; no reduced-motion override
  (spec §5). Dimmed rows ~45% opacity, no hover background, `cursor: default`.
  Badge text green via `var(--success)`, replacing `--brass`.

- [ ] **Step 8: Verify.** `npm test`, `npm run lint`, `npm run typecheck`
  all pass. Then in `npm run dev`, light and dark theme, run the spec §8
  checklist, plus Review Focus 1 and 2. To force a failure, block
  `/api/shelves/*` in DevTools.

---

### Task 3: Header centring and the larger bar

**Files:**
- Modify: `src/components/Header.astro` (styles)
- Modify: `src/components/SearchBar.astro` (styles only)

- [ ] **Step 1: Header grid.** Above the mobile breakpoint, `header` becomes
  `display: grid; grid-template-columns: 1fr minmax(240px, 440px) 1fr`;
  wordmark `justify-self: start`, `.search-slot` fills the middle column (drop
  its `margin-left: auto`), `.cluster` `justify-self: end`. Below the breakpoint
  keep today's two-row wrap behaviour exactly. If at the shrunk width the bar
  is cramped, raise the breakpoint from 640px; the number is the builder's.

- [ ] **Step 2: Bar and dropdown sizes** (spec §6 table): input `width: 100%`
  of its slot, padding ≈`13px 22px`, font ≈16.5px. Dropdown ≈480px wide,
  `max-width: 92vw`, centred under the bar (`left: 50%` +
  `translateX(-50%)`, replacing `right: 0`); below the breakpoint it returns
  to full width with no centring transform. Rows ≈`10px 12px`, thumbnail
  ≈48×72, title ≈16.5px medium weight, year ≈14px, badge ≈13.5px, notice
  scaled to match.

- [ ] **Step 3: Verify.** `npm run lint` passes. In `npm run dev`: at 1440px
  the bar sits at the page centre; drag the window from 1000px down to 641px
  and check Review Focus 5; at 390px the bar is on its own full-width row and
  the dropdown spans it. Check `/u/<handle>` is unchanged.
