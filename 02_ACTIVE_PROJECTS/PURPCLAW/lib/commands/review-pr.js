'use strict';

/**
 * purpclaw review — GitHub PR review with inline comments.
 *
 *   purpclaw review <pr-url>           # post inline comments on a PR
 *   purpclaw review <pr-url> --approve  # approve the PR
 *   purpclaw review <pr-url> --comment # post a general comment
 *   purpclaw review <pr-url> --create  # create a PR from a branch
 *   purpclaw review <pr-url> --merge    # merge the PR
 *   purpclaw review --token=<ghp_xxx>  # GitHub token
 *   Environment: GITHUB_TOKEN in .env or ~/.purpclaw/.env
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const GITHUB_API = 'api.github.com';

function ghRequest(method, path_, body, token) {
  return new Promise((resolve, reject) => {
    const token_ = token || process.env.GITHUB_TOKEN;
    const headers = {
      'Authorization': `Bearer ${token_}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'purpclaw-review',
      'Content-Type': 'application/json',
    };
    if (body) headers['Content-Length'] = Buffer.byteLength(JSON.stringify(body));
    const opts = { hostname: GITHUB_API, path: path_, method, headers };
    const req = (GITHUB_API === 'api.github.com' ? https : http).request(opts, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function parsePR(identifier) {
  // Accepts: https://github.com/owner/repo/pull/123
  //          owner/repo#123
  //          owner/repo/123
  const urlMatch = identifier.match(/github\.com\/([^\/]+)\/([^\/]+)\/pull\/(\d+)/);
  if (urlMatch) return { owner: urlMatch[1], repo: urlMatch[2], num: parseInt(urlMatch[3]) };
  const hashMatch = identifier.match(/^([^\/]+)\/([^\/]+)[#\/](\d+)$/);
  if (hashMatch) return { owner: hashMatch[1], repo: hashMatch[2], num: parseInt(hashMatch[3]) };
  return null;
}

async function run(args, ctx) {
  const token = (() => {
    const t = args.find(a => a.startsWith('--token='));
    if (t) return t.split('=')[1];
    try {
      const envPath = path.join(process.env.HOME || process.env.USERPROFILE, '.purpclaw', '.env');
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        const m = content.match(/GITHUB_TOKEN=(.+)/);
        if (m) return m[1].trim();
      }
    } catch {}
    return process.env.GITHUB_TOKEN;
  })();

  if (!token) {
    console.error('\n\x1b[31mNo GitHub token. Set GITHUB_TOKEN in .env or pass --token=<token>\x1b[0m\n');
    return;
  }

  const action = args.includes('--approve') ? 'approve'
    : args.includes('--comment') ? 'comment'
    : args.includes('--create') ? 'create'
    : args.includes('--merge') ? 'merge'
    : 'review';

  const prArg = args.find(a => !a.startsWith('--') && !a.startsWith('-'));
  if (!prArg && action !== 'create') {
    console.error('\n\x1b[33mUsage: purpclaw review <pr-url|owner/repo#num> [--approve|--comment|--create|--merge]\x1b[0m\n');
    return;
  }

  console.log(`\n  \x1b[36mPURPCLAW review\x1b[0m — action: ${action}`);

  if (action === 'create') {
    const branch = args.find(a => a.startsWith('--branch='))?.split('=')[1] || 'main';
    const title = args.find(a => a.startsWith('--title='))?.split('=')[1] || 'PR title';
    const body = args.find(a => a.startsWith('--body='))?.split('=')[1] || '';
    const base = args.find(a => a.startsWith('--base='))?.split('=')[1] || 'main';
    const owner = args.find(a => a.startsWith('--owner='))?.split('=')[1];
    const repo = args.find(a => a.startsWith('--repo='))?.split('=')[1];
    if (!owner || !repo) { console.error('\n\x1b[31m--create requires --owner= and --repo=\x1b[0m\n'); return; }
    const prData = await ghRequest('POST', `/repos/${owner}/${repo}/pulls`, { title, body, head: branch, base }, token);
    if (prData.status === 201) console.log(`\n\x1b[32mPR created: ${prData.data.html_url}\x1b[0m\n`);
    else console.error(`\n\x1b[31mPR create failed (${prData.status}): ${JSON.stringify(prData.data)}\x1b[0m\n`);
    return;
  }

  const parsed = parsePR(prArg);
  if (!parsed) { console.error(`\n\x1b[33mCould not parse PR from: ${prArg}\x1b[0m\n`); return; }

  const { owner, repo, num } = parsed;

  // Get diff
  const diffRes = await ghRequest('GET', `/repos/${owner}/${repo}/pulls/${num}`, null, token);
  if (diffRes.status !== 200) {
    console.error(`\n\x1b[31mFailed to fetch PR (${diffRes.status})\x1b[0m\n`);
    return;
  }
  const pr = diffRes.data;
  console.log(`  PR #${num}: ${pr.title}`);
  console.log(`  Author: ${pr.user.login} | ${pr.changed_files} files changed\n`);

  // Get file comparison
  const filesRes = await ghRequest('GET', `/repos/${owner}/${repo}/pulls/${num}/files?per_page=100`, null, token);
  const files = filesRes.data || [];

  if (action === 'review') {
    console.log('\x1b[33mInteractive review mode:\x1b[0m');
    console.log('  Files changed:');
    files.slice(0, 10).forEach(f => console.log(`    ${f.filename} (+${f.additions}/-${f.deletions})`));
    if (files.length > 10) console.log(`    ... and ${files.length - 10} more`);

    // Auto-comment on files with many changes
    const comments = [];
    for (const f of files) {
      if (f.additions > 50) {
        comments.push({
          path: f.filename,
          line: 1,
          side: 'RIGHT',
          body: `This file added \`+${f.additions}\` lines. Consider splitting it into smaller units.`,
        });
      }
      if (f.deletions > 50) {
        comments.push({
          path: f.filename,
          line: 1,
          side: 'LEFT',
          body: `This file removed \`${f.deletions}\` lines. Ensure no tests depend on the removed logic.`,
        });
      }
    }

    if (comments.length > 0) {
      console.log(`\n\x1b[36mPosting ${comments.length} inline comment(s)...\x1b[0m`);
      await ghRequest('POST', `/repos/${owner}/${repo}/pulls/${num}/comments`, { body: 'Automated code review:', comments }, token);
      console.log('\x1b[32mComments posted.\x1b[0m\n');
    } else {
      console.log('\n\x1b[90mNo automated comments (files look clean).\x1b[0m\n');
    }
  }

  if (action === 'approve') {
    const r = await ghRequest('POST', `/repos/${owner}/${repo}/pulls/${num}/reviews`, { event: 'APPROVE' }, token);
    if (r.status === 200) console.log('\x1b[32mPR approved.\x1b[0m\n');
    else console.error(`\x1b[31mApprove failed (${r.status})\x1b[0m\n`);
  }

  if (action === 'merge') {
    const method = args.includes('--squash') ? 'squash' : args.includes('--rebase') ? 'rebase' : 'merge';
    const r = await ghRequest('PUT', `/repos/${owner}/${repo}/pulls/${num}/merge`, { merge_method: method }, token);
    if (r.status === 200) console.log(`\x1b[32mPR merged via ${method}.\x1b[0m\n`);
    else if (r.status === 405) console.log('\x1b[33mPR not mergeable (check branch protection).\x1b[0m\n');
    else console.error(`\x1b[31mMerge failed (${r.status})\x1b[0m\n`);
  }
}

module.exports = { run };
