export type AddPhase = 'adding' | 'added';

export interface PendingAdd {
  filmId: number;
  phase: AddPhase;
  /** The trimmed query whose results the picked film came from. */
  query: string;
}

export type RowState = 'idle' | 'shelved' | 'adding' | 'added' | 'disabled';

// The pending film is checked before the shelved set so a repaint during the
// dwell (e.g. the same film removed from the bookcase) keeps "added" showing.
export function rowState(
  filmId: number,
  pending: PendingAdd | null,
  shelved: ReadonlySet<number>,
): RowState {
  if (pending) return pending.filmId === filmId ? pending.phase : 'disabled';
  return shelved.has(filmId) ? 'shelved' : 'idle';
}

/**
 * Whether the add may still drive the dropdown (show its outcome, dwell, close).
 * A newer query typed during the add owns the list instead.
 */
export function addOwnsList(pending: PendingAdd, currentQuery: string): boolean {
  const query = currentQuery.trim();
  return query === '' || query === pending.query;
}
