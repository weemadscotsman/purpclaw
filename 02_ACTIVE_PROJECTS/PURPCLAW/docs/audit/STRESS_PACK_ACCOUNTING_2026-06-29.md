# STRESS Pack Accounting — 2026-06-29

**Input:** `STRESS/` (22 docs, dated 2026-06-13 to 2026-06-14)
**Output:** `docs/audit/STRESS_PACK_ACCOUNTING_2026-06-29.md`
**Classification standard:** `ACTIVE_EVIDENCE / HISTORICAL_STRESS_PACK`
**Date of comparison:** 2026-06-29

---

## Rule: Do not copy STRESS numbers into current docs

STRESS numbers are historical flight-recorder data. They are **evidence of what was true in mid-June**, not current runtime truth. Current truth must be re-probed from live services, `purpclaw doctor`, `purpclaw status`, `skills_registry.json`, and `registry/`.

---

## Doc-by-Doc Accounting

### `STRESS/PURPCLAW-SERVICE-MAP.md`
**Date:** 2026-06-14 | **Classification:** `HISTORICAL_RUNTIME_MAP`

| STRESS claim | Current runtime proof | Verdict |
|---|---|---|
| 14 PM2 services online | **Must re-run `pm2 list`** — session shows 0 PM2 processes online as of 2026-06-29 | Historical until re-probed |
| 6 services currently online | Same — PM2 not running | Historical |
| 19 services defined-but-dark | Ecosystem.config.js still has these entries | **Still accurate** (dark cluster definition preserved) |
| 11 dark services (voice, vision, chorus, avatar, STT, etc.) | ecosystem.config.js entries still present: `purpclaw-chorus`, `purpclaw-vision`, `purpclaw-voice` | **Still accurate** |
| Native tools: **456** (378 Hermes skills) | skills_registry.json: **379 skills**, 85 runtime agents | Stale — different counting system (tools vs skills vs agents) |
| Live chat via Ollama fallback | `lib/llm-provider.js` shows Ollama as `local` lane | Still wired but NVIDIA now primary free lane |
| Port 7781 = voice-coordinator | lib/runtime/ports.js: `VOICE: 7781` | **Still accurate** |
| Purpclaw-chorus in dark cluster | ecosystem.config.js: `purpclaw-chorus` entry exists | **Still accurate** |

**Useful doctrine extracted:** Dark cluster = defined-but-dark, not deleted. "The `defined-but-dark` design is the right call."

---

### `STRESS/AUDIT-FULL.md`
**Date:** 2026-06-13 | **Classification:** `AUDIT_PROVENANCE`

| STRESS finding | Current state | Verdict |
|---|---|---|
| 14 PM2 services, mostly healthy | PM2 not running 2026-06-29 | Historical |
| 13/21 services up per `/api/services` | Unknown — services not probed | Historical |
| P0-1: Tower never executes tools | Partially fixed — tool execution wired per session notes | **Partially resolved** |
| P0-2: SpendGate misfire (1000 token cap on 3,697 actual) | SpendGate cap raised per session notes | **Resolved** |
| P0-3: 5 unauth'd routes at Next layer | Auth infrastructure present | **Partially resolved** |
| P0-4: `/api/skyscraper` 404 | Needs verification | Unknown |
| P1: Narrator pre-fires 14 events | `narrateEvent` still in CommandPanel.tsx | Historical finding — may still be present |
| L3: Tower tool-call records but doesn't execute | Tool execution wired per session notes | **Resolved** |
| L11: SpendGate 200 OK with empty reply | SpendGate cap issue resolved | **Resolved** |
| 6 dead route families (shaman, kimi, sessions, security, gestures, goop) | Shaman routes still in unified_api.js (8 routes) | Partially accurate — some routes now have partial UI |

**Useful doctrine extracted:** "Gated, not gutted. Real, not simulated. Wired, not hidden. Verified, not claimed."

---

### `STRESS/AUDIT-MASTER.md`
**Date:** 2026-06-13 | **Classification:** `AUDIT_PROVENANCE`

