// lib/commands/sandbox.js — Sandbox lifecycle management
// Codex parity: `codex sandbox` subcommand
// Implements: Docker container sandbox (when available), Windows child_process
// sandbox (when Docker unavailable), and policy enforcement.
//
// Docker unavailable on this Windows machine, so the Windows child_process
// sandbox (lib/sandbox-windows.js) provides:
//   - cwd locked to a freshly-created temp directory
//   - env vars stripped to a minimal safe allow-list
//   - hard timeout (default 30s) against runaway loops
//   - support: node, python, and shell (powershell) runtimes
//
// NOT a security boundary (Windows Sandbox / Hyper-V / Docker are needed for
// that) — effective against accidental damage.
'use strict';

const { execSync } = require('child_process');
const path = require('path');
const fs   = require('fs');

const PURP_DIR = path.resolve(__dirname, '../..');
const POLICY_PATH = path.join(process.env.PURPCLAW_DIR || PURP_DIR, 'policy.toml');

// Lazy-load the heavy sandbox modules (not needed for all subcommands)
function getDockerSandbox() {
  return require(path.join(PURP_DIR, 'lib', 'sandbox'));
}
function getWindowsSandbox() {
  return require(path.join(PURP_DIR, 'lib', 'sandbox-windows'));
}

const HELP = `
Usage: purpclaw sandbox <subcommand>

Sandbox lifecycle management. Enforces command policies and
(optionally) spins up isolated docker containers for agent execution.

Subcommands:
  status           Show sandbox and exec-policy enforcement status
  check <cmd>      Check if a command would be allowed by current policy
  list             List available sandbox backends (docker, windows)
  code [opts] "<code>"
                   Run code in Windows child_process sandbox
                   Options:
                     --runtime node|python|shell  (default: node)
                     --timeout <ms>                (default: 30000)
  run <cmd>        Run a command inside the sandbox (docker if available)
  create [name]    Create a new sandboxed environment
  remove [name]    Remove a sandboxed environment
  policy           Print current exec policy (effective allowlist)

Examples:
  purpclaw sandbox status
  purpclaw sandbox check "rm -rf /"
  purpclaw sandbox code "console.log(1+1)"
  purpclaw sandbox code --runtime python "print(2*3)"
  purpclaw sandbox code --runtime shell "Get-Process | Measure-Object"
  purpclaw sandbox policy
`.trim();

module.exports = {
  run(args, ctx) {
    const sub = args[0] || 'status';
    switch (sub) {
      case 'status':    return sandboxStatus();
      case 'check':     return checkCommand(args.slice(1));
      case 'list':      return listBackends();
      case 'code':      return runCode(args.slice(1));
      case 'run':       return runSandboxed(args.slice(1));
      case 'create':    return createSandbox(args[1]);
      case 'remove':    return removeSandbox(args[1]);
      case 'policy':
      case 'list-policies': return showPolicy();
      case 'help':
      case '-h':
        console.log(HELP);
        return;
      default:
        // Fallback: treat as code to run directly
        return runCode(args);
    }
  },
};

function sandboxStatus() {
  console.log('\n Sandbox Status:\n');

  // Docker availability
  let dockerOk = false;
  let dockerVersion = 'not installed';
  try {
    const v = execSync('docker --version', { encoding: 'utf8', timeout: 3000 }).trim();
    dockerVersion = v;
    dockerOk = true;
  } catch (_) {
    dockerVersion = 'not found';
  }
  const dockerColor = dockerOk ? '\x1b[32m' : '\x1b[31m';
  console.log(`  ${dockerColor}docker\x1b[0m   ${dockerVersion}`);

  // Podman availability
  let podmanOk = false;
  try {
    execSync('podman --version', { encoding: 'utf8', timeout: 3000 });
    podmanOk = true;
  } catch (_) {}
  const podmanColor = podmanOk ? '\x1b[32m' : '\x1b[31m';
  console.log(`  ${podmanColor}podman\x1b[0m  ${podmanOk ? 'available' : 'not found'}`);

  // Policy file
  let policyOk = false;
  if (fs.existsSync(POLICY_PATH)) {
    try {
      const content = fs.readFileSync(POLICY_PATH, 'utf8');
      policyOk = content.includes('[allow]') || content.includes('allow =');
    } catch (_) {}
  }
  const policyColor = policyOk ? '\x1b[32m' : '\x1b[33m';
  const policyLabel = fs.existsSync(POLICY_PATH) ? 'loaded' : 'not found';
  console.log(`  ${policyColor}policy\x1b[0m   ${policyLabel} (${POLICY_PATH})`);

  // Enforcement status
  console.log('\n Enforcement:');
  try {
    const { enforce } = require('../exec-policy');
    const result = enforce('__POLICY_TEST__');
    if (result.allowed) {
      console.log('  \x1b[33m⚠ warning\x1b[0m  exec-policy enforce() is not wired into command execution');
      console.log('         Commands bypass policy unless exec-policy is called explicitly');
    }
  } catch (err) {
    console.log(`  \x1b[31m✖ exec-policy not loadable: ${err.message}\x1b[0m`);
  }
  console.log('');
}

