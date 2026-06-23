'use strict';
/**
 * lib/demo/product-factory.js — The One Button Product Factory.
 *
 * One instruction in → PURPCLAW runs a full autonomous mission:
 *   health check → mission brief → agent assignment (REAL swarm dispatch) →
 *   research → build (ClipForge Lite) → QA → docs → package → mission report.
 *
 * HONESTY CONTRACT (same as the cockpit): every stage entry in the mission
 * report records what ACTUALLY ran — which executor did the work
 * (swarm-workflow with its real workflowId, llm with the real provider/model,
 * or factory-kernel for deterministic local tooling), what artifacts were
 * produced, and whether a fallback was used. Nothing is reported as an agent
 * action unless an agent actually performed it.
 *
 * All output lands in agent_work/factory/<runId>/ (gitignored).
 */

const fs = require('fs');
const path = require('path');
const { PROJECT_ROOT } = require('../paths');
const { execSafe } = require('../child-registry');
const llm = require('../llm-provider');

const ORCHESTRATOR = 'http://127.0.0.1:7784';
const EVENTBUS = 'http://127.0.0.1:7782';

const CORE_SERVICES = [
  { name: 'unified_api', url: 'http://127.0.0.1:7780/api/health' },
  { name: 'eventbus', url: 'http://127.0.0.1:7782/state' },
  { name: 'orchestrator', url: 'http://127.0.0.1:7784/api/health' },
  { name: 'agent_tower', url: 'http://127.0.0.1:7790/tower/status' },
  { name: 'gatekeeper', url: 'http://127.0.0.1:7791/health' },
  { name: 'context_bus', url: 'http://127.0.0.1:7881/health' },
];

const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{20,}/, /AKIA[0-9A-Z]{16}/, /ghp_[A-Za-z0-9]{30,}/,
  /xox[bp]-/, /AIza[0-9A-Za-z_-]{30,}/, /nvapi-[A-Za-z0-9]/, /Bearer [A-Za-z0-9._-]{30,}/,
];

function nowIso() { return new Date().toISOString(); }

