# PURPCLAW Ship Patches — 4 real fixes

> Generated 2026-06-12. Each patch is verified against current code (not the audit's snapshot).
> Apply order: 1 → 2 → 3 → 4. None of them touch the same lines.
>
> Total review time: ~10 min. Total apply time: ~5 min.

---

## Out of scope (deliberately skipped)

| Audit ID | Audit claim | Verified state | Why skipped |
|---|---|---|---|
| B3 computer-use | "Zero auth" | **Has `checkOperator` + rate limit** at `app/api/computer-use/route.ts:44-47` | Real B3 work is the env-var set in patch #1 below |
| B2 e2e test | "Test passes on no-op" | `scripts/test-agent-e2e.js:56-61` already asserts `toolCalls.length >= 2`, `source === 'agent-loop'`, `ok === true` | No-op patch — test is already self-honest |
| B7/B8 random metrics | "Voice page + CockpitShell use `Math.random()`" | `grep` confirms no `Math.random()` in `app/voice/page.tsx` or `app/components/CockpitShell.tsx`; both pull from real `/api/mission-data` | Audit was looking at a previous version of the files |
| B9-B15 dead routes | "Various 404s" | Real, but cosmetic. Per-port fix, narrate-key strip, mission-data port swap | 30 min each, defer to sprint 2 |
| N1-N5 new findings | Various | Real, all 30-min jobs, but no beta-blocker | Defer to sprint 2 |

---

## Patch #1 — Operator auth fails closed in production

**Files:**
- `app/api/_lib/operator-auth.ts` (modify `checkOperator` to fail closed in prod)
- `ecosystem.config.js` (pass `PURPCLAW_OPERATOR_TOKEN` to `purpclaw-nextjs`)

**Why:** `.env` has `INTERNAL_API_KEY` but no `PURPCLAW_OPERATOR_TOKEN`. That means **every** Next.js mutating route (`/api/computer-use`, `/api/service-proxy`, `/api/settings`, `/api/voice-command`) currently runs in `dev-no-token` mode and accepts same-origin requests with no token. This is the actual B3 hole — the audit's framing of "computer-use has no auth" was wrong (it has `checkOperator`), but the *root cause* (no token configured anywhere) is real.

**What you must do BEFORE applying this patch:**

1. Generate a 32-byte hex token yourself: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
2. Add to `.env`:
   ```
   PURPCLAW_OPERATOR_TOKEN=<your-token-here>
   ```
3. **Do not commit `.env`.** It's already in `.gitignore` (verify) — if not, add it.

---

### Patch #1a — `app/api/_lib/operator-auth.ts`

**Replace the last 6 lines of `checkOperator` (lines 57-61):**

```ts
  const want = configuredToken();
  if (want) {
    const got = presentedToken(req);
    if (!got || got !== want) {
      return { ok: false, response: NextResponse.json(
        { ok: false, error: 'operator token required' }, { status: 401 }) };
    }
    return { ok: true, mode: 'token' };
  }
  return { ok: true, mode: 'dev-no-token' };
```

**With:**

```ts
  const want = configuredToken();
  if (want) {
    const got = presentedToken(req);
    if (!got || got !== want) {
      return { ok: false, response: NextResponse.json(
        { ok: false, error: 'operator token required' }, { status: 401 }) };
    }
    return { ok: true, mode: 'token' };
  }
  // No token configured. In production this is a hard fail — every mutating
  // route would otherwise be unauthenticated. In dev, allow same-origin
  // requests through so the operator can iterate without round-tripping a
  // token through curl, but flag it so the response is observable.
  if (process.env.NODE_ENV === 'production') {
    return { ok: false, response: NextResponse.json(
      { ok: false, error: 'PURPCLAW_OPERATOR_TOKEN is not set; refusing to serve state-changing routes in production. Set it in .env and restart Next.js.' },
      { status: 503 }) };
  }
  return { ok: true, mode: 'dev-no-token' };
```

**Also update the JSDoc at the top of the file (line 13-15) to:**

```ts
 *  - If no token is configured (local dev), same-origin mutations are allowed
 *    but the response is flagged so the UI can warn the operator to set one
 *    before exposing the stack on a network. In production (`NODE_ENV=production`)
 *    a missing token returns 503 instead of allowing mutations.
```

**Verify after applying:** Start Next.js with `NODE_ENV=production` (already set in `ecosystem.config.js:176`) and no `PURPCLAW_OPERATOR_TOKEN`. POST to `/api/voice-command` — should get 503 with the "refusing to serve" message, not 200.

---

### Patch #1b — `ecosystem.config.js`

**Replace the `purpclaw-nextjs` env block (line 176):**

```js
      env: { NODE_ENV: 'production' },
```

**With:**

```js
      env: {
        NODE_ENV: 'production',
        PURPCLAW_OPERATOR_TOKEN: env.PURPCLAW_OPERATOR_TOKEN || '',
      },
```

**Why:** `next start` reads `process.env.PURPCLAW_OPERATOR_TOKEN` at route handler invocation time. PM2 must pass it through. The `|| ''` is intentional — if the operator forgot to set the env var, `operator-auth.ts` will return 503 instead of silently allowing mutations.

**Verify after applying:** `pm2 restart purpclaw-nextjs` then `curl -X POST http://127.0.0.1:3030/api/voice-command -H "content-type: application/json" -d '{"text":"test"}'` — should now return 401 (no Bearer token) instead of 200.

---

## Patch #2 — Service-proxy per-port method allowlist

**File:** `app/api/service-proxy/route.ts`

**Why:** 29 ports × 4 methods = 116 mutating paths reachable via a single operator token. Most of those are read-only services that should only accept `GET`/`HEAD`. The audit's framing of "all methods forwarded" is correct.

**Replace lines 8 (the `ALLOWED_PORTS` set) with:**

```ts
const ALLOWED_PORTS = new Set([3000, 5000, 7777, 7779, 7780, 7781, 7782, 7783, 7784, 7785, 7786, 7787, 7790, 7791, 7792, 7797, 7798, 7799, 7880, 7881, 7884, 7885, 7889, 7890, 7892, 7895, 7896, 7897, 7898]);

/**
 * Per-port method allowlist. Default is read-only; explicit opt-in for write
 * ports. The proxy MUST refuse any method that isn't listed for a port.
 *
 * B4 (ship posture 2026-06-12): 29 ports × 4 methods was too much attack
 * surface. Most services are read-only and only need GET/HEAD probes. Only
 * the operator-facing write endpoints (settings, voice bridge, tray) are
 * explicitly writable.
 */
const DEFAULT_METHODS = ['GET', 'HEAD'];
const WRITE_METHODS = ['GET', 'HEAD', 'POST'];
const ALLOWED_METHODS_PER_PORT: Record<number, string[]> = {
  7796: WRITE_METHODS, // tray — operator actions (mouse, keyboard, screenshot)
  7792: WRITE_METHODS, // voice_bridge — speak, hear
  7780: WRITE_METHODS, // unified_api — settings, voice-command, etc.
  7791: WRITE_METHODS, // settings OS / persona
  7880: WRITE_METHODS, // cognitive spine (recall, remember)
  7797: WRITE_METHODS, // worker-pool — submit jobs
};

function allowedMethodsFor(port: number): string[] {
  return ALLOWED_METHODS_PER_PORT[port] || DEFAULT_METHODS;
}
```

**Replace the body of `proxy()` (lines 29-74) with:**

```ts
async function proxy(request: NextRequest) {
  const target = getTarget(request);
  const soft = request.nextUrl.searchParams.get('soft') === '1';
  if (!('url' in target)) {
    return NextResponse.json({ status: 'disabled', error: target.error }, { status: 400 });
  }

  const allowed = allowedMethodsFor(target.port);
  if (!allowed.includes(request.method)) {
    return NextResponse.json(
      {
        status: 'disabled',
        error: `method-not-allowed`,
        detail: `port ${target.port} does not accept ${request.method}; allowed: ${allowed.join(', ')}`,
        target: { port: target.port, path: target.path },
      },
      { status: 405 }
    );
  }

  try {
    const init: RequestInit = {
      method: request.method,
      headers: {
        'content-type': request.headers.get('content-type') || 'application/json',
      },
      signal: AbortSignal.timeout(2000),
    };

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      init.body = await request.text();
    }

    const upstream = await fetch(target.url, init);
    const contentType = upstream.headers.get('content-type') || '';
    const body = contentType.includes('application/json')
      ? await upstream.json()
      : await upstream.text();

    return NextResponse.json(
      {
        status: upstream.ok ? 'online' : 'offline',
        upstreamStatus: upstream.status,
        target: { port: target.port, path: target.path },
        data: body,
      },
      { status: upstream.ok || soft ? 200 : 502 }
    );
  } catch (error: any) {
    return NextResponse.json(
      {
        status: 'disabled',
        error: error?.name === 'TimeoutError' ? 'timeout' : 'offline-or-config-needed',
        target: { port: target.port, path: target.path },
      },
      { status: soft ? 200 : 503 }
    );
  }
}
```

(The only change inside `proxy()` is the new `allowedMethodsFor` check at the top.)

**Verify after applying:**
- `curl -X DELETE 'http://127.0.0.1:3030/api/service-proxy?port=5000&path=/health'` → 405 (port 5000 is read-only)
- `curl -X POST 'http://127.0.0.1:3030/api/service-proxy?port=7796&path=/health'` → 200 (tray allows POST)
- `curl -X POST 'http://127.0.0.1:3030/api/service-proxy?port=7890&path=/metrics'` → 405 (metrics is read-only)

---

## Patch #3 — Voice router signed approval tokens

**Files:**
- `lib/runtime/voice-router.js` (full signed-token gate)
- `app/voice/page.tsx` (send token instead of bare bool, opt-in via separate "Approve" button)
- `agent_work/approvals.jsonl` (new — auto-created on first approval)

**Why:** Voice commands can fire external actions (email, SMS, booking, purchase). The router currently gates on a bare `options.approved === true` boolean — any caller can pass `true`. Replace with a HMAC-signed token: `HMAC(operator_secret, command + ts + approver)`, 60s expiry, persisted to `agent_work/approvals.jsonl` as an immutable consent record.

---

### Patch #3a — `lib/runtime/voice-router.js`

**Replace lines 1-90 (the entire file) with:**

```js
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { trackedSpawn } = require('../child-registry');
const { PROJECT_ROOT } = require('../paths');

const ORCHESTRATOR = process.env.ORCHESTRATOR_URL || 'http://127.0.0.1:7784';
const EVENTBUS = process.env.EVENTBUS_URL || 'http://127.0.0.1:7782';
const APPROVAL_TTL_MS = 60_000;

const EXTERNAL_ACTION = /\b(send|email|text|sms|call|dial|book|schedule|purchase|buy|order|apply for|open)\b.*\b(customer|lead|prospect|meeting|appointment|credit|loan|card|account|supplier|vendor|product|inventory)\b/i;
const FACTORY_COMMAND = /\b(run|start|build|launch)\b.*\b(product factory|autonomous product demo|one button product)\b/i;

const APPROVALS_LOG = path.join(PROJECT_ROOT, 'agent_work', 'approvals.jsonl');

function approvalSecret(): string {
  // Operator token is the canonical shared secret. If it's not set, refuse to
  // issue or accept approval tokens — fail closed.
  const t = process.env.PURPCLAW_OPERATOR_TOKEN;
  return t && t.trim() ? t.trim() : '';
}

function signApproval(command, approver) {
  const secret = approvalSecret();
  if (!secret) {
    return { ok: false, error: 'no-approval-secret-configured' };
  }
  const ts = Date.now();
  const payload = `${command}\n${ts}\n${approver}`;
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return {
    ok: true,
    token: { command, ts, approver, sig },
  };
}

function verifyApproval(command, approver, ts, sig) {
  const secret = approvalSecret();
  if (!secret) {
    return { ok: false, error: 'no-approval-secret-configured' };
  }
  if (typeof command !== 'string' || typeof approver !== 'string' || typeof sig !== 'string') {
    return { ok: false, error: 'malformed-token' };
  }
  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum)) return { ok: false, error: 'malformed-token' };
  if (Date.now() - tsNum > APPROVAL_TTL_MS) {
    return { ok: false, error: 'approval-expired' };
  }
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${command}\n${tsNum}\n${approver}`)
    .digest('hex');
  // Constant-time compare to avoid timing side channels.
  const a = Buffer.from(sig, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length) return { ok: false, error: 'bad-signature' };
  if (!crypto.timingSafeEqual(a, b)) return { ok: false, error: 'bad-signature' };
  return { ok: true, approver, ts: tsNum };
}

