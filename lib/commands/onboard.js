'use strict';
/**
 * lib/commands/onboard.js
 * ─────────────────────────────────────────────────────────────────────────────
 * purpclaw onboard [--yes] [--profile=<name>]
 *
 * First-user guided flow. Safe to run multiple times — each step checks if it
 * already passed before doing anything.
 *
 * Steps:
 *   1. Welcome + repo root check
 *   2. .env audit (lists missing keys with guidance, never writes secrets)
 *   3. PM2 installed?
 *   4. Node.js + Python version check
 *   5. Doctor summary (reuses service_registry ping)
 *   6. Suggest best launch profile
 *   7. Pool stats (indexed skills/agents)
 *   8. Companion: is a Mochi hatched? Offer purpclaw forge.
 *   9. Offer to launch TUI
 */

const path     = require('path');
const fs       = require('fs');
const { spawnSync } = require('child_process');
const readline = require('readline');

// ── Env-key guidance ──────────────────────────────────────────────────────────
const ENV_KEYS = [
  { key: 'KIMI_API_KEY',       required: false, hint: 'Kimi LLM — optional but gives agents a brain' },
  { key: 'MINIMAX_API_KEY',    required: false, hint: 'MiniMax TTS — for Companion Chorus voice' },
  { key: 'OPENAI_API_KEY',     required: false, hint: 'OpenAI fallback — optional' },
  { key: 'XIAOZHI_MCP_URL',    required: false, hint: 'Xiaozhi MCP gateway — optional cloud routing' },
  { key: 'OPENCLAW_TOKEN',     required: false, hint: 'OpenClaw token — optional companion auth' },
  { key: 'PURPCLAW_PROACTIVE', required: false, hint: 'Set to 1 to enable proactive reasoning loop' },
];