function checkCommand(args) {
  const cmd = args.join(' ');
  if (!cmd) {
    console.error('Usage: purpclaw sandbox check <command>');
    return;
  }
  console.log(`\n Checking: \x1b[33m${cmd}\x1b[0m\n`);
  try {
    const { enforce } = require('../exec-policy');
    const result = enforce(cmd);
    if (result.allowed) {
      console.log('  \x1b[32m✔ ALLOWED\x1b[0m  by policy');
      if (result.reason) console.log(`  Reason: ${result.reason}`);
    } else {
      console.log('  \x1b[31m✖ BLOCKED\x1b[0m by policy');
      if (result.reason) console.log(`  Reason: ${result.reason}`);
    }
  } catch (err) {
    console.error(`  \x1b[31m✖ Policy check failed: ${err.message}\x1b[0m`);
    console.log('  Falling back to heuristic check...');
    const blocked = /\b(rm\s+-rf\s+\/|mkfs|dd\s+if=.*of=\/dev|>\s*\/dev\/sd|powershell.*-enc\b|\|sh\b)/i;
    if (blocked.test(cmd)) {
      console.log('  \x1b[31m✖ BLOCKED\x1b[0m  (heuristic: destructive command)');
    } else {
      console.log('  \x1b[32m✔ ALLOWED\x1b[0m  (no policy, heuristic passed)');
    }
  }
  console.log('');
}

function listBackends() {
  console.log('\n Available Sandbox Backends:\n');
  let dockerOk = false;
  try { execSync('docker --version', { encoding: 'utf8', timeout: 3000 }); dockerOk = true; } catch (_) {}
  let podmanOk = false;
  try { execSync('podman --version', { encoding: 'utf8', timeout: 3000 }); podmanOk = true; } catch (_) {}

  if (dockerOk) {
    console.log('  \x1b[32m✔ docker\x1b[0m   available — full container isolation');
    console.log('  \x1b[32m✔ none\x1b[0m     host execution (no sandbox)');
  } else if (podmanOk) {
    console.log('  \x1b[32m✔ podman\x1b[0m  available — rootless container isolation');
    console.log('  \x1b[32m✔ none\x1b[0m    host execution (no sandbox)');
  } else {
    console.log('  \x1b[33m⚠ docker/podman not found\x1b[0m');
    console.log('  \x1b[31m✖ no container sandbox available\x1b[0m  install docker to enable');
    console.log('  \x1b[33m⚠ host execution only\x1b[0m');
  }
  console.log('');
}

