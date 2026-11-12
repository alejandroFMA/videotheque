# Move Films Between Shelves Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the owner drag a spine onto another shelf, reorder shelves by dragging their postit, and delete a shelf (films included) after a confirmation — on desktop and touch.

**Architecture:** Three new server operations (move a film, reorder shelves, delete a shelf), each a thin handler in `src/lib/shelf-actions.ts` over a data function in `src/lib/shelves.ts`, with positions assigned by SQL functions. The browser keeps optimistic DOM moves in `Bookcase.astro` and rolls them back on failure, as in-shelf reorder already does. Delete reloads the page on success, like create-shelf and label-save.

**Tech Stack:** Astro (SSR, Vercel), Supabase Postgres + RLS, plain TypeScript in `<script>` blocks, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-12-move-films-between-shelves-design.md`

## Global Constraints

- **No commits.** Leave every change unstaged; the owner commits after review. No `git commit`, no worktrees.
- Every user-facing string in `src/constants/index.ts`; the UI calls a shelf "balda".
- No magic values: named constants for durations, distances, statuses (`.claude/.rules/constants-and-types.md`).
- `src/types/` and `src/constants/` stay declarations-only.
- The server assigns positions. The client sends film/shelf id lists in the desired order, never position numbers.
- Every new endpoint checks ownership of every shelf it touches via `requireOwnShelf` (404 for absent-or-not-yours); RLS is the backstop.
- `SHELF_CAPACITY` (20) is enforced server-side with `409` on a move, as on add.
- No new runtime dependency.
- Public profile `/u/<handle>` stays read-only: nothing new renders or listens when `editable` is false.
- Danger red: `--danger` token, `#b03a2e` light, `#e0675b` dark.
- Comments explain *why* only (`.claude/.rules/comments.md`).

## Review Focus

1. **Touch: long press then vertical drag must not scroll the page or fire `pointercancel`.** Expected: once lifted, the spine follows the finger to the shelf below. Owned by Task 6 (manual check on a real phone, Step 6.8).
2. **A drag ending on the postit must not open the label editor** (LabelEditor listens on `document` click). Expected: drop only moves the shelf. Owned by Task 7 (Step 7.4 manual check).
3. **Moving onto a full shelf**, including by keyboard. Expected: nothing moves, server never asked; if the server says `409` anyway (other tab), roll back with toast. Owned by Task 3 test `409 when the target shelf is full` and Task 4 test `canDropOn`.
4. **Moving a film to the shelf it is already on via the move endpoint** (`from === to`). Expected: `400`, no write. Owned by Task 3 test.
5. **Deleting the last shelf through the API directly** (button hidden, but a stale tab or curl can call it). Expected: `409 { error: 'last_shelf' }`, nothing deleted. Owned by Task 3 test.

---

### Task 1: Migration — shelf order, `reorder_shelves`, `move_film`

**Files:**
- Create: `supabase/migrations/20261112120000_shelf_order_and_moves.sql`
- Modify: `supabase/tests/schema_checks.sql` (append new blocks before the final `reset role; rollback;`)

**Interfaces:**
- Produces (SQL, all `security invoker`, `set search_path = ''`):
  - `public.shelves.position integer not null`, index `shelves_owner_position_idx (owner, position)`.
  - Trigger `shelves_assign_position` (`before insert`) → `position := coalesce(max(position), 0) + 1` over the same `owner`, when `new.position` is null. Covers `handle_new_user` and `createShelf`.
  - `public.reorder_shelves(p_order uuid[]) returns void` — `position := ordinality` for rows whose `id` is in `p_order` and `owner = auth.uid()`.
  - `public.move_film(p_film integer, p_from uuid, p_to uuid, p_order integer[]) returns void` — `update shelf_items set shelf_id = p_to where shelf_id = p_from and film_id = p_film`; if no row updated, `raise exception 'film % not on shelf %'`; then `perform public.reorder_shelf(p_to, p_order)`. One function call = one transaction.

