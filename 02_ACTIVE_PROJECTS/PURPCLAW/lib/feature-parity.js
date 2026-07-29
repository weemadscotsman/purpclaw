'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');

// ── CLI parity targets (Phase 1 — mirrors upstream Gitlawb/openclaude) ────────
//
// These use `contains`, not `file`. A file-existence check cannot tell you
// whether a subcommand is wired — the previous version of this block claimed
// eight bg subcommands and a `provider` command on the strength of bin/purpclaw.js
// existing, while `provider` was not in the dispatch switch at all.
const CLI_PARITY_TARGETS = [
  {
    id: 'cli-parity-provider',
    name: 'Provider Profile Management',
    required: 'Interactive provider wizard, named profiles, live probing, OPENCLAUDE_CONFIG_DIR support.',
    checks: [
      { label: 'provider command wired in CLI', type: 'contains', path: 'bin/purpclaw.js', needle: "case 'provider':" },
      { label: 'provider list subcommand',   type: 'contains', path: 'lib/commands/provider.js', needle: "sub === 'list'" },
      { label: 'provider save subcommand',   type: 'contains', path: 'lib/commands/provider.js', needle: "sub === 'save'" },
      { label: 'provider load subcommand',   type: 'contains', path: 'lib/commands/provider.js', needle: "sub === 'load'" },
      { label: 'provider delete subcommand', type: 'contains', path: 'lib/commands/provider.js', needle: "sub === 'delete'" },
      { label: 'provider test subcommand',   type: 'contains', path: 'lib/commands/provider.js', needle: "sub === 'test'" },
      { label: 'provider wizard subcommand', type: 'contains', path: 'lib/commands/provider.js', needle: "sub === 'wizard'" },
      { label: 'OPENCLAUDE_CONFIG_DIR support', type: 'contains', path: 'lib/runtime/provider-config.js', needle: 'OPENCLAUDE_CONFIG_DIR' },
    ],
  },
  {
    id: 'cli-parity-buddy',
    name: 'Companion Hero System',
    required: '/buddy hatch|set|name|mute|unmute|list, hero→species mapping, terminal capability guards.',
    checks: [
      { label: 'buddy wired in CLI',      type: 'contains', path: 'bin/purpclaw.js', needle: "case 'buddy':" },
      { label: 'buddy hatch subcommand',  type: 'contains', path: 'lib/commands/buddy.js', needle: "case 'hatch':" },
      { label: 'buddy set subcommand',    type: 'contains', path: 'lib/commands/buddy.js', needle: "case 'set':" },
      { label: 'buddy name subcommand',   type: 'contains', path: 'lib/commands/buddy.js', needle: "case 'name':" },
      { label: 'buddy mute subcommand',   type: 'contains', path: 'lib/commands/buddy.js', needle: "case 'mute':" },
      { label: 'buddy unmute subcommand', type: 'contains', path: 'lib/commands/buddy.js', needle: "case 'unmute':" },
      { label: 'buddy list subcommand',   type: 'contains', path: 'lib/commands/buddy.js', needle: "case 'list':" },
      { label: 'reduced-motion / narrow-terminal guard', type: 'contains', path: 'lib/commands/buddy.js', needle: 'function canAnimate' },
      { label: 'Mochi sprite library',    type: 'file', path: 'lib/mochi-sprites.js' },
    ],
  },
  {
    id: 'cli-parity-repomap',
    name: 'PageRank Repo Map',
    required: 'REPO_MAP env flag, --repo-map/--no-repo-map, configurable token budget, auto-injection into system prompts.',
    checks: [
      { label: 'repomap wired in CLI',   type: 'contains', path: 'bin/purpclaw.js', needle: "case 'repomap':" },
      { label: 'repo-mapper library',    type: 'file', path: 'lib/repo-mapper.js' },
      { label: '--repo-map/--no-repo-map flags', type: 'contains', path: 'bin/purpclaw.js', needle: "'--no-repo-map'" },
      { label: 'REPO_MAP_TOKENS budget', type: 'contains', path: 'lib/repo-mapper.js', needle: 'REPO_MAP_TOKENS' },
      { label: 'auto-injection into system prompt', type: 'contains', path: 'lib/agent-loop.js', needle: '_repoMapBlock' },
    ],
  },
  {
    id: 'cli-parity-bg-sessions',
    name: 'Background Session Management',
    required: 'purpclaw bg <task>, purpclaw ps, purpclaw logs <job> [-f], purpclaw kill <job>, purpclaw attach <job>.',
    checks: [
      { label: 'bg command wired in CLI', type: 'contains', path: 'bin/purpclaw.js', needle: "case 'bg':" },
      { label: 'bg ps subcommand',     type: 'contains', path: 'bin/purpclaw.js', needle: "sub === 'ps'" },
      { label: 'bg logs subcommand',   type: 'contains', path: 'bin/purpclaw.js', needle: "sub === 'logs'" },
      { label: 'bg kill subcommand',   type: 'contains', path: 'bin/purpclaw.js', needle: "sub === 'kill'" },
      { label: 'bg attach subcommand', type: 'contains', path: 'bin/purpclaw.js', needle: "sub === 'attach'" },
      { label: 'ps top-level alias',     type: 'contains', path: 'bin/purpclaw.js', needle: "case 'ps':" },
      { label: 'kill top-level alias',   type: 'contains', path: 'bin/purpclaw.js', needle: "case 'kill':" },
      { label: 'attach top-level alias', type: 'contains', path: 'bin/purpclaw.js', needle: "case 'attach':" },
      { label: 'logs routes bg jobs without breaking PM2 logs', type: 'contains', path: 'bin/purpclaw.js', needle: "cmdBg(['logs', ...args])" },
    ],
  },
  {
    id: 'cli-parity-env-file',
    name: '--provider-env-file Flag',
    required: '--provider-env-file <path> loads .env-style file before any command runs, and is removed from command args.',
    checks: [
      { label: '--provider-env-file parsed',       type: 'contains', path: 'bin/purpclaw.js', needle: 'loadProviderEnvFile' },
      { label: '--provider-env-file stripped from args', type: 'contains', path: 'bin/purpclaw.js', needle: 'STRIP_FLAGS' },
    ],
  },
];