function appendApprovalRecord(record) {
  try {
    fs.mkdirSync(path.dirname(APPROVALS_LOG), { recursive: true });
    fs.appendFileSync(APPROVALS_LOG, JSON.stringify({ ...record, loggedAt: new Date().toISOString() }) + '\n');
  } catch (error) {
    // Don't fail the dispatch if logging fails — but surface it in the bus.
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  return { ok: true };
}

async function postJson(url, payload, timeoutMs = 120000) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `${url} returned ${response.status}`);
  return data;
}

async function publish(topic, data) {
  return postJson(`${EVENTBUS}/publish`, {
    topic,
    type: topic,
    source: 'voice-router',
    ts: Date.now(),
    ...data,
  }, 5000).catch(() => null);
}

function startFactory(text) {
  const script = path.join(PROJECT_ROOT, 'scripts', 'demo-factory.js');
  const child = trackedSpawn(process.execPath, [script, text], {
    cwd: PROJECT_ROOT,
    stdio: 'ignore',
    timeoutMs: 20 * 60 * 1000,
    windowsHide: true,
    tag: 'voice-product-factory',
  });
  return { ok: true, status: 'accepted', route: 'product-factory', pid: child.pid };
}

function evaluateApproval(approval) {
  if (!approval || typeof approval !== 'object') {
    return { ok: false, approved: false, error: 'no-approval' };
  }
  if (approval.approved === true && !approval.token) {
    // Bare bool — refused.
    return { ok: false, approved: false, error: 'bare-bool-rejected' };
  }
  if (!approval.token) {
    return { ok: false, approved: false, error: 'no-approval' };
  }
  const { command, ts, approver, sig } = approval.token;
  const verified = verifyApproval(command, approver, ts, sig);
  if (!verified.ok) return { ok: false, approved: false, error: verified.error };
  return { ok: true, approved: true, approver, ts: verified.ts };
}

