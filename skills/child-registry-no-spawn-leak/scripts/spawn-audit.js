#!/usr/bin/env node
/**
 * spawn-audit.js — Scan a PURPCLAW codebase for dangerous spawn patterns.
 * Usage: node spawn-audit.js [project_dir]
 *
 * Checks for:
 *   - detached: true (outside child-registry.js)
 *   - shell: true (outside child-registry.js, except documented escape hatches)
 *   - cmd /c start, cmd /k, start /min patterns
 *   - require('child_process').exec() calls (outside child-registry.js)
 *
 * Exit 0 = clean, 1 = violations found.
 */

const { execSync } = require('child_process');
const path = require('path');

const ROOT = process.argv[2] || '.';
const IGNORE_DIRS = ['node_modules', '.git', 'docs/legacy', '__pycache__'];

function grep(pattern, fileGlob) {
  try {
    const glob = fileGlob || '*.js';
    const cmd = `grep -rn "${pattern}" --include='${glob}' lib/ bin/ ./*.js ${ROOT} 2>/dev/null`;
    const out = execSync(cmd, { encoding: 'utf8', cwd: ROOT, timeout: 10000 });
    return out.split('\n').filter(line => {
      if (!line.trim()) return false;
      for (const dir of IGNORE_DIRS) {
        if (line.includes(dir)) return false;
      }
      if (line.includes('child-registry')) return false;
      if (line.trim().startsWith('//') || line.includes('// NEVER')) return false;
      return true;
    });
  } catch (e) {
    if (e.status === 1) return []; // grep found nothing
    throw e;
  }
}

let violations = 0;

console.log('🔍 PURPCLAW Spawn Safety Audit');
console.log('='.repeat(50));

// Check 1: detached: true
const detached = grep('detached:\\\\s*true');
if (detached.length > 0) {
  console.log('\n❌ detached: true found:');
  detached.forEach(l => console.log(`   ${l.trim()}`));
  violations++;
} else {
  console.log('✅ Zero detached: true');
}

// Check 2: shell: true
const shell = grep('shell:\\\\s*true');
if (shell.length > 0) {
  console.log('\n❌ shell: true found:');
  shell.forEach(l => console.log(`   ${l.trim()}`));
  violations++;
} else {
  console.log('✅ Zero shell: true');
}

// Check 3: cmd /c start, cmd /k, start /min
const cmdStart = grep('cmd.*\\\\\\\\/c.*start|cmd.*\\\\\\\\/k|start \\\\\\\\/min');
if (cmdStart.length > 0) {
  console.log('\n❌ cmd /c start or cmd /k patterns found:');
  cmdStart.forEach(l => console.log(`   ${l.trim()}`));
  violations++;
} else {
  console.log('✅ Zero cmd /c start or cmd /k');
}

// Check 4: require('child_process').exec() outside child-registry
const rawExec = grep("require\\\\('child_process'\\\\)\\\\.exec");
if (rawExec.length > 0) {
  console.log('\n❌ require(child_process).exec() found:');
  rawExec.forEach(l => console.log(`   ${l.trim()}`));
  violations++;
} else {
  console.log('✅ Zero raw exec() calls');
}

// Check 5: Syntax validation
console.log('\n--- Syntax check ---');
const files = [
  'bin/purpclaw.js', 'boot.js', 'agent_tower.js',
  'voice_bridge_7792.js', 'screen-manager.js', 'spinUpAgent.js',
  'voice_coordinator.js', 'start_purpclaw.js', 'purpclaw.js'
];
files.forEach(f => {
  try {
    execSync(`node -c "${path.join(ROOT, f)}"`, { timeout: 5000 });
    console.log(`✅ ${f}`);
  } catch (e) {
    console.log(`❌ ${f} FAILED: ${e.message}`);
    violations++;
  }
});

console.log('\n' + '='.repeat(50));
if (violations === 0) {
  console.log('✅ ALL CLEAN — no spawn leaks detected');
  process.exit(0);
} else {
  console.log(`❌ ${violations} violation categories found`);
  process.exit(1);
}
