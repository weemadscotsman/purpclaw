'use strict';

/**
 * lib/awaken/awaken-state.js
 * Lightweight run markers — read by heartbeat, written by awaken-loop
 */

const path = require('path');
const fs   = require('fs');

const STATE_FILE = path.join(__dirname, '..', '..', 'agent_work', 'awaken', 'awaken-state.json');

const DEFAULT_STATE = {
  last_awaken_started_at:  null,   // ISO
  last_awaken_finished_at: null,   // ISO
  last_reviewed_change_at: null,   // ISO — mirrors heartbeatReviewedChange convention
  last_awaken_result:      null,   // 'clean' | 'warnings' | 'errors' | 'aborted' | null
  last_run_id:             null,   // run id of last run
  total_runs:              0,
  consecutive_fails:         0,
  mode:                     null,   // last mode used
};

let _state = null;

function read() {
  if (_state !== null) return _state;
  try {
    if (fs.existsSync(STATE_FILE)) {
      _state = { ...DEFAULT_STATE, ...JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) };
    } else {
      _state = { ...DEFAULT_STATE };
    }
  } catch {
    _state = { ...DEFAULT_STATE };
  }
  return _state;
}

function write(updates) {
  _state = { ...read(), ...updates };
  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(_state, null, 2));
  } catch (e) {
    console.error('[awaken-state] write failed:', e.message);
  }
  return _state;
}

function reset() {
  _state = { ...DEFAULT_STATE };
  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(_state, null, 2));
  } catch (_) {}
}

module.exports = { read, write, reset, STATE_FILE };
