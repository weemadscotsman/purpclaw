#!/usr/bin/env node
/**
 * scripts/benchmark-providers.js
 * ════════════════════════════════════════════════════════════════════════
 *
 * Provider benchmark — run the same task set through N providers (local
 * + cloud) and report per-provider stats: success rate, latency, output
 * length, format validity (JSON / function-call detection).
 *
 * This is the Phase 1 / Phase 2 gate: the diff between local and cloud
 * accuracy is what we have to close with fine-tuning.
 *
 * Usage:
 *   node scripts/benchmark-providers.js \
 *     --local  qwen2.5:3b \
 *     --remote openrouter \
 *     --remote minimax \
 *     --tasks  E:/training/baseline-tasks.json \
 *     --output E:/training/benchmark-results.json
 *
 * tasks file schema (one task per line):
 *   { "id": "t001", "prompt": "...", "expect": "json" | "text" }
 *
 *   expect: 'json' = the benchmark scores the response on JSON validity
 *           'text' = the benchmark scores on word count and refusal detection
 *
 * No deps. Pure stdlib. Uses lib/llm-provider.js for the chat call.
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const http = require('http');

const PURP_DIR = path.resolve(__dirname, '..');
const llm = require(path.join(PURP_DIR, 'lib', 'llm-provider'));

function parseArgs(argv) {
  const out = { providers: [], tasks: null, output: 'E:/training/benchmark-results.json', limit: 0 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--local' || a === '--remote') {
      out.providers.push({ name: argv[++i], kind: a.slice(2) });
    } else if (a === '--tasks') {
      out.tasks = argv[++i];
    } else if (a === '--output') {
      out.output = argv[++i];
    } else if (a === '--limit') {
      out.limit = parseInt(argv[++i], 10) || 0;
    } else if (a === '--help' || a === '-h') {
      console.log('Usage: node scripts/benchmark-providers.js --local <model> [--remote <model>]... --tasks <file> [--output <file>]');
      process.exit(0);
    }
  }
  return out;
}

function loadTasks(file) {
  const raw = fs.readFileSync(file, 'utf8');
  if (raw.trim().startsWith('[') || raw.trim().startsWith('{')) {
    return JSON.parse(raw);
  }
  return raw.split('\n').filter(Boolean).map(l => JSON.parse(l));
}

function chatViaLLMProvider(model, prompt, timeoutMs = 30_000) {
  return llm.chat([{ role: 'user', content: prompt }], {
    model,
    maxTokens: 256,
    temperature: 0,
    timeoutMs,
    disableFallback: true,
  });
}

function scoreResponse(task, text) {
  const expect = task.expect || 'text';
  const out = {
    length: (text || '').length,
    words: (text || '').trim().split(/\s+/).filter(Boolean).length,
    empty: !text || !text.trim(),
    refusal: /\b(can't|cannot|won't|will not|unable|refuse|sorry|as an ai|i don't have)\b/i.test(text || ''),
  };
  if (expect === 'json') {
    // Try to parse the response as JSON, or extract a JSON block.
    const stripped = (text || '').replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    try {
      JSON.parse(stripped);
      out.jsonValid = true;
    } catch {
      // Try to find a JSON block
      const m = (text || '').match(/\{[\s\S]*\}|\[[\s\S]*\]/);
      if (m) {
        try { JSON.parse(m[0]); out.jsonValid = true; } catch { out.jsonValid = false; }
      } else {
        out.jsonValid = false;
      }
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.providers.length) {
    console.error('No providers given. Use --local <model> and/or --remote <model>.');
    process.exit(1);
  }
  if (!args.tasks) {
    console.error('No --tasks file given. JSON or NDJSON, one task per line.');
    process.exit(1);
  }
  let tasks = loadTasks(args.tasks);
  if (args.limit) tasks = tasks.slice(0, args.limit);
  console.log(`Loaded ${tasks.length} tasks. Running across ${args.providers.length} provider(s).`);

  const results = { startedAt: new Date().toISOString(), providers: {} };
  for (const p of args.providers) {
    console.log(`\n=== ${p.name} (${p.kind}) ===`);
    const perTask = [];
    const t0 = Date.now();
    let successCount = 0;
    let jsonValidCount = 0;
    let refusalCount = 0;
    let totalLatencyMs = 0;
    let totalWords = 0;
    for (let i = 0; i < tasks.length; i++) {
      const t = tasks[i];
      const tStart = Date.now();
      let result = null;
      try {
        const resp = await chatViaLLMProvider(p.name, t.prompt);
        const latency = Date.now() - tStart;
        const text = resp?.content || '';
        const scored = scoreResponse(t, text);
        result = { id: t.id, ok: true, latency, ...scored };
        if (scored.jsonValid) jsonValidCount += 1;
        if (scored.refusal) refusalCount += 1;
        successCount += 1;
        totalLatencyMs += latency;
        totalWords += scored.words;
      } catch (e) {
        const latency = Date.now() - tStart;
        result = { id: t.id, ok: false, latency, error: e.message?.slice(0, 200) };
      }
      perTask.push(result);
      process.stdout.write(`  [${i+1}/${tasks.length}] ${result.id} ${result.ok ? (result.jsonValid ? '✓json' : '✓text') : '✗'} ${result.latency}ms\r`);
    }
    process.stdout.write('\n');
    const totalMs = Date.now() - t0;
    const summary = {
      provider: p.name,
      kind: p.kind,
      total: tasks.length,
      success: successCount,
      successRate: tasks.length ? (successCount / tasks.length).toFixed(3) : 0,
      jsonValid: jsonValidCount,
      jsonValidRate: tasks.length ? (jsonValidCount / tasks.length).toFixed(3) : 0,
      refusals: refusalCount,
      refusalRate: tasks.length ? (refusalCount / tasks.length).toFixed(3) : 0,
      avgLatencyMs: successCount ? Math.round(totalLatencyMs / successCount) : 0,
      avgWords: successCount ? Math.round(totalWords / successCount) : 0,
      totalWallMs: totalMs,
    };
    results.providers[p.name] = { summary, perTask };
    console.log(`  → success ${summary.success}/${summary.total} (${summary.successRate}), json ${summary.jsonValidRate}, refusal ${summary.refusalRate}, avg ${summary.avgLatencyMs}ms, ${summary.avgWords} words/ans, total ${(summary.totalWallMs/1000).toFixed(1)}s`);
  }

  // Comparison table
  console.log('\n=== COMPARISON ===');
  const providers = Object.values(results.providers);
  const header = ['provider', 'kind', 'success', 'json', 'refusal', 'avgMs', 'words'];
  const rows = providers.map(p => [
    p.summary.provider,
    p.summary.kind,
    `${p.summary.successRate} (${p.summary.success}/${p.summary.total})`,
    p.summary.jsonValidRate,
    p.summary.refusalRate,
    p.summary.avgLatencyMs,
    p.summary.avgWords,
  ]);
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map(r => String(r[i]).length)));
  console.log('  ' + header.map((h, i) => h.padEnd(widths[i])).join('  '));
  console.log('  ' + widths.map(w => '-'.repeat(w)).join('  '));
  for (const r of rows) {
    console.log('  ' + r.map((c, i) => String(c).padEnd(widths[i])).join('  '));
  }

  // Write JSON report
  try {
    fs.mkdirSync(path.dirname(args.output), { recursive: true });
    fs.writeFileSync(args.output, JSON.stringify(results, null, 2));
    console.log(`\nWrote ${args.output}`);
  } catch (e) {
    console.error(`\nFailed to write ${args.output}: ${e.message}`);
  }
}

main().catch(e => {
  console.error('Benchmark failed:', e);
  process.exit(1);
});
