#!/usr/bin/env python3
"""
PURPCLAW Neuro-Symbolic Bridge
================================
Bridge connecting neural (embedding/pattern) layer with symbolic (rule/logic) layer.

LIFTS neural outputs to symbolic facts:
  - Shadow Protocol events → cognitive_flag facts
  - Memory Matrix retrievals → memory_recall facts
  - Anomaly detections → anomaly_event facts

GROUNDS symbolic queries to neural retrieval:
  - "Find similar past events" → vector similarity search
  - "Retrieve all pattern X by speaker Y" → filtered retrieval

Provides fact-assertion API for the symbolic rules engine.

Usage:
    from neuro_symbolic_bridge import NeuroSymbolicBridge
    bridge = NeuroSymbolicBridge()
    bridge.lift_anomaly(source="shadow_protocol", pattern="nervous_laughter", ...)
    facts = bridge.query("anomaly_event", filters={"speaker": "Trump"})
"""

import os
import sys
import json
import time
import hashlib
import threading
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List, Tuple, Callable
from dataclasses import dataclass, asdict, field
from enum import Enum
import re

# Try to import CozoDB for knowledge graph (optional)
try:
    from cozo import CozoDB
    COZODB_AVAILABLE = True
except ImportError:
    COZODB_AVAILABLE = False
    print("[NEURO-SYM] CozoDB not available, using in-memory fact store")

# Import Memory Matrix components (optional)
try:
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from memory_matrix import MemoryMatrix, ShadowProtocol
    MEMORY_MATRIX_AVAILABLE = True
except ImportError:
    MEMORY_MATRIX_AVAILABLE = False
    print("[NEURO-SYM] Memory Matrix not available")


class FactType(Enum):
    """Symbolic fact types."""
    ANOMALY_EVENT = "anomaly_event"
    PATTERN_DETECTED = "pattern_detected"
    COGNITIVE_FLAG = "cognitive_flag"
    MEMORY_RECALL = "memory_recall"
    ENTITY_EXTRACTION = "entity_extraction"
    CAUSAL_LINK = "causal_link"
    BELIEF_STATE = "belief_state"
    TRUST_RELATION = "trust_relation"


@dataclass
class Fact:
    """A symbolic fact assertion."""
    fact_id: str
    fact_type: str
    timestamp: float
    confidence: float
    source: str
    subject: Optional[str] = None      # e.g., speaker name
    predicate: Optional[str] = None    # e.g., "exhibits", "said"
    object: Optional[str] = None      # e.g., "paraphasia"
    metadata: Dict[str, Any] = field(default_factory=dict)
    expires_at: Optional[float] = None  # TTL for temporal facts

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    def is_expired(self) -> bool:
        if self.expires_at is None:
            return False
        return time.time() > self.expires_at

    @staticmethod
    def generate_id(fact_type: str, subject: str, predicate: str, obj: str) -> str:
        """Generate deterministic fact ID."""
        content = f"{fact_type}:{subject}:{predicate}:{obj}"
        return hashlib.sha256(content.encode()).hexdigest()[:24]


@dataclass
class LiftResult:
    """Result of lifting neural output to symbolic fact."""
    success: bool
    fact: Optional[Fact] = None
    error: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class QueryResult:
    """Result of grounding symbolic query."""
    facts: List[Fact]
    count: int
    query_time_ms: float


