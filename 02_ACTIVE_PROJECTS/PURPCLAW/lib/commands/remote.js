// lib/commands/remote.js — Remote execution management
// Codex parity: `codex remote` subcommand
// Manages remote execution targets (hosts, SSH config, cloud VMs)
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PURP_DIR = path.resolve(__dirname, '../..');
const REMOTE_DIR = path.join(process.env.PURPCLAW_DIR || PURP_DIR, '.remote');

// Remote config shape: { targets: [{ name, host, user, port, key, note }] }
function loadConfig() {
  if (!fs.existsSync(REMOTE_DIR)) return { targets: [] };
  try {
    return JSON.parse(fs.readFileSync(REMOTE_DIR, 'utf8'));
  } catch (_) {
    return { targets: [] };
  }
}

function saveConfig(cfg) {
  if (!fs.existsSync(path.dirname(REMOTE_DIR))) {
    fs.mkdirSync(path.dirname(REMOTE_DIR), { recursive: true });
  }
  fs.writeFileSync(REMOTE_DIR, JSON.stringify(cfg, null, 2));
}

const HELP = `
Usage: purpclaw remote <subcommand>

Remote execution target management. Add SSH hosts, cloud VMs,
or other remote machines as execution targets for the agent.

Subcommands:
  list             List all configured remote targets
  add <name>       Add a new remote target (interactive)
  add <name> <host> [user] [port]  Add non-interactively
  remove <name>    Remove a remote target
  status [name]    Ping target to check connectivity
  exec <name> <cmd>  Execute a command on a remote target via SSH
  copy <name> <src> <dst>  Copy file to remote target via scp

Examples:
  purpclaw remote list
  purpclaw remote add staging user@192.168.1.10 22
  purpclaw remote add prod
  purpclaw remote status prod
  purpclaw remote exec prod "uptime"
  purpclaw remote copy prod ./build.tar.gz /tmp/build.tar.gz
`.trim();

module.exports = {
  run(args, ctx) {
    const sub = args[0] || 'list';
    switch (sub) {
      case 'list':   case 'ls':      return listTargets();
      case 'add':                         return addTarget(args.slice(1));
      case 'remove': case 'rm': case 'del': return removeTarget(args[1]);
      case 'status': case 'ping':         return statusTarget(args[1]);
      case 'exec':                        return execRemote(args.slice(1));
      case 'copy':   case 'scp':          return copyRemote(args.slice(1));
      case 'help':   case '-h':
        console.log(HELP);
        return;
      default:
        if (sub.startsWith('-')) {
          console.log(HELP);
          return;
        }
        console.error(`Unknown subcommand: ${sub}`);
        console.log(HELP);
    }
  },
};

function listTargets() {
  const cfg = loadConfig();
  const targets = cfg.targets || [];
  if (!targets.length) {
    console.log('\n No remote targets configured.');
    console.log(' Add one:  purpclaw remote add <name> <host> [user] [port]\n');
    return;
  }
  console.log('\n Remote Targets:\n');
  for (const t of targets) {
    const endpoint = `${t.user || 'root'}@${t.host}:${t.port || 22}`;
    console.log(`  \x1b[36m${t.name}\x1b[0m`);
    console.log(`    endpoint: ${endpoint}`);
    if (t.note) console.log(`    note: ${t.note}`);
    // Quick connectivity check
    let reachable = 'unknown';
    try {
      execSync(`ping -n 1 -w 1000 ${t.host}`, { encoding: 'utf8', timeout: 3000, stdio: 'pipe' });
      reachable = '\x1b[32mreachable\x1b[0m';
    } catch (_) {
      reachable = '\x1b[31munreachable\x1b[0m';
    }
    console.log(`    ping: ${reachable}`);
  }
  console.log('');
}

