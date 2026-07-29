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
const PROMPTS = require('./prompt-builder');
const { ContextCompressor } = require('./context-compressor');
const { ToolRuntime } = require('./tool-runtime');
const announce = require('./events');
// S1: Lifecycle event bus — Steering vNext
const LIFECYCLE = (() => { try { return require('./hooks/lifecycle-bus'); } catch { return null; } })();
const PARITY_HOOKS = (() => { try { return require('../parity/hooks/engine'); } catch { return null; } })();
// S7: Continuity — snapshot at turn boundary for crash recovery
const CONTINUITY = (() => { try { return require('./continuity'); } catch { return null; } })();
// S8: Session Lifecycle — crash recovery, resume_pending, stuck-loop, agent LRU cache
const SESSION_STORE = (() => { try { return require('./session-store'); } catch (e) { console.error(`[CRITICAL] session-store unavailable — persistence disabled: ${e && e.message}`); return null; } })();
// S2: Scoped Memory — ingest on task/turn completion
const SCOPED_MEMORY = (() => { try { return require('./scoped-memory'); } catch { return null; } })();
// S4: Priority Steer — interrupt now + queue next channels
const PRIORITY_STEER = (() => { try { return require('./priority-steer'); } catch { return null; } })();
// S3: Verified Learning Gate — EMERGENT→PROBATIONARY→TRUSTED pipeline
const VERIFY_GATE = (() => { try { return require('./verification-gate'); } catch { return null; } })();
// S8: Phase Router — model selection table
const PHASE_ROUTER = (() => { try { return require('./phase-router'); } catch { return null; } })();
const FEEDBACK = (() => { try { return require('./user-feedback'); } catch { return null; } })();
const IDLE_ENGINE = (() => { try { return require('./idle-engine'); } catch { return null; } })();
// The loop and every user-facing transport share the same durable SQLite
// repository. Keeping the legacy JSON store here caused split-brain history:
// a failed tool run could be visible to the CLI but disappear from desktop.
// NOT optional like the modules above: a null here means every turn this
// process runs is unrecoverable, and nothing else in the loop will say so.
// It stayed silent for as long as the require was broken, which is how a
// dead DatabaseSync import went unnoticed across 23 modules.
const SESSIONS = (() => {
  try { return require('./session-repository'); }
  catch (e) {
    console.error(
      `[agent-loop] DEGRADED RUNTIME: session persistence is DISABLED.\n` +
      `  cause: ${e && e.message}\n` +
      `  effect: this session will not be saved, listed, resumed, or visible to other surfaces.\n` +
      `  note: the session store needs node:sqlite (Node >=22.13); this process is ${process.version}.`
    );
    return null;
  }
})();
// Cognitive spine + memory layers — wired in 2026-06-22 to close the
// "spine running, agent blind" gap. Every prompt now asks the spine
// for context (recall + lifted facts + cognitive snapshot), every tool
// result writes back to the rules/modal/diagnostics/memory stack.
const COGNITIVE = (() => { try { return require('./cognitive-client'); } catch { return null; } })();
const MEMORY = (() => { try { return require('./memory-client'); } catch { return null; } })();

// S9: File watcher — hot-reload skills and config on file changes.
// Watches the skills/ directory (and subdirs) for .md/.js changes and
// reloads the skill registry. Also watches config.json in PURP_DIR.
// Passive by default (no-op); set FILE_WATCHER=1 or start via
// `purpclaw watch <dir>` to activate.
let _fileWatcher = null;
function _initFileWatcher() {
  if (_fileWatcher) return; // already running
  if (process.env.FILE_WATCHER !== '1') return;
  try {
    const { createFileWatcher, makeReloadCallbacks } = require('./file-watcher');
    const PURP_DIR = process.env.PURP_DIR || path.join(process.env.HOME || process.env.USERPROFILE || '/tmp', '.purpclaw');
    const skillsDir = path.join(process.env.PWD || process.cwd(), 'skills');
    const configPath = path.join(PURP_DIR, 'config.json');
    const cbs = makeReloadCallbacks({ skillsDir, configPath });
    _fileWatcher = createFileWatcher(process.cwd(), cbs);
    console.log('[agent-loop] file watcher active — watching:', process.cwd());
    // Clean up on process exit
    process.on('exit', () => { if (_fileWatcher) { _fileWatcher.close(); _fileWatcher = null; } });
  } catch (err) {
    console.warn('[agent-loop] file watcher init failed:', err.message);
  }
}
_initFileWatcher();

