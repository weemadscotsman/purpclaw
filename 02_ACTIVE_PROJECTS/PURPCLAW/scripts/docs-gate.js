'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PKG_VERSION = require(path.join(ROOT, 'package.json')).version;
const TODAY = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

// â”€â”€ 1. Read package.json version â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const EXPECTED_VERSION = PKG_VERSION; // e.g. '1.2.0'

// â”€â”€ 2. Canonical docs that must exist and must claim the current version â”€â”€â”€â”€â”€
const CANON_DOCS = [
  'README.md',
  'PRODUCT.md',
  'ARCHITECTURE.md',
  'STATUS.md',
  'AGENT.md',
  'LAUNCH.md',
  'MEMORY.md',
  'docs/INDEX.md',
  'docs/INSTALL.md',
  'docs/FIRST_RUN.md',
  'docs/CANONICAL_MAP.md',
  'docs/WHERE_THINGS_GO.md',
  'docs/ROUTING_AND_BUILD_SPEC.md',
  'docs/current/CANONICAL_OVERVIEW.md',
  'docs/current/INTELLIGENCE_SPINE.md',
  'docs/current/SYSTEM_OVERVIEW.md',
  'docs/current/token-optimization.md',
  'docs/current/RECOVERY.md',
  'docs/current/TROUBLESHOOTING.md',
  'docs/current/README.md',
];

// â”€â”€ 3. Forbidden stale strings (any version < current) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const STALE_VERSION_RE = /(?:version|release|v|release notes?)[\s:]*(?:0\.\d+\.\d+|0\.\d+)/i;
const STALE_DATE_CUTOFF = '2026-07-10'; // docs updated after this date are fresh

// â”€â”€ 4. Stale product labels â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const WRONG_PRODUCT_LABEL_RE = /AI\s+(?:organisation\s+)?runtime/gi;

// â”€â”€ 5. Parity README â€” verify every listed file actually exists â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const PARITY_README = path.join(ROOT, 'docs/parity/README.md');
const PARITY_DIR = path.join(ROOT, 'docs/parity');

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function fail(msg) {
  console.error(`FAIL: ${msg}`);
}

function warn(msg) {
  console.warn(`WARN: ${msg}`);
}

function read(rel) {
  try {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8');
  } catch {
    return null;
  }
}

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

// Extract "Last updated: YYYY-MM-DD" or "Last verified: YYYY-MM-DD" from content
function extractDate(content) {
  const m = content.match(/Last (?:updated|verified|stamped)[\s:]*(\d{4}-\d{2}-\d{2})/i);
  return m ? m[1] : null;
}

