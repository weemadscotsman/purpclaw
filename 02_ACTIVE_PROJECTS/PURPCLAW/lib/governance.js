'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_POLICY = {
  mode: 'supervised',
  requireApprovalFor: [
    'destructive',
    'dependency-change',
    'deployment',
    'secret-change',
    'self-modification',
    'external-network',
    'optional-service-launch',
  ],
  allowWithoutApproval: [
    'read-only',
    'diagnostic',
    'draft',
    'test',
  ],
  maxAutoQueuedJobs: 1,
};

function policyPath(rootDir) {
  return path.join(rootDir, 'purpclaw_policy.json');
}

function approvalLogPath(rootDir) {
  return path.join(rootDir, 'agent_work', 'approval_requests.jsonl');
}

function readPolicy(rootDir) {
  try {
    return { ...DEFAULT_POLICY, ...JSON.parse(fs.readFileSync(policyPath(rootDir), 'utf8')) };
  } catch {
    return DEFAULT_POLICY;
  }
}

function writePolicy(rootDir, policy) {
  fs.writeFileSync(policyPath(rootDir), JSON.stringify({ ...DEFAULT_POLICY, ...policy }, null, 2), 'utf8');
}

function appendApproval(rootDir, entry) {
  const file = approvalLogPath(rootDir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(entry)}\n`, 'utf8');
}

function listApprovals(rootDir) {
  try {
    return fs.readFileSync(approvalLogPath(rootDir), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line));
  } catch {
    return [];
  }
}

function classifyRisk(command, contract = {}) {
  const text = String(command || '').toLowerCase();
  const risks = new Set();
  const readOnlyIntent = /\b(status|doctor|inspect|list|show|read|audit|review|explain|introspect)\b/.test(text);

  if (/\b(delete|remove|wipe|kill|drop|truncate|reset|purge|clean)\b/.test(text)) risks.add('destructive');
  if (/\b(npm install|pip install|pnpm add|yarn add|upgrade|update package|dependency)\b/.test(text)) risks.add('dependency-change');
  if (/\b(deploy|publish|release|netlify|vercel|pm2 start --all|start --all)\b/.test(text)) risks.add('deployment');
  if (/\b(secret|token|api key|\.env|credential|password)\b/.test(text)) risks.add('secret-change');
  if (!readOnlyIntent && /\b(self|purpclaw|orchestrator|tower|memory matrix|backend|service_registry|ecosystem)\b/.test(text)) risks.add('self-modification');
  if (/\b(fetch|download|external|internet|webhook|remote|api call)\b/.test(text)) risks.add('external-network');
  if (/\b(voice|vision|yolo|cognitive|all services|optional stack)\b/.test(text)) risks.add('optional-service-launch');

  if (contract.type === 'research') risks.add('external-network');
  if (contract.type === 'operations' && !readOnlyIntent) risks.add('self-modification');
  if (risks.size === 0 && readOnlyIntent) risks.add('read-only');
  if (risks.size === 0 && /\b(test|verify|build|lint)\b/.test(text)) risks.add('test');
  if (risks.size === 0) risks.add('draft');

  return Array.from(risks);
}

function checkWorkflow(rootDir, command, contract = {}, options = {}) {
  const policy = readPolicy(rootDir);
  const risks = classifyRisk(command, contract);
  const requiresApproval = risks.some(risk => policy.requireApprovalFor.includes(risk));
  const explicitlyApproved = options.approvalId && isApproved(rootDir, options.approvalId);
  // Operator-initiated = a human drove this from the interactive UI/CLI. On a
  // sovereign local box, the operator typing the command and hitting send IS
  // the approval — so we don't BLOCK their own action. We still classify and
  // return the risks below (audit trail = "gated"), we just don't gut the flow.
  // Autonomous / self-triggered jobs (idle engine, cron) are NOT operator-
  // initiated and stay gated. Set policy.mode = 'paranoid' to gate even the
  // operator's own commands.
  const operatorApproved = Boolean(options.operatorInitiated) && policy.mode !== 'paranoid';
  const approved = Boolean(explicitlyApproved || operatorApproved);

  return {
    mode: policy.mode,
    risks,
    requiresApproval,
    approved,
    autoApproved: Boolean(operatorApproved && requiresApproval),
    allowed: !requiresApproval || approved,
    approvalId: options.approvalId || null,
  };
}

function requestApproval(rootDir, workflowId, command, contract, governance) {
  const entry = {
    id: `approval-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    workflowId,
    command,
    jobType: contract?.type || 'unknown',
    risks: governance?.risks || [],
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  appendApproval(rootDir, entry);
  return entry;
}

function setApprovalStatus(rootDir, id, status) {
  const entry = {
    id,
    status,
    decidedAt: new Date().toISOString(),
  };
  appendApproval(rootDir, entry);
  return entry;
}

function isApproved(rootDir, id) {
  const entries = listApprovals(rootDir).filter(entry => entry.id === id);
  if (!entries.length) return false;
  return entries[entries.length - 1].status === 'approved';
}

function pendingApprovals(rootDir) {
  const latest = new Map();
  for (const entry of listApprovals(rootDir)) {
    latest.set(entry.id, { ...latest.get(entry.id), ...entry });
  }
  return Array.from(latest.values()).filter(entry => entry.status === 'pending');
}

module.exports = {
  DEFAULT_POLICY,
  readPolicy,
  writePolicy,
  classifyRisk,
  checkWorkflow,
  requestApproval,
  setApprovalStatus,
  pendingApprovals,
  listApprovals,
};
