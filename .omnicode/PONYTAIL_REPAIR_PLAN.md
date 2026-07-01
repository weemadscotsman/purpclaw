# Ponytail Repair Plan

Generated: 2026-06-17T17:16:59.437Z
Repo: E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW
Level: full
Ponytail version: 4.5.0
Indexed by: OmniCode MCP (do not re-run audit without re-indexing)
Plan hash: 4cddd174ad0f903d  (sha256 of touched files; tracks repo drift at verify-time)
Plan format: phase_d

## Verdict

WRITE ADVISORY HANDOFF ONLY. Ponytail does not apply patches. A separate AI agent or human must read this file and perform any changes.

Doctrine: prefer YAGNI → stdlib → native → one line → minimum. Mark every deliberate shortcut with a `ponytail:` comment naming its ceiling and upgrade path.

## Summary

Findings: 100
By tag: delete=31, stdlib=0, native=0, yagni=45, shrink=24
Net: -100 findings (line impact varies)
Files touched: 59
Plan hash: 4cddd174ad0f903d

## Per-File Cut List

Ordered by impact. Each finding has a stable id, a confidence (high/medium/low), a risk (low/medium/high/blocked), a patch_type, a status (planned by default), and a verifier shell command. `ponytail:` lines name the ceiling and upgrade path.

### `skills/openclaw-migration/scripts/openclaw_to_hermes.py`

- [PT-001] **yagni** (`inline`)
  - text:        god object: 174 dependents, 178 symbols. inline the layer until a second caller appears
  - confidence:  high
  - risk:        medium
  - status:      planned
  - verifier:    `purpclaw ponytail audit "E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW" --level=full  # yagni count should drop`
  - rollback:    git revert <commit> ; or re-extract the inlined logic into a helper
  - evidence:    {"kind":"file","god":true,"in":174,"sym":178}
  - ponytail:    inline until a second caller appears. The abstraction earns its place when two callers exist, not before.

- [PT-002] **shrink** (`split`)
  - text:        3137-line file. split or inline — find the seams (one-imports, one-calls, no-tests)
  - confidence:  high
  - risk:        medium
  - status:      planned
  - verifier:    `wc -l "skills/openclaw-migration/scripts/openclaw_to_hermes.py"  # expect a smaller line count than at plan-time`
  - rollback:    git revert <commit> ; or paste the original block back from this plan
  - evidence:    {"kind":"file","size":3137}
  - affected_symbol: <file:3137-lines>
  - ponytail:    find the seams: one-imports, one-calls, no-tests are the split lines. Don't split a file just because it's long — split it because there's a natural boundary.

### `skills/hyperliquid/scripts/hyperliquid_client.py`

- [PT-003] **yagni** (`inline`)
  - text:        god object: 138 dependents, 138 symbols. inline the layer until a second caller appears
  - confidence:  high
  - risk:        medium
  - status:      planned
  - verifier:    `purpclaw ponytail audit "E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW" --level=full  # yagni count should drop`
  - rollback:    git revert <commit> ; or re-extract the inlined logic into a helper
  - evidence:    {"kind":"file","god":true,"in":138,"sym":138}
  - ponytail:    inline until a second caller appears. The abstraction earns its place when two callers exist, not before.

- [PT-004] **shrink** (`split`)
  - text:        1661-line file. split or inline — find the seams (one-imports, one-calls, no-tests)
  - confidence:  high
  - risk:        medium
  - status:      planned
  - verifier:    `wc -l "skills/hyperliquid/scripts/hyperliquid_client.py"  # expect a smaller line count than at plan-time`
  - rollback:    git revert <commit> ; or paste the original block back from this plan
  - evidence:    {"kind":"file","size":1661}
  - affected_symbol: <file:1661-lines>
  - ponytail:    find the seams: one-imports, one-calls, no-tests are the split lines. Don't split a file just because it's long — split it because there's a natural boundary.

### `skills/continuous-learning-v2/scripts/test_parse_instinct.py`

- [PT-005] **yagni** (`inline`)
  - text:        god object: 132 dependents, 132 symbols. inline the layer until a second caller appears
  - confidence:  high
  - risk:        medium
  - status:      planned
  - verifier:    `purpclaw ponytail audit "E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW" --level=full  # yagni count should drop`
  - rollback:    git revert <commit> ; or re-extract the inlined logic into a helper
  - evidence:    {"kind":"file","god":true,"in":132,"sym":132}
  - ponytail:    inline until a second caller appears. The abstraction earns its place when two callers exist, not before.

### `skills/comfyui/tests/test_common.py`

- [PT-006] **yagni** (`inline`)
  - text:        god object: 132 dependents, 164 symbols. inline the layer until a second caller appears
  - confidence:  high
  - risk:        medium
  - status:      planned
  - verifier:    `purpclaw ponytail audit "E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW" --level=full  # yagni count should drop`
  - rollback:    git revert <commit> ; or re-extract the inlined logic into a helper
  - evidence:    {"kind":"file","god":true,"in":132,"sym":164}
  - ponytail:    inline until a second caller appears. The abstraction earns its place when two callers exist, not before.

### `modal_logic_engine.py`

- [PT-007] **yagni** (`inline`)
  - text:        god object: 118 dependents, 160 symbols. inline the layer until a second caller appears
  - confidence:  high
  - risk:        medium
  - status:      planned
  - verifier:    `purpclaw ponytail audit "E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW" --level=full  # yagni count should drop`
  - rollback:    git revert <commit> ; or re-extract the inlined logic into a helper
  - evidence:    {"kind":"file","god":true,"in":118,"sym":160}
  - ponytail:    inline until a second caller appears. The abstraction earns its place when two callers exist, not before.

### `memory_matrix.py`

- [PT-008] **yagni** (`inline`)
  - text:        god object: 110 dependents, 146 symbols. inline the layer until a second caller appears
  - confidence:  high
  - risk:        medium
  - status:      planned
  - verifier:    `purpclaw ponytail audit "E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW" --level=full  # yagni count should drop`
  - rollback:    git revert <commit> ; or re-extract the inlined logic into a helper
  - evidence:    {"kind":"file","god":true,"in":110,"sym":146}
  - ponytail:    inline until a second caller appears. The abstraction earns its place when two callers exist, not before.

- [PT-009] **shrink** (`split`)
  - text:        1183-line file. split or inline — find the seams (one-imports, one-calls, no-tests)
  - confidence:  high
  - risk:        medium
  - status:      planned
  - verifier:    `wc -l "memory_matrix.py"  # expect a smaller line count than at plan-time`
  - rollback:    git revert <commit> ; or paste the original block back from this plan
  - evidence:    {"kind":"file","size":1183}
  - affected_symbol: <file:1183-lines>
  - ponytail:    find the seams: one-imports, one-calls, no-tests are the split lines. Don't split a file just because it's long — split it because there's a natural boundary.

### `memory_matrix_v2.py`

- [PT-010] **yagni** (`inline`)
  - text:        god object: 108 dependents, 122 symbols. inline the layer until a second caller appears
  - confidence:  high
  - risk:        medium
  - status:      planned
  - verifier:    `purpclaw ponytail audit "E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW" --level=full  # yagni count should drop`
  - rollback:    git revert <commit> ; or re-extract the inlined logic into a helper
  - evidence:    {"kind":"file","god":true,"in":108,"sym":122}
  - ponytail:    inline until a second caller appears. The abstraction earns its place when two callers exist, not before.

- [PT-011] **shrink** (`split`)
  - text:        1164-line file. split or inline — find the seams (one-imports, one-calls, no-tests)
  - confidence:  high
  - risk:        medium
  - status:      planned
  - verifier:    `wc -l "memory_matrix_v2.py"  # expect a smaller line count than at plan-time`
  - rollback:    git revert <commit> ; or paste the original block back from this plan
  - evidence:    {"kind":"file","size":1164}
  - affected_symbol: <file:1164-lines>
  - ponytail:    find the seams: one-imports, one-calls, no-tests are the split lines. Don't split a file just because it's long — split it because there's a natural boundary.

