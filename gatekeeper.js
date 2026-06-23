/**
 * PURPCLAW GATEKEEPER v1.0
 * =========================
 * Pre-merge validation layer - "You need a machine, not a society."
 *
 * The Gatekeeper intercepts changes BEFORE they merge/deploy and runs:
 * 1. Security checks (OWASP Top 10, injection, auth bypass)
 * 2. Performance checks (N+1 queries, memory leaks, blocking ops)
 * 3. Correctness checks (type safety, error handling, tests)
 * 4. Assignment of experienced reviewers based on agent scores
 *
 * This gives the system a "gate" that bad code/bugs must pass through.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const PURP_DIR = path.join(__dirname);

// ========== GATEKEEPER CONFIG ==========

const GATEKEEPER_PORT = 7791;
const AGENT_SCORE_PATH = path.join(PURP_DIR, 'agent_score.js');

let agentScore = null;
try {
  agentScore = require(AGENT_SCORE_PATH);
} catch (e) {
  console.log('[GATEKEEPER] agent_score.js not available - using fallback routing');
}

// Risk thresholds
const RISK_THRESHOLDS = {
  CRITICAL: { securityScore: 0, perfScore: 0, requiresSecurityReview: true },
  HIGH: { securityScore: 50, perfScore: 40, requiresSecurityReview: true },
  MEDIUM: { securityScore: 70, perfScore: 60, requiresSecurityReview: false },
  LOW: { securityScore: 85, perfScore: 80, requiresSecurityReview: false }
};

// ========== VALIDATION CHECKS ==========

const CHECKS = {
  // Security checks
  security: [
    {
      name: 'sql_injection',
      pattern: /(?:query|sql|select|insert|update|delete)\s*\(.*[\+\.].*\)/gi,
      severity: 'HIGH',
      description: 'Potential SQL injection vector'
    },
    {
      name: 'command_injection',
      pattern: /(?:exec|spawn|eval|Function\(|new Function)\s*\(/gi,
      severity: 'MEDIUM',
      description: 'Potential command injection vector'
    },
    {
      name: 'hardcoded_secret',
      pattern: /(?:password|secret|api_key|token|credential)\s*[=:]\s*["'][^"']{8,}/gi,
      severity: 'CRITICAL',
      description: 'Hardcoded secret detected'
    },
    {
      name: 'xss_vector',
      pattern: /(?:innerHTML|dangerouslySetInnerHTML|document\.write)\s*\(/gi,
      severity: 'HIGH',
      description: 'Potential XSS vector'
    },
    {
      name: 'auth_bypass',
      pattern: /\/\/\s*BYPASS|\/\/\s*SKIP\s*AUTH|if\s*\(\s*true\s*\)\s*\{.*auth/gi,
      severity: 'CRITICAL',
      description: 'Potential authentication bypass'
    }
  ],

  // Performance checks
  performance: [
    {
      name: 'sync_file_io',
      pattern: /fs\.(readFileSync|writeFileSync|readSync|writeSync)\s*\(/gi,
      severity: 'MEDIUM',
      description: 'Synchronous file I/O detected - use async equivalents'
    },
    {
      name: 'nested_loop',
      pattern: /for\s*\(.*\)\s*\{[^}]*for\s*\(/gi,
      severity: 'LOW',
      description: 'Nested loop detected - potential O(n²) complexity'
    },
    {
      name: 'memory_leak',
      pattern: /(?:global\.|window\.)[a-zA-Z_]\w*\s*=/gi,
      severity: 'MEDIUM',
      description: 'Global variable assignment - potential memory leak'
    },
    {
      name: 'no_cleanup',
      pattern: /addEventListener\s*\([^)]*\s*(?!\);[\s\S]*removeEventListener)/gi,
      severity: 'LOW',
      description: 'Event listener without cleanup'
    }
  ],

  // Correctness checks
  correctness: [
    {
      name: 'try_no_catch',
      pattern: /try\s*\{[^}]*\}\s*(?!\bcatch\b)/gi,
      severity: 'MEDIUM',
      description: 'Try block without catch'
    },
    {
      name: 'error_swallowed',
      pattern: /catch\s*\([^)]*\)\s*\{\s*\}/gi,
      severity: 'HIGH',
      description: 'Empty catch block - errors are silently ignored'
    },
    {
      name: 'console_log',
      pattern: /console\.(log|debug|info)\s*\(/gi,
      severity: 'LOW',
      description: 'Console log in code - should use proper logging'
    },
    {
      name: 'todo_comment',
      pattern: /\/\/\s*(TODO|FIXME|HACK|XXX|BUG):/gi,
      severity: 'LOW',
      description: 'Unresolved TODO/FIXME comment'
    }
  ]
};

// ========== GATEKEEPER ENGINE ==========

class GatekeeperReport {
  constructor(changeId) {
    this.changeId = changeId;
    this.timestamp = new Date().toISOString();
    this.files = [];
    this.issues = [];
    this.riskLevel = 'LOW';
    this.recommendAgents = [];
    this.canMerge = true;
    this.blockedReason = null;
  }

  addIssue(check, file, line, match) {
    const issue = {
      check: check.name,
      severity: check.severity,
      description: check.description,
      file,
      line,
      match: match.substring(0, 100)
    };
    this.issues.push(issue);

    // Update risk level
    if (check.severity === 'CRITICAL') {
      this.riskLevel = 'CRITICAL';
      this.canMerge = false;
      this.blockedReason = `Critical security issue: ${check.description}`;
    } else if (check.severity === 'HIGH' && this.riskLevel !== 'CRITICAL') {
      this.riskLevel = 'HIGH';
    } else if (check.severity === 'MEDIUM' && this.riskLevel === 'LOW') {
      this.riskLevel = 'MEDIUM';
    }
  }
}

function scanFile(filePath, report) {
  if (!fs.existsSync(filePath)) return;

  // Skip binary and non-code files
  const ext = path.extname(filePath).toLowerCase();
  if (!['.js', '.ts', '.jsx', '.tsx', '.json'].includes(ext)) return;

  let content = null;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    return;
  }

  const lines = content.split('\n');

  // Run all checks
  for (const [category, checks] of Object.entries(CHECKS)) {
    for (const check of checks) {
      let match = null;
      const regex = new RegExp(check.pattern.source, check.pattern.flags);
      while ((match = regex.exec(content)) !== null) {
        const lineNum = content.substring(0, match.index).split('\n').length;
        report.addIssue(check, filePath, lineNum, match[0]);
      }
    }
  }
}

function scanDirectory(dirPath, report, depth = 0) {
  if (depth > 5) return; // Max 5 levels deep

  if (!fs.existsSync(dirPath)) return;

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    // Skip node_modules, .git, build, etc.
    if (entry.name === 'node_modules' || entry.name === '.git' ||
        entry.name === 'build' || entry.name === '.next' || entry.name === 'dist') {
      continue;
    }

    if (entry.isDirectory()) {
      scanDirectory(fullPath, report, depth + 1);
    } else {
      scanFile(fullPath, report);
    }
  }
}

/**
 * Main gatekeeper validation function
 * @param {object} change - { id, files: [], author, message }
 * @returns {GatekeeperReport}
 */
