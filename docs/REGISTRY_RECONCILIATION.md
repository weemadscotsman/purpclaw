# PURPCLAW Registry Drift Audit

> **The #1 launch risk per the Monster Launch Ledger.**
> This document names every registry surface, what it claims, and which one wins.

---

## The Problem

PURPCLAW has **at least six** places that claim authority over "what exists."

If they disagree — and they do — then agents make decisions based on stale truth, rebuild things that already exist, and silently lose capabilities between UI restarts.

**No system gets built before this drift is reconciled.**

---

## The Surfaces

### 1. `service_registry.js` (root)
- **Type:** Runtime service list (PM2-managed processes, ports, health)
- **Used by:** `safe-start.js`, status surfaces, `lib/capability-registry.js` consumer
- **Format:** JS module exporting array of `{name, port, script, ...}` objects
- **Mutability:** Manual edit. No generator.
- **Truth claim:** Authoritative for "what services should be running"

### 2. `lib/capability-registry.js`
- **Type:** Capability catalog (services + ports + idle timeouts + dependencies)
- **Used by:** `lib/capability-registry.js` consumers (TUI health, runtime checks)
- **Format:** JS module exporting registry object
- **Mutability:** Manual edit + possible runtime registration
- **Truth claim:** Authoritative for "what capabilities the system has, including idle timeouts"
- **Conflict with (1):** Both claim service truth. (2) adds timeout/dependency metadata.

### 3. `registry/index.json`
- **Type:** Static skill metadata snapshot (from ECC / community registry)
- **Used by:** `app/api/registry/route.ts` (partially) + manual research
- **Format:** Large JSON, ~1,500+ entries
- **Mutability:** Manual update from upstream
- **Truth claim:** Authoritative for "what skills exist in the broader ECC ecosystem"
- **Conflict with (4)+(5):** Different snapshot than skills actually on disk.

### 4. `skills/skills_registry.json`
- **Type:** Generated skill inventory
- **Used by:** `lib/tools/skills-registry.js` runtime scanner + registry readers
- **Format:** JSON array of `{name, path, type, ...}`
- **Mutability:** Regenerated on `purpclaw tools refresh`
- **Truth claim:** Authoritative for "what skill files actually exist in `skills/`"
- **Conflict with (3):** Snapshot vs filesystem reality.

### 5. `skills/registry.txt`
- **Type:** Plain-text skill index
- **Used by:** Legacy code only — check for active readers via grep
- **Format:** One skill name per line
- **Mutability:** Manual edit
- **Truth claim:** None — vestigial
- **Conflict with (4):** Same question, different format.

### 6. `model_registry.json` (and `PURPCLAW/model_registry.json`)
- **Type:** Model/provider configuration
- **Used by:** LLM provider layer (`lib/llm-provider.js`)
- **Format:** JSON
- **Mutability:** Manual edit
- **Truth claim:** Authoritative for "what LLM providers are configured"
- **Conflict:** Two copies on disk (`PURPCLAW/model_registry.json` is a **stale nested duplicate** that has already caused confusion).

### 7. `app/api/registry/route.ts`
- **Type:** Web route exposing tool + provider registry
- **Used by:** Next.js UI dashboard
- **Format:** HTTP endpoint
- **Mutability:** N/A (read-only route)
- **Truth claim:** Authoritative for "what the dashboard shows about tools/providers"
- **Conflict:** Does not include skill metadata, Hivemind registry, or tasks. Different scope.

### 8. `lib/pipeline-registry.js`
- **Type:** Unified job/pipeline evidence ledger
- **Used by:** Orchestrator, Agent Tower, Gatekeeper
- **Format:** JS module + runtime state
- **Mutability:** Runtime writes
- **Truth claim:** Authoritative for "what pipeline jobs ran"
- **Conflict:** Could diverge from Hivemind traces if not bridged.

### 9. `lib/tools/skills-registry.js`
- **Type:** Runtime skill scanner + registerer (turns skill files into executable tools)
- **Used by:** Tool registry dispatcher
- **Format:** JS module
- **Mutability:** Runtime scan + manual override
- **Truth claim:** Authoritative for "which skills are executable tools RIGHT NOW"
- **Conflict:** Different from (3) metadata-only and (4) filesystem-only.

---

## The Reconciliation Policy

### Single Source of Truth per Concern

