'use strict';

/**
 * lib/commands/memory.js
 * /memory — scoped memory status
 */
const { list } = require('../../parity/memory/scoped.js');

function run(args) {
  const scope = (args[0] || 'private').toLowerCase();
  if (!['private', 'team'].includes(scope)) {
    return 'Usage: /memory [private|team]';
  }
  const entries = list(scope);
  if (!entries.length) {
    return `No ${scope} memories recorded.\n(parity/memory/scoped.js uses .openclaude/memory/ — wire to lib/scoped-memory.js for full functionality)`;
  }
  const lines = [`${scope} memories:`, ''];
  for (const e of entries) {
    lines.push(`  [${e.type}] ${e.name}`);
    lines.push(`    ${e.description}`);
  }
  return lines.join('\n');
}

module.exports = { run };
