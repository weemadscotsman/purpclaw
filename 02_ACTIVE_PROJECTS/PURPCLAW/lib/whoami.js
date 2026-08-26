'use strict';
/**
 * lib/whoami.js — PurpClaw Self-Introspection
 *
 * When asked "who or what are you?", this is the answer.
 * Polls every live subsystem and builds a holistic self-portrait.
 *
 *   purpclaw whoami          — full identity report
 *   purpclaw whoami --short  — one-liner
 *   purpclaw whoami --json   — machine-readable
 *
 * The system introspects itself: it doesn't just describe what it is,
 * it proves it by checking what's actually running and available.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const PURP_DIR = path.resolve(__dirname, '..');

async function whoami(opts = {}) {
  const self = {
    name: 'PurpClaw',
    tagline: 'The local-first AI workstation OS',
    version: 'unknown',
    personality: 'Scottish-adjacent working-class AI with a raccoon QA department, a purple crab mascot, and no patience for fake metrics.',
    motto: 'Your box. Your data. Your AI.',
    founding: 'Built by one person who got tired of every AI tool being a half-finished SaaS with a pitch deck.',
  };

  // Get version
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(PURP_DIR, 'package.json'), 'utf8'));
    self.version = pkg.version || 'unknown';
  } catch {}

  // ── Surfaces ──
  self.surfaces = {
    cli: { exists: true, command: 'purpclaw', help: 'purpclaw help' },
    tui: { exists: fs.existsSync(path.join(PURP_DIR, 'bin', 'purpclaw-tui')) || fs.existsSync(path.join(PURP_DIR, 'purpconsole')), command: 'purpclaw tui' },
    webui: { exists: false, url: 'http://localhost:3000' },
    pocket: { exists: fs.existsSync(path.join(PURP_DIR, 'pocket', 'START_HERE.bat')), command: 'purpclaw pocket start' },
  };

  // Probe WebUI
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 2000);
    const res = await fetch('http://127.0.0.1:3000', { signal: controller.signal });
    clearTimeout(t);
    self.surfaces.webui.exists = res.ok;
  } catch {}

  // ── Core Systems ──
  self.systems = {
    runtime: {
      name: 'PurpClaw Runtime',
      description: 'Self-hosted Node.js runtime with 17-provider LLM router, event bus, state store, and service orchestration.',
      status: 'unknown',
      port: 7780,
    },
    agents: {
      name: 'Agent Tower',
      description: '35+ deployable agents across 8 divisions. Each agent can use 176 tools. Duck, Goose, Owl, Wolf, Phoenix, Turtle, Mantis, Crow, Moth, Fox, and more.',
      status: 'unknown',
      port: 7790,
    },
    memory: {
      name: 'Cognitive Spine',
      description: '7-layer memory system: episodic, semantic, procedural, symbolic, temporal, counterfactual, emotional. 6 engines on one port (:7880).',
      status: 'unknown',
      port: 7880,
    },
    tools: {
      name: 'Tool Registry',
      description: '176 loadable tools: 77 native + 99 skill-backed. Code execution, file ops, search, data analysis, MCP, voice, vision, PC control.',
      status: 'unknown',
      count: 0,
    },
    skills: {
      name: 'Skill Registry',
      description: '380 skill directories, 376 manifests, 101 with executable code. Skills with missing optional deps return install guidance instead of crashing.',
      status: 'unknown',
      count: 0,
    },
    providers: {
      name: 'Provider Router',
      description: '17 LLM providers: Ollama, OpenAI, Anthropic, Gemini, DeepSeek, Groq, Mistral, MiniMax, OpenRouter, GitHub Models, NVIDIA NIM, xAI, Together, Codex, Atomic Chat, Local Controller, custom endpoints. Per-job routing, hot-swap mid-session.',
      status: 'unknown',
      count: 17,
    },
    security: {
      name: 'SpendGate + Vault',
      description: 'Encrypted vault (AES-256-GCM, PBKDF2 200K iterations, atomic writes, recovery key, audit log, file locking). SpendGate (per-request/daily/monthly caps, per-agent caps, per-provider caps, rate limits, concurrent-safe).',
      status: 'unknown',
    },
    identity: {
      name: 'Portable Identity',
      description: 'Export/import/diff your entire configuration: profile, style, memory, providers, budget, agents, skills, routing, preferences. The USB carries you, not just software.',
      status: 'unknown',
    },
    harvester: {
      name: 'Data Harvester',
      description: 'Scans drives, fingerprints duplicates, classifies by type, extracts text (PDF, DOCX, XLSX, code, OCR), converts to training data, indexes for search. "The claw eats your hard drives."',
      status: 'unknown',
    },
    pocket: {
      name: 'Pocket OS',
      description: 'USB-portable AI environment. Launcher, environment detector, mode selector (offline/hybrid/cloud), provider setup wizard, SpendGate, audio guide, signed updater, recovery mode.',
      status: 'unknown',
    },
    signing: {
      name: 'Release Signing',
      description: 'Ed25519 keypair generation, manifest signing, signature verification. purpclaw release keygen|sign|verify.',
      status: 'unknown',
    },
  };

  // ── Probe live services ──
  const probes = [
    { key: 'runtime', port: 7780, path: '/api/health' },
    { key: 'agents', port: 7790, path: '/tower/status' },
    { key: 'memory', port: 7880, path: '/cognitive/health' },
  ];
  for (const p of probes) {
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`http://127.0.0.1:${p.port}${p.path}`, { signal: controller.signal });
      clearTimeout(t);
      self.systems[p.key].status = res.ok ? 'online' : 'responding';
    } catch {
      self.systems[p.key].status = 'offline';
    }
  }

  // ── Tool/Skill counts ──
  try {
    const tools = require('./tools/index');
    const list = tools.list();
    self.systems.tools.count = list.length;
    self.systems.tools.status = list.length > 0 ? `${list.length} registered` : 'empty';
  } catch {}
  try {
    const skillsReg = require('./tools/skills-registry');
    const skills = skillsReg.scanSkills();
    self.systems.skills.count = skills.length;
    const health = skillsReg.getSkillHealth();
    self.systems.skills.status = `${skills.length} dirs` + (health.degraded_count > 0 ? `, ${health.degraded_count} degraded` : '');
  } catch {}

  // ── Security checks ──
  const pocketDir = process.env.POCKET_DIR || path.join(os.homedir(), '.purpclaw', 'pocket');
  const vaultPath = path.join(pocketDir, 'vault.enc');
  if (fs.existsSync(vaultPath)) {
    self.systems.security.status = 'vault present';
    try {
      const v = JSON.parse(fs.readFileSync(vaultPath, 'utf8'));
      self.systems.security.status = v.data ? 'encrypted, locked' : 'vault file exists';
    } catch { self.systems.security.status = 'vault file present'; }
  } else {
    self.systems.security.status = 'no vault (run `purpclaw pocket vault init`)';
  }

  // ── Identity check ──
  const identityPath = path.join(pocketDir, 'identity.json');
  if (fs.existsSync(identityPath)) {
    try {
      const id = JSON.parse(fs.readFileSync(identityPath, 'utf8'));
      self.systems.identity.status = id.profile?.name ? `configured for ${id.profile.name}` : 'default profile';
    } catch { self.systems.identity.status = 'identity file present'; }
  } else {
    self.systems.identity.status = 'default (no custom identity yet)';
  }

  // ── Pocket OS check ──
  const launchers = ['START_HERE.bat', 'START_HERE.sh', 'START_HERE.command'];
  const pocketDir2 = path.join(PURP_DIR, 'pocket');
  const foundLaunchers = launchers.filter(f => fs.existsSync(path.join(pocketDir2, f)));
  self.systems.pocket.status = foundLaunchers.length > 0
    ? `${foundLaunchers.length} launchers ready`
    : 'not packaged';

  // ── Signing check ──
  const keysDir = path.join(os.homedir(), '.purpclaw', 'keys');
  if (fs.existsSync(path.join(keysDir, 'public.pem'))) {
    self.systems.signing.status = 'keypair present';
  } else {
    self.systems.signing.status = 'no keypair (run `purpclaw release keygen`)';
  }

  // ── Harvester check ──
  const indexPath = path.join(PURP_DIR, 'agent_work', 'harvest-index.json');
  if (fs.existsSync(indexPath)) {
    try {
      const idx = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
      self.systems.harvester.status = idx.files ? `${idx.files.length} files indexed` : 'index present';
    } catch { self.systems.harvester.status = 'index present'; }
  } else {
    self.systems.harvester.status = 'not run yet (run `purpclaw harvest run`)';
  }

  return self;
}

function formatText(self) {
  const lines = [];
  lines.push('');
  lines.push('  ╔════════════════════════════════════════════════════╗');
  lines.push(`  ║  🦀  ${self.name}  v${self.version.padEnd(16)}  ║`);
  lines.push('  ║  ' + self.tagline.padEnd(42) + '  ║');
  lines.push('  ╚════════════════════════════════════════════════════╝');
  lines.push('');
  lines.push(`  "${self.motto}"`);
  lines.push(`  ${self.personality}`);
  lines.push(`  ${self.founding}`);
  lines.push('');

  // Surfaces
  lines.push('  ── SURFACES ──');
  const surfaceIcons = { cli: '⌨️', tui: '🖥️', webui: '🌐', pocket: '💾' };
  for (const [key, surf] of Object.entries(self.surfaces)) {
    const icon = surfaceIcons[key] || '  ';
    const status = surf.exists ? '✅' : '⚠ offline';
    const cmd = surf.command || surf.url || '';
    lines.push(`  ${icon} ${key.toUpperCase()}: ${status}  ${cmd}`);
  }
  lines.push('');

  // Systems
  lines.push('  ── SYSTEMS ──');
  for (const [key, sys] of Object.entries(self.systems)) {
    const icon = sys.status === 'online' || sys.status?.includes('ready') || sys.status?.includes('registered') ? '✅' :
                 sys.status === 'offline' ? '❌' : '⚫';
    const count = sys.count ? ` (${sys.count})` : '';
    lines.push(`  ${icon} ${sys.name}${count}`);
    lines.push(`     ${sys.description.substring(0, 90)}`);
    if (sys.status && sys.status !== 'unknown') {
      lines.push(`     Status: ${sys.status}`);
    }
    lines.push('');
  }

  // How to use
  lines.push('  ── HOW TO USE ──');
  lines.push('  Start here:   purpclaw help');
  lines.push('  Check health: purpclaw doctor');
  lines.push('  Deep audit:   purpclaw audit deep --fast');
  lines.push('  Chat:         purpclaw ask "what can you do?"');
  lines.push('  Agents:       purpclaw ask duck "analyze this project"');
  lines.push('  Pocket:       purpclaw pocket start');
  lines.push('  Identity:     purpclaw identity show');
  lines.push('  Vault:        purpclaw pocket vault init');
  lines.push('  Harvest:      purpclaw harvest run');
  lines.push('  Release:      purpclaw release keygen');
  lines.push('  Dashboard:    http://localhost:3000');
  lines.push('');

  return lines.join('\n');
}

module.exports = { whoami, whoamiFull, formatText };

/**
 * Full census snapshot — extends whoami() with live counts the UI panels
 * consume (/api/breakdown, /api/whoami): tool breakdown by kind, tower
 * divisions/active agents, configured providers, unifiedApi surface info.
 */
