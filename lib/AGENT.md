# `lib/` — AGENT.md

The runtime heart of PURPCLAW. 88 JS + a few `.ts` modules at the top level, plus 25 subfolders covering every backend capability: gateway, scheduler, training, vector, tools, runtime, omnis, etc.

If your task touches a backend service, a tool, an agent loop, or anything that ships as part of the runtime surface, you start here.

---

## How the file mixes

Naming convention at top: `<thing>-<role>.js` (e.g. `agent-loop.js`, `agent-session.js`, `deep-research-group.js`, `mochi.js`, `omni.js`).

By intent (partial map — not exhaustive):

| Bucket | Examples |
|---|---|
| Agent-loop & sessions | `agent-loop.js`, `agent-session.js`, `agent-personas.js`, `chat-agent.js`, `idle-engine.js`, `reasoning-loop.js`, `reasoning-tick.js` |
| Tool plane | `agent-tools-file.js`, `code-tools.js`, `screen-look.js`, `agent-tools-puppeteer` flagged `puppeteer.ts`, `mcp.js` |
| Provider / model lane | `llm-provider.js` (1263 lines, **do NOT edit casually**), `llm-status.js`, `provider_health.js`, `model-sentinel.js`, `nvidia/`, `providers/` |
| API kernel / cache | `api-harness-kernel.js`, `api-cache.ts`, `api-body-cap.ts`, `api-mega-list.js`, `delegation-status.js` |
| Cognition spine | `intelligence-spine.js`, `cognitive-client.js`, `context-bus.js`, `context-packet.js`, `memory-client.js`, `memory-consistency.js` |
| Orchestration | `orchestrator-hardening.js`, `chaos-campaign.js`, `deep-audit.js`, `deep-research-group.js`, `task-decomposer.js`, `odysseus-scorecard.js` |
| Runtimes / paths / safety | `paths.js`, `paths-runtime.js`, `secret-redactor.js`, `rate-limit.js`, `rate-limiter.js`, `release-sign.js`, `signed-manifest.js`, `snapshot.js` |
| Capability catalogues | `capability-registry.js`, `child-registry.js`, `feature-parity.js`, `session-store.js` |
| Identity / persona | `identity.js`, `personality.js`, `persona-forge.js`, `self-context.js`, `self-evolution-loop.js` |
| Boot / harden | `doctor.js`, `embeddings.js`, `accuracy-fish.js`, `ast-dependency-graph.js`, `governance.js`, `governance-audit.js`, `parseltongue.js`, `spaghetti-audit.js`, `gate-pipeline.js`, `smith-neo.js`, `sampler.js`, `autotune.js`, `space-governor.js`, `odysseus-scorecard.js`, `job-contract.js` |
| Mochi (the persona) | `mochi.js`, `mochi-state.js`, `mochi-sprites.js`, `mochi-statusbar.js` |
| Bridge / cross-cutting | `omnicode-bridge.js`, `skill-bridge.js`, `pocket-updater.js`, `pocket-vault.js`, `proactive-maintenance.js` |
| Subdirectories | `bios/`, `business/`, `commands/`, `demo/`, `evolution/`, `gateways/`, `goop-playground/`, `harness/`, `harvest/`, `imagegen/`, `mallory/`, `nvidia/`, `omni/`, `providers/`, `recursive/`, `runtime/`, `scheduler/`, `stt/`, `thringlets/`, `tools/`, `training/`, `tts/`, `vector/`, `vendor/`, `workers/`, `__tests__/` |

Subdirectory routing: each carries its own `AGENT.md` — see `lib/<dir>/AGENT.md`. Top files have no per-file `AGENT.md` (the runtime is one body, not a tile grid).

---

## Critical gotcha — `lib/llm-provider.js:1229`

This file ends with **`module.exports = { literal }`** at line 1229. That literal assignment wipes any earlier `module.exports.x = ...` you may have added.

**Rule:** every helper export must be declared as a top-level **`function name(...)`** declaration (or an arrow at module top-level) before the reset line, *and* included in the literal at line 1229. Otherwise it lives but is invisible from outside.

Concrete worked example if you want to add `myNewFn()`:
1. Declare `function myNewFn(...)` near the top of the file.
2. Add it to the `module.exports = { ... }` literal at line 1229.
3. Cmd-test: `node -e "console.log(Object.keys(require('./lib/llm-provider')))"` and confirm `myNewFn` shows up.

Do the same pattern check before declaring helper on every other `module.exports = {…}` style file. Search target: `grep -n "module.exports = {" lib/*.js | sort`.

(Source: `memory/project_purpclaw_llm_provider_export_pattern.md`.)

---

## The NVIDIA NIM key pool

`lib/llm-provider.js::nvidiaKeyPool()` reads:

```
LLM_API_KEY, NVIDIA_API_KEY, PURP1..PURP5, BACKUP1..BACKUP5, HERMES
```

Quotas/heuristics (do NOT change lightly):

- **Cooldown:** 60s after a 429.
- **Session-dead:** 3 × 401 ⇒ marked dead for the session.
- **Live introspection:** `require('./lib/llm-provider')._nvKeyState()` returns the per-key state map.

Currently pool size is 6 (waiting on `PURP4`/`PURP5`/`BACKUP*`).
Audit fed in 5 disconnects; 3 critical paths got live fixes. See `memory/project-purpclaw-routing-audit-2026-06-19.md`.

---

## Edit-then-restart boundary

Three files are PM2-cached — `node -c` only checks parse-clean:

- `lib/llm-provider.js`
- `agent_tower.js` (in root)
- `orchestrator.js` (in root)

After edits the PM2 service keeps the cached module from boot. State the **restart gate** at the end of every fix:

```
edit done. Restart required: pm2 restart purpclaw-cognitive   (user action — I do NOT bounce from this session)
```

Reason: the user runs multiple stacks. Bouncing one service from this notebook can torch an unrelated stack. They own restarts.

---

## Multi-session collision

PURPCLAW has 3 simultaneous sessions active — user + 2 OpenClaude — each with a different default model. When you make a routing-edit, you might collide with another session's edit. Rules:

1. `agent_routing_matrix.js` is the win-override.
2. Surface registry shadows (e.g. someone updated `model_registry.json` between your Read and your Edit) before editing.
3. Ask before recomputing the matrix.

---

## Things to NOT do here

- Do NOT kill, stop, or terminate any process. The user runs Python, Ollama, Node, etc., side-by-side.
- Do NOT blanket-edit env variables. They are layered (`.env`, `.env.prod`, PM2 env block, system env). Ask first.
- Do NOT write to `/tmp/`. Read-only.
- Do NOT bypass `lib/bios/`, `lib/runtime/ports.js`, or `lib/llm-provider.js` — they are the truth oracles for backplane ports and provider routing.

---

## Validation

- `node -c lib/llm-provider.js` — parse check (does NOT prove liveness).
- `node -e "require('./lib/llm-provider.js')"` — runtime load; surface missing exports.
- `pm2 ls | grep purpclaw` — running state.
- `grep -rn "module.exports = {" lib/*.js | wc -l` — count `"resetter"` files that need care.

---

Last updated 2026-06-19. Owner: **infra@gateway**.