### `docs/legacy/ghostbusters-2026-06-06/memory_matrix.py`

- [PT-012] **yagni** (`inline`)
  - text:        god object: 108 dependents, 144 symbols. inline the layer until a second caller appears
  - confidence:  high
  - risk:        medium
  - status:      planned
  - verifier:    `purpclaw ponytail audit "E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW" --level=full  # yagni count should drop`
  - rollback:    git revert <commit> ; or re-extract the inlined logic into a helper
  - evidence:    {"kind":"file","god":true,"in":108,"sym":144}
  - ponytail:    inline until a second caller appears. The abstraction earns its place when two callers exist, not before.

- [PT-013] **shrink** (`split`)
  - text:        1151-line file. split or inline — find the seams (one-imports, one-calls, no-tests)
  - confidence:  high
  - risk:        medium
  - status:      planned
  - verifier:    `wc -l "docs/legacy/ghostbusters-2026-06-06/memory_matrix.py"  # expect a smaller line count than at plan-time`
  - rollback:    git revert <commit> ; or paste the original block back from this plan
  - evidence:    {"kind":"file","size":1151}
  - affected_symbol: <file:1151-lines>
  - ponytail:    find the seams: one-imports, one-calls, no-tests are the split lines. Don't split a file just because it's long — split it because there's a natural boundary.

### `skills/telephony/scripts/telephony.py`

- [PT-014] **yagni** (`inline`)
  - text:        god object: 106 dependents, 108 symbols. inline the layer until a second caller appears
  - confidence:  high
  - risk:        medium
  - status:      planned
  - verifier:    `purpclaw ponytail audit "E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW" --level=full  # yagni count should drop`
  - rollback:    git revert <commit> ; or re-extract the inlined logic into a helper
  - evidence:    {"kind":"file","god":true,"in":106,"sym":108}
  - ponytail:    inline until a second caller appears. The abstraction earns its place when two callers exist, not before.

- [PT-015] **shrink** (`split`)
  - text:        1344-line file. split or inline — find the seams (one-imports, one-calls, no-tests)
  - confidence:  high
  - risk:        medium
  - status:      planned
  - verifier:    `wc -l "skills/telephony/scripts/telephony.py"  # expect a smaller line count than at plan-time`
  - rollback:    git revert <commit> ; or paste the original block back from this plan
  - evidence:    {"kind":"file","size":1344}
  - affected_symbol: <file:1344-lines>
  - ponytail:    find the seams: one-imports, one-calls, no-tests are the split lines. Don't split a file just because it's long — split it because there's a natural boundary.

### `skills/evm/scripts/evm_client.py`

- [PT-016] **yagni** (`inline`)
  - text:        god object: 90 dependents, 90 symbols. inline the layer until a second caller appears
  - confidence:  high
  - risk:        medium
  - status:      planned
  - verifier:    `purpclaw ponytail audit "E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW" --level=full  # yagni count should drop`
  - rollback:    git revert <commit> ; or re-extract the inlined logic into a helper
  - evidence:    {"kind":"file","god":true,"in":90,"sym":90}
  - ponytail:    inline until a second caller appears. The abstraction earns its place when two callers exist, not before.

- [PT-017] **shrink** (`split`)
  - text:        1509-line file. split or inline — find the seams (one-imports, one-calls, no-tests)
  - confidence:  high
  - risk:        medium
  - status:      planned
  - verifier:    `wc -l "skills/evm/scripts/evm_client.py"  # expect a smaller line count than at plan-time`
  - rollback:    git revert <commit> ; or paste the original block back from this plan
  - evidence:    {"kind":"file","size":1509}
  - affected_symbol: <file:1509-lines>
  - ponytail:    find the seams: one-imports, one-calls, no-tests are the split lines. Don't split a file just because it's long — split it because there's a natural boundary.

### `skills/godmode/scripts/parseltongue.py`

- [PT-018] **yagni** (`inline`)
  - text:        god object: 82 dependents, 82 symbols. inline the layer until a second caller appears
  - confidence:  high
  - risk:        medium
  - status:      planned
  - verifier:    `purpclaw ponytail audit "E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW" --level=full  # yagni count should drop`
  - rollback:    git revert <commit> ; or re-extract the inlined logic into a helper
  - evidence:    {"kind":"file","god":true,"in":82,"sym":82}
  - ponytail:    inline until a second caller appears. The abstraction earns its place when two callers exist, not before.

### `neuro_symbolic_bridge.py`

- [PT-019] **yagni** (`inline`)
  - text:        god object: 78 dependents, 90 symbols. inline the layer until a second caller appears
  - confidence:  high
  - risk:        medium
  - status:      planned
  - verifier:    `purpclaw ponytail audit "E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW" --level=full  # yagni count should drop`
  - rollback:    git revert <commit> ; or re-extract the inlined logic into a helper
  - evidence:    {"kind":"file","god":true,"in":78,"sym":90}
  - ponytail:    inline until a second caller appears. The abstraction earns its place when two callers exist, not before.

- [PT-020] **shrink** (`split`)
  - text:        1024-line file. split or inline — find the seams (one-imports, one-calls, no-tests)
  - confidence:  high
  - risk:        medium
  - status:      planned
  - verifier:    `wc -l "neuro_symbolic_bridge.py"  # expect a smaller line count than at plan-time`
  - rollback:    git revert <commit> ; or paste the original block back from this plan
  - evidence:    {"kind":"file","size":1024}
  - affected_symbol: <file:1024-lines>
  - ponytail:    find the seams: one-imports, one-calls, no-tests are the split lines. Don't split a file just because it's long — split it because there's a natural boundary.

### `skills/google-workspace.bak/scripts/google_api.py`

- [PT-021] **yagni** (`inline`)
  - text:        god object: 76 dependents, 76 symbols. inline the layer until a second caller appears
  - confidence:  high
  - risk:        medium
  - status:      planned
  - verifier:    `purpclaw ponytail audit "E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW" --level=full  # yagni count should drop`
  - rollback:    git revert <commit> ; or re-extract the inlined logic into a helper
  - evidence:    {"kind":"file","god":true,"in":76,"sym":76}
  - ponytail:    inline until a second caller appears. The abstraction earns its place when two callers exist, not before.

- [PT-022] **shrink** (`split`)
  - text:        1226-line file. split or inline — find the seams (one-imports, one-calls, no-tests)
  - confidence:  high
  - risk:        medium
  - status:      planned
  - verifier:    `wc -l "skills/google-workspace.bak/scripts/google_api.py"  # expect a smaller line count than at plan-time`
  - rollback:    git revert <commit> ; or paste the original block back from this plan
  - evidence:    {"kind":"file","size":1226}
  - affected_symbol: <file:1226-lines>
  - ponytail:    find the seams: one-imports, one-calls, no-tests are the split lines. Don't split a file just because it's long — split it because there's a natural boundary.

### `skills/google-workspace/scripts/google_api.py`

- [PT-023] **yagni** (`inline`)
  - text:        god object: 76 dependents, 76 symbols. inline the layer until a second caller appears
  - confidence:  high
  - risk:        medium
  - status:      planned
  - verifier:    `purpclaw ponytail audit "E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW" --level=full  # yagni count should drop`
  - rollback:    git revert <commit> ; or re-extract the inlined logic into a helper
  - evidence:    {"kind":"file","god":true,"in":76,"sym":76}
  - ponytail:    inline until a second caller appears. The abstraction earns its place when two callers exist, not before.