| STRESS finding | Current state | Verdict |
|---|---|---|
| P0 deception: OBLITERATUS theatre (canned setTimeout) | `unified_api.js` still has OBLITERATUS routes | **Still theatrical** — pending real model integration |
| P0 evidence: `enforceExactFileProof` fabricates tool evidence | Helper exists in agent_tower.js | **Still present** — evidence fabrication risk |
| P0 security: 23 routes full-body passthrough + zero auth | `checkOperator` wired in Next routes | **Partially resolved** |
| P1: 4 cosplay UI elements | Mochi unhatched, narrator events | Partially resolved |
| P2: 30+ stub 200-OK routes | Still present | Historical |

**Useful doctrine extracted:** Pre-prompt compiler (191 lines, `lib/runtime/preprompt-compiler.js`) is the **real** command-law layer. OBLITERATUS is a separate, theatrical refusal-ablation sandbox that was confused with the compiler.

---

### `STRESS/DEEP-AUDIT.md`
**Date:** 2026-06-13 | **Classification:** `AUDIT_PROVENANCE`

| STRESS finding | Current state | Verdict |
|---|---|---|
| OBLITERATUS is pure theatre | Confirmed 2026-06-13 | Still theatrical |
| `enforceExactFileProof` fabricates evidence | Evidence fabrication backdoor | Still present |
| SSRF in `/api/bridge` custom provider | Needs security review | Unknown |
| 11 state files do non-atomic writes | No atomic-write helper found | Likely still present |
| Orchestrator hardening: 7/13 areas wired | `lib/orchestrator-hardening.js` shipped | **Wired per ORCHESTRATOR-HARDENING.md** |
| `/api/shaman/*` — 10 routes, no UI | 8 shaman routes still in unified_api.js | Partially accurate |
| 30+ stub 200-OK routes with 0 UI callers | Still present | Historical |
| `lib/omni/truth-scanner.js` Phase 1 | OmniCode MCP server supersedes this | Superseded by OmniCode |
| OMNI-SURGEON 6 phases | OmniCode MCP tools operational | Superseded by OmniCode |
| `scripts/test-release-gate.js` exits 0 on failure | Needs test hygiene review | Unknown |

**Useful doctrine extracted:** "Wired, not hidden. Verified, not claimed." 11 atomic-write findings = backlog items for data-integrity sprint.

---

### `STRESS/PROVIDER-ROUTING-DOCTRINE.md`
**Date:** 2026-06-14 | **Classification:** `PROVIDER_PROVENANCE`

| STRESS claim | Current state | Verdict |
|---|---|---|
| 10 lanes all working | 17 providers in lib/llm-provider.js | Superseded — lane count increased |
| PRIMARY: minimax (MiniMax-M2.7) | MINIMAX still active per session notes | **Still accurate** |
| SWARM/DIVISION/CODE/REASONING: nvidia NIM | NVIDIA NIM still available | **Still accurate** |
| FALLBACK: nvidia hosted llama | NVIDIA NIM still available | **Still accurate** |
| LOCAL: ollama | Ollama still in provider map | **Still accurate** |
| kimi removed (key expired) | kimi removed | **Still accurate** |
| github-models removed | GitHub Models removed | **Still accurate** |
| 4 NVIDIA keys per lane | Provider routing still multi-key | **Still accurate** |

**Useful doctrine extracted:** NVIDIA NIM as free tier = canonical free lane for SWARM/DIVISION/CODE/REASONING. Routing doctrine: privacy → explicit override → task type → FALLBACK.

---

### `STRESS/OMNI-SURGEON-MASTER-SPEC.md`
**Date:** 2026-06-13 | **Classification:** `OMNI_PROVENANCE`

| STRESS claim | Current state | Verdict |
|---|---|---|
| Phase 1: Repo Truth Scanner → `agent_work/omni/truth-snapshot.json` | Superseded by OmniCode MCP `omni_truth_scan` | **Superseded** |
| Phase 2: Feature Registry Builder → `agent_work/omni/feature-registry.json` | Superseded by OmniCode MCP `omni_feature_registry` | **Superseded** |
| Phase 3: Patch Governor (6 rules) | Superseded by OmniCode MCP `omni_patch_review` | **Superseded** |
| Phase 4: AGENT.md + LOOP.md generator | docs/AGENT.md and docs/LOOP.md may still exist | **Verify** |
| Phase 5: Cockpit UI at `/omni` + 6 API routes | app/omni/page.tsx + 6 routes | **Verify** |
| Phase 6: Provider Integrity Engine | Superseded by OmniCode MCP `omni_provider_integrity` | **Superseded** |
| All 6 phases complete and live | OmniCode MCP server now canonical | **Superseded by different implementation** |

