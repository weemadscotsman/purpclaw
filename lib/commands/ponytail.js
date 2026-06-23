// ponytail — PurpClaw CLI handler for the ponytail subcommand.
// Routes through OmniCode's ponytail tools by importing the OmniCode
// tool module directly (same Node runtime, no socket, no JSON-RPC
// overhead). Mirrors the `lib/commands/bigboss.js` shape.
//
// Subcommands:
//   status                          — show the current mode (read from env/config)
//   off                             — switch to off (no injection)
//   lite | full | ultra             — switch the active mode and persist it
//   audit <path> [--level=N]        — run ponytail_audit (level: lite|full|ultra)
//   plan  <path> [--level=N]        — run ponytail_repair_plan, write a real .md
//   help                            — usage
//
// The audit / plan subcommands call the OmniCode ponytail tools
// directly. We resolve the OmniCode install the same way the MCP
// server does — walk up from the cwd looking for an `omnicode-mcp`
// directory with `dist/tools/ponytail_tools.js` inside. Override
// with OMNICODE_MCP_DIR. Falls back to spawning the omnicode CLI
// if the module can't be located.

'use strict';

const path = require('path');
const fs   = require('fs');
const { spawn: childSpawn } = require('child_process');

const OMNICODE_DEFAULT_PORT = Number(process.env.OMNICODE_MCP_PORT || 7777);
const OMNICODE_DEFAULT_HOST = process.env.OMNICODE_MCP_HOST || '127.0.0.1';

function configDir() {
  if (process.env.XDG_CONFIG_HOME) {
    return path.join(process.env.XDG_CONFIG_HOME, 'ponytail');
  }
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(require('os').homedir(), 'AppData', 'Roaming'), 'ponytail');
  }
  return path.join(require('os').homedir(), '.config', 'ponytail');
}

function configPath() {
  return path.join(configDir(), 'config.json');
}

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath(), 'utf8'));
  } catch (e) {
    return {};
  }
}

function writeConfig(obj) {
  fs.mkdirSync(configDir(), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(obj, null, 2), 'utf8');
}

function currentMode() {
  const env = process.env.PONYTAIL_DEFAULT_MODE;
  if (env && ['off', 'lite', 'full', 'ultra'].includes(env.toLowerCase())) {
    return env.toLowerCase();
  }
  const cfg = readConfig();
  if (cfg.defaultMode && ['off', 'lite', 'full', 'ultra'].includes(cfg.defaultMode.toLowerCase())) {
    return cfg.defaultMode.toLowerCase();
  }
  return 'full';
}

function setMode(mode) {
  const normalized = String(mode || '').trim().toLowerCase();
  if (!['off', 'lite', 'full', 'ultra'].includes(normalized)) {
    return { ok: false, error: `invalid mode: ${mode} (use off|lite|full|ultra)` };
  }
  const cfg = readConfig();
  cfg.defaultMode = normalized;
  writeConfig(cfg);
  return { ok: true, mode: normalized, written: configPath() };
}

