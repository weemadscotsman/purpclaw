'use strict';
/**
 * lib/commands/update.js — `purpclaw update [subcommand]`, the one updater.
 *
 * Two paths, one command:
 *   MANAGED release path (live-update contract): status | check | apply [path] |
 *     rollback | history | auto <off|notify|safe|aggressive> | channel <local|dev|stable>.
 *     Backed by lib/update (UpdateManager): inbox scan, hash-verify, stage,
 *     atomic current/previous flip, rollback, canonical events.
 *   WORKING-TREE convenience path (bare `update`, or --log/--pull/--restart):
 *     the CLI already loads fresh from disk each run — this shows exactly what
 *     commit you're on and can reload the backend to your newest edits.
 */
const { execSync } = require('child_process');
const path = require('path');
const { createManager, makeUpdateSlashHandler } = require('../update');

const ROOT = path.resolve(__dirname, '..', '..');
const MANAGED = new Set(['status', 'check', 'apply', 'rollback', 'history', 'auto', 'channel']);

function sh(cmd) {
  try { return execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { return ''; }
}

function workingTree() {
  let version = '?';
  try { version = require(path.join(ROOT, 'package.json')).version || '?'; } catch {}
  return {
    version,
    sha: sh('git rev-parse --short HEAD'),
    subject: sh('git log -1 --pretty=%s'),
    branch: sh('git rev-parse --abbrev-ref HEAD'),
    dirty: sh('git status --porcelain -- .').split('\n').filter(Boolean).length,
  };
}

async function run(args = []) {
  const sub = String(args[0] || '').toLowerCase();

  // ── Managed release subcommands → shared UpdateManager via slash handler ──
  if (MANAGED.has(sub)) {
    const mgr = createManager();
    await mgr.init();
    const handler = makeUpdateSlashHandler(mgr);
    try { await handler('/update ' + args.join(' ')); }
    catch (e) { console.error(`[update] ${e.message}`); process.exitCode = 2; }
    return;
  }

  // ── Working-tree view (bare `update`, or with --log/--pull/--restart) ──
  const s = workingTree();
  const mgr = createManager();
  await mgr.init();
  const managed = await mgr.status();
  let runtime = null;
  try { runtime = require('../runtime/identity').identity(); } catch {}

  if (args.includes('--json')) {
    console.log(JSON.stringify({ workingTree: s, runtime, managed }, null, 2));
    return;
  }

  console.log(`\nPURPCLAW v${s.version}${s.sha ? `  (${s.sha})` : ''}  [${s.branch}]`);
  if (runtime) console.log(`  runtime: ${runtime.runtimeId}  ${runtime.profile}/${runtime.workspace}`);
  if (s.subject) console.log(`  head: ${s.subject}`);
  console.log(`  ${s.dirty ? `working tree: ${s.dirty} uncommitted change(s)` : 'working tree clean'}`);
  console.log(`  the CLI loads fresh from disk each run — you are already on the newest CLI code.`);
  console.log(`\n  managed runtime: current ${managed.current?.version || 'unmanaged'} · channel ${managed.channel} · auto ${managed.autoMode} · rollback ${managed.rollbackAvailable ? 'available' : 'none'}${managed.candidates.length ? ` · candidate ${managed.candidates[0].manifest.version}` : ''}`);
  console.log(`  subcommands: status | check | apply [path] | rollback | history | auto <mode> | channel <name>`);

  if (args.includes('--log')) {
    const log = sh('git log --oneline -8');
    if (log) console.log(`\n  recent commits:\n${log.split('\n').map(l => '    ' + l).join('\n')}`);
  }

  if (args.includes('--pull')) {
    const upstream = sh('git rev-parse --abbrev-ref --symbolic-full-name @{u}');
    if (!upstream) console.log(`\n  --pull: no upstream configured for ${s.branch}; nothing to pull.`);
    else {
      const behind = sh(`git rev-list --count HEAD..${upstream}`);
      if (behind && Number(behind) > 0) {
        console.log(`\n  --pull: ${behind} commit(s) behind ${upstream}, fast-forwarding...`);
        console.log('  ' + (sh('git pull --ff-only') || '(pull produced no output)'));
      } else console.log(`\n  --pull: up to date with ${upstream}.`);
    }
  }

  if (args.includes('--restart') || args.includes('-r')) {
    const { ROOT: R } = require('../update');
    const { spawn } = require('child_process');
    console.log(`\n  reloading backend services to newest code (safe-start --core)...\n`);
    await new Promise(res => {
      const child = spawn(process.execPath, [path.join(R, 'bin', 'purpclaw.js'), 'safe-start', '--core'],
        { cwd: R, stdio: 'inherit' });
      child.on('exit', res);
      child.on('error', e => { console.error(`  restart failed: ${e.message}`); res(); });
    });
  } else {
    console.log(`\n  tip: 'purpclaw update --restart' reloads running backend services; 'update apply' stages an inbox release.`);
  }
}

module.exports = { name: 'update', run };
