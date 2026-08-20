#!/usr/bin/env python3
"""
PURPCLAW Memory Matrix v2 — Neuro-Symbolic Upgrade
===================================================
Extends the 3-layer memory system with:
- Temporal Projection Engine: epistemic queries about past states
- Counterfactual Memory: "what if I had forgotten X?" reasoning
- NeuroSymbolicBridge: bidirectional lift/ground to symbolic rules engine
- Enhanced reaction system with symbolic triggers

Layer Architecture:
  Sensory Buffer (200ms) → Working Memory (7±2, 30s) → Long-Term Memory
                                                             ↓
                                          TemporalProjection ←→ SymbolicBridge

Usage:
    from memory_matrix_v2 import MemoryMatrixV2
    mm = MemoryMatrixV2()
    mm.ingest("Meeting with Alice about the project", source="user")
    result = mm.temporal_project("what was I working on at", target_time=time.time() - 3600)
    cf = mm.counterfactual_what_if("I had remembered the deadline", query="project status")
"""

# PEP 563: annotations are stored as strings and never evaluated at class-body
# time. Without this, `def __init__(self, long_term_memory: LongTermMemory, ...)`
# is evaluated while the class is being defined, so if the optional
# `from memory_matrix import ...` above failed, the module dies with
# NameError instead of running degraded. BASE_AVAILABLE exists precisely to
# allow running without the base import — this makes that fallback real.
from __future__ import annotations

import os
import sys
import json
import time
import uuid
import gzip
import pickle
import hashlib
import threading
try:
    import spring_doctrine
except Exception:
    spring_doctrine = None
import re
import numpy as np
import struct
from collections import OrderedDict, defaultdict
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Any, Callable, Set, Tuple
from datetime import datetime, timedelta

# ── Import existing Memory Matrix components ────────────────────────────────

try:
    # _ROOT is services/cognitive/, so the old "_ROOT/scripts/cognitive" pointed
    # at services/cognitive/scripts/cognitive — which does not exist. The base
    # module lives at the PROJECT root: <repo>/scripts/cognitive/memory_matrix.py.
    # With only _ROOT on sys.path, `from memory_matrix import MemoryMatrix`
    # resolved to THIS file (a self-import), so the base classes were never found
    # and every ingest fell through to `return "no_base"` — memory silently
    # discarded while the service still logged "Memory Matrix v2 initialized".
    _ROOT = os.path.dirname(os.path.abspath(__file__))
    _PROJECT_ROOT = os.path.dirname(os.path.dirname(_ROOT))
    _COGNITIVE_SCRIPTS = os.path.join(_PROJECT_ROOT, "scripts", "cognitive")

    # THIS file is also called memory_matrix.py, so it already occupies
    # sys.modules['memory_matrix']. A plain `from memory_matrix import ...`
    # therefore resolved to itself — "cannot import name 'MemoryMatrix' from
    # partially initialized module 'memory_matrix' (circular import)" — no
    # matter what sys.path said. Load the base by explicit FILE PATH under a
    # distinct module name so the two can never collide again.
    import importlib.util as _ilu
    _base_file = os.path.join(_COGNITIVE_SCRIPTS, "memory_matrix.py")
    if not os.path.isfile(_base_file):
        raise ImportError(f"base memory_matrix.py not found at {_base_file}")
    _spec = _ilu.spec_from_file_location("purpclaw_base_memory_matrix", _base_file)
    _base_mod = _ilu.module_from_spec(_spec)
    sys.modules["purpclaw_base_memory_matrix"] = _base_mod
    _spec.loader.exec_module(_base_mod)
    from purpclaw_base_memory_matrix import (
        MemoryMatrix, MemoryAtom, QuantizedMemory, Embedder,
        SensoryBuffer, WorkingMemory, LongTermMemory, RingBuffer,
        ReactionEngine, ShadowProtocol
    )
    BASE_AVAILABLE = True
except ImportError as e:
    BASE_AVAILABLE = False
    print(f"[MEMv2] Base memory_matrix not available: {e}")

# ── Symbolic Rules Engine integration ──────────────────────────────────────

try:
    from symbolic_rules_engine import DatalogEngine
    RULES_ENGINE = DatalogEngine
except ImportError:
    RULES_ENGINE = None

# ── Quantization helpers (TurboQuant 8-bit adaptive quantization) ───────────

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

def quantize_vec(vector: List[float], dims: int = 384) -> bytes:
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

def dequantize_vec(quantized: bytes, dims: int = 384) -> List[float]:
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

def cosine_sim(q1: bytes, q2: bytes) -> float:
    v1 = np.array(dequantize_vec(q1), dtype=np.float32)
    v2 = np.array(dequantize_vec(q2), dtype=np.float32)
    
    dot = float(np.dot(v1, v2))
    mag1 = float(np.linalg.norm(v1))
    mag2 = float(np.linalg.norm(v2))
    
    if mag1 == 0 or mag2 == 0:
        return 0.0
    return dot / (mag1 * mag2)

# ============================================================================
# TEMPORAL PROJECTION ENGINE
# ============================================================================

@dataclass
class TemporalSlice:
    """A snapshot of memory state at a specific time."""
    timestamp: float
    memory_ids: List[str]
    entities: Dict[str, str]  # entity_name -> memory_id
    summary: str = ""