- [ ] **Step 1: Write the failing SQL checks** in `schema_checks.sql`, as user A, following the file's `do $$ … assert … $$` style:
  - backfill: user A's existing shelves have positions `1..n` in `created_at` order;
  - a newly inserted shelf for user A gets `max + 1`;
  - `reorder_shelves(array[a2, a1])` → `a2.position = 1`, `a1.position = 2`;
  - as user B, `reorder_shelves(array[a1, a2])` changes nothing;
  - `move_film(603, a1, a2, array[<a2's films…>, 603])` → film 603 now has `shelf_id = a2`, not on `a1`, and its position equals its index in `p_order`;
  - `move_film` with a film not on `p_from` raises (catch `others`, assert raised);
  - as user B, `move_film` onto user A's shelf raises `insufficient_privilege` or updates nothing (assert film still on its shelf).

- [ ] **Step 2: Run to verify it fails**
  Run: `supabase db reset && psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/schema_checks.sql`
  Expected: error — column `position` / function `reorder_shelves` does not exist.

- [ ] **Step 3: Write the migration.** Header comment explaining why (shelf order is now owner-chosen; moves must be atomic so a film is never on two shelves or none). Add the column nullable, backfill with `row_number() over (partition by owner order by created_at)`, then `set not null`. `grant execute` is default; mirror the existing functions (no revoke needed — invoker + RLS).

- [ ] **Step 4: Run to verify it passes**
  Run: same command as Step 2, then `supabase db advisors`.
  Expected: `schema_checks.sql: all assertions passed`; no new advisor warnings.

---

### Task 2: Data layer in `src/lib/shelves.ts`

**Files:**
- Modify: `src/lib/shelves.ts`
- Test: `test/shelves.test.ts`

**Interfaces:**
- Consumes: Task 1 SQL.
- Produces:
  - `listShelvesWithFilms` now orders by `'position'` ascending.
  - `moveFilm(sb: Db, filmId: number, fromShelfId: string, toShelfId: string, order: number[]): Promise<void>` → `rpc('move_film', { p_film, p_from, p_to, p_order })`.
  - `reorderShelves(sb: Db, order: string[]): Promise<void>` → `rpc('reorder_shelves', { p_order })`.
  - `deleteShelf(sb: Db, shelfId: string): Promise<void>` → `from('shelves').delete().eq('id', shelfId)` (`shelf_items` cascade).
  - `countOwnShelves(sb: Db, owner: string): Promise<number>` → head count on `shelves` with `.eq('owner', owner)`.
  - All throw via `fail(...)` on error, like their neighbours.

- [ ] **Step 1: Write the failing tests**
  - `listShelvesWithFilms` › rename `'orders oldest first…'` to `'orders by the owner's chosen position…'`, asserting `['order', 'position', { ascending: true }]`.
  - `moveFilm` › `calls move_film with the film, both shelves and the target order` — `expect(sb.rpc).toHaveBeenCalledWith('move_film', { p_film: 603, p_from: 'a', p_to: 'b', p_order: [1, 603] })`; and `throws when Supabase reports an error`.
  - `reorderShelves` › `calls reorder_shelves with the ids in order`.
  - `deleteShelf` › `deletes the shelf row by id` — ops include `['delete']` and `['eq', 'id', SHELF]`.
  - `countOwnShelves` › `counts only the owner's shelves` — ops include `['eq', 'owner', OWNER]`, returns `count`.

- [ ] **Step 2: Run** `npx vitest run test/shelves.test.ts` — Expected: FAIL (not exported / wrong order column).

- [ ] **Step 3: Implement** the four functions and the order change.

- [ ] **Step 4: Run** `npx vitest run test/shelves.test.ts` — Expected: PASS.

---

### Task 3: Handlers and routes

**Files:**
- Modify: `src/lib/shelf-actions.ts`
- Create: `src/pages/api/shelves/[id]/moves.ts` (`POST`), `src/pages/api/shelves/order.ts` (`PUT`)
- Modify: `src/pages/api/shelves/[id]/index.ts` (add `DELETE`)
- Test: `test/shelf-actions.test.ts`

