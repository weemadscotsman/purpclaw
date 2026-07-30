'use strict';

/**
 * lib/commands/watch.js
 * purpclaw watch — File system watcher CLI
 *
 * Codex parity: codex file-watcher
 * Engine: lib/file-watcher.js (existing — chokidar + native fallback)
 */

const { createFileWatcher } = require('../file-watcher');
const path = require('path');
const fs   = require('fs');

const C = {
  reset  : '\x1b[0m',
  bold   : '\x1b[1m',
  dim    : '\x1b[2m',
  cyan   : '\x1b[36m',
  green  : '\x1b[32m',
  yellow : '\x1b[33m',
  red    : '\x1b[31m',
  gray   : '\x1b[90m',
};

const isTTY = process.stdout.isTTY;
const col   = function(c, s) { return isTTY ? c + s + C.reset : s; };

async function run(args, ctx) {
  const json    = args.indexOf('--json')    >= 0;
  const verbose = args.indexOf('--verbose') >= 0;
  const daemon  = args.indexOf('--daemon') >= 0;

  // Non-flag positional args
  const pos = args.filter(function(a) { return !a.startsWith('--'); });
  const sub = pos[0] || null;

  // watch stop
  if (sub === 'stop' || sub === 'kill') {
    if (!json) console.log(col(C.yellow, 'Use Ctrl+C to stop the watcher'));
    return;
  }

  // watch status
  if (!sub || sub === 'status') {
    if (!json) console.log(col(C.gray, 'purpclaw watch <dir>  —  Ctrl+C to stop'));
    return;
  }

  // watch <dir>
  const watchRoot = path.resolve(process.cwd(), sub);
  if (!fs.existsSync(watchRoot)) {
    const msg = 'Path does not exist: ' + watchRoot;
    if (json) process.stdout.write(JSON.stringify({ error: msg }) + '\n');
    else console.error(col(C.red, 'Error:') + ' ' + msg);
    return 1;
  }

  let changeCount = 0;
  const startTime = Date.now();
  let first = true;

  function formatEvent(ev) {
    var map = { add: C.green, change: C.yellow, unlink: C.red };
    return col(map[ev] || C.cyan, ev.padEnd(8));
  }

  function formatPath(p) {
    var rp = path.relative(watchRoot, p);
    if (rp && !rp.startsWith('..')) return rp;
    return p;
  }

  if (!json) {
    console.log(col(C.green, 'Watching') + '  ' + watchRoot);
    console.log(col(C.dim, '(Ctrl+C to stop)'));
  }

  var watcher;
  try {
    watcher = createFileWatcher(watchRoot, {
      onAdd: function(ev) {
        changeCount++;
        if (json) {
          process.stdout.write(JSON.stringify({
            event   : ev.type,
            path    : ev.filepath,
            rel     : formatPath(ev.filepath),
            count   : changeCount,
          }) + '\n');
        } else {
          var fp = formatPath(ev.filepath);
          var ext = path.extname(fp).slice(1);
          var type = ext ? '[' + ext.padEnd(4) + ']' : '        ';
          console.log(formatEvent('add') + '  ' + col(C.cyan, type) + '  ' + fp);
        }
      },
      onChange: function(ev) {
        changeCount++;
        if (json) {
          process.stdout.write(JSON.stringify({
            event   : ev.type,
            path    : ev.filepath,
            rel     : formatPath(ev.filepath),
            count   : changeCount,
          }) + '\n');
        } else {
          var fp = formatPath(ev.filepath);
          var ext = path.extname(fp).slice(1);
          var type = ext ? '[' + ext.padEnd(4) + ']' : '        ';
          console.log(formatEvent('change') + '  ' + col(C.cyan, type) + '  ' + fp);
        }
      },
      onUnlink: function(ev) {
        changeCount++;
        if (json) {
          process.stdout.write(JSON.stringify({
            event   : ev.type,
            path    : ev.filepath,
            rel     : formatPath(ev.filepath),
            count   : changeCount,
          }) + '\n');
        } else {
          var fp = formatPath(ev.filepath);
          console.log(formatEvent('unlink') + '  ' + fp);
        }
      },
    });
  } catch (err) {
    var msg = 'Failed to start watcher: ' + err.message;
    if (json) process.stdout.write(JSON.stringify({ error: msg }) + '\n');
    else console.error(col(C.red, msg));
    return 1;
  }

  process.on('SIGINT', function() {
    try { watcher.close(); } catch {}
    process.stdin.pause();
    if (!json) {
      console.log('\n' + col(C.yellow, 'Stopped') + ' — ' + changeCount + ' event(s) in ' + ((Date.now() - startTime) / 1000).toFixed(1) + 's');
    }
    process.exit(0);
  });

  // Keep process alive — watch runs async via chokidar
  process.stdin.resume();
  return;
}

module.exports = { run };
