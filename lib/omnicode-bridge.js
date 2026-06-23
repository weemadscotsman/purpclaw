'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Auto-discover the omnicode-platform root directory.
 * Search order:
 *   1. OMNICODE_PLATFORM_PATH env var
 *   2. ../omnicode-platform relative to this project (PURPCLAW dir)
 *   3. ~/omnicode-platform
 *   4. null (omnicode not available)
 */
function discoverDefaultPlatformPath() {
  // 1. Explicit env var
  if (process.env.OMNICODE_PLATFORM_PATH) {
    const envPath = path.resolve(process.env.OMNICODE_PLATFORM_PATH);
    if (exists(path.join(envPath, 'package.json'))) return envPath;
  }
  // 2. Sibling directory relative to PURPCLAW project root
  const purpclawRoot = path.resolve(__dirname, '..');
  const siblingPath = path.join(purpclawRoot, '..', 'omnicode-platform');
  if (exists(path.join(siblingPath, 'package.json'))) return siblingPath;
  // 3. Home directory
  const homePath = path.join(os.homedir(), 'omnicode-platform');
  if (exists(path.join(homePath, 'package.json'))) return homePath;
  // 4. Not found
  return null;
}

const CONTRACT_VERSION = 'purpclaw-omnicode-contract.v1';

const TOOL_CONTRACT = [
  { name: 'session_resume_brief', phase: 'intake', permission: 'read-only', required: true },
  { name: 'repo_map', phase: 'map', permission: 'read-only', required: true },
  { name: 'resolve_all', phase: 'ledger', permission: 'agent', required: true },
  { name: 'benchmark', phase: 'proof', permission: 'read-only', required: true },
  { name: 'spaghetti_report', phase: 'health', permission: 'read-only', required: false },
  { name: 'get_context_bundle', phase: 'retrieval', permission: 'read-only', required: false },
  { name: 'check_delete_safe', phase: 'safety', permission: 'agent', required: false },
  { name: 'check_rename_safe', phase: 'safety', permission: 'agent', required: false },
  { name: 'write_repair_handoff', phase: 'handoff', permission: 'read-only', required: false },
];

function exists(filePath) {
  try { return fs.existsSync(filePath); } catch { return false; }
}

