'use strict';

const fs = require('fs');
const path = require('path');

const PURP_DIR = path.resolve(__dirname, '..');
const WORK_DIR = path.join(PURP_DIR, 'agent_work');
const WORKSPACE_FILE = path.join(WORK_DIR, '.workspace_awareness.json');
const FALLBACK_WORKSPACE_FILE = path.join(process.env.TEMP || 'C:/tmp', 'purpclaw-workspace-awareness.json');

const APP_PATTERNS = [
  ['VS Code', /\b(vs code|visual studio code|cursor|code editor|tsx|jsx|typescript|javascript|python|powershell script)\b/i],
  ['Terminal', /\b(terminal|powershell|command prompt|cmd\.exe|bash|shell|npm |pm2 |node |python |build log|stack trace)\b/i],
  ['Browser', /\b(chrome|edge|browser|localhost|http:\/\/|https:\/\/|tab|web page|netlify|github)\b/i],
  ['Mission Control', /\b(mission control|purpclaw|agent tower|orchestrator|dashboard|service health)\b/i],
  ['Docs', /\b(documentation|readme|markdown|docs|notion|pdf)\b/i],
  ['Media Tool', /\b(video|audio|timeline|recording|canvas|image editor|studio)\b/i],
];

const WORKFLOW_PATTERNS = [
  ['debugging', /\b(error|failed|failure|exception|stack trace|refused|timeout|logs?|debug|diagnostic)\b/i],
  ['building', /\b(build|compile|npm run|next build|bundle|deploy|pm2|server|localhost)\b/i],
  ['coding', /\b(code|editor|file|function|class|component|route|api|typescript|javascript|python)\b/i],
  ['monitoring', /\b(status|health|metrics|dashboard|services|agents|queue|workflow)\b/i],
  ['documentation', /\b(readme|docs|markdown|notes|plan|audit|report)\b/i],
  ['media', /\b(video|audio|recording|timeline|thumbnail|image|canvas)\b/i],
];

const ROLE_BY_WORKFLOW = {
  debugging: 'debug/logs',
  building: 'runtime/build',
  coding: 'coding',
  monitoring: 'dashboard',
  documentation: 'docs',
  media: 'media',
  unknown: 'workspace',
};

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
    return { ok: true, file };
  } catch (primaryError) {
    try {
      fs.mkdirSync(path.dirname(FALLBACK_WORKSPACE_FILE), { recursive: true });
      fs.writeFileSync(FALLBACK_WORKSPACE_FILE, JSON.stringify({
        ...data,
        persistWarning: `primary workspace path unavailable: ${primaryError.message}`,
      }, null, 2), 'utf8');
      return { ok: true, file: FALLBACK_WORKSPACE_FILE, warning: primaryError.message };
    } catch (fallbackError) {
      return { ok: false, file, error: fallbackError.message, primaryError: primaryError.message };
    }
  }
}

function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9_.:/\\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSet(text) {
  const tokens = normalizeText(text)
    .split(' ')
    .filter(t => t.length > 2)
    .slice(0, 120);
  return new Set(tokens);
}

function similarity(a, b) {
  const left = tokenSet(a);
  const right = tokenSet(b);
  if (!left.size && !right.size) return 1;
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  for (const token of left) {
    if (right.has(token)) overlap++;
  }
  return overlap / Math.max(left.size, right.size);
}

function firstMatch(text, patterns, fallback) {
  for (const [name, pattern] of patterns) {
    if (pattern.test(text || '')) return name;
  }
  return fallback;
}

function inferScreenState(result, previous) {
  const description = result.description || '';
  const app = firstMatch(description, APP_PATTERNS, previous?.app || 'Unknown');
  const workflow = firstMatch(description, WORKFLOW_PATTERNS, previous?.workflow || 'unknown');
  const role = previous?.role && previous.role !== 'workspace'
    ? previous.role
    : ROLE_BY_WORKFLOW[workflow] || 'workspace';
  const descSimilarity = similarity(previous?.lastDescription || '', description);
  const changed = !previous
    || previous.app !== app
    || previous.workflow !== workflow
    || (description && descSimilarity < 0.55);

  let changeSummary = 'No major visible change.';
  if (!previous) {
    changeSummary = `First observation: ${app}, ${workflow}.`;
  } else if (previous.app !== app || previous.workflow !== workflow) {
    changeSummary = `Shifted from ${previous.app}/${previous.workflow} to ${app}/${workflow}.`;
  } else if (changed) {
    changeSummary = `Visible content changed on ${app}.`;
  }

  return {
    screen: result.screen,
    width: result.width || previous?.width || null,
    height: result.height || previous?.height || null,
    role,
    app,
    workflow,
    lastDescription: description || previous?.lastDescription || null,
    objects: Array.isArray(result.objects) ? result.objects : [],
    objectCount: result.objectCount || 0,
    yoloOnline: Boolean(result.yoloOnline),
    lastError: result.error || null,
    lastSeenAt: new Date().toISOString(),
    seenCount: (previous?.seenCount || 0) + 1,
    changed,
    changeSummary,
  };
}

function summarizeWorkspace(workspace) {
  const monitors = Object.values(workspace.monitors || {})
    .sort((a, b) => Number(a.screen) - Number(b.screen));
  if (!monitors.length) return 'No workspace observations yet. Run purpclaw look.';

  const active = monitors.map(m => {
    const parts = [`screen ${m.screen}`];
    if (m.role) parts.push(m.role);
    if (m.app && m.app !== 'Unknown') parts.push(m.app);
    if (m.workflow && m.workflow !== 'unknown') parts.push(m.workflow);
    return parts.join(' / ');
  });

  const changed = monitors.filter(m => m.changed).map(m => `screen ${m.screen}: ${m.changeSummary}`);
  const lines = [`Workspace: ${active.join('; ')}.`];
  if (changed.length) lines.push(`Changed: ${changed.join(' ')}`);
  return lines.join(' ');
}

function updateWorkspace(results, options = {}) {
  const current = readWorkspace();
  const monitors = { ...(current.monitors || {}) };
  const observations = [];

  for (const result of results || []) {
    const key = String(result.screen);
    const previous = monitors[key];
    const next = inferScreenState(result, previous);
    monitors[key] = next;
    observations.push({
      screen: next.screen,
      app: next.app,
      workflow: next.workflow,
      role: next.role,
      changed: next.changed,
      changeSummary: next.changeSummary,
    });
  }

  const workspace = {
    version: 1,
    updatedAt: new Date().toISOString(),
    source: options.source || 'look',
    monitors,
    recent: [
      {
        ts: new Date().toISOString(),
        source: options.source || 'look',
        observations,
      },
      ...((current.recent || []).slice(0, 24)),
    ],
  };
  workspace.summary = summarizeWorkspace(workspace);
  const persist = writeJson(WORKSPACE_FILE, workspace);
  workspace.persist = persist;
  return workspace;
}

function readWorkspace() {
  const primary = readJson(WORKSPACE_FILE, null);
  if (primary) return primary;
  const fallback = readJson(FALLBACK_WORKSPACE_FILE, null);
  if (fallback) return fallback;
  return {
    version: 1,
    updatedAt: null,
    source: null,
    monitors: {},
    recent: [],
    summary: 'No workspace observations yet. Run purpclaw look.',
  };
}

module.exports = {
  WORKSPACE_FILE,
  FALLBACK_WORKSPACE_FILE,
  readWorkspace,
  updateWorkspace,
  summarizeWorkspace,
};
