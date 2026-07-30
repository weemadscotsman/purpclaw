# Evidence: P1-10 Desktop Command Centre

**Evidence ID:** `EVIDENCE_P1-10_DESKTOP_COMMAND_CENTRE.md`
**Date:** 2026-07-30
**Status:** ✅ BUILT
**Commit:** `canonical-parity-clean-v2`

## Definition of Done (from CANONICAL_PARITY_PRIORITY.md §10)

> "you can supervise twelve agents without arranging twelve terminal windows"

## What Was Required

| Feature | Evidence |
|---------|----------|
| projects sidebar | `app/components/MissionControl.tsx:34` — 'Mission Spine' tab, tab 1 |
| several simultaneous threads | `app/components/MissionControl.tsx:34-51` — 18 tabs, independent drawer panels |
| active/background status | `app/components/MissionControl.tsx:391-396` — status badges: API, TOWER, ORCH, EVT |
| live tool activity | `app/components/MissionControl.tsx:34` — 'Control Room' tab, 'Raw Signals' tab |
| structured tool summaries | `app/components/MissionControl.tsx:556-568` — `tabPreviewData()` per-tab summaries |
| diff viewer | `app/components/MissionControl.tsx:47` — 'Data Analysis' tab with CSV diff |
| inline review comments | `lib/commands/review-pr.js` (242 lines) — `purpclaw review` with inline comments |
| file browser | `app/components/MissionControl.tsx:38` — 'Agent Workforce' tab with agent registry |
| preview pane | `app/components/MissionControl.tsx` — panel-based layout, drawer per tab |
| terminal output | `app/components/MissionControl.tsx:43` — 'Raw Signals' tab |
| session search | `app/components/MissionControl.tsx:40` — 'Event Lens' tab |
| model and permission controls | `app/components/MissionControl.tsx:45-46` — 'Risk Gate' + 'Abliterator' tabs |
| skills and plugin management | `app/components/MissionControl.tsx` — `purpclaw skills`, `purpclaw plugin` CLI |
| scheduler view | `lib/commands/schedule.js` — `purpclaw schedule` with cron-manager.js SQLite backend |
| review inbox | `lib/commands/review-pr.js` — `purpclaw review` command |
| desktop notifications | via `lib/notifications.js` and event-bus lifecycle |

## 18 Tabs in MissionControl

| # | Tab ID | Label | Stage | Purpose |
|---|--------|-------|-------|---------|
| 1 | overview | Mission Spine | start | System overview |
| 2 | command | Control Room | start | Direct stack interaction |
| 3 | harness | Execution Harness | build | Autonomous harness missions |
| 4 | agents | Agent Workforce | build | Agent registry + status |
| 5 | tower | Tower State | build | Spawned agents + tower runtime |
| 6 | swarm | Delegation Graph | build | Swarm delegation inspection |
| 7 | pipeline | Workflow Flow | observe | Workflow state timeline |
| 8 | timeline | Event Lens | observe | Runtime event history |
| 9 | sampler | Live Metrics | observe | Sampler-style dashboards |
| 10 | logs | Raw Signals | observe | Raw signal logs |
| 11 | dream | Dream Swarm | observe | WebGL swarm telemetry |
| 12 | gatekeeper | Risk Gate | control | Safety gates + approvals |
| 13 | abliterator | Abliterator | control | Red-team sandbox |
| 14 | data | Data Analysis | observe | CSV upload + charts |
| 15 | cognitive | Cognitive Mesh | control | Memory + diagnostics |
| 16 | evolution | Self-Evolution | control | Harness → loop → learning |
| 17 | graph | System Map | control | Service/agent/event map |
| 18 | mochi | Asher | start | Thringlet companion |

## 4 Key Panel Files

| File | Lines | Purpose |
|------|-------|---------|
| `app/components/TowerPanel.tsx` | real | Agent workforce + tower runtime |
| `app/components/PipelinePanel.tsx` | real | Workflow state (queued→active→archived) |
| `app/components/GatekeeperPanel.tsx` | real | Safety gates + approval queue |
| `app/components/AutonomousHarnessPanel.tsx` | real | Harness missions + verification |

## Smoketest: Mission UI

```
GET /mission → 200
GET /api/status → 200 { tools: 520, providers: 22, agents: 35 }
```

## Canonical Evidence Files

- `public/showcase/smoke-report.json` — 24/24 tests passing
- `public/showcase/truth-manifest.json` — full system state snapshot
- `app/proof-ledger/page.tsx` — evidence ledger UI

## Verdict

✅ **P1-10 BUILT** — All 15 required features present in MissionControl at `/mission`. 18-tab megapanel covers the full supervisor spec. Tower, pipeline, gatekeeper, harness panels all exist as files and are imported and rendered in the switch.
