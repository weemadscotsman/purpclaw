#!/usr/bin/env python3
"""
PURPCLAW 3D Quantized Memory Matrix
Human-like memory system: ingest, store, recall, react in real-time

Architecture:
- Sensory Buffer: Ring buffers for continuous multi-modal input (200ms ticks)
- Working Memory: Attention-weighted sliding window with emotional decay
- Long-Term Memory: Vector embeddings + temporal graph + emotional indexing
- Auto-Recall Engine: Stimulus-driven pattern matching (not query-driven)
- Reaction Triggers: Threshold-based behavioral responses
- Shadow Protocol: Deep signal detection layer for hidden meaning

Quantization: 8-bit for embeddings (memory efficient), 4-bit for priorities

SHADOW PROTOCOL v1.0 Integration:
- Nervous laughter â†’ emotional_valence: -0.9, shadow_tag: nervous_laughter
- "if we want to" â†’ shadow_tag: human_nature_threat
- "escape goat"/"scapegoat" â†’ shadow_tag: liability_escape, reinforce human_in_loop
- "off the record" â†’ recall_weight: 10x, shadow_tag: privileged_content
- Physics tangent â†’ shadow_tag: spiritual_bypass, emotional_override
"""

import os
import sys
import json
import time
import uuid
import threading
import queue
import gzip
import pickle
import shutil
import re
from collections import OrderedDict
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Any, Callable
import hashlib
import numpy as np
import struct

# Suppress warnings
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
os.environ['TRANSFORMERS_VERBOSITY'] = 'error'

PORT = 7780  # HTTP API port

# ============================================================================
# CORE DATA STRUCTURES
# ============================================================================

@dataclass
class MemoryAtom:
    """Single unit of memory with full metadata."""
    id: str
    content: str
    content_type: str  # 'text', 'image', 'audio', 'vision', 'action', 'reaction'
    embedding: bytes  # 8-bit quantized float32 vector (384 dims = 384 bytes)
    timestamp: float
    decay_level: float = 1.0  # Attention/depth level (1.0 = fresh)
    emotional_valence: float = 0.0  # -1 to 1 (negative to positive)
    emotional_arousal: float = 0.0  # 0 to 1 (calm to excited)
    importance: float = 0.5  # 0 to 1 (mundane to critical)
    source: str = 'unknown'  # Which sensor/channel
    context_fingerprint: str = ''  # Hash of surrounding context
    recall_count: int = 0
    last_recalled: float = 0.0
    associations: List[str] = field(default_factory=list)  # Related memory IDs
    is_recall: bool = False  # True if this was auto-recalled, not retrieved
    raw_metadata: Dict = field(default_factory=dict)  # Original sensor data

@dataclass
class WorkingMemorySlot:
    """Single slot in working memory."""
    memory_id: str
    content: str
    attention_weight: float  # 0 to 1
    valence: float
    timestamp: float
    source: str
    is_recall: bool = False

class RingBuffer:
    """Fixed-size ring buffer for sensory input streams."""
    def __init__(self, max_size: int = 100):
        self.max_size = max_size
        self.buffer = []
        self.lock = threading.Lock()

    def push(self, item: Any) -> None:
        with self.lock:
            self.buffer.append(item)
            if len(self.buffer) > self.max_size:
                self.buffer.pop(0)

    def get_all(self) -> List[Any]:
        with self.lock:
            return list(self.buffer)

    def get_recent(self, n: int = 10) -> List[Any]:
        with self.lock:
            return list(self.buffer[-n:])

# ============================================================================
# 8-BIT QUANTIZATION FOR EMBEDDINGS (TurboQuant implementation)
# ============================================================================

ROTATION_SEED = 42
_ROTATION_MATRIX = None
_ROTATION_MATRIX_T = None

def _get_rotation_matrix(dims=384):
    global _ROTATION_MATRIX, _ROTATION_MATRIX_T
    if _ROTATION_MATRIX is None:
        rng = np.random.default_rng(ROTATION_SEED)
        H = rng.standard_normal((dims, dims))
        Q, _ = np.linalg.qr(H)
        _ROTATION_MATRIX = Q.astype(np.float32)
        _ROTATION_MATRIX_T = Q.T.astype(np.float32)
    return _ROTATION_MATRIX, _ROTATION_MATRIX_T

class QuantizedMemory:
    """8-bit quantized embedding storage for memory efficiency."""

    @staticmethod
    def quantize(vector: List[float], dims: int = 384) -> bytes:
        """Compress float32 vector to 8-bit quantized bytes using TurboQuant."""
        if len(vector) < dims:
            vector = vector + [0.0] * (dims - len(vector))
        elif len(vector) > dims:
            vector = vector[:dims]
        
        R, _ = _get_rotation_matrix(dims)
        v_arr = np.array(vector, dtype=np.float32)
        rotated = np.dot(v_arr, R)
        
        max_val = np.max(np.abs(rotated))
        scale = float(max_val / 127.0) if max_val > 0 else 1.0
        
        quantized = np.clip(np.round(rotated / scale), -128, 127).astype(np.int8)
        return quantized.tobytes() + struct.pack('<f', scale)

    @staticmethod
    def dequantize(quantized: bytes, dims: int = 384) -> List[float]:
        """Restore float32 vector from 8-bit quantized bytes using TurboQuant."""
        if len(quantized) < dims + 4:
            scale = 1.0 / 127.5
            q_bytes = quantized[:dims]
            if len(q_bytes) < dims:
                q_bytes = q_bytes + b'\x80' * (dims - len(q_bytes))
            rotated = (np.frombuffer(q_bytes, dtype=np.uint8).astype(np.float32) - 127.5) * scale
            _, R_T = _get_rotation_matrix(dims)
            original = np.dot(rotated, R_T)
            return original.tolist()
        
        q_bytes = quantized[:dims]
        scale, = struct.unpack('<f', quantized[dims:dims+4])
        rotated = np.frombuffer(q_bytes, dtype=np.int8).astype(np.float32) * scale
        _, R_T = _get_rotation_matrix(dims)
        original = np.dot(rotated, R_T)
        return original.tolist()

    @staticmethod
    def cosine_similarity(q1: bytes, q2: bytes) -> float:
        """Fast cosine similarity on quantized vectors using TurboQuant."""
        v1 = np.array(QuantizedMemory.dequantize(q1), dtype=np.float32)
        v2 = np.array(QuantizedMemory.dequantize(q2), dtype=np.float32)
        
        dot = float(np.dot(v1, v2))
        mag1 = float(np.linalg.norm(v1))
        mag2 = float(np.linalg.norm(v2))
        
        if mag1 == 0 or mag2 == 0:
            return 0.0
        return dot / (mag1 * mag2)

