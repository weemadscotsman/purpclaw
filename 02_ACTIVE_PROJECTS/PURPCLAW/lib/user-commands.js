'use strict';
/**
 * lib/user-commands.js — P4 ship blocker.
 *
 * Claude Code parity: `.claude/commands/<name>.md` files become slash
 * commands. `$ARGUMENTS` in the file gets replaced with the user's text.
 * `purpclaw ask /<name> arg1 arg2` runs the file content as a prompt.
 *
 * PURPCLAW convention: `.purpclaw/commands/<name>.md` (project) and
 * `~/.purpclaw/commands/<name>.md` (user-global). Files at .purpclaw/
 * override user-global.
 *
 * Eddie audit ask 2026-07-17: parity with Claude Code / Codex / Hermes
 * custom slash commands.
 */

const fs = require('fs');
const path = require('path');

function readCommands(cwd) {
  const home = process.env.USERPROFILE || process.env.HOME || '';
  const dirs = [
    home ? path.join(home, '.purpclaw', 'commands') : null,
    path.join(cwd || process.cwd(), '.purpclaw', 'commands'),
    path.join(cwd || process.cwd(), '.purpclaw.local', 'commands'),
  ].filter(Boolean);
  const map = new Map();
  for (const dir of dirs) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (!e.isFile()) continue;
      const name = e.name.replace(/\.md$/i, '');
      // project/local override user-global (later dirs win)
      map.set(name, { name, file: path.join(dir, e.name), source: dir });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function getCommand(name, cwd) {
  const all = readCommands(cwd);
  return all.find(c => c.name === name) || null;
}

/**
 * Render a command file. Replaces `$ARGUMENTS`, `$1`, `$2`, ... with
 * the user's arguments. Empty string if file unreadable.
 */
function render(name, args = [], cwd) {
  const cmd = getCommand(name, cwd);
  if (!cmd) return { ok: false, error: `unknown command /${name}` };
  let body;
  try { body = fs.readFileSync(cmd.file, 'utf8'); } catch (e) {
    return { ok: false, error: `cannot read ${cmd.file}: ${e.message}` };
  }
  // Strip leading "# name" header comment if present
  body = body.replace(/^#\s+[^\n]*\n+/, '');
  // Replace $ARGUMENTS with the joined remaining args
  const joined = Array.isArray(args) ? args.join(' ') : String(args || '');
  body = body.replace(/\$ARGUMENTS\b/g, joined);
  // Replace $1, $2, ... with positional args (1-indexed, like shell)
  if (Array.isArray(args)) {
    body = body.replace(/\$(\d+)\b/g, (m, n) => {
      const idx = parseInt(n, 10);
      return (idx >= 1 && idx <= args.length) ? String(args[idx - 1]) : '';
    });
  }
  return { ok: true, body, file: cmd.file, source: cmd.source };
}

/**
 * Return the list of command names — used by completion and /help.
 */
function list(cwd) {
  return readCommands(cwd).map(c => c.name);
}

module.exports = { readCommands, getCommand, render, list };
