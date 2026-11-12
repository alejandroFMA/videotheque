import { describe, expect, it } from 'vitest';
import { addOwnsList, rowState, type PendingAdd } from '../src/lib/add-flow';

const NONE = new Set<number>();
const adding: PendingAdd = { filmId: 1, phase: 'adding', query: 'azul' };
const added: PendingAdd = { filmId: 1, phase: 'added', query: 'azul' };

describe('rowState', () => {
  it('is idle with nothing pending and the film not shelved', () => {
    expect(rowState(1, null, NONE)).toBe('idle');
  });

  it('is shelved with nothing pending and the film shelved', () => {
    expect(rowState(1, null, new Set([1]))).toBe('shelved');
  });

  it('marks the picked row adding and every other row disabled', () => {
    expect(rowState(1, adding, NONE)).toBe('adding');
    expect(rowState(2, adding, NONE)).toBe('disabled');
  });

  it('marks the picked row added and every other row disabled', () => {
    expect(rowState(1, added, NONE)).toBe('added');
    expect(rowState(2, added, NONE)).toBe('disabled');
  });

  it('pending wins over shelved set', () => {
    expect(rowState(1, added, NONE)).toBe('added');
    expect(rowState(1, added, new Set([1]))).toBe('added');
  });

  it('disables a shelved film while another is pending', () => {
    expect(rowState(2, adding, new Set([2]))).toBe('disabled');
  });
});

describe('addOwnsList', () => {
  it('owns an emptied field', () => {
    expect(addOwnsList(adding, '')).toBe(true);
  });

  it('owns the field while it still holds the original query', () => {
    expect(addOwnsList(adding, 'azul')).toBe(true);
    expect(addOwnsList(adding, '  azul ')).toBe(true);
  });

  it('gives the list up to a newer query', () => {
    expect(addOwnsList(adding, 'rojo')).toBe(false);
  });
});