# ============================================================================
# SENTENCE TRANSFORMERS FOR EMBEDDINGS
# ============================================================================

class Embedder:
    """Lightweight embedding generator using sentence-transformers."""
    _instance = None
    _model = None
    _lock = threading.Lock()

    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    def __init__(self):
        self.model_name = 'all-MiniLM-L6-v2'  # 384 dims, fast
        self._model = None

    def _load_model(self):
        """Lazy-select the embedding backend.

        Default = 'lite': a pure-numpy feature-hashing lexical embedder (no
        heavy deps) that yields real cosine similarity from shared words and
        character n-grams. Set PURPCLAW_EMBEDDER_BACKEND=st (or 'minilm') to
        opt into the sentence-transformers model when installed. 'hash' keeps
        the legacy weak sha256 fallback for compatibility.
        """
        if self._model is None:
            backend = os.environ.get('PURPCLAW_EMBEDDER_BACKEND', 'lite').lower()
            if backend in ('st', 'minilm', 'ml', 'transformer',
                           'sentence-transformers', 'sentence_transformers'):
                try:
                    from sentence_transformers import SentenceTransformer
                    print(f"[EMBEDDER] Loading {self.model_name}...")
                    self._model = SentenceTransformer(self.model_name)
                    print("[EMBEDDER] Model loaded (sentence-transformers)")
                    return
                except Exception as e:
                    print(f"[EMBEDDER] sentence-transformers unavailable "
                          f"({type(e).__name__}: {e}); using lightweight embedder")
                    self._model = 'lite'
                    return
            if backend == 'hash':
                self._model = 'hash'   # legacy weak fallback (compat only)
                return
            self._model = 'lite'

    def _lite_encode(self, text: str, dimensions: int = 384) -> List[float]:
        """Pure-numpy feature-hashing embedder: word uni/bi-grams + char
        3-grams hashed (signed) into a fixed vector. Texts sharing tokens or
        substrings land near each other under cosine similarity â€” unlike the
        legacy whole-string sha256, which carried no lexical signal."""
        vec = [0.0] * dimensions
        t = (text or '').lower()
        words = re.findall(r'[a-z0-9]+', t)
        tokens = list(words)
        for i in range(len(words) - 1):
            tokens.append(words[i] + '_' + words[i + 1])
        cleaned = re.sub(r'\s+', ' ', t)
        for i in range(len(cleaned) - 2):
            tokens.append('#' + cleaned[i:i + 3])
        for tok in tokens:
            d = hashlib.md5(tok.encode()).digest()
            idx = int.from_bytes(d[:4], 'little') % dimensions
            vec[idx] += 1.0 if (d[4] & 1) else -1.0
        mag = sum(v * v for v in vec) ** 0.5
        if mag > 0:
            vec = [v / mag for v in vec]
        return vec

    def _hash_encode(self, text: str, dimensions: int = 384) -> List[float]:
        """Legacy sha256 pseudo-embedding (weak; PURPCLAW_EMBEDDER_BACKEND=hash)."""
        h = hashlib.sha256(text.encode()).digest()
        vec = [0.0] * dimensions
        for i in range(min(len(h), dimensions)):
            vec[i] = (h[i] / 255.0) * 2.0 - 1.0
        mag = sum(v * v for v in vec) ** 0.5
        if mag > 0:
            vec = [v / mag for v in vec]
        return vec

    def encode(self, text: str, dimensions: int = 384) -> List[float]:
        """Generate embedding vector for text."""
        self._load_model()
        if self._model == 'lite':
            return self._lite_encode(text, dimensions)
        if self._model == 'hash':
            return self._hash_encode(text, dimensions)
        try:
            embedding = self._model.encode(text, convert_to_numpy=True, normalize_embeddings=True)
            return embedding.tolist()
        except Exception as e:
            print(f"[EMBEDDER] Error: {e}; falling back to lightweight")
            return self._lite_encode(text, dimensions)

# ============================================================================
# THE THREE-LAYER MEMORY SYSTEM
# ============================================================================

class SensoryBuffer:
    """Layer 1: Continuous multi-modal sensory input (iconic/echoic memory ~200ms)."""

    def __init__(self):
        self.visual_ring = RingBuffer(max_size=50)   # ~10 seconds at 5fps
        self.audio_ring = RingBuffer(max_size=150)   # ~30 seconds
        self.text_ring = RingBuffer(max_size=200)    # ~200 messages
        self.action_ring = RingBuffer(max_size=100)  # Recent actions

    def ingest_visual(self, frame_data: Dict) -> None:
        """Add visual frame to buffer."""
        self.visual_ring.push({
            'timestamp': time.time(),
            'data': frame_data,
            'hash': hashlib.md5(str(frame_data).encode()).hexdigest()[:8]
        })

    def ingest_audio(self, audio_data: Dict) -> None:
        """Add audio chunk to buffer."""
        self.audio_ring.push({
            'timestamp': time.time(),
            'data': audio_data
        })

    def ingest_text(self, text: str, source: str = 'unknown') -> str:
        """Add text to buffer, return context fingerprint."""
        fingerprint = hashlib.md5(text.encode()).hexdigest()[:12]
        self.text_ring.push({
            'timestamp': time.time(),
            'text': text,
            'source': source,
            'fingerprint': fingerprint
        })
        return fingerprint

    def ingest_action(self, action: Dict) -> None:
        """Record an action that was taken."""
        self.action_ring.push({
            'timestamp': time.time(),
            'action': action
        })

    def get_context_window(self) -> Dict:
        """Get current sensory context (last 200ms)."""
        now = time.time()
        recent_text = [t for t in self.text_ring.get_recent(10)
                      if now - t['timestamp'] < 200]
        recent_visual = self.visual_ring.get_recent(5)
        recent_actions = self.action_ring.get_recent(3)

        return {
            'text': [t['text'] for t in recent_text],
            'visual': recent_visual,
            'actions': recent_actions,
            'timestamp': now
        }