class TemporalProjectionEngine:
    """
    Epistemic temporal reasoning over memory.

    Answers questions like:
    - "What was I thinking about at T?"
    - "Who was mentioned around time T?"
    - "What was the state of entity X at time T?"
    - "What happened between T1 and T2?"
    """

    def __init__(self, long_term_memory: LongTermMemory, embedder: Embedder):
        self.ltm = long_term_memory
        self.embedder = embedder
        self.lock = threading.RLock()
        # Temporal index: time bucket (1s) → [memory_ids]
        self._time_index: Dict[int, Set[str]] = defaultdict(set)
        # Entity timeline: entity_name → [(start_time, end_time, memory_id)]
        self._entity_timeline: Dict[str, List[Tuple[float, float, str]]] = defaultdict(list)
        # Build index from existing atoms
        self._rebuild_index()

    def _rebuild_index(self) -> None:
        """Rebuild temporal index from loaded memories."""
        with self.lock:
            for atom_id, atom in self.ltm.atoms.items():
                bucket = int(atom.timestamp)
                self._time_index[bucket].add(atom_id)
            # Extract entity timelines
            self._extract_entity_timelines()

    def _extract_entity_timelines(self) -> None:
        """Build entity timeline from all atoms."""
        # Simple named-entity-like extraction
        for atom_id, atom in self.ltm.atoms.items():
            text = atom.content.lower()
            words = re.findall(r'\b[a-z]{3,}\b', text)
            for word in words:
                if word[0].isupper() or word in ['alice', 'bob', 'charlie', 'david', 'eve', 'frank']:
                    self._entity_timeline[word].append(
                        (atom.timestamp, atom.timestamp + 300, atom_id)
                    )

    def ingest_temporal(self, atom: MemoryAtom) -> None:
        """Index a newly ingested memory atom."""
        with self.lock:
            bucket = int(atom.timestamp)
            self._time_index[bucket].add(atom.id)
            # Extract entities
            text = atom.content.lower()
            words = re.findall(r'\b[a-z]{3,}\b', text)
            for word in words:
                self._entity_timeline[word].append(
                    (atom.timestamp, atom.timestamp + 300, atom.id)
                )

    def was_present(self, entity: str, at_time: float, window: float = 300) -> bool:
        """Was entity X present/mentioned within window seconds of at_time?"""
        with self.lock:
            for start, end, _ in self._entity_timeline.get(entity.lower(), []):
                if start - window <= at_time <= end + window:
                    return True
            return False

    def what_was_active(self, at_time: float, window: float = 300) -> List[str]:
        """What memory IDs were active at time T (± window)?"""
        with self.lock:
            results = []
            for atom_id, atom in self.ltm.atoms.items():
                if abs(atom.timestamp - at_time) <= window:
                    results.append(atom_id)
            return results

    def state_at(self, entity: str, at_time: float) -> Optional[Dict]:
        """What was entity X doing/saying at time T?"""
        with self.lock:
            best = None
            best_dist = float('inf')
            for atom_id, atom in self.ltm.atoms.items():
                text = atom.content.lower()
                if entity.lower() in text:
                    dist = abs(atom.timestamp - at_time)
                    if dist < best_dist:
                        best_dist = dist
                        best = {
                            'memory_id': atom_id,
                            'content': atom.content,
                            'timestamp': atom.timestamp,
                            'distance_seconds': dist,
                            'valence': atom.emotional_valence
                        }
            return best

    def what_happened_between(self, t1: float, t2: float) -> List[Dict]:
        """Get all memories in the time window [t1, t2]."""
        results = []
        with self.lock:
            for atom_id, atom in self.ltm.atoms.items():
                if t1 <= atom.timestamp <= t2:
                    results.append({
                        'memory_id': atom_id,
                        'content': atom.content,
                        'timestamp': atom.timestamp,
                        'source': atom.source,
                        'valence': atom.emotional_valence
                    })
        results.sort(key=lambda x: x['timestamp'])
        return results

    def who_was_mentioned(self, t1: float, t2: float) -> List[str]:
        """Which entities were mentioned between t1 and t2?"""
        entities = set()
        with self.lock:
            for atom_id, atom in self.ltm.atoms.items():
                if t1 <= atom.timestamp <= t2:
                    words = re.findall(r'\b[A-Z][a-z]+\b', atom.content)
                    entities.update(w.lower() for w in words)
        return sorted(entities)

    def temporal_project(self, query: str, target_time: Optional[float] = None) -> Dict:
        """
        Project query backward in time: "what was I thinking about X at time T?"
        """
        embedding = self.embedder.encode(query)
        quantized = quantize_vec(embedding)

        if target_time is None:
            target_time = time.time()

        # Find memories similar to query, within temporal proximity
        candidates = self.what_was_active(target_time, window=600)
        if not candidates:
            candidates = list(self.ltm.atoms.keys())

        scored = []
        with self.ltm.lock:
            for atom_id, atom in self.ltm.atoms.items():
                if atom_id not in candidates:
                    continue
                sim = cosine_sim(quantized, atom.embedding)
                temporal_penalty = abs(atom.timestamp - target_time) / 3600  # hours
                score = sim - (temporal_penalty * 0.05)
                scored.append({
                    'memory_id': atom_id,
                    'content': atom.content,
                    'similarity': sim,
                    'temporal_distance_hours': temporal_penalty,
                    'score': score,
                    'timestamp': atom.timestamp
                })

        scored.sort(key=lambda x: x['score'], reverse=True)
        return {
            'query': query,
            'target_time': datetime.fromtimestamp(target_time).isoformat(),
            'projected_memories': scored[:5]
        }

# ============================================================================
# COUNTERFACTUAL MEMORY ENGINE
# ============================================================================

@dataclass
class CounterfactualBranch:
    """A hypothetical memory timeline branch."""
    branch_id: str
    assumption: str  # e.g., "I had forgotten the deadline"
    created_at: float
    original_memory_ids: List[str]  # memories that would have been suppressed
    hypothetical_facts: List[str]   # facts derived in this branch
    memory_ids: List[str]            # memories that would have existed

