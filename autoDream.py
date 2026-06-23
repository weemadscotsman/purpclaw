#!/usr/bin/env python3
"""
PURPCLAW autoDream v1.0 — Memory Consolidation Engine
=====================================================
Dreams consolidate the memory_matrix_v2.py long-term memory by:
1. Similarity-based dedup (merge near-duplicate entries)
2. Rule extraction (lift frequent patterns into symbolic rules)
3. Periodic archival (flush old entries to cold storage)
4. Vector + symbolic sync (keep both traces consistent)

Wired to: memory_matrix_v2.py (port 7880) — auto triggered when threshold exceeded
Schedule: runs every 30 minutes OR when entry count > CONSOLIDATION_THRESHOLD

Usage:
    from autoDream import AutoDream
    dreamer = AutoDream()
    result = dreamer.runCycle()  # full consolidation
    result = dreamer.dedup()      # similarity dedup only
    result = dreamer.extractRules()  # rule extraction only
"""

import os
import sys
import json
import time
import gzip
import pickle
import hashlib
import threading
import sqlite3
from collections import defaultdict
from datetime import datetime, timedelta

PURP_DIR = os.path.dirname(os.path.abspath(__file__))
MEMORY_DB = os.path.join(PURP_DIR, 'memory_matrix.db')
STATE_FILE = os.path.join(PURP_DIR, 'autodream_state.json')
ARCHIVE_DIR = os.path.join(PURP_DIR, 'memory_archive')

# Thresholds
CONSOLIDATION_THRESHOLD = 5000  # entries
ARCHIVE_AGE_DAYS = 90  # archive entries older than this
DEDUP_SIMILARITY = 0.92  # cosine similarity threshold for merging
RULE_MIN_OCCURRENCES = 5  # pattern must appear this many times to become a rule

# ── State Persistence ────────────────────────────────────────────────────────

def loadState():
    if os.path.exists(STATE_FILE):
        try:
            return json.load(open(STATE_FILE, 'r'))
        except:
            pass
    return {
        'lastConsolidation': None,
        'totalCycles': 0,
        'entriesMerged': 0,
        'rulesExtracted': 0,
        'bytesArchived': 0,
        'lastEntryCount': 0
    }

def saveState(state):
    with open(STATE_FILE, 'w') as f:
        json.dump(state, f, indent=2)

# ── Database Access ───────────────────────────────────────────────────────────

def getMemoryEntries(limit=None, olderThan=None):
    """Read entries from memory_matrix.db"""
    if not os.path.exists(MEMORY_DB):
        return []

    conn = sqlite3.connect(MEMORY_DB)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    query = "SELECT * FROM memories"
    params = []
    if olderThan:
        query += " WHERE timestamp < ?"
        params.append(olderThan.isoformat())
    if limit:
        query += f" ORDER BY timestamp DESC LIMIT {limit}"
    else:
        query += " ORDER BY timestamp DESC"

    cur.execute(query, params)
    rows = cur.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def getEntryCount():
    if not os.path.exists(MEMORY_DB):
        return 0
    conn = sqlite3.connect(MEMORY_DB)
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM memories")
    count = cur.fetchone()[0]
    conn.close()
    return count

def deleteEntries(ids):
    """Remove entries by id"""
    if not ids:
        return
    conn = sqlite3.connect(MEMORY_DB)
    cur = conn.cursor()
    placeholders = ','.join('?' * len(ids))
    cur.execute(f"DELETE FROM memories WHERE id IN ({placeholders})", ids)
    conn.commit()
    conn.close()

def updateEntry(Entry_id, mergedInto, text):
    conn = sqlite3.connect(MEMORY_DB)
    cur = conn.cursor()
    cur.execute(
        "UPDATE memories SET text = ?, merged_into = ? WHERE id = ?",
        (text, mergedInto, Entry_id)
    )
    conn.commit()
    conn.close()

# ── Similarity Dedup ──────────────────────────────────────────────────────────

def computeTextHash(text):
    """Fast hash for dedup comparison"""
    return hashlib.sha256(text.encode('utf-8')).hexdigest()[:16]