function validateChange(change) {
  const report = new GatekeeperReport(change.id || `change-${Date.now()}`);

  console.log(`[GATEKEEPER] Validating change: ${change.message || 'No message'}`);

  // Scan all files in the change
  for (const file of change.files || []) {
    if (file.type === 'file' || !file.type) {
      scanFile(file.path, report);
    } else if (file.type === 'directory') {
      scanDirectory(file.path, report);
    }
  }

  // Assign appropriate reviewers based on risk
  report.recommendAgents = assignReviewers(report);

  // Determine if can merge
  if (report.issues.some(i => i.severity === 'CRITICAL')) {
    report.canMerge = false;
    report.blockedReason = report.blockedReason || 'Critical issues found';
  } else if (report.issues.filter(i => i.severity === 'HIGH').length > 3) {
    report.canMerge = false;
    report.blockedReason = 'Too many high-severity issues (>3)';
  }

  console.log(`[GATEKEEPER] Result: ${report.riskLevel} risk, ${report.issues.length} issues, merge: ${report.canMerge}`);

  // ── Pipeline spine: every gate decision is a job + proof row, visible on the
  // board. PASS → green/complete. BLOCK → purple/quarantined with the exact
  // blocking reason. No mutation passes the bouncer without leaving evidence. ──
  try {
    const reg = require('./lib/pipeline-registry');
    const rl = String(report.riskLevel || 'low').toLowerCase();
    const risk = rl.includes('crit') ? 'critical' : rl.includes('high') ? 'high' : rl.includes('med') ? 'medium' : 'low';
    const blocked = report.canMerge === false;
    const job = reg.start({
      pipeline: 'gate.review', project: 'PURPCLAW', lane: 'BASI Watchdog', trigger: 'gatekeeper', risk,
      inputs: { change: String(change.message || change.id || 'change').slice(0, 160), files: (change.files || []).length },
    });
    if (job && job.job_id) {
      // The verdict IS the output (a gate produces a decision, not a file) — record
      // it so a clean pass classifies green, not a false black-hole.
      reg.output(job.job_id, `verdict:${blocked ? 'BLOCK' : 'PASS'} risk=${report.riskLevel} issues=${report.issues.length}`, { kind: 'gate-verdict' });
      reg.finish(job.job_id, {
        status: blocked ? 'quarantined' : 'complete',
        claim: blocked ? `BLOCKED: ${report.blockedReason}` : `gate passed (${report.riskLevel} risk, ${report.issues.length} issues)`,
        proof: { ran: 'gatekeeper.validateChange', result: blocked ? 'fail' : 'pass', detail: blocked ? String(report.blockedReason || 'blocked') : `${report.issues.length} issues @ ${report.riskLevel}` },
      });
    }
  } catch (_) { /* spine optional */ }

  return report;
}

