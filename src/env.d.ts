/// <reference types="astro/client" />

interface ImportMetaEnv {
  /** TMDB v4 "API Read Access Token" (Bearer). Server-only. */
  readonly TMDB_ACCESS_TOKEN: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare namespace NodeJS {
  interface ProcessEnv {
    TMDB_ACCESS_TOKEN?: string;
  }
}