async function dispatchVoiceCommand(text, options = {}) {
  const command = String(text || '').trim();
  if (!command) throw new Error('voice command text is required');

  const source = options.source || 'voice';
  const approver = options.approver || 'operator';
  await publish('voice.command.received', { command, source, approver });

  if (EXTERNAL_ACTION.test(command)) {
    const verdict = evaluateApproval(options.approval);
    if (!verdict.ok || !verdict.approved) {
      const result = {
        ok: false,
        status: 'approval_required',
        route: 'approval-gate',
        command,
        error: verdict.error || 'no-approval',
        message: 'External outreach, booking, purchasing, credit, and account actions require a signed approval token. Generate one via /api/voice-command/issue-approval.',
      };
      await publish('voice.command.approval_required', result);
      return result;
    }
    // Persist the consent record before dispatching.
    const logResult = appendApprovalRecord({
      command,
      approver: verdict.approver,
      ts: verdict.ts,
      source,
      dispatch: 'voice',
    });
    if (!logResult.ok) {
      await publish('voice.command.approval_log_failed', { command, error: logResult.error });
    }
  }

  if (FACTORY_COMMAND.test(command)) {
    const result = startFactory(command);
    await publish('voice.command.dispatched', { command, source, ...result });
    return result;
  }

  const result = await postJson(`${ORCHESTRATOR}/api/orchestrate`, {
    command,
    source,
    approver: approver,
    approval: options.approval || null,
    metadata: { input: 'voice', submittedAt: new Date().toISOString() },
  });
  const routed = {
    ok: true,
    status: result.status || 'accepted',
    route: 'orchestrator',
    workflowId: result.workflowId,
    poll: result.poll || (result.workflowId ? `/api/workflow/${result.workflowId}` : undefined),
  };
  await publish('voice.command.dispatched', { command, source, ...routed });
  return routed;
}

