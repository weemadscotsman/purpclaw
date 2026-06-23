# Read Every File — Codebase Investigation Methodology

> Eddie's hard rule from 2026-06-06: "never assume u read every line in every file so u figure it all out we dont pay to skim here bro"

## The rule

When investigating a codebase — auditing folders, cleaning up, understanding connections — read EVERY file. Do not assume from names. Do not grep and move on. Do not delete based on folder titles.

Folder names lie. File names lie. Only content tells the story.

## What happened

During a PURPCLAW root cleanup, the agent moved 18 folders to a "disconnected" graveyard based on:
- Zero grep references from core files
- Folder names suggesting dead code ("disabled-commands", "_scratch", "DreamTask")

This was wrong. Six folders turned out to be actively needed:
- `accuracy_fish/` → wired into `lib/harness/engine.js`, a claim extraction module
- `NEW MASTER UI/` → secondary UI theme with full wiring guide
- `podcast_studio/` → multi-agent podcast project
- `no-spaghett/` → spaghetti audit tool (part of PURPCLAW)
- `schemas/` → install/skill JSON schemas for the stack
- `contexts/` → AI harness mode presets
- `trip_logs/` → agent journey logs
- `Samantha's Daily Log/` → AI personal journal
- `hooks/` → React hooks connecting to tower
- `DreamTask/` → auto-dream background task tied to cognitive stack
- `_scratch/` → gap-to-finish strategy doc
- `steering/` → dev guides + shaman steering nudge API
- `TASKS/` → survival guides and carry-on docs

The agent had to restore 12 of 18 folders after Eddie called it out.

## Correct methodology

### 1. Read every file in the folder
Not just `ls`. Not just `head -5`. Read the full content. Use `read_file` on every non-binary file.

### 2. Trace every connection
- Check `require()` / `import` statements FROM the files (what do they pull in?)
- Check references TO the files (what core code requires them?)
- Check API endpoint references (WIRING_GUIDE.md, data-hooks.js port lists)
- Check PM2 ecosystem.config.js for service definitions
- Check CLI command dispatchers (bin/purpclaw.js case statements)

### 3. Build a mental map
Before deleting or moving anything, draw how it connects:
```
folder → requires → core → CLI command → API endpoint → UI component
```

### 4. Verify with the user
When uncertain, present findings and ask. A folder named "Samantha's Daily Log" with 1 text file might be an AI journal feature, not trash.

### 5. Don't trust grep alone
- `grep -rn "folder_name"` misses indirect connections (API endpoints, config references, URL paths)
- Comments may reference concepts without exact folder names
- Runtime connections (HTTP calls, WebSocket endpoints) don't show up in static grep

### 6. Cross-reference service ports
The most common bug: data-hooks.js or WIRING_GUIDE.md lists service ports that don't match ecosystem.config.js. Check every port against the PM2 config. In this session, 5 port mismatches were found in NEW MASTER UI's data-hooks.js.

## Pitfalls

- **Folder name assumptions**: "disabled-commands" had zero code files (empty dirs) but the real commands were in `lib/commands/` — the folder was a ghost, not evidence of dead code
- **Empty directories**: They may be placeholders for future features the user plans to build
- **Personal files**: "Samantha's Daily Log" and "trip_logs" sound like trash but are actual features (AI journal, agent journey logs)
- **Cloned repos**: Open-Higgsfield-AI-main and tesseract-ocr ARE actual dead weight (cloned third-party source) — but you can only know that by reading the files inside, not by the folder name
- **"scratch" folders**: _scratch/ had STRATEGY.md — a gap-to-finish planning document. Not trash.