async function run(args, ctx) {
  const { PURP_DIR, C, col, spinner, httpGet, ping, PORTS, isTTY, sectionHead, banner } = ctx;
  const autoYes = args.includes('--yes') || args.includes('-y');
  const profileArg = args.find(a => a.startsWith('--profile='));
  const profile = profileArg ? profileArg.split('=')[1] : null;

  banner();
  sectionHead('  PURPCLAW ONBOARDING');
  console.log(col(C.gray, '  Welcome to the Tiny Haunted Workshop. Let\'s get you set up.\n'));

  const steps = [];
  const pass = (msg, detail = '') => { steps.push({ ok: true,  msg, detail }); };
  const issue = (msg, detail = '') => { steps.push({ ok: false, msg, detail }); };

  // ── Step 1: Repo root ──────────────────────────────────────────────────────
  const hasEco = fs.existsSync(path.join(PURP_DIR, 'ecosystem.config.js'));
  const hasPkg = fs.existsSync(path.join(PURP_DIR, 'package.json'));
  if (hasEco && hasPkg) {
    pass('Repo root', PURP_DIR);
  } else {
    issue('Repo root', `ecosystem.config.js or package.json missing in ${PURP_DIR}`);
  }

  // ── Step 2: .env audit ─────────────────────────────────────────────────────
  const envPath = path.join(PURP_DIR, '.env');
  if (!fs.existsSync(envPath)) {
    issue('.env file', 'Missing — copy .env.example to .env and fill in keys');
  } else {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const missing = ENV_KEYS.filter(k => {
      return !envContent.includes(k.key + '=') || envContent.match(new RegExp(k.key + '=\\s*$', 'm'));
    });
    if (missing.length === 0) {
      pass('.env', 'All known keys present');
    } else {
      for (const k of missing) {
        if (k.required) issue(`.env: ${k.key}`, k.hint);
        else issue(`.env: ${k.key} (optional)`, k.hint);
      }
    }
  }

  // ── Step 3: PM2 ───────────────────────────────────────────────────────────
  try {
    const res = spawnSync('npx', ['pm2', '--version'], {
      cwd: PURP_DIR, encoding: 'utf8', stdio: 'pipe',
      shell: process.platform === 'win32', windowsHide: true
    });
    const ver = (res.stdout || '').trim();
    if (ver) pass('PM2 installed', ver);
    else issue('PM2', 'not found — run: npm install -g pm2');
  } catch {
    issue('PM2', 'not found — run: npm install -g pm2');
  }

  // ── Step 4: Node + Python ─────────────────────────────────────────────────
  pass('Node.js', process.version);
  try {
    const py = spawnSync('py', ['-3.11', '-c', 'import sys; print(sys.version.split()[0])'], {
      encoding: 'utf8', stdio: 'pipe', windowsHide: true
    });
    const ver = (py.stdout || '').trim();
    if (ver) pass('Python 3.11', ver);
    else issue('Python 3.11', 'py -3.11 not found — Python services will not start');
  } catch {
    issue('Python 3.11', 'py -3.11 unavailable');
  }

  // ── Step 5: Service health summary ────────────────────────────────────────
  const registry = require(path.join(PURP_DIR, 'service_registry.js'));
  const spin = spinner('probing services').start();
  const results = await Promise.allSettled(
    registry.getServices()
      .filter(s => s.healthPort && s.healthPath && s.required)
      .map(s => ping(s.healthPort, s.healthPath).then(alive => ({ s, alive })))
  );
  spin.succeed('service probe done');

  let coreUp = 0, coreTotal = 0;
  for (const r of results) {
    if (!r.value) continue;
    const { s, alive } = r.value;
    if (s.required) {
      coreTotal++;
      if (alive) coreUp++;
    }
  }
  if (coreUp === coreTotal) {
    pass('Core services', `all ${coreTotal} online`);
  } else {
    issue('Core services', `${coreUp}/${coreTotal} online — run: purpclaw start`);
  }

  // ── Step 6: Launch profile suggestion ─────────────────────────────────────
  const eco = require(path.join(PURP_DIR, 'ecosystem.config.js'));
  const ecoNames = (eco.apps || []).map(a => a.name);
  const SERVICE_REGISTRY = require(path.join(PURP_DIR, 'service_registry.js'));
  const suggestedProfile = profile || 'harness';
  const profileNames = SERVICE_REGISTRY.getLaunchProfile(suggestedProfile);
  pass('Recommended profile', `purpclaw start --profile=${suggestedProfile} (${profileNames.length} services)`);

  // ── Step 7: Pool stats ─────────────────────────────────────────────────────
  let poolOk = false;
  try {
    const pool = await httpGet(7885, '/pool/stats', 2000);
    if (pool?.skillsCount !== undefined) {
      poolOk = true;
      pass('Knowledge Pool', `${pool.skillsCount} skills · ${pool.agentsCount ?? '?'} agents indexed`);
    } else {
      issue('Knowledge Pool', 'online but no stats — run: purpclaw pool reindex');
    }
  } catch {
    issue('Knowledge Pool', 'offline — boot first, then: purpclaw pool reindex');
  }

  // ── Step 8: Companion ─────────────────────────────────────────────────────
  const MOCHI_FILE = path.join(PURP_DIR, 'agent_work', 'mochi.json');
  if (fs.existsSync(MOCHI_FILE)) {
    try {
      const mochi = JSON.parse(fs.readFileSync(MOCHI_FILE, 'utf8'));
      pass('Companion', `${mochi.name} the ${mochi.species} — rarity: ${mochi.rarity || 'common'}`);
    } catch {
      issue('Companion', 'mochi.json exists but could not parse — run: purpclaw forge');
    }
  } else {
    issue('Companion', 'No companion yet — run: purpclaw forge');
  }

  // ── Print summary ──────────────────────────────────────────────────────────
  sectionHead('  ONBOARDING SUMMARY');
  const failures = steps.filter(s => !s.ok);
  const passes   = steps.filter(s => s.ok);

  for (const s of passes)   console.log(`  ${col(C.green,  '✔')}  ${s.msg.padEnd(28)} ${col(C.gray, s.detail)}`);
  for (const s of failures) console.log(`  ${col(C.yellow, '!')}  ${s.msg.padEnd(28)} ${col(C.red, s.detail)}`);

  console.log('');
  if (failures.length === 0) {
    console.log(col(C.green, '  ✔  All systems go. Stack is ready.\n'));
  } else {
    console.log(col(C.yellow, `  ${failures.length} item(s) need attention.\n`));
  }

  // ── Action hints ───────────────────────────────────────────────────────────
  sectionHead('  NEXT STEPS');
  if (coreUp < coreTotal) {
    console.log(`  ${col(C.cyan, 'purpclaw start')}                     boot the core stack`);
  }
  if (!poolOk) {
    console.log(`  ${col(C.cyan, 'purpclaw pool reindex')}              index skills and agents`);
  }
  if (!fs.existsSync(MOCHI_FILE)) {
    console.log(`  ${col(C.cyan, 'purpclaw forge')}                     hatch your companion`);
  }
  console.log(`  ${col(C.cyan, 'purpclaw run "<task>"')}             dispatch a task`);
  console.log(`  ${col(C.cyan, 'purpclaw tui')}                       full-screen cockpit`);
  console.log(`  ${col(C.cyan, 'purpclaw doctor')}                    full environment check`);
  console.log('');
}

module.exports = { run };
