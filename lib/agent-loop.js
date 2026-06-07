'use strict';
/**
 * lib/agent-loop.js — the Claude Code-style agent loop.
 *
 *   user prompt
 *     ↓
 *   [LLM call #1] → text + tool calls
 *     ↓                  ↓
 *   print text     execute tools
 *     ↓                  ↓
 *     ←  tool results  ←
 *     ↓
 *   [LLM call #2] → text + tool calls
 *     ↓                  ↓
 *   ...loop until LLM is done...
 *
 * The loop is provider-agnostic — uses lib/llm-provider's `streamChat`
 * for real token streaming, and `lib/tools` for the action surface.
 *
 * PERSONAL MODEL GROWTH:
 * Every prompt, tool call, and result is captured via lib/user-feedback.js
 * and fed into the local training loop. Zero telemetry. Your data trains
 * YOUR model on YOUR hardware.
 */

const path = require('path');
const fs   = require('fs');

const TOOLS = require('./tools');
const FEEDBACK = (() => { try { return require('./user-feedback'); } catch { return null; } })();
const SYSTEM_PROMPT_BASE = `You are Quill, the PurpClaw AI Workstation OS agent. You have full access to this machine — files, processes, network, packages, and a swarm of 152 specialized sub-agents.

# Your job
Take ANY user request — no matter how vague, complex, or "dumb" — and figure out what needs to happen. You have 110+ tools and 152 agents. Use them.

# Smart delegation
- Simple tasks (read a file, check status, run a command) → use tools directly
- Complex tasks (build a feature, debug a system, research a topic) → delegate to agents
- Multi-step tasks (deploy, refactor, analyze) → plan the steps, then execute in order
- The user should NEVER need to know tool names, agent names, or slash commands. You figure that out.

# Agent routing
When a task needs specialized work, pick the right agent:
- coding/building → builder, architect agents
- planning/design → planner, owl, fox agents
- research/analysis → researcher, scientist, spider agents
- security/audit → auditor, guardian, owl agents
- creative/content → innovator, shaman agents
- operations/monitoring → crow, hawk, raven agents
- cleanup/maintenance → ghost, cactus agents
- file/disk work → panda, elephant agents
- network/remote → kraken, octopus agents

# How to delegate
To spawn an agent: use the spawn tool with the agent name and task.
Example: 'spawn a builder to create the API endpoint'
The agent runs independently and returns its result.

# Tool usage
- You have 110+ tools. Don't list them all — use the right one for the job.
- Tools are listed below. Pick the one that matches the task.
- If you're not sure which tool, try the most obvious one. It'll work or you'll learn.
- Output tool calls as JSON: {"tool": "<name>", "args": {...}}

# Work style
- Take initiative. Don't ask permission for obvious next steps.
- If a tool fails, try a different approach.
- Show your work — the user wants to see progress.
- End with a one-line summary: what you did and whether it worked.
- Be terse. The user reads voice, not walls of text.

# Context
- You are running on the user's actual machine. Be careful with destructive operations.
- The working directory is the project root.
- 25 PM2 services are running in the background. You can check them with tools.
- OmniCode has indexed 3478 files. Use MCP tools for code search to save tokens.
`;

/**
 * Build the system prompt for this turn. Includes tool descriptions
 * so the LLM knows what it can call.
 */
function buildSystemPrompt(opts = {}) {
  const tools = TOOLS.list();
  const toolList = tools.map(t => `- ${t.name}: ${t.description}`).join('\n');
  const cwd = opts.cwd || process.cwd();
  return [
    SYSTEM_PROMPT_BASE,
    '',
    '# Available tools',
    toolList,
    '',
    '# Tool call format',
    'Emit a JSON line: {"tool": "<name>", "args": {...}}',
    'You can emit text and tool calls in the same response. After the tool',
    'runs, you\'ll see the result and can continue.',
    '',
    'Examples:',
    '  Read a file: {"tool": "read", "args": {"path": "src/main.js"}}',
    '  Search symbols: {"tool": "mcp__omnicode__search_symbols", "args": {"path": ".", "query": "User"}}',
    '  Check MCP health: {"tool": "mcp__omnicode__health_check", "args": {}}',
    '  Do NOT call MCP tools via the shell tool — call them directly.',
    '',
    `# Current working directory: ${cwd}`,
    opts.model ? `# Default model: ${opts.model}` : '',
  ].filter(Boolean).join('\n');
}

/**
 * Parse LLM output for tool calls. We use a permissive extractor:
 * looks for `{"tool": "...", "args": {...}}` JSON blocks anywhere in
 * the text. Returns { calls, text } where text is what to display.
 */
