#!/usr/bin/env node
/**
 * scripts/install-skill-from-github.js
 * 
 * Install a PurpClaw skill from any public GitHub repo.
 * Matches Codex's install-skill-from-github.py pattern.
 * 
 * Usage:
 *   node scripts/install-skill-from-github.js --repo owner/repo --path skills/my-skill
 *   node scripts/install-skill-from-github.js --url https://github.com/owner/repo/tree/main/skills/my-skill
 *   node scripts/install-skill-from-github.js --repo owner/repo --path skills/my-skill --dest /path/to/skills
 *   node scripts/install-skill-from-github.js --repo owner/repo --path skills/my-skill --method download
 *   node scripts/install-skill-from-github.js --repo owner/repo --path skills/my-skill --method git
 *
 * Options:
 *   --repo <owner/repo>   GitHub repo (required unless --url)
 *   --path <path>         Path within repo to skill dir (required unless --url)
 *   --url <url>           Full GitHub tree URL (alternative to --repo + --path)
 *   --dest <path>         Destination skills directory (default: PURPCLAW/skills)
 *   --ref <ref>           Git ref (default: main)
 *   --method <m>          'download' (default) or 'git' sparse checkout
 *   --name <name>         Override skill directory name
 *   --verbose             Print extra debug info
 */

const { spawn } = require('child_process');
const fs   = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const url  = require('url');

// ── Config ───────────────────────────────────────────────────────────────────

const PURP_DIR = process.env.PURP_DIR ||
  (process.env.HOME ? path.join(process.env.HOME, '.purpclaw') : 'C:/Users/Admin/.purpclaw');
const DEFAULT_SKILLS_DIR = path.join(PURP_DIR, 'skills');

const GH_API = 'api.github.com';
const GH_RAW = 'raw.githubusercontent.com';

// ── Args ─────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { dest: DEFAULT_SKILLS_DIR, ref: 'main', method: 'download', verbose: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--repo')  args.repo  = argv[++i];
    else if (a === '--path') args.path  = argv[++i];
    else if (a === '--url')  args.url  = argv[++i];
    else if (a === '--dest') args.dest = argv[++i];
    else if (a === '--ref')  args.ref  = argv[++i];
    else if (a === '--method') args.method = argv[++i];
    else if (a === '--name')  args.name  = argv[++i];
    else if (a === '--verbose') args.verbose = true;
  }
  // Parse --url into repo + path
  if (args.url) {
    const m = args.url.match(/github\.com\/([^/]+\/[^/]+)\/tree\/([^/]+)\/(.+)/);
    if (m) { args.repo = m[1]; args.ref = m[2]; args.path = m[3]; }
    else { console.error('Cannot parse --url:', args.url); process.exit(1); }
  }
  if (!args.repo || !args.path) {
    console.error('Error: --repo and --path are required (or --url)');
    console.error('Usage: node install-skill-from-github.js --repo owner/repo --path skills/my-skill [--dest /path] [--ref main] [--method download|git]');
    process.exit(1);
  }
  // Default name from path basename
  if (!args.name) args.name = path.basename(args.path);
  return args;
}

// ── HTTP helpers ─────────────────────────────────────────────────────────────