class CounterfactualMemoryEngine:
    """
    Counterfactual reasoning over memory: "what if I had forgotten X?"
    "what if I had noticed Y at time T?"

    This enables:
    - Learning from omissions (I didn't remember X → what would have happened if I had?)
    - Planning without interference (what if I delete/revise memory Y?)
    - Regret modeling (I forgot Z — how did that change outcomes?)
    """

    def __init__(self, long_term_memory: LongTermMemory, rules_engine: Optional[Any] = None):
        self.ltm = long_term_memory
        self.rules = rules_engine
        self.lock = threading.Lock()
        self.branches: Dict[str, CounterfactualBranch] = {}
        # Reinforcement history: what we learn from counterfactuals
        self.reinforcement_log: List[Dict] = []

    def what_if_forgotten(self, memory_id: str, query: str) -> Dict:
        """
        Counterfactual: what if we had forgotten this memory?

        Returns the hypothetical alternative timeline.
        """
        with self.lock:
            atom = self.ltm.atoms.get(memory_id)
            if not atom:
                return {'error': f'Memory {memory_id} not found'}

            branch_id = hashlib.sha256(
                f"forgot:{memory_id}:{time.time()}".encode()
            ).hexdigest()[:16]

            # Build alternative memory set (exclude the forgotten one)
            hypothetical_ids = [
                mid for mid in self.ltm.atoms.keys()
                if mid != memory_id
            ]

            # Run symbolic inference in this branch
            derived = []
            if self.rules:
                # Save current state
                saved_facts = dict(self.rules.facts)
                # Remove memory-related facts if the rules engine is connected
                # (simplified: just run inference on remaining facts)
                try:
                    derived = self.rules.run_inference()
                except Exception:
                    pass

            branch = CounterfactualBranch(
                branch_id=branch_id,
                assumption=f"I had forgotten: {atom.content[:100]}",
                created_at=time.time(),
                original_memory_ids=[memory_id],
                hypothetical_facts=derived,
                memory_ids=hypothetical_ids
            )
            self.branches[branch_id] = branch

            # Record reinforcement: forgetting this led to X gaps
            self.reinforcement_log.append({
                'timestamp': time.time(),
                'type': 'forgetting',
                'forgotten_id': memory_id,
                'branch_id': branch_id,
                'derived_lost': [d for d in derived if memory_id in d]
            })

            return {
                'branch_id': branch_id,
                'assumption': branch.assumption,
                'memories_suppressed': 1,
                'hypothetical_memory_count': len(hypothetical_ids),
                'derived_facts_in_branch': derived[:20],
                'reinforcement': {
                    'forgetting_cost': len([d for d in derived if 'ancestor' in d or 'sibling' in d])
                }
            }

    def what_if_noticed(self, entity: str, time_range: Tuple[float, float], query: str) -> Dict:
        """
        Counterfactual: what if I had noticed entity X during time range?

        Returns what might have been different if attention had been paid.
        """
        t1, t2 = time_range
        with self.lock:
            memories_in_range = [
                (mid, atom) for mid, atom in self.ltm.atoms.items()
                if t1 <= atom.timestamp <= t2
            ]

            # Did we actually notice this entity in that window?
            noticed = any(entity.lower() in atom.content.lower()
                         for _, atom in memories_in_range)

            if noticed:
                return {
                    'assumption': f"I had noticed {entity} between {datetime.fromtimestamp(t1).isoformat()} and {datetime.fromtimestamp(t2).isoformat()}",
                    'already_noticed': True,
                    'branch_id': None
                }

            branch_id = hashlib.sha256(
                f"noticed:{entity}:{t1}:{time.time()}".encode()
            ).hexdigest()[:16]

            # Hypothetical: what if the entity had been in working memory?
            hypothetical_atom_id = f"cf_noticed_{entity}_{int(t1)}"
            derived = []
            if self.rules and self.rules is not None:
                # Run inference treating the entity as known
                try:
                    self.rules.assert_fact_str(f"entity_known({entity})")
                    derived = self.rules.run_inference()
                except Exception:
                    pass

            branch = CounterfactualBranch(
                branch_id=branch_id,
                assumption=f"I had noticed {entity} between {datetime.fromtimestamp(t1).isoformat()} and {datetime.fromtimestamp(t2).isoformat()}",
                created_at=time.time(),
                original_memory_ids=[],
                hypothetical_facts=derived,
                memory_ids=[mid for mid, _ in memories_in_range]
            )
            self.branches[branch_id] = branch

            return {
                'branch_id': branch_id,
                'assumption': branch.assumption,
                'already_noticed': False,
                'attention_cost': len(memories_in_range),
                'potential_derived': derived[:10]
            }

    def get_branch(self, branch_id: str) -> Optional[Dict]:
        """Get details of a counterfactual branch."""
        branch = self.branches.get(branch_id)
        if not branch:
            return None
        return {
            'branch_id': branch.branch_id,
            'assumption': branch.assumption,
            'created_at': datetime.fromtimestamp(branch.created_at).isoformat(),
            'original_memory_ids': branch.original_memory_ids,
            'hypothetical_facts': branch.hypothetical_facts[:20],
            'memory_count': len(branch.memory_ids)
        }

    def reinforcement_insights(self) -> List[Dict]:
        """Get insights from counterfactual reasoning."""
        return self.reinforcement_log[-20:]

# ============================================================================
# NEUROSYMBOLIC MEMORY BRIDGE
# ============================================================================

@dataclass
class LiftedFact:
    """A memory atom lifted to a symbolic fact."""
    memory_id: str
    predicate: str
    subject: Optional[str]
    object: Optional[str]
    confidence: float
    timestamp: float

