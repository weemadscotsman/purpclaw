'use strict';

/**
 * packages/harness-claude — Stage 4 parity
 * Claude harness: deep context, architecture analysis, contradiction detection.
 */
const fs   = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const taskSchema    = require("../task-schema");
const resultSchema  = require("../result-schema");
const contextSpine = require("../context-spine");
const memoryAudit   = require("../memory-audit");
const verification = require("../verification-core");

const HARNESS = "claude";
const VERIFY_GATES = ["syntax", "lint", "build"];

function now() { return Date.now(); }

function resolveRepoRoot(task) {
  if (task.repoPath && fs.existsSync(task.repoPath)) return path.resolve(task.repoPath);
  let dir = task.repoPath || process.cwd();
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, ".git"))) return dir;
    dir = path.dirname(dir);
  }
  return task.repoPath || process.cwd();
}

function assembleClaudeContext(task) {
  const root = resolveRepoRoot(task);
  const ctx  = contextSpine.assembleContext(task, { root, maxTokens: 120000, includeMem: true });
  const tagged = ctx.items.map(item => {
    const src = item.provenance?.source || "";
    let tag = "implementation";
    if (/truth|readme|architecture|spec/i.test(src)) tag = "architecture";
    else if (/test|__tests__/i.test(src)) tag = "test";
    else if (/memory/i.test(src)) tag = "prior-decision";
    else if (/git/i.test(src)) tag = "history";
    return { ...item, tag };
  });
  return { ...ctx, items: tagged, root };
}

function scanContradictions(ctx) {
  const byFile = {};
  for (const item of ctx.items) {
    if (!item.path || !item.content) continue;
    const contradictions = [];
    const funcDefs = (item.content.match(/function\s+(\w+)/g) || []);
    const seen = {};
    for (const fd of funcDefs) {
      const name = fd.replace("function ", "");
      if (seen[name]) contradictions.push("Duplicate function: " + name);
      seen[name] = true;
    }
    const reqs = item.content.match(/require\(['"]([^'"]+)['"]\)/g) || [];
    const imps = item.content.match(/^import\s.*from\s['"]([^'"]+)['"]/gm) || [];
    if (imps.length && reqs.length > 3) contradictions.push("Mixed ESM/CommonJS module conflict");
    if (contradictions.length) byFile[item.path] = contradictions;
  }
  return byFile;
}

function buildAssumptionsLedger(ctx) {
  const assumptions = [];
  const hasPkg = ctx.items.some(i => i.path && /package\.json$/.test(i.path));
  if (!hasPkg) assumptions.push({ type: "missing-context", desc: "package.json not in context", risk: "medium" });
  return assumptions;
}

async function runClaudeAnalysis(task, ctx, contradictions, assumptions) {
  try {
    const { default: llmProvider } = await import("../llm-provider").catch(() => null);
    if (!llmProvider) return {};
    const md = contextSpine.renderForLLM(ctx);
    const resp = await llmProvider.chat([
      { role: "system", content: 'You are CLAUDE. Respond ONLY with JSON: { "currentTruth": "...", "contradictionsFound": [], "missingLayers": [], "rootCause": "...", "recommendedFixOrder": [], "risks": [], "beforeAfterMap": {}, "nextArchitecturalDecision": "" }' },
      { role: "user", content: "GOAL: " + task.goal + "\n\nCONTEXT: " + md.slice(0, 6000) + "\n\nCONTRADICTIONS: " + JSON.stringify(contradictions) + "\n\nASSUMPTIONS: " + JSON.stringify(assumptions) },
    ], { temperature: 0.4, maxTokens: 3000, responseFormat: { type: "json_object" } });
    const raw = resp.content || "";
    const analysis = JSON.parse(raw.replace(/```json\n?/g,"").replace(/```\n?/g,""));
    const fpath = path.join(ctx.root || ".", "agent_work", "harness", task.taskId + "_analysis.md");
    fs.mkdirSync(path.dirname(fpath), { recursive: true });
    fs.writeFileSync(fpath, "# Claude Analysis\n\n**Goal:** " + task.goal + "\n\n" + JSON.stringify(analysis, null, 2) + "\n", "utf8");
    return analysis;
  } catch { return {}; }
}

async function run(taskOrGoal) {
  let task;
  if (typeof taskOrGoal === "string") {
    task = taskSchema.normaliseTask({ taskId: "claude_" + now() + "_" + Math.random().toString(36).slice(2,7), goal: taskOrGoal });
  } else {
    task = taskSchema.validateTask(taskOrGoal);
  }
  const root = resolveRepoRoot(task);
  const startedAt = now();
  const result = resultSchema.createResult(task, HARNESS);
  memoryAudit.startTask(root, { taskId: task.taskId, goal: task.goal, harness: HARNESS, repoPath: root, priority: task.priority, preferredHarness: task.preferredHarness });
  memoryAudit.logStep(root, { taskId: task.taskId, harness: HARNESS, goal: task.goal });
  try {
    const ctx = assembleClaudeContext(task);
    const contradictions = scanContradictions(ctx);
    const assumptions = buildAssumptionsLedger(ctx);
    const analysis = await runClaudeAnalysis(task, ctx, contradictions, assumptions);
    for (const [file, issues] of Object.entries(contradictions)) {
      for (const issue of issues) {
        resultSchema.addError(result, { phase: "analysis", message: "[" + path.basename(file) + "] " + issue });
      }
    }
    const gateResults = verification.runGates(root, VERIFY_GATES, { acceptanceCriteria: task.acceptanceCriteria || [] });
    for (const gr of (gateResults.results || [])) {
      resultSchema.addVerification(result, { criterion: gr.gate, passed: gr.ok, evidence: gr.output || null });
    }
    result.durationMs = now() - startedAt;
    const hasIssues = Object.keys(contradictions).length > 0 || !gateResults.ok;
    if (!hasIssues) {
      resultSchema.pass(result, "Claude: " + result.filesChanged.length + " file(s). Analysis complete. " + Object.keys(contradictions).length + " contradiction(s).");
    } else {
      resultSchema.partial(result, "Claude: partial — " + Object.keys(contradictions).length + " contradiction(s). " + (gateResults.ok ? "Gates passed." : "Gates failed."));
    }
    memoryAudit.finishTask(root, { taskId: task.taskId, status: result.status, summary: result.summary, metrics: { durationMs: result.durationMs, filesChanged: result.filesChanged.length } });
    memoryAudit.logStep(root, { taskId: task.taskId, harness: HARNESS, goal: task.goal, status: result.status, completedAt: new Date().toISOString() });
    return resultSchema.validateResult(result);
  } catch (err) {
    result.durationMs = now() - startedAt;
    resultSchema.fail(result, err.message);
    resultSchema.addError(result, { phase: "harness", message: err.message, stack: err.stack });
    memoryAudit.finishTask(root, { taskId: task.taskId, status: "failed", summary: err.message, metrics: { durationMs: result.durationMs } });
    memoryAudit.logStep(root, { taskId: task.taskId, harness: HARNESS, goal: task.goal, status: "failed" });
    return result;
  }
}

module.exports = { run, HARNESS };
