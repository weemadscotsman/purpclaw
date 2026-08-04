# PURPCLAW Monster Launch Ledger

> **The control document that stops PURPCLAW from double-building itself.**
>
> Built on top of `docs/HIVEMIND_SIDE_FOLDER_AUDIT.md` and `docs/SPRING_DOCTRINE_RUNTIME.md`.
> Author: hackathon prep session, 2026-06-28.
> Status: **CONTROL DOCUMENT — READ BEFORE TOUCHING RUNTIME**

---

## The Realization

PURPCLAW is not missing features. PURPCLAW is missing **accounting**.

| Inventory item | Count |
|---|---|
| Top-level folders | **55** |
| Skill files | **1,538** |
| Registry surfaces | **5+** (drift problem) |
| Companion species | **18** (real, in `companion-chorus/`) |
| Core AI systems | **7** (built, mostly wired) |
| Side apps | **Podcast Studio, DreamTask, Companion Chorus, Hivemind, Pocket** |
| Doctrine docs | **3+** (Spring, Hivemind integration, side-folder audit) |

The pile already has organs, teeth, and a duck. The launch problem is **labeling, surfacing, and proof** — not invention.

---

## The Six Launch Labels

Every system in this repo must carry exactly one of these labels. No system is unlabeled. No system gets a label it hasn't earned.

| Label | Meaning | Action |
|---|---|---|
| 🟢 **LIVE LAUNCH FEATURE** | Built, wired, proven. Ships day one. | Surface in CLI/TUI/Web/Dashboard. Tag with Spring trust score. |
| 🟡 **BUILT BUT NEEDS SURFACED** | Code exists, no operator path yet. | Add surface (action dispatcher, route, capability entry). No rebuild. |
| 🟠 **SIDE SYSTEM NEEDS WRAPPER** | Self-contained subproject. Not unified. | Wrap via existing dispatcher. Do **not** fork. |
| 🔵 **EVIDENCE / DOCS ONLY** | Audit material, plans, roadmaps. | Index for provenance. Never auto-execute. |
| ⚫ **ARCHIVE / QUARANTINE** | Legacy, donors, stale snapshots. | Exclude from source scans by default. Explicit search only. |
| 🟣 **POST-LAUNCH** | Real, valuable, but not launch blocker. | Document the path. Defer. |

---

## The Full Classification

### 🟢 Live Launch Features (build on these, do not rebuild)

| System | Status | Surface needed | Hivemind/Spring | Launch blocker? |
|---|---|---|---|---|
| **Cognitive Spine** (`cognitive_spine.py`, port 7880) | Built, wired | `/api/spine/*` + Web status panel | Yes (memory atoms traced) | No |
| **Memory Matrix v2** (`memory_matrix_v2.py`, FAISS) | Built | `/api/memory/*` + Web/TUI search | Yes (every atom trace-tagged) | No |
| **Neuro-Symbolic Bridge** (`lib/hivemind/`, `modal_logic_engine.py`) | Built | `/api/hivemind/principles` | Yes | No |
| **Symbolic Rules Engine** (Datalog in `lib/`) | Built | `/api/rules/*` | Yes | No |
| **Modal Logic Engine** (`modal_logic_engine.py`) | Built | `/api/modal/*` | Yes | No |
| **Self-Diagnostics** (`autonomous_diagnostics.py`) | Built | `/api/diagnostics/*` + TUI health | Yes | No |
| **AutoDream** (`autoDream.py`, every 30 min) | Built, scheduled | Web panel + `/api/autodream/status` | Yes (consolidates Spring-verified traces) | No |
| **Hivemind Middleware** (`lib/hivemind/hivemind-middleware.js`) | Built | CLI + Web + TUI | Yes — this IS Spring | **YES — primary blocker** |
| **Spring Doctrine** (`docs/SPRING_DOCTRINE_RUNTIME.md`, CLI live) | Built, 105 LOC doc + active CLI | CLI + Web doctrine panel | Yes — this IS the trust layer | **YES — primary blocker** |
| **Skill Loader** (pre-run injection) | In progress | CLI `hivemind load "<query>"` | Yes | **YES — primary blocker** |
| **AntiSkills** (counterfactual patterns) | In progress | CLI + TUI panel | Yes | **YES — primary blocker** |
| **CLI** (bin/purpclaw.js) | Built | Already works | n/a | No |
| **TUI** (purpconsole/) | Built | Terminal-native | Yes (if instrumented) | No |

### 🟡 Built But Needs Surfaced

