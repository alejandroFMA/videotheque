import type { APIRoute } from 'astro';
import { handleCreateShelf } from '../../../lib/shelf-actions';

export const prerender = false;

// Matches the slug the sign-up trigger gives the first shelf.
const SLUG_LENGTH = 10;

export const POST: APIRoute = async ({ locals }) =>
  handleCreateShelf({
    supabase: locals.supabase,
    owner: locals.user?.sub as string | undefined,
    slug: crypto.randomUUID().replaceAll('-', '').slice(0, SLUG_LENGTH),
  });
