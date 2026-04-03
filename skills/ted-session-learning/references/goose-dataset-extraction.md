# Dataset Extraction Patterns (Goose Trainer — May 20 2026)

## Sources
Ted's data lives in three places:
1. `~/AppData/Local/hermes/ted_history.db` — Hermes synced conversations (~25k assistant responses)
2. `E:/god folder/02_ACTIVE_PROJECTS/chat histroy s open ai 5 years plus deep seek 1 year/conversations.json` — OpenAI 5yr export (271MB, 1023 convos, ~21k pairs)
3. Same dir: `conversations (2).json` (DeepSeek, 120 convos, 4.7k RESPONSE fragments)
4. Same dir: `conversations (3).json` (DeepSeek, 71 convos, 1k RESPONSE fragments)

## Hermes DB (Fast)
```python
conn = sqlite3.connect(db_path)
cur = conn.cursor()
cur.execute("""
    SELECT m.text, c.title, c.source, c.model_slug
    FROM messages m JOIN conversations c ON m.conv_id = c.id
    WHERE m.role='assistant' AND length(m.text) > 20
    ORDER BY m.timestamp DESC
""")
# Filter: 30 <= len(text) <= 2500
```

## OpenAI Export (Nested Tree — ITERATIVE BFS required)
OpenAI uses a parent-child tree where `"root"` is a string node id pointing to the actual first node.

```python
def walk_openai(mapping):
    # Find root: node whose parent is None and id != "root"
    root_id = next(nid for nid, node in mapping.items() 
                   if nid != "root" and node.get("parent") is None)
    # BFS with explicit stack (NO RECURSION — depth can exceed Python stack)
    result = []
    stack = [(root_id, 0)]
    while stack:
        node_id, order = stack.pop()
        node = mapping[node_id]
        msg = node.get("message")
        if msg:
            role = msg.get("author", {}).get("role", "")
            parts = msg.get("content", {}).get("parts", [])
            text = "".join(str(p) for p in parts).strip()
            if text and len(text) > 10:
                result.append({"role": role, "text": text, "order": order})
        for i, child_id in enumerate(reversed(node.get("children", []))):
            stack.append((child_id, order * 1000 + i))
    result.sort(key=lambda x: x["order"])
    return result
```

## DeepSeek Export (Fragment Format)
DeepSeek uses `fragments[]` array per message node — NOT a role field.

```python
def walk_deepseek(mapping):
    root_id = "root"  # DeepSeek uses "root" as actual node id
    result = []
    stack = [(root_id, 0)]
    while stack:
        node_id, order = stack.pop()
        node = mapping[node_id]
        msg = node.get("message")
        if msg:
            resp_text = req_text = ""
            for frag in msg.get("fragments", []):
                t = frag.get("type", "")
                c = frag.get("content", "") or ""
                if t == "RESPONSE": resp_text += c
                elif t == "REQUEST": req_text += c
            resp_text = resp_text.strip()
            req_text = req_text.strip()
            if req_text: result.append({"role":"user","text":req_text})
            if resp_text: result.append({"role":"assistant","text":resp_text})
        for i, child_id in enumerate(reversed(node.get("children", []))):
            stack.append((child_id, order * 1000 + i))
    result.sort(key=lambda x: x["order"])
    return result
```

Fragment types: RESPONSE (= assistant), REQUEST (= user), THINK (= reasoning), TOOL_OPEN, TOOL_SEARCH, SEARCH, READ_LINK.

## Output Format (Goose Trainer)
```json
{"instruction": "Context from prior messages...", "output": "The assistant response", "metadata": {"source": "openai|deepseek|hermes", "conv_title": "...", "platform": "chatgpt|deepseek|hermes", "chars": 1244}}
```

Filter rules: skip text < 20 chars, > 3000 chars (or 2500 for Hermes DB).

## Extraction Results (May 20 2026)
- OpenAI: 21,304 pairs
- DeepSeek: 2,793 pairs
- Hermes DB: 25,488 pairs
- TOTAL: 49,585 pairs, 62,851,891 chars
- Output: `E:/god folder/02_ACTIVE_PROJECTS/goose-trainer/goose_full_dataset.jsonl` (100MB)