// ── Core TARGETS (original — 10 harness capability groups) ─────────────────────
const TARGETS = [
  {
    id: 'resident-agent',
    name: 'Resident Agent Runtime',
    required: 'Lives on the server, stays alive between turns, and routes every request through one supervisor.',
    checks: [
      { label: 'PM2 service registry', type: 'file', path: 'service_registry.js' },
      { label: 'Unified API gateway', type: 'service', key: 'api' },
      { label: 'Orchestrator', type: 'service', key: 'orchestrator' },
      { label: 'Agent Tower', type: 'service', key: 'tower' },
    ],
  },
  {
    id: 'gateway-surfaces',
    name: 'Lives Where You Do',
    required: 'CLI, API, web, voice, socket, and future chat-platform connectors share one memory and one router.',
    checks: [
      { label: 'CLI front door', type: 'file', path: 'bin/purpclaw.js' },
      { label: 'Web Mission Control', type: 'service', key: 'nextjs' },
      { label: 'Unified API', type: 'service', key: 'api' },
      { label: 'Voice coordinator', type: 'service', key: 'voice-coordinator', optional: true },
      { label: 'Voice bridge', type: 'service', key: 'voice-bridge', optional: true },
      { label: 'Telegram gateway adapter', type: 'file', path: 'lib/gateways/telegram.js' },
      { label: 'Discord gateway adapter', type: 'file', path: 'lib/gateways/discord.js' },
      { label: 'Slack gateway adapter', type: 'file', path: 'lib/gateways/slack.js' },
      { label: 'Email gateway adapter', type: 'file', path: 'lib/gateways/email.js' },
      { label: 'WhatsApp gateway adapter', type: 'missing', note: 'Telegram pattern is in lib/gateways/ — copy telegram.js → whatsapp.js (needs whatsapp-web.js)' },
      { label: 'Signal gateway adapter', type: 'missing', note: 'Telegram pattern is in lib/gateways/ — copy telegram.js → signal.js (needs signal-cli)' },
    ],
  },
  {
    id: 'persistent-growth',
    name: 'Grows the Longer It Runs',
    required: 'Persistent memory, skill indexing, skill creation, and consolidation feed future work.',
    checks: [
      { label: 'Memory Matrix', type: 'service', key: 'memory', optional: true },
      { label: 'Knowledge Pool', type: 'service', key: 'pool' },
      { label: 'AutoDream consolidation', type: 'service', key: 'autodream', optional: true },
      { label: 'Skill library', type: 'countDirsWithFile', dir: 'skills', file: 'SKILL.md', minimum: 40 },
      { label: 'Skill evolution command', type: 'file', path: 'lib/commands/evolve.js' },
    ],
  },
  {
    id: 'scheduled-automation',
    name: 'Scheduled Automations',
    required: 'Natural-language schedules for reports, backups, briefings, and unattended jobs through the gateway.',
    checks: [
      { label: 'Autonomous maintenance loop', type: 'file', path: 'lib/proactive-maintenance.js' },
      { label: 'Reasoning loop service', type: 'service', key: 'reasoning', optional: true },
      { label: 'Natural-language cron parser', type: 'file', path: 'lib/scheduler/nl-cron.js' },
      { label: 'Scheduler runner', type: 'file', path: 'lib/scheduler/runner.js' },
      { label: 'Scheduler calendar (persisted jobs)', type: 'file', path: 'agent_work/cron-jobs.json' },
    ],
  },
  {
    id: 'delegation',
    name: 'Delegates and Parallelizes',
    required: 'Isolated subagents, owned context packets, worker overflow, remote dispatch, and result synthesis.',
    checks: [
      { label: 'Agent Tower', type: 'service', key: 'tower' },
      { label: 'Worker Pool', type: 'service', key: 'workers' },
      { label: 'Context packets', type: 'file', path: 'lib/context-packet.js' },
      { label: 'Context Bus locks', type: 'service', key: 'context-bus' },
      { label: 'Harness engine', type: 'file', path: 'lib/harness/engine.js' },
      { label: 'SSH worker backend', type: 'file', path: 'lib/workers/ssh-worker.js' },
    ],
  },
  {
    id: 'execution-environments',
    name: 'Real Sandboxing',
    required: 'Local, Docker, SSH, Singularity, Modal, and Daytona-style execution targets with hard isolation where available.',
    checks: [
      { label: 'Local worker service', type: 'file', path: 'worker_service.js' },
      { label: 'HTTP worker backend', type: 'service', key: 'workers' },
      { label: 'SSH worker backend', type: 'file', path: 'lib/workers/ssh-worker.js' },
      { label: 'Modal execution backend', type: 'missing', note: 'Current modal logic service is reasoning support, not an execution backend.' },
      { label: 'Docker execution backend', type: 'missing', note: 'Needs a hardened container worker adapter.' },
      { label: 'Singularity execution backend', type: 'missing', note: 'Needs a HPC/container worker adapter.' },
      { label: 'Daytona execution backend', type: 'missing', note: 'Needs a remote workspace worker adapter.' },
    ],
  },
  {
    id: 'web-browser-control',
    name: 'Full Web and Browser Control',
    required: 'Web search, browser automation, screen/vision, image generation, speech, and multi-model reasoning.',
    checks: [
      { label: 'Browser command', type: 'file', path: 'lib/commands/browser.js' },
      { label: 'Screen look tool', type: 'file', path: 'lib/screen-look.js' },
      { label: 'Vision services', type: 'service', key: 'vision', optional: true },
      { label: 'Object detection service', type: 'service', key: 'yolo', optional: true },
      { label: 'Speech-to-text service', type: 'service', key: 'stt', optional: true },
      { label: 'Voice client', type: 'file', path: 'lib/voice-client.js' },
      { label: 'Multi-model LLM provider', type: 'file', path: 'lib/llm-provider.js' },
      { label: 'Image generation runtime', type: 'file', path: 'lib/imagegen/gateway.js' },
      { label: 'Text-to-speech runtime', type: 'file', path: 'lib/tts/gateway.js' },
    ],
  },
  {
    id: 'intelligence-spine',
    name: 'Intelligence Spine',
    required: 'Graph RAG, chunking, quantization tracking, guardrails, inference routing, KV cache policy, context window budgeting, and context cache awareness.',
    checks: [
      { label: 'Intelligence spine module', type: 'file', path: 'lib/intelligence-spine.js' },
      { label: 'Intelligence CLI command', type: 'file', path: 'lib/commands/intelligence.js' },
      { label: 'Memory Matrix recall', type: 'service', key: 'memory', optional: true },
      { label: 'Knowledge Pool retrieval', type: 'service', key: 'pool' },
      { label: 'Governance checks', type: 'file', path: 'lib/governance.js' },
      { label: 'Job contract guardrails', type: 'file', path: 'lib/job-contract.js' },
      { label: 'HTTP rate limits', type: 'file', path: 'lib/rate-limit.js' },
      { label: 'LLM provider routing', type: 'file', path: 'lib/llm-provider.js' },
      { label: 'Context packets', type: 'file', path: 'lib/context-packet.js' },
    ],
  },
  {
    id: 'research-training',
    name: 'Research and Training Pipeline',
    required: 'Batch trajectories, checkpointing, export, compression, and RL integration surfaces.',
    checks: [
      { label: 'Deep research group', type: 'file', path: 'lib/deep-research-group.js' },
      { label: 'Harness benchmark runner', type: 'file', path: 'scripts/run-harness-benchmark.js' },
      { label: 'Trajectory export buffer', type: 'file', path: 'lib/training-buffer.js' },
      { label: 'Training export CLI', type: 'file', path: 'lib/commands/training.js' },
      { label: 'RL training integration', type: 'missing', note: 'Needs Atropos or equivalent integration.' },
      { label: 'Trajectory compression', type: 'missing', note: 'Needs compression and checkpoint contract.' },
    ],
  },
];

