'use strict';

/**
 * chat-agent.js — provider-agnostic chat WITH real tool/function calling.
 *
 * Used by two lanes:
 *   • Chat  → MiniMax (primary), FULL tools (bash/read/write/patch/glob/grep)
 *   • Group/Research → OpenRouter capable models, READ-ONLY tools (read/glob/grep)
 *
 * Tools + executor are reused from lib/agent-loop.js so there is one tool
 * implementation. Pass opts.cfg to target a non-default provider (e.g. OpenRouter),
 * opts.tools to limit which schemas the model is offered, and opts.allow to hard-gate
 * which tools may actually execute (defense-in-depth for read-only contexts).
 */

const llm = require('./llm-provider');
const { AGENT_TOOLS, ToolExecutor } = require('./agent-loop');

// Read-only subset — safe to hand to many parallel research models at once.
const READONLY_NAMES = new Set(['read', 'glob', 'grep', 'read_file', 'glob_files', 'grep_files']);
const READONLY_TOOLS = AGENT_TOOLS.filter(t => READONLY_NAMES.has(t.function && t.function.name));

async function chatWithTools(messages, opts = {}) {
  const cwd = opts.cwd || process.cwd();
  const maxTurns = Math.max(1, opts.maxTurns || 6);
  const tools = opts.tools || AGENT_TOOLS;
  const allow = opts.allow || null; // Set of tool names permitted to execute; null = all
  const cfg = opts.cfg || null;     // provider cfg override (OpenRouter etc.); null = primary (MiniMax)
  const session = { cwd, trackFile() {}, recordTool() {} };
  const executor = new ToolExecutor(session);

  const msgs = messages.slice();
  const trace = [];
  let turns = 0;

  while (turns < maxTurns) {
    turns++;
    const resp = await llm.chat(msgs, {
      tools,
      toolChoice: 'auto',
      maxTokens: opts.maxTokens || 1400,
      temperature: opts.temperature ?? 0.4,
      timeoutMs: opts.timeoutMs || 60000,
      scope: opts.scope || undefined,
      disableFallback: opts.disableFallback || false,
    }, cfg);

    const toolCalls = resp.toolCalls || [];
    if (!toolCalls.length) {
      return { content: resp.content || '', toolsUsed: trace.length, trace, turns, provider: resp.model || null };
    }

    msgs.push({ role: 'assistant', content: resp.content || '', tool_calls: toolCalls });
    for (const tc of toolCalls) {
      const name = tc.function && tc.function.name;
      let args = {};
      try { args = JSON.parse((tc.function && tc.function.arguments) || '{}'); } catch {}
      let result;
      if (allow && !allow.has(name)) {
        result = { ok: false, error: `tool "${name}" not permitted in this context (read-only)` };
      } else {
        try { result = executor.execute(name, args); }
        catch (e) { result = { ok: false, error: e.message }; }
      }
      trace.push({ tool: name, args, ok: result && result.ok !== false });
      msgs.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result).slice(0, 4000) });
    }
  }

  const final = await llm.chat(
    msgs.concat([{ role: 'user', content: 'You have reached the tool-call limit. Summarize what you found/did, concisely.' }]),
    { maxTokens: 600, temperature: 0.3, timeoutMs: 45000, scope: opts.scope || undefined, disableFallback: opts.disableFallback || false },
    cfg,
  );
  return { content: final.content || '(reached tool-call limit)', toolsUsed: trace.length, trace, turns, provider: final.model || null };
}

module.exports = { chatWithTools, READONLY_TOOLS, READONLY_NAMES };