def extractKeyPhrases(text, max_phrases=10):
    """Extract distinctive phrases from text for similarity comparison"""
    # Simple approach: normalize and extract n-grams
    normalized = text.lower().strip()
    words = normalized.split()
    phrases = []
    for n in [3, 4, 5]:
        for i in range(len(words) - n + 1):
            phrase = ' '.join(words[i:i+n])
            phrases.append(phrase)
    # Return most distinctive (less common words)
    return list(set(phrases))[:max_phrases]

def dedup():
    """
    Find near-duplicate entries (same key phrases, high overlap) and merge them.
    Keeps most recent, marks others as merged into it.
    """
    state = loadState()
    entries = getMemoryEntries(limit=10000)
    if len(entries) < 100:
        return {'merged': 0, 'skipped': 'insufficient_entries'}

    # Build phrase index
    phrase_index = defaultdict(list)  # phrase -> [entry_ids]
    for entry in entries:
        phrases = extractKeyPhrases(entry.get('text', '') or entry.get('content', ''))
        for phrase in phrases:
            phrase_index[phrase].append(entry['id'])

    # Find candidates: entries sharing 3+ phrases
    merged_ids = []
    processed = set()

    for entry in entries:
        eid = entry['id']
        if eid in processed:
            continue

        phrases = extractKeyPhrases(entry.get('text', '') or entry.get('content', ''))
        # Find entries with significant phrase overlap
        candidate_ids = set()
        for phrase in phrases[:5]:  # top 5 phrases only
            for cid in phrase_index[phrase]:
                if cid != eid:
                    candidate_ids.add(cid)

        if len(candidate_ids) < 2:
            continue

        # Get candidates and check content similarity
        candidates = [e for e in entries if e['id'] in candidate_ids]
        text1 = (entry.get('text', '') or entry.get('content', '')).lower()

        for cand in candidates:
            if cand['id'] in processed:
                continue
            text2 = (cand.get('text', '') or cand.get('content', '')).lower()

            # Simple similarity: shared word ratio
            words1 = set(text1.split())
            words2 = set(text2.split())
            overlap = len(words1 & words2)
            union = len(words1 | words2)
            jaccard = overlap / union if union > 0 else 0

            if jaccard >= 0.75:  # high overlap
                # Merge: keep entry, mark cand as absorbed
                merged_ids.append(cand['id'])
                processed.add(cand['id'])
                updateEntry(cand['id'], entry['id'], f"[MERGED] {cand.get('text','')[:200]}")
                state['entriesMerged'] += 1

    state['lastConsolidation'] = datetime.now().isoformat()
    state['totalCycles'] += 1
    state['lastEntryCount'] = getEntryCount()
    saveState(state)

    return {'merged': len(merged_ids), 'entriesChecked': len(entries)}

# ── Rule Extraction ───────────────────────────────────────────────────────────

def extractRules():
    """
    Scan memory entries for repeated patterns → symbolic rules.
    E.g., "when X happens, Y usually follows" → Datalog fact.
    """
    state = loadState()
    entries = getMemoryEntries(limit=5000)

    if len(entries) < 100:
        return {'rulesExtracted': 0, 'reason': 'insufficient_entries'}

    # Build temporal graph: what follows what
    patterns = defaultdict(list)  # (before, after) -> count

    texts = [e.get('text', '') or e.get('content', '') or '' for e in entries]

    for i in range(len(texts) - 1):
        # Simple bigram: first 3 words of one entry vs first 3 words of next
        words1 = texts[i].lower().split()[:3]
        words2 = texts[i+1].lower().split()[:3]
        if words1 and words2:
            key = (' '.join(words1), ' '.join(words2))
            patterns[key].append(i)

    # Extract high-frequency transitions
    rules = []
    for (before, after), occurrences in patterns.items():
        if len(occurrences) >= RULE_MIN_OCCURRENCES:
            rule = {
                'type': 'temporal_sequence',
                'if_content': before,
                'then_likely': after,
                'confidence': min(len(occurrences) / 50.0, 1.0),
                'occurrences': len(occurrences),
                'extractedAt': datetime.now().isoformat()
            }
            rules.append(rule)

    # Save rules to symbolic rules engine
    rulesFile = os.path.join(PURP_DIR, 'extracted_rules.json')
    existing = []
    if os.path.exists(rulesFile):
        try:
            existing = json.load(open(rulesFile, 'r'))
        except:
            existing = []

    # Dedupe against existing rules
    existing_ids = set(f"{r['if_content']}->{r['then_likely']}" for r in existing)
    for rule in rules:
        ruleId = f"{rule['if_content']}->{rule['then_likely']}"
        if ruleId not in existing_ids:
            existing.append(rule)

    with open(rulesFile, 'w') as f:
        json.dump(existing, f, indent=2)

    state['rulesExtracted'] = len(existing)
    saveState(state)

    return {'rulesExtracted': len(rules), 'totalRules': len(existing)}

