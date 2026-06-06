# PURPCLAW — Feature Roadmap
> Last updated: 2026-06-06

> Generated 2026-06-05 from a live disk audit of the runtime.
> Companion to [PARITY_TARGET.md](./PARITY_TARGET.md). Source of truth for parity
> scoring is `lib/feature-parity.js` (`purpclaw parity --json`).
>
> **Note:** `_scratch/gap-report.txt` is STALE — it predates the scheduler,
> image-gen, TTS, and chat-gateway work. Re-run `purpclaw parity` to regenerate.

This roadmap maps the six marketed feature groups to verified on-disk state and
specs only the pieces that are genuinely missing.

---

## Status at a glance (verified by file existence, 2026-06-05)

| Feature group | State | What's missing |
|---|---|---|
| 1. Lives Where You Do | 🟡 partial | WhatsApp + Signal gateways |
| 2. Grows the Longer It Runs | 🟢 done | — (memory, pool, 139 skills, evolve, scoring) |
| 3. Scheduled Automations | 🟢 built | wiring/governance audit only (nl-cron, runner, calendar, cron-jobs.json all exist) |
| 4. Delegates & Parallelizes | 🟢 done | — (tower, workers, context packets, harness, ssh) |
| 5. Real Sandboxing | 🟡 partial | Docker, Modal, Singularity, Daytona worker backends |
| 6. Full Web & Browser Control | 🟢 built | service-uptime hardening only (imagegen + tts gateways exist) |
| 7. Research & Training | 🟡 partial | trajectory export, compression, RL integration |

**Already built (do NOT rebuild):** `lib/scheduler/{nl-cron,runner,calendar}.js`,
`agent_work/cron-jobs.json`, `lib/imagegen/gateway.js`, `lib/tts/gateway.js`,
`lib/intelligence-spine.js`, `lib/gateways/{telegram,discord,slack,email}.js`,
`lib/workers/{http,ssh}-worker.js`.

---

## Priority 1 — WhatsApp + Signal gateways (fast, high visible value)

The gateway pattern is fully proven: 4 adapters live, documented in
[lib/gateways/README.md](../lib/gateways/README.md). Each adapter is one standalone
Node service that long-polls its platform, POSTs to `http://127.0.0.1:7780/api/chat`,
and ships the reply back. Missing-token → `mode: not_configured` no-op (so it can be
registered before credentials exist). No webhook/public surface needed.

### Spec
1. `lib/gateways/whatsapp.js` — copy `telegram.js`; swap transport for
   [`whatsapp-web.js`](https://github.com/pedroslopez/whatsapp-web.js) (QR-pair,
   `client.on('message')` → `/api/chat` → `client.sendMessage`). Token/env:
   `WHATSAPP_SESSION_PATH`. Port `7796`.
2. `lib/gateways/signal.js` — copy `telegram.js`; transport = `signal-cli` in
   JSON-RPC/daemon mode (`signal-cli -a +NUM jsonRpc`). Env: `SIGNAL_NUMBER`,
   `SIGNAL_CLI_PATH`. Port `7798` (avoid 7799 thringlets).
3. For each: add `/health` (`mode: not_configured` when env absent), wrap output via
   `lib/secret-redactor.js`, add an `ecosystem.config.js` entry **off by default**,
   register in `service_registry.js`, and flip the two `type: 'missing'` checks in
   `lib/feature-parity.js` (lines 33–34) to `type: 'file'`.
4. Wake with `purpclaw safe-start <pm2-name>` (never bulk `pm2 start` — see CLAUDE.md
   cascade rule).

**Effort:** ~half a day each, mostly transport glue. **Risk:** low (isolated services).

---

## Priority 2 — Sandbox execution backends (the real product gap)

Worker backends implement a tiny uniform interface (see
[lib/workers/ssh-worker.js](../lib/workers/ssh-worker.js)):

