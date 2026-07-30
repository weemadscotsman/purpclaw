'use strict';

/**
 * lib/commands/help.js
 * /help — list available commands
 * Parity surface for parity/cli/router.js
 */

const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const router = require('../../parity/cli/router.js');

function run(args) {
  const all = router.list();
  const lines = ['Available commands:', ''];
  const delegated = all.filter((c) => c.kind === 'delegated');
  const inline = all.filter((c) => c.kind === 'inline');

  if (delegated.length) {
    lines.push('  Delegated (to lib/commands):');
    for (const { cmd } of delegated) {
      lines.push(`    ${cmd}`);
    }
    lines.push('');
  }
  if (inline.length) {
    lines.push('  Inline handlers:');
    for (const { cmd } of inline) {
      lines.push(`    ${cmd}`);
    }
    lines.push('');
  }
  lines.push('Skills: see /skills or purpclaw skills --list');
  lines.push('MCP:    see /mcp status');
  return lines.join('\n');
}

module.exports = { run };
