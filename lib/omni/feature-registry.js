'use strict';

/**
 * OMNI-SURGEON — Phase Two: Feature Registry Builder
 * ────────────────────────────────────────────────────
 * Reads the Phase One truth snapshot and overlays route handlers, PM2 process
 * declarations, public assets, UI declarations, and STRESS evidence to
 * classify every detected feature into one of these states:
 *
 *   active            – wired and reporting live
 *   partial           – some parts work, others missing
 *   missing-wiring    – declared but not connected
 *   failing           – calls return errors or 5xx
 *   blocked-by-dependency – relies on a service that's down
 *   operator-disabled – operator explicitly turned it off
 *   legacy            – superseded by something else but still in tree
 *   external          – depends on a system outside PURPCLAW
 *   planned           – designed/intended but not built
 *
 * Doctrine: do not classify anything as "dead" unless the operator
 * explicitly confirms it. Items marked missing-wiring or partial are
 * NOT amputated — they get a Cycle Two repair target.
 *
 * Output: agent_work/omni/feature-registry.json (machine) + a human
 * summary in the OMNI-SURGEON-PHASE-TWO.md doc.
 *
 * Usage:
 *   node lib/omni/feature-registry.js [--in agent_work/omni/truth-snapshot.json]
 */

const fs = require('fs');
const path = require('path');

const SCHEMA_VERSION = '0.1.0-phase-two';
const STATES = ['active', 'partial', 'missing-wiring', 'failing', 'blocked-by-dependency', 'operator-disabled', 'legacy', 'external', 'planned'];

function readJson(path) {
  try { return JSON.parse(fs.readFileSync(path, 'utf8')); } catch { return null; }
}

function exists(path) {
  try { return fs.existsSync(path); } catch { return false; }
}

function listFeatureCandidatesFromSnapshot(snap) {
  return Array.isArray(snap.features) ? snap.features : [];
}

function classifyByOverlap(feature, indices) {
  // Heuristic classifier. Returns a state plus a reason array.
  const reasons = [];
  const has = (arr) => arr && arr.length > 0;

  // 1. "active" — page + route + service (when applicable)
  if (has(feature.candidates.pages) && (has(feature.candidates.routes) || has(feature.candidates.agents))) {
    reasons.push(`page + ${feature.candidates.routes?.length ? 'route' : 'agent-backing'} both present`);
    return { state: 'active', reasons };
  }

  // 2. "missing-wiring" — page exists but no route/agent backing
  if (has(feature.candidates.pages) && !has(feature.candidates.routes) && !has(feature.candidates.agents) && !has(feature.candidates.components)) {
    reasons.push('page exists but no route, agent, or same-name component');
    return { state: 'missing-wiring', reasons };
  }

  // 3. "partial" — page + some of the others
  if (has(feature.candidates.pages) && (has(feature.candidates.components) || has(feature.candidates.routes))) {
    reasons.push('page exists with partial backing');
    return { state: 'partial', reasons };
  }

  // 4. Default: missing-wiring (we don't classify as 'dead')
  reasons.push('no page entry found — feature candidate from filename match only');
  return { state: 'missing-wiring', reasons };
}

function findLinkedRoute(snap, featureId) {
  // Look in the route manifest for any path that contains the feature id.
  if (!Array.isArray(snap.routes)) return null;
  return snap.routes.find(r => r.urlPath && r.urlPath.toLowerCase().includes(featureId.toLowerCase()));
}

function findLinkedAsset(snap, featureId) {
  if (!Array.isArray(snap.staticAssets)) return null;
  return snap.staticAssets.find(a => a.urlPath && a.urlPath.toLowerCase().includes(featureId.toLowerCase()));
}