```js
module.exports = {
  async checkHealth(worker) -> { online, active?, capacity?, reason? },
  async dispatch(worker, agentName, task, options) -> { success, jobId, workerName, response } | { success:false, error }
};
```

A worker record is a plain object the pool already understands. Implement each as a
new file under `lib/workers/`, register the type in the worker pool, and add a
`feature-parity.js` check.

### 2a. `lib/workers/docker-worker.js` (do first)
- `checkHealth`: `docker info` reachable + image present.
- `dispatch`: `docker run --rm` a hardened container that runs the task and POSTs to
  the in-container tower (or runs the harness directly).
- **Hardening (required by PARITY_TARGET §5):** `--read-only`, `--cap-drop=ALL`,
  `--security-opt=no-new-privileges`, `--pids-limit`, `--memory`/`--cpus`, bounded
  `-v` mounts only, `--network=none` unless the task needs egress.
- Worker record: `{ type:'docker', image, mounts[], network, limits{} }`.

### 2b. `lib/workers/modal-worker.js`
- `dispatch`: invoke a Modal function (`modal run` or the Modal REST/Python SDK via
  a thin Python RPC script) that runs the task; poll for result.
- Env: `MODAL_TOKEN_ID`, `MODAL_TOKEN_SECRET`. Record: `{ type:'modal', app, function, timeout }`.

### 2c. `lib/workers/singularity-worker.js`
- HPC/container lane: `singularity exec <image.sif>` with `--containall`,
  bound mounts, no home. Record: `{ type:'singularity', sif, binds[] }`.

### 2d. `lib/workers/daytona-worker.js`
- Remote-workspace lane via Daytona API: create/get workspace, run task, collect.
  Record: `{ type:'daytona', apiUrl, apiKey, target }`.

For all four: update `feature-parity.js` (lines 82–85) from `type:'missing'` to
`type:'file'`, and surface backend type + health in the worker-pool status.

**Effort:** Docker ~1 day, others ~0.5–1 day each. **Risk:** medium — these run
untrusted code, so the hardening flags are not optional. Land Docker first, gate the
others behind it.

---

## Priority 3 — Research & training pipeline tail

Build on `lib/deep-research-group.js` + `scripts/run-harness-benchmark.js`.

1. **Trajectory export** — `lib/research/trajectory-export.js`: serialize harness/
   research runs to ShareGPT (`{conversations:[{from,value}]}`) and JSONL. Add
   `purpclaw research export <runId>`.
2. **Trajectory compression** — `lib/research/trajectory-compress.js`: dedup +
   checkpoint contract so long runs are resumable (provenance + step hash).
3. **RL integration** — `lib/research/rl-export.js`: adapter to Atropos (or
   equivalent) consuming the exported trajectories. Spec the contract first; defer
   the live integration until export + compression are stable.

**Effort:** export ~1 day, compression ~1 day, RL spec ~0.5 day + integration TBD.

---

## Priority 4 — Audits on "built but unverified" groups

These have files but were last marked partial because services were dark or unwired:

- **Scheduler (group 3):** confirm `lib/scheduler/runner.js` actually loads
  `agent_work/cron-jobs.json`, that NL parse → job persists, and that risky jobs
  hit the governance/approval gate (PARITY_TARGET §3 rule). Add a smoke check to
  `purpclaw smoke`.
- **Image-gen / TTS (group 6):** verify `lib/imagegen/gateway.js` and
  `lib/tts/gateway.js` register as capabilities and route through governance; bring
  their PM2 services up via `safe-start --dark` and add health to `purpclaw doctor`.

---

## Sequencing

```
P1 WhatsApp + Signal      ──┐ (independent, ship anytime)
P2 Docker → Modal/Sing/Day ─┼─► biggest parity lift; Docker gates the rest
P3 export → compress → RL  ──┘ (linear)
P4 audits                   ── fold into each PR as you touch the group
```

After each item: flip its `feature-parity.js` check, run `purpclaw parity --json`,
and commit. Target: `purpclaw parity` reports zero `missing` groups.
