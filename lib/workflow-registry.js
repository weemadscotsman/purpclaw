'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const WORKFLOW_REGISTRY_PATH = path.join(ROOT, 'registry', 'workflows.json');

function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}

function readRegistry() {
  return readJson(WORKFLOW_REGISTRY_PATH, { schema: 'purpclaw.workflow-registry.v1', workflows: [], levels: [] });
}

function listWorkflows() {
  return readRegistry().workflows || [];
}

function findWorkflow(id) {
  const key = String(id || '').trim().toLowerCase();
  if (!key) return null;
  return listWorkflows().find(w => w.id === key || String(w.name || '').toLowerCase() === key) || null;
}

function existsAny(candidates) {
  for (const rel of candidates) {
    if (fs.existsSync(path.join(ROOT, rel))) return rel;
  }
  return null;
}

function artifactState() {
  const artifacts = {
    brief: existsAny(['project.json', 'docs/project.json', 'docs/project-brief.md', 'docs/brief.md', 'vision.md', 'docs/vision.md']),
    prd: existsAny(['prd.md', 'docs/prd.md', 'docs/PRD.md', 'docs/spec/prd.md', 'docs/spec/PRD.md']),
    ux: existsAny(['ux-spec.md', 'docs/ux-spec.md', 'screen_inventory.md', 'docs/screen_inventory.md', 'docs/spec/SCREEN_INVENTORY.md']),
    featureRegistry: existsAny(['feature_registry.json', 'docs/feature_registry.json', 'lib/omni/feature-registry.js']),
    architecture: existsAny(['architecture.md', 'ARCHITECTURE.md', 'docs/architecture.md', 'docs/spec/architecture.md']),
    architectureValidation: existsAny(['architecture_validation.md', 'docs/architecture_validation.md', 'docs/audit/ARCHITECTURE_VALIDATION.md']),
    stories: existsAny(['stories', 'docs/stories', 'TASKS', 'docs/spec/stories']),
    testPlan: existsAny(['test-plan.md', 'docs/test-plan.md', 'tests', 'docs/spec/test-plan.md']),
    handoff: existsAny(['divisions/engineering/memory/handoff-engineering.md']),
    weather: existsAny(['lib/weatherman.js']),
    oracle: existsAny(['lib/oracle.js']),
  };
  return artifacts;
}

function classifyTask(text = '') {
  const t = String(text || '').toLowerCase();
  if (!t.trim()) return { level: 4, id: 'product', reason: 'no task text supplied; defaulting to project-level guidance' };
  if (/\b(typo|copy|rename|one line|small css|margin|text)\b/.test(t)) return { level: 0, id: 'tiny-fix', reason: 'small textual or style change' };
  if (/\b(bug|fix|broken|error|crash|failing|regression)\b/.test(t)) return { level: 1, id: 'bug', reason: 'bug/failure language detected' };
  if (/\b(feature|add|support|command|endpoint|panel|button)\b/.test(t)) return { level: 2, id: 'feature', reason: 'feature/change language detected' };
  if (/\b(module|registry|router|pipeline|provider|service|subsystem)\b/.test(t)) return { level: 3, id: 'module', reason: 'module/subsystem language detected' };
  if (/\b(product|app|platform|workflow|architecture|greenfield)\b/.test(t)) return { level: 4, id: 'product', reason: 'product/workflow architecture language detected' };
  if (/\b(enterprise|system|security boundary|compliance|multi-tenant|org-wide)\b/.test(t)) return { level: 5, id: 'enterprise-system', reason: 'system/enterprise language detected' };
  return { level: 2, id: 'feature', reason: 'defaulting to feature-level ceremony' };
}

function determinePhase(artifacts = artifactState()) {
  if (!artifacts.brief) {
    return {
      phase: 'discovery',
      done: [],
      missing: ['project brief', 'vision/goals', 'constraints/evidence'],
      workflow: 'discovery.brainstorm',
    };
  }
  if (!artifacts.prd) {
    return {
      phase: 'planning',
      done: ['project brief'],
      missing: ['PRD', 'acceptance criteria'],
      workflow: 'planning.prd',
    };
  }
  if (!artifacts.architecture) {
    return {
      phase: 'solutioning',
      done: ['project brief', 'PRD'],
      missing: ['architecture', 'contracts', 'feature registry delta'],
      workflow: 'solution.architecture',
    };
  }
  if (!artifacts.architectureValidation) {
    return {
      phase: 'solutioning',
      done: ['project brief', 'PRD', 'architecture'],
      missing: ['architecture validation', 'risk review'],
      workflow: 'solution.architecture-validate',
    };
  }
  if (!artifacts.stories) {
    return {
      phase: 'solutioning',
      done: ['project brief', 'PRD', 'architecture', 'architecture validation'],
      missing: ['epic/story breakdown'],
      workflow: 'solution.epics',
    };
  }
  if (!artifacts.testPlan) {
    return {
      phase: 'solutioning',
      done: ['project brief', 'PRD', 'architecture', 'stories'],
      missing: ['test strategy'],
      workflow: 'solution.test-design',
    };
  }
  return {
    phase: 'implementation',
    done: ['project brief', 'PRD', 'architecture', 'stories', 'test plan'],
    missing: ['current story selection', 'verification evidence', 'handoff update'],
    workflow: 'implementation.story-create',
  };
}

function nextStep(text = '') {
  const registry = readRegistry();
  const artifacts = artifactState();
  const phase = determinePhase(artifacts);
  const workflow = findWorkflow(phase.workflow);
  const complexity = classifyTask(text);
  return {
    schema: 'purpclaw.next-step.v1',
    generated_at: new Date().toISOString(),
    complexity,
    phase: phase.phase,
    done: phase.done,
    missing: phase.missing,
    next_workflow: workflow,
    next_command: workflow ? workflow.command : 'purpclaw oracle',
    artifacts,
    registry: {
      schema: registry.schema,
      workflow_count: (registry.workflows || []).length,
      level_count: (registry.levels || []).length,
    },
  };
}

module.exports = {
  ROOT,
  WORKFLOW_REGISTRY_PATH,
  readRegistry,
  listWorkflows,
  findWorkflow,
  artifactState,
  classifyTask,
  determinePhase,
  nextStep,
};
