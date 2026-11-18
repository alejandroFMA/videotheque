/**
 * One-off backfill of the case-back columns (backdrop_paths, cast_names, crew,
 * companies) for films cached before they existed.
 *
 * Run by the repo owner, once, locally — it is not part of the deployed app.
 * It needs the service-role key because `films` has no update policy: no
 * browser session can rewrite the global cache, and that stays true.
 *
 *   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… TMDB_ACCESS_TOKEN=… \
 *     node scripts/backfill-film-details.ts
 */
import { createClient } from '@supabase/supabase-js';
import { toFilmRow, type TmdbMovie } from '../src/lib/tmdb-mapping.ts';

// Copied from tmdb-proxy.ts rather than imported: that module's extensionless
// relative imports only resolve through Vite, not under plain Node.
const TMDB_MOVIE_URL = 'https://api.themoviedb.org/3/movie/';
const APPEND = 'credits,images';
const TEXTLESS = 'null';

const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'TMDB_ACCESS_TOKEN'] as const;

const missing = REQUIRED_ENV.filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`Missing environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const token = process.env.TMDB_ACCESS_TOKEN!;

async function fetchMovie(id: number): Promise<TmdbMovie> {
  const url = new URL(`${TMDB_MOVIE_URL}${id}`);
  url.searchParams.set('append_to_response', APPEND);
  url.searchParams.set('include_image_language', TEXTLESS);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as TmdbMovie;
}

const { data: films, error } = await supabase
  .from('films')
  .select('id')
  .eq('backdrop_paths', '{}')
  .eq('cast_names', '{}');
if (error) {
  console.error('Could not list films:', error.message);
  process.exit(1);
}

for (const { id } of films ?? []) {
  try {
    const row = toFilmRow(await fetchMovie(id));
    const { error: updateError } = await supabase
      .from('films')
      .update({
        backdrop_paths: row.backdrop_paths,
        cast_names: row.cast_names,
        crew: row.crew,
        companies: row.companies,
      })
      .eq('id', id);
    if (updateError) throw new Error(updateError.message);
    console.log(`${id} ok`);
  } catch (err) {
    console.log(`${id} failed: ${(err as Error).message}`);
  }
}
