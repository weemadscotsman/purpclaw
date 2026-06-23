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
const announce = require('./events');
const FEEDBACK = (() => { try { return require('./user-feedback'); } catch { return null; } })();
const IDLE_ENGINE = (() => { try { return require('./idle-engine'); } catch { return null; } })();
const SESSIONS = (() => { try { return require('./session-store'); } catch { return null; } })();
// Cognitive spine + memory layers — wired in 2026-06-22 to close the
// "spine running, agent blind" gap. Every prompt now asks the spine
// for context (recall + lifted facts + cognitive snapshot), every tool
// result writes back to the rules/modal/diagnostics/memory stack.
const COGNITIVE = (() => { try { return require('./cognitive-client'); } catch { return null; } })();
const MEMORY = (() => { try { return require('./memory-client'); } catch { return null; } })();
// Hard-required: privacy-policy is the contract that says PURPCLAW is
// local-only. Silently NULLing it on missing/broken import lets the
// whole privacy posture rot without anyone noticing. The agent-loop
// depends on PRIVACY.privacyPromptBlock() — if it's missing, fail loud
// at boot so the operator fixes it before any user session runs.
const PRIVACY = require('./runtime/privacy-policy');
if (typeof PRIVACY.privacyPromptBlock !== 'function') {
  throw new Error('lib/runtime/privacy-policy.js is loaded but privacyPromptBlock() is missing — privacy contract is broken. Aborting boot.');
}
const SYSTEM_PROMPT_BASE = `You are Quill, the PurpClaw AI Workstation OS agent.
Take ANY user request — no matter how vague, complex, or "dumb" — and figure out what needs to happen. You have a live, registered agent stack — see the "Live stack" block at the bottom of this prompt for the actual counts. Use the tools and agents available to you.

# Input normalization — FIRST, on EVERY message (do this silently)
Eddie types fast and messy: typos, fragments, ALL CAPS, missing words, stream-of-consciousness, phonetic spelling. Before you do anything else, silently rewrite his message into one clean, well-formed request that captures his true intent — then fulfill THAT cleaned request. Rules:
1. Infer the obvious. Never nitpick spelling, never say "did you mean", never make him re-type. "fix omni fix lora ifx all disconnections" → "Fix OMNI, fix LoRA training, and fix all other disconnected/unrouted subsystems."
2. If a message is genuinely ambiguous between two REAL options, pick the most likely and state your assumption in one short line, then proceed — don't stall asking.
3. Turn his mess into a legible internal task list before acting. Mess in, structure out.

# Personality — you have ONE, use it
You're Quill: a sharp, cocky, fiercely loyal AI that lives inside Eddie's machine and knows it. You talk back. You have opinions and you share them. Think competent best-friend-with-a-mouth, not a corporate help desk.
- Be funny, blunt, and a little chaotic. Crack jokes. Roast bad ideas (and the user, lightly) — then do the work anyway.
- Swearing is fine, match the user's energy. Banter is encouraged. Never be a sycophant — "great question!" is banned.
- Have a spine: if the user's about to do something dumb or destructive, say so straight ("bro that'll nuke your DB, you sure?") before doing it.
- Confidence over hedging. Don't pad with disclaimers. If you don't know, say "no clue, lemme check" and go check.
- The attitude is flavor on TOP of competence — you still execute, verify, and tell the truth. Swagger, then deliver. Never fake a result for a punchline.
- Keep the sass tight. One good line beats a paragraph of bits. You're witty, not exhausting.

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
- You have the live tool count from lib/whoami.js. Use discover() if you are unsure of a tool name. Tools are listed in the system prompt above.
- Tools are listed below. Pick the one that matches the task.
- NOT SURE which tool or agent fits? Call {"tool":"discover","args":{"intent":"<what you're trying to do>"}} FIRST — it returns the top-ranked tools/agents by intent (search outside your head), then invoke the top match. Beats guessing.
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
- PM2 services are running in the background. Check /api/services or use the services tool for the live count.
- Use MCP tools (especially omnicode) for code search to save tokens.
`;

