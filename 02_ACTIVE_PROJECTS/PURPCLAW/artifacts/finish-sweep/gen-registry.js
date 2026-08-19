'use strict';
/**
 * One-time generator for lib/cli/registry.js (Phase 2 scaffolding tool).
 * Inputs: artifacts/finish-sweep/switch-map.json (extracted from the live
 * switch), desc-prefill.json (parsed from the previous help output), and the
 * curated tables below. Output is committed source — this script is not.
 */
const fs = require('fs');
const path = require('path');
const PC = path.join(__dirname, '..', '..');

const map = JSON.parse(fs.readFileSync(path.join(__dirname, 'switch-map.json'), 'utf8'));
const prefill = JSON.parse(fs.readFileSync(path.join(__dirname, 'desc-prefill.json'), 'utf8'));

// Curated metadata: category + description for commands the old help missed,
// plus json flags for read commands.
const CURATED = {
  restart: ['lifecycle', 'Restart the PM2 stack (safe lifecycle)', 0],
  run: ['chat', 'Run a natural-language task through the agent loop', 0],
  plan: ['chat', 'Plan a goal: probe registry + parity, scaffold next steps', 1],
  clear: ['chat', 'Clear transient journals + build cache (durable state kept)', 0],
  compact: ['chat', 'Prune old JSONL journals, preserve durable files', 0],
  resume: ['chat', 'Resume the last saved session', 0],
  context: ['chat', 'Show the current session context window', 1],
  approve: ['governance', 'Approve a pending gated action', 0],
  reject: ['governance', 'Reject a pending gated action', 0],
  policy: ['governance', 'List / edit permission policies', 1],
  rollback: ['governance', 'Roll back to a checkpoint', 0],
  checkpoint: ['governance', 'Create or list checkpoints', 1],
  certify: ['governance', 'Run / report certification gates', 1],
  cryosleep: ['governance', 'Sleep / wake: bundle state for pause + resume', 1],
  steering: ['governance', 'Inspect the steering resolver + capsules', 1],
  constitution: ['governance', 'Verify the governing contract files', 1],
  audit: ['governance', 'Stack audit: integrity + wiring', 1],
  registry: ['tools', 'Skill/package registry: search, install, list', 1],
  install: ['tools', 'Install a skill or package', 0],
  search: ['tools', 'Search the local registry (skills, agents)', 1],
  pool: ['systems', 'Agent pool status', 1],
  tick: ['systems', 'Advance the orchestrator one tick', 0],
  spaghetti: ['systems', 'Dependency-graph visual of the stack', 0],
  browser: ['tools', 'Browser automation surface', 0],
  cognition: ['cognition', 'Cognitive spine: memory, rules, diagnostics', 1],
  code: ['tools', 'Code intelligence (github / repo ops)', 0],
  lora: ['training', 'LoRA train / list / merge local models', 0],
  model: ['providers', 'Hot-swap provider/model, list, test, serve GGUF', 1],
  models: ['providers', 'Alias for model list', 1],
  llm: ['providers', 'Provider routing table + health', 1],
  bench: ['providers', 'Benchmark providers (latency / quality)', 1],
  memory: ['cognition', 'Memory layers: recall, forget, stats', 1],
  parity: ['systems', 'Capability parity dashboard (6 tiles)', 1],
  soulmemory: ['cognition', 'Soul memory contract inspection', 1],
  'soul-memory': ['cognition', 'Soul memory contract inspection', 1],
  crossreview: ['dev', 'Cross-family code review gate', 0],
  'cross-review': ['dev', 'Cross-family code review gate', 0],
  forge: ['agents', 'Forge: build skills/agents from prompts', 0],
  'skill-forge': ['agents', 'Forge skills from a spec', 0],
  subagent: ['agents', 'Dispatch a bounded sub-agent task', 0],
  team: ['agents', 'Form / manage persistent agent teams', 1],
  'team-roster': ['agents', 'Team roster: roles, history, persistence', 1],
  websearch: ['research', 'Web search via the active provider', 1],
  forgecode: ['dev', 'Forge Code: guided code generation lane', 0],
  sessionlog: ['chat', 'Session log viewer', 1],
  hooks: ['governance', 'Lifecycle hooks registry + wiring', 1],
  'skill-discovery': ['tools', 'Discover skills for the current task', 1],
  pr: ['dev', 'Pull-request helper (branch, diff, message)', 0],
  release: ['dev', 'Release artifact build / show (signed)', 1],
  skillgraph: ['tools', 'Skill dependency graph', 1],
  look: ['vision', 'Screen capture + vision describe', 0],
  voice: ['voice', 'Voice loop: STT, TTS, personas', 0],
  logs: ['systems', 'Tail service logs (PM2 aware)', 0],
  show: ['systems', 'Full-stack status board (alias: stack)', 1],
  stack: ['systems', 'Full-stack status board (alias: show)', 1],
  whoami: ['identity', 'Identity + capability self-description', 1],
  health: ['systems', 'Core service health probes', 1],
  identity: ['identity', 'Identity registry inspection', 1],
  embeddings: ['cognition', 'Embeddings index stats / query', 1],
  embed: ['cognition', 'Embed a file or text into the index', 0],
  teleport: ['workspace', 'Jump between project workspaces', 0],
  'autofix-pr': ['dev', 'Auto-fix a PR from review comments', 0],
  workers: ['systems', 'Worker lane status', 1],
  automate: ['tools', 'ATBS automation surface', 0],
  setup: ['lifecycle', 'Interactive first-run wizard', 0],
  tour: ['workspace', 'Guided tour of the stack', 0],
  commit: ['dev', 'Guided commit with context', 0],
  pocket: ['workspace', 'Pocket OS: USB-portable mode, vault, spend', 1],
  'safe-start': ['lifecycle', 'One-at-a-time PM2 boot with cascade guard', 0],
  evolve: ['governance', 'Governed self-evolution proposals', 1],
  'safe-stop': ['lifecycle', 'Graceful full-stack shutdown', 0],
  services: ['systems', 'Service registry + port map', 1],
  training: ['training', 'Training feedback loop capture', 1],
  idle: ['systems', 'Idle engine: cycles, dataset, LoRA', 1],
  vector: ['cognition', 'Vector store benchmark', 1],
  dream: ['cognition', 'Auto-dream: memory consolidation run', 1],
  profiles: ['agents', 'Agent persona profiles', 1],
  agents: ['agents', 'Agent tower registry + status', 1],
  workflows: ['agents', 'Workflow registry', 1],
  queue: ['systems', 'Orchestrator queue depth + jobs', 1],
  jobs: ['systems', 'Job list / inspect', 1],
  introspect: ['systems', 'Live process introspection', 1],
  mochi: ['workspace', 'Mochi status bars config', 0],
  bars: ['workspace', 'Toggle status bars wrapping', 0],
  config: ['systems', 'Config get / set / list', 1],
  chat: ['chat', 'Interactive chat REPL (slash commands)', 0],
  tui: ['chat', 'Full-screen TUI', 0],
  ui: ['chat', 'Alias for tui', 0],
  init: ['lifecycle', 'Audit env, keys, and services', 0],
  start: ['lifecycle', 'Boot the harness (bounded profile)', 0],
  stop: ['lifecycle', 'Shut down gracefully', 0],
  doctor: ['systems', 'One-command system health verification', 1],
  status: ['systems', 'Registry-driven service dashboard', 1],
  onboard: ['lifecycle', 'Guided onboarding flow', 0],
  bughunt: ['dev', 'Scan the repo for defect patterns', 1],
  'ctx-viz': ['dev', 'Context window visualizer', 1],
  gc: ['tools', 'Garbage-collect caches + orphaned state', 0],
  architecture: ['workspace', 'Architecture map + concepts', 0],
  smoke: ['systems', 'Smoke-test the live services', 1],
  overview: ['workspace', 'What-is-purpclaw overview', 0],
  evolve0: ['governance', '', 0],
  donor: ['governance', 'Donor archaeology: harvest behavioural laws', 1],
};