**Useful doctrine extracted:** 24 `actionRequired` features in the registry = backlog queue. OMNI-SURGEON loop (audit → cross-check → plan → repair → verify → document → repeat) = standing improvement process. Per `SOUL.md`, OmniCode MCP is now the live implementation.

---

### `STRESS/AUDIT-CYCLE6-OBLITERATUS.md`
**Date:** 2026-06-13 | **Classification:** `AUDIT_PROVENANCE`

| STRESS finding | Current state | Verdict |
|---|---|---|
| Pre-prompt compiler (`lib/runtime/preprompt-compiler.js`) is REAL, wired, audited | Confirmed existing | **Still real** |
| OBLITERATUS routes (unified_api.js) are THEATRE | Canned setTimeout responses | **Still theatrical** |
| AbliteratorPanel wired to theatrical routes | AbliteratorPanel may still show fake state | **Partially resolved** |
| Two features sharing the name "OBLITERATUS" | Pre-prompt compiler vs refusal-ablation sandbox | **Naming confusion resolved in docs** |

**Key clarification:** Pre-prompt compiler IS the "command-law layer" the user described. OBLITERATUS routes are a separate refusal-ablation sandbox. Three resolution options were offered (rename/wire real/pending mark). **No decision on record** — feature remains theatrical pending operator choice.

---

### `STRESS/ORCHESTRATOR-HARDENING.md`
**Date:** 2026-06-14 | **Classification:** `ACTIVE_DOCTRINE / ORCHESTRATOR_PROVENANCE`

| STRESS claim | Current state | Verdict |
|---|---|---|
| `lib/orchestrator-hardening.js` shipped (280 lines) | File exists | **Verify** |
| 7/13 wizard areas wired | Per doc | **Verify** |
| Circuit breaker for tower/state/api/eventbus | In hardening module | **Verify** |
| BoundedMap, rate limiter, persistence, graceful shutdown | Helpers shipped | **Verify** |

**Useful doctrine extracted:** 6 deferred wiring items (rate limiter, body cap, workflow timeout, BoundedMap, persistence, graceful shutdown). Each = 1-3 line change when ready. Wizard metaphor: parse → validate → governance → execute → recover → persist → drain → bounded memory → inter-service calls → refuse bad input → refuse floods → idempotent.

---

### `STRESS/DAY1-PATCHES.md`
**Date:** 2026-06-13 | **Classification:** `AUDIT_PROVENANCE`

| Patch | Status |
|---|---|
| P0 evidence fabrication (`enforceExactFileProof`) | Not deleted per doctrine — evidence fabrication risk remains |
| P0 OBLITERATUS | Not resolved — still theatrical |
| P0 auth tokens | Partially resolved |
| P0 5 unauth'd routes | Partially resolved |
| P0 `/api/skyscraper` 404 | Unknown |
| P1 Narrator pre-fires | Likely still present |
| P2 30+ stub routes | Historical |

---

### `STRESS/DEEP-AUDIT-REPORT.md`
**Date:** 2026-06-14 | **Classification:** `AUDIT_PROVENANCE`

Shorter summary doc referencing the full DEEP-AUDIT.md. Key findings align with DEEP-AUDIT.md above. Confirms the "hybrid model" (PM2 core + module logic) is the correct architectural shape.

---

### `STRESS/SHIP-PATCHES.md`
**Date:** 2026-06-12 | **Classification:** `PATCH_PROVENANCE`

| Patch | What it does | Current state |
|---|---|---|
| Ship Patch #1 | `operator-auth.ts` fail-closed in production; ecosystem pass-through | **Verify** |
| Ship Patch #2 | service-proxy per-port method allowlist | **Verify** |
| Ship Patch #3 | Voice router HMAC signed approval tokens | **Verify** |

All 3 ship patches are architectural hardening items. Applied state unknown — verify against current source.

---

### `STRESS/SURFACE-AUDIT.md`
**Date:** 2026-06-13 | **Classification:** `AUDIT_PROVENANCE`

