'use strict';

/**
 * PURPCLAW vs Odysseus benchmark.
 *
 * This is not marketing copy. It is the product target list we use to keep
 * PURPCLAW honest while building toward a stronger self-hosted AI workspace.
 */

const GENERATED_AT = '2026-06-02';
const ODYSSEUS_REPO = 'https://github.com/pewdiepie-archdaemon/odysseus';

const LANES = [
  {
    id: 'first-run',
    label: 'First Run + Install',
    odysseus: 'Docker/native launchers, generated admin account, bundled ChromaDB/SearXNG/ntfy, clear GPU notes.',
    purpclaw: 'PM2/service-registry stack works locally but setup is scattered and not beginner-clean.',
    status: 'behind',
    priority: 1,
    winCondition: 'One launcher starts API, UI, tower, orchestrator, event/state, and prints a single URL plus health report.',
    nextMoves: [
      'Create a first-run doctor endpoint that reports missing services, keys, ports, and optional stacks.',
      'Add a Windows-first bootstrap script that does not destroy existing work.',
      'Render setup state in Mission Control instead of burying it in terminal logs.',
    ],
  },
  {
    id: 'api-harness',
    label: 'API Harness + Agent Flow',
    odysseus: 'Agent mode built on opencode/MCP/tools with broad workspace actions.',
    purpclaw: 'Kernel job spine, swarm coordinator, tower agents, harness engine, score routing, governance and live flow ribbon.',
    status: 'ahead',
    priority: 1,
    winCondition: 'Every user request has one traceable job id from chat to swarm to final report.',
    nextMoves: [
      'Keep kernel as the only front door for actionable work.',
      'Expose per-job proof: files touched, commands run, tests passed, approvals required.',
      'Add replayable benchmark jobs that prove agents beat a single assistant loop.',
    ],
  },
  {
    id: 'models',
    label: 'Models + Cookbook',
    odysseus: 'Hardware scan, model fit scoring, GGUF/FP8/AWQ, vLLM/llama.cpp serving, GPU Docker overlays.',
    purpclaw: 'Provider routing exists; Ollama/OpenRouter fallback exists; no polished model download/serve cookbook yet.',
    status: 'behind',
    priority: 1,
    winCondition: 'Scan hardware, rank runnable models, one-click serve through Ollama/llama.cpp/vLLM, show real logs.',
    nextMoves: [
      'Add /api/models/doctor with CPU/RAM/GPU/VRAM/provider probes.',
      'Build model recommendation cards from local hardware and provider availability.',
      'Stream serve/download logs into Mission Control.',
    ],
  },
  {
    id: 'research',
    label: 'Deep Research',
    odysseus: 'Research routes, visual reports, SearXNG integration, tests around research ownership/errors.',
    purpclaw: 'OpenRouter free-model research room, source fetching, group synthesis through Unified API.',
    status: 'contested',
    priority: 1,
    winCondition: 'Research room runs multi-model, cites sources, records dissent, exports a visual report, and works without paid APIs when local models exist.',
    nextMoves: [
      'Persist research runs as kernel jobs.',
      'Add report viewer/export in Mission Control.',
      'Add local model research fallback through Ollama when OpenRouter auth is absent.',
    ],
  },
  {
    id: 'workspace',
    label: 'Workspace Apps',
    odysseus: 'Documents, notes/tasks, email, calendar, gallery/image editor, uploads, sessions, presets.',
    purpclaw: 'Strong ops/control room; weak everyday workspace modules.',
    status: 'behind',
    priority: 2,
    winCondition: 'PURPCLAW becomes useful before agents: docs, notes, tasks, repo intake, saved sessions, file uploads.',
    nextMoves: [
      'Ship a repo/project intake surface first.',
      'Add notes/tasks tied to kernel jobs.',
      'Add document/report editor after the job/report loop is solid.',
    ],
  },
  {
    id: 'memory',
    label: 'Memory + Skills',
    odysseus: 'ChromaDB plus fastembed, import/export, vector and keyword retrieval, MCP memory servers.',
    purpclaw: 'Memory Matrix, skills, agent scoring, context bus, autodream, many resident skill packs.',
    status: 'contested',
    priority: 2,
    winCondition: 'Memory is visible, editable, scoped, import/exportable, and used in routing decisions with proof.',
    nextMoves: [
      'Surface what memory was used in every kernel job.',
      'Add import/export and memory search UI.',
      'Separate trusted operator memory from untrusted web/email/doc content.',
    ],
  },
  {
    id: 'security',
    label: 'Security + Trust Boundary',
    odysseus: 'Auth, roles, 2FA, API tokens, admin/non-admin capability split, threat model, security tests.',
    purpclaw: 'Governance exists, but auth/role/session hardening is not at Odysseus level.',
    status: 'behind',
    priority: 1,
    winCondition: 'No dangerous tool runs without identity, role, audit log, and approval policy.',
    nextMoves: [
      'Add operator auth/session layer to Unified API and Mission Control.',
      'Gate shell/file/model-serving routes by role and approval.',
      'Create threat model and regression tests for prompt injection and tool escalation.',
    ],
  },
  {
    id: 'tests',
    label: 'Tests + Proof',
    odysseus: 'Large Python test suite, endpoint/provider/security/research/upload/calendar/email coverage.',
    purpclaw: 'TypeScript checks and smoke routes exist; broad regression proof is thin.',
    status: 'behind',
    priority: 1,
    winCondition: 'Every core lane has smoke, route, security, and UI proof gates.',
    nextMoves: [
      'Add tests for chat -> kernel -> swarm, research group, model provider fallback, and governance denial.',
      'Record Mission Control screenshots after major UI changes.',
      'Turn npm cibuild into a real gate instead of an echo.',
    ],
  },
  {
    id: 'mobile',
    label: 'Mobile + PWA',
    odysseus: 'Responsive, installable PWA, touch gestures claimed and demoed.',
    purpclaw: 'Mission Control is desktop-first and dense.',
    status: 'behind',
    priority: 3,
    winCondition: 'Phone can chat, launch kernel jobs, watch progress, approve/deny, and read reports.',
    nextMoves: [
      'Add mobile command-first layout.',
      'Test Mission Control at phone widths.',
      'Add installable PWA manifest and offline shell.',
    ],
  },
];

function summarizeScorecard() {
  const totals = LANES.reduce((acc, lane) => {
    acc[lane.status] = (acc[lane.status] || 0) + 1;
    return acc;
  }, {});
  return {
    generatedAt: GENERATED_AT,
    target: 'Odysseus',
    source: ODYSSEUS_REPO,
    totals,
    nextCriticalLanes: LANES
      .filter(lane => lane.priority === 1 && lane.status !== 'ahead')
      .map(lane => lane.id),
  };
}

function getScorecard() {
  return {
    summary: summarizeScorecard(),
    lanes: LANES,
  };
}

module.exports = {
  GENERATED_AT,
  ODYSSEUS_REPO,
  LANES,
  getScorecard,
  summarizeScorecard,
};
