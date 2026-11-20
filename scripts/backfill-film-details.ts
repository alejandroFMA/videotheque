/**
 * Backfill of the cached `films` columns that rows from before a step lack:
 * the case back (backdrop_paths, cast_names, crew, companies) and the OMDb
 * score stickers. Safe to run again: it only touches rows still missing data,
 * and retries score lookups that did not get an answer.
 *
 * Run by the repo owner, locally — it is not part of the deployed app:
 *
 *   node --env-file=.env scripts/backfill-film-details.ts
 *
 * It writes as the database owner through `psql` with SUPABASE_DB_PASSWORD,
 * the same credentials `supabase db push` uses, because `films` has no update
 * policy: no browser session can rewrite the global cache, and that stays
 * true. The connection comes from the linked project (`supabase/.temp`).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { toFilmRow, type TmdbMovie } from '../src/lib/tmdb-mapping.ts';
import { lookupScores } from '../src/lib/scores-lookup.ts';
import type { ScoreFields } from '../src/lib/scores.ts';

// Copied from tmdb-proxy.ts rather than imported: that module's extensionless
// relative imports only resolve through Vite, not under plain Node.
const TMDB_MOVIE_URL = 'https://api.themoviedb.org/3/movie/';
const APPEND = 'credits,images';
const TEXTLESS = 'null';

const POOLER_URL_FILE = 'supabase/.temp/pooler-url';
const PROJECT_REF_FILE = 'supabase/.temp/project-ref';
const DB_USER = 'postgres';
// Dollar-quoting tag for the JSON payload; checked against the payload below.
const DOLLAR_TAG = '$backfill$';

const REQUIRED_ENV = process.env.BACKFILL_DB_URL
  ? (['TMDB_ACCESS_TOKEN'] as const)
  : (['TMDB_ACCESS_TOKEN', 'SUPABASE_DB_PASSWORD'] as const);

// The owner's .env has CRLF line endings; Node keeps the \r in the value.
const env = (name: string) => process.env[name]?.replace(/\r$/, '') || undefined;

const missing = REQUIRED_ENV.filter((name) => !env(name));
if (missing.length) {
  console.error(`Missing environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

function connectionUrl(): string {
  let pooler: string;
  let ref: string;
  try {
    pooler = readFileSync(POOLER_URL_FILE, 'utf8').trim();
    ref = readFileSync(PROJECT_REF_FILE, 'utf8').trim();
  } catch {
    console.error('No linked Supabase project: run `supabase link` first.');
    process.exit(1);
  }
  const url = new URL(pooler);
  url.username = `${DB_USER}.${ref}`;
  url.password = '';
  url.searchParams.set('sslmode', 'require');
  return url.toString();
}

// BACKFILL_DB_URL points the script at another database, such as the local
// stack, so it can be tried without touching the hosted project.
const dbUrl = env('BACKFILL_DB_URL') ?? connectionUrl();

/** The password travels in the child's environment, never on its command line. */
function psql(args: string[], input?: string): string {
  try {
    return execFileSync('psql', [dbUrl, '-v', 'ON_ERROR_STOP=1', '-X', ...args], {
      input,
      encoding: 'utf8',
      env: { ...process.env, PGPASSWORD: env('SUPABASE_DB_PASSWORD') },
    });
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { stderr?: string };
    if (e.code === 'ENOENT') console.error('psql is not installed or not on PATH.');
    else console.error(e.stderr || e.message);
    process.exit(1);
  }
}

const token = env('TMDB_ACCESS_TOKEN')!;
const omdbKey = env('OMDB_API_KEY');

async function fetchMovie(id: number): Promise<TmdbMovie> {
  const url = new URL(`${TMDB_MOVIE_URL}${id}`);
  url.searchParams.set('append_to_response', APPEND);
  url.searchParams.set('include_image_language', TEXTLESS);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as TmdbMovie;
}

const ids = psql([
  '-At',
  '-c',
  `select id from public.films
    where (backdrop_paths = '{}' and cast_names = '{}') or scores_checked_at is null
    order by id`,
])
  .split('\n')
  .filter(Boolean)
  .map(Number);

type Patch = { id: number } & Pick<
  ReturnType<typeof toFilmRow>,
  'backdrop_paths' | 'cast_names' | 'crew' | 'companies'
> &
  ScoreFields;

const patches: Patch[] = [];
for (const id of ids) {
  try {
    const movie = await fetchMovie(id);
    const row = toFilmRow(movie);
    const scores = await lookupScores(movie, omdbKey, fetch);
    patches.push({
      id,
      backdrop_paths: row.backdrop_paths,
      cast_names: row.cast_names,
      crew: row.crew,
      companies: row.companies,
      ...scores,
    });
    console.log(`${id} ok${scores.scores_checked_at ? '' : ' (scores not checked)'}`);
  } catch (err) {
    console.log(`${id} failed: ${(err as Error).message}`);
  }
}

if (patches.length) {
  const payload = JSON.stringify(patches);
  if (payload.includes(DOLLAR_TAG)) {
    console.error('Payload contains the SQL quoting tag; aborting.');
    process.exit(1);
  }
  // Each group of columns is written only where it is still missing, so a
  // second run never overwrites what a first run (or an add) already cached.
  const sql = `
update public.films f set
  backdrop_paths   = case when f.backdrop_paths = '{}' and f.cast_names = '{}' then r.backdrop_paths else f.backdrop_paths end,
  cast_names       = case when f.backdrop_paths = '{}' and f.cast_names = '{}' then r.cast_names     else f.cast_names     end,
  crew             = case when f.backdrop_paths = '{}' and f.cast_names = '{}' then r.crew           else f.crew           end,
  companies        = case when f.backdrop_paths = '{}' and f.cast_names = '{}' then r.companies      else f.companies      end,
  rt_score          = case when f.scores_checked_at is null then r.rt_score          else f.rt_score          end,
  imdb_rating       = case when f.scores_checked_at is null then r.imdb_rating       else f.imdb_rating       end,
  scores_checked_at = case when f.scores_checked_at is null then r.scores_checked_at else f.scores_checked_at end
from jsonb_to_recordset(${DOLLAR_TAG}${payload}${DOLLAR_TAG}::jsonb) as r(
  id int, backdrop_paths text[], cast_names text[], crew jsonb, companies jsonb,
  rt_score smallint, imdb_rating numeric, scores_checked_at timestamptz
)
where f.id = r.id;
`;
  process.stdout.write(psql(['-f', '-'], sql));
}