function buildRegistry(snap, options = {}) {
  // 1. Pull feature candidates from the scanner output (the seed list).
  // 2. For each, look up the route, asset, agent-backing, and the
  //    declared service(s) that support it.
  // 3. Classify by overlap.
  const featureCandidates = listFeatureCandidatesFromSnapshot(snap);
  const out = [];

  for (const cand of featureCandidates) {
    const id = cand.id;
    const dir = cand.dir;
    const linkedRoute = findLinkedRoute(snap, id);
    const linkedAsset = findLinkedAsset(snap, id);
    const declared = [];
    // mark references to known services (e.g. the "tower" feature in agent_tower/unified_api)
    if (Array.isArray(cand.candidates?.agents) && cand.candidates.agents.length) {
      declared.push({ type: 'agent-backing', sources: cand.candidates.agents });
    }
    if (linkedRoute) declared.push({ type: 'route', path: linkedRoute.urlPath, methods: linkedRoute.methods });
    if (linkedAsset) declared.push({ type: 'static-asset', path: linkedAsset.urlPath });

    // Cross-reference STRESS audit docs for any explicit "operator-disabled"
    // or "marked dead" comments. We never let STRESS silence a feature; we
    // only let STRESS raise flags. This is a placeholder for the operator
    // to inject human-known states.
    const operatorOverrides = options.operatorOverrides || {};
    const override = operatorOverrides[id];

    let state, reasons;
    if (override) {
      state = override.state;
      reasons = override.reasons || [`operator override: ${override.note || 'no note'}`];
    } else {
      const r = classifyByOverlap(cand, cand.candidates);
      state = r.state;
      reasons = r.reasons;
    }

    out.push({
      id,
      dir,
      candidates: cand.candidates,
      declared,
      state,
      reasons,
      // Items needed for the next cycle (Phase Three — Patch Governor):
      actionRequired: state === 'missing-wiring' || state === 'partial',
      // Operator-readable note field, never auto-generated as "dead".
      note: null,
    });
  }

  // 2b. Also add STRESS-mentioned features that the scanner might have
  //     missed. These are listed by the operator's audit material.
  const stressFeatures = options.stressFeatures || [];
  for (const sf of stressFeatures) {
    if (out.find(x => x.id === sf.id)) continue; // already classified
    out.push({
      id: sf.id,
      dir: sf.dir || null,
      candidates: { pages: [], routes: [], components: [], agents: [] },
      declared: [],
      state: sf.suggestedState || 'partial',
      reasons: ['added from STRESS audit material — verify in next cycle'],
      actionRequired: true,
      note: sf.note || null,
    });
  }

  return out;
}

function buildServiceRegistry(snap) {
  if (!Array.isArray(snap.services)) return [];
  return snap.services.map(s => ({
    id: s.id,
    name: s.name,
    declaredIn: s.declaredIn,
    state: s.declaredIn === 'ecosystem.config.js' ? 'active' : 'declared',
    note: s.declaredIn === 'ecosystem.config.js' ? 'PM2-managed; verify with pm2 list' : 'declared in ports registry; verify live with /api/services',
  }));
}

function buildRouteRegistry(snap) {
  if (!Array.isArray(snap.routes)) return [];
  return snap.routes.map(r => ({
    file: r.file,
    urlPath: r.urlPath,
    methods: r.methods,
    state: r.methods.length > 0 ? 'active' : 'partial',
    note: r.methods.length === 0 ? 'no HTTP method exports detected' : null,
  }));
}

function buildStaticAssetRegistry(snap) {
  if (!Array.isArray(snap.staticAssets)) return [];
  return snap.staticAssets.map(a => ({
    file: a.file,
    urlPath: a.urlPath,
    bytes: a.bytes,
    state: 'active',
    note: 'served from /public',
  }));
}

