'use strict';
/**
 * lib/commands/pocket.js — purpclaw pocket
 * Pocket OS: init, mode, start, stop, status, backup, restore.
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSafe } = require('../child-registry');

const PURP_DIR = path.resolve(__dirname, '..', '..');
const POCKET_DIR = path.join(PURP_DIR, 'pocket');

const POCKET_STATE = path.join(POCKET_DIR, '.pocket-state.json');

function readState() {
  try { return JSON.parse(fs.readFileSync(POCKET_STATE, 'utf8')); }
  catch { return { mode: null, initialized: false, profile: null }; }
}

function writeState(s) {
  if (!fs.existsSync(POCKET_DIR)) fs.mkdirSync(POCKET_DIR, { recursive: true });
  fs.writeFileSync(POCKET_STATE, JSON.stringify(s, null, 2));
}

async function run(args, ctx) {
  const { C, col } = ctx;
  const sub = (args[0] || 'help').toLowerCase();
  const rest = args.slice(1);

  if (sub === 'help' || sub === '--help') return showHelp(ctx);

  if (sub === 'init') return cmdInit(ctx);
  if (sub === 'mode') return cmdMode(rest, ctx);
  if (sub === 'start') return cmdStart(ctx);
  if (sub === 'stop') return cmdStop(ctx);
  if (sub === 'status') return cmdStatus(ctx);
  if (sub === 'backup') return cmdBackup(rest, ctx);
  if (sub === 'restore') return cmdRestore(rest, ctx);
  if (sub === 'detect') return cmdDetect(ctx);
  if (sub === 'package') return cmdPackage(rest, ctx);
  if (sub === 'vault') return cmdVault(rest, ctx);
  if (sub === 'spend') return cmdSpend(rest, ctx);
  if (sub === 'telemetry') return cmdTelemetry(rest, ctx);
  if (sub === 'update') return cmdUpdate(rest, ctx);

  showHelp(ctx);
}

function showHelp(ctx) {
  const { C, col } = ctx;
  console.log(`\n  ${col(C.cyan, '💾 PURPCLAW POCKET OS')}\n`);
  console.log(`  ${col(C.cyan, 'purpclaw pocket init')}                initialize Pocket directory`);
  console.log(`  ${col(C.cyan, 'purpclaw pocket mode <offline|hybrid|cloud|dev>')}  set runtime mode`);
  console.log(`  ${col(C.cyan, 'purpclaw pocket start')}               start the Pocket stack`);
  console.log(`  ${col(C.cyan, 'purpclaw pocket stop')}                stop the Pocket stack`);
  console.log(`  ${col(C.cyan, 'purpclaw pocket status')}              show Pocket state + services`);
  console.log(`  ${col(C.cyan, 'purpclaw pocket detect')}              scan host environment`);
  console.log(`  ${col(C.cyan, 'purpclaw pocket backup <dest>')}       create portable snapshot`);
  console.log(`  ${col(C.cyan, 'purpclaw pocket restore <archive>')}   restore from snapshot`);
  console.log(`  ${col(C.cyan, 'purpclaw pocket update check')}          check for updates`);
  console.log(`  ${col(C.cyan, 'purpclaw pocket update channel <c>')}   set channel (stable/beta/dev)`);
  console.log(`  ${col(C.cyan, 'purpclaw pocket update rollback')}      restore from backup`);
  console.log(`  ${col(C.cyan, 'purpclaw pocket vault init|set|get|list')}  encrypted secret store`);
  console.log(`  ${col(C.cyan, 'purpclaw pocket spend status|config|reset|check')}  budget guard`);
  console.log(`  ${col(C.cyan, 'purpclaw pocket telemetry status|export|clear|preferences')}  private learning\n`);
}

async function cmdInit(ctx) {
  const { C, col } = ctx;
  const state = readState();

  console.log(`\n  ${col(C.cyan, '💾 INITIALIZING POCKET OS')}\n`);

  // Create pocket directory structure
  const dirs = [
    'pocket/models',
    'pocket/memory',
    'pocket/vault',
    'pocket/updates',
    'pocket/docs',
    'pocket/recovery',
    'pocket/logs',
    'pocket/profile',
  ];
  for (const d of dirs) {
    const p = path.join(PURP_DIR, d);
    if (!fs.existsSync(p)) {
      fs.mkdirSync(p, { recursive: true });
      console.log(`  ${col(C.green, '✓')}  created ${d}/`);
    }
  }

  // Run detect
  console.log(`\n  ${col(C.gray, 'Running environment detection...')}\n`);
  const detectPath = path.join(POCKET_DIR, 'detect.py');
  if (fs.existsSync(detectPath)) {
    try {
      const r = await execSafe('python', [detectPath], { timeoutMs: 15000 });
      if (r.ok) process.stdout.write(r.stdout);
    } catch {}
  }

  // Mark initialized
  state.initialized = true;
  state.profile = 'default';
  state.createdAt = new Date().toISOString();
  writeState(state);

  console.log(`\n  ${col(C.green, '✓')}  Pocket OS initialized at ${POCKET_DIR}`);
  console.log(`  ${col(C.gray, 'Next: purpclaw pocket mode <offline|hybrid|cloud|dev>')}\n`);
}

async function cmdMode(args, ctx) {
  const { C, col } = ctx;
  const mode = (args[0] || '').toLowerCase();

  const valid = ['offline', 'hybrid', 'cloud', 'dev'];
  if (!valid.includes(mode)) {
    console.log(`\n  ${col(C.yellow, 'usage:')} purpclaw pocket mode <offline|hybrid|cloud|dev>\n`);
    return;
  }

  const state = readState();
  state.mode = mode;
  writeState(state);

  const descriptions = {
    offline: 'Local models only — fully air-gappable',
    hybrid:  'Local memory + external APIs — balanced',
    cloud:   'API-first, local telemetry/memory',
    dev:     'Full CLI, logs, agents, all tools exposed',
  };

  console.log(`\n  ${col(C.green, '✓')}  Pocket mode: ${col(C.cyan, mode)}`);
  console.log(`  ${col(C.gray, descriptions[mode])}\n`);

  // Write to .env so provider router picks it up
  const envPath = path.join(PURP_DIR, '.env');
  if (fs.existsSync(envPath)) {
    let env = fs.readFileSync(envPath, 'utf8');
    const line = `POCKET_MODE=${mode}`;
    if (env.match(/^POCKET_MODE=.*$/m)) {
      env = env.replace(/^POCKET_MODE=.*$/m, line);
    } else {
      env += `\n${line}\n`;
    }
    fs.writeFileSync(envPath, env);
    console.log(`  ${col(C.gray, 'Written POCKET_MODE=' + mode + ' to .env')}\n`);
  }
}

async function cmdStart(ctx) {
  const { C, col } = ctx;
  const state = readState();

  if (!state.initialized) {
    console.log(`\n  ${col(C.yellow, '⚠')}  Pocket OS not initialized. Run: purpclaw pocket init\n`);
    return;
  }

  console.log(`\n  ${col(C.cyan, '🚀 STARTING POCKET OS')}  ${col(C.gray, 'mode=' + (state.mode || 'unset'))}\n`);

  // Boot the standard core services
  try {
    require('child_process').execSync('node bin/purpclaw.js safe-start --core', {
      cwd: PURP_DIR,
      stdio: 'inherit',
      timeout: 60000,
    });
  } catch (e) {
    console.log(`  ${col(C.yellow, '⚠')}  ${e.message.split('\n')[0]}`);
  }

  // Wait + health check
  await new Promise(r => setTimeout(r, 8000));
  const http = require('http');
  const ok = await new Promise(resolve => {
    const req = http.get({ hostname: '127.0.0.1', port: 7780, path: '/api/health', timeout: 3000 }, res => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });

  if (ok) {
    console.log(`  ${col(C.green, '✓')}  Pocket OS running`);
    console.log(`  ${col(C.gray, 'Dashboard: http://localhost:3000')}\n`);
  } else {
    console.log(`  ${col(C.yellow, '⚠')}  Some services may not be ready. Check: purpclaw status\n`);
  }
}

async function cmdStop(ctx) {
  const { C, col } = ctx;
  console.log(`\n  ${col(C.cyan, '⏹')}  Stopping Pocket OS...\n`);
  try {
    require('child_process').execSync('node bin/purpclaw.js stop', {
      cwd: PURP_DIR,
      stdio: 'inherit',
      timeout: 30000,
    });
  } catch {}
  console.log(`  ${col(C.green, '✓')}  Stopped\n`);
}

async function cmdStatus(ctx) {
  const { C, col } = ctx;
  const state = readState();
  console.log(`\n  ${col(C.cyan, '💾 POCKET OS STATUS')}\n`);
  console.log(`  ${col(C.gray, 'Initialized:')} ${state.initialized ? col(C.green, 'yes') : col(C.yellow, 'no')}`);
  console.log(`  ${col(C.gray, 'Mode:        ')} ${col(C.cyan, state.mode || 'unset')}`);
  console.log(`  ${col(C.gray, 'Profile:     ')} ${state.profile || 'default'}`);
  console.log(`  ${col(C.gray, 'Directory:   ')} ${POCKET_DIR}`);
  if (state.createdAt) console.log(`  ${col(C.gray, 'Created:     ')} ${state.createdAt}`);
  console.log();
}

async function cmdDetect(ctx) {
  const { C, col } = ctx;
  const detectPath = path.join(POCKET_DIR, 'detect.py');
  if (fs.existsSync(detectPath)) {
    try {
      const r = await execSafe('python', [detectPath], { timeoutMs: 15000 });
      if (r.ok) process.stdout.write(r.stdout);
    } catch (e) {
      console.log(`\n  ${col(C.yellow, '⚠')}  detect.py failed: ${e.message}\n`);
    }
  } else {
    console.log(`\n  ${col(C.yellow, '⚠')}  detect.py not found at ${detectPath}\n`);
  }
}

async function cmdBackup(args, ctx) {
  const { C, col } = ctx;
  const dest = args[0] || path.join(os.homedir(), 'purpclaw-backup-' + Date.now() + '.zip');

  console.log(`\n  ${col(C.cyan, '📦 CREATING POCKET BACKUP')}\n`);

  const items = [
    '.env',
    'model_registry.json',
    'pocket/profile',
    'pocket/memory',
    'pocket/vault',
    'skills',
  ];

  const existing = items.filter(i => fs.existsSync(path.join(PURP_DIR, i)));
  console.log(`  Backing up: ${existing.join(', ')}`);

  // Use tar for portability
  try {
    const tar = require('child_process').execSync(
      `tar -czf "${dest}" ${existing.map(i => `"${i}"`).join(' ')}`,
      { cwd: PURP_DIR, stdio: 'pipe', timeout: 60000 }
    );
    const stat = fs.statSync(dest);
    console.log(`  ${col(C.green, '✓')}  Backup created: ${dest} (${(stat.size / 1024).toFixed(0)} KB)\n`);
  } catch (e) {
    // Try zip on Windows
    try {
      const ps = require('child_process').execSync(
        `powershell -NoProfile -Command "Compress-Archive -Path ${existing.map(i => `'${i}'`).join(',')} -DestinationPath '${dest}' -Force"`,
        { cwd: PURP_DIR, stdio: 'pipe', timeout: 60000 }
      );
      console.log(`  ${col(C.green, '✓')}  Backup created: ${dest}\n`);
    } catch (e2) {
      console.log(`  ${col(C.red, '✗')}  Backup failed: ${e2.message}\n`);
    }
  }
}

async function cmdRestore(args, ctx) {
  const { C, col } = ctx;
  const archive = args[0];
  if (!archive || !fs.existsSync(archive)) {
    console.log(`\n  ${col(C.yellow, 'usage:')} purpclaw pocket restore <archive>\n`);
    return;
  }

  console.log(`\n  ${col(C.cyan, '📥 RESTORING POCKET FROM BACKUP')}\n`);
  console.log(`  ${col(C.yellow, '⚠')}  This will overwrite current settings.\n`);

  try {
    if (archive.endsWith('.zip')) {
      require('child_process').execSync(
        `powershell -NoProfile -Command "Expand-Archive -Path '${archive}' -DestinationPath . -Force"`,
        { cwd: PURP_DIR, stdio: 'inherit', timeout: 60000 }
      );
    } else {
      require('child_process').execSync(
        `tar -xzf "${archive}"`,
        { cwd: PURP_DIR, stdio: 'inherit', timeout: 60000 }
      );
    }
    console.log(`  ${col(C.green, '✓')}  Restored from ${archive}\n`);
  } catch (e) {
    console.log(`  ${col(C.red, '✗')}  Restore failed: ${e.message}\n`);
  }
}

async function cmdPackage(args, ctx) {
  const { C, col } = ctx;
  const dest = args[0] || path.join(os.homedir(), 'purpclaw-pocket-' + Date.now() + '.zip');

  console.log(`\n  ${col(C.cyan, '📦 PACKAGING POCKET OS BUNDLE')}\n`);
  console.log(`  This creates a portable USB-ready archive.\n`);

  // What to include: just the PurpClaw essentials, not the full repo
  const items = [
    'bin',
    'lib',
    'pocket',
    'scripts',
    'package.json',
    'model_registry.json',
    '.env.example',
  ];
  const existing = items.filter(i => fs.existsSync(path.join(PURP_DIR, i)));

  try {
    const ps = require('child_process').execSync(
      `powershell -NoProfile -Command "Compress-Archive -Path ${existing.map(i => `'${i}'`).join(',')} -DestinationPath '${dest}' -Force"`,
      { cwd: PURP_DIR, stdio: 'pipe', timeout: 120000 }
    );
    const stat = fs.statSync(dest);
    console.log(`  ${col(C.green, '✓')}  Pocket bundle: ${dest}`);
    console.log(`  ${col(C.gray, `Size: ${(stat.size / 1024 / 1024).toFixed(1)} MB`)}`);
    console.log(`  ${col(C.gray, `Contents: ${existing.length} items`)}\n`);
  } catch (e) {
    console.log(`  ${col(C.red, '✗')}  Packaging failed: ${e.message}\n`);
  }
}

// ── Vault subcommand ──────────────────────────────────────
async function cmdVault(args, ctx) {
  const { C, col } = ctx;
  const { PocketVault } = require('../pocket-vault');
  const vaultPath = path.join(POCKET_DIR, 'vault.enc');
  const v = new PocketVault(vaultPath);

  const action = (args[0] || '').toLowerCase();

  if (!action || action === 'help') {
    console.log(`\n  ${col(C.cyan, '🔐 POCKET VAULT')}\n`);
    console.log(`  ${col(C.cyan, 'purpclaw pocket vault init')}             create a new vault`);
    console.log(`  ${col(C.cyan, 'purpclaw pocket vault unlock')}          unlock existing vault`);
    console.log(`  ${col(C.cyan, 'purpclaw pocket vault set <k> <v>')}     store a secret`);
    console.log(`  ${col(C.cyan, 'purpclaw pocket vault get <k>')}         retrieve a secret`);
    console.log(`  ${col(C.cyan, 'purpclaw pocket vault list')}            show stored key names`);
    console.log(`  ${col(C.cyan, 'purpclaw pocket vault delete <k>')}      remove a secret\n`);
    return;
  }

  if (action === 'init') {
    if (fs.existsSync(vaultPath)) {
      console.log(`\n  ${col(C.yellow, '⚠')}  Vault already exists at ${vaultPath}\n`);
      return;
    }
    const readline = require('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ask = (q) => new Promise(r => rl.question(q, r));
    const pw = await ask('  Master password (min 8 chars): ');
    rl.close();
    if (pw.length < 8) {
      console.log(`  ${col(C.red, '✗')}  Password too short\n`);
      return;
    }
    try {
      const { recoveryKey } = v.init(pw);
      console.log(`  ${col(C.green, '✓')}  Vault created at ${vaultPath}`);
      console.log(`  ${col(C.yellow, '⚠')}  Recovery key: ${recoveryKey}`);
      console.log(`  ${col(C.gray, '  Store this somewhere safe.')} \n`);
    } catch (e) {
      console.log(`  ${col(C.red, '✗')}  ${e.message}\n`);
    }
    return;
  }

  if (action === 'unlock') {
    const readline = require('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ask = (q) => new Promise(r => rl.question(q, r));
    const pw = await ask('  Master password: ');
    rl.close();
    try {
      v.unlock(pw);
      console.log(`  ${col(C.green, '✓')}  Vault unlocked\n`);
    } catch (e) {
      console.log(`  ${col(C.red, '✗')}  ${e.message}\n`);
    }
    return;
  }

  if (action === 'set') {
    const key = args[1];
    const value = args[2];
    if (!key || !value) {
      console.log(`\n  ${col(C.yellow, 'usage:')} purpclaw pocket vault set <key> <value>\n`);
      return;
    }
    try {
      v.set(key, value);
      console.log(`  ${col(C.green, '✓')}  Stored ${key}\n`);
    } catch (e) {
      console.log(`  ${col(C.red, '✗')}  ${e.message}\n`);
    }
    return;
  }

  if (action === 'get') {
    const key = args[1];
    if (!key) {
      console.log(`\n  ${col(C.yellow, 'usage:')} purpclaw pocket vault get <key>\n`);
      return;
    }
    try {
      const val = v.get(key);
      console.log(`  ${val || col(C.gray, '(not set)')}\n`);
    } catch (e) {
      console.log(`  ${col(C.red, '✗')}  ${e.message}\n`);
    }
    return;
  }

  if (action === 'list') {
    try {
      const keys = v.list();
      console.log(`\n  ${col(C.cyan, 'Stored keys:')}`);
      if (keys.length === 0) console.log(`  ${col(C.gray, '  (empty)')}`);
      else for (const k of keys) console.log(`  • ${k}`);
      console.log('');
    } catch (e) {
      console.log(`  ${col(C.red, '✗')}  ${e.message}\n`);
    }
    return;
  }

  if (action === 'delete') {
    const key = args[1];
    if (!key) {
      console.log(`\n  ${col(C.yellow, 'usage:')} purpclaw pocket vault delete <key>\n`);
      return;
    }
    try {
      v.delete(key);
      console.log(`  ${col(C.green, '✓')}  Deleted ${key}\n`);
    } catch (e) {
      console.log(`  ${col(C.red, '✗')}  ${e.message}\n`);
    }
    return;
  }
}

// ── Spend subcommand ──────────────────────────────────────
async function cmdSpend(args, ctx) {
  const { C, col } = ctx;
  const { SpendGate } = require('../spend-gate');
  const gate = new SpendGate();

  const action = (args[0] || 'status').toLowerCase();

  if (action === 'status' || !action) {
    const s = gate.getStatus();
    console.log(`\n  ${col(C.cyan, '💰 SPEND STATUS')}\n`);
    console.log(`  ${col(C.gray, `Day:     ${s.day}`)}`);
    console.log(`  ${col(C.gray, `Tokens:  ${s.dailyTokens.toLocaleString()} / ${s.dailyCap.toLocaleString()}`)} (${(s.dailyUsedFrac * 100).toFixed(1)}%)`);
    console.log(`  ${col(C.gray, `Reqs:    ${s.dailyRequests}`)}`);
    console.log(`  ${col(C.gray, `Cost:    $${s.dailyCost}`)}`);
    console.log(`  ${col(C.gray, `Month:   ${s.monthlyTokens.toLocaleString()} / ${s.monthlyCap.toLocaleString()}`)} (${(s.monthlyUsedFrac * 100).toFixed(2)}%)`);
    console.log(`  ${col(C.gray, `Rate:    ${s.recentRate}/min`)}\n`);
    return;
  }

  if (action === 'config') {
    const sub = args[1];
    if (sub === 'show') {
      console.log(`\n  ${col(C.cyan, '💰 SPEND CONFIG')}\n`);
      const cfg = gate.getConfig();
      for (const [k, v] of Object.entries(cfg)) {
        if (typeof v === 'object' && v !== null) {
          console.log(`  ${col(C.gray, k + ':')}`);
          for (const [k2, v2] of Object.entries(v)) {
            console.log(`    ${k2}: ${v2}`);
          }
        } else {
          console.log(`  ${k}: ${v}`);
        }
      }
      console.log('');
      return;
    }
    if (sub === 'set' && args[2] && args[3]) {
      const key = args[2];
      const val = isNaN(args[3]) ? args[3] : Number(args[3]);
      try {
        gate.configure({ [key]: val });
        console.log(`  ${col(C.green, '✓')}  Set ${key} = ${val}\n`);
      } catch (e) {
        console.log(`  ${col(C.red, '✗')}  ${e.message}\n`);
      }
      return;
    }
    console.log(`\n  ${col(C.yellow, 'usage:')} purpclaw pocket spend config show|set <key> <value>\n`);
    return;
  }

  if (action === 'reset') {
    gate.reset();
    console.log(`  ${col(C.green, '✓')}  Spend counters reset\n`);
    return;
  }

  if (action === 'check') {
    const agent = args[1] || 'test';
    const provider = args[2] || 'ollama';
    const tokens = parseInt(args[3] || '1000', 10);
    const r = gate.check({ agent, provider, estimatedTokens: tokens });
    console.log(`\n  Check ${agent}/${provider}/${tokens} tokens: ${r.allow ? col(C.green, 'ALLOW') : col(C.red, 'DENY')}`);
    if (r.reason) console.log(`  ${col(C.gray, r.reason)}`);
    if (r.remaining) console.log(`  ${col(C.gray, `remaining: ${r.remaining.dailyTokens}`)}\n`);
    return;
  }
}

// ── Telemetry subcommand ─────────────────────────────────
async function cmdTelemetry(args, ctx) {
  const { C, col } = ctx;
  const { Telemetry } = require('../telemetry');
  const t = new Telemetry();

  const action = (args[0] || 'status').toLowerCase();

  if (action === 'status' || !action) {
    const s = t.summary();
    console.log(`\n  ${col(C.cyan, '📊 TELEMETRY STATUS')}\n`);
    console.log(`  ${col(C.gray, `Total events: ${s.total}`)}`);
    console.log(`  ${col(C.gray, `Total tokens: ${s.totalTokens.toLocaleString()}`)}`);
    console.log(`  ${col(C.gray, `Total latency: ${(s.totalLatency / 1000).toFixed(1)}s`)}`);
    console.log(`  ${col(C.gray, `Provider success: ${s.successRate}%`)}`);
    if (Object.keys(s.byType).length > 0) {
      console.log(`\n  ${col(C.gray, 'By type:')}`);
      for (const [k, v] of Object.entries(s.byType)) {
        console.log(`    ${k}: ${v}`);
      }
    }
    if (Object.keys(s.byProvider).length > 0) {
      console.log(`\n  ${col(C.gray, 'By provider:')}`);
      for (const [k, v] of Object.entries(s.byProvider)) {
        console.log(`    ${k}: ${v}`);
      }
    }
    console.log('');
    return;
  }

  if (action === 'export') {
    const r = t.export();
    console.log(`  ${col(C.green, '✓')}  Exported ${r.count} events to ${r.path}\n`);
    return;
  }

  if (action === 'clear') {
    t.clear();
    console.log(`  ${col(C.green, '✓')}  Telemetry cleared\n`);
    return;
  }

  if (action === 'preferences') {
    const p = t.preferences();
    console.log(`\n  ${col(C.cyan, '🎯 LEARNED PREFERENCES')}\n`);
    if (p.patterns.length === 0) {
      console.log(`  ${col(C.gray, 'No corrections yet')}`);
    } else {
      for (const pat of p.patterns.slice(0, 10)) {
        console.log(`  ${col(C.gray, `(${pat.count}×)`)} ${pat.before} → ${pat.after}`);
      }
    }
    console.log('');
    return;
  }
}

// ── Update subcommand ──────────────────────────────────────
async function cmdUpdate(args, ctx) {
  const { C, col } = ctx;
  const { PocketUpdater } = require('../pocket-updater');
  const updater = new PocketUpdater();

  const action = (args[0] || 'status').toLowerCase();

  if (action === 'check') {
    console.log(`\n  ${col(C.cyan, '🔄 CHECKING FOR UPDATES')}...\n`);
    const r = await updater.check();
    if (!r.ok) {
      console.log(`  ${col(C.yellow, '⚠')}  ${r.error}`);
      console.log(`  ${col(C.gray, `Channel: ${r.channel}, Current: ${r.current || 'unknown'}`)}\n`);
      return;
    }
    console.log(`  Channel: ${col(C.cyan, r.channel)}`);
    console.log(`  Current: ${r.current || 'unknown'}`);
    console.log(`  Latest:  ${col(C.green, r.available)}`);
    if (r.updateAvailable) {
      console.log(`  ${col(C.green, '✓ Update available')}`);
      if (r.notes) console.log(`  ${col(C.gray, r.notes)}`);
    } else {
      console.log(`  ${col(C.gray, 'Already up to date')}`);
    }
    console.log('');
    return;
  }

  if (action === 'channel') {
    const ch = args[1];
    const r = updater.setChannel(ch);
    if (r.ok) {
      console.log(`  ${col(C.green, '✓')}  Channel set to ${col(C.cyan, r.channel)}\n`);
    } else {
      console.log(`  ${col(C.red, '✗')}  ${r.error}\n`);
    }
    return;
  }

  if (action === 'rollback') {
    const r = await updater.rollback(args[1]);
    if (r.ok) console.log(`  ${col(C.green, '✓')}  Restored from ${r.restored}\n`);
    else console.log(`  ${col(C.red, '✗')}  ${r.error}\n`);
    return;
  }

  // Default: status
  const s = updater.status();
  console.log(`\n  ${col(C.cyan, '🔄 UPDATER STATUS')}\n`);
  console.log(`  ${col(C.gray, `Channel:      ${s.channel}`)}`);
  console.log(`  ${col(C.gray, `Last check:   ${s.lastCheck || 'never'}`)}`);
  console.log(`  ${col(C.gray, `Last update:  ${s.lastUpdate || 'never'}`)}`);
  console.log(`  ${col(C.gray, `Version:      ${s.lastVersion || 'unknown'}`)}`);
  console.log(`  ${col(C.gray, `Backups:      ${s.backupCount}`)}\n`);
}

module.exports = { run };
