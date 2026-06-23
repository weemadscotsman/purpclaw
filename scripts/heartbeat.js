#!/usr/bin/env node
'use strict';

/**
 * PURPCLAW Heartbeat — a plain, VISIBLE watchdog. "Visible first, daemon later."
 *
 * No hidden PM2 magic: it prints what it sees every tick, so when something
 * breaks you watch the loop complain instead of doing archaeology.
 *
 *   node scripts/heartbeat.js            — run the loop (foreground, visible)
 *   node scripts/heartbeat.js --once     — single pass, print banner, exit
 *   node scripts/heartbeat.js --heal     — also restart DOWN core services (opt-in)
 *
 * Self-navigation is READ-ONLY here: health pings + provider/memory/body checks.
 * No mouse, no clicking, no VLM token burn. The hands stay gated; autonomy is
 * only ever armed by the operator's red button, never by this loop.
 */

const path = require('path');
const { spawn } = require('child_process');

const PURP = path.resolve(__dirname, '..');
const WEB = process.env.PURP_WEB_URL || 'http://127.0.0.1:3030';
const HEAL = process.argv.includes('--heal');
const ONCE = process.argv.includes('--once');

// Services safe-start --core brings up — the only ones we self-heal.
const CORE_HEAL = ['eventbus', 'state', 'api', 'orchestrator', 'tower', 'pool',
  'context', 'workers', 'gatekeeper', 'metrics', 'cognitive', 'nextjs'];

// Check cadences (ms). The loop runs a base tick and gates slower checks by age.
const EVERY = { core: 5 * 60e3, providers: 15 * 60e3, memory: 30 * 60e3, body: 10 * 60e3, sentinel: 24 * 60 * 60e3 };
const lastRun = {};
const due = (k) => !lastRun[k] || (nowMs() - lastRun[k]) >= EVERY[k];
function nowMs() { return Date.parse(new Date().toISOString()); }
function stamp() { return new Date().toISOString().slice(11, 19); }

async function getJSON(url, ms = 6000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { const r = await fetch(url, { signal: ctrl.signal }); return r.ok ? await r.json() : null; }
  catch { return null; } finally { clearTimeout(t); }
}

async function checkCore() {
  const d = await getJSON(`${WEB}/api/services`);
  if (!d || !d.groups) return { ok: false, healthy: 0, total: 0, down: ['(web unreachable)'] };
  const down = (d.services || []).filter(s => s.class === 'core' && !s.ok).map(s => s.id);
  return { ok: down.length === 0, healthy: d.groups.core.healthy, total: d.groups.core.total, down };
}

function checkProviders() {
  try {
    const r = require(path.join(PURP, 'lib', 'runtime', 'provider-router'));
    const lanes = Object.keys(r.LANES || {});
    let usable = 0; const fellBack = [];
    for (const name of lanes) {
      const c = r.resolveLane(r.LANES[name]);
      if (r.providerUsable(c.provider)) usable++;
      if (c.fellBackFrom) fellBack.push(`${name}<-${c.fellBackFrom}`);
    }
    return { ok: usable > 0, usable, total: lanes.length, fellBack };
  } catch (e) { return { ok: false, usable: 0, total: 0, error: e.message }; }
}

async function checkMemory() {
  const d = await getJSON('http://127.0.0.1:7880/health', 4000);
  return { ok: !!d && (d.status === 'healthy' || d.status === 'online') };
}

function checkBody() {
  try {
    const s = require(path.join(PURP, 'lib', 'runtime', 'settings-registry'));
    const enabled = !!s.get('computerUse.enabled')?.value;
    const mode = s.get('computerUse.mode')?.value || 'off';
    const armed = enabled && mode !== 'off' && mode !== 'observe';
    return { ok: true, mode: enabled ? mode : 'off', armed };
  } catch { return { ok: true, mode: 'unknown', armed: false }; }
}

async function sentinelDaily() {
  try {
    const s = require(path.join(PURP, 'lib', 'model-sentinel'));
    const r = await s.runDaily();           // self-skips if already run today
    return { ok: true, skipped: !!r.skipped };
  } catch (e) { return { ok: false, error: e.message }; }
}

function heal(downIds) {
  const targets = downIds.filter(id => CORE_HEAL.includes(id));
  if (!targets.length) return [];
  for (const id of targets) {
    const child = spawn(process.execPath, [path.join(PURP, 'bin', 'purpclaw.js'), 'safe-start', id],
      { cwd: PURP, stdio: 'ignore', windowsHide: true, detached: false });
    child.unref?.();
  }
  return targets;
}

async function tick() {
  const out = { at: stamp() };
  if (due('core'))      { out.core = await checkCore();   lastRun.core = nowMs(); }
  if (due('providers')) { out.providers = checkProviders(); lastRun.providers = nowMs(); }
  if (due('memory'))    { out.memory = await checkMemory(); lastRun.memory = nowMs(); }
  if (due('body'))      { out.body = checkBody();          lastRun.body = nowMs(); }
  if (due('sentinel'))  { out.sentinel = await sentinelDaily(); lastRun.sentinel = nowMs(); }

  // Self-heal (opt-in, core only)
  if (HEAL && out.core && out.core.down && out.core.down.length) {
    const healed = heal(out.core.down);
    if (healed.length) out.healed = healed;
  }

  banner(out);
  return out;
}

function banner(s) {
  const c = s.core, p = s.providers, m = s.memory, b = s.body;
  const coreStr = c ? `${c.healthy}/${c.total}${c.down && c.down.length ? ' (down: ' + c.down.join(',') + ')' : ''}` : '·';
  const provStr = p ? `${p.usable}/${p.total} usable${p.fellBack && p.fellBack.length ? ' ⚠' + p.fellBack.join(',') : ''}` : '·';
  const memStr = m ? (m.ok ? 'green' : 'DOWN') : '·';
  const handStr = b ? b.mode : '·';
  const auton = (b && b.armed) ? 'ON ⚠' : 'off';
  const allGreen = (!c || c.ok) && (!p || p.ok) && (!m || m.ok) && (!b || !b.armed);
  const heart = allGreen ? '♥' : '✗';
  let line = `${heart} ${s.at}  Core ${coreStr}  ·  Providers ${provStr}  ·  Memory ${memStr}  ·  Hands ${handStr}  ·  Autonomy ${auton}`;
  if (s.healed) line += `  ·  HEALED ${s.healed.join(',')}`;
  console.log(line);
}

async function main() {
  // Lightweight .env load so provider/key checks resolve.
  try {
    const fs = require('fs'); const envPath = path.join(PURP, '.env');
    if (fs.existsSync(envPath)) for (const raw of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const l = raw.trim(); if (!l || l[0] === '#') continue; const i = l.indexOf('='); if (i < 1) continue;
      const k = l.slice(0, i).trim(); if (!(k in process.env)) process.env[k] = l.slice(i + 1).trim();
    }
  } catch { /* best effort */ }

  console.log(`PURPCLAW Heartbeat — visible watchdog${HEAL ? ' (+self-heal core)' : ''}. ${ONCE ? 'single pass.' : 'Ctrl+C to stop.'}`);
  await tick();
  if (ONCE) return;
  const base = parseInt(process.env.HEARTBEAT_BASE_MS || String(EVERY.core), 10);
  setInterval(() => { tick().catch(e => console.log(`✗ ${stamp()} heartbeat error: ${e.message}`)); }, base);
}

main().catch(e => { console.error('heartbeat fatal:', e.message); process.exit(1); });
