import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'dist-web/**',
      'bin/**',
      '.tmp/**',
      // Vendored Neutralino client library. @2026-07-09
      'resources/js/neutralino.js'
    ]
  },
  js.configs.recommended,
  {
    files: ['resources/js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        Neutralino: 'readonly',
        NL_OS: 'readonly',
        NL_PORT: 'readonly',
        NL_TOKEN: 'readonly',
        NL_CVERSION: 'readonly',
        NL_APPVERSION: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-empty': ['error', { allowEmptyCatch: true }]
    }
  },
  {
    files: ['scripts/**/*.mjs', 'eslint.config.mjs', 'tests/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        ...globals.node
      }
    }
  }
];