function addTarget(args) {
  const [name, host, user, port] = args;
  if (!name) {
    console.error('Usage: purpclaw remote add <name> [host] [user] [port]');
    return;
  }
  if (!host) {
    console.log('\n Interactive target add not yet implemented.');
    console.log(' Usage: purpclaw remote add <name> <host> [user] [port]');
    console.log(' Example: purpclaw remote add staging 192.168.1.10 root 22\n');
    return;
  }
  const cfg = loadConfig();
  const existing = cfg.targets.findIndex(t => t.name === name);
  const entry = {
    name,
    host,
    user: user || 'root',
    port: port ? parseInt(port) : 22,
    addedAt: new Date().toISOString(),
  };
  if (existing >= 0) {
    cfg.targets[existing] = entry;
    console.log(`\x1b[33m Updated:\x1b[0m ${name} → ${entry.user}@${entry.host}:${entry.port}`);
  } else {
    cfg.targets.push(entry);
    console.log(`\x1b[32m✔ Added:\x1b[0m ${name} → ${entry.user}@${entry.host}:${entry.port}`);
  }
  saveConfig(cfg);
}

function removeTarget(name) {
  if (!name) { console.error('Usage: purpclaw remote remove <name>'); return; }
  const cfg = loadConfig();
  const idx = cfg.targets.findIndex(t => t.name === name);
  if (idx < 0) {
    console.error(`Target not found: ${name}`);
    return;
  }
  cfg.targets.splice(idx, 1);
  saveConfig(cfg);
  console.log(`\x1b[32m✔ Removed:\x1b[0m ${name}`);
}

function statusTarget(name) {
  const cfg = loadConfig();
  const target = name ? cfg.targets.find(t => t.name === name) : null;

  if (name && !target) {
    console.error(`Target not found: ${name}`);
    return;
  }

  const targets = target ? [target] : cfg.targets;
  if (!targets.length) {
    console.error('No targets configured. Add one: purpclaw remote add <name> <host>');
    return;
  }

  console.log('\n Remote Status:\n');
  for (const t of targets) {
    const endpoint = `${t.user}@${t.host}`;
    process.stdout.write(`  \x1b[36m${t.name}\x1b[0m  ${endpoint}  ... `);
    try {
      execSync(`ping -n 1 -w 2000 ${t.host}`, { encoding: 'utf8', timeout: 4000, stdio: 'pipe' });
      console.write('\x1b[32mreachable\x1b[0m\n');
    } catch (_) {
      console.write('\x1b[31munreachable\x1b[0m\n');
    }
  }
  console.log('');
}

async function execRemote(args) {
  const [name, ...cmdParts] = args;
  const cmd = cmdParts.join(' ');
  if (!name || !cmd) {
    console.error('Usage: purpclaw remote exec <name> <command>');
    return;
  }
  const cfg = loadConfig();
  const target = cfg.targets.find(t => t.name === name);
  if (!target) {
    console.error(`Target not found: ${name}`);
    return;
  }
  const sshCmd = `ssh ${target.user}@${target.host} -p ${target.port} ${cmd}`;
  console.log(`\n Executing on \x1b[36m${name}\x1b[0m (\x1b[33m${cmd}\x1b[0m)...\n`);
  try {
    execSync(sshCmd, { stdio: 'inherit', timeout: 30000 });
  } catch (err) {
    console.error(`\n\x1b[31m✖ SSH failed (exit ${err.status || '?'}): ${err.message}\x1b[0m`);
  }
}

async function copyRemote(args) {
  const [name, src, dst] = args;
  if (!name || !src || !dst) {
    console.error('Usage: purpclaw remote copy <name> <source> <dest>');
    return;
  }
  const cfg = loadConfig();
  const target = cfg.targets.find(t => t.name === name);
  if (!target) {
    console.error(`Target not found: ${name}`);
    return;
  }
  const scpCmd = `scp -P ${target.port} "${src}" ${target.user}@${target.host}:"${dst}"`;
  console.log(`\n Copying to \x1b[36m${name}\x1b[0m (\x1b[33m${src}\x1b[0m → \x1b[33m${dst}\x1b[0m)...\n`);
  try {
    execSync(scpCmd, { stdio: 'inherit', timeout: 60000 });
    console.log('\x1b[32m✔ Copy complete\x1b[0m');
  } catch (err) {
    console.error(`\x1b[31m✖ SCP failed: ${err.message}\x1b[0m`);
  }
}