// Extract version-like strings from content
function extractVersions(content) {
  const results = [];
  // Match `X.Y.Z` or `vX.Y.Z` in backtick or plain
  const matches = content.match(/[`'"]?v?(\d+\.\d+(?:\.\d+)?)[`'"]?/g) || [];
  for (const m of matches) {
    const v = m.replace(/^[`'"]?v/, '').replace(/[`'"]/g, '');
    if (/^\d+\.\d+/.test(v)) results.push(v);
  }
  return results;
}

// â”€â”€ Gate checks â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const errors = [];
const warnings = [];

// â”€â”€ GATE 1: Version alignment â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Every canonical doc must not claim a version that contradicts package.json

for (const rel of CANON_DOCS) {
  if (!exists(rel)) {
    errors.push(`canonical doc missing: ${rel}`);
    continue;
  }
  const content = read(rel);
  if (!content) continue;

  // Check for wrong product label
  const wrongLabels = content.match(WRONG_PRODUCT_LABEL_RE) || [];
  for (const label of wrongLabels) {
    errors.push(`${rel}: contains wrong product label '${label}' (expected 'AI workstation OS')`);
  }

  // Check for stale version strings (0.9.x, 0.x.x older than current)
  const stalePattern = /(?:^|[^.\d])0\.\d+\.\d+(?![.\d])/g;
  let match;
  const contentSlice = content.slice(0, 2000); // check header only
  while ((match = stalePattern.exec(contentSlice)) !== null) {
    const v = match[0];
    if (v !== EXPECTED_VERSION) {
      errors.push(`${rel}: contains stale version reference '${v}' (expected '${EXPECTED_VERSION}')`);
    }
  }

  // Check Last updated date
  const date = extractDate(content);
  if (date && date < STALE_DATE_CUTOFF) {
    errors.push(`${rel}: doc dated '${date}' is stale (cutoff: ${STALE_DATE_CUTOFF})`);
  }
}

// â”€â”€ GATE 2: Security policy version â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// SECURITY.md must reference current version line, not old 0.9.x

const sec = read('SECURITY.md');
if (sec) {
  if (/0\.9\.x/.test(sec)) {
    errors.push('SECURITY.md: references old 0.9.x line â€” should be 1.x');
  }
}

// â”€â”€ GATE 3: CHANGELOG must start with current version â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const changelog = read('CHANGELOG.md');
if (changelog) {
  const firstVersion = changelog.match(/^##\s+(?:Version\s+)?(\d+\.\d+\.\d+)/m);
  if (firstVersion && firstVersion[1] !== EXPECTED_VERSION) {
    errors.push(`CHANGELOG.md: top entry is ${firstVersion[1]}, package.json is ${EXPECTED_VERSION}`);
  }
  if (!changelog.includes(EXPECTED_VERSION)) {
    errors.push(`CHANGELOG.md: does not mention current version ${EXPECTED_VERSION}`);
  }
} else {
  errors.push('CHANGELOG.md: missing');
}

// â”€â”€ GATE 4: Parity README file-path integrity â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Every file path in docs/parity/README.md must exist.
// Paths are relative to docs/parity/ (where the README lives).

if (exists('docs/parity/README.md')) {
  const pread = read('docs/parity/README.md');
  // Match relative paths like STEERING_VNEXT_SPEC.md, research/codex/ARCHITECTURE.md
// Strip code blocks (```...``` and `...`) before extracting paths
  const stripped = pread
    .replace(/```[\s\S]*?```/g, ' ')   // fenced code blocks
    .replace(/`[^`]+`/g, ' ');          // inline code
  const pathMatches = Array.from(stripped.matchAll(/(?:^|[(\s\n])([a-zA-Z0-9_/.-]+\.(?:md|js|json))(?=[)\s\n]|$)/gm));
  const seen = new Set();
  for (const match of pathMatches) {
  // Use the captured path only; the full regex match may include a leading
  // whitespace or '(' from Markdown links.
  const rel = (match[1] || '').trim();
  const firstChar = rel[0];
  if (firstChar === '#') continue;
    if (!rel || seen.has(rel)) continue;
    seen.add(rel);

    // skip gitkeep, URLs, absolute paths, and paths that don't belong to parity tree
    if (rel === 'gitkeep' || rel.startsWith('http') || rel.startsWith('/')) continue;
    // Skip paths that live outside docs/parity/ (resolve from ROOT, not from parity dir)
    if (rel.startsWith('public/') || rel.startsWith('scripts/')) continue;

    // Resolve relative to docs/parity/ (where the README lives)
    let full = path.join(ROOT, 'docs/parity', rel);
    // If bare filename (no /), also check subdirectories
    if (!fs.existsSync(full) && !rel.includes('/')) {
      const dirs = ['research/codex', 'research/claude', 'research/hermes', 'research/openclaw', 'specifications'];
      for (const d of dirs) {
        const candidate = path.join(ROOT, 'docs/parity', d, rel);
        if (fs.existsSync(candidate)) { full = candidate; break; }
      }
    }
    if (!fs.existsSync(full)) {
      errors.push(`parity README references missing file: ${rel}`);
    }
  }

  // Verify no ghost directories are listed as "in progress"
  const inProgressDirs = ['research/claude', 'research/hermes', 'research/openclaw'];
  for (const dir of inProgressDirs) {
    const full = path.join(ROOT, 'docs/parity', dir);
    if (!fs.existsSync(full)) {
      errors.push(`parity README lists non-existent research dir: ${dir}`);
    }
  }
} else {
  warnings.push('docs/parity/README.md: missing â€” parity structure unverified');
}

// â”€â”€ GATE 5: truth-manifest.json must exist and have current counts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const manifest = read('public/showcase/truth-manifest.json');
if (!manifest) {
  errors.push('truth-manifest.json: missing (run npm run truth)');
} else {
  try {
    const m = JSON.parse(manifest);
    const checks = [
      ['agents.live_unique', m.agents?.live_unique],
      ['agents.strict_live', m.agents?.strict_live],
      ['tools.total_mapped', m.tools?.total_mapped],
      ['providers.adapter_count', m.providers?.adapter_count],
    ];
    for (const [key, val] of checks) {
      if (typeof val !== 'number' || val === 0) {
        errors.push(`truth-manifest.json: ${key} is ${val} (unexpected)`);
      }
    }
  } catch (e) {
    errors.push(`truth-manifest.json: parse error â€” ${e.message}`);
  }
}

// â”€â”€ GATE 6: validate-docs.js output is clean â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Run it and capture output â€” any exit != 0 is a failure

let validateOk = true;
try {
  const { execFileSync } = require('child_process');
  const out = execFileSync(process.execPath, ['scripts/validate-docs.js'], {
    cwd: ROOT,
    timeout: 30_000,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  process.stdout.write(out);
} catch (e) {
  if (e.stdout) process.stdout.write(e.stdout);
  if (e.stderr) process.stderr.write(e.stderr);
  validateOk = false;
  errors.push(`validate-docs.js exited with code ${e.status}`);
}

// GATE 7: parity authority - one canonical roadmap, every other parity doc points at it
try {
  const { execFileSync } = require('child_process');
  const out = execFileSync(process.execPath, ['scripts/parity-authority-check.js'], {
    cwd: ROOT,
    timeout: 60_000,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  process.stdout.write(out);
} catch (e) {
  if (e.stdout) process.stdout.write(e.stdout);
  if (e.stderr) process.stderr.write(e.stderr);
  errors.push(`parity-authority-check.js exited with code ${e.status}`);
}


// GATE 8: PARITY docs — self-contradictions, broken links, stale counts
// Find all parity docs: filenames containing 'parity' (case-insensitive),
// excluding agent_work/, vendor/, worktree, GOTHAM_3077/
function findParityDocs(dir) {
  const results = [];
  const skip = ['agent_work', 'vendor', 'worktree', 'GOTHAM_3077'];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!skip.some(s => entry.name.includes(s))) {
          results.push(...findParityDocs(path.join(dir, entry.name)));
        }
      } else if (entry.isFile() && entry.name.toLowerCase().includes('parity')) {
        const full = path.join(dir, entry.name);
        if (/\.(md|json)$/.test(full)) results.push(full);
      }
    }
  } catch {}
  return results;
}

const parityDocs = findParityDocs(ROOT);
for (const docPath of parityDocs) {
  const content = read(path.relative(ROOT, docPath)) || '';
  const docName = path.relative(ROOT, docPath);

  // Superseded docs are frozen historical evidence — their contradictions and
  // stale counts are the point. Only the canonical roadmap is held to account.
  if (/\*\*SUPERSEDED:\*\*|"_superseded"/.test(content)) continue;

  // 1. Self-contradiction check: same feature keyword marked both done and not-done
  const doneMap = {};
  const undoneMap = {};
  const lines = content.split('\n');
  for (const line of lines) {
    if (line.trim().startsWith('#') || line.trim() === '|' || line.trim().startsWith('|---')) continue;
    const featureMatches = [...line.matchAll(/[`*_]([a-z][a-z0-9_-]*)[`*_]/gi)];
    const hasDone = /\u2705|done|complete|implemented|built/i.test(line) && !/not done|not implemented|stub|missing|partial/i.test(line);
    const hasUndone = /\u274c|\u2b55|\u1f7e1|stub|missing|not implemented|partial|broken|outstanding/i.test(line);
    for (const m of featureMatches) {
      const kw = m[1].toLowerCase();
      if (hasDone) doneMap[kw] = (doneMap[kw] || 0) + 1;
      if (hasUndone) undoneMap[kw] = (undoneMap[kw] || 0) + 1;
    }
  }
  for (const kw of Object.keys(doneMap)) {
    if (undoneMap[kw] > 0) {
      errors.push(`${docName}: self-contradiction \u2014 '${kw}' marked both done and not-done`);
    }
  }

  // 2. Broken relative markdown links: [text](path.md) where path doesn't exist
  const linkMatches = content.match(/\[([^\]]+)\]\(([^)]+)\)/g) || [];
  for (const link of linkMatches) {
    const urlMatch = link.match(/\]\(([^)]+)\)/);
    if (!urlMatch) continue;
    const url = urlMatch[1];
    if (url.startsWith('http') || url.startsWith('/') || url.includes('://')) continue;
    if (!/\.(md|json)$/.test(url)) continue;
    const docDir = path.dirname(docPath);
    const resolved = path.resolve(docDir, url);
    if (!fs.existsSync(resolved)) {
      errors.push(`${docName}: broken link \u2192 ${url} (file not found)`);
    }
  }

  // 3. Hardcoded counts without live-query caveat
  const hardcodedClaims = content.match(/\d+\s*[/\s]+\d+\s*(?:complete|done|passing|cmds?|commands?|features?|gaps?)/gi) || [];
  for (const claim of hardcodedClaims) {
    if (!/truth-manifest|live_unique|strict_live|total_mapped|adapter_count/.test(content)) {
      const idx = content.indexOf(claim);
      const nearby = content.substring(idx, idx + 500);
      if (!/live|query|truth|actual|current/.test(nearby)) {
        warnings.push(`${docName}: hardcoded claim '${claim}' \u2014 verify against live query (truth-manifest.json)`);
      }
    }
  }
}

// â”€â”€ Report â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

console.log('');
console.log('=== DOC GATE ===');
console.log(`Version: ${EXPECTED_VERSION}  Gate date: ${TODAY}`);
console.log(`Stale date cutoff: ${STALE_DATE_CUTOFF}`);
console.log('');

if (warnings.length) {
  console.log('WARNINGS:');
  warnings.forEach(w => console.log('  ' + w));
  console.log('');
}

if (errors.length) {
  console.error(`ERRORS (${errors.length}):`);
  errors.forEach(e => console.error('  ' + e));
  console.log('');
  console.error('DOC GATE FAILED');
  process.exit(1);
} else {
  console.log('DOC GATE PASSED');
  process.exit(0);
}



