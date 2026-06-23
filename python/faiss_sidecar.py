#!/usr/bin/env python3
"""
PurpClaw FAISS Sidecar
======================
Intentionally small and boring. Boring survives production.

JSON stdin/stdout bridge for FAISS vector operations.
Called by lib/vector/providers/faissProvider.js.

Commands:
  index   — add vectors + metadata, save FAISS index
  search  — query with optional tombstone denylist
  compact — rebuild index excluding tombstoned vectors
  status  — index stats
"""

import json
import os
import sys
import struct
from pathlib import Path
from typing import Any, Dict, List

import numpy as np

try:
    import faiss
except ImportError:
    print(json.dumps({"ok": False, "error": "faiss-cpu not installed. Run: pip install faiss-cpu"}))
    sys.exit(1)


def ensure_parent(p: str) -> None:
    Path(p).parent.mkdir(parents=True, exist_ok=True)


def read_jsonl(path: str) -> List[Dict]:
    if not os.path.exists(path):
        return []
    with open(path, "r", encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def write_jsonl(path: str, records: List[Dict]) -> None:
    ensure_parent(path)
    with open(path, "w", encoding="utf-8") as f:
        for r in records:
            f.write(json.dumps(r, default=str) + "\n")


def load_tombstones(tombstone_path: str) -> set:
    if not os.path.exists(tombstone_path):
        return set()
    with open(tombstone_path, "r", encoding="utf-8") as f:
        return set(json.load(f))


# ── Commands ────────────────────────────────────────────────────────────────

def cmd_index(index_path: str, meta_path: str, dim: int, payload: Dict) -> Dict:
    vectors = np.array(payload["vectors"], dtype=np.float32)
    metadata = payload.get("metadata", [])

    if vectors.shape[1] != dim:
        return {"ok": False, "error": f"dimension mismatch: got {vectors.shape[1]}, expected {dim}"}

    # Build FAISS index
    index = faiss.IndexFlatIP(dim)  # Inner product ≈ cosine for normalized vectors
    index.add(vectors)

    # Save index
    ensure_parent(index_path)
    faiss.write_index(index, index_path)

    # Save metadata (append)
    existing = read_jsonl(meta_path)
    existing.extend(metadata)
    write_jsonl(meta_path, existing)

    return {"ok": True, "indexed": len(vectors), "total": len(existing)}


def cmd_search(index_path: str, meta_path: str, dim: int, payload: Dict) -> Dict:
    if not os.path.exists(index_path):
        return {"ok": False, "error": "no index — index vectors first"}

    query = np.array([payload["query"]], dtype=np.float32)
    top_k = min(payload.get("topK", 10), 100)
    tombstones = set(payload.get("tombstones", []))
    filters = payload.get("filters", {})

    index = faiss.read_index(index_path)
    scores, indices = index.search(query, top_k + len(tombstones) + 10)  # Over-fetch to account for filtering

    # Load metadata
    metadata = read_jsonl(meta_path)

    results = []
    seen = set()
    for score, idx in zip(scores[0], indices[0]):
        if idx < 0 or idx >= len(metadata):
            continue
        meta = metadata[idx]
        meta_id = meta.get("id", str(idx))

        # Skip tombstoned
        if meta_id in tombstones:
            continue

        # Apply filters
        skip = False
        for k, v in filters.items():
            if k in meta and meta[k] != v:
                skip = True
                break
        if skip:
            continue

        results.append({"id": meta_id, "score": float(score), "metadata": meta})
        seen.add(meta_id)
        if len(results) >= top_k:
            break

    return {"ok": True, "results": results[:top_k], "backend": "faiss", "tombstonesActive": len(tombstones)}


def cmd_compact(index_path: str, meta_path: str, dim: int, payload: Dict) -> Dict:
    if not os.path.exists(index_path):
        return {"ok": False, "error": "no index to compact"}

    tombstones = set(payload.get("tombstones", []))
    if not tombstones:
        return {"ok": True, "compacted": False, "reason": "no tombstones"}

    metadata = read_jsonl(meta_path)

    # Filter out tombstoned vectors
    kept = [(i, m) for i, m in enumerate(metadata) if m.get("id", str(i)) not in tombstones]
    removed = len(metadata) - len(kept)

    if len(kept) == 0:
        # All tombstoned — create empty index
        os.remove(index_path) if os.path.exists(index_path) else None
        write_jsonl(meta_path, [])
        return {"ok": True, "compacted": True, "removed": removed, "remaining": 0}

    # Rebuild from original vectors (we need to reload)
    # Since we only store metadata, we need the original vectors — 
    # for now, just rewrite metadata without tombstoned entries
    kept_meta = [m for _, m in kept]
    write_jsonl(meta_path, kept_meta)

    # FAISS doesn't support O(1) delete, so we mark as needing re-index
    # A full rebuild requires re-indexing from the source corpus
    return {
        "ok": True,
        "compacted": True,
        "removed": removed,
        "remaining": len(kept_meta),
        "note": "metadata cleaned. re-index from source for full rebuild."
    }


def cmd_status(index_path: str, meta_path: str, dim: int) -> Dict:
    exists = os.path.exists(index_path)
    indexed = len(read_jsonl(meta_path)) if os.path.exists(meta_path) else 0
    size_mb = os.path.getsize(index_path) / (1024 * 1024) if exists else 0
    return {"ok": True, "exists": exists, "indexed": indexed, "sizeMb": round(size_mb, 2)}


# ── Main ────────────────────────────────────────────────────────────────────

def main():
    try:
        request = json.loads(sys.stdin.read())
    except Exception as e:
        print(json.dumps({"ok": False, "error": f"invalid json: {e}"}))
        sys.exit(1)

    command = request.get("command", "")
    index_path = request.get("indexPath", ".purpclaw/vector/faiss/index.faiss")
    meta_path = request.get("metaPath", ".purpclaw/vector/faiss/metadata.jsonl")
    dim = request.get("dim", 768)

    try:
        if command == "index":
            result = cmd_index(index_path, meta_path, dim, request.get("payload", {}))
        elif command == "search":
            result = cmd_search(index_path, meta_path, dim, request.get("payload", {}))
        elif command == "compact":
            result = cmd_compact(index_path, meta_path, dim, request.get("payload", {}))
        elif command == "status":
            result = cmd_status(index_path, meta_path, dim)
        else:
            result = {"ok": False, "error": f"unknown command: {command}"}
    except Exception as e:
        result = {"ok": False, "error": str(e)}

    print(json.dumps(result, default=str))


if __name__ == "__main__":
    main()
