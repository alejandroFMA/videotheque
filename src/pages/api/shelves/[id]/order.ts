import type { APIRoute } from 'astro';
import { handleReorderShelf, readJson } from '../../../../lib/shelf-actions';

export const prerender = false;

export const PUT: APIRoute = async ({ locals, params, request }) =>
  handleReorderShelf({
    supabase: locals.supabase,
    owner: locals.user?.sub as string | undefined,
    shelfId: params.id,
    body: await readJson(request),
  });