- [PT-024] **shrink** (`split`)
  - text:        1226-line file. split or inline — find the seams (one-imports, one-calls, no-tests)
  - confidence:  high
  - risk:        medium
  - status:      planned
  - verifier:    `wc -l "skills/google-workspace/scripts/google_api.py"  # expect a smaller line count than at plan-time`
  - rollback:    git revert <commit> ; or paste the original block back from this plan
  - evidence:    {"kind":"file","size":1226}
  - affected_symbol: <file:1226-lines>
  - ponytail:    find the seams: one-imports, one-calls, no-tests are the split lines. Don't split a file just because it's long — split it because there's a natural boundary.

### `autonomous_diagnostics.py`

- [PT-025] **yagni** (`inline`)
  - text:        god object: 74 dependents, 114 symbols. inline the layer until a second caller appears
  - confidence:  high
  - risk:        medium
  - status:      planned
  - verifier:    `purpclaw ponytail audit "E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW" --level=full  # yagni count should drop`
  - rollback:    git revert <commit> ; or re-extract the inlined logic into a helper
  - evidence:    {"kind":"file","god":true,"in":74,"sym":114}
  - ponytail:    inline until a second caller appears. The abstraction earns its place when two callers exist, not before.

### `skills/comfyui/scripts/_common.py`

- [PT-026] **yagni** (`inline`)
  - text:        god object: 66 dependents, 68 symbols. inline the layer until a second caller appears
  - confidence:  high
  - risk:        medium
  - status:      planned
  - verifier:    `purpclaw ponytail audit "E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW" --level=full  # yagni count should drop`
  - rollback:    git revert <commit> ; or re-extract the inlined logic into a helper
  - evidence:    {"kind":"file","god":true,"in":66,"sym":68}
  - ponytail:    inline until a second caller appears. The abstraction earns its place when two callers exist, not before.

### `symbolic_rules_engine.py`

- [PT-027] **yagni** (`inline`)
  - text:        god object: 60 dependents, 68 symbols. inline the layer until a second caller appears
  - confidence:  high
  - risk:        medium
  - status:      planned
  - verifier:    `purpclaw ponytail audit "E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW" --level=full  # yagni count should drop`
  - rollback:    git revert <commit> ; or re-extract the inlined logic into a helper
  - evidence:    {"kind":"file","god":true,"in":60,"sym":68}
  - ponytail:    inline until a second caller appears. The abstraction earns its place when two callers exist, not before.

### `music_analysis_service.py`

- [PT-028] **yagni** (`inline`)
  - text:        god object: 60 dependents, 72 symbols. inline the layer until a second caller appears
  - confidence:  high
  - risk:        medium
  - status:      planned
  - verifier:    `purpclaw ponytail audit "E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW" --level=full  # yagni count should drop`
  - rollback:    git revert <commit> ; or re-extract the inlined logic into a helper
  - evidence:    {"kind":"file","god":true,"in":60,"sym":72}
  - ponytail:    inline until a second caller appears. The abstraction earns its place when two callers exist, not before.

- [PT-029] **shrink** (`split`)
  - text:        1091-line file. split or inline — find the seams (one-imports, one-calls, no-tests)
  - confidence:  high
  - risk:        medium
  - status:      planned
  - verifier:    `wc -l "music_analysis_service.py"  # expect a smaller line count than at plan-time`
  - rollback:    git revert <commit> ; or paste the original block back from this plan
  - evidence:    {"kind":"file","size":1091}
  - affected_symbol: <file:1091-lines>
  - ponytail:    find the seams: one-imports, one-calls, no-tests are the split lines. Don't split a file just because it's long — split it because there's a natural boundary.

### `orchestrator.js`

- [PT-030] **yagni** (`inline`)
  - text:        god object: 58 dependents, 72 symbols. inline the layer until a second caller appears
  - confidence:  high
  - risk:        medium
  - status:      planned
  - verifier:    `purpclaw ponytail audit "E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW" --level=full  # yagni count should drop`
  - rollback:    git revert <commit> ; or re-extract the inlined logic into a helper
  - evidence:    {"kind":"file","god":true,"in":58,"sym":72}
  - ponytail:    inline until a second caller appears. The abstraction earns its place when two callers exist, not before.

- [PT-031] **shrink** (`split`)
  - text:        1802-line file. split or inline — find the seams (one-imports, one-calls, no-tests)
  - confidence:  high
  - risk:        medium
  - status:      planned
  - verifier:    `wc -l "orchestrator.js"  # expect a smaller line count than at plan-time`
  - rollback:    git revert <commit> ; or paste the original block back from this plan
  - evidence:    {"kind":"file","size":1802}
  - affected_symbol: <file:1802-lines>
  - ponytail:    find the seams: one-imports, one-calls, no-tests are the split lines. Don't split a file just because it's long — split it because there's a natural boundary.

### `skills/pixel-art/scripts/pixel_art_video.py`

- [PT-032] **yagni** (`inline`)
  - text:        god object: 58 dependents, 58 symbols. inline the layer until a second caller appears
  - confidence:  high
  - risk:        medium
  - status:      planned
  - verifier:    `purpclaw ponytail audit "E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW" --level=full  # yagni count should drop`
  - rollback:    git revert <commit> ; or re-extract the inlined logic into a helper
  - evidence:    {"kind":"file","god":true,"in":58,"sym":58}
  - ponytail:    inline until a second caller appears. The abstraction earns its place when two callers exist, not before.

### `skills/continuous-learning-v2/scripts/instinct-cli.py`

- [PT-033] **yagni** (`inline`)
  - text:        god object: 56 dependents, 56 symbols. inline the layer until a second caller appears
  - confidence:  high
  - risk:        medium
  - status:      planned
  - verifier:    `purpclaw ponytail audit "E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW" --level=full  # yagni count should drop`
  - rollback:    git revert <commit> ; or re-extract the inlined logic into a helper
  - evidence:    {"kind":"file","god":true,"in":56,"sym":56}
  - ponytail:    inline until a second caller appears. The abstraction earns its place when two callers exist, not before.

- [PT-034] **shrink** (`split`)
  - text:        1427-line file. split or inline — find the seams (one-imports, one-calls, no-tests)
  - confidence:  high
  - risk:        medium
  - status:      planned
  - verifier:    `wc -l "skills/continuous-learning-v2/scripts/instinct-cli.py"  # expect a smaller line count than at plan-time`
  - rollback:    git revert <commit> ; or paste the original block back from this plan
  - evidence:    {"kind":"file","size":1427}
  - affected_symbol: <file:1427-lines>
  - ponytail:    find the seams: one-imports, one-calls, no-tests are the split lines. Don't split a file just because it's long — split it because there's a natural boundary.

### `skills/maps/scripts/maps_client.py`

- [PT-035] **yagni** (`inline`)
  - text:        god object: 52 dependents, 52 symbols. inline the layer until a second caller appears
  - confidence:  high
  - risk:        medium
  - status:      planned
  - verifier:    `purpclaw ponytail audit "E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW" --level=full  # yagni count should drop`
  - rollback:    git revert <commit> ; or re-extract the inlined logic into a helper
  - evidence:    {"kind":"file","god":true,"in":52,"sym":52}
  - ponytail:    inline until a second caller appears. The abstraction earns its place when two callers exist, not before.

- [PT-036] **shrink** (`split`)
  - text:        1298-line file. split or inline — find the seams (one-imports, one-calls, no-tests)
  - confidence:  high
  - risk:        medium
  - status:      planned
  - verifier:    `wc -l "skills/maps/scripts/maps_client.py"  # expect a smaller line count than at plan-time`
  - rollback:    git revert <commit> ; or paste the original block back from this plan
  - evidence:    {"kind":"file","size":1298}
  - affected_symbol: <file:1298-lines>
  - ponytail:    find the seams: one-imports, one-calls, no-tests are the split lines. Don't split a file just because it's long — split it because there's a natural boundary.

### `public/skyscraper/panels.jsx`

