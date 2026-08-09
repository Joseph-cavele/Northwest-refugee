import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { ecmaVersion: 2022, globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      // The access token lives in memory only (see src/auth/). Persisting it is the one
      // mistake that turns an XSS into a stolen session on a system holding minors'
      // identity documents.
      'no-restricted-globals': ['error',
        { name: 'localStorage', message: 'Never persist auth state — the access token is in-memory only.' },
        { name: 'sessionStorage', message: 'Never persist auth state — the access token is in-memory only.' },
      ],
    },
  },
);
