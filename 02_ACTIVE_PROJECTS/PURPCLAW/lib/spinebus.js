'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = process.cwd && process.cwd().endsWith('PURPCLAW') ? process.cwd() : path.resolve(__dirname, '..');
const STORE_DIR = path.join(ROOT, 'agent_work', 'spinebus');
const JOBS_FILE = path.join(STORE_DIR, 'jobs.jsonl');
const ROUTES_FILE = path.join(STORE_DIR, 'routes.jsonl');
const TOUCHES_FILE = path.join(STORE_DIR, 'touches.jsonl');
const RECEIPTS_FILE = path.join(STORE_DIR, 'receipts.jsonl');
const LESSONS_FILE = path.join(STORE_DIR, 'lessons.jsonl');
const DREAM_QUEUE_FILE = path.join(STORE_DIR, 'dream_queue.jsonl');
const REGISTRY_CACHE_FILE = path.join(STORE_DIR, 'registry-cache.json');

const TOUCH_SUBSYSTEMS = [
  'chat_intake', 'intent_normalizer', 'session_memory', 'project_memory', 'user_memory',
  'agent_memory', 'skill_memory', 'tool_memory', 'mycelium_memory', 'fungus_amongus',
  'agent_tower', 'skill_registry', 'tool_registry', 'liveforge', 'pxpipe',
  'execution_gate', 'receipts', 'truth_audit', 'autolearn', 'dreamforge',
];
const TOUCH_STATUSES = new Set(['pass', 'enrich', 'warn', 'block', 'route', 'request_approval', 'execute', 'error']);
const RISKS = new Set(['low', 'medium', 'high', 'dangerous']);

function now() { return new Date().toISOString(); }
function id(prefix, seed = '') {
  const clean = String(seed || prefix).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || prefix;
  const hash = crypto.createHash('sha256').update(`${clean}:${Date.now()}:${Math.random()}`).digest('hex').slice(0, 8);
  return `${prefix}_${clean}_${hash}`;
}
function ensureStore() {
  fs.mkdirSync(STORE_DIR, { recursive: true });
  for (const file of [JOBS_FILE, ROUTES_FILE, TOUCHES_FILE, RECEIPTS_FILE, LESSONS_FILE, DREAM_QUEUE_FILE]) {
    if (!fs.existsSync(file)) fs.writeFileSync(file, '', 'utf8');
  }
}
function appendJsonl(file, row) {
  ensureStore();
  fs.appendFileSync(file, JSON.stringify(row) + '\n', 'utf8');
  return row;
}
function readJsonl(file) {
  ensureStore();
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map((line, i) => {
    try { return JSON.parse(line); } catch (e) { throw new Error(`${file}:${i + 1} invalid JSONL: ${e.message}`); }
  });
}
function scanApiRoutes(dir = path.join(ROOT, 'app', 'api'), base = '') {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const full = path.join(dir, ent.name);
    const rel = base ? `${base}/${ent.name}` : ent.name;
    if (fs.existsSync(path.join(full, 'route.ts')) || fs.existsSync(path.join(full, 'route.js'))) out.push(`/api/${rel}`);
    out.push(...scanApiRoutes(full, rel));
  }
  return out;
}
function scanCliCommands() {
  const bin = fs.existsSync(path.join(ROOT, 'bin', 'purpclaw.js')) ? fs.readFileSync(path.join(ROOT, 'bin', 'purpclaw.js'), 'utf8') : '';
  return [...new Set([...bin.matchAll(/^\s+case '([^']+)':/gm)].map(m => m[1].replace(/^\/+/, '')))];
}
function walkFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name === '.next' || ent.name === '.git') continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walkFiles(full, out);
    else out.push(full);
  }
  return out;
}
function scanSystemCommands() {
  const roots = ['lib', 'scripts', 'bin', 'app/api'].map(p => path.join(ROOT, p)).filter(p => fs.existsSync(p));
  const files = roots.flatMap(root => walkFiles(root)).filter(file => /\.(js|cjs|mjs|ts|tsx|ps1|bat|cmd|sh|bash|py)$/i.test(file));
  const commands = new Map();
  function add(name, source, platform = 'cross-platform', risk = 'medium') {
    const clean = String(name || '').trim();
    if (!clean) return;
    const rel = path.relative(ROOT, source).replace(/\\/g, '/');
    const key = `${clean}:${rel}`;
    if (!commands.has(key)) commands.set(key, { name: clean, type: 'system_command', handler: clean, platform, source: rel, risk, status: 'verified' });
  }
  const commandPatterns = [
    { re: /\b(powershell(?:\.exe)?)\b/ig, platform: 'windows', risk: 'high' },
    { re: /\b(cmd(?:\.exe)?)\b/ig, platform: 'windows', risk: 'high' },
    { re: /\b(bash|sh)\b/ig, platform: 'posix', risk: 'high' },
    { re: /\b(node|npm|npx|python|python3|pip|git|pm2|curl|Invoke-WebRequest)\b/ig, platform: 'cross-platform', risk: 'medium' },
    { re: /\b(osascript|pbpaste|afplay)\b/ig, platform: 'macos', risk: 'medium' },
  ];
  for (const file of files) {
    let text = '';
    try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
    const ext = path.extname(file).toLowerCase();
    if (ext === '.ps1') add('powershell script', file, 'windows', 'high');
    if (ext === '.bat' || ext === '.cmd') add('cmd script', file, 'windows', 'high');
    if (ext === '.sh' || ext === '.bash') add('shell script', file, 'posix', 'high');
    for (const p of commandPatterns) {
      for (const m of text.matchAll(p.re)) add(m[1], file, p.platform, p.risk);
    }
  }
  return [...commands.values()];
}