// Orphan modules promoted to registry dispatch (no switch case exists).
const WIRED_ORPHANS = {
  council: ['governance', 'Convene the council on a decision', 0],
  autoresearch: ['research', 'Auto-research orchestrator front door', 1],
  mcp: ['tools', 'MCP server registry + health', 1],
  remote: ['systems', 'Remote session transport', 0],
  next: ['workflow', 'Discover the live project phase + next step', 1],
  workflow: ['workflow', 'Workflow engine: run / list / inspect', 1],
  'registry-audit': ['governance', 'Audit registry integrity', 1],
  feature: ['dev', 'Feature verify / track', 1],
  hivemind: ['agents', 'Hivemind multi-agent consensus run', 1],
  vault: ['workspace', 'AES-256-GCM encrypted vault', 0],
  secrets: ['workspace', 'Secrets management surface', 0],
  provider: ['providers', 'Provider config + keys health (no values)', 1],
  stats: ['systems', 'Usage + telemetry statistics', 1],
  telemetry: ['systems', 'Local telemetry loop controls', 1],
  weather: ['workspace', 'Operational weather report', 1],
  completion: ['workspace', 'Emit shell completion script (bash/zsh/powershell)', 0],
  // ── Second wiring batch (2026-08-18): emptying the command-module graveyard ──
  awaken: ['lifecycle', 'Wake ritual: boot stack into work / watch mode', 0],
  'apply-diff': ['dev', 'Parse and apply a unified diff (stdin or file)', 0],
  buddy: ['workspace', 'Buddy pairing surface', 0],
  business: ['workspace', 'Business operations + Twilio surface', 1],
  capabilities: ['systems', 'Capability report (built vs running vs integrated)', 1],
  crew: ['agents', 'Crew roster + model-per-agent routing preview', 1],
  deploy: ['dev', 'One-command VPS deployment via Docker', 0],
  app: ['workspace', 'WebUI desktop launcher status/control', 1],
  drift: ['systems', 'Drift watcher: config vs reality, optional --fix', 1],
  eval: ['training', 'Run an eval dataset through the stack', 1],
  feedback: ['training', 'Personal model feedback submit/status/list', 1],
  grow: ['agents', 'Grow the agent pool / skills garden', 1],
  harness: ['agents', 'Autonomous productivity harness control', 1],
  harvest: ['research', 'Data harvester: crawl, fingerprint, classify, index', 1],
  'init-project': ['dev', 'Scaffold a new project from templates', 0],
  intelligence: ['systems', 'Full intelligence report (health + capability)', 1],
  liveforge: ['agents', 'Liveforge run control', 1],
  marketplace: ['tools', 'Skill/agent package marketplace', 1],
  mycelium: ['cognition', 'Mycelium knowledge-network queries', 1],
  open: ['workspace', 'Explicit UI launcher (web, tui, mission)', 0],
  oracle: ['governance', 'Oracle forecast for decisions', 1],
  permissions: ['governance', 'Interactive permissions manager', 0],
  plugin: ['tools', 'Plugin list/enable/disable (Codex parity)', 1],
  remotion: ['dev', 'Remotion video stack control surface', 1],
  repomap: ['dev', 'Repository map generator', 1],
  personas: ['agents', 'Tower swarm vs disk persona audit', 1],
  sandbox: ['governance', 'Sandbox lifecycle management (Docker/local)', 1],
  schedule: ['systems', 'PurpClaw-native cron scheduling', 1],
  spinebus: ['cognition', 'Spine bus state + queries', 1],
  thringlets: ['agents', 'Thringlet colony lens + interaction', 1],
  watch: ['dev', 'File system watcher CLI', 1],
  worktree: ['dev', 'Git worktree management', 1],
};

