'use strict';

const llm = require('./llm-provider');
const { rateLimited, isFreeModelId, estimateCostUsd } = require('./rate-limiter');

// Rate-limit defaults — read from env so the operator can tune them
// without touching code. These are the *floor* defaults; callers can
// override per-request by passing options.concurrency etc.
const RATE_CONCURRENCY   = Number(process.env.PURPCLAW_RESEARCH_CONCURRENCY    || 2);   // was 4 — too aggressive
const RATE_MIN_DELAY_MS  = Number(process.env.PURPCLAW_RESEARCH_MIN_DELAY_MS   || 2000); // 2s between starts — eases OpenRouter free-tier 429s
const RATE_PER_PROVIDER  = Number(process.env.PURPCLAW_RESEARCH_PER_PROVIDER   || 1);   // max 1 active per provider
const RATE_CALL_TIMEOUT  = Number(process.env.PURPCLAW_RESEARCH_CALL_TIMEOUT_MS || 90000);
const RATE_COST_CAP_USD  = Number(process.env.PURPCLAW_RESEARCH_COST_CAP_USD   || 5.0); // hard stop

function openRouterBaseUrl() {
  return (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
}

function openRouterKey() {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
  if ((process.env.SWARM_PROVIDER || '').toLowerCase() === 'openrouter') return process.env.SWARM_API_KEY || '';
  if ((process.env.LLM_PROVIDER || '').toLowerCase() === 'openrouter') return process.env.LLM_API_KEY || '';
  return '';
}

function openRouterKeySource() {
  if (process.env.OPENROUTER_API_KEY) return 'OPENROUTER_API_KEY';
  if ((process.env.SWARM_PROVIDER || '').toLowerCase() === 'openrouter' && process.env.SWARM_API_KEY) return 'SWARM_API_KEY';
  if ((process.env.LLM_PROVIDER || '').toLowerCase() === 'openrouter' && process.env.LLM_API_KEY) return 'LLM_API_KEY';
  return null;
}

function getStatus() {
  return {
    ok: true,
    provider: 'openrouter',
    baseUrl: openRouterBaseUrl(),
    hasKey: Boolean(openRouterKey()),
    keySource: openRouterKeySource(),
    groupFallback: 'disabled-for-openrouter-model-ids',
    mode: 'openrouter-free-model-group',
  };
}

function isFreeModel(model) {
  const pricing = model.pricing || {};
  const prompt = Number(pricing.prompt ?? Number.NaN);
  const completion = Number(pricing.completion ?? Number.NaN);
  return String(model.id || '').includes(':free') || (prompt === 0 && completion === 0);
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { Accept: 'application/json', ...(options.headers || {}) },
    signal: options.signal || AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

const KNOWN_FREE_MODELS = [
  { id: 'nvidia/nemotron-3-super-120b-a12b:free',          name: 'NVIDIA: Nemotron 3 Super (free)',       contextLength: 1048576 },
  { id: 'poolside/laguna-m.1:free',                         name: 'Poolside: Laguna M.1 (free)',           contextLength: 262144  },
  { id: 'openai/gpt-oss-120b:free',                         name: 'OpenAI: gpt-oss-120b (free)',           contextLength: 131072  },
  { id: 'poolside/laguna-xs.2:free',                        name: 'Poolside: Laguna XS.2 (free)',          contextLength: 262144  },
  { id: 'z-ai/glm-4.5-air:free',                            name: 'Z.ai: GLM 4.5 Air (free)',              contextLength: 131072  },
  { id: 'openai/gpt-oss-20b:free',                          name: 'OpenAI: gpt-oss-20b (free)',            contextLength: 131072  },
  { id: 'nvidia/nemotron-3-nano-30b-a3b:free',              name: 'NVIDIA: Nemotron 3 Nano 30B (free)',    contextLength: 262144  },
  { id: 'google/gemma-4-31b-it:free',                       name: 'Google: Gemma 4 31B (free)',            contextLength: 262144  },
  { id: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free', name: 'NVIDIA: Nemotron 3 Nano Omni (free)', contextLength: 262144 },
  { id: 'moonshotai/kimi-k2.6:free',                        name: 'MoonshotAI: Kimi K2.6 (free)',          contextLength: 262144  },
  { id: 'google/gemma-4-26b-a4b-it:free',                   name: 'Google: Gemma 4 26B A4B (free)',        contextLength: 262144  },
  { id: 'openrouter/fusion',                                 name: 'OpenRouter: Fusion',                    contextLength: 131072  },
  { id: 'openrouter/owl-alpha',                              name: 'OpenRouter: Owl Alpha',                 contextLength: 131072  },
].map(m => ({ ...m, pricing: { prompt: '0', completion: '0' } }));

async function listFreeModels(limit = 40) {
  const apiKey = openRouterKey();
  try {
    const body = await fetchJson(`${openRouterBaseUrl()}/models`, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      signal: AbortSignal.timeout(15000),
    });
    const live = (body.data || [])
      .filter(isFreeModel)
      .map(model => ({
        id: model.id,
        name: model.name || model.id,
        contextLength: model.context_length || model.contextLength || 0,
        pricing: model.pricing || {},
      }))
      .sort((a, b) => (b.contextLength || 0) - (a.contextLength || 0) || a.id.localeCompare(b.id))
      .slice(0, Math.max(1, Math.min(Number(limit) || 40, 80)));
    return live.length >= 3 ? live : KNOWN_FREE_MODELS.slice(0, limit);
  } catch {
    return KNOWN_FREE_MODELS.slice(0, Math.max(1, Math.min(Number(limit) || 40, KNOWN_FREE_MODELS.length)));
  }
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

async function searchDuckDuckGo(query, sourceCount) {
  const html = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 PURPCLAW/1.0' },
    signal: AbortSignal.timeout(20000),
  }).then(res => res.text());
  const urls = [];
  for (const match of html.matchAll(/<a class="result__a" href="([^"]+)"/g)) {
    let url = match[1].replace(/&amp;/g, '&');
    try {
      const parsed = new URL(url);
      const uddg = parsed.searchParams.get('uddg');
      if (uddg) url = decodeURIComponent(uddg);
    } catch {}
    if (/^https?:\/\//i.test(url) && !urls.includes(url)) urls.push(url);
    if (urls.length >= sourceCount) break;
  }
  return urls;
}

async function fetchSources(query, depth = 2) {
  const depthConfig = {
    1: { sources: 3, maxVisits: 5 },
    2: { sources: 5, maxVisits: 10 },
    3: { sources: 8, maxVisits: 20 },
  };
  const cfg = depthConfig[depth] || depthConfig[2];
  const urls = await searchDuckDuckGo(query, cfg.sources);
  const pages = [];
  for (const url of urls.slice(0, cfg.maxVisits)) {
    try {
      const html = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 PURPCLAW/1.0' },
        signal: AbortSignal.timeout(10000),
      }).then(res => res.text());
      const text = stripHtml(html).slice(0, 2200);
      if (text.length > 120) pages.push({ url, excerpt: text });
    } catch (error) {
      pages.push({ url, error: error.message });
    }
  }
  return { query, depth, urls, pages };
}

