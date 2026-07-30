'use strict';

/**
 * lib/commands/loop.js
 * /loop — toggle continuous agent loop mode
 */
const ROOT = require('path').resolve(__dirname, '..');

let _loopEnabled = false;

function run(args) {
  const action = (args[0] || '').toLowerCase();
  if (action === 'on' || action === 'enable' || action === 'start') {
    _loopEnabled = true;
    return 'Agent loop: ENABLED\nPurpClaw will keep working after each response.\nNote: idle-engine handles autonomous optimization; /loop is for continuous chat.';
  }
  if (action === 'off' || action === 'disable' || action === 'stop') {
    _loopEnabled = false;
    return 'Agent loop: DISABLED';
  }
  return `Agent loop: ${_loopEnabled ? 'ENABLED' : 'DISABLED'}\nUsage: /loop on | off`;
}

module.exports = { run };