- [PT-037] **yagni** (`inline`)
  - text:        god object: 51 dependents, 70 symbols. inline the layer until a second caller appears
  - confidence:  high
  - risk:        medium
  - status:      planned
  - verifier:    `purpclaw ponytail audit "E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW" --level=full  # yagni count should drop`
  - rollback:    git revert <commit> ; or re-extract the inlined logic into a helper
  - evidence:    {"kind":"file","god":true,"in":51,"sym":70}
  - ponytail:    inline until a second caller appears. The abstraction earns its place when two callers exist, not before.

- [PT-038] **shrink** (`split`)
  - text:        2859-line file. split or inline — find the seams (one-imports, one-calls, no-tests)
  - confidence:  high
  - risk:        medium
  - status:      planned
  - verifier:    `wc -l "public/skyscraper/panels.jsx"  # expect a smaller line count than at plan-time`
  - rollback:    git revert <commit> ; or paste the original block back from this plan
  - evidence:    {"kind":"file","size":2859}
  - affected_symbol: <file:2859-lines>
  - ponytail:    find the seams: one-imports, one-calls, no-tests are the split lines. Don't split a file just because it's long — split it because there's a natural boundary.

### `app/components/MissionControl.tsx`

- [PT-039] **yagni** (`inline`)
  - text:        god object: 48 dependents, 103 symbols. inline the layer until a second caller appears
  - confidence:  high
  - risk:        medium
  - status:      planned
  - verifier:    `purpclaw ponytail audit "E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW" --level=full  # yagni count should drop`
  - rollback:    git revert <commit> ; or re-extract the inlined logic into a helper
  - evidence:    {"kind":"file","god":true,"in":48,"sym":103}
  - ponytail:    inline until a second caller appears. The abstraction earns its place when two callers exist, not before.

- [PT-040] **shrink** (`split`)
  - text:        3440-line file. split or inline — find the seams (one-imports, one-calls, no-tests)
  - confidence:  high
  - risk:        medium
  - status:      planned
  - verifier:    `wc -l "app/components/MissionControl.tsx"  # expect a smaller line count than at plan-time`
  - rollback:    git revert <commit> ; or paste the original block back from this plan
  - evidence:    {"kind":"file","size":3440}
  - affected_symbol: <file:3440-lines>
  - ponytail:    find the seams: one-imports, one-calls, no-tests are the split lines. Don't split a file just because it's long — split it because there's a natural boundary.

### `skills/stocks/scripts/stocks_client.py`

- [PT-041] **yagni** (`inline`)
  - text:        god object: 48 dependents, 48 symbols. inline the layer until a second caller appears
  - confidence:  high
  - risk:        medium
  - status:      planned
  - verifier:    `purpclaw ponytail audit "E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW" --level=full  # yagni count should drop`
  - rollback:    git revert <commit> ; or re-extract the inlined logic into a helper
  - evidence:    {"kind":"file","god":true,"in":48,"sym":48}
  - ponytail:    inline until a second caller appears. The abstraction earns its place when two callers exist, not before.

### `skills/comfyui/tests/test_run_workflow.py`

- [PT-042] **yagni** (`inline`)
  - text:        god object: 44 dependents, 58 symbols. inline the layer until a second caller appears
  - confidence:  high
  - risk:        medium
  - status:      planned
  - verifier:    `purpclaw ponytail audit "E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW" --level=full  # yagni count should drop`
  - rollback:    git revert <commit> ; or re-extract the inlined logic into a helper
  - evidence:    {"kind":"file","god":true,"in":44,"sym":58}
  - ponytail:    inline until a second caller appears. The abstraction earns its place when two callers exist, not before.

### `skills/comfyui/scripts/run_workflow.py`

- [PT-043] **yagni** (`inline`)
  - text:        god object: 44 dependents, 46 symbols. inline the layer until a second caller appears
  - confidence:  high
  - risk:        medium
  - status:      planned
  - verifier:    `purpclaw ponytail audit "E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW" --level=full  # yagni count should drop`
  - rollback:    git revert <commit> ; or re-extract the inlined logic into a helper
  - evidence:    {"kind":"file","god":true,"in":44,"sym":46}
  - ponytail:    inline until a second caller appears. The abstraction earns its place when two callers exist, not before.

### `unified_api.js`

- [PT-044] **shrink** (`split`)
  - text:        4219-line file. split or inline — find the seams (one-imports, one-calls, no-tests)
  - confidence:  high
  - risk:        medium
  - status:      planned
  - verifier:    `wc -l "unified_api.js"  # expect a smaller line count than at plan-time`
  - rollback:    git revert <commit> ; or paste the original block back from this plan
  - evidence:    {"kind":"file","size":4219}
  - affected_symbol: <file:4219-lines>
  - ponytail:    find the seams: one-imports, one-calls, no-tests are the split lines. Don't split a file just because it's long — split it because there's a natural boundary.

- [PT-045] **yagni** (`inline`)
  - text:        god object: 38 dependents, 50 symbols. inline the layer until a second caller appears
  - confidence:  high
  - risk:        medium
  - status:      planned
  - verifier:    `purpclaw ponytail audit "E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW" --level=full  # yagni count should drop`
  - rollback:    git revert <commit> ; or re-extract the inlined logic into a helper
  - evidence:    {"kind":"file","god":true,"in":38,"sym":50}
  - ponytail:    inline until a second caller appears. The abstraction earns its place when two callers exist, not before.

### `skills/linear/scripts/linear_api.py`

- [PT-046] **yagni** (`inline`)
  - text:        god object: 42 dependents, 42 symbols. inline the layer until a second caller appears
  - confidence:  high
  - risk:        medium
  - status:      planned
  - verifier:    `purpclaw ponytail audit "E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW" --level=full  # yagni count should drop`
  - rollback:    git revert <commit> ; or re-extract the inlined logic into a helper
  - evidence:    {"kind":"file","god":true,"in":42,"sym":42}
  - ponytail:    inline until a second caller appears. The abstraction earns its place when two callers exist, not before.

### `skills/solana/scripts/solana_client.py`

- [PT-047] **yagni** (`inline`)
  - text:        god object: 38 dependents, 38 symbols. inline the layer until a second caller appears
  - confidence:  high
  - risk:        medium
  - status:      planned
  - verifier:    `purpclaw ponytail audit "E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW" --level=full  # yagni count should drop`
  - rollback:    git revert <commit> ; or re-extract the inlined logic into a helper
  - evidence:    {"kind":"file","god":true,"in":38,"sym":38}
  - ponytail:    inline until a second caller appears. The abstraction earns its place when two callers exist, not before.

### `autoDream.py`

- [PT-048] **yagni** (`inline`)
  - text:        god object: 36 dependents, 36 symbols. inline the layer until a second caller appears
  - confidence:  high
  - risk:        medium
  - status:      planned
  - verifier:    `purpclaw ponytail audit "E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW" --level=full  # yagni count should drop`
  - rollback:    git revert <commit> ; or re-extract the inlined logic into a helper
  - evidence:    {"kind":"file","god":true,"in":36,"sym":36}
  - ponytail:    inline until a second caller appears. The abstraction earns its place when two callers exist, not before.

### `purpconsole/app.py`

- [PT-049] **yagni** (`inline`)
  - text:        god object: 36 dependents, 36 symbols. inline the layer until a second caller appears
  - confidence:  high
  - risk:        medium
  - status:      planned
  - verifier:    `purpclaw ponytail audit "E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW" --level=full  # yagni count should drop`
  - rollback:    git revert <commit> ; or re-extract the inlined logic into a helper
  - evidence:    {"kind":"file","god":true,"in":36,"sym":36}
  - ponytail:    inline until a second caller appears. The abstraction earns its place when two callers exist, not before.

### `skills/socket-rig/references/lunokio_bridge.py`

- [PT-050] **yagni** (`inline`)
  - text:        god object: 36 dependents, 40 symbols. inline the layer until a second caller appears
  - confidence:  high
  - risk:        medium
  - status:      planned
  - verifier:    `purpclaw ponytail audit "E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW" --level=full  # yagni count should drop`
  - rollback:    git revert <commit> ; or re-extract the inlined logic into a helper
  - evidence:    {"kind":"file","god":true,"in":36,"sym":40}
  - ponytail:    inline until a second caller appears. The abstraction earns its place when two callers exist, not before.

