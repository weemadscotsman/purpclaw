'use strict';
/**
 * lib/runtime/identity.js — the ONE canonical runtime identity.
 *
 * Every surface (CLI, TUI, Web, Desktop, Mobile) and every service reads the
 * same runtimeId from <PURPCLAW_DATA>/runtime/identity.json. It is created
 * exactly once (exclusive create — first writer wins, everyone else reads the
 * winner), so all surfaces prove they attach to one runtime. See spec §15
 * (canonical health) and acceptance single-runtime-multisurface.
 *
 * runtimeId is stable across restarts (persisted). `version` is read live from
 * package.json so it always reflects the running code.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const DATA = process.env.PURPCLAW_DATA || path.join(ROOT, '.purpclaw');
const ID_FILE = path.join(DATA, 'runtime', 'identity.json');

function pkgVersion() {
  try { return require(path.join(ROOT, 'package.json')).version || '0.0.0'; } catch { return '0.0.0'; }
}

function ensureIdentity() {
  try { return JSON.parse(fs.readFileSync(ID_FILE, 'utf8')); } catch {}
  const identity = {
    runtimeId: 'rt-' + crypto.randomUUID(),
    profile: process.env.PURPCLAW_PROFILE || 'operator',
    workspace: process.env.PURPCLAW_WORKSPACE || 'canonical',
    schemaVersion: '1.0.0',
    createdAt: new Date().toISOString(),
  };
  try {
    fs.mkdirSync(path.dirname(ID_FILE), { recursive: true });
    const fd = fs.openSync(ID_FILE, 'wx'); // exclusive — only one writer wins
    fs.writeSync(fd, JSON.stringify(identity, null, 2));
    fs.closeSync(fd);
    return identity;
  } catch (e) {
    if (e.code === 'EEXIST') { try { return JSON.parse(fs.readFileSync(ID_FILE, 'utf8')); } catch {} }
    return identity; // last-resort ephemeral (data dir unwritable)
  }
}

/** The canonical runtime identity, with live version. */
function identity() {
  return { ...ensureIdentity(), version: pkgVersion() };
}

module.exports = { identity, ID_FILE };

if (require.main === module) console.log(JSON.stringify(identity(), null, 2));