// ── ALL_TARGETS = CLI parity targets + core harness targets ────────────────────
// CLI parity targets are first so parity is always visible
const ALL_TARGETS = CLI_PARITY_TARGETS.concat(TARGETS);

// ── Evaluator helpers ─────────────────────────────────────────────────────────
function countDirsWithFile(root, dir, file) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return 0;
  return fs.readdirSync(abs, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && fs.existsSync(path.join(abs, entry.name, file)))
    .length;
}

function getService(services, key) {
  return services.find(service => service.key === key || service.pm2 === key);
}

function healthCheck(service, options = {}) {
  return new Promise(resolve => {
    if (!service || !service.healthPort || !service.healthPath) {
      resolve({ online: false, reason: 'no health endpoint' });
      return;
    }
    const req = http.get({
      hostname: '127.0.0.1', port: service.healthPort, path: service.healthPath,
      timeout: options.healthTimeoutMs || 15000,
    }, res => {
      res.resume();
      resolve({ online: res.statusCode >= 200 && res.statusCode < 400, statusCode: res.statusCode });
    });
    req.on('timeout', () => { req.destroy(); resolve({ online: false, reason: 'timeout' }); });
    req.on('error', err => resolve({ online: false, reason: err.message }));
  });
}

async function evaluateCheck(root, services, check, options = {}) {
  if (check.type === 'file') {
    const ok = fs.existsSync(path.join(root, check.path));
    return { ...check, state: ok ? 'live' : 'missing', detail: ok ? check.path : `missing ${check.path}` };
  }
  if (check.type === 'contains') {
    // Proves a capability is actually wired, not merely that a file exists.
    let ok = false;
    try { ok = fs.readFileSync(path.join(root, check.path), 'utf8').includes(check.needle); } catch { ok = false; }
    return { ...check, state: ok ? 'live' : 'missing', detail: ok ? `${check.path}: ${check.needle}` : `${check.path} missing ${check.needle}` };
  }
  if (check.type === 'countDirsWithFile') {
    const count = countDirsWithFile(root, check.dir, check.file);
    const ok = count >= check.minimum;
    return { ...check, state: ok ? 'live' : 'partial', detail: `${count}/${check.minimum}` };
  }
  if (check.type === 'service') {
    const service = getService(services, check.key);
    if (!service) return { ...check, state: 'missing', detail: 'not registered' };
    if (!options.probeHealth) {
      return { ...check, state: check.optional ? 'partial' : 'live', detail: `${service.pm2 || service.key} registered` };
    }
    const health = await healthCheck(service, options);
    return {
      ...check,
      state: health.online ? 'live' : (check.optional ? 'partial' : 'missing'),
      detail: health.online ? `${service.name} online` : `${service.name} offline (${health.reason || health.statusCode || 'unknown'})`,
    };
  }
  if (check.type === 'missing') return { ...check, state: 'missing', detail: check.note };
  if (check.type === 'target') {
    const sub = ALL_TARGETS.find(t => t.id === check.targetId);
    if (!sub) return { ...check, state: 'missing', detail: `target '${check.targetId}' not found` };
    const subChecks = [];
    for (const sc of sub.checks) {
      subChecks.push(await evaluateCheck(root, services, sc, options));
    }
    return { ...check, state: rollup(subChecks), _subChecks: subChecks };
  }
  return { ...check, state: 'missing', detail: 'unknown check type' };
}