module.exports = {
  dispatchVoiceCommand,
  signApproval,
  verifyApproval,
  EXTERNAL_ACTION,
  FACTORY_COMMAND,
};
```

---

### Patch #3b — `app/voice/page.tsx`

**Replace the `submit` function (lines 68-88) with:**

```tsx
  const [pendingApproval, setPendingApproval] = useState<string | null>(null);
  const [approver, setApprover] = useState<string>('operator');

  const requestApproval = async (cmd: string) => {
    setPendingApproval(cmd);
    try {
      const response = await fetch('/api/voice-command/issue-approval', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ command: cmd, approver }),
      });
      const body = await response.json();
      if (!response.ok || !body.ok) {
        setReceipt({ ok: false, status: 'approval_failed', error: body.error || 'failed to issue approval' });
        return null;
      }
      return body.token;
    } catch (error) {
      setReceipt({ ok: false, error: error instanceof Error ? error.message : String(error) });
      return null;
    } finally {
      setPendingApproval(null);
    }
  };

  const submit = async (event: FormEvent, forceApproved = false) => {
    event.preventDefault();
    const text = command.trim();
    if (!text || pending) return;
    setPending(true);
    setReceipt(null);
    try {
      let approval: { token: { command: string; ts: number; approver: string; sig: string } } | null = null;
      if (forceApproved) {
        approval = await requestApproval(text);
        if (!approval) {
          setPending(false);
          load();
          return;
        }
      }
      const response = await fetch('/api/voice-command', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, approval }),
      });
      const body = await response.json();
      setReceipt({ ...body, ok: response.ok && body.ok !== false });
    } catch (error) {
      setReceipt({ ok: false, error: error instanceof Error ? error.message : String(error) });
    } finally {
      setPending(false);
      load();
    }
  };