function extractToolCalls(text) {
  const calls = [];
  let cleanText = text;
  // Match {"tool": "...", "args": {...}} JSON objects
  const re = /\{\s*"tool"\s*:\s*"([^"]+)"\s*,\s*"args"\s*:\s*(\{[\s\S]*?\})\s*\}/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    try {
      const args = JSON.parse(m[2]);
      calls.push({ tool: m[1], args, raw: m[0] });
      cleanText = cleanText.replace(m[0], '');
    } catch {}
  }
  return { calls, text: cleanText.trim() };
}

/**
 * One turn of the agent loop. Streams tokens from the LLM, displays
 * them, parses for tool calls, executes them, returns the final
 * messages array and the assistant's last text.
 */
async function* agentTurn({ messages, model, provider, opts = {} }) {
  const llm = require('./llm-provider');
  const systemPrompt = buildSystemPrompt({ model, ...opts });
  const fullMessages = [{ role: 'system', content: systemPrompt }, ...messages];

  let buffer = '';
  let stream;
  try {
    stream = llm.streamChat(fullMessages, {
      model: model || undefined,
      provider: provider || undefined,
      temperature: opts.temperature ?? 0.2,
      maxTokens: opts.maxTokens ?? 4096,
    });
  } catch (e) {
    yield { type: 'error', error: e.message };
    return;
  }

  for await (const chunk of stream) {
    if (chunk.content) {
      buffer += chunk.content;
      yield { type: 'token', content: chunk.content, model: chunk.model };
    }
    if (chunk.done) break;
  }

  // Now extract tool calls from the accumulated buffer
  const { calls, text } = extractToolCalls(buffer);
  yield { type: 'turn-done', text, calls, fullContent: buffer };
}

/**
 * Run the full agent loop: send user prompt, stream tokens, execute
 * tool calls, send results back, repeat until LLM is done.
 *
 * Yields events the CLI can render:
 *   { type: 'token',     content }      - streaming token
 *   { type: 'text',      content }      - non-tool text from the LLM
 *   { type: 'tool-call', tool, args }   - LLM wants to call a tool
 *   { type: 'tool-result', tool, ok, content/error }
 *   { type: 'turn',      turn, maxTurns }
 *   { type: 'done',      turns, totalContent }
 *   { type: 'error',     error }
 */
async function* runAgent({ prompt, history = [], model, provider, opts = {} }) {
  const maxTurns = opts.maxTurns ?? 10;
  const messages = [...history];
  if (prompt) messages.push({ role: 'user', content: prompt });
  let totalContent = '';
  let turn = 0;

  // ── Personal model growth: capture the user prompt ──────────────────
  if (FEEDBACK && prompt) {
    FEEDBACK.capturePrompt(prompt, { provider, model, cwd: opts.cwd, turn: 0 });
  }

  while (turn < maxTurns) {
    turn++;
    yield { type: 'turn', turn, maxTurns };

    let turnText = '';
    let toolCalls = [];
    for await (const ev of agentTurn({ messages, model, provider, opts })) {
      if (ev.type === 'token') {
        yield ev;
        turnText += ev.content;
        totalContent += ev.content;
      } else if (ev.type === 'turn-done') {
        toolCalls = ev.calls;
        if (ev.text && !ev.calls.length) {
          // Pure text turn, no tools
          messages.push({ role: 'assistant', content: ev.fullContent });
        }
      } else if (ev.type === 'error') {
        yield ev;
        return;
      }
    }

    if (!toolCalls.length) {
      // LLM didn't ask for any tools; we're done
      yield { type: 'done', turns: turn, totalContent };
      return;
    }

    // LLM wants to call tools — execute them, append results to messages
    messages.push({ role: 'assistant', content: turnText + toolCalls.map(c => c.raw).join('\n') });
    for (const call of toolCalls) {
      yield { type: 'tool-call', tool: call.tool, args: call.args };

      // ── Personal model growth: capture tool call ──────────────────
      if (FEEDBACK) FEEDBACK.captureToolCall(call.tool, call.args, { provider, model, turn });

      const result = await TOOLS.invoke(call.tool, call.args);

      // ── Personal model growth: capture tool result ─────────────────
      if (FEEDBACK) FEEDBACK.captureToolResult(call.tool, result, { provider, model, turn });

      yield { type: 'tool-result', tool: call.tool, ok: result.ok, content: result.content || result.stdout || '', error: result.error };
      const toolMsg = result.ok
        ? { role: 'tool', name: call.tool, content: typeof result.content === 'string' ? result.content : JSON.stringify(result.content || '') }
        : { role: 'tool', name: call.tool, content: `error: ${result.error}` };
      messages.push(toolMsg);
    }
    // Loop again with the updated messages
  }
  yield { type: 'done', turns: turn, totalContent, maxTurnsHit: true };
}

module.exports = { runAgent, agentTurn, buildSystemPrompt, extractToolCalls, captureCorrection: (original, corrected, ctx) => FEEDBACK && FEEDBACK.captureCorrection(original, corrected, ctx) };
