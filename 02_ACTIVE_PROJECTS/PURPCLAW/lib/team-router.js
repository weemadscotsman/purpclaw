'use strict';

/**
 * lib/team-router.js — The 4-role content team router
 *
 * Prompts 5, 6, 7 unified into one module. Owns:
 *   - Slash commands: /analyst /writer /marketer /coder /pipeline
 *   - Natural-language routing table: 3-5 phrases per role
 *   - Shared team awareness: every agent knows the team structure
 *   - Supervisor pipeline: Analyst -> Writer -> Marketer
 *   - Fallback: when unsure, ask Eddie to clarify (or route to orchestrator)
 *
 * Eddie is the owner. Orchestrator is the top-level control layer.
 * Four specialist roles. Each role maps to a tier of agent personas.
 *
 * Wiring: this module is required by both the agent loop (for slash-command
 * detection) and the orchestrator (for pipeline orchestration).
 */

const path = require('path');

// ──────────────────────────────────────────────────────────────────────
// TEAM STRUCTURE (Prompt 6 — Shared Team Awareness)
// ──────────────────────────────────────────────────────────────────────

const TEAM = {
  owner:        'Eddie',  // The user. Directs any agent.
  orchestrator: 'system-wide coordinator, top-level control, Telegram',
  analyst:      'research, trend intelligence, sourcing',
  writer:       'writing, editing, content shaping',
  marketer:     'marketing strategy, growth, campaigns, monetization',
  coder:        'development, automation, integrations, technical systems',
};

const ROLE_DESCRIPTIONS = {
  analyst:  'Research & intelligence — surfaces facts, prior art, trends, sources, data.',
  writer:   'Writing & content — drafts, edits, shapes voice, structures for the audience.',
  marketer: 'Marketing & growth — strategy, positioning, channels, campaigns, monetization.',
  coder:    'Engineering & integration — builds code, automates, wires systems, ships features.',
};

// ──────────────────────────────────────────────────────────────────────
// ROUTING TABLE (Prompt 5)
// Each role gets 3-5 example natural-language phrases
// ──────────────────────────────────────────────────────────────────────

const ROUTING_TABLE = {
  analyst: {
    role: 'analyst',
    description: ROLE_DESCRIPTIONS.analyst,
    examples: [
      'research [topic]',
      'what does the market say about [topic]?',
      'find prior art for [topic]',
      'analyze [subject]',
      'audit [system/process]',
      'what are the trends in [domain]?',
      'source [data/signal] for [decision]',
    ],
    // Maps to existing agent tower roles
    tower_intents: ['research', 'analyze', 'audit', 'data', 'web'],
    suggested_agents: ['spider', 'duck', 'raven', 'turtle', 'octopus', 'hawk'],
  },
  writer: {
    role: 'writer',
    description: ROLE_DESCRIPTIONS.writer,
    examples: [
      'write [content] about [topic]',
      'draft a [blog/email/thread] on [topic]',
      'edit [existing content]',
      'rewrite [this] for [audience]',
      'shape [rough notes] into [final piece]',
      'voice the [content] in [tone]',
    ],
    tower_intents: ['content', 'media', 'design'],
    suggested_agents: ['phoenix', 'parrot', 'panda', 'goose', 'duck'],
  },
  marketer: {
    role: 'marketer',
    description: ROLE_DESCRIPTIONS.marketer,
    examples: [
      'market [product/content]',
      'grow [audience] for [product]',
      'promote [announcement] on [channels]',
      'campaign for [launch]',
      'position [offering] vs [alternatives]',
      'monetize [asset/audience]',
      'social posts for [content]',
    ],
    tower_intents: ['media', 'content', 'design'],
    suggested_agents: ['goose', 'parrot', 'panda', 'phoenix'],
  },
  coder: {
    role: 'coder',
    description: ROLE_DESCRIPTIONS.coder,
    examples: [
      'build [feature/system]',
      'fix [bug]',
      'debug [error]',
      'refactor [code]',
      'deploy [service]',
      'integrate [API/tool]',
      'automate [task]',
      'optimize [system]',
    ],
    tower_intents: ['build', 'code', 'fix', 'debug', 'refactor', 'deploy', 'optimize', 'system'],
    suggested_agents: ['robot', 'bee', 'dragon', 'cactus', 'rabbit', 'chonk', 'fox'],
  },
};

// ──────────────────────────────────────────────────────────────────────
// SLASH-COMMAND SHORTCUTS
// Syntax: /<role> <topic> [details]
// ──────────────────────────────────────────────────────────────────────

const SLASH_COMMANDS = {
  '/analyst':   { role: 'analyst',  usage: '/analyst <topic> [details]' },
  '/writer':    { role: 'writer',   usage: '/writer <topic> [details]' },
  '/marketer':  { role: 'marketer', usage: '/marketer <topic> [details]' },
  '/coder':     { role: 'coder',    usage: '/coder <topic> [details]' },
  '/pipeline':  { role: 'pipeline', usage: '/pipeline <topic>   # runs full Analyst->Writer->Marketer flow' },
  '/who':       { role: 'team',     usage: '/who              # show the team + what each handles' },
};

