'use strict';
/**
 * lib/runtime/settings-registry.js — the PURPCLAW Settings OS core.
 *
 * One typed registry for EVERY tweakable knob in the stack. No more
 * settings hidden inside components. Each setting declares:
 *
 *   key       unique id (dot-namespaced: 'providers.main', 'spend.dailyTokenCap')
 *   label     human name
 *   category  core | providers | agents | voice | ui | safety | goop | memory | visuals | spend | ports
 *   type      'string' | 'number' | 'boolean' | 'enum' | 'secret'
 *   scope     'env'   — persisted to .env, read by process.env (restart to apply to PM2 services)
 *             'spend' — persisted to ~/.purpclaw/pocket/spend-config.json (live)
 *             'user'  — persisted to ~/.purpclaw/settings.json (live for readers of this module)
 *   env       backing env var name (scope 'env')
 *   path      dot-path inside the backing JSON (scope 'spend'/'user')
 *   options   enum choices
 *   help      one-liner shown in UI
 *   restart   true → PM2 services must restart to pick it up
 *
 * API: list(filter) / get(key) / set(key, value) / search(q) / modified()
 *      exportAll() / importAll(obj) / presets
 *
 * Secrets are never returned raw — only { set: true, hint: 'sk-…abc' }.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const ENV_PATH = path.join(process.cwd(), '.env');
const USER_SETTINGS_PATH = path.join(os.homedir(), '.purpclaw', 'settings.json');

let spendGate = null;
function spendPaths() {
  try {
    if (!spendGate) spendGate = require('../spend-gate');
    return { configPath: spendGate.configPath() };
  } catch { return { configPath: path.join(os.homedir(), '.purpclaw', 'pocket', 'spend-config.json') }; }
}

// ── The catalog ───────────────────────────────────────────────────────────────

const CATALOG = [
  // ── core ──
  { key: 'core.provider', label: 'Primary LLM provider', category: 'core', type: 'enum', scope: 'env', env: 'LLM_PROVIDER', restart: true,
    options: ['minimax', 'anthropic', 'gemini', 'openai', 'kimi', 'groq', 'deepseek', 'openrouter', 'nvidia', 'huggingface', 'cloudflare', 'github-models', 'codex', 'codex-oauth', 'atomic-chat', 'together', 'mistral', 'ollama', 'lmstudio', 'custom'],
    help: 'Which provider the brain calls first. Set to github-models for free LLM access via GitHub PAT.' },
  { key: 'core.model', label: 'Primary model', category: 'core', type: 'string', scope: 'env', env: 'LLM_MODEL', restart: true,
    help: 'e.g. MiniMax-M2.7, deepseek-v4-pro, claude-opus-4-8.' },
  { key: 'core.swarmProvider', label: 'Swarm provider', category: 'core', type: 'string', scope: 'env', env: 'SWARM_PROVIDER', restart: true,
    help: 'Provider for heavy multi-agent reasoning (empty = same as primary).' },
  { key: 'core.swarmModel', label: 'Swarm model', category: 'core', type: 'string', scope: 'env', env: 'SWARM_MODEL', restart: true,
    help: 'Model for swarm work (empty = primary model).' },
  { key: 'core.pythonBin', label: 'Python binary', category: 'core', type: 'string', scope: 'env', env: 'PYTHON_BIN', restart: true,
    help: 'Path to Python 3.11 (auto-detected if empty).' },

  // ── providers (keys are secrets) ──
  { key: 'providers.llmKey', label: 'Primary API key', category: 'providers', type: 'secret', scope: 'env', env: 'LLM_API_KEY', restart: true, help: 'Key for the primary provider.' },
  { key: 'providers.minimaxKey', label: 'MiniMax key', category: 'providers', type: 'secret', scope: 'env', env: 'MINIMAX_API_KEY', restart: true, help: '' },
  { key: 'providers.deepseekKey', label: 'DeepSeek key', category: 'providers', type: 'secret', scope: 'env', env: 'DEEPSEEK_API_KEY', restart: true, help: '' },
  { key: 'providers.openrouterKey', label: 'OpenRouter key', category: 'providers', type: 'secret', scope: 'env', env: 'OPENROUTER_API_KEY', restart: true, help: 'Powers free-model research lenses.' },
  { key: 'providers.nvidiaKey', label: 'NVIDIA key', category: 'providers', type: 'secret', scope: 'env', env: 'NVIDIA_API_KEY', restart: true, help: 'Free NIM endpoints.' },
  { key: 'providers.kimiKey', label: 'Kimi/Moonshot key', category: 'providers', type: 'secret', scope: 'env', env: 'KIMI_API_KEY', restart: true, help: '' },
  { key: 'providers.anthropicKey', label: 'Anthropic key', category: 'providers', type: 'secret', scope: 'env', env: 'ANTHROPIC_API_KEY', restart: true, help: '' },
  { key: 'providers.geminiKey', label: 'Gemini key', category: 'providers', type: 'secret', scope: 'env', env: 'GEMINI_API_KEY', restart: true, help: '' },
  // ── GitHub Models (free tier, OpenAI-compatible) ──
  { key: 'providers.githubModelsToken', label: 'GitHub Models token', category: 'providers', type: 'secret', scope: 'env', env: 'GITHUB_MODELS_TOKEN', restart: true,
    hint: 'ghp_...', help: 'Fine-grained PAT with models:read at https://github.com/settings/personal-access-tokens. Also reads GITHUB_TOKEN.' },
  { key: 'providers.githubModelsModel', label: 'GitHub Models default model', category: 'providers', type: 'string', scope: 'env', env: 'GITHUB_MODELS_MODEL', restart: false,
    hint: 'openai/gpt-4o-mini', help: 'Model ID from https://models.github.ai/catalog/models (e.g. openai/gpt-4.1, meta/llama-3.1-70b). Free tier is rate-limited.' },
  { key: 'providers.allowMinimaxChat', label: 'Allow MiniMax chat backend', category: 'providers', type: 'boolean', scope: 'env', env: 'PURPCLAW_ALLOW_MINIMAX_CHAT_BACKEND', restart: true,
    help: 'Let the chat lane use the MiniMax token plan.' },

  // ── safety ──
  { key: 'safety.approvalMode', label: 'Approval mode', category: 'safety', type: 'enum', scope: 'env', env: 'PURPCLAW_APPROVAL_MODE', restart: false,
    options: ['read-only', 'workspace-write', 'danger-full-access'],
    help: 'Codex-style sandbox preset enforced on every tool call.' },
  { key: 'safety.structuredTools', label: 'Structured tool calling', category: 'safety', type: 'boolean', scope: 'env', env: 'PURPCLAW_STRUCTURED_TOOLS', restart: false,
    help: 'Provider-native tool_use/function_call instead of regex parsing.' },
  { key: 'safety.pocketMode', label: 'SpendGate enforcement', category: 'safety', type: 'boolean', scope: 'env', env: 'POCKET_MODE', restart: false,
    help: 'Enforce token budgets on every chat AND stream call.' },
  { key: 'safety.redaction', label: 'Secret redaction', category: 'safety', type: 'boolean', scope: 'env', env: 'PURPCLAW_NO_REDACT', invert: true, restart: false,
    help: 'Mask API keys/JWTs/tokens in all console output.' },

  // â”€â”€ Windows resident app + computer use â”€â”€
  { key: 'windows.startCoreAtBoot', label: 'Start core at Windows boot', category: 'core', type: 'boolean', scope: 'user', path: 'windows.startCoreAtBoot', default: true,
    help: 'Reflects the intended Windows service configuration. Apply with scripts/windows/install.ps1.' },
  { key: 'windows.startTrayAtLogon', label: 'Start tray at logon', category: 'core', type: 'boolean', scope: 'user', path: 'windows.startTrayAtLogon', default: true,
    help: 'Keep PurpClaw controls and interactive desktop access in the notification area.' },
  { key: 'windows.notifications', label: 'Desktop notifications', category: 'ui', type: 'boolean', scope: 'user', path: 'windows.notifications', default: true,
    help: 'Show mission and approval notifications from the tray process.' },
  { key: 'computerUse.enabled', label: 'Computer use enabled', category: 'safety', type: 'boolean', scope: 'user', path: 'computerUse.enabled', default: false,
    help: 'Master switch for interactive screen, mouse, keyboard, and window tools.' },
  { key: 'computerUse.mode', label: 'Computer use mode', category: 'safety', type: 'enum', scope: 'user', path: 'computerUse.mode', default: 'observe',
    options: ['off', 'observe', 'assist', 'autonomous'],
    help: 'Observe reads the desktop. Assist requires approval for input. Autonomous permits routine input but not destructive system actions.' },
  { key: 'computerUse.captureVision', label: 'Analyze screenshots with vision', category: 'safety', type: 'boolean', scope: 'user', path: 'computerUse.captureVision', default: false,
    help: 'Send captured screenshots to the configured vision-capable provider. Off keeps capture local.' },

  // ── inference parameters (live — merged into every model call as defaults) ──
  { key: 'params.temperature', label: 'Temperature', category: 'params', type: 'number', scope: 'user', path: 'params.temperature', default: 0.7,
    help: 'Creativity/randomness. 0 = precise, 2 = wild.' },
  { key: 'params.topP', label: 'Top P', category: 'params', type: 'number', scope: 'user', path: 'params.topP', default: 1,
    help: 'Nucleus sampling. 0.1 = focused, 1 = full.' },
  { key: 'params.maxTokens', label: 'Max tokens', category: 'params', type: 'number', scope: 'user', path: 'params.maxTokens', default: 4096,
    help: 'Maximum response length (256–16384).' },
  { key: 'params.frequencyPenalty', label: 'Frequency penalty', category: 'params', type: 'number', scope: 'user', path: 'params.frequencyPenalty', default: 0,
    help: 'Reduce repetition. 0 = none, 2 = strong.' },
  { key: 'params.presencePenalty', label: 'Presence penalty', category: 'params', type: 'number', scope: 'user', path: 'params.presencePenalty', default: 0,
    help: 'Encourage new topics. 0 = none, 2 = strong.' },

  // ── Liquid Response (delivery layer — progressive best-of-N) ──
  { key: 'liquid.enabled', label: 'Liquid Response', category: 'liquid', type: 'boolean', scope: 'user', path: 'liquid.enabled', default: false,
    help: 'Show the best response so far immediately, morphing as higher-scoring results arrive.' },
  { key: 'liquid.minImprovement', label: 'Min improvement', category: 'liquid', type: 'number', scope: 'user', path: 'liquid.minImprovement', default: 8,
    help: 'Score points a new leader must beat the current by (1–50).' },
  { key: 'liquid.maxAttempts', label: 'Max attempts', category: 'liquid', type: 'number', scope: 'user', path: 'liquid.maxAttempts', default: 4,
    help: 'Refinement passes to try (1–10).' },
  { key: 'liquid.targetQuality', label: 'Target quality', category: 'liquid', type: 'number', scope: 'user', path: 'liquid.targetQuality', default: 85,
    help: 'Crystallize when a response reaches this score (60–100).' },

  // ── AutoTune (context-aware parameter optimization; lib/autotune.js) ──
  { key: 'autotune.enabled', label: 'AutoTune', category: 'strategy', type: 'boolean', scope: 'user', path: 'autotune.enabled', default: false,
    help: 'Auto-detect context (code/creative/analytical/chat) and optimize parameters per message.' },
  { key: 'autotune.strategy', label: 'AutoTune strategy', category: 'strategy', type: 'enum', scope: 'user', path: 'autotune.strategy', default: 'adaptive',
    options: ['adaptive', 'code', 'creative', 'analytical', 'chat'],
    help: 'Adaptive auto-detects; the others pin a single context profile.' },

  // ── spend (live JSON — no restart) ──
  { key: 'spend.dailyTokenCap', label: 'Daily token cap', category: 'spend', type: 'number', scope: 'spend', path: 'dailyTokenCap', help: 'Hard daily ceiling across all providers.' },
  { key: 'spend.monthlyTokenCap', label: 'Monthly token cap', category: 'spend', type: 'number', scope: 'spend', path: 'monthlyTokenCap', help: '' },
  { key: 'spend.perRequestCap', label: 'Per-request token cap', category: 'spend', type: 'number', scope: 'spend', path: 'perRequestCap', help: 'Max tokens a single request may reserve.' },
  { key: 'spend.maxRequestsPerMinute', label: 'Requests / minute', category: 'spend', type: 'number', scope: 'spend', path: 'maxRequestsPerMinute', help: '' },
  { key: 'spend.maxRequestsPerDay', label: 'Requests / day', category: 'spend', type: 'number', scope: 'spend', path: 'maxRequestsPerDay', help: '' },
  { key: 'spend.killOnBreach', label: 'Kill agents on breach', category: 'spend', type: 'boolean', scope: 'spend', path: 'killOnBreach', help: 'Hard-stop runaway agents at the cap.' },

  // ── pre-prompt compiler (command-law layer) ──
  { key: 'preprompt.enabled', label: 'Pre-prompt compiler', category: 'core', type: 'boolean', scope: 'user', path: 'preprompt.enabled', default: true,
    help: 'Compile the active operating profile (mode, refusal policy, honesty law) into every chat/agent/swarm system prompt.' },
  { key: 'preprompt.activeProfile', label: 'Operating profile', category: 'core', type: 'enum', scope: 'user', path: 'preprompt.activeProfile', default: 'default',
    options: ['default', 'build', 'research', 'swarm', 'creative', 'debug', 'safe'],
    help: 'Which command-law profile steers the stack before each model call.' },

  // ── agents ──
  { key: 'agents.maxTurns', label: 'Max agent-loop turns', category: 'agents', type: 'number', scope: 'user', path: 'agents.maxTurns', default: 10, help: 'Tool-call round-trips per request.' },
  { key: 'agents.temperature', label: 'Agent temperature', category: 'agents', type: 'number', scope: 'user', path: 'agents.temperature', default: 0.2, help: '' },
  { key: 'agents.maxTokens', label: 'Agent max tokens', category: 'agents', type: 'number', scope: 'user', path: 'agents.maxTokens', default: 4096, help: 'Per-turn output budget.' },
  { key: 'agents.autoApprove', label: 'Auto-approve spawns', category: 'agents', type: 'boolean', scope: 'user', path: 'agents.autoApprove', default: false, help: 'Skip approval prompts for agent spawns in workspace-write.' },

  // ── voice ──
  { key: 'voice.ttsEngine', label: 'TTS engine', category: 'voice', type: 'enum', scope: 'user', path: 'voice.ttsEngine', default: 'kokoro', options: ['kokoro', 'edge', 'none'], help: 'Local Kokoro on :7799 by default.' },
  { key: 'voice.ttsVoice', label: 'TTS voice', category: 'voice', type: 'string', scope: 'user', path: 'voice.ttsVoice', default: 'af_heart', help: '' },
  { key: 'voice.autoSpeak', label: 'Auto-speak replies', category: 'voice', type: 'boolean', scope: 'user', path: 'voice.autoSpeak', default: false, help: '' },
  { key: 'voice.sttEnabled', label: 'Speech-to-text', category: 'voice', type: 'boolean', scope: 'user', path: 'voice.sttEnabled', default: false, help: 'STT service on :7896 (dark by default).' },

  // ── ui / visuals ──
  { key: 'ui.mode', label: 'UI mode', category: 'ui', type: 'enum', scope: 'user', path: 'ui.mode', default: 'hybrid', options: ['classic', 'hybrid', 'immersive'], help: 'Classic tabs / scene+drawers / full cockpit.' },
  { key: 'ui.sceneIntensity', label: 'Scene intensity', category: 'ui', type: 'number', scope: 'user', path: 'ui.sceneIntensity', default: 0.7, help: '0 = static, 1 = full chaos.' },
  { key: 'ui.motion', label: 'Motion/animations', category: 'ui', type: 'boolean', scope: 'user', path: 'ui.motion', default: true, help: 'Disable for low-power hardware.' },
  { key: 'ui.lowPower', label: 'Low-power mode', category: 'ui', type: 'boolean', scope: 'user', path: 'ui.lowPower', default: false, help: 'Cap FPS and particle counts (i7-2600K friendly).' },

  // ── personality / spooky warding ──
  // Spooky is skin, not steering. Default 'clean'. Tied to task domain —
  // legal/medical/finance/debugging auto-suppresses regardless of dial.
  { key: 'personality.preset', label: 'Personality preset', category: 'ui', type: 'enum', scope: 'user', path: 'personality.preset',
    default: 'clean', options: ['clean','goblin','spooky','sovereign','crt-ritual','mochi-soft'],
    help: 'Visual + microcopy tone. Clean = professional. Goblin = sarcastic chaos. Spooky = occult-tech flavour. Sovereign = royal authority. CRT Ritual = full lore. Mochi Soft = cute companion.' },
  { key: 'personality.spooky_warding', label: 'Spooky Warding intensity', category: 'ui', type: 'enum', scope: 'user', path: 'personality.spooky_warding',
    default: 'off', options: ['off','low','medium','high','ceremonial'],
    help: 'Master dial. Auto-suppresses for legal/medical/finance/debugging regardless.' },
  { key: 'personality.allow_terminal_flavour', label: 'Spooky · terminal flavour', category: 'ui', type: 'boolean', scope: 'user', path: 'personality.allowTerminalFlavour', default: true, help: 'Banner one-liners, log prefixes.' },
  { key: 'personality.allow_mochi_dialogue', label: 'Spooky · Mochi dialogue', category: 'ui', type: 'boolean', scope: 'user', path: 'personality.allowMochiDialogue', default: true, help: 'Mochi speaks in the chosen tone.' },
  { key: 'personality.allow_release_scrolls', label: 'Spooky · release scrolls', category: 'ui', type: 'boolean', scope: 'user', path: 'personality.allowReleaseScrolls', default: false, help: 'Sigils in release notes. Off by default.' },
  { key: 'personality.allow_debug_flavour', label: 'Spooky · debug flavour', category: 'ui', type: 'boolean', scope: 'user', path: 'personality.allowDebugFlavour', default: false, help: 'Ritual flair in TTS replies, stack traces. Default OFF — diagnostics first.' },
  { key: 'personality.prevent_task_derailment', label: 'Spooky · prevent derailment', category: 'ui', type: 'boolean', scope: 'user', path: 'personality.preventTaskDerailment', default: true, help: 'Forces task-first response even if spooky is on. Recommended ON.' },
  { key: 'visuals.mochi', label: 'Mochi companion', category: 'visuals', type: 'boolean', scope: 'user', path: 'visuals.mochi', default: true, help: 'Living pet in the cockpit.' },
  { key: 'visuals.serviceLayer', label: 'Service constellation', category: 'visuals', type: 'boolean', scope: 'user', path: 'visuals.serviceLayer', default: true, help: '' },
  { key: 'visuals.agentLayer', label: 'Agent swarm clusters', category: 'visuals', type: 'boolean', scope: 'user', path: 'visuals.agentLayer', default: true, help: '' },
  { key: 'visuals.eventLayer', label: 'Event signal trails', category: 'visuals', type: 'boolean', scope: 'user', path: 'visuals.eventLayer', default: true, help: '' },
  { key: 'visuals.riskLayer', label: 'Risk distortion field', category: 'visuals', type: 'boolean', scope: 'user', path: 'visuals.riskLayer', default: true, help: '' },

  // ── memory ──
  { key: 'memory.retentionDays', label: 'Memory retention (days)', category: 'memory', type: 'number', scope: 'user', path: 'memory.retentionDays', default: 90, help: '' },
  { key: 'memory.recallMode', label: 'Recall mode', category: 'memory', type: 'enum', scope: 'user', path: 'memory.recallMode', default: 'auto', options: ['auto', 'explicit', 'off'], help: '' },

  // ── debug ──
  { key: 'debug.showThink', label: 'Show reasoning blocks', category: 'core', type: 'boolean', scope: 'env', env: 'PURPCLAW_SHOW_THINK', restart: false,
    help: 'Show raw <think> blocks from reasoning models instead of stripping.' },
];

// ── ports: auto-generated from the canonical service registry ────────────────
try {
  const { SERVICES } = require('./ports');
  for (const svc of SERVICES || []) {
    CATALOG.push({
      key: `ports.${svc.id}`, label: `${svc.name} port`, category: 'ports', type: 'number',
      scope: 'env', env: `PURPCLAW_${svc.id.toUpperCase().replace(/-/g, '_')}_PORT`,
      restart: true, default: svc.port,
      help: `Override port for ${svc.name} (${svc.protocol}://${svc.host}).`,
    });
  }
} catch { /* ports.js optional */ }