**Interfaces:**
- Consumes: Task 2 functions; existing `requireOwnShelf`, `parseFilmId`, `readJson`, `parseOrder`, `http.ts` helpers.
- Produces:
  - `handleMoveFilm(ctx: { supabase; owner; shelfId /* target */; body }): Promise<Response>`. Body `{ filmId: number, fromShelfId: string, order: number[] }`.
    - 401/400/404 via `requireOwnShelf` for **both** target and `fromShelfId`.
    - 400 `invalid move` when body malformed, `order` invalid (reuse `parseOrder`), `order` does not include `filmId`, or `fromShelfId === shelfId`.
    - 404 when `shelfHasFilm(from, filmId)` is false.
    - 409 `{ error: 'shelf_full', message: SHELF_FULL_MESSAGE }` when `shelfItemCount(target) >= SHELF_CAPACITY`.
    - 204 on success; 500 on any thrown error.
  - `handleDeleteShelf(ctx: { supabase; owner; shelfId }): Promise<Response>` — guard; 409 `{ error: 'last_shelf' }` when `countOwnShelves(owner) <= 1`; 204; 500.
  - `handleReorderShelves(ctx: { supabase; owner; body }): Promise<Response>` — 401 without owner; 400 `invalid order` unless `body.order` is a non-empty array of unique UUIDs (`UUID_PATTERN`); 204; 500.
  - Routes: `POST /api/shelves/[id]/moves`, `DELETE /api/shelves/[id]`, `PUT /api/shelves/order` — each a one-liner like the existing routes, `prerender = false`.

- [ ] **Step 1: Write the failing tests** (new `describe` blocks, same fixtures style; add a second UUID `OTHER_SHELF`):
  - `handleMoveFilm — guard`: `401 without a session`; `404 when the target is not the caller's`; `404 when the source is not the caller's` (queue `shelves` results `[own, null]`).
  - `handleMoveFilm — validation`: `400 when order omits the film`; `400 when source and target are the same shelf`; `400 for a non-UUID fromShelfId`.
  - `handleMoveFilm — rules`: `404 when the film is not on the source shelf`; `409 when the target shelf is full` (`shelf_items` count = `SHELF_CAPACITY`) and `expect(sb.rpc).not.toHaveBeenCalled()`.
  - `handleMoveFilm — happy path`: `204 and one move_film call with the parsed values`.
  - `handleDeleteShelf`: `401`; `404 for a stranger's shelf`; `409 last_shelf when it is the only one` (count 1) with no `delete` op recorded; `204 and deletes by id` (count 2).
  - `handleReorderShelves`: `401`; `400 for duplicates`; `400 for a non-UUID`; `400 for an empty list`; `204 and one reorder_shelves call`.

- [ ] **Step 2: Run** `npx vitest run test/shelf-actions.test.ts` — Expected: FAIL (not exported).

- [ ] **Step 3: Implement** the three handlers and three routes.

- [ ] **Step 4: Run** `npx vitest run test/shelf-actions.test.ts` — Expected: PASS.

---

### Task 4: Browser API, constants, types, pure helpers

**Files:**
- Modify: `src/lib/shelf-api.ts`, `src/constants/index.ts`, `src/types/index.ts`
- Create: `src/lib/shelf-rules.ts`
- Test: `test/shelf-api.test.ts`, `test/shelf-rules.test.ts`

**Interfaces:**
- Produces in `shelf-api.ts` (all resolve to boolean, never reject — existing `succeeded`):
  - `moveFilmToShelf(toShelfId: string, move: { filmId: number; fromShelfId: string; order: number[] }, doFetch?)` → `POST /api/shelves/${toShelfId}/moves`, JSON body = `move`.
  - `deleteShelf(shelfId: string, doFetch?)` → `DELETE /api/shelves/${shelfId}`.
  - `saveShelvesOrder(order: string[], doFetch?)` → `PUT /api/shelves/order`, body `{ order }`.
- Produces in `shelf-rules.ts`:
  - `canDropOn(targetFilmCount: number, isOriginShelf: boolean): boolean` — origin always true; otherwise `targetFilmCount < SHELF_CAPACITY`.
  - `deleteShelfTitle(label: string | null, filmCount: number): string` — uses the constants below.