class EntityExtractor:
    """Extracts entities and relations from text using simple NLP."""

    # Common entity patterns
    ENTITY_PATTERNS = {
        "PERSON": r"\b([A-Z][a-z]+ [A-Z][a-z]+|[A-Z][a-z]+ [A-Z]\. [A-Z][a-z]+)\b",
        "ORGANIZATION": r"\b([A-Z][a-z]*(?: Inc|Corp|LLC|Company|Organization))\b",
        "DATE": r"\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\w+ \d{1,2},? \d{4})\b",
        "NUMBER": r"\b(\d+(?:\.\d+)?(?:%|percent|billion|million|thousand)?)\b",
        "LOCATION": r"\b([A-Z][a-z]+ (?:City|State|Country|County|Town))\b",
    }

    # Relation extraction patterns
    RELATION_PATTERNS = {
        "said": r'(\w+) (?:said|stated|claimed|argued|explained|revealed) (?:that |"|\'(.*?)\'|"(.*?)"|(.*?)(?:\.|$))',
        "did": r'(\w+) (?:didn\'t|did not|never) (?:say|state|claim|admit|confess)',
        "accused": r'(\w+) (?:accused|blamed|held responsible) (\w+)',
        "denied": r'(\w+) (?:denied|rejected|refused) (?:to|that|having)',
    }

    @classmethod
    def extract_entities(cls, text: str) -> List[Dict[str, Any]]:
        """Extract named entities from text."""
        entities = []

        for entity_type, pattern in cls.ENTITY_PATTERNS.items():
            matches = re.findall(pattern, text)
            for match in matches:
                # Flatten tuple if needed
                name = match if isinstance(match, str) else match[0] if match else None
                if name:
                    entities.append({
                        "type": entity_type,
                        "text": name.strip(),
                        "confidence": 0.7  # Simple heuristic
                    })

        return entities

    @classmethod
    def extract_relations(cls, text: str) -> List[Dict[str, Any]]:
        """Extract subject-predicate-object relations."""
        relations = []

        for rel_type, pattern in cls.RELATION_PATTERNS.items():
            matches = re.finditer(pattern, text, re.IGNORECASE)
            for match in matches:
                groups = match.groups()
                if len(groups) >= 1 and groups[0]:
                    relation = {
                        "type": rel_type,
                        "subject": groups[0].strip() if groups[0] else None,
                        "predicate": rel_type,
                        "object": None,
                        "full_match": match.group(0)
                    }
                    # Try to extract object from remaining groups
                    for g in groups[1:]:
                        if g and isinstance(g, str) and g.strip():
                            relation["object"] = g.strip()
                            break
                    if relation["subject"]:
                        relations.append(relation)

        return relations


class TemporalReasoner:
    """Temporal reasoning for before/after/during constraints."""

    @staticmethod
    def parse_temporal(text: str) -> Optional[Dict[str, Any]]:
        """Parse temporal markers from text."""
        text_lower = text.lower()

        temporal = {
            "before": None,
            "after": None,
            "during": None,
            "eventually": None,
            "simultaneously": None
        }

        # Before patterns
        before_match = re.search(r'before (?:the |that |)([^,.\n]+)', text_lower)
        if before_match:
            temporal["before"] = before_match.group(1).strip()

        # After patterns
        after_match = re.search(r'after (?:the |that |)([^,.\n]+)', text_lower)
        if after_match:
            temporal["after"] = after_match.group(1).strip()

        # During patterns
        during_match = re.search(r'during (?:the |that |)([^,.\n]+)', text_lower)
        if during_match:
            temporal["during"] = during_match.group(1).strip()

        # Eventually patterns
        if re.search(r'eventually|finally|ultimately|in the end', text_lower):
            temporal["eventually"] = True

        # Simultaneously patterns
        if re.search(r'at the same time|simultaneously|concurrently', text_lower):
            temporal["simultaneously"] = True

        return temporal if any(temporal.values()) else None

    @staticmethod
    def compute_temporal_distance(fact1: Fact, fact2: Fact) -> Optional[float]:
        """Compute temporal distance between two facts in seconds."""
        if fact1.timestamp and fact2.timestamp:
            return abs(fact1.timestamp - fact2.timestamp)
        return None