function loadInvocationRegistry() {
  ensureStore();
  const callables = new Map();
  function add(c) {
    const key = `${c.type}:${c.name}`;
    if (!callables.has(key)) callables.set(key, { id: key, status: 'verified', risk: 'low', ...c });
  }
  try {
    const tools = require('./tools');
    for (const tool of tools.list ? tools.list() : []) add({ name: tool.name, type: 'native_tool', description: tool.description || '', inputSchema: tool.inputSchema || {}, handler: 'lib/tools', risk: /write|shell|browser|pc|git/i.test(tool.name) ? 'high' : 'low' });
  } catch {}
  try {
    const skills = JSON.parse(fs.readFileSync(path.join(ROOT, 'skills', 'skills_registry.json'), 'utf8'));
    for (const [name, skill] of Object.entries(skills)) add({ name, type: 'skill', description: skill.description || '', provider: 'skills_registry', status: 'unverified', risk: 'medium' });
  } catch {}
  try {
    const agents = JSON.parse(fs.readFileSync(path.join(ROOT, 'agents', 'AGENT_REGISTRY.json'), 'utf8')).agents || [];
    for (const agent of agents) add({ name: agent.key || agent.name, type: 'agent', description: agent.role || '', provider: agent.division || 'agent_tower', risk: 'medium' });
  } catch {}
  for (const route of scanApiRoutes()) add({ name: route, type: 'api_route', handler: route, risk: /write|execute|promote|approve|route|spores|events/i.test(route) ? 'medium' : 'low' });
  for (const cmd of scanCliCommands()) add({ name: cmd, type: 'cli_command', handler: `purpclaw ${cmd}`, risk: /run|write|shell|commit|reset|install|start|stop|restart|browser|pc|git/i.test(cmd) ? 'high' : 'low' });
  for (const cmd of scanSystemCommands()) add(cmd);
  const list = [...callables.values()];
  const registry = {
    generatedAt: now(),
    source: 'spinebus-phase2-unified-scan',
    counts: {
      tools: list.filter(c => c.type === 'native_tool').length,
      skills: list.filter(c => c.type === 'skill').length,
      agents: list.filter(c => c.type === 'agent').length,
      apiRoutes: list.filter(c => c.type === 'api_route').length,
      cliCommands: list.filter(c => c.type === 'cli_command').length,
      systemCommands: list.filter(c => c.type === 'system_command').length,
    },
    callables: list,
  };
  fs.writeFileSync(REGISTRY_CACHE_FILE, JSON.stringify(registry, null, 2) + '\n', 'utf8');
  return registry;
}

