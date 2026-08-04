#!/usr/bin/env node
'use strict';

/**
 * weatherman.js — PURPCLAW current operating conditions (READ-ONLY).
 *
 * Reports the live "system weather": service health, provider availability,
 * registry/drift status, Hivemind loop health, and build state. It predicts
 * nothing and patches nothing — it only observes and warns. Missing sources are
 * reported as "unavailable" honestly, never faked.
 *
 *   node lib/weatherman.js            # human report
 *   node lib/weatherman.js --json     # machine report
 *
 * Output: { condition, severity, summary, warnings[], safe_to_build,
 *           recommended_mode, sources{}, duck }
 *
 * condition: clear | cloudy | storm | red_alert
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
function reqSafe(p) { try { return require(p); } catch (e) { return { __error: e.message }; } }
function loadJSON(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } }

// ── Source probes (each returns {ok, ...} or {ok:false, unavailable, reason}) ──

async function probeServices() {
  const sr = reqSafe(path.join(ROOT, 'service_registry.js'));
  const services = (sr && sr.SERVICES) || [];
  if (!services.length) return { ok: false, unavailable: true, reason: 'service_registry empty' };
  const probe = (s) => new Promise((resolve) => {
    const port = s.healthPort || s.port;
    if (!port) return resolve({ name: s.pm2 || s.key, required: !!s.required, status: 'unknown' });
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1500);
    fetch(`http://127.0.0.1:${port}${s.healthPath || '/health'}`, { signal: ctrl.signal })
      .then(r => { clearTimeout(t); resolve({ name: s.pm2 || s.key, required: !!s.required, status: r.ok || r.status < 500 ? 'online' : 'degraded' }); })
      .catch(() => { clearTimeout(t); resolve({ name: s.pm2 || s.key, required: !!s.required, status: 'offline' }); });
  });
  const results = await Promise.all(services.map(probe));
  const online = results.filter(r => r.status === 'online').length;
  const offline = results.filter(r => r.status === 'offline');
  const requiredDown = offline.filter(r => r.required).map(r => r.name);
  // If NOTHING responds, the probe is almost certainly blind (sandboxed network /
  // wrong host context) rather than every service being simultaneously dead.
  // Report that honestly instead of crying RED ALERT on a false negative.
  if (online === 0 && results.length > 0) {
    return { ok: false, blind: true, total: results.length, online: 0,
      reason: 'no service responded to health probes — likely unreachable from this context, not confirmed down' };
  }
  return { ok: true, total: results.length, online, offline: offline.length, required_down: requiredDown, results };
}

function probeProviders() {
  const ph = reqSafe(path.join(ROOT, 'lib', 'provider_health.js'));
  if (ph.__error || !ph.getRegistryStatus) return { ok: false, unavailable: true, reason: 'provider_health unavailable' };
  try {
    const st = ph.getRegistryStatus();
    const entries = Array.isArray(st) ? st : Object.values(st || {});
    const down = entries.filter(e => e && (e.available === false || e.state === 'down')).map(e => e.name || e.provider).filter(Boolean);
    return { ok: true, tracked: entries.length, down, note: entries.length ? '' : 'no provider state recorded in this process' };
  } catch (e) { return { ok: false, unavailable: true, reason: e.message }; }
}

function probeDrift() {
  const dw = reqSafe(path.join(ROOT, 'lib', 'drift-watcher.js'));
  if (dw.__error || !dw.scanAll) return { ok: false, unavailable: true, reason: 'drift-watcher unavailable' };
  try {
    const r = dw.scanAll();
    const drifted = r.checks.filter(c => c.drift);
    return { ok: true, drifted: drifted.length, needs_review: r.summary.needs_review, items: drifted.map(c => ({ id: c.id, severity: c.severity, detail: c.detail })) };
  } catch (e) { return { ok: false, unavailable: true, reason: e.message }; }
}

function probeHivemind() {
  const hm = reqSafe(path.join(ROOT, 'lib', 'hivemind'));
  if (hm.__error || !hm.status) return { ok: false, unavailable: true, reason: 'hivemind unavailable' };
  try {
    const s = hm.status();
    let spring = null; try { spring = hm.springStatus ? hm.springStatus() : null; } catch {}
    return {
      ok: true,
      traces: s.traces && (s.traces.count ?? s.traces) || s.trace_count || 0,
      skills: Array.isArray(s.skills) ? s.skills.length : (s.skills || s.skill_count || 0),
      antiskills: s.antiskills || s.antiskill_count || 0,
      doctrines: spring ? (spring.doctrines || spring.doctrine_count || 0) : 0,
      loop: s.ok ? 'green' : 'unknown',
    };
  } catch (e) { return { ok: false, unavailable: true, reason: e.message }; }
}

function probeBuild() {
  const v = loadJSON(path.join(ROOT, '.versioning', 'version.json'));
  if (!v) return { ok: false, unavailable: true, reason: 'no version stamp yet' };
  return { ok: true, semver: v.semver, build: v.build, last_stamp: v.last_stamp, tracked_files: v.files };
}

// ── Synthesis ───────────────────────────────────────────────────────────────

function synthesize(sources) {
  const warnings = [];
  const { services, providers, drift, hivemind } = sources;

  if (services.ok && services.required_down && services.required_down.length)
    warnings.push({ area: 'services', risk: 'required_service_down', severity: 'critical', reason: `required offline: ${services.required_down.join(', ')}` });
  else if (services.ok && services.offline > 0)
    warnings.push({ area: 'services', risk: 'service_offline', severity: 'medium', reason: `${services.offline}/${services.total} services offline` });

  if (providers.ok && providers.down && providers.down.length)
    warnings.push({ area: 'providers', risk: 'provider_down', severity: 'medium', reason: `down: ${providers.down.join(', ')}` });

  if (drift.ok && drift.drifted > 0) {
    const crit = drift.items.filter(i => i.severity === 'medium' || i.severity === 'high');
    warnings.push({ area: 'registry', risk: drift.needs_review > 0 ? 'drift_needs_review' : 'drift_present', severity: crit.length ? 'medium' : 'low', reason: drift.items.map(i => i.id).join(', ') + ' drifted' });
  }

  if (hivemind.ok && hivemind.loop !== 'green')
    warnings.push({ area: 'hivemind', risk: 'loop_degraded', severity: 'medium', reason: 'hivemind loop not green' });

  // Honest unavailability / blindness (not a failure, but a visibility gap)
  for (const [k, v] of Object.entries(sources))
    if (v && (v.unavailable || v.blind)) warnings.push({ area: k, risk: v.blind ? 'monitoring_blind' : 'source_unavailable', severity: 'info', reason: v.reason });

  const hasCritical = warnings.some(w => w.severity === 'critical');
  const mediums = warnings.filter(w => w.severity === 'medium').length;
  const lows = warnings.filter(w => w.severity === 'low').length;

  let condition, severity, mode;
  if (hasCritical) { condition = 'red_alert'; severity = 'critical'; mode = 'stop_building_fix_foundation'; }
  else if (mediums >= 3) { condition = 'storm'; severity = 'high'; mode = 'audit_only'; }
  else if (mediums >= 1) { condition = 'cloudy'; severity = 'medium'; mode = 'focused_batch_only'; }
  else if (lows >= 1) { condition = 'cloudy'; severity = 'low'; mode = 'patch_small_watch_warnings'; }
  else { condition = 'clear'; severity = 'none'; mode = 'normal'; }

  const safe_to_build = condition === 'clear' || condition === 'cloudy';
  const realWarn = warnings.filter(w => w.severity !== 'info');
  const summary = realWarn.length
    ? realWarn.map(w => `${w.area}: ${w.reason}`).join(' · ')
    : 'all monitored systems nominal';

  return { condition, severity, summary, warnings, safe_to_build, recommended_mode: mode };
}

const DUCK = {
  clear: '🦆 Clear skies. Safe to build. Try not to break it.',
  cloudy: '🦆 Bit foggy out there — patch small and watch the warnings.',
  storm: '🦆 Storm warning. Audit only. Do NOT let Codex drive.',
  red_alert: '🦆🌩️ RED ALERT. Roof is gone. Stop building, fix the foundation.',
};

async function report() {
  const [services] = await Promise.all([probeServices()]);
  const sources = { services, providers: probeProviders(), drift: probeDrift(), hivemind: probeHivemind(), build: probeBuild() };
  const synth = synthesize(sources);
  return {
    schema: 'purpclaw.weather.v1',
    generated_at: new Date().toISOString(),
    ...synth,
    sources,
    duck: DUCK[synth.condition],
  };
}

function printReport(r) {
  const C = { red: '\x1b[31m', yel: '\x1b[33m', grn: '\x1b[32m', blu: '\x1b[36m', gray: '\x1b[90m', b: '\x1b[1m', x: '\x1b[0m' };
  const cond = { clear: C.grn + '🟢 CLEAR', cloudy: C.yel + '🟡 CLOUDY', storm: C.yel + '🟠 STORM', red_alert: C.red + '🔴 RED ALERT' }[r.condition];
  console.log(`\n${C.b}PURPCLAW SYSTEM WEATHER${C.x}  ${C.gray}${r.generated_at}${C.x}`);
  console.log(`  ${cond}${C.x}  ${C.gray}(${r.recommended_mode})${C.x}  safe_to_build=${r.safe_to_build}`);
  console.log(`  ${r.summary}`);
  if (r.warnings.length) {
    console.log(`\n  ${C.b}Warnings:${C.x}`);
    for (const w of r.warnings) {
      const col = w.severity === 'critical' ? C.red : w.severity === 'medium' ? C.yel : C.gray;
      console.log(`    ${col}[${w.severity}]${C.x} ${w.area}: ${w.reason}`);
    }
  }
  console.log(`\n  ${r.duck}\n`);
}

async function main() {
  const json = process.argv.includes('--json');
  const r = await report();
  if (json) console.log(JSON.stringify(r, null, 2)); else printReport(r);
  process.exit(0);
}

if (require.main === module) main();
module.exports = { report };