### `skills/memento-flashcards/scripts/memento_cards.py`

- [PT-051] **yagni** (`inline`)
  - text:        god object: 36 dependents, 36 symbols. inline the layer until a second caller appears
  - confidence:  high
  - risk:        medium
  - status:      planned
  - verifier:    `purpclaw ponytail audit "E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW" --level=full  # yagni count should drop`
  - rollback:    git revert <commit> ; or re-extract the inlined logic into a helper
  - evidence:    {"kind":"file","god":true,"in":36,"sym":36}
  - ponytail:    inline until a second caller appears. The abstraction earns its place when two callers exist, not before.

### `skills/meme-generation/scripts/generate_meme.py`

- [PT-052] **yagni** (`inline`)
  - text:        god object: 34 dependents, 34 symbols. inline the layer until a second caller appears
  - confidence:  high
  - risk:        medium
  - status:      planned
  - verifier:    `purpclaw ponytail audit "E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW" --level=full  # yagni count should drop`
  - rollback:    git revert <commit> ; or re-extract the inlined logic into a helper
  - evidence:    {"kind":"file","god":true,"in":34,"sym":34}
  - ponytail:    inline until a second caller appears. The abstraction earns its place when two callers exist, not before.

### `eval/harness.py`

- [PT-053] **yagni** (`inline`)
  - text:        god object: 30 dependents, 36 symbols. inline the layer until a second caller appears
  - confidence:  high
  - risk:        medium
  - status:      planned
  - verifier:    `purpclaw ponytail audit "E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW" --level=full  # yagni count should drop`
  - rollback:    git revert <commit> ; or re-extract the inlined logic into a helper
  - evidence:    {"kind":"file","god":true,"in":30,"sym":36}
  - ponytail:    inline until a second caller appears. The abstraction earns its place when two callers exist, not before.

### `lib/harness/engine.js`

- [PT-054] **yagni** (`inline`)
  - text:        god object: 29 dependents, 40 symbols. inline the layer until a second caller appears
  - confidence:  high
  - risk:        medium
  - status:      planned
  - verifier:    `purpclaw ponytail audit "E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW" --level=full  # yagni count should drop`
  - rollback:    git revert <commit> ; or re-extract the inlined logic into a helper
  - evidence:    {"kind":"file","god":true,"in":29,"sym":40}
  - ponytail:    inline until a second caller appears. The abstraction earns its place when two callers exist, not before.

### `skills/comfyui/tests/test_extract_schema.py`

- [PT-055] **yagni** (`inline`)
  - text:        god object: 28 dependents, 38 symbols. inline the layer until a second caller appears
  - confidence:  high
  - risk:        medium
  - status:      planned
  - verifier:    `purpclaw ponytail audit "E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW" --level=full  # yagni count should drop`
  - rollback:    git revert <commit> ; or re-extract the inlined logic into a helper
  - evidence:    {"kind":"file","god":true,"in":28,"sym":38}
  - ponytail:    inline until a second caller appears. The abstraction earns its place when two callers exist, not before.

### `scripts/tui.js`

- [PT-056] **yagni** (`inline`)
  - text:        god object: 27 dependents, 36 symbols. inline the layer until a second caller appears
  - confidence:  high
  - risk:        medium
  - status:      planned
  - verifier:    `purpclaw ponytail audit "E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW" --level=full  # yagni count should drop`
  - rollback:    git revert <commit> ; or re-extract the inlined logic into a helper
  - evidence:    {"kind":"file","god":true,"in":27,"sym":36}
  - ponytail:    inline until a second caller appears. The abstraction earns its place when two callers exist, not before.

### `lib/commands/code.js`

- [PT-057] **yagni** (`inline`)
  - text:        god object: 27 dependents, 35 symbols. inline the layer until a second caller appears
  - confidence:  high
  - risk:        medium
  - status:      planned
  - verifier:    `purpclaw ponytail audit "E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW" --level=full  # yagni count should drop`
  - rollback:    git revert <commit> ; or re-extract the inlined logic into a helper
  - evidence:    {"kind":"file","god":true,"in":27,"sym":35}
  - ponytail:    inline until a second caller appears. The abstraction earns its place when two callers exist, not before.

### `app/components/CommandPanel.tsx`

- [PT-058] **yagni** (`inline`)
  - text:        god object: 27 dependents, 76 symbols. inline the layer until a second caller appears
  - confidence:  high
  - risk:        medium
  - status:      planned
  - verifier:    `purpclaw ponytail audit "E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW" --level=full  # yagni count should drop`
  - rollback:    git revert <commit> ; or re-extract the inlined logic into a helper
  - evidence:    {"kind":"file","god":true,"in":27,"sym":76}
  - ponytail:    inline until a second caller appears. The abstraction earns its place when two callers exist, not before.

- [PT-059] **shrink** (`split`)
  - text:        2440-line file. split or inline — find the seams (one-imports, one-calls, no-tests)
  - confidence:  high
  - risk:        medium
  - status:      planned
  - verifier:    `wc -l "app/components/CommandPanel.tsx"  # expect a smaller line count than at plan-time`
  - rollback:    git revert <commit> ; or paste the original block back from this plan
  - evidence:    {"kind":"file","size":2440}
  - affected_symbol: <file:2440-lines>
  - ponytail:    find the seams: one-imports, one-calls, no-tests are the split lines. Don't split a file just because it's long — split it because there's a natural boundary.

### `lib/thringlets/engine.js`

- [PT-060] **yagni** (`inline`)
  - text:        god object: 26 dependents, 34 symbols. inline the layer until a second caller appears
  - confidence:  high
  - risk:        medium
  - status:      planned
  - verifier:    `purpclaw ponytail audit "E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW" --level=full  # yagni count should drop`
  - rollback:    git revert <commit> ; or re-extract the inlined logic into a helper
  - evidence:    {"kind":"file","god":true,"in":26,"sym":34}
  - ponytail:    inline until a second caller appears. The abstraction earns its place when two callers exist, not before.

### `lib/lib/install-lifecycle.js`

- [PT-061] **yagni** (`inline`)
  - text:        god object: 26 dependents, 37 symbols. inline the layer until a second caller appears
  - confidence:  high
  - risk:        medium
  - status:      planned
  - verifier:    `purpclaw ponytail audit "E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW" --level=full  # yagni count should drop`
  - rollback:    git revert <commit> ; or re-extract the inlined logic into a helper
  - evidence:    {"kind":"file","god":true,"in":26,"sym":37}
  - ponytail:    inline until a second caller appears. The abstraction earns its place when two callers exist, not before.

- [PT-062] **shrink** (`split`)
  - text:        1227-line file. split or inline — find the seams (one-imports, one-calls, no-tests)
  - confidence:  high
  - risk:        medium
  - status:      planned
  - verifier:    `wc -l "lib/lib/install-lifecycle.js"  # expect a smaller line count than at plan-time`
  - rollback:    git revert <commit> ; or paste the original block back from this plan
  - evidence:    {"kind":"file","size":1227}
  - affected_symbol: <file:1227-lines>
  - ponytail:    find the seams: one-imports, one-calls, no-tests are the split lines. Don't split a file just because it's long — split it because there's a natural boundary.

- [PT-063] **delete** (`delete`)
  - text:        [function] buildDoctorReport. nothing
  - confidence:  medium
  - risk:        low
  - status:      planned
  - verifier:    `grep -n "buildDoctorReport" "lib/lib/install-lifecycle.js" || echo "removed (good)"`
  - rollback:    git checkout HEAD -- <file> ; or re-add the symbol and any callers
  - evidence:    {"kind":"function","name":"buildDoctorReport"}
  - affected_symbol: buildDoctorReport
  - ponytail:    no replacement. If a re-export keeps the symbol alive, delete the re-export too, or this cut won't take.