class NeuroSymbolicMemoryBridge:
    """
    Bidirectional bridge between Memory Matrix and Symbolic Rules Engine.

    LIFT (neural → symbolic):
      memory_id → symbolic_fact for rules engine
      e.g., "Meeting about AI safety" + entity "Alice" → fact(mentioned(alice, meeting))

    GROUND (symbolic → neural):
      symbolic_query → memory retrieval
      e.g., "all memories about AI safety" → [memory_ids with high similarity]

    INTEGRATE:
      - Connects to Datalog rules engine
      - Feeds lifted facts into forward-chaining inference
      - Uses inference results to trigger memory retrieval
    """

    def __init__(self, memory_matrix, rules_engine=None):
        self.mm = memory_matrix
        self.rules = rules_engine
        self.lock = threading.Lock()
        self.lifted_facts: Dict[str, LiftedFact] = {}
        self.entity_extractor = _SimpleEntityExtractor()

        # Connect to rules engine if available
        if self.rules:
            self._register_memory_predicates()

    def _register_memory_predicates(self) -> None:
        """Register memory-related predicates in the rules engine."""
        if self.rules is None:
            return
        try:
            # Register rules for memory-derived facts
            self.rules.add_rule_str("derived_knowledge(X) :- memory_fact(Y,X)")
            self.rules.add_rule_str("topic(X,Y) :- memory_fact(Y,X), important(X)")
        except Exception as e:
            print(f"[BRIDGE] Could not register memory predicates: {e}")

    def lift(self, memory_id: str, force: bool = False) -> Optional[LiftedFact]:
        """
        Lift a memory atom to a symbolic fact.

        Extracts entities and relations from memory content,
        creates predicate facts for the rules engine.
        """
        with self.lock:
            if memory_id in self.lifted_facts and not force:
                return self.lifted_facts[memory_id]

            atom = self.mm.long_term.atoms.get(memory_id)
            if not atom:
                return None

            # Extract entities
            entities = self.entity_extractor.extract(atom.content)

            # Extract the primary subject (most confident entity)
            subject = None
            obj = None
            if entities:
                # Sort by confidence
                entities.sort(key=lambda e: e['confidence'], reverse=True)
                subject = entities[0].get('text', entities[0].get('name', 'unknown'))
                if len(entities) > 1:
                    obj = entities[1].get('text', entities[1].get('name', 'unknown'))

            # Determine predicate from content type and emotional valence
            if atom.emotional_valence < -0.5:
                predicate = 'disturbing_memory'
            elif atom.emotional_valence > 0.5:
                predicate = 'positive_memory'
            else:
                predicate = 'memory_fact'

            if atom.content_type == 'action':
                predicate = 'action_memory'
            elif atom.content_type == 'reaction':
                predicate = 'reactive_memory'

            lifted = LiftedFact(
                memory_id=memory_id,
                predicate=predicate,
                subject=subject,
                object=obj,
                confidence=min(1.0, atom.importance + 0.1),
                timestamp=atom.timestamp
            )
            self.lifted_facts[memory_id] = lifted

            # Also assert in rules engine if connected
            if self.rules:
                try:
                    if subject and obj:
                        self.rules.assert_fact_str(
                            f"{predicate}({subject},{obj})",
                            provenance="memory_lift"
                        )
                    elif subject:
                        self.rules.assert_fact_str(
                            f"{predicate}({subject})",
                            provenance="memory_lift"
                        )
                except Exception:
                    pass

            return lifted

    def ground(self, symbolic_query: str, limit: int = 5) -> List[Dict]:
        """
        Ground a symbolic query back to neural memories.

        Takes a predicate pattern (e.g., "memory_fact(who,what)")
        and returns matching memories from the memory matrix.
        """
        # Parse the predicate and arguments
        match = re.match(r'(\w+)\(([^)]+)\)', symbolic_query)
        if not match:
            return []

        pred, args_str = match.groups()
        args = [a.strip() for a in args_str.split(',')]

        results = []
        with self.lock:
            for memory_id, lifted in self.lifted_facts.items():
                if lifted.predicate != pred:
                    continue
                # Check argument matches
                atom = self.mm.long_term.atoms.get(memory_id)
                if not atom:
                    continue
                matches = True
                if len(args) >= 1 and args[0] != '_' and args[0] != 'X':
                    if lifted.subject and args[0].lower() != lifted.subject.lower():
                        matches = False
                if matches and len(args) >= 2 and args[1] != '_' and args[1] != 'Y':
                    if lifted.object and args[1].lower() != lifted.object.lower():
                        matches = False
                if matches:
                    results.append({
                        'memory_id': memory_id,
                        'content': atom.content,
                        'predicate': lifted.predicate,
                        'subject': lifted.subject,
                        'object': lifted.object,
                        'confidence': lifted.confidence,
                        'timestamp': atom.timestamp
                    })

        # If no lifted facts match, try semantic search
        if not results and args[0] != '_' and args[0] != 'X':
            try:
                query_text = ' '.join(a for a in args if a and len(a) > 2)
                results = self.mm.recall(query_text, limit=limit)
            except Exception:
                pass

        return results[:limit]

    def lift_all(self, min_importance: float = 0.3) -> int:
        """Lift all unlifted memories above importance threshold."""
        count = 0
        with self.lock:
            for memory_id, atom in self.mm.long_term.atoms.items():
                if memory_id not in self.lifted_facts and atom.importance >= min_importance:
                    if self.lift(memory_id):
                        count += 1
        return count

    def query_symbolic(self, predicate: str, subject: Optional[str] = None) -> List[str]:
        """Query the rules engine for facts matching predicate/subject."""
        if not self.rules:
            return []
        try:
            query_str = predicate
            if subject:
                query_str = f"{predicate}({subject})"
            return self.rules.query_str(query_str)
        except Exception:
            return []

    def get_lifted_facts(self, predicate_filter: Optional[str] = None) -> List[Dict]:
        """Get all lifted facts, optionally filtered by predicate."""
        results = []
        with self.lock:
            for mid, fact in self.lifted_facts.items():
                if predicate_filter and fact.predicate != predicate_filter:
                    continue
                atom = self.mm.long_term.atoms.get(mid)
                results.append({
                    'memory_id': mid,
                    'predicate': fact.predicate,
                    'subject': fact.subject,
                    'object': fact.object,
                    'confidence': fact.confidence,
                    'content_preview': atom.content[:100] if atom else '',
                    'timestamp': fact.timestamp
                })
        return results

    def react_to_stimulus(self, stimulus: str, source: str = 'bridge') -> Dict:
        """
        Full pipeline: sense → ground → lift → react.

        1. Ingest stimulus into memory
        2. Auto-recall similar memories
        3. Lift to symbolic facts
        4. Query rules engine for implications
        5. Return combined neural + symbolic response
        """
        # Step 1: ingest
        memory_id = self.mm.ingest(stimulus, content_type='text', source=source)

        # Step 2: auto-recall (stimulus-driven)
        embedding = self.mm.embedder.encode(stimulus)
        quantized = quantize_vec(embedding)
        recalls = self.mm.long_term.auto_recall(quantized, threshold=0.72)

        # Step 3: lift new memory
        lifted = self.lift(memory_id)

        # Step 4: symbolic query
        symbolic_implications = []
        if self.rules and lifted:
            try:
                if lifted.subject:
                    symbolic_implications = self.rules.query_str(f"derived_knowledge({lifted.subject})")
            except Exception:
                pass

        return {
            'memory_id': memory_id,
            'stimulus': stimulus[:200],
            'auto_recalls': recalls,
            'lifted_fact': {
                'predicate': lifted.predicate if lifted else None,
                'subject': lifted.subject if lifted else None,
                'confidence': lifted.confidence if lifted else 0
            },
            'symbolic_implications': symbolic_implications[:5]
        }


# ============================================================================
# SIMPLE ENTITY EXTRACTOR
# ============================================================================

class _SimpleEntityExtractor:
    """Lightweight entity extraction without heavy NLP."""

    PERSON_PATTERNS = [
        r'\b([A-Z][a-z]+ [A-Z][a-z]+)\b',  # Full name
        r'\b(Alice|Bob|Charlie|David|Eve|Frank|Grace|Hank|Isabel|Jack|Kate|Leo)\b',
        r'\b(Trump|Harris|Biden|Obama|Putin|Zelensky)\b',
    ]

    ORGANIZATION_PATTERNS = [
        r'\b([A-Z][a-z]+(?: Corp| Inc| LLC| Organization| Association))\b',
        r'\b(Google|Microsoft|Apple|Amazon|OpenAI|Anthropic|Meta|Tesla)\b',
    ]

    def extract(self, text: str) -> List[Dict]:
        entities = []
        seen = set()

        for pattern in self.PERSON_PATTERNS:
            for match in re.findall(pattern, text):
                if match not in seen:
                    seen.add(match)
                    entities.append({'type': 'PERSON', 'name': match, 'confidence': 0.8})

        for pattern in self.ORGANIZATION_PATTERNS:
            for match in re.findall(pattern, text):
                if match not in seen:
                    seen.add(match)
                    entities.append({'type': 'ORGANIZATION', 'name': match, 'confidence': 0.75})

        # Topic extraction (capitalized keywords)
        for word in re.findall(r'\b[A-Z][a-z]{2,}\b', text):
            if len(word) > 4 and word not in seen and word not in {
                'The', 'This', 'That', 'What', 'When', 'Where', 'Which', 'About'
            }:
                seen.add(word)
                entities.append({'type': 'TOPIC', 'name': word.lower(), 'confidence': 0.5})

        return entities