// SIGINT graceful shutdown — catches Ctrl+C in terminal and stops the agent loop
// after saving the current session state. Matches Codex CLI behaviour.
// Codex: Ctrl+C → graceful stop, partial results saved, session resumable.
// Set to true on SIGINT, checked at each turn boundary.
let _sigintPending = false;
function _sigintHandler() {
  if (_sigintPending) return; // already handling
  _sigintPending = true;
  // Codex parity: Stop hook — fire when agent receives Ctrl+C
  if (PARITY_HOOKS) Promise.resolve().then(() => PARITY_HOOKS.emit('Stop', { reason: 'SIGINT', timestamp: Date.now() })).catch(() => {});
}
process.on('SIGINT', _sigintHandler);
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
  // When a ToolRuntime with --allowedTools/--disallowedTools is present,
  // use its filtered catalog() so the LLM only sees executable tools.
  const toolRuntime = opts.toolRuntime;
  const rawTools = TOOLS.list();
  const tools = toolRuntime ? toolRuntime.catalog() : rawTools;
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
  const text = PROMPTS.buildPrompt({
    base: SYSTEM_PROMPT_BASE, tools, privacy: PRIVACY.privacyPromptBlock(),
    structuredTools: opts.structuredTools, cwd, model: opts.model,
    platform: opts.platform, sessionId: opts.sessionId, liveStack: liveStackBlock,
    goal: opts.goal,
  }).text;
  const repoMap = _repoMapBlock(cwd, opts);
  return repoMap ? `${text}\n\n${repoMap}` : text;
}

