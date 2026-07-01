#!/usr/bin/env python3
"""PURPCLAW Spring Doctrine bridge for Python cognitive services.

Reads the same file-backed Spring/Hivemind registry used by the Node runtime.
No daemon. No dependency soup. Just provenance and trust, because apparently
software needs adult supervision now.
"""

import json
import os
import time
from datetime import datetime

PURP_DIR = os.path.dirname(os.path.abspath(__file__))
HIVEMIND_DIR = os.path.join(PURP_DIR, '.purpclaw', 'hivemind')
SPRING_INDEX = os.path.join(HIVEMIND_DIR, 'spring-index.json')
DOCTRINE_DIR = os.path.join(HIVEMIND_DIR, 'doctrine')
PRINCIPLES_DIR = os.path.join(HIVEMIND_DIR, 'principles')

SPRING_RANKS = {
    'verified_execution': 1,
    'successful_trace': 2,
    'promoted_skill': 3,
    'human_documentation': 4,
    'external_knowledge': 5,
    'llm_suggestion': 6,
    'unverified_ai_output': 7,
    'failed_execution': 8,
}

RANK_LABELS = {
    1: 'Pure Spring',
    2: 'Fresh Spring',
    3: 'Filtered Spring',
    4: 'Spring Runoff',
    5: 'River Tributary',
    6: 'River Water',
    7: 'Stagnant River',
    8: 'Poisoned Well',
}


def _read_json(path, fallback):
    try:
        if not os.path.exists(path):
            return fallback
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return fallback


def _list_json(dir_path):
    out = []
    try:
        for name in os.listdir(dir_path):
            if name.endswith('.json'):
                row = _read_json(os.path.join(dir_path, name), None)
                if row:
                    out.append(row)
    except Exception:
        pass
    return out


def infer_origin(record):
    if not isinstance(record, dict):
        return 'unverified_ai_output'
    if record.get('origin'):
        return record.get('origin')
    if record.get('outcome') == 'failed' or record.get('status') == 'failed' or record.get('error'):
        return 'failed_execution'
    evidence = record.get('evidence') or []
    if (record.get('outcome') == 'success' or record.get('status') == 'completed') and (record.get('tests_passed') is True or evidence):
        return 'verified_execution'
    if record.get('outcome') == 'success' or record.get('status') == 'completed':
        return 'successful_trace'
    source = str(record.get('source') or '').lower()
    if 'llm' in source or 'model' in source or 'assistant' in source:
        return 'llm_suggestion'
    return 'unverified_ai_output'


def trust_score(record):
    if not isinstance(record, dict):
        return 0.0
    if isinstance(record.get('trust_score'), (int, float)):
        return max(0.0, min(1.0, float(record['trust_score'])))
    origin = infer_origin(record)
    rank = SPRING_RANKS.get(origin, 7)
    base = {1: 0.94, 2: 0.82, 3: 0.74, 4: 0.62, 5: 0.48, 6: 0.28, 7: 0.12, 8: 0.04}.get(rank, 0.12)
    evidence = record.get('evidence') or []
    verify = 0.0
    if record.get('tests_passed') is True:
        verify += 0.3
    if evidence:
        verify += min(0.35, len(evidence) * 0.08)
    if record.get('rollback') or record.get('destructive') or record.get('error'):
        verify -= 0.3
    score = max(0.0, min(1.0, base * 0.65 + verify * 0.35))
    if origin == 'verified_execution' and (record.get('tests_passed') is True or evidence) and not (record.get('rollback') or record.get('destructive') or record.get('error')):
        score = max(score, 0.78)
    return score


def validate(record):
    origin = infer_origin(record)
    rank = SPRING_RANKS.get(origin, 7)
    score = trust_score(record)
    return {
        'schema': 'purpclaw.spring.provenance.v1',
        'origin': origin,
        'spring_rank': rank,
        'spring_label': RANK_LABELS.get(rank, 'Unknown Water'),
        'trust_score': round(score, 3),
        'ok_to_promote': score >= 0.72 and rank <= 2 and not record.get('rollback') and not record.get('destructive') and not record.get('error'),
        'evaluated_at': datetime.utcnow().isoformat() + 'Z',
    }


def status():
    index = _read_json(SPRING_INDEX, {'records': {}})
    records = list((index.get('records') or {}).values())
    doctrines = _list_json(DOCTRINE_DIR)
    principles = _list_json(PRINCIPLES_DIR)
    avg = sum(float(r.get('trust_score') or 0) for r in records) / len(records) if records else 0
    by_rank = {}
    for r in records:
        label = r.get('spring_label') or RANK_LABELS.get(r.get('spring_rank'), 'Unknown Water')
        by_rank[label] = by_rank.get(label, 0) + 1
    return {
        'ok': True,
        'service': 'spring_doctrine_bridge',
        'doctrine': index.get('doctrine', 'PURPCLAW learns from verified experience, not recycled output.'),
        'records': len(records),
        'average_trust_score': round(avg, 3),
        'by_rank': by_rank,
        'principles': len(principles),
        'doctrines': len(doctrines),
        'top_records': sorted(records, key=lambda r: float(r.get('trust_score') or 0), reverse=True)[:10],
        'checked_at': time.time(),
    }


def doctrine():
    return sorted(_list_json(DOCTRINE_DIR), key=lambda r: float(r.get('trust_score') or 0), reverse=True)


def principles():
    return _list_json(PRINCIPLES_DIR)
