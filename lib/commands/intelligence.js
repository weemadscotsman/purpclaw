'use strict';

const fs = require('fs');
const path = require('path');

function parseArgs(args = []) {
  const flags = {
    json: false,
    noHealth: false,
    source: 'inline',
  };
  const positional = [];

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--json') flags.json = true;
    else if (arg === '--no-health') flags.noHealth = true;
    else if (arg === '--source') {
      flags.source = args[i + 1] || flags.source;
      i += 1;
    } else {
      positional.push(arg);
    }
  }

  return { flags, positional };
}

function stateLabel(state, ctx) {
  const { C, col } = ctx;
  if (state === 'live') return col(C.green, 'LIVE');
  if (state === 'partial') return col(C.yellow, 'PARTIAL');
  return col(C.red, 'GAP');
}

function printStatus(report, ctx) {
  const { C, col } = ctx;
  console.log('');
  console.log(col(C.bold + C.cyan, 'PURPCLAW INTELLIGENCE SPINE'));
  console.log(col(C.gray, 'Graph RAG, chunking, quantization, guardrails, inference, KV cache, context window, and context cache.\n'));

  console.log(`  ${col(C.green, String(report.totals.live).padStart(2))} live  ${col(C.yellow, String(report.totals.partial).padStart(2))} partial  ${col(C.red, String(report.totals.gap).padStart(2))} gaps  ${col(C.gray, `of ${report.totals.total} intelligence layers`)}`);
  console.log(`  ${col(C.gray, `Pool: ${report.services.pool}`)}  ${col(C.gray, `Memory: ${report.services.memory}`)}\n`);

  for (const section of report.sections) {
    console.log(`${stateLabel(section.state, ctx).padEnd(16)} ${col(C.bold, section.name)}`);
    console.log(`    ${col(C.gray, section.detail)}`);
  }

  console.log('');
  console.log(col(C.gray, 'Commands: purpclaw intelligence --json | purpclaw intelligence chunk --source file.txt | purpclaw intelligence graph "<query>"'));
  console.log('');
}

function readInput(textParts, flags, rootDir) {
  const joined = textParts.join(' ').trim();
  if (flags.source !== 'inline') {
    const abs = path.isAbsolute(flags.source) ? flags.source : path.join(rootDir, flags.source);
    return { source: flags.source, text: fs.readFileSync(abs, 'utf8') };
  }
  return { source: 'inline', text: joined };
}

function printChunks(result, ctx) {
  const { C, col } = ctx;
  console.log('');
  console.log(col(C.bold + C.cyan, 'PURPCLAW CHUNKING'));
  console.log(`  Source        : ${col(C.cyan, result.source)}`);
  console.log(`  Token estimate: ${col(C.cyan, result.tokenEstimate)}`);
  console.log(`  Policy        : ${col(C.gray, `${result.targetTokens} target / ${result.overlapTokens} overlap`)}`);
  console.log(`  Chunks        : ${col(C.cyan, result.count)}\n`);
  for (const chunk of result.chunks.slice(0, 12)) {
    const preview = chunk.content.replace(/\s+/g, ' ').slice(0, 140);
    console.log(`  ${col(C.green, String(chunk.index + 1).padStart(2))} ${col(C.gray, chunk.hash)} ${col(C.cyan, `${chunk.tokens} tokens`)}`);
    console.log(`     ${col(C.gray, preview)}`);
  }
  if (result.chunks.length > 12) console.log(col(C.gray, `  ... ${result.chunks.length - 12} more chunks`));
  console.log('');
}

function printGraph(graph, ctx) {
  const { C, col } = ctx;
  console.log('');
  console.log(col(C.bold + C.cyan, 'PURPCLAW GRAPH RAG'));
  console.log(`  Query  : ${col(C.cyan, graph.query || '(empty)')}`);
  console.log(`  Sources: ${Object.entries(graph.sources).map(([key, ok]) => `${key}=${ok ? 'yes' : 'no'}`).join(' ')}`);
  console.log(`  Nodes  : ${col(C.cyan, graph.nodes.length)}  ${col(C.gray, `Edges: ${graph.edges.length}`)}  ${col(C.gray, `Context used: ${graph.budget.usedTokens}/${graph.budget.availableTokens}`)}\n`);

  for (const node of graph.nodes.slice(0, 12)) {
    const preview = node.text.replace(/\s+/g, ' ').slice(0, 150);
    console.log(`  ${col(C.green, node.kind.padEnd(13))} ${col(C.cyan, String(node.graphScore).padStart(5))} ${node.label}`);
    console.log(`    ${col(C.gray, preview)}`);
  }
  if (graph.nodes.length > 12) console.log(col(C.gray, `  ... ${graph.nodes.length - 12} more nodes`));
  console.log('');
}

async function run(args, ctx) {
  const { PURP_DIR } = ctx;
  const spine = require(path.join(PURP_DIR, 'lib', 'intelligence-spine.js'));
  const { flags, positional } = parseArgs(args);
  const sub = (positional.shift() || 'status').toLowerCase();

  if (sub === 'chunk' || sub === 'chunks') {
    const input = readInput(positional, flags, PURP_DIR);
    const result = spine.chunkText(input.text, { source: input.source });
    if (flags.json) console.log(JSON.stringify(result, null, 2));
    else printChunks(result, ctx);
    return;
  }

  if (sub === 'graph' || sub === 'rag') {
    const query = positional.join(' ').trim();
    const graph = await spine.buildRetrievalGraph(query);
    if (flags.json) console.log(JSON.stringify(graph, null, 2));
    else printGraph(graph, ctx);
    return;
  }

  if (sub === 'budget') {
    const input = readInput(positional, flags, PURP_DIR);
    const chunks = spine.chunkText(input.text, { source: input.source });
    const budget = spine.buildContextBudget(chunks.chunks.map(chunk => ({
      ...chunk,
      score: chunks.chunks.length - chunk.index,
    })));
    if (flags.json) console.log(JSON.stringify(budget, null, 2));
    else {
      console.log('');
      console.log(`  Context window : ${budget.contextWindowTokens}`);
      console.log(`  Response reserve: ${budget.responseReserveTokens}`);
      console.log(`  Used / available: ${budget.usedTokens}/${budget.availableTokens}`);
      console.log(`  Selected / drop : ${budget.selected.length}/${budget.dropped}`);
      console.log('');
    }
    return;
  }

  const report = await spine.status(PURP_DIR, { probeHealth: !flags.noHealth });
  if (flags.json) console.log(JSON.stringify(report, null, 2));
  else printStatus(report, ctx);
}

module.exports = { run };
