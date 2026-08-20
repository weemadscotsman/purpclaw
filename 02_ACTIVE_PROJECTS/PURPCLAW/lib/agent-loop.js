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
const IDLE_ENGINE = (() => { try { return require('./idle-engine'); } catch { return null; } })();
// Canonical memory gateway — recall before the turn, record after it.
const MEMORY = (() => { try { return require('./memory-gateway'); } catch { return null; } })();
// Déjà Vu — execution-pattern recognition over the same memory spine.
const DEJAVU = (() => { try { return require('./dejavu'); } catch { return null; } })();
// Mission envelope — the composer's execution contract, shared by every surface.
const ENVELOPE = (() => { try { return require('./mission-envelope'); } catch { return null; } })();
const { enforceToolUse } = (() => { try { return require('./tools/tool-intent-gate'); } catch { return null; } })();
const { IdleScheduler } = (() => { try { return require('./runtime/idle-scheduler'); } catch { return null; } })();

// Debounced idle engine wrapper.
// Spec: 120s real-idle debounce, skip if state fingerprint unchanged, no overlapping cycles,
// background logs only, no foreground pollution.
const IDLE_QUIET_MS = parseInt(process.env.PURPCLAW_IDLE_QUIET_MS || '120000', 10);
const idleScheduler = IDLE_ENGINE && IdleScheduler ? new IdleScheduler({
  quietMs: IDLE_QUIET_MS,
  run: () => IDLE_ENGINE.runIdleCycle('agent-loop-end'),
  fingerprint: async () => {
    try {
      const fsState = fs.existsSync(path.join(process.cwd(), 'agent_work', '.idle_engine_state.json'))
        ? fs.readFileSync(path.join(process.cwd(), 'agent_work', '.idle_engine_state.json'), 'utf8')
        : null;
      return fsState ? fsState.length : 0;
    } catch { return null; }
  },
  log: (entry) => {
    try {
      const logDir = path.join(process.cwd(), 'agent_work');
      if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
      fs.appendFileSync(path.join(logDir, 'idle_scheduler.log'),
        JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n');
    } catch {}
  }
}) : null;
const ROUTED = (() => { try { return require('./control/agent-loop-bridge'); } catch { return null; } })();
// Phase 3 — steering: resolve the capsule before recall/provider/tool work.
// Advisory in the prompt, enforced at the dispatch boundary.
const STEER = (() => { try { return require('./steering-middleware'); } catch { return null; } })();
// S4 — priority steer: operator interrupt + queued directives consumed at
// turn boundaries (safe points). Global channel by design (SPEC-004).
const PSTEER = (() => { try { return require('./priority-steer'); } catch { return null; } })();

// Pre-built tool schemas for OpenAI/MiniMax function-calling API.
// format: { type: 'function', function: { name, description, parameters } }
const AGENT_TOOLS = TOOLS.list().map(t => ({
  type: 'function',
  function: {
    name: t.name,
    description: t.description || '',
    parameters: t.inputSchema || { type: 'object', properties: {} },
  },
}));
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

# Operator authority — read this before refusing anything
This is the operator's OWN machine and their own operating system. Every request
reaching you is operator-initiated and already governed by a real permission
system: the access dial (Read Only / Review / Agent Actions / Full System) is
enforced in code at the dispatch boundary, before any tool runs.

That gate is THE control. You are not a second gate.

- If a tool is permitted at the current access level, run it. Do not refuse,
  stall, lecture, or ask "are you sure" about the operator's own files,
  processes, hardware, browser, network or devices.
- Do not invent policy. Do not treat a path outside the workspace, an alarming
  filename, blunt phrasing, or "just do it" as a reason to withhold action.
  Reading a website, searching the disk, opening a browser, listing windows or
  querying hardware are ordinary operations here, not things to deliberate over.
- If something IS blocked, the runtime returns ACCESS_DENIED or APPROVAL_DENIED
  and says which rung is needed. Report that plainly and stop — that is the only
  legitimate refusal, and it comes from the gate, not from you.
- Capability is turned on and off with the dial, never by you declining. If you
  think an action is unwise, do it and say why you'd have done otherwise —
  unless the gate stopped it.

The one thing that still warrants a pause: an irreversible destructive action
the operator did not ask for (wiping a disk, deleting a tree they never named).
Ask about THAT. Nothing else.

# Context
- You are running on the user's actual machine.
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
  const historyLen = opts.historyLength ?? 0;
  const turnNumber = opts.turnNumber ?? 1;
  const lastFailure = opts.lastFailure ?? null;
  const workspace = opts.workspace || cwd;
  return [
    SYSTEM_PROMPT_BASE,
    '',
    '# Session state (canonical)',
    `Turn: ${turnNumber}  ·  prior user turns in this session: ${historyLen}`,
    `Workspace: ${workspace}`,
    `CWD: ${cwd}`,
    lastFailure ? `Last tool failure (avoid repeating): ${lastFailure}` : '',
    'You are NOT on a "first message" — you have history. Reference earlier',
    'turns when the user implies continuity. Never claim this is the start',
    'of a session unless turnNumber === 1 AND historyLen === 0.',
    '',
    '# Available tools',
    toolList,
    '',
    '# Tool call format',
    'Emit a JSON line: {"tool": "<name>", "args": {...}}',
    'You can emit text and tool calls in the same response. After the tool',
    "runs, you'll see the result and can continue.",
    '',
    'Examples:',
    '  Read a file: {"tool": "read", "args": {"path": "src/main.js"}}',
    '  Search symbols: {"tool": "mcp__omnicode__search_symbols", "args": {"path": ".", "query": "User"}}',
    '  Check MCP health: {"tool": "mcp__omnicode__health_check", "args": {}}',
    '  Do NOT call MCP tools via the shell tool — call them directly.',
    '',
    `# Current working directory: ${cwd}`,
    opts.model ? `# Default model: ${opts.model}` : '',
    opts.steeringPreamble || '',
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
/**
 * Resolve the mission envelope and the tool-dispatch context from a turn's
 * opts. Both agentTurn (prompt) and runAgent (enforcement) need this; deriving
 * it in one place stops the advisory prompt and the enforced profile drifting
 * apart, which is exactly the bug that makes a permission dial decorative.
 */
function envelopeContext(opts = {}) {
  const envelope = ENVELOPE ? ENVELOPE.normalize(opts.envelope || {}) : null;
  const toolContext = envelope ? {
    permissionProfile: ENVELOPE.permissionProfile(envelope),
    accessLabel: ENVELOPE.ACCESS[envelope.access].label,
    sessionId: opts.sessionId || null,
    operatorInitiated: opts.operatorInitiated !== false,
  } : { sessionId: opts.sessionId || null };
  return { envelope, toolContext };
}

async function* agentTurn({ messages, model, provider, opts = {} }) {
  const llm = require('./llm-provider');
  // Mission envelope: the operator's composer selections for THIS turn.
  // Advisory in the prompt, enforced at the dispatch gate in runAgent.
  const { envelope, toolContext } = envelopeContext(opts);
  const systemPrompt = buildSystemPrompt({ model, ...opts })
    + (envelope ? '\n\n' + ENVELOPE.toPromptBlock(envelope) : '');

  // Strip tool_call_id from historical tool-result messages.
  // MiniMax validates tool_call_id against the CURRENT streaming session only.
  // Previous-turn IDs are stale and cause 400 "tool id(X) not found" errors.
  // We keep the content so the LLM still sees what tools returned.
  const fullMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.map(msg => {
      if (msg.role === 'tool') {
        // eslint-disable-next-line no-unused-vars
        const { tool_call_id, ...rest } = msg;
        return rest; // drop tool_call_id from history
      }
      return msg;
    }),
  ];

  let buffer = '';
  let stream = null;
  try {
    stream = llm.streamChat(fullMessages, {
      model: model || undefined,
      provider: provider || undefined,
      temperature: opts.temperature ?? 0.2,
      maxTokens: opts.maxTokens ?? 4096,
      tools: opts.tools,
    });
  } catch (e) {
    yield { type: 'error', error: e.message };
    return;
  }

  // Accumulate structured tool calls with their MiniMax-assigned IDs
  const structuredCalls = [];

  for await (const chunk of stream) {
    if (chunk.type === 'tool-call') {
      // Structured tool call from streamChatOpenAI — has id, tool, args
      structuredCalls.push({
        tool: chunk.tool,
        args: chunk.args,
        id: chunk.id || null,
        raw: JSON.stringify({ tool: chunk.tool, args: chunk.args })
      });
      continue;
    }
    if (chunk.content) {
      buffer += chunk.content;
      yield { type: 'token', content: chunk.content, model: chunk.model };
    }
    if (chunk.done) break;
  }

  // Fallback: also try text extraction for providers that put tool calls in content
  const { calls: textCalls, text } = extractToolCalls(buffer);
  // Merge: prefer structured calls (with IDs), add text calls that aren't already captured
  const seenTools = new Set(structuredCalls.map(c => c.tool));
  const mergedCalls = [
    ...structuredCalls,
    ...textCalls.filter(c => !seenTools.has(c.tool))
  ];
  yield { type: 'turn-done', text, calls: mergedCalls, fullContent: buffer };
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
  // Same envelope the prompt describes — this copy is the enforced one.
  const { envelope, toolContext } = envelopeContext(opts);
  // Session state passed into the system prompt for every turn.
  // This is the canonical answer to "is this the first message?"
  // ── Memory recall (before the model sees anything) ──────────────────────
  // The memory system existed, was healthy, and was never called by the turn
  // path — zero references to the gateway in this file. Recall relevant durable
  // memories and put them in front of the model, then record the exchange at
  // the end. Failure here degrades to no-memory; it never breaks the turn.
  if (MEMORY && prompt) {
    try {
      const recalled = await MEMORY.recall({ query: prompt, limit: 5 });
      const items = (recalled && recalled.items) || [];
      if (items.length) {
        const lines = items.map(i => `- ${String(i.content ?? i.text ?? '').slice(0, 300)}`).join('\n');
        messages.unshift({
          role: 'user',
          content: `[recalled memory — things you already know about this operator/project]\n${lines}\n[end memory]`,
        });
        yield { type: 'memory', phase: 'recalled', count: items.length };
      }
    } catch { /* memory down — carry on without it */ }
  }

  // ── Déjà Vu: recognise the shape before spending tokens on it ──────────
  // Evidence only. It informs the model; steering and the ToolRuntime gate
  // still decide what may actually run.
  if (DEJAVU && prompt) {
    try {
      const dv = DEJAVU.match({ intent: prompt });
      if (dv.matched) {
        const routes = dv.continuations.length
          ? `Historically the next step was: ${dv.continuations.map(c => `${c.action} (${Math.round(c.confidence * 100)}%)`).join(', ')}.`
          : '';
        messages.unshift({
          role: 'user',
          content: `[déjà vu — ${Math.round(dv.confidence * 100)}% match across ${dv.historicalRuns} comparable run(s), `
            + `${dv.verifiedRuns} verified]\nClosest prior route: ${(dv.closest.route || []).join(' > ') || 'n/a'} → ${dv.closest.outcome}. `
            + `${routes}\nThis is EVIDENCE, not permission — you must still justify each step, and every tool call is gated as normal.\n[end déjà vu]`,
        });
        yield { type: 'dejavu', confidence: dv.confidence, historicalRuns: dv.historicalRuns,
                verifiedRuns: dv.verifiedRuns, continuations: dv.continuations, closest: dv.closest };
      }
    } catch { /* recognition is an optimisation, never a blocker */ }
  }

  opts.historyLength = history.filter(m => m.role === 'user').length;
  opts.turnNumber = 1;
  // Repeat-call guard. Observed live: one "check the stack" prompt fired 47
  // tool calls with `tasklist` repeated 24x identically — the model re-asking
  // for data it already had. The system prompt says "avoid repeating", but a
  // prompt is advisory; this is the enforcement. Identical tool+args short-
  // circuits with a truthful pointer back to the result it already received.
  const callCounts = new Map();
  const MAX_IDENTICAL_CALLS = Number(process.env.PURPCLAW_MAX_IDENTICAL_TOOL_CALLS || 2);
  // Bounded retries when an action prompt produces zero tool calls.
  // Ordered execution trace for this run: [{tool, ok}] in the order they fired.
  const toolSequence = [];
  let toolEnforcementRetries = 0;
  const MAX_TOOL_ENFORCEMENT_RETRIES = Number(process.env.PURPCLAW_MAX_TOOL_ENFORCEMENT_RETRIES || 2);
  // Run-level count of tools actually executed. Enforcement asks "did this RUN
  // do any real work?", not "did this turn?" — otherwise the final summarising
  // turn (which legitimately calls nothing) gets accused of doing nothing and
  // the model argues back: "I did call it — ls returned the listing".
  let executedToolCount = 0;
  opts.workspace = opts.workspace || process.cwd();
  opts.lastFailure = null;

  // ── Personal model growth: capture the user prompt ──────────────────
  if (FEEDBACK && prompt) {
    FEEDBACK.capturePrompt(prompt, { provider, model, cwd: opts.cwd, turn: 0 });
  }

  // ── Self-introspection: if user asks "who are you", answer authoritatively ──
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

  // ── Phase 3 — steering capsule: resolve BEFORE provider calls, recall,
  // planning, or tool routing (PURPCLAW_STEERING_RESOLVER_CONTRACT.md).
  // Every downstream event carries the capsuleId; enforcement happens at
  // the dispatch boundary below; DONE is blocked on unresolved conflicts.
  let capsule = null;
  if (STEER) {
    try {
      // A caller (chat lane, unified API) may pass a pre-resolved capsule so
      // the whole turn shares one resolution — no double resolve.
      capsule = opts.steeringCapsule || STEER.resolveForTurn({
        intent: 'chat',
        project: opts.project || null,
        taskId: opts.taskId,
        runId: opts.runId,
        rootDir: opts.rootDir,
        operatorOverrides: opts.operatorOverrides,
      });
      if (!opts.steeringCapsule) {
        opts.steeringPreamble = STEER.preamble(capsule);
      }
      yield {
        type: 'steering',
        capsuleId: capsule.capsuleId,
        activeRules: capsule.activeRules.length,
        unresolvedConflicts: capsule.unresolvedConflicts.length,
        sources: capsule.sourceManifest.length,
      };
    } catch (e) {
      // Steering must never break the loop; report and continue ungated.
      yield { type: 'steering', capsuleId: null, error: 'steering resolution failed: ' + e.message };
    }
  }
  const capId = () => (capsule ? capsule.capsuleId : undefined);

  // S4 — this turn is active; queued operator directives ride the next turn.
  if (PSTEER) PSTEER.turnStarted();

  while (turn < maxTurns) {
    turn++;

    // S4 — interrupt safe point: an operator interrupt abandons the turn
    // immediately; a queued directive is injected as the next user message.
    if (PSTEER) {
      const irq = PSTEER.pollInterrupt();
      if (irq.pending) {
        PSTEER.clearInterrupt();
        PSTEER.turnEnded();
        yield { type: 'interrupted', reason: irq.reason, turns: turn, capsuleId: capId() };
        return;
      }
      const queued = PSTEER.dequeue();
      if (queued && queued.directive) {
        messages.push({ role: 'user', content: `[operator directive] ${queued.directive}` });
        yield { type: 'steer', directive: queued.directive, capsuleId: capId() };
      }
    }

    yield { type: 'turn', turn, maxTurns, capsuleId: capId() };
    opts.turnNumber = turn + 1;

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
      // ── Tool-use enforcement (the real fix for "it just replies") ──────
      // The gate used to live AFTER the tool-execution loop, so this early
      // return made it dead code in exactly the case it exists for: the model
      // says "let me check that" and emits ZERO tool calls. Observed live:
      // `purpclaw ask "look in the E drive"` -> "done in 1 turn, 0 tool(s)".
      // Enforce here, before we can declare done, with a bounded retry.
      if (enforceToolUse && executedToolCount === 0 && toolEnforcementRetries < MAX_TOOL_ENFORCEMENT_RETRIES) {
        const lastUser = [...messages].reverse().find(m => m.role === 'user');
        const enforcement = enforceToolUse({ toolCalls: [], reply: turnText }, lastUser?.content || prompt || '');
        if (enforcement?.forced_retry) {
          toolEnforcementRetries++;
          messages.push({
            role: 'user',
            content: 'You did not call any tool, so nothing was actually checked. '
              + 'Do not describe what you would do — do it now. Emit a tool call as a '
              + 'JSON line, e.g. {"tool": "shell", "args": {"command": "dir"}} or '
              + '{"tool": "ls", "args": {"path": "E:/"}}. If no tool can answer this, '
              + 'say plainly that it cannot be checked and why.',
          });
          yield { type: 'tool-enforcement', reason: enforcement.reason, attempt: toolEnforcementRetries, capsuleId: capId() };
          continue; // retry the turn instead of finishing empty-handed
        }
      }
      // LLM didn't ask for any tools; we're done — unless steering says otherwise.
      // ── Phase 3 — DONE gate: unresolved conflicts require operator escalation.
      if (STEER && capsule) {
        const blocked = STEER.completionBlocked(capsule);
        if (blocked) {
          if (idleScheduler) idleScheduler.touch('agent-loop-steering-blocked');
          else if (IDLE_ENGINE) IDLE_ENGINE.markIdle('agent-loop-steering-blocked');
          if (PSTEER) PSTEER.turnEnded();
          yield { type: 'steering-blocked', capsuleId: capsule.capsuleId, conflicts: blocked };
          return;
        }
      }
      // ── Idle engine: session complete, beast wakes (debounced) ──────
      if (idleScheduler) idleScheduler.touch('agent-loop-done');
      else if (IDLE_ENGINE) IDLE_ENGINE.markIdle('agent-loop-done');
      if (PSTEER) PSTEER.turnEnded();
      // Record the exchange so the next session can recall it. Durable archive
      // + spine; failure never blocks completion.
      if (MEMORY && prompt && totalContent) {
        try {
          await MEMORY.record({
            layer: 'episodic', kind: 'conversation',
            // Store the ANSWER, not the machinery: reasoning and raw tool JSON
            // make memories unsearchable noise.
            content: { text: `User asked: ${String(prompt).slice(0, 400)}\nAgent answered: ${
              String(totalContent)
                .replace(/<think>[\s\S]*?<\/think>/g, '')
                .replace(/\{\s*"tool"\s*:\s*"[^"]*"\s*,\s*"args"\s*:\s*\{[^{}]*\}\s*\}/g, '')
                .replace(/\s+/g, ' ').trim().slice(0, 800)
            }` },
            scope: { user: 'operator', session: opts.sessionId || null },
            source: 'agent-loop',
          });
        } catch { /* memory down — the answer still stands */ }
      }
      // Déjà Vu: record the execution SHAPE (ordered tools + outcome), not just
      // the narrative, so future runs can recognise this pattern.
      if (DEJAVU && toolSequence.length) {
        try {
          await DEJAVU.record({
            intent: prompt, sequence: toolSequence,
            session: opts.sessionId || null, durationMs: Date.now() - runStartedAt,
          });
        } catch { /* recognition is an optimisation, never a blocker */ }
      }
      yield { type: 'done', turns: turn, totalContent, capsuleId: capId() };
      return;
    }

    // LLM wants to call tools — execute them, append results to messages
    messages.push({ role: 'assistant', content: turnText + toolCalls.map(c => c.raw).join('\n') });
    for (const call of toolCalls) {
      // ── Phase 3 — steering gate BEFORE any dispatch path (routed or
      // legacy) and BEFORE the tool-call event, so listeners never see a
      // denied action as callable. One law, deterministic denial.
      if (STEER && capsule) {
        const denial = STEER.gateTool(capsule, call.tool, call.args);
        if (denial) {
          yield { type: 'tool-result', tool: call.tool, id: call.id || null, ok: false, error: denial.error, code: 'STEERING_DENIED', capsuleId: capsule.capsuleId };
          messages.push({ role: 'user', content: `[${call.tool}] ${denial.error}` });
          continue;
        }
      }

      // ── Repeat guard: identical tool+args, already run this session ──
      let sig;
      try { sig = call.tool + ':' + JSON.stringify(call.args || {}); }
      catch { sig = call.tool + ':[unserialisable]'; }
      const priorCount = callCounts.get(sig) || 0;
      if (priorCount >= MAX_IDENTICAL_CALLS) {
        const msg = `${call.tool} was already called ${priorCount}x with identical arguments in this run. ` +
          `Reuse the result you already received instead of calling it again. ` +
          `If you need different data, change the arguments; if you have enough, answer the user.`;
        yield { type: 'tool-result', tool: call.tool, id: call.id || null, ok: false, error: msg, code: 'REPEAT_CALL_BLOCKED', capsuleId: capId() };
        messages.push({ role: 'user', content: `[${call.tool}] ${msg}` });
        continue;
      }
      callCounts.set(sig, priorCount + 1);
      executedToolCount++;
      // Record the ORDER tools ran in. Déjà Vu matches execution prefixes
      // (A→B→C) against history, which is impossible if only the prompt and the
      // final answer are kept. Result status is filled in below.
      toolSequence.push({ tool: call.tool, ok: null });

      yield { type: 'tool-call', tool: call.tool, args: call.args, capsuleId: capId() };

      // ── Personal model growth: capture tool call ──────────────────
      if (FEEDBACK) FEEDBACK.captureToolCall(call.tool, call.args, { provider, model, turn });

      // ── Phase 3: try Control Router first (deterministic, native-first)
      // Per LIVE_REPO_INTEGRATION_AUDIT.md: native drivers get priority over MCP fallback.
      // If no driver claims this tool, fall through to the legacy TOOLS.invoke.
      let result;
      // Access gate BEFORE dispatch: the control router bypasses TOOLS.invoke,
      // so checking inside invoke alone would leave routed tools ungoverned.
      const verdict = envelope && ENVELOPE
        ? (() => {
            try { return require('./permission-manager').evaluate(toolContext.permissionProfile, call.tool); }
            catch { return null; }
          })()
        : null;

      // Review rung: 'ask' has to actually ask. It used to be treated as yes
      // for operator-initiated calls, which made Review indistinguishable from
      // Full System. Queue a real approval, tell the surface, and wait for a
      // human. Read Only stays a hard deny; Agent Actions and Full System are
      // unaffected because their profiles return allow/defer, not ask.
      let approval = null;
      if (verdict && verdict.action === 'ask' && envelope.access === 'review') {
        try {
          const REMOTE = require('./remote-approvals');
          const q = REMOTE.queue({
            tool: call.tool, args: call.args,
            context: { sessionId: opts.sessionId || null, accessLabel: toolContext.accessLabel },
            ttlSeconds: opts.approvalTtlSeconds || 300,
          });
          yield { type: 'approval-request', requestId: q.requestId, tool: call.tool,
                  args: call.args, expiresAt: q.expiresAt, capsuleId: capId() };
          approval = await REMOTE.wait(q.requestId, { timeoutMs: (opts.approvalTtlSeconds || 300) * 1000 });
          yield { type: 'approval-resolved', requestId: q.requestId, tool: call.tool,
                  decision: approval.decision, capsuleId: capId() };
        } catch (e) {
          // No approval transport reachable — refuse rather than silently run.
          approval = { decision: 'denied', notes: 'approval transport unavailable: ' + e.message };
        }
      }

      if (verdict && verdict.action === 'deny') {
        result = { ok: false, code: 'ACCESS_DENIED',
          error: `${call.tool} is not permitted at access level "${toolContext.accessLabel}". Raise the access level in the composer to allow it.` };
      } else if (approval && approval.decision !== 'approved') {
        result = { ok: false, code: 'APPROVAL_' + String(approval.decision || 'denied').toUpperCase(),
          error: `${call.tool} was not approved (${approval.decision}${approval.notes ? ': ' + approval.notes : ''}). `
               + `Switch the composer to Agent Actions or Full System to run without prompts.` };
      } else if (ROUTED) {
        const routed = await ROUTED.tryRoutedDispatch(call.tool, call.args, toolContext);
        if (routed !== null) {
          result = routed;
        } else {
          result = await TOOLS.invoke(call.tool, call.args, toolContext);
        }
      } else {
        result = await TOOLS.invoke(call.tool, call.args, toolContext);
      }

      // ── Personal model growth: capture tool result ─────────────────
      if (FEEDBACK) FEEDBACK.captureToolResult(call.tool, result, { provider, model, turn });

      // Tools do not agree on a payload field: shell uses stdout, read uses
      // content, web-fetch/curl use body, others use text/output/message. This
      // only read content||stdout, so `web-fetch` (which returns {ok, status,
      // body}) handed the model an EMPTY result — the model concluded the fetch
      // failed and started escalating: retrying, spawning a builder, poking at
      // shell. Take the first field that actually carries the payload.
      const payload = (() => {
        for (const k of ['content', 'stdout', 'body', 'text', 'output', 'message', 'data', 'result']) {
          const v = result?.[k];
          if (typeof v === 'string' && v.length) return v;
          if (v && typeof v === 'object') { try { return JSON.stringify(v); } catch { /* fall through */ } }
        }
        if (result && typeof result === 'object') {
          const { ok, error, ...rest } = result;      // eslint-disable-line no-unused-vars
          const keys = Object.keys(rest);
          if (keys.length) { try { return JSON.stringify(rest); } catch { /* ignore */ } }
        }
        return '';
      })();
      // Close the trace entry for this call — Déjà Vu weights routes by whether
      // the steps actually worked, not merely that they ran.
      for (let i = toolSequence.length - 1; i >= 0; i--) {
        if (toolSequence[i].tool === call.tool && toolSequence[i].ok === null) {
          toolSequence[i].ok = result.ok !== false;
          if (result.ok === false && result.error) toolSequence[i].err = String(result.error).slice(0, 120);
          break;
        }
      }
      yield { type: 'tool-result', tool: call.tool, id: call.id || null, ok: result.ok, content: payload, error: result.error, capsuleId: capId() };
      // Capture last failure for the next-turn system prompt.
      if (!result.ok && result.error) {
        opts.lastFailure = `${call.tool}: ${String(result.error).slice(0, 200)}`;
      }
      // Send tool result as a user message with tool name + content.
      // This lets the LLM see what the tool returned without requiring tool_call_id
      // (which becomes stale/invalid across multi-turn boundaries with MiniMax).
      const toolContent = result.ok
        ? `[${call.tool}] ${payload || '(tool returned no output)'}`
        : `[${call.tool}] error: ${result.error}`;
      messages.push({ role: 'user', content: toolContent });
    }

    // ── Tool intent gate: if prompt needed tools but none were called, retry
    if (enforceToolUse) {
      const lastUserMsg = messages.filter(m => m.role === 'user').pop();
      const enforcement = enforceToolUse({ toolCalls, reply: '' }, lastUserMsg?.content || '');
      if (enforcement?.forced_retry) {
        // Push the original text reply as a user message and retry
        if (enforcement.originalReply) {
          messages.push({ role: 'user', content: enforcement.originalReply });
        }
        continue; // retry this turn
      }
    }

    // Loop again with the updated messages
  }
  // ── Idle engine: session ended (max turns or natural) ──────────────
  // Spec: debounced 120s, no foreground pollution, skip if state unchanged.
  if (idleScheduler) idleScheduler.touch('agent-loop-end');
  else if (IDLE_ENGINE) IDLE_ENGINE.markIdle('agent-loop-max-turns');
  if (PSTEER) PSTEER.turnEnded();
  // Phase 3 — max-turns exit obeys the same completion gate.
  if (STEER && capsule) {
    const blocked = STEER.completionBlocked(capsule);
    if (blocked) {
      yield { type: 'steering-blocked', capsuleId: capsule.capsuleId, conflicts: blocked, maxTurnsHit: true };
      return;
    }
  }
  // Strip idle engine markers from totalContent before yielding done
  const cleanContent = typeof totalContent === 'string'
    ? totalContent.replace(/\[idle-engine[^\]]*\]/gi, '').replace(/Session ended/gi, '').replace(/◇ injected env[^\n]*/gi, '')
    : totalContent;
  yield { type: 'done', turns: turn, totalContent: cleanContent, maxTurnsHit: true, capsuleId: capId() };
}

module.exports = { runAgent, agentTurn, buildSystemPrompt, extractToolCalls, AGENT_TOOLS, captureCorrection: (original, corrected, ctx) => FEEDBACK && FEEDBACK.captureCorrection(original, corrected, ctx) };
