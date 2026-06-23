---
name: purpclaw-codebase-audit
description: Audit or clean up the PURPCLAW codebase — never delete/move anything without reading the actual files first. Grep refs mean nothing. Eddie builds features in unconventional places.
when_to_use: Folder cleanup, codebase audit, "clean the house", removing dead code, organizing the PURPCLAW root directory. Also when the user says "go folder by folder checking for connective tissue" or asks you to trace connections between systems.
---

# PURPCLAW Codebase Audit & Cleanup

## THE ONE RULE

**Never delete or move a folder without reading the actual files inside it.**

Grep reference counts mean nothing. File names mean nothing. A folder named `disabled-commands` with zero grep refs might contain your secondary UI theme. A folder named `accuracy_fish` might be the truth-checking claim extractor wired into the harness engine.

Eddie builds fast. Everything has purpose. "99 percent of it is bloody needed."

## The WIRING_GUIDE.md rule (hardest-learned lesson)

**If any folder has a `WIRING_GUIDE.md`, `README.md`, or architecture doc — read it FIRST, before touching anything else in the folder.**

The wiring guide is the single source of truth. It documents:
- Every backend the UI connects to (ports + endpoints)
- Every data hook and what it polls
- SSE stream subscriptions
- Write endpoints (POST/PATCH routes)
- CORS requirements
- Expected data shapes for every API call

Ignoring the wiring guide is how you turn a "dead UI prototype" into "Eddie's secondary command surface that just needed port fixes."

## The triple-config check

Before declaring any service "missing" or "broken," verify it exists in ALL THREE configs:

| Config | File | What it controls |
|---|---|---|
| PM2 | `ecosystem.config.js` | Process lifecycle (boot, restart, stop) |
| Registry | `service_registry.js` | CLI discovery, launch profiles |
| WebUI | `app/hooks/useMissionData.ts` | Dashboard health probes |

A service missing from any one is invisible to that surface. Fix by adding to all three simultaneously.

## The connector audit pattern

When tracing whether two components are properly wired:

1. **Client config** — what port/path does the client call?
2. **Server routes** — what port/path does the server serve?
3. **Wire map** — compare lines from each file side by side
4. **Test** — curl the endpoint and verify response matches expectations

Known split-brain patterns from PURPCLAW 2026-06-06 (see `references/connector-audit-pattern-2026-06-06.md`):
- Cognitive ports: client says `:7785`/`:7786`/`:7787`, spine says `:7880`
- Memory paths: client calls `/recall`, spine expects `/memory/recall`
- Modal paths: client calls `/modal/update`, spine expects `/modal/agent/epistemic/know`
- State store: client calls `POST /state/set`, server expects `PUT /state/:namespace/:key`

## The 3-State Taxonomy

When auditing any component, distinguish three separate states — never conflate them:

| State | Description | Example |
|---|---|---|
| **Built** | Code exists on disk, implements the feature | 7-layer memory written in 1,133 lines across 6 modules |
| **Running** | Process is alive and serving traffic | Cognitive spine booted on port 7880, responding to `/cognitive/health` |
| **Integrated** | Agent decisions actually consume it | A swarm task triggers `POST /memory/recall` and uses results to inform action |

A component can be in any combination. The most dangerous gap: Built + Running but NOT Integrated. The spine boots, the health checks pass, but the orchestrator never calls it. Always report all three states — "it exists" is not "it works."

## Connector Audit Pattern (API Route / Port Mismatch Detection)

When the diagram and the codebase disagree, run this cross-reference:

### The triple config check

For any service you're unsure about, verify it exists in ALL THREE of these:

| Config | Example entry |
|---|---|
| `ecosystem.config.js` | PM2 process definition |
| `service_registry.js` | Services array entry |
| `app/hooks/useMissionData.ts` | SERVICE_CONFIG entry in WebUI |

A service missing from any one of these is invisible to the WebUI, the CLI, or PM2. Fix by adding it to all three.

### Cross-reference checklist