function main() {
  const args = process.argv.slice(2);
  let inPath = null;
  let outPath = null;
  let operatorOverridesPath = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--in' && args[i+1]) { inPath = args[i+1]; i++; }
    else if (args[i] === '--out' && args[i+1]) { outPath = args[i+1]; i++; }
    else if (args[i] === '--operator' && args[i+1]) { operatorOverridesPath = args[i+1]; i++; }
  }
  if (!inPath) inPath = path.join(process.cwd(), 'agent_work', 'omni', 'truth-snapshot.json');
  if (!outPath) outPath = path.join(process.cwd(), 'agent_work', 'omni', 'feature-registry.json');

  const snap = readJson(inPath);
  if (!snap) {
    console.error(`Could not read truth snapshot at ${inPath}. Run lib/omni/truth-scanner.js first.`);
    process.exit(1);
  }
  let operatorOverrides = {};
  if (operatorOverridesPath && exists(operatorOverridesPath)) {
    operatorOverrides = readJson(operatorOverridesPath) || {};
  }

  // The STRESS features that the operator has explicitly listed but the
  // scanner may not have caught via filename matching.
  const stressFeatures = [
    { id: 'OBLITERATUS', dir: 'app/components/AbliteratorPanel.tsx', suggestedState: 'partial', note: 'canned OBLITERATUS routes still in unified_api; pre-prompt compiler is the real command-law layer (different name)' },
    { id: 'api-mega-list', dir: 'app/api/api-mega-list/route.ts', suggestedState: 'partial', note: 'POST is intentionally 403 (use GOOP broker); operator must decide if read-only is right or wire write path' },
    { id: 'GOOP', dir: 'lib/api-mega-list.js', suggestedState: 'partial', note: 'broker/registry for API entries; routes exist; needs operator wiring decision' },
    { id: 'Kimi', dir: 'unified_api.js (kimi/* routes)', suggestedState: 'planned', note: 'Kimi K2 swarm provider; configured in .env; no UI consumer' },
    { id: 'Shaman', dir: '?', suggestedState: 'planned', note: 'no routes or UI detected; needs purpose investigation' },
    { id: 'Security', dir: 'app/api/security/*', suggestedState: 'partial', note: 'security routes exist; may be empty status stubs' },
    { id: 'Sessions', dir: 'unified_api.js (sessions/*)', suggestedState: 'planned', note: 'session routes defined; not wired to real operator/session state' },
    { id: 'Gestures', dir: 'unified_api.js (gestures/*)', suggestedState: 'planned', note: 'gesture routes; needs purpose investigation' },
    { id: 'Mochi', dir: 'app/mochi/page.tsx', suggestedState: 'partial', note: 'page works; some UI elements may show canned state; verify against /api/mochi' },
    { id: 'Voice', dir: 'app/voice/page.tsx', suggestedState: 'failing', note: 'voice-coordinator service was down per /api/services probe; needs voice diagnostic chain' },
    { id: 'Research', dir: 'app/api/research/group/route.ts', suggestedState: 'partial', note: 'route proxies to orchestrator; verify that orchestrator /api/swarm/research is real' },
    { id: 'Narrator', dir: 'app/components/CommandPanel.tsx', suggestedState: 'partial', note: '14 event types narrated have no backend producer; needs publishers added' },
    { id: 'Hooks', dir: '?', suggestedState: 'partial', note: '6 hook polls to non-existent routes; needs routes created or hooks re-pointed' },
  ];

  const registry = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    generatedFrom: inPath,
    cycle: 'OMNI-SURGEON Phase Two — Feature Registry Builder',
    stateVocabulary: STATES,
    readme: {
      doctrine: 'Gated, not gutted. Real, not simulated. Wired, not hidden. Verified, not claimed.',
      note: 'No classification of "dead" — operator-confirmed only. Items in missing-wiring/partial are NOT amputated; they are queue targets for the next cycle.',
    },
    features: buildRegistry(snap, { operatorOverrides, stressFeatures }),
    services: buildServiceRegistry(snap),
    routes: buildRouteRegistry(snap),
    staticAssets: buildStaticAssetRegistry(snap),
    stats: { features: 0, services: 0, routes: 0, assets: 0 },
  };

  // Stats
  const byState = {};
  for (const f of registry.features) byState[f.state] = (byState[f.state] || 0) + 1;
  registry.stats = {
    features: registry.features.length,
    services: registry.services.length,
    routes: registry.routes.length,
    assets: registry.staticAssets.length,
    byFeatureState: byState,
    byServiceState: registry.services.reduce((acc, s) => { acc[s.state] = (acc[s.state] || 0) + 1; return acc; }, {}),
    actionRequired: registry.features.filter(f => f.actionRequired).length,
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(registry, null, 2));
  // Append to JSONL log
  const logPath = path.join(path.dirname(outPath), 'feature-registry.jsonl');
  const logLine = JSON.stringify({ at: registry.generatedAt, stats: registry.stats }) + '\n';
  try { fs.appendFileSync(logPath, logLine); } catch { /* ignore */ }

  console.log(`OMNI-SURGEON Phase Two — Feature Registry Builder`);
  console.log(`  in:      ${inPath}`);
  console.log(`  out:     ${outPath}`);
  console.log(`  ──────`);
  console.log(`  features: ${registry.stats.features}  (action required: ${registry.stats.actionRequired})`);
  console.log(`  by state:`);
  for (const [state, n] of Object.entries(byState)) console.log(`    ${state.padEnd(28)} ${n}`);
  console.log(`  services: ${registry.stats.services}`);
  console.log(`  routes:   ${registry.stats.routes}`);
  console.log(`  assets:   ${registry.stats.assets}`);
  // Safety net: this is the final operation; force-exit so the
  // process does not hang on any leftover open handles.
  setTimeout(() => { try { process.exit(0); } catch (_) {} }, 1500);
}

if (require.main === module) main();
module.exports = { main, buildRegistry, buildServiceRegistry, buildRouteRegistry, buildStaticAssetRegistry, STATES, SCHEMA_VERSION };
