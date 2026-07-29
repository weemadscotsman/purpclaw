'use strict';

/**
 * chat-agent.js — provider-agnostic chat WITH real tool/function calling.
 *
 * Used by two lanes:
 *   • Chat  → MiniMax (primary), FULL tools (bash/read/write/patch/glob/grep)
 *   • Group/Research → OpenRouter capable models, READ-ONLY tools (read/glob/grep)
 *
 * Tool execution is handled exclusively by runAgent via ToolRuntime.
 * opts.allow hard-gates which tools runAgent may execute (defense-in-depth).
 * opts.tools limits which tool schemas the model is shown.
 *
 * P0-B FIX: Removed ToolExecutor class and executor.execute() call.
 * Previously chat-agent.js double-executed every tool: once via ToolRuntime
 * in runAgent (agent-loop.js:670), then again via TOOLS.invoke() at :83.
 * The second invocation bypassed ToolRuntime entirely — no permission profile,
 * no path-security, no approval, no checkpoint, no guardrails.
 * Now tools execute exactly once: through runAgent → ToolRuntime.
 * The allow-list check was removed because it only had effect on the second
 * (bypassed) invocation — runAgent's own opts.tools is the correct gate.
 */

const llm = require('./llm-provider');
const { runAgent } = require('./agent-loop');

// All available tools as tool definitions (from agent-loop's tool registry)
const AGENT_TOOLS = (() => {
  try {
    // agent-loop.js uses require('./tools') — same canonical registry
    const TOOLS = require('./tools');
    return TOOLS.list().map(t => ({
      name: t.name,
      description: (t.description || '').substring(0, 200),
      parameters: t.inputSchema || { type: 'object', properties: {} },
    }));
  } catch {
    return [];
  }
})();

// Read-only subset — safe to hand to many parallel research models at once.
const READONLY_NAMES = new Set(['read', 'glob', 'grep', 'read_file', 'glob_files', 'grep_files']);
const READONLY_TOOLS = AGENT_TOOLS.filter(t => READONLY_NAMES.has(t.name));

async function chatWithTools(messages, opts = {}) {
  const cwd = opts.cwd || process.cwd();
  const maxTurns = Math.max(1, opts.maxTurns || 6);
  const tools = opts.tools || AGENT_TOOLS;

  const allMessages = [];
  for (const m of messages) {
    allMessages.push(m);
  }

  let lastReply = '';

  // P0-B FIX: Listen for 'tool-result' from runAgent instead of 'tool-call'.
  //
  // runAgent already executes every tool via ToolRuntime (agent-loop.js:670):
  //   yield { type: 'tool-call', tool, args }
  //   result = await toolRuntime.invoke(call.tool, call.args, ...)
  //   yield { type: 'tool-result', tool, ok, content, error }
  //
  // Previously chat-agent.js listened for 'tool-call' (pre-execution) and
  // re-ran the tool a second time via TOOLS.invoke() — bypassing ToolRuntime.
  // Now we consume the already-executed result from runAgent's 'tool-result',
  // which went through permission profiles, path-security, approval, and all
  // other ToolRuntime gates. opts.tools is the correct allow-list mechanism.
  for await (const ev of runAgent({
    history: allMessages,
    opts: { maxTurns, tools, cwd },
  })) {
    if (ev.type === 'token') {
      lastReply += ev.content;
    } else if (ev.type === 'tool-result') {
      // tool-result already carries the ToolRuntime result — just pass it back.
      allMessages.push({
        role: 'tool',
        name: ev.tool,
        content: ev.error || ev.content || '',
      });
    } else if (ev.type === 'done') {
      break;
    } else if (ev.type === 'error') {
      throw new Error(ev.error);
    }
  }

  return { content: lastReply.trim(), messages: allMessages };
}

module.exports = { chatWithTools, AGENT_TOOLS, READONLY_TOOLS };