class NeuroSymbolicBridge:
    """
    Bridge connecting neural (embedding/pattern) layer with symbolic (rule/logic) layer.

    LIFTS neural outputs to symbolic facts:
      - Shadow Protocol events → cognitive_flag facts
      - Memory Matrix retrievals → memory_recall facts
      - Anomaly detections → anomaly_event facts

    GROUNDS symbolic queries to neural retrieval:
      - "Find similar past events" → vector similarity search
      - "Retrieve all pattern X by speaker Y" → filtered retrieval
    """

    def __init__(self, cozo_path: Optional[str] = None, use_knowledge_graph: bool = True):
        self.facts: Dict[str, Fact] = {}
        self.fact_index: Dict[str, List[str]] = {}  # fact_type -> [fact_ids]
        self.entity_index: Dict[str, List[str]] = {}  # entity_name -> [fact_ids]
        self.temporal_reasoner = TemporalReasoner()
        self.entity_extractor = EntityExtractor()

        self.lock = threading.RLock()

        # CozoDB knowledge graph (optional)
        self.db: Optional[CozoDB] = None
        self.use_knowledge_graph = use_knowledge_graph and COZODB_AVAILABLE

        if self.use_knowledge_graph:
            try:
                self._init_cozo(cozo_path)
            except Exception as e:
                print(f"[NEURO-SYM] CozoDB init failed: {e}, using in-memory")
                self.use_knowledge_graph = False

        # Memory Matrix integration
        self.memory_matrix: Optional[MemoryMatrix] = None
        if MEMORY_MATRIX_AVAILABLE:
            try:
                self.memory_matrix = MemoryMatrix()
            except Exception as e:
                print(f"[NEURO-SYM] Memory Matrix init failed: {e}")

        # Statistics
        self.stats = {
            "lifted_count": 0,
            "query_count": 0,
            "facts_total": 0,
            "start_time": time.time()
        }

        print(f"[NEURO-SYM] Bridge initialized (CozoDB: {self.use_knowledge_graph}, Memory: {self.memory_matrix is not None})")

    def _init_cozo(self, db_path: Optional[str]):
        """Initialize CozoDB knowledge graph."""
        if not COZODB_AVAILABLE:
            return

        # In-memory CozoDB for now
        self.db = CozoDB()

        # Create facts relation
        self.db.run("""
            CREATE facts TABLE
            WITH
                key = fact_id,
                type = fact_type,
                ts = timestamp,
                conf = confidence,
                src = source,
                sub = subject,
                pred = predicate,
                obj = object,
                meta = metadata,
                expires = expires_at
        """)

        # Create entity index relation
        self.db.run("""
            CREATE entity_index TABLE
            WITH
                key = entity,
                type = entity_type,
                fact_ids = fact_ids
        """)

        print("[NEURO-SYM] CozoDB initialized")

    # ========== LIFT OPERATIONS (Neural → Symbolic) ==========

    def lift_anomaly(self,
                     pattern_type: str,
                     confidence: float,
                     source: str,
                     original_text: Optional[str] = None,
                     context: Optional[str] = None,
                     subject: Optional[str] = None,
                     metadata: Optional[Dict[str, Any]] = None) -> LiftResult:
        """
        Lift an anomaly detection from Shadow Protocol or other neural detector
        to a symbolic anomaly_event fact.
        """
        try:
            # Extract entities from context if provided
            entities = []
            if context:
                entities = self.entity_extractor.extract_entities(context)
                relations = self.entity_extractor.extract_relations(context)

            # Extract subject from entities if not provided
            if subject is None and entities:
                person_entities = [e for e in entities if e["type"] == "PERSON"]
                if person_entities:
                    subject = person_entities[0]["text"]

            # Create the fact
            fact = Fact(
                fact_id=Fact.generate_id("anomaly_event", subject or "", pattern_type, original_text or ""),
                fact_type=FactType.ANOMALY_EVENT.value,
                timestamp=time.time(),
                confidence=confidence,
                source=source,
                subject=subject,
                predicate="exhibits",
                object=pattern_type,
                metadata={
                    "original_text": original_text,
                    "context": context,
                    "entities": entities,
                    "relations": relations if context else [],
                    **(metadata or {})
                }
            )

            # Assert the fact
            self._assert_fact(fact)

            # Lift to symbolic: extract cognitive implications
            self._lift_cognitive_implications(fact)

            self.stats["lifted_count"] += 1

            return LiftResult(success=True, fact=fact)

        except Exception as e:
            return LiftResult(success=False, error=str(e))

    def lift_pattern(self,
                     pattern_name: str,
                     confidence: float,
                     source: str,
                     subject: Optional[str] = None,
                     examples: Optional[List[str]] = None,
                     context: Optional[str] = None,
                     metadata: Optional[Dict[str, Any]] = None) -> LiftResult:
        """
        Lift a pattern detection (e.g., Shadow Protocol pattern match)
        to a symbolic pattern_detected fact.
        """
        try:
            fact = Fact(
                fact_id=Fact.generate_id("pattern_detected", subject or "", pattern_name, ""),
                fact_type=FactType.PATTERN_DETECTED.value,
                timestamp=time.time(),
                confidence=confidence,
                source=source,
                subject=subject,
                predicate="exhibits",
                object=pattern_name,
                metadata={
                    "examples": examples or [],
                    "context": context,
                    "pattern_name": pattern_name,
                    **(metadata or {})
                }
            )

            self._assert_fact(fact)
            self.stats["lifted_count"] += 1

            return LiftResult(success=True, fact=fact)

        except Exception as e:
            return LiftResult(success=False, error=str(e))

    def lift_memory_recall(self,
                           query: str,
                           results: List[Dict[str, Any]],
                           source: str = "memory_matrix",
                           subject: Optional[str] = None,
                           metadata: Optional[Dict[str, Any]] = None) -> LiftResult:
        """
        Lift a Memory Matrix retrieval to a symbolic memory_recall fact.
        """
        try:
            # Use first result's content as object
            object_val = results[0].get("content", query)[:200] if results else query

            fact = Fact(
                fact_id=Fact.generate_id("memory_recall", subject or "query", "recalled", object_val),
                fact_type=FactType.MEMORY_RECALL.value,
                timestamp=time.time(),
                confidence=results[0].get("score", 0.5) if results else 0.5,
                source=source,
                subject=subject,
                predicate="recalled",
                object=object_val,
                metadata={
                    "query": query,
                    "result_count": len(results),
                    "top_results": results[:5],  # Store top 5 for reference
                    **(metadata or {})
                }
            )

            self._assert_fact(fact)
            self.stats["lifted_count"] += 1

            return LiftResult(success=True, fact=fact)

        except Exception as e:
            return LiftResult(success=False, error=str(e))

    def lift_entity(self,
                    entity_type: str,
                    entity_text: str,
                    confidence: float,
                    source: str,
                    properties: Optional[Dict[str, Any]] = None,
                    metadata: Optional[Dict[str, Any]] = None) -> LiftResult:
        """
        Lift an extracted entity to a symbolic entity_extraction fact.
        """
        try:
            fact = Fact(
                fact_id=Fact.generate_id("entity_extraction", entity_text, entity_type, ""),
                fact_type=FactType.ENTITY_EXTRACTION.value,
                timestamp=time.time(),
                confidence=confidence,
                source=source,
                subject=entity_text,
                predicate="is_a",
                object=entity_type,
                metadata={
                    "properties": properties or {},
                    **(metadata or {})
                }
            )

            self._assert_fact(fact)
            self._index_entity(entity_text, entity_type, fact.fact_id)

            return LiftResult(success=True, fact=fact)

        except Exception as e:
            return LiftResult(success=False, error=str(e))

    def lift_causal_link(self,
                         cause_fact_id: str,
                         effect_fact_id: str,
                         confidence: float,
                         source: str = "causal_engine",
                         mechanism: Optional[str] = None,
                         metadata: Optional[Dict[str, Any]] = None) -> LiftResult:
        """
        Lift a causal link between two facts to symbolic knowledge.
        """
        try:
            fact = Fact(
                fact_id=Fact.generate_id("causal_link", cause_fact_id, "causes", effect_fact_id),
                fact_type=FactType.CAUSAL_LINK.value,
                timestamp=time.time(),
                confidence=confidence,
                source=source,
                subject=cause_fact_id,
                predicate="causes",
                object=effect_fact_id,
                metadata={
                    "mechanism": mechanism,
                    "cause": cause_fact_id,
                    "effect": effect_fact_id,
                    **(metadata or {})
                }
            )

            self._assert_fact(fact)

            return LiftResult(success=True, fact=fact)

        except Exception as e:
            return LiftResult(success=False, error=str(e))

    def _lift_cognitive_implications(self, anomaly_fact: Fact) -> List[LiftResult]:
        """
        Automatically lift cognitive implications from an anomaly detection.
        E.g., nervous_laughter + multiple instances → cognitive_flag.
        """
        implications = []

        # Check if this is a Shadow Protocol pattern
        pattern = anomaly_fact.object
        subject = anomaly_fact.subject

        if pattern and subject:
            # Count similar facts
            similar_count = self._count_facts_by_pattern(pattern, subject)

            # If pattern appears multiple times, raise cognitive flag
            if similar_count >= 2:
                cognitive_fact = Fact(
                    fact_id=Fact.generate_id("cognitive_flag", subject, "exhibits", f"consistent_{pattern}"),
                    fact_type=FactType.COGNITIVE_FLAG.value,
                    timestamp=time.time(),
                    confidence=min(0.5 + similar_count * 0.15, 0.95),
                    source="neuro_symbolic_bridge",
                    subject=subject,
                    predicate="exhibits",
                    object=f"consistent_{pattern}",
                    metadata={
                        "trigger_count": similar_count,
                        "trigger_pattern": pattern,
                        "triggered_by": anomaly_fact.fact_id
                    }
                )
                self._assert_fact(cognitive_fact)
                implications.append(LiftResult(success=True, fact=cognitive_fact))

        return implications

    # ========== GROUND OPERATIONS (Symbolic → Neural) ==========

    def ground_query(self,
                     query_type: str,
                     filters: Optional[Dict[str, Any]] = None,
                     temporal_constraints: Optional[Dict[str, Any]] = None,
                     limit: int = 100) -> QueryResult:
        """
        Ground a symbolic query back to neural retrieval.
        Returns facts matching the query with optional temporal filtering.
        """
        start_time = time.time()

        # Get facts by type
        fact_ids = self.fact_index.get(query_type, [])
        facts = [self.facts[fid] for fid in fact_ids if fid in self.facts]

        # Apply filters
        if filters:
            facts = self._apply_filters(facts, filters)

        # Apply temporal constraints
        if temporal_constraints:
            facts = self._apply_temporal_constraints(facts, temporal_constraints)

        # Sort by timestamp (newest first)
        facts.sort(key=lambda f: f.timestamp, reverse=True)

        # Limit results
        facts = facts[:limit]

        query_time = (time.time() - start_time) * 1000
        self.stats["query_count"] += 1

        return QueryResult(
            facts=facts,
            count=len(facts),
            query_time_ms=query_time
        )

    def ground_similarity(self,
                          fact_id: str,
                          limit: int = 10) -> List[Tuple[Fact, float]]:
        """
        Find neural-similar facts to a given fact using embedding similarity.
        Falls back to lexical similarity if no embeddings available.
        """
        if fact_id not in self.facts:
            return []

        source_fact = self.facts[fact_id]
        all_facts = [f for f in self.facts.values() if f.fact_id != fact_id]

        similarities = []

        for fact in all_facts:
            # Compute similarity
            if hasattr(self, '_compute_similarity'):
                sim = self._compute_similarity(source_fact, fact)
            else:
                sim = self._lexical_similarity(source_fact, fact)

            similarities.append((fact, sim))

        # Sort by similarity and return top N
        similarities.sort(key=lambda x: x[1], reverse=True)
        return similarities[:limit]

    def ground_entity_lookup(self,
                            entity_name: str,
                            entity_type: Optional[str] = None) -> List[Fact]:
        """Find all facts related to an entity."""
        fact_ids = self.entity_index.get(entity_name, [])
        facts = [self.facts[fid] for fid in fact_ids if fid in self.facts]

        if entity_type:
            facts = [f for f in facts if f.object == entity_type]

        return facts

    # ========== INTERNAL HELPERS ==========

    def _assert_fact(self, fact: Fact) -> None:
        """Assert a fact into the knowledge base."""
        with self.lock:
            self.facts[fact.fact_id] = fact

            # Update type index
            if fact.fact_type not in self.fact_index:
                self.fact_index[fact.fact_type] = []
            if fact.fact_id not in self.fact_index[fact.fact_type]:
                self.fact_index[fact.fact_type].append(fact.fact_id)

            # Update CozoDB if available
            if self.use_knowledge_graph and self.db:
                self._assert_to_cozo(fact)

            self.stats["facts_total"] = len(self.facts)

    def _assert_to_cozo(self, fact: Fact) -> None:
        """Assert fact to CozoDB."""
        try:
            self.db.run("""
                INSERT INTO facts {
                    fact_id: $fact_id,
                    fact_type: $fact_type,
                    timestamp: $timestamp,
                    confidence: $confidence,
                    source: $source,
                    subject: $subject,
                    predicate: $predicate,
                    object: $object,
                    metadata: $metadata,
                    expires_at: $expires_at
                }
            """, {
                "fact_id": fact.fact_id,
                "fact_type": fact.fact_type,
                "timestamp": fact.timestamp,
                "confidence": fact.confidence,
                "source": fact.source,
                "subject": fact.subject,
                "predicate": fact.predicate,
                "object": fact.object,
                "metadata": json.dumps(fact.metadata),
                "expires_at": fact.expires_at
            })
        except Exception as e:
            print(f"[NEURO-SYM] CozoDB assert failed: {e}")

    def _index_entity(self, entity: str, entity_type: str, fact_id: str) -> None:
        """Index entity for fast lookup."""
        with self.lock:
            if entity not in self.entity_index:
                self.entity_index[entity] = []
            if fact_id not in self.entity_index[entity]:
                self.entity_index[entity].append(fact_id)

    def _apply_filters(self, facts: List[Fact], filters: Dict[str, Any]) -> List[Fact]:
        """Apply filters to fact list."""
        result = facts

        for key, value in filters.items():
            if key == "subject":
                result = [f for f in result if f.subject == value]
            elif key == "predicate":
                result = [f for f in result if f.predicate == value]
            elif key == "object":
                result = [f for f in result if f.object == value]
            elif key == "source":
                result = [f for f in result if f.source == value]
            elif key == "min_confidence":
                result = [f for f in result if f.confidence >= value]
            elif key == "pattern":
                # Filter by pattern match in metadata or object
                result = [f for f in result
                         if value.lower() in (f.object or "").lower()
                         or value.lower() in f.metadata.get("pattern_name", "").lower()]

        return result

    def _apply_temporal_constraints(self, facts: List[Fact], constraints: Dict[str, Any]) -> List[Fact]:
        """Apply temporal constraints to fact list."""
        result = facts
        now = time.time()

        # Filter expired facts
        result = [f for f in result if not f.is_expired()]

        # Time window constraint
        if "within_seconds" in constraints:
            window = constraints["within_seconds"]
            cutoff = now - window
            result = [f for f in result if f.timestamp >= cutoff]

        # Before constraint
        if "before" in constraints:
            before_time = constraints["before"]
            result = [f for f in result if f.timestamp < before_time]

        # After constraint
        if "after" in constraints:
            after_time = constraints["after"]
            result = [f for f in result if f.timestamp > after_time]

        return result

    def _count_facts_by_pattern(self, pattern: str, subject: str) -> int:
        """Count facts matching pattern and subject."""
        count = 0
        for fact in self.facts.values():
            if fact.object == pattern and fact.subject == subject:
                count += 1
        return count

    def _lexical_similarity(self, fact1: Fact, fact2: Fact) -> float:
        """Compute simple lexical similarity between two facts."""
        # Simple Jaccard similarity on word sets
        def get_words(fact: Fact) -> set:
            words = set()
            if fact.subject:
                words.update(fact.subject.lower().split())
            if fact.object:
                words.update(fact.object.lower().split())
            if fact.predicate:
                words.add(fact.predicate.lower())
            return words

        words1 = get_words(fact1)
        words2 = get_words(fact2)

        if not words1 or not words2:
            return 0.0

        intersection = words1 & words2
        union = words1 | words2

        return len(intersection) / len(union) if union else 0.0

    # ========== API METHODS ==========

    def query(self,
              fact_type: Optional[str] = None,
              subject: Optional[str] = None,
              predicate: Optional[str] = None,
              obj: Optional[str] = None,
              source: Optional[str] = None,
              min_confidence: float = 0.0,
              within_seconds: Optional[float] = None,
              limit: int = 100) -> List[Dict[str, Any]]:
        """
        High-level query interface.
        Returns list of matching facts as dictionaries.
        """
        filters = {}
        if subject:
            filters["subject"] = subject
        if predicate:
            filters["predicate"] = predicate
        if obj:
            filters["object"] = obj
        if source:
            filters["source"] = source
        if min_confidence > 0:
            filters["min_confidence"] = min_confidence

        temporal = {}
        if within_seconds:
            temporal["within_seconds"] = within_seconds

        query_type = fact_type or "anomaly_event"
        result = self.ground_query(query_type, filters, temporal, limit)

        return [f.to_dict() for f in result.facts]

    def get_statistics(self) -> Dict[str, Any]:
        """Get bridge statistics."""
        uptime = time.time() - self.stats["start_time"]

        # Count by type
        type_counts = {}
        for fact_type, fact_ids in self.fact_index.items():
            type_counts[fact_type] = len(fact_ids)

        return {
            "uptime_seconds": round(uptime, 1),
            "facts_total": self.stats["facts_total"],
            "facts_by_type": type_counts,
            "lifted_count": self.stats["lifted_count"],
            "query_count": self.stats["query_count"],
            "cozo_enabled": self.use_knowledge_graph,
            "memory_matrix_enabled": self.memory_matrix is not None,
            "entity_index_size": len(self.entity_index)
        }

    def clear_expired(self) -> int:
        """Remove expired facts. Returns count of removed facts."""
        with self.lock:
            expired_ids = [fid for fid, f in self.facts.items() if f.is_expired()]
            for fid in expired_ids:
                del self.facts[fid]
                # Remove from indices
                for idx in self.fact_index.values():
                    if fid in idx:
                        idx.remove(fid)
            return len(expired_ids)


