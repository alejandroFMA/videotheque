import type { APIRoute } from 'astro';
import { getSecret } from 'astro:env/server';
import { handleAddFilm, readJson } from '../../../../../lib/shelf-actions';

export const prerender = false;

export const POST: APIRoute = async ({ locals, params, request }) =>
  handleAddFilm({
    supabase: locals.supabase,
    owner: locals.user?.sub as string | undefined,
    shelfId: params.id,
    body: await readJson(request),
    token: getSecret('TMDB_ACCESS_TOKEN'),
    fetch,
  });