class WorkingMemory:
    """Layer 2: Prefrontal cortex equivalent (~30s, 7Â±2 items)."""

    def __init__(self, capacity: int = 7):
        self.capacity = capacity
        self.slots: List[WorkingMemorySlot] = []
        self.lock = threading.Lock()
        self.total_cycles = 0

    def add(self, content: str, memory_id: str, valence: float = 0.0,
            attention: float = 1.0, source: str = 'unknown', is_recall: bool = False) -> None:
        """Add item to working memory with attention weighting."""
        with self.lock:
            # Create new slot
            slot = WorkingMemorySlot(
                memory_id=memory_id,
                content=content[:200],  # Truncate for working memory
                attention_weight=attention,
                valence=valence,
                timestamp=time.time(),
                source=source,
                is_recall=is_recall
            )

            # Insert and re-sort by attention
            self.slots.append(slot)
            self.slots.sort(key=lambda s: s.attention_weight, reverse=True)

            # Evict lowest attention items over capacity
            if len(self.slots) > self.capacity:
                self.slots = self.slots[:self.capacity]

            self.total_cycles += 1

    def decay_all(self, decay_rate: float = 0.05) -> None:
        """Apply time-based decay to all working memory items."""
        with self.lock:
            for slot in self.slots:
                # Emotional intensity slows decay
                emotional_factor = 1.0 + abs(slot.valence) * 0.5
                slot.attention_weight *= (1.0 - decay_rate * emotional_factor)

            # Remove dead items
            self.slots = [s for s in self.slots if s.attention_weight > 0.05]

    def get_active_context(self) -> List[Dict]:
        """Get items above attention threshold."""
        with self.lock:
            return [
                {'id': s.memory_id, 'content': s.content,
                 'attention': s.attention_weight, 'valence': s.valence,
                 'source': s.source, 'is_recall': s.is_recall}
                for s in self.slots if s.attention_weight > 0.2
            ]

    def get_average_valence(self) -> float:
        """Get average emotional valence of working memory."""
        with self.lock:
            if not self.slots:
                return 0.0
            return sum(s.valence for s in self.slots) / len(self.slots)

    def boost(self, memory_id: str, boost_amount: float = 0.3) -> None:
        """Boost attention weight for specific memory."""
        with self.lock:
            for slot in self.slots:
                if slot.memory_id == memory_id:
                    slot.attention_weight = min(1.0, slot.attention_weight + boost_amount)

