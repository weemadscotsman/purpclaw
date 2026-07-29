'use strict';
/**
 * lib/commands/permissions.js — PURPCLAW interactive permissions manager.
 *
 *   purpclaw permissions          — interactive TUI for toggling permission categories
 *   purpclaw permissions --list   — show current state as JSON
 *   purpclaw permissions --allow <op>   — enable one operation
 *   purpclaw permissions --disallow <op> — disable one operation
 *
 * Permission categories:
 *   file_write   — write/edit/create files on disk
 *   shell_exec    — run arbitrary shell commands
 *   network       — make outbound HTTP/HTTPS requests
 *   agent_spawn   — spawn sub-agents or child processes
 *
 * Persisted to: ~/.purpclaw/permissions.json
 */

const fs   = require('fs');
const path = require('path');
const os   = require('os');

// ── State file ─────────────────────────────────────────────────────────────────
function statePath() {
  const home = os.homedir();
  const dir  = path.join(home, '.purpclaw');
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
  return path.join(dir, 'permissions.json');
}

const DEFAULTS = {
  file_write : true,
  shell_exec : false,
  network    : true,
  agent_spawn: false,
};

function loadPermissions() {
  try {
    const raw = fs.readFileSync(statePath(), 'utf-8');
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

function savePermissions(perms) {
  fs.writeFileSync(statePath(), JSON.stringify(perms, null, 2), 'utf-8');
}

// ── Operation metadata ──────────────────────────────────────────────────────────
const OPS = {
  file_write: {
    label    : 'File Write',
    description: 'Write, edit, or create files on disk (read is always allowed)',
    danger    : 'HIGH — can overwrite system or project files',
    color    : '31', // red
  },
  shell_exec: {
    label    : 'Shell Exec',
    description: 'Run arbitrary shell commands (bash, cmd, powershell)',
    danger    : 'CRITICAL — can run any command with user privileges',
    color    : '35', // magenta
  },
  network: {
    label    : 'Network',
    description: 'Make outbound HTTP/HTTPS requests to external services',
    danger    : 'MEDIUM — data exfil or DNS rebinding risk',
    color    : '33', // yellow
  },
  agent_spawn: {
    label    : 'Agent Spawn',
    description: 'Spawn sub-agents, child processes, or delegate tasks',
    danger    : 'HIGH — new agents have same permission scope',
    color    : '34', // blue
  },
};

const OP_KEYS = Object.keys(OPS);

// ── TUI render ─────────────────────────────────────────────────────────────────
function renderTable(perms, activeOp) {
  const W   = 72;
  const sep = `  ${'\x1b[90m' + '─'.repeat(W) + '\x1b[0m'}`;
  const rows = [];

  rows.push(`\n\x1b[1m  PURPCLAW Permissions Manager\x1b[0m  \x1b[90m~/.purpclaw/permissions.json\x1b[0m\n`);
  rows.push(sep);
  rows.push(`  \x1b[1m  OP            STATUS     DESCRIPTION\x1b[0m`);
  rows.push(sep);

  for (const op of OP_KEYS) {
    const meta    = OPS[op];
    const allowed = perms[op];
    const mark    = activeOp === op ? ' \x1b[7m▶\x1b[0m ' : '   '; // reverse video for selection
    const status  = allowed
      ? `\x1b[32mALLOWED \x1b[0m`
      : `\x1b[31mBLOCKED \x1b[0m`;
    const desc    = meta.description.padEnd(50);
    rows.push(`  ${mark}\x1b[${meta.color}m${String(meta.label).padEnd(12)}\x1b[0m ${status} \x1b[90m${desc}\x1b[0m`);
    rows.push(`       \x1b[31m⚠ ${meta.danger}\x1b[0m`);
  }

  rows.push(sep);
  rows.push(`  \x1b[90mControls:\x1b[0m`);
  rows.push(`    \x1b[36m↑↓\x1b[0m navigate   \x1b[36m←→\x1b[0m toggle   \x1b[36mEnter\x1b[0m confirm & exit   \x1b[36mq\x1b[0m quit without saving`);
  rows.push(`    \x1b[36ma\x1b[0m allow all  \x1b[36md\x1b[0m deny all  \x1b[36mr\x1b[0m reset to defaults\n`);
  return rows.join('\n');
}

// ── Interactive mode ──────────────────────────────────────────────────────────
async function interactiveMode() {
  const readline = require('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });

  let perms     = loadPermissions();
  let activeIdx = 0;

  const redraw = () => {
    process.stdout.write('\x1b[2J\x1b[H'); // clear screen
    process.stdout.write(renderTable(perms, OP_KEYS[activeIdx]));
  };

  redraw();

  return new Promise((resolve) => {
    rl.on('line', (line) => {
      const cmd = line.trim().toLowerCase();

      if (cmd === 'q' || cmd === 'quit') {
        process.stdout.write('\n  \x1b[90mno changes saved\x1b[0m\n');
        rl.close();
        resolve(0);
        return;
      }

      if (cmd === '' || cmd === 'enter') {
        // Confirm — save and exit
        savePermissions(perms);
        process.stdout.write('\n  \x1b[32m✓ permissions saved\x1b[0m\n');
        rl.close();
        resolve(0);
        return;
      }

      if (cmd === 'a') {
        for (const op of OP_KEYS) perms[op] = true;
        redraw();
        return;
      }

      if (cmd === 'd') {
        for (const op of OP_KEYS) perms[op] = false;
        redraw();
        return;
      }

      if (cmd === 'r') {
        perms = { ...DEFAULTS };
        redraw();
        return;
      }

      if (cmd === 'up' || cmd === '\x1b[A') {
        activeIdx = (activeIdx - 1 + OP_KEYS.length) % OP_KEYS.length;
        redraw();
        return;
      }

      if (cmd === 'down' || cmd === '\x1b[B') {
        activeIdx = (activeIdx + 1) % OP_KEYS.length;
        redraw();
        return;
      }

      if (cmd === 'left' || cmd === 'right' || cmd === ' ' || cmd === 't' || cmd === 'toggle') {
        const op = OP_KEYS[activeIdx];
        perms[op] = !perms[op];
        redraw();
        return;
      }

      // Number key shortcut (1-4)
      const n = parseInt(cmd, 10);
      if (!isNaN(n) && n >= 1 && n <= OP_KEYS.length) {
        activeIdx = n - 1;
        const op = OP_KEYS[activeIdx];
        perms[op] = !perms[op];
        redraw();
        return;
      }

      // "allow <op>" or "disallow <op>"
      const allowMatch = cmd.match(/^(allow|enable)\s+(.+)$/);
      const denyMatch  = cmd.match(/^(disallow|deny|block)\s+(.+)$/);
      if (allowMatch) {
        const op = allowMatch[2].trim().replace(/-/g, '_');
        if (OP_KEYS.includes(op)) { perms[op] = true; redraw(); }
        return;
      }
      if (denyMatch) {
        const op = denyMatch[2].trim().replace(/-/g, '_');
        if (OP_KEYS.includes(op)) { perms[op] = false; redraw(); }
        return;
      }
    });

    // Raw mode for arrow keys
    rl.write('\x1b[?1034h'); // enable meta/alt key mode
  });
}

// ── Non-interactive helpers ─────────────────────────────────────────────────────
function listPermissions() {
  const perms = loadPermissions();
  console.log('\n  PURPCLAW Permissions\n');
  for (const op of OP_KEYS) {
    const meta    = OPS[op];
    const allowed = perms[op];
    const status  = allowed ? '\x1b[32mALLOWED \x1b[0m' : '\x1b[31mBLOCKED \x1b[0m';
    console.log(`    \x1b[${meta.color}m${String(meta.label).padEnd(12)}\x1b[0m ${status}  ${meta.description}`);
  }
  console.log('');
  return perms;
}

function setPermission(op, value) {
  const perms = loadPermissions();
  if (!OP_KEYS.includes(op)) {
    console.error(`\x1b[31m  ✖ unknown operation: ${op}\x1b[0m`);
    console.error(`\x1b[90m  available: ${OP_KEYS.join(', ')}\x1b[0m`);
    return 1;
  }
  perms[op] = value;
  savePermissions(perms);
  console.log(`\x1b[32m  ✓ ${op} ${value ? 'ALLOWED' : 'BLOCKED'}\x1b[0m`);
  return 0;
}

// ── Main entry ─────────────────────────────────────────────────────────────────
async function run(args, ctx) {
  const flags = args.filter(a => a.startsWith('--'));
  const ops   = args.filter(a => !a.startsWith('--'));

  if (flags.includes('--list') || flags.includes('-l')) {
    listPermissions();
    return 0;
  }

  if (ops.includes('allow') || ops.includes('enable')) {
    const target = ops[ops.indexOf('allow') + 1] || ops[ops.indexOf('enable') + 1];
    if (target) return setPermission(target.replace(/-/g, '_'), true);
    console.error('\x1b[33m  ⚠ usage: purpclaw permissions --allow <operation>\x1b[0m');
    console.error(`\x1b[90m  available: ${OP_KEYS.join(', ')}\x1b[0m`);
    return 1;
  }

  if (ops.includes('disallow') || ops.includes('deny') || ops.includes('block')) {
    const idx = Math.max(ops.indexOf('disallow'), ops.indexOf('deny'), ops.indexOf('block'));
    const target = ops[idx + 1];
    if (target) return setPermission(target.replace(/-/g, '_'), false);
    console.error('\x1b[33m  ⚠ usage: purpclaw permissions --disallow <operation>\x1b[0m');
    console.error(`\x1b[90m  available: ${OP_KEYS.join(', ')}\x1b[0m`);
    return 1;
  }

  if (ops.includes('reset')) {
    savePermissions({ ...DEFAULTS });
    console.log('\x1b[32m  ✓ reset to defaults\x1b[0m\n');
    return 0;
  }

  // Default: interactive mode
  return interactiveMode();
}

function help() {
  console.log(`
  purpclaw permissions — manage PURPCLAW operation permissions

  USAGE:
    purpclaw permissions               # interactive TUI
    purpclaw permissions --list      # show current settings as text
    purpclaw permissions --allow <op>   # enable one operation
    purpclaw permissions --disallow <op> # disable one operation
    purpclaw permissions reset        # reset all to defaults

  OPERATIONS:
    file-write    — write/edit/create files on disk
    shell-exec    — run arbitrary shell commands
    network       — make outbound HTTP/HTTPS requests
    agent-spawn   — spawn sub-agents or child processes

  INTERACTIVE CONTROLS:
    ↑↓  navigate   ←→ or Space toggle   Enter save & exit   q quit
    a   allow all   d deny all   r reset to defaults

  DEFAULTS:
    file_write : ALLOWED
    shell_exec : BLOCKED
    network    : ALLOWED
    agent_spawn: BLOCKED

  PERSISTED: ~/.purpclaw/permissions.json
`);
}

module.exports = { run, help };
