'use strict';
/**
 * The spine must be ON by default.
 *
 * lib/agent-gateway.js resolved `noSpine: params.no_spine !== false`, which
 * meant memory was DISABLED unless a caller explicitly passed
 * `no_spine: false`. Nothing in the repo ever did, so the cognitive spine was
 * never consulted by anything, ever — while five call sites redundantly asked
 * to disable what was already off.
 *
 * This is a source-level contract test rather than a runtime one: the bug was a
 * single comparison operator, and asserting on behaviour would need a live
 * spine on :7880 to distinguish "memory off" from "memory empty" — the exact
 * ambiguity that let this survive.
 *
 *   node tests/contract/spine-default.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = r => fs.readFileSync(path.join(ROOT, r), 'utf8');

// 1. The default: absent flag means spine ON.
const gateway = read('lib/agent-gateway.js');
assert.ok(
  /noSpine:\s*params\.no_spine\s*===\s*true/.test(gateway),
  'lib/agent-gateway.js must resolve noSpine as `params.no_spine === true` so an '
  + 'absent flag leaves the spine ON. `!== false` disables memory for every caller.',
);

// 2. Only genuinely stateless work may opt out. Evaluation and program
//    compilation must be reproducible, so they legitimately keep no_spine.
const ALLOWED_OPT_OUT = new Set(['lib/eval-manager.js', 'lib/program-optimizer.js']);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'var', 'research', 'docs'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(js|cjs|mjs)$/.test(e.name)) out.push(p);
  }
  return out;
}

const offenders = [];
for (const abs of walk(ROOT)) {
  const r = path.relative(ROOT, abs).replace(/\\/g, '/');
  if (ALLOWED_OPT_OUT.has(r) || r === 'tests/contract/spine-default.test.js') continue;
  const text = fs.readFileSync(abs, 'utf8');
  // Only a real property assignment counts; the word in a comment does not.
  if (/(^|[^/*\w])no_spine\s*:\s*true/.test(text)) offenders.push(r);
}

assert.deepStrictEqual(
  offenders, [],
  'These files disable the cognitive spine. Governed agent work must participate in '
  + 'the memory lifecycle; only reproducibility-critical paths (eval, program '
  + 'compilation) may opt out, and they are already allow-listed:\n  '
  + offenders.join('\n  '),
);

console.log('spine-default contract OK — spine on by default, 2 allow-listed stateless opt-outs');
