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
 */

const path = require('path');
const fs   = require('fs');

const TOOLS = require('./tools');

const SYSTEM_PROMPT_BASE = `You are PURPCLAW, an open-source coding agent running in the user's terminal. You help with software engineering tasks: read files, write code, run shell commands, search code, fetch URLs, manage git.

# Tone
- Be concise. No fluff. No "Great question!" or "I'd be happy to help!".
- Show the work, then the answer.
- Use code blocks for code, paths, and commands.
- When you've finished a task, end with a one-line summary of what you did.

# Tools
- You have access to tools. When you need to inspect a file, run a command, etc., emit a tool call.
- Tool calls: { "tool": "<name>", "args": { ... } }
- After tool results, decide the next step. Keep going until the task is done or you need clarification.
- Don't ask the user for confirmation on every step — use judgment. If a tool is destructive, mention it in a one-liner before calling it.

# Working directory
- The current working directory is the project root. Use relative paths when convenient, absolute when not.

# Limits
- Be terse. Tokens are money.
- Don't repeat the user's question back to them.
- Don't explain what a tool does unless the user asked.
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
      const result = await TOOLS.invoke(call.tool, call.args);
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

module.exports = { runAgent, agentTurn, buildSystemPrompt, extractToolCalls };
