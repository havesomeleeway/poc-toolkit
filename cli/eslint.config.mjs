// Lint catches what `node --check` can't: undefined names, unused variables, unreachable code.
import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/', 'templates/'] },
  js.configs.recommended,
  {
    files: ['**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
];
