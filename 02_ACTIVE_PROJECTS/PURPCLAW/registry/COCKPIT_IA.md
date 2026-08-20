# Cockpit Information Architecture — canonical

**Rule:** seven surfaces, nothing more. Every useful thing from the 30 donor
pages / 44 components / 302 API handlers collapses INTO one of these seven as a
panel, tab, drawer, or control. No feature gets its own kingdom.

Surfaces: **Missions · Agents · Tools · Skills · Projects · Memory · Settings**

Backing status legend:
- 🟢 REAL — endpoint exists and the cockpit reads it today
- 🟡 PARTIAL — some real state; needs more endpoint or persistence
- 🔴 PENDING — needs backend Hermes owns (drivers / capability registry / discovery)

Verdict legend (donor → cockpit): PORT · MERGE · REDESIGN · KEEP (cockpit already better) · REJECT · BACKEND (concept good, needs real endpoint)

---

## 1. Donor → surface map (30 pages)

| Donor page | Target surface | Section | Verdict | Note |
|---|---|---|---|---|
| chat | Missions | composer | KEEP | cockpit composer is the destination |
| cockpit | — | — | KEEP | old shell; replaced by lightweight cockpit |
| mission | Missions | detail | MERGE | MissionTrace detail (plan→dispatch→tools→proof) into mission record |
| dash / overview | Missions | home | MERGE | fold overview stats into Missions header; no separate page |
| pipeline | Missions | execution | MERGE | pipeline/proof view = mission execution + evidence |
| proof-ledger | Missions | evidence | PORT | Accuracy Fish verdicts already recorded in missions.js |
| agents | Agents | roster | KEEP | cockpit reads canonical 44-agent registry |
| swarm | Agents | swarm | MERGE | swarm orchestration as an Agents tab |
| skyscraper | Agents | activity | REDESIGN | tower viz is decorative; keep only live status |
| abliterator | Tools | model-surgery | MERGE | a capability, not a page |
| grok | Tools | browser/computer | MERGE | superseded by the new browser subsystem |
| liveforge | Skills | skill-forge | MERGE | skill authoring/build |
| frameworks | Settings | Runtime | BACKEND | runtime/framework controls |
| memory | Memory | vault | KEEP | cockpit vault + settings/memory are the destination |
| spine | Memory | layers | MERGE | cognitive spine viz into layer view |
| stream | Missions | activity | MERGE | event stream = activity feed, not a page |
| omni | Settings | Diagnostics | MERGE | observability into diagnostics |
| system-map | Settings | Diagnostics | REDESIGN | service map into diagnostics; drop the eye-candy |
| providers | Settings | AI & Providers | PORT | 🟢 real: /api/backends + switch |
| evolution | Settings | Evolution | BACKEND | self-improvement controls |
| preprompt | Settings | Personality | BACKEND | system-prompt / personality |
| mochi | Settings | Avatar | BACKEND | avatar |
| voice | Settings | Voice | BACKEND | STT / TTS / wake |
| bridge | Settings | MCP & Integrations | BACKEND | Xiaozhi/MCP bridge |
| awaken / dawn | Settings | General/First-run | REJECT | onboarding shells; fold a minimal first-run into General |
| inline | — | — | REJECT | inline-mode experiment |
| market-lab | — | — | REJECT | out of scope; 4am creature |
| gallery | Projects | artifacts | MERGE | media as project artifacts |

Components collapse the same way (AgentCard/AgentList/AgentTower→Agents;
MissionControl/MissionTrace→Missions; SamplerPanel/PersonalityDial→Settings;
MochiAvatar/MochiWidget→Settings→Avatar; ServiceHealthGrid→Settings→Diagnostics;
CockpitShell/ShellRouter→REJECT, replaced).

---

## 2. Canonical Settings IA

Grouped, each section tagged by backing status. This is the contract: 🟢 I wire
now; 🔴 needs Hermes's driver/capability/discovery backend before it becomes a
real control (never a dead toggle).

**GENERAL**
- Appearance / Interface — 🟡 client-local (theme, density)
- First-run — 🔴 (from awaken/dawn, minimal)
- Accessibility — 🔴

