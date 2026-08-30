/// <reference types="astro/client" />

// TMDB_ACCESS_TOKEN is declared in `astro.config.mjs` under `env.schema` and
// read via `astro:env/server`; Astro generates its types (`.astro/env.d.ts`).

declare namespace App {
  interface Locals {
    supabase: import('@supabase/supabase-js').SupabaseClient;
    user: import('@supabase/supabase-js').JwtPayload | null;
  }
}
