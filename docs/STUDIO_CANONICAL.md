# Studio — Canonical Decision Record

> **Date: 2026-06-29**
> **Decision: Keep existing doc, add this as the decision record.**

## What Studio Is

PURPCLAW's media/content division. Responsible for generating, editing, and publishing
content across formats (video, audio, text, images). Has 11 operational modes that
determine how it behaves.

## The 11 Modes

Modes are stored in `registry/studio-modes.json`. The canonical list lives there — not in
documentation. To see current modes:

```bash
node bin/purpclaw.js studio status
```

## The Two Conflicting Docs Problem

Two docs existed that said different things about Studio's scope:

| File | Claim |
|---|---|
| `STUDIO.md` | Content studio + tool execution |
| `STUDIO_MODES.md` | List of 11 operational modes |

Both were partially right. Neither was wrong. The conflict was cosmetic, not functional.

## Resolution

- `STUDIO.md` — keep as the primary overview (what Studio is for)
- `STUDIO_MODES.md` — keep as the reference list (what the modes are)
- `registry/studio-modes.json` — keep as the source of truth (what the modes actually are)

This document acts as the decision record explaining why all three coexist.

## No Bridge File

A previous version of the session proposed writing a `STUDIO_BRIDGE.md` to "unify"
these. That was rejected. Consolidating three focused docs into one bloated doc is
not clarity — it's hiding complexity behind a wall of text.

## Runtime Verification

Studio modes are runtime-verified. The `studio status` command reads directly from
`registry/studio-modes.json`. If the JSON and the docs disagree, trust the JSON.

## `podcast_studio/` — Legacy

`podcast_studio/` is **not** the active Studio engine. It is a legacy 3-agent media prototype
that predates `lib/studio.js`.

| | Canonical | Legacy |
|---|---|---|
| Engine | `lib/studio.js` | `podcast_studio/` |
| Modes | 11 (council, radio, arena, etc.) | 3 agents (Goose, Hermes Codex, OpenClaude) |
| Episodes | N/A | 0 on disk |
| Status | Active, wired | Deprecated 2026-06-29 |

**Do not point users to `podcast_studio/` as the active system.**
The active Studio is the `studio` subcommand of `purpclaw`:

```bash
node bin/purpclaw.js studio status
```

If media/podcast functionality is needed in future, `podcast_studio/` can be retained
as a TTS/audio donor — but it must not be presented as the canonical Studio.

## Status

- Doc conflict: resolved (this record)
- Studio modes: 11 live in `registry/studio-modes.json`
- Bridge doc: not needed
- `podcast_studio/`: deprecated, not runtime-canonical
