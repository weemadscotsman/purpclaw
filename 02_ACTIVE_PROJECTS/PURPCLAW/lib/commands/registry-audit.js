'use strict';

/**
 * PURPCLAW Registry Audit — Batch 1 of the launch ledger.
 * ---------------------------------------------------------
 * READ-ONLY inspection of every registry surface. Reports conflicts,
 * stale candidates, counts, and recommended actions. NEVER modifies,
 * moves, deletes, or quarantines anything.
 *
 * Usage:
 *   purpclaw registry audit
 *   purpclaw registry audit --json
 *   purpclaw registry audit --output reports/registry-audit.json
 *
 * Registry surfaces audited:
 *   - service_registry.js (runtime services, PM2 names + ports)
 *   - ecosystem.config.js (PM2's own service list)
 *   - lib/capability-registry.js (capability catalog: standby times, deps)
 *   - lib/surface-capabilities.js (user-facing capability surface)
 *   - registry/index.json (ECC skill/agent metadata dump)
 *   - skills/skills_registry.json (companion subset only — drift risk)
 *   - skills/registry.txt (legacy plain-text index)
 *   - skills/ directory (filesystem truth: every skill folder)
 *   - model_registry.json (root) [PURPCLAW/ copy quarantined 2026-06-29]
 *   - app/api/registry/route.ts (web UI registry route scope)
 *   - lib/tools/skills-registry.js (runtime executable tool registry)
 *   - lib/pipeline-registry.js (kernel job/pipeline spine)
 *
 * Output: JSON report written to reports/registry-audit.json
 *         Console: human-readable verdict + conflict list
 */

const fs = require('fs');
const path = require('path');

function readJsonSafe(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    const raw = fs.readFileSync(file, 'utf8');
    if (!raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    return { __error: e.message, __file: file };
  }
}

function readModuleSafe(file) {
  try {
    if (!fs.existsSync(file)) return null;
    delete require.cache[require.resolve(file)];
    return require(file);
  } catch (e) {
    return { __error: e.message, __file: file };
  }
}

function sha256Short(text) {
  // Tiny content fingerprint (not crypto, just for drift detection)
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) - h + text.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function statFile(file) {
  try {
    if (!fs.existsSync(file)) return { exists: false };
    const s = fs.statSync(file);
    return {
      exists: true,
      path: file,
      size: s.size,
      mtime: s.mtime.toISOString(),
      contentHash: sha256Short(fs.readFileSync(file, 'utf8').slice(0, 65536)),
    };
  } catch (e) {
    return { exists: false, error: e.message };
  }
}

function scanSkillsDir(skillsDir) {
  if (!fs.existsSync(skillsDir)) return { count: 0, names: [], error: 'skills/ not found' };
  const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
  const names = [];
  for (const e of entries) {
    if (e.name.startsWith('_') || e.name.startsWith('.')) continue;
    if (e.isDirectory()) names.push(e.name);
  }
  names.sort();
  return { count: names.length, names };
}

