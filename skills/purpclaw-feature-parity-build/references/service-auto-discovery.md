# Service Auto-Discovery Probe

When a system has 30+ services on different ports (PURPCLAW, a microservice
mesh, any multi-runtime stack), you need a way to know **what's actually
online** vs what the config claims. The pattern: scan a port range, hit
each with a real HTTP probe, cross-reference against three sources of
truth.

## The probe (Node.js)

```js
const http = require('http');

function probe(port, paths = ['/health', '/api/health', '/api/status', '/tower/status', '/']) {
  return new Promise(resolve => {
    let i = 0;
    const tryPath = () => {
      if (i >= paths.length) return resolve({ port, ok: false });
      const req = http.request({ hostname: '127.0.0.1', port, path: paths[i], timeout: 800 }, res => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => {
          if (res.statusCode === 200) {
            let statusField = 'online';
            try {
              const j = JSON.parse(body);
              if (j.status) statusField = j.status;
              else if (j.ok === false) statusField = 'degraded';
            } catch {}
            return resolve({ port, ok: true, status: statusField, body, path: paths[i] });
          }
          i++;
          tryPath();
        });
      });
      req.on('error', () => { i++; tryPath(); });
      req.on('timeout', () => { req.destroy(); i++; tryPath(); });
      req.end();
    };
    tryPath();
  });
}

async function scanRange(start, end, concurrency = 32) {
  const ports = [];
  for (let p = start; p <= end; p++) ports.push(p);
  const results = [];
  for (let i = 0; i < ports.length; i += concurrency) {
    const slice = ports.slice(i, i + concurrency);
    const r = await Promise.all(slice.map(p => probe(p)));
    for (const x of r) if (x.ok) results.push(x);
  }
  return results.sort((a, b) => a.port - b.port);
}
```

**Why multiple paths:** different services expose health at different
URLs. `unified_api` uses `/api/health`, `agent_tower` uses `/tower/status`,
most Node/Python services use `/health`, some use `/` returning a
status object. Try them all in order until one returns 200.

**Concurrency cap** (32 in parallel): 130 ports at 800ms each is bounded.
No need for queueing overhead.

## The cross-reference (three sources of truth)

```js
const portMap = new Map();

// 1. ecosystem.config.js — extract --port N from each app's args
for (const a of loadEcosystem().apps) {
  const argPort = (a.args || '').match(/--port\s+(\d+)/);
  const port = argPort ? parseInt(argPort[1], 10) : null;
  if (port) portMap.set(port, { name: a.name, source: 'ecosystem', pm2: a.name });
}

// 2. service_registry.js — SERVICES[].port
for (const s of loadServiceRegistry().SERVICES || []) {
  if (s.port) {
    const pm2Name = s.pm2 || (s.key ? 'purpclaw-' + s.key : null);
    portMap.set(s.port, { name: s.name, key: s.key, source: 'registry', pm2: pm2Name });
  }
}

// 3. pm2 jlist — what's actually running
const pm2 = pm2Names();  // Set<string> of pm2 process names
```

## The output table

```
PORT     STATUS     NAME                              PM2        SOURCE
─────────────────────────────────────────────────────────────────────────
   7780  ●  healthy            Unified API                       online    registry
   7790  ●  online             Agent Tower                       online    registry
   7786  ●  healthy            Autonomous Diagnostics            online    registry
   7890  ◐  unhealthy          Metrics Aggregator                online    registry
   7799  –  DOWN               Thringlet Bridge                  offline   ecosystem
   7795  ●  ok                 unknown                           offline   orphan
```

**The five status colors:**
- `● healthy` (green) — responded 200 with `status: healthy`
- `● online` (green) — responded 200 without explicit status field
- `◐ degraded` (yellow) — responded 200 with `ok: false` or `unhealthy`
- `○ ok` (yellow) — responded 200 but body was empty/non-JSON
- `– DOWN` (red) — no response on any probed path

**The cross-reference at the bottom:**
- `⚠ ecosystem services DOWN (non-optional)` — should be brought up
- `ℹ ports responding but not in ecosystem` — orphan processes

## Cross-platform quirk (Windows + Node)

```js
function pm2Names() {
  try {
    // BAD: ENOENT on Windows
    // const r = spawnSync('pm2', ['jlist'], { encoding: 'utf-8', timeout: 5000 });
    // GOOD:
    const r = spawnSync('pm2', ['jlist'], {
      encoding: 'utf-8',
      timeout: 30_000,
      maxBuffer: 100 * 1024 * 1024,
      shell: process.platform === 'win32',  // <-- critical
    });
    if (r.status !== 0 || !r.stdout) return new Set();
    return new Set(JSON.parse(r.stdout).map(p => p.name).filter(Boolean));
  } catch { return new Set(); }
}
```

`pm2`, `npm`, `npx`, `python` all exist as `.cmd` / `.bat` shims in
`%APPDATA%\npm\`. Node's `spawnSync` doesn't auto-resolve them without
`shell: true` on Windows. The cost: the deprecation warning about
unescaped args. The benefit: it works.

## When to use this

- **First boot of a service-mesh system** — find out what's actually up
- **CI verification** — assert the live state matches the config
- **Drift detection** — re-scan periodically, alert on new orphans or
  missing non-optional services
- **Operator dashboard** — show the cross-ref table in the UI

## Common patterns discovered from real scans

- **`/health` is on 60% of services** — `unified_api` is the exception
- **`/api/health` is on Next.js routes** — same prefix
- **`/tower/status`** is the agent_tower convention
- **`/api/status`** is some services
- **The root `/`** on voice_coordinator returns a status object

Don't standardize on one path — write the probe to try all of them.
