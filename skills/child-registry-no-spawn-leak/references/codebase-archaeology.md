# Codebase Archaeology — Tracing Connections Before Cutting

## The core lesson

**Folder names lie. File names lie. Only the content tells the story.**

This repo had ~~18~~ ~~14~~ ~~10~~ actually only 4 truly dead folders. Everything else was alive, useful, and connected — I just couldn't see the connections because I was skimming names instead of tracing imports.

## Three states of alive

Before classifying anything as dead, determine which state it's in:

| State | What it means | How to check |
|---|---|---|
| **Built** | Code exists on disk | `ls` the file |
| **Running** | Process is alive | `curl` the port, `ps` for the PID |
| **Integrated** | Actively consumed by another component | `grep` for requires/imports in `unified_api.js`, `agent_tower.js`, `boot.js`, `lib/`, `bin/purpclaw.js` |

A file can be Built but not Running (e.g. `cognitive_spine.py`). A file can be Running but not Integrated (e.g. individual cognitive services). **All three must be checked before you know the true state.**

## The audit checklist

When evaluating whether a file/folder is dead:

1. **Read the actual files inside.** At minimum the first 20 lines and any README. Don't stop at the folder name.
2. **Check for imports from the core system.** Grep `unified_api.js`, `agent_tower.js`, `boot.js`, `bin/purpclaw.js`, `ecosystem.config.js`, `service_registry.js` for the folder/file name.
3. **Check for imports from any active lib module.** A file can be wired through `lib/` without being imported by a root file.
4. **Check PM2 and service registry.** `ecosystem.config.js` and `service_registry.js` are the canonical lists of what should be running.
5. **Ask the user.** When uncertain, say "this looks disconnected, here's what it is — want it archived or does it have a purpose?" Let them confirm before moving anything.

## Common traps

- **"agent_score.json" is a state file, not trash.** Large JSON files in the root are often state/data, not temp artifacts.
- **"schemas/" are infrastructure, not debris.** JSON schemas for install/skill systems look like dead weight but are referenced by the ecosystem.
- **"contexts/" with 3 markdown files are Claude Code mode presets**, not random docs.
- **Empty directories with promising names** ("disabled-commands", "steering", "trip_logs") were planned features that never got code. Empty = dead.
- **A file with 0 `grep` hits might still be wired dynamically.** Check `require()` patterns and dynamic imports before declaring it dead.
- **"No references from core" is not the same as "not needed."** Some files are utilities imported by other non-core modules, or are standalone tools the user consciously maintains.

## The pattern that caught me

This session, I repeatedly:
1. Saw a folder name → assumed it was dead → moved it
2. User told me it was actually needed → restored it
3. Had to update my conclusion

This happened with: `accuracy_fish`, `NEW MASTER UI`, `podcast_studio`, `no-spaghett`, `schemas`, `contexts`, `trip_logs`, `Samantha's Daily Log`, `steering`, `hooks`, `DreamTask`, `purpconsole`, `TASKS`, `_scratch`.

**The lesson: read first, audit second, move third. Never skip to step 3.**