function httpsGet(opts) {
  return new Promise((resolve, reject) => {
    const req = https.request(opts, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // Follow redirect
        const loc = new URL(res.headers.location);
        httpsGet({ hostname: loc.hostname, path: loc.pathname, headers: opts.headers })
          .then(resolve).catch(reject);
        return;
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

function execCmd(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    if (opts.verbose) console.error(`[exec] ${cmd} ${args.join(' ')}`);
    const child = spawn(cmd, args, { shell: true, windowsHide: true, ...opts });
    const out = [], err = [];
    child.stdout?.on('data', c => out.push(c));
    child.stderr?.on('data', c => err.push(c));
    child.on('close', code => {
      if (code === 0) resolve({ stdout: Buffer.concat(out).toString('utf8'), stderr: Buffer.concat(err).toString('utf8') });
      else reject(new Error(`exit ${code}: ${Buffer.concat(err).toString('utf8').slice(0, 200)}`));
    });
    child.on('error', reject);
  });
}

// ── GitHub API ───────────────────────────────────────────────────────────────

async function ghApiGet(pathStr, token) {
  const headers = { 'User-Agent': 'purpclaw-skill-install', 'Accept': 'application/vnd.github.v3+json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await httpsGet({ hostname: GH_API, path: pathStr, headers });
  if (res.status === 200) return JSON.parse(res.body);
  if (res.status === 404) return null;
  throw new Error(`GitHub API ${res.status}: ${pathStr}`);
}

// ── Download method ────────────────────────────────────────────────────────────

async function downloadSkillFiles(repo, ref, filePath, token) {
  // Get the directory contents or file contents via GitHub API
  const encodedPath = encodeURIComponent(filePath);
  const apiPath = `/repos/${repo}/contents/${encodedPath}${ref ? `?ref=${ref}` : ''}`;
  
  const content = await ghApiGet(apiPath, token);
  if (!content) {
    // Try as a raw file
    const rawPath = `/${repo}/${ref}/${filePath}`;
    const res = await httpsGet({ hostname: GH_RAW, path: rawPath, headers: { 'User-Agent': 'purpclaw' } });
    if (res.status === 200) return [{ path: path.basename(filePath), content: res.body, isDir: false }];
    throw new Error(`Not found: ${filePath} in ${repo}`);
  }
  
  if (!Array.isArray(content)) {
    // Single file
    return [{ path: path.basename(filePath), content: Buffer.from(content.content, 'base64').toString('utf8'), isDir: false }];
  }
  
  // Directory — recursively get all files
  const files = [];
  for (const item of content) {
    const itemPath = `${filePath}/${item.name}`;
    if (item.type === 'dir') {
      const sub = await downloadSkillFiles(repo, ref, itemPath, token);
      files.push(...sub);
    } else {
      const res = await httpsGet({ hostname: GH_RAW, path: `/${repo}/${ref}/${itemPath}`, headers: { 'User-Agent': 'purpclaw' } });
      if (res.status === 200) {
        files.push({ path: item.name, content: res.body, isDir: false, fullPath: itemPath });
      }
    }
  }
  return files;
}

// ── Git sparse checkout method ─────────────────────────────────────────────────

async function gitSparseCheckout(repo, ref, filePath, destDir, token) {
  const tokenArg = token ? `-c credential.helper='!f() { echo "username=x"; echo "password=${token}"; }; f'` : '';
  const remote = `https://github.com/${repo}.git`;
  await execCmd('git', ['clone', '--filter=blob:none', '--no-checkout', remote, destDir, tokenArg]);
  await execCmd('git', ['sparse-checkout', 'set', filePath], { cwd: destDir });
  await execCmd('git', ['checkout', ref], { cwd: destDir });
  // Move files from filePath/* to destDir root
  const srcDir = path.join(destDir, filePath);
  if (fs.existsSync(srcDir)) {
    const entries = fs.readdirSync(srcDir);
    for (const entry of entries) {
      fs.renameSync(path.join(srcDir, entry), path.join(destDir, entry));
    }
    fs.rmdirSync(srcDir);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(argv) {
  const args = parseArgs(argv);
  const { repo, ref, path: skillPath, name, dest, method, verbose } = args;

  const skillDir = path.join(dest, name);
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';

  console.error(`Installing skill '${name}' from ${repo}/${skillPath} (${ref})...`);
  console.error(`Destination: ${skillDir}`);

  if (fs.existsSync(skillDir)) {
    console.error(`Error: Destination already exists: ${skillDir}`);
    console.error('Remove it first, or use a different --name');
    process.exit(1);
  }

  fs.mkdirSync(skillDir, { recursive: true });

  let files;
  try {
    if (method === 'git') {
      await gitSparseCheckout(repo, ref, skillPath, skillDir, token);
      console.error('Done (git sparse checkout).');
    } else {
      // Download files via GitHub API + raw
      console.error('Fetching files...');
      files = await downloadSkillFiles(repo, ref, skillPath, token);
      console.error(`Downloaded ${files.length} files.`);
      for (const file of files) {
        const relPath = file.fullPath ? path.relative(skillPath, file.fullPath) : file.path;
        const filePath = path.join(skillDir, relPath);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, file.content, 'utf8');
        if (verbose) console.error(`  ${relPath}`);
      }
      console.error('Done (download).');
    }
  } catch (err) {
    console.error(`Download failed: ${err.message}`);
    if (method === 'download') {
      console.error('Falling back to git sparse checkout...');
      try {
        fs.rmSync(skillDir, { recursive: true });
        fs.mkdirSync(skillDir, { recursive: true });
        await gitSparseCheckout(repo, ref, skillPath, skillDir, token);
        console.error('Done (git fallback).');
      } catch (e2) {
        console.error(`Git fallback also failed: ${e2.message}`);
        fs.rmSync(skillDir, { recursive: true });
        process.exit(1);
      }
    } else {
      fs.rmSync(skillDir, { recursive: true });
      process.exit(1);
    }
  }

  // Verify SKILL.md exists
  if (!fs.existsSync(path.join(skillDir, 'SKILL.md'))) {
    console.warn(`Warning: SKILL.md not found in ${skillDir}`);
  }

  console.log(`${name} installed successfully at ${skillDir}`);
  console.log('Available on your next turn.');
}

main(process.argv).catch(err => { console.error(err); process.exit(1); });
