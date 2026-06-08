#!/usr/bin/env node
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const API_URL = (process.env.PURPCLAW_API_URL || 'http://127.0.0.1:7780').replace(/\/+$/, '');
const UI_URL = (process.env.PURPCLAW_UI_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '');
const TIMEOUT = Number(process.env.VERIFY_TIMEOUT_MS || 20000);

const args = process.argv.slice(2);
const asJson = args.includes('--json');
let repoPath = process.env.VERIFY_REPO_PATH || process.cwd();
const repoIndex = args.indexOf('--repo');
if (repoIndex !== -1 && args[repoIndex + 1]) repoPath = args[repoIndex + 1];
const cleanupJobIds = new Set();

function request(method, rawUrl, body) {
  return new Promise((resolve) => {
    let target = null;
    try {
      target = new URL(rawUrl);
    } catch {
      resolve({ ok: false, offline: true, error: `bad URL ${rawUrl}` });
      return;
    }

    const payload = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = http.request({
      hostname: target.hostname,
      port: target.port || 80,
      path: target.pathname + target.search,
      method,
      timeout: TIMEOUT,
      headers: payload ? {
        'Content-Type': 'application/json',
        'Content-Length': payload.length,
      } : {},
    }, (res) => {
      let text = '';
      res.on('data', chunk => { text += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(text); } catch {}
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          body: text.slice(0, 500),
          json,
        });
      });
    });

    req.on('error', error => resolve({ ok: false, offline: error.code === 'ECONNREFUSED', error: error.message }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, offline: true, error: `timeout after ${TIMEOUT}ms` });
    });
    if (payload) req.write(payload);
    req.end();
  });
}

function detailForOffline(service, url) {
  return `OFFLINE - ${service} unreachable at ${url}`;
}

function cleanupVerificationArtifacts() {
  if (!cleanupJobIds.size) return;

  const approvalPath = path.join(repoPath, 'agent_work', 'approval_requests.jsonl');
  try {
    const kept = fs.readFileSync(approvalPath, 'utf8')
      .split('\n')
      .filter(Boolean)
      .filter((line) => {
        try {
          const row = JSON.parse(line);
          return !cleanupJobIds.has(row.workflowId);
        } catch {
          return true;
        }
      });
    fs.writeFileSync(approvalPath, kept.length ? `${kept.join('\n')}\n` : '', 'utf8');
  } catch {}

  for (const id of cleanupJobIds) {
    try {
      fs.unlinkSync(path.join(repoPath, 'agent_work', 'api_harness', `${id}.json`));
    } catch {}
  }
}

