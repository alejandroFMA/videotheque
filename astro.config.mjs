// @ts-check
import { defineConfig, envField } from 'astro/config';
import vercel from '@astrojs/vercel';

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