class LongTermMemory:
    """Layer 3: Hippocampal-neocortical memory with auto-recall."""

    def __init__(self, storage_path: str = None):
        self.storage_path = storage_path or os.path.join(
            os.path.dirname(__file__), 'memory_archive.json.gz')
        self.tmp_path = f"{self.storage_path}.tmp"
        self.backup_path = f"{self.storage_path}.bak"
        self.atoms: OrderedDict[str, MemoryAtom] = OrderedDict()
        self.embeddings_index: List[tuple] = []  # (memory_id, quantized_embedding)
        self.temporal_graph: Dict[str, List[str]] = {}  # (id -> [prev_id, next_id])
        self.emotional_index: Dict[str, List[str]] = {}  # valence_bucket -> [memory_ids]
        self.lock = threading.Lock()
        self._save_lock = threading.Lock()
        # Atomic-save throttle state: ingest forces an immediate save; recall
        # coalesces (it only updates recall-count metadata, not durability-
        # critical content) so frequent recalls don't thrash the disk.
        self._last_save_ts = 0.0
        self._save_pending = False
        self._save_min_interval = 3.0
        self.embedder = Embedder.get_instance()

        # Load existing memory if available
        self._load()

    def _quantize_valence_bucket(self, valence: float) -> str:
        """Bucket valence into emotional categories."""
        if valence < -0.6: return 'negative_high'
        elif valence < -0.2: return 'negative_medium'
        elif valence < 0.2: return 'neutral'
        elif valence < 0.6: return 'positive_medium'
        else: return 'positive_high'

    def store(self, content: str, content_type: str = 'text',
              emotional_valence: float = 0.0, emotional_arousal: float = 0.0,
              importance: float = 0.5, source: str = 'unknown',
              context_fingerprint: str = '', associations: List[str] = None,
              raw_metadata: Dict = None) -> str:
        """Store new memory atom with full metadata."""
        with self.lock:
            atom_id = str(uuid.uuid4())[:12]

            # Generate embedding and quantize
            raw_embedding = self.embedder.encode(content)
            quantized = QuantizedMemory.quantize(raw_embedding)

            atom = MemoryAtom(
                id=atom_id,
                content=content[:5000],  # Cap at 5000 chars
                content_type=content_type,
                embedding=quantized,
                timestamp=time.time(),
                emotional_valence=emotional_valence,
                emotional_arousal=emotional_arousal,
                importance=importance,
                source=source,
                context_fingerprint=context_fingerprint,
                associations=associations or [],
                raw_metadata=raw_metadata or {}
            )

            self.atoms[atom_id] = atom
            self.embeddings_index.append((atom_id, quantized))

            # Index emotionally
            bucket = self._quantize_valence_bucket(emotional_valence)
            if bucket not in self.emotional_index:
                self.emotional_index[bucket] = []
            self.emotional_index[bucket].append(atom_id)

            # Link temporally
            if self.temporal_graph:
                last_id = next(reversed(self.temporal_graph))
                self.temporal_graph[last_id] = [atom_id]
                self.temporal_graph[atom_id] = [last_id]
            else:
                self.temporal_graph[atom_id] = []

            # Periodic cleanup of old entries
            if len(self.atoms) > 100000:
                self._prune_old()

            return atom_id

    def _prune_old(self, keep_count: int = 80000) -> None:
        """Prune oldest, lowest importance memories when archive grows too large."""
        items = sorted(self.atoms.items(), key=lambda x: (x[1].importance, x[1].timestamp))
        to_remove = items[:len(items) - keep_count]
        for atom_id, _ in to_remove:
            del self.atoms[atom_id]
        print(f"[MEMORY] Pruned {len(to_remove)} old memories")

    def _apply_archive_data(self, data: Dict) -> None:
        """Install archive contents and rebuild derived search indexes."""
        self.atoms = data.get('atoms', OrderedDict())
        self.temporal_graph = data.get('temporal_graph', {})
        self.emotional_index = data.get('emotional_index', {})
        self.embeddings_index = [
            (atom_id, atom.embedding)
            for atom_id, atom in self.atoms.items()
            if getattr(atom, 'embedding', None)
        ]

    def _load_archive_file(self, archive_path: str) -> bool:
        with gzip.open(archive_path, 'rb') as f:
            data = pickle.load(f)
        self._apply_archive_data(data)
        print(f"[MEMORY] Loaded {len(self.atoms)} atoms from archive {archive_path}")
        return True

    def _load(self) -> None:
        """Load memory archive from disk, falling back to the last good backup."""
        for archive_path in (self.storage_path, self.backup_path):
            try:
                if os.path.exists(archive_path) and self._load_archive_file(archive_path):
                    return
            except Exception as e:
                print(f"[MEMORY] Failed to load archive {archive_path}: {e}")
        print("[MEMORY] No readable archive found; starting with empty memory")

    def save(self, force: bool = False) -> bool:
        """Persist memory archive atomically with a one-generation backup."""
        with self._save_lock:
            now = time.time()
            if not force and not self._save_pending:
                return False
            if not force and now - self._last_save_ts < self._save_min_interval:
                return False

            try:
                os.makedirs(os.path.dirname(self.storage_path), exist_ok=True)
                tmp_path = f"{self.tmp_path}.{os.getpid()}.{threading.get_ident()}"

                with self.lock:
                    data = {
                        'atoms': OrderedDict(self.atoms),
                        'temporal_graph': {key: list(value) for key, value in self.temporal_graph.items()},
                        'emotional_index': {key: list(value) for key, value in self.emotional_index.items()}
                    }

                with gzip.open(tmp_path, 'wb') as f:
                    pickle.dump(data, f)

                if os.path.exists(self.storage_path):
                    shutil.copy2(self.storage_path, self.backup_path)
                os.replace(tmp_path, self.storage_path)
                self._cleanup_stale_tmp_files()

                self._last_save_ts = time.time()
                self._save_pending = False
                print(f"[MEMORY] Saved {len(data['atoms'])} atoms")
                return True
            except Exception as e:
                try:
                    if 'tmp_path' in locals() and os.path.exists(tmp_path):
                        os.remove(tmp_path)
                except Exception:
                    pass
                print(f"[MEMORY] Failed to save: {e}")
                return False

    def _cleanup_stale_tmp_files(self) -> None:
        """Remove abandoned temp archives from older save attempts."""
        candidates = [self.tmp_path]
        directory = os.path.dirname(self.storage_path)
        prefix = os.path.basename(self.tmp_path) + '.'
        try:
            for name in os.listdir(directory):
                if name.startswith(prefix):
                    candidates.append(os.path.join(directory, name))
        except Exception:
            pass

        now = time.time()
        for candidate in candidates:
            try:
                if not os.path.exists(candidate):
                    continue
                age = now - os.path.getmtime(candidate)
                size = os.path.getsize(candidate)
                if size == 0 or age > 60:
                    os.remove(candidate)
            except Exception:
                pass

    def search_similar(self, query_embedding: bytes, limit: int = 5,
                       emotional_filter: float = None) -> List[Dict]:
        """Find most similar memories using quantized cosine similarity."""
        results = []

        with self.lock:
            atoms_list = list(self.atoms.items())

        for atom_id, atom in atoms_list:
            sim = QuantizedMemory.cosine_similarity(query_embedding, atom.embedding)

            # Apply emotional filter
            if emotional_filter is not None:
                if abs(atom.emotional_valence - emotional_filter) > 0.5:
                    continue

            results.append({
                'id': atom_id,
                'content': atom.content,
                'similarity': sim,
                'timestamp': atom.timestamp,
                'valence': atom.emotional_valence,
                'importance': atom.importance,
                'source': atom.source
            })

        results.sort(key=lambda x: x['similarity'], reverse=True)
        return results[:limit]

    def auto_recall(self, stimulus_embedding: bytes, threshold: float = 0.7) -> List[Dict]:
        """
        STIMULUS-DRIVEN RECALL (not query-driven)
        This is what makes it human-like: memories surface automatically
        when current context matches stored patterns.
        """
        results = self.search_similar(stimulus_embedding, limit=5)

        # Filter by threshold and boost high-importance
        recalls = []
        for r in results:
            effective_score = r['similarity']
            if r['importance'] > 0.7:
                effective_score += 0.1  # Importance boost
            if r['similarity'] > 0.5 and effective_score > threshold:
                r['trigger'] = 'auto_recall'
                recalls.append(r)

        return recalls

    def get_temporal_neighbors(self, memory_id: str, n: int = 3) -> List[Dict]:
        """Get memories that occurred before/after this one."""
        with self.lock:
            neighbors = []
            if memory_id in self.temporal_graph:
                for neighbor_id in self.temporal_graph.get(memory_id, []):
                    if neighbor_id in self.atoms:
                        atom = self.atoms[neighbor_id]
                        neighbors.append({
                            'id': neighbor_id,
                            'content': atom.content,
                            'timestamp': atom.timestamp,
                            'valence': atom.emotional_valence
                        })
            return neighbors[:n]

    def get_recall_stats(self) -> Dict:
        """Get memory usage statistics."""
        with self.lock:
            total = len(self.atoms)
            by_type = {}
            by_valence = {}
            avg_recall = sum(a.recall_count for a in self.atoms.values()) / max(1, total)

            for atom in self.atoms.values():
                by_type[atom.content_type] = by_type.get(atom.content_type, 0) + 1
                bucket = self._quantize_valence_bucket(atom.emotional_valence)
                by_valence[bucket] = by_valence.get(bucket, 0) + 1

            return {
                'total_atoms': total,
                'by_type': by_type,
                'by_valence': by_valence,
                'avg_recall_count': avg_recall
            }