| System | Status | Path to surface |
|---|---|---|
| **Companion Chorus** (`companion-chorus/`, SPEC.md 2026-03-31) | Real subproject: bridge + main + 18 species + gacha + sprites + voice | Add `companion-chorus` capability entry → action dispatcher → TUI overlay |
| **Podcast Studio** (`podcast_studio/`, episode_manager + runner + TTS + Telegram) | Real subproject, 8+ files, episodes dir | Add `podcast-studio` capability: `start`/`status`/`stop`/`episodes`/`test-tts` |
| **Pipeline Registry** (`lib/pipeline-registry.js`) | Built, traces jobs | Expose in Web status panel + tag Hivemind traces with pipeline_job_id |
| **Service Registry** (`service_registry.js` + `ecosystem.config.js`) | Built, drift from `lib/capability-registry.js` | Add registry audit command (see Batch 1 below) |
| **Pocket** (`pocket/` audio/wav/python) | Built assets | Audit against `lib/commands/pocket.js`, keep boundary clean |

### 🟠 Side Systems Needs Wrapper (do not rebuild, do not fork)

| System | Wrapper needed |
|---|---|
| **DreamTask** (`DreamTask/DreamTask.ts`) | Stubbed ECC adapters — decide: port to task registry OR mark archive. Don't pretend integrated. |
| **Swarm Mission** (`swarm_mission/`) | Solo creator automation. Classify as skill/workflow. Feed skills/pool, not PM2. |
| **Mochi** (`mochi/`) | Static avatar/media. Treat as media provider unless app imports it. |
| **Hivemind CLI** (`hivemind_cli.js`, `lib/commands/hivemind.js`) | Already wrapped — surface in TUI panel, expose in Web. |
| **Pocket Guide** (`pocket/guide/`) | Onboarding playbooks — wrap as docs-only capability, not runtime. |

### 🔵 Evidence / Docs Only (NEVER auto-execute)

