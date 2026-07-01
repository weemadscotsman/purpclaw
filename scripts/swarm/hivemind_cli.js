#!/usr/bin/env node
'use strict';

const HIVEMIND = require('./lib/hivemind');

function print(obj) { console.log(JSON.stringify(obj, null, 2)); }
function parseJsonArg(raw) {
  let text = String(raw || '').trim();
  if (!text) return {};
  if ((text.startsWith("'") && text.endsWith("'")) || (text.startsWith('"') && text.endsWith('"'))) {
    text = text.slice(1, -1);
  }
  try {
    return JSON.parse(text);
  } catch (firstError) {
    const unescaped = text.replace(/\\"/g, '"');
    if (unescaped !== text) return JSON.parse(unescaped);
    let normalized = text
      .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_-]*)\s*:/g, '$1"$2":')
      .replace(/:\s*([A-Za-z_][A-Za-z0-9_-]*)(\s*[,}])/g, (m, value, suffix) => {
        if (/^(true|false|null)$/i.test(value)) return `:${value.toLowerCase()}${suffix}`;
        return `:"${value}"${suffix}`;
      });
    let previous = null;
    while (previous !== normalized) {
      previous = normalized;
      normalized = normalized.replace(/([\[,]\s*)([A-Za-z_][A-Za-z0-9_-]*)(\s*[\],])/g, (m, prefix, value, suffix) => {
        if (/^(true|false|null)$/i.test(value)) return `${prefix}${value.toLowerCase()}${suffix}`;
        return `${prefix}"${value}"${suffix}`;
      });
    }
    if (normalized !== text) return JSON.parse(normalized);
    throw firstError;
  }
}

function usage() {
  console.log(`PURPCLAW Hivemind / Spring CLI

Usage:
  node hivemind_cli.js status
  node hivemind_cli.js spring
  node hivemind_cli.js principles
  node hivemind_cli.js doctrine
  node hivemind_cli.js trace-list [limit]
  node hivemind_cli.js skills [--all]
  node hivemind_cli.js load "<task>"
  node hivemind_cli.js validate '{"outcome":"success","evidence":["tests_passed"]}'
  node hivemind_cli.js promote [--dry-run]
`);
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  if (!cmd || cmd === 'help' || cmd === '--help') return usage();
  if (cmd === 'status') return print(HIVEMIND.status());
  if (cmd === 'spring') return print(HIVEMIND.springStatus());
  if (cmd === 'principles') return print(HIVEMIND.listPrinciples());
  if (cmd === 'doctrine') return print(HIVEMIND.listDoctrines());
  if (cmd === 'trace-list') return print(HIVEMIND.listTraces(Number(args[0] || 20)).map(t => ({ run_id: t.run_id, outcome: t.outcome, score: t.score, trust_score: t.trust_score, spring_rank: t.spring_rank, task: String(t.task || '').slice(0, 100), created_at: t.created_at })));
  if (cmd === 'skills') return print(HIVEMIND.listSkills({ includeDeprecated: args.includes('--all') }).map(s => ({ skill_id: s.skill_id, kind: s.kind || 'skill', score: s.score, trust_score: s.trust_score, spring_rank: s.spring_rank, success_count: s.success_count, failure_count: s.failure_count, title: s.title })));
  if (cmd === 'load') {
    const task = args.join(' ').trim();
    if (!task) throw new Error('load requires a task string');
    const ctx = HIVEMIND.loadRuntimeContext(task, { limit: 3 });
    return print({ task, spring: ctx.springStatus, doctrines: ctx.doctrines, skills: ctx.skills, antiskills: ctx.antiskills, promptBlock: ctx.promptBlock });
  }
  if (cmd === 'validate') {
    const raw = args.join(' ').trim();
    const record = parseJsonArg(raw);
    return print(HIVEMIND.validateRecord(record));
  }
  if (cmd === 'promote') return print(HIVEMIND.promote({ dryRun: args.includes('--dry-run') }));
  usage();
}

main().catch(e => { console.error(`Hivemind CLI error: ${e.stack || e.message}`); process.exit(1); });
