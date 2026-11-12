# Move films between shelves — design

Roadmap step 2 (`docs/roadmap.md`). Status: design, 2026-11-12.

## Intent

The owner labels shelves by theme ("Terror", "Ghibli"…). A film added from
search lands on the first shelf with room (`firstShelfWithRoom` in
`src/lib/shelf-target.ts`), which is often not where it belongs. Today the
owner can only reorder within a shelf, so a film on the wrong shelf stays
there. This step lets the owner pick a spine up and put it on the shelf it
belongs to, and rounds that off with shelf management: reorder shelves and
delete a shelf.

Success: the owner can organise the whole bookcase with direct gestures, on
desktop and on a phone, without anything ending up half-saved.

## Goals

1. **Move a film to another shelf** by dragging its spine onto it.
2. **Reorder shelves** by dragging a shelf's postit up or down.
3. **Delete a shelf**, films included, after a confirmation.
4. **A touch gesture that does not fight scrolling** (long press to lift).
5. **Desktop affordance**: the cursor shows an open hand over anything
   draggable and a closed hand while dragging.

## Non-goals

- Creating shelves (already exists).
- Moving several films at once.
- Undoing a delete.
- Dragging a shelf that has no postit (see below).
- Anything on the public profile `/u/<handle>`: it stays read-only, nothing
  is draggable there.

## Anti-goals

- A gesture that leaves the data half-applied: a film on two shelves, on
  none, or a shelf order that differs between the screen and the database
  after a reload.
- A touch drag that hijacks normal page scrolling.
- Losing a film silently: if the move fails, the film is back where it was
  and the owner is told.

## Facts the design rests on

- **A film lives on at most one of a user's shelves.** The search dropdown
  marks a film "Ya en la estantería" if it is on any of the owner's shelves
  and refuses to add it again (`shelvedFilmIds`). The database does not
  enforce this (`shelf_items` key is `(shelf_id, film_id)`); the app does.
  A move must keep it true.
- Shelves are currently ordered by `created_at` (`listShelvesWithFilms`).
  There is no shelf position column.
- In-shelf reorder exists: pointer handling in `Bookcase.astro`, persisted by
  `PUT /api/shelves/[id]/order` → `reorder_shelf`. A press under a distance
  threshold is a click that opens the case; above it, a drag.
- Spines use `touch-action: pan-y`: on touch, horizontal drags reorder and
  vertical drags scroll the page.
- Clicking the postit (or the "Añadir etiqueta" link on a shelf without one)
  opens `LabelEditor.astro`, a `<dialog>` with save / remove-label / cancel.
- The page already has a toast (`#shelf-toast`) for short messages.
- Shelf capacity is `SHELF_CAPACITY` (20), enforced server-side with `409`.

## Decided behaviour

### Moving a film (owner's words)

- The owner grabs a spine and drops it on another shelf, e.g. the one below.
- On desktop, hovering a spine shows the open hand (`cursor: grab`);
  dragging shows the closed hand (`grabbing`). This replaces today's
  `cursor: pointer` on spines.
- On touch, the owner presses and holds for a moment; the spine lifts; from
  then on it can be dragged anywhere, including to another shelf. A swipe
  without the hold scrolls the page as it does today.

Calls made in writing this up:

- The film lands where it is dropped, between the two spines either side of
  the drop point, as in-shelf reorder does — not appended at the end.
- The long press also becomes the touch gesture for reordering within a
  shelf, so there is one touch gesture for all spine dragging. Desktop keeps
  press-and-drag with the existing distance threshold.
- **Lifted spine (chosen in the mockups, option B):** the held spine floats
  with the pointer, slightly tilted and scaled up with a deep shadow, and
  the target plank shows a dashed gap where it will land. The neighbours
  open that gap as the pointer moves, so the drop point is always visible,
  also when crossing from one shelf to another.
- **Full shelf (chosen in the mockups, option B):** while a spine from
  another shelf is dragged over a full shelf (20 films), that plank gets a
  thin red outline, its spines desaturate slightly, the cursor turns to
  `not-allowed`, and no gap opens. Dropping there returns the spine to
  where it was. The server still enforces the cap with `409` as the
  backstop.

Calls made in writing this up:

- On touch, the lift after the long press also gives a short haptic pulse
  where the device supports it (`navigator.vibrate`), alongside the visual
  lift.
- The move is one server operation: the film leaves the source shelf and
  enters the target at the requested position in a single transaction, and
  both shelves' orders are correct afterwards. If it fails, the view returns
  to how it was and the toast explains.