function auditServices(ROOT) {
  const serviceReg = readModuleSafe(path.join(ROOT, 'service_registry.js'));
  const ecosystem = readModuleSafe(path.join(ROOT, 'ecosystem.config.js'));
  const capReg = readModuleSafe(path.join(ROOT, 'lib', 'capability-registry.js'));
  const surfaceCaps = readModuleSafe(path.join(ROOT, 'lib', 'surface-capabilities.js'));

  const services = (serviceReg && serviceReg.SERVICES) || [];
  const ecosystemApps = (ecosystem && ecosystem.apps) || (ecosystem && ecosystem.ecosystem && ecosystem.ecosystem.apps) || [];
  const capabilities = capReg && (capReg.CAPABILITIES || capReg.capabilities);
  const surfaceCapabilities = (surfaceCaps && surfaceCaps.CAPABILITIES) || [];

  // Service pm2 names vs ecosystem app names — the canonical PM2-level comparison
  const servicePm2 = new Set(services.map(s => s.pm2).filter(Boolean));
  const ecosystemNames = new Set(ecosystemApps.map(a => a.name));

  const inServicesOnly = [...servicePm2].filter(k => !ecosystemNames.has(k));
  const inEcosystemOnly = [...ecosystemNames].filter(n => !servicePm2.has(n));

  // Service keys vs capability keys
  const capKeys = new Set(Object.keys(capabilities || {}));
  const inServiceNotCap = [...servicePm2].filter(k => !capKeys.has(k));

  // Surface capability ids
  const surfaceIds = new Set(surfaceCapabilities.map(c => c.id));

  return {
    service_registry: {
      file: 'service_registry.js',
      stat: statFile(path.join(ROOT, 'service_registry.js')),
      service_count: services.length,
      services_by_group: services.reduce((acc, s) => {
        const g = s.group || 'ungrouped';
        acc[g] = (acc[g] || 0) + 1;
        return acc;
      }, {}),
      required_count: services.filter(s => s.required).length,
      optional_count: services.filter(s => !s.required).length,
    },
    ecosystem_config: {
      file: 'ecosystem.config.js',
      stat: statFile(path.join(ROOT, 'ecosystem.config.js')),
      app_count: ecosystemApps.length,
    },
    capability_registry: {
      file: 'lib/capability-registry.js',
      stat: statFile(path.join(ROOT, 'lib', 'capability-registry.js')),
      capability_count: capabilities ? Object.keys(capabilities).length : 0,
    },
    surface_capabilities: {
      file: 'lib/surface-capabilities.js',
      stat: statFile(path.join(ROOT, 'lib', 'surface-capabilities.js')),
      capability_count: surfaceCapabilities.length,
    },
    conflicts: {
      in_service_registry_only: inServicesOnly,
      in_ecosystem_only: inEcosystemOnly,
      in_service_registry_not_capability_registry: inServiceNotCap,
      service_pm2: [...servicePm2].sort(),
      ecosystem_names: [...ecosystemNames].sort(),
      capability_keys: [...capKeys].sort(),
      surface_capability_ids: [...surfaceIds].sort(),
    },
    owners: {
      services: 'service_registry.js (authoritative for runtime services)',
      capabilities: 'lib/capability-registry.js (authoritative for standby capabilities)',
      ecosystem: 'ecosystem.config.js (PM2 authoritative — must match service_registry)',
      surface: 'lib/surface-capabilities.js (user-facing capability catalog)',
    },
  };
}