| Check | Files to compare |
|---|---|
| Target ports | `lib/*-client.js` ports vs `ecosystem.config.js` vs `service_registry.js` |
| Route paths | Client HTTP calls vs Server route handlers (grep for `path ===` or `pathname.match`) |
| PM2 registration | `ecosystem.config.js` entries vs `service_registry.js` SERVICES array |
| WebUI health checks | `app/hooks/useMissionData.ts` SERVICE_CONFIG ports vs actual service ports |
| WIRING_GUIDE.md | UI wiring doc vs actual backend routes |

## The lesson (2026-06-06)

Quill moved 18 folders to `docs/legacy/disconnected-folders/` based on grep reference counts. Five had to be restored because they contained actual features:

| Folder | What it actually was | What to do |
|---|---|---|
| `accuracy_fish/` | Truth-checking claim extractor. Wired into `lib/harness/engine.js`. | Keep. Content moved to `lib/accuracy-fish.js`. |
| `NEW MASTER UI/` | Secondary UI theme with full WIRING_GUIDE.md (341 lines). | Keep. Moved to `public/skyscraper/`. |
| `purpconsole/` | TUI that runs inside Hermes. Python console. | Keep. |
| `podcast_studio/` | Multi-agent podcast (Goose + Hermes + OpenClaude hosts). Uses eventbus. | Keep. Integrating for group chat + Edge TTS. |
| `contexts/` | Claude Code mode presets (dev/research/review). | Keep. For other AI harnesses. |
| `no-spaghett/` | Gemini-powered code analysis tool. 1.1GB with own node_modules. | Keep. Part of PURPCLAW + standalone. |
| `schemas/` | ECC install/skill JSON schemas. | Keep. Integrate into stack. |
| `trip_logs/` | Agent journey logs with the shaman. | Keep. (Empty but planned.) |
| `Samantha's Daily Log/` | AI personal journal (thoughts/observations). | Keep. Not runtime. |
| `DreamTask/` | Auto-dream background task. | Keep. Ties into cognitive stack. |
| `_scratch/` | Gap-to-finish strategy doc. | Keep. Contains STRATEGY.md. |
| `steering/` | Dev guides (coding-style, git-workflow, etc.). | Keep. |

## Repo Archaeology / Connectivity Audit (learned 2026-06-06)

When asked to determine if files or folders are "dead" (orphans) or "alive" (connected), do NOT rely on folder names or grep-for-references alone. **Folder names lie. Only content tells the story.**

### Correct methodology:

1. **Read every file in the folder** — not the first 5 lines, the whole thing. What does it export? What does it import? What API does it expose?

2. **Trace actual connections** — do not stop at "grep shows zero references." Check:
   - Dynamic requires (e.g. `require(\`../some-dir/${name}\`)`) — grep won't catch these
   - Reverse imports — files that require FROM the folder
   - Wiring guides, READMEs, or manifest files that document connections
   - Ecosystem/config files (PM2, docker-compose, service registries)
   - HTML/JSX files that load scripts from the folder

3. **Build a mental map** — before moving or deleting anything, understand:
   - What does this component connect to?
   - What connects to it?
   - What happens if it goes away? (A missing utility = arm. A missing old prototype = vein.)
   - Is it referenced dynamically (SSE streams, WebSocket endpoints, proxy routes)?

4. **Check the wiring guide** — if the folder has a `WIRING_GUIDE.md`, `README.md`, or similar, that is the truth source. Read it first before touching anything else in the folder. It documents every endpoint, data contract, and connection the component expects.

5. **Distinguish "built" from "running" from "integrated"** — these are three separate states:
   - Built = code exists on disk
   - Running = the process is alive
   - Integrated = the component actively participates in system decisions
   A component can be built but not running (wake it), running but not integrated (wire it), or integrated but misconfigured (fix it).

6. **When in doubt, trace the full data flow** — for UI components: HTML mount → JSX imports → data hooks → API calls → backend services → ports. For backend services: PM2 config → service registry → boot sequence → health endpoints → client references.