- Constants (exact copy):
  - `SHELF_DELETE = 'Borrar balda'` (the "−" button's accessible name and the dialog's red button)
  - `SHELF_DELETE_BODY = 'La balda y todo lo que tiene desaparecen de tu colección.'`
  - `SHELF_DELETE_NOTE = 'Podrás volver a añadir esas películas desde el buscador.'`
  - `SHELF_DELETE_FAILED = 'No se pudo borrar la balda. Inténtalo otra vez.'`
  - Title parts, with `PROFILE_NAME_TOKEN`-style tokens: `SHELF_DELETE_NAMED = '¿Borrar «{name}»{films}?'`, `SHELF_DELETE_UNNAMED = '¿Borrar esta balda{films}?'`, `SHELF_DELETE_FILMS_ONE = ' y su película'`, `SHELF_DELETE_FILMS_MANY = ' y sus {count} películas'`, `SHELF_COUNT_TOKEN = '{count}'`, `SHELF_FILMS_TOKEN = '{films}'`.
  - `MOVE_FAILED = 'No se pudo mover la película. Inténtalo otra vez.'`
  - `MOVE_TARGET_FULL = 'Esa balda está llena.'`
  - `SHELVES_REORDER_FAILED = 'No se pudo guardar el orden de las baldas. Inténtalo otra vez.'`
  - `FILM_MOVED_EVENT = 'shelf:film-moved'`, `SHELVES_REORDERED_EVENT = 'shelf:shelves-reordered'`
- Types: `FilmMovedDetail { filmId: number; fromShelfId: string; toShelfId: string }`, `ShelvesReorderedDetail { order: string[] }`.

- [ ] **Step 1: Write the failing tests**
  - `shelf-api`: `moves a film with a POST on the target's moves path` (url, method, parsed body); `deletes a shelf with a DELETE on its path`; `saves the shelves order with a PUT`.
  - `shelf-rules`: `canDropOn(20, false) === false`, `canDropOn(19, false) === true`, `canDropOn(20, true) === true`; `deleteShelfTitle('Terror', 12) === '¿Borrar «Terror» y sus 12 películas?'`, `deleteShelfTitle(null, 2) === '¿Borrar esta balda y sus 2 películas?'`, `deleteShelfTitle('Terror', 1) === '¿Borrar «Terror» y su película?'`, `deleteShelfTitle(null, 0) === '¿Borrar esta balda?'`.

- [ ] **Step 2: Run** `npx vitest run test/shelf-api.test.ts test/shelf-rules.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement** the API functions, constants, types and `shelf-rules.ts`.

- [ ] **Step 4: Run** the same command — Expected: PASS.

---

### Task 5: Delete button and confirmation dialog

**Files:**
- Modify: `src/styles/app.css` (`--danger` in all three theme blocks: `#b03a2e` / `#e0675b` / `#e0675b`)
- Modify: `src/components/Shelf.astro` (new prop `deletable: boolean`; render the button when true)
- Modify: `src/components/Bookcase.astro` (pass `deletable={editable && shelves.length > 1}`; render `<DeleteShelfDialog />` when editable)
- Create: `src/components/DeleteShelfDialog.astro`

**Interfaces:**
- Consumes: `deleteShelf` (Task 4), `deleteShelfTitle`, the `SHELF_DELETE_*` constants.
- Produces: `<button type="button" class="shelf-delete" data-delete-shelf aria-label={SHELF_DELETE}>−</button>` inside `<article class="shelf">`.

- [ ] **Step 1: Button.** 20 px circle, `border: 1.5px solid var(--danger)`, transparent fill, `color: var(--danger)`, "−" centred. Absolutely placed to the right of the plank (`right: -34px`) and vertically centred on the last row's board: hoist `--board` from `.plank` to `.shelf` so the button can use `bottom: calc(var(--board) / 2 - 10px)`. Hidden (`opacity: 0`) until `.shelf:hover` or `:focus-visible`; always visible under `@media (hover: none)`, mirroring `.label-add`. On ≤ 819 px make sure it stays inside the viewport (move to `right: 0` inside the plank's padding if it would overflow — check at 375 px).