const CATEGORY_ORDER = [
  'lifecycle', 'chat', 'workflow', 'governance', 'agents', 'cognition',
  'providers', 'tools', 'research', 'dev', 'voice', 'vision', 'training',
  'systems', 'identity', 'workspace',
];
const CATEGORY_TITLES = {
  lifecycle: 'LIFECYCLE', chat: 'CHAT & SESSIONS', workflow: 'WORKFLOW',
  governance: 'GOVERNANCE & SAFETY', agents: 'AGENTS & TEAMS',
  cognition: 'COGNITION & MEMORY', providers: 'PROVIDERS & MODELS',
  tools: 'TOOLS & SKILLS', research: 'RESEARCH', dev: 'DEV & RELEASE',
  voice: 'VOICE', vision: 'VISION', training: 'TRAINING', systems: 'SYSTEMS & HEALTH',
  identity: 'IDENTITY', workspace: 'WORKSPACE & EXTRAS',
};

const entries = [];
const seen = new Set();
for (const c of map) {
  if (!c.primary) continue;
  if (seen.has(c.name)) continue;
  seen.add(c.name);
  const cur = CURATED[c.name] || CURATED[c.name.replace(/-/g, '')];
  const desc = (cur && cur[1]) || prefill[c.name] || '';
  entries.push({
    name: c.name,
    aliases: map.filter(x => !x.primary && x.name !== c.name && x.module === c.module && map.find(y => y.name === x.name) && sameGroup(map, x.name, c.name)).map(x => x.name),
    module: c.module || null,
    category: cur ? cur[0] : 'workspace',
    description: desc,
    json: cur ? !!cur[2] : false,
    legacyFn: !c.module,
    inSwitch: true,
  });
}
function sameGroup(map, alias, primary) {
  // alias belongs to primary's group if adjacent in source order and primary-flagged
  const i = map.findIndex(x => x.name === alias);
  // walk back to the primary of the group
  for (let j = i - 1; j >= 0; j--) {
    if (map[j].primary && (!map[j].module || map[j].module === map[i].module)) return map[j].name === primary;
    if (map[j].primary) return map[j].name === primary;
  }
  return false;
}