const TEAM_RE = /^\s*(\/analyst|\/writer|\/marketer|\/coder|\/pipeline|\/who)\b\s*(.*)$/i;

// ──────────────────────────────────────────────────────────────────────
// NATURAL-LANGUAGE ROUTER
// Returns { role, target, urgent, confidence }
// ──────────────────────────────────────────────────────────────────────

// Build a flat list of patterns from the routing table.
const NL_PATTERNS = [];
for (const [role, info] of Object.entries(ROUTING_TABLE)) {
  for (const ex of info.examples) {
    // Capture the part inside [...] as the target
    const placeholder = /\[([^\]]+)\]/g;
    const stem = ex.replace(placeholder, '(.+)');
    NL_PATTERNS.push({ role, regex: new RegExp('^\\s*' + stem + '\\s*$', 'i'), example: ex });
  }
}

function parseSlashCommand(text) {
  const m = String(text || '').match(TEAM_RE);
  if (!m) return null;
  const cmd = m[1].toLowerCase();
  const args = m[2].trim();
  if (cmd === '/who') {
    return { role: 'team', command: '/who', args, intent: 'team-overview' };
  }
  if (cmd === '/pipeline') {
    return { role: 'pipeline', command: '/pipeline', args, intent: 'full-pipeline', topic: args };
  }
  return { role: SLASH_COMMANDS[cmd].role, command: cmd, args, intent: 'role-task', topic: args };
}

function parseNaturalLanguage(text) {
  // Try slash first.
  const slash = parseSlashCommand(text);
  if (slash) return slash;

  // Otherwise try the NL patterns.
  for (const p of NL_PATTERNS) {
    const m = String(text || '').match(p.regex);
    if (m) {
      return {
        role: p.role,
        command: null,
        args: text.trim(),
        intent: 'nl-task',
        topic: m.slice(1).join(' ').trim(),
      };
    }
  }

  return null;
}

// ──────────────────────────────────────────────────────────────────────
// FALLBACK (Prompt 5 — what happens when unsure)
// ──────────────────────────────────────────────────────────────────────

function fallbackReply(userText) {
  return {
    role: null,
    command: null,
    args: userText,
    intent: 'fallback',
    topic: userText,
    question: "I'm not sure which of my colleagues should handle this. " +
              "Please tell me which one to use:\n" +
              "  /analyst   — research, trends, sourcing, analysis\n" +
              "  /writer    — writing, editing, content shaping\n" +
              "  /marketer  — marketing, growth, campaigns, monetization\n" +
              "  /coder     — development, automation, integrations\n" +
              "  /pipeline  — full Analyst -> Writer -> Marketer flow\n\n" +
              "Or describe what you want and I'll route by keywords. " +
              "You can also just /who to see the full team.",
  };
}

function route(userText) {
  const parsed = parseNaturalLanguage(userText);
  if (!parsed) return fallbackReply(userText);
  return parsed;
}

// ──────────────────────────────────────────────────────────────────────
// SUPERVISOR PIPELINE (Prompt 7)
// Analyst -> Writer -> Marketer, with each stage handing off the artifact
// to the next.
// ──────────────────────────────────────────────────────────────────────

const PIPELINE_STAGES = [
  {
    role: 'analyst',
    label: 'Research',
    prompt: (topic) => `You are the Analyst on a 4-role content team. Topic: "${topic}".\n\n` +
      `Your job:\n` +
      `1. Research the topic — facts, prior art, current trends, sources, data points.\n` +
      `2. Surface 3-5 key insights the Writer can build a narrative around.\n` +
      `3. Cite 2-3 sources (with URLs where possible).\n` +
      `4. Hand off to the Writer with a clear "research brief".\n\n` +
      `Output a structured brief with: topic, audience, 3-5 key insights, supporting data, sources, suggested angle.`,
    expected_outputs: ['brief', 'insights', 'sources', 'angle'],
  },
  {
    role: 'writer',
    label: 'Write',
    prompt: (topic, prior) => `You are the Writer on a 4-role content team. Topic: "${topic}".\n\n` +
      `You just received this brief from the Analyst:\n\n${prior}\n\n` +
      `Your job:\n` +
      `1. Write the content (blog post / article / email / thread — your call based on the brief).\n` +
      `2. Use a clear voice, tight structure, scannable sections.\n` +
      `3. Hand off to the Marketer with the final content + a 1-line summary.\n\n` +
      `Output the full content + a 1-line TL;DR + 3 suggested hooks for social posts.`,
    expected_outputs: ['content', 'tldr', 'hooks'],
  },
  {
    role: 'marketer',
    label: 'Market',
    prompt: (topic, prior) => `You are the Marketer on a 4-role content team. Topic: "${topic}".\n\n` +
      `You just received this final content from the Writer:\n\n${prior}\n\n` +
      `Your job:\n` +
      `1. Create social media posts from the content (X thread, LinkedIn post, IG carousel, newsletter snippet).\n` +
      `2. Build the marketing/promotion strategy — channels, timing, hooks, target audience, CTA.\n` +
      `3. Deliver the final promotion plan.\n\n` +
      `Output:\n` +
      `- social_x: a 5-7 tweet thread\n` +
      `- social_linkedin: a long-form post\n` +
      `- social_newsletter: a 200-word snippet\n` +
      `- strategy: channels, launch window, target audience, success metrics\n` +
      `- cta: the single call to action`,
    expected_outputs: ['social_x', 'social_linkedin', 'social_newsletter', 'strategy', 'cta'],
  },
];