### Pitfalls to avoid:
- ❌ "grep shows 0 references = dead" — dynamic requires, runtime registrations, config-driven loading, and reverse proxies won't appear in grep results
- ❌ "folder named `disabled-commands` = disabled" — may be empty dirs shadowing real implementations in `lib/commands/`
- ❌ "no imports = unused" — check if it's a static file served by a web server, an HTML page loaded by a proxy, or a config consumed at runtime
- ❌ "cloned third-party repo = always dead" — verify; user may have modified it for integration
- ❌ Mass-moving "0 ref" folders to trash in one command — restore immediately when user objects, then trace actual connections before moving anything again

### The WIRING_GUIDE.md pattern:

For any UI/integration folder, the `WIRING_GUIDE.md` is the Rosetta Stone. It documents:
- Every service the UI connects to (ports + endpoints)
- Every data hook and what it polls
- SSE stream subscriptions
- Write endpoints (POST/PATCH routes)
- CORS requirements
- Expected data shapes for every API call

## API Route / Port Mismatch Detection (connector audit)

A deeper audit pattern: trace every API call through the stack to find split-brain configurations. This detects cases where the JS client calls one port/route but the server expects another.

### Methodology

For each service, trace the full data path:

```
Client config → HTTP request → Server routes → Response
```

### Cross-reference checklist

When auditing whether two services are properly connected:

| Check | Files to compare |
|---|---|
| Target ports | `lib/*-client.js` ports vs `ecosystem.config.js` vs `service_registry.js` |
| Route paths | Client HTTP calls vs Server route handlers (grep for `path ===` or `pathname.match`) |
| PM2 registration | `ecosystem.config.js` entries vs `service_registry.js` SERVICES array |
| WebUI health checks | `app/hooks/useMissionData.ts` SERVICE_CONFIG ports vs actual service ports |
| WIRING_GUIDE.md | UI wiring doc vs actual backend routes |

### Known split-brain patterns (PURPCLAW 2026-06-06)

| Pattern | Client says | Server expects | Fix |
|---|---|---|---|
| Cognitive ports | `:7785` (modal), `:7786` (diag) | `:7880` (spine) | Point all to 7880 |
| Memory paths | `POST /recall` | `POST /memory/recall` | Add `/memory/` prefix |
| Modal paths | `/modal/update` | `/modal/agent/epistemic/know` | Remap calls |
| State store | `POST /state/set` | `PUT /state/:namespace/:key` | Add POST shim or fix calls |
| Orphan services | (not in any config) | PM2 entry exists | Add to all 3 configs |
| Pool syntax | `'7880',10)` garbage | Clean `PORT = parseInt(...)` | Fix paste artifact |

### The WIRING_GUIDE.md rule

When a UI or integration folder has a WIRING_GUIDE.md:
1. **Read it first** — it's the truth source
2. **Verify every port listed** — cross-check with actual service configs
3. **Verify every endpoint listed** — test with curl
4. **Verify every data shape documented** — compare with actual JSON responses
5. **Fix port mismatches** — the wiring guide may have stale ports from a previous architecture

## Correct audit methodology

### Phase 1: List and question

List ALL folders. Zero-byte files, .log files, .err files, and empty directories are the first candidates.

### Phase 2: Read, don't skim

For every folder you're unsure about:

1. **Read the key files.** Not `ls`. Not `head -5`. Read the README, the main source, the config. Understand what the folder IS.

2. **Check the wiring guide first.** Before touching anything, look for a WIRING_GUIDE.md, README, or architecture doc in the folder. It will tell you every endpoint, every connection, every data flow.

3. **Trace actual imports**, not just grep counts:
   - Does the core system require it? Check `ecosystem.config.js`, `boot.js`, `bin/purpclaw.js`, `unified_api.js`, `agent_tower.js`, `orchestrator.js`, `package.json`
   - Does it export something the core consumes?
   - Is it referenced in `app/hooks/` or `app/api/`?

4. **Cross-reference with core config.** Check `ecosystem.config.js`, `boot.js`, and all core files for references.

### Phase 3: Build a mental map

Before removing anything, you need to understand how every folder connects:

