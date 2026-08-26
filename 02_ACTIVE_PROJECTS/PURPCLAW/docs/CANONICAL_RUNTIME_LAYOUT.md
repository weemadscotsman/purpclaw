# PURPCLAW — CANONICAL RUNTIME LAYOUT (v1.0, FROZEN 2026-08-26)

> **Status:** COMPLETE CANONICAL. This document is the single authority for what a
> PurpClaw installation contains, where mutable data lives, which services run on
> which ports, and how the system boots. The One-Click Installer spec
> (`PURPCLAW_ONE_CLICK_DISTRIBUTION_INSTALLER_SPEC.md`) packages against THIS file.
> Where any other doc disagrees with this one, this one wins until superseded.
>
> **Frozen from the live tree at** `E:\god folder\02_ACTIVE_PROJECTS\PURPCLAW`
> (purpclaw v0.1.7, main entry `bin/purpclaw.js`). Node `>=22 <25`.

---

## §A. FROZEN SHIP TREE

What a shipped package contains. Every entry carries an explicit verdict.

### A.1 SHIP — core runtime (required in every install mode)

| Path | Role |
|---|---|
| `bin/purpclaw.js` | CLI entry (`main` + `bin` in package.json) |
| `unified_api.js` | Core HTTP API + cockpit host (:7780) |
| `agent_tower.js` | Agent Tower (:7790) |
| `orchestrator.js` | Orchestrator service |
| `lib/` | All shared runtime libraries (ports, registries, router, execution-lease, tts/gateway.js, commands/safe-start.js, model-registry.js, …) |
| `services/` | Service implementations — **excluding** `services/swarm/agent_work/worktrees/` |
| `packages/`, `apps/` | Packaged feature code |
| `skills/` | Installed skills registry content |
| `tools/` | Registered tools |
| `public/cockpit.html` | Canonical web cockpit surface |
| `public/cockpit/` | Cockpit assets (globals.css, skin-tokens.css, skin-loader.js, media/) |
| `public/mission.html` | Mission Control page |
| `public/mobile.html` | Mobile media surface |
| `node_modules/` | Committed dependency tree (~62.5k files / ~904MB; require-probe portable-verified). Bundled, never installed at setup time |
| `package.json` | Manifest: name purpclaw, v0.1.7, bin purpclaw |
| `package-lock.json` | Lockfile of record (pnpm-lock.yaml is legacy, ship optional) |
| `ecosystem.config.js` | PM2 app definitions (~26 apps; consumed only via safe-start) |

### A.2 SHIP — mode-dependent

| Path | Ships in | Notes |
|---|---|---|
| `purp mobile/` | Full / Custom (Android lane) | Gradle source; APK built separately per installer spec §11 |
| `docs/` subset | Full | INSTALL.md, ARCHITECTURE.md, canonical specs. Not internal parity notes |
| `.env.example` | All modes | Template ONLY. Real `.env` never ships (§B) |
| Next.js build output (`.next` production build) | Desktop/Web mode | Built at release time; dev mode NEVER ships |

### A.3 DEV-ONLY — never ships to end users

`tests/`, `scripts/` (dev tooling), `*.tgz` release archives, all `*.zip`,
`test_*` / `debug-*` / `_cert_*` / `_restart*.ps1` root scripts, stray MP3s,
duplicate `" (1)"` suffixed MD files, `tsconfig.tsbuildinfo`, `pyvenv.cfg`,
`__pycache__/`, swarm worktrees, `.donors` / `.donor-extract`.

### A.4 NEVER SHIP — secrets, state, clutter (installer must exclude unconditionally)

| Category | Paths |
|---|---|
| Secrets/credentials | `.env`, `config.json`, `credentials.json`, `credentials.toml`, `keys/` (`private.pem`, `public.pem`), `keys.encrypted` |
| Mutable state | entire `var/` (logs, memory spine, sessions, leases, artifacts, tmp), root `state.db` + `-wal`/`-shm`, `work-session.json`, `.purpclaw/` |
| Dead/stale UI | `public/ui/` (marked DO_NOT_USE), all cockpit backup variants (`cockpit.recovered.html` etc.), `vendor/` (contains only DO_NOT_INSTALL_HERE.md) |
| Backups/clutter | every `*.bak` (incl. `unified_api.js.bak/pre-static.bak`), archives, media strays, duplicate docs |

---

## §B. MUTABLE DATA MAP

Where user data lives TODAY, and its packaged home per installer spec §7.
**This freeze records locations; it does not move anything.** Migration is a later
§28 step and must not touch running systems.

| Data | Current location | Target packaged home |
|---|---|---|
| Provider keys / env config | root `.env` | `<install>/config/.env` (template ships; user values created at first-run provider setup) |
| App config | root `config.json` | `<install>/config/config.json` |
| Credentials vault | root `credentials.json/.toml`, `keys/`, `keys.encrypted` | `<install>/certificates/` — generated at vault-seal during onboarding, NEVER shipped |
| Memory spine | `var/memory/` (episodic/semantic/sessions/snapshots/indexes/quarantine) | `<install>/memory/` |
| Logs | `var/logs/` | `<install>/logs/` |
| Sessions / leases / artifacts | `var/sessions`, `var/runtime-leases`, `var/artifacts`, `var/state-store.json`, `var/tmp` | `<install>/data/` |
| **Known deviation:** state DB | root `state.db` (+wal/shm) — referenced by ~24 modules via own handles | target `<install>/data/state.db`; recorded here, migration deferred (see SQLite shared-handle debt) |
| **Known deviation:** work session | root `work-session.json` — read by `lib/execution-lease.js` | target `<install>/data/work-session.json`; deferred |
| Campaign/approval state | `.purpclaw/` | `<install>/data/purpclaw-state/`; deferred |