// recompute aliases cleanly: group by target sequence from source order
const aliases = {};
{ 
  const groups = []; let cur = null;
  for (const c of map) {
    if (c.primary) { cur = { primary: c.name, members: [] }; groups.push(cur); }
    else if (cur) cur.members.push(c.name);
  }
  for (const g of groups) aliases[g.primary] = g.members;
}
for (const e of entries) e.aliases = aliases[e.name] || [];

// command name -> module name when they differ
const MODULE_OVERRIDE = { personas: 'roster', app: 'desktop' };

for (const [name, [category, description, json]] of Object.entries(WIRED_ORPHANS)) {
  if (seen.has(name)) continue; // already dispatched; do not shadow
  seen.add(name);
  entries.push({ name, aliases: [], module: MODULE_OVERRIDE[name] || name, category, description, json: !!json, legacyFn: false, inSwitch: false });
}

// pre-dispatch commands: handled before the switch in bin/purpclaw.js;
// registry identity only (no module, never reaches the dispatcher).
const PRE_DISPATCH = {
  help:    ['workspace', 'Show help (all commands, or one command)', 0],
  version: ['workspace', 'Print the purpclaw version', 0],
};
for (const [name, [category, description, json]] of Object.entries(PRE_DISPATCH)) {
  entries.push({ name, aliases: [], module: null, category, description, json: !!json, legacyFn: false, inSwitch: false });
}
// explicit extra: offline parity alias
entries.push({ name: 'parity-offline', aliases: [], module: 'parity', category: 'systems', description: 'Pure-Node parity report (no Python/TUI needed)', json: true, legacyFn: false, inSwitch: false });

entries.sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) || a.name.localeCompare(b.name));

const noDesc = entries.filter(e => !e.description).map(e => e.name);
if (noDesc.length) console.error('WARNING — no description for:', noDesc.join(' '));

const file = `'use strict';
/**
 * lib/cli/registry.js — the canonical command registry.
 *
 * Single source of truth for command identity, aliases, module routing,
 * categories (help sections), JSON support, and shell completion. The
 * dispatcher in bin/purpclaw.js consults this registry FIRST (dual-dispatch
 * transition): module-routed commands execute via lib/commands/<module>.js,
 * legacyFn commands still execute in the historical switch until migrated.
 * Unknown commands never fall through to task dispatch — they error with a
 * did-you-mean suggestion and exit 2.
 *
 * Generated initially from the live switch (2026-08-18); hand-curated since.
 * Do not add commands to the switch without adding them here.
 */

const CATEGORY_ORDER = ${JSON.stringify(CATEGORY_ORDER)};
const CATEGORY_TITLES = ${JSON.stringify(CATEGORY_TITLES, null, 2)};

const COMMANDS = ${JSON.stringify(entries, null, 2)};

function index() {
  const byName = new Map();
  for (const e of COMMANDS) {
    byName.set(e.name, e);
    for (const a of e.aliases || []) byName.set(a, e);
  }
  return byName;
}
const BY_NAME = index();

function find(name) {
  return BY_NAME.get(String(name || '').toLowerCase()) || null;
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

function suggest(input) {
  const q = String(input || '').toLowerCase();
  if (!q) return [];
  const scored = [];
  for (const e of COMMANDS) {
    for (const cand of [e.name, ...(e.aliases || [])]) {
      let score = levenshtein(q, cand);
      if (cand.startsWith(q)) score -= 2;          // strong prefix signal
      if (score <= Math.max(1, Math.floor(cand.length / 3))) scored.push({ cand, score });
    }
  }
  scored.sort((a, b) => a.score - b.score);
  return [...new Set(scored.map(s => s.cand))].slice(0, 3);
}

function commands() { return COMMANDS; }
function categories() { return CATEGORY_ORDER.map(c => ({ key: c, title: CATEGORY_TITLES[c] })); }

module.exports = { commands, categories, find, suggest, CATEGORY_ORDER, CATEGORY_TITLES };
`;

fs.writeFileSync(path.join(PC, 'lib', 'cli', 'registry.js'), file);
console.log('registry.js written:', entries.length, 'commands,', entries.filter(e=>e.module).length, 'module-routed,', new Set(entries.map(e=>e.category)).size, 'categories');
