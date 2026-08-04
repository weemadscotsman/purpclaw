# PURPCLAW11 Side-Folder Walk - Audit Only

Date: 2026-06-29

Source: `/mnt/data/PURPCLAW11.zip`, inspected via extracted tree `/mnt/data/purpclaw11_full_orig`.

This is not a runtime patch plan to apply all at once. It is the accounting map for side systems that still need classification before any further Hivemind, Spring, registry, task, stress, or studio integration work.

Hard rule for this pass: do not modify JS, TS, Python, service startup, UI shells, or runtime routes from this document alone. Use it to plan one future batch at a time.

## Update 2026-06-29: Skills Consolidated (corrects earlier counts)

The original audit said `skills/` held "1,500+ skill files." That was a **raw file count, not a skill count** — one skill is a folder of many files (`.md`, `.py`, `.xsd`, `.tex` assets). The true figure was **~380 skills**, and ~29 were either duplicated in subfolders or stranded outside `skills/`.

Action taken (one consolidation pass):

- **Canonical location is `skills/` (one place).** The runtime scanner `lib/tools/skills-registry.js` reads it.
- **Duplicate sets removed** → `.trash/skills-dupes-2026-06-29/`: `skills/migration-pack-batch1/` (12 stub copies of existing top-level skills), and the identical category-dupe sets `inference/`, `models/`, `evaluation/`, `research/`. Real fuller versions already existed at top level.
- **Merged into `skills/`**: 7 unique skills from `.kiro/skills/`, 1 from `swarm_mission/`, 2 promoted from `_legacy/`. Source copies retired to trash so there is exactly one home.
- **Scanner now recurses** (was top-level only, which silently hid any sub-foldered skill). Name-collision-safe (first wins).
- **Description extraction fixed** to parse quoted, plain, and `>`/`|` block-scalar YAML frontmatter — blank runtime descriptions dropped from 264 to 45.
- **`skills/SKILLS_INDEX.md`** generated from the live scanner: **379 active skills** (97 executable, 282 prompt-only).

Correction to the registry findings below: `skills/skills_registry.json` and `skills/registry.txt` are **NOT** skill indexes — they list 28 animal **agent codenames** with `approved` status (an agent-approval ledger, e.g. `robot`, `dragon`, `ghost`, `duck`). There is **one** real skill surface (the `SKILL.md` dirs scanned by `lib/tools/skills-registry.js`), not three.

## High-Level Inventory

The ZIP contains roughly sixty meaningful top-level folders. The heavy or noisy zones are:

| Zone | Classification | Audit decision |
|---|---|---|
| `vendor/` | archive / third-party dump | Do not integrate. |
| `agent_work/` | evidence / archive | Treat as run artifacts, traces, logs, proofs, screenshots, and old mission folders. Not source. |
| `docs/` | context / archive | Mixed canonical docs, legacy docs, translations, and specs. |
| `skills/` | skill/tool provider | Real provider surface with large skill inventory. |
| `app/` | runtime / web API / UI | Existing Next.js UI and API surface. Do not create another UI shell. |
| `lib/` | runtime | Main runtime module surface. |
| `STRESS/` | evidence | Mostly audit reports, service maps, doctrine docs, hardening notes, and roadmaps. |
| `TASKS/` | task docs / context | Human task plans and roadmaps, not the runtime task queue. |
| `steering/`, `.kiro/` | context / policy | Read-only steering and hooks/policy material. |
| `podcast_studio/` | studio/media runtime | Real side app that needs a later controlled surface. |
| `DreamTask/` | task adapter candidate / unported | Contains stubbed missing adapters. Do not treat as fully integrated. |
| `registry/` | registry metadata | Static registry, not the same thing as live service or tool truth. |

## Classification Key

| Class | Meaning |
|---|---|
| runtime | Active service, daemon, executable module, process path, or app route |
| context | Read-only guidance/context input |
| registry | Source map, service map, capability map, skill metadata, or provider map |
| evidence | Audit, stress, verification, proof, trace, or eval material |
| studio/media | Media workflow or studio subsystem |
| task system | Task planning, task docs, task runtime, queue, scheduler, or adapter |
| skill/tool provider | Skill, tool, function-call, provider, or plugin surface |
| archive | Historical/reference material; not active by default |
| dead/duplicate | Duplicate, stale, unported, or likely deprecated |
| unknown | Needs deeper inspection before use |

## Findings By Folder/System

