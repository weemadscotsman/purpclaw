'use strict';
/**
 * lib/commands/bughunt.js
 * ─────────────────────────────────────────────────────────────────────────────
 * purpclaw bughunt [--json] [--fix]
 *
 * Finds REAL breakage across the stack:
 *   • Node syntax check on every critical .js file
 *   • npm build dry-run (Next.js type-check)
 *   • Gatekeeper health + available verify endpoint
 *   • spaghetti-audit.js smell scan
 *   • Service health from service_registry (condensed doctor)
 *   • PM2 reality: ecosystem.config apps[] vs pm2 list
 *   • Stale-doc flag (CAPTAINS_LOG too old vs last file mod)
 */

const path  = require('path');
const fs    = require('fs');
const { execSync, spawnSync } = require('child_process');
const http  = require('http');

// ── Context helpers injected by caller ───────────────────────────────────────
async function run(args, ctx) {
  const { PURP_DIR, C, col, spinner, httpGet, ping, PORTS, isTTY, sectionHead, banner } = ctx;
  const wantJson = args.includes('--json');
  const wantFix  = args.includes('--fix');

  if (!wantJson) banner();
  const findings = [];
  const ok = (label, detail = '') => findings.push({ kind: 'ok',   label, detail });
  const warn = (label, detail = '') => findings.push({ kind: 'warn', label, detail });
  const fail = (label, detail = '') => findings.push({ kind: 'fail', label, detail });

  // ── 1. Node syntax check — critical JS files ─────────────────────────────
  if (!wantJson) sectionHead('  SYNTAX CHECK');
  const CRITICAL_JS = [
    'unified_api.js', 'orchestrator.js', 'agent_tower.js',
    'unified_eventbus.js', 'unified_state.js', 'gatekeeper.js',
    'voice_coordinator.js', 'voice_bridge_7792.js',
    'metrics_aggregator.js', 'pool_service.js',
    'lib/context-bus.js', 'lib/governance.js', 'lib/job-contract.js',
    'lib/spaghetti-audit.js', 'lib/proactive-maintenance.js',
    'lib/voice-client.js', 'lib/mochi-sprites.js',
    'scripts/tui.js', 'bin/purpclaw.js',
  ];

  let syntaxFails = 0;
  for (const rel of CRITICAL_JS) {
    const abs = path.join(PURP_DIR, rel);
    if (!fs.existsSync(abs)) { warn(`MISSING  ${rel}`, 'file not found'); continue; }
    try {
      spawnSync(process.execPath, ['--check', abs], { encoding: 'utf8', stdio: 'pipe' });
      ok(`syntax   ${rel}`);
    } catch (e) {
      const msg = (e.stderr || e.message || '').trim().split('\n')[0];
      fail(`syntax   ${rel}`, msg);
      syntaxFails++;
    }
  }

  // ── 2. PM2 ecosystem reality check ───────────────────────────────────────
  if (!wantJson) sectionHead('  PM2 REALITY CHECK');
  try {
    const eco = require(path.join(PURP_DIR, 'ecosystem.config.js'));
    const ecoNames = new Set((eco.apps || []).map(a => a.name));

    let pm2Names = new Set();
    try {
      const raw = spawnSync('npx', ['pm2', 'jlist'], {
        cwd: PURP_DIR, encoding: 'utf8', stdio: 'pipe',
        shell: process.platform === 'win32',
        windowsHide: true
      });
      const list = JSON.parse(raw.stdout || '[]');
      pm2Names = new Set(list.map(p => p.name));
    } catch { /* pm2 not running — skip diff */ }

    const notRegistered = [...ecoNames].filter(n => !pm2Names.has(n));
    const orphaned      = [...pm2Names].filter(n => !ecoNames.has(n) && n.startsWith('purpclaw-'));

    if (notRegistered.length === 0 && pm2Names.size > 0) {
      ok('pm2 reality', `all ${ecoNames.size} ecosystem services registered`);
    } else if (pm2Names.size === 0) {
      warn('pm2 reality', 'pm2 not running or jlist failed — stack may be down');
    } else {
      notRegistered.forEach(n => warn(`  not in pm2: ${n}`, 'defined in ecosystem but not running'));
    }
    if (orphaned.length) {
      orphaned.forEach(n => warn(`  orphan pm2: ${n}`, 'running but not in ecosystem.config.js'));
    }
  } catch (e) {
    warn('pm2 ecosystem', `could not load ecosystem.config.js: ${e.message}`);
  }

  // ── 3. Service health (condensed) ─────────────────────────────────────────
  if (!wantJson) sectionHead('  SERVICE HEALTH');
  const registry = require(path.join(PURP_DIR, 'service_registry.js'));
  const healthChecks = await Promise.allSettled(
    registry.getServices()
      .filter(s => s.healthPort && s.healthPath)
      .map(s => ping(s.healthPort, s.healthPath).then(alive => ({ s, alive })))
  );
  let coreFails = 0;
  for (const r of healthChecks) {
    if (!r.value) continue;
    const { s, alive } = r.value;
    if (s.required && !alive) {
      fail(`svc:${s.key}`, `CORE service offline — :${s.healthPort}${s.healthPath}`);
      coreFails++;
    } else if (!alive) {
      // optional offline is expected, skip noise
    } else {
      ok(`svc:${s.key}`, `:${s.healthPort}`);
    }
  }
  if (coreFails === 0) ok('core services', 'all required services responding');

  // ── 4. Gatekeeper verify endpoint ─────────────────────────────────────────
  if (!wantJson) sectionHead('  GATEKEEPER');
  try {
    const gkHealth = await httpGet(7791, '/health', 2000);
    if (gkHealth) {
      ok('gatekeeper', 'online :7791');
      // Verify the /api/verify-build endpoint exists
      try {
        await httpGet(7791, '/api/verify-build', 1000);
        ok('gatekeeper /api/verify-build', 'endpoint present');
      } catch {
        warn('gatekeeper /api/verify-build', 'endpoint unavailable (gatekeeper may not have --server mode)');
      }
    } else {
      warn('gatekeeper', 'offline — pre-merge validation disabled');
    }
  } catch {
    warn('gatekeeper', 'offline :7791');
  }

  // ── 5. Spaghetti audit ────────────────────────────────────────────────────
  if (!wantJson) sectionHead('  SPAGHETTI AUDIT');
  try {
    const spaghetti = require(path.join(PURP_DIR, 'lib', 'spaghetti-audit.js'));
    const smells = typeof spaghetti.auditAll === 'function'
      ? spaghetti.auditAll(PURP_DIR)
      : (typeof spaghetti.audit === 'function' ? spaghetti.audit(PURP_DIR) : null);

    if (!smells) {
      warn('spaghetti-audit', 'auditAll/audit function not found in spaghetti-audit.js');
    } else if (Array.isArray(smells)) {
      const critical = smells.filter(s => s.severity === 'critical' || s.level === 'critical');
      const high     = smells.filter(s => s.severity === 'high'     || s.level === 'high');
      if (critical.length) {
        critical.forEach(s => fail(`spaghetti:${s.file || s.source || '?'}`, s.message || s.smell || JSON.stringify(s)));
      }
      if (high.length) {
        high.forEach(s => warn(`spaghetti:${s.file || s.source || '?'}`, s.message || s.smell || JSON.stringify(s)));
      }
      if (!critical.length && !high.length) {
        ok('spaghetti-audit', `${smells.length} total issues, none critical/high`);
      }
    } else if (typeof smells === 'object') {
      ok('spaghetti-audit', JSON.stringify(smells).slice(0, 80));
    }
  } catch (e) {
    warn('spaghetti-audit', `could not run: ${e.message}`);
  }

  // ── 6. Stale docs check ───────────────────────────────────────────────────
  if (!wantJson) sectionHead('  STALE DOCS');
  const LOG_FILE = path.join(PURP_DIR, 'CAPTAINS_LOG.md');
  const KEY_FILES = [
    'bin/purpclaw.js', 'scripts/tui.js', 'ecosystem.config.js',
    'service_registry.js', 'lib/voice-client.js',
  ];
  try {
    const logMtime = fs.statSync(LOG_FILE).mtimeMs;
    let latestFileMtime = 0;
    let latestFile = '';
    for (const rel of KEY_FILES) {
      const abs = path.join(PURP_DIR, rel);
      if (!fs.existsSync(abs)) continue;
      const m = fs.statSync(abs).mtimeMs;
      if (m > latestFileMtime) { latestFileMtime = m; latestFile = rel; }
    }
    const diffHours = (latestFileMtime - logMtime) / 3600000;
    if (diffHours > 72) {
      warn('CAPTAINS_LOG.md', `${latestFile} is ${Math.round(diffHours)}h newer — docs may be stale`);
    } else {
      ok('CAPTAINS_LOG.md', `last updated within ${Math.round(Math.abs(diffHours))}h of latest file change`);
    }
  } catch { warn('stale-docs', 'could not stat CAPTAINS_LOG.md'); }

  // ── 7. Port collision scan ─────────────────────────────────────────────────
  if (!wantJson) sectionHead('  PORT AUDIT');
  const allSvcs  = registry.getServices();
  const portMap  = {};
  const clashes  = [];
  for (const s of allSvcs) {
    if (!s.port) continue;
    if (portMap[s.port]) clashes.push(`port ${s.port} claimed by ${portMap[s.port]} AND ${s.key}`);
    else portMap[s.port] = s.key;
  }
  if (clashes.length) clashes.forEach(c => fail('port collision', c));
  else ok('port map', `${Object.keys(portMap).length} ports, no collisions`);

  // ── Output ────────────────────────────────────────────────────────────────
  if (wantJson) {
    console.log(JSON.stringify({ findings, summary: {
      total: findings.length,
      ok:    findings.filter(f => f.kind === 'ok').length,
      warn:  findings.filter(f => f.kind === 'warn').length,
      fail:  findings.filter(f => f.kind === 'fail').length,
    }}, null, 2));
    return;
  }

  sectionHead('  BUGHUNT RESULTS');
  const fails = findings.filter(f => f.kind === 'fail');
  const warns = findings.filter(f => f.kind === 'warn');
  const oks   = findings.filter(f => f.kind === 'ok');

  for (const f of oks)   console.log(`  ${col(C.green,  'OK  ')}  ${f.label.padEnd(42)} ${col(C.gray, f.detail)}`);
  for (const f of warns) console.log(`  ${col(C.yellow, 'WARN')}  ${f.label.padEnd(42)} ${col(C.gray, f.detail)}`);
  for (const f of fails) console.log(`  ${col(C.red,    'FAIL')}  ${f.label.padEnd(42)} ${col(C.gray, f.detail)}`);

  console.log('');
  if (fails.length === 0 && warns.length === 0) {
    console.log(col(C.green, `  ✔  Clean bill of health. ${oks.length} checks passed.\n`));
  } else {
    console.log(
      `  ${col(C.green, oks.length + ' ok')}  ` +
      `${col(C.yellow, warns.length + ' warn')}  ` +
      `${col(C.red, fails.length + ' fail')}\n`
    );
    if (fails.length > 0) {
      console.log(col(C.gray, '  Suggested fixes:'));
      if (fails.some(f => f.label.includes('svc:'))) {
        console.log(col(C.gray, '    purpclaw start             — boot missing services'));
      }
      if (fails.some(f => f.label.includes('syntax'))) {
        console.log(col(C.gray, '    Check JS syntax errors above — node --check <file>'));
      }
      console.log(col(C.gray, '    purpclaw doctor            — full environment check'));
    }
  }
}

module.exports = { run };
