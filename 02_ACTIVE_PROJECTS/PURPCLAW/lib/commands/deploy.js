'use strict';
/**
 * lib/commands/deploy.js — purpclaw deploy
 * One-command deployment to a VPS via Docker.
 * Bundles the stack, ships it, runs it, reports URL.
 */
const path = require('path');
const fs = require('fs');
const { execSafe, trackedSpawn } = require('../child-registry');

const PURP_DIR = path.resolve(__dirname, '..', '..');

async function run(args) {
  const sub = (args[0] || '').toLowerCase();

  if (sub === 'help' || !sub) {
    console.log('');
    console.log('  purpclaw deploy            — deploy to configured VPS');
    console.log('  purpclaw deploy docker     — build + push Docker image');
    console.log('  purpclaw deploy status     — check deployment health');
    console.log('  purpclaw deploy setup      — configure VPS connection');
    console.log('');
    return;
  }

  if (sub === 'setup') {
    return cmdSetup();
  }
  if (sub === 'docker') {
    return cmdDocker();
  }
  if (sub === 'status') {
    return cmdStatus();
  }

  // Default: full deploy
  return cmdDeploy();
}

async function cmdSetup() {
  const readline = require('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise(r => rl.question(q, r));

  console.log('');
  console.log('  🚀 PURPCLAW DEPLOY SETUP');
  console.log('');

  const host = await ask('  VPS host/IP: ');
  const user = await ask('  SSH user (default: root): ') || 'root';
  const port = await ask('  SSH port (default: 22): ') || '22';
  const keyPath = await ask('  SSH key path (default: ~/.ssh/id_rsa): ') || '~/.ssh/id_rsa';

  rl.close();

  const config = { host, user, port: parseInt(port), keyPath };
  const configPath = path.join(PURP_DIR, 'deploy-config.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log(`  ✅ Config saved to deploy-config.json`);
  console.log(`  Run: purpclaw deploy`);
  console.log('');
}

async function loadConfig() {
  const configPath = path.join(PURP_DIR, 'deploy-config.json');
  if (!fs.existsSync(configPath)) {
    console.log('  ❌ No deploy config found. Run: purpclaw deploy setup');
    return null;
  }
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

async function cmdDocker() {
  console.log('');
  console.log('  🐳 Building Docker image...');
  
  // Check if Dockerfile exists, create one if not
  const dockerfile = path.join(PURP_DIR, 'Dockerfile');
  if (!fs.existsSync(dockerfile)) {
    console.log('  📝 Creating Dockerfile...');
    createDockerfile();
  }

  try {
    const tag = `purpclaw:${Date.now()}`;
    await execSafe('docker', ['build', '-t', tag, '.'], { 
      cwd: PURP_DIR, 
      timeoutMs: 120_000 
    });
    console.log(`  ✅ Built: ${tag}`);
    console.log('');
    console.log('  Run: docker push <registry>/purpclaw:latest');
    console.log('  Or: docker save purpclaw | ssh <vps> docker load');
  } catch (e) {
    console.log(`  ❌ Docker build failed: ${e.message}`);
  }
  console.log('');
}

function createDockerfile() {
  const content = `FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
EXPOSE 3030 7780 7790 7880
CMD ["node", "bin/purpclaw.js", "start"]
`;
  fs.writeFileSync(path.join(PURP_DIR, 'Dockerfile'), content);
  // Also create .dockerignore
  const di = `node_modules\n.next\nagent_work\n.git\n*.md\n`;
  fs.writeFileSync(path.join(PURP_DIR, '.dockerignore'), di);
}

async function cmdDeploy() {
  const cfg = await loadConfig();
  if (!cfg) return;

  console.log('');
  console.log('  🚀 DEPLOYING PURPCLAW');
  console.log(`  → ${cfg.user}@${cfg.host}:${cfg.port}`);
  console.log('');

  // 1. Build Docker image
  console.log('  🐳 Building...');
  createDockerfile();
  const tag = `purpclaw:deploy-${Date.now()}`;
  const buildResult = await execSafe('docker', ['build', '-t', tag, '.'], { 
    cwd: PURP_DIR, timeoutMs: 180_000 
  });
  if (!buildResult.ok) {
    console.log(`  ❌ Build failed: ${buildResult.stderr?.substring(0, 200)}`);
    return;
  }
  console.log('  ✅ Built');

  // 2. Save + transfer
  console.log('  📦 Saving image...');
  const imagePath = path.join(require('os').tmpdir(), 'purpclaw-deploy.tar');
  await execSafe('docker', ['save', '-o', imagePath, tag], { timeoutMs: 60_000 });
  console.log('  📤 Transferring to VPS...');
  await execSafe('scp', [
    '-P', String(cfg.port),
    '-i', cfg.keyPath,
    imagePath,
    `${cfg.user}@${cfg.host}:/tmp/purpclaw.tar`
  ], { timeoutMs: 120_000 });
  console.log('  ✅ Transferred');

  // 3. Load and run on VPS
  console.log('  🔄 Loading on VPS...');
  await execSafe('ssh', [
    '-p', String(cfg.port),
    '-i', cfg.keyPath,
    `${cfg.user}@${cfg.host}`,
    `docker load -i /tmp/purpclaw.tar && docker run -d --name purpclaw --restart unless-stopped -p 3030:3030 -p 7780:7780 ${tag}`
  ], { timeoutMs: 60_000 });

  // 4. Health check
  console.log('  ⏳ Waiting for startup...');
  await new Promise(r => setTimeout(r, 5000));
  const health = await execSafe('ssh', [
    '-p', String(cfg.port),
    '-i', cfg.keyPath,
    `${cfg.user}@${cfg.host}`,
    `curl -s -o /dev/null -w '%{http_code}' http://localhost:3030/`
  ], { timeoutMs: 10_000 });

  console.log('');
  if (health.ok && health.stdout?.trim() === '200') {
    console.log(`  ✅ PURPCLAW DEPLOYED`);
    console.log(`  🌐 http://${cfg.host}:3030`);
  } else {
    console.log(`  ⚠️  Deployed but health check returned ${health.stdout?.trim() || 'unknown'}`);
    console.log(`  Check: ssh ${cfg.user}@${cfg.host} docker logs purpclaw`);
  }
  console.log('');
}

async function cmdStatus() {
  const cfg = await loadConfig();
  if (!cfg) return;

  console.log('');
  console.log(`  📡 Checking ${cfg.host}...`);
  const result = await execSafe('ssh', [
    '-p', String(cfg.port),
    '-i', cfg.keyPath,
    `${cfg.user}@${cfg.host}`,
    `docker ps --filter name=purpclaw --format '{{.Status}}' && echo '---' && curl -s -o /dev/null -w 'Web: HTTP %{http_code}' http://localhost:3030/ && echo '' && curl -s -o /dev/null -w 'API: HTTP %{http_code}' http://localhost:7780/api/health`
  ], { timeoutMs: 15_000 });

  if (result.ok) {
    console.log(`  ${result.stdout}`);
  } else {
    console.log(`  ❌ Cannot reach VPS: ${result.stderr?.substring(0, 200)}`);
  }
  console.log('');
}

module.exports = { run };