| Path/system | Class | What it is | Current integration state in ZIP | Risk if ignored | Later work |
|---|---|---|---|---|---|
| `steering/` | context / duplicate | Agent steering markdown overlay; includes nested duplicate `steering/steering/*`. | Passive docs. Referenced by install/root index, not runtime-loaded by Hivemind in ZIP. | Steering drift between Codex/Kiro and PURPCLAW runtime. | Read-only loader after canonical source decision. Never execute. |
| `.kiro/steering/` | context | Kiro-style steering source, similar to `steering/`. | Passive unless project-local config is trusted and loaded. | Local steering may be ignored due project trust state. | Recommended canonical source. Feed selected bounded files into Hivemind context as human docs. |
| `.kiro/hooks/` | context / policy | Kiro hook policies for formatting, quality gates, pattern extraction, and typecheck reminders. | Passive under Codex until project trusted. | Hooks silently do not fire, so behavior differs from repo doctrine. | Audit duplicates against `hooks/`; document external policy. Do not execute from Hivemind. |
| `hooks/*.kiro.hook` | context / policy | Duplicate hook policy files. | Passive policy material. | Duplicate hook truth. | Classify safe/read-only vs write hooks in a later steering batch. |
| `contexts/` | context | Mode docs: dev, research, review. | Passive docs. | Mode context not uniformly loaded. | Include in future read-only context loader, mapped by task mode. |
| `rules/` | context / registry | Language and common rule packs. | Passive markdown; separate from symbolic runtime rules. | Rules exist but are not enforced or provenance-ranked. | Human-authored Spring runoff. Do not auto-promote to hard doctrine. |
| `STRESS/` | evidence | Audit reports, service maps, doctrine docs, hardening notes. | Referenced by feature/docs; mostly not executable tests. | Evidence may be mistaken for runnable test suite or ignored entirely. | Build evidence-source index. Classify docs as doctrine, audit evidence, roadmap, hardening, or stale. |
| `stress.cjs` | runtime / evidence candidate | Playwright/UI stress script writing to external `E:/god folder/02_ACTIVE_PROJECTS/STRESS`. | Orphan/hardcoded; not wired into package scripts. | Useful UI stress path is not a gate and may write to the wrong place. | Wrap as optional stress capability only after path cleanup. Output becomes trace evidence, not a skill. |
| `TASKS/` | task system / context | Human task plans, guides, architecture docs, Samantha roadmaps. | Passive docs; not tied to worker/kernel runtime. | Humans may think TASKS are executable while runtime never sees them. | Index as static task library/templates only. Do not auto-execute. |
| `cognitive_tasks.json` | runtime / task system | Actual cognitive task queue file. | Used by `voice_coordinator.js` and `swarm_scheduler.js`. | Naming collision with `TASKS/`. | Keep separate: `TASKS/` is docs; `cognitive_tasks.json` is runtime scheduler state. |
| `worker_service.js` / `agent_work/worker-tasks.json` | runtime / task system | Worker queue and execution path. | Real runtime task queue. | Worker execution may be missed if only orchestrator/tower are wrapped. | Future worker start/finish Hivemind spans. |
| `DreamTask/DreamTask.ts` | task system / dead-unported | UI-visible task adapter for AutoDream with stubbed ECC adapters. | Isolated TS file, not clearly imported. | UI/task state may be fake or invisible. | Decide: port into task registry/UI state, or mark archive. |
| `autoDream.py` | runtime / task system | Real memory consolidation runtime. | Core cognitive layer. | AutoDream can work while DreamTask UI lies. | Pair with DreamTask only in focused batch. Runtime emits traces; UI displays/controls. |
| `registry/index.json` | registry | Static skills registry from ECC/community material. | Static registry only; separate from `/api/registry`. | Registry truth drift. | Treat as static skill metadata, not service truth. |
| `skills/skills_registry.json` | registry / skill provider | Skill inventory metadata. | Separate from `registry/index.json` and runtime scanner. | Multiple skill indexes can disagree. | Define one skill registry policy. |
| `skills/registry.txt` | registry / skill provider | Text skill inventory. | Separate static inventory. | Metadata drift. | Compare with JSON registry and runtime scanner. |
| `lib/tools/skills-registry.js` | runtime / skill provider | Real runtime scanner/registerer for skills as tools. | Runtime provider with degradation handling. | Hivemind may miss skill provenance. | Add span metadata later: skill name, source file, degraded flag, args hash, output summary. |
| `lib/capability-registry.js` | registry | Standby runtime capability registry: services, ports, dependencies, idle timeouts. | Real but separate from service registry and surface catalog. | Duplicate service truth. | Reconcile boundaries with `service_registry.js` and user-facing catalog. |
| `service_registry.js` | registry / runtime | Current service list used by status/safe-start. | Real runtime service registry. | Drift from capability registry and ecosystem config. | Keep as service truth unless future refactor says otherwise. |
| `app/api/registry/route.ts` | registry / web API | Live API registry for providers and tools. | Real route, but not static registry, tasks, Hivemind, or podcast. | UI says registry but only sees part of stack. | Label as runtime tool/provider registry. Add sections only after registry policy. |
| `lib/pipeline-registry.js` | runtime / registry / evidence | Unified job/pipeline evidence ledger. | Used by orchestrator/agent tower/gatekeeper. | Hivemind trace and proof ledger can diverge. | Bridge, do not replace: share pipeline job id and Spring verdict. |
| `task_decomposer.js` | runtime / task system | Swarm decomposition module used by coordinator. | Real runtime. | Decomposition decisions may not be traceable. | Future trace event for domains, agents, locks, dependency order. Security review regex risk separately. |
| `swarm_mission/` | skill/workflow docs | Small submodule around solo creator automation. | Mostly static README/SKILL. | Could be mistaken for runtime swarm coordinator. | Feed into skills/pool as docs, not PM2 runtime. |
| `podcast_studio/` | studio/media runtime | Self-contained multi-agent podcast workflow. | Internal imports and launch command, no unified surface in ZIP. | Working side app stays invisible or gets rebuilt as duplicate UI. | Add controlled `podcast-studio` capability later. No new UI shell. |
| `podcast_studio/shared_log.json` | studio/media state | Runtime turn log. | Local state file. | Hivemind could ingest raw chatter/secrets. | Store summaries and episode metadata only. |
| `companion-chorus/` | studio/media / unknown | Side package with own package and node_modules. | Separate package boundary. | Could duplicate companion/swarm runtime. | Audit separately. Expose as capability only if active. |
| `mochi/` | studio/media / static | Avatar/media/static assets and JS. | Submodule/static. | Could duplicate app mascot surface. | Treat as media/static provider unless imported by app. No new UI. |
| `pocket/` | runtime / media / unknown | Audio, wav, python, and script assets. | Likely pocket/voice side material. | Confusion with `lib/commands/pocket.js`. | Audit against pocket command and keep asset/runtime boundary explicit. |
| `PURPCLAWmemory realted/` | archive | Old memory-related copied files. | Archive/copy material. | High risk of editing stale cognitive copies. | Quarantine/reference only. |
| `.archive/`, `archive/`, `.donors/` | archive | Donor/legacy/reference apps and snapshots. | Non-runtime. | Agents may patch donor code as product. | Exclude from default scans and Hivemind promotion. |
| `agent_work/` | evidence / archive | Live and past output directory. | Runtime artifacts. | If scanned as source, it pollutes registries and Hivemind. | Evidence/output only. Never promote raw files as source code. |
| `.omnicode/` | evidence / index artifact | OmniCode artifacts/index material. | Tool/index artifacts. | Stale or huge index can be mistaken for source. | Surface freshness/timestamp only. |
| `_api-mega-list/`, `apis for agents/` | archive / reference registry | API reference datasets. | Static reference. | Could become fake integrations. | Research/reference only. Do not register APIs as tools until implemented. |
| `ablation_probes/`, `refusal_ablation_probe/` | archive / experiment | Experiments/probes. | Static/experimental. | Safety/policy confusion. | Quarantine; run only under explicit eval task. |
| `research/` | context / archive | AI frameworks research docs. | Static corpus. | Useful context but not operational. | Pool/RAG with provenance, no execution. |
| `prompts/` | archive / context | Sequential prompt plan for earlier build. | Static prompt docs. | May mislead agents into repeating old phases. | Archive/reference, not default Hivemind context. |
| `eval/` | evidence / runtime candidate | Python eval scripts and outputs. | Real eval surface but not a main capability. | Eval evidence not connected to Spring. | Future eval capability if active; successful eval output becomes evidence. |
| `tests/test_routing.js` | evidence / test | Small routing/decomposer test. | Real test. | Decomposer changes lack broad coverage. | Include in routing/decomposer verification batch. |
| `scripts/` | runtime / evidence / tooling | Utilities, smoke checks, docs validation, TUI. | Partly runtime, partly utilities. | Easy to patch wrong script. | Integrate named scripts only. |
| `app/public`, `public`, `archive/legacy-ui` | static / archive / UI | Active/static/legacy assets. | Mixed. | Duplicate UI creep. | Follow UI freeze. Use Mission Control/TUI only. |