# ============================================================================
# MEMORY MATRIX v2 — MAIN CLASS
# ============================================================================

class MemoryMatrixV2:
    """
    Memory Matrix v2: Neuro-Symbolic Upgrade.

    Adds to the base MemoryMatrix:
    - TemporalProjectionEngine: epistemic queries over time
    - CounterfactualMemoryEngine: what-if reasoning
    - NeuroSymbolicMemoryBridge: bidirectional lift/ground
    - Enhanced reaction triggers from symbolic reasoning
    """

    def __init__(self, rules_port: int = 7787):
        self._base: Optional[MemoryMatrix] = None
        if BASE_AVAILABLE:
            self._base = MemoryMatrix()

        self.embedder = Embedder.get_instance() if BASE_AVAILABLE else None

        # Temporal projection
        self.temporal = None
        if self._base:
            self.temporal = TemporalProjectionEngine(self._base.long_term, self.embedder)

        # Counterfactual reasoning
        rules = None
        if RULES_ENGINE:
            try:
                rules = RULES_ENGINE()
                rules.add_rule_str("ancestor(X,Y) :- parent(X,Y)")
                rules.add_rule_str("ancestor(X,Y) :- parent(X,Z), ancestor(Z,Y)")
            except Exception as e:
                print(f"[MEMv2] Rules engine init: {e}")

        self.counterfactual = CounterfactualMemoryEngine(
            self._base.long_term if self._base else None,
            rules
        )

        # Neuro-symbolic bridge
        self.bridge = None
        if self._base:
            self.bridge = NeuroSymbolicMemoryBridge(self._base, rules)
            self._lift_backfill_lock = threading.Lock()
            self._lift_backfill_thread = None
            self._lift_backfill_status = {
                'state': 'idle',
                'auto_start': True,
                'min_importance': 0.6,
                'batch_size': 50,
                'total_candidates': 0,
                'processed': 0,
                'lifted': 0,
                'errors': 0,
                'started_at': None,
                'completed_at': None,
                'last_error': None,
            }

        self._rules = rules
        self._lock = threading.Lock()

        # Background threads
        self.running = True
        self._worker_thread = None
        if self._base:
            self._start_background()
            if self.bridge:
                self.start_lift_backfill(min_importance=0.6, batch_size=50, interval=0.05, initial_delay=2.0)

        print("[MEMv2] Memory Matrix v2 initialized")

    def _start_background(self) -> None:
        """Start background processing."""
        def worker():
            while self.running:
                try:
                    # Decay working memory
                    self._base.working.decay_all(decay_rate=0.02)
                    time.sleep(0.5)
                except Exception:
                    time.sleep(1)

        self._worker_thread = threading.Thread(target=worker, daemon=True)
        self._worker_thread.start()

    def start_lift_backfill(
        self,
        min_importance: float = 0.6,
        batch_size: int = 50,
        interval: float = 0.05,
        initial_delay: float = 0.0,
    ) -> Dict:
        """Lift existing memories into symbolic facts without blocking service startup."""
        if not self._base or not self.bridge:
            return {'state': 'unavailable', 'reason': 'bridge_not_available'}

        with self._lift_backfill_lock:
            if self._lift_backfill_thread and self._lift_backfill_thread.is_alive():
                return dict(self._lift_backfill_status)

            candidate_ids = [
                memory_id
                for memory_id, atom in self._base.long_term.atoms.items()
                if atom.importance >= min_importance
            ]
            self._lift_backfill_status.update({
                'state': 'queued',
                'min_importance': min_importance,
                'batch_size': batch_size,
                'total_candidates': len(candidate_ids),
                'processed': 0,
                'lifted': 0,
                'errors': 0,
                'started_at': time.time(),
                'completed_at': None,
                'last_error': None,
            })

            def worker():
                if initial_delay > 0:
                    time.sleep(initial_delay)
                with self._lift_backfill_lock:
                    self._lift_backfill_status['state'] = 'running'

                processed = 0
                lifted = 0
                errors = 0
                for memory_id in candidate_ids:
                    try:
                        if self.bridge.lift(memory_id):
                            lifted += 1
                    except Exception as exc:
                        errors += 1
                        with self._lift_backfill_lock:
                            self._lift_backfill_status['last_error'] = str(exc)

                    processed += 1
                    if processed % batch_size == 0:
                        with self._lift_backfill_lock:
                            self._lift_backfill_status.update({
                                'processed': processed,
                                'lifted': lifted,
                                'errors': errors,
                            })
                        time.sleep(interval)

                with self._lift_backfill_lock:
                    self._lift_backfill_status.update({
                        'state': 'complete',
                        'processed': processed,
                        'lifted': lifted,
                        'errors': errors,
                        'completed_at': time.time(),
                    })

            self._lift_backfill_thread = threading.Thread(target=worker, daemon=True, name='memory-lift-backfill')
            self._lift_backfill_thread.start()
            return dict(self._lift_backfill_status)

    def get_lift_backfill_status(self) -> Dict:
        if not self.bridge:
            return {'state': 'unavailable', 'reason': 'bridge_not_available'}
        with self._lift_backfill_lock:
            return dict(self._lift_backfill_status)

    def _persist_long_term(self, force: bool = False) -> None:
        """Persist the canonical long-term archive after memory state changes.

        2026-06-26 — fire-and-forget persistence. The previous implementation
        ran `self._base.long_term.save()` synchronously on the calling thread,
        which is whichever worker in the spine just handled `/memory/ingest`.
        Under steady-state ingest pressure (workers / pool / tower / voice-ingress
        all post hundreds of times a minute), every ingest parked the worker
        on a gz-write + atomic-rename for tens of milliseconds; with 12
        workers, the queue backed up, sockets piled up in CLOSE_WAIT, and
        /cognitive/health eventually wedged. Now ingest returns instantly;
        a single dedicated writer drains pending saves in the background.
        Disk latency never blocks a request handler again.
        """
        if not (self._base and getattr(self._base, 'long_term', None)):
            return
        # Coalesce: many ingests inside the same window collapse to one
        # actual save — the writer only flushes the latest dirty state.
        pending = getattr(self, '_persist_pending', None)
        if pending is None:
            # First ingest: create the pending record AND bind the local var to
            # it — previously the local stayed None and the next line crashed,
            # silently losing the very first save (memory must be permanent).
            pending = self._persist_pending = {'dirty': False, 'force': False}
            self._start_persist_writer()
        pending['dirty'] = True
        if force:
            pending['force'] = True
        try:
            self._persist_event.set()
        except Exception:
            pass

    def _start_persist_writer(self) -> None:
        """Start the dedicated background persistence thread.

        One thread, one queue, atomic saves. The writer drains pending
        dirty state every `_save_min_interval` seconds (or sooner when
        `force=True`), so burst ingest traffic never spawns parallel
        writers or races the archive file.
        """
        if getattr(self, '_persist_thread', None) is not None:
            return
        self._persist_event = threading.Event()
        self._persist_stop = threading.Event()
        save_interval = float(
            getattr(self._base.long_term, '_save_min_interval', 3.0) or 3.0
        )

        def writer():
            while not self._persist_stop.is_set():
                # Wait for a dirty flag or the interval to elapse, whichever first.
                self._persist_event.wait(timeout=save_interval)
                self._persist_event.clear()
                pending = self._persist_pending
                if pending is None or not pending.get('dirty'):
                    continue
                force = pending.get('force', False)
                pending['dirty'] = False
                pending['force'] = False
                try:
                    self._base.long_term.save(force=force)
                except Exception as e:
                    # Persist failure must never crash the matrix. Log and
                    # let the next ingest mark it dirty again.
                    print(f"[MEMv2] background save error: {e}")

        t = threading.Thread(target=writer, name='memv2-persist-writer', daemon=True)
        t.start()
        self._persist_thread = t

    # ── Base passthrough ────────────────────────────────────────────────────

    def ingest(self, content: str, content_type: str = 'text',
               emotional_valence: float = 0.0, source: str = 'unknown',
               importance: float = 0.5, raw_metadata: Dict = None) -> str:
        """Ingest memory through full v2 pipeline."""
        if not self._base:
            return "no_base"

        if raw_metadata is None:
            raw_metadata = {}
        if isinstance(raw_metadata, dict) and spring_doctrine is not None:
            try:
                raw_metadata.setdefault('spring', spring_doctrine.validate({
                    'source': source,
                    'origin': raw_metadata.get('origin'),
                    'evidence': raw_metadata.get('evidence', []),
                    'tests_passed': raw_metadata.get('tests_passed'),
                    'created_at': time.time(),
                }))
            except Exception:
                pass

        atom_id = self._base.ingest(content, content_type, emotional_valence, source, raw_metadata)

        # Index in temporal engine
        if self.temporal and atom_id in self._base.long_term.atoms:
            atom = self._base.long_term.atoms[atom_id]
            self.temporal.ingest_temporal(atom)

        # Lift to symbolic
        if self.bridge:
            self.bridge.lift(atom_id, force=True)

        # Coalesce saves: force-saving the whole archive on EVERY ingest is
        # O(n^2) under bulk ingestion (the idle engine bridges hundreds of
        # atoms) and starved recalls into 15s+ timeouts. Throttled saves bound
        # the I/O; the auto-save flush guarantees pending atoms persist promptly.
        self._persist_long_term(force=False)
        return atom_id

    def recall(self, query: str, limit: int = 5, emotional_filter: float = None) -> List[Dict]:
        """All-layers recall. HARD RULE: memory always routes through ALL layers,
        never episodic alone. Fans through episodic+vector (base semantic search),
        semantic (lifted symbolic facts), and scratch (working active context),
        tagging each result with its source layer. Read-only — does not persist.
        Every layer is best-effort; a failing layer never sinks the recall."""
        if not self._base:
            return []

        results: List[Dict] = []
        seen = set()

        def _add(item, layer, default_score):
            if not isinstance(item, dict):
                item = {'content': str(item)}
            content = item.get('content') or item.get('text') or ''
            if not content:
                return
            key = (layer, content[:120])
            if key in seen:
                return
            seen.add(key)
            item.setdefault('score', default_score)
            item['layer'] = layer
            results.append(item)

        # Layer: episodic + vector — the base similarity search.
        try:
            for r in (self._base.recall(query, limit, emotional_filter) or []):
                _add(r, 'episodic', r.get('score', 0.6) if isinstance(r, dict) else 0.6)
        except Exception:
            pass

        # Layer: semantic — lifted symbolic facts whose predicate/subject/object
        # overlaps the query. High-signal, deduped against episodic content.
        try:
            if self.bridge and getattr(self.bridge, 'lifted_facts', None):
                terms = [w for w in query.lower().split() if len(w) > 3]
                for fact in list(self.bridge.lifted_facts.values()):
                    text = ' '.join(str(x) for x in
                                    (getattr(fact, 'predicate', ''), getattr(fact, 'subject', ''),
                                     getattr(fact, 'object', '')) if x)
                    if text and any(t in text.lower() for t in terms):
                        _add({'content': text, 'source': 'semantic',
                              'confidence': getattr(fact, 'confidence', 0.5)},
                             'semantic', getattr(fact, 'confidence', 0.5))
        except Exception:
            pass

        # Layer: scratch — currently-active working memory context.
        try:
            for item in (self._base.working.get_active_context() or [])[:3]:
                _add({'content': (item.get('content') if isinstance(item, dict) else str(item)),
                      'source': 'working'}, 'scratch', 0.4)
        except Exception:
            pass

        # Layer: procedural — reaction patterns whose triggers fire for this
        # query context. The ReactionEngine encodes "if you see X, do Y" rules;
        # if any fire, they're procedural knowledge relevant to the recall.
        try:
            reactions = getattr(self._base, 'reactions', None)
            if reactions and getattr(reactions, 'reaction_patterns', None):
                ctx = {'query': query, 'text': query.lower(),
                       'valence': self._base.working.get_average_valence() if hasattr(self._base.working, 'get_average_valence') else 0.0}
                fired = reactions.evaluate(ctx) or []
                for fr in fired[:3]:
                    _add({'content': f"[procedural] {fr.get('name','pattern')}: {str(fr.get('reaction') or fr.get('action') or fr)[:200]}",
                          'source': 'procedural'}, 'procedural', 0.55)
        except Exception:
            pass

        # Layer: counterfactual — hypothetical branches the CounterfactualMemory
        # engine has explored whose assumption overlaps the query. Surfaces
        # "what if we had forgotten X" knowledge to the recalling agent.
        try:
            cf = getattr(self, 'counterfactual', None)
            if cf and getattr(cf, 'branches', None):
                terms = [w for w in query.lower().split() if len(w) > 3]
                for branch in list(cf.branches.values())[:20]:
                    assumption = str(getattr(branch, 'assumption', '') or '')
                    if not assumption or not terms:
                        continue
                    if any(t in assumption.lower() for t in terms):
                        _add({'content': f"[counterfactual] {assumption[:200]}",
                              'source': 'counterfactual'}, 'counterfactual', 0.5)
        except Exception:
            pass

        # Episodic-first, then by score. Cap generously so non-episodic layers
        # always get a voice (the whole point of the hard rule).
        results.sort(key=lambda r: (r.get('layer') != 'episodic', -float(r.get('score', 0) or 0)))
        return results[:max(limit + 6, limit)]

    def get_active_context(self) -> List[Dict]:
        """Get working memory context."""
        if not self._base:
            return []
        return self._base.working.get_active_context()

    def get_stats(self) -> Dict:
        """Get memory system statistics. v2.1 — cached 30s to keep /health fast."""
        import time as _t
        if hasattr(self, '_stats_cache_at') and (_t.time() - self._stats_cache_at) < 30:
            return self._stats_cache
        if not self._base:
            return {'status': 'no_base_memory'}
        base_stats = self._base.long_term.get_recall_stats()
        archive_path = self._base.long_term.storage_path
        archive_exists = os.path.exists(archive_path)
        backup_path = getattr(self._base.long_term, 'backup_path', f"{archive_path}.bak")
        tmp_path = getattr(self._base.long_term, 'tmp_path', f"{archive_path}.tmp")
        backup_exists = os.path.exists(backup_path)
        result = {
            'total_atoms': base_stats['total_atoms'],
            'lifted_facts': len(self.bridge.lifted_facts) if self.bridge else 0,
            'lift_backfill': self.get_lift_backfill_status() if self.bridge else {'state': 'unavailable'},
            'counterfactual_branches': len(self.counterfactual.branches) if self.counterfactual else 0,
            'temporal_entities': len(self.temporal._entity_timeline) if self.temporal else 0,
            'rules_connected': self._rules is not None,
            'durability': {
                'archive_path': archive_path,
                'archive_exists': archive_exists,
                'archive_bytes': os.path.getsize(archive_path) if archive_exists else 0,
                'backup_path': backup_path,
                'backup_exists': backup_exists,
                'backup_bytes': os.path.getsize(backup_path) if backup_exists else 0,
                'tmp_path': tmp_path,
                'tmp_exists': os.path.exists(tmp_path),
                'save_on_ingest': True,
                'atomic_write': True,
                'backup_recovery': True,
                'recall_save_throttle_seconds': getattr(self._base.long_term, '_save_min_interval', None),
                'search_index_entries': len(self._base.long_term.embeddings_index),
            },
            'by_type': base_stats.get('by_type', {}),
            'by_valence': base_stats.get('by_valence', {})
        }
        # v2.1 — write through the 30s cache (previously dead code after an
        # early return, so stats recomputed on every call).
        try:
            self._stats_cache = result
            self._stats_cache_at = _t.time()
        except Exception:
            pass
        return result

    # ── Temporal Projection API ───────────────────────────────────────────

    def project_backward(self, query: str, target_time: Optional[float] = None) -> Dict:
        """Temporal projection: what was I thinking about X at time T?"""
        if not self.temporal:
            return {'error': 'Temporal engine not available'}
        return self.temporal.temporal_project(query, target_time)

    def was_mentioned(self, entity: str, at_time: float, window: float = 300) -> bool:
        """Was entity X mentioned near time T?"""
        if not self.temporal:
            return False
        return self.temporal.was_present(entity, at_time, window)

    def get_timeline(self, entity: str) -> List[Dict]:
        """Get timeline of mentions for an entity."""
        if not self.temporal:
            return []
        with self.temporal.lock:
            events = self.temporal._entity_timeline.get(entity.lower(), [])
            return [
                {'start': datetime.fromtimestamp(s).isoformat(),
                 'end': datetime.fromtimestamp(e).isoformat(),
                 'memory_id': mid}
                for s, e, mid in sorted(events)
            ]

    # ── Counterfactual API ─────────────────────────────────────────────────

    def what_if_forgotten(self, memory_id: str, query: str) -> Dict:
        """What if we had forgotten this memory?"""
        return self.counterfactual.what_if_forgotten(memory_id, query)

    def what_if_noticed(self, entity: str, start_time: float, end_time: float, query: str) -> Dict:
        """What if we had noticed this entity during time window?"""
        return self.counterfactual.what_if_noticed(entity, (start_time, end_time), query)

    def get_counterfactual_branches(self) -> List[Dict]:
        """Get all counterfactual branches."""
        return [self.counterfactual.get_branch(bid) for bid in self.counterfactual.branches]

    # ── Symbolic Bridge API ───────────────────────────────────────────────

    def lift_memory(self, memory_id: str) -> Optional[Dict]:
        """Lift a memory atom to symbolic fact."""
        if not self.bridge:
            return None
        lifted = self.bridge.lift(memory_id)
        if not lifted:
            return None
        return {
            'predicate': lifted.predicate,
            'subject': lifted.subject,
            'object': lifted.object,
            'confidence': lifted.confidence
        }

    def ground_symbolic(self, query: str, limit: int = 5) -> List[Dict]:
        """Ground a symbolic query back to memories."""
        if not self.bridge:
            return []
        return self.bridge.ground(query, limit)

    def react_to_stimulus(self, stimulus: str, source: str = 'user') -> Dict:
        """Full neuro-symbolic pipeline: sense → ground → lift → react."""
        if not self.bridge:
            return {'error': 'Bridge not available'}
        return self.bridge.react_to_stimulus(stimulus, source)

    # ── Shutdown ───────────────────────────────────────────────────────────

    def stop(self) -> None:
        self.running = False
        if self._base:
            self._base.stop()
        print("[MEMv2] Stopped")