/**
 * Run the full pipeline. Each stage uses a fresh NIM call (the agent loop
 * has 4 NVIDIA keys for ~160 RPM). The artifact from each stage is passed
 * as prior to the next. This is the supervisor flow.
 *
 * @param topic - the topic the user wants researched -> written -> marketed
 * @param opts  - { provider: 'minimax' | 'nvidia', model: 'MiniMax-M3' | '...', run: function to call an LLM }
 *                run({systemPrompt, userPrompt}) returns string
 * @returns { topic, stages: [{role, label, output, durationMs}], finalPlan: ... }
 */
async function runPipeline(topic, opts) {
  const run = opts.run;
  if (typeof run !== 'function') {
    throw new Error('runPipeline requires opts.run({systemPrompt, userPrompt}) -> string');
  }
  const log = opts.log || ((s) => console.log(s));
  const t0 = Date.now();
  const stages = [];
  let prior = '';
  for (let i = 0; i < PIPELINE_STAGES.length; i++) {
    const stage = PIPELINE_STAGES[i];
    const ts = Date.now();
    log(`[pipeline ${i + 1}/${PIPELINE_STAGES.length}] role=${stage.role} label=${stage.label} topic="${topic}"`);
    const userPrompt = stage.prompt(topic, prior);
    const systemPrompt = `You are ${stage.role} on a 4-role content team. Owner: Eddie. ` +
      `Colleagues: analyst (research), writer (writing), marketer (marketing), coder (engineering). ` +
      `Always cite, be specific, and produce a clean handoff to the next stage.`;
    const out = await run({ systemPrompt, userPrompt, role: stage.role, label: stage.label, topic });
    const dur = Date.now() - ts;
    stages.push({ role: stage.role, label: stage.label, output: out, durationMs: dur });
    prior = out;
    log(`[pipeline ${i + 1}/${PIPELINE_STAGES.length}] done in ${dur}ms (${out.length} chars)`);
  }
  return {
    topic,
    totalMs: Date.now() - t0,
    stages,
    finalPlan: stages[stages.length - 1].output,
  };
}

// ──────────────────────────────────────────────────────────────────────
// TEAM OVERVIEW
// ──────────────────────────────────────────────────────────────────────

function teamOverview() {
  const lines = [
    'TEAM ROSTER',
    '===========',
    '',
    `Owner:        ${TEAM.owner} (you — direct any agent at any time)`,
    `Orchestrator: ${TEAM.orchestrator}`,
    '',
    'Specialist roles:',
    `  /analyst   — ${TEAM.analyst}`,
    `  /writer    — ${TEAM.writer}`,
    `  /marketer  — ${TEAM.marketer}`,
    `  /coder     — ${TEAM.coder}`,
    '',
    'Slash commands:',
    `  /analyst <topic>   — ${ROUTING_TABLE.analyst.description}`,
    `  /writer  <topic>   — ${ROUTING_TABLE.writer.description}`,
    `  /marketer <topic>  — ${ROUTING_TABLE.marketer.description}`,
    `  /coder   <topic>   — ${ROUTING_TABLE.coder.description}`,
    `  /pipeline <topic>  — runs Analyst -> Writer -> Marketer supervisor flow`,
    `  /who                — print this team overview`,
    '',
    'Example natural-language routes:',
  ];
  for (const [role, info] of Object.entries(ROUTING_TABLE)) {
    for (const ex of info.examples.slice(0, 3)) {
      lines.push(`  "${ex}"  ->  /${role}`);
    }
    lines.push('');
  }
  lines.push('If a task is outside my area, I will tell you and name the right colleague.');
  return lines.join('\n');
}

module.exports = {
  TEAM,
  ROLE_DESCRIPTIONS,
  ROUTING_TABLE,
  SLASH_COMMANDS,
  NL_PATTERNS,
  PIPELINE_STAGES,
  parseSlashCommand,
  parseNaturalLanguage,
  fallbackReply,
  route,
  runPipeline,
  teamOverview,
};
