# OpenAI Conversations Export Format

## Location
`E:/god folder/02_ACTIVE_PROJECTS/chat histroy s open ai 5 years plus deep seek 1 year/conversations.json` (258MB, 1023 convos)

## Structure
```json
{
  "id": "conv-uuid",
  "title": "Conversation Title",
  "create_time": 1234567890.0,
  "update_time": 1234567890.0,
  "mapping": {
    "node-uuid-1": {
      "id": "node-uuid-1",
      "parent": null,  // root node has parent=null
      "children": ["node-uuid-2", "node-uuid-3"],
      "message": {
        "author": { "role": "assistant" | "user" | "system" },
        "content": {
          "parts": ["text content here"],
          "type": "text"
        },
        "create_time": 123.0
      }
    },
    "node-uuid-2": { ... }
  },
  "current_node": "node-uuid-X",
  "default_model_slug": "gpt-4o"
}
```

## Root Node Detection — CRITICAL
- Root node has `parent: null` but is NOT the string "root"
- It's an actual UUID key in the mapping dict
- Correct detection:
```python
root_id = next(
    nid for nid, n in mapping.items()
    if nid != "root" and n.get("parent") is None
)
```
- Wrong approach: `if "root" in mapping` — that key exists but ISN'T the tree root in OpenAI format

## Message Extraction
```python
def extract_text(msg):
    content = msg.get("content", {})
    if isinstance(content, dict):
        parts = content.get("parts", [])
        return "".join(str(p) for p in parts).strip()
    elif isinstance(content, str):
        return content.strip()
    return ""
```

## Iterative BFS (NOT recursive)
```python
def walk_openai(mapping):
    root_id = next(
        (nid for nid, n in mapping.items()
         if nid != "root" and n.get("parent") is None),
        None
    )
    if not root_id: return []
    
    result = []
    stack = [(root_id, 0)]
    while stack:
        node_id, order = stack.pop()
        node = mapping.get(node_id, {})
        msg = node.get("message")
        if msg:
            role = msg.get("author", {}).get("role", "")
            text = extract_text(msg)
            if text:
                result.append({"role": role, "text": text, "order": order})
        for i, child_id in enumerate(reversed(node.get("children", []))):
            stack.append((child_id, order * 1000 + i))
    
    result.sort(key=lambda x: x["order"])
    return result
```

## Why Iterative, Not Recursive
- Tree depth can be 1000+ nodes
- Python recursion limit (~1000) gets hit on deep conversations
- Iterative BFS with explicit stack avoids recursion depth error

## Stats (May 20 2026)
- 1023 conversations
- ~84,204 total messages
- ~40,205 assistant responses (before 20-char filter: 40,205; after filter: ~21,304 pairs)
- Average response length: ~1300 chars