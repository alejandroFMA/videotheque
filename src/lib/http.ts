export const NO_STORE = 'no-store';

export function json(
  body: unknown,
  status: number,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

/** Uncacheable: an error must never be served from a cache. */
export function errorJson(
  body: unknown,
  status: number,
  headers: Record<string, string> = {},
): Response {
  return json(body, status, { 'Cache-Control': NO_STORE, ...headers });
}

export const unauthorized = () => errorJson({ error: 'unauthorized' }, 401);
export const badRequest = (reason: string) => errorJson({ error: reason }, 400);
export const badGateway = (reason: string) => errorJson({ error: reason }, 502);
export const conflict = (body: object) => errorJson(body, 409);

/** Fixed bodies: a 404 must not confirm which ids exist, a 500 must not echo Supabase. */
export const notFound = () => errorJson({ error: 'not found' }, 404);
export const internalError = () => errorJson({ error: 'internal error' }, 500);

export const noContent = () => new Response(null, { status: 204 });
