'use strict';

const fs = require('fs');
const path = require('path');

const EXEC_PATTERNS = [
  { regex: /\bexecuteWorkflow\(/, kind: 'orchestrator-workflow' },
  { regex: /\benqueueWorkflow\(/, kind: 'orchestrator-queue' },
  { regex: /\bexecuteTool\(/, kind: 'tool-dispatch' },
  { regex: /\brunTool\(/, kind: 'tool-runner' },
  { regex: /\bspawn\(/, kind: 'process-spawn' },
  { regex: /\bexec\(/, kind: 'shell-exec' },
  { regex: /\bexecSync\(/, kind: 'shell-exec-sync' },
  { regex: /\bspawnSync\(/, kind: 'process-spawn-sync' },
  { regex: /\bprocess\.kill\(/, kind: 'process-kill' },
  { regex: /\bfs\.writeFileSync\(/, kind: 'file-write' },
  { regex: /\/api\/spawn|\/api\/team\/spawn|\/api\/tool|\/api\/tools\/call/, kind: 'http-execution-endpoint' },
];

const GOVERNED_MARKERS = [
  'checkWorkflow(',
  'requestApproval(',
  'approvalId',
  'governance',
  '/api/orchestrate',
  'cmdRun(',
];

const RUNTIME_FILES = [
  'bin/purpclaw.js',
  'unified_api.js',
  'orchestrator.js',
  'agent_tower.js',
  'spinUpAgent.js',
  'task_decomposer.js',
  'tmux-worktree-orchestrator.js',
  'lib/lib/tmux-worktree-orchestrator.js',
];

function readLines(rootDir, relPath) {
  try {
    return fs.readFileSync(path.join(rootDir, relPath), 'utf8').split(/\r?\n/);
  } catch {
    return [];
  }
}

function contextHasGovernance(lines, index) {
  const start = Math.max(0, index - 8);
  const end = Math.min(lines.length, index + 8);
  const context = lines.slice(start, end).join('\n');
  return GOVERNED_MARKERS.some(marker => context.includes(marker));
}

function classifyFinding(file, lineText, kind, governed) {
  const text = lineText.toLowerCase();
  if (file === 'orchestrator.js' && governed) return 'governed';
  if (text.includes('/api/orchestrate') || text.includes('cmdrun(')) return 'governed';
  if (kind === 'file-write' && /log|state|json|stringify|screenshot|context|approval/.test(text)) return 'state-write';
  if (kind.includes('spawn') || kind.includes('exec') || kind === 'process-kill' || kind === 'http-execution-endpoint') return governed ? 'review' : 'bypass-candidate';
  return governed ? 'review' : 'unknown';
}

function audit(rootDir) {
  const findings = [];
  for (const file of RUNTIME_FILES) {
    const lines = readLines(rootDir, file);
    lines.forEach((line, idx) => {
      for (const pattern of EXEC_PATTERNS) {
        if (!pattern.regex.test(line)) continue;
        const governed = contextHasGovernance(lines, idx);
        findings.push({
          file,
          line: idx + 1,
          kind: pattern.kind,
          classification: classifyFinding(file, line, pattern.kind, governed),
          governed,
          text: line.trim().slice(0, 220),
        });
      }
    });
  }
  return findings;
}

function summarize(findings) {
  const counts = {};
  for (const finding of findings) {
    counts[finding.classification] = (counts[finding.classification] || 0) + 1;
  }
  return {
    total: findings.length,
    counts,
    bypassCandidates: findings.filter(finding => finding.classification === 'bypass-candidate'),
  };
}

module.exports = {
  audit,
  summarize,
};