// ── persistence helpers ───────────────────────────────────────────────────────

function readEnvFile() {
  try { return fs.readFileSync(ENV_PATH, 'utf8'); } catch { return ''; }
}
function readEnvVar(name) {
  // Live process env wins, then .env file.
  if (process.env[name] !== undefined) return process.env[name];
  const m = readEnvFile().match(new RegExp(`^${name}=(.*)$`, 'm'));
  return m ? m[1].trim() : undefined;
}
function writeEnvVar(name, value) {
  let env = readEnvFile();
  const line = `${name}=${value}`;
  const re = new RegExp(`^${name}=.*$`, 'm');
  if (re.test(env)) env = env.replace(re, line);
  else env += (env.endsWith('\n') || env === '' ? '' : '\n') + line + '\n';
  fs.writeFileSync(ENV_PATH, env, 'utf8');
  process.env[name] = String(value);  // live for this process
}

function readJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return {}; } }
function writeJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), 'utf8');
}
function getDot(obj, dotted) { return dotted.split('.').reduce((o, k) => (o ? o[k] : undefined), obj); }
function setDot(obj, dotted, value) {
  const keys = dotted.split('.');
  let o = obj;
  for (const k of keys.slice(0, -1)) { if (typeof o[k] !== 'object' || o[k] === null) o[k] = {}; o = o[k]; }
  o[keys[keys.length - 1]] = value;
}

