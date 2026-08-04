# JS/Python Source Audit - 2026-06-29

## Scope

Checked PURPCLAW `.js` and `.py` files for syntax health and folder sprawl.

Syntax-check scope excluded:

- `.git/`
- `.next/`
- `node_modules/`
- `vendor/`
- `archive/`
- `.archive/`
- `.trash/`
- `.tmp/`
- `agent_work/`

These exclusions keep generated dependencies, archived material, and runtime output out of the source-health signal.

## Syntax Results

| Type | Files Checked | Failures |
|---|---:|---:|
| JavaScript | 485 | 0 |
| Python | 164 | 0 |

Commands used:

```powershell
node --check <file>
python -m py_compile <file>
```

## Fixes Applied

Two parse errors were found and fixed before the final clean pass:

- `docs/legacy/root-cleanup-2026-06-06/gen_api.js`
  - fixed a broken string literal containing a raw newline
- `skills/purpclaw-chat-gateway/templates/stub.js`
  - fixed corrupted placeholder/redacted token lines so the template is valid JavaScript while still using placeholder platform values

## Folder Inventory

All `.js` / `.py` files outside `.git`, `.next`, and `node_modules`: 5,243.

| Bucket | Count | Notes |
|---|---:|---|
| external_or_archive | 4,595 | Mostly `vendor/`, plus archive/donor/trash/temp buckets |
| repo_source | 528 | Main owned source folders such as `lib/`, `scripts/`, `skills/`, `app/`, `bin/`, tests |
| root_source_or_stray | 66 | Root-level runtime services and likely older standalone scripts |
| docs_or_reference | 32 | Documentation/reference code |
| scratch_or_helper | 20 | `_scratch/`, `_fix*.py`, `_wire.js`, helper probes |
| runtime_output | 2 | Runtime output folders |

Top folders by count:

| Folder | Count |
|---|---:|
| `vendor/` | 4,511 |
| `lib/` | 261 |
| `skills/` | 162 |
| `.archive/` | 56 |
| `scripts/` | 33 |
| `docs/` | 32 |
| `eval/` | 12 |
| `podcast_studio/` | 12 |
| `_scratch/` | 11 |
| `.tmp/` | 10 |
| `app/` | 10 |

## Cleanup Candidates

Do not delete these blindly. They are candidates for a later quarantine batch after dependency checks.

Root scratch/helper candidates:

- `_find_spine.py`
- `_fix2.py`
- `_fix3.py`
- `_fix_chat.js`
- `_fix_spine.py`
- `_inspect_spine.py`
- `_wire.js`
- `.robot_shell_probe.js`
- `.cactus/probe_test.js`
- `_scratch/*`

Root-level runtime services are messy but likely intentional for now:

- `agent_tower.js`
- `orchestrator.js`
- `unified_api.js`
- `swarm_coordinator.js`
- `worker_service.js`
- `voice_bridge_7792.js`
- `voice_coordinator.js`
- `unified_eventbus.js`
- `unified_state.js`
- `service_registry.js`
- `ecosystem.config.js`

## Verdict

The owned JS/Python source syntax is clean after two narrow fixes.

The mess is structural, not parse-level:

- too many root-level runtime files
- scratch helpers still at root
- large vendor/archive volume
- documentation/reference code mixed into source audits unless explicitly classified

Recommended next batch:

1. Build a dependency map for root-level `.js` / `.py` files.
2. Classify each as `runtime`, `cli`, `service`, `scratch`, `legacy`, or `quarantine`.
3. Move confirmed scratch/legacy files into an archive/quarantine folder only after import/entrypoint checks.
4. Add a repeatable `scripts/audit-js-py-source.js` so this check becomes one command.
