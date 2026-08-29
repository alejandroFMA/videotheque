import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import astro from 'eslint-plugin-astro';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      'dist/',
      '.vercel/',
      '.astro/',
      'node_modules/',
      'coverage/',
      '.agents/',
      'docs/',
      '.superpowers/',
      '.serena/',
      '.claude/skills/',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...astro.configs.recommended,
  {
    rules: {
      'no-magic-numbers': [
        'warn',
        {
          ignore: [-1, 0, 1],
          ignoreArrayIndexes: true,
          ignoreDefaultValues: true,
          enforceConst: true,
        },
      ],
    },
  },
  {
    files: ['test/**', '**/*.config.{js,ts,mjs}', 'eslint.config.js'],
    rules: { 'no-magic-numbers': 'off' },
  },
  prettier,
);
