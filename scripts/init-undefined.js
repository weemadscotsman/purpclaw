'use strict';
/**
 * scripts/init-undefined.js — Initialize all uninitialized let declarations.
 *
 * Strategy:
 *   1. For each `let x;` (uninitialized), look at the next non-blank, non-comment
 *      line. If it's `x = <expr>;`, combine into `let x = <expr>;` (declaration
 *      and first assignment merged).
 *   2. Otherwise, init to `null` so the variable is never undefined.
 *
 * Run: `node scripts/init-undefined.js`
 *
 * It only touches files under the project's active runtime surface
 * (lib/, bin/, app/, scripts/, top-level runtime .js files). Skips
 * node_modules, .next, backups, tests, and harvest/training dirs.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'skills', 'public', '.claude', 'docs', '.archive', 'agent_work', 'pocket', 'training', 'harvest', 'mochi', '.vscode']);

let totalFixed = 0;
let totalFiles = 0;
let totalSkipped = 0;

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.ui-backup')) continue;
      walk(path.join(dir, entry.name));
    } else if (entry.isFile() && /\.(js|ts|mjs|cjs)$/.test(entry.name)) {
      if (/^(test-|spec-)/.test(entry.name) || /__test/.test(entry.name)) continue;
      processFile(path.join(dir, entry.name));
    }
  }
}

// Additional top-level runtime files
const TOP_LEVEL = ['unified_api.js', 'agent_tower.js', 'companion_swarm.js', 'service_registry.js', 'gatekeeper.js', 'harness_service.js', 'orchestrator.js', 'swarm_coordinator.js', 'swarm_scheduler.js', 'thringlet_bridge.js', 'tmux-worktree-orchestrator.js', 'metrics_aggregator.js', 'smoke_test.js', 'lib/chat-agent.js', 'lib/embeddings.js', 'lib/whoami.js', 'lib/doctor.js', 'lib/deep-audit.js', 'lib/spend-gate.js', 'lib/release-sign.js', 'lib/identity.js', 'lib/tts/gateway.js', 'lib/screen-look.js', 'lib/tools/index.js', 'lib/tools/skills-registry.js'];

function isInScope(absPath) {
  const rel = path.relative(ROOT, absPath).replace(/\\/g, '/');
  if (rel.startsWith('.') || /backup/i.test(rel) || /spaghetti/.test(rel)) return false;
  return true;
}

function isLiteralAssignment(s) {
  // Match `var = literal;` or `var = expr;` — anything safely combinable
  s = s.trim();
  return /^[A-Za-z_$][\w$]*\s*=\s*.+;\s*$/.test(s);
}

function combineDeclarationAndAssignment(declLine, assignLine, varName) {
  const m = assignLine.match(/^\s*([A-Za-z_$][\w$]*)\s*=\s*(.+?);?\s*$/);
  if (!m) return null;
  if (m[1] !== varName) return null;
  const rhs = m[2].replace(/;?\s*$/, '');
  const indent = declLine.match(/^(\s*)/)[1];
  return `${indent}let ${varName} = ${rhs};`;
}

function findNextSignificant(lines, start) {
  for (let j = start; j < Math.min(lines.length, start + 30); j++) {
    const l = lines[j].trim();
    if (!l || l.startsWith('//') || l.startsWith('*') || l.startsWith('/*')) continue;
    return j;
  }
  return -1;
}

function processFile(absPath) {
  if (!isInScope(absPath)) {
    totalSkipped++;
    return;
  }
  let content = null;
  try { content = fs.readFileSync(absPath, 'utf8'); } catch { return; }
  const lines = content.split('\n');
  const out = [];
  let i = 0;
  let fileFixed = 0;
  while (i < lines.length) {
    const line = lines[i];
    // Match: `  let x;` or `  let x,` — single-var uninitialized let
    const m = line.match(/^(\s*)let\s+(\w+)\s*;\s*$/);
    if (m) {
      const indent = m[1];
      const varName = m[2];
      if (['i', 'j', 'k', 'x', 'y', 'n', 'm', 'e'].includes(varName)) {
        out.push(line);
        i++;
        continue;
      }
      // Multi-var: `let a, b, c;` — split and init each
      const mMulti = line.match(/^(\s*)let\s+((?:\w+\s*,\s*)+\w+)\s*;\s*$/);
      if (mMulti) {
        const indent2 = mMulti[1];
        const vars = mMulti[2].split(',').map(s => s.trim());
        out.push(`${indent2}let ${vars.map(v => `${v} = null`).join(', ')};`);
        fileFixed++;
        i++;
        continue;
      }
      // Find next significant line
      const j = findNextSignificant(lines, i + 1);
      if (j >= 0) {
        const nextLine = lines[j];
        const m2 = nextLine.match(/^\s*([A-Za-z_$][\w$]*)\s*=\s*(.+?);?\s*$/);
        if (m2 && m2[1] === varName) {
          // Combine: skip both lines, emit one
          const combined = combineDeclarationAndAssignment(line, nextLine, varName);
          if (combined) {
            out.push(combined);
            i = j + 1;
            fileFixed++;
            continue;
          }
        }
      }
      // Default: init to null
      out.push(`${indent}let ${varName} = null;`);
      fileFixed++;
      i++;
      continue;
    }
    out.push(line);
    i++;
  }
  if (fileFixed > 0) {
    fs.writeFileSync(absPath, out.join('\n'));
    totalFixed += fileFixed;
    totalFiles++;
    process.stdout.write('.');
  }
}

console.log('Scanning active runtime surface for uninitialized let declarations...\n');
walk(ROOT);
for (const rel of TOP_LEVEL) {
  const abs = path.join(ROOT, rel);
  if (fs.existsSync(abs)) processFile(abs);
}
console.log(`\n\nFixed: ${totalFixed} declarations across ${totalFiles} files (skipped: ${totalSkipped}).`);
