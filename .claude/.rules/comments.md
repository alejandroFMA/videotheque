# Comments

- Comment only where the code is genuinely ambiguous, or where the *why* is
  not visible in the code itself — a workaround, a non-obvious ordering, a
  spec quirk.
- Explain *why*, never *what*. A comment that restates the code is noise;
  delete it and let the names carry the meaning.
- No commented-out code. Delete it; git remembers.
- JSDoc only on exported API whose signature does not already say what it is
  and how to call it.