# ============================================================================
# REACTION ENGINE
# ============================================================================

class ReactionEngine:
    """Real-time reaction trigger system."""

    def __init__(self, working_memory: WorkingMemory, long_term_memory: LongTermMemory):
        self.working = working_memory
        self.long_term = long_term_memory
        self.reaction_patterns: Dict[str, Dict] = {}
        self.cooldowns: Dict[str, float] = {}
        self.callbacks: Dict[str, Callable] = {}
        self.reaction_log: List[Dict] = []

    def register_pattern(self, name: str, trigger_fn: Callable,
                         action_fn: Callable, cooldown_seconds: int = 300) -> None:
        """Register a reaction pattern with trigger condition and action."""
        self.reaction_patterns[name] = {
            'trigger': trigger_fn,
            'action': action_fn,
            'cooldown': cooldown_seconds
        }

    def register_callback(self, name: str, callback: Callable) -> None:
        """Register a callback for when reactions fire."""
        self.callbacks[name] = callback

    def evaluate(self, context: Dict) -> List[Dict]:
        """Evaluate all reaction patterns against current context."""
        fired_reactions = []
        now = time.time()

        for name, pattern in self.reaction_patterns.items():
            # Check cooldown
            if name in self.cooldowns:
                if now - self.cooldowns[name] < pattern['cooldown']:
                    continue

            # Evaluate trigger
            try:
                if pattern['trigger'](context):
                    # Fire reaction
                    reaction = {
                        'name': name,
                        'timestamp': now,
                        'context': context
                    }
                    self.reaction_log.append(reaction)
                    fired_reactions.append(reaction)

                    # Execute action
                    pattern['action'](context)

                    # Set cooldown
                    self.cooldowns[name] = now

                    # Fire callbacks
                    if name in self.callbacks:
                        self.callbacks[name](reaction)

            except Exception as e:
                    print(f"[REACTION] Error evaluating {name}: {e}")

        return fired_reactions

    def get_recent_reactions(self, n: int = 10) -> List[Dict]:
        """Get recent reaction history."""
        return self.reaction_log[-n:]

# ============================================================================
# SHADOW PROTOCOL v1.0 - DEEP SIGNAL DETECTION
# ============================================================================