function auditSkills(ROOT) {
  const regIndex = readJsonSafe(path.join(ROOT, 'registry', 'index.json'), null);
  const skillsRegJson = readJsonSafe(path.join(ROOT, 'skills', 'skills_registry.json'), null);
  const skillsRegTxt = (() => {
    try {
      const p = path.join(ROOT, 'skills', 'registry.txt');
      if (!fs.existsSync(p)) return null;
      return fs.readFileSync(p, 'utf8').split('\n').map(l => l.trim()).filter(Boolean);
    } catch { return null; }
  })();
  const scan = scanSkillsDir(path.join(ROOT, 'skills'));

  const indexSkills = (regIndex && regIndex.skills) || [];
  const indexAgents = (regIndex && regIndex.agents) || [];
  const skillsRegJsonKeys = skillsRegJson ? Object.keys(skillsRegJson) : [];

  const indexSet = new Set(indexSkills.map(s => s.name));
  const jsonRegSet = new Set(skillsRegJsonKeys);
  const txtRegSet = new Set(skillsRegTxt || []);
  const scanSet = new Set(scan.names);

  const in_index_only = [...indexSet].filter(n => !scanSet.has(n));
  const in_json_only = [...jsonRegSet].filter(n => !scanSet.has(n));
  const in_txt_only = [...txtRegSet].filter(n => !scanSet.has(n));
  const in_scan_only = [...scanSet].filter(n => !indexSet.has(n) && !jsonRegSet.has(n) && !txtRegSet.has(n));

  // Critical drift: skills_registry.json claims 28 entries but 1,538 exist on disk
  const drift_json_vs_scan = {
    json_count: skillsRegJsonKeys.length,
    scan_count: scan.count,
    delta: scan.count - skillsRegJsonKeys.length,
    severity: skillsRegJsonKeys.length < scan.count * 0.5 ? 'CRITICAL' : (skillsRegJsonKeys.length < scan.count * 0.9 ? 'WARN' : 'OK'),
  };

  return {
    registry_index_json: {
      file: 'registry/index.json',
      stat: statFile(path.join(ROOT, 'registry', 'index.json')),
      total_skills: indexSkills.length,
      total_agents: indexAgents.length,
      updated: (regIndex && regIndex.updated) || null,
    },
    skills_registry_json: {
      file: 'skills/skills_registry.json',
      stat: statFile(path.join(ROOT, 'skills', 'skills_registry.json')),
      count: skillsRegJsonKeys.length,
      sample_keys: skillsRegJsonKeys.slice(0, 10),
    },
    skills_registry_txt: {
      file: 'skills/registry.txt',
      stat: statFile(path.join(ROOT, 'skills', 'registry.txt')),
      count: (skillsRegTxt || []).length,
      sample: (skillsRegTxt || []).slice(0, 10),
    },
    filesystem: {
      directory: 'skills/',
      stat: statFile(path.join(ROOT, 'skills')),
      skill_count: scan.count,
    },
    drift: {
      json_vs_scan: drift_json_vs_scan,
      in_index_only: in_index_only.slice(0, 50),
      in_index_only_count: in_index_only.length,
      in_json_only: in_json_only.slice(0, 50),
      in_json_only_count: in_json_only.length,
      in_txt_only: in_txt_only,
      in_scan_only_count: in_scan_only.length,
    },
    owners: {
      filesystem: 'skills/ directory is the source of truth for what skill folders exist',
      metadata: 'registry/index.json is metadata-only (ECC dump from 2026-05-24, 177 entries)',
      executable: 'lib/tools/skills-registry.js + runtime scanner (registers skills as tools)',
      legacy: 'skills/skills_registry.json + skills/registry.txt now rebuilt from filesystem (379 entries each, maintained by drift-watcher)',
    },
  };
}

function auditAgents(ROOT) {
  let built = null;
  try {
    built = require(path.join(ROOT, 'scripts', 'sync-agents.js')).build();
  } catch (e) {
    built = { __error: e.message, total: 0, agents: [], source_counts: {}, source_audit: {} };
  }
  const generated = readJsonSafe(path.join(ROOT, 'agents', 'AGENT_REGISTRY.json'), null);
  const registryIndex = readJsonSafe(path.join(ROOT, 'registry', 'index.json'), null);
  const generatedTotal = generated && Array.isArray(generated.agents) ? generated.agents.length : 0;
  const indexTotal = registryIndex && Array.isArray(registryIndex.agents) ? registryIndex.agents.length : 0;
  const generatedNames = new Set(((generated && generated.agents) || []).map(a => String(a.key || a.name || '').toLowerCase()));
  const liveNames = new Set((built.agents || []).map(a => String(a.key || a.name || '').toLowerCase()));

  return {
    canonical_registry: {
      file: 'agents/AGENT_REGISTRY.json',
      stat: statFile(path.join(ROOT, 'agents', 'AGENT_REGISTRY.json')),
      total_agents: generatedTotal,
      updated: generated && generated.updated,
    },
    registry_index_json: {
      file: 'registry/index.json',
      total_agents: indexTotal,
    },
    live_build: {
      total_agents: built.total || 0,
      by_type: built.by_type || {},
      by_division: built.by_division || {},
      source_counts: built.source_counts || {},
      source_audit: built.source_audit || {},
    },
    drift: {
      generated_vs_live: (built.total || 0) - generatedTotal,
      registry_index_vs_live: (built.total || 0) - indexTotal,
      in_generated_only: [...generatedNames].filter(n => !liveNames.has(n)),
      in_live_only: [...liveNames].filter(n => !generatedNames.has(n)),
    },
    owners: {
      canonical: 'agents/AGENT_REGISTRY.json is generated machine truth',
      generator: 'scripts/sync-agents.js scans persona, profile, tower, routing, division, and agent-like source files',
      runtime: 'lib/agent-registry.js is the reader for manifest/MCP/CLI consumers',
      legacy: 'agent_profiles.json is the raw swarm input; agents/AGENT_REGISTRY.json (generated by scripts/sync-agents.js) is what runtime readers (MCP, manifest) actually use',
    },
  };
}

