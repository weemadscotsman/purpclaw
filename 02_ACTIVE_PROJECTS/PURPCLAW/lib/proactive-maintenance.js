'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_COOLDOWN_MS = 30 * 60 * 1000;

function statePath(rootDir) {
  return path.join(rootDir, 'agent_work', '.proactive_maintenance.json');
}

function readState(rootDir) {
  try {
    return JSON.parse(fs.readFileSync(statePath(rootDir), 'utf8'));
  } catch {
    return { lastRunAt: null, proposed: [] };
  }
}

function writeState(rootDir, state) {
  const file = statePath(rootDir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(state, null, 2), 'utf8');
}

function fileExists(rootDir, relativePath) {
  return fs.existsSync(path.join(rootDir, relativePath));
}

function proposeMaintenanceJobs(rootDir, snapshot = {}) {
  const jobs = [];

  if (fileExists(rootDir, 'package.json')) {
    jobs.push({
      command: 'audit the local build and dependency health, then report exact failing gates',
      reason: 'package runtime present',
      priority: 'low',
    });
  }

  if (fileExists(rootDir, 'docs/audit/PURPCLAW_STACK_AUDIT_2026-05-23.md')) {
    jobs.push({
      command: 'review the stack audit and turn remaining high priority items into one safe implementation plan',
      reason: 'audit backlog exists',
      priority: 'low',
    });
  }

  if ((snapshot.failedWorkflows || 0) > 0) {
    jobs.unshift({
      command: 'diagnose recent failed workflows and propose the smallest repair',
      reason: `${snapshot.failedWorkflows} failed workflow(s) observed`,
      priority: 'normal',
    });
  }

  if ((snapshot.queueDepth || 0) > 0) {
    jobs.unshift({
      command: 'inspect queued workflow backlog and identify blocked routing or overloaded agents',
      reason: `${snapshot.queueDepth} queued workflow(s) observed`,
      priority: 'normal',
    });
  }

  return jobs.slice(0, 3);
}

function shouldRun(rootDir, cooldownMs = DEFAULT_COOLDOWN_MS) {
  const state = readState(rootDir);
  if (!state.lastRunAt) return true;
  return Date.now() - Date.parse(state.lastRunAt) >= cooldownMs;
}

function recordProposal(rootDir, jobs) {
  const state = readState(rootDir);
  const next = {
    ...state,
    lastRunAt: new Date().toISOString(),
    proposed: jobs,
  };
  writeState(rootDir, next);
  return next;
}

module.exports = {
  DEFAULT_COOLDOWN_MS,
  proposeMaintenanceJobs,
  shouldRun,
  recordProposal,
  readState,
};