function coerce(spec, raw) {
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (spec.type === 'number') return Number(raw);
  if (spec.type === 'boolean') {
    const b = raw === true || raw === 'true' || raw === '1' || raw === 1;
    return spec.invert ? !b : b;
  }
  return String(raw);
}

function maskSecret(v) {
  if (!v) return null;
  const s = String(v);
  return s.length <= 8 ? '••••' : `${s.slice(0, 4)}…${s.slice(-4)}`;
}

// ── public API ────────────────────────────────────────────────────────────────

function rawValue(spec) {
  if (spec.scope === 'env') return readEnvVar(spec.env);
  if (spec.scope === 'spend') return getDot(readJson(spendPaths().configPath), spec.path);
  return getDot(readJson(USER_SETTINGS_PATH), spec.path);
}

function get(key) {
  const spec = CATALOG.find(s => s.key === key);
  if (!spec) return null;
  const raw = rawValue(spec);
  const value = coerce(spec, raw);
  const effective = value !== undefined ? value : spec.default;
  const out = {
    key: spec.key, label: spec.label, category: spec.category, type: spec.type,
    scope: spec.scope, options: spec.options, help: spec.help || '',
    restart: !!spec.restart, default: spec.default,
    modified: value !== undefined && value !== spec.default,
  };
  if (spec.type === 'secret') { out.set = !!raw; out.hint = maskSecret(raw); }
  else out.value = effective;
  return out;
}

