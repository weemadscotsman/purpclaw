'use strict';

const { spawnSync } = require('child_process');
const https = require('https');
const path = require('path');

const DEFAULT_TIMEOUT_MS = 20000;

function trimOutput(text, max = 12000) {
  const s = String(text || '').trim();
  if (s.length <= max) return s;
  return s.slice(0, max) + `\n... truncated ${s.length - max} chars`;
}

function runGit(args, opts = {}) {
  if (!Array.isArray(args) || args.some(a => typeof a !== 'string')) {
    throw new Error('git args must be an array of strings');
  }
  const cwd = path.resolve(opts.cwd || process.cwd());
  const gitBin = process.platform === 'win32' ? 'git.exe' : 'git';
  const result = spawnSync(gitBin, args, {
    cwd,
    encoding: 'utf8',
    timeout: opts.timeoutMs || DEFAULT_TIMEOUT_MS,
    windowsHide: true,
    shell: false,
  });

  return {
    ok: result.status === 0,
    code: result.status,
    signal: result.signal,
    stdout: trimOutput(result.stdout),
    stderr: trimOutput(result.stderr),
    cwd,
    command: ['git', ...args].join(' '),
    error: result.error ? result.error.message : null,
  };
}

function mustGit(args, opts = {}) {
  const result = runGit(args, opts);
  if (!result.ok) {
    const detail = result.stderr || result.stdout || result.error || `git exited ${result.code}`;
    throw new Error(`${result.command} failed: ${detail}`);
  }
  return result.stdout;
}

function parseRemoteUrl(remote) {
  const text = String(remote || '').trim();
  if (!text) return null;

  let m = text.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/i);
  if (m) return { owner: m[1], repo: m[2] };

  m = text.match(/^https?:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?(?:\/)?$/i);
  if (m) return { owner: m[1], repo: m[2] };

  return null;
}

function repoInfo(cwd = process.cwd()) {
  const root = mustGit(['rev-parse', '--show-toplevel'], { cwd });
  const branch = mustGit(['branch', '--show-current'], { cwd: root });
  const head = mustGit(['rev-parse', '--short', 'HEAD'], { cwd: root });
  const remote = runGit(['remote', 'get-url', 'origin'], { cwd: root });
  const origin = remote.ok ? remote.stdout : '';
  const github = parseRemoteUrl(origin);

  return { root, branch, head, origin, github };
}

function status(cwd = process.cwd(), opts = {}) {
  const repo = repoInfo(cwd);
  const porcelain = mustGit(['status', '--short'], { cwd: repo.root });
  const aheadBehind = runGit(['status', '--branch', '--short'], { cwd: repo.root }).stdout.split(/\r?\n/)[0] || '';
  const changed = porcelain ? porcelain.split(/\r?\n/).filter(Boolean) : [];
  const maxChanged = Number.isInteger(opts.maxChanged) ? opts.maxChanged : 120;
  return {
    ...repo,
    aheadBehind,
    changedCount: changed.length,
    changed: changed.slice(0, maxChanged),
    truncated: changed.length > maxChanged ? changed.length - maxChanged : 0,
    clean: changed.length === 0,
  };
}

function diff(cwd = process.cwd(), opts = {}) {
  const repo = repoInfo(cwd);
  const args = ['diff'];
  if (opts.cached) args.push('--cached');
  if (opts.stat) args.push('--stat');
  if (opts.nameOnly) args.push('--name-only');
  if (opts.path) args.push('--', String(opts.path));
  const out = mustGit(args, { cwd: repo.root });
  return { ...repo, diff: trimOutput(out, opts.maxChars || 20000) };
}

function log(cwd = process.cwd(), limit = 10) {
  const repo = repoInfo(cwd);
  const count = Math.max(1, Math.min(50, Number(limit) || 10));
  const out = mustGit(['log', `-${count}`, '--oneline', '--decorate'], { cwd: repo.root });
  return { ...repo, commits: out ? out.split(/\r?\n/) : [] };
}

