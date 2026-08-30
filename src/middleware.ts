import { defineMiddleware } from 'astro:middleware';
import { serverClient } from './lib/supabase';
import { resolveUser } from './lib/auth-session';

export const onRequest = defineMiddleware(async (context, next) => {
  // `setAll` cannot see the final Response yet, so collect any cache headers
  // a token refresh emits and copy them on after `next()`. Session cookies go
  // through `context.cookies`, which Astro serialises onto the response itself.
  const refreshHeaders = new Headers();
  const supabase = serverClient(context.cookies, context.request.headers, refreshHeaders);

  context.locals.supabase = supabase;
  // Nothing between serverClient and the claims read — a late refresh that
  // lands after the response is committed would be lost.
  context.locals.user = await resolveUser(supabase);

  const response = await next();
  refreshHeaders.forEach((value, key) => response.headers.set(key, value));
  return response;
});