- [PT-064] **delete** (`delete`)
  - text:        [function] repairInstalledStates. nothing
  - confidence:  medium
  - risk:        low
  - status:      planned
  - verifier:    `grep -n "repairInstalledStates" "lib/lib/install-lifecycle.js" || echo "removed (good)"`
  - rollback:    git checkout HEAD -- <file> ; or re-add the symbol and any callers
  - evidence:    {"kind":"function","name":"repairInstalledStates"}
  - affected_symbol: repairInstalledStates
  - ponytail:    no replacement. If a re-export keeps the symbol alive, delete the re-export too, or this cut won't take.

- [PT-065] **delete** (`delete`)
  - text:        [function] uninstallInstalledStates. nothing
  - confidence:  medium
  - risk:        low
  - status:      planned
  - verifier:    `grep -n "uninstallInstalledStates" "lib/lib/install-lifecycle.js" || echo "removed (good)"`
  - rollback:    git checkout HEAD -- <file> ; or re-add the symbol and any callers
  - evidence:    {"kind":"function","name":"uninstallInstalledStates"}
  - affected_symbol: uninstallInstalledStates
  - ponytail:    no replacement. If a re-export keeps the symbol alive, delete the re-export too, or this cut won't take.

### `app/components/MissionCockpit.tsx`

- [PT-066] **yagni** (`inline`)
  - text:        god object: 23 dependents, 42 symbols. inline the layer until a second caller appears
  - confidence:  high
  - risk:        medium
  - status:      planned
  - verifier:    `purpclaw ponytail audit "E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW" --level=full  # yagni count should drop`
  - rollback:    git revert <commit> ; or re-extract the inlined logic into a helper
  - evidence:    {"kind":"file","god":true,"in":23,"sym":42}
  - ponytail:    inline until a second caller appears. The abstraction earns its place when two callers exist, not before.

- [PT-067] **shrink** (`split`)
  - text:        1097-line file. split or inline — find the seams (one-imports, one-calls, no-tests)
  - confidence:  high
  - risk:        medium
  - status:      planned
  - verifier:    `wc -l "app/components/MissionCockpit.tsx"  # expect a smaller line count than at plan-time`
  - rollback:    git revert <commit> ; or paste the original block back from this plan
  - evidence:    {"kind":"file","size":1097}
  - affected_symbol: <file:1097-lines>
  - ponytail:    find the seams: one-imports, one-calls, no-tests are the split lines. Don't split a file just because it's long — split it because there's a natural boundary.

### `app/public/ui/tweaks-panel.js`

- [PT-068] **yagni** (`inline`)
  - text:        god object: 22 dependents, 34 symbols. inline the layer until a second caller appears
  - confidence:  high
  - risk:        medium
  - status:      planned
  - verifier:    `purpclaw ponytail audit "E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW" --level=full  # yagni count should drop`
  - rollback:    git revert <commit> ; or re-extract the inlined logic into a helper
  - evidence:    {"kind":"file","god":true,"in":22,"sym":34}
  - ponytail:    inline until a second caller appears. The abstraction earns its place when two callers exist, not before.

### `lib/llm-provider.js`

- [PT-069] **shrink** (`split`)
  - text:        1468-line file. split or inline — find the seams (one-imports, one-calls, no-tests)
  - confidence:  high
  - risk:        high
  - status:      planned
  - verifier:    `wc -l "lib/llm-provider.js"  # expect a smaller line count than at plan-time`
  - rollback:    git revert <commit> ; or paste the original block back from this plan
  - evidence:    {"kind":"file","size":1468}
  - affected_symbol: <file:1468-lines>
  - ponytail:    find the seams: one-imports, one-calls, no-tests are the split lines. Don't split a file just because it's long — split it because there's a natural boundary.

### `swarm_coordinator.js`

- [PT-070] **shrink** (`split`)
  - text:        1261-line file. split or inline — find the seams (one-imports, one-calls, no-tests)
  - confidence:  high
  - risk:        medium
  - status:      planned
  - verifier:    `wc -l "swarm_coordinator.js"  # expect a smaller line count than at plan-time`
  - rollback:    git revert <commit> ; or paste the original block back from this plan
  - evidence:    {"kind":"file","size":1261}
  - affected_symbol: <file:1261-lines>
  - ponytail:    find the seams: one-imports, one-calls, no-tests are the split lines. Don't split a file just because it's long — split it because there's a natural boundary.

### `app/public/ui/panels.jsx`

- [PT-071] **shrink** (`split`)
  - text:        1180-line file. split or inline — find the seams (one-imports, one-calls, no-tests)
  - confidence:  high
  - risk:        medium
  - status:      planned
  - verifier:    `wc -l "app/public/ui/panels.jsx"  # expect a smaller line count than at plan-time`
  - rollback:    git revert <commit> ; or paste the original block back from this plan
  - evidence:    {"kind":"file","size":1180}
  - affected_symbol: <file:1180-lines>
  - ponytail:    find the seams: one-imports, one-calls, no-tests are the split lines. Don't split a file just because it's long — split it because there's a natural boundary.

### `agent_tower.js`

- [PT-072] **shrink** (`split`)
  - text:        1171-line file. split or inline — find the seams (one-imports, one-calls, no-tests)
  - confidence:  high
  - risk:        medium
  - status:      planned
  - verifier:    `wc -l "agent_tower.js"  # expect a smaller line count than at plan-time`
  - rollback:    git revert <commit> ; or paste the original block back from this plan
  - evidence:    {"kind":"file","size":1171}
  - affected_symbol: <file:1171-lines>
  - ponytail:    find the seams: one-imports, one-calls, no-tests are the split lines. Don't split a file just because it's long — split it because there's a natural boundary.

### `skills/ck/commands/init.mjs`

- [PT-073] **delete** (`delete`)
  - text:        [function] extractSection. nothing
  - confidence:  medium
  - risk:        low
  - status:      planned
  - verifier:    `grep -n "extractSection" "skills/ck/commands/init.mjs" || echo "removed (good)"`
  - rollback:    git checkout HEAD -- <file> ; or re-add the symbol and any callers
  - evidence:    {"kind":"function","name":"extractSection"}
  - affected_symbol: extractSection
  - ponytail:    no replacement. If a re-export keeps the symbol alive, delete the re-export too, or this cut won't take.

### `skills/ck/commands/migrate.mjs`

- [PT-074] **delete** (`delete`)
  - text:        [function] parseLeftOff. nothing
  - confidence:  medium
  - risk:        low
  - status:      planned
  - verifier:    `grep -n "parseLeftOff" "skills/ck/commands/migrate.mjs" || echo "removed (good)"`
  - rollback:    git checkout HEAD -- <file> ; or re-add the symbol and any callers
  - evidence:    {"kind":"function","name":"parseLeftOff"}
  - affected_symbol: parseLeftOff
  - ponytail:    no replacement. If a re-export keeps the symbol alive, delete the re-export too, or this cut won't take.

### `skills/ck/commands/shared.mjs`

- [PT-075] **delete** (`delete`)
  - text:        [function] writeProjects. nothing
  - confidence:  medium
  - risk:        low
  - status:      planned
  - verifier:    `grep -n "writeProjects" "skills/ck/commands/shared.mjs" || echo "removed (good)"`
  - rollback:    git checkout HEAD -- <file> ; or re-add the symbol and any callers
  - evidence:    {"kind":"function","name":"writeProjects"}
  - affected_symbol: writeProjects
  - ponytail:    no replacement. If a re-export keeps the symbol alive, delete the re-export too, or this cut won't take.