| System | Why |
|---|---|
| **STRESS/** (50+ audit reports, AUDIT-*, DEEP-AUDIT, CYCLE-*) | Audit evidence, not runnable tests. Index by type (doctrine / audit / hardening / roadmap / stale). |
| **TASKS/** (human plans, samantha_*guides, BALL_BROWSER_GUIDE, SETUP_GUIDE) | Human planning docs. Naming collision risk with `cognitive_tasks.json` — keep separate. |
| **agent_work/** | Runtime artefact/evidence store. Hivemind reads recent traces; never promote as source. |
| **STRESS/stress.cjs** | Looks runnable, hardcoded `E:/god folder/02_ACTIVE_PROJECTS/STRESS` path. Wrap as optional verification only after path cleanup. |
| **prompts/** | Old sequential prompt plan. Archive or mark reference, don't feed by default. |
| **refusal_ablation_probe/** | Safety experiment. Run only under explicit eval task. |
| **ablation_probes/** | Same. Quarantine. |
| **research/** | Static AI frameworks research. Pool/RAG indexing with provenance, no execution. |
| **_api-mega-list/**, **apis for agents/** | Reference datasets. Add research/reference capability only. Don't register as tools. |
| **eval/** | Python eval scripts. Add as eval capability later. Successful output → Spring evidence. |
| **scripts/** | Mostly utilities. TUI/smoke are current. Don't auto-execute all. |
| **STRESS/AUDIO-STACK.md**, **STRESS/LOCAL-LLM-SETUP.md** | Setup docs. Index. |
| **docs/** (the rest) | Many are real, some legacy. Index by `mtime` + sha, surface active only. |

### ⚫ Archive / Quarantine (exclude from source scans by default)

| System | Action |
|---|---|
| **archive/** | Legacy UI snapshots. Exclude from Hivemind promotion. |
| **archive/legacy-ui** | Old Next.js shell. UI freeze — no resurrection. |
| **`PURPCLAW/` (nested copy)** | `cognitive_spine.py`, `memory_matrix*.py`, `modal_logic_engine.py` here are STALE COPIES. Use root versions. **Risk: very high** if agents edit stale. |
| **`__pycache__/`, `build/`, `node_modules/`, `_scratch/`, `-p/`** | Build/cache. Already `.gitignore`-friendly. |
| **`PURPCLAWmemory realted/`** | Quarantine reference. Compare missing ideas manually, never integrate. |
| **`.donors/`, `.archive/`** | Donor apps. Only source ideas with explicit human ask. |
| **`vendor/`** | 8,000+ dependency dump. Do not integrate. |
| **`trip_logs/`, `Samantha's Daily Log/`** | Logs. Treat as evidence, not source. |
| **`data/`** (random payloads) | Audit before promoting. |

### 🟣 Post-Launch (real, valuable, defer)

| System | Why post-launch |
|---|---|

| **iMessage Gateway** | Hermes already has one — match in v0.2 |
| **Telegram Integration** | Chat-ops + remote control |
| **Discord Bot** | Community ops |
| **Agent Harnesses (Claude/Codex/Hermes under PURPCLAW)** | The monster flex — orchestrate other agents |
| **SWE-bench Pro runner** | Receipt layer — needs verified runs first |
| **Head-to-head comparison harness** | Compare PURPCLAW vs Hermes vs Claude |
| **Public results dashboard** | Marketing + proof |
| **Desktop app launcher** | Native shell. Decision needed: Electron / Tauri / Compose Desktop |
| **Fire TV / mobile consumer front-end** | Beyond launch scope |

---

## Registry Drift — The #1 Risk

**Five registry surfaces currently claim authority over "what tools/skills/services exist":**

| Registry | Type | Source |
|---|---|---|
| `service_registry.js` | Runtime services (PM2-managed) | Manual list, used by status/safe-start |
| `lib/capability-registry.js` | Capability catalog (services, ports, idle timeouts) | Standby runtime registry |
| `registry/index.json` | Static skill metadata (ECC/community dump) | Snapshot from upstream |
| `skills/skills_registry.json` | Skill inventory | Generated from `skills/` scan |
| `skills/registry.txt` | Plain-text skill index | Legacy |
| `model_registry.json` (and `PURPCLAW/model_registry.json` — **stale copy**) | Model/provider config | Two copies drift |

**Reconciliation policy (Batch 1):**

1. `service_registry.js` = runtime service truth (PM2, ports, health).
2. `lib/capability-registry.js` = standby capability catalog. Compare to (1), deprecate duplicates.
3. `registry/index.json` = skill metadata source only. Not runtime truth.
4. `skills/skills_registry.json` = generated from `skills/` on `purpclaw tools refresh`. Canonical skill index.
5. `/api/registry` (Next.js route) = reads providers + tools only. Label it "runtime tool/provider registry," not "the registry."

Add command: `purpclaw registry audit` — diffs all 5 + reports drift + writes a stability score.

---

## Steering Duplication

Both `steering/` (root) and `.kiro/steering/` exist with the same file names (`coding-style.md`, `development-workflow.md`, etc.).

**Policy:**

- `.kiro/steering/` = canonical. Kiro/Codex trust state requires this anyway.
- `steering/` = compatibility mirror, kept in sync via `steering/AGENT.md` pointer.
- `contexts/` (dev/research/review) = same loader, map to task modes.
- Loader: `lib/context/steering-loader.js` (Batch 2) — bounded length, checksum, no execution.

---

## Skill Files (1,538 of them)

These are an asset, not a liability. Required infrastructure:

| Need | Path |
|---|---|
| Skill metadata source | `registry/index.json` (read-only snapshot) |
| Skill runtime scanner | `lib/tools/skills-registry.js` (real, in use) |
| Skill provenance (Hivemind trace) | `lib/hivemind/trace-recorder.js` — add `skill_name`, `skill_file`, `degraded`, `args_hash`, `output_summary` |
| Skill trust score | Spring Validator scores based on repeated verified success |
| Skill search surface | `purpclaw skills search "<query>"` + TUI panel |
| Skill registry audit | `purpclaw skills audit` — flags metadata vs runtime mismatch |

**Rule:** Skill files are never promoted to doctrine without Spring + repeated evidence. Failures become AntiSkills. Repeated verifications become candidate doctrine.

---

## The Cognitive Loop (the launch core)

```text
task runs
  → trace recorded (lib/hivemind/trace-recorder.js)
    → evidence collected (success/failure markers, output hashes)
      → Spring Validator scores (lib/commands/hivemind.js + spring-index.json)
        → repeated success → skill candidate (skills/skills_registry.json)
          → repeated failure → AntiSkill candidate (lib/hivemind/anti-skills/)
            → strong repeated rule → doctrine (docs/SPRING_DOCTRINE_RUNTIME.md)
              → AutoDream consolidates (autoDream.py, every 30 min)
                → future agents load skill + AntiSkill before work (Skill Loader)
                  → loop closes
```

**Every other system** (Web, TUI, CLI, Desktop, integrations, harnesses) **sits on top of this loop**. If this loop is not provably closed end-to-end with verified traces, launch fails.

---

## Launch Checklist

### Must be done before launch

- [ ] Hivemind working end-to-end (task → trace → score → skill → doctrine → reload)
- [ ] Spring Validator scoring every trace (no trace without Spring verdict)
- [ ] Skill Loader active before every run (injects skill + AntiSkill context)
- [ ] AntiSkills loaded before every run (prevents known-failed patterns)
- [ ] AutoDream promoting/consolidating verified traces on schedule
- [ ] CLI/TUI/Web surfaces show the same abilities (no UI drift)
- [ ] Web Dashboard usable (status, traces, doctrine, registry audit)
- [ ] Desktop/app launcher path decided (Electron / Tauri / Compose Desktop)
- [ ] Duck/Companion layer visible in TUI (one companion at minimum)
- [ ] Metrics/logging/telemetry visible (Prometheus + Grafana already wired)
- [ ] PM2 deployment stable (`ecosystem.config.js`)
- [ ] Security: rate-limit, socket hardening, API body cap

### Should be ready or clearly staged

- [ ] iMessage gateway (match Hermes)
- [ ] Telegram integration
- [ ] Discord bot
- [ ] Claude/Codex/Hermes agent harnesses
- [ ] SWE-bench Pro runner
- [ ] Head-to-head comparison harness
- [ ] Public results dashboard
- [ ] Registry audit command (`purpclaw registry audit`)

---

## What This Ledger Is NOT

- Not a roadmap. The 7 batches in `docs/HIVEMIND_SIDE_FOLDER_AUDIT.md` are the roadmap.
- Not a code patch. No runtime changes from this document.
- Not exhaustive. New systems added = new row with launch label.

## What This Ledger IS

- A taxonomy every PURPCLAW system must carry.
- The control document that prevents Codex/Codex-like agents from creating duplicate registries, fork-cloning podcast studios, or resurrecting archive UI.
- The first thing to read before any PURPCLAW PR.
- The proof layer's anchor — every launch claim must trace back to a row here with status verified by the corresponding run.

---

## Anti-Patterns This Ledger Prevents

| Anti-pattern | Prevention |
|---|---|
| "I found a podcast studio, so I built another one" | `podcast_studio/` is 🟠 WRAPPER, not 🟢 BUILD |
| "Let me merge `PURPCLAW/cognitive_spine.py` into `cognitive_spine.py`" | That nested copy is ⚫ QUARANTINE — root is canonical |
| "TASKS/ looks like a task queue, let me poll it" | TASKS/ is 🔵 DOCS — runtime queue is `agent_work/worker-tasks.json` |
| "STRESS/ has scripts, let me run them" | STRESS/ is 🔵 EVIDENCE — only `stress.cjs` is runnable, and only after path cleanup |
| "Let me add the 6th registry for skills" | Registry policy: one truth per concern (Batch 1) |
| "Let me restore `archive/legacy-ui` for the demo" | UI freeze — no resurrection |
| "The duck doesn't do anything, let me delete it" | Duck is 🟢 LIVE — operator experience is launch-grade |

---

## One-Sentence Version

**PURPCLAW launches as a cognitive agent operating system with verified-experience learning, multi-surface control, companion personality, and proof — but only after every system carries exactly one of these six labels, the registry drift is reconciled, the cognitive loop is closed, and the audit decides what ships.**

The pile is no longer "too big."

It is **launch-scope big**. Which is harder, but also the only thing that makes this a product.

🦆

---

## Batches 2 & 3 — Receipts (2026-06-29)

### Batch 2 — AntiSkill Loader Fix (2026-06-29)

**Status:** ✅ GREEN

Fixed the AntiSkill loader threshold bug: AntiSkills were created but not retrievable for avoidance. Kind-aware threshold (0.05 → 0.02 for antiskill) + `failure_count` log boost (1 fail = 1.0x, 4 fails = 1.5x, 16 = 2.0x).

**Receipt:** `loop_closes: true` + `avoidance_loop_closes: true` + AntiSkill pattern hits 3/3 + per-trace 15/15 (100%).

### Batch 3 — Rank-1 Doctrine Proof + CI Gate (2026-06-29)

**Status:** ✅ GREEN

Added `lib/hivemind-test-rank1.js` (verified-execution provenance test) and `scripts/verify-hivemind.js` (CI gate). Wired into `package.json` as `npm run verify:hivemind` and `npm run verify:hivemind:rank1`.

**Receipt:** `npm run verify:hivemind:rank1` exits 0 with 11/11 checks passing. Rank-1 cluster promotes 1 doctrine. Rank-2 weak-evidence cluster correctly stays gated. Loader bugs found and fixed: `clamp()` NaN, `max_loadable_spring_rank` vs `max_promotable_spring_rank` field mismatch.

### P0 Self-Improvement Loop — LAUNCH-GREEN

| Path | Status | Receipt |
|---|---|---|
| Success learning | ✅ GREEN | 3/3 skills, all loader-retrievable |
| Failure avoidance | ✅ GREEN | 3/3 patterns, 15/15 per-trace |
| Doctrine gate (weak evidence blocked) | ✅ GREEN | weak_gated: true |
| Doctrine promotion (verified evidence) | ✅ GREEN | 1 new doctrine from rank-1 cluster |
| CI regression tripwire | ✅ GREEN | 11/11 exit 0 |

The P0 cognitive loop is fully proven with exit-0 receipts.

### Up Next — Batch 4

**Batch 4: Registry truth reconciliation** — the registry audit ran successfully (see `docs/REGISTRY_RECONCILIATION.md` Audit Run #1, verdict `CRITICAL_DRIFT`). Human approval required for the 6 recommendations before any quarantine / move / delete is performed.
