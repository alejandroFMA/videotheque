# Score stickers on the case

Roadmap step 4. Builds on the 3D case
(`docs/superpowers/specs/2026-11-16-3d-film-case-design.md`).

This step began as "a critic's verdict on the case back" from The Guardian
plus score stickers on the front. The Guardian part was built and then
dropped because its terms rule it out (see "Rejected: the Guardian
verdict"). What ships is the stickers.

## Intent

The pulled-out case should carry the press a 90s video sleeve carried. The
stickers a shop stuck on a tape's front — a score, a rating — are what made
it worth picking up, and they round off the case as the showpiece of the
shelf.

Everything shown is real. A film with no score shows no sticker. Nothing is
invented.

## Goals

- **Front:** up to two score stickers in the top-right corner, stacked: the
  Rotten Tomatoes Tomatometer (critics) above, the IMDb rating (users)
  below. Both from OMDb.
- **Credits:** OMDb (with its CC BY-NC 4.0 licence), IMDb and Rotten
  Tomatoes are credited in the site footer next to TMDB.
- Films already on shelves get their scores through the backfill script,
  like the case details did.

## Non-goals

- A press quote on the back (see "Rejected"). The back stays as in step 3.
- A Rotten Tomatoes audience score. OMDb does not provide one; IMDb is the
  users' score instead.
- Metacritic.
- Refreshing scores over time. They are cached once, like every other
  `films` field.

## Anti-goals

- **Copying a brand's artwork.** No Rotten Tomatoes logo files, no IMDb
  wordmark. The stickers are our own design and name the source in plain
  type. The fresh tomato and rotten splat (the owner's call) are our own
  drawings of those ideas, not Rotten Tomatoes' icons; they still evoke its
  marks, a risk accepted for a non-commercial shelf.
- **Calling an external service while rendering.** The shelf read and the
  case open stay inside our own cache (CLAUDE.md).
- **An add that fails because OMDb is down.** TMDB is the only service an
  add depends on.

## Approaches

- **A · At add time, in the add endpoint (picked).**
  `POST /api/shelves/[id]/films` already fetches the TMDB movie, which
  carries `imdb_id`. Right after it, the endpoint asks OMDb and writes the
  scores into the same `films` insert. Films cached before this step are
  filled by the backfill script. Same pattern as step 3, no new secret in
  the deployed app beyond the OMDb key. Cost: an add takes a little longer
  (the step 1 spinner covers it), and a lookup that fails at that moment is
  only retried when the backfill runs again.
- **B · A Vercel cron job** filling rows with no lookup yet. Does not slow
  the add and retries on its own, but the deployed app would need a key
  that can update `films`, which step 3 kept out on purpose.
- **Rejected · fetching on case open.** Breaks "rendering a shelf never
  calls an external service".

## The front: score stickers

Drawn by us, onto the front face, in its top-right corner, stacked:

1. **Tomatometer** (top): a light red round sticker with the percentage in white
   (`94 %`, Spanish spacing) and a mark of a similar size before it — a red
   tomato with a pale rim when the score is fresh (60 % or more, Rotten
   Tomatoes' own threshold), a green splat when it is rotten. No label: the
   mark names the source.
2. **IMDb** (below): a yellow round sticker, the same size as the
   Tomatometer one, the rating large with a decimal comma (`7,8`) and
   `IMDb` underneath, larger than the Rotten Tomatoes label.

Each sticker is drawn only when its score exists; with one score, that
sticker alone takes the top slot. A value or label too wide for the disc
(`100 %` with its mark) shrinks to fit rather than spilling or being cut.

They must read as **stickers stuck on the sleeve**, not printed on it (the
owner's call):

- A **thin white die-cut border** around each one, like the margin a
  sticker sheet leaves when it is cut out.
- A **paper texture** over the sticker: faint grain and a slight sheen,
  so it looks like a separate piece of paper.
- A slight tilt and a soft shadow underneath. Anything resembling the
  official logos is still out.

Labels live in `src/constants/`.

## Credits

In the footer, under TMDB's line:

- "Notas de la API de OMDb" linking to omdbapi.com, followed by the
  licence name linking to the CC BY-NC 4.0 deed. OMDb's content is
  licensed CC BY-NC 4.0, which asks for credit and a link to the licence.
- An IMDb line and a Rotten Tomatoes line naming each trademark's owner
  and stating that the site is not endorsed by or affiliated with either.
  The stickers name both sources, so their marks are acknowledged.

## Data

### Source

**OMDb** (free key, 1,000 requests a day, content CC BY-NC 4.0; its terms
of use: personal, non-commercial, no index of its contributions). Look up
by `imdb_id`, which TMDB's movie details already return: an exact match,
no title guessing. Read `imdbRating` and the `Rotten Tomatoes` entry of
`Ratings`; `N/A` or a missing entry means no score.

Key: `OMDB_API_KEY`, a server-only environment variable, in the owner's
`.env` and Vercel (and `.env.example`). **A missing key skips the lookup**
(logged once) and the add still succeeds.

OMDb redistributes scores that belong to Fandango (Rotten Tomatoes) and
IMDb; its licence cannot grant rights it does not hold. Accepted for a
non-commercial shelf among friends. If it ever matters, IMDb publishes its
ratings as official non-commercial datasets (with an "Information courtesy
of IMDb" credit); Rotten Tomatoes has no equivalent.

### New `films` columns

One migration, all nullable, written server-side only (the add endpoint
and the backfill), still no update policy:

- `rt_score` (smallint, 0–100) and `imdb_rating` (numeric, one decimal).
- `scores_checked_at` (timestamptz): set when OMDb was asked and answered,
  including "no scores for this film" and "TMDB has no IMDb id". Null means
  "not looked up yet, the key was missing, or OMDb failed", which is what
  the backfill retries.

### The add endpoint

After `fetchTmdbMovie`, and only when the film is not already in the cache,
ask OMDb with a short timeout (4 s). The scores join the row that
`ensureFilmCached` inserts. Any failure (timeout, non-2xx, malformed body)
means "no scores, not checked" and never fails the add.

The endpoint's response already returns the cached row, so a film added
from the search bar opens with its stickers without a reload.

### Getting it to the case

The scores ride on the slot inside the existing case-details JSON
(`toCaseJson` / `parseCaseDetails` in `src/lib/case-details.ts`), which
already degrades to empty on anything malformed. PostgREST may return
`numeric` as a string; it is converted on the way in.

### The backfill

`scripts/backfill-film-details.ts` also fills the scores, for rows whose
`scores_checked_at` is null, alongside the step 3 columns.

It no longer needs the service-role key, which the owner does not use. It
reads `.env` (`TMDB_ACCESS_TOKEN`, `OMDB_API_KEY`, `SUPABASE_DB_PASSWORD`)
and writes through `psql` as the database owner, the same credentials
`supabase db push` uses, with one `UPDATE … FROM jsonb_to_recordset(…)`
through the linked project's pooler. Each column group is written only
where it is still missing. `BACKFILL_DB_URL` points it at another database,
such as the local stack. Still run locally by the owner, still not part of
the deployed app. The owner's `.env` has CRLF line endings, so values are
stripped of `\r`.

## Rejected: the Guardian verdict

The original step put one critic's line on the back: a Guardian review's
stars, the verdict from its headline, and the critic's name, for four- and
five-star reviews. It was built and removed, because the Guardian Open
Platform terms (theguardian.com/open-platform/terms-and-conditions) forbid
what made it work:

- **§5:** OP Content must be replaced or deleted at least every 24 hours
  and never kept longer. The design cached it in `films` for good. Keeping
  it fresh needs either a daily job with write access to `films` or a
  fetch on case open, both ruled out above.
- **§6(b)(i), §6(c)(i):** the full headline and byline must be retained and
  the content not edited or adapted. The design cut the verdict out of the
  headline.
- **§6(b)(vi):** a "Powered by The Guardian" logo on the same page.
- **§6(g):** no automated extraction or aggregation of OP Content, which
  picking a review by code arguably is.

Showing the full headline with the logo and a 24-hour refresh would comply,
but no longer reads as a sleeve's press line. Asking licensing@theguardian.com
for permission (§18) remains possible if the quote is ever wanted back.

## Constraints

- OMDb's licence and terms are non-commercial, like TMDB's; the app already
  lives under that constraint.
- Rendering never calls TMDB or OMDb.
- The browser still writes nothing but the spine colour.
- Every user-facing string (sticker labels, credits) in `src/constants/`.

## Known gaps

- **Scores freeze** at the moment the film is cached.
- **OMDb answering `Response: "False"`** is treated as "no scores" and marks
  the row checked. If OMDb used that answer for transient or quota errors,
  such a film would keep no stickers until its row is cleared by hand.
- **The backfill re-asks OMDb** for rows selected only because they lack
  case details (films with genuinely no backdrops and no cast).