function auditModels(ROOT) {
  const root = readJsonSafe(path.join(ROOT, 'model_registry.json'), null);
  const nested = readJsonSafe(path.join(ROOT, 'PURPCLAW', 'model_registry.json'), null);

  const rootStr = root ? JSON.stringify(root, null, 2) : '';
  const nestedStr = nested ? JSON.stringify(nested, null, 2) : '';

  const identical = rootStr && nestedStr && rootStr === nestedStr;

  return {
    root_model_registry: {
      file: 'model_registry.json',
      stat: statFile(path.join(ROOT, 'model_registry.json')),
      routing_keys: root && root.routing ? Object.keys(root.routing) : [],
      default_provider: root && root.defaults ? root.defaults.provider : null,
      fallback: root && root.fallback ? `${root.fallback.provider}/${root.fallback.model}` : null,
    },
    nested_model_registry: {
      file: 'PURPCLAW/model_registry.json',
      stat: statFile(path.join(ROOT, 'PURPCLAW', 'model_registry.json')),
      exists: !!nested,
      content_matches_root: identical,
    },
    conflicts: identical ? [] : ['root and nested model_registry.json differ'],
    owners: {
      root: 'model_registry.json (root) is the authoritative model registry',
      nested: 'PURPCLAW/model_registry.json quarantined 2026-06-29 (was stale copy)',
    },
    recommendation: identical
      ? 'QUARANTINE CANDIDATE: nested copy is byte-identical to root. Move to archive/quarantine/<date>/ to prevent future drift.'
      : 'INVESTIGATE: nested copy differs from root — one of them is wrong.',
  };
}

function auditApiRoute(ROOT) {
  const routePath = path.join(ROOT, 'app', 'api', 'registry', 'route.ts');
  if (!fs.existsSync(routePath)) {
    return { exists: false, file: 'app/api/registry/route.ts' };
  }
  const raw = fs.readFileSync(routePath, 'utf8');
  // Heuristic: count which fields the route exposes
  const exposesSkills = /skill/i.test(raw);
  const exposesTools = /tool/i.test(raw);
  const exposesProviders = /provider/i.test(raw);
  const exposesHivemind = /hivemind/i.test(raw);
  const exposesTasks = /task/i.test(raw);
  return {
    exists: true,
    file: 'app/api/registry/route.ts',
    stat: statFile(routePath),
    likely_exposes: {
      skills: exposesSkills,
      tools: exposesTools,
      providers: exposesProviders,
      hivemind: exposesHivemind,
      tasks: exposesTasks,
    },
    scope_note: 'route exposes runtime tools + providers only; skill metadata and Hivemind state live at separate routes',
  };
}

function auditPipeline(ROOT) {
  const pipe = readModuleSafe(path.join(ROOT, 'lib', 'pipeline-registry.js'));
  return {
    file: 'lib/pipeline-registry.js',
    stat: statFile(path.join(ROOT, 'lib', 'pipeline-registry.js')),
    module_loaded: !!pipe && !pipe.__error,
    error: pipe && pipe.__error,
    note: 'unified pipeline spine — kernel jobs, orchestrator workflows, harness missions all share this contract',
  };
}

