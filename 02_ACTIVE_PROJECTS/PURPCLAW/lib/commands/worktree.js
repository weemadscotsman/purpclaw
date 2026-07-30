'use strict';

/**
 * lib/commands/worktree.js
 * purpclaw worktree — Git worktree management CLI
 *
 * Codex parity: git worktree management (Codex uses worktrees for sandbox isolation)
 * Engine: lib/hooks-runtime.js — listWorktrees / newWorktree / mergeWorktree / removeWorktree
 * Uses: git worktree list --porcelain
 */

const path = require('path');
const fs = require('fs');

async function run(args, ctx = {}) {
  const RT = (() => {
    try { return require(path.join(__dirname, '..', 'hooks-runtime')); } catch { return null; }
  })();

  if (!RT) {
    console.log('error: hooks-runtime not available');
    return 1;
  }

  const sub = (args[0] || 'list').toLowerCase();
  const json = args.includes('--json');
  const cwd = args.includes('--cwd') ? args[args.indexOf('--cwd') + 1] : process.cwd();

  if (sub === 'list' || sub === 'ls') {
    const wts = RT.listWorktrees(cwd);
    if (json) {
      console.log(JSON.stringify({ worktrees: wts, cwd }, null, 2));
      return;
    }
    if (!wts.length) {
      console.log(`No worktrees found in ${cwd}`);
      return;
    }
    console.log(`\nWORKTREES in ${cwd}\n`);
    for (const wt of wts) {
      console.log(`  ${wt.path}`);
      if (wt.branch) console.log(`    branch: ${wt.branch}`);
      if (wt.head) console.log(`    HEAD:   ${wt.head}`);
    }
    console.log('');
    return;
  }

  if (sub === 'add' || sub === 'new') {
    const branch = args[1];
    const baseDir = args[2] || null;
    if (!branch) {
      console.log('usage: purpclaw worktree add <branch> [base-dir] [--json]');
      return 1;
    }
    const result = RT.newWorktree(branch, cwd, baseDir);
    if (result.ok) {
      console.log(json
        ? JSON.stringify({ ok: true, path: result.path, branch: result.branch })
        : `✓ worktree created: ${result.path} (branch: ${result.branch})`);
    } else {
      console.log(json
        ? JSON.stringify({ ok: false, error: result.error })
        : `✗ error: ${result.error}`);
    }
    return;
  }

  if (sub === 'remove' || sub === 'rm') {
    const target = args[1];
    if (!target) {
      console.log('usage: purpclaw worktree remove <path-or-branch> [--json]');
      return 1;
    }
    // Find by path (full or partial), branch name, or directory name
    const wts = RT.listWorktrees(cwd);
    const wt = wts.find(w =>
      w.path === target ||
      w.path.endsWith(target) ||
      w.path.replace(/\\/g, '/').includes(target) ||
      (w.branch && (w.branch === target || w.branch.endsWith(target)))
    );
    if (!wt) {
      console.log(json
        ? JSON.stringify({ ok: false, error: `worktree not found: ${target}` })
        : `error: worktree not found: ${target}`);
      return 1;
    }
    const result = RT.removeWorktree(wt.path, cwd);
    if (result.ok) {
      console.log(json
        ? JSON.stringify({ ok: true, removed: wt.path })
        : `✓ worktree removed: ${wt.path}`);
    } else {
      console.log(json
        ? JSON.stringify({ ok: false, error: result.error })
        : `✗ error: ${result.error}`);
    }
    return;
  }

  if (sub === 'merge') {
    const branch = args[1];
    const target = args[2] || 'main';
    if (!branch) {
      console.log('usage: purpclaw worktree merge <branch> [target] [--json]');
      return 1;
    }
    const result = RT.mergeWorktree(branch, target, cwd);
    if (result.ok) {
      console.log(json
        ? JSON.stringify({ ok: true, merged: branch, into: target })
        : `✓ merged ${branch} into ${target}`);
    } else {
      console.log(json
        ? JSON.stringify({ ok: false, error: result.error })
        : `✗ error: ${result.error}`);
    }
    return;
  }

  // Help
  console.log(`purpclaw worktree — Git worktree management
  purpclaw worktree list                      list all worktrees
  purpclaw worktree add <branch> [base-dir]  create a new worktree
  purpclaw worktree remove <path-or-branch>  remove a worktree
  purpclaw worktree merge <branch> [target]  merge a branch (default target: main)
  purpclaw worktree --cwd <dir>              operate on a specific directory
  purpclaw worktree --json                   JSON output (append to any subcommand)
`);
}

module.exports = { run };
