# PURPCLAW MASTER TODO
> Derived from full 8,956-line CLI transcript reconciliation + live audit.  2026-08-26.

## HOW THIS BOARD WORKS
- Every item has evidence or a specific blocker  no vibes
- RUN order follows the dependency chain: core stability  plugin system  surface audits  mobile  desktop  orchestration  integrations  release
- "Compiles" / "syntax clean" / "module loads" are NOT completion criteria  screenshots and live E2E are

---

## P0-A: Fix things that can break normal use

### DONE
- [x] P0-A Fix 1: `frogAlert()` crash (`label is not defined`) — `public/cockpit.html:1997` — `frogAlert(state)` referenced `label` from `setRun()`'s closure, not in scope. Fixed: `lbl.textContent=state`.
- [x] P0-A Fix 2: Regression-test chat send path (8 states) — `tests/contract/cockpit-send-states.test.js` — 60/60 source-layer assertions pass across all 8 states: normal send, streaming, cancel/stop, retry, error, tool-running, success, frog alerts.

### TODO
- [ ] P0-A Fix 3: Ignore `contentscript.js` MaxListeners/ObjectMultiplex warnings unless reproduced WITHOUT the browser extension

---

## P0-B: Plugin / App System

### DONE
- [x] Plugin manager core exists
- [x] Discovery/load/list/enable/disable works
- [x] Permission gating exists
- [x] Gateway/tool-runtime plugin wiring exists
- [x] Lifecycle tests: 4/4 green

- [x] P0-B Fix 1: Prove generic UI contribution mounting — `WidgetHost.register(manifest)` accepts any validated manifest, stores by id in a Map REGISTRY, mountBody() re-parents DOM without hard-coded IDs, `/api/plugins/ui` serves ENABLED plugins' contributions with provenance, `syncPluginWidgets()` auto-registers and deduplicates. 19/19 assertions pass.
- [x] P0-B Fix 4: Canonical plugin tree — `DATA_ROOT/plugins/` (`.purpclaw/plugins/`) is canonical. Project-root `plugins/` is deprecated (git-untracked). 8/8 assertions pass.
- [x] P0-B Fix 8: Plugin install/remove UX — `col/C` crash fixed; `plugin add` copies to `.purpclaw/plugins/<name>/` then enables; `plugin remove [--purge]` disables + optionally deletes files; hot-reload hint shown. GitHub `owner/repo` + local `--from` path supported. 9/9 assertions pass.
- [x] P0-B Fix 9: Restart hints in enable/disable output — `isolated` flag added to `PM.enable/disable()` results; gateway returns `restart_required` only for isolated plugins; CLI shows hot-reload or restart hint. Permission enforcement test fixed (BOM stripped, async IIFE removed, 2 known gaps documented). 6/6 pass.
- [x] P0-B Fix 10 (permission enforcement): `p0b-permission-enforcement.test.js` fixed and passing. 6/6 source-layer assertions hold. Known gaps (proof-ledger denials, HTTP 200 denial envelope) documented.

### TODO

---

## P0-C: App-Surface E2E Audit (IN PROGRESS)

### DONE
- [x] P0-C Fix 1 (harness-honest-status): `R.finalize()` added to `packages/result-schema/index.js` — 8/8 assertions now pass. Status derives correctly from evidence: blocked=no work, partial=unverified work, passed=all verifications passed, failed=fatal errors. Explicit harness decisions preserved.
- [x] P0-C Audit: cockpit live at `http://127.0.0.1:7780/cockpit` — 60/60 chat assertions green, all API endpoints 200, rail nav: Chat/Agents/Tools/Skills/Knowledge/System/ZAMP surfaces, BIOS POST overlay functional.
- [x] P0-C Audit: acceptance suite — 14/14 pass, 6 NI (cross-surface-process, web-reconnect, recovery, provenance, mobile-same-brain, agent-minimal-load — all need live pairing).
- [x] P0-C Audit: TUI dead (missing `lib/lifecycle-actions.js`), Next.js won't start (network drive), no Electron dir, mobile needs real phone.