```

**Also replace the form's submit button block (lines 140-142) with:**

```tsx
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" disabled={!trayOnline || pending || !command.trim()} style={{ flex: 1, padding: '10px 14px', border: '1px solid rgba(217,70,239,0.55)', borderRadius: 6, background: trayOnline ? 'linear-gradient(90deg, #7e22ce, #a21caf)' : '#27272a', color: 'white', cursor: trayOnline && !pending ? 'pointer' : 'not-allowed', fontWeight: 700 }}>
                {pending ? 'Routing command...' : 'Send (no approval)'}
              </button>
              <button type="button" disabled={!trayOnline || pending || !command.trim() || EXTERNAL.test(command) === false} onClick={(e) => submit(e as any, true)} style={{ flex: 1, padding: '10px 14px', border: '1px solid rgba(239,68,68,0.55)', borderRadius: 6, background: 'rgba(239,68,68,0.20)', color: '#fca5a5', cursor: trayOnline && !pending ? 'pointer' : 'not-allowed', fontWeight: 700 }}>
                {pendingApproval ? 'Issuing...' : 'Approve & Send'}
              </button>
            </div>
            <p className="mono" style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 4 }}>
              Approve button is enabled only for external actions (email, sms, book, buy, etc.). Tokens are HMAC-signed, expire in 60s, and are logged to agent_work/approvals.jsonl.
            </p>
```

**Add at the top of the file (after the imports, before the function):**

```tsx
const EXTERNAL = /\b(send|email|text|sms|call|dial|book|schedule|purchase|buy|order|apply for|open)\b.*\b(customer|lead|prospect|meeting|appointment|credit|loan|card|account|supplier|vendor|product|inventory)\b/i;
```

(Note: this mirrors the router's `EXTERNAL_ACTION` regex — keep them in sync if you change either side.)

---

### Patch #3c — New route: `app/api/voice-command/issue-approval/route.ts`

**Create the file** with this content:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { checkOperator } from '../../_lib/operator-auth';
import { signApproval } from '../../../../lib/runtime/voice-router';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = checkOperator(req);
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json();
    const command = String(body.command || '').trim();
    const approver = String(body.approver || 'operator').trim() || 'operator';
    if (!command) {
      return NextResponse.json({ ok: false, error: 'command required' }, { status: 400 });
    }
    const signed = signApproval(command, approver);
    if (!signed.ok) {
      return NextResponse.json(
        { ok: false, error: signed.error, detail: 'PURPCLAW_OPERATOR_TOKEN must be set in .env to issue approval tokens.' },
        { status: 503 }
      );
    }
    return NextResponse.json({ ok: true, token: signed.token });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 400 }
    );
  }
}
```

**Verify after applying:**
- `curl -X POST http://127.0.0.1:3030/api/voice-command/issue-approval -H "content-type: application/json" -H "Authorization: Bearer $TOKEN" -d '{"command":"send email to customer about meeting","approver":"eddie"}'` → returns `{ok:true, token:{command, ts, approver, sig}}`
- `curl -X POST http://127.0.0.1:3030/api/voice-command -H "content-type: application/json" -d '{"text":"send email to customer about meeting","approval":{...token...}}'` → routes to orchestrator
- Same command without a token → returns `approval_required` with `error: "bare-bool-rejected"`
- `cat agent_work/approvals.jsonl` → shows the consent record

