'use strict';

const traceRecorder = require('./trace-recorder');
const loader = require('./skill-loader');
const promoter = require('./skill-promoter');
const paths = require('./paths');
const spring = require('./spring-validator');
const steering = require('./steering-loader');
const { safeString, nowIso } = require('./util');

function loadRuntimeContext(task, options = {}) {
  paths.ensureHivemindDirs();
  const skills = loader.loadSkillsForTask(task, options);
  const antiskills = loader.loadAntiSkillsForTask(task, options);
  const steeringContext = steering.loadSteeringContext(paths.PURP_DIR, { limit: options.steeringLimit || 4 });
  const promptBlock = [
    loader.formatSkillsForAgent(skills, antiskills),
    steering.formatSteeringForAgent(steeringContext),
  ].filter(Boolean).join('\n\n');
  const springStatus = spring.springStatus();
  return { skills, antiskills, steering: steeringContext, promptBlock, springStatus, doctrines: spring.listDoctrines().slice(0, 5) };
}

function enhanceTask(task, context) {
  if (!context || !context.promptBlock) return task;
  return [context.promptBlock, '## Current Task', task].join('\n\n');
}

function startWorkflowTrace(workflow = {}) {
  const task = workflow.command || workflow.task || workflow.parsed?.target || '';
  const ctx = loadRuntimeContext(task, {
    intent: workflow.parsed?.intent || workflow.intent || 'general',
    jobType: workflow.parsed?.intent || workflow.job_type || 'general',
    limit: workflow.hivemindLimit || undefined
  });
  const trace = traceRecorder.startTrace({
    workflow_id: workflow.id,
    task,
    source: workflow.source || 'orchestrator',
    intent: workflow.parsed?.intent || workflow.intent || 'general',
    job_type: workflow.parsed?.intent || 'general',
    evidence: [
      ctx.skills.length ? `skills_loaded:${ctx.skills.length}` : null,
      ctx.doctrines?.length ? `spring_doctrines_loaded:${ctx.doctrines.length}` : null
    ].filter(Boolean),
    spring_context: { doctrines: (ctx.doctrines || []).map(d => d.doctrine_id), average_trust_score: ctx.springStatus?.average_trust_score }
  });
  return { trace, ...ctx };
}

function recordWorkflowStage(workflow, stage, payload = {}) {
  const runId = workflow?.hivemindTraceId || workflow?.hivemind?.trace?.run_id;
  if (!runId) return null;
  return traceRecorder.recordEvent(runId, `workflow.${stage}`, payload);
}

function finishWorkflowTrace(workflow = {}, patch = {}) {
  const runId = workflow.hivemindTraceId || workflow.hivemind?.trace?.run_id;
  if (!runId) return null;
  const resultText = typeof workflow.result === 'string' ? workflow.result : safeString(workflow.result, 1200);
  const toolCalls = collectToolCalls(workflow);
  const trace = traceRecorder.finishTrace(runId, {
    workflow_id: workflow.id,
    task: workflow.command || workflow.task || '',
    source: workflow.source || 'orchestrator',
    intent: workflow.parsed?.intent || 'general',
    agent: workflow.agentId || workflow.parsed?.intent || 'unknown',
    model: patch.model || workflow.model || 'unknown',
    provider: patch.provider || workflow.provider || null,
    outcome: patch.outcome || (workflow.status === 'completed' ? 'success' : workflow.status === 'failed' ? 'failed' : 'partial'),
    status: workflow.status,
    duration_ms: workflow.duration || patch.duration_ms || 0,
    toolCalls,
    tool_calls: toolCalls,
    tools_used: collectToolNames(workflow, toolCalls),
    files_touched: patch.files_touched || [],
    commands: patch.commands || [],
    diff_summary: resultText,
    evidence: [
      ...(patch.evidence || []),
      workflow.status === 'completed' ? 'workflow_completed' : null,
      resultText ? 'result_present' : null,
      workflow.hivemindSkills?.length ? `skills_loaded:${workflow.hivemindSkills.length}` : null,
      workflow.hivemind?.doctrines?.length ? `spring_doctrines_loaded:${workflow.hivemind.doctrines.length}` : null
    ].filter(Boolean),
    error: workflow.error || patch.error || null,
    ended_at: nowIso(),
    tests_passed: patch.tests_passed ?? null,
    rollback: patch.rollback || false,
    destructive: patch.destructive || false,
    user_accepted: patch.user_accepted || workflow.userAccepted || false
  });
  try { promoter.tryPromote(runId); } catch (_) {}
  return trace;
}

function collectToolCalls(workflow) {
  if (Array.isArray(workflow.toolCalls)) return workflow.toolCalls;
  if (Array.isArray(workflow.result?.toolCalls)) return workflow.result.toolCalls;
  if (Array.isArray(workflow.result?.subtasks)) return workflow.result.subtasks.flatMap(s => Array.isArray(s.toolCalls) ? s.toolCalls : []);
  if (Array.isArray(workflow.subtasks)) return workflow.subtasks.flatMap(s => Array.isArray(s.toolCalls) ? s.toolCalls : []);
  return [];
}

function collectToolNames(workflow, toolCalls) {
  const names = new Set();
  for (const tc of toolCalls || []) names.add(tc.name || tc.tool);
  if (Array.isArray(workflow.tools_used)) for (const t of workflow.tools_used) names.add(t);
  return [...names].filter(Boolean);
}

function recordAgentTrace(agent = {}, result = {}, options = {}) {
  const toolCalls = Array.isArray(agent.toolCalls) ? agent.toolCalls : Array.isArray(result.toolCalls) ? result.toolCalls : [];
  const trace = traceRecorder.startTrace({
    workflow_id: options.workflowId || agent.workflowId || null,
    task: agent.task || options.task || '',
    source: options.source || 'agent_tower',
    agent: agent.name || options.agentName || 'unknown',
    model: result.model || options.model || 'unknown',
    provider: result.provider || options.provider || null,
    intent: options.intent || 'agent',
    job_type: options.intent || 'agent',
    evidence: toolCalls.length ? [`tool_calls:${toolCalls.length}`] : []
  });
  return traceRecorder.finishTrace(trace.run_id, {
    outcome: result.error || agent.status === 'error' ? 'failed' : 'success',
    status: agent.status,
    duration_ms: agent.endTime && agent.startTime ? (new Date(agent.endTime).getTime() - new Date(agent.startTime).getTime()) : 0,
    toolCalls,
    tools_used: toolCalls.map(t => t.name || t.tool).filter(Boolean),
    diff_summary: agent.result || result.output || result.content || result.error || '',
    error: result.error || null,
    evidence: [toolCalls.length ? `tool_calls:${toolCalls.length}` : null, agent.result ? 'agent_output_present' : null].filter(Boolean)
  });
}

function validateRecord(record, rules = {}) {
  const enriched = spring.enrichRecord(record || {});
  const verdict = spring.canPromote({ ...(record || {}), spring: enriched }, { ...paths.defaultRules(), ...rules });
  return {
    ...enriched,
    ok_to_promote: verdict.ok,
    blocked: verdict.blocked,
    spring: enriched,
    verdict,
  };
}

module.exports = { loadRuntimeContext, enhanceTask, startWorkflowTrace, recordWorkflowStage, finishWorkflowTrace, recordAgentTrace, validateRecord };