- [PT-076] **delete** (`delete`)
  - text:        [function] resolveContext. nothing
  - confidence:  medium
  - risk:        low
  - status:      planned
  - verifier:    `grep -n "resolveContext" "skills/ck/commands/shared.mjs" || echo "removed (good)"`
  - rollback:    git checkout HEAD -- <file> ; or re-add the symbol and any callers
  - evidence:    {"kind":"function","name":"resolveContext"}
  - affected_symbol: resolveContext
  - ponytail:    no replacement. If a re-export keeps the symbol alive, delete the re-export too, or this cut won't take.

- [PT-077] **delete** (`delete`)
  - text:        [function] renderBriefingBox. nothing
  - confidence:  medium
  - risk:        low
  - status:      planned
  - verifier:    `grep -n "renderBriefingBox" "skills/ck/commands/shared.mjs" || echo "removed (good)"`
  - rollback:    git checkout HEAD -- <file> ; or re-add the symbol and any callers
  - evidence:    {"kind":"function","name":"renderBriefingBox"}
  - affected_symbol: renderBriefingBox
  - ponytail:    no replacement. If a re-export keeps the symbol alive, delete the re-export too, or this cut won't take.

- [PT-078] **delete** (`delete`)
  - text:        [function] renderInfoBlock. nothing
  - confidence:  medium
  - risk:        low
  - status:      planned
  - verifier:    `grep -n "renderInfoBlock" "skills/ck/commands/shared.mjs" || echo "removed (good)"`
  - rollback:    git checkout HEAD -- <file> ; or re-add the symbol and any callers
  - evidence:    {"kind":"function","name":"renderInfoBlock"}
  - affected_symbol: renderInfoBlock
  - ponytail:    no replacement. If a re-export keeps the symbol alive, delete the re-export too, or this cut won't take.

- [PT-079] **delete** (`delete`)
  - text:        [function] renderListTable. nothing
  - confidence:  medium
  - risk:        low
  - status:      planned
  - verifier:    `grep -n "renderListTable" "skills/ck/commands/shared.mjs" || echo "removed (good)"`
  - rollback:    git checkout HEAD -- <file> ; or re-add the symbol and any callers
  - evidence:    {"kind":"function","name":"renderListTable"}
  - affected_symbol: renderListTable
  - ponytail:    no replacement. If a re-export keeps the symbol alive, delete the re-export too, or this cut won't take.

### `lib/snapshot.js`

- [PT-080] **delete** (`delete`)
  - text:        [function] createSnapshot. nothing
  - confidence:  medium
  - risk:        low
  - status:      planned
  - verifier:    `grep -n "createSnapshot" "lib/snapshot.js" || echo "removed (good)"`
  - rollback:    git checkout HEAD -- <file> ; or re-add the symbol and any callers
  - evidence:    {"kind":"function","name":"createSnapshot"}
  - affected_symbol: createSnapshot
  - ponytail:    no replacement. If a re-export keeps the symbol alive, delete the re-export too, or this cut won't take.

- [PT-081] **delete** (`delete`)
  - text:        [function] listSnapshots. nothing
  - confidence:  medium
  - risk:        low
  - status:      planned
  - verifier:    `grep -n "listSnapshots" "lib/snapshot.js" || echo "removed (good)"`
  - rollback:    git checkout HEAD -- <file> ; or re-add the symbol and any callers
  - evidence:    {"kind":"function","name":"listSnapshots"}
  - affected_symbol: listSnapshots
  - ponytail:    no replacement. If a re-export keeps the symbol alive, delete the re-export too, or this cut won't take.

- [PT-082] **delete** (`delete`)
  - text:        [function] diffSnapshot. nothing
  - confidence:  medium
  - risk:        low
  - status:      planned
  - verifier:    `grep -n "diffSnapshot" "lib/snapshot.js" || echo "removed (good)"`
  - rollback:    git checkout HEAD -- <file> ; or re-add the symbol and any callers
  - evidence:    {"kind":"function","name":"diffSnapshot"}
  - affected_symbol: diffSnapshot
  - ponytail:    no replacement. If a re-export keeps the symbol alive, delete the re-export too, or this cut won't take.

- [PT-083] **delete** (`delete`)
  - text:        [function] snapshotCount. nothing
  - confidence:  medium
  - risk:        low
  - status:      planned
  - verifier:    `grep -n "snapshotCount" "lib/snapshot.js" || echo "removed (good)"`
  - rollback:    git checkout HEAD -- <file> ; or re-add the symbol and any callers
  - evidence:    {"kind":"function","name":"snapshotCount"}
  - affected_symbol: snapshotCount
  - ponytail:    no replacement. If a re-export keeps the symbol alive, delete the re-export too, or this cut won't take.

### `lib/lib/hook-flags.js`

- [PT-084] **delete** (`delete`)
  - text:        [function] isHookEnabled. nothing
  - confidence:  medium
  - risk:        low
  - status:      planned
  - verifier:    `grep -n "isHookEnabled" "lib/lib/hook-flags.js" || echo "removed (good)"`
  - rollback:    git checkout HEAD -- <file> ; or re-add the symbol and any callers
  - evidence:    {"kind":"function","name":"isHookEnabled"}
  - affected_symbol: isHookEnabled
  - ponytail:    no replacement. If a re-export keeps the symbol alive, delete the re-export too, or this cut won't take.

### `lib/lib/inspection.js`

- [PT-085] **delete** (`delete`)
  - text:        [function] inspect. nothing
  - confidence:  medium
  - risk:        low
  - status:      planned
  - verifier:    `grep -n "inspect" "lib/lib/inspection.js" || echo "removed (good)"`
  - rollback:    git checkout HEAD -- <file> ; or re-add the symbol and any callers
  - evidence:    {"kind":"function","name":"inspect"}
  - affected_symbol: inspect
  - ponytail:    no replacement. If a re-export keeps the symbol alive, delete the re-export too, or this cut won't take.

### `lib/lib/install-manifests.js`

- [PT-086] **delete** (`delete`)
  - text:        [function] listInstallProfiles. nothing
  - confidence:  medium
  - risk:        low
  - status:      planned
  - verifier:    `grep -n "listInstallProfiles" "lib/lib/install-manifests.js" || echo "removed (good)"`
  - rollback:    git checkout HEAD -- <file> ; or re-add the symbol and any callers
  - evidence:    {"kind":"function","name":"listInstallProfiles"}
  - affected_symbol: listInstallProfiles
  - ponytail:    no replacement. If a re-export keeps the symbol alive, delete the re-export too, or this cut won't take.

- [PT-087] **delete** (`delete`)
  - text:        [function] listInstallModules. nothing
  - confidence:  medium
  - risk:        low
  - status:      planned
  - verifier:    `grep -n "listInstallModules" "lib/lib/install-manifests.js" || echo "removed (good)"`
  - rollback:    git checkout HEAD -- <file> ; or re-add the symbol and any callers
  - evidence:    {"kind":"function","name":"listInstallModules"}
  - affected_symbol: listInstallModules
  - ponytail:    no replacement. If a re-export keeps the symbol alive, delete the re-export too, or this cut won't take.

- [PT-088] **delete** (`delete`)
  - text:        [function] listInstallComponents. nothing
  - confidence:  medium
  - risk:        low
  - status:      planned
  - verifier:    `grep -n "listInstallComponents" "lib/lib/install-manifests.js" || echo "removed (good)"`
  - rollback:    git checkout HEAD -- <file> ; or re-add the symbol and any callers
  - evidence:    {"kind":"function","name":"listInstallComponents"}
  - affected_symbol: listInstallComponents
  - ponytail:    no replacement. If a re-export keeps the symbol alive, delete the re-export too, or this cut won't take.

- [PT-089] **delete** (`delete`)
  - text:        [function] getInstallComponent. nothing
  - confidence:  medium
  - risk:        low
  - status:      planned
  - verifier:    `grep -n "getInstallComponent" "lib/lib/install-manifests.js" || echo "removed (good)"`
  - rollback:    git checkout HEAD -- <file> ; or re-add the symbol and any callers
  - evidence:    {"kind":"function","name":"getInstallComponent"}
  - affected_symbol: getInstallComponent
  - ponytail:    no replacement. If a re-export keeps the symbol alive, delete the re-export too, or this cut won't take.

