# DeepSeek Fragment Format — Conversation Export

## Location
`E:/god folder/02_ACTIVE_PROJECTS/chat histroy s open ai 5 years plus deep seek 1 year/conversations (2).json` (120 convos, ~4700 assistant responses)
`E:/god folder/02_ACTIVE_PROJECTS/chat histroy s open ai 5 years plus deep seek 1 year/conversations (3).json` (71 convos, ~1000 assistant responses)

## Structure
```json
{
  "id": "uuid",
  "title": "conversation title",
  "inserted_at": "timestamp",
  "updated_at": "timestamp",
  "mapping": {
    "root": { "id": "root", "parent": null, "children": ["3"], "message": null },
    "3": { "id": "3", "parent": "root", "children": ["4"], "message": { ... } },
    ...
  }
}
```

## Message Object
```json
{
  "model": "deepseek-reasoner",
  "files": [],
  "fragments": [
    { "type": "REQUEST", "content": "user input text" },
    { "type": "RESPONSE", "content": "assistant output text" },
    { "type": "THINK", "content": "reasoning chain" },
    { "type": "TOOL_SEARCH", "content": "search query" },
    { "type": "SEARCH", "content": "search results" },
    { "type": "TOOL_OPEN", "content": "tool result" },
    { "type": "READ_LINK", "content": "link content" },
    { "type": "TOOL_FIND", "content": "find result" }
  ]
}
```

## Fragment Type Taxonomy
| Type | Role | Count in (2).json | Use for training |
|------|------|-------------------|-------------------|
| `RESPONSE` | assistant | 4,714 | YES — assistant output |
| `REQUEST` | user | 4,655 | YES — user input |
| `THINK` | reasoning | 1,692 | NO — internal chain of thought |
| `TOOL_SEARCH` | search tool | 441 | NO — system artifact |
| `SEARCH` | search results | 308 | NO — tool output |
| `TOOL_OPEN` | tool result | 537 | NO — system artifact |
| `READ_LINK` | link content | 144 | NO — system artifact |
| `TOOL_FIND` | find tool | 21 | NO — system artifact |

## Root Node Detection — CRITICAL DIFFERENCE from OpenAI
- **Root is the string `"root"`** — NOT a dict with `parent=None`
- OpenAI uses `parent=None` on an actual node ID
- DeepSeek uses `"root"` as the key name
- Wrong approach: iterate mapping to find node where `parent is None`
- Correct approach: `if "root" in mapping:` then walk from `"root"`

## Parsing — Iterative BFS from "root"
```python
def walk_deepseek(mapping):
    if "root" not in mapping:
        return []
    result = []
    stack = [("root", 0)]
    while stack:
        node_id, order = stack.pop()
        node = mapping[node_id]
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

## Why RESPONSE count > assistant count
Some `RESPONSE` fragments are very short (<20 chars) — filtered out during dataset building. True assistant pair count after filtering: ~2,793 from both files combined.