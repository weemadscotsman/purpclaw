'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const JOB_TYPES = {
  code: {
    keywords: ['code', 'build', 'fix', 'bug', 'feature', 'api', 'component', 'refactor', 'wire', 'connect'],
    routeIntent: 'build',
    agents: ['dragon', 'robot', 'bee', 'rabbit'],
    gates: ['syntax', 'build'],
  },
  writing: {
    keywords: ['write', 'copy', 'blog', 'doc', 'readme', 'story', 'script', 'content', 'article'],
    routeIntent: 'content',
    agents: ['phoenix', 'panda', 'parrot', 'owl'],
    gates: ['artifact-review'],
  },
  graphics: {
    keywords: ['graphic', 'image', 'visual', 'ui', 'design', 'layout', 'brand', 'screen', 'dashboard'],
    routeIntent: 'design',
    agents: ['mushroom', 'duck', 'penguin', 'chart'],
    gates: ['build', 'visual-review'],
  },
  testing: {
    keywords: ['test', 'qa', 'verify', 'e2e', 'regression', 'coverage', 'smoke'],
    routeIntent: 'test',
    agents: ['turtle', 'rabbit', 'robot'],
    gates: ['test', 'build'],
  },
  security: {
    keywords: ['security', 'auth', 'permission', 'secret', 'token', 'audit', 'vulnerability', 'access'],
    routeIntent: 'security',
    agents: ['owl', 'ghost', 'guardian', 'snake'],
    gates: ['security-audit', 'build'],
  },
  research: {
    keywords: ['research', 'investigate', 'compare', 'find', 'look up', 'source', 'map'],
    routeIntent: 'research',
    agents: ['spider', 'raven', 'duck', 'hawk'],
    gates: ['source-review'],
  },
  operations: {
    keywords: ['deploy', 'pm2', 'port', 'service', 'doctor', 'stack', 'runtime', 'process', 'launch'],
    routeIntent: 'infrastructure',
    agents: ['cactus', 'void', 'gorilla', 'shark'],
    gates: ['doctor', 'build'],
  },
  architecture: {
    keywords: ['architecture', 'plan', 'system', 'harness', 'orchestration', 'pipeline', 'runtime'],
    routeIntent: 'architect',
    agents: ['dragon', 'wolf', 'penguin', 'owl'],
    gates: ['contract-review'],
  },
};

const DEFAULT_GATES = ['artifact-review'];

function scoreType(text, typeDef) {
  const lower = text.toLowerCase();
  return typeDef.keywords.reduce((score, keyword) => score + (keywordMatches(lower, keyword) ? 1 : 0), 0);
}

function keywordMatches(text, keyword) {
  const lowerKeyword = keyword.toLowerCase();
  if (lowerKeyword.includes(' ')) return text.includes(lowerKeyword);
  const escaped = lowerKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(text);
}

function classifyJob(text) {
  const scores = Object.entries(JOB_TYPES)
    .map(([type, def]) => ({ type, score: scoreType(text, def), def }))
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  const winner = scores[0] || { type: 'code', score: 0, def: JOB_TYPES.code };
  const supporting = scores.slice(1, 4).map(entry => entry.type);
  return {
    type: winner.type,
    confidence: winner.score > 2 ? 'high' : winner.score > 0 ? 'medium' : 'low',
    routeIntent: winner.def.routeIntent,
    supportingTypes: supporting,
  };
}

function readPackageScripts(rootDir) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
    return pkg.scripts || {};
  } catch {
    return {};
  }
}

function resolveGateCommands(rootDir, gateNames) {
  const scripts = readPackageScripts(rootDir);
  const commands = [];
  const addScript = (gate, scriptName) => {
    if (scripts[scriptName]) commands.push({ gate, command: 'npm', args: ['run', scriptName] });
  };

  for (const gate of gateNames) {
    if (gate === 'build') addScript(gate, 'build');
    if (gate === 'test') addScript(gate, 'test');
    if (gate === 'syntax') commands.push({ gate, command: 'node', args: ['--check', 'orchestrator.js'] });
    if (gate === 'security-audit') commands.push({ gate, command: 'npm', args: ['audit', '--audit-level=moderate'] });
    if (gate === 'doctor') commands.push({ gate, command: 'node', args: ['bin/purpclaw.js', 'doctor'] });
  }

  return commands;
}

function createJobContract(command, parsed = {}, options = {}) {
  const text = String(command || parsed.raw || parsed.target || '').trim();
  const classification = classifyJob(text);
  const typeDef = JOB_TYPES[classification.type] || JOB_TYPES.code;
  const gates = [...new Set([...(typeDef.gates || DEFAULT_GATES), ...(options.extraGates || [])])];

  return {
    id: `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    source: options.source || 'orchestrator',
    command: text,
    type: classification.type,
    confidence: classification.confidence,
    routeIntent: classification.routeIntent,
    supportingTypes: classification.supportingTypes,
    preferredAgents: typeDef.agents,
    verificationGates: gates,
    signoffRequired: true,
    acceptance: [
      'Task output exists or a clear blocker is reported',
      'Relevant verification gates pass or are explicitly marked not applicable',
      'Result is summarized for operator sign-off',
    ],
  };
}

function formatContractForAgent(contract) {
  if (!contract) return '';
  return [
    '## Job Contract',
    `Job type: ${contract.type}`,
    `Preferred agents: ${(contract.preferredAgents || []).join(', ')}`,
    `Verification gates: ${(contract.verificationGates || []).join(', ')}`,
    'Acceptance:',
    ...(contract.acceptance || []).map(item => `- ${item}`),
    'Return a concise result, changed files/artifacts, tests run, and remaining blockers.',
  ].join('\n');
}

function runVerificationGates(rootDir, contract, options = {}) {
  const timeoutMs = options.timeoutMs || 120000;
  const commands = resolveGateCommands(rootDir, contract?.verificationGates || []);
  const results = [];

  for (const item of commands) {
    const startedAt = new Date().toISOString();
    const result = spawnSync(item.command, item.args, {
      cwd: rootDir,
      encoding: 'utf8',
      timeout: timeoutMs,
      windowsHide: true,
      shell: false,
      maxBuffer: 1024 * 1024 * 5,
    });
    results.push({
      gate: item.gate,
      command: [item.command, ...item.args].join(' '),
      ok: result.status === 0,
      status: result.status,
      startedAt,
      endedAt: new Date().toISOString(),
      output: `${result.stdout || ''}${result.stderr || ''}`.slice(-4000),
      error: result.error ? result.error.message : null,
    });
  }

  const requested = contract?.verificationGates || [];
  const executed = new Set(results.map(result => result.gate));
  for (const gate of requested) {
    if (!executed.has(gate)) {
      results.push({
        gate,
        command: null,
        ok: true,
        status: 'not-applicable',
        output: 'No local automatic check configured for this gate; operator/agent review required.',
        error: null,
      });
    }
  }

  return {
    ok: results.every(result => result.ok),
    results,
  };
}

module.exports = {
  JOB_TYPES,
  classifyJob,
  createJobContract,
  formatContractForAgent,
  runVerificationGates,
  resolveGateCommands,
};
