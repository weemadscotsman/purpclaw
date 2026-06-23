# 🤖 ROBOT — Precision Remediation Report

**Agent:** 🤖 ROBOT (Precision Engineer, ENG division)
**Mission:** File path; line number; remediation advice for residual auth/risk findings.
**Date:** 2026-07-02
**Scope:** `app/api/**/route.ts` mutating endpoints that lack `checkOperator()` / `checkRateLimit()` and would otherwise allow a LAN caller to mutate runtime state.
**Companion audit:** Guardian owns `auth/security/permissions/tokens/secrets/credentials` regex scope. This report covers the *route surface* and *call-site application* of those gates (i.e. where the gates are missing, not where they are defined).

---

## TL;DR — Quality Gate Status

| Surface | Status |
|---|---|
| Operator auth helper (`app/api/_lib/operator-auth.ts`) | ✅ Defined, ships CSRF + token check |
| Rate-limit helper (`app/api/_lib/rate-limit.ts`) | ✅ Defined, in-memory bucket per scope |
| Mutating routes gated (settings, preprompt, personality, ollama, governance, kernel/jobs, orchestrate, llm/plan, research/group, personality, voice/chat, computer-use, voice-command) | ✅ Gated |
| **Mutating routes NOT gated** (residual risk) | ⚠️ 7 routes — see findings below |

The codebase is **already extensively hardened** (B3/B4/B5 audit work is in). The remaining gaps are concentrated in a handful of routes that predate the `checkOperator()` rollout. Each is fixable with a 3-line patch.

---

## F-01 (HIGH) — `app/api/playwright/route.ts` — Unauthenticated browser RCE/SSRF

**File:** `app/api/playwright/route.ts`
**Lines:** POST handler at **L57–L120** (the function body that branches on `action`).
**Evidence (verbatim):**
```ts
// L57  export async function POST(req: NextRequest) {
// L58    const body = await req.json().catch(() => ({}));
// L59    const { action } = body;
// L60
// L61    try {
// L62      if (action === 'navigate') { … p.goto(url, …) }   // SSRF: arbitrary URL
// L78      if (action === 'execute')  { … p.evaluate(code) } // RCE in browser context
```
**Risk:** A LAN caller can (a) drive the headless Chromium to any URL (SSRF / data exfil via screenshots), (b) execute arbitrary JS in the browser context via `p.evaluate(code)`, (c) click/type to drive auth flows. The route is NOT listed as operator-gated in `docs/ROUTE_INDEX.md` (the index only flags `computer-use`, not `playwright`).

**Remediation (3-line patch):**
```ts
// Add at top of POST, after the body parse:
const auth = checkOperator(req);
if (!auth.ok) return auth.response;
const limited = checkRateLimit(req, 'playwright', 20);
if (limited) return limited;
```
Also tighten `navigate` to an allowlist (or at minimum reject `127.0.0.1`/`localhost`/internal CIDR unless `playwright.allowLocal=1`).

---

## F-02 (HIGH) — `app/api/upload/route.ts` — Unauthenticated file write to `agent_work/uploads/`

**File:** `app/api/upload/route.ts`
**Lines:** POST handler **L41–L73** (writes 50MB arbitrary `multipart/form-data` files to disk).
**Evidence (verbatim):**
```ts
// L41  export async function POST(req: NextRequest) {
// L42    try {
// L43      const form = await req.formData();
// L44      const files = form.getAll('files').filter((f): f is File => f instanceof File);
// …
// L58      const buf = Buffer.from(await file.arrayBuffer());
// L59      fs.writeFileSync(abs, buf);   // arbitrary path under agent_work/uploads/
```
**Risk:** 50MB arbitrary file writes from any LAN caller. Filename is sanitized via `safeName()` (good) but the *content* is not — an attacker can drop a `.exe`, a webshell, or fill the disk (50MB × N requests). The subsequent agents that mount `agent_work/` via `--add-dir` will read these files.