function set(key, value) {
  const spec = CATALOG.find(s => s.key === key);
  if (!spec) return { ok: false, error: `unknown setting: ${key}` };
  if (spec.type === 'enum' && spec.options && !spec.options.includes(value)) {
    return { ok: false, error: `invalid value for ${key}; options: ${spec.options.join(', ')}` };
  }
  if (spec.type === 'number' && Number.isNaN(Number(value))) {
    return { ok: false, error: `${key} must be a number` };
  }
  let stored = value;
  if (spec.type === 'boolean') {
    const b = value === true || value === 'true' || value === '1' || value === 1;
    stored = spec.invert ? (b ? '' : '1') : (b ? '1' : '');
    if (spec.scope !== 'env') stored = spec.invert ? !b : b;
  }
  try {
    if (spec.scope === 'env') {
      writeEnvVar(spec.env, stored);
    } else if (spec.scope === 'spend') {
      const cfg = readJson(spendPaths().configPath);
      setDot(cfg, spec.path, spec.type === 'number' ? Number(value) : stored);
      writeJson(spendPaths().configPath, cfg);
    } else {
      const cfg = readJson(USER_SETTINGS_PATH);
      setDot(cfg, spec.path, spec.type === 'number' ? Number(value) : stored);
      writeJson(USER_SETTINGS_PATH, cfg);
    }
    return { ok: true, key, restart: !!spec.restart, ...get(key) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function list(filter = {}) {
  let specs = CATALOG;
  if (filter.category) specs = specs.filter(s => s.category === filter.category);
  let out = specs.map(s => get(s.key));
  if (filter.modified) out = out.filter(s => s.modified);
  return out;
}

function search(q) {
  const needle = String(q || '').toLowerCase();
  if (!needle) return list();
  return CATALOG
    .filter(s =>
      s.key.toLowerCase().includes(needle) ||
      s.label.toLowerCase().includes(needle) ||
      (s.help || '').toLowerCase().includes(needle) ||
      s.category.includes(needle))
    .map(s => get(s.key));
}

function categories() {
  return [...new Set(CATALOG.map(s => s.category))];
}

function exportAll() {
  // Secrets excluded by design — export is shareable.
  const out = {};
  for (const s of CATALOG) {
    if (s.type === 'secret') continue;
    const g = get(s.key);
    if (g.modified) out[s.key] = g.value;
  }
  return out;
}

function importAll(obj) {
  const results = [];
  for (const [k, v] of Object.entries(obj || {})) results.push(set(k, v));
  return results;
}

// ── presets ───────────────────────────────────────────────────────────────────
const PRESETS = {
  classic:    { 'ui.mode': 'classic',   'ui.sceneIntensity': 0,   'ui.motion': false },
  hybrid:     { 'ui.mode': 'hybrid',    'ui.sceneIntensity': 0.5, 'ui.motion': true },
  immersive:  { 'ui.mode': 'immersive', 'ui.sceneIntensity': 0.9, 'ui.motion': true },
  // FIX 2026-06-22: each preset must set ui.mode to its own id so the
  // settings page round-trip works (applyPreset → load() → activePreset).
  // Previously low-power set ui.mode='classic' and full-chaos set
  // ui.mode='immersive', which made Full Chaos highlight bounce back to
  // Immersive after the reload.
  'low-power':{ 'ui.mode': 'low-power', 'ui.sceneIntensity': 0.2, 'ui.motion': false, 'ui.lowPower': true },
  'full-chaos':{ 'ui.mode': 'full-chaos','ui.sceneIntensity': 1,   'ui.motion': true, 'visuals.eventLayer': true, 'visuals.riskLayer': true },
  'safe-mode': { 'safety.approvalMode': 'read-only', 'safety.pocketMode': true, 'safety.redaction': true },
  // ── personality presets (the new layer) ──
  'clean':     { 'personality.preset': 'clean',     'personality.spooky_warding': 'off' },
  'goblin':    { 'personality.preset': 'goblin',    'personality.spooky_warding': 'low',     'personality.allow_terminal_flavour': true,  'personality.allow_mochi_dialogue': true,  'personality.allow_release_scrolls': false, 'personality.allow_debug_flavour': false, 'personality.prevent_task_derailment': true },
  'spooky':    { 'personality.preset': 'spooky',    'personality.spooky_warding': 'medium',  'personality.allow_terminal_flavour': true,  'personality.allow_mochi_dialogue': true,  'personality.allow_release_scrolls': false, 'personality.allow_debug_flavour': false, 'personality.prevent_task_derailment': true },
  'sovereign': { 'personality.preset': 'sovereign', 'personality.spooky_warding': 'low',     'personality.allow_terminal_flavour': true,  'personality.allow_mochi_dialogue': true,  'personality.allow_release_scrolls': false, 'personality.allow_debug_flavour': false, 'personality.prevent_task_derailment': true },
  'crt-ritual':{ 'personality.preset': 'crt-ritual','personality.spooky_warding': 'ceremonial','personality.allow_terminal_flavour': true,'personality.allow_mochi_dialogue': true,'personality.allow_release_scrolls': true,  'personality.allow_debug_flavour': true,   'personality.prevent_task_derailment': true },
  'mochi-soft':{ 'personality.preset': 'mochi-soft','personality.spooky_warding': 'low',     'personality.allow_terminal_flavour': false, 'personality.allow_mochi_dialogue': true,  'personality.allow_release_scrolls': false, 'personality.allow_debug_flavour': false, 'personality.prevent_task_derailment': true },
};
function applyPreset(name) {
  const p = PRESETS[name];
  if (!p) return { ok: false, error: `unknown preset: ${name}; available: ${Object.keys(PRESETS).join(', ')}` };
  return { ok: true, preset: name, results: importAll(p) };
}

module.exports = { CATALOG, get, set, list, search, categories, exportAll, importAll, applyPreset, PRESETS };