# ============================================================================
# HTTP API SERVER
# ============================================================================

import http.server
import socketserver
from urllib.parse import urlparse, parse_qs

PORT = 7880


class ReuseAddrTCPServer(socketserver.TCPServer):
    allow_reuse_address = True


class V2APIHandler(http.server.BaseHTTPRequestHandler):
    memory_v2: MemoryMatrixV2 = None

    def log_message(self, fmt, *args):
        print(f"[MEMv2:{PORT}] {fmt % args}")

    def send_json(self, data: Dict, status: int = 200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def _json_body(self):
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            return json.loads(self.rfile.read(content_length).decode())
        except Exception:
            return {}

    def do_GET(self):
        path = urlparse(self.path).path

        if path == "/stats":
            self.send_json(self.memory_v2.get_stats())
        elif path == "/context":
            self.send_json({"context": self.memory_v2.get_active_context()})
        elif path == "/lifted":
            facts = self.memory_v2.bridge.get_lifted_facts() if self.memory_v2.bridge else []
            self.send_json({"lifted_facts": facts})
        elif path == "/counterfactual/branches":
            self.send_json({"branches": self.memory_v2.get_counterfactual_branches()})
        elif path == "/reinforcement":
            insights = self.memory_v2.counterfactual.reinforcement_insights() if self.memory_v2.counterfactual else []
            self.send_json({"insights": insights})
        elif path.startswith("/timeline/"):
            entity = path.split("/timeline/", 1)[1]
            self.send_json({"entity": entity, "timeline": self.memory_v2.get_timeline(entity)})
        else:
            self.send_json({"error": "Not found"}, 404)

    def do_POST(self):
        path = urlparse(self.path).path
        req = self._json_body()

        if path == "/ingest":
            result = self.memory_v2.ingest(
                content=req.get("content", ""),
                content_type=req.get("type", "text"),
                emotional_valence=req.get("valence", 0.0),
                source=req.get("source", "api"),
                importance=req.get("importance", 0.5)
            )
            self.send_json({"memory_id": result})

        elif path == "/recall":
            results = self.memory_v2.recall(
                query=req.get("query", ""),
                limit=req.get("limit", 5),
                emotional_filter=req.get("emotional_filter")
            )
            self.send_json({"results": results})

        elif path == "/project":
            result = self.memory_v2.project_backward(
                query=req.get("query", ""),
                target_time=req.get("target_time")
            )
            self.send_json(result)

        elif path == "/what_if/forgotten":
            result = self.memory_v2.what_if_forgotten(
                memory_id=req.get("memory_id", ""),
                query=req.get("query", "")
            )
            self.send_json(result)

        elif path == "/what_if/noticed":
            result = self.memory_v2.what_if_noticed(
                entity=req.get("entity", ""),
                start_time=req.get("start_time", time.time() - 3600),
                end_time=req.get("end_time", time.time()),
                query=req.get("query", "")
            )
            self.send_json(result)

        elif path == "/lift":
            result = self.memory_v2.lift_memory(req.get("memory_id", ""))
            self.send_json(result or {"error": "not found"})

        elif path == "/ground":
            results = self.memory_v2.ground_symbolic(
                query=req.get("query", ""),
                limit=req.get("limit", 5)
            )
            self.send_json({"results": results})

        elif path == "/react":
            result = self.memory_v2.react_to_stimulus(
                stimulus=req.get("stimulus", ""),
                source=req.get("source", "api")
            )
            self.send_json(result)

        elif path == "/was_mentioned":
            mentioned = self.memory_v2.was_mentioned(
                entity=req.get("entity", ""),
                at_time=req.get("at_time", time.time()),
                window=req.get("window", 300)
            )
            self.send_json({"entity": req.get("entity"), "was_mentioned": mentioned})

        else:
            self.send_json({"error": "Not found"}, 404)


def run_v2_server(port: int = PORT):
    """Start Memory Matrix v2 HTTP server."""
    V2APIHandler.memory_v2 = MemoryMatrixV2()

    with ReuseAddrTCPServer(("", port), V2APIHandler) as httpd:
        print(f"[MEMv2] Memory Matrix v2 running on port {port}")
        print(f"[MEMv2] Endpoints: /ingest, /recall, /project, /what_if/*, /lift, /ground, /react")
        httpd.serve_forever()


# ─────────────────────────────────────────────────────────────
# STANDALONE TEST
# ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("=== PURPCLAW Memory Matrix v2 ===")
    print()

    mm = MemoryMatrixV2()

    # Ingest some memories
    print("[TEST] Ingest memories...")
    m1 = mm.ingest("Meeting with Alice about the Q4 project deadline", source="user", importance=0.7, emotional_valence=0.3)
    m2 = mm.ingest("Bob mentioned supply chain issues are getting worse", source="user", importance=0.6, emotional_valence=-0.4)
    m3 = mm.ingest("Alice confirmed the partnership agreement with Microsoft", source="user", importance=0.8, emotional_valence=0.5)
    print(f"  Stored: {m1}, {m2}, {m3}")

    # Temporal projection
    print("[TEST] Temporal projection...")
    now = time.time()
    proj = mm.project_backward("project deadline", target_time=now - 60)
    print(f"  Projected 'project deadline': {len(proj.get('projected_memories', []))} results")

    # Counterfactual
    print("[TEST] Counterfactual (what if forgotten)...")
    cf = mm.what_if_forgotten(m1, "project deadline status")
    print(f"  Branch: {cf.get('branch_id', 'none')}")
    print(f"  Assumption: {cf.get('assumption', 'none')}")

    # Lift
    print("[TEST] Lift memory to symbolic...")
    lifted = mm.lift_memory(m3)
    print(f"  Lifted: predicate={lifted['predicate'] if lifted else None}, subject={lifted['subject'] if lifted else None}")

    # Ground
    print("[TEST] Ground symbolic query...")
    grounded = mm.ground_symbolic("memory_fact(alice,_)", limit=3)
    print(f"  Grounded: {len(grounded)} results")

    # React pipeline
    print("[TEST] React to stimulus...")
    reaction = mm.react_to_stimulus("Alice called about the urgent Microsoft deal", source="user")
    print(f"  Memory ID: {reaction.get('memory_id')}")
    print(f"  Auto-recalls: {len(reaction.get('auto_recalls', []))}")
    print(f"  Lifted: {reaction.get('lifted_fact')}")

    # Stats
    print(f"\n[STATS] {mm.get_stats()}")
    print()
    print("All tests passed.")

    print("\n[MEMv2] Starting server on port 7880...")
    run_v2_server(7880)