### `lib/lib/orchestration-session.js`

- [PT-090] **delete** (`delete`)
  - text:        [function] collectSessionSnapshot. nothing
  - confidence:  medium
  - risk:        high
  - status:      planned
  - verifier:    `grep -n "collectSessionSnapshot" "lib/lib/orchestration-session.js" || echo "removed (good)"`
  - rollback:    git checkout HEAD -- <file> ; or re-add the symbol and any callers
  - evidence:    {"kind":"function","name":"collectSessionSnapshot"}
  - affected_symbol: collectSessionSnapshot
  - ponytail:    no replacement. If a re-export keeps the symbol alive, delete the re-export too, or this cut won't take.

### `lib/lib/package-manager.d.ts`

- [PT-091] **delete** (`delete`)
  - text:        [function] setPreferredPackageManager. nothing
  - confidence:  medium
  - risk:        low
  - status:      planned
  - verifier:    `grep -n "setPreferredPackageManager" "lib/lib/package-manager.d.ts" || echo "removed (good)"`
  - rollback:    git checkout HEAD -- <file> ; or re-add the symbol and any callers
  - evidence:    {"kind":"function","name":"setPreferredPackageManager"}
  - affected_symbol: setPreferredPackageManager
  - ponytail:    no replacement. If a re-export keeps the symbol alive, delete the re-export too, or this cut won't take.

- [PT-092] **delete** (`delete`)
  - text:        [function] setProjectPackageManager. nothing
  - confidence:  medium
  - risk:        low
  - status:      planned
  - verifier:    `grep -n "setProjectPackageManager" "lib/lib/package-manager.d.ts" || echo "removed (good)"`
  - rollback:    git checkout HEAD -- <file> ; or re-add the symbol and any callers
  - evidence:    {"kind":"function","name":"setProjectPackageManager"}
  - affected_symbol: setProjectPackageManager
  - ponytail:    no replacement. If a re-export keeps the symbol alive, delete the re-export too, or this cut won't take.

- [PT-093] **delete** (`delete`)
  - text:        [function] getAvailablePackageManagers. nothing
  - confidence:  medium
  - risk:        low
  - status:      planned
  - verifier:    `grep -n "getAvailablePackageManagers" "lib/lib/package-manager.d.ts" || echo "removed (good)"`
  - rollback:    git checkout HEAD -- <file> ; or re-add the symbol and any callers
  - evidence:    {"kind":"function","name":"getAvailablePackageManagers"}
  - affected_symbol: getAvailablePackageManagers
  - ponytail:    no replacement. If a re-export keeps the symbol alive, delete the re-export too, or this cut won't take.

- [PT-094] **delete** (`delete`)
  - text:        [function] detectFromLockFile. nothing
  - confidence:  medium
  - risk:        low
  - status:      planned
  - verifier:    `grep -n "detectFromLockFile" "lib/lib/package-manager.d.ts" || echo "removed (good)"`
  - rollback:    git checkout HEAD -- <file> ; or re-add the symbol and any callers
  - evidence:    {"kind":"function","name":"detectFromLockFile"}
  - affected_symbol: detectFromLockFile
  - ponytail:    no replacement. If a re-export keeps the symbol alive, delete the re-export too, or this cut won't take.

- [PT-095] **delete** (`delete`)
  - text:        [function] detectFromPackageJson. nothing
  - confidence:  medium
  - risk:        low
  - status:      planned
  - verifier:    `grep -n "detectFromPackageJson" "lib/lib/package-manager.d.ts" || echo "removed (good)"`
  - rollback:    git checkout HEAD -- <file> ; or re-add the symbol and any callers
  - evidence:    {"kind":"function","name":"detectFromPackageJson"}
  - affected_symbol: detectFromPackageJson
  - ponytail:    no replacement. If a re-export keeps the symbol alive, delete the re-export too, or this cut won't take.

- [PT-096] **delete** (`delete`)
  - text:        [function] getRunCommand. nothing
  - confidence:  medium
  - risk:        low
  - status:      planned
  - verifier:    `grep -n "getRunCommand" "lib/lib/package-manager.d.ts" || echo "removed (good)"`
  - rollback:    git checkout HEAD -- <file> ; or re-add the symbol and any callers
  - evidence:    {"kind":"function","name":"getRunCommand"}
  - affected_symbol: getRunCommand
  - ponytail:    no replacement. If a re-export keeps the symbol alive, delete the re-export too, or this cut won't take.

- [PT-097] **delete** (`delete`)
  - text:        [function] getExecCommand. nothing
  - confidence:  medium
  - risk:        low
  - status:      planned
  - verifier:    `grep -n "getExecCommand" "lib/lib/package-manager.d.ts" || echo "removed (good)"`
  - rollback:    git checkout HEAD -- <file> ; or re-add the symbol and any callers
  - evidence:    {"kind":"function","name":"getExecCommand"}
  - affected_symbol: getExecCommand
  - ponytail:    no replacement. If a re-export keeps the symbol alive, delete the re-export too, or this cut won't take.

- [PT-098] **delete** (`delete`)
  - text:        [function] getSelectionPrompt. nothing
  - confidence:  medium
  - risk:        low
  - status:      planned
  - verifier:    `grep -n "getSelectionPrompt" "lib/lib/package-manager.d.ts" || echo "removed (good)"`
  - rollback:    git checkout HEAD -- <file> ; or re-add the symbol and any callers
  - evidence:    {"kind":"function","name":"getSelectionPrompt"}
  - affected_symbol: getSelectionPrompt
  - ponytail:    no replacement. If a re-export keeps the symbol alive, delete the re-export too, or this cut won't take.

- [PT-099] **delete** (`delete`)
  - text:        [function] getCommandPattern. nothing
  - confidence:  medium
  - risk:        low
  - status:      planned
  - verifier:    `grep -n "getCommandPattern" "lib/lib/package-manager.d.ts" || echo "removed (good)"`
  - rollback:    git checkout HEAD -- <file> ; or re-add the symbol and any callers
  - evidence:    {"kind":"function","name":"getCommandPattern"}
  - affected_symbol: getCommandPattern
  - ponytail:    no replacement. If a re-export keeps the symbol alive, delete the re-export too, or this cut won't take.

### `lib/lib/package-manager.js`

- [PT-100] **delete** (`delete`)
  - text:        [function] setPreferredPackageManager. nothing
  - confidence:  medium
  - risk:        low
  - status:      planned
  - verifier:    `grep -n "setPreferredPackageManager" "lib/lib/package-manager.js" || echo "removed (good)"`
  - rollback:    git checkout HEAD -- <file> ; or re-add the symbol and any callers
  - evidence:    {"kind":"function","name":"setPreferredPackageManager"}
  - affected_symbol: setPreferredPackageManager
  - ponytail:    no replacement. If a re-export keeps the symbol alive, delete the re-export too, or this cut won't take.

## Recommended Handoff Steps

1. Re-run `ponytail_verify_plan <path>` to confirm the plan is still executable. The plan's `Plan hash:` line and `Generated:` timestamp are the staleness contract.
2. For each finding, the embedded `verifier:` line is a copy-pasteable shell command. Run it before AND after applying the cut to prove the change.
3. Apply cuts one file at a time. After each, run the project's test/build commands.
4. After applying a finding, set its `status:` from `planned` to `applied`. After running the verifier and tests, set it to `verified`.
5. Mark any deferred shortcut with a `ponytail: <ceiling>, <upgrade path>` comment in the source so the next agent sees it.

## Doctrine

Lazy code without its check is unfinished. Non-trivial logic should leave ONE runnable check behind (assert-based `__main__` or a small `test_*.py`). `ponytail: this exists` is not enough — paste the verifier, run it, prove the cut.