function buildRecommendations(audit) {
  const recs = [];

  // SKILLS drift — rebuilt skills_registry.json now matches filesystem truth
  // (delta of 3 = 3 folders without SKILL.md, which is expected — not a hard error)
  if (audit.skills.drift.json_vs_scan.severity === 'CRITICAL') {
    recs.push({
      severity: 'CRITICAL',
      area: 'skills',
      issue: `skills/skills_registry.json declares only ${audit.skills.drift.json_vs_scan.json_count} entries but ${audit.skills.drift.json_vs_scan.scan_count} skill folders exist on disk (delta=${audit.skills.drift.json_vs_scan.delta})`,
      blocks_launch: true,
      human_action_required: true,
    });
  }

  // Stale nested model registry — quarantined 2026-06-29

  // Service vs ecosystem gaps
  if (audit.services.conflicts.in_service_registry_only.length > 0) {
    recs.push({
      severity: 'MEDIUM',
      area: 'services',
      issue: `Services declared in service_registry.js but missing from ecosystem.config.js: ${audit.services.conflicts.in_service_registry_only.join(', ')}`,
      recommendation: 'Add corresponding apps to ecosystem.config.js OR remove from service_registry.js',
      blocks_launch: false,
      human_action_required: true,
    });
  }
  if (audit.services.conflicts.in_ecosystem_only.length > 0) {
    recs.push({
      severity: 'MEDIUM',
      area: 'services',
      issue: `Apps declared in ecosystem.config.js but missing from service_registry.js: ${audit.services.conflicts.in_ecosystem_only.join(', ')}`,
      recommendation: 'Add corresponding entries to service_registry.js OR remove from ecosystem.config.js',
      blocks_launch: false,
      human_action_required: true,
    });
  }

  // Registry.txt is legacy
  if (audit.skills.skills_registry_txt.count > 0 && audit.skills.skills_registry_txt.count < 100) {
    recs.push({
      severity: 'LOW',
      area: 'skills',
      issue: `skills/registry.txt is a legacy plain-text index with only ${audit.skills.skills_registry_txt.count} entries (companion species only)`,
      recommendation: 'Document as legacy; no auto-promotion needed',
      blocks_launch: false,
      human_action_required: false,
    });
  }

  // registry/index.json staleness
  const updated = audit.skills.registry_index_json.updated;
  if (updated) {
    const ageDays = Math.floor((Date.now() - new Date(updated).getTime()) / (1000 * 60 * 60 * 24));
    if (ageDays > 30) {
      recs.push({
        severity: 'LOW',
        area: 'skills',
        issue: `registry/index.json last updated ${ageDays} days ago (${updated}) — ECC metadata snapshot may be stale`,
        recommendation: 'Refresh from upstream ECC registry on next sync window',
        blocks_launch: false,
        human_action_required: false,
      });
    }
  }

  if (audit.agents && audit.agents.drift) {
    if (audit.agents.drift.generated_vs_live !== 0) {
      recs.push({
        severity: 'MEDIUM',
        area: 'agents',
        issue: `agents/AGENT_REGISTRY.json differs from live agent scan by ${audit.agents.drift.generated_vs_live}`,
        recommendation: 'Run npm run sync:agents, then npm run sync:registry',
        blocks_launch: false,
        human_action_required: false,
      });
    }
    if (audit.agents.drift.registry_index_vs_live !== 0) {
      recs.push({
        severity: 'MEDIUM',
        area: 'agents',
        issue: `registry/index.json agent count differs from live agent scan by ${audit.agents.drift.registry_index_vs_live}`,
        recommendation: 'Run npm run sync:registry after syncing agents',
        blocks_launch: false,
        human_action_required: false,
      });
    }
  }

  return recs;
}