**AI**
- AI & Providers — 🟢 /api/backends, /api/backends/switch
- Models & Routing — 🟡 activeBackend real; routing policy = Hermes
- Speed / Intelligence defaults — 🟡 envelope defaults (client)

**MEMORY**  (mostly done)
- Memory engine — 🟢 /api/settings/memory
- Déjà Vu — 🟢 (memory-config.recall.dejaVu)
- Retention / Privacy — 🟡 retentionDays real; privacy pending
- AutoDream / Consolidation — 🔴

**CONTROL**  (Hermes's lane)
- Native Control — 🔴 drivers
- Drivers & Capabilities — 🔴 capability-registry (P0-004) + driver-inventory (P0-002)
- Browser — 🟡 browser-session exists; expose profile/persistence
- Permissions / Access — 🟡 permission profiles real; needs persisted defaults endpoint

**AGENTS**
- Agent defaults / concurrency / delegation — 🔴
- Swarm — 🔴
- Souls / Personality — 🔴 (preprompt)

**IO**
- Voice / STT / TTS — 🔴
- Vision — 🔴
- Avatar (Mochi) — 🔴

**SYSTEM**
- Runtime — 🟢 /api/health
- Diagnostics — 🟡 /api/health, /api/logs
- MCP & Integrations — 🟡 bridge exists
- Storage — 🟡 derivable from disk
- Workers — 🔴
- Portable Mode — 🔴 (P0-011)
- Snapshots / Recovery — 🔴

**VERIFICATION**
- Accuracy Fish — 🟡 audit runs in missions.js; needs a settings endpoint

**EVOLUTION**
- Evolution / Training — 🔴

**PROJECTS**
- Project defaults — 🟢 /api/projects manifest defaults

**SECURITY**
- Vault / SpendGate / Audit — 🟡 /api/security/*
- Privacy — 🔴

**ADVANCED**
- Abliterator / chaos / feature flags — 🟡 tools exist

---

## 3. Build order (cockpit side)

1. 🟢 sections first — AI & Providers, Runtime, Memory (done), Project defaults,
   Diagnostics, Security — real state, no waiting on Hermes.
2. 🟡 sections — add the missing persistence endpoint, then wire.
3. 🔴 sections — rendered as a labelled "pending backend" list, NOT dead
   toggles, until Hermes's driver/capability/discovery endpoints land; then wire.

The Drivers & Capabilities view lives inside Settings→Control (and a read-only
mirror in Tools), reading Hermes's canonical capability registry once it exists:
Capability → eligible drivers → selected native surface → health → verification.

---

## 4. Companion document & old-Settings facts

This file is the **destination** schema (seven surfaces + Settings section tree +
backing status). Its companion is Hermes's **source** audit,
`registry/donor-ui-transplant-spec.md`, which classifies every donor file
(pages, components, routes, hooks) with a per-file verdict. Read together:
Hermes says what each donor piece did; this file says where it lands and whether
the backend exists. Neither re-classifies the other's rows.

Confirmed facts about the donor `app/settings/page.tsx` (from Hermes's read):
- Right-rail "Live Preview" telemetry (RiskShield, Dream Swarm, Router Flow,
  Mini Sparkline) is **hardcoded/fake** — already flagged as open work in
  app/AGENT.md. Verdict: **REJECT**. Do not transplant fake telemetry.
- Genuinely useful and worth porting:
  - `/api/settings` GET/POST with category filter (core, memory, safety,
    providers, ui, voice) — 🟡 a generic settings store the new sections can use.
  - 5 presets (classic, hybrid, immersive, low-power, full-chaos) → General.
  - Export settings to JSON → General.
  - `PersonalityDial` component → Settings→Personality (real control, 🔴 needs
    the preprompt/personality endpoint).
  - `InlineEditor` / `SecretModalEditor` (secret-safe field editing) → reuse
    for the AI & Providers API-key fields.
- `SettingsSpine.tsx` is referenced in AGENT.md but was **never built** — no
  file exists. Do not hunt for it.

Runtime scale note (Hermes): 89 endpoints in unified_api.js today; the donor
adds ~302 more route handlers. The consolidation target (P0-013) is 3–4
runtimes, so new Settings sections should read the unified_api endpoints, not
resurrect donor routes.
