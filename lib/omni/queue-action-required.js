'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_REGISTRY = path.join(ROOT, 'agent_work', 'omni', 'feature-registry.json');
const DEFAULT_QUEUE = path.join(ROOT, 'agent_work', 'omni', 'action-required-queue.json');
const EXPECTED_COUNT = 24;

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function priorityFor(feature) {
  if (feature.state === 'failing') return 1;
  if (feature.state === 'blocked-by-dependency') return 2;
  if (feature.state === 'missing-wiring') return 3;
  if (feature.state === 'partial') return 4;
  return 5;
}

function buildGoal(feature) {
  const location = feature.dir ? ` at ${feature.dir}` : '';
  const note = feature.note ? ` Registry note: ${feature.note}` : '';
  return [
    `Audit and repair OMNI feature "${feature.id}"${location}.`,
    'Preserve existing behavior, verify all claimed wiring, and do not delete or simulate functionality.',
    'Return evidence, tests, remaining blockers, and changed files.',
    note,
  ].join(' ').trim();
}

function buildQueue(registry, previous = {}) {
  const now = new Date().toISOString();
  const oldItems = new Map((previous.items || []).map(item => [item.featureId, item]));
  const features = (registry.features || []).filter(feature => feature.actionRequired === true);
  const seen = new Set();
  const items = [];

  for (const feature of features) {
    if (!feature.id || seen.has(feature.id)) continue;
    seen.add(feature.id);
    const old = oldItems.get(feature.id);
    items.push({
      id: old?.id || `omni-${String(feature.id).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      featureId: feature.id,
      state: old?.state || 'queued',
      executionGate: 'blocked-orchestration-health',
      priority: priorityFor(feature),
      registryState: feature.state,
      target: feature.dir || null,
      goal: buildGoal(feature),
      tags: ['omni', 'action-required', `feature:${feature.id}`, `registry-state:${feature.state}`],
      queuedAt: old?.queuedAt || now,
      updatedAt: now,
      dispatch: {
        route: 'api-harness-kernel',
        mode: 'execute',
        allowedWhen: 'tower health check passes and orchestration truth is clean',
      },
    });
  }

  items.sort((a, b) => a.priority - b.priority || a.featureId.localeCompare(b.featureId));
  return {
    schemaVersion: '1.0.0',
    generatedAt: now,
    sourceRegistry: path.relative(ROOT, DEFAULT_REGISTRY).replace(/\\/g, '/'),
    sourceGeneratedAt: registry.generatedAt || null,
    requestedCount: EXPECTED_COUNT,
    verifiedCount: items.length,
    countDrift: EXPECTED_COUNT - items.length,
    status: items.length === EXPECTED_COUNT ? 'ready' : 'ready-with-count-drift',
    executionPolicy: {
      dispatchStarted: false,
      gate: 'orchestration-health',
      reason: 'Queue creation is allowed; execution remains blocked until tower and orchestration health are verified clean.',
    },
    items,
  };
}

function main() {
  const registryPath = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_REGISTRY;
  const queuePath = process.argv[3] ? path.resolve(process.argv[3]) : DEFAULT_QUEUE;
  const registry = readJson(registryPath);
  if (!registry) {
    console.error(`Could not read feature registry: ${registryPath}`);
    process.exit(1);
  }

  const queue = buildQueue(registry, readJson(queuePath, {}));
  fs.mkdirSync(path.dirname(queuePath), { recursive: true });
  fs.writeFileSync(queuePath, `${JSON.stringify(queue, null, 2)}\n`);

  console.log(`Queued ${queue.verifiedCount} verified actionRequired features.`);
  if (queue.countDrift !== 0) {
    console.log(`Count drift: requested ${queue.requestedCount}, live registry ${queue.verifiedCount}.`);
  }
  console.log(`Execution gate: ${queue.executionPolicy.gate} (dispatch not started).`);
  console.log(`Queue: ${queuePath}`);
}

if (require.main === module) main();

module.exports = { buildQueue, buildGoal, priorityFor };
