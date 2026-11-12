import type { APIRoute } from 'astro';
import { handleDeleteShelf, handleUpdateShelf, readJson } from '../../../../lib/shelf-actions';

export const prerender = false;

export const PATCH: APIRoute = async ({ locals, params, request }) =>
  handleUpdateShelf({
    supabase: locals.supabase,
    owner: locals.user?.sub as string | undefined,
    shelfId: params.id,
    body: await readJson(request),
  });

export const DELETE: APIRoute = ({ locals, params }) =>
  handleDeleteShelf({
    supabase: locals.supabase,
    owner: locals.user?.sub as string | undefined,
    shelfId: params.id,
  });
