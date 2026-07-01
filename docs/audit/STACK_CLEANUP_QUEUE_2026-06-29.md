# PURPCLAW Stack Cleanup Queue — 2026-06-29

> **Purpose:** Ranked action list. Execute in order. No P1 before P0 is done.
> **Rule:** No broad deletes. Small, verified patches only.
> **Status:** READY TO EXECUTE (P0/P1 only — P2/P3 can be batched)

---

## P0 — Immediate Danger

| # | Action | Target | Evidence | Done |
|---|---|---|---|---|
| P0-1 | **DELETE** — zero-byte pathological filename | `=` (root) | Breaks shell tools, ls, git | ⬜ |

---

## P1 — Canonical Ambiguity

| # | Action | Target | Evidence | Done |
|---|---|---|---|---|
| P1-1 | Archive `steering/*.md` to `docs/archive/steering-old-2026-06-29/` | `steering/` (Apr 20) | Duplicate of `steering/steering/` (Jun 6); `steering-loader.js` reads both paths | ⬜ |
| P1-2 | Inspect contents | `data/` | Contents unknown — could be empty or runtime data | ⬜ |
| P1-3 | Inspect contents | `.versioning/` | mtime 2026-06-29 — purpose unknown | ⬜ |
| P1-4 | Inspect — determine if live or legacy | `app/spine/`, `app/cockpit/`, `app/providers/` | Listed in `app/` ls — content unknown | ⬜ |
| P1-5 | Inspect — determine if intentional | `.guardian/` | Appears empty | ⬜ |

**Acceptance:** Only `steering/steering/` (canonical) remains active in `steering/`. Unknowns are inspected and reclassified.

---

## P2 — Stale Docs / Superseded

| # | Action | Target | Evidence | Done |
|---|---|---|---|---|
| P2-1 | Move to `docs/archive/reviews/` | `docs/STALE_DOCS_REVIEW.md` | Named as stale-review | ⬜ |
| P2-2 | Move to `docs/archive/reviews/` | `docs/HARMFUL_DOCS_REVIEW.md` | Named as harmful-review | ⬜ |
| P2-3 | Move to `docs/archive/` | `docs/DUPLICATE_DOCS_REVIEW.md` | Superseded by `HIVEMIND_SIDE_FOLDER_AUDIT.md` | ⬜ |
| P2-4 | Update row to RESOLVED | `docs/audit/FOLDER_INTEGRATION_AUDIT_2026-06-29.md` | Row says "Needs canonical bridge" — action taken this session | ⬜ |
| P2-5 | Delete (superseded by `ARCHITECTURE.md` v0.3.0) | `docs/ARCHITECTURE_MAP.md` | Superseded | ⬜ |
| P2-6 | Delete (superseded) | `docs/STACK_MAP.md` | Superseded | ⬜ |
| P2-7 | Delete (superseded) | `stack-map.json` | Superseded | ⬜ |
| P2-8 | Delete (superseded) | `architecture-graph.json` | Superseded | ⬜ |
| P2-9 | Archive (old, Apr 10) | `trip_logs/` | Very old | ⬜ |
| P2-10 | Archive | `Samantha's Daily Log/` | Personal scratch | ⬜ |
| P2-11 | Archive | `archive/legacy-ui/` | Legacy UI components | ⬜ |

**Acceptance:** No stale doc is presented as canonical. Current canonical docs: `ARCHITECTURE.md`, `LAUNCH.md`, `QUICKSTART.md`, `STUDIO_CANONICAL.md`, `DOCS_INDEX.md`, `STATUS.md`.

---

## P3 — Legacy / Prototype Archiving

| # | Action | Target | Evidence | Done |
|---|---|---|---|---|
| P3-1 | Add `README.md`: "Research-only. Not loaded by runtime." | `ablation_probes/` | Refusal weight ablation experiment | ⬜ |
| P3-2 | Add `README.md`: "Research-only. Not loaded by runtime." | `refusal_ablation_probe/` | Refusal ablation config | ⬜ |
| P3-3 | Archive (dead prototype) | `DreamTask/` | Single file, no refs | ⬜ |
| P3-4 | Archive (orphan subsystem) | `companion-chorus/` | Not wired to runtime | ⬜ |
| P3-5 | Archive (old mission data) | `swarm_mission/` | Robot precision log — evidence only | ⬜ |

**Acceptance:** No dead prototype pretends to be active. Research-only folders have explicit README disclaimers.

---

## P4 — Vendor / Confusing Names

| # | Action | Target | Evidence | Done |
|---|---|---|---|---|
| P4-1 | Rename `.exe` dir to clear name | `.donors/why.exe/` | Named `.exe` but is a directory — breaks tools | ⬜ |

**Acceptance:** No root folder has a pathological name. No `.exe` is a directory.

---

## P5 — Scratch / Temp Cleanup (Low Priority)

| # | Action | Target | Evidence | Done |
|---|---|---|---|---|
| P5-1 | Verify safe to clear (no runtime dependency) | `.tmp/` | 27 temp files — docs enumeration scripts, test outputs | ⬜ |
| P5-2 | Verify empty before delete | `build/` | Empty directory | ⬜ |

**Note:** `.tmp/` contains docs-enumeration scripts from the audit work itself. Verify no runtime process depends on it before clearing.

---

## Not On This List — Do Not Touch

These are live or evidence-bearing. Not archived, not deleted, not moved.

| Path | Reason |
|---|---|
| `lib/hivemind/` | Active cognitive loop — 1,498 LOC |
| `.purpclaw/hivemind/` | Runtime learning data — 115 traces |
| `hivemind_cli.js` | Active CLI entry point |
| `agent_work/omni/` | OmniCode feature registry + truth scans |
| `STRESS/` | 4,898 lines of audit evidence |
| `lib/studio.js` | Active Studio engine |
| `registry/` | All runtime registries |
| `agent_work/` | Mission workspace |
| `pocket/` | Active audio assets + CLI command |
| `skills/` | 379 skills |
| `bin/` | CLI entrypoint |
| `lib/` | Core runtime |

---

## Pre-Commit Checklist (run after each P-batch)

```bash
# Verify no active paths broken
node bin/purpclaw.js doctor --json
node bin/purpclaw.js status --json

# Verify registry still clean
node bin/purpclaw.js registry-audit

# Verify skills still scan
node bin/purpclaw.js capabilities 2>&1 | head -5

# Verify studio still works
node bin/purpclaw.js studio status 2>&1 | head -5
```

---

*Last updated: 2026-06-29. Audit: `docs/audit/STACK_UNACCOUNTED_AUDIT_2026-06-29.md`. Evidence: `docs/audit/STACK_FOLDER_ACCOUNTING_2026-06-29.json`.*