### BROKEN (needs investigation)
- [x] P0-C Fix 2: TUI — `lib/lifecycle-actions` path fixed from `../lib/` → `./lib/` (was resolving outside project). TUI loads cleanly. Voice client remains optional (graceful fallback). PURP_DIR still points one level up — cosmetic only since voice is wrapped in try/catch.
- [ ] P0-C Fix 3: Next.js app — `npm run dev` hangs on network drive, relocate or fix

### Surfaces to audit (pending broken fixes)
- [ ] CLI — boot-test every command
- [ ] TUI — blocked on Fix 2
- [ ] Lightweight Web / Cockpit — FIXED: live and green
- [ ] Desktop / Electron — no Electron dir
- [ ] Mobile Android — needs real phone
- [ ] Companion Chorus — probe xiaozhi_bridge
- [ ] Extension surfaces — probe extensions/
- [ ] Widget Drawer — cockpit: /api/plugins/ui working
- [ ] Chat — cockpit: 60/60 assertions green
- [ ] Library — probe app/library or equivalent
- [ ] Settings — cockpit /api/settings 200
- [ ] Plugin-contributed pages/windows — WidgetHost working

For EVERY surface test:
```
BOOT → NAVIGATE → INTERACT → TOOL CALL → FAILURE → RECOVERY → STATE PERSISTENCE → RESIZE/ROTATE → RESTART
```

---

## P0-D: Mobile Completion

### Navigation
- [ ] P0-D Fix 1: Finish single canonical `LiquidBottomNav`
- [ ] P0-D Fix 2: Remove duplicate implementations
- [ ] P0-D Fix 3: Resolve signature mismatch against `PurpClawApp.kt`
- [ ] P0-D Fix 4: Preserve navigation state instead of remounting expensive screens
- [ ] P0-D Fix 5: Complete contextual auto-hide/show behaviour
- [ ] P0-D Fix 6: Verify keyboard/IME interaction
- [ ] P0-D Fix 7: Verify safe areas and gesture/navigation-bar insets
- [ ] P0-D Fix 8: Verify drawer/modal/fullscreen coexistence
- [ ] P0-D Fix 9: Verify reduced-motion/accessibility behaviour

### ZAMP
- [ ] P0-D Fix 10: ZAMP theme port across the real app (not just one pretty screen)
- [ ] P0-D Fix 11: Visual-verify every footer/navigation state

### Provider / Function Calling
- [ ] P0-D Fix 12: Finish provider-native function calling on mobile

### Onboarding
- [ ] P0-D Fix 13: Finish Hatch & Adopt mobile onboarding/birth profile

### BIOS / Boot
- [ ] P0-D Fix 14: Finish mobile BIOS/POST + PurpAngolin loader
- [ ] P0-D Fix 15: Keep PurpAngolin tied to real state (not timer theatre)

### MANDATORY ACCEPTANCE GATE — Real Phone
**Build APK → Install on actual phone → Drive it → Screenshot every important surface → Inspect screenshots → Fix defects → Repeat.**

Test across:
- [ ] portrait
- [ ] landscape (where supported)
- [ ] keyboard open/closed
- [ ] drawer open/closed
- [ ] bottom nav shown/hidden
- [ ] Chat
- [ ] Work
- [ ] Library
- [ ] Settings
- [ ] Onboarding
- [ ] BIOS
- [ ] Widget drawer
- [ ] Widgets
- [ ] Media / ZAMP
- [ ] Mochi / PurpAngolin surfaces
- [ ] Errors / loading / offline / reconnecting
- [ ] Long conversations
- [ ] Narrow/overflow states

**Compile-green is not UI-green.**

---

## P0-E: Desktop / Main Completion