Rule (binds installer spec §7): mutable user data stays separable from app binaries.
Updater (spec §14) never touches `config/ data/ memory/ logs/ certificates/ workspace/`.

---

## §C. SERVICE / PORT TABLE

Single source of truth: `lib/runtime/ports.js` (imported everywhere; env overrides
via `PURPCLAW_<NAME>_PORT`). Reproduced verbatim from that file's SERVICES table:

| id | Name | Port (default) | Class | Protocol |
|---|---|---|---|---|
| unified-api | Unified API | 7780 | core | http |
| unified-api-tcp | Unified API TCP control | 7778 | core | tcp |
| eventbus | Unified EventBus | 7782 | core | http |
| state | Unified State Store | 7783 | core | http |
| orchestrator | Orchestrator | 7784 | core | http+sse |
| agent-tower | Agent Tower | 7790 | core | http |
| gatekeeper | Gatekeeper | 7791 | core | http |
| harness | Autonomous Harness | 7798 | core | http |
| memory | Cognitive Spine Memory | 7880 | core | http |
| pool | Worker / Knowledge Pool | 7885 | core | http |
| metrics | Metrics Collector | 7890 | core | http |
| workers | Worker Service | 7897 | core | http |
| a2a-gateway | A2A Agent Gateway | 9119 | core | http+websocket |
| web-ui-pm2 | Web UI (Mission Control) | 3000 | core | http |
| voice-coordinator | Voice Coordinator | 7781 | optional-dark | http+websocket |
| voice-bridge | Voice Bridge | 7792 | optional-dark | http+websocket |
| stt / voice-ingress | STT Service / Voice Ingress | 7896 | optional-dark | http |
| tray-agent | Tray Agent | 7796 | optional-dark | http |
| chorus | Companion Chorus Bridge | 7797 | optional-dark | http |
| telegram | Telegram Gateway | 7795 | optional-dark | http |
| vision-monitor | Vision Monitor | 7889 | optional-dark | http |
| goop | GOOP Playground Broker | 7895 | optional-dark | http |
| ollama / lmstudio | Local model hosts | 11434 / 1234 | optional-dark | http |
| modal / diagnostics / rules / bridge-neuro | Legacy engines | 7785–7787, 7799 | deprecated | http |
| autodream | AutoDream endpoint | 7880 | cognitive-endpoint | http |

Notes:
- TTS gateway (`lib/tts/gateway.js`) runs via PORT env, default **7799**
  (shares the deprecated bridge-neuro slot in ports.js; TTS lane owns it at runtime).
- CLI-only installs need only: unified-api (+tcp), eventbus, state, memory,
  gatekeeper. Everything else is lazy/optional.
- `web-ui` (dev :3000) is deprecated-class; PM2 prod entry is the shipped one.

---

## §D. BOOT CONTRACT (BINDING)

1. Production boot = **`purpclaw safe-start`** (sequential launcher:
   `lib/commands/safe-start.js` driving PM2 via `ecosystem.config.js`).
   Raw `pm2 start` is FORBIDDEN for packaged installs — safe-start orders
   dependencies correctly and is the only supported lifecycle.
2. The Windows EXE launcher (installer spec §9) wraps safe-start:
   locate bundled runtime → locate data/config → safe-start → health confirm →
   open cockpit → first-run check (§E).
3. Restart law inherited from ops memory: use delete+start, never blind reload
   (Windows PM2 zombie pattern).

---

## §E. FIRST-RUN MARKER

- Installer writes ONLY install metadata (what components, where, version).
- Install success ≠ onboarding success.
- First launch checks the local onboarding state flag
  **`onboarding.completed`** (owned by the Hatch & Adopt onboarding module,
  `docs/PURPCLAW_ONBOARDING_BORN_ADOPTED_SPEC.md`):
  - false/absent → launch onboarding ceremony;
  - true → normal PurpClaw chat.
- Onboarding state is local and resumable. Birth/adoption certificates are
  minted ONLY after TVG verification passes — never by the installer.

---

## §F. RECONCILIATION (one authority)

- `docs/INSTALL.md` — remains the developer-install guide (Node/pnpm/ports/profiles).
  Adds pointer here: layout questions defer to this file.
- `PURPCLAW_CANONICAL_RUNTIME_INSTALL_FIRST_RUN_SPEC.md` (root) and
  `PURPCLAW_FIRST_CLASS_INSTALL_AND_PARITY_CONTRACT.md` (root) — historical
  contracts; both defer to this file for layout truth. No content rewrite required;
  cross-reference note appended.
- `docs/PURPCLAW_ONE_CLICK_DISTRIBUTION_INSTALLER_SPEC.md` — packaging consumer
  of this file (its §7 layout = §A/§B here; §14 updater exclusions = §B rule).

---

*Freeze verified against live tree 2026-08-26. Changes to layout require a new
version of this file BEFORE any installer/packaging work consumes them.*
