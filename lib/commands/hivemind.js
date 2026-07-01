'use strict';

const path = require('path');

function printJson(obj) { console.log(JSON.stringify(obj, null, 2)); }

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

function help() {
  return `PURPCLAW Hivemind + Spring Doctrine

Usage:
  purpclaw hivemind status
  purpclaw hivemind spring
  purpclaw hivemind principles
  purpclaw hivemind doctrine
  purpclaw hivemind trace-list [limit]
  purpclaw hivemind skills [--all]
  purpclaw hivemind load "<task>"
  purpclaw hivemind validate '{"outcome":"success","evidence":["tests_passed"]}'
  purpclaw hivemind promote [--dry-run]
  purpclaw hivemind test-loop      # runs lib/hivemind-test.js — proves the cognitive loop closes
`;
}

async function run(args = [], ctx = {}) {
  const PURP_DIR = ctx.PURP_DIR || path.resolve(__dirname, '..', '..');
  const HIVEMIND = require(path.join(PURP_DIR, 'lib', 'hivemind'));
  const [subRaw, ...rest] = args;
  const sub = (subRaw || 'status').toLowerCase();

  if (sub === 'help' || sub === '--help' || sub === '-h') {
    console.log(help());
    return { ok: true };
  }
  if (sub === 'status') return printJson(HIVEMIND.status());
  if (sub === 'spring') return printJson(HIVEMIND.springStatus());
  if (sub === 'principles') return printJson(HIVEMIND.listPrinciples());
  if (sub === 'doctrine') return printJson(HIVEMIND.listDoctrines());
  if (sub === 'trace-list') return printJson(HIVEMIND.listTraces(Number(rest[0] || 20)).map(t => ({
    run_id: t.run_id,
    outcome: t.outcome,
    score: t.score,
    trust_score: t.trust_score,
    spring_rank: t.spring_rank,
    task: String(t.task || '').slice(0, 100),
    created_at: t.created_at,
  })));
  if (sub === 'skills') return printJson(HIVEMIND.listSkills({ includeDeprecated: rest.includes('--all') }).map(s => ({
    skill_id: s.skill_id,
    kind: s.kind || 'skill',
    score: s.score,
    trust_score: s.trust_score,
    spring_rank: s.spring_rank,
    success_count: s.success_count,
    failure_count: s.failure_count,
    title: s.title,
  })));
  if (sub === 'load') {
    const task = rest.join(' ').trim();
    if (!task) throw new Error('hivemind load requires a task string');
    const runtime = HIVEMIND.loadRuntimeContext(task, { limit: 3 });
    return printJson({ task, spring: runtime.springStatus, doctrines: runtime.doctrines, skills: runtime.skills, antiskills: runtime.antiskills, promptBlock: runtime.promptBlock });
  }
  if (sub === 'validate') {
    const raw = rest.join(' ').trim();
    const record = parseJsonArg(raw);
    return printJson(HIVEMIND.validateRecord(record));
  }
  if (sub === 'promote') return printJson(HIVEMIND.promote({ dryRun: rest.includes('--dry-run') }));
  if (sub === 'test-loop') {
    const testPath = path.join(PURP_DIR, 'lib', 'hivemind-test.js');
    const code = require(testPath);
    return code.runLoop();
  }

  console.log(help());
  throw new Error(`Unknown hivemind command: ${sub}`);
}

module.exports = { run };
