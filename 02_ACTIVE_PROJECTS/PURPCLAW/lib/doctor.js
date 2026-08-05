"use strict";
const PURP_PATHS = require('./paths');
/**
 * lib/doctor.js — PurpClaw Doctor
 *
 * One command, one scorecard. Walks every subsystem and reports health.
 * Designed for 100+ tools / 300+ skills scale where nobody can hold
 * the whole system in their head.
 *
 *   purpclaw health               # core services only
 *   purpclaw health --all        # all registry services
 *   purpclaw health --running    # only services with PM2 entries
 *   purpclaw health --json
 *   purpclaw health --verbose
 *
 * Checks:
 *   - Tool Registry: load + count
 *   - Service Health: HTTP probes on registry-defined services (profile-scoped)
 *   - Vault: existence + encryption metadata
 *   - SpendGate: state integrity + counter sanity
 *   - Memory: spine reachability
 *   - Providers: API key presence (without exposing them)
 *   - Dependencies: required modules present
 *   - Skills: count + manifest coverage
 *   - Updates: version + manifest freshness
 *   - GOOP Playground: broker, registry, cache, ledger, secrets
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const crypto = require("crypto");

const PURP_DIR = path.resolve(__dirname, "..");
const POCKET_DIR = process.env.POCKET_DIR
  || path.join(PURP_PATHS.DATA_ROOT, "pocket");

// Build the service port map from service_registry for the given profile.
// profile='core'     — only core group from registry
// profile='running'  — core + optional that have PM2 entries
// profile='all'       — every registry service with a port + healthPath
//
// Returns { key -> { port, healthPath } }
function buildPortMap(profile) {
  let sr;
  try {
    sr = require("../service_registry.js");
  } catch {
    // Registry missing — fall back to bare-bones map to avoid crashing
    return {};
  }

  // Collect all PM2 names from ecosystem.config.js via raw-file scan
  // (bypasses the isDark() runtime filter that hides non-core services)
  const runningPM2 = new Set();
  try {
    const ecoPath = path.join(PURP_DIR, "ecosystem.config.js");
    const content = fs.readFileSync(ecoPath, "utf8");
    const re = /name:\s+'([^']+)'/g;
    let m;
    while ((m = re.exec(content)) !== null) runningPM2.add(m[1]);
  } catch {}

  let services;
  if (profile === "all") {
    services = sr.SERVICES.filter(s => s.port && s.healthPath);
  } else if (profile === "running") {
    services = sr.SERVICES.filter(
      s => s.port && s.healthPath && runningPM2.has(s.pm2)
    );
  } else {
    // "core" — default
    services = sr.SERVICES.filter(
      s => s.port && s.healthPath && s.group === "core"
    );
  }

  const map = {};
  for (const s of services) {
    map[s.key] = { port: s.port, healthPath: s.healthPath };
  }
  return map;
}

const result = { timestamp: new Date().toISOString(), checks: {}, overall: "unknown" };

function set(name, status, details) {
  result.checks[name] = { status, ...details };
}

function setOk(name, details) { set(name, "ok", details); }
function setWarn(name, details) { set(name, "warn", details); }
function setFail(name, details) { set(name, "fail", details); }

// ── HTTP probe ─────────────────────────────────────────────
function httpProbe(port, route, timeout = 2000) {
  return new Promise(resolve => {
    const req = http.get(
      { hostname: "127.0.0.1", port, path: route, timeout, agent: false },
      res => {
        // 2xx and 3xx both mean the service is alive and responding.
        // 3xx (redirect) is normal for Next.js (/) which 307s to /mission.
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 400, status: res.statusCode });
      }
    );
    req.on("error", () => resolve({ ok: false, status: 0 }));
    req.on("timeout", () => { req.destroy(); resolve({ ok: false, status: 0 }); });
  });
}

// ── Service health probe (profile-scoped) ─────────────────
async function checkServices(profile, verbose) {
  const portMap = buildPortMap(profile);
  const services = {};
  for (const [name, { port, healthPath }] of Object.entries(portMap)) {
    const probePath = name === "nextjs" ? "/" : healthPath;
    const probe = await httpProbe(port, probePath);
    services[name] = { port, path: probePath, ...probe };
  }
  const liveCount = Object.values(services).filter(s => s.ok).length;
  const total = Object.keys(services).length;
  if (liveCount === total) setOk("services", { profile, live: liveCount, total, services });
  else if (liveCount >= total / 2) setWarn("services", { profile, live: liveCount, total, services });
  else setFail("services", { profile, live: liveCount, total, services });
}

// ── Cognitive spine layers 2-7 (single-port 7880) ─────────
async function checkSpineLayers() {
  const SPINE_PORT = 7880;
  const probes = [
    { id: "layer-1-autodream",  path: "/autodream/health" },
    { id: "layer-2-neuro",      path: "/neuro-symbolic/health" },
    { id: "layer-3-temporal",   path: "/memory/health" },
    { id: "layer-4-cf",         path: "/memory/health" },
    { id: "layer-5-rules",      path: "/rules/health" },
    { id: "layer-6-modal",      path: "/modal/health" },
    { id: "layer-7-diag",       path: "/diagnostics/health" },
  ];
  const layers = {};
  for (const probe of probes) {
    const res = await httpProbe(SPINE_PORT, probe.path);
    layers[probe.id] = { port: SPINE_PORT, path: probe.path, ...res };
  }
  const liveCount = Object.values(layers).filter(l => l.ok).length;
  const total = Object.keys(layers).length;
  const integration = {
    agent_loop_wired: false,
    cognitive_client: false,
    memory_client: false,
  };
  try {
    const agentLoop = fs.readFileSync(path.join(PURP_DIR, "lib", "agent-loop.js"), "utf8");
    integration.agent_loop_wired =
      agentLoop.includes("require('./cognitive-client')")
      && agentLoop.includes("getCognitiveSnapshot");
    integration.cognitive_client = fs.existsSync(path.join(PURP_DIR, "lib", "cognitive-client.js"));
    integration.memory_client = fs.existsSync(path.join(PURP_DIR, "lib", "memory-client.js"));
  } catch {}
  if (liveCount === total && integration.agent_loop_wired) setOk("spine_layers", { live: liveCount, total, layers, integration });
  else if (liveCount >= total / 2) setWarn("spine_layers", { live: liveCount, total, layers, integration, note: "spine partially up or agent_loop not wired" });
  else setFail("spine_layers", { live: liveCount, total, layers, integration });
}

// ── Tool registry ─────────────────────────────────────────
function checkTools() {
  try {
    const reg = require("./tools/index");
    const tools = reg.list();
    if (tools.length >= 100) setOk("tools", { count: tools.length, native: "lib/tools/index.js" });
    else if (tools.length > 0) setWarn("tools", { count: tools.length });
    else setFail("tools", { count: 0 });
  } catch (e) {
    setFail("tools", { error: e.message });
  }
}

// ── Vault health ─────────────────────────────────────────
function checkVault() {
  const vaultPath = path.join(POCKET_DIR, "vault.enc");
  const logPath = vaultPath + ".log";
  if (!fs.existsSync(vaultPath)) {
    setWarn("vault", { present: false, note: "no vault yet — run `purpclaw pocket vault init`" });
    return;
  }
  try {
    const raw = fs.readFileSync(vaultPath, "utf8");
    const v = JSON.parse(raw);
    const checks = {
      present: true,
      has_master_salt: !!v.master?.salt,
      has_recovery_salt: !!v.recovery?.salt,
      has_recovery_envelope: !!v.recovery?.data,
      has_data_envelope: !!v.data,
      audit_entries: fs.existsSync(logPath)
        ? fs.readFileSync(logPath, "utf8").split("\n").filter(Boolean).length : 0,
      kdf: v.kdf?.algo,
      iterations: v.kdf?.iterations,
    };
    if (checks.has_master_salt && checks.has_recovery_salt && checks.has_data_envelope) {
      setOk("vault", checks);
    } else {
      setFail("vault", checks);
    }
  } catch (e) {
    setFail("vault", { error: "corrupt vault file: " + e.message });
  }
}

// ── SpendGate state integrity ───────────────────────────
function checkSpendGate() {
  const statePath = path.join(POCKET_DIR, "spend-state.json");
  const configPath = path.join(POCKET_DIR, "spend-config.json");
  if (!fs.existsSync(configPath) && !fs.existsSync(statePath)) {
    setWarn("spend", { present: false, note: "no SpendGate config yet" });
    return;
  }
  const details = {};
  try {
    if (fs.existsSync(statePath)) {
      const s = JSON.parse(fs.readFileSync(statePath, "utf8"));
      details.today = s.day;
      details.dailyTokens = s.dailyTokens;
      details.monthlyTokens = s.monthlyTokens;
      details.dailyRequests = s.dailyRequests;
      details.dailyCost = s.dailyCost;
      const sane = s.dailyTokens >= 0 && s.monthlyTokens >= 0 && s.dailyRequests >= 0;
      details.sane_counters = sane;
    }
    if (fs.existsSync(configPath)) {
      const c = JSON.parse(fs.readFileSync(configPath, "utf8"));
      details.dailyTokenCap = c.dailyTokenCap;
      details.perRequestCap = c.perRequestCap;
      details.maxRequestsPerMinute = c.maxRequestsPerMinute;
    }
    setOk("spend", details);
  } catch (e) {
    setFail("spend", { error: e.message });
  }
}

// ── Memory spine ─────────────────────────────────────────
async function checkMemory() {
  const SPINE_PORT = 7880;
  const probe = await httpProbe(SPINE_PORT, "/cognitive/health");
  if (!probe.ok) {
    setFail("memory", {
      spine: "cognitive_spine", port: SPINE_PORT, status: probe.status,
      stage: "unreachable",
      note: "start with: pm2 start ecosystem.config.js --only purpclaw-cognitive",
    });
    return;
  }
  const marker = `doctor-probe-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let mem;
  try { mem = require("./memory-client"); }
  catch (e) { setFail("memory", { stage: "client-load", error: e.message }); return; }
  let id = null;
  try {
    id = await mem.ingest(`PURPCLAW doctor round-trip probe ${marker}`, { type: "note", source: "doctor", importance: 0.1 });
  } catch (e) {
    setFail("memory", { stage: "write", error: e.message, note: "health endpoint says healthy but the write failed" });
    return;
  }
  let found = false, results = 0;
  try {
    const rec = await mem.recall(marker, { limit: 5, useCache: false });
    results = (rec && rec.results && rec.results.length) || 0;
    found = JSON.stringify(rec || {}).includes(marker);
  } catch (e) { setFail("memory", { stage: "read", error: e.message, wroteId: id }); return; }
  if (found) {
    setOk("memory", { spine: "cognitive_spine", port: SPINE_PORT, roundTrip: "write->read->verify OK", wroteId: id || "(no id returned)", results });
  } else {
    setFail("memory", {
      spine: "cognitive_spine", port: SPINE_PORT, stage: "verify",
      wroteId: id, results,
      note: "health endpoint reports healthy but a written memory could not be read back",
    });
  }
}

// ── Provider keys presence (NOT values) ───────────────────
function checkProviders() {
  const envPath = path.join(PURP_DIR, ".env");
  if (!fs.existsSync(envPath)) {
    setWarn("providers", { note: "no .env file" });
    return;
  }
  const env = fs.readFileSync(envPath, "utf8");
  const keyNames = [
    "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY",
    "GROQ_API_KEY", "DEEPSEEK_API_KEY", "OPENROUTER_API_KEY",
    "MISTRAL_API_KEY", "TOGETHER_API_KEY", "KIMI_API_KEY",
  ];
  const configured = {};
  for (const k of keyNames) {
    const re = new RegExp(`^${k}=(.+)$`, "m");
    const m = env.match(re);
    if (m && m[1] && !m[1].includes("YOUR_") && m[1].length > 8) {
      configured[k] = "set";
    }
  }
  const count = Object.keys(configured).length;
  if (count >= 3) setOk("providers", { configured: count, available: keyNames.length });
  else if (count > 0) setWarn("providers", { configured: count, available: keyNames.length, note: "Ollama works offline; cloud needs keys" });
  else setWarn("providers", { configured: 0, available: keyNames.length, note: "using Ollama or no LLM configured" });
}

// ── Dependencies ─────────────────────────────────────────
function checkDeps() {
  const required = [
    { name: "node:crypto", check: () => require("crypto") },
    { name: "node:fs",     check: () => require("fs") },
    { name: "node:http",   check: () => require("http") },
    { name: "express",     check: () => require("express") },
    { name: "next",        check: () => require("next") },
  ];
  const missing = [];
  for (const r of required) {
    try { r.check(); }
    catch { missing.push(r.name); }
  }
  if (missing.length === 0) setOk("deps", { checked: required.length });
  else setFail("deps", { missing });
}

// ── Skills registry ───────────────────────────────────────
function checkSkills() {
  try {
    const skillsDir = path.join(PURP_DIR, "skills");
    if (!fs.existsSync(skillsDir)) {
      setWarn("skills", { present: false });
      return;
    }
    const dirs = fs.readdirSync(skillsDir).filter(d => {
      try { return fs.statSync(path.join(skillsDir, d)).isDirectory(); }
      catch { return false; }
    });
    const withManifest = dirs.filter(d =>
      fs.existsSync(path.join(skillsDir, d, "SKILL.md"))
    ).length;
    if (dirs.length > 100 && withManifest / dirs.length > 0.95) {
      setOk("skills", { total: dirs.length, with_manifest: withManifest });
    } else {
      setWarn("skills", { total: dirs.length, with_manifest: withManifest });
    }
  } catch (e) {
    setFail("skills", { error: e.message });
  }
}

// ── Update version + manifest ─────────────────────────────
function checkUpdates() {
  const pkg = require(path.join(PURP_DIR, "package.json"));
  const statePath = path.join(POCKET_DIR, "updater-state.json");
  const state = fs.existsSync(statePath)
    ? JSON.parse(fs.readFileSync(statePath, "utf8")) : {};
  setOk("updates", {
    version: pkg.version,
    lastCheck: state.lastCheck,
    lastUpdate: state.lastUpdate,
    lastCheckedVersion: state.lastVersion,
    channel: state.channel || "stable",
  });
}

// ── Scoreboard ────────────────────────────────────────────
function scoreboard() {
  const statuses = Object.values(result.checks).map(c => c.status);
  const ok = statuses.filter(s => s === "ok").length;
  const warn = statuses.filter(s => s === "warn").length;
  const fail = statuses.filter(s => s === "fail").length;
  const total = statuses.length;
  if (fail > 0) result.overall = "fail";
  else if (warn > 0) result.overall = "warn";
  else if (ok === total) result.overall = "ok";
  else result.overall = "unknown";
  return { ok, warn, fail, total };
}

// ── GOOP Playground checks ──────────────────────────────────
const GOOP_PORT = parseInt(process.env.GOOP_PORT || "7895", 10);

function goopGet(pth) {
  return new Promise(resolve => {
    const req = http.get(
      { hostname: "127.0.0.1", port: GOOP_PORT, path: pth, timeout: 5000 },
      res => {
        let data = "";
        res.on("data", chunk => data += chunk);
        res.on("end", () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
          catch (e) { resolve({ status: res.statusCode, body: data }); }
        });
      }
    );
    req.on("error", () => resolve({ status: 0, body: null }));
    req.on("timeout", () => { req.destroy(); resolve({ status: 0, body: null }); });
  });
}

async function checkGoopPlayground() {
  const health = await goopGet("/health");
  if (health.status !== 200) {
    setFail("goop_broker", { port: GOOP_PORT, hint: "broker offline — start: node lib/goop-playground/goop-playground.js" });
    return;
  }
  setOk("goop_broker", { port: GOOP_PORT, uptime_sec: health.body?.uptimeSec, verified_apis: health.body?.verifiedApis });

  const apis = await goopGet("/apis");
  if (apis.status !== 200 || !apis.body?.total) {
    setFail("goop_registry", { total: 0, hint: "api-registry.json empty or unreadable" });
  } else {
    setOk("goop_registry", { total: apis.body.total });
  }

  const deny = await goopGet("/call?id=this_api_does_not_exist&agent=doctor&division=CREATIVE");
  if (deny.status === 404 && deny.body?.ok === false) {
    setOk("goop_default_deny", { probe_status: 404, error: deny.body?.error });
  } else {
    setWarn("goop_default_deny", { probe_status: deny.status, body: deny.body });
  }

  const call1 = await goopGet("/call?id=open_meteo_weather&agent=doctor&division=OPERATIONS&latitude=0&longitude=0&current=temperature_2m");
  const call2 = await goopGet("/call?id=open_meteo_weather&agent=doctor&division=OPERATIONS&latitude=0&longitude=0&current=temperature_2m");
  if (call2.body?.cache_hit) {
    setOk("goop_cache", { cache_hit: true, duration_ms_first: call1.body?.durationMs, duration_ms_second: call2.body?.durationMs });
  } else {
    setWarn("goop_cache", { cache_hit: call2.body?.cache_hit, note: "cache may be empty after restart" });
  }

  const before = (await goopGet("/usage?agent=doctor")).body?.entries?.length || 0;
  await goopGet("/call?id=usgs_earthquakes&agent=doctor&division=SCIENCE");
  const after = (await goopGet("/usage?agent=doctor")).body?.entries?.length || 0;
  if (after > before) setOk("goop_ledger", { before, after, delta: after - before });
  else setWarn("goop_ledger", { before, after, hint: "call did not appear in ledger" });

  const secretProbe = await goopGet("/apis");
  const probeStr = JSON.stringify(secretProbe.body || "");
  const secretLeaks = ["api_key", "apiKey", "authorization", "oauth_token", "bearer"].filter(k =>
    new RegExp('"' + k + '"\\s*:\\s*"(?!none|-1)').test(probeStr)
  );
  if (secretLeaks.length === 0) setOk("goop_secrets_hidden", { scanned: secretProbe.body?.total });
  else setFail("goop_secrets_hidden", { leaks: secretLeaks });

  try {
    const reg = require("./tools");
    const tools = reg.list();
    const hasSquirrel = tools.some(t => t.name === "api_squirrel");
    if (hasSquirrel) setOk("goop_squirrel", { registered: true });
    else setWarn("goop_squirrel", { hint: "api_squirrel tool not registered" });
  } catch (e) {
    setWarn("goop_squirrel", { error: e.message });
  }
}

// ── Public API ────────────────────────────────────────────
async function run(opts = {}) {
  const profile = opts.profile || "core";
  checkTools();
  checkVault();
  checkSpendGate();
  await checkMemory();
  await checkSpineLayers();
  checkProviders();
  checkDeps();
  checkSkills();
  checkUpdates();
  await checkServices(profile, opts.verbose);
  await checkGoopPlayground();
  result.score = scoreboard();
  return result;
}

// ── CLI output ───────────────────────────────────────────
function formatText(res, verbose) {
  const lines = [];
  const s = res.score;
  const overallIcon = res.overall === "ok" ? "\u2705" :
                      res.overall === "warn" ? "\u26a0" : "\u274c";
  lines.push("");
  lines.push("  \u2554" + "\u2550" * 57 + "\u2557");
  lines.push(`  \u2551  ${overallIcon}  PURPCLAW DOCTOR  ${res.overall.toUpperCase().padEnd(2)}  \u2014  ${s.ok}/${s.total} OK, ${s.warn} warn, ${s.fail} fail  \u2551`);
  lines.push("  \u255a" + "\u2550" * 57 + "\u255d");
  lines.push("");

  const sections = [
    ["tools",       "Tool Registry"],
    ["services",    "Service Health"],
    ["vault",       "Vault"],
    ["spend",       "SpendGate"],
    ["memory",      "Memory Spine"],
    ["providers",   "Providers"],
    ["deps",        "Dependencies"],
    ["skills",      "Skills"],
    ["goop_broker", "GOOP Playground"],
    ["updates",     "Updates"],
  ];
  for (const [key, title] of sections) {
    if (key === "goop_broker") {
      const goopChecks = Object.entries(res.checks).filter(([k]) => k.startsWith("goop_"));
      const okCount = goopChecks.filter(([, v]) => v.status === "ok").length;
      const allOk = okCount === goopChecks.length;
      const icon = allOk ? "\u2705" : goopChecks.some(([, v]) => v.status === "fail") ? "\u274c" : "\u26a0 ";
      lines.push(`  ${icon} ${title} (${okCount}/${goopChecks.length} sub-checks pass)`);
      for (const [k, v] of goopChecks) {
        const subIcon = v.status === "ok" ? "  \u2713" : v.status === "warn" ? "  \u26a0" : "  \u2717";
        const subName = k.replace("goop_", "").replace(/_/g, " ");
        lines.push(`${subIcon} ${subName}: ${v.status}`);
      }
      continue;
    }
    const c = res.checks[key];
    if (!c) { lines.push(`  -- ${title}: not checked`); continue; }
    const icon = c.status === "ok" ? "\u2705" : c.status === "warn" ? "\u26a0 " : "\u274c";
    lines.push(`  ${icon} ${title}`);

    if (verbose || c.status !== "ok") {
      for (const [k, v] of Object.entries(c)) {
        if (k === "status" || typeof v === "object") continue;
        const valStr = typeof v === "number" ? v.toLocaleString() : String(v).substring(0, 80);
        lines.push(`     ${k}: ${valStr}`);
      }
    }
  }
  lines.push("");
  return lines.join("\n");
}

module.exports = { run, formatText, scoreboard };