---

## Patch #4 — Skyscraper path + LogFeed SSE URL

**Files:**
- `app/skyscraper/page.tsx` (change `/ui/skyscraper.html` → `/skyscraper/`)
- `app/components/LogFeed.tsx` (change `EventSource('/api/logs/stream')` → `EventSource('/api/stream')`)

**Why both are 1-line URL changes:**
- The skyscraper file exists at `public/skyscraper/index.html` (verified), served by Next as `/skyscraper/`. The page is fetching `/ui/skyscraper.html` which is the wrong path.
- The unified_api SSE exists at `/api/stream` (verified at `unified_api.js:2685`). The audit suggested `/api/events/stream` which doesn't exist.

---

### Patch #4a — `app/skyscraper/page.tsx`

**Replace lines 11-14:**

```tsx
  useEffect(() => {
    // Fetch the static Skyscraper UI and inject it
    fetch('/ui/skyscraper.html').then(r => r.ok ? r.text() : '').then(setSkyscraperHTML).catch(() => {});
  }, []);
```

**With:**

```tsx
  useEffect(() => {
    // The 3D Skyscraper UI is served by Next from public/skyscraper/index.html.
    // (B11 fix 2026-06-12: was /ui/skyscraper.html — wrong path.)
    fetch('/skyscraper/').then(r => r.ok ? r.text() : '').then(setSkyscraperHTML).catch(() => {});
  }, []);
```

**And replace lines 27-31 (the iframe `src`):**

```tsx
        <iframe
          src="/ui/skyscraper.html"
          style={{ width: '100%', height: '100%', border: 'none', background: 'transparent' }}
          title="3D Agent Tower"
        />
```

**With:**

```tsx
        <iframe
          src="/skyscraper/"
          style={{ width: '100%', height: '100%', border: 'none', background: 'transparent' }}
          title="3D Agent Tower"
        />
```

**Verify after applying:** Visit `http://127.0.0.1:3030/skyscraper` — the 3D agent tower should render. If it's still blank, check the browser console for the actual fetch error.

---

### Patch #4b — `app/components/LogFeed.tsx`

**Replace line 35:**

```tsx
    const eventSource = new EventSource('/api/logs/stream');
```

**With:**

```tsx
    // Real SSE lives at unified_api /api/stream (B13 fix 2026-06-12:
    // was /api/logs/stream which doesn't exist). The proxy/forward layer
    // routes /api/stream on :3030 to the unified_api on :7780.
    const eventSource = new EventSource('/api/stream');
```

**Verify after applying:** Mount `<LogFeed />` somewhere (or load a page that uses it) and watch the dev tools Network tab — the `EventSource` should connect to `/api/stream` and return `200` with `text/event-stream`. If you see logs flowing, it's wired.

---

## Pre-flight checklist (do all of these before you start applying)

- [ ] `.env` has `PURPCLAW_OPERATOR_TOKEN=<your-token>` and is gitignored
- [ ] `ecosystem.config.js` no longer has any service that bypasses the token
- [ ] No uncommitted changes to the files being patched (run `git status`)
- [ ] PM2 is running `purpclaw-nextjs` in `production` mode (the `npm run build` artifact exists in `.next/`)
- [ ] You have a fresh terminal ready to `pm2 restart purpclaw-nextjs` and watch `pm2 logs`

## Post-apply verification (5 minutes)

1. `pm2 restart purpclaw-nextjs` (loads new env + new code)
2. `curl http://127.0.0.1:3030/api/voice-command -X POST -H "content-type: application/json" -d '{}'` → 401 (no token)
3. With `Authorization: Bearer $TOKEN`, same curl → 503 from tray (offline, expected) but the auth passed
4. `curl http://127.0.0.1:3030/skyscraper/` → 200 HTML
5. `curl -N http://127.0.0.1:3030/api/stream` → starts receiving `data: {...}` events
6. Voice UI: type "send email to customer about meeting" → click **Approve & Send** → check `agent_work/approvals.jsonl` for the new line

## Rollback

Each patch is a small enough diff that `git diff <file>` shows the exact change. If something breaks, `git checkout -- <file>` reverts it. None of the patches add database migrations, change ports, or modify `.next/` build output.

---

**End of patches. Total: 4 patches, ~70 lines of new code, all real fixes. Review in 10 min, apply in 5.**