// ── Locate the OmniCode ponytail tool module ────────────────────────────────
// Walk up from cwd looking for an `omnicode-mcp/dist/tools/ponytail_tools.js`.
// The OmniCode MCP server itself does the same walk (see
// dist/tools/ponytail_tools.js resolveVendorRoot). Override with
// OMNICODE_MCP_DIR for non-standard installs.
function resolveOmniToolsModule() {
  if (process.env.OMNICODE_MCP_DIR) {
    const candidate = path.join(process.env.OMNICODE_MCP_DIR, 'dist', 'tools', 'ponytail_tools.js');
    if (fs.existsSync(candidate)) return candidate;
  }
  let dir = process.cwd();
  for (let i = 0; i < 8; i += 1) {
    // Sibling project under the same parent (most common layout)
    const sibling = path.join(dir, 'omnicode-platform', 'omnicode-mcp', 'dist', 'tools', 'ponytail_tools.js');
    if (fs.existsSync(sibling)) return sibling;
    // Or nested under the cwd itself
    const nested = path.join(dir, 'omnicode-mcp', 'dist', 'tools', 'ponytail_tools.js');
    if (fs.existsSync(nested)) return nested;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function resolveOmniCli() {
  if (process.env.OMNICODE_MCP_DIR) {
    const cli = path.join(process.env.OMNICODE_MCP_DIR, 'dist', 'cli.js');
    if (fs.existsSync(cli)) return cli;
  }
  let dir = process.cwd();
  for (let i = 0; i < 8; i += 1) {
    const sibling = path.join(dir, 'omnicode-platform', 'omnicode-mcp', 'dist', 'cli.js');
    if (fs.existsSync(sibling)) return sibling;
    const nested = path.join(dir, 'omnicode-mcp', 'dist', 'cli.js');
    if (fs.existsSync(nested)) return nested;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

// ── Call the OmniCode tool, preferring direct module load ──────────────────
// The same Node process can require the tool module — no socket, no
// JSON-RPC, no MCP stdio. Falls back to spawning the omnicode CLI
// if the module can't be located.
async function callOmniTool(toolName, args) {
  const modulePath = resolveOmniToolsModule();
  if (modulePath) {
    try {
      // Force a fresh require so the test always sees the latest
      // module state (defensive — usually cached anyway).
      delete require.cache[modulePath];
      const mod = require(modulePath);
      const fn = toolName === 'ponytail_audit' ? mod.ponytailAudit
              : toolName === 'ponytail_repair_plan' ? mod.ponytailRepairPlan
              : toolName === 'ponytail_verify_plan' ? mod.ponytailVerifyPlan
              : toolName === 'ponytail_system_transform' ? mod.ponytailSystemTransform
              : null;
      if (!fn) return { ok: false, error: `unknown omni tool: ${toolName}` };
      const r = await fn(args);
      // The tool returns { result: '<json-string>' } for the wire format.
      // Internal callers can read it directly, but for consistency we
      // parse the JSON so callers always see structured data.
      if (r && typeof r.result === 'string') {
        try { return JSON.parse(r.result); }
        catch { return { ok: false, error: `tool returned non-JSON: ${r.result.slice(0, 200)}` }; }
      }
      return r;
    } catch (e) {
      return { ok: false, error: `module load failed: ${e.message}` };
    }
  }

  // Fallback: spawn the omnicode CLI. Slower (cold start every call)
  // but works for non-sibling installs.
  const cli = resolveOmniCli();
  if (!cli) {
    return {
      ok: false,
      error: `OmniCode ponytail tool module not found (no omnicode-mcp/ sibling, OMNICODE_MCP_DIR not set). ` +
             `Either point OMNICODE_MCP_DIR at your omnicode-mcp install, or ` +
             `set up omnicode-mcp as a sibling of purpclaw under the same parent directory.`,
    };
  }
  return new Promise((resolve) => {
    const child = childSpawn('node', [cli, toolName, JSON.stringify(args)], { encoding: 'utf8', timeout: 120000 });
    let stdout = '', stderr = '';
    child.stdout.on('data', (c) => { stdout += c; });
    child.stderr.on('data', (c) => { stderr += c; });
    child.on('exit', (code) => {
      if (code !== 0) return resolve({ ok: false, error: `omnicode CLI exit ${code}: ${stderr || stdout}` });
      try { return resolve(JSON.parse(stdout)); }
      catch { return resolve({ ok: false, error: `omnicode CLI returned non-JSON: ${stdout.slice(0, 200)}` }); }
    });
    child.on('error', (e) => resolve({ ok: false, error: `omnicode CLI spawn failed: ${e.message}` }));
  });
}

function helpText() {
  return [
    '',
    '  ponytail — the lazy-senior-dev doctrine, exposed for PurpClaw',
    '',
    '  Mode is read from PONYTAIL_DEFAULT_MODE env var > config file > "full".',
    '  Use `ponytail <mode>` to switch the active level and persist it.',
    '',
    '  Subcommands:',
    '    status                          show the active mode',
    '    off                             turn doctrine off (no system-prompt injection)',
    '    lite | full | ultra             switch the active mode and persist it',
    '    audit <path> [--level=N]        run ponytail_audit (level: lite|full|ultra)',
    '    plan  <path> [--level=N]        run ponytail_repair_plan, write a real .md',
    '    verify <path> [--write]         read the MD, walk findings, output safe_to_execute + per-finding verdicts + risk. --write also writes a PONYTAIL_VERIFY_REPORT.md next to the plan.',
    '    help                            this message',
    '',
    '  Routing: audit / plan load the omnicode-mcp ponytail tool module',
    '  directly (same Node runtime). Set OMNICODE_MCP_DIR to override the',
    '  walk-up search if omnicode-mcp is not a sibling project.',
    '',
  ].join('\n');
}

async function run(sub, rest) {
  sub = String(sub || 'help').toLowerCase();
  rest = String(rest || '').trim();

  if (sub === 'help' || sub === '--help' || sub === '-h') {
    return helpText();
  }

  if (sub === 'status') {
    return [
      '',
      `  ponytail mode:  ${currentMode()}`,
      `  config:         ${configPath()}`,
      `  env override:   ${process.env.PONYTAIL_DEFAULT_MODE || '(none)'}`,
      '',
      '  Switch with:    purpclaw ponytail <off|lite|full|ultra>',
      '',
    ].join('\n');
  }

  if (['off', 'lite', 'full', 'ultra'].includes(sub)) {
    const r = setMode(sub);
    if (!r.ok) return `\n  error: ${r.error}\n`;
    return [
      '',
      `  ponytail mode set to: ${r.mode}`,
      `  persisted to:         ${r.written}`,
      '',
      '  Next agent turn will pick it up automatically. (Set PONYTAIL_DEFAULT_MODE=...',
      '  in the env to override the config file.)',
      '',
    ].join('\n');
  }

  if (sub === 'audit' || sub === 'plan' || sub === 'verify') {
    // Tokenize: split on whitespace EXCEPT inside quoted strings. The
    // repo path may legitimately contain spaces (e.g. "god folder"),
    // so a naive split-on-whitespace will mangle it. Quoted paths
    // get their quotes stripped; level flags are --level=N form.
    const tokens = tokenizeQuotedArgs(rest);
    let repoPath = null;
    let level = 'full';
    let writeReport = false;
    for (const t of tokens) {
      if (t.startsWith('--level=')) level = t.split('=')[1].toLowerCase();
      else if (t === '--write') writeReport = true;
      else if (!t.startsWith('-')) repoPath = t;
    }
    if (sub === 'verify' && !repoPath) {
      return `\n  usage: purpclaw ponytail verify <path>     # verifies <path>/.omnicode/PONYTAIL_REPAIR_PLAN.md\n         note: quote the path if it contains spaces, e.g.  purpclaw ponytail verify "E:/god folder/02/foo"\n`;
    }
    if (sub !== 'verify' && !['lite', 'full', 'ultra'].includes(level)) {
      return `\n  error: level must be lite|full|ultra, got: ${level}\n`;
    }
    const absPath = path.resolve(repoPath);
    // Guard: unquoted path with internal whitespace is ambiguous. The
    // tokenizer split on the space and the second half overwrote the
    // first; if either half doesn't exist on disk, the user forgot
    // to quote. Detect by checking the resolved path actually exists.
    if (!fs.existsSync(absPath)) {
      return `\n  error: path not found: ${absPath}\n         hint: if the path contains spaces, quote it. Example:\n           purpclaw ponytail ${sub} "E:/god folder/02/foo" --level=full\n`;
    }
    const toolName = sub === 'audit' ? 'ponytail_audit'
                  : sub === 'plan' ? 'ponytail_repair_plan'
                  : 'ponytail_verify_plan';
    const toolArgs = sub === 'verify'
      ? { path: absPath, write: writeReport }
      : { path: absPath, level };
    const payload = await callOmniTool(toolName, toolArgs);
    if (!payload || payload.ok === false) {
      return `\n  ${toolName} failed: ${(payload && payload.error) || 'unknown error'}\n`;
    }
    if (sub === 'audit') {
      const findingsCount = Array.isArray(payload.findings) ? payload.findings.length : payload.findings;
      return [
        '',
        `  ponytail_audit — ${findingsCount} findings (level=${payload.level}, version=${payload.version})`,
        `  byTag: ${JSON.stringify(payload.byTag)}`,
        `  net:   ${payload.net}`,
        '',
        '  --- top of report ---',
        ...(payload.report || '').split('\n').slice(0, 15).map(l => '  ' + l),
        '',
      ].join('\n');
    } else if (sub === 'plan') {
      return [
        '',
        `  ponytail_repair_plan — wrote ${payload.bytes} bytes (level=${payload.level})`,
        `  findings: ${payload.findings}, byTag: ${JSON.stringify(payload.byTag)}`,
        `  plan:     ${payload.output_path}`,
        `  net:      ${payload.net}`,
        '',
        '  Read the MD; it is the contract. Re-run if any file in the cut list changes.',
        '  Verify lifecycle: purpclaw ponytail verify <path>',
        '',
      ].join('\n');
    } else {
      // verify
      const c = payload.counts || {};
      const total = Object.values(c).reduce((a, b) => a + (b || 0), 0);
      const tagRows = Object.entries(c).map(([k, v]) => `    ${k.padEnd(13)} ${v}`).join('\n');
      return [
        '',
        `  ponytail_verify_plan — ${payload.summary?.findings ?? total} findings, ${payload.summary?.files ?? 0} files`,
        `  plan:               ${payload.planPath}`,
        `  plan_format:        ${payload.planFormat}${payload.legacyPlan ? '  (legacy, no D-3 confidence/risk/verifier fields)' : ''}`,
        `  plan_generated:     ${payload.generatedAt || '(unknown)'}`,
        `  repo:               ${payload.repoRoot || '(none given)'}`,
        `  index_available:    ${payload.indexAvailable}${payload.indexError ? '  (' + payload.indexError + ')' : ''}`,
        `  mutated:            ${payload.mutated}`,
        '',
        `  Top-level verdict:  ${payload.safeToExecute}`,
        `  Recommendation:     ${payload.recommendation || ''}`,
        `  Next action:       ${payload.nextAction || ''}`,
        '',
        '  Counts:',
        tagRows || '    (none)',
        '',
        '  Per-finding verdicts (first 15):',
        ...(payload.findings || []).slice(0, 15).map(f =>
          `    [${f.verdict.padEnd(12)}|${f.risk.padEnd(7)}] ${f.tag.padEnd(7)} ${f.file}  ${f.text.slice(0, 50)}`
        ),
        ...((payload.findings || []).length > 15 ? [`    ... and ${(payload.findings || []).length - 15} more`] : []),
        payload.reportPath ? `\n  Report written: ${payload.reportPath}` : '',
        '',
      ].join('\n');
    }
  }

  return helpText();
}

function tokenizeQuotedArgs(s) {
  // Shell-like tokenizer. Splits on whitespace UNLESS we're inside
  // a quoted segment, in which case the whitespace is part of the
  // token. Surrounding quotes are stripped. The repo path may
  // legitimately contain spaces (e.g. "god folder") so a naive
  // split-on-whitespace mangles it. Examples:
  //
  //   "E:/god folder/02/foo"          -> ["E:/god folder/02/foo"]
  //   E:/god folder/02/foo --level=N  -> ["E:/god folder/02/foo", "--level=N"]
  //   'quoted' bare                   -> ["quoted", "bare"]
  //
  // State: we are always either "outside a token" (skipping
  // whitespace) or "inside a token" (accumulating). Quote chars
  // flip us into the token and then back out. The transition out
  // of "inside a token" happens only at end-of-input, not at
  // internal whitespace.
  const out = [];
  let buf = '';
  let inToken = false;
  let quote = null;
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (quote) {
      if (c === quote) { quote = null; }
      else { buf += c; }
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      inToken = true;
      continue;
    }
    if (/\s/.test(c)) {
      // Whitespace outside a quote. If we have a token in flight,
      // close it out and start a new one later. Critically: we
      // push the buffer here, but we do NOT touch inToken — the
      // next non-whitespace char will set it back to true.
      if (inToken) { out.push(buf); buf = ''; inToken = false; }
      continue;
    }
    buf += c;
    inToken = true;
  }
  if (inToken || buf) out.push(buf);
  return out;
}

module.exports = { run, currentMode, setMode, callOmniTool, resolveOmniToolsModule, tokenizeQuotedArgs };
