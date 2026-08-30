// @ts-check
import { defineConfig, envField } from 'astro/config';
import vercel from '@astrojs/vercel';

// astro:env `access: 'public'` vars are inlined at build time, so a production
// build with them unset ships a permanently broken deployment. Fail loudly here
// — the only point where it can be caught. Local/CI builds (no VERCEL_ENV) are
// unaffected and stay green with an empty .env.
if (
  process.env.VERCEL_ENV === 'production' &&
  (!process.env.PUBLIC_SUPABASE_URL || !process.env.PUBLIC_SUPABASE_ANON_KEY)
) {
  throw new Error(
    'PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY must be set in the build environment for a production deploy',
  );
}

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: vercel(),
  server: { port: 3000 },
  env: {
    schema: {
      // `access: 'secret'` keeps this a genuine runtime read: not inlined into
      // the build, not validated at build time. `optional: true` so `astro build`
      // succeeds with no token set (CI, this repo's empty `.env`).
      TMDB_ACCESS_TOKEN: envField.string({ context: 'server', access: 'secret', optional: true }),
      // Browser-safe: the anon/publishable key is public by design; row level
      // security is the protection. `optional: true` keeps `astro build` green
      // in CI with an empty .env, like TMDB_ACCESS_TOKEN.
      PUBLIC_SUPABASE_URL: envField.string({ context: 'client', access: 'public', optional: true }),
      PUBLIC_SUPABASE_ANON_KEY: envField.string({
        context: 'client',
        access: 'public',
        optional: true,
      }),
    },
  },
});
