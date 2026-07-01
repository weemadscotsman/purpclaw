# PURPCLAW Folder Integration Audit

Date: 2026-06-29
Division: Engineering
Mode: read-only audit plus repair plan

## Executive Verdict

PURPCLAW is not missing systems. It has too many valid systems that are not consistently routed through one spine.

The main disconnects are:

1. CLI modules exist but some are not exposed from `bin/purpclaw.js`.
2. Runtime service truth is split across `service_registry.js`, `ecosystem.config.js`, `lib/capability-registry.js`, and `lib/surface-capabilities.js`.
3. `purpclaw next` under-detects the current repo state and reports Discovery even when architecture, tests, workflow registry, handoff, and runtime subsystems exist.
4. `app/api` has 76 routes, many of which are thin faces over older root/lib services, but there is no single API route index mapping each route to its owner.
5. Root contains many runnable service scripts that should be explicitly classified as active service entrypoints, wrappers, legacy, or quarantine candidates.
6. `agent_work`, `.tmp`, `.trash`, `archive`, `.archive`, `vendor`, and `.donors` need clearer lifecycle boundaries so generated evidence, dead code, donor material, and active source do not blur together.
7. The new ecology layers are promising but not fully joined: Timeline, Presence, Residue, Studio, Donor Archaeology, Auto-Evolve, Weatherman, and Registry Audit still need a shared event contract.

## Commands Run

```bash
node bin\purpclaw.js feature --verify --json
node bin\purpclaw.js action council-mode --dry-run --json
node bin\purpclaw.js registry audit --json
node bin\purpclaw.js next --json
node -e "parse every registry/*.json"
```

Results:

- Surface capability verification: passed, 22 checked.
- Council Mode action dry-run: passed.
- Registry JSON parse: all 16 files passed.
- Registry audit: clean by its current rules, but it exposes naming/scope drift that should be normalized.
- Next-step report: incorrectly defaulted to Discovery because it only sees missing brief/PRD files, not the living architecture/runtime state.

## Folder Map