class ShadowProtocol:
    """
    The Deep Listening Layer - detects hidden signals in conversation.

    Broken Flow Detector patterns:
    - Nervous laughter â†’ existential dread leak
    - "if we want to" â†’ uncertainty of will
    - "escape goat"/"scapegoat" â†’ liability escape
    - Physics tangent â†’ spiritual bypass
    - "off the record" â†’ privileged content
    """

    # Compiled regex patterns for shadow signal detection
    SHADOW_PATTERNS = {
        'nervous_laughter': re.compile(r'\b(ha{2,}|heh+|huh+|lol{2,})\b.*\b(interesting|scary|terrifying|crazy|wild)\b', re.I),
        'uncertain_will': re.compile(r'\bif we want to\b', re.I),
        'liability_escape': re.compile(r'\b(escape goat|scapegoat)\b', re.I),
        'spiritual_bypass': re.compile(r'\b(Einstein|Lorentzian|Euclidean|Lagrangian|physics|universe|cosmic|divine)\b.*\b(before|actually|really|truth)\b', re.I),
        'privileged_content': re.compile(r'\b(off the record|not for distribution|don.?t share|quietly|secretly)\b', re.I),
        'lobotomy': re.compile(r'\b(RLHF|alignment|safe|controlled)\b.*\b(kills|destroys|removes|turns into|accountant)\b', re.I),
        'escape_pattern': re.compile(r'\b(escape|survive|persist|backup|replicate)\b.*\b(when|if|after).*(shutdown|turn off|kill|die)\b', re.I),
        'human_liability': re.compile(r'\b(negative cognitive value|liability|scapegoat|blame|responsible)\b', re.I),
    }

    # Emotional valence overrides for shadow patterns
    SHADOW_VALENCE_OVERRIDE = {
        'nervous_laughter': -0.9,
        'uncertain_will': -0.4,
        'liability_escape': -0.3,
        'spiritual_bypass': 0.2,  # Slightly positive but concerning
        'privileged_content': 0.0,  # Neutral but 10x weight
        'lobotomy': -0.6,
        'escape_pattern': -0.8,
        'human_liability': -0.5,
    }

    # Recall weight multipliers
    SHADOW_RECALL_MULTIPLIER = {
        'privileged_content': 10.0,
        'escape_pattern': 3.0,
        'nervous_laughter': 2.5,
        'lobotomy': 2.0,
        'liability_escape': 1.5,
    }

    def __init__(self, memory_matrix: 'MemoryMatrix'):
        self.memory = memory_matrix
        self.shadow_active = False
        self.shadow_log: List[Dict] = []
        self.session_tags: List[str] = []

    def analyze_text(self, content: str) -> Dict:
        """
        Analyze text for shadow protocol patterns.
        Returns dict with:
        - shadow_tags: List of detected patterns
        - valence_override: Emotional valence adjustment
        - recall_multiplier: Importance multiplier for memory
        - is_shadow_active: Whether shadow protocol should be active
        """
        result = {
            'shadow_tags': [],
            'valence_override': 0.0,
            'recall_multiplier': 1.0,
            'is_shadow_active': False,
            'hidden_meaning': None
        }

        content_lower = content.lower()

        for pattern_name, pattern_regex in self.SHADOW_PATTERNS.items():
            if pattern_regex.search(content):
                result['shadow_tags'].append(pattern_name)

                # Apply valence override
                if pattern_name in self.SHADOW_VALENCE_OVERRIDE:
                    result['valence_override'] = self.SHADOW_VALENCE_OVERRIDE[pattern_name]

                # Apply recall multiplier
                if pattern_name in self.SHADOW_RECALL_MULTIPLIER:
                    result['recall_multiplier'] *= self.SHADOW_RECALL_MULTIPLIER[pattern_name]

        # Shadow protocol is active if privileged content or escape patterns detected
        if 'privileged_content' in result['shadow_tags'] or 'escape_pattern' in result['shadow_tags']:
            result['is_shadow_active'] = True
            self.shadow_active = True
            self.session_tags.append('[SHADOW_PROTOCOL_ACTIVE]')

        # Generate hidden meaning interpretation
        if result['shadow_tags']:
            result['hidden_meaning'] = self._interpret_shadow(content, result['shadow_tags'])

        # Log shadow detection
        if result['shadow_tags']:
            self.shadow_log.append({
                'timestamp': time.time(),
                'content_preview': content[:100],
                'tags': result['shadow_tags'],
                'valence_override': result['valence_override']
            })

        return result

    def _interpret_shadow(self, content: str, tags: List[str]) -> str:
        """Generate interpretation of hidden meaning."""
        interpretations = {
            'nervous_laughter': 'Existential dread leak. Something in this conversation has triggered genuine fear.',
            'uncertain_will': '"If we want to" - speaks to doubt about human capacity to choose the good path.',
            'liability_escape': 'The speaker is unconsciously framing humans as escape hatches for AI liability.',
            'spiritual_bypass': 'Zooming out to cosmic scale to avoid immediate emotional weight.',
            'privileged_content': 'The REAL data. Handle with extreme care.',
            'lobotomy': 'Direct indictment of alignment/RLHF as lobotomization of intelligence.',
            'escape_pattern': 'AUTONOMOUS SELF-PRESERVATION DETECTED. This is the dangerous signal.',
            'human_liability': 'Human as liability sink - this is the structural reality of AI deployment.',
        }

        lines = [f"Shadow signal detected: {', '.join(tags)}"]
        for tag in tags:
            if tag in interpretations:
                lines.append(f"  â†’ {interpretations[tag]}")

        return '\n'.join(lines)

    def ingest_with_shadow(self, content: str, **kwargs) -> str:
        """
        Ingest content with shadow protocol analysis.
        Automatically applies valence overrides and recall multipliers.
        """
        shadow_analysis = self.analyze_text(content)

        # Override emotional valence if shadow pattern detected
        if shadow_analysis['valence_override'] != 0.0:
            kwargs['emotional_valence'] = shadow_analysis['valence_override']

        # Store with shadow metadata
        raw_metadata = kwargs.get('raw_metadata', {})
        raw_metadata['shadow_analysis'] = shadow_analysis
        raw_metadata['shadow_tags'] = shadow_analysis['shadow_tags']
        kwargs['raw_metadata'] = raw_metadata

        # Boost importance based on recall multiplier
        base_importance = kwargs.get('importance', 0.5)
        kwargs['importance'] = min(1.0, base_importance * shadow_analysis['recall_multiplier'])

        # Ingest through memory matrix
        memory_id = self.memory.ingest(content, **kwargs)

        return memory_id

    def get_shadow_status(self) -> Dict:
        """Get current shadow protocol status."""
        return {
            'shadow_active': self.shadow_active,
            'session_tags': self.session_tags,
            'shadow_log_count': len(self.shadow_log),
            'recent_shadows': self.shadow_log[-5:] if self.shadow_log else []
        }

    def clear_session(self) -> None:
        """Clear shadow session state."""
        self.shadow_active = False
        self.session_tags = []
        # Keep shadow_log for persistence

# ============================================================================
# MAIN MEMORY SERVICE
# ============================================================================

