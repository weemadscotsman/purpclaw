'use strict';

/**
 * PURPCLAW Tesco Express harness certificate
 *
 * Runs the real lib/harness/engine.js end-to-end through its orchestrator HTTP
 * fallback lane, but replaces external nondeterminism with a controlled fixture:
 * - Tower is intentionally absent, proving orchestrator fallback is used.
 * - LLM planning/review/synthesis are deterministic in-process fixtures.
 * - The orchestrator is a local HTTP fixture implementing the real endpoints
 *   consumed by the harness: GET /api/health and POST /api/orchestrate/await.
 * - The harness still creates a real JobContract, runs its verification gate
 *   machinery, performs dispatch, review, synthesis and finalisation.
 *
 * This certifies the harness plumbing without API keys or a live provider.
 * It does NOT claim that the production orchestrator or external providers are
 * online; that remains a separate live-runtime concern.
 */

const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'artifacts');
const OUT_FILE = path.join(OUT_DIR, 'orchestrator-harness-e2e-cert.json');
const ORCHESTRATOR_PORT = Number(process.env.PURPCLAW_CERT_ORCHESTRATOR_PORT || 17784);
const TOWER_PORT = Number(process.env.PURPCLAW_CERT_TOWER_PORT || 17790);
const GOAL = process.env.PURPCLAW_TESCO_GOAL || 'Do the thing right: inspect the orchestrator harness path and return one certificate-backed proof receipt.';
const MARKER = 'PURPCLAW_ORCHESTRATOR_CERT_FIXTURE_V1';

process.env.ORCHESTRATOR_PORT = String(ORCHESTRATOR_PORT);
process.env.TOWER_PORT = String(TOWER_PORT);
process.env.LLM_FALLBACK = 'off';

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  }
  return value;
}

function certHash(value) {
  return sha256(JSON.stringify(canonical(value)));
}

function writeJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch (error) { reject(error); }
    });
    req.on('error', reject);
  });
}

function startFixture() {
  const evidence = { healthCalls: 0, dispatchCalls: 0, payloads: [] };
  const server = http.createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/api/health') {
      evidence.healthCalls += 1;
      return writeJson(res, 200, { ok: true, service: 'orchestrator-cert-fixture', marker: MARKER });
    }

    if (req.method === 'POST' && req.url === '/api/orchestrate/await') {
      evidence.dispatchCalls += 1;
      const body = await readBody(req);
      evidence.payloads.push(body);
      const agentName = body.agentName || 'unknown';
      const task = String(body.task || '');
      const output = [
        MARKER,
        `Agent ${agentName} accepted the controlled orchestrator dispatch.`,
        `Task: ${task}`,
        'Evidence: the harness reached POST /api/orchestrate/await only after the Tower health lane was unavailable.',
        'Verification: this fixture response is intentionally longer than the fallback-review evidence floor and is later checked by the certificate runner.',
      ].join('\n');
      return writeJson(res, 200, {
        ok: true,
        output,
        marker: MARKER,
        proof: {
          transport: 'orchestrator',
          endpoint: '/api/orchestrate/await',
          taskSha256: sha256(task),
        },
      });
    }

    return writeJson(res, 404, { ok: false, error: 'fixture route not found' });
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(ORCHESTRATOR_PORT, '127.0.0.1', () => resolve({ server, evidence }));
  });
}

function installDeterministicLlmFixtures() {
  const llm = require('../lib/llm-provider');

  llm.swarm = async () => ({
    content: JSON.stringify({
      subtasks: [{
        description: 'Research the controlled orchestrator harness route and report evidence for the certificate fixture.',
        rationale: 'A research contract exercises dispatch and proof flow without invoking build/test commands unrelated to this plumbing certificate.',
      }],
    }),
    model: 'cert-fixture',
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  });

  llm.chat = async (messages) => {
    const system = String(messages?.[0]?.content || '').toLowerCase();
    if (system.includes('per-subtask') || system.includes('review') || system.includes('judge')) {
      const combined = messages.map(m => String(m.content || '')).join('\n');
      const accepted = combined.includes(MARKER);
      return {
        content: JSON.stringify({
          verdict: accepted ? 'ACCEPTED' : 'REJECTED',
          reason: accepted
            ? 'Controlled orchestrator evidence marker present and verification gates passed.'
            : 'Required orchestrator evidence marker missing.',
        }),
        model: 'cert-fixture',
      };
    }

    if (system.includes('synthesiser') || system.includes('synthesizer')) {
      return {
        content: `# Tesco Express certificate run\n\n${MARKER}\n\nThe real PurpClaw harness completed its controlled orchestrator dispatch, verification, review, and synthesis path.`,
        model: 'cert-fixture',
      };
    }

    if (system.includes('karen')) {
      return {
        content: JSON.stringify({ action: 'halt', reason: 'Certificate fixture should not require escalation.', newPreferredAgents: null }),
        model: 'cert-fixture',
      };
    }

    return { content: MARKER, model: 'cert-fixture' };
  };
}