### Reordering shelves (owner's words)

- The owner drags a shelf's postit up or down; the whole shelf moves with it.
- A shelf without a postit cannot be dragged — to reorganise it, move its
  films. It can still be passed over by a shelf that has one.

Calls made in writing this up:

- A short press on the postit still opens the label editor; a drag past the
  threshold moves the shelf. On touch, a long press lifts it, as for spines.
- Hovering the postit shows the open hand.
- The new order is persisted in one call that rewrites the order of all of
  the owner's shelves (same reasoning as `reorder_shelf`: the server assigns
  positions, two tabs cannot collide on a client-computed `max()`). This
  needs a shelf position column; new shelves are appended at the end, and
  `listShelvesWithFilms` orders by it.
- Shelf order also decides where search adds land, since
  `firstShelfWithRoom` walks shelves in page order. That is intended.
- On failure the shelves return to their previous order and the toast
  explains.

### Deleting a shelf (owner's words)

- Deleting a shelf removes the shelf and its films, after a confirmation.
- It works the same for a shelf with or without a postit.

- The trigger is a small round button beside the shelf, to the right of
  its plank and vertically centred on the wooden board (the last row's
  board when the shelf wraps): a red "−" inside a red outlined circle with
  no fill. It shows when the pointer is over the shelf.
- The red is a new `--danger` token in `src/styles/app.css`, themed like
  `--success`: `#b03a2e` in light mode, `#e0675b` in dark mode. The "−"
  button, the dialog's "Borrar balda" button, and the full-shelf outline
  all use it. It is the
  same for a shelf with or without a postit, and it is separate from the
  label editor.
- Pressing it opens a confirmation dialog of its own (chosen in the
  mockups): title "¿Borrar «Terror» y sus 12 películas?", body "La balda y
  todo lo que tiene desaparecen de tu colección.", note "Podrás volver a
  añadir esas películas desde el buscador.", buttons "Cancelar" and a red
  "Borrar balda". In-page `<dialog>`, never `window.confirm`.

Calls made in writing this up:

- The UI already calls a shelf "balda" ("+ Añadir balda", "Etiqueta de la
  balda"), so the new copy does too.
- Title variants: unlabelled shelf "¿Borrar esta balda y sus N películas?";
  empty shelf "¿Borrar esta balda?" (or "¿Borrar «Terror»?"); one film uses
  the singular "película".
- On touch screens there is no hover, so the "−" button is always visible,
  as "+ Etiqueta" already is (`@media (hover: none)`). It also shows on
  keyboard focus, and has an accessible name ("Borrar balda").
- The owner's only remaining shelf cannot be deleted; the action is not
  offered (or is disabled with a reason) when there is one shelf.
- Deleting removes the shelf's `shelf_items` rows. The `films` cache is
  global and is never touched. A deleted film can be added again from
  search afterwards.
- On failure the shelf stays and the toast explains.

## Constraints

- All writes go through `src/pages/api/shelves/`, with RLS as the backstop,
  like every existing mutation. Each new endpoint checks the shelf belongs to
  the caller (`findOwnShelf`); for a move, both shelves.
- The server assigns positions (project rule). The client sends intent
  (which film, which target, which neighbour / the full new order), never
  computed positions.
- No new runtime library. Drag stays plain pointer events in
  `Bookcase.astro` (or a module it imports).
- Every user-facing string (confirmation, toasts, button labels, accessible
  names) lives in `src/constants/`.
- Keyboard: today a spine can be moved without a pointer (see "The same move
  without a pointer" in `Bookcase.astro`). Moving a film to another shelf
  and moving a shelf must also be reachable without a pointer.
- Close the step only after trying the touch gestures on a real phone, as
  the roadmap asks.

## Left to the builder

- Exact long-press duration and how far the finger may wander during it.
- Endpoint shapes and names (e.g. a move endpoint vs. extending the order
  endpoint; `DELETE /api/shelves/[id]`; a bookcase-level shelf order
  endpoint), and the SQL function(s) behind them.
- The migration that adds and backfills the shelf position from
  `created_at`.
- How the drop target is hit-tested across shelves and how the lifted spine
  is drawn while between shelves.
- The keyboard interaction for cross-shelf and shelf moves.
- Suppressing the system long-press menu / text selection on iOS and
  Android.
- Test split across `shelf-actions`, `shelves` and the SQL functions.
