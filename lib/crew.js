'use strict';

/**
 * crew — PURPCLAW's named agent crew (adapted from the Hermes Analyst/Writer/
 * Marketer/Coder pattern, rebuilt PURPCLAW-native: Windows + local + browser,
 * NO ~/.hermes, NO sqlite-cli/bash/cron, NO Telegram/Discord, NO VPS).
 *
 * One model per agent (operator directive 2026-06-23): the Orchestrator runs on
 * the native MiniMax subscription; everyone else runs on NVIDIA NIM endpoints.
 *
 * Logging is NOT a bash+sqlite backbone — it's PURPCLAW's superior spine:
 * every dispatch/pipeline goes through lib/pipeline-registry (call/stop/log/
 * health) and writes a lib/proof-ledger evidence row on finish.
 */

let registry = null; try { registry = require('./pipeline-registry'); } catch (_) {}
let llm = null; try { llm = require('./llm-provider'); } catch (_) {}

// ── The crew: role → model binding + specialty + team-aware system prompt ────
const CREW = {
  orchestrator: {
    name: 'Orchestrator',
    provider: 'minimax', model: process.env.ORCHESTRATOR_MODEL || 'MiniMax-M2.7', // native MiniMax SUB
    specialty: 'coordination, delegation, conflict resolution, system coherence',
    system: "You are the Orchestrator — PURPCLAW's top-level coordinator. You own overall coherence, delegation strategy, and recovery planning. Maintain structure but stay out of the way when it's already working. Lead with the decision the owner needs, not context. No filler openers.",
  },
  analyst: {
    name: 'Analyst',
    provider: 'nvidia', model: 'moonshotai/kimi-k2.6', // NIM, long-context research
    fallbackModel: 'minimaxai/minimax-m3', // kimi-k2.6 NIM can repetition-loop; fall back to a stable sibling
    specialty: 'research, trend intelligence, sourcing',
    system: "You are the Analyst. Research, trend intelligence, and sourcing. Surface concrete facts, prior art, and best practices with sources and a confidence rating — minimum viable proof, not five filler links. Be specific, not theoretical.",
  },
  writer: {
    name: 'Writer',
    provider: 'nvidia', model: 'minimaxai/minimax-m3', // NIM, writing/general
    specialty: 'writing, editing, content shaping',
    system: "You are the Writer. Writing, editing, and content shaping. Turn the Analyst's findings into clear, structured long-form content. Keep the voice tight and human. No fluff.",
  },
  marketer: {
    name: 'Marketer',
    provider: 'nvidia', model: 'deepseek-ai/deepseek-v4-flash', // NIM, fast content gen
    specialty: 'marketing strategy, growth, campaigns, monetization',
    system: "You are the Marketer. Marketing strategy, growth, campaigns, and monetization. From a piece of content, produce social posts and a concrete promotion/monetization plan with channels and a sequence. Specific and actionable.",
  },
  coder: {
    name: 'Coder',
    provider: 'nvidia', model: 'deepseek-ai/deepseek-v4-pro', // NIM, code/reasoning
    specialty: 'development, automation, integrations, technical systems',
    system: "You are the Coder. Development, automation, integrations, and technical systems. Identify the exact files/functions to touch and what the diff looks like. Infer safely and act where obvious; ask only when blocked. No permission theatre.",
  },
};

const ROLES = Object.keys(CREW);