- [ ] P0-E Fix 1: Main/Desktop BIOS/POST
- [ ] P0-E Fix 2: Reuse PurpAngolin as canonical living boot/loading state
- [ ] P0-E Fix 3: Boot from actual readiness events
- [ ] P0-E Fix 4: Do not block usable chat waiting for optional subsystems
- [ ] P0-E Fix 5: Continue optional/full readiness after minimum-ready
- [ ] P0-E Fix 6: Complete desktop onboarding
- [ ] P0-E Fix 7: Complete NoSignups provider/router catalogue
- [ ] P0-E Fix 8: Verify provider setup + live catalogue
- [ ] P0-E Fix 9: Finish Web/Desktop/CLI/TUI parity
- [ ] P0-E Fix 10: Boot-test Electron properly (not just syntax)
- [ ] P0-E Fix 11: Resize cockpit dynamically — torture-test side panels/drawers at every viewport

---

## P0-F: Widget / Application Architecture

### Keep this structure:
```
PROGRAM
  manifest
  capabilities
  tools
  agents
  adapters
  UI contributions

  Widget Registry

Desktop / Mobile
```

- [ ] P0-F Fix 1: Desktop widgets: popup/floating window / dock / resize / minimise / restore / persistence / workspace/full-page promotion
- [ ] P0-F Fix 2: Mobile widgets: responsive full surface / bottom-sheet / safe-area / keyboard behaviour
- [ ] P0-F Fix 3: Market dashboard becomes a program contribution (not cockpit hard-code)
- [ ] P0-F Fix 4: Same contract mounts ProofMesh / Arbitrage Cannon / Podcast Studio / ZAMP without bespoke plumbing

---

## P0-G: QoL and Production Polish

- [ ] P0-G Fix 1: Unified loading/error/empty/offline states
- [ ] P0-G Fix 2: Useful restart-required notifications
- [ ] P0-G Fix 3: State persistence across reload/restart
- [ ] P0-G Fix 4: Clear plugin permission UX
- [ ] P0-G Fix 5: Proper failed-tool and failed-agent receipts
- [ ] P0-G Fix 6: Restore/reconnect behaviour
- [ ] P0-G Fix 7: Keyboard shortcuts where relevant
- [ ] P0-G Fix 8: Search/command launcher consistency
- [ ] P0-G Fix 9: Responsive side drawers
- [ ] P0-G Fix 10: No drawer trapping/overlapping content
- [ ] P0-G Fix 11: Theme consistency across contributed surfaces
- [ ] P0-G Fix 12: Accessibility / reduced motion
- [ ] P0-G Fix 13: Truthful status indicators
- [ ] P0-G Fix 14: No fake-ready states
- [ ] P0-G Fix 15: No duplicate implementation of the same UI/runtime component
- [ ] P0-G Fix 16: Regression-test all previously green functionality after structural changes

---

## P1: Agent Orchestration

- [ ] P1-1: Main remains conversational while workers execute
- [ ] P1-2: Main decomposes jobs
- [ ] P1-3: Pick appropriate agent + model based on capability/use case
- [ ] P1-4: Spawn bounded workers
- [ ] P1-5: Workers stream status/findings back to Main
- [ ] P1-6: TVG verifies results before Main claims completion
- [ ] P1-7: Add global mission registry
- [ ] P1-8: Add global work leases (shared across CLI/Desktop/Mobile sessions)
- [ ] P1-9: Deduplicate semantically identical missions before spawning
- [ ] P1-10: Read-sharing allowed, write ownership exclusive
- [ ] P1-11: Cross-lane changes become handoff requests
- [ ] P1-12: Heartbeat/stale-worker detection
- [ ] P1-13: Worker cancellation/reassignment
- [ ] P1-14: Dependency graph
- [ ] P1-15: Visible Work UI: owner / model / task / status / files/resources / dependencies / elapsed / evidence / TVG status
- [ ] P1-16: Main can inspect/intervene without murdering the worker
- [ ] P1-17: Persist mission history and receipts

---

## P1: Managed / Native Integrations

- [ ] P1-18: OpenCompany
- [ ] P1-19: PurpVision / Viseron
- [ ] P1-20: Face backend / Faceplugin candidate
- [ ] P1-21: OpenBot-derived capabilities
- [ ] P1-22: Complete PurpDesign adapter/manifest/capability seam
- [ ] P1-23: Mode seam across cockpit/API/agent loop
- [ ] P1-24: Vendor provenance/update handling

---