function remotes(cwd = process.cwd()) {
  const repo = repoInfo(cwd);
  const out = mustGit(['remote', '-v'], { cwd: repo.root });
  return { ...repo, remotes: out ? out.split(/\r?\n/) : [] };
}

function githubRequest(pathName, opts = {}) {
  const token = opts.token || process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const headers = {
    'User-Agent': 'purpclaw-code-tools',
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.github.com',
      path: pathName,
      method: opts.method || 'GET',
      headers,
      timeout: opts.timeoutMs || DEFAULT_TIMEOUT_MS,
    }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        let parsed = body;
        try { parsed = body ? JSON.parse(body) : null; } catch { /* keep text */ }
        if (res.statusCode >= 400) {
          const msg = parsed && parsed.message ? parsed.message : String(body).slice(0, 200);
          reject(new Error(`GitHub ${res.statusCode}: ${msg}`));
          return;
        }
        resolve({ status: res.statusCode, body: parsed, rateLimit: {
          remaining: res.headers['x-ratelimit-remaining'],
          reset: res.headers['x-ratelimit-reset'],
        } });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('GitHub request timed out')));
    if (opts.body) req.write(JSON.stringify(opts.body));
    req.end();
  });
}

function requireGitHubTarget(cwd, explicit = {}) {
  const repo = repoInfo(cwd);
  const owner = explicit.owner || repo.github?.owner;
  const name = explicit.repo || repo.github?.repo;
  if (!owner || !name) {
    throw new Error('GitHub owner/repo not found. Set origin to GitHub or pass owner and repo.');
  }
  return { ...repo, owner, repo: name };
}

async function issue(cwd, number, explicit = {}) {
  const target = requireGitHubTarget(cwd, explicit);
  const n = Number(number);
  if (!Number.isInteger(n) || n <= 0) throw new Error('issue number required');
  const res = await githubRequest(`/repos/${target.owner}/${target.repo}/issues/${n}`);
  const item = res.body;
  return {
    ...target,
    number: item.number,
    title: item.title,
    state: item.state,
    author: item.user?.login,
    labels: (item.labels || []).map(l => l.name),
    url: item.html_url,
    body: trimOutput(item.body || '', 4000),
    rateLimit: res.rateLimit,
  };
}

async function pullRequest(cwd, number, explicit = {}) {
  const target = requireGitHubTarget(cwd, explicit);
  const n = Number(number);
  if (!Number.isInteger(n) || n <= 0) throw new Error('PR number required');
  const res = await githubRequest(`/repos/${target.owner}/${target.repo}/pulls/${n}`);
  const pr = res.body;
  return {
    ...target,
    number: pr.number,
    title: pr.title,
    state: pr.state,
    draft: pr.draft,
    author: pr.user?.login,
    head: pr.head?.label,
    base: pr.base?.label,
    mergeable: pr.mergeable,
    changedFiles: pr.changed_files,
    additions: pr.additions,
    deletions: pr.deletions,
    url: pr.html_url,
    body: trimOutput(pr.body || '', 4000),
    rateLimit: res.rateLimit,
  };
}

async function checks(cwd, ref, explicit = {}) {
  const target = requireGitHubTarget(cwd, explicit);
  const sha = ref || target.head || 'HEAD';
  const resolved = sha === 'HEAD' ? mustGit(['rev-parse', 'HEAD'], { cwd: target.root }) : sha;
  const res = await githubRequest(`/repos/${target.owner}/${target.repo}/commits/${resolved}/check-runs`);
  const runs = (res.body.check_runs || []).map(run => ({
    name: run.name,
    status: run.status,
    conclusion: run.conclusion,
    startedAt: run.started_at,
    completedAt: run.completed_at,
    url: run.html_url,
  }));
  return { ...target, ref: resolved, total: res.body.total_count || runs.length, runs, rateLimit: res.rateLimit };
}

module.exports = {
  runGit,
  repoInfo,
  status,
  diff,
  log,
  remotes,
  issue,
  pullRequest,
  checks,
};
