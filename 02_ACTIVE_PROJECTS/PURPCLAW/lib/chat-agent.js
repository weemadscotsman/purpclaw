'use strict';

/**
 * chat-agent.js — provider-agnostic chat WITH real tool/function calling.
 *
 * Used by two lanes:
 *   • Chat  → MiniMax (primary), FULL tools (bash/read/write/patch/glob/grep)
 *   • Group/Research → OpenRouter capable models, READ-ONLY tools (read/glob/grep)
 *
 * Tools + executor are reused from agent-loop.js so there is one tool
 * implementation. Pass opts.cfg to target a non-default provider (e.g. OpenRouter),
 * opts.tools to limit which schemas the model is offered, and opts.allow to hard-gate
 * which tools may actually execute (defense-in-depth for read-only contexts).
 */

const llm = require('./llm-provider');
const TOOLS = require('./tools/index');
const { ToolRuntime } = require('./tool-runtime');
const { runAgent } = require('./agent-loop');
const STEER = (() => { try { return require('./steering-middleware'); } catch { return null; } })();

// All available tools as tool definitions
const AGENT_TOOLS = TOOLS.list().map(t => ({
  name: t.name,
  description: (t.description || '').substring(0, 200),
  parameters: t.inputSchema || { type: 'object', properties: {} },
}));

// Read-only subset — safe to hand to many parallel research models at once.
const READONLY_NAMES = new Set(['read', 'glob', 'grep', 'read_file', 'glob_files', 'grep_files']);
const READONLY_TOOLS = AGENT_TOOLS.filter(t => READONLY_NAMES.has(t.name));

/**
 * ToolExecutor wraps the canonical ToolRuntime — schema validation,
 * guardrails, path security, steering enforcement, permissions, governance,
 * approvals, checkpoints — instead of a raw TOOLS.invoke that bypasses all
 * of it. Phase 3: the chat lane is an effectful path, so it goes through
 * the same deterministic ladder as every other effectful path.
 */
class ToolExecutor {
  constructor(session = {}, opts = {}) {
    this.session = session;
    this.runtime = new ToolRuntime({
      registry: TOOLS,
      allowedTools: opts.allow ? [...opts.allow] : null,
      approvalCallback: opts.approvalCallback || null,
    });
    this.steeringCapsule = opts.steeringCapsule || null;
  }

  async execute(toolName, args) {
    try {
      const result = await this.runtime.invoke(toolName, args, {
        cwd: this.session.cwd,
        sessionId: this.session.id,
        steeringCapsule: this.steeringCapsule,
      });
      return {
        ok: result.ok,
        content: result.content || result.stdout || result.error || '',
        error: result.error,
      };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }
}

async function chatWithTools(messages, opts = {}) {
  const cwd = opts.cwd || process.cwd();
  const maxTurns = Math.max(1, opts.maxTurns || 6);
  const tools = opts.tools || AGENT_TOOLS;
  const allowList = opts.allow || new Set(tools.map(t => t.name));

  // Phase 3 — resolve steering ONCE for the whole chat turn, before any
  // provider call or tool execution. The same capsule is threaded into the
  // agent loop (prompt + loop gate) and the executor (ToolRuntime boundary).
  let steeringCapsule = null;
  if (STEER) {
    try { steeringCapsule = STEER.resolveForTurn({ intent: 'chat', rootDir: opts.rootDir, operatorOverrides: opts.operatorOverrides }); }
    catch { /* steering failure must not break chat; executor runs ungated */ }
  }
  const executor = new ToolExecutor({ cwd, id: opts.sessionId }, { allow: allowList, steeringCapsule, approvalCallback: opts.approvalCallback });

  const allMessages = [];
  for (const m of messages) {
    allMessages.push(m);
  }

  let turn = 0;
  let lastReply = '';
  let steeringBlocked = null;

  for await (const ev of runAgent({
    history: allMessages,
    opts: { maxTurns, tools, cwd, steeringCapsule, project: opts.project, sessionId: opts.sessionId },
  })) {
    if (ev.type === 'token') {
      lastReply += ev.content;
    } else if (ev.type === 'tool-call') {
      if (!allowList.has(ev.tool)) {
        allMessages.push({
          role: 'tool',
          name: ev.tool,
          content: `Error: tool ${ev.tool} is not in the allow list for this context`,
        });
        continue;
      }
      const result = await executor.execute(ev.tool, ev.args);
      allMessages.push({
        role: 'tool',
        name: ev.tool,
        content: result.content || result.error || '',
      });
    } else if (ev.type === 'steering-blocked') {
      steeringBlocked = { capsuleId: ev.capsuleId, conflicts: ev.conflicts };
    } else if (ev.type === 'done') {
      break;
    } else if (ev.type === 'error') {
      throw new Error(ev.error);
    }
  }

  return { content: lastReply.trim(), messages: allMessages, steeringBlocked, capsuleId: steeringCapsule && steeringCapsule.capsuleId };
}

module.exports = { chatWithTools, ToolExecutor, AGENT_TOOLS, READONLY_TOOLS };