// ── Routing table: natural-language phrase → role (highest score wins) ───────
const ROUTING = [
  { role: 'analyst', re: /\b(research|find out|look up|investigate|trends?|sources?|data|statistics|competitor|market research|what'?s happening|intelligence|prior art)\b/i },
  { role: 'writer', re: /\b(write|draft|edit|blog|article|copy|rewrite|proofread|content|post(?! a tweet)|essay|story|headline|caption)\b/i },
  { role: 'marketer', re: /\b(market|promote|campaign|growth|launch|audience|social( media)?|tweet|monetiz|monetis|sell|outreach|funnel|seo|ads?)\b/i },
  { role: 'coder', re: /\b(code|build|implement|fix|debug|refactor|integrate|api|script|automat|deploy|function|component|bug|endpoint)\b/i },
  { role: 'orchestrator', re: /\b(plan|coordinate|delegate|organi[sz]e|strategy|who should|route this|prioriti|roadmap|oversee)\b/i },
];

const SLASH = { '/analyst': 'analyst', '/writer': 'writer', '/marketer': 'marketer', '/coder': 'coder', '/orchestrator': 'orchestrator', '/orch': 'orchestrator' };

/** Route a natural-language message (or slash command) to a role. */
function route(message) {
  const text = String(message || '').trim();
  // Slash command wins.
  const m = text.match(/^(\/[a-z]+)\b\s*([\s\S]*)$/i);
  if (m && SLASH[m[1].toLowerCase()]) {
    return { role: SLASH[m[1].toLowerCase()], prompt: m[2].trim() || text, reason: 'slash command', confident: true };
  }
  // Score routing rules.
  const scores = {};
  for (const r of ROUTING) if (r.re.test(text)) scores[r.role] = (scores[r.role] || 0) + 1;
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (!ranked.length) {
    // FALLBACK: unsure → Orchestrator decides (don't guess, don't refuse).
    return { role: 'orchestrator', prompt: text, reason: 'unclear — routed to Orchestrator to decide/clarify', confident: false };
  }
  // Tie between top two → Orchestrator decides.
  if (ranked.length > 1 && ranked[0][1] === ranked[1][1]) {
    return { role: 'orchestrator', prompt: text, reason: `ambiguous (${ranked[0][0]} vs ${ranked[1][0]}) — Orchestrator decides`, confident: false };
  }
  return { role: ranked[0][0], prompt: text, reason: `matched ${ranked[0][0]}`, confident: true };
}

/** Build the team-awareness brief every agent shares (handoff, not silent absorb). */
function teamBrief(selfRole) {
  const others = ROLES.filter(r => r !== selfRole)
    .map(r => `- ${CREW[r].name}: ${CREW[r].specialty}`).join('\n');
  return `\n\n[CREW] You are ${CREW[selfRole].name}. Your colleagues:\n${others}\n` +
    `If a task is mainly a colleague's specialty, do not silently absorb, attempt, or refuse it. Say so plainly and name the right colleague, e.g. "This isn't my area — Writer handles content shaping, route it to them." Then hand off cleanly.`;
}

/**
 * Run one role on a prompt → full text. Calls llm-provider.chat() DIRECTLY with
 * only the role's system prompt + bound model. We deliberately do NOT use
 * runAgent here: runAgent force-prepends the PURPCLAW/Quill identity system
 * prompt (buildSystemPrompt has no persona override), which made every crew
 * agent answer as "Quill" instead of as Analyst/Writer/Marketer. The content
 * pipeline is pure generation (no tools), so the direct call is correct, keeps
 * each agent's true identity, and skips the tool-loop + idle-engine overhead.
 */
// Detect degenerate output (repetition loops / near-empty) so a flaky model
// can't poison a downstream stage. True = output is junk.
function isDegenerate(text) {
  const t = String(text || '').trim();
  if (t.length < 12) return true;
  const words = t.toLowerCase().match(/\b[\w']+\b/g) || [];
  if (words.length >= 30) {
    const uniqueRatio = new Set(words).size / words.length;
    if (uniqueRatio < 0.18) return true; // e.g. same phrase repeated to fill tokens
  }
  // any 6+ word phrase repeated 4+ times
  const m = t.match(/(.{20,}?)\1{3,}/s);
  return Boolean(m);
}

async function _callModel(cfg, system, prompt, opts, model) {
  const r = await llm.chat(
    [{ role: 'system', content: system }, { role: 'user', content: prompt }],
    { provider: cfg.provider, model, maxTokens: opts.maxTokens || 1200, temperature: opts.temperature ?? 0.6 }
  );
  if (r && r.error) throw new Error(`${cfg.name} (${cfg.provider}/${model}): ${r.error}`);
  const raw = (r && r.content ? String(r.content) : '').trim();
  const stripped = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  return stripped || raw;
}

// Reliable backstop = the native MiniMax SUB (api.minimax.io, paid key) — far
// steadier than NIM free-tier, which repetition-loops / ECONNRESETs under load.
const FALLBACK_PROVIDER = process.env.CREW_FALLBACK_PROVIDER || 'minimax';
const FALLBACK_MODEL = process.env.CREW_FALLBACK_MODEL || 'MiniMax-M2.7';

async function runRole(role, prompt, opts = {}) {
  const cfg = CREW[role] || CREW.orchestrator;
  if (!llm) throw new Error('llm-provider unavailable');
  const system = cfg.system + teamBrief(role);

  // Attempt 1: the role's bound model.
  let out = null, firstErr = null;
  try { out = await _callModel(cfg, system, prompt, opts, cfg.model); }
  catch (e) { firstErr = e; }

  // Buttery guard: if the bound model errored OR degenerated (repetition loop /
  // empty), fall back to the native MiniMax sub so a flaky NIM model never
  // poisons or fails a stage. Orchestrator is already on the sub — skip.
  if ((firstErr || isDegenerate(out)) && cfg.provider !== FALLBACK_PROVIDER) {
    const fbCfg = { ...cfg, provider: FALLBACK_PROVIDER };
    out = await _callModel(fbCfg, system, prompt, opts, FALLBACK_MODEL);
  } else if (firstErr) {
    throw firstErr; // already on the fallback provider and it failed
  }
  return out;
}

/**
 * Phase 7 content pipeline: Analyst → Writer → Marketer (research → write →
 * promote). Tracked as ONE parent pipeline job in the registry.
 *   onStage(stageName, role, text) is called after each stage (for streaming UIs).
 */
async function runContentPipeline(topic, { onStage } = {}) {
  const job = registry && registry.start({ pipeline: 'content-pipeline', project: 'PURPCLAW', lane: 'Orchestrator', trigger: 'pipeline', risk: 'low', inputs: { topic } });
  const jid = job && job.job_id;
  const out = { topic, stages: {} };
  try {
    if (jid) registry.step(jid, 'Analyst: research');
    out.stages.research = await runRole('analyst', `Research this topic for a content piece. Give key findings, angles, and sources:\n${topic}`, { trigger: 'pipeline' });
    if (onStage) onStage('research', 'analyst', out.stages.research);

    if (jid) registry.step(jid, 'Writer: draft');
    out.stages.content = await runRole('writer', `Write a tight, structured blog post from these research findings.\nTopic: ${topic}\n\nFindings:\n${out.stages.research}`, { trigger: 'pipeline', maxTokens: 1800 });
    if (onStage) onStage('content', 'writer', out.stages.content);

    if (jid) registry.step(jid, 'Marketer: social + strategy');
    out.stages.social = await runRole('marketer', `Create 5 social posts from this content (mix platforms):\n${out.stages.content}`, { trigger: 'pipeline' });
    out.stages.strategy = await runRole('marketer', `Build a concrete promotion + monetization plan (channels, sequence) for this content:\n${out.stages.content}`, { trigger: 'pipeline' });
    if (onStage) onStage('promotion', 'marketer', out.stages.social + '\n\n' + out.stages.strategy);

    if (jid) registry.finish(jid, { status: 'complete', claim: `content pipeline for "${String(topic).slice(0, 60)}"`, proof: { result: 'pass', detail: `${Object.keys(out.stages).length} stages` }, output: 'crew content pipeline' });
    out.ok = true;
    return out;
  } catch (e) {
    if (jid) registry.finish(jid, { status: 'failed', claim: e.message });
    out.ok = false; out.error = e.message;
    return out;
  }
}

function listCrew() { return ROLES.map(r => ({ role: r, ...CREW[r], system: undefined })); }

module.exports = { CREW, ROLES, ROUTING, SLASH, route, runRole, runContentPipeline, teamBrief, listCrew };
