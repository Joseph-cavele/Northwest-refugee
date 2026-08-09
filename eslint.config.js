import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

/*
 * One config for an application that is now both halves.
 *
 * Two languages on purpose: the client tree is TypeScript, and src/server/ stayed plain
 * JavaScript so the ~7 500 lines of ported service and model logic did not have to be
 * retyped to change web framework. Backend/CLAUDE.md's "plain JavaScript" rule survives
 * where it can.
 */
export default [
  {
    // Backend/ and Front-End/ are the pre-port trees, kept as reference. Linting them here
    // would report on code this config was never written for.
    ignores: ['node_modules/**', '.next/**', 'out/**', 'dist/**', 'Backend/**', 'Front-End/**', 'coverage/**'],
  },

  js.configs.recommended,

  // --- server and config: plain JS, Node globals -----------------------------------
  {
    files: ['src/server/**/*.js', 'src/app/**/*.js', '*.mjs', '*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
    },
  },

  // --- client: TypeScript + React ---------------------------------------------------
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ['src/**/*.{ts,tsx}'],
  })),
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,

      /*
       * THE ACCESS TOKEN IS MEMORY-ONLY. Persisting it is the one mistake that turns an
       * XSS into a stolen session on a system holding minors' identity documents — see
       * src/auth/tokenStore.ts. Do not "fix" a lost-session-on-reload bug by relaxing this;
       * the fix is POST /api/v1/auth/refresh on boot, which AuthProvider already does.
       */
      'no-restricted-globals': [
        'error',
        { name: 'localStorage', message: 'The access token is memory-only — see auth/tokenStore.ts.' },
        { name: 'sessionStorage', message: 'The access token is memory-only — see auth/tokenStore.ts.' },
      ],

      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // tsc already reports these, with better messages and full type information.
      'no-undef': 'off',
      'no-unused-vars': 'off',
    },
  },

  // Ambient declaration files declare and never execute.
  {
    files: ['src/**/*.d.ts'],
    rules: { '@typescript-eslint/no-unused-vars': 'off', '@typescript-eslint/no-empty-object-type': 'off' },
  },

  /*
   * tests/ is the Express-era suite, preserved and awaiting a port — see tests/README.md.
   * Linted rather than ignored so it does not rot further while it waits, but with the
   * globals its runner provides, which are not the browser's.
   */
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.vitest },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
    },
  },
];
