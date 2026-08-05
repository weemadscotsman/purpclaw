#!/usr/bin/env node
'use strict';
/**
 * PURPCLAW state lives in the project, never in the user profile.
 *
 *   node tools/migrations/confine-state-to-project.js           dry run
 *   node tools/migrations/confine-state-to-project.js --apply
 *
 * The runtime kept two state directories: sessions in
 * <project>/.purpclaw (via lib/paths.js DATA_ROOT), and everything else in
 * C:\Users\<user>\.purpclaw via os.homedir(). Settings written by one were
 * invisible to the other — the P0-C provider-config split was one symptom.
 *
 * It also broke the production web build. @vercel/nft statically resolves those
 * homedir literals as build-time assets, walks the user profile, and dies on
 * `C:\Users\Admin\Application Data`, a legacy junction that loops:
 *     EPERM: operation not permitted, scandir
 *
 * lib/paths.js already resolves the correct root. This rewrites the escapes to
 * use it.
 *
 * NOT every homedir() call is a bug. These stay:
 *   - user-chosen export/backup destinations (pocket, identity)
 *   - third-party tool config locations that the tool itself owns (ponytail)
 *   - tilde expansion and safety guards that compare a path against the home dir
 * Only PURPCLAW's own state directory is relocated.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const APPLY = process.argv.includes('--apply');
const rel = p => path.relative(ROOT, p).replace(/\\/g, '/');

const SCAN_DIRS = ['lib', 'bin', 'services', 'packages', 'app', 'apps'];
const SKIP = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'var', 'research']);

// Files whose homedir() use is legitimate and must not be rewritten.
const KEEP = [
  /^lib\/commands\/ponytail\.js$/,      // third-party plugin owns its config dir
  /^lib\/commands\/pocket\.js$/,        // user-chosen backup destination
  /^lib\/commands\/identity\.js$/,      // user-chosen export destination
  /^lib\/commands\/permissions\.js$/,   // compares paths against home for safety
  /^lib\/desktop-launcher\.js$/,        // genuinely needs the OS home
  /^lib\/marketplace\.js$/,             // resolves the user's own profile dir
  /^tools\//,
  // ESM. Injecting a CommonJS require() here would break the module outright,
  // and rewriting import graphs is not something a regex should attempt.
  // These two are edited by hand.
  /^lib\/checkpoint-manager\.mjs$/,
  /^app\/api\/companion-chorus\/roster\/route\.ts$/,
];

// Only PURPCLAW's own state dir. Captures the trailing parts so
// path.join(os.homedir(), '.purpclaw', 'pocket') keeps 'pocket'.
const PATTERNS = [
  {
    // path.join(os.homedir(), '.purpclaw', ...rest)
    re: /path\.join\(\s*(?:os\.homedir\(\)|require\(['"]os['"]\)\.homedir\(\))\s*,\s*['"]\.purpclaw['"]\s*(,[^)]*)?\)/g,
    replace: (_m, rest) => `path.join(PURP_PATHS.DATA_ROOT${rest || ''})`,
  },
  {
    // path.join(os.homedir(), '.companion-chorus', ...rest)
    re: /path\.join\(\s*(?:os\.homedir\(\)|require\(['"]os['"]\)\.homedir\(\))\s*,\s*['"]\.companion-chorus['"]\s*(,[^)]*)?\)/g,
    replace: (_m, rest) => `path.join(PURP_PATHS.PROJECT_ROOT, '.companion-chorus'${rest || ''})`,
  },
];

function walk(dir, out = []) {
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(js|cjs|mjs|ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

const files = [];
for (const d of SCAN_DIRS) walk(path.join(ROOT, d), files);
for (const e of fs.readdirSync(ROOT, { withFileTypes: true })) {
  if (e.isFile() && /\.(js|cjs|mjs)$/.test(e.name)) files.push(path.join(ROOT, e.name));
}

const changed = [];
const skipped = [];

for (const f of files) {
  const r = rel(f);
  if (KEEP.some(re => re.test(r))) {
    let t = '';
    try { t = fs.readFileSync(f, 'utf8'); } catch { continue; }
    if (/homedir\(\)/.test(t)) skipped.push(r);
    continue;
  }
  let text;
  try { text = fs.readFileSync(f, 'utf8'); } catch { continue; }
  const before = text;
  let hits = 0;
  for (const { re, replace } of PATTERNS) {
    text = text.replace(re, (...a) => { hits++; return replace(...a); });
  }
  if (!hits) continue;

  // Add the require if the rewrite introduced PURP_PATHS.
  if (!/require\([^)]*['"][^'"]*paths['"]\)/.test(text) && !/PURP_PATHS\s*=/.test(text)) {
    // Specifier is relative to the file, from anywhere in the tree — not just
    // lib/. The first cut special-cased lib/ and emitted './lib/paths' for
    // everything else, which is wrong from bin/ (needs '../lib/paths').
    const fromDir = path.dirname(path.join(ROOT, r));
    let spec = path.relative(fromDir, path.join(ROOT, 'lib', 'paths')).replace(/\\/g, '/');
    if (!spec.startsWith('.')) spec = './' + spec;

    const line = `const PURP_PATHS = require('${spec}');\n`;
    // A shebang must stay on line 1, so insert after it — and after 'use
    // strict' when present, so the directive keeps its prologue position.
    const shebang = /^#![^\n]*\n/.exec(text);
    const offset = shebang ? shebang[0].length : 0;
    const rest = text.slice(offset);
    const useStrict = /^(['"])use strict\1;?\s*\n/.exec(rest);
    const insertAt = offset + (useStrict ? useStrict[0].length : 0);
    text = text.slice(0, insertAt) + line + text.slice(insertAt);
  }
  if (text !== before) changed.push({ file: f, r, hits });
  if (APPLY && text !== before) fs.writeFileSync(f, text);
}

console.log(`mode: ${APPLY ? 'APPLY' : 'DRY RUN (pass --apply)'}\n`);
console.log(`rewriting ${changed.length} file(s):`);
for (const c of changed) console.log(`  ${String(c.hits).padStart(2)}x  ${c.r}`);
console.log(`\nleft alone (legitimate home use): ${skipped.length}`);
for (const s of skipped) console.log(`      ${s}`);