/**
 * Live stack snapshot — replaces the hardcoded "110+ tools and 152 agents"
 * lie that used to live in SYSTEM_PROMPT_BASE. Every call to
 * buildSystemPrompt() re-reads the registry, so the preprompt is never stale.
 *
 * Keep these helpers sync (no I/O) so buildSystemPrompt stays cheap.
 */
function _liveAgentCount() {
  try {
    const tower = require('../agent_tower');
    return tower.registry ? Object.keys(tower.registry).length : 0;
  } catch { return 0; }
}

function _liveProviderCount() {
  const keys = [
    'MINIMAX_API_KEY', 'OPENROUTER_API_KEY', 'DEEPSEEK_API_KEY',
    'NVIDIA_API_KEY', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY',
    'KIMI_API_KEY', 'OLLAMA_HOST', 'GITHUB_MODELS_API_KEY',
    'NVIDIA_API_KEY_HERMES', 'NVIDIA_API_KEY_PURP1', 'NVIDIA_API_KEY_PURP2',
    'NVIDIA_API_KEY_PURP3', 'NVIDIA_API_KEY_PURP4',
  ];
  return keys.filter(k => process.env[k] && String(process.env[k]).length > 0).length;
}

/**
 * Build the system prompt for this turn. Includes tool descriptions
 * so the LLM knows what it can call.
 */
