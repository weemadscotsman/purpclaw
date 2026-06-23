# v0.1.0 Post-Ship Bug Tracker
> Found during sticky-finger audit. Triaged for post-release.

## Critical
- [ ] Invalid provider crashes with confusing error (should show helpful message)
- [ ] 10K char prompt hangs/timeout (no truncation warning)
- [ ] 51 event listeners with 0 cleanups (listener leak in unified_api.js)
- [ ] API authentication gate (PURPCLAW_API_KEY) — committed, needs documentation

## High
- [ ] Memory duplicate detection works but no auto-quarantine flow
- [ ] Contradiction detection catches online/offline but misses subtler patterns
- [ ] Self-reference detection only catches literal ID matches
- [ ] Rapid temporal flips detected but no rate-limiting on state changes

## Medium
- [ ] 419 agent_work JSON files need auto-cleanup (11MB)
- [ ] 9 stale root files (>30 days, not in PM2 ecosystem)
- [ ] Blessed TUI crashes on Node v24 (needs upgrade or ANSI fallback)
- [ ] WebUI has no Mochi panel (guilt gap)
- [ ] PM2 logs not rotating (28MB accumulated before cleanup)
- [ ] OmniCode DBs (163 databases, ~600MB) across old projects

## Nice-to-have
- [ ] Raccoon campaign: add memory attack pack to chaos_campaign
- [ ] Provider health monitoring (auto-detect down providers)
- [ ] Ratchet auto-loads trained model into Ollama
- [ ] Mochi separation anxiety: TUI tracks idle time
- [ ] Unified Mochi bridge: all 3 surfaces share pet state
