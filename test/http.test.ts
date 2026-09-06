import { describe, expect, it } from 'vitest';
import {
  badGateway,
  badRequest,
  conflict,
  errorJson,
  internalError,
  json,
  noContent,
  notFound,
  unauthorized,
} from '../src/lib/http';

describe('json', () => {
  it('serialises the body and sets the JSON content type', async () => {
    const res = json({ ok: true }, 200);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('application/json');
    expect(await res.json()).toEqual({ ok: true });
  });

  it('does not set Cache-Control on its own', () => {
    expect(json({}, 200).headers.get('Cache-Control')).toBeNull();
  });

  it('merges extra headers', () => {
    expect(json({}, 200, { Allow: 'GET' }).headers.get('Allow')).toBe('GET');
  });
});

describe('errorJson', () => {
  it('marks every response no-store', () => {
    expect(errorJson({ error: 'nope' }, 400).headers.get('Cache-Control')).toBe('no-store');
  });

  it('lets an explicit Cache-Control win', () => {
    const res = errorJson({}, 500, { 'Cache-Control': 'max-age=0' });
    expect(res.headers.get('Cache-Control')).toBe('max-age=0');
  });
});

describe('named responses', () => {
  it('carry the right status and an uncacheable body', () => {
    expect(unauthorized().status).toBe(401);
    expect(badRequest('invalid film id').status).toBe(400);
    expect(notFound().status).toBe(404);
    expect(conflict({ error: 'shelf_full' }).status).toBe(409);
    expect(internalError().status).toBe(500);
    expect(badGateway('tmdb unavailable').status).toBe(502);

    for (const res of [unauthorized(), notFound(), internalError()]) {
      expect(res.headers.get('Cache-Control')).toBe('no-store');
    }
  });

  it('puts the reason in the body of a 400 and a 502', async () => {
    expect(await badRequest('invalid order').json()).toEqual({ error: 'invalid order' });
    expect(await badGateway('tmdb unavailable').json()).toEqual({ error: 'tmdb unavailable' });
  });

  it('gives 404 and 500 a fixed body, so they never leak internals', async () => {
    expect(await notFound().json()).toEqual({ error: 'not found' });
    expect(await internalError().json()).toEqual({ error: 'internal error' });
  });

  it('passes a conflict body through, for the shelf-full message', async () => {
    const res = conflict({ error: 'shelf_full', message: 'lleno' });
    expect(await res.json()).toEqual({ error: 'shelf_full', message: 'lleno' });
  });

  it('answers 204 with no body at all', async () => {
    const res = noContent();
    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
  });
});