| Folder | Files | Role | Audit Status | Repair Direction |
|---|---:|---|---|---|
| `.agents` | 0 | Empty config holder | Stray/empty | Remove or document owner if intentionally reserved. |
| `.archive` | 168 | Old local archive | Quarantine | Keep out of active scans; add archive manifest. |
| `.cactus` | 4 | Local tool/config | Unknown | Classify as tool, runtime, or quarantine. |
| `.claude` | 2 | Claude config | External config | Leave alone; exclude from runtime truth. |
| `.donors` | 165 | Donor/reference projects | Valuable but unsafe as source | Treat as donor archaeology input only; no direct runtime imports. |
| `.github` | 3 | GitHub metadata | Fine | No repair needed. |
| `.guardian` | 0 | Empty guard folder | Stray/empty | Remove or reserve explicitly. |
| `.hermes` | 5 | Hermes notes/config | Local memory | Decide if it feeds Memory or remains private local notes. |
| `.kiro` | 35 | Kiro specs | Reference | Exclude from runtime; optionally index as research/docs. |
| `.omnicode` | 70 | Omnicode docs/state | Reference | Keep out of runtime source scans. |
| `.purpclaw` | 102 | Hivemind/runtime state | Active state | Must be treated like `agent_work`, not source. |
| `.tmp` | 30 | Temporary files | Generated clutter | Add cleanup policy. |
| `.trash` | 120 | Trash/quarantine | Generated clutter | Exclude from audits and source scans by default. |
| `.versioning` | 4 | Version manifests | Active metadata | Tie into `npm run stamp` and registry audit. |
| `DreamTask` | 1 | Old task type | Stray | Classify or fold into task system. |
| `STRESS` | 23 | Stress docs | Reference/evidence | Feed into stress/evidence integration batch. |
| `Samantha's Daily Log` | 1 | Personal log | Reference | Exclude from runtime; optional Memory import. |
| `TASKS` | 12 | Stories/tasks | Active planning | Feed `purpclaw next` phase detection. |
| `__pycache__` | 37 | Python cache | Generated clutter | Exclude/clean. |
| `_api-mega-list` | 22 | API reference | Reference | Candidate donor/research feed, not runtime. |
| `_scratch` | 31 | Scratch work | Stray/generated | Quarantine policy. |
| `ablation_probes` | 2 | Eval probes | Active research | Map into stress/eval registry. |
| `agent_work` | 1160 | Runtime evidence/state | Active state, noisy | Add lifecycle classes: logs, snapshots, proofs, evolution, memory. |
| `agents` | 45 | Canonical generated agent registry + personas | Active truth | In sync: 85 generated agents. |
| `apis for agents` | 24 | API reference material | Reference | Move under docs/research or donor input. |
| `app` | 205 | Next app/API/UI | Active runtime | Needs route-owner index and CLI/API parity map. |
| `archive` | 38 | Older archive | Quarantine | Exclude from source import scans. |
| `bin` | 6 | CLI entrypoints | Active runtime | Route all intended command modules or mark internal. |
| `build` | 0 | Empty build output | Empty | Remove or ignore. |
| `companion-chorus` | 15 | Side runtime | Semi-active | Decide if service_registry owns it. |
| `components` | 4 | Root UI components | Potential duplicate | UI freeze applies; reconcile with `app/components`. |
| `config` | 2 | Config docs | Active metadata | Keep; ensure referenced by setup/status. |
| `contexts` | 3 | Context docs | Reference | Candidate steering/context-loader input. |
| `data` | 1 | Data type/source | Unknown | Classify. |
| `deploy` | 5 | Deployment scripts | Active ops | Tie to `purpclaw deploy` if kept. |
| `divisions` | 11 | Org routing/handoff | Active governance | Good; keep handoff current. |
| `docs` | 988 | Specs/audits/legacy docs | Mixed | Split active specs, audits, shipped docs, legacy. |
| `eval` | 30 | Evaluation scripts | Active research | Connect to Auto-Evolve gates. |
| `harness` | 0 | Empty harness dirs | Placeholder | Either populate via harness registry or remove. |
| `hooks` | 13 | React/hooks | Active UI | UI freeze applies. |
| `infra` | 11 | Infra files | Active ops | Map into service registry/deploy commands. |
| `lib` | 304 | Core runtime modules | Active source | Needs import/path cleanup and command parity. |
| `logs` | 2 | Runtime logs | Generated | Move policy under `agent_work/logs` or exclude. |
| `mochi` | 24 | Mochi subsystem | Semi-active | Confirm service/capability owner. |
| `models` | 1 | Model asset/config | Unknown | Registry audit says `model_registry.json` missing; model truth needs repair. |
| `pocket` | 14 | Pocket/Python side tool | Semi-active | Decide if active service or donor/reference. |
| `podcast_studio` | 16 | Studio/Council media runtime | Active subsystem | Needs canonical bridge into Studio/Timeline/Memory. |
| `prompts` | 17 | Prompt docs | Reference/source | Feed steering/context loader. |
| `public` | 43 | Static UI/public assets | Active UI | UI freeze applies; check legacy public UI duplication. |
| `python` | 2 | Python support | Semi-active | Map to service registry if used. |
| `refusal_ablation_probe` | 3 | Eval probe | Active research | Connect to eval/stress registry. |
| `registry` | 16 | JSON truth/state registries | Active truth | Parse-clean; needs schema/crosswalk audit. |
| `reports` | 1 | Reports | Output | Move generated reports consistently under `docs/audit` or `agent_work/reports`. |
| `research` | 45 | Research docs | Reference | Feed Donor/AutoResearch only through distilled laws/hypotheses. |
| `rules` | 89 | Agent/rule docs | Reference/runtime steering | Connect to steering loader. |
| `schemas` | 10 | Schemas | Active contracts | Enforce registry schemas against these. |
| `scripts` | 60 | Utilities | Active ops | Package scripts all referenced targets exist. |
| `settings` | 1 | Settings data | Unknown | Identify consumer. |
| `skills` | 1580 | Skill corpus | Active/reference mix | Registry mostly synced; needs provenance classes. |
| `steering` | 32 | Steering docs | Active context | Batch 2 target. |
| `swarm_mission` | 4 | Swarm mission state | Active state | Move under `agent_work` or register as runtime state. |
| `tests` | 2 | Tests | Too thin | Add integration tests for CLI/registry/API parity. |
| `trip_logs` | 0 | Empty logs | Empty | Remove or reserve explicitly. |
| `types` | 1 | Type declarations | Active source | Keep. |
| `vendor` | 8275 | Vendored deps/reference | External/quarantine | Exclude from normal audits; never runtime source unless wrapped. |
| `workspace` | 12 | Workspace docs | Reference | Keep as onboarding/context docs. |

