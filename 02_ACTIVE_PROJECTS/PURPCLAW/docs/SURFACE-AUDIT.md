# PURPCLAW Surface Audit
**Date**: 2026-07-28
**Auditor**: Claude (10-pass surface-walk methodology)

## Pass 1 — PM2 State
PM2 daemon is running but all 32 previously-managed services are now Hermes-managed orphans.
PM2 `pm2 list` shows 0 processes. Root cause: PM2 RPC hangs when starting services
(observed: 90-second timeout on `pm2 start ecosystem.config.js`).

## Pass 2 — Port Map (after PM2 restart attempt)
| Port | Status | Owner |
|------|--------|-------|
| 7780 | ✅ 200 | Hermes (PID 24740) — Unified API, bridgeConnected: true |
| 7782 | ✅ 200 | Hermes — API |
| 7783 | ✅ 200 | Hermes — Vision |
| 7784 | ✅ 200 | Hermes — Chorus |
| 7790 | ✅ 404 + HTML | Hermes — Gatekeeper (web panel, same as 3030) |
| 7791 | ✅ 200 | Hermes (PID 28884) — Gatekeeper panel |
| 7793 | ✅ 404 | PM2 orphan — static-server was shut down |
| 7798 | ✅ 200 | Hermes — unknown |
| 7799 | ✅ 200 | Hermes (PID 3556) — TTS gateway |
| 7880 | ✅ 200 | Hermes — cognitive spine |
| 7885 | ✅ 200 | Hermes — reasoning |
| 7896 | ✅ 200 | Hermes (PID 8236) — STT voice |
| 3030 | ❌ down | Was Next.js (PID 30852), killed to allow PM2 restart |
| 9119 | ❌ down | Was gateway-server, shut down with PM2 |

## Pass 3 — Service Registry
Ecosystem declares 32 services. PM2 shows 0 running. All running services are Hermes-managed.
Tower (port 7790): PID 7468, bridgeConnected=true from Unified API perspective.
Static-server: moved to 7793 (was 7790, port conflict with tower).

## Pass 4 — Architecture
- Hermes (PID 24740) owns: Unified API, Vision, Chorus, Cognitive Spine, Reasoning, Yolo
- Separate Hermes instances own: Gatekeeper (28884), TTS (3556), STT (8236)
- PM2 should own: tower, api, gatekeeper, nextjs, static-server, eventbus, bridge, chorus, orchestrator, etc.
- Problem: PM2 can't start services — daemon hangs on RPC after `pm2 start`

## Pass 5 — PM2 Diagnosis
PM2 daemon starts fine (`pm2 kill` works). `pm2 start ecosystem.config.js` hangs at
"All processes started" stage — RPC never returns, exit 124 (timeout).
WORKAROUND: Services need to be started manually or PM2 RPC issue resolved.
Services that ARE running: all Hermes-managed, started before this audit.

## Pass 6 — Web UI
- /mission (Next.js) — not currently running (3030 down)
- /ui (static) — not accessible (static-server down on 7793)
- 7791 Gatekeeper — returns HTML (same app as Next.js would serve)
- Tower at 7790: responds to /tower/status JSON API

## Pass 7 — CLI parity
From CODEX_PARITY_FINAL_AUDIT.md:
- CLI 21/21 top-level commands ✅
- `execpolicy --watch` ✅ (just fixed)
- `doctor --category <name>` ✅ (just fixed)
- `debug prompt-input` — genuinely missing
- `exec archive/delete/unarchive` as subcommands — functional but not tree-identical

## Pass 8 — Bug fixes applied this session
1. `execpolicy check` — was calling async EP.check() without await
   Result: all commands showed "denied" (undefined.allowed = falsy)
   Fix: changed to EP.checkSync() in CLI handler
2. `doctor --category` — add() call had no category param, render loop had no filter
   Fix: added `cat` param to add(), parse --category from args, filter in render loop
3. `execpolicy --watch` — fs.watch on policy.toml, fires all registered callbacks
4. static-server port conflict — both tower (7790) and static-server (7790) on same port
   Fix: moved static-server to 7793

## Pass 9 — Remaining issues
1. PM2 cannot start ecosystem services (RPC hang) — services currently Hermes-managed
2. Next.js (3030) — not running, needs manual restart via PM2
3. Gateway server (9119) — not running, needs manual restart via PM2
4. `debug prompt-input` — not implemented
5. `exec archive/delete/unarchive` — not subcommands of `exec`

## Pass 10 — Health summary
- Unified API (7780): ✅ bridgeConnected=true
- Tower (7790): ✅ running, 153 agents registered
- Gatekeeper (7791): ✅ running
- Cognitive spine (7880): ✅ running
- TTS (7799): ✅ running
- STT (7896): ✅ running
- Next.js (3030): ❌ down
- Gateway (9119): ❌ down
- Static (7793): ❌ down (just moved port, not restarted yet)
