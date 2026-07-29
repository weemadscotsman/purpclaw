'use strict';
/**
 * lib/commands/repomap.js
 * ─────────────────────────────────────────────────────────────────────────────
 * purpclaw repomap [--no-inject] [--tokens=<n>]
 *
 * PageRank-ranked structural repo map injected into system prompts.
 *
 * Enabled by:
 *   REPO_MAP=1           — auto-inject into every system prompt
 *   REPO_MAP_TOKENS=2048 — token budget (default 2048)
 *   purpclaw repomap     — print the map for inspection
 *
 * Pipeline:
 *   1. Crawl all source files under the project root
 *   2. Build a reference graph (import/require/using statements)
 *   3. Score each file by in-degree (how many files reference it)
 *   4. Group by directory, emit markdown ranked list
 *
 * Usage:
 *   purpclaw repomap                 — print current repo map
 *   purpclaw repomap --tokens=1024  — custom token budget
 *   purpclaw repomap --no-inject     — print but don't save injection flag
 *
 * The REPO_MAP env flag and --repo-map / --no-repo-map CLI flags are parsed
 * in bin/purpclaw.js and lib/agent-loop.js; this command is the inspection UI.
 */

const path      = require('path');
const mapper    = require('../repo-mapper');

const C = {
  reset:  '\x1b[0m',  bold:  '\x1b[1m',  dim:  '\x1b[2m',
  cyan:   '\x1b[36m', green: '\x1b[32m', yellow: '\x1b[33m',
  red:    '\x1b[31m', gray:  '\x1b[90m',
};
const col = (c, s) => process.stdout.isTTY ? `${c}${s}${C.reset}` : s;

function run(args, rawCtx) {
  const noInject = args.includes('--no-inject');
  const tokensArg = args.find(a => a.match(/^--tokens=(\d+)$/));
  const maxTokens = tokensArg ? parseInt(tokensArg.split('=')[1], 10) : 2048;

  // Determine project root
  const PURP_DIR = (rawCtx && rawCtx.PURP_DIR)
    || process.env.PURP_DIR
    || path.resolve(__dirname, '../..');

  const map = mapper.runMap({ root: PURP_DIR, maxTokens });

  console.log('');
  console.log(col(C.bold, '  REPO MAP'));
  console.log('');
  console.log(col(C.gray, `  Root: ${PURP_DIR}`));
  console.log(col(C.gray, `  Tokens: ~${mapper.estTokens(map)} (budget: ${maxTokens})`));
  console.log('');
  console.log(map);
  console.log('');

  if (!noInject) {
    console.log(col(C.gray, `  Auto-inject: ${process.env.REPO_MAP === '1' ? col(C.green, 'ON') : col(C.yellow, 'OFF (set REPO_MAP=1 to enable)')}`));
    console.log('');
  }

  return 0;
}

module.exports = { run };
