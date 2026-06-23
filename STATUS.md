# PURPCLAW Status

**Last updated:** 2026-06-14

## Current state (19/19 services online)

| Layer | Status | Notes |
|---|---|---|
| **Core** (api, nextjs, eventbus, state, orchestrator, tower, pool, context, workers, gatekeeper, metrics, cognitive) | 🟢 UP | All ports responding |
| **Features** (chorus, reasoning, voice, stt, thringlet, bridge, harness) | 🟢 UP | Group chat, reasoning loops, voice chain, STT, thringlets, bridge, training-buffer feed |
| **TTS gateway** (port 7899) | 🟢 UP | Kokoro via pygame, 64-byte WAV round-trip proven |

## Proven this session

- **Provider routing = user-configurable** — `/providers` page writes per-lane choices to `~/.purpclaw/provider-config.json`. Settings drive live dispatch end-to-end (set `ollama` → used it; cleared → reverted to `minimax`).
- **NVIDIA NIM routing** — all 5 keys verified valid, 4-key rotation, per-lane assignment, real Nemotron 120b/550b responses.
- **3 routing bugs killed:** slash-autoroute hijack, `envKey→keystring` mutation, EOL `deepseek-coder-6.7b` in CODE lane.
- **Model Sentinel** — daily discovery, drift detection, applies via `bin/purpclaw.js discover apply`.
- **Voice round-trip** — text → chat (7780) → TTS (7899) proven end-to-end, 64-byte WAV.
- **Self-evolution-loop** — started on boot, gated by `EVOLUTION_DISABLED`, protected by $0.50/day spend breaker. 6 ticks today, $0.0089 spent, real research ingested into memory.
- **Mochi → live context** — `/api/mochi` now reads sessions + memory, exposes `workload` field.
- **`/mission`** — "Many Lenses" cockpit + animated logo restored.
- **Keys secured** — `.env*` in `.gitignore`.
- **Body Bridge v1 — Hands COMPLETE & gated** (`lib/tools-gui.js`, 13 tools): screenshot, move, click, double_click, drag/box-select, scroll, type, hotkey, windows, focus, notify, **gui_stop (kill switch)**. Gate proven (off blocks actions); kill switch proven (forces autonomous→off). Wraps `lib/runtime/computer-use.js` (Win32 SetCursorPos/mouse_event/SendKeys).
- **CLI-Anything bridge** (`lib/tools-cli-anything.js`): 49 `cli_<app>` tools auto-discovered from the CLI-Anything repo (Blender/GIMP/Godot/LibreOffice/…). No daemon, no global install; updating = git pull + restart.
- **Windows-MCP native bridge** (`lib/tools-windows-mcp.js`, vendored `vendor/windows-mcp/`): 19 `win_*` tools (Snapshot/Click/Type/Move/PowerShell/Registry/Process/FileSystem/…). Lazy-spawned only when armed, 3-tier gated (observe/assist/destructive), kill-switch covered. PROVEN: `win_snapshot` returns live desktop UI-tree. Destructive tier needs autonomous+approved+`WINMCP_DESTRUCTIVE=1`. ~567 tools total.
- **OmniCode wired into the agent brain** — fixed (better-sqlite3 ABI→127, embedding model downloaded, search cap 2500→200; `omnicode doctor` ALL PASS) and integrated: `mcp.json` omnicode pinned to **Node 22** (deterministic ABI), `unified_api` boot registers **66 OmniCode tools** into the shared registry (was CLI-`ask`-only), `agent-loop` prompt steers "OmniCode FIRST for code nav". **E2E PROVEN**: `purpclaw ask "use omnicode to find where provider lanes resolve"` → agent self-called `mcp__omnicode__search_symbols` → found `provider-router.js:resolveLane` → answered. No sqlite/MCP errors. Caveats: harness's own omnicode conn cached (PURPCLAW runtime reads fresh); `ponytail_tools.ts` ~19 non-blocking TS errors; PURPCLAW `grep` tool needs `rg` on PATH (ENOENTs).

## 🔴 Loose ends (known, not fixed)