# ========== STANDALONE HTTP SERVER ==========

import socket


def create_json_response(data: Dict[str, Any], status: int = 200) -> bytes:
    """Create JSON HTTP response."""
    json_str = json.dumps(data, indent=2)
    response = f"HTTP/1.1 {status} OK\r\n"
    response += "Content-Type: application/json\r\n"
    response += f"Content-Length: {len(json_str)}\r\n"
    response += "Access-Control-Allow-Origin: *\r\n"
    response += "\r\n"
    response += json_str
    return response.encode('utf-8')


class NeuroSymbolicBridgeServer:
    """HTTP server for Neuro-Symbolic Bridge API."""

    def __init__(self, port: int = 7784):
        self.port = port
        self.bridge = NeuroSymbolicBridge()
        self.running = False
        self.server_socket = None

    def handle_request(self, client_socket, address):
        """Handle HTTP request."""
        try:
            request = b""
            client_socket.settimeout(3.0)
            while b"\r\n\r\n" not in request:
                chunk = client_socket.recv(4096)
                if not chunk:
                    return
                request += chunk

            request_str = request.decode('utf-8', errors='ignore')
            lines = request_str.split('\r\n')
            if not lines:
                return

            request_line = lines[0]
            parts = request_line.split(' ')
            if len(parts) < 2:
                return

            method = parts[0]
            path = parts[1]

            response = self._route(method, path, request)
            client_socket.sendall(response)
        except Exception as e:
            print(f"[NEURO-SYM] Request error: {e}")
        finally:
            client_socket.close()

    def _route(self, method: str, path: str, request: bytes) -> bytes:
        """Route request to handler."""
        # Parse path
        if '?' in path:
            path, query = path.split('?', 1)
        else:
            query = ""

        # Health check
        if path == '/health':
            return create_json_response({"status": "healthy"})

        # Statistics
        if path == '/stats':
            return create_json_response(self.bridge.get_statistics())

        # Query endpoint
        if path == '/query' and method == 'GET':
            # Parse query params from path
            import urllib.parse
            params = dict(urllib.parse.parse_qsl(query))
            return create_json_response(self.bridge.query(**params))

        # POST endpoints for lifting
        if method == 'POST':
            # Extract body
            if '\r\n\r\n' in request.decode('utf-8', errors='ignore'):
                body_start = request.decode('utf-8', errors='ignore').index('\r\n\r\n') + 4
                body = request[body_start:]
            else:
                body = b''

            try:
                data = json.loads(body) if body else {}
            except json.JSONDecodeError:
                return create_json_response({"error": "Invalid JSON"}, status=400)

            # Lift operations
            if path == '/lift/anomaly':
                result = self.bridge.lift_anomaly(**data)
                return create_json_response(result.to_dict())

            elif path == '/lift/pattern':
                result = self.bridge.lift_pattern(**data)
                return create_json_response(result.to_dict())

            elif path == '/lift/memory':
                result = self.bridge.lift_memory_recall(**data)
                return create_json_response(result.to_dict())

            elif path == '/lift/entity':
                result = self.bridge.lift_entity(**data)
                return create_json_response(result.to_dict())

            elif path == '/lift/causal':
                result = self.bridge.lift_causal_link(**data)
                return create_json_response(result.to_dict())

        # Root info
        if path == '/':
            return create_json_response({
                "service": "PURPCLAW Neuro-Symbolic Bridge",
                "version": "1.0.0",
                "endpoints": [
                    "/lift/anomaly", "/lift/pattern", "/lift/memory",
                    "/lift/entity", "/lift/causal",
                    "/query", "/stats", "/health"
                ]
            })

        return create_json_response({"error": "Not found"}, status=404)

    def start(self):
        """Start HTTP server."""
        import socket

        self.server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.server_socket.bind(('127.0.0.1', self.port))
        self.server_socket.listen(10)

        self.running = True
        print(f"[NEURO-SYM] Server started on port {self.port}")

        while self.running:
            try:
                self.server_socket.settimeout(1.0)
                try:
                    client_socket, address = self.server_socket.accept()
                    import threading
                    threading.Thread(target=self.handle_request, args=(client_socket, address)).start()
                except socket.timeout:
                    continue
            except Exception as e:
                if self.running:
                    print(f"[NEURO-SYM] Server error: {e}")

    def stop(self):
        """Stop server."""
        self.running = False
        if self.server_socket:
            self.server_socket.close()


def main():
    import argparse
    parser = argparse.ArgumentParser(description='PURPCLAW Neuro-Symbolic Bridge')
    parser.add_argument('--port', type=int, default=7784, help='Port to listen on')
    args = parser.parse_args()

    server = NeuroSymbolicBridgeServer(port=args.port)
    try:
        server.start()
    except KeyboardInterrupt:
        print("\n[NEURO-SYM] Shutting down...")
        server.stop()


if __name__ == '__main__':
    main()