## Confirmed Disconnects

### 1. Unrouted command modules

`lib/commands` contains modules that are not cleanly exposed through `bin/purpclaw.js`:

```txt
business
deploy
grow
harness
open
plan
ponytail
telemetry
thringlets
```

Decision needed per command:

- Public command: add CLI route and help text.
- Internal command: mark as internal and call from owner command.
- Dead command: quarantine after proof it has no consumer.

### 2. Registry command naming mismatch

This failed:

```bash
node bin\purpclaw.js registry-audit agents --json
```

Correct command is:

```bash
node bin\purpclaw.js registry audit --json
```

Repair: add an alias or clearer help so `registry-audit` does not appear like a callable first-class command if the supported surface is `registry audit`.

### 3. `purpclaw next` under-detects maturity

`purpclaw next --json` returned phase `discovery` because brief/PRD files are missing, despite detecting:

```txt
architecture.md
TASKS
tests
engineering handoff
Oracle
Weatherman
feature registry
workflow registry
```

Repair: teach `lib/workflow-registry.js` to consider active project evidence:

- `divisions/*/memory/handoff-*.md`
- `docs/spec/*.md`
- `docs/audit/*.md`
- `registry/workflows.json`
- `registry/souls.json`
- `registry/studio-modes.json`
- `agent_work/evolution/proposed.jsonl`
- `TASKS/`
- `tests/`

Expected outcome: repo-level guidance should likely be `implementation` or `runtime/operations`, not `discovery`.

### 4. Runtime truth split

Registry audit says service/PM2 are aligned, but service names do not map cleanly to capability keys.

Examples:

```txt
service_registry/ecosystem: purpclaw-api, purpclaw-eventbus, purpclaw-orchestrator
capability-registry keys: api, eventbus, orchestrator
surface capability ids: mission, council-mode, weather, podcast-studio
```

This is not necessarily broken, but it is a translation layer without a visible crosswalk.

Repair: add `registry/runtime-crosswalk.json`:

```txt
pm2_name -> service_id -> capability_key -> surface_capability_id -> api_route -> cli_command
```

### 5. API route sprawl

`app/api` exposes 76 routes. That is fine only if each route has an owner and source module.

Repair: generate `docs/audit/API_ROUTE_OWNERSHIP.md` or `registry/api-routes.json` with:

```txt
route
owner module
runtime service dependency
CLI equivalent
state files touched
test/smoke command
```

### 6. Root source sprawl

Root has many runnable scripts/services:

```txt
agent_tower.js
companion_swarm.js
gatekeeper.js
harness_service.js
orchestrator.js
service_registry.js
unified_api.js
unified_eventbus.js
voice_bridge_7792.js
worker_service.js
...
```

Some are legitimate service entrypoints. Others look like old helpers or one-off fix scripts.

Repair: create `registry/root-entrypoints.json` with classifications:

```txt
active-service
cli-wrapper
script-tool
legacy-reference
quarantine-candidate
generated
```

Do not move files until that registry exists and service_registry/ecosystem agree.

### 7. Missing/stale local import scan needs triage

A broad static import scan found 50 apparent missing relative imports. Many are false positives from copied legacy docs, comments, or vendored/reference material. The real candidates to inspect are under active `lib/`:

```txt
lib/curator.js -> ./lib/harvest/crawler
lib/handlers/mcp/notifications.js -> ../../services/mcp/jsonrpc
lib/services/mcp/index.js -> ./server, ./jsonrpc, ../../schema/mcp, transports
lib/services/mcp/transports/index.js -> ../services/mcp, ./streamable-http, ./sse
lib/usage-governor.js -> ./event-bus
```