```
For each folder, answer:
  1. What files does it contain?
  2. What core files import from it?
  3. What core files does it import FROM?
  4. Is it referenced in ecosystem.config.js, boot.js, or any CLI command?
  5. Does it have its own README or wiring documentation?
  6. What data flows through it?
```

The WIRING_GUIDE.md in any UI folder is the Rosetta Stone. It documents every service, every port, every endpoint, every data contract.

Only once you have the full map do you decide what stays and what goes.

### Phase 4: Ghost busting

Systematic approach to finding dead files:

- Zero-byte files: delete immediately
- Empty directories: delete (after confirming nothing expects them)
- `.log`, `.err` in root: delete (logs belong in `logs/`)
- Old version (v1 superseded by v2): archive the old one
- Duplicate CLI (root `purpclaw.js` vs `bin/purpclaw.js`): archive the old one
- Unreferenced standalone script: check with user before removing
- Cloned third-party repo: safe to delete
- Personal/AI journal files: leave in place or archive with note

### Phase 5: Verify and iterate

After any move/delete, verify core still loads, the CLI works, and the test suite passes. ASK if unsure — "I found X, it looks like Y — do you need it?" Not "I moved X to legacy."

## Eddie's side projects (in PURPCLAW root — do NOT delete)

| Folder | What it is | Notes |
|---|---|---|
| `public/skyscraper/` | Secondary UI theme (isometric tower). Served at `/skyscraper/`. | Moved from `NEW MASTER UI/` |
| `purpconsole/` | Python TUI console for Hermes | |
| `podcast_studio/` | Multi-agent podcast app (Goose+Hermes+OpenClaude) | Integrating for group chat |
| `no-spaghett/` | Gemini code analysis tool (1.1GB) | Own node_modules |
| `contexts/` | Claude Code mode presets (dev/research/review) | For other AI harnesses |
| `_scratch/` | Gap-to-finish strategy + temp files | |
| `DreamTask/` | Auto-dream background task for cognitive stack | |
| `hooks/` | Shared React hooks (useAgentTower connects to :7790) | |
| `steering/` | 16 development guide files | |
| `TASKS/` | Task files and survival guides | |
| `schemas/` | ECC install/skill JSON schemas | Integrate into stack |
| `Samantha's Daily Log/` | AI personal journal (thoughts/observations) | Archive, not runtime |
| `trip_logs/` | Agent journey logs with the shaman | Currently empty |

## What's safe to remove

Only these are confirmed dead (cloned third-party repos or empty):

- `Open-Higgsfield-AI-main/` — cloned third-party repo
- `tesseract-ocr-tesseract-9c516f4/` — cloned Tesseract source
- `installers/` — duplicate install scripts (root has newer)
- `scratch/` — empty

## Connected folders in PURPCLAW root (ACTIVE STACK — do NOT touch)

These 23 folders are the active stack:

```
agent_work/   goals/        rules/
agents/       lib/          scripts/
app/          logs/         skills/
bin/          mochi/        tests/
build/        models/       workspace/
companion-chorus/ prompts/
components/   public/
config/       registry/
data/         
docs/         
eval/         
```

## Sizing guide

- Small cleanup: 5-10 files, <5MB → 10 minutes
- Large cleanup: 30-50 files, >100MB → 30 minutes
- Full audit: every folder in root, trace connections, verify wiring → 1-2 hours

## Pitfalls

- **Folder names lie.** `disabled-commands` contained zero code but its sibling folders had the real implementations in `lib/commands/`.
- **"0 grep refs" does not mean "dead."** The file might be loaded dynamically (require with variable path), referenced by name in config, or imported via a different path.
- **grep without `-v node_modules` is suicide.** Always exclude node_modules and .git.
- **Don't trust file extensions.** A `.ts` file might require a `.js` file. A `.py` file might be imported by a `.js` file via subprocess.
- **Check for WIRING_GUIDE.md** in any UI or integration folder. It documents every endpoint and data flow.
- **Warn user before deleting >100MB.** Some of these are side projects with their own node_modules.
- **Read EVERY file.** One journal entry in Samantha's Daily Log is "the AI leaving itself notes" — a feature, not a file. One line in a JSON schema might prove it's part of the install system.
