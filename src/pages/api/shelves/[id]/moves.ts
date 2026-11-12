import type { APIRoute } from 'astro';
import { handleMoveFilm, readJson } from '../../../../lib/shelf-actions';

export const prerender = false;

export const POST: APIRoute = async ({ locals, params, request }) =>
  handleMoveFilm({
    supabase: locals.supabase,
    owner: locals.user?.sub as string | undefined,
    shelfId: params.id,
    body: await readJson(request),
  });
