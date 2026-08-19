'use strict';

function makeUpdateSlashHandler(updateManager, io = {}) {
  const print = io.print || (line => console.log(line));

  function showStatus(s) {
    print(`[update] current: ${s.current?.version || 'unmanaged'}`);
    print(`[update] channel: ${s.channel}`);
    print(`[update] auto: ${s.autoMode}`);
    print(`[update] rollback: ${s.rollbackAvailable ? (s.previous?.version || 'yes') : 'none'}`);
    if (s.candidates?.length) print(`[update] candidate: ${s.candidates[0].manifest.version}`);
  }

  return async function handleUpdateSlash(raw) {
    const input = String(raw || '').trim();
    const parts = input.split(/\s+/).filter(Boolean);
    if (parts[0] === '/update') parts.shift();

    const cmd = parts.shift() || 'status';

    if (cmd === 'status') {
      const s = await updateManager.status();
      showStatus(s);
      return { handled: true, result: s };
    }

    if (cmd === 'check') {
      const s = await updateManager.status();
      if (s.candidates.length) print(`[update] candidate ${s.candidates[0].manifest.version}`);
      else print('[update] no local candidate');
      return { handled: true, result: s.candidates };
    }

    if (cmd === 'auto') {
      const mode = parts.shift();
      if (!mode) throw new Error('usage: /update auto off|notify|safe|aggressive');
      const s = await updateManager.setAutoMode(mode);
      print(`[update] auto mode: ${s.autoMode}`);
      return { handled: true, result: s };
    }

    if (cmd === 'channel') {
      const channel = parts.shift();
      if (!channel) throw new Error('usage: /update channel local|dev|stable');
      const s = await updateManager.setChannel(channel);
      print(`[update] channel: ${s.channel}`);
      return { handled: true, result: s };
    }

    if (cmd === 'apply') {
      let source = parts.join(' ').trim();
      if (!source) {
        const s = await updateManager.status();
        if (!s.candidates.length) throw new Error('no update candidate found');
        source = s.candidates[0].source;
      }

      print(`[update] staging ${source}`);
      const result = await updateManager.applyDirectory(source);
      print(`[update] now on ${result.current.version}`);
      return { handled: true, result };
    }

    if (cmd === 'rollback') {
      const result = await updateManager.rollback();
      print(`[update] rolled back to ${result.current.version}`);
      return { handled: true, result };
    }

    if (cmd === 'history') {
      print(`[update] history: ${updateManager.historyFile}`);
      return { handled: true, result: { historyFile: updateManager.historyFile } };
    }

    throw new Error(`unknown /update command: ${cmd}`);
  };
}

module.exports = { makeUpdateSlashHandler };
