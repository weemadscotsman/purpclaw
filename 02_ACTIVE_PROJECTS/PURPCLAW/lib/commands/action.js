'use strict';

const path = require('path');

function parseArgs(args = []) {
  const flags = {
    json: false,
    dryRun: false,
    agent: null,
    delegate: true,
    mode: null,
    depth: null,
    modelCount: null,
    limit: null,
    timeoutMs: null,
    to: null,
    message: null,
    service: null,
    confirmSend: false,
    peer: null,
    channel: null,
    thread: null,
    targetCapability: null,
    confirmDispatch: false,
  };
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--json') flags.json = true;
    else if (arg === '--dry-run' || arg === '--plan') flags.dryRun = true;
    else if (arg === '--no-delegate') flags.delegate = false;
    else if (arg === '--confirm-send') flags.confirmSend = true;
    else if (arg === '--confirm-dispatch') flags.confirmDispatch = true;
    else if (arg === '--agent' || arg === '--mode' || arg === '--depth' || arg === '--model-count' || arg === '--modelCount' || arg === '--limit' || arg === '--timeout-ms' || arg === '--timeoutMs' || arg === '--to' || arg === '--message' || arg === '--service' || arg === '--peer' || arg === '--channel' || arg === '--thread' || arg === '--target-capability' || arg === '--targetCapability') {
      const value = args[i + 1] || null;
      if (arg === '--agent') flags.agent = value;
      else if (arg === '--mode') flags.mode = value;
      else if (arg === '--depth') flags.depth = Number(value);
      else if (arg === '--model-count' || arg === '--modelCount') flags.modelCount = Number(value);
      else if (arg === '--limit') flags.limit = Number(value);
      else if (arg === '--timeout-ms' || arg === '--timeoutMs') flags.timeoutMs = Number(value);
      else if (arg === '--to') flags.to = value;
      else if (arg === '--message') flags.message = value;
      else if (arg === '--service') flags.service = value;
      else if (arg === '--peer') flags.peer = value;
      else if (arg === '--channel') flags.channel = value;
      else if (arg === '--thread') flags.thread = value;
      else if (arg === '--target-capability' || arg === '--targetCapability') flags.targetCapability = value;
      i += 1;
    } else if (arg.startsWith('--agent=')) flags.agent = arg.slice('--agent='.length);
    else if (arg.startsWith('--mode=')) flags.mode = arg.slice('--mode='.length);
    else if (arg.startsWith('--depth=')) flags.depth = Number(arg.slice('--depth='.length));
    else if (arg.startsWith('--model-count=')) flags.modelCount = Number(arg.slice('--model-count='.length));
    else if (arg.startsWith('--modelCount=')) flags.modelCount = Number(arg.slice('--modelCount='.length));
    else if (arg.startsWith('--limit=')) flags.limit = Number(arg.slice('--limit='.length));
    else if (arg.startsWith('--timeout-ms=')) flags.timeoutMs = Number(arg.slice('--timeout-ms='.length));
    else if (arg.startsWith('--timeoutMs=')) flags.timeoutMs = Number(arg.slice('--timeoutMs='.length));
    else if (arg.startsWith('--to=')) flags.to = arg.slice('--to='.length);
    else if (arg.startsWith('--message=')) flags.message = arg.slice('--message='.length);
    else if (arg.startsWith('--service=')) flags.service = arg.slice('--service='.length);
    else if (arg.startsWith('--peer=')) flags.peer = arg.slice('--peer='.length);
    else if (arg.startsWith('--channel=')) flags.channel = arg.slice('--channel='.length);
    else if (arg.startsWith('--thread=')) flags.thread = arg.slice('--thread='.length);
    else if (arg.startsWith('--target-capability=')) flags.targetCapability = arg.slice('--target-capability='.length);
    else if (arg.startsWith('--targetCapability=')) flags.targetCapability = arg.slice('--targetCapability='.length);
    else if (arg === '--delegate') {
      flags.delegate = true;
    } else {
      positional.push(arg);
    }
  }
  return { flags, positional };
}

function printHuman(response, ctx) {
  const { C, col } = ctx;
  const c = (color, value) => col ? col(color, value) : value;
  const plan = response.plan;
  console.log('');
  console.log(c(C.bold + C.cyan, `PURPCLAW ACTION: ${plan.capability.label}`));
  console.log(c(C.gray, plan.capability.reason));
  console.log('');
  console.log(`  capability : ${c(C.green, plan.capability.id)}`);
  console.log(`  task       : ${plan.task || c(C.gray, '(none)')}`);
  console.log(`  surface    : CLI / TUI / Web shared dispatcher`);
  console.log(`  target     : ${plan.method} ${plan.method === 'NAVIGATE' ? plan.path : `:${plan.port}${plan.path}`}`);
  console.log(`  setup      : ${plan.setup.join(', ')}`);
  if (plan.note) console.log(`  note       : ${c(C.yellow, plan.note)}`);
  if (response.dryRun) console.log(`  result     : ${c(C.yellow, 'dry run only')}`);
  else if (response.result) console.log(`  result     : ${response.result.ok ? c(C.green, 'ok') : c(C.red, 'failed')} ${response.result.status || ''} ${response.result.error || ''}`);
  console.log('');
}

async function run(args = [], ctx = {}) {
  const PURP_DIR = ctx.PURP_DIR || path.resolve(__dirname, '..', '..');
  const dispatcher = require(path.join(PURP_DIR, 'lib', 'action-dispatcher.js'));
  const { flags, positional } = parseArgs(args);
  const id = positional.shift();
  const task = positional.join(' ').trim();
  if (!id) {
    throw new Error('usage: purpclaw action <capability> "<task>" [--dry-run] [--json] [--agent <name>] [--mode <mode>] [--depth <n>] [--model-count <n>] [--limit <n>] [--timeout-ms <n>] [--to <recipient>] [--message <text>] [--service imessage] [--confirm-send] [--peer <name>] [--channel <name>] [--thread <id>] [--target-capability <id>] [--confirm-dispatch]');
  }
  const response = await dispatcher.dispatchAction(id, task, {
    dryRun: flags.dryRun,
    agent: flags.agent,
    delegate: flags.delegate,
    mode: flags.mode,
    depth: Number.isFinite(flags.depth) ? flags.depth : undefined,
    modelCount: Number.isFinite(flags.modelCount) ? flags.modelCount : undefined,
    limit: Number.isFinite(flags.limit) ? flags.limit : undefined,
    timeoutMs: Number.isFinite(flags.timeoutMs) ? flags.timeoutMs : undefined,
    to: flags.to,
    message: flags.message,
    service: flags.service,
    confirmSend: flags.confirmSend,
    peer: flags.peer,
    channel: flags.channel,
    thread: flags.thread,
    targetCapability: flags.targetCapability,
    confirmDispatch: flags.confirmDispatch,
    source: 'cli-action',
  });
  if (flags.json) console.log(JSON.stringify(response, null, 2));
  else printHuman(response, ctx);
  return response;
}

module.exports = { run };