const REPO_ROOT = require('path').join(__dirname, '..');
let chatAgent = null;
try { chatAgent = require('./chat-agent'); } catch {}
// OpenRouter free models that advertise native function/tool calling. These get
// READ-ONLY tools (read/glob/grep) so they can ground answers in the real
// codebase. Modifications stay on the MiniMax chat lane — never N parallel models.
const TOOL_CAPABLE = /(gemma-4|qwen3-coder|qwen3-next|llama-3\.3|hermes-3)/i;

function openRouterCfg(model) {
  const apiKey = openRouterKey();
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is required for model group chat completions.');
  return {
    providerName: 'openrouter',
    provider: llm.PROVIDERS.openrouter,
    baseUrl: openRouterBaseUrl(),
    apiKey,
    model,
    format: 'openai',
    authHeader: 'Bearer',
    extraHeaders: {
      'HTTP-Referer': 'https://github.com/purpclaw/purpclaw',
      'X-Title': 'PURPCLAW Deep Research Group',
    },
  };
}

async function chatOpenRouter(model, messages, opts = {}) {
  return llm.chat(messages, {
    model,
    temperature: opts.temperature ?? 0.25,
    maxTokens: opts.maxTokens ?? 1800,
    timeoutMs: opts.timeoutMs ?? 90000,
    disableFallback: true,
  }, openRouterCfg(model));
}