function readJson(filePath) {
  try {
    if (!exists(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return { error: error.message, path: filePath };
  }
}

function statIso(filePath) {
  try {
    if (!exists(filePath)) return null;
    return fs.statSync(filePath).mtime.toISOString();
  } catch {
    return null;
  }
}

function resolveRepoPath(input, fallbackRoot) {
  const raw = input?.repoPath || input?.repo || input?.path || fallbackRoot || process.cwd();
  return path.resolve(String(raw));
}

function discoverPlatformRoot(options = {}) {
  const candidates = [
    options.platformRoot,
    process.env.OMNICODE_PLATFORM_ROOT,
    discoverDefaultPlatformPath(),
    path.resolve(process.cwd(), '..', 'omnicode-platform'),
  ].filter(Boolean);
  return candidates.find(candidate => exists(path.join(candidate, 'package.json'))) || candidates[0];
}

function extractBenchmarkProof(repoPath) {
  const benchmarkPath = path.join(repoPath, '.omnicode', 'benchmark.json');
  const markdownPath = path.join(repoPath, '.omnicode', 'BENCHMARK.md');
  const benchmark = readJson(benchmarkPath);
  const resolution = benchmark && !benchmark.error ? benchmark.resolution || {} : {};
  const cumulative = benchmark && !benchmark.error ? benchmark.cumulative || {} : {};
  const index = benchmark && !benchmark.error ? benchmark.index || {} : {};
  return {
    available: Boolean(benchmark && !benchmark.error),
    benchmarkPath,
    markdownPath,
    generatedAt: benchmark?.generated_at || benchmark?.generatedAt || null,
    updatedAt: statIso(benchmarkPath),
    repoPath: benchmark?.repo_path || repoPath,
    sourceBytes: benchmark?.repo?.source_bytes || null,
    estimatedRawTokens: benchmark?.repo?.estimated_raw_tokens || null,
    indexedFiles: index.indexed_files ?? index.files ?? null,
    symbols: index.symbols ?? null,
    edges: index.edges ?? null,
    blindspots: index.blindspots ?? null,
    filesAccounted: resolution.files_accounted ?? null,
    unknownFiles: resolution.unknown_files ?? null,
    blockingRepairGaps: resolution.blocking_repair_gaps ?? null,
    sourceCoveragePercent: resolution.source_coverage_percent ?? null,
    reductionPercent: cumulative.reduction_percent ?? null,
    reductionDisplay: cumulative.reduction_display ?? null,
    byState: resolution.by_state || null,
    error: benchmark?.error || null,
  };
}

function getBridgeStatus(options = {}) {
  const repoPath = resolveRepoPath(options, options.rootDir);
  const platformRoot = discoverPlatformRoot(options);
  const runCmd = path.join(platformRoot, 'run_omnicode.cmd');
  const packageJson = path.join(platformRoot, 'package.json');
  const srcServer = path.join(platformRoot, 'src', 'server.ts');
  const srcCli = path.join(platformRoot, 'src', 'cli.ts');
  const subpackageServer = path.join(platformRoot, 'omnicode-mcp', 'dist', 'server.js');
  const rootShimServer = path.join(platformRoot, 'dist', 'server.js');
  const distServer = exists(subpackageServer) ? subpackageServer : rootShimServer;
  const proof = extractBenchmarkProof(repoPath);
  const mcpRunnable = exists(runCmd);
  const sourceAvailable = exists(srcServer) && exists(srcCli);
  const builtServerAvailable = exists(distServer);
  const mode = builtServerAvailable ? 'mcp-build-present' : sourceAvailable ? 'source-ready-build-needed' : 'ledger-only';

  return {
    ok: exists(packageJson),
    service: 'purpclaw-omnicode-bridge',
    contractVersion: CONTRACT_VERSION,
    repoPath,
    platformRoot,
    mode,
    capabilities: {
      mcpRunner: mcpRunnable ? runCmd : null,
      mcpServer: builtServerAvailable ? distServer : null,
      sourceAvailable,
      builtServerAvailable,
      ledgerProofAvailable: proof.available,
      preferredInterface: 'mcp-gateway',
      fallbackInterface: 'local-ledger-proof',
      liveHealthProbe: 'not-run-by-bridge',
    },
    gates: {
      zeroUnknownFiles: proof.unknownFiles === 0,
      destructiveRepairAllowed: proof.available && proof.unknownFiles === 0 && Number(proof.blockingRepairGaps || 0) === 0,
      reason: !proof.available
        ? 'no .omnicode benchmark proof in repo'
        : proof.unknownFiles !== 0
          ? 'unknown files remain'
          : Number(proof.blockingRepairGaps || 0) > 0
            ? 'blocking repair gaps remain'
            : 'ledger clear',
    },
    proof,
    tools: TOOL_CONTRACT,
    updatedAt: new Date().toISOString(),
  };
}

function buildRepoIntake(input = {}, options = {}) {
  const repoPath = resolveRepoPath(input, options.rootDir);
  const status = getBridgeStatus({ ...options, repoPath });
  const goal = String(input.goal || input.task || input.query || 'repo-aware PURPCLAW job').trim();
  const requestedTools = Array.isArray(input.tools) && input.tools.length
    ? input.tools
    : ['session_resume_brief', 'repo_map', 'resolve_all', 'benchmark', 'spaghetti_report'];
  const steps = requestedTools.map((tool, index) => {
    const spec = TOOL_CONTRACT.find(t => t.name === tool) || { name: tool, phase: 'custom', permission: 'read-only' };
    return {
      index,
      tool: spec.name,
      phase: spec.phase,
      permission: spec.permission,
      invocation: status.capabilities.builtServerAvailable
        ? { via: 'mcp', name: 'invoke_tool', arguments: { tool_name: spec.name, tool_input: { path: repoPath } } }
        : { via: 'planned-mcp', name: spec.name, arguments: { path: repoPath }, blockedBy: status.mode },
    };
  });

  return {
    ok: true,
    contractVersion: CONTRACT_VERSION,
    goal,
    repoPath,
    status,
    destructiveRepairAllowed: status.gates.destructiveRepairAllowed,
    repairGovernor: {
      state: status.gates.destructiveRepairAllowed ? 'clear' : 'blocked',
      reason: status.gates.reason,
      unknownFiles: status.proof.unknownFiles,
      blockingRepairGaps: status.proof.blockingRepairGaps,
    },
    steps,
    proofPayload: {
      benchmarkPath: status.proof.benchmarkPath,
      reductionDisplay: status.proof.reductionDisplay,
      sourceCoveragePercent: status.proof.sourceCoveragePercent,
      filesAccounted: status.proof.filesAccounted,
      unknownFiles: status.proof.unknownFiles,
      blockingRepairGaps: status.proof.blockingRepairGaps,
      byState: status.proof.byState,
    },
    nextAction: status.capabilities.builtServerAvailable
      ? 'call OmniCode MCP through invoke_tool before repo-aware swarm delegation'
      : 'build OmniCode dist or run through configured MCP; using local ledger proof until then',
    createdAt: new Date().toISOString(),
  };
}

module.exports = {
  CONTRACT_VERSION,
  TOOL_CONTRACT,
  getBridgeStatus,
  buildRepoIntake,
};