async function runSandboxed(args) {
  const cmd = args.join(' ');
  if (!cmd) {
    console.error('Usage: purpclaw sandbox run <command>');
    return;
  }
  let dockerOk = false;
  try { execSync('docker --version', { encoding: 'utf8', timeout: 3000 }); dockerOk = true; } catch (_) {}

  if (!dockerOk) {
    console.error('\x1b[31mDocker not available — cannot run sandboxed.\x1b[0m');
    console.error('Install docker or use `purpclaw sandbox list` for alternatives.');
    return;
  }

  // Pre-policy check
  try {
    const { enforce } = require('../exec-policy');
    const result = enforce(cmd);
    if (!result.allowed) {
      console.error(`\x1b[31m✖ BLOCKED by policy: ${result.reason}\x1b[0m`);
      return;
    }
  } catch (_) {}

  const containerName = `purpclaw-sandbox-${Date.now()}`;
  console.log(`\n Running in docker sandbox (\x1b[36m${containerName}\x1b[0m)...`);
  console.log(` Command: \x1b[33m${cmd}\x1b[0m\n`);

  try {
    // Create temp container from alpine, run command, auto-remove
    const escapedCmd = cmd.replace(/'/g, "'\\''");
    const fullCmd = `docker run --rm --name ${containerName} -v "$(pwd)":/workspace -w /workspace alpine:latest sh -c '${escapedCmd}'`;
    execSync(fullCmd, { stdio: 'inherit', timeout: 30000 });
    console.log('\n \x1b[32m✔ Sandbox execution complete\x1b[0m');
  } catch (err) {
    if (err.status === 125) {
      console.error('\x1b[31m✖ Docker daemon not running. Start docker desktop.\x1b[0m');
    } else {
      console.error(`\x1b[31m✖ Sandbox execution failed (exit ${err.status || 'unknown'})\x1b[0m`);
    }
  }
}

function createSandbox(name) {
  const n = name || `purpclaw-sandbox-${Date.now()}`;
  let dockerOk = false;
  try { execSync('docker --version', { encoding: 'utf8', timeout: 3000 }); dockerOk = true; } catch (_) {}
  if (!dockerOk) {
    console.error('\x1b[31mDocker not available.\x1b[0m');
    return;
  }
  console.log(`\n Creating persistent sandbox: \x1b[36m${n}\x1b[0m`);
  try {
    execSync(`docker create --name ${n} -v "$(pwd)":/workspace -w /workspace alpine:latest sh`, { stdio: 'inherit' });
    console.log(`\x1b[32m✔ Sandbox created: ${n}\x1b[0m`);
    console.log('  Start it:  purpclaw sandbox run <cmd>');
  } catch (err) {
    console.error(`\x1b[31m✖ Failed to create sandbox: ${err.message}\x1b[0m`);
  }
}

function removeSandbox(name) {
  if (!name) { console.error('Usage: purpclaw sandbox remove <name>'); return; }
  let dockerOk = false;
  try { execSync('docker --version', { encoding: 'utf8', timeout: 3000 }); dockerOk = true; } catch (_) {}
  if (!dockerOk) { console.error('\x1b[31mDocker not available.\x1b[0m'); return; }
  try {
    execSync(`docker rm -f ${name}`, { stdio: 'inherit' });
    console.log(`\x1b[32m✔ Removed: ${name}\x1b[0m`);
  } catch (err) {
    console.error(`\x1b[31m✖ Failed: ${err.message}\x1b[0m`);
  }
}

async function runCode(args) {
  // purpclaw sandbox code [--runtime node|python|shell] [--timeout <ms>] "<code>"
  const SB_WIN = getWindowsSandbox();
  const runtimeIdx = args.indexOf('--runtime');
  const timeoutIdx = args.indexOf('--timeout');
  const runtime    = runtimeIdx !== -1 ? args[runtimeIdx + 1] : 'node';
  const timeoutMs  = timeoutIdx !== -1 ? parseInt(args[timeoutIdx + 1], 10) : 30_000;

  // Extract quoted code string
  let code = '';
  const quoteIdx = args.indexOf('"');
  if (quoteIdx !== -1) {
    const rest = args.slice(quoteIdx + 1).join(' ');
    const closeIdx = rest.indexOf('"');
    code = closeIdx !== -1 ? rest.slice(0, closeIdx) : rest;
  } else {
    // No quotes: grab first non-flag arg as the code
    code = args.find(a => !a.startsWith('--')) || '';
  }

  if (!code.trim()) {
    console.log('  usage: purpclaw sandbox code [--runtime node|python|shell] [--timeout <ms>] "<code>"\n');
    console.log('  examples:');
    console.log('    purpclaw sandbox code "console.log(1+1)"');
    console.log('    purpclaw sandbox code --runtime python "print(2*3)"');
    console.log('    purpclaw sandbox code --runtime shell "Get-Process | Measure-Object"\n');
    return;
  }

  const supported = ['node', 'python', 'shell'];
  if (!supported.includes(runtime)) {
    console.error(`  Unknown runtime: ${runtime}. Supported: ${supported.join(', ')}\n`);
    return;
  }

  const avail = await SB_WIN.windowsSandboxAvailable();
  console.log(`  Backend: ${avail.method}`);
  if (avail.note) console.log(`  Note: ${avail.note}\n`);

  const audit = SB_WIN.auditCode(code, runtime);
  if (!audit.ok) {
    console.log('  \x1b[33m⚠ Escape-pattern audit warnings:\x1b[0m');
    audit.issues.forEach(iss => console.log(`    - ${iss}`));
    console.log('');
  }

  console.log(`  Running [${runtime}]...`);
  const result = await SB_WIN.runInSandbox(code, { runtime, timeoutMs });

  if (result.stdout) process.stdout.write('  ' + result.stdout.trim() + '\n');
  if (result.stderr) process.stderr.write('  ' + result.stderr.trim() + '\n');
  if (result.killed) {
    console.log(`  \x1b[31m⏱ Timed out after ${timeoutMs}ms — killed\x1b[0m\n`);
  } else {
    console.log(`  exit ${result.exitCode} ${result.ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'}\n`);
  }
}

function showPolicy() {
  if (!fs.existsSync(POLICY_PATH)) {
    console.log(`\n No policy file at ${POLICY_PATH}`);
    console.log(' Run: purpclaw execpolicy init  to create one\n');
    return;
  }
  const content = fs.readFileSync(POLICY_PATH, 'utf8');
  console.log('\n Exec Policy:\n');
  // Pretty-print TOML sections
  const lines = content.split('\n');
  for (const line of lines) {
    if (line.startsWith('[')) {
      console.log('\n ' + line);
    } else {
      console.log('  ' + line);
    }
  }
  console.log('');
}