// ── Repo map injection ────────────────────────────────────────────────────────
// Opt-in structural map of the project, ranked by how many files reference each
// file. Off unless REPO_MAP=1 (or opts.repoMap === true); opts.repoMap === false
// always wins, which is what --no-repo-map sets.
// ponytail: cached per cwd for the process lifetime — buildGraph crawls the whole
// tree and buildSystemPrompt runs every turn. Restart to pick up new files.
const _repoMapCache = new Map();
function _repoMapBlock(cwd, opts = {}) {
  const enabled = opts.repoMap !== undefined ? opts.repoMap : process.env.REPO_MAP === '1';
  if (!enabled) return '';
  if (_repoMapCache.has(cwd)) return _repoMapCache.get(cwd);
  let block = '';
  try {
    const maxTokens = parseInt(process.env.REPO_MAP_TOKENS || '2048', 10);
    block = require('./repo-mapper').runMap({ root: cwd, maxTokens });
  } catch { block = ''; }  // never let the map break a turn
  _repoMapCache.set(cwd, block);
  return block;
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
  // Native (structured) tool calling — opt-in via PURPCLAW_STRUCTURED_TOOLS=1
  // or opts.nativeTools. Regex JSON-line protocol stays the default/fallback.
  const structured = opts.nativeTools ?? (process.env.PURPCLAW_STRUCTURED_TOOLS === '1');
  const systemPrompt = buildSystemPrompt({ model, ...opts, structuredTools: structured });
  const fullMessages = [{ role: 'system', content: systemPrompt }, ...messages];

  let buffer = '';
  let displayBuffer = '';
  let insideReasoning = false;
  let nativeCalls = [];
  let stream = null;
  try {
    stream = llm.streamChat(fullMessages, {
      model: model || undefined,
      provider: provider || undefined,
      temperature: opts.temperature ?? 0.2,
      maxTokens: opts.maxTokens ?? 4096,
      taskId: opts.taskId || opts.jobId || null,
      ...(structured ? {
        tools: TOOLS.list().map(t => ({
          type: 'function',
          function: {
            name: t.name,
            description: String(t.description || '').slice(0, 1024),
            parameters: t.inputSchema || { type: 'object', properties: {} },
          },
        })),
      } : {}),
    });
  } catch (e) {
    const nested = Array.isArray(e && e.errors)
      ? e.errors.map(x => x && (x.message || x.code)).filter(Boolean).join('; ')
      : '';
    yield { type: 'error', error: e.message || nested || e.code || String(e) };
    return;
  }

  // v2.1 — wrap the stream consumption in try/catch too, because
  // llm.streamChat is an async generator whose internal reject() fires
  // during iteration, not during creation. Without this catch, a 429
  // from the provider escapes as an uncaught throw and the fallback
  // chain never gets a chance to try the next model.
  try {
    for await (const chunk of stream) {
      if (chunk.content) {
        buffer += chunk.content;
        displayBuffer += chunk.content;
        // MiniMax and some OpenAI-compatible reasoning models put private
        // chain-of-thought in <think> blocks. Parse across chunk boundaries
        // and emit only user-visible text; keep a short tail so split tags
        // cannot leak through streaming transports.
        while (displayBuffer) {
          if (insideReasoning) {
            const end = displayBuffer.indexOf('</think>');
            if (end < 0) { displayBuffer = displayBuffer.slice(-7); break; }
            displayBuffer = displayBuffer.slice(end + 8); insideReasoning = false;
          } else {
            const start = displayBuffer.indexOf('<think>');
            if (start >= 0) {
              const visible = displayBuffer.slice(0, start);
              if (visible) yield { type: 'token', content: visible, model: chunk.model };
              displayBuffer = displayBuffer.slice(start + 7); insideReasoning = true;
            } else {
              const safeLength = Math.max(0, displayBuffer.length - 6);
              if (!safeLength) break;
              const visible = displayBuffer.slice(0, safeLength); displayBuffer = displayBuffer.slice(safeLength);
              if (visible) yield { type: 'token', content: visible, model: chunk.model };
            }
          }
        }
      }
      if (chunk.done) {
        if (Array.isArray(chunk.toolCalls) && chunk.toolCalls.length) nativeCalls = chunk.toolCalls;
        break;
      }
    }
    if (!insideReasoning && displayBuffer) yield { type: 'token', content: displayBuffer, model };
  } catch (e) {
    yield { type: 'error', error: e.message };
    return;
  }

  // Native calls win when present; regex extraction stays as fallback so
  // models that ignore the tools param (or non-structured runs) still work.
  if (nativeCalls.length) {
    const calls = [];
    for (const tc of nativeCalls) {
      let args = {};
      try { args = JSON.parse(tc.function.arguments || '{}'); } catch {}
      calls.push({ tool: tc.function.name, args, id: tc.id, native: true, raw: '' });
    }
    yield { type: 'turn-done', text: buffer.trim(), calls, fullContent: buffer, nativeToolCalls: nativeCalls };
    return;
  }
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
  const contextEngine = opts.contextEngine || new ContextCompressor({ contextLength: opts.contextLength || 204_800, threshold: opts.compressionThreshold ?? 0.75 });
  const needsCompact = contextEngine.shouldCompress(history);
  // Codex parity: PreCompact — fire BEFORE compression
  if (needsCompact && PARITY_HOOKS) Promise.resolve().then(() => PARITY_HOOKS.emit('PreCompact', { reason: 'initial', messageCount: history.length })).catch(() => {});
  const compacted = needsCompact ? await contextEngine.compress(history) : { messages: [...history], compressed: false };
  const messages = [...compacted.messages];
  if (compacted.compressed) yield { type: 'context.compressed', ...compacted };
  // Codex parity: PostCompact — fire AFTER compression
  if (compacted.compressed && PARITY_HOOKS) Promise.resolve().then(() => PARITY_HOOKS.emit('PostCompact', { originalCount: history.length, compressedCount: messages.length })).catch(() => {});
  if (prompt) messages.push({ role: 'user', content: prompt });
  // S1: Lifecycle — SessionStart + PromptSubmit
  if (LIFECYCLE) {
    LIFECYCLE.sessionStart(opts.sessionId || `session-${Date.now()}`, { provider, model, cwd: opts.cwd });
    LIFECYCLE.promptSubmit(messages, 0).catch(() => {});
  }
  // Codex parity: SessionStart hook — emit() is synchronous, wrap for safety
  if (PARITY_HOOKS) Promise.resolve().then(() => PARITY_HOOKS.emit('SessionStart', { sessionId: opts.sessionId, provider, model, cwd: opts.cwd })).catch(() => {});
  let totalContent = '';
  let turn = 0;
  const toolRuntime = opts.toolRuntime || new ToolRuntime();

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
  if (!opts.noSpine && prompt && (COGNITIVE || MEMORY)) {
    try {
      // Wrap each service call with a 5-second timeout — prevents one hanging
      // service from blocking the entire first LLM turn indefinitely.
      const withTimeout = (p, ms) => {
        let timer;
        return Promise.race([
          p,
          new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), ms); }),
        ]).finally(() => clearTimeout(timer));
      };
      const [recall, snapshot, lifted] = await Promise.all([
        MEMORY    ? withTimeout(MEMORY.recall(prompt, { limit: 4 }), 5000).catch(() => ({ formatted: '' })) : Promise.resolve({ formatted: '' }),
        COGNITIVE ? withTimeout(COGNITIVE.getCognitiveSnapshot(), 5000).catch(() => null) : Promise.resolve(null),
        COGNITIVE ? withTimeout(COGNITIVE.getLiftedFacts(), 5000).catch(() => null) : Promise.resolve(null),
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
    // S4: Priority Steer — drain interrupt before processing this turn.
    if (PRIORITY_STEER && PRIORITY_STEER.shouldInterrupt()) {
      const intr = PRIORITY_STEER.pollInterrupt();
      PRIORITY_STEER.clearInterrupt();
      yield { type: 'priority.interrupt', reason: intr?.reason || 'steer', detail: intr };
      if (LIFECYCLE) LIFECYCLE.sessionEnd(opts.sessionId, 'priority-steer').catch(() => {});
      if (PARITY_HOOKS) Promise.resolve().then(() => PARITY_HOOKS.emit('SessionEnd', { sessionId: opts.sessionId, reason: 'priority-steer' })).catch(() => {});
      process.removeListener('SIGINT', _sigintHandler);
      yield { type: 'priority.queue', command: next };
      break;
    }
    // SIGINT: graceful Ctrl+C — save session and stop cleanly (Codex behaviour).
    if (_sigintPending) {
      _sigintPending = false;
      process.removeListener('SIGINT', _sigintHandler);
      if (SESSIONS && opts.sessionId) {
        SESSIONS.saveSession(opts.sessionId, messages, { provider, model });
      } else if (!SESSIONS) {
        console.error(`[CRITICAL] session persistence unavailable — session ${opts.sessionId || '(no id)'} will not be saved`);
      }
      if (LIFECYCLE) LIFECYCLE.sessionEnd(opts.sessionId, 'SIGINT').catch(() => {});
      if (PARITY_HOOKS) Promise.resolve().then(() => PARITY_HOOKS.emit('SessionEnd', { sessionId: opts.sessionId, reason: 'SIGINT' })).catch(() => {});
      yield { type: 'interrupted', reason: 'SIGINT', turns, totalContent };
      break;
    }
    // S8: Phase Router — honour a queued model override.
    if (PHASE_ROUTER && opts.sessionId) {
      const override = PHASE_ROUTER.getOverride(opts.sessionId);
      if (override) {
        model = override.model || model;
        if (override.provider) provider = override.provider;
      }
    }
    yield { type: 'turn', turn, maxTurns };
    // S5 — re-check compression mid-loop. If the agent has been running long
    // enough to push past the threshold AGAIN after a previous compact, we
    // want to compress again before the next LLM call. Otherwise long
    // sessions die with "context_length_exceeded" at provider level.
    if (turn > 1 && contextEngine.shouldCompress(messages)) {
      // Codex parity: PreCompact — mid-loop compression
      if (PARITY_HOOKS) Promise.resolve().then(() => PARITY_HOOKS.emit('PreCompact', { reason: 'mid-loop', turn, messageCount: messages.length })).catch(() => {});
      const second = await contextEngine.compress(messages);
      if (second.compressed) {
        messages.length = 0;
        messages.push(...second.messages);
        yield { type: 'context.compressed.again', ...second };
        // Codex parity: PostCompact — after mid-loop compression
        if (PARITY_HOOKS) Promise.resolve().then(() => PARITY_HOOKS.emit('PostCompact', { originalCount: messages.length + second.messages.length, compressedCount: second.messages.length, reason: 'mid-loop', turn })).catch(() => {});
      }
    }

    let turnText = '';
    let toolCalls = [];
    let nativeToolCalls = null;
    for await (const ev of agentTurn({ messages, model, provider, opts })) {
      if (ev.type === 'token') {
        yield ev;
        turnText += ev.content;
        totalContent += ev.content;
      } else if (ev.type === 'turn-done') {
        toolCalls = ev.calls;
        nativeToolCalls = ev.nativeToolCalls || null;
        if (ev.text && !ev.calls.length) {
          // Pure text turn, no tools
          messages.push({ role: 'assistant', content: ev.fullContent });
        }
      } else if (ev.type === 'error') {
        // Codex parity: Error hook — fire when agent turn encounters an error
        if (PARITY_HOOKS) Promise.resolve().then(() => PARITY_HOOKS.emit('Error', { error: ev.error, turn, sessionId: opts.sessionId })).catch(() => {});
        // ── Full cleanup (mirrors normal exit path lines 703–727) ──────────
        if (SESSIONS && opts.sessionId) {
        SESSIONS.saveSession(opts.sessionId, messages, { provider, model });
      } else if (!SESSIONS) {
        console.error(`[CRITICAL] session persistence unavailable — session ${opts.sessionId || '(no id)'} will not be saved`);
      }
        if (LIFECYCLE) LIFECYCLE.sessionEnd(opts.sessionId, 'error').catch(() => {});
        if (PARITY_HOOKS) Promise.resolve().then(() => PARITY_HOOKS.emit('SessionEnd', { sessionId: opts.sessionId, reason: 'error', turns, totalContent })).catch(() => {});
        if (MEMORY) { try { MEMORY.react(`agent error: ${ev.error}`, 'agent_loop'); } catch {} }
        if (COGNITIVE) {
          try {
            COGNITIVE.learn('PURPCLAW_CORE', 'attending_task', false);
            COGNITIVE.setBelief('PURPCLAW_CORE', 'last_turn_succeeded', 0.0);
            COGNITIVE.reportEvent({ source: 'agent_loop', event: 'agent_error', severity: 'ERROR', data: { error: ev.error, turn } });
          } catch {}
        }
        if (IDLE_ENGINE) IDLE_ENGINE.markIdle('agent-loop-error');
        if (SESSION_STORE) SESSION_STORE.writeCleanShutdown();
        yield { type: 'done', turns: turn, totalContent, error: ev.error };
        return;
      }
    }

    // Codex parity: UserPromptSubmit hook — fires after LLM receives the user's prompt
    if (PARITY_HOOKS) Promise.resolve().then(() => PARITY_HOOKS.emit('UserPromptSubmit', {
      sessionId: opts.sessionId,
      prompt: prompt || '',
      messageCount: messages.length,
      turn,
    })).catch(() => {});

    if (!toolCalls.length) {
      // LLM didn't ask for any tools; we're done
      // ── Auto-save session ───────────────────────────────────────
      if (SESSIONS && opts.sessionId) {
        SESSIONS.saveSession(opts.sessionId, messages, { provider, model });
      } else if (!SESSIONS) {
        console.error(`[CRITICAL] session persistence unavailable — session ${opts.sessionId || '(no id)'} will not be saved`);
      }
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

    // LLM wants to call tools — execute them, append results to messages.
    // Native mode: round-trip the real tool_calls array so the provider sees
    // valid OpenAI-shape history (sanitizeToolHistory guards the edges).
    if (nativeToolCalls) {
      messages.push({ role: 'assistant', content: turnText || '', tool_calls: nativeToolCalls });
    } else {
      messages.push({ role: 'assistant', content: turnText + toolCalls.map(c => c.raw).join('\n') });
    }
    for (const call of toolCalls) {
      yield { type: 'tool-call', tool: call.tool, args: call.args };

      // Codex parity: PreToolUse hook — emit() is sync, wrap for .catch() safety
      if (PARITY_HOOKS) Promise.resolve().then(() => PARITY_HOOKS.emit('PreToolUse', { tool: call.tool, args: call.args, callId: call.id, sessionId: opts.sessionId })).catch(() => {});

      // ── Personal model growth: capture tool call ──────────────────
      if (FEEDBACK) FEEDBACK.captureToolCall(call.tool, call.args, { provider, model, turn });

      const result = await toolRuntime.invoke(call.tool, call.args, {
        signal: opts.signal,
        sessionId: opts.sessionId,
        operatorInitiated: opts.operatorInitiated,
        permissionProfile: opts.permissionProfile,
        approvalCallback: opts.approvalCallback,
        callId: call.id,
        dependencies: opts.dependencies,
      });

      // ── Personal model growth: capture tool result ─────────────────
      if (FEEDBACK) FEEDBACK.captureToolResult(call.tool, result, { provider, model, turn });

      // S1: Lifecycle — PostToolUse
      if (LIFECYCLE) LIFECYCLE.postToolUse(call.tool, call.args, result, call.id, turn).catch(() => {});
      // Codex parity: PostToolUse — emit after LIFECYCLE so both buses fire
      if (PARITY_HOOKS) Promise.resolve().then(() => PARITY_HOOKS.emit('PostToolUse', { tool: call.tool, args: call.args, result, callId: call.id, sessionId: opts.sessionId, turn })).catch(() => {});

      // S3: Verified Learning — observe every tool outcome for the gate pipeline
      if (VERIFY_GATE) {
        const outcome = result.ok ? 'success' : 'failure';
        // observe() is synchronous — wrap so .catch() is always safe
        Promise.resolve().then(() => VERIFY_GATE.observe({
          lesson: `tool:${call.tool}`,
          context: `${call.tool} ${outcome}`,
          outcome,
          scope: 'session',
          source: 'agent-loop',
        })).catch(() => {});
      }

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
      if (call.native && call.id) {
        messages.push({ role: 'tool', tool_call_id: call.id, content: resultText });
      } else {
        messages.push({ role: 'user', content: `[tool result · ${call.tool}]\n${resultText}` });
      }
    }
    // S1: Lifecycle — TurnStop (end of turn, before next iteration)
    if (LIFECYCLE) LIFECYCLE.turnStop(turn, toolCalls.length > 0, messages.length).catch(() => {});

    // S7: Continuity — snapshot at turn boundary for crash recovery
    if (CONTINUITY && opts.sessionId) {
      CONTINUITY.snapshot({
        sessionId: opts.sessionId,
        turn,
        goal: opts.prompt || '',
        messages: messages,
        pendingCalls: [],
        checkpointId: null,
        metadata: { provider, model, totalContentLength: totalContent.length },
      });
    }

    // S4: Priority Steer — drain queued next-command if one is waiting
    if (PRIORITY_STEER) {
      const queued = PRIORITY_STEER.getQueue();
      if (queued.length > 0) {
        const next = PRIORITY_STEER.queueNext();
        if (next) yield { type: 'priority.queue', command: next };
      }
    }

    // Loop again with the updated messages
  }
  // ── Auto-save session ───────────────────────────────────────
  // Always remove SIGINT handler on normal exit — prevents accumulation.
  process.removeListener('SIGINT', _sigintHandler);
  if (SESSIONS && opts.sessionId) {
    SESSIONS.saveSession(opts.sessionId, messages, { provider, model });
  } else if (!SESSIONS) {
    console.error(`[CRITICAL] session persistence unavailable — session ${opts.sessionId || '(no id)'} will not be saved`);
  }
  if (LIFECYCLE) LIFECYCLE.sessionEnd(opts.sessionId, 'completed').catch(() => {});
  if (PARITY_HOOKS) Promise.resolve().then(() => PARITY_HOOKS.emit('SessionEnd', { sessionId: opts.sessionId, reason: 'completed', turns, totalContent })).catch(() => {});
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
  // S8: Graceful exit — write clean shutdown marker so next startup skips crash recovery
  if (SESSION_STORE) SESSION_STORE.writeCleanShutdown();
  yield { type: 'done', turns: turn, totalContent, maxTurnsHit: true };
}

module.exports = { runAgent, agentTurn, buildSystemPrompt, extractToolCalls, captureCorrection: (original, corrected, ctx) => FEEDBACK && FEEDBACK.captureCorrection(original, corrected, ctx) };