- [ ] **Step 2: Dialog component**, styled like `LabelEditor.astro` (same `dialog` look, `--field`, `--hairline`). Markup: `<h2 id="delete-shelf-title">`, body `<p>{SHELF_DELETE_BODY}</p>`, `<small>{SHELF_DELETE_NOTE}</small>`, error `<p role="alert">`, actions: quiet "Cancelar" (`LABEL_CANCEL`) and a pill button with `background: var(--danger)`, white text, label `SHELF_DELETE`.
  Script: a `document` click listener on `[data-delete-shelf]` → read the shelf's `data-label-name` and its live `.slot` count, set title with `deleteShelfTitle`, `showModal()`, focus "Cancelar". Confirm → disable buttons → `deleteShelf(id)` → `location.reload()` on true; else re-enable and show `SHELF_DELETE_FAILED`.

- [ ] **Step 3: Verify in the browser** (`npm run dev`, signed in, two shelves): hover shows the "−" aligned with the board in light and dark; with one shelf it is absent; confirm deletes and reloads; Cancel closes; titles match the four `deleteShelfTitle` cases; on the public profile no button renders.

---

### Task 6: Spine drag across shelves (desktop + long press)

**Files:**
- Modify: `src/components/Bookcase.astro` (script + styles), `src/components/Spine.astro` (styles), `src/components/SearchBar.astro` (listen to `FILM_MOVED_EVENT`)

**Interfaces:**
- Consumes: `moveFilmToShelf`, `saveShelfOrder`, `canDropOn`, `MOVE_FAILED`, `MOVE_TARGET_FULL`, `FILM_MOVED_EVENT`, `FilmMovedDetail`.
- Produces: `.drag-ghost` (fixed-position clone), `.slot.placeholder` (the original slot drawn as the dashed gap), `.shelf.refusing` (full-shelf state). Constants local to the script: `LONG_PRESS_MS = 350`, `LONG_PRESS_SLOP_PX = 10`, `HAPTIC_MS = 12`.

- [ ] **Step 1: Cursors.** In the editable bookcase only: spines `cursor: grab`, `grabbing` while dragging (scope via `.bookcase[data-editable] :global(.spine)`); public view keeps `pointer`. Add `-webkit-touch-callout: none` to `.slot` and `preventDefault` on `contextmenu` from a slot in the editable bookcase.

- [ ] **Step 2: Lift.** Generalise `Drag` with `originPlank`, `originOrder`, `lifted: boolean`, `ghost: HTMLElement | null`. Mouse/pen: lift once travel ≥ `DRAG_THRESHOLD_PX` (as today). Touch (`pointerType === 'touch'`): start a `LONG_PRESS_MS` timer on `pointerdown`; moving more than `LONG_PRESS_SLOP_PX` before it fires abandons the drag (the page scrolls); when it fires, lift and `navigator.vibrate?.(HAPTIC_MS)`. While lifted, a non-passive `touchmove` listener on `document` calls `preventDefault()` so the page does not scroll; keep `touch-action: pan-y` on `.slot` so an un-lifted swipe still scrolls.
  On lift: clone the slot into `.drag-ghost` (`position: fixed; pointer-events: none; transform: rotate(-6deg) scale(1.06)`; deep shadow, z-index above everything), mark the original `.placeholder` (dashed `2px` outline, content hidden, same width).

- [ ] **Step 3: Move.** On `pointermove` position the ghost under the pointer. Hit-test with `elementFromPoint` (ghost ignored): resolve the target plank from `.slot` → its plank, else `.plank`, else `.shelf .plank`. If target plank ≠ origin and `!canDropOn(slotsOf(target).length, false)`: add `.refusing` to that shelf, set `document.body.style.cursor = 'not-allowed'`, leave the placeholder where it is. Otherwise clear `.refusing` and move the placeholder: over a slot → before/after by `HALF`, as today; over the plank's empty area → append.

- [ ] **Step 4: Drop.** Remove ghost and classes, restore cursor, swallow the click (existing `swallowClick`). If the placeholder's plank is the origin → existing `persist(plank, before)`. Otherwise → `moveFilmToShelf(targetId, { filmId, fromShelfId, order: orderOf(targetPlank) })`; on false restore both planks (`restore(origin, originOrder)` after moving the slot back) and `say(MOVE_FAILED)`; on true `refresh()` and dispatch `FILM_MOVED_EVENT`. `pointercancel` → restore, no request.

- [ ] **Step 5: Full-shelf style.** `.shelf.refusing .plank` → `outline: 2px solid var(--danger); outline-offset: 6px; border-radius: 4px`, spines `filter: saturate(0.6)`.