Early surface audit. Findings superseded by DEEP-AUDIT.md and AUDIT-MASTER.md. Key: the "10-hour ship-blocker" snapshot was looking at older code — several issues already fixed. B7/B8 (Math.random in Voice/CockpitShell) were **wrong** — grep confirmed no random metrics in those files.

---

### `STRESS/CYCLE-01.md`
**Date:** 2026-06-13 | **Classification:** `AUDIT_PROVENANCE`

Cycle 1 audit doc. References Round 1 (B2/B3/B4/B5/B11/B13) — ship patches. Superseded by later rounds.

---

### `STRESS/LOOP.md`
**Date:** 2026-06-14 | **Classification:** `ACTIVE_DOCTRINE`

The agent loop doc — `docs/LOOP.md` may have been generated from this. Verbatim: "audit → cross-check → plan → repair → verify → document → repeat." Encodes the standing improvement cycle for the registry.

---

### `STRESS/NVIDIA-NIM-SKILLS.md`
**Date:** 2026-06-13 | **Classification:** `PROVIDER_PROVENANCE`

| STRESS claim | Current state | Verdict |
|---|---|---|
| NVIDIA NIM free tier for SWARM/CODE/REASONING lanes | NVIDIA NIM still in provider map | **Still accurate** |
| `deepseek-coder-6.7b-instruct` via NVIDIA | Still available | **Still accurate** |
| `meta/llama-3.1-70b-instruct` via NVIDIA | Still available | **Still accurate** |
| NVIDIA API keys: purp1/purp2/purp3/hermes | Multi-key routing still in place | **Still accurate** |

**Key finding:** Free inference via NVIDIA NIM means CODE/REASONING/FALLBACK lanes don't need topped-up direct keys. Cost discipline maintained.

---

### `STRESS/LOCAL-LLM-SETUP.md`
**Date:** 2026-06-13 | **Classification:** `LOCAL_PROVIDER_PROVENANCE`

| STRESS claim | Current state | Verdict |
|---|---|---|
| Ollama as local lane | Ollama still in provider map | **Still accurate** |
| qwen2.5:3b as default local model | qwen2.5 in model list | **Still accurate** |
| PRIVATE_MODE → ollama | Privacy routing still wired | **Still accurate** |
| Local LLM for cheap tool loops | Local lane still available | **Still accurate** |

---

### `STRESS/AUDIO-STACK.md`
**Date:** 2026-06-13 | **Classification:** `MEDIA_SERVICE_PROVENANCE`

| STRESS finding | Current state | Verdict |
|---|---|---|
| Voice coordinator on port 7781 (not 8781) | lib/runtime/ports.js confirms | **Accurate** |
| STT: `slower-whisper` installed | Per session notes: slower-whisper 1.2.1 installed | **Accurate** |
| TTS: `speak_kokoro.py` with pygame.mixer | Per session notes: pygame.mixer playback wired | **Accurate** |
| Voice coordinator: HMAC signed tokens required | `lib/runtime/voice-router.js` has HMAC | **Wired** |
| TTS gateway on :7799 | Per session notes | **Accurate** |
| STT gateway on :7896 | Per session notes | **Accurate** |
| Voice destructive commands require signed approval | Voice router evaluates `FACTORY_COMMAND` | **Wired** |

---

### `STRESS/AUDIT-DAY2-VERIFY.md`
**Date:** 2026-06-14 | **Classification:** `AUDIT_PROVENANCE`

Day 2 verification doc. Aligns with ORCHESTRATOR-HARDENING.md and SERVICE-MAP.md findings. Confirms orchestrator hardening shipped and 14-service baseline verified.

---

### `STRESS/OMNI-OMNICODE-INTEGRATION.md`
**Date:** 2026-06-13 | **Classification:** `OMNI_PROVENANCE`

Early OMNI integration doc. OMNI-SURGEON-MASTER-SPEC.md supersedes this.

---

### `STRESS/OMNI-SURGEON-PHASE-ONE.md`
**Date:** 2026-06-13 | **Classification:** `OMNI_PROVENANCE`

Phase 1 of OMNI-SURGEON. Superseded by OMNI-SURGEON-MASTER-SPEC.md.

---

### `STRESS/OMNI-SURGEON-PHASE-TWO.md`
**Date:** 2026-06-13 | **Classification:** `OMNI_PROVENANCE`