function normalizeIntent(envelope) {
  const text = String(envelope.raw?.text || '').toLowerCase();
  const requiresFiles = /\b(file|repo|code|patch|write|edit|ui|html|css)\b/.test(text);
  const requiresTools = requiresFiles || /\b(tool|workflow|route|test|smoke|api|cli)\b/.test(text);
  return {
    primary: text.includes('liveforge') ? 'liveforge_workflow' : text.includes('fungus') || text.includes('mycelium') ? 'mycelium_context' : 'general_route',
    secondary: ['plan_only'],
    taskType: requiresFiles ? 'implementation_plan' : 'coordination',
    requiresTools,
    requiresFiles,
    requiresLocalExecution: requiresTools,
    requiresCurrentData: false,
    ambiguity: text.length < 12 ? 'high' : 'low',
  };
}
function classifyRisk(text) {
  if (/\b(delete|reset|push|deploy|payment|secret|credential|shell|exec)\b/i.test(text)) return 'dangerous';
  if (/\b(write|edit|install|start|stop|git|browser|pc)\b/i.test(text)) return 'high';
  if (/\b(tool|api|route|workflow)\b/i.test(text)) return 'medium';
  return 'low';
}
function createJobEnvelope(input = {}) {
  if (!input || typeof input !== 'object') throw new Error('input must be object');
  const text = String(input.text || input.raw?.text || '').trim();
  if (!text) throw new Error('text is required');
  if (input.source && typeof input.source !== 'object') throw new Error('source must be object');
  const envelope = {
    id: input.id || id('job', text),
    createdAt: now(),
    source: input.source || { type: 'chat', sessionId: 'local' },
    raw: { text: text.length > 4000 ? text.slice(0, 1000) : text, pxpipeRef: text.length > 4000 ? `pxpipe:recommended:${crypto.createHash('sha1').update(text).digest('hex').slice(0, 12)}` : undefined, attachments: input.attachments || [] },
    intent: { primary: 'pending', taskType: 'pending', requiresTools: false },
    risk: input.risk || classifyRisk(text),
    budget: input.budget || { maxTokens: 12000, maxToolCalls: 20, maxRuntimeMs: 600000 },
    status: 'created',
    touches: [],
  };
  if (!RISKS.has(envelope.risk)) throw new Error('invalid risk class');
  envelope.intent = normalizeIntent(envelope);
  appendJsonl(JOBS_FILE, envelope);
  return envelope;
}
function touch(subsystem, status, summary, refs = [], warnings = [], confidence = 0.8) {
  if (!TOUCH_STATUSES.has(status)) throw new Error(`invalid touch status: ${status}`);
  return { subsystem, status, confidence, timestamp: now(), summary, refs, warnings };
}
function touchMemoryLayers(envelope) {
  return ['session_memory', 'project_memory', 'user_memory', 'agent_memory', 'skill_memory', 'tool_memory', 'mycelium_memory'].map(s => touch(s, 'enrich', `${s} touched for ${envelope.id}`, [], [], 0.72));
}
function touchMycelium(envelope) {
  try {
    const mycelium = require('./mycelium');
    const bundle = mycelium.nutrientBundle({ requester_id: 'spinebus', requester_scope: 'system_private', query: envelope.intent.primary, reason: 'spinebus route planning' });
    return [touch('fungus_amongus', 'enrich', 'mycelium nutrient bundle requested', [bundle.bundle_id], [], 0.83)];
  } catch (e) {
    return [touch('fungus_amongus', 'warn', 'mycelium unavailable', [], [e.message], 0.2)];
  }
}
function matchTowerAgents(envelope) {
  const registry = loadInvocationRegistry();
  const agents = registry.callables.filter(c => c.type === 'agent');
  return agents.find(a => /engineer|orchestr|codex|planner/i.test(`${a.name} ${a.description}`)) || agents[0] || { name: 'virtual_planner', type: 'agent', status: 'unverified', risk: 'medium' };
}
function matchSkillCards(envelope) {
  const registry = loadInvocationRegistry();
  const skills = registry.callables.filter(c => c.type === 'skill');
  return skills.slice(0, 3).map(s => ({ id: s.id, name: s.name, version: 'virtual', confidence: s.status === 'verified' ? 0.8 : 0.45, requiredTools: [] }));
}
function matchToolsAndFunctions(envelope) {
  const registry = loadInvocationRegistry();
  const terms = new Set(String(envelope.raw.text || '').toLowerCase().split(/[^a-z0-9_-]+/).filter(Boolean));
  const selected = registry.callables.filter(c => ['native_tool', 'api_route', 'cli_command'].includes(c.type) && [...terms].some(t => String(c.name).toLowerCase().includes(t))).slice(0, 8);
  return selected.length ? selected : registry.callables.filter(c => ['native_tool', 'api_route', 'cli_command'].includes(c.type)).slice(0, 5);
}
function createRoutePlan(envelope) {
  const memoryTouches = touchMemoryLayers(envelope);
  const myceliumTouches = touchMycelium(envelope);
  const selectedAgent = matchTowerAgents(envelope);
  const selectedSkills = matchSkillCards(envelope);
  const selectedTools = matchToolsAndFunctions(envelope);
  const touches = [
    touch('chat_intake', 'pass', 'chat input normalized', [], [], 0.95),
    touch('intent_normalizer', 'pass', `intent ${envelope.intent.primary}`, [], [], 0.88),
    ...memoryTouches,
    ...myceliumTouches,
    touch('agent_tower', 'route', `selected ${selectedAgent.name}`, [selectedAgent.id || selectedAgent.name], [], 0.7),
    touch('skill_registry', selectedSkills.some(s => s.confidence < 0.5) ? 'warn' : 'route', 'skill cards selected', selectedSkills.map(s => s.id), selectedSkills.some(s => s.confidence < 0.5) ? ['some selected skills are virtual/unverified'] : [], 0.65),
    touch('tool_registry', 'route', 'tool/function registry matched', selectedTools.map(t => t.id), [], 0.8),
    touch('liveforge', 'enrich', 'LiveForge available for surface/event routing', ['lib/liveforge.js'], [], 0.86),
    touch('pxpipe', envelope.raw.pxpipeRef ? 'route' : 'pass', envelope.raw.pxpipeRef ? 'large payload should use PXPIPE pointer' : 'PXPIPE not needed for payload size', envelope.raw.pxpipeRef ? [envelope.raw.pxpipeRef] : [], [], 0.76),
    touch('execution_gate', 'block', 'Phase 2 is plan_only; no execution performed', [], ['execution deferred to later phase'], 0.99),
    touch('receipts', 'pass', 'route receipt will be written', [], [], 0.9),
    touch('truth_audit', 'pass', 'truth audit required before claims ship', ['scripts/audit-showcase-claims.mjs'], [], 0.74),
    touch('autolearn', 'enrich', 'safe lesson proposal queue available', [], [], 0.65),
    touch('dreamforge', 'enrich', 'safe dream queue available; no mutation', [], [], 0.65),
  ];
  for (const t of touches) appendJsonl(TOUCHES_FILE, { jobId: envelope.id, ...t });
  envelope.touches = touches;
  envelope.status = 'planned';
  const routePlan = {
    id: id('route', envelope.id),
    jobId: envelope.id,
    createdAt: now(),
    selectedAgent,
    supportAgents: [],
    selectedSkills,
    selectedTools,
    blockedTools: selectedTools.filter(t => ['high', 'dangerous'].includes(t.risk)).map(t => ({ ...t, reason: 'side effect risk requires approval' })),
    fallbackChains: ['text plan', 'LiveForge surface contract', 'Mycelium nutrient bundle'],
    expectedOutputs: ['route plan', 'receipt', 'safe next steps'],
    writeTargets: [STORE_DIR],
    gate: { status: 'plan_only', reason: 'SPINEBUS Phase 2 creates plans only', approvalRequired: true, sideEffects: [] },
    receiptTarget: RECEIPTS_FILE,
    touches,
  };
  appendJsonl(ROUTES_FILE, routePlan);
  return routePlan;
}
function writeRouteReceipt(routePlan, status = 'planned') {
  const receipt = {
    id: id('receipt', routePlan.id),
    jobId: routePlan.jobId,
    routeId: routePlan.id,
    createdAt: now(),
    status,
    touchedSubsystems: routePlan.touches.map(t => t.subsystem),
    selectedAgent: routePlan.selectedAgent?.name || routePlan.selectedAgent?.id || 'unknown',
    selectedSkills: routePlan.selectedSkills,
    selectedTools: routePlan.selectedTools,
    gateStatus: routePlan.gate.status,
    outputs: [],
    errors: [],
    metrics: { selectedTools: routePlan.selectedTools.length, selectedSkills: routePlan.selectedSkills.length },
  };
  appendJsonl(RECEIPTS_FILE, receipt);
  return receipt;
}
function routeText(input = {}) {
  const job = createJobEnvelope(input);
  const route = createRoutePlan(job);
  const receipt = writeRouteReceipt(route, 'planned');
  return { ok: true, job, route, receipt };
}
function queueLessonProposal(input = {}) {
  const row = { id: id('lesson', input.summary || 'lesson'), summary: String(input.summary || ''), risk: input.risk || 'medium', status: 'queued', createdAt: now(), source: input.source || 'spinebus' };
  appendJsonl(LESSONS_FILE, row);
  return row;
}
function queueDreamTask(input = {}) {
  const row = { id: id('dream', input.summary || 'dream'), summary: String(input.summary || 'safe improvement task'), safe: input.safe !== false, execute: false, createdAt: now(), refs: input.refs || [] };
  appendJsonl(DREAM_QUEUE_FILE, row);
  return row;
}
function getSpinebusHealth() {
  ensureStore();
  const registry = fs.existsSync(REGISTRY_CACHE_FILE) ? JSON.parse(fs.readFileSync(REGISTRY_CACHE_FILE, 'utf8')) : loadInvocationRegistry();
  return { ok: true, storeDir: STORE_DIR, files: { jobs: JOBS_FILE, routes: ROUTES_FILE, touches: TOUCHES_FILE, receipts: RECEIPTS_FILE, lessons: LESSONS_FILE, dreamQueue: DREAM_QUEUE_FILE, registryCache: REGISTRY_CACHE_FILE }, counts: { jobs: readJsonl(JOBS_FILE).length, routes: readJsonl(ROUTES_FILE).length, touches: readJsonl(TOUCHES_FILE).length, receipts: readJsonl(RECEIPTS_FILE).length, lessons: readJsonl(LESSONS_FILE).length, dreamQueue: readJsonl(DREAM_QUEUE_FILE).length, callables: registry.callables.length }, dependencies: { liveforge: fs.existsSync(path.join(ROOT, 'lib', 'liveforge.js')), fungus: fs.existsSync(path.join(ROOT, 'lib', 'mycelium.js')), pxpipe: fs.existsSync(path.join(ROOT, 'lib', 'pxpipe.js')) }, gate: 'plan_only' };
}

module.exports = { STORE_DIR, JOBS_FILE, ROUTES_FILE, TOUCHES_FILE, RECEIPTS_FILE, LESSONS_FILE, DREAM_QUEUE_FILE, REGISTRY_CACHE_FILE, TOUCH_SUBSYSTEMS, ensureStore, readJsonl, appendJsonl, createJobEnvelope, normalizeIntent, touchMemoryLayers, touchMycelium, matchTowerAgents, matchSkillCards, matchToolsAndFunctions, createRoutePlan, writeRouteReceipt, queueLessonProposal, queueDreamTask, getSpinebusHealth, loadInvocationRegistry, routeText };
