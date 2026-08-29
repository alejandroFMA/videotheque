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
    },
  },
});
