# PURPCLAW Pool Service — Lessons from May 24 2026 Build

Three bugs cost the most time. All avoidable if the patterns below are known upfront.

---

## Bug 1: Port Mismatch (7885 vs 7880) — Cost: 2 hours

**Symptom:** `purpclaw pool query` returns "Pool service not reachable" even though the service is running.

**Root cause:** `pool_service.js` defaulted to 7885, `bin/purpclaw.js` and `ecosystem.config.js` used 7880. No validation.

**Rule:** Before starting the pool, grep BOTH files:
```bash
grep -n "7880\|7885" pool_service.js bin/purpclaw.js ecosystem.config.js
```
Unify to 7880 everywhere. Add startup assertion: `console.log('[POOL] listening on 0.0.0.0:' + PORT)`

---

## Bug 2: Absolute Paths in `item.file` — Cost: 45 minutes

**Symptom:** `purpclaw pool show <name>` returns `content: ""` despite file existing on disk.

**Root cause:** Python indexer writes absolute Windows paths to `item.file` (e.g., `E:\god folder\...\skills\ck\SKILL.md`). `path.join(PURP_DIR, item.file)` discards the first arg when second is already absolute.

**Fix — use `item.file` directly:**
```javascript
try { content = fs.readFileSync(item.file, 'utf8').slice(0, 4000); } catch {
  try { content = fs.readFileSync(path.join(PURP_DIR, item.file), 'utf8').slice(0, 4000); } catch { content = ''; }
}
```

**Detection:** `item.file.match(/^[A-Z]:/)` or `item.file.startsWith('/')` means absolute.

---

## Bug 3: `poolMeta` Not Updated After `rebuildIndex()` — Cost: 30 minutes

**Symptom:** Stats returns `skillsCount: 0` immediately after reindex.

**Root cause:** `rebuildIndex()` updated `skillsIndex[]` and `agentsIndex[]` but NOT the `poolMeta` object.

**Fix:** After updating arrays, update poolMeta too:
```javascript
poolMeta = {
  skillsCount: skillsIndex.length,
  agentsCount: agentsIndex.length,
  indexedAt: new Date().toISOString(),
};
```

---

## Bug 4: `http.request()` Double-Fire on Windows — Cost: 45 minutes

**Symptom:** Callback fires twice — first with valid results, second with `res.results === undefined`.

**Root cause:** `setTimeout` fires before `req.destroy()` completes, but `res.on('end')` still fires. `req.aborted` guard is insufficient.

**Fix — `called` boolean flag AND no `req.destroy()`:**
```javascript
var called = false;
var req = http.request({hostname:'127.0.0.1',port:POOL_PORT,path,method,
  headers:{'Content-Type':'application/json','X-Pool-Caller':'cli'}}, res => {
  var data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    if (called) return; called = true;
    try { resolve(JSON.parse(data)); } catch { resolve({error: data}); }
  });
});
req.setTimeout(4000, () => { if (called) return; called = true; req.destroy(); reject(new Error('timeout')); });
req.on('error', e => { if (called) return; called = true; reject(e); });
if (body) req.write(JSON.stringify(body));
req.end();
```

The `called` guard is NOT optional on Windows Node.js. `res.on('end')` fires after timeout.

---

## Bug 5: `__dirname` With Spaces on Windows

Works fine with forward slash normalization:
```javascript
const PURP_DIR = path.dirname(__filename).replace(/\\/g, '/');
```

---

## Index Build: Python → Node.js Handoff

Python indexer creates `agent_work/.pool_index.json` (absolute paths on Windows). Node.js pool_service.js loads it at startup.

Index structure:
```json
{
  "poolMeta": { "indexedAt": "...", "skillsCount": 139, "agentsCount": 38 },
  "skillsIndex": [{ "name": "...", "description": "...", "origin": "ECC", "file": "E:\\path\\to\\SKILL.md" }],
  "agentsIndex": [],
  "routingHints": {}
}
```

`file` field = absolute path on Windows. Use directly, not `path.join(PURP_DIR, item.file)`.

---

## PM2 + Windows Spaces

In `ecosystem.config.js`, never set `cwd` to a path with spaces on Windows — causes `EINVAL` spawn errors.

Use `shell: true` instead:
```javascript
{ script: 'pool_service.js', exec_mode: 'fork', instances: 1, shell: true }
```

---

## CLI Pool Commands (as built May 24 2026)

```javascript
// pool_req helper — use called flag, port 7880
function poolReq(method, path, body) { ... }

// cmdPool subcommands:
//   query <text>  → GET /pool/skills/search?q=<text>
//   show <name>   → GET /pool/skills/<name>  (item.file used directly)
//   stats         → GET /pool/stats
//   recent        → GET /pool/recent
//   reindex       → POST /pool/reindex
//   routing <text>→ GET /pool/routing/for-task?text=<text>
```

Registry shortcuts: `purpclaw install <name>` → `cmdRegistry(['install', ...])`, `purpclaw search <text>` → `cmdRegistry(['search', ...])`.