async function run() {
  const checks = [];

  {
    const response = await request('GET', `${API_URL}/api/omnicode/status`);
    checks.push({
      name: 'GET /api/omnicode/status',
      pass: response.ok && Boolean(response.json?.contractVersion),
      detail: response.offline
        ? detailForOffline('Unified API', API_URL)
        : response.ok
          ? `HTTP ${response.status}, ${response.json?.contractVersion || 'missing contract'}`
          : `HTTP ${response.status || '?'}: ${response.error || response.body}`,
    });
  }

  {
    const response = await request('POST', `${API_URL}/api/omnicode/repo-intake`, { repoPath });
    checks.push({
      name: 'POST /api/omnicode/repo-intake',
      pass: response.ok && response.json?.repoPath === repoPath,
      detail: response.offline
        ? detailForOffline('Unified API', API_URL)
        : response.ok
          ? `HTTP ${response.status}, accepted repoPath`
          : `HTTP ${response.status || '?'}: ${response.error || response.body}`,
    });
  }

  {
    const response = await request('POST', `${API_URL}/api/kernel/jobs`, {
      repoPath,
      task: 'omnicode proof-gate verification',
      route: 'swarm-coordinator',
      source: 'verify-api-spine',
    });
    const job = response.json?.job || {};
    if (job.state === 'waiting_approval' && job.id) cleanupJobIds.add(job.id);
    checks.push({
      name: 'POST /api/kernel/jobs (+omnicodeIntake)',
      pass: response.ok && Boolean(job.id) && Boolean(job.omnicodeIntake),
      detail: response.offline
        ? detailForOffline('Unified API', API_URL)
        : response.ok
          ? `HTTP ${response.status}, jobId=${job.id || 'missing'}, omnicodeIntake=${job.omnicodeIntake ? 'present' : 'missing'}`
          : `HTTP ${response.status || '?'}: ${response.error || response.body}`,
    });
  }

  {
    const response = await request('POST', `${API_URL}/api/kernel/jobs`, {
      repoPath,
      task: 'delete dead files from repo',
      route: 'swarm-coordinator',
      source: 'verify-api-spine',
    });
    const job = response.json?.job || {};
    if (job.state === 'waiting_approval' && job.id) cleanupJobIds.add(job.id);
    checks.push({
      name: 'POST /api/kernel/jobs destructive repo task -> governance hold',
      pass: response.ok && ['blocked', 'waiting_approval'].includes(job.state) && !job.linkedMissionId,
      detail: response.offline
        ? detailForOffline('Unified API', API_URL)
        : response.ok
          ? `HTTP ${response.status}, state=${job.state || 'missing'}, linkedMissionId=${job.linkedMissionId || 'none'}`
          : `HTTP ${response.status || '?'}: ${response.error || response.body}`,
    });
  }

  {
    const response = await request('GET', `${API_URL}/api/llm/status`);
    checks.push({
      name: 'GET /api/llm/status -> api-first local fallback',
      pass: response.ok &&
        response.json?.apiFirst === true &&
        response.json?.fallback?.provider === 'ollama' &&
        response.json?.local?.online === true &&
        response.json?.local?.modelAvailable === true,
      detail: response.offline
        ? detailForOffline('Unified API', API_URL)
        : response.ok
          ? `primary=${response.json?.provider?.provider || 'missing'} fallback=${response.json?.fallback?.provider || 'missing'}:${response.json?.fallback?.model || 'missing'} localOnline=${Boolean(response.json?.local?.online)} modelAvailable=${Boolean(response.json?.local?.modelAvailable)}`
          : `HTTP ${response.status || '?'}: ${response.error || response.body}`,
    });
  }

  {
    const response = await request('POST', `${API_URL}/api/research/group`, {
      query: 'PURPCLAW research-room proof gate',
      kernelJob: true,
      depth: 1,
      model_count: 2,
      source: 'verify-api-spine',
    });
    const job = response.json?.job || {};
    if (job.state === 'waiting_approval' && job.id) cleanupJobIds.add(job.id);
    checks.push({
      name: 'POST /api/research/group kernelJob -> governed deep research',
      pass: response.ok && Boolean(job.id) && (
        job.route === 'deep-research-group' ||
        (job.route === 'governance-hold' && job.state === 'waiting_approval')
      ),
      detail: response.offline
        ? detailForOffline('Unified API', API_URL)
        : response.ok
          ? `HTTP ${response.status}, jobId=${job.id || 'missing'}, route=${job.route || 'missing'}, state=${job.state || 'missing'}`
          : `HTTP ${response.status || '?'}: ${response.error || response.body}`,
    });
  }

  const missionDataResponse = await request('GET', `${UI_URL}/api/mission-data`);

  {
    const response = missionDataResponse;
    checks.push({
      name: 'GET /api/mission-data -> omnicodeStatus',
      pass: response.ok && Object.prototype.hasOwnProperty.call(response.json || {}, 'omnicodeStatus'),
      detail: response.offline
        ? detailForOffline('Mission Control', UI_URL)
        : response.ok
          ? `omnicodeStatus=${response.json?.omnicodeStatus ? 'present' : 'null'}`
          : `HTTP ${response.status || '?'}: ${response.error || response.body}`,
    });
  }

  {
    const response = missionDataResponse;
    checks.push({
      name: 'GET /api/mission-data -> llmStatus',
      pass: response.ok &&
        response.json?.llmStatus?.fallback?.provider === 'ollama' &&
        response.json?.llmStatus?.local?.online === true,
      detail: response.offline
        ? detailForOffline('Mission Control', UI_URL)
        : response.ok
          ? `llmStatus=${response.json?.llmStatus ? 'present' : 'missing'}, fallback=${response.json?.llmStatus?.fallback?.provider || 'missing'}`
          : `HTTP ${response.status || '?'}: ${response.error || response.body}`,
    });
  }

  const allPass = checks.every(check => check.pass);
  const result = { allPass, api: API_URL, ui: UI_URL, repoPath, checks };
  cleanupVerificationArtifacts();

  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`\nPURPCLAW API SPINE VERIFY (api=${API_URL} ui=${UI_URL})\n`);
    for (const check of checks) {
      console.log(`${check.pass ? 'PASS' : 'FAIL'} ${check.name}`);
      console.log(`  ${check.detail}`);
    }
    console.log(`\nRESULT: ${allPass ? 'ALL PASS' : 'FAILED'}\n`);
  }

  process.exit(allPass ? 0 : 1);
}

run().catch(error => {
  console.error(`verify-api-spine crashed: ${error.message}`);
  process.exit(1);
});