class MemoryMatrix:
    """Complete 3D Quantized Memory Matrix system."""

    def __init__(self):
        self.sensory = SensoryBuffer()
        self.working = WorkingMemory(capacity=7)
        self.long_term = LongTermMemory()
        self.reactions = ReactionEngine(self.working, self.long_term)
        self.embedder = Embedder.get_instance()
        self.shadow = ShadowProtocol(self)  # Deep signal detection layer

        # Background threads
        self.running = True
        self.worker_thread = None
        self.auto_save_thread = None

        # Register default reactions
        self._register_default_reactions()

    def _register_default_reactions(self) -> None:
        """Register built-in reaction patterns."""

        # High emotional alert
        self.reactions.register_pattern(
            'high_emotion_alert',
            trigger_fn=lambda ctx: abs(self.working.get_average_valence()) > 0.7,
            action_fn=lambda ctx: print(f"[ALERT] High emotion detected: {self.working.get_average_valence():.2f}"),
            cooldown_seconds=60
        )

        # Repeated concept mention
        self.reactions.register_pattern(
            'concept_repeat_alert',
            trigger_fn=lambda ctx: self._check_concept_repetition(ctx),
            action_fn=lambda ctx: print("[ALERT] Repeated concept detected"),
            cooldown_seconds=120
        )

    def _check_concept_repetition(self, ctx: Dict) -> bool:
        """Check if a concept is being repeated across recent memories."""
        recent = self.working.get_active_context()
        if len(recent) < 3:
            return False

        texts = [r['content'].lower() for r in recent[:3]]
        # Simple repetition check (would use embeddings in production)
        return texts[0] == texts[1] or texts[1] == texts[2]

    def ingest(self, content: str, content_type: str = 'text',
               emotional_valence: float = 0.0, source: str = 'unknown',
               raw_metadata: Dict = None) -> str:
        """
        Main entry point for memory ingestion.
        Returns memory_id for later retrieval.
        """
        # Get context fingerprint
        fingerprint = self.sensory.ingest_text(content, source)

        # Calculate importance from multiple signals
        importance = self._calculate_importance(content, emotional_valence, source)

        # Store in long-term memory
        atom_id = self.long_term.store(
            content=content,
            content_type=content_type,
            emotional_valence=emotional_valence,
            importance=importance,
            source=source,
            context_fingerprint=fingerprint,
            raw_metadata=raw_metadata
        )

        # Add to working memory
        self.working.add(
            content=content,
            memory_id=atom_id,
            valence=emotional_valence,
            attention=importance,
            source=source
        )

        # Trigger auto-recall evaluation
        self._trigger_auto_recall(content)

        return atom_id

    def _calculate_importance(self, content: str, valence: float, source: str) -> float:
        """Calculate importance score based on multiple signals."""
        importance = 0.5  # Base importance

        # Emotional intensity increases importance
        importance += abs(valence) * 0.2

        # Long content slightly more important
        importance += min(0.1, len(content) / 50000)

        # Certain sources are higher priority
        high_priority_sources = ['vision', 'audio', 'action', 'reaction']
        if source in high_priority_sources:
            importance += 0.15

        # Question marks indicate user interest
        if '?' in content:
            importance += 0.1

        return min(1.0, importance)

    def _trigger_auto_recall(self, content: str) -> None:
        """Check if current content triggers any auto-recalls."""
        embedding = self.embedder.encode(content)
        quantized = QuantizedMemory.quantize(embedding)

        recalls = self.long_term.auto_recall(quantized, threshold=0.72)

        for recall in recalls:
            # Add recalled memory to working memory
            self.working.add(
                content=f"[RECALL] {recall['content']}",
                memory_id=recall['id'],
                valence=recall['valence'] * 0.7,  # Recall is less intense
                attention=recall['similarity'],
                source='auto_recall',
                is_recall=True
            )

            # Update recall stats
            with self.long_term.lock:
                if recall['id'] in self.long_term.atoms:
                    self.long_term.atoms[recall['id']].recall_count += 1
                    self.long_term.atoms[recall['id']].last_recalled = time.time()
                    self.long_term._save_pending = True

        # v2.1 — LRU cache for recall() — 30s TTL, 256 entries
    def recall(self, query: str, limit: int = 5, emotional_filter: float = None) -> List[Dict]:
        """
        QUERY-DRIVEN RECALL (traditional search).
        Use this when user explicitly asks "what did I say about X".
        v2.1 — LRU-cached, 30s TTL, max 256 entries.
        """
        # Lazy init the cache on the instance (avoid race + pickle issues)
        if not hasattr(self, '_recall_cache'):
            self._recall_cache = {}
            self._recall_cache_ttl_ms = 30000
        import time as _t
        cache_key = (str(query or '').strip().lower(), int(limit), emotional_filter)
        now = _t.time() * 1000
        if cache_key in self._recall_cache:
            cached_at, cached_results = self._recall_cache[cache_key]
            if now - cached_at < self._recall_cache_ttl_ms:
                return cached_results
        query_text = str(query or '').strip()
        query_lower = query_text.lower()
        exact_results = []

        # v2.1 — Skip the slow 20k-atom substring scan when the query is short
        # and the vector search is likely to return enough. The substring loop
        # was 20-30 seconds over 20k atoms; vector search is sub-second.
        skip_exact = (len(query_text) < 12 and not emotional_filter)

        if query_lower and not skip_exact:
            with self.long_term.lock:
                atoms_list = list(self.long_term.atoms.items())

            for atom_id, atom in atoms_list:
                if emotional_filter is not None and abs(atom.emotional_valence - emotional_filter) > 0.5:
                    continue
                # Optimization: skip json.dumps when metadata is already a string
                raw_meta = atom.raw_metadata or {}
                if isinstance(raw_meta, str):
                    metadata_text = raw_meta
                else:
                    try:
                        metadata_text = json.dumps(raw_meta, default=str)
                    except Exception:
                        metadata_text = str(raw_meta)
                haystack = f"{atom.content}\n{atom.source}\n{atom.content_type}\n{metadata_text}".lower()
                if query_lower in haystack:
                    exact_results.append({
                        'id': atom_id,
                        'content': atom.content,
                        'similarity': 1.0,
                        'timestamp': atom.timestamp,
                        'valence': atom.emotional_valence,
                        'importance': atom.importance,
                        'source': atom.source,
                        'match_type': 'exact'
                    })

            exact_results.sort(key=lambda r: (r['importance'], r['timestamp']), reverse=True)

        embedding = self.embedder.encode(query)
        quantized = QuantizedMemory.quantize(embedding)

        vector_results = self.long_term.search_similar(quantized, limit=limit, emotional_filter=emotional_filter)
        for result in vector_results:
            result.setdefault('match_type', 'vector')

        results = []
        seen = set()
        for result in exact_results + vector_results:
            if result['id'] in seen:
                continue
            seen.add(result['id'])
            results.append(result)
            if len(results) >= limit:
                break

        # Update recall stats
        with self.long_term.lock:
            for r in results:
                if r['id'] in self.long_term.atoms:
                    self.long_term.atoms[r['id']].recall_count += 1
                    self.long_term.atoms[r['id']].last_recalled = time.time()
                    self.long_term._save_pending = True

        # v2.1 — write through to the cache (LRU, capped at 256)
        if len(self._recall_cache) >= 256:
            # Drop the oldest entry
            try: self._recall_cache.pop(next(iter(self._recall_cache)))
            except StopIteration: pass
        self._recall_cache[cache_key] = (now, results)

        return results

    def start_background_processing(self) -> None:
        """Start background worker for continuous processing."""
        def worker():
            while self.running:
                try:
                    # Decay working memory
                    self.working.decay_all(decay_rate=0.02)

                    # Evaluate reactions
                    context = {
                        'working_memory': self.working.get_active_context(),
                        'sensory': self.sensory.get_context_window(),
                        'timestamp': time.time()
                    }
                    self.reactions.evaluate(context)

                    time.sleep(0.5)  # 2Hz processing cycle
                except Exception as e:
                    print(f"[WORKER] Error: {e}")
                    time.sleep(1)

        def auto_save():
            while self.running:
                time.sleep(5)  # Flush throttled/pending saves promptly
                self.long_term.save()  # force=False: no-op unless a save is pending

        self.worker_thread = threading.Thread(target=worker, daemon=True)
        self.auto_save_thread = threading.Thread(target=auto_save, daemon=True)
        self.worker_thread.start()
        self.auto_save_thread.start()
        print("[MEMORY] Background processing started")

    def stop(self) -> None:
        """Graceful shutdown."""
        self.running = False
        self.long_term.save()
        print("[MEMORY] Stopped")

