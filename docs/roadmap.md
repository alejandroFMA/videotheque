# Roadmap

What comes after the first production deploy. The app is a prototype that a
small group of friends is starting to use; the goal is to reach something
stable and worth showing. Scalability is out of scope for now.

**Ordering principle:** first, remove friction friends will hit on day one.
Then build the two things that make the shelf worth showing — moving films
freely and the 3D case. Polish and settings come after.

Each step is a scope line, not a design. Each one gets its own spec under
`docs/superpowers/specs/` when its turn comes.

## 1. Search and add feedback

**Goal:** adding a film should feel immediate and certain.

Today, nothing in the search dropdown shows that a pick is being added, so
the wait feels long. Show a spinner while the film is added, then a check
with "Película añadida", then close the dropdown (the user can also dismiss
it themselves). Make the search bar larger and the results easier to read.
Draw "Ya en la estantería" in green with a refined check icon, not a basic
emoji.

## 2. Move films between shelves

**Goal:** organise the whole library freely, not just one shelf at a time.

Drag-to-reorder already works within a shelf (`Bookcase.astro`,
`api/shelves/[id]/order.ts`). Extend it so that a film can be dragged onto
another shelf. Round it off with shelf management: delete a shelf and
reorder shelves. Check touch dragging on mobile before closing the step.

## 3. 3D film case

**Goal:** the pulled-out case becomes the showpiece.

Build the Three.js case described in
`docs/superpowers/specs/2026-08-29-shelf-visual-direction-design.md`. The
current static case stays as the no-WebGL fallback. Check touch
interaction on mobile before closing the step.

## 4. Visual touches

**Goal:** small details that make the shelf feel finished.

- A small hover label with the full title, for titles that do not fit on
  the spine.
- A subtle glow on the case edges as a film is lifted. It comes after step
  3 because it depends on how the lift animation ends up.

## 5. Films in Spanish

**Goal:** the shelf reads in the language of its users.

TMDB calls currently send no `language`, so synopses and titles arrive in
English. Request `es-ES` server-side, for both the synopsis and the title,
which is also what the spine draws. Refetch the films already in the
`films` cache so that existing shelves switch over too.

## 6. Settings: avatar and display name

**Goal:** users can make their profile their own.

A settings view to change the avatar and the display name shown in the
header.

## 7. Custom background

**Goal:** each user can set the room their shelf stands in.

Let users pick a solid colour or an image as the background, like a
desktop wallpaper.

## 8. Language selector (English)

**Goal:** a second language for the interface and the film data.

A selector between Spanish and English that switches the UI strings (all
already in `src/constants/`) and the TMDB text, including synopses. It is
last because it is the most expensive: the `films` cache holds one synopsis
and one title per film, so it needs a schema change to store more than one
language.

## Ongoing: know when something breaks

Friends will not send stack traces. Keep a minimal way to notice failures,
such as watching the Vercel logs or a "something is wrong" link, in place
across all the steps above.