async function fetchJson(url, opts = {}, timeoutMs = 8000) {
  try {
    const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, status: res.status, data: await res.json().catch(() => null) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

class ProductFactory {
  constructor({ idea, onLog } = {}) {
    this.idea = idea || 'A short-form content planning app for creators: dashboard, clip ideas, captions, hashtags, posting schedule, exportable summary.';
    this.runId = `factory-${Date.now()}`;
    this.dir = path.join(PROJECT_ROOT, 'agent_work', 'factory', this.runId);
    this.productDir = path.join(this.dir, 'clipforge-lite');
    this.stages = [];
    this.onLog = onLog || (() => {});
    this.providerInfo = (() => { try { return llm.getProviderInfo(); } catch { return null; } })();
  }

  log(msg) { this.onLog(msg); }

  async publish(topic, data) {
    await fetchJson(`${EVENTBUS}/publish`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ topic, type: topic, source: 'product-factory', runId: this.runId, ...data }),
    }, 3000).catch(() => {});
  }

  async stage(name, executor, fn) {
    const entry = { stage: name, executor, status: 'running', startedAt: nowIso(), artifacts: [], detail: null };
    this.stages.push(entry);
    this.log(`▶ ${name} [${executor}]`);
    await this.publish('factory.stage.started', { stage: name, executor });
    try {
      const result = await fn(entry);
      entry.status = 'completed';
      entry.finishedAt = nowIso();
      await this.publish('factory.stage.completed', { stage: name, executor, detail: entry.detail });
      this.log(`✔ ${name}`);
      return result;
    } catch (e) {
      entry.status = 'failed';
      entry.error = e.message;
      entry.finishedAt = nowIso();
      await this.publish('factory.stage.failed', { stage: name, error: e.message });
      this.log(`✖ ${name}: ${e.message}`);
      throw e;
    }
  }

  writeArtifact(entry, relPath, content) {
    const full = path.join(this.dir, relPath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
    entry.artifacts.push({ path: relPath, bytes: Buffer.byteLength(content) });
    return full;
  }

  /** LLM helper with an honest fallback marker. Hard 90s budget per call —
   *  a hung provider must not stall the mission (hit on factory run 2). */
  async generate(entry, prompt, system, fallbackText) {
    // The timeout timer MUST be cleared. Bug (read as "hang on docs"): the
    // reject-after-90s timer was never cleared, so when llm.complete won the
    // race the armed timer stayed in the event loop and held the process open
    // for up to 90s PER stage after the mission already finished. Clear it in
    // finally; unref so even a pending timer can't block exit.
    let timer = null;
    try {
      const text = await Promise.race([
        llm.complete(prompt, { maxTokens: 1400 }, system),
        new Promise((_, rej) => {
          timer = setTimeout(() => rej(new Error('llm timeout after 90s')), 90_000);
          if (timer.unref) timer.unref();
        }),
      ]);
      if (typeof text === 'string' && text.trim().length > 40) {
        entry.llm = { provider: this.providerInfo?.main?.provider, model: this.providerInfo?.main?.model, fallback: false };
        return text.trim();
      }
      throw new Error('short/empty LLM reply');
    } catch (e) {
      entry.llm = { fallback: true, reason: e.message };
      return fallbackText;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  // ── Stage 1: wake + health ────────────────────────────────────────────
  async healthCheck() {
    return this.stage('health-check', 'factory-kernel', async (entry) => {
      const results = await Promise.all(CORE_SERVICES.map(async s => {
        const r = await fetchJson(s.url, {}, 4000);
        return { name: s.name, online: r.ok };
      }));
      const down = results.filter(r => !r.online).map(r => r.name);
      entry.detail = `${results.length - down.length}/${results.length} core services online${down.length ? ` (down: ${down.join(', ')})` : ''}`;
      this.writeArtifact(entry, 'health-check.json', JSON.stringify({ checkedAt: nowIso(), results }, null, 2));
      if (!results.find(r => r.name === 'orchestrator')?.online) {
        throw new Error('orchestrator offline — cannot run an autonomous mission without it');
      }
      return results;
    });
  }

  // ── Stage 2: mission brief ────────────────────────────────────────────
  async missionBrief() {
    return this.stage('mission-brief', 'llm', async (entry) => {
      const text = await this.generate(entry,
        `Product idea: ${this.idea}\n\nWrite a tight mission brief: product goal, target user, 6 core features, deliverables, and risks. Markdown, under 350 words. Product name: ClipForge Lite.`,
        'You are the planning agent of PURPCLAW, an AI operating system. Be concrete and brief.',
        [
          '# Mission Brief — ClipForge Lite',
          '',
          '**Goal:** a small, self-contained short-form content planning dashboard.',
          '**Target user:** creators turning long videos into Shorts/TikToks.',
          '**Features:** clip idea list, captions, hashtags, posting schedule, export summary, settings.',
          '**Deliverables:** runnable HTML dashboard, demo data, README, pitch, packaged zip.',
          '**Risks:** demo data only; no live platform integrations in this build.',
        ].join('\n'),
      );
      entry.detail = entry.llm.fallback ? 'template brief (LLM unavailable)' : `brief drafted by ${entry.llm.provider}/${entry.llm.model}`;
      this.writeArtifact(entry, 'mission-brief.md', text);
      return text;
    });
  }

  // ── Stage 3: agent assignment — REAL swarm dispatch ─────────────────
  async agentAssignment() {
    return this.stage('agent-assignment', 'swarm-workflow', async (entry) => {
      // NOTE: the marker must avoid orchestrator routing keywords ('swarm',
      // 'team', …) — the intent parser keyword-matches the raw command text
      // and will misroute + truncate the command otherwise (real bug, hit on
      // factory run 1: 'SWARM LANE VERIFIED' became intent=swarm_mission with
      // the command chopped at the keyword).
      const proofRel = `agent_work/factory/${this.runId}/swarm-proof.txt`;
      const marker = `CLIPFORGE FACTORY ${this.runId.toUpperCase()} TOWER LANE VERIFIED`;
      const res = await fetchJson(`${ORCHESTRATOR}/api/orchestrate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          command: `test create ${proofRel} containing exactly ${marker}, then read it back and report the exact content`,
          source: 'product-factory',
          policyMode: 'workspace-write',
        }),
      }, 15000);
      if (!res.ok || !res.data?.workflowId) throw new Error(`orchestrator dispatch failed (${res.status || res.error})`);
      const workflowId = res.data.workflowId;
      entry.workflowId = workflowId;

      // wait for the real workflow to complete
      const deadline = Date.now() + 240000;
      let workflow = null;
      while (Date.now() < deadline) {
        const w = await fetchJson(`${ORCHESTRATOR}/api/workflow/${encodeURIComponent(workflowId)}`, {}, 8000);
        if (w.ok && ['completed', 'failed', 'waiting_approval'].includes(w.data?.status)) { workflow = w.data; break; }
        await new Promise(r => setTimeout(r, 1000));
      }
      if (!workflow) throw new Error(`workflow ${workflowId} timed out`);
      if (workflow.status !== 'completed') throw new Error(`workflow ${workflowId} ended ${workflow.status}`);
      const proofFull = path.join(PROJECT_ROOT, proofRel);
      const written = fs.existsSync(proofFull) ? fs.readFileSync(proofFull, 'utf8') : '';
      if (written !== marker) throw new Error('swarm proof file missing or wrong content');
      entry.detail = `real swarm workflow ${workflowId} completed — tower agent wrote the proof file`;
      entry.artifacts.push({ path: 'swarm-proof.txt', bytes: Buffer.byteLength(written) });
      this.writeArtifact(entry, 'swarm-workflow.json', JSON.stringify(workflow, null, 2));
      return workflow;
    });
  }

  // ── Stage 4: research ────────────────────────────────────────────────
  async research() {
    return this.stage('research', 'llm', async (entry) => {
      const text = await this.generate(entry,
        'Briefly map the short-form content tooling market for a ClipForge Lite pitch: 4 competitor archetypes, the gap a local-first AI planning tool fills, and 3 positioning lines. Markdown, under 300 words.',
        'You are the research agent of PURPCLAW. No fabricated statistics — describe archetypes and positioning, not made-up numbers.',
        '# Market Notes — ClipForge Lite\n\nCompetitor archetypes: cloud clipping SaaS, editor plugins, social schedulers, AI caption tools.\nGap: local-first planning that feeds an automation stack instead of another subscription silo.\nPositioning: plan everywhere, own your data; one dashboard from idea to schedule; built by an AI OS, extensible by one.',
      );
      entry.detail = entry.llm.fallback ? 'template notes (LLM unavailable)' : `research by ${entry.llm.provider}/${entry.llm.model}`;
      this.writeArtifact(entry, 'research.md', text);
      return text;
    });
  }

  // ── Stage 5: build ───────────────────────────────────────────────────
  async build() {
    return this.stage('build', 'factory-kernel', async (entry) => {
      const demoData = {
        generatedAt: nowIso(),
        generatedBy: `PURPCLAW product factory ${this.runId}`,
        clips: [
          { id: 1, title: 'The 30-second hook', angle: 'open on the strongest claim', duration: '0:34', status: 'ready' },
          { id: 2, title: 'Behind the build', angle: 'screen capture + voiceover', duration: '0:51', status: 'ready' },
          { id: 3, title: 'Before / after', angle: 'split-screen comparison', duration: '0:28', status: 'draft' },
          { id: 4, title: 'One-take reaction', angle: 'authentic first response', duration: '0:45', status: 'draft' },
          { id: 5, title: 'The numbers story', angle: 'animated stat walkthrough', duration: '0:39', status: 'idea' },
        ],
        captions: [
          'We let the machine plan the whole week. Here is what it picked.',
          'Stop scrubbing timelines. Start shipping clips.',
          'One long video. Five shorts. Zero burnout.',
        ],
        hashtags: ['#shorts', '#contentplanning', '#creatorworkflow', '#aitools', '#buildinpublic'],
        schedule: [
          { day: 'Mon', slot: '18:00', clip: 1 },
          { day: 'Wed', slot: '12:30', clip: 2 },
          { day: 'Fri', slot: '17:00', clip: 3 },
          { day: 'Sat', slot: '11:00', clip: 4 },
        ],
      };
      this.writeArtifact(entry, 'clipforge-lite/demo-data.json', JSON.stringify(demoData, null, 2));

      const html = buildClipForgeHtml(demoData, this.runId);
      this.writeArtifact(entry, 'clipforge-lite/index.html', html);
      entry.detail = `scaffolded ClipForge Lite (${demoData.clips.length} demo clips, dashboard + schedule + export)`;
      return demoData;
    });
  }

  // ── Stage 6: QA ──────────────────────────────────────────────────────
  async qa() {
    return this.stage('qa', 'factory-kernel', async (entry) => {
      const checks = [];
      const must = ['clipforge-lite/index.html', 'clipforge-lite/demo-data.json', 'mission-brief.md', 'research.md'];
      for (const rel of must) {
        const full = path.join(this.dir, rel);
        const exists = fs.existsSync(full);
        const bytes = exists ? fs.statSync(full).size : 0;
        checks.push({ check: `exists:${rel}`, pass: exists && bytes > 100, bytes });
      }
      const html = fs.readFileSync(path.join(this.dir, 'clipforge-lite/index.html'), 'utf8');
      for (const section of ['CLIP QUEUE', 'CAPTIONS', 'HASHTAGS', 'SCHEDULE', 'EXPORT']) {
        checks.push({ check: `section:${section}`, pass: html.includes(section) });
      }
      checks.push({ check: 'html:closes', pass: /<\/html>\s*$/.test(html) });
      // secret scan across all artifacts
      let secretHits = 0;
      const scan = (dir) => {
        for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, f.name);
          if (f.isDirectory()) { scan(full); continue; }
          const body = fs.readFileSync(full, 'utf8');
          if (SECRET_PATTERNS.some(p => p.test(body))) secretHits++;
        }
      };
      scan(this.dir);
      checks.push({ check: 'no-secrets', pass: secretHits === 0 });

      const failed = checks.filter(c => !c.pass);
      entry.detail = `${checks.length - failed.length}/${checks.length} checks passed`;
      this.writeArtifact(entry, 'qa-report.json', JSON.stringify({ ranAt: nowIso(), checks }, null, 2));
      if (failed.length) throw new Error(`QA failed: ${failed.map(f => f.check).join(', ')}`);
      return checks;
    });
  }

  // ── Stage 7: docs ────────────────────────────────────────────────────
  async docs() {
    return this.stage('docs', 'llm', async (entry) => {
      const readme = await this.generate(entry,
        'Write a README for ClipForge Lite, a self-contained HTML short-form content planning dashboard generated by the PURPCLAW product factory. Sections: what it is, how to run (open index.html), what was generated, demo-mode caveats, next integration steps. Markdown, under 300 words.',
        'You are the docs agent of PURPCLAW. Honest tone: this is a generated demo product, say so plainly.',
        '# ClipForge Lite\n\nA self-contained short-form content planning dashboard, generated end-to-end by the PURPCLAW product factory.\n\n## Run it\nOpen `index.html` in any browser. No install, no server.\n\n## What was generated\nDashboard (clip queue, captions, hashtags, schedule, export), demo data, this README, a pitch summary, and a QA report.\n\n## Demo mode\nAll data is demo data. No platform integrations are wired in this build.\n\n## Next steps\nWire StreamRot for real clip rendering and platform posting; swap demo data for a real video analysis pass.',
      );
      this.writeArtifact(entry, 'clipforge-lite/README.md', readme);
      const pitch = [
        '# Pitch — ClipForge Lite',
        '',
        'Built by PURPCLAW, an AI operating system, in a single autonomous mission:',
        'health check → brief → real swarm dispatch → research → build → QA → docs → package.',
        '',
        'Every stage of this build is logged in MISSION_REPORT.md with the executor that',
        'actually performed it. The product is the proof: one prompt in, packaged product out.',
      ].join('\n');
      this.writeArtifact(entry, 'PITCH.md', pitch);
      entry.detail = entry.llm.fallback ? 'template docs (LLM unavailable)' : `docs by ${entry.llm.provider}/${entry.llm.model}`;
      return readme;
    });
  }

  // ── Stage 8: package ─────────────────────────────────────────────────
  async pack() {
    return this.stage('package', 'factory-kernel', async (entry) => {
      const zipPath = path.join(this.dir, 'clipforge-lite.zip');
      const r = await execSafe('powershell', [
        '-NoProfile', '-Command',
        `Compress-Archive -Path '${this.productDir}\\*' -DestinationPath '${zipPath}' -Force`,
      ], { timeoutMs: 60000 });
      if (!r.ok || !fs.existsSync(zipPath)) throw new Error(`zip failed: ${r.stderr || r.code}`);
      entry.detail = `clipforge-lite.zip (${fs.statSync(zipPath).size} bytes)`;
      entry.artifacts.push({ path: 'clipforge-lite.zip', bytes: fs.statSync(zipPath).size });
      return zipPath;
    });
  }

  // ── Stage 9: mission report ──────────────────────────────────────────
  async report() {
    return this.stage('mission-report', 'factory-kernel', async (entry) => {
      const summary = {
        runId: this.runId,
        idea: this.idea,
        startedAt: this.stages[0]?.startedAt,
        finishedAt: nowIso(),
        provider: this.providerInfo?.main || null,
        // The mission-report stage snapshots stages while it is itself still
        // 'running' (stage() only flips status to 'completed' AFTER the fn
        // returns). It IS the terminal stage and does complete, so reflect that
        // here — otherwise the summary undercounts 8/9 forever. Honest, not
        // inflated: this stage returns successfully right after this snapshot.
        stages: this.stages.map(s => ({ ...s, status: s.stage === 'mission-report' ? 'completed' : s.status })),
      };
      this.writeArtifact(entry, 'mission-report.json', JSON.stringify(summary, null, 2));
      const md = [
        `# Mission Report — ${this.runId}`,
        '',
        `**Instruction:** ${this.idea}`,
        '',
        '| stage | executor | status | detail |',
        '|---|---|---|---|',
        ...this.stages.map(s => `| ${s.stage} | ${s.executor}${s.workflowId ? ` (${s.workflowId})` : ''}${s.llm ? (s.llm.fallback ? ' (fallback)' : ` (${s.llm.provider}/${s.llm.model})`) : ''} | ${s.stage === 'mission-report' ? 'completed' : s.status} | ${s.detail || s.error || (s.stage === 'mission-report' ? 'this report' : '')} |`),
        '',
        '## Artifacts',
        ...this.stages.flatMap(s => s.artifacts.map(a => `- \`${a.path}\` (${a.bytes} bytes)`)),
        '',
        '_Every row above records what actually executed. Swarm rows carry the real',
        'workflow id; LLM rows carry the real provider/model or an explicit fallback flag._',
      ].join('\n');
      this.writeArtifact(entry, 'MISSION_REPORT.md', md);
      // count this report stage as completed — it is finishing successfully now
      entry.detail = `${this.stages.filter(s => s.status === 'completed' || s.stage === 'mission-report').length}/${this.stages.length} stages completed`;
      return summary;
    });
  }

  async run() {
    fs.mkdirSync(this.productDir, { recursive: true });
    await this.publish('factory.mission.started', { idea: this.idea });
    await this.healthCheck();
    await this.missionBrief();
    await this.agentAssignment();
    await this.research();
    await this.build();
    await this.qa();
    await this.docs();
    await this.pack();
    const summary = await this.report();
    await this.publish('factory.mission.completed', { stages: this.stages.length });
    return { runId: this.runId, dir: this.dir, summary };
  }
}

// ── ClipForge Lite scaffold (deterministic local tool) ──────────────────
function buildClipForgeHtml(data, runId) {
  const clipRows = data.clips.map(c => `
        <div class="clip ${c.status}">
          <span class="clip-id">#${c.id}</span>
          <div class="clip-body"><strong>${c.title}</strong><span>${c.angle}</span></div>
          <span class="clip-dur">${c.duration}</span>
          <span class="badge">${c.status.toUpperCase()}</span>
        </div>`).join('');
  const capRows = data.captions.map(c => `<li>${c}</li>`).join('');
  const tagRows = data.hashtags.map(t => `<span class="tag">${t}</span>`).join('');
  const schedRows = data.schedule.map(s => `
        <div class="slot"><span class="day">${s.day}</span><span class="time">${s.slot}</span><span class="ref">clip #${s.clip}</span></div>`).join('');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>ClipForge Lite — generated by PURPCLAW</title>
<style>
  :root { --bg:#0a0612; --panel:#140a20; --line:rgba(217,70,239,.25); --text:#e8d8ff; --accent:#d946ef; --cyan:#22d3ee; --green:#34d399; --mono:'Consolas',monospace; }
  * { box-sizing:border-box; margin:0; }
  body { background:var(--bg); color:var(--text); font-family:system-ui,sans-serif; padding:24px; }
  h1 { font-size:20px; letter-spacing:2px; } h1 em { color:var(--accent); font-style:normal; }
  .sub { color:rgba(232,216,255,.5); font-size:11px; font-family:var(--mono); margin:4px 0 20px; }
  .grid { display:grid; grid-template-columns:1.4fr 1fr; gap:14px; max-width:1100px; }
  .panel { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:14px; }
  .panel h2 { font-size:11px; letter-spacing:2px; color:var(--accent); margin-bottom:10px; font-family:var(--mono); }
  .clip { display:flex; align-items:center; gap:10px; padding:8px; border-bottom:1px solid rgba(255,255,255,.05); }
  .clip-id { color:var(--cyan); font-family:var(--mono); font-size:11px; }
  .clip-body { flex:1; display:flex; flex-direction:column; } .clip-body span { font-size:11px; color:rgba(232,216,255,.55); }
  .clip-dur { font-family:var(--mono); font-size:11px; color:var(--cyan); }
  .badge { font-size:9px; font-family:var(--mono); padding:2px 6px; border-radius:3px; background:rgba(217,70,239,.15); color:var(--accent); }
  .clip.ready .badge { background:rgba(52,211,153,.15); color:var(--green); }
  ul { padding-left:18px; display:flex; flex-direction:column; gap:6px; font-size:13px; }
  .tag { display:inline-block; margin:3px; padding:3px 8px; border:1px solid var(--line); border-radius:12px; font-size:11px; color:var(--cyan); font-family:var(--mono); }
  .slot { display:flex; gap:12px; padding:6px 0; font-family:var(--mono); font-size:12px; border-bottom:1px solid rgba(255,255,255,.05); }
  .day { color:var(--accent); width:36px; } .time { color:var(--cyan); } .ref { color:rgba(232,216,255,.6); }
  button { margin-top:10px; background:linear-gradient(90deg,#d946ef,#a855f7); border:none; border-radius:5px; color:#fff; padding:8px 14px; font-family:var(--mono); font-size:11px; letter-spacing:1px; cursor:pointer; }
  footer { margin-top:18px; font-size:10px; color:rgba(232,216,255,.4); font-family:var(--mono); }
</style>
</head>
<body>
  <h1>CLIPFORGE <em>LITE</em></h1>
  <div class="sub">short-form content planner · generated end-to-end by the PURPCLAW product factory · run ${runId}</div>
  <div class="grid">
    <div class="panel"><h2>CLIP QUEUE</h2>${clipRows}</div>
    <div style="display:flex;flex-direction:column;gap:14px;">
      <div class="panel"><h2>CAPTIONS</h2><ul>${capRows}</ul></div>
      <div class="panel"><h2>HASHTAGS</h2>${tagRows}</div>
      <div class="panel"><h2>SCHEDULE</h2>${schedRows}</div>
      <div class="panel"><h2>EXPORT</h2>
        <div style="font-size:12px;color:rgba(232,216,255,.6)">Download the week's plan as JSON.</div>
        <button onclick="exportPlan()">EXPORT PLAN ⬇</button>
      </div>
    </div>
  </div>
  <footer>demo data only — no platform integrations wired in this build. Generated ${data.generatedAt}.</footer>
  <script>
    function exportPlan() {
      fetch('demo-data.json').then(r => r.json()).then(d => {
        const blob = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'clipforge-plan.json';
        a.click();
      }).catch(() => alert('open via a local server or use demo-data.json directly'));
    }
  </script>
</body>
</html>
`;
}

module.exports = { ProductFactory };
