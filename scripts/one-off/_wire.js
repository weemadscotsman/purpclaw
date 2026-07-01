const fs = require('fs');
let s = fs.readFileSync('orchestrator.js', 'utf8');
const startMarker = '// ========== HTTP CLIENT HELPERS ==========';
const startIdx = s.indexOf(startMarker);
if (startIdx === -1) { console.log('start not found'); process.exit(1); }
const endMarker = '// ========== COMMAND PARSING ==========';
const endIdx = s.indexOf(endMarker, startIdx);
if (endIdx === -1) { console.log('end not found'); process.exit(1); }
const newHelpers = `// ========== HTTP CLIENT HELPERS (v2.1 hardening) ==========
// All three inter-service calls are guarded by:
//   1. Circuit breaker — fail fast when a service is down (3 fails in a row opens it).
//   2. Retry with exponential backoff — 3 attempts, jittered 200-2000ms.
//   3. Timeout — 10s per attempt, 64KB body cap.

function apiRequest(method, path, body) {
  return H.withRetry(
    () => {
      if (H.breakers.api.isOpen()) return Promise.reject(new Error('api circuit breaker is open'));
      return H.httpJson({ method, hostname: 'localhost', port: API_PORT, path, body })
        .then(r => { H.breakers.api.recordSuccess(); return r; })
        .catch(e => { H.breakers.api.recordFailure(); throw e; });
    },
    { attempts: 3, baseMs: 200, label: 'api ' + method + ' ' + path }
  );
}

function towerRequest(method, path, body) {
  return H.withRetry(
    () => {
      if (H.breakers.tower.isOpen()) return Promise.reject(new Error('tower circuit breaker is open'));
      return H.httpJson({ method, hostname: 'localhost', port: TOWER_PORT, path, body })
        .then(r => { H.breakers.tower.recordSuccess(); return r; })
        .catch(e => { H.breakers.tower.recordFailure(); throw e; });
    },
    { attempts: 3, baseMs: 200, label: 'tower ' + method + ' ' + path }
  );
}

function stateRequest(method, path, body) {
  return H.withRetry(
    () => {
      if (H.breakers.state.isOpen()) return Promise.reject(new Error('state circuit breaker is open'));
      return H.httpJson({ method, hostname: 'localhost', port: STATE_PORT, path, body })
        .then(r => { H.breakers.state.recordSuccess(); return r; })
        .catch(e => { H.breakers.state.recordFailure(); throw e; });
    },
    { attempts: 3, baseMs: 200, label: 'state ' + method + ' ' + path }
  );
}

`;
s = s.substring(0, startIdx) + newHelpers + s.substring(endIdx);
fs.writeFileSync('orchestrator.js', s);
console.log('helpers replaced');
