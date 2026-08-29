/// <reference types="vitest/config" />
import { getViteConfig } from 'astro/config';

// getViteConfig merges Astro's Vite setup so tests resolve the same way the app does.
// If it fails to load here (e.g. the Vercel adapter throws without credentials),
// replace the import with `import { defineConfig } from 'vitest/config'` and call
// defineConfig(...) with the same `test` object — tests import only plain .ts modules.
export default getViteConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
