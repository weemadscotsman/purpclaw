# PURPCLAW Architecture Decision: Option A vs Option B
**Date:** 2026-05-28  
**Session:** Full PURPCLAW stack boot crash cascade diagnosis

---

## The Problem (Captured)

26 separate PM2 OS processes. Each Node.js or Python runtime is a separate OS child process. On Windows, when any service crash-loops on launch, `cmd.exe` flashes a window — and `windowsHide: true` doesn't fully suppress it under crash conditions. Start 4+ simultaneously → Explorer chokes → desktop freezes.

**Root cause:** PM2's `ecosystem.config.js` launches all 26 services as separate OS-level child processes. One crash → Windows cmd flash → cascade.

---

## Option A — Consolidate into ONE Hidden Process (USER'S VISION)

**What the user wants:** "one hidden terminal, all services live inside it, called on demand."

Architecture:
- Single `purpclaw-kernel.js` entry point (or merge into existing `orchestrator.js`)
- All 26 services as **in-process modules** (require() or worker threads)
- IPC via in-process EventEmitter — no network overhead
- One OS process, one terminal window, silent background operation
- Services loaded lazily — only spun up when work is routed to them
- Memory managed centrally — no 26 separate heap allocations

**Pros:**
- Silent boot — one hidden terminal, zero cmd window flashes
- Fast IPC — in-process EventEmitter vs HTTP between services
- Single memory footprint — no RAM bloat from 26 separate runtimes
- No crash cascade — failures are in-process exceptions, not OS child death
- Services called on demand — idle services consume zero resources

**Cons:**
- Rewrite of service communication architecture
- Harder to restart individual services (need module-level lifecycle, not process-level)
- Single point of failure (one process dies = everything dies) — mitigation: try/catch per service

**Implementation path:**
1. Create `purpclaw-kernel.js` — main entry, loads orchestrator + all service modules
2. Convert each PM2 service to a lazy-loaded module (e.g. `services/eventbus.js`, `services/state.js`)
3. Use Node.js `EventEmitter` for inter-service communication
4. Worker threads for CPU-heavy services (Next.js dev server, YOLO, Whisper STT)
5. Graceful degradation — if one service crashes, others keep running

---

## Option B — Keep 26 Processes, Fix the Cascade

Architecture:
- Keep all 26 PM2 services as separate OS processes
- Fix: add `wait_ready: true` + emit `listen` signal on each service before marking ready
- Pre-flight health check before starting each service
- Circuit breaker: stop starting new services if 2+ have failed in last 30s
- `--wait` flag on PM2 start so failed services don't cascade

**Pros:** Minimal architectural change, existing code mostly works  
**Cons:** Still 26 processes, still resource-heavy, still fragile

---

## Decision

**User chose Option A** — "one hidden terminal, all services live inside it, called on demand."

This is the canonical direction for PURPCLAW v9+. All future service design should align with the single-process lazy-load pattern.

---

## Key Files

| File | Role |
|------|------|
| `ecosystem.config.js` | Current PM2 definitions — TARGET for Option A migration |
| `orchestrator.js` | Central router — likely kernel entry point in Option A |
| `service_registry.js` | Port registry — will become in-process module registry |
| `lib/context-packet.js` | Inter-agent handoff — becomes internal EventEmitter |
| `lib/memory-client.js` | Memory HTTP client — becomes direct module call |
| `lib/cognitive-client.js` | Cognitive backend client — becomes direct module call |

---

## Migration Checklist (when implementing Option A)

- [ ] Create `purpclaw-kernel.js` as single entry point
- [ ] Convert `unified_eventbus.js` → `services/eventbus.js` (lazy require)
- [ ] Convert `unified_state.js` → `services/state.js`
- [ ] Convert Python services — embed in worker threads or keep as subprocess with lazy spawn
- [ ] Replace HTTP inter-service calls with EventEmitter
- [ ] Test: boot the kernel, verify all 26 services reachable, no cmd windows
- [ ] Test: crash one service, verify others keep running
- [ ] Test: full PURPCLAW stack boot on cold Windows — silent, no cascade