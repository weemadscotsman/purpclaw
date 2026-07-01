# ⚠️ LEGACY / NOT CANONICAL

This folder is **not** the active Studio engine.

## Active Studio

The active Studio is `lib/studio.js` — run it via:

```bash
node bin/purpclaw.js studio status
```

See `docs/STUDIO_CANONICAL.md` for the full decision record.

## What This Folder Was

`podcast_studio/` was an early 3-agent autonomous podcast experiment:
- Goose (chaos agent)
- Hermes Codex (tactical engineer)
- OpenClaude (philosophical)

It predates the current `lib/studio.js` engine and is **not wired** to it.
No episodes have been generated (the `episodes/` directory is empty).

## Current Status

- Deprecated: 2026-06-29
- Canonical Studio: `lib/studio.js` (11 modes: council, radio, arena, vent, emergency, brainstorm, interview, news, commentary, directors_cut, after_hours)
- This prototype: retained as a potential future TTS/audio donor only

## Do Not

- Do not present this as the active Studio
- Do not use its 3-agent naming in Studio documentation
- Do not build new features that depend on this prototype