Phase 2 of OMNI-SURGEON. Superseded by OMNI-SURGEON-MASTER-SPEC.md.

---

### `STRESS/MODEL-DISCOVERY-CRON.md`
**Date:** 2026-06-13 | **Classification:** `ACTIVE_DOCTRINE`

Model auto-discovery cron job spec. Per session notes: `model-auto-discovery` skill exists. Verify if cron job is active.

---

## Hard Numbers Comparison

| Category | STRESS (2026-06-13/14) | Current (2026-06-29) | Verdict |
|---|---|---|---|
| PM2 services online | 6-14 | 0 (PM2 not running) | Historical — re-probe needed |
| Dark cluster services | 11 | ecosystem.config.js entries still present | **Still accurate** |
| Skills | 378 Hermes skills | 379 in skills_registry.json | Close — consistent counting |
| Runtime agents | 73 / 85 (SERVICES doc vs AUDIT doc) | 85 runtime agents, 95 souls | **Updated count** |
| Providers | 17 | 17+ in llm-provider.js | **Still accurate** |
| Native tools | 456 | 78 native + 42 OmniCode MCP | Different counting system (includes MCP) |
| API routes (unified_api) | ~81 in switch | ~81 | **Consistent** |
| Ports probed | 21 | Unknown | Re-probe needed |
| OBLITERATUS state | Theatre (canned) | Theatre (canned) | **Still theatrical** |
| Pre-prompt profiles | 7 | 7 (still in preprompt-compiler.js) | **Still accurate** |

---

## What STRESS Adds to the Map

### 1. Dark Cluster Classification (still valid)

```
defined-but-dark = correct design pattern
Not deleted, not broken — intentionally parked

Dark cluster members (still in ecosystem.config.js):
- purpclaw-voice         (TTS/STT)
- purpclaw-voice-ingress (STT)
- purpclaw-bridge        (voice bridge)
- purpclaw-vision        (vision monitor)
- purpclaw-yolo          (YOLO detection)
- purpclaw-avatar        (avatar bridge)
- purpclaw-chorus        (companion chorus)
- purpclaw-stt           (speech-to-text)
- purpclaw-reasoning     (reasoning loop)
- purpclaw-telegram      (Telegram gateway)
- purpclaw-thringlet     (thringlet bridge)
```

### 2. Service Communication Model (still valid)

```
All 14 core services communicate through:
- HTTP endpoint (per-port table)
- Event bus (port 7780)
- State store (port 7782)
- Worker queue (pool + workers)
- Memory client (port 7880)
- MCP/tool bridge (bin/purpclaw.js CLI)

No "raccoons in a trench coat" — clear role + clear pipe per service
```

### 3. Companion Ecology Proof (still valid)

```
STRESS confirms:
- purpclaw-chorus exists in ecosystem.config.js
- Companion Chorus = defined-but-dark, not missing
- Digital Shaman = 8 wired routes, partial state
- Shaman Evaluator monitors trip state + phase transitions
- Shaman Prompts = ritual templates + archetype masks

Corrected statement:
"Companion Ecology was not missing.
 It existed as scattered dark-cluster/prototype/partial code.
 Now needs canonical registry + UI exposure."
```

### 4. Cognitive Spine Proof (still valid)

```
Uploaded cognitive_spine(2).py proves:
- Unified Python HTTP surface for: memory, rules, modal logic,
  diagnostics, neuro-symbolic bridge, AutoDream, realtime bridge,
  Spring Doctrine
- AutoDream = real memory consolidation engine
- State file shows prior consolidation cycles

UI should include: Cognitive Spine, Memory Matrix, Rules Engine,
Modal Logic, AutoDream, Spring Doctrine — not buried under "misc Python"
```

### 5. Provider Routing Doctrine (still valid)

```
Primary: minimax (MiniMax-M2.7)
Free lanes: NVIDIA NIM (SWARM/DIVISION/CODE/REASONING/FALLBACK)
Local lane: ollama (qwen2.5)
Privacy → explicit override → task type → FALLBACK
```

### 6. Orchestrator Wizard Areas (partially wired)

```
Parse ✅ | Validate ✅ | Governance ✅ | Execute ⚠️
Recover ⚠️ | Persist ⚠️ | Drain ⚠️ | Bounded ⚠️
Inter-service ⚠️ | Refuse bad input ✅ | Refuse floods ⚠️ | Idempotent ⚠️
```