function buildReport(root = path.resolve(__dirname, '..', '..')) {
  const ROOT = root;
  const started = new Date().toISOString();

  const audit = {
    schema: 'purpclaw.registry-audit.v1',
    audit_version: 'purpclaw.registry.audit.v1',
    started_at: started,
    root: ROOT,
    mode: 'READ-ONLY',
    services: auditServices(ROOT),
    skills: auditSkills(ROOT),
    agents: auditAgents(ROOT),
    models: auditModels(ROOT),
    api_registry_route: auditApiRoute(ROOT),
    pipeline_registry: auditPipeline(ROOT),
  };

  audit.recommendations = buildRecommendations(audit);
  audit.ended_at = new Date().toISOString();

  // Risk score
  const critCount = audit.recommendations.filter(r => r.severity === 'CRITICAL').length;
  const highCount = audit.recommendations.filter(r => r.severity === 'HIGH').length;
  audit.risk_summary = {
    critical: critCount,
    high: highCount,
    medium: audit.recommendations.filter(r => r.severity === 'MEDIUM').length,
    low: audit.recommendations.filter(r => r.severity === 'LOW').length,
    launch_blockers: audit.recommendations.filter(r => r.blocks_launch).length,
    human_actions_required: audit.recommendations.filter(r => r.human_action_required).length,
    verdict: critCount > 0 ? 'CRITICAL_DRIFT' : (highCount > 0 ? 'HIGH_DRIFT' : (audit.recommendations.length > 0 ? 'REVIEW_RECOMMENDED' : 'CLEAN')),
  };

  audit.truth_owners = {
    service: 'service_registry.js',
    capability: 'lib/capability-registry.js + lib/surface-capabilities.js',
    skill_metadata: 'registry/index.json generated by scripts/sync-registry.js',
    executable_skill_tool: 'lib/tools/skills-registry.js + skills/',
    provider_model: 'model_registry.json + agent_routing_matrix.js',
    agent_metadata: 'agents/AGENT_REGISTRY.json generated by scripts/sync-agents.js',
  };

  audit.findings = audit.recommendations.map(r => ({
    title: `${r.area}: ${r.issue}`,
    risk: String(r.severity || 'LOW').toLowerCase() === 'critical' ? 'high' : String(r.severity || 'LOW').toLowerCase(),
    conflict: ['CRITICAL', 'HIGH', 'MEDIUM'].includes(r.severity),
    recommended_action: r.recommendation,
    blocks_launch: !!r.blocks_launch,
    human_action_required: !!r.human_action_required,
  }));
  if (audit.findings.length === 0) {
    audit.findings.push({
      title: 'agents: canonical registry is in sync',
      risk: 'low',
      conflict: false,
      recommended_action: 'Keep using npm run sync:agents and npm run sync:registry after roster changes',
      blocks_launch: false,
      human_action_required: false,
    });
  }

  const serviceConflicts = audit.services.conflicts.in_service_registry_only.length +
    audit.services.conflicts.in_ecosystem_only.length;
  const agentConflicts = Math.abs(audit.agents.drift.generated_vs_live) + Math.abs(audit.agents.drift.registry_index_vs_live);
  audit.summary = {
    surfaces_inspected: 12,
    findings_total: audit.findings.length,
    conflicts: serviceConflicts + agentConflicts,
    high_risk: audit.findings.filter(f => f.risk === 'high').length,
  };

  return audit;
}

function runAudit(options = {}) {
  const ROOT = options.root || path.resolve(__dirname, '..', '..');
  const outFile = options.output || path.join(ROOT, 'lib', 'reports', 'registry-audit.json');
  const audit = buildReport(ROOT);

  // Write report
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(audit, null, 2));

  return audit;
}