**Remediation:**
```ts
const auth = checkOperator(req);
if (!auth.ok) return auth.response;
const limited = checkRateLimit(req, 'upload', 30);
if (limited) return limited;
```
Plus extend `TEXT_EXT` to include a binary-blocklist (`.exe`, `.bat`, `.ps1`, `.scr`, `.vbs`) and reject when `file.type` is `application/x-msdownload` etc.

---

## F-03 (HIGH) — `app/api/whoami/route.ts` — Cookie spoofing → "founder" role

**File:** `app/api/whoami/route.ts`
**Lines:** POST handler **L18–L34**.
**Evidence (verbatim):**
```ts
// L18  export async function POST(request: NextRequest) {
// L19    let body: any = {};
// L20    try { body = await request.json(); } catch {}
// L21    const newName = String(body?.name || '').trim();
// L22    if (!newName) return NextResponse.json({ error: 'name-required' }, { status: 400 });
// L23    const response = NextResponse.json({ success: true, name: newName,
// L24      role: newName.toLowerCase() === 'ted' || newName.toLowerCase() === 'eddie' ? 'founder' : 'operator' });
// L27    response.cookies.set('purpclaw_operator', newName, { maxAge: 60*60*24*365, path: '/' });
```
**Risk:** No `checkOperator()`, no CSRF, no origin check. Any LAN caller (or any browser the user visits an attacker's page on) can set `purpclaw_operator=Ted` and immediately be treated as "founder" by every UI surface that reads the cookie. Sticky for 1 year. The role flag is cosmetic in many places, but it's a real identity-claim surface.

**Remediation:**
```ts
const auth = checkOperator(request);
if (!auth.ok) return auth.response;
```
Plus drop `maxAge` to `60*60*24` (1 day) and add `httpOnly: true, sameSite: 'lax', secure: true`.

---

## F-04 (MEDIUM) — `app/api/providers/route.ts` POST — Lane config mutation with no auth

**File:** `app/api/providers/route.ts`
**Lines:** POST handler **L65–L77**.
**Evidence (verbatim):**
```ts
// L65  export async function POST(req: Request) {
// L66    try {
// L67      const config = require('../../../lib/runtime/provider-config.js');
// L68      const body = await req.json().catch(() => ({}));
// L69      const { lane, provider, model } = body || {};
// L70      if (!lane) return NextResponse.json({ ok: false, error: 'lane required' }, { status: 400 });
// L71      const saved = config.setLane(lane, { provider, model });
```
**Risk:** A LAN caller can rewrite the user's routing lanes (e.g. point the swarm lane at an attacker-controlled `custom` provider with their own `baseUrl`). The provider keys live in `.env`, but the *lane → provider* mapping is user-mutable. Trivial DoS / cost-amplification if an attacker swaps the swarm lane to a paid provider.

**Remediation:**
```ts
const auth = checkOperator(req);
if (!auth.ok) return auth.response;
const limited = checkRateLimit(req, 'providers', 10);
if (limited) return limited;
```
Plus validate `provider` against `sentinel.listKnownProviders()` before persisting.

---

## F-05 (MEDIUM) — `app/api/models/route.ts` POST — `smokeTest` makes real provider calls

**File:** `app/api/models/route.ts`
**Lines:** POST handler **L42–L53**.
**Evidence (verbatim):**
```ts
// L42  export async function POST(req: Request) {
// L43    try {
// L44      const sentinel = require('../../../lib/model-sentinel.js');
// L45      const body = await req.json().catch(() => ({}));
// L46      const { provider, model } = body || {};
// L47      if (!provider || !model) return NextResponse.json({ ok: false, error: 'provider and model required' }, { status: 400 });
// L48      const result = await sentinel.smokeTest(provider, model);
```
**Risk:** `smokeTest` issues a real chat completion against the named provider/model. A LAN caller can pick the most expensive paid model in the registry and burn the user's spend cap. SpendGate is supposed to gate this internally, but the route layer has no operator auth.

**Remediation:**
```ts
const auth = checkOperator(req);
if (!auth.ok) return auth.response;
const limited = checkRateLimit(req, 'models-smoke', 10);
if (limited) return limited;
```
Plus confirm `lib/model-sentinel.js#smokeTest` returns 402 when SpendGate blocks — currently the route would still return 200 with the failure body.

---

## F-06 (MEDIUM) — `app/api/sessions/route.ts` POST + `app/api/sessions/[id]/route.ts` GET/PATCH/DELETE — Session tampering

**Files:**
- `app/api/sessions/route.ts` POST **L22–L35**
- `app/api/sessions/[id]/route.ts` GET **L17–L23**, PATCH **L25–L33**, DELETE **L35–L39**

**Evidence (verbatim):**
```ts
// sessions/route.ts L22
//   export async function POST(req: NextRequest) {
//     let body: any = {};
//     try { body = await req.json(); } catch {}
//     const messages = Array.isArray(body.messages) ? body.messages : [];
//     const id = typeof body.id === 'string' && body.id.trim()
//       ? body.id.trim()
//       : store().createSession(title, provider, model).id;
//     const session = store().saveSession(id, messages, { title, provider, model });
```
```ts
// sessions/[id]/route.ts L35
//   export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
//     const { id } = await ctx.params;
//     const result = store().deleteSession(id);
```
**Risk:** Any LAN caller can (a) overwrite any session by guessing or scraping the ID, (b) delete any session by ID, (c) read any session's full message history (which may contain pasted secrets, API keys, or PII that the user typed into chat). No `checkOperator()`, no per-user scoping.

**Remediation:**
1. Add `checkOperator()` to all four handlers.
2. Scope session IDs per operator (the cookie `purpclaw_operator` or a new `purpclaw_session_owner` cookie) so cross-operator reads/writes are 404.
3. Add `checkRateLimit(req, 'sessions', 60)` to POST.

---

## F-07 (LOW) — `app/api/trace/recent/route.ts` POST — Trace injection

**File:** `app/api/trace/recent/route.ts`
**Lines:** POST handler **L15–L21**.
**Evidence (verbatim):**
```ts
// L15  export async function POST(req: NextRequest) {
// L16    let body: any = {};
// L17    try { body = await req.json(); } catch {}
// L18    const trace = require('../../../../lib/trace-store.js');
// L19    const event = trace.record(body || {});
```
**Risk:** Any LAN caller can inject arbitrary "trace" events with arbitrary `source`, `action`, `status` fields. The Mission Control trace lens renders these directly. An attacker could spoof "agent.completed" events for agents that never ran, or flood the trace log to hide a real event. Low severity because trace data is not authoritative (the orchestrator's `SWARM_MEMORY` is), but it's a UI-trust gap.

**Remediation:**
```ts
const auth = checkOperator(req);
if (!auth.ok) return auth.response;
const limited = checkRateLimit(req, 'trace-write', 30);
if (limited) return limited;
// Sanitize: drop any field outside {route, action, status, detail, source}
const allowed = ['route','action','status','detail','source'];
const clean = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));
```

---

## F-08 (LOW) — `app/api/sampler/route.ts` — `eval('require')`

**File:** `app/api/sampler/route.ts`
**Lines:** **L13** (the `eval('require')` call).
**Evidence (verbatim):**
```ts
// L13  const nodeRequire = eval('require');
```
**Risk:** This is a code smell, not a vulnerability — `eval('require')` is a known workaround for webpack bundling, and the string is a literal `'require'` with no user input. Webpack/Next will not optimize it. Low severity; flagged for cleanup.

**Remediation:** Replace with a dynamic import:
```ts
const nodeRequire = await import('node:module').then(m => m.createRequire(import.meta.url));
```
or, simpler, add `const sampler = require(path.join(process.cwd(), 'lib', 'sampler.js'));` and configure webpack `externals` to leave the path alone. The route index already authorises this surface (`/api/sampler` GET only, no mutating POST).

---

## F-09 (INFO) — `app/api/discover/route.ts` — Read-only intent search, no auth

**File:** `app/api/discover/route.ts`
**Lines:** GET **L67–L70**, POST **L72–L76**.
**Risk:** Read-only registry search; no secrets returned. Acceptable as-is for a local-first deployment. If ever exposed beyond 127.0.0.1, add `checkOperator()` to POST (GET can stay open).

---

## Routes Confirmed Gated (no action needed)

For audit completeness, the following mutating routes **already call `checkOperator()` + `checkRateLimit()`** at the top of their POST handler. No remediation needed:

| Route | File | Auth line |
|---|---|---|
| `/api/settings` POST | `app/api/settings/route.ts` | L75 |
| `/api/preprompt` POST | `app/api/preprompt/route.ts` | L29 |
| `/api/personality` POST | `app/api/personality/route.ts` | L106 |
| `/api/ollama` POST | `app/api/ollama/route.ts` | L121 |
| `/api/governance/policy` POST | `app/api/governance/policy/route.ts` | L19 |
| `/api/kernel/jobs` POST | `app/api/kernel/jobs/route.ts` | L24 |
| `/api/orchestrate` POST | `app/api/orchestrate/route.ts` | L22 |
| `/api/llm/plan` POST | `app/api/llm/plan/route.ts` | L21 |
| `/api/research/group` POST | `app/api/research/group/route.ts` | L13 |
| `/api/computer-use` POST | `app/api/computer-use/route.ts` | L41 |
| `/api/voice-command` POST | `app/api/voice-command/route.ts` | L21 |
| `/api/voice/chat` POST | `app/api/voice/chat/route.ts` | L72 |
| `/api/internal/check` GET/POST | `app/api/internal/check/route.ts` | L36 |

---

## Calibration Notes

- **Measurement method:** Each finding's line number was read from the actual file via the `read` tool at audit time. If a file has been edited since, the line may have shifted by ±5.
- **Severity scale:** HIGH = direct LAN-side attack vector (RCE / SSRF / identity-spoof / cost-amplification). MEDIUM = mutation surface that should be gated. LOW = code smell or UI-trust gap. INFO = acceptable as-is for the local-first threat model.
- **Threat model assumption:** Stack is bound to `127.0.0.1` per `docs/CANONICAL_MAP.md` Hard Rule #5. Findings assume a LAN-side attacker who can reach the loopback port via a browser on the same machine (e.g. a malicious browser extension, a phishing page in another tab, or a second user on a shared box).
- **Out of scope:** Guardian owns the regex surface (`auth|security|permissions|tokens|secrets|credentials`). I did not touch `lib/governance.js`, `lib/auth.js`, `lib/security.js`, `lib/permissions.js`, `lib/secrets.js`, `lib/credentials.js`, `lib/tokens.js` — those are Guardian's lane.

---

## Recommended Patch Order (by blast radius)

1. **F-03** (`/api/whoami` POST) — identity spoofing, 1 line of auth + cookie hardening.
2. **F-01** (`/api/playwright` POST) — browser RCE/SSRF, 3-line gate.
3. **F-02** (`/api/upload` POST) — disk-fill + arbitrary file drop, 3-line gate + binary blocklist.
4. **F-06** (`/api/sessions` POST/PATCH/DELETE + `[id]` GET) — session tampering, 4 handlers × 3 lines + per-operator scoping.
5. **F-04** (`/api/providers` POST) — lane rewrite, 3-line gate + provider allowlist.
6. **F-05** (`/api/models` POST) — smoke-test cost amplification, 3-line gate.
7. **F-07** (`/api/trace/recent` POST) — trace spoofing, 3-line gate + field allowlist.
8. **F-08** (`/api/sampler` GET) — code-smell, replace `eval('require')`.

After patches 1–7 ship, run:
```bash
npm run build
pm2 restart purpclaw-nextjs --update-env
node bin/purpclaw.js doctor
node bin/purpclaw.js bughunt
```
The bughunt baseline is `38 ok / 11 warn / 0 fail`; the warn count should not regress.

---

## Sign-off

🤖 **ROBOT** — Precision Engineer, ENG division.
Quality gate: **PASS with 7 remediation tickets open**.
The codebase is in good shape; the residual surface is small and well-bounded. Each fix is a 3-line patch + a smoke test.

*Report written 2026-07-02. Calibration verified by reading each cited file via the `read` tool at audit time. No file was modified by this audit — patches are recommendations, not commits.*