## Separate Lane: OpenRouter

> Hermes owns this. Do not duplicate. When Hermes returns, acceptance criteria:

- [ ] OLR-1: OpenRouter works with multiple unrelated valid models
- [ ] OLR-2: Provider switch survives model switch
- [ ] OLR-3: Model switch does not silently reset provider/model state
- [ ] OLR-4: Raw model IDs survive unchanged
- [ ] OLR-5: Real upstream errors survive (not all converted to "model doesn't exist/access")
- [ ] OLR-6: Live catalogue and execution use the correct endpoint
- [ ] OLR-7: AUTO routing works
- [ ] OLR-8: Manual provider + manual model works
- [ ] OLR-9: Manual provider + AUTO works
- [ ] OLR-10: AUTO provider + explicit model works
- [ ] OLR-11: Catalogue failure doesn't brick known-working manually pinned models
- [ ] OLR-12: MiniMax remains green after OpenRouter repair
- [ ] OLR-13: Run provider regression tests

---

## Deferred: Installer / Release

> Do not resume until all P0/P1 release gates are green.

The work is NOT LOST. Installer already fixed:
- PS5.1 UTF-8/BOM parsing
- `.env` tripwire false positives
- Long-path stale payload cleanup
- Timestamped payload directories
- `Copy-Item` / `robocopy`
- SFX discovery/fallback

When P0/P1 gates are satisfied:

- [ ] REL-1: Freeze production tree
- [ ] REL-2: Regenerate clean staging from canonical manifest
- [ ] REL-3: Re-run never-ship/security tripwire
- [ ] REL-4: Build EXE
- [ ] REL-5: Test on a **clean stranger machine/account** (not dev box)
- [ ] REL-6: First-run onboarding
- [ ] REL-7: Provider setup
- [ ] REL-8: Chat/tool/plugin smoke tests
- [ ] REL-9: Upgrade test
- [ ] REL-10: Uninstall/reinstall test
- [ ] REL-11: Portable-path test
- [ ] REL-12: Long-path test
- [ ] REL-13: Offline/degraded test
- [ ] REL-14: Generate checksums/receipts
- [ ] REL-15: Release

---

## EXECUTION ORDER

```
1. frogAlert crash              (P0-A Fix 1 — DONE)
2. Chat regression tests        (P0-A Fix 2 — IN PROGRESS)
3. Generic WidgetHost proof     (P0-B Fix 1)
4. Canonical plugin tree        (P0-B Fix 4)
5. Plugin install / restart UX  (P0-B Fix 8-10)
6. App-surface E2E audit       (P0-C)
7. Mobile liquid nav + real-phone (P0-D)
8. Desktop BIOS/onboarding     (P0-E)
9. Remaining QoL/parity         (P0-G)
10. Orchestration/work leases   (P1)
11. Managed integrations        (P1)
12. OpenRouter (when Hermes returns) (separate lane)
13. Release gate               (deferred)
14. Installer                  (deferred — last)
```

---

## DON'T REBUILD / DON'T DUPLICATE

- [x] Plugin manager core — EXISTS
- [x] WidgetHost — DO NOT replace with another widget framework
- [x] OpenRouter repair — Hermes owns this
- [x] Installer — deferred, work preserved
- [x] Managed integrations — extend, don't rebuild

---

## ALREADY DONE (evidence-backed)

- [x] Constitution preflight (all 10 canonical docs)
- [x] UI truth lanes 6-14 (20/20 live endpoints)
- [x] Manual pin fail-closed (6/6)
- [x] AUTO pin leak fix
- [x] Tool-result secret redaction
- [x] Secret/AUTO routing suite (34/34)
- [x] Registry latency fix (~5.3s → ~70ms)
- [x] OpenPurp Phase H cert (34/34)
- [x] Provider catalogue truth (415 models, 22 free, zero false positives)
- [x] Canonical plugin identity and lifecycle
- [x] Plugin operator grants and isolated child-process boundary
- [x] Holographic icon pack structural validation
- [x] Portable plugin/Marketplace state
- [x] Standard profile shell bypass added (P0-A — just now)