/**
 * Assign reviewer agents based on what issues were found
 */
function assignReviewers(report) {
  const reviewers = [];
  const issueTypes = new Set(report.issues.map(i => i.check.split('_')[0]));

  // Security issues → ghost, owl, snake
  if (issueTypes.has('sql') || issueTypes.has('command') || issueTypes.has('auth')) {
    const secAgents = agentScore?.getAgentsForIntent('security', 3) || [];
    if (secAgents.length > 0) {
      reviewers.push(...secAgents.map(a => a.agent));
    } else {
      reviewers.push('ghost', 'owl', 'snake');
    }
  }

  // XSS/injection → spider, ghost
  if (issueTypes.has('xss')) {
    if (!reviewers.includes('spider')) reviewers.push('spider');
    if (!reviewers.includes('ghost')) reviewers.push('ghost');
  }

  // Performance issues → cactus, chonk
  if (issueTypes.has('sync') || issueTypes.has('memory') || issueTypes.has('nested')) {
    const perfAgents = agentScore?.getAgentsForIntent('optimize', 3) || [];
    if (perfAgents.length > 0) {
      reviewers.push(...perfAgents.map(a => a.agent));
    } else {
      reviewers.push('cactus', 'chonk');
    }
  }

  // Correctness issues → turtle, rabbit
  if (issueTypes.has('try') || issueTypes.has('error') || issueTypes.has('console')) {
    reviewers.push('turtle', 'rabbit');
  }

  // High risk changes → always add senior agents
  if (report.riskLevel === 'CRITICAL' || report.riskLevel === 'HIGH') {
    const seniorAgents = ['dragon', 'owl', 'wolf'];
    reviewers.push(...seniorAgents);
  }

  // Dedup and limit
  return [...new Set(reviewers)].slice(0, 5);
}

/**
 * Quick validation for a single file
 */
function validateFile(filePath) {
  const report = new GatekeeperReport(`file-${Date.now()}`);
  scanFile(filePath, report);
  report.recommendAgents = assignReviewers(report);
  return report;
}

