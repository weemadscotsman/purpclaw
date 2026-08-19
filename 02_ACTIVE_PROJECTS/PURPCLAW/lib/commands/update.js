'use strict';
/**
 * lib/commands/update.js — live "update to newest" for the operator loop.
 *
 * The CLI already loads fresh from disk on every invocation, so `purpclaw`
 * commands are always on the newest code. What this command adds:
 *   - shows exactly what version/commit you're on (confirm you have my latest),
 *   - --log      : recent commits so you can see what changed,
 *   - --restart  : reload the long-running BACKEND services to newest code
 *                  (safe-start --core), since those don't auto-refresh,
 *   - --pull     : fast-forward from a git remote if one is configured & ahead.
 *
 * Inside the interactive REPL (`purpclaw ask` / `chat`) the `/update` slash
 * re-execs the REPL into newest code — see lib/commands/ask.js.
 */
const { execSync, spawn } = require('child_process');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');

function sh(cmd) {
  try { return execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { return ''; }
}

function status() {
  let pkg = '?';
  try { pkg = require(path.join(ROOT, 'package.json')).version || '?'; } catch {}
  return {
    version: pkg,
    sha: sh('git rev-parse --short HEAD'),
    subject: sh('git log -1 --pretty=%s'),
    branch: sh('git rev-parse --abbrev-ref HEAD'),
    // `-- .` scopes to the PURPCLAW subtree (git root is one level above).
    dirty: sh('git status --porcelain -- .').split('\n').filter(Boolean).length,
  };
}

async function run(args = []) {
  const s = status();
  if (args.includes('--json')) { console.log(JSON.stringify(s, null, 2)); return; }

  console.log(`\nPURPCLAW v${s.version}${s.sha ? `  (${s.sha})` : ''}  [${s.branch}]`);
  if (s.subject) console.log(`  head: ${s.subject}`);
  console.log(`  ${s.dirty ? `working tree: ${s.dirty} uncommitted change(s)` : 'working tree clean'}`);
  console.log(`  the CLI loads fresh from disk each run — you are already on the newest CLI code.`);

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
    console.log(`\n  reloading backend services to newest code (safe-start --core)...\n`);
    await new Promise(res => {
      const child = spawn(process.execPath, [path.join(ROOT, 'bin', 'purpclaw.js'), 'safe-start', '--core'],
        { cwd: ROOT, stdio: 'inherit' });
      child.on('exit', res);
      child.on('error', e => { console.error(`  restart failed: ${e.message}`); res(); });
    });
  } else {
    console.log(`\n  tip: 'purpclaw update --restart' also reloads the running backend services.`);
  }
}

module.exports = { name: 'update', run };
