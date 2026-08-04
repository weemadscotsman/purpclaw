// eslint.config.js — PURPCLAW minimal lint (ESLint 9)
const js = require('@eslint/js');
const builtin = require('globals').builtin;

const nodeGlobals = {
  console: 'readonly',
  process: 'readonly',
  module: 'readonly',
  require: 'readonly',
  exports: 'readonly',
  __dirname: 'readonly',
  __filename: 'readonly',
  Buffer: 'readonly',
  setTimeout: 'readonly',
  setInterval: 'readonly',
  clearTimeout: 'readonly',
  clearInterval: 'readonly',
  global: 'readonly',
};

module.exports = [
  js.configs.recommended,
  {
    files: ['packages/**/*.js', 'apps/**/*.js', 'services/**/*.js', 'lib/**/*.js', 'bin/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...builtin, ...nodeGlobals },
    },
    rules: {
      'no-unused-vars': 'off',
      'no-undef': 'error',
      'no-redeclare': 'off',
      'no-inner-declarations': 'off',
    },
  },
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      '.next/**',
      'coverage/**',
      'agent_work/**',
      'workspace/**',
    ],
  },
];