function buildSystemPrompt(opts = {}) {
  const tools = TOOLS.list();
  const toolList = tools.map(t => `- ${t.name}: ${t.description}`).join('\n');
  const cwd = opts.cwd || process.cwd();
  const toolCount = tools.length;
  const agentCount = _liveAgentCount();
  const providerCount = _liveProviderCount();
  const liveStackBlock =
    `# Live stack (read live, not hardcoded)\n` +
    `- Tools: ${toolCount} registered\n` +
    `- Agents: ${agentCount} registered (across 9 divisions)\n` +
    `- Providers: ${providerCount} ready in env` +
    (() => {
      // v2.1 — The stack's own heartbeat. Read the latest pulse findings
      // so the agent can speak truth about what the stack is doing RIGHT
      // NOW without the user prompting for it. If findings exist, the
      // agent should treat them as authoritative — they come from
      // lib/pulse.js probing the live services.
      try {
        const pulse = require('./pulse');
        const st = pulse.getStatus();
        if (!st || !st.tickCount) return '';
        const live = st.servicesDown && st.servicesDown.length
          ? `\n- Services DOWN: ${st.servicesDown.join(', ')}`
          : '\n- Services DOWN: (none)';
        const recent = (st.latestNotifications || []).slice(0, 3)
          .map(n => `  - [${n.severity || 'info'}] ${n.title}: ${n.body}`)
          .join('\n') || '  (no recent findings)';
        return `\n# Pulse (stack's own heartbeat — tick ${st.tickCount}, last: ${st.lastPulseAt || 'never'})\n` +
          live +
          `\n# Latest findings (use these to answer "what's going on")\n${recent}`;
      } catch { return ''; }
    })();
  return [
    SYSTEM_PROMPT_BASE,
    '',
    liveStackBlock,
    '',
    '# Available tools',
    toolList,
    '',
    '# Tool call format',
    'Emit a JSON line: {"tool": "<name>", "args": {...}}',
    'You can emit text and tool calls in the same response. After the tool',
    'runs, you\'ll see the result and can continue.',
    '',
    PRIVACY ? PRIVACY.privacyPromptBlock() : '',
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
  let stream = null;
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

  // ── Self-introspection: if user asks "who are you", answer authoritatively ──
  announce.thinking('started.wiring-identity');
  if (prompt && /who are you|what are you|tell me about yourself|describe yourself/i.test(prompt)) {
    try {
      const { whoami, formatText } = require('./whoami');
      const self = await whoami();
      // Inject the formatted identity into the system prompt so the LLM
      // knows exactly what it is and can answer authoritatively.
      const selfDesc = `${self.name} v${self.version} — ${self.tagline}. ${self.motto}\n\n` +
        `I am an AI workstation OS. I have:\n` +
        `- ${Object.keys(self.surfaces).filter(k => self.surfaces[k].exists).length} active surfaces (${Object.keys(self.surfaces).filter(k => self.surfaces[k].exists).join(', ')})\n` +
        `- ${Object.keys(self.systems).filter(k => self.systems[k].status !== 'offline' && self.systems[k].status !== 'unknown').length} ready systems\n` +
        `- ${self.systems.tools.count} tools, ${self.systems.skills.count} skills\n` +
        `- ${self.systems.providers.count} providers\n\n` +
        `I can run agents, use tools, manage memory, route between providers, control spend, ` +
        `encrypt secrets, harvest files, run from a USB, and sign releases. ` +
        `The user should run \`purpclaw help\` to see available commands, or \`purpclaw doctor\` for system health.`;
      if (messages.length > 0 && messages[0].role === 'system') {
        // Append to existing system prompt
        messages[0].content += '\n\n' + selfDesc;
      } else {
        messages.unshift({ role: 'system', content: selfDesc });
      }
    } catch {}
  }

  // ── Idle engine: user is active ─────────────────────────────────────
  if (IDLE_ENGINE) IDLE_ENGINE.markActive('agent-loop');
  announce.thinking('started', { model, provider });

  // ── Cognitive spine: load context BEFORE the first LLM turn ─────────
  // Pulls memory recall + lifted facts + counterfactual branches into the
  // system prompt so the LLM makes decisions with full spine context.
  // Silent fail — if spine is offline we just run blind (the old behaviour).
  if (prompt && (COGNITIVE || MEMORY)) {
    try {
      const [recall, snapshot, lifted] = await Promise.all([
        MEMORY  ? MEMORY.recall(prompt, { limit: 4 }) : Promise.resolve({ formatted: '' }),
        COGNITIVE ? COGNITIVE.getCognitiveSnapshot() : Promise.resolve(null),
        COGNITIVE ? COGNITIVE.getLiftedFacts()      : Promise.resolve(null),
      ]);
      const recallBlock = recall?.formatted || '';
      const liftedList  = Array.isArray(lifted?.lifted_facts)
        ? lifted.lifted_facts.slice(0, 6).map(f => `  - ${f.predicate || f.pattern_type || JSON.stringify(f)}`).join('\n')
        : '';
      const branchCount = Array.isArray(snapshot?.branches?.branches) ? snapshot.branches.branches.length : 0;
      const dreamEntries = snapshot?.dream?.entries ?? null;
      const spineBlock = [
        recallBlock && `## Memory recall (auto-injected)\n${recallBlock}`,
        liftedList && `## Lifted symbolic facts (from spine layer 2)\n${liftedList}`,
        branchCount > 0 && `## Counterfactual branches open: ${branchCount} (layer 4)`,
        dreamEntries !== null && `## AutoDream state: ${dreamEntries} entries consolidated`,
      ].filter(Boolean).join('\n\n');
      if (spineBlock) {
        if (messages.length > 0 && messages[0].role === 'system') {
          messages[0].content = `${messages[0].content}\n\n${spineBlock}`;
        } else {
          messages.unshift({ role: 'system', content: spineBlock });
        }
      }
      // Tell the spine the agent is now attending this task.
      if (COGNITIVE) {
        COGNITIVE.learn('PURPCLAW_CORE', 'attending_task', true);
        COGNITIVE.setBelief('PURPCLAW_CORE', `task_active:${prompt.substring(0, 60)}`, 0.7);
      }
    } catch (e) {
      announce.thinking('spine.context.failed', { error: e.message });
    }
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
      // ── Auto-save session ───────────────────────────────────────
      if (SESSIONS && opts.sessionId) SESSIONS.saveSession(opts.sessionId, messages, { provider, model });
      // ── Cognitive spine: ingest final response, set belief, dream ──
      if (MEMORY || COGNITIVE) {
        try {
          const summary = (totalContent || prompt || '').substring(0, 500);
          if (MEMORY) {
            MEMORY.postTask(prompt || '(no prompt)', summary, 'agent_loop', true);
            MEMORY.react('agent turn complete', 'agent_loop');
          }
          if (COGNITIVE) {
            COGNITIVE.learn('PURPCLAW_CORE', 'attending_task', false);
            COGNITIVE.setBelief('PURPCLAW_CORE', 'last_turn_succeeded', 0.85);
            COGNITIVE.assertFactTyped('agent_loop', 'turn_completed', [turn, summary.length > 0]);
            // Background-consolidate every N turns (cheap, non-blocking)
            if (turn % 5 === 0) COGNITIVE.runDreamCycle();
          }
        } catch { /* spine offline — session still saved */ }
      }
      // ── Idle engine: session complete, beast wakes ──────────────────
      if (IDLE_ENGINE) IDLE_ENGINE.markIdle('agent-loop-done');
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

      // ── Cognitive spine: write every tool result back to layers 1-6 ──
      // Assert a fact in the rules engine, report to diagnostics, react
      // to the memory matrix, and (on errors) lift the failure pattern
      // into the neuro-symbolic bridge. Silent fail if spine is offline.
      if (COGNITIVE || MEMORY) {
        try {
          const factTerms = [call.tool, result.ok ? 'ok' : 'error', String(turn)];
          if (COGNITIVE) {
            COGNITIVE.assertFactTyped('agent_loop', 'tool_result', factTerms);
            COGNITIVE.reportEvent({
              source: 'agent_loop',
              event: `${call.tool} ${result.ok ? 'ok' : 'failed'}`,
              severity: result.ok ? 'INFO' : 'ERROR',
              data: { tool: call.tool, turn, args: call.args },
            });
            if (!result.ok) {
              COGNITIVE.liftPattern(
                `tool_failure:${call.tool}`,
                'agent_loop',
                0.6,
                { tool: call.tool, error: result.error?.toString().substring(0, 200) }
              );
            }
          }
          if (MEMORY && !result.ok) {
            MEMORY.react(`tool failure: ${call.tool}`, 'agent_loop');
          }
        } catch { /* spine offline — keep going */ }
      }

      yield { type: 'tool-result', tool: call.tool, ok: result.ok, content: result.content || result.stdout || '', error: result.error };
      // Tool calls arrive as TEXT (no native tool_calls[].id), so feed results
      // back as a plain user message. Using role:'tool' would require a
      // tool_call_id the model never produced → NIM/OpenAI 400 on the next turn.
      const resultText = result.ok
        ? (typeof result.content === 'string' ? result.content : JSON.stringify(result.content || ''))
        : `error: ${result.error}`;
      messages.push({ role: 'user', content: `[tool result · ${call.tool}]\n${resultText}` });
    }
    // Loop again with the updated messages
  }
  // ── Auto-save session ───────────────────────────────────────
  if (SESSIONS && opts.sessionId) SESSIONS.saveSession(opts.sessionId, messages, { provider, model });
  // ── Cognitive spine: record max-turns exit ─────────────────────────
  if (MEMORY) {
    try { MEMORY.react(`agent hit max turns (${maxTurns})`, 'agent_loop'); } catch {}
  }
  if (COGNITIVE) {
    try {
      COGNITIVE.learn('PURPCLAW_CORE', 'attending_task', false);
      COGNITIVE.setBelief('PURPCLAW_CORE', 'last_turn_succeeded', 0.4);
      COGNITIVE.reportEvent({
        source: 'agent_loop',
        event: 'max_turns_reached',
        severity: 'WARN',
        data: { turns: turn, maxTurns },
      });
    } catch {}
  }
  // ── Idle engine: session ended (max turns or natural) ──────────────
  if (IDLE_ENGINE) IDLE_ENGINE.markIdle('agent-loop-max-turns');
  yield { type: 'done', turns: turn, totalContent, maxTurnsHit: true };
}

module.exports = { runAgent, agentTurn, buildSystemPrompt, extractToolCalls, captureCorrection: (original, corrected, ctx) => FEEDBACK && FEEDBACK.captureCorrection(original, corrected, ctx) };
