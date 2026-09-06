import type { APIRoute } from 'astro';
import { handleRemoveFilm } from '../../../../../lib/shelf-actions';

export const prerender = false;

export const DELETE: APIRoute = ({ locals, params }) =>
  handleRemoveFilm({
    supabase: locals.supabase,
    owner: locals.user?.sub as string | undefined,
    shelfId: params.id,
    filmId: params.filmId,
  });