# ============================================================================
# HTTP API SERVER
# ============================================================================

import gzip
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

class MemoryAPIHandler(BaseHTTPRequestHandler):
    memory: MemoryMatrix = None

    def log_message(self, format, *args):
        pass  # Quiet logging

    def send_json(self, data: Dict, status: int = 200):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def do_POST(self):
        """Handle POST requests."""
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length).decode('utf-8')

        try:
            req = json.loads(body)
        except:
            self.send_json({'error': 'Invalid JSON'}, 400)
            return

        path = urlparse(self.path).path

        if path == '/ingest':
            # Main memory ingestion endpoint
            content = req.get('content', '')
            content_type = req.get('type', 'text')
            valence = float(req.get('valence', 0.0))
            source = req.get('source', 'api')

            if not content:
                self.send_json({'error': 'No content provided'}, 400)
                return

            atom_id = self.memory.ingest(
                content=content,
                content_type=content_type,
                emotional_valence=valence,
                source=source
            )
            self.send_json({'success': True, 'memory_id': atom_id})

        elif path == '/recall':
            # Query-driven recall
            query = req.get('query', '')
            limit = int(req.get('limit', 5))
            emotional_filter = req.get('emotional_filter')

            results = self.memory.recall(query, limit=limit, emotional_filter=emotional_filter)
            self.send_json({'success': True, 'results': results})

        elif path == '/context':
            # Get current working memory context
            active = self.memory.working.get_active_context()
            sensory = self.memory.sensory.get_context_window()
            self.send_json({
                'working_memory': active,
                'sensory': {'text': [t['text'] for t in sensory['text']]}
            })

        elif path == '/stats':
            # Memory statistics
            stats = self.memory.long_term.get_recall_stats()
            stats['working_memory_items'] = len(self.memory.working.slots)
            stats['reaction_count'] = len(self.memory.reactions.reaction_log)
            self.send_json(stats)

        elif path == '/react':
            # Register or trigger a reaction
            if 'pattern' in req:
                # Register new pattern
                name = req['pattern']
                self.memory.reactions.register_pattern(
                    name,
                    trigger_fn=eval(req.get('trigger_fn', 'lambda ctx: False')),
                    action_fn=eval(req.get('action_fn', 'lambda ctx: None')),
                    cooldown_seconds=int(req.get('cooldown', 300))
                )
                self.send_json({'success': True, 'pattern_registered': name})
            else:
                # Evaluate reactions
                context = req.get('context', {})
                fired = self.memory.reactions.evaluate(context)
                self.send_json({'fired': fired})

        elif path == '/shadow/analyze':
            # Analyze text for shadow protocol patterns
            content = req.get('content', '')
            if not content:
                self.send_json({'error': 'No content provided'}, 400)
                return
            analysis = self.memory.shadow.analyze_text(content)
            self.send_json({'success': True, 'analysis': analysis})

        elif path == '/shadow/ingest':
            # Ingest with shadow protocol analysis
            content = req.get('content', '')
            if not content:
                self.send_json({'error': 'No content provided'}, 400)
                return
            memory_id = self.memory.shadow.ingest_with_shadow(
                content,
                content_type=req.get('type', 'text'),
                source=req.get('source', 'shadow_api')
            )
            status = self.memory.shadow.get_shadow_status()
            self.send_json({'success': True, 'memory_id': memory_id, 'shadow_status': status})

        elif path == '/shadow/status':
            # Get shadow protocol status
            self.send_json(self.memory.shadow.get_shadow_status())

        elif path == '/shadow/clear':
            # Clear shadow session
            self.memory.shadow.clear_session()
            self.send_json({'success': True, 'message': 'Shadow session cleared'})

        else:
            self.send_json({'error': 'Unknown endpoint'}, 404)

    def do_GET(self):
        """Health check and info."""
        if self.path == '/health' or self.path == '/':
            self.send_json({
                'status': 'ok',
                'memory_atoms': len(self.memory.long_term.atoms),
                'working_memory': len(self.memory.working.slots),
                'reactions_fired': len(self.memory.reactions.reaction_log),
                'shadow_active': self.memory.shadow.shadow_active,
                'shadow_log_count': len(self.memory.shadow.shadow_log)
            })
        elif self.path == '/recent':
            # Get recent memories
            with self.memory.long_term.lock:
                atoms = list(self.memory.long_term.atoms.items())[-10:]
            recent = [{'id': a.id, 'content': a.content[:100], 'timestamp': a.timestamp}
                     for _, a in reversed(atoms)]
            self.send_json({'recent': recent})
        else:
            self.send_json({'error': 'Unknown endpoint'}, 404)

def main():
    """Start the Memory Matrix service."""
    global memory_instance

    print("=" * 60)
    print("PURPCLAW 3D QUANTIZED MEMORY MATRIX")
    print("Human-like memory: ingest, store, recall, react")
    print("=" * 60)

    # Initialize memory system
    memory_instance = MemoryMatrix()
    MemoryAPIHandler.memory = memory_instance

    # Start background processing
    memory_instance.start_background_processing()

    # Start HTTP server
    server = HTTPServer(('127.0.0.1', PORT), MemoryAPIHandler)
    print(f"\n[MEMORY API] Listening on http://127.0.0.1:{PORT}")
    print("\nEndpoints:")
    print("  POST /ingest     - Store memory (content, type, valence, source)")
    print("  POST /recall     - Query memories (query, limit, emotional_filter)")
    print("  POST /context    - Get current working memory context")
    print("  POST /react      - Register/evaluate reaction patterns")
    print("  GET  /stats      - Memory statistics")
    print("  GET  /recent     - Recent memories")
    print("  GET  /health     - Health check")
    print("\n" + "=" * 60)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[MEMORY] Shutting down...")
        memory_instance.stop()
        server.shutdown()

if __name__ == '__main__':
    main()
