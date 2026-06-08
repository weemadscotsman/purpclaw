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
const { runAgent } = require('./agent-loop');

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
 * ToolExecutor wraps the tool registry with allow-listing and result formatting.
 */
class ToolExecutor {
  constructor(session) {
    this.session = session || {};
  }

  async execute(toolName, args) {
    try {
      const result = await TOOLS.invoke(toolName, args);
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
  const executor = new ToolExecutor({});

  const allMessages = [];
  for (const m of messages) {
    allMessages.push(m);
  }

  let turn = 0;
  let lastReply = '';

  for await (const ev of runAgent({
    history: allMessages,
    opts: { maxTurns, tools, cwd },
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
    } else if (ev.type === 'done') {
      break;
    } else if (ev.type === 'error') {
      throw new Error(ev.error);
    }
  }

  return { content: lastReply.trim(), messages: allMessages };
}

module.exports = { chatWithTools, ToolExecutor, AGENT_TOOLS, READONLY_TOOLS };
