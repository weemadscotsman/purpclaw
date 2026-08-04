'use strict';

const fs = require('fs');
const path = require('path');

function canonicalWorktreeRoot(candidate) {
  if (process.env.PURP_DIR) return path.resolve(process.env.PURP_DIR);

  const root = path.resolve(candidate);
  const gitMarker = path.join(root, '.git');
  try {
    if (!fs.statSync(gitMarker).isFile()) return root;
    const marker = fs.readFileSync(gitMarker, 'utf8').trim();
    const match = marker.match(/^gitdir:\s*(.+)$/i);
    if (!match) return root;

    const gitDir = path.resolve(root, match[1]);
    const normalized = gitDir.replace(/\\/g, '/');
    const worktreesIndex = normalized.toLowerCase().lastIndexOf('/.git/worktrees/');
    if (worktreesIndex === -1) return root;
    return path.resolve(normalized.slice(0, worktreesIndex));
  } catch {
    return root;
  }
}

const PROJECT_ROOT = canonicalWorktreeRoot(path.join(__dirname, '..'));
const DATA_ROOT = path.resolve(process.env.PURP_DATA_DIR || path.join(PROJECT_ROOT, '.purpclaw'));
const CODE_INDEX_DIR = path.resolve(
  process.env.PURP_CODE_INDEX_DIR || path.join(DATA_ROOT, 'code-index')
);
const SHARED_ROOT = path.resolve(
  process.env.PURP_SHARED_ROOT || path.dirname(path.dirname(PROJECT_ROOT))
);
const LOG_DIR = path.resolve(process.env.PURP_LOG_DIR || path.join(PROJECT_ROOT, 'logs'));

function projectPath(...parts) {
  return path.join(PROJECT_ROOT, ...parts);
}

module.exports = {
  PROJECT_ROOT,
  DATA_ROOT,
  CODE_INDEX_DIR,
  SHARED_ROOT,
  LOG_DIR,
  projectPath,
  canonicalWorktreeRoot,
};
