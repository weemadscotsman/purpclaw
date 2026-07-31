# pool_service State Contract

**Effective:** 2026-07-31
**Owner:** `pool_service.js` — the sole writer to all pool files.
**Consumers:** Any module may read pool files. Only `pool_service.js` writes.

---

## Files owned

| File | Purpose | Write model |
|---|---|---|
| `.purpclaw/hivemind/spring-index.json` | Spring/agent registry index | Atomic write (rename) |
| `agent_work/pool/index.json` | Task/query index | Atomic write (rename) |
| `agent_work/pool/queries.jsonl` | Append-only query log | Append only |
| `agent_work/pool/memory.jsonl` | Append-only memory log | Append only |
| `agent_work/pool/failures.jsonl` | Append-only failure log | Append only |

---

## Rules

### Writes
- **Index files** (`spring-index.json`, `index.json`): write to temp file → fsync → rename. Never write in-place.
- **JSONL files** (`queries.jsonl`, `memory.jsonl`, `failures.jsonl`): append only. One record per line. Never truncate unless rotating.

### Startup replay
- On boot, `pool_service.js` reads `queries.jsonl` and `memory.jsonl` to reconstruct in-memory state.
- Replay is **not** transactional — if replay fails, the service logs the error and starts with an empty state, keeping the JSONL intact.
- The `.jsonl` files are the source of truth after a crash; the in-memory index is rebuildable.

### Concurrent access
- **Single-writer rule**: only ONE instance of `pool_service.js` may run at a time.
- If embedding pool into a shared process, use a mutex or process-level lock to prevent concurrent writes.
- `agent_work/pool/*.jsonl` files must not be opened by multiple processes simultaneously.

### Rotation
- `queries.jsonl` and `memory.jsonl` rotate when they exceed 50 MB.
- Rotation: rename to `queries-YYYY-MM-DD-HHMMSS.jsonl`, start a new empty file.
- Rotated files are kept indefinitely (not auto-deleted) — they are the training buffer source.

### Paths
- All paths are relative to `PURP_DIR` (project root).
- No absolute paths; no cross-directory writes.

---

## Before embedding

If folding pool logic into a shared host process (e.g. the API process):

1. Implement a file-level mutex using `fs.flock` or a lock file (`agent_work/pool/.lock`)
2. Ensure only one process initialises the in-memory index at startup
3. Confirm the JSONL append model is preserved — do not switch to in-place writes
4. The training buffer pipeline (`lib/training-buffer.js`) reads `queries.jsonl` and `memory.jsonl` — its access is read-only and safe concurrent with pool writes

---

## Verification

Run: `purpclaw pool --status`
Expected: shows index size, jsonl sizes, last write timestamp, replay status.