function rollup(checks) {
  const missing = checks.filter(c => c.state === 'missing').length;
  const partial = checks.filter(c => c.state === 'partial').length;
  if (missing === 0 && partial === 0) return 'live';
  if (missing === checks.length) return 'missing';
  return 'partial';
}

async function evaluate(root, options = {}) {
  const registry = require(path.join(root, 'service_registry.js'));
  const services = registry.getServices ? registry.getServices({ includeUi: true }) : registry.SERVICES;
  const sections = [];

  for (const target of ALL_TARGETS) {
    const checks = [];
    for (const check of target.checks) {
      checks.push(await evaluateCheck(root, services, check, options));
    }
    sections.push({ ...target, state: rollup(checks), checks });
  }

  const allChecks = sections.flatMap(s => s.checks);
  const totals = {
    live: sections.filter(s => s.state === 'live').length,
    partial: sections.filter(s => s.state === 'partial').length,
    missing: sections.filter(s => s.state === 'missing').length,
    total: sections.length,
    checks: {
      live: allChecks.filter(c => c.state === 'live').length,
      partial: allChecks.filter(c => c.state === 'partial').length,
      missing: allChecks.filter(c => c.state === 'missing').length,
      total: allChecks.length,
    },
  };

  return { generatedAt: new Date().toISOString(), totals, sections };
}

module.exports = { TARGETS: ALL_TARGETS, CLI_PARITY_TARGETS, evaluate };
