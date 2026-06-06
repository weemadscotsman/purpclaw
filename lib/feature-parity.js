'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');

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
      hostname: '127.0.0.1',
      port: service.healthPort,
      path: service.healthPath,
      timeout: options.healthTimeoutMs || 15000,
    }, res => {
      res.resume();
      resolve({ online: res.statusCode >= 200 && res.statusCode < 400, statusCode: res.statusCode });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({ online: false, reason: 'timeout' });
    });
    req.on('error', err => resolve({ online: false, reason: err.message }));
  });
}

async function evaluateCheck(root, services, check, options = {}) {
  if (check.type === 'file') {
    const ok = fs.existsSync(path.join(root, check.path));
    return { ...check, state: ok ? 'live' : 'missing', detail: ok ? check.path : `missing ${check.path}` };
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

  if (check.type === 'missing') {
    return { ...check, state: 'missing', detail: check.note };
  }

  return { ...check, state: 'missing', detail: 'unknown check type' };
}

function rollup(checks) {
  const missing = checks.filter(check => check.state === 'missing').length;
  const partial = checks.filter(check => check.state === 'partial').length;
  if (missing === 0 && partial === 0) return 'live';
  if (missing === checks.length) return 'missing';
  return 'partial';
}

async function evaluate(root, options = {}) {
  const registry = require(path.join(root, 'service_registry.js'));
  const services = registry.getServices ? registry.getServices({ includeUi: true }) : registry.SERVICES;
  const sections = [];

  for (const target of TARGETS) {
    const checks = [];
    for (const check of target.checks) {
      checks.push(await evaluateCheck(root, services, check, options));
    }
    sections.push({ ...target, state: rollup(checks), checks });
  }

  const allChecks = sections.flatMap(section => section.checks);
  const totals = {
    live: sections.filter(section => section.state === 'live').length,
    partial: sections.filter(section => section.state === 'partial').length,
    missing: sections.filter(section => section.state === 'missing').length,
    total: sections.length,
    checks: {
      live: allChecks.filter(check => check.state === 'live').length,
      partial: allChecks.filter(check => check.state === 'partial').length,
      missing: allChecks.filter(check => check.state === 'missing').length,
      total: allChecks.length,
    },
  };

  return { generatedAt: new Date().toISOString(), totals, sections };
}

module.exports = { TARGETS, evaluate };
