'use strict';

/**
 * lib/commands/commit.js
 * /commit — stage and commit all changes
 * Stub: delegates to git CLI
 */
const { execSync } = require('child_process');

function run(args) {
  const msg = args.join(' ').trim() || 'chore: updates';
  try {
    execSync('git add -A', { encoding: 'utf8', stdio: 'pipe' });
    const out = execSync(`git commit -m "${msg.replace(/"/g, '\\"')}"`, { encoding: 'utf8', stdio: 'pipe' });
    return `Committed: ${msg}\n${out}`;
  } catch (e) {
    return `git commit failed: ${(e.stderr || e.message || '').trim()}`;
  }
}

module.exports = { run };