| Issue | Fix |
|---|---|
| OpenRouter key returns 401 | Operator needs to rotate at `openrouter.ai` (or disable FALLBACK lane) |
| Auto-evolve on boot (24/7 unattended) | Safety gate blocked auto-start; needs explicit operator OK |
| `/api/voice/chat` Next route | Written but blocked by pre-existing Next build errors |

## ⚠️ DO NOT re-break: api-body-cap doctrine
`lib/api-body-cap.ts` (`readJsonBody`) is a **Node `http.IncomingMessage` streaming** helper. It is **WRONG for Next App Router routes** — `NextRequest` is a Web `Request` (use `await req.json()`), it has no `.on('data')`. A prior pass mass-applied it into App Router routes (`chat`, `computer-use`, `voice-command`, `kernel/jobs`) which **wiped `.next` and bricked the whole web UI**. All four reverted to `await req.json()`; the helper is now imported nowhere (orphaned). **Do NOT apply it to any `app/api/**/route.ts`.** One body reader does NOT fit all runtimes:
| Context | Correct body handling |
|---|---|
| Next App Router | `await req.json()` (cap via `content-length` header if needed) |
| Node HTTP server | the `api-body-cap` streaming helper (its actual home) |
| proxy / raw forward | pass raw body, do not re-parse |
| file upload | multipart, not the JSON helper |
Rule: **research wide, patch narrow** — scan-then-smallest-patch, never mass-apply a helper across mismatched runtimes.

## ❌ Not built yet

- **Podcast studio** (net-new: agents → script → TTS → audio)
- **Group chat wire** (chorus ↔ agent tower ↔ unified_api for live agent-to-agent)
- **Guided reasoning trips** (BMAD-style: Analyst, Architect, Builder, Auditor roles)
- **Abolition probes** (automated truth-scanner on agent outputs)

## Tool registry

| Type | Count |
|---|---:|
| Hermes skills | 378 |
| PC tools | 49 |
| GUI eyes+hands (gui_*) | 13 |
| CLI-Anything (cli_*) | 49 |
| Native tools | 29 |
| NIM skills | 15 |
| **Total** | **533** |

## 🎮 Game benchmark ("RED HAND BENCH") — staged
- **Hands** ✅ done + gated + kill switch (see Body Bridge above).
- **Eyes→Brain vision reader** ⏳ NEXT — `gui_screenshot → VLM (nemotron-nano-vl) → structured screen understanding (summary, visible text, clickable targets+coords, confidence, recommended action, risk flag)`. Read-only, no clicking.
- **Bounded runner** ❌ NOT BUILT / NOT AUTHORIZED — the actual red button: target-window lock, folder scope, spend+time cap, action ledger, kill switch, no destructive/external. Needs explicit operator OK.
- Honest line: PURPCLAW has gated hands; it can capture screenshots but does not yet *understand* them via a VLM loop. Autonomy runner remains approval-gated.

## Provider routing lanes (10)

| Lane | Provider | Model |
|---|---|---|
| PRIMARY_CHAT | minimax | MiniMax-M2.7 |
| PRIMARY_TOOL | minimax | MiniMax-M2.7 |
| PRIMARY_DELEGATION | minimax | MiniMax-M2.7 |
| SWARM | nvidia | nvidia/nemotron-3-nano-30b-a3b |
| DIVISION | nvidia | nvidia/nemotron-3-super-120b-a12b |
| CODE | nvidia | nvidia/nemotron-3-super-120b-a12b |
| REASONING | nvidia | nvidia/nemotron-3-ultra-550b-a55b |
| FALLBACK | openrouter | (key dead, needs rotation) |
| LOCAL | ollama | qwen2.5:3b |
| PRIVATE_MODE | ollama | qwen2.5:3b |

## Operator decisions pending

1. **Authorize unattended auto-evolve on boot?** (yes/no)
2. **Rotate OpenRouter key?** (or disable FALLBACK lane)
3. **Start podcast studio build?** (net-new)
4. **Wire group chat?** (chorus ↔ agent tower)

## How to use this file

- Glance here for "where am I" before asking for next steps
- Update after each significant pass
- Run `pm2 list` to check current service state
- Run `node -e "require('./lib/runtime/provider-router').dumpDoctrine()"` to see live routing
