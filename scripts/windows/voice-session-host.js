#!/usr/bin/env node
'use strict';

const path = require('path');
const { trackedSpawn, killAll, installCleanup } = require('../../lib/child-registry');
const settings = require('../../lib/runtime/settings-registry');
const { PROJECT_ROOT } = require('../../lib/paths');

installCleanup();

function launch(command, args, tag) {
  return trackedSpawn(command, args, {
    cwd: PROJECT_ROOT,
    stdio: 'ignore',
    timeoutMs: 0,
    windowsHide: true,
    tag,
  });
}

async function online(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
    return response.ok;
  } catch {
    return false;
  }
}

async function main() {
  if (!await online('http://127.0.0.1:7792/health')) {
    launch(process.execPath, [path.join(PROJECT_ROOT, 'voice_bridge_7792.js')], 'voice-bridge-user-session');
  }
  if (!await online('http://127.0.0.1:7781/health')) {
    launch(process.execPath, [path.join(PROJECT_ROOT, 'voice_coordinator.js')], 'voice-coordinator-user-session');
  }

  const microphoneEnabled = settings.get('voice.sttEnabled')?.value === true;
  if (microphoneEnabled) {
    if (!await online(`http://127.0.0.1:${process.env.STT_PORT || 7896}/health`)) {
      const python = process.env.PYTHON_BIN || 'python';
      launch(python, [path.join(PROJECT_ROOT, 'voice_stt.py'), '--port', process.env.STT_PORT || '7896'], 'voice-stt-user-session');
      await new Promise(resolve => setTimeout(resolve, 4000));
    }
    launch(process.execPath, [path.join(PROJECT_ROOT, 'voice_ingress.js')], 'voice-ingress-user-session');
  }
  console.log(`[voice-session-host] voice gateway online; microphone=${microphoneEnabled ? 'enabled' : 'disabled'}`);
}

main().catch(error => {
  console.error(`[voice-session-host] ${error.message}`);
  process.exitCode = 1;
});
process.on('SIGINT', () => killAll());
process.on('SIGTERM', () => killAll());
setInterval(() => {}, 60000);