function printHuman(audit) {
  console.log('='.repeat(72));
  console.log('PURPCLAW REGISTRY AUDIT — READ-ONLY');
  console.log('='.repeat(72));
  console.log(`Audit version:  ${audit.audit_version}`);
  console.log(`Root:           ${audit.root}`);
  console.log(`Started:        ${audit.started_at}`);
  console.log(`Ended:          ${audit.ended_at}`);
  console.log(`Mode:           ${audit.mode}  (no mutations performed)`);
  console.log('');

  console.log('─── SERVICES ───');
  console.log(`  service_registry.js:           ${audit.services.service_registry.service_count} services (${audit.services.service_registry.required_count} required, ${audit.services.service_registry.optional_count} optional)`);
  console.log(`  ecosystem.config.js:           ${audit.services.ecosystem_config.app_count} apps`);
  console.log(`  lib/capability-registry.js:    ${audit.services.capability_registry.capability_count} capabilities`);
  console.log(`  lib/surface-capabilities.js:   ${audit.services.surface_capabilities.capability_count} user-facing capabilities`);
  console.log(`  By group:                       ${JSON.stringify(audit.services.service_registry.services_by_group)}`);
  console.log('');

  console.log('─── SKILLS ───');
  console.log(`  registry/index.json:           ${audit.skills.registry_index_json.total_skills} skills + ${audit.skills.registry_index_json.total_agents} agents (updated ${audit.skills.registry_index_json.updated || 'unknown'})`);
  console.log(`  skills/skills_registry.json:   ${audit.skills.skills_registry_json.count} entries  (sample: ${audit.skills.skills_registry_json.sample_keys.join(', ')})`);
  console.log(`  skills/registry.txt:            ${audit.skills.skills_registry_txt.count} entries  (legacy plain-text)`);
  console.log(`  skills/ directory (truth):      ${audit.skills.filesystem.skill_count} skill folders on disk`);
  console.log('');

  console.log('─── AGENTS ───');
  console.log(`  agents/AGENT_REGISTRY.json:    ${audit.agents.canonical_registry.total_agents} agents (updated ${audit.agents.canonical_registry.updated || 'unknown'})`);
  console.log(`  registry/index.json:           ${audit.agents.registry_index_json.total_agents} agents`);
  console.log(`  live generator:                ${audit.agents.live_build.total_agents} agents`);
  console.log(`  source counts:                 ${JSON.stringify(audit.agents.live_build.source_counts)}`);
  console.log(`  agent-like files seen:          ${(audit.agents.live_build.source_audit || {}).files_seen || 0}`);
  console.log(`  generated/live drift:           ${audit.agents.drift.generated_vs_live}`);
  console.log(`  index/live drift:               ${audit.agents.drift.registry_index_vs_live}`);
  console.log('');

  console.log('─── DRIFT ───');
  console.log(`  skills_registry.json vs scan:  ${audit.skills.drift.json_vs_scan.json_count} declared vs ${audit.skills.drift.json_vs_scan.scan_count} on disk — ${audit.skills.drift.json_vs_scan.severity}`);
  console.log(`  In index.json only:             ${audit.skills.drift.in_index_only_count} skills`);
  console.log(`  In skills_registry.json only:   ${audit.skills.drift.in_json_only_count} skills`);
  console.log('');

  console.log('─── MODELS ───');
  console.log(`  model_registry.json (root):     ${audit.models.root_model_registry.stat.exists ? 'exists' : 'MISSING'} (${audit.models.root_model_registry.routing_keys.length} routing keys)`);
  console.log(`  PURPCLAW/model_registry.json:  ${audit.models.nested_model_registry.exists ? 'exists' : 'MISSING'} (content matches root: ${audit.models.nested_model_registry.content_matches_root})`);
  console.log('');

  console.log('─── API ROUTE ───');
  if (audit.api_registry_route.exists) {
    console.log(`  app/api/registry/route.ts:      EXISTS, likely exposes ${Object.entries(audit.api_registry_route.likely_exposes).filter(([k,v]) => v).map(([k]) => k).join(', ')}`);
  } else {
    console.log(`  app/api/registry/route.ts:      MISSING`);
  }
  console.log('');

  console.log('─── PIPELINE ───');
  console.log(`  lib/pipeline-registry.js:       ${audit.pipeline_registry.module_loaded ? 'LOADS OK' : 'FAILED: ' + audit.pipeline_registry.error}`);
  console.log('');

  console.log('─── OWNERS (per reconciliation policy) ───');
  for (const [k, v] of Object.entries(audit.services.owners)) {
    console.log(`  services.${k}: ${v}`);
  }
  for (const [k, v] of Object.entries(audit.skills.owners)) {
    console.log(`  skills.${k}: ${v}`);
  }
  for (const [k, v] of Object.entries(audit.agents.owners)) {
    console.log(`  agents.${k}: ${v}`);
  }
  for (const [k, v] of Object.entries(audit.models.owners)) {
    console.log(`  models.${k}: ${v}`);
  }
  console.log('');

  console.log('─── RECOMMENDATIONS ───');
  if (audit.recommendations.length === 0) {
    console.log('  None — registries are clean.');
  } else {
    for (const r of audit.recommendations) {
      console.log(`  [${r.severity}] ${r.area}: ${r.issue}`);
      console.log(`     → ${r.recommendation}`);
      if (r.blocks_launch) console.log(`     ⚠ BLOCKS LAUNCH`);
      if (r.human_action_required) console.log(`     ⚠ HUMAN ACTION REQUIRED`);
    }
  }
  console.log('');

  console.log('─── RISK SUMMARY ───');
  console.log(`  Critical:        ${audit.risk_summary.critical}`);
  console.log(`  High:            ${audit.risk_summary.high}`);
  console.log(`  Medium:          ${audit.risk_summary.medium}`);
  console.log(`  Low:             ${audit.risk_summary.low}`);
  console.log(`  Launch blockers: ${audit.risk_summary.launch_blockers}`);
  console.log(`  Verdict:         ${audit.risk_summary.verdict}`);
  console.log('');

  console.log(`Report written: ${path.join(audit.root, 'lib', 'reports', 'registry-audit.json')}`);
  console.log('');
  console.log('HARD RULE: This audit is READ-ONLY. No quarantine, move, delete, or rewrite performed.');
  console.log('Review recommendations, then approve quarantine actions explicitly.');
}