| Concern | Canonical registry | Backup / reference |
|---|---|---|
| Services (PM2-managed) | `service_registry.js` | `ecosystem.config.js` (PM2's own list — read-only here) |
| Capabilities (services + timeouts + dependencies) | `lib/capability-registry.js` | Mirror of (1) + extra metadata |
| Skill metadata (snapshot) | `registry/index.json` | Skill library reference — read-only |
| Skill filesystem inventory | `skills/skills_registry.json` | Generated on `tools refresh` |
| Skill runtime executable | `lib/tools/skills-registry.js` | Live tool dispatcher |
| Model/provider config | `model_registry.json` (root) | Delete `PURPCLAW/model_registry.json` (stale nested copy) |
| Pipeline jobs | `lib/pipeline-registry.js` | Bridged to Hivemind traces |
| Web UI registry | `app/api/registry/route.ts` | Reads tools + providers only |

### Rules

1. **One truth per concern.** Don't store the same fact in two places. If you find yourself editing both, you've created drift.

2. **Derivative registries regenerate from source.** `skills/skills_registry.json` regenerates from `skills/` on `purpclaw tools refresh`. Never hand-edit the generated file.

3. **Stale nested copies are quarantined, not deleted (yet).** `PURPCLAW/model_registry.json` gets moved to `archive/quarantine-2026-06-28/` with a tombstone. Once deletion safety is proven, deleted.

4. **Audit command is canonical.** `purpclaw registry audit` runs all diffs and writes `reports/registry-audit.json` with stability score. This is the only way to check drift.

5. **The Web UI registry route does NOT cover skill metadata or Hivemind.** Its scope is labeled in the UI. Future work: add separate Web routes for those concerns (don't overload).

---

## Batch 1 Patch Plan

**Files to touch (read-mostly):**

- New: `lib/commands/registry-audit.js`
- New: `reports/registry-audit.json` (regenerated on demand)
- New: `docs/REGISTRY_RECONCILIATION.md` (this doc moves to canonical location)
- Modify: `app/api/registry/route.ts` — label scope clearly in response
- Move: `PURPCLAW/model_registry.json` → `archive/quarantine-2026-06-28/PURPCLAW-model_registry.json`
- Move: `skills/registry.txt` → `archive/quarantine-2026-06-28/skills-registry.txt`

**Files NOT touched:**

- Runtime services
- Skill execution paths
- LLM provider config (only the stale copy is moved)
- Anything that would break a running instance

---

## Acceptance Criteria

- [ ] `purpclaw registry audit` runs in <1 second
- [ ] Output lists every registry surface with its truth claim
- [ ] Output flags any surface whose contents differ from canonical
- [ ] Output writes `reports/registry-audit.json` with sha + timestamp
- [ ] Output exits 0 if all consistent, 1 if drift detected
- [ ] CI gate: `purpclaw registry audit` runs before deploy, fails on drift
- [ ] `PURPCLAW/model_registry.json` and `skills/registry.txt` moved to quarantine
- [ ] Web `/api/registry` route documents its limited scope

---

## One-Sentence Version

**Stop having six "what exists" registries. Pick one canonical per concern. Add an audit command. Quarantine the stale copies. Don't touch runtime in Batch 1.**

🦆
---

## Audit Run #1 — Live Output (2026-06-29)

**Command:** `purpclaw registries audit` (also `node bin/purpclaw.js registries audit`)

### Risk Summary

| Severity | Count |
|---|---|
| Critical | **1** |
| High | 0 |
| Medium | 3 |
| Low | 2 |
| **Launch blockers** | **1** |
| Human actions required | 4 |
| **Verdict** | **CRITICAL_DRIFT** |

### Inventory (real numbers from live run)

| Surface | Count | Status |
|---|---|---|
| `service_registry.js` | 22 services (14 required, 8 optional) | Authoritative for runtime services |
| `ecosystem.config.js` | 14 apps | 3 missing vs `service_registry.js` |
| `lib/capability-registry.js` | 22 capabilities | Authoritative for standby capabilities |
| `lib/surface-capabilities.js` | user-facing capabilities | Authoritative for user-facing surface |
| `registry/index.json` | 139 skills + 38 agents | ECC metadata snapshot, 36 days old |
| `skills/skills_registry.json` | **28 entries** | **STALE — should match filesystem** |
| `skills/registry.txt` | 28 entries | Legacy plain-text |
| `skills/` directory | **379 skill folders** | **Filesystem truth** |
| `model_registry.json` (root) | 11 routing keys | Authoritative for model routing |
| `PURPCLAW/model_registry.json` | identical to root | **STALE COPY** |
| `app/api/registry/route.ts` | exists, exposes tools + providers | Scope: runtime only |
| `lib/pipeline-registry.js` | loads OK | Unified job/pipeline spine |

### Recommendations (real, from the audit)

| Severity | Area | Issue | Recommended Action | Blocks Launch? |
|---|---|---|---|---|
| **CRITICAL** | skills | `skills/skills_registry.json` declares only 28 entries but 379 skill folders exist on disk (delta=351) | Regenerate from filesystem OR deprecate as companion-only metadata | **YES** |
| MEDIUM | models | `PURPCLAW/model_registry.json` is a byte-identical stale copy of root | Quarantine to `archive/quarantine/<date>/` (HUMAN APPROVAL REQUIRED) | No |
| MEDIUM | services | Services in `service_registry.js` but missing from `ecosystem.config.js`: `context-bus`, `voice-coordinator`, `voice-bridge` | Add corresponding apps to `ecosystem.config.js` OR remove from `service_registry.js` | No |
| MEDIUM | services | Apps in `ecosystem.config.js` but missing from `service_registry.js`: `purpclaw-voice`, `purpclaw-bridge`, `purpclaw-context` | Add corresponding entries to `service_registry.js` OR remove from `ecosystem.config.js` | No |
| LOW | skills | `skills/registry.txt` is legacy plain-text index (28 entries, companions only) | Document as legacy; no auto-promotion | No |
| LOW | skills | `registry/index.json` last updated 36 days ago (2026-05-24) | Refresh from upstream ECC on next sync window | No |

### Hard Rule Observed

**READ-ONLY.** No quarantine, move, delete, or rewrite performed. All recommendations are advisory. Human approval required for every action.

### Files Touched (Audit Run #1)

- `lib/commands/registry-audit.js` (NEW, 530 lines)
- `bin/purpclaw.js` (added `purpclaw registries audit` + `purpclaw registry-audit audit`)
- `lib/reports/registry-audit.json` (generated, latest run)
- `docs/REGISTRY_RECONCILIATION.md` (this file — Audit Run #1 appended)

### Next Steps (Human Approval Required)

1. **Review the 6 recommendations above.** No actions taken yet.
2. **Approve or reject each one** explicitly.
3. **Then re-run `purpclaw registries audit`** to confirm drift resolved.
4. **Then re-run `node lib/hivemind-test.js`** to confirm the Hivemind loop still closes against known-truth registries.
