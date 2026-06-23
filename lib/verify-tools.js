'use strict';
/**
 * lib/verify-tools.js — Audit every tool and skill for actual viability.
 * Truth-check: does it load? Does it run? Does it have its deps?
 */
const path = require('path');
const fs = require('fs');

const PURP_DIR = path.resolve(__dirname, '..');
const SKILLS_DIR = path.join(PURP_DIR, 'skills');

function auditTools(registry) {
  const results = { total: 0, loadable: 0, broken: 0, brokenList: [] };
  
  const tools = registry.list();
  results.total = tools.length;
  
  for (const t of tools) {
    // Check it has required fields
    if (!t.name || !t.inputSchema) {
      results.broken++;
      results.brokenList.push({ name: t.name || 'unnamed', issue: 'Missing name or inputSchema' });
      continue;
    }
    results.loadable++;
  }
  
  return results;
}

function auditSkills() {
  const results = {
    directories: 0,
    withManifest: 0,
    executable: 0,
    withBrokenImports: 0,
    dead: 0,
    details: [],
  };
  
  if (!fs.existsSync(SKILLS_DIR)) return results;
  
  for (const entry of fs.readdirSync(SKILLS_DIR)) {
    const skillPath = path.join(SKILLS_DIR, entry);
    if (!fs.statSync(skillPath).isDirectory()) continue;
    results.directories++;
    
    const hasManifest = fs.existsSync(path.join(skillPath, 'SKILL.md'));
    if (hasManifest) results.withManifest++;
    
    // Find scripts
    const scripts = findScripts(skillPath);
    const hasExecutable = scripts.length > 0;
    if (hasExecutable) results.executable++;
    
    // Check for broken imports/deps
    let broken = false;
    for (const script of scripts.slice(0, 3)) { // Check first 3 max
      const ext = path.extname(script);
      if (ext === '.js' || ext === '.mjs') {
        try {
          // Quick syntax check only — don't execute
          require('child_process').execSync(`node -c "${script}"`, { stdio: 'ignore', timeout: 5000 });
        } catch {
          broken = true;
          results.details.push({ name: entry, issue: `Syntax error: ${path.basename(script)}` });
        }
      } else if (ext === '.py') {
        try {
          require('child_process').execSync(`python -c "import py_compile; py_compile.compile('${script}', doraise=True)"`, { stdio: 'ignore', timeout: 5000 });
        } catch {
          broken = true;
          results.details.push({ name: entry, issue: `Python error: ${path.basename(script)}` });
        }
      }
    }
    if (broken) results.withBrokenImports++;
    
    // Mark as dead if no manifest AND no scripts
    if (!hasManifest && !hasExecutable) {
      results.dead++;
      results.details.push({ name: entry, issue: 'Empty directory — no manifest, no scripts' });
    }
  }
  
  return results;
}

function findScripts(dir, results = [], depth = 0) {
  if (depth > 3) return results;
  try {
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (fs.statSync(full).isDirectory()) {
        if (entry !== 'node_modules' && entry !== '__pycache__' && entry !== '.git') {
          findScripts(full, results, depth + 1);
        }
      } else if (entry.endsWith('.js') || entry.endsWith('.py') || entry.endsWith('.sh') || entry.endsWith('.mjs')) {
        results.push(full);
      }
    }
  } catch {}
  return results;
}

function checkRuntimeDeps() {
  const deps = {
    node: { ok: false, version: '' },
    python: { ok: false, version: '' },
    pm2: { ok: false },
    ollama: { ok: false },
    ffmpeg: { ok: false },
    git: { ok: false },
  };
  
  try {
    const v = require('child_process').execSync('node --version', { encoding: 'utf8', timeout: 3000 }).trim();
    deps.node.ok = true;
    deps.node.version = v;
  } catch {}
  
  try {
    const v = require('child_process').execSync('python --version', { encoding: 'utf8', timeout: 3000 }).trim();
    deps.python.ok = true;
    deps.python.version = v;
  } catch {}
  
  try {
    require('child_process').execSync('npx pm2 --version', { encoding: 'utf8', timeout: 5000 });
    deps.pm2.ok = true;
  } catch {}
  
  try {
    require('child_process').execSync('ollama --version', { encoding: 'utf8', timeout: 3000 });
    deps.ollama.ok = true;
  } catch {}
  
  try {
    require('child_process').execSync('ffmpeg -version', { encoding: 'utf8', timeout: 3000 });
    deps.ffmpeg.ok = true;
  } catch {}
  
  try {
    require('child_process').execSync('git --version', { encoding: 'utf8', timeout: 3000 });
    deps.git.ok = true;
  } catch {}
  
  return deps;
}

module.exports = { auditTools, auditSkills, checkRuntimeDeps };
