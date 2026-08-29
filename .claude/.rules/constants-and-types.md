# Constants and types

- No magic values inline. A literal that carries meaning — a URL, a size, a
  limit, an HTTP status, a key — gets a name. `0`, `1`, `-1`, and array
  indices are exempt.
- Types and constants that belong to one module stay with it, co-located in
  that module's file under `src/lib/`.
- Types and constants shared across modules go in `src/types/` (interfaces,
  type aliases) and `src/constants/` (values). Keep those two folders
  declarations-only — no logic.