// ---------- CLI ----------

function help() {
  return `PURPCLAW Registry Audit — read-only

Usage:
  purpclaw registry audit
  purpclaw registry audit --json
  purpclaw registry audit --output <file>

Surfaces audited:
  service_registry.js, ecosystem.config.js, lib/capability-registry.js,
  lib/surface-capabilities.js, registry/index.json, agents/AGENT_REGISTRY.json,
  skills/skills_registry.json, skills/registry.txt, skills/ directory, model_registry.json + nested copy,
  app/api/registry/route.ts, lib/pipeline-registry.js

Hard rule: READ-ONLY. No quarantine, move, delete, or rewrite.
`;
}

async function run(args = [], ctx = {}) {
  const PURP_DIR = ctx.PURP_DIR || path.resolve(__dirname, '..', '..');
  const [subRaw] = args;
  const sub = (!subRaw || subRaw.startsWith('-')) ? 'audit' : subRaw.toLowerCase();
  const rest = subRaw && subRaw.startsWith('-') ? args : args.slice(1);

  if (sub === 'help' || sub === '--help' || sub === '-h') {
    console.log(help());
    return { ok: true };
  }
  if (sub === 'audit') {
    const asJson = rest.includes('--json');
    const outputIdx = rest.indexOf('--output');
    const output = outputIdx >= 0 ? rest[outputIdx + 1] : null;
    const audit = runAudit({ root: PURP_DIR, output: output ? path.join(PURP_DIR, output) : null });
    if (asJson) {
      console.log(JSON.stringify(audit, null, 2));
    } else {
      printHuman(audit);
    }
    // Exit 0 always — audit is informational, never a hard failure
    audit.hivemind_trace = {
      run_id: `registry-audit-${Date.now()}`,
      mode: 'read-only',
    };
    return audit;
  }

  console.log(help());
  throw new Error(`Unknown registry command: ${sub}`);
}

module.exports = { run, runAudit, buildReport, printHuman };

if (require.main === module) {
  const PURP_DIR = path.resolve(__dirname, '..', '..');
  const args = process.argv.slice(2);
  run(args, { PURP_DIR }).catch(e => {
    console.error('Audit crashed:', e.message);
    process.exit(2);
  });
}