- [ ] **Step 6: Keyboard.** Extend the `keydown` handler: `Alt+ArrowUp` / `Alt+ArrowDown` on a focused spine moves it to the end of the previous / next shelf. Full target → `say(MOVE_TARGET_FULL)` and nothing moves; no neighbour shelf → nothing. Same request and rollback as Step 4; keep focus on the moved spine.

- [ ] **Step 7: Search stays in step.** In `SearchBar.astro`, on `FILM_MOVED_EVENT` decrement `fromShelfId`'s `filmCount` and increment `toShelfId`'s (the film stays in `shelved`).

- [ ] **Step 8: Verify in the browser.** Desktop: hover shows the open hand; drag a spine to the shelf below, the dashed gap follows, drop persists across reload; drag over a full shelf shows the red outline and `not-allowed`, drop returns it; in-shelf reorder still works; click still opens the case. With devtools offline: a cross-shelf drop rolls back with the toast. Keyboard Alt+Up/Down works. **On a real phone** (Vercel preview): a swipe scrolls; long press lifts with a pulse; dragging down to the next shelf does not scroll the page and drops correctly; in-shelf reorder works with the long press.

---

### Task 7: Shelf reorder by the postit

**Files:**
- Modify: `src/components/Bookcase.astro` (script + styles), `src/components/Shelf.astro` (postit cursor), `src/components/SearchBar.astro` (listen to `SHELVES_REORDERED_EVENT`)

**Interfaces:**
- Consumes: `saveShelvesOrder`, `SHELVES_REORDER_FAILED`, `SHELVES_REORDERED_EVENT`, `ShelvesReorderedDetail`; the lift timing from Task 6.
- Produces: `.shelf.lifted` state.

- [ ] **Step 1: Start.** `pointerdown` on `button.postit` (only editable shelves with a postit have one) starts a shelf drag using the same threshold / long-press rules as spines. Postit cursor: `grab` / `grabbing`.

- [ ] **Step 2: Move.** The shelf gets `.lifted` (raised, shadow). As the pointer's `clientY` passes the vertical midpoint of another `.shelf`, insert the lifted shelf before/after it (shelves without a postit can be passed over). Keep `#empty-hint` and `#add-shelf` after the last shelf.

- [ ] **Step 3: Drop.** If the order of `[data-shelf-id]` changed → `saveShelvesOrder(ids)`; on false put the shelves back and `say(SHELVES_REORDER_FAILED)`; on true dispatch `SHELVES_REORDERED_EVENT`. Swallow the click that ends the drag **for every listener**: replace the bookcase-level `swallowClick` check with a `document` capture-phase `click` listener that, when `swallowClick` is set, calls `stopPropagation()` and `preventDefault()` — that is what keeps `LabelEditor`'s `document` listener from opening.

- [ ] **Step 4: Keyboard.** `Alt+ArrowUp` / `Alt+ArrowDown` on a focused postit moves its shelf one place, same persistence and rollback, focus stays on the postit.

- [ ] **Step 5: Search stays in step.** In `SearchBar.astro`, on `SHELVES_REORDERED_EVENT` sort `slots` by the new order, so the next add lands on the first shelf with room in the new order.

- [ ] **Step 6: Verify in the browser.** Drag a postit up past another shelf; reload keeps the order; a short click still opens the label editor; a drag never opens it; a shelf without a postit cannot be dragged but can be passed over; search adds go to the first shelf with room in the new order; Alt+Up/Down works; on a real phone the long press lifts the shelf.

---

### Task 8: Whole-branch verification

- [ ] **Step 1:** `npm test` — Expected: all tests pass.
- [ ] **Step 2:** `npm run lint && npm run typecheck` — Expected: no errors.
- [ ] **Step 3:** `supabase db reset && psql … -f supabase/tests/schema_checks.sql` — Expected: `all assertions passed`.
- [ ] **Step 4:** Light and dark, desktop and phone, the manual checks of Tasks 5–7 once more on the Vercel preview; take the screenshots the PR hook asks for.
- [ ] **Step 5:** In `docs/roadmap.md`, step 2 gets `**Status:** done, <merge date> (PR #<n>).` only once merged — not in this branch.