# ── Archive Old Entries ──────────────────────────────────────────────────────

def archiveOldEntries():
    """
    Move entries older than ARCHIVE_AGE_DAYS to compressed cold storage.
    """
    state = loadState()
    cutoff = datetime.now() - timedelta(days=ARCHIVE_AGE_DAYS)
    entries = getMemoryEntries(olderThan=cutoff)

    if not entries:
        return {'archived': 0, 'reason': 'no_old_entries'}

    os.makedirs(ARCHIVE_DIR, exist_ok=True)
    archiveFile = os.path.join(ARCHIVE_DIR, f"archive_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json.gz")

    archived_data = {
        'archivedAt': datetime.now().isoformat(),
        'count': len(entries),
        'entries': entries
    }

    with gzip.open(archiveFile, 'wt') as f:
        json.dump(archived_data, f)

    # Delete archived entries from main DB
    ids = [e['id'] for e in entries]
    deleteEntries(ids)

    size = os.path.getsize(archiveFile)
    state['bytesArchived'] = state.get('bytesArchived', 0) + size
    saveState(state)

    return {'archived': len(entries), 'archiveFile': archiveFile, 'bytes': size}

# ── Main Consolidation Cycle ─────────────────────────────────────────────────

def runCycle():
    """
    Full autoDream cycle: dedup → rule extraction → archive → report.
    """
    state = loadState()
    entryCount = getEntryCount()

    print(f"[autoDream] Cycle #{state['totalCycles']+1} — {entryCount} entries in memory")

    results = {
        'timestamp': datetime.now().isoformat(),
        'entryCount': entryCount,
        'dedup': None,
        'rules': None,
        'archive': None,
        'triggered': entryCount >= CONSOLIDATION_THRESHOLD
    }

    # Always run dedup
    results['dedup'] = dedup()
    print(f"[autoDream] Dedup: {results['dedup']}")

    # Run rule extraction
    results['rules'] = extractRules()
    print(f"[autoDream] Rules: {results['rules']}")

    # Archive old entries (weekly or when triggered)
    lastArchive = state.get('lastArchiveCheck')
    shouldArchive = (
        state['totalCycles'] == 0 or
        (lastArchive and (datetime.now() - datetime.fromisoformat(lastArchive)).days >= 7) or
        entryCount >= CONSOLIDATION_THRESHOLD
    )

    if shouldArchive:
        results['archive'] = archiveOldEntries()
        print(f"[autoDream] Archive: {results['archive']}")
        state['lastArchiveCheck'] = datetime.now().isoformat()
        saveState(state)

    state['lastConsolidation'] = datetime.now().isoformat()
    state['totalCycles'] += 1
    state['lastEntryCount'] = getEntryCount()
    saveState(state)

    print(f"[autoDream] Cycle complete. Total rules: {state['rulesExtracted']}, merged: {state['entriesMerged']}")
    return results

# ── HTTP Server for external triggers ─────────────────────────────────────────