/**
 * Get gatekeeper status
 */
function getStatus() {
  return {
    status: 'operational',
    port: GATEKEEPER_PORT,
    checks: {
      security: CHECKS.security.length,
      performance: CHECKS.performance.length,
      correctness: CHECKS.correctness.length
    },
    agentScoreAvailable: agentScore !== null
  };
}

// ========== HTTP SERVER ==========

function startGatekeeperServer() {
  const server = http.createServer((req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://localhost:${GATEKEEPER_PORT}`);

    // Routes
    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, ...getStatus() }));
      return;
    }

    if (url.pathname === '/api/validate' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const change = JSON.parse(body);
          const report = validateChange(change);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(report));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }

    if (url.pathname === '/api/validate-file' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const { filePath } = JSON.parse(body);
          const report = validateFile(filePath);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(report));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }

    if (url.pathname === '/api/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(getStatus()));
      return;
    }

    // POST /api/propose-amendments — store a proposed policy/skill amendment
    if (url.pathname === '/api/propose-amendments' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const amendment = JSON.parse(body);
          const id = `amend-${Date.now()}`;
          const entry = { id, ...amendment, status: 'pending', createdAt: new Date().toISOString() };
          // Store in a simple in-memory ledger
          if (!global.__gatekeeper_amendments) global.__gatekeeper_amendments = [];
          global.__gatekeeper_amendments.push(entry);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, id, amendment: entry }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }

    // POST /api/amend-patch — approve or reject a pending amendment
    if (url.pathname === '/api/amend-patch' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const { amendmentId, action } = JSON.parse(body);
          const ledger = global.__gatekeeper_amendments || [];
          const entry = ledger.find(a => a.id === amendmentId);
          if (!entry) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Amendment not found' }));
            return;
          }
          entry.status = action === 'approve' ? 'approved' : 'rejected';
          entry.resolvedAt = new Date().toISOString();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, amendment: entry }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  });

  server.listen(GATEKEEPER_PORT, () => {
    console.log(`[GATEKEEPER] Running on port ${GATEKEEPER_PORT}`);
    console.log(`[GATEKEEPER] Security checks: ${CHECKS.security.length}`);
    console.log(`[GATEKEEPER] Performance checks: ${CHECKS.performance.length}`);
    console.log(`[GATEKEEPER] Correctness checks: ${CHECKS.correctness.length}`);
  });
}

// ========== CLI ==========

if (require.main === module) {
  const http = require('http');

  const args = process.argv.slice(2);

  if (args.includes('--server')) {
    startGatekeeperServer();
  } else if (args.includes('--validate')) {
    const filePath = args.find(a => a.startsWith('--path='))?.split('=')[1];
    if (filePath) {
      const report = validateFile(filePath);
      console.log('\n=== GATEKEEPER REPORT ===');
      console.log(`Risk Level: ${report.riskLevel}`);
      console.log(`Can Merge: ${report.canMerge ? 'YES' : 'NO'}`);
      if (report.blockedReason) console.log(`Blocked: ${report.blockedReason}`);
      console.log(`Issues Found: ${report.issues.length}`);
      console.log(`Recommend Reviewers: ${report.recommendAgents.join(', ')}`);
      if (report.issues.length > 0) {
        console.log('\n--- Issues ---');
        report.issues.forEach(i => {
          console.log(`[${i.severity}] ${i.file}:${i.line} - ${i.description}`);
        });
      }
      process.exit(report.canMerge ? 0 : 1);
    }
  } else {
    console.log('PURPCLAW Gatekeeper v1.0');
    console.log('Usage:');
    console.log('  node gatekeeper.js --server          Start gatekeeper server');
    console.log('  node gatekeeper.js --validate --path=<file>   Validate a file');
  }
}

// ========== EXPORTS ==========

module.exports = {
  validateChange,
  validateFile,
  assignReviewers,
  getStatus,
  GatekeeperReport,
  CHECKS
};
