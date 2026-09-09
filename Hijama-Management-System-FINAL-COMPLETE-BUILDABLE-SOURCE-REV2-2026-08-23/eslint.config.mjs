/**
 * Source lint gate for renderer, Electron main/preload, Node tooling, and tests.
 * Generated artifacts and vendored/minified files are intentionally excluded.
 */
import js from '@eslint/js';
import globals from 'globals';

const runtimeGlobals = {
  ...globals.browser,
  ...globals.node,
  console: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
};

export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'audit-output/**',
      'docs/**',
      'assets/vendor/**',
      'branding/**',
      'templates/**',
      'build/**',
      '**/*.min.js',
      '**/*.map',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.js', '**/*.cjs', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: runtimeGlobals,
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'no-console': 'off',
    },
  },
];