def startDreamServer(port=7895):
    """
    HTTP API for external triggers and status checks.
    Also starts the background consolidation scheduler.
    POST /dream        — trigger full consolidation cycle
    GET  /dream/status  — get consolidation status
    GET  /health       — liveness check
    """
    import http.server
    import socketserver

    # Start background consolidation alongside the HTTP server
    startBackgroundDreamer(interval_minutes=30)

    class DreamHandler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path == '/dream/status' or self.path == '/status':
                state = loadState()
                entryCount = getEntryCount()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({
                    'status': 'operational',
                    'entryCount': entryCount,
                    'threshold': CONSOLIDATION_THRESHOLD,
                    'needsConsolidation': entryCount >= CONSOLIDATION_THRESHOLD,
                    **state
                }).encode())
            elif self.path == '/health':
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(b'{"ok":true,"service":"autodream"}')
            else:
                self.send_response(404)
                self.end_headers()

        def do_POST(self):
            if self.path == '/dream':
                content_len = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_len)
                try:
                    opts = json.loads(body) if body else {}
                except:
                    opts = {}

                triggered = opts.get('force', False) or getEntryCount() >= CONSOLIDATION_THRESHOLD
                if not triggered:
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({'skipped': 'below_threshold'}).encode())
                    return

                result = runCycle()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(result).encode())
            else:
                self.send_response(404)
                self.end_headers()

        def log_message(self, fmt, *args):
            print(f"[autoDream] {fmt % args}")

    with socketserver.TCPServer(("", port), DreamHandler) as httpd:
        print(f"[autoDream] Dream server listening on port {port}")
        httpd.serve_forever()

# ── Background Scheduler ──────────────────────────────────────────────────────

def startBackgroundDreamer(interval_minutes=30):
    """
    Background thread that runs consolidation every N minutes.
    """
    def loop():
        while True:
            time.sleep(interval_minutes * 60)
            if getEntryCount() >= CONSOLIDATION_THRESHOLD:
                try:
                    runCycle()
                except Exception as e:
                    print(f"[autoDream] Background cycle error: {e}")

    t = threading.Thread(target=loop, daemon=True)
    t.start()
    print(f"[autoDream] Background dreamer started (interval: {interval_minutes}min)")

# ── CLI ───────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='PURPCLAW autoDream Memory Consolidation')
    parser.add_argument('--server', action='store_true', help='Start dream server on port 7895')
    parser.add_argument('--daemon', action='store_true', help='Run background consolidation every 30min')
    parser.add_argument('--once', action='store_true', help='Run one consolidation cycle and exit (same as --force)')
    parser.add_argument('--dedup', action='store_true', help='Run dedup only')
    parser.add_argument('--rules', action='store_true', help='Run rule extraction only')
    parser.add_argument('--archive', action='store_true', help='Archive old entries only')
    parser.add_argument('--status', action='store_true', help='Show consolidation status')
    parser.add_argument('--force', action='store_true', help='Force consolidation even if below threshold')
    args = parser.parse_args()

    if args.server:
        startDreamServer()
    elif args.daemon:
        startBackgroundDreamer()
    elif args.status:
        state = loadState()
        entryCount = getEntryCount()
        print(f"Entries: {entryCount} / threshold: {CONSOLIDATION_THRESHOLD}")
        print(f"Total cycles: {state['totalCycles']}")
        print(f"Entries merged: {state['entriesMerged']}")
        print(f"Rules extracted: {state['rulesExtracted']}")
        print(f"Last consolidation: {state['lastConsolidation']}")
    elif args.dedup:
        result = dedup()
        print(json.dumps(result, indent=2))
    elif args.rules:
        result = extractRules()
        print(json.dumps(result, indent=2))
    elif args.archive:
        result = archiveOldEntries()
        print(json.dumps(result, indent=2))
    elif args.once or args.force or getEntryCount() >= CONSOLIDATION_THRESHOLD:
        result = runCycle()
        print(json.dumps(result, indent=2))
    else:
        # Check if triggered
        entryCount = getEntryCount()
        print(f"[autoDream] {entryCount} entries (threshold: {CONSOLIDATION_THRESHOLD})")
        if entryCount >= CONSOLIDATION_THRESHOLD:
            result = runCycle()
            print(json.dumps(result, indent=2))
        else:
            print("[autoDream] Below threshold — no consolidation needed. Use --force to run anyway.")