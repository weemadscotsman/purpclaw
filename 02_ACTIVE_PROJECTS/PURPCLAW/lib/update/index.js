'use strict';
/**
 * lib/update/index.js — the ONE canonical live-update entrypoint.
 *
 * Both `purpclaw update <sub>` (lib/commands/update.js) and the interactive
 * `/update` slash (lib/commands/ask.js) build their manager from here, so
 * there is exactly one updater with one set of supervisor callbacks — per the
 * live-update handoff ("do not invent a second updater").
 *
 * HONEST SCOPE: the manager's release bookkeeping (inbox scan, hash-verify,
 * stage, atomic current/previous pointer flip, rollback, events, history) is
 * fully wired and tested (tests/update/update-contract.test.js). The callbacks
 * below do the real thing they can do today — restart the replaceable backend
 * so the new release's services come up. What is NOT yet wired: booting the
 * runtime FROM <dataRoot>/runtime/releases/<current> and a deep filesystem
 * snapshot. Those need the stable bootstrap/supervisor (handoff §1/§6). Rollback
 * is still real via the previous.json pointer + backend restart.
 */
const path = require('path');
const { spawn } = require('child_process');
const { UpdateManager } = require('./update-manager');
const { makeUpdateSlashHandler } = require('./slash-update');

const ROOT = path.resolve(__dirname, '..', '..');
const DATA_ROOT = process.env.PURPCLAW_DATA || path.join(ROOT, '.purpclaw');

function restartBackend(reason, print) {
  return new Promise(res => {
    if (process.env.PURPCLAW_UPDATE_RESTART === '0') { print(`  [update] backend restart skipped (${reason})`); return res(); }
    print(`  [update] reloading backend services to newest code (${reason})...`);
    const c = spawn(process.execPath, [path.join(ROOT, 'bin', 'purpclaw.js'), 'safe-start', '--core'],
      { cwd: ROOT, stdio: 'inherit' });
    c.on('exit', () => res());
    c.on('error', () => res());
  });
}

function createManager({ print = console.log } = {}) {
  const mgr = new UpdateManager({
    dataRoot: DATA_ROOT,
    createSnapshot: async () => null,          // pointer rollback is real; deep snapshot = supervisor TODO
    activateRelease: async ({ next }) => { await restartBackend(`activate ${next.version}`, print); },
    rollbackRuntime: async ({ previous }) => { await restartBackend(`rollback ${previous && previous.version}`, print); },
  });
  if (process.env.PURPCLAW_UPDATE_EVENTS === '1') mgr.on('event', e => process.stderr.write(JSON.stringify(e) + '\n'));
  return mgr;
}

module.exports = { createManager, makeUpdateSlashHandler, DATA_ROOT, ROOT };
