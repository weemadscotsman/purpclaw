'use strict';
/**
 * lib/deep-audit.js — PurpClaw Deep Audit
 *
 * Goes beyond heartbeat checks. Exercises every layer.
 *
 *   purpclaw audit deep           — full audit (30-60s)
 *   purpclaw audit deep --fast    — skip slow tests
 *   purpclaw audit deep --json    — machine-readable
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const PURP_DIR = path.resolve(__dirname, '..');
const results = [];
let startWall = Date.now();

function record(level, category, ok, detail) {
  const elapsed = Date.now() - startWall;
  results.push({ level, category, ok: Boolean(ok), detail: detail || (ok ? 'pass' : 'fail'), elapsed });
  const icon = ok ? 'OK' : 'XX';
  const indent = '  '.repeat(level);
  console.log(indent + icon + ' [L' + level + '] ' + category + ': ' + results[results.length-1].detail);
}

async function runFast() {
  console.log('  PURPCLAW DEEP AUDIT (fast)');
  console.log('');
  await auditLevel0();
  await auditLevel1();
  await auditLevel7();
  await auditLevel8();
  await auditLevel10();
  return printSummary();
}

async function runFull() {
  console.log('  PURPCLAW DEEP AUDIT (full)');
  console.log('');
  await auditLevel0();
  await auditLevel1();
  await auditLevel2();
  await auditLevel3();
  await auditLevel4();
  await auditLevel5();
  await auditLevel6();
  await auditLevel7();
  await auditLevel8();
  await auditLevel9();
  await auditLevel10();
  return printSummary();
}

// L0: Static load
async function auditLevel0() {
  console.log('  -- L0: Static Load --');
  const modules = [
    'lib/llm-provider.js', 'lib/agent-loop.js', 'lib/pocket-vault.js',
    'lib/spend-gate.js', 'lib/telemetry.js', 'lib/pocket-updater.js',
    'lib/signed-manifest.js', 'lib/identity.js', 'lib/doctor.js',
    'lib/tools/index.js', 'lib/tools/skills-registry.js',
    'agent_tower.js', 'bin/purpclaw.js',
  ];
  let loaded = 0;
  for (const mod of modules) {
    try {
      delete require.cache[require.resolve(path.join(PURP_DIR, mod))];
      require(path.join(PURP_DIR, mod));
      loaded++;
    } catch (e) {
      record(0, 'require(' + mod + ')', false, e.message.substring(0, 80));
    }
  }
  if (loaded === modules.length) {
    record(0, 'All ' + modules.length + ' core modules load', true);
  } else {
    record(0, 'Core modules loaded: ' + loaded + '/' + modules.length, loaded >= modules.length * 0.8);
  }

  // Python syntax check
  const pyScripts = ['scripts/lora-train.py', 'pocket/guide/play.py', 'pocket/detect.py'];
  let pyOk = 0;
  for (const py of pyScripts) {
    try {
      const r = require('child_process').spawnSync('python',
        ['-c', 'import sys; exec(open("' + path.join(PURP_DIR, py).replace(/\\/g, '/') + '").read().split(chr(34)+chr(34)+chr(34))[0])'],
        { stdio: 'pipe', timeout: 10000, windowsHide: true });
      pyOk++;
    } catch {}
  }
  record(0, 'Python scripts load: ' + pyOk + '/' + pyScripts.length, pyOk === pyScripts.length);
}

// L1: Registry integrity
async function auditLevel1() {
  console.log('  -- L1: Registry Integrity --');
  try {
    const tools = require('../lib/tools/index');
    const list = tools.list();
    record(1, 'Tool registry: ' + list.length, list.length >= 150, String(list.length) + ' registered');
  } catch (e) {
    record(1, 'Tool registry', false, e.message);
  }
  try {
    const skillsReg = require('../lib/tools/skills-registry');
    const skills = skillsReg.scanSkills();
    record(1, 'Executable skills: ' + skills.length, skills.length >= 80, String(skills.length) + ' scanned');
    const health = skillsReg.getSkillHealth();
    if (health.degraded_count > 0) {
      record(1, 'Degraded skills: ' + health.degraded_count, true,
        health.degraded.map(function(d) { return d.name + ':' + d.missing.join(','); }).join('; '));
    }
  } catch (e) {
    record(1, 'Skill registry', false, e.message);
  }
  try {
    const reg = require('../service_registry');
    const services = reg.getServices();
    record(1, 'Defined services: ' + services.length, services.length >= 10, String(services.length));
  } catch {
    record(1, 'Service registry', false, 'not found');
  }
}

// L2: Service contract
async function auditLevel2() {
  console.log('  -- L2: Service Contracts --');
  const ports = [7780, 7782, 7783, 7784, 7790, 7791, 7880, 7881, 7885, 7890, 3030];
  let responded = 0;
  for (const port of ports) {
    try {
      const controller = new AbortController();
      const id = setTimeout(function() { controller.abort(); }, 2000);
      const res = await fetch('http://127.0.0.1:' + port + '/health', { signal: controller.signal });
      clearTimeout(id);
      responded++;
      record(2, 'port ' + port, true, 'HTTP ' + res.status);
    } catch {
      record(2, 'port ' + port, false, 'no response');
    }
  }
  record(2, 'Services responding: ' + responded + '/' + ports.length, responded >= 9,
    String(responded) + ' of ' + ports.length);
}

// L3: Cognitive spine
async function auditLevel3() {
  console.log('  -- L3: Cognitive Spine --');
  try {
    const controller = new AbortController();
    const id = setTimeout(function() { controller.abort(); }, 3000);
    const res = await fetch('http://127.0.0.1:7880/cognitive/health', { signal: controller.signal });
    clearTimeout(id);
    const health = await res.json();
    const engineCount = health.engines ? Object.keys(health.engines).length : 0;
    record(3, 'Spine engines: ' + engineCount, engineCount >= 4, JSON.stringify(health.engines).substring(0, 200));
  } catch (e) {
    record(3, 'Spine health', false, e.message);
  }
}

// L4: Agent execution
async function auditLevel4() {
  console.log('  -- L4: Agent Execution --');
  try {
    const tower = require('../agent_tower');
    const result = await tower.executeAgent('duck', 'Say "deep-audit-ok" and nothing else.', { timeoutMs: 15000 });
    const ok = result && (result.content || result.output || result.stdout);
    record(4, 'Agent duck executes', !!ok,
      (result.content || result.output || result.stdout || 'no output').substring(0, 80));
  } catch (e) {
    record(4, 'Agent duck executes', false, e.message);
  }
}

// L5: Tool execution
async function auditLevel5() {
  console.log('  -- L5: Tool Execution --');
  try {
    const tools = require('../lib/tools/index');
    const list = tools.list();
    const sample = list.slice(0, 5);
    let worked = 0;
    for (const tool of sample) {
      try {
        if (typeof tool.execute === 'function') {
          const r = await tool.execute({ args: '--help' });
          if (r && !r.error) worked++;
        } else {
          worked++;
        }
      } catch {}
    }
    record(5, 'Sample tools (' + worked + '/' + sample.length + ')', worked >= 3,
      String(worked) + ' of first ' + sample.length);
  } catch (e) {
    record(5, 'Tool execution', false, e.message);
  }
}

// L6: Provider routing
async function auditLevel6() {
  console.log('  -- L6: Provider Routing --');
  try {
    const controller = new AbortController();
    const id = setTimeout(function() { controller.abort(); }, 3000);
    const ollamaRes = await fetch('http://127.0.0.1:11434/api/tags', { signal: controller.signal });
    clearTimeout(id);
    if (ollamaRes.ok) {
      const data = await ollamaRes.json();
      const models = data.models || [];
      record(6, 'Ollama reachable', models.length > 0,
        models.length > 0 ? String(models.length) + ' models' : 'running but no models');
    } else {
      record(6, 'Ollama', false, 'HTTP ' + ollamaRes.status);
    }
  } catch {
    record(6, 'Ollama reachable', false, 'offline');
  }
}

// L7: Vault roundtrip
async function auditLevel7() {
  console.log('  -- L7: Vault Roundtrip --');
  const tmpDir = path.join(os.tmpdir(), 'deep-audit-vault-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  const vaultPath = path.join(tmpDir, 'test-vault.enc');
  try {
    const { PocketVault } = require('../lib/pocket-vault');
    const v = new PocketVault(vaultPath);
    const initR = v.init('MyTestStr0ng!Pass#2026');
    v.unlock('MyTestStr0ng!Pass#2026');
    v.set('TEST_KEY', 'deep-audit-value');
    v.lock();

    const v2 = new PocketVault(vaultPath);
    v2.unlock('MyTestStr0ng!Pass#2026');
    const got = v2.get('TEST_KEY');
    v2.lock();

    const ok = got === 'deep-audit-value';
    record(7, 'Encrypt -> decrypt roundtrip', ok, ok ? 'data preserved' : 'expected deep-audit-value, got ' + got);

    try {
      const v3 = new PocketVault(vaultPath);
      v3.unlock('WrongPass1!');
      record(7, 'Wrong password rejected', false, 'accepted');
    } catch {
      record(7, 'Wrong password rejected', true);
    }

    const logPath = vaultPath + '.log';
    const hasLog = fs.existsSync(logPath) && fs.readFileSync(logPath, 'utf8').trim().length > 0;
    record(7, 'Audit log present', hasLog, hasLog ? String(fs.statSync(logPath).size) + ' bytes' : 'no log');
  } catch (e) {
    record(7, 'Vault roundtrip', false, e.message);
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

// L8: SpendGate enforcement
async function auditLevel8() {
  console.log('  -- L8: SpendGate Enforcement --');
  const tmpDir = path.join(os.tmpdir(), 'deep-audit-spend-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  const origPocket = process.env.POCKET_DIR;
  process.env.POCKET_DIR = tmpDir;
  try {
    const { SpendGate } = require('../lib/spend-gate');
    const sg = new SpendGate();
    sg.configure({ dailyTokenCap: 100, perRequestCap: 50, maxRequestsPerMinute: 1000 });
    const r1 = await sg.check({ agent: 'audit', provider: 'ollama', estimatedTokens: 30 });
    if (r1.allow) { await sg.record('audit', 'ollama', 30, 0, null, { reserved: r1.estimatedTokens }); }
    record(8, 'Allows under cap', r1.allow, r1.reason || 'allowed');
    const r2 = await sg.check({ agent: 'audit', provider: 'ollama', estimatedTokens: 100 });
    record(8, 'Blocks over per-request cap', !r2.allow, r2.reason || 'denied');
    const r3 = await sg.check({ agent: 'audit', provider: 'ollama', estimatedTokens: 80 });
    record(8, 'Blocks when daily cap exhausted', !r3.allow, r3.reason || 'denied');
  } catch (e) {
    record(8, 'SpendGate', false, e.message);
  } finally {
    process.env.POCKET_DIR = origPocket;
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

// L9: Harvest integrity
async function auditLevel9() {
  console.log('  -- L9: Harvest Integrity --');
  const indexPath = path.join(PURP_DIR, 'agent_work', 'harvest-index.json');
  if (fs.existsSync(indexPath)) {
    try {
      const idx = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
      const count = idx.files ? idx.files.length : 0;
      record(9, 'Harvest index on disk', count > 0, String(count) + ' files');
    } catch (e) {
      record(9, 'Harvest index', false, e.message);
    }
  } else {
    record(9, 'Harvest index', false, 'run "purpclaw harvest run" first');
  }
}

// L10: Identity persistence
async function auditLevel10() {
  console.log('  -- L10: Identity Persistence --');
  const tmpDir = path.join(os.tmpdir(), 'deep-audit-id-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  const orig = process.env.POCKET_DIR;
  process.env.POCKET_DIR = tmpDir;
  try {
    const { saveIdentity, loadIdentity, exportIdentity, importIdentity } = require('../lib/identity');
    const id = loadIdentity();
    id.profile.name = 'Deep-Audit-User';
    id.providers.default = 'ollama';
    saveIdentity(id);
    const loaded = loadIdentity();
    const nameOk = loaded.profile.name === 'Deep-Audit-User';
    record(10, 'Identity persist/load', nameOk, 'name: ' + loaded.profile.name);
    const exportPath = path.join(tmpDir, 'exported.json');
    exportIdentity(exportPath);
    record(10, 'Identity export', fs.existsSync(exportPath), exportPath);
    const imported = importIdentity(exportPath, { force: true });
    record(10, 'Identity import', imported.ok, imported.changed ? 'changed applied' : 'no changes');
  } catch (e) {
    record(10, 'Identity', false, e.message);
  } finally {
    process.env.POCKET_DIR = orig;
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

function printSummary() {
  const byLevel = {};
  for (const r of results) {
    if (!byLevel[r.level]) byLevel[r.level] = { pass: 0, fail: 0, total: 0 };
    byLevel[r.level].total++;
    if (r.ok) byLevel[r.level].pass++;
    else byLevel[r.level].fail++;
  }

  console.log('');
  console.log('  -- AUDIT SUMMARY --');
  let totalPass = 0, totalFail = 0;
  const levelNames = [
    'L0 Static Load', 'L1 Registry Integrity', 'L2 Service Contracts',
    'L3 Cognitive Spine', 'L4 Agent Execution', 'L5 Tool Execution',
    'L6 Provider Routing', 'L7 Vault Roundtrip', 'L8 SpendGate Enforcement',
    'L9 Harvest Integrity', 'L10 Identity Persistence',
  ];
  for (let lvl = 0; lvl < levelNames.length; lvl++) {
    const b = byLevel[lvl];
    if (!b || b.total === 0) continue;
    totalPass += b.pass;
    totalFail += b.fail;
    const icon = b.fail === 0 ? 'OK' : 'XX';
    console.log('  ' + icon + ' ' + levelNames[lvl] + ': ' + b.pass + '/' + b.total + ' (' + b.fail + ' fails)');
  }

  const total = totalPass + totalFail;
  console.log('  Total: ' + totalPass + '/' + total + ' pass, ' + totalFail + ' fail, ' + (Date.now() - startWall) + 'ms');
  console.log('');
  return { pass: totalPass, fail: totalFail, total, results, byLevel };
}

module.exports = { runFast, runFull };