## Multiple Truths

| Area | Problem | Boundary to keep |
|---|---|---|
| Registries | `service_registry.js`, `lib/capability-registry.js`, `registry/index.json`, `skills/skills_registry.json`, `skills/registry.txt`, `lib/tools/skills-registry.js`, and `/api/registry` describe overlapping truths. | Do not mash into one object. Keep service truth, capability metadata, static skill metadata, executable skill scanner, and live provider/tool registry separate. |
| Steering | `.kiro/steering/` and `steering/` duplicate each other. | Pick canonical source before wiring. Recommended: `.kiro/steering/`; treat `steering/` as mirror/legacy unless told otherwise. |
| Tasks | `TASKS/` is docs; runtime tasks live in `cognitive_tasks.json`, worker queue, pipeline registry, decomposer, scheduler, and possibly DreamTask. | Do not call `TASKS/` the runtime queue. |
| Stress | `STRESS/` is mostly audit/evidence; `stress.cjs` is the only obvious runnable candidate. | Docs are evidence. Script is optional verification after review. |
| Podcast Studio | Real side app with agents, TTS, shared log, and episode manager. | Surface later through existing CLI/TUI/Web action surfaces; no new UI shell. |
| Archives | Historical imports, donor apps, generated work, and copied memories are mixed through the tree. | Quarantine from default scans and Hivemind promotion. |