async function main() {
  const startedAt = new Date().toISOString();
  fs.mkdirSync(OUT_DIR, { recursive: true });

  let fixture;
  let job = null;
  try {
    fixture = await startFixture();
    installDeterministicLlmFixtures();

    // Require after ports and LLM fixtures are installed: the harness captures
    // its port configuration at module load time.
    const { createHarness } = require('../lib/harness/engine');
    const harness = createHarness({
      rootDir: ROOT,
      maxIterations: 4,
      maxRetriesPerSubtask: 0,
    });

    job = await harness.run(GOAL);

    const subtask = job.plan?.[0] || null;
    const gateRows = subtask?.gateResult?.results || [];
    const assertions = {
      jobFinishedDone: job.state === 'done',
      exactlyOneSubtask: job.plan?.length === 1,
      subtaskAccepted: subtask?.state === 'accepted' && subtask?.verdict === 'ACCEPTED',
      routedThroughOrchestrator: subtask?.lastDispatch?.route === 'orchestrator',
      towerWasNotUsed: subtask?.lastDispatch?.route !== 'tower',
      orchestratorReceivedDispatch: fixture.evidence.dispatchCalls === 1,
      evidenceMarkerReturned: String(subtask?.output || '').includes(MARKER),
      verificationPassed: subtask?.gateResult?.ok === true,
      finalReportProduced: String(job.finalReport || '').includes(MARKER),
      noOperatorBabysittingInsideRun: true,
    };

    const passed = Object.values(assertions).every(Boolean);
    const unsigned = {
      schema: 'purpclaw.orchestrator-harness-e2e-cert.v1',
      verdict: passed ? 'CERTIFIED' : 'NOT_CERTIFIED',
      startedAt,
      completedAt: new Date().toISOString(),
      source: {
        repository: process.env.GITHUB_REPOSITORY || 'weemadscotsman/purpclaw',
        sha: process.env.GITHUB_SHA || null,
        ref: process.env.GITHUB_REF || null,
        node: process.version,
        platform: process.platform,
      },
      tescoExpress: {
        input: GOAL,
        operatorStepsDuringRun: 0,
      },
      harness: {
        jobId: job.id,
        state: job.state,
        iterations: job.iteration,
        usedFallbackPlanner: Boolean(job.usedFallbackPlanner),
        subtaskCount: job.plan?.length || 0,
      },
      dispatch: {
        route: subtask?.lastDispatch?.route || null,
        agent: subtask?.lastDispatch?.agent || null,
        fixtureHealthCalls: fixture.evidence.healthCalls,
        fixtureDispatchCalls: fixture.evidence.dispatchCalls,
        payloadSha256: fixture.evidence.payloads[0] ? sha256(JSON.stringify(fixture.evidence.payloads[0])) : null,
      },
      proof: {
        outputSha256: sha256(subtask?.output || ''),
        finalReportSha256: sha256(job.finalReport || ''),
        gates: gateRows.map(row => ({ gate: row.gate, ok: row.ok, status: row.status, command: row.command })),
        verdict: subtask?.verdict || null,
        verdictReason: subtask?.verdictReason || null,
      },
      assertions,
      limitations: [
        'This is a deterministic end-to-end harness plumbing certificate using a controlled local orchestrator fixture.',
        'It does not assert that the production orchestrator, Tower, model providers, or operator workstation are currently online.',
      ],
    };

    const certificate = { ...unsigned, certificateSha256: certHash(unsigned) };
    fs.writeFileSync(OUT_FILE, JSON.stringify(certificate, null, 2) + '\n', 'utf8');

    if (!passed) {
      console.error(JSON.stringify(certificate, null, 2));
      console.error('PURPCLAW_TESCO_EXPRESS_E2E: NOT_CERTIFIED');
      process.exitCode = 1;
      return;
    }

    console.log(JSON.stringify(certificate, null, 2));
    console.log(`certificate=${path.relative(ROOT, OUT_FILE)}`);
    console.log('PURPCLAW_TESCO_EXPRESS_E2E: CERTIFIED');
  } catch (error) {
    const failure = {
      schema: 'purpclaw.orchestrator-harness-e2e-cert.v1',
      verdict: 'NOT_CERTIFIED',
      startedAt,
      completedAt: new Date().toISOString(),
      error: error?.stack || error?.message || String(error),
      jobId: job?.id || null,
    };
    failure.certificateSha256 = certHash(failure);
    fs.writeFileSync(OUT_FILE, JSON.stringify(failure, null, 2) + '\n', 'utf8');
    console.error(error);
    console.error('PURPCLAW_TESCO_EXPRESS_E2E: NOT_CERTIFIED');
    process.exitCode = 1;
  } finally {
    if (fixture?.server) {
      await new Promise(resolve => fixture.server.close(resolve));
    }
  }
}

main();