Repair: make a proper import verifier that strips comments and excludes `docs/legacy`, `vendor`, `.donors`, `.trash`, `.tmp`, and archive folders. Then fix only confirmed active-source failures.

### 8. Ecology layers are not yet one operational loop

Built:

```txt
Timeline
Presence
Residue
Studio/Council
Donor Archaeology
Auto-Evolve proposal queue
Weatherman
Registry Audit
```

Missing integration:

```txt
Registry Audit findings -> Timeline event
Bughunt findings -> Timeline + Weatherman
AutoResearch status -> Weatherman
Auto-Evolve proposal lifecycle -> Timeline + Memory
Studio meeting memory -> Memory + Timeline + Presence
Presence/Residue -> Studio context
```

Repair: define a small `OperationalEvent` contract and let each subsystem publish into Timeline.

## Repair Plan

### Batch 1: Command And Registry Truth

Goal: every callable thing has one clear public name.

Actions:

1. Decide status for the 9 unrouted command modules.
2. Add routes/help for public ones.
3. Mark internal/deprecated modules in a command registry.
4. Add `registry/runtime-crosswalk.json`.
5. Add a smoke command that verifies `cli_command -> command module -> help/status`.

Validation:

```bash
node --check bin\purpclaw.js
node bin\purpclaw.js registry audit --json
node bin\purpclaw.js feature --verify --json
```

### Batch 2: Project Phase/Context Loader

Goal: `purpclaw next` sees the real project, not just missing PRD files.

Actions:

1. Extend artifact detection in `lib/workflow-registry.js`.
2. Read `docs/spec`, `docs/audit`, `TASKS`, `tests`, handoffs, and core registries.
3. Add confidence scoring: Discovery, Planning, Solutioning, Implementation, Runtime.
4. Include open proposals from Auto-Evolve.

Validation:

```bash
node bin\purpclaw.js next --json
node bin\purpclaw.js workflow --json
```

### Batch 3: API/CLI/Service Crosswalk

Goal: every web route knows its CLI/service owner.

Actions:

1. Generate `registry/api-routes.json`.
2. Map 76 `app/api` routes to owner modules.
3. Add CLI equivalent where one exists.
4. Flag API-only and CLI-only surfaces.
5. Fold this into `purpclaw registry audit`.

Validation:

```bash
node bin\purpclaw.js registry audit --json
npm run docs:check
```

### Batch 4: Active Source vs Quarantine

Goal: stop archived/donor/generated code from being mistaken for runtime source.

Actions:

1. Add `registry/folder-classes.json`.
2. Classify each top-level folder.
3. Update audit/scanners to default-exclude archive, vendor, donor, generated, cache, and trash.
4. Create a root-entrypoint registry before moving any root scripts.

Validation:

```bash
npm run sync:registry
node bin\purpclaw.js registry audit --json
```

### Batch 5: Operational Event Spine

Goal: make the organisation react to its world consistently.

Actions:

1. Define `OperationalEvent`.
2. Wire Registry Audit, Bughunt, AutoResearch, Auto-Evolve, Studio, Donor, Weatherman into Timeline.
3. Let Weatherman summarize event streams.
4. Let Presence/Residue consume events instead of custom ad hoc reads.

Validation:

```bash
node bin\purpclaw.js timeline recent 20
node bin\purpclaw.js presence --json
node bin\purpclaw.js residue --json
node bin\purpclaw.js evolve status
```

### Batch 6: Tests That Matter

Goal: catch integration drift without testing every line.

Add focused tests for:

1. CLI command dispatch.
2. Registry JSON parse and schema basics.
3. `purpclaw next` phase detection.
4. Donor promotion gate.
5. Timeline event recording.
6. API route ownership registry.
7. Surface capability verification.

## Recommended Next Move

Start with Batch 1 and Batch 2.

Reason: they repair the command brain and the project-awareness brain. Without those, every later system looks more broken than it is because PURPCLAW cannot reliably answer:

```txt
What exists?
What is callable?
What phase are we in?
What should happen next?
```

Do not start by moving folders. First create the ownership registries and crosswalks; then move only what the registries prove is dead or quarantined.
