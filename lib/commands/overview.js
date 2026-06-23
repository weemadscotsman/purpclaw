'use strict';

/**
 * purpclaw overview — print the System Overview doc to the terminal
 * ══════════════════════════════════════════════════════════════════
 * The full philosophy + architecture lives in docs/SYSTEM_OVERVIEW.md.
 * This command renders it inline with minimal terminal-friendly styling.
 *
 * Why both `architecture` AND `overview`?
 *   - `architecture` — live, runtime-introspected: queries tower for agent
 *      count, generates port table from actual config. Built every time.
 *   - `overview`     — the canonical narrative doc. Same source as the README
 *      links to. Single source of truth for "what is PURPCLAW?"
 *
 * Usage:
 *   purpclaw overview          — print the full doc
 *   purpclaw overview --path   — just print the file path
 *   purpclaw overview --raw    — print without colour
 */

const fs   = require('fs');
const path = require('path');

const DOC_RELATIVE = path.join('docs', 'current', 'SYSTEM_OVERVIEW.md');

function renderMarkdown(md, C, col, isTTY) {
  if (!isTTY) return md;
  const lines = md.split('\n');
  const out = [];
  let inCode = false;
  for (const ln of lines) {
    if (ln.startsWith('```')) {
      inCode = !inCode;
      out.push(col(C.gray, ln));
      continue;
    }
    if (inCode) {
      out.push(col(C.gray, ln));
      continue;
    }
    if (ln.startsWith('# ')) {
      out.push(col(C.magenta + C.bold, ln.slice(2)));
    } else if (ln.startsWith('## ')) {
      out.push('\n' + col(C.cyan + C.bold, ln.slice(3)));
    } else if (ln.startsWith('### ')) {
      out.push(col(C.cyan, ln.slice(4)));
    } else if (ln.startsWith('> ')) {
      out.push(col(C.yellow, '  ┃ ' + ln.slice(2)));
    } else if (/^\s*[-*]\s/.test(ln)) {
      out.push(col(C.white, ln));
    } else if (ln.startsWith('|')) {
      out.push(col(C.gray, ln));
    } else if (ln.startsWith('---')) {
      out.push(col(C.gray, '─'.repeat(60)));
    } else {
      out.push(ln);
    }
  }
  return out.join('\n');
}

async function run(args, ctx) {
  const { C, col, PURP_DIR, isTTY } = ctx;
  const docPath = path.join(PURP_DIR, DOC_RELATIVE);

  if (args.includes('--path')) {
    console.log(docPath);
    return;
  }

  if (!fs.existsSync(docPath)) {
    console.error(col(C.red, `\n  ✗ ${DOC_RELATIVE} not found.\n`));
    console.error(col(C.gray, `  Expected at: ${docPath}\n`));
    process.exit(1);
  }

  const md = fs.readFileSync(docPath, 'utf8');

  if (args.includes('--raw')) {
    console.log(md);
    return;
  }

  console.log(renderMarkdown(md, C, col, isTTY));
  console.log('\n' + col(C.gray, '  ─ Render of ' + DOC_RELATIVE + ' ─ purpclaw overview --raw for raw markdown\n'));
}

module.exports = { run };
