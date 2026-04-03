# System Is Whole By Default — Unwiring Session (2026-06-04)

Ted's complaint: "ITS NOT HOW I BUILT IT ITS JSUT TEXT NOT USING THE FUNCTIONS ITS INTEDED FOR LETS FIX IT ALL."

The trigger was the Next.js landing page showing static text instead of wiring the actual functions. The deeper issue: PURPCLAW had drifted into a "defined but dark" pattern — many capabilities existed in `ecosystem.config.js` and feature-parity checks but didn't run by default. The system was its own cage.

## What "Dark Cluster" Meant (Pre-2026-06-04)

- `ecosystem.config.js` had ~30 services registered
- `lib/commands/safe-start.js` defaulted to a "core" subset unless you passed `--dark` or a list
- `bin/purpclaw.js` help text promoted `safe-start --core` as the canonical command
- `CLAUDE.md` had a section "Defined-but-dark cluster (off by default)" that framed it as a stability feature
- Landing/mission pages read like docs because the runtime they described was, in fact, mostly off

Ted's reading: this is the system limping. Not a stability feature, a regression. He built PURPCLAW to be the whole runtime, not a subset you opt into.

## The Four Files That Were Rewritten

| File | Change |
|------|--------|
| `lib/commands/safe-start.js` | Default behavior: read `ecosystem.config.js`, bring up every service. `--core` and `--dark` kept as legacy aliases. |
| `ecosystem.config.js` | Top-of-file comment rewritten. Removed the "dark cluster is failure-prone, wake with --dark" framing. |
| `bin/purpclaw.js` | Help text updated. Default line is now: "Start every service in ecosystem.config.js (default — system is whole)". |
| `CLAUDE.md` | Four sections rewritten. "Defined-but-dark cluster (off by default)" deleted. "Dark cluster intentionally dark" replaced with "No more dark cluster." "Never start the dark cluster" rule replaced with "Always use safe-start instead of direct pm2 start." Safe-start examples rewritten. |

## Runtime Recovery (After PM2 Daemon Lost State)

`pm2 start ecosystem.config.js` is the kind of command that can flash-bomb the desktop if the daemon is stale. After the config-level changes, the actual bring-up was done in two passes via `purpclaw safe-start` (one-at-a-time, stabilization watch):

**Pass 1 (state, API, orchestrator, tower, pool, context, workers, memory):**
```bash
purpclaw safe-start state api orchestrator tower pool context workers memory
```

**Pass 2 (modal, gatekeeper, rules, metrics, diagnostics, nextjs, bridge-ns):**
```bash
purpclaw safe-start modal gatekeeper rules metrics diagnostics nextjs bridge-ns
```

All 15+ services came up cleanly, no cascade. The new `safe-start` behavior — default = whole ecosystem — is what made this safe. It walks the list, waits for stabilization, has a circuit breaker, and would have stopped on its own if any service had crashed.

## The New Standard (The Lesson)

> **If a service is in `ecosystem.config.js`, it's a live capability. Period.**

This applies to:
- All Python services (modal, diagnostics, rules, memory, bridge-ns, yolo, avatar, autodream)
- All Node.js services (eventbus, state, api, tower, voice, bridge, nextjs, gatekeeper, orchestrator, chorus, vision, metrics, pool, context, reasoning)
- All Thringlet bridge, agent layer, any new module wired in

A service is only "off" if the operator explicitly stops it. The system boots whole. The operator opts out, not in.

## Anti-Patterns To Reject In Future Work

1. **"Defined but disabled by default"** — If a service is on the ecosystem list, it runs. Don't add a new service to the list and gate it behind a flag.
2. **"Core vs everything" framing** — There is no core. There is the system.
3. **Landing pages that just show text** — If a function exists, the UI calls it. Text-only placeholders are a bug, not a placeholder.
4. **Documentation that says "this is intentionally off"** — If it's worth documenting, it's worth running. Turn it on and let the operator stop it if they want.
5. **Help text that promotes a "minimal" default** — `safe-start` with no flag = whole system. Help text leads with that.

## What To Do If You Find Another "Dark" Module

1. Check if it's in `ecosystem.config.js`. If yes, it's part of the runtime. Bring it up with `purpclaw safe-start <name>` and verify health.
2. If the module is referenced in `lib/feature-parity.js` as `missing`, replace the `missing` check with a real `type: 'file'` or `type: 'service'` check pointing at the live code.
3. If a UI page has a static-text fallback for a real function, wire the function. Do not add a comment saying "TODO: wire to real function" — wire it.
4. Update any doc that calls it "dark" / "dormant" / "intentionally off". The vocabulary should match the new reality.

## Verification After This Session

- `node -c` clean on all 3 touched JS files (safe-start, ecosystem.config.js, bin/purpclaw.js)
- `purpclaw smoke --quick` → 12/13 checks pass (the 1 fail was the optional "workers:registered" with 0 workers — pre-existing, not a regression)
- `pm2 list` shows 22+ services online
- The dark cluster is no longer reachable from the default path

## Related References

- `references/gateway-services.md` — the family pattern for PURPCLAW external-service gateways. Now operates under the "system is whole" principle: gateways added to ecosystem are part of the runtime.
- `references/dormant-backends.md` — this reference is now mostly historical. The "dormant" framing was a symptom of the dark cluster pattern. If you find new services there, the correct action is to bring them up, not to document them as dormant.
- `references/orphan-classification-2026-05-24.md` — the May 24 audit already classified most of what was "dormant" as wired. The 2026-06-04 unwiring session is the runtime-level follow-through.