async function whoamiFull() {
  const base = await whoami();
  // Tool/skill breakdown by prefix convention
  try {
    const tools = require('./tools/index');
    const all = tools.list();
    base.systems.tools.total = all.length;
    base.systems.tools.breakdown = {
      core:       all.filter(t => !t.name.startsWith('skill_') && !t.name.startsWith('mcp__') && !t.name.startsWith('body_bridge_') && !t.name.startsWith('nim_')).length,
      skills:     all.filter(t => t.name.startsWith('skill_')).length,
      mcp:        all.filter(t => t.name.startsWith('mcp__')).length,
      bodyBridge: all.filter(t => t.name.startsWith('body_bridge_')).length,
      nim:        all.filter(t => t.name.startsWith('nim_')).length,
    };
    base.systems.skills.count = base.systems.tools.breakdown.skills;
  } catch {}
  // Agent Tower live counts
  base.surfaces.agentTower = { ok: false, divisions: 0, active: 0 };
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 2000);
    const res = await fetch('http://127.0.0.1:7790/tower/status', { signal: controller.signal });
    clearTimeout(t);
    if (res.ok) {
      const j = await res.json();
      const divs = j.divisions && typeof j.divisions === 'object' && !Array.isArray(j.divisions)
        ? Object.keys(j.divisions).length
        : (Array.isArray(j.teams) ? j.teams.length : 0);
      base.surfaces.agentTower = {
        ok: true,
        divisions: divs,
        divisionDetail: j.divisions || null,
        active: j.activeAgents ?? (Array.isArray(j.activeAgents) ? j.activeAgents.length : 0),
      };
    }
  } catch {}
  // Configured providers (env-key presence over registered catalog)
  let present = [];
  try {
    const { PROVIDERS } = require('./llm-provider.js');
    const envMap = {
      minimax: 'MINIMAX_API_KEY', openrouter: 'OPENROUTER_API_KEY',
      deepseek: 'DEEPSEEK_API_KEY', nvidia: 'NIM_API_KEY', nvidiaNim: 'NIM_API_KEY',
      openai: 'OPENAI_API_KEY', anthropic: 'ANTHROPIC_API_KEY', gemini: 'GEMINI_API_KEY',
      groq: 'GROQ_API_KEY', mistral: 'MISTRAL_API_KEY', moonshot: 'MOONSHOT_API_KEY',
      xai: 'XAI_API_KEY', together: 'TOGETHER_API_KEY',
    };
    const names = PROVIDERS ? (PROVIDERS instanceof Map ? [...PROVIDERS.keys()] : Object.keys(PROVIDERS)) : [];
    present = names.filter(n => {
      const envName = envMap[n];
      return envName ? !!process.env[envName] : ['ollama', 'lmstudio'].includes(n);
    });
  } catch {}
  base.systems.providers = base.systems.providers || {};
  base.systems.providers.present = present;
  // Unified API surface (we ARE the process being asked)
  base.surfaces.unifiedApi = {
    ok: true,
    uptime: Math.round(process.uptime()),
    memoryMB: Math.round(process.memoryUsage().rss / 1048576),
  };
  base.systems.routes = base.systems.routes || { total: 0 };
  return base;
}

// CLI mode
if (require.main === module) {
  (async () => {
    const opts = {};
    for (const a of process.argv.slice(2)) {
      if (a === '--short') opts.short = true;
      else if (a === '--json') opts.json = true;
    }
    const self = await whoami(opts);
    if (opts.json) {
      console.log(JSON.stringify(self, null, 2));
    } else if (opts.short) {
      console.log(`${self.name} v${self.version} — ${self.tagline}. ${self.surfaces.cli.command}, ${self.surfaces.webui.exists ? self.surfaces.webui.url : 'run purpclaw pocket start'}.`);
    } else {
      console.log(formatText(self));
    }
  })();
}