## Safe Future Patch Batches

### Batch 0: Audit doc only

This file is the Batch 0 artifact. No runtime code changes are required for Batch 0.

### Batch 1: Registry truth reconciliation

Account for:

- `service_registry.js`
- `lib/capability-registry.js`
- `registry/index.json`
- `skills/skills_registry.json`
- `skills/registry.txt`
- `app/api/registry/route.ts`
- `lib/tools/skills-registry.js`

Decisions to preserve:

- `service_registry.js` should remain service truth unless a later refactor explicitly changes that.
- `lib/capability-registry.js` should be capability/service metadata, not a second service starter.
- `registry/index.json` should be static skill metadata, not live runtime registry.
- `/api/registry` should be labeled as live provider/tool registry.

### Batch 2: Steering/context loader

Folders:

- `.kiro/steering/`
- `steering/`
- `contexts/`
- selected `rules/`

Rules:

- Load as read-only context.
- Prefer `.kiro/steering/` as canonical unless user decides otherwise.
- Bound length, checksum files, include modified time.
- Spring rank as human docs / Spring runoff.
- Never execute.
- Never auto-promote to doctrine.

### Batch 3: Task systems separation

Static docs:

- `TASKS/`

Runtime:

- `task_decomposer.js`
- `swarm_scheduler.js`
- `voice_coordinator.js`
- `worker_service.js`
- `lib/pipeline-registry.js`
- `DreamTask/DreamTask.ts`
- `cognitive_tasks.json`
- `agent_work/worker-tasks.json`

Rules:

- Document exact task layers.
- Do not parse every markdown file in `TASKS/` into jobs.
- Add Hivemind trace events to decomposer/worker/scheduler only in a later code pass.
- Decide whether DreamTask is ported or archived before surfacing it.

### Batch 4: Stress/evidence

Folders/files:

- `STRESS/`
- `stress.cjs`
- `eval/`
- `tests/`

Rules:

- Index STRESS docs by type: doctrine, audit, hardening, roadmap, stale.
- Fix `stress.cjs` external path only if still desired.
- Stress/eval outputs should emit Hivemind traces with Spring validation.
- Failure output should generate AntiSkill/failure-pattern candidates, not promoted skills.

### Batch 5: Podcast/studio/media capability

Folder:

- `podcast_studio/`

Likely operations:

- `start`
- `status`
- `stop`
- `episodes`
- `test-tts`
- `run-agent`

Rules:

- Add one capability entry later: `podcast-studio` or `studio-podcast`.
- Route through existing CLI/action dispatcher/Mission Control/TUI Actions.
- Emit trace per episode lifecycle.
- Summarize shared log; do not dump full raw conversations by default.
- Do not create a new web shell.

### Batch 6: Skill/tool provenance

Files:

- `lib/tools/skills-registry.js`
- `lib/hivemind/trace-recorder.js`
- `lib/hivemind/hivemind-middleware.js`

Rules:

- Record skill name, skill file, degraded flag, args hash, bounded output summary, and error summary.
- Do not store secrets or giant raw outputs.
- Skill metadata should come from one registry policy, not all registries at once.

### Batch 7: Archive/donor quarantine

Folders:

- `.archive/`
- `archive/`
- `.donors/`
- `PURPCLAWmemory realted/`
- `_scratch/`
- old `agent_work/*`
- `refusal_ablation_probe/`
- `_api-mega-list/`
- `apis for agents/`

Rules:

- Exclude from source scans by default.
- Allow explicit archive search mode only.
- Never promote from these paths to Hivemind without human approval.

## Highest Priority Unresolved Issues

1. Registry drift is the biggest risk.
2. Steering exists in two places and may be disabled by project trust state.
3. `DreamTask/DreamTask.ts` is not a real port yet.
4. `podcast_studio/` is a real side app with no unified surface/Hivemind wrapper in the ZIP.
5. `STRESS/` is not a test suite.
6. `TASKS/` is not the runtime task queue.
7. `agent_work/` is output/evidence, not source.

## Blunt Verdict

The spine and surface parity work can remain useful, but the side-folder accounting is a separate pass. This document is the acceptance artifact for the documentation-only audit. Runtime patching should continue only after choosing one batch above and proving the boundary for that batch.
