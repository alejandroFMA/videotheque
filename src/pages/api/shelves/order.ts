import type { APIRoute } from 'astro';
import { handleReorderShelves, readJson } from '../../../lib/shelf-actions';

export const prerender = false;

export const PUT: APIRoute = async ({ locals, request }) =>
  handleReorderShelves({
    supabase: locals.supabase,
    owner: locals.user?.sub as string | undefined,
    body: await readJson(request),
  });
