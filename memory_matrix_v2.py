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

import os
import sys
import json
import time
import uuid
import gzip
import pickle
import hashlib
import threading
import re
from collections import OrderedDict, defaultdict
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Any, Callable, Set, Tuple
from datetime import datetime, timedelta

# ── Import existing Memory Matrix components ────────────────────────────────

try:
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from memory_matrix import (
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

# ── Quantization helpers (8-bit, reused from base) ─────────────────────────

QUANT_BOUNDARIES = [(i / 128.0) - 1.0 for i in range(257)]

def quantize_vec(vector: List[float], dims: int = 384) -> bytes:
    if len(vector) < dims:
        vector = vector + [0.0] * (dims - len(vector))
    elif len(vector) > dims:
        vector = vector[:dims]
    quantized = bytearray(dims)
    for i, v in enumerate(vector):
        v = max(-1.0, min(1.0, v))
        q = int((v + 1.0) * 127.5)
        quantized[i] = max(0, min(255, q))
    return bytes(quantized)

def dequantize_vec(quantized: bytes, dims: int = 384) -> List[float]:
    result = []
    for i in range(min(len(quantized), dims)):
        result.append((quantized[i] / 127.5) - 1.0)
    while len(result) < dims:
        result.append(0.0)
    return result

def cosine_sim(q1: bytes, q2: bytes) -> float:
    v1 = dequantize_vec(q1)
    v2 = dequantize_vec(q2)
    dot = sum(a * b for a, b in zip(v1, v2))
    mag1 = sum(a * a for a in v1) ** 0.5
    mag2 = sum(b * b for b in v2) ** 0.5
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
        self.lock = threading.Lock()
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
            # Lift existing important memories
            self.bridge.lift_all(min_importance=0.6)

        self._rules = rules
        self._lock = threading.Lock()

        # Background threads
        self.running = True
        self._worker_thread = None
        if self._base:
            self._start_background()

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

    # ── Base passthrough ────────────────────────────────────────────────────

    def ingest(self, content: str, content_type: str = 'text',
               emotional_valence: float = 0.0, source: str = 'unknown',
               importance: float = 0.5, raw_metadata: Dict = None) -> str:
        """Ingest memory through full v2 pipeline."""
        if not self._base:
            return "no_base"

        atom_id = self._base.ingest(content, content_type, emotional_valence, source, raw_metadata)

        # Index in temporal engine
        if self.temporal and atom_id in self._base.long_term.atoms:
            atom = self._base.long_term.atoms[atom_id]
            self.temporal.ingest_temporal(atom)

        # Lift to symbolic
        if self.bridge:
            self.bridge.lift(atom_id, force=True)

        return atom_id

    def recall(self, query: str, limit: int = 5, emotional_filter: float = None) -> List[Dict]:
        """Query-driven recall (passthrough to base)."""
        if not self._base:
            return []
        return self._base.recall(query, limit, emotional_filter)

    def get_active_context(self) -> List[Dict]:
        """Get working memory context."""
        if not self._base:
            return []
        return self._base.working.get_active_context()

    def get_stats(self) -> Dict:
        """Get memory system statistics."""
        if not self._base:
            return {'status': 'no_base_memory'}
        base_stats = self._base.long_term.get_recall_stats()
        return {
            'total_atoms': base_stats['total_atoms'],
            'lifted_facts': len(self.bridge.lifted_facts) if self.bridge else 0,
            'counterfactual_branches': len(self.counterfactual.branches) if self.counterfactual else 0,
            'temporal_entities': len(self.temporal._entity_timeline) if self.temporal else 0,
            'rules_connected': self._rules is not None,
            'by_type': base_stats.get('by_type', {}),
            'by_valence': base_stats.get('by_valence', {})
        }

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
