---
name: goose-dataset-builder
description: "Extract training datasets from Ted Cannon's conversation archives (OpenAI exports, DeepSeek exports, Hermes ted_history.db). Converts raw conversation files into instruction-response pairs for LLM fine-tuning. Handles three distinct formats with different parsing strategies."
version: 1.0.0
author: Hermes Agent
platforms: [windows, linux]
tags: [data-extraction, fine-tuning, openai, deepseek, hermes, training-data]
metadata:
  source: "E:/god folder/02_ACTIVE_PROJECTS/goose-trainer/"
  dataset_size: "49,585 pairs, 100MB JSONL (May 2026)"
---

# GOOSE Dataset Builder

Extract instruction-response pairs from Ted's conversation archives for fine-tuning LLM models.

## Data Sources

Ted's conversations live in two locations:

1. **OpenAI 5yr export**: `E:/god folder/02_ACTIVE_PROJECTS/chat histroy s open ai 5 years plus deep seek 1 year/conversations.json` (271MB, 1023 convos)
2. **DeepSeek exports**: Same folder — `conversations (2).json` (120 convos) + `conversations (3).json` (71 convos)
3. **Hermes local DB**: `C:/Users/Admin/AppData/Local/hermes/ted_history.db` (68MB, ~49k messages)

## The Three Parsing Strategies

### 1. OpenAI/ChatGPT conversations.json

**Format**: Tree structure. Each conversation has a `mapping` dict where nodes are `{id: {parent, children, message}}`. Root node has `parent=None` but is NOT the string "root" — it's an actual node ID.

**Parsing**: Iterative BFS from the parent=None node. DO NOT use recursion — these trees can be 1000+ nodes deep and hit Python's recursion limit. Extract `message.author.role` and `message.content.parts[]` for text.

**Key code (iterative)**:
```python
def walk_openai(mapping):
    root_id = next(nid for nid, n in mapping.items() if nid != "root" and n.get("parent") is None)
    result = []
    stack = [(root_id, 0)]
    while stack:
        node_id, order = stack.pop()
        node = mapping.get(node_id, {})
        msg = node.get("message")
        if msg:
            role = msg.get("author", {}).get("role", "")
            content = msg.get("content", {})
            text = "".join(str(p) for p in content.get("parts", [])) if isinstance(content, dict) else str(content or "").strip()
            if text: result.append({"role": role, "text": text, "order": order})
        for i, child_id in enumerate(reversed(node.get("children", []))):
            stack.append((child_id, order * 1000 + i))
    result.sort(key=lambda x: x["order"])
    return result
```

### 2. DeepSeek (conversations 2/3).json

**Format**: Different structure — nodes have `{parent, children, message: {model, fragments: [{type, content}]}}`. Type values: `RESPONSE` (assistant), `REQUEST` (user), `THINK` (reasoning), `TOOL_SEARCH`, `SEARCH`, `READ_LINK`. Root node is the string `"root"` itself.

**Parsing**: Iterative BFS from "root" key. Flatten fragments into concatenated RESPONSE/REQUEST strings.

**Key code (iterative)**:
```python
def walk_deepseek(mapping):
    if "root" not in mapping:
        return []
    result = []
    stack = [("root", 0)]
    while stack:
        node_id, order = stack.pop()
        node = mapping.get(node_id, {})
        msg = node.get("message")
        if msg:
            resp_text = req_text = ""
            for frag in msg.get("fragments", []):
                t, c = frag.get("type", ""), frag.get("content", "") or ""
                if t == "RESPONSE": resp_text += c
                elif t == "REQUEST": req_text += c
            resp_text, req_text = resp_text.strip(), req_text.strip()
            if req_text: result.append({"role": "user", "text": req_text, "order": order * 10})
            if resp_text: result.append({"role": "assistant", "text": resp_text, "order": order * 10 + 1})
        for i, child_id in enumerate(reversed(node.get("children", []))):
            stack.append((child_id, order * 1000 + i))
    result.sort(key=lambda x: x["order"])
    return result
```

### 3. Hermes ted_history.db

**Format**: SQLite. Tables: `conversations(id, title, source, create_date, model_slug, message_count, ...)`, `messages(id, conv_id, role, text, timestamp)`. Role is simple: 'assistant' or 'user'.

**Parsing**: Direct SQL query — no tree walking needed.

```python
conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()
cur.execute("""
    SELECT m.text, m.timestamp, m.conv_id, c.title, c.source
    FROM messages m JOIN conversations c ON m.conv_id = c.id
    WHERE m.role = 'assistant' AND length(m.text) > 20
    ORDER BY m.timestamp DESC
""")
# Filter: len(text) 20-2500, skip markdown-only responses
```

## Filtering Rules

- Minimum response length: 20 chars
- Maximum response length: 2500 chars (3000 for OpenAI)
- Skip responses starting with `# ` followed by no newline (document headers)
- Skip responses that are pure system output / empty fragments
- For DeepSeek: RESPONSE fragments only (skip THINK, TOOL_OPEN, etc.)

## Output Format

JSONL with one entry per line:
```json
{"instruction": "context from prior messages", "output": "assistant response", "metadata": {"source": "openai|deepseek|hermes", "conv_title": "...", "platform": "chatgpt|deepseek|hermes", "chars": 1234}}
```

## Known Failure Modes

1. **Recursion depth on OpenAI trees** — use iterative BFS, never recursive walk_messages()
2. **DeepSeek root detection** — root is string "root", NOT a node with parent=None (different from OpenAI)
3. **DeepSeek 0 pairs from wrong root detection** — confirmed: root = "root" key works; parent=None approach finds 0
4. **OpenAI conversations (2/3).json** — these are DeepSeek format, not OpenAI format
5. **File globbing on E: drive** — find command times out; use explicit file paths instead

## Running the Extractor

```bash
cd E:/god folder/02_ACTIVE_PROJECTS/goose-trainer/
python extract_all_convos.py
```

Output: `goose_full_dataset.jsonl` (100MB, ~50k pairs)

## Next Steps After Extraction

1. **Unsloth fine-tuning**: `pip install unsloth` then write QLoRA training script
2. **Base model**: Pull with Ollama — `ollama pull phi3-mini` or `llama3.2:3b`
3. **Training**: Use Unsloth for fast QLoRA on RTX 2060 (6GB VRAM)

## References

- `references/openai-export-format.md` — full OpenAI export schema (if exists, or stub created)
- `references/deepseek-fragments-format.md` — DeepSeek fragment type taxonomy, root detection, parsing code (created May 20 2026)
- `references/training-pipeline-next-steps.md` — next steps for Unsloth QLoRA training on 49,585 pair dataset