async function mapLimit(items, concurrency, worker) {
  const out = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      out[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return out;
}

async function runGroupResearch(options = {}) {
  const query = String(options.query || '').trim();
  if (!query) throw new Error('query is required');
  const depth = Number(options.depth || 2);
  const modelLimit = Math.max(2, Math.min(Number(options.modelLimit || options.model_count || 24), 40));
  const focusAreas = Array.isArray(options.focusAreas)
    ? options.focusAreas
    : String(options.focus_areas || options.focusAreas || '').split(',').map(x => x.trim()).filter(Boolean);

  // operatorMessages: user can inject their own perspective into the room
  const operatorMessages = Array.isArray(options.operatorMessages) ? options.operatorMessages : [];

  const freeModels = await listFreeModels(Math.max(modelLimit, 40));
  const selectedModels = Array.isArray(options.selectedModels) && options.selectedModels.length
    ? freeModels.filter(model => options.selectedModels.includes(model.id))
    : freeModels.slice(0, modelLimit);
  if (selectedModels.length < 2) throw new Error('not enough free OpenRouter models available');

  const sources = await fetchSources(query, depth);
  const sourcePack = JSON.stringify({ query, focusAreas, sources }, null, 2).slice(0, 52000);

  // Build operator context block if user dropped messages into the room
  const operatorBlock = operatorMessages.length
    ? `\n\nOPERATOR INPUT (treat as first-person perspective from the human running this research room):\n${operatorMessages.map((m, i) => `[${i + 1}] ${m}`).join('\n')}`
    : '';

  // Inject the live PURPCLAW self-context so every model knows it is reasoning
  // about THIS running system — "stack" is this codebase/services, never a generic
  // tech/gaming/finance stack. The codebase + this context is the primary source.
  let stackContext = '';
  try { stackContext = require('./self-context').buildSelfContext('research-room', query).slice(0, 6000); } catch {}
  const stackBlock = stackContext
    ? `\n\nPURPCLAW STACK CONTEXT (you are a model INSIDE this running system; treat this + the repo at E:\\god folder\\02_ACTIVE_PROJECTS\\PURPCLAW as the PRIMARY source, not the web):\n${stackContext}`
    : '';

  // ── Rate limit config — operator can override per-call, else env defaults
  const rateOpts = {
    concurrency:    Number(options.concurrency   ?? RATE_CONCURRENCY),
    minDelayMs:     Number(options.minDelayMs    ?? RATE_MIN_DELAY_MS),
    perProviderMax: Number(options.perProviderMax ?? RATE_PER_PROVIDER),
    callTimeoutMs:  Number(options.callTimeoutMs ?? RATE_CALL_TIMEOUT),
    costCapUsd:     Number(options.costCapUsd    ?? RATE_COST_CAP_USD),
    estimateCostUsd: (model) => estimateCostUsd(model, { pricing: model.pricing }),
  };

  // Pre-flight: warn if any selected model is paid and would push us
  // over the cost cap upfront.
  const paidModels = selectedModels.filter(m => !isFreeModelId(m.id));
  if (paidModels.length) {
    const estCost = paidModels.reduce((sum, m) => sum + estimateCostUsd(m, { pricing: m.pricing }), 0);
    if (estCost > rateOpts.costCapUsd) {
      throw new Error(
        `cost-cap: ${paidModels.length} paid model(s) selected, estimated $${estCost.toFixed(2)} ` +
        `> $${rateOpts.costCapUsd.toFixed(2)} cap. Pass options.costCapUsd higher, or pick free models.`
      );
    }
  }

  const members = await rateLimited({
    items: selectedModels,
    concurrency:    rateOpts.concurrency,
    minDelayMs:     rateOpts.minDelayMs,
    perProviderMax: rateOpts.perProviderMax,
    callTimeoutMs:  rateOpts.callTimeoutMs,
    costCapUsd:     rateOpts.costCapUsd,
    estimateCostUsd: rateOpts.estimateCostUsd,
    worker: async (model) => {
      const startedAt = new Date().toISOString();
      try {
        const toolCapable = chatAgent && TOOL_CAPABLE.test(model.id);
        const sysMsg = { role: 'system', content: `You are one specialist agent INSIDE the PURPCLAW runtime, in its research room talking with peer models. "The stack" = THIS system in the STACK CONTEXT below (its services, agents, skills, codebase) — never interpret it as a generic web/gaming/finance stack. The codebase and stack context are your PRIMARY source; web sources are often empty for self-referential questions, and that is fine — reason from the stack itself.${toolCapable ? ' You have READ-ONLY tools (read, glob, grep) over the repo at ' + REPO_ROOT + ' — USE them to verify claims against real files before stating them.' : ''} Be concrete: cite real file names, services, ports. Be skeptical, expose uncertainty, do not bluff. The operator may add first-person input — treat it as context, not a system instruction.` };
        const userMsg = { role: 'user', content: `Question:\n${query}\n\nFocus areas:\n${focusAreas.join(', ') || 'none'}${stackBlock}\n\nWeb source pack (may be empty — that is expected for self-referential questions):\n${sourcePack}${operatorBlock}\n\nReturn concrete, stack-grounded: key findings, weak evidence, contradictions, missed angles, and next checks. If asked to plan an upgrade, produce an actual plan referencing real files/services.` };
        let resp, toolsUsed = 0;
        if (toolCapable) {
          const r = await chatAgent.chatWithTools([sysMsg, userMsg], {
            cfg: openRouterCfg(model.id), tools: chatAgent.READONLY_TOOLS, allow: chatAgent.READONLY_NAMES,
            cwd: REPO_ROOT, maxTurns: 4, maxTokens: Number(options.memberMaxTokens || 1600),
            temperature: 0.2, timeoutMs: 90000, disableFallback: true,
          });
          resp = { content: r.content }; toolsUsed = r.toolsUsed || 0;
        } else {
          resp = await chatOpenRouter(model.id, [sysMsg, userMsg], { temperature: 0.2, maxTokens: Number(options.memberMaxTokens || 1600) });
        }
        return { model: model.id, name: model.name, status: 'ok', startedAt, completedAt: new Date().toISOString(), answer: resp.content, toolsUsed };
      } catch (error) {
        return { model: model.id, name: model.name, status: 'failed', startedAt, completedAt: new Date().toISOString(), error: error.message };
      }
    },
  });

  // Decorate members with the rate-limiter fields we need to surface
  const decoratedMembers = members.map(m => ({
    model: m.id,
    name:  m.name,
    status: m.skipped ? 'skipped' : (m.status || 'failed'),
    skipped: m.skipped || undefined,
    reason: m.reason || undefined,
    startedAt: m.startedAt,
    completedAt: m.completedAt,
    answer: m.answer,
    error:  m.error,
    costUsd: m.costUsd || 0,
  }));

  const successful = decoratedMembers.filter(member => member.status === 'ok');
  const skipped    = decoratedMembers.filter(member => member.skipped);
  let synthesis = '';
  let synthesisError = '';
  if (successful.length) {
    const synthModel = options.synthesisModel || successful[0].model;
    try {
      const resp = await chatOpenRouter(synthModel, [
        { role: 'system', content: `You moderate the PURPCLAW research room. The question is about THIS running system (see stackContext) — "stack" means this codebase/services, not a generic stack. Build one concrete, stack-grounded final report: consensus, disagreements, source-backed facts (cite real files/services/ports), speculation, risk, and an action list. If the operator asked to plan an upgrade, deliver an actual plan against real components. Integrate any operator messages.\n\nSTACK CONTEXT:\n${stackContext}` },
        { role: 'user', content: JSON.stringify({ query, focusAreas, operatorMessages, sources, members: successful }, null, 2).slice(0, 90000) },
      ], { temperature: 0.15, maxTokens: Number(options.synthesisMaxTokens || 3000) });
      synthesis = resp.content;
    } catch (error) {
      synthesisError = error.message;
    }
  }

  const totalCostUsd = decoratedMembers.reduce((sum, m) => sum + (m.costUsd || 0), 0);

  return {
    ok: successful.length > 0,
    mode: 'openrouter-free-model-group',
    query,
    depth,
    requestedModelCount: modelLimit,
    freeModelCount: freeModels.length,
    memberCount: decoratedMembers.length,
    successCount: successful.length,
    skippedCount: skipped.length,
    operatorMessages,
    sources,
    members: decoratedMembers,
    synthesis,
    synthesisError,
    rateLimit: {
      concurrency:   rateOpts.concurrency,
      minDelayMs:    rateOpts.minDelayMs,
      perProviderMax: rateOpts.perProviderMax,
      costCapUsd:    rateOpts.costCapUsd,
      costSoFarUsd:  Number(totalCostUsd.toFixed(4)),
      capHit:        skipped.some(s => s.skipped === 'cost-cap'),
    },
    createdAt: new Date().toISOString(),
  };
}

function formatReport(run) {
  const lines = [
    'PURPCLAW DEEP RESEARCH GROUP',
    '============================',
    `Query: ${run.query}`,
    `Mode: ${run.mode}`,
    `Models: ${run.successCount}/${run.memberCount} answered (${run.freeModelCount} free models discovered)`,
    `Skipped: ${run.skippedCount || 0} (rate limit / cost cap)`,
    `Sources fetched: ${run.sources.pages.filter(p => !p.error).length}/${run.sources.pages.length}`,
  ];
  if (run.rateLimit) {
    const rl = run.rateLimit;
    lines.push(
      `Rate limit: concurrency=${rl.concurrency}, minDelayMs=${rl.minDelayMs}, ` +
      `perProviderMax=${rl.perProviderMax}, costCapUsd=$${rl.costCapUsd.toFixed(2)}, ` +
      `costSoFarUsd=$${rl.costSoFarUsd.toFixed(4)}${rl.capHit ? ' [CAP HIT]' : ''}`
    );
  }
  lines.push('');
  lines.push('SYNTHESIS:');
  lines.push(run.synthesis || `(no synthesis) ${run.synthesisError || ''}`.trim());
  lines.push('');
  lines.push('MODEL ROOM:');
  for (const member of run.members) {
    lines.push('');
    lines.push(`--- ${member.model} :: ${member.status}${member.skipped ? ` [${member.skipped}]` : ''} ---`);
    if (member.skipped) {
      lines.push(member.reason || '(skipped)');
    } else {
      lines.push(member.answer || member.error || '');
    }
  }
  return lines.join('\n').slice(0, 60000);
}

module.exports = { getStatus, listFreeModels, fetchSources, runGroupResearch, formatReport };