---

## Backlog Items Extracted from STRESS

| Item | Source doc | Priority |
|---|---|---|
| `enforceExactFileProof` — remove or rename | AUDIT-MASTER, DEEP-AUDIT | P0 |
| OBLITERATUS — decide: rename / wire real model / pending mark | AUDIT-CYCLE6-OBLITERATUS | P0 (decision needed) |
| Verify ship patches 1/2/3 applied | SHIP-PATCHES | P1 |
| Wire remaining 6 orchestrator hardening items | ORCHESTRATOR-HARDENING | P1 |
| 11 atomic-write fixes (state files) | DEEP-AUDIT | P2 |
| Narrator pre-fires 14 events | DEEP-AUDIT | P2 |
| 30+ stub 200-OK routes — pending integration or cleanup | DEEP-AUDIT | P2 |
| Verify pre-prompt compiler profiles still 7 | AUDIT-CYCLE6-OBLITERATUS | P2 |

---

## Files to NOT Overwrite with STRESS Numbers

```
ARCHITECTURE.md          — current canonical truth
LAUNCH.md                — current launch state
QUICKSTART.md            — current setup instructions
docs/AGENT.md            — may be generated from STRESS/LOOP.md (verify)
docs/LOOP.md             — may be generated from STRESS/LOOP.md (verify)
SERVICE_RUNTIME_INDEX.md — current service state
STUDIO_CANONICAL.md      — current studio state
```

---

**End of accounting. STRESS is the black box flight recorder from the previous war. Use it to explain how PURPCLAW got here. Do not let it lie about what PURPCLAW is today.**

---

## Verification Round 2 — 2026-06-29 Evening (live probes)

| Item | STRESS claim | Live probe result | Verdict |
|------|-------------|-------------------|---------|
| `enforceExactFileProof` | Still present in agent_tower.js | **NOT FOUND** — grep confirms clean | ✅ **FIXED** |
| OBLITERATUS hardcoded scanPoints | Still theatrical in unified_api.js | **CONFIRMED** — 10 hardcoded points at line 2837, setTimeout 1500ms | ⚠️ **Still theatrical** |
| OBLITERATUS in UI | AbliteratorPanel may show fake state | **No abliterator panel found in app/** | ✅ **UI removed** |
| Ship Patch #1 (operator-auth fail-closed) | Needs verify | `PURPCLAW_OPERATOR_TOKEN` wired in operator-auth.ts | ✅ **Wired** |
| Orchestrator hardening | 280-line file | **267 lines, BoundedMap present** | ✅ **Shipped** |
| PM2 services | 0 online (stack not running) | **0/27 services responding** | Historical — stack offline |
| Skills | 379 in registry | **379 confirmed** | ✅ Consistent |
| Runtime agents | 85 | **85 confirmed** | ✅ Consistent |
| Souls | 95 | **95 confirmed** | ✅ Consistent |
| Providers | 17 | **21 confirmed** | ✅ Grown |
| Tools native | 78 native + 42 OmniCode | **78 native confirmed** | ✅ Consistent |

### What the live probes confirm

**P0 items status:**
- `enforceExactFileProof` — GONE. Evidence fabrication backdoor removed.
- OBLITERATUS routes — Still theatrical (hardcoded scanPoints), but UI component removed. Theatre without audience.
- Ship Patch #1 — Wired. `PURPCLAW_OPERATOR_TOKEN` present in auth layer.

**Items still requiring operator decision:**
- OBLITERATUS routes — theatrical, no real model integration. Awaiting: rename / wire real / pending mark.
- 30+ stub 200-OK routes — historical, cosmetic, deferred to sprint 2.
- 11 atomic-write fixes — data integrity backlog, deferred.

**Items that grew since STRESS:**
- Providers: 17 → 21 (added Gemini, Cohere, Cloudflare, Atomic Chat)
- Souls: new registry with 95 souls
- AWAKEN: new subsystem (not in STRESS)

---

**Rule for future agents:** When AWAKEN scans, it must compare current state against this doc. If a STRESS claim is now FALSE, it is a DRIFT finding. If a STRESS P0 is now FIXED, it is a CLEAN finding. The historical record is the baseline. Current reality is the truth.
