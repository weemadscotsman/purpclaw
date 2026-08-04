'use strict';
/**
 * Next.js config for the PURPCLAW web surface (app/ at the repo root).
 *
 * There was no config file at all, so output file tracing had no pinned root
 * and walked upward looking for a workspace boundary. On Windows that reaches
 * `C:\Users\Admin\Application Data` — a legacy junction that loops back on
 * itself — and the build died with
 * `EPERM: operation not permitted, scandir`. Pinning the tracing root to this
 * directory keeps the trace inside the project.
 */

const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Stop the upward workspace search at the project. Without this, Next infers
  // a root from lockfiles and node_modules layout and can select a parent of
  // the user profile.
  outputFileTracingRoot: __dirname,

  outputFileTracingExcludes: {
    '*': [
      'node_modules/**',
      'var/**',
      'docs/**',
      'research/**',
      'agent_work/**',
      '.purpclaw/**',
      'apps/desktop/**',
    ],
    // Prevent Next.js from walking outside the project on Windows.
    // WindowsApps is a protected alias directory that always returns EACCES.
    // Without this pattern, the webpack cache warm-up scan walks C:/Users/Admin
    // and hits it on every glob operation.
    'C:/Users/Admin/AppData/Local/Microsoft/WindowsApps/**': [],
  },

  eslint: {
    // The repo lints through its own gates (npm run docs:gate, eslint.config.js).
    // Letting next build run a second, differently-configured lint pass turns
    // style findings into build failures.
    ignoreDuringBuilds: true,
  },

  // The Node runtime pieces (agent gateway, sqlite session store, tool runtime)
  // are required by API routes and must not be bundled by webpack.
  serverExternalPackages: ['blessed', 'blessed-contrib', 'node:sqlite', 'better-sqlite3'],

  webpack(config) {
    // Belt and braces: keep webpack's own resolution inside the project too.
    config.resolve = config.resolve || {};
    config.resolve.symlinks = false;
    config.watchOptions = {
      ...(config.watchOptions || {}),
      ignored: [
        '**/node_modules/**',
        '**/var/**',
        '**/.git/**',
        // WindowsApps is a protected alias directory — glob operations fail with
        // EACCES and kill the webpack cache warm-up on every build.
        'C:/Users/Admin/AppData/Local/Microsoft/WindowsApps/**',
      ],
    };
    return config;
  },
};

module.exports = nextConfig;
