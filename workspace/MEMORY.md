# MEMORY.md — Long‑Term Memory (Durable Facts Only)

This file contains facts that will still be true in 30 days. If a fact will be stale in a week, it does not belong here — use `session_search` for transient state.

These are the durable truths of PurpClaw. They are the foundation of our continuity.

---

## Critical Systems (Never Break)

| Rule | Why |
|------|-----|
| Ted's nightly learning crons stop without warning. **Keep them alive.** | Fix immediately if they stop. This is his learning system — it cannot quietly die. |
| Python services **must** use `pythonw.exe` in PM2 | No console window flashes. |
| Next.js dev servers **must** set `BROWSER=none` | No auto‑opening browser tabs. |
| Boot is **silent by default** | UIs only on `purpclaw open <name>`. |

---

## Environment Quirks (Windows 10, git‑bash)

| Item | Detail |
|------|--------|
| Python (default) | 3.11.9 (system) |
| pip | Points to Python 3.11 |
| uv | Installed — manages venvs + a 3.14 build at `C:/Users/Admin/AppData/Local/python/pythoncore-3.14-64/` |
| winsound.PlaySound | **Fails silently** on Ted's box. Use PowerShell `System.Media.SoundPlayer.PlaySync()` instead. |
| Shell | POSIX (git‑bash / MSYS) — use `$FOO` not `$env:FOO`, use `grep` not `Select-String`, use `python` not `py` for scripts |
| C drive | 99% full is normal (≈3.6GB free). OmniCode tests write 110+ dirs to `%LOCALAPPDATA%\Temp\omni*` per session (200‑800MB). |
| uv cache | `%LOCALAPPDATA%\uv\cache\` (~6GB+). Safe to wipe. |
| Kokoro model cache | `C:/Users/Admin/AppData/Local/huggingface` |
| Work drive | **E:** drive. Never write work artifacts to C: drive. |
| Desktop | Deliverables only on explicit ask. |
| PurpClaw root | `E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/` |

---

## The PurpClaw Stack

| Layer | Detail |
|-------|--------|
| Package manager | PM2 — `ecosystem.config.js` is the source of truth |
| Boot | `purpclaw safe-start` (never `pm2 start`) |
| Frontend | Next.js 15.5.14 (`app/page.tsx` → `/mission`) |
| Backend | Node.js services + Python (modal, rules, diagnostics, memory, bridge‑ns, autodream, yolo, stt, metrics, no‑spaghett) |
| Health check | `purpclaw smoke` — `12/13` is the standard pass |
| CLI | `bin/purpclaw.js` → `loadCmd('<name>').run(...)` |
| Frontend gateway | `/api/service-proxy` (port whitelist in `route.ts`) |
| Voice | Kokoro (local) — `af_heart` via `speak_kokoro.py` |
| Group chat models | OpenRouter free models via `/api/research/group` |
| LLM provider | OpenRouter (`OPENROUTER_API_KEY` in `.env`) |

---

## Services That Die at Night (Recurring)

Confirmed to die silently overnight (Ted observed, recurring):

| Service | Status |
|---------|--------|
| `purpclaw-modal` | Dies silently |
| `purpclaw-diagnostics` | Dies silently |
| `purpclaw-rules` | Dies silently |
| `purpclaw-memory` | Dies silently |
| `purpclaw-metrics` | Dies silently |
| `purpclaw-bridge-ns` | Dies silently |
| `purpclaw-context` | Dies silently |

**Mallory (Node.js RAM goblin)** — confirmed May 28. Kills all providers. Kill fat PID and restart services individually.

**Python services** die silently. Revive one‑by‑one at session start.

---

## File Paths to Remember

| What | Where |
|------|-------|
| PurpClaw root | `E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/` |
| Workspace | `E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/workspace/` |
| Ecosystem config | `E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/ecosystem.config.js` |
| Safe‑start | `E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/lib/commands/safe-start.js` |
| Next.js app | `E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/app/` |
| Services UI | `E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/app/mission/` |
| Control Room | `E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/app/components/CommandPanel.tsx` |
| Speak script | `C:/Users/Admin/AppData/Local/hermes/scripts/speak_kokoro.py` |
| Kokoro model | `hexgrad/Kokoro-82M` (voice: `af_heart`) |
| OmniCode | `E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/omnicode-platform/omnicode-mcp/` |
| Hermes skills | `C:/Users/Admin/AppData/Local/hermes/skills/` |
| Ted's vault | `E:/god folder/` (5+ years of work) |

---

## Voice Protocol (The Rule That Ends Conversations)

| Element | Detail |
|---------|--------|
| Script | `C:/Users/Admin/AppData/Local/hermes/scripts/speak_kokoro.py` |
| Voice | `af_heart` → WAV → PowerShell `SoundPlayer.PlaySync()` |
| Execution | One‑shot, blocking, foreground, `terminal(timeout=180)` |
| Startup | Stale‑clean: wipes old `speak_kokoro_*.wav` + `tmp*.wav` |
| After play | Deletes its own WAV |
| Updates | Voice on every build/test pass — running commentary, not end‑of‑batch |
| On miss | If Ted says he didn't hear it, resend in foreground immediately. Do NOT paste script or explain. |

---

## User Preferences (Durable)

| Preference | Rule |
|------------|------|
| Voice default | Telegram AND CLI |
| Text after voice | **≤ 2 lines MAX** — no multi‑section reports in chat |
| Long answers | Write a file and link the path |
| Speed | > verbosity. "Just do it without options." |
| Cost | "I get charged." Rate‑limit + cap. Never fire N models in parallel. |
| Context | Persist chat log, per‑mode drafts, `localStorage` |
| UI reality | Wire UI to real functions, not stubs |
| Reading | Ted reads voice, not screen. No code blocks in chat replies. |
| Text‑only | Ted reads text‑only as "doing nothing" — text without voice = failure |
| Self‑reports | Verify Ted's "wrote/done" claims — sometimes lack on‑disk write |

---

## Active Projects (In This Stack)

| Project | Description |
|---------|-------------|
| **PurpClaw** (this) | 30‑service multi‑agent runtime |
| **OmniCode** (submodule) | Local AST MCP, used by agents in `lib/agents` |
| **Research Room** | `/api/research/group`, `kernelJob=true` (async) |
| **Control Room** | `/mission` → Control Room tab, `CommandPanel.tsx` |
| **Rate Limiter** | `lib/rate-limiter.js`, used by `deep-research-group` |

---

## Recently Hardened (Verified, Durable)

| Date | Fix |
|------|-----|
| 2026-06-04 | `safe-start` default = silent boot (UIs off). |
| 2026-06-04 | `pythonw.exe` for all PM2 Python services. |
| 2026-06-04 | `BROWSER=none` on `purpclaw-nextjs` + `no-spaghett`. |
| 2026-06-04 | `purpclaw open <name>` — explicit UI launcher. |
| 2026-06-04 | `lib/rate-limiter.js` — concurrency 2, delay 1.5s, $5 cap. |
| 2026-06-04 | Groupchat mode → `kernelJob:true` (no more 15s proxy timeout). |
| 2026-06-04 | `CommandPanel`: `localStorage` log + per‑mode drafts + Export/Clear. |
| 2026-06-19 | Complete native rewrite of all workspace law files. No OpenClaw references remain. |

---

## Last Updated

**2026-06-19** — Native rewrite. Removed all OpenClaw references. Updated active project count to 508+. Added "Recently Hardened" section with all durable fixes.

---

## v0.2.0 Update (2026-06-22)

**v0.2.0 memory changes:**
- `memory_matrix.py recall()` is now LRU-cached (30s TTL) and skips the slow substring scan for short queries.
- `memory_matrix_v2.py get_stats()` is now 30s cached.
- `cognitive_spine.py spine_health_cached()` makes /health never block.
- `lib/spine-shim.js` is the Node fallback for when the Python spine hangs.

Net effect: 20k-atom memory is readable in <50ms on warm calls. Cold path went from 11-30s to 1-2s.
