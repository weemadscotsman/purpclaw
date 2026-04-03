# autoDream integration — feeding curated memory into the local LLM

**The missing piece** in a "self-training" runtime is the link between
**memory consolidation** (autoDream) and **LLM fine-tuning** (Unsloth/axolotl).

This file documents how to wire them.

---

## What autoDream produces

`autoDream.py` is the runtime's memory consolidator. It runs on a cron
(every 30 min) and produces:

- **Deduplication** — collapses 5,000 raw memory entries into
  non-redundant ones
- **Rule extraction** — pulls out "if X then Y" patterns from the
  history
- **Memory archival** — moves old entries from hot to cold storage
- **Knowledge base rebuild** — produces a clean, queryable knowledge
  base from the consolidated history

The output of `autoDream --once` is:

```
E:/training/autoDream/
├── consolidated_memories.json    (deduped memory entries)
├── extracted_rules.json          (the "if X then Y" rules)
├── knowledge_base.json          (the queryable KB)
└── archive/
    └── YYYY-MM-DD-old-memories.json
```

---

## Why this is your model's "system prompt on steroids"

When you fine-tune a local LLM on the runtime's job output, the model
learns the *behavior* (how to respond to a kernel job). But it doesn't
know the *facts* about the operator's preferences, the operator's
projects, the runtime's quirks, or the rules the system has
discovered.

autoDream's output is exactly that knowledge. Without it, your local
LLM is a smart generalist that's been fine-tuned to talk like the
runtime. With it, your local LLM is the runtime's *expert* — it knows
the operator's stack, the rules, the patterns.

The integration:

```python
# 1. autoDream runs on schedule, produces the curated artifacts
python autoDream.py --once
# → E:/training/autoDream/extracted_rules.json

# 2. The system prompt for the local LLM is built from those artifacts
SYSTEM_PROMPT = f"""You are Purpclaw Mission Control.

# Curated rules extracted from runtime history:
{open('E:/training/autoDream/extracted_rules.json').read()}

# Knowledge base (consolidated memories):
{open('E:/training/autoDream/knowledge_base.json').read()}

Be terse, accurate, and report outcomes concretely.
"""
```

Now the local LLM is loaded with the actual accumulated wisdom of the
runtime. The fine-tune gets it the behavior; autoDream gets it the
facts. Together: a runtime that *knows itself*.

---

## The cron — running autoDream + training buffer export together

The shape:

```cron
# /etc/cron.d/purpclaw-train
# Nightly at 2 AM:
#   1. Run autoDream to consolidate the last 24h
#   2. Export yesterday's trajectories to a fresh ChatML file
#   3. Append the consolidated memories + rules to the system prompt
#   4. (Outside this skill's scope) kick off the fine-tune job

0 2 * * *  cd /e/god\ folder/02_ACTIVE_PROJECTS/PURPCLAW && \
  python autoDream.py --once && \
  node bin/purpclaw.js training export chatml --since=$(date -d 'yesterday' +%Y-%m-%d) && \
  /usr/local/bin/unsloth-train --dataset E:/training/exports/baseline-$(date +%Y-%m-%d).chatml.jsonl --output E:/models/purpclaw-lora
```

The fine-tune step is the only piece that needs an actual GPU. The
rest runs in seconds.

---

## The reward signal beyond job state

Job state gives you a coarse reward (1.0 / 0.0 / 0.5). For RLHF-grade
preference data, you need a finer signal. Three PURPCLAW services
can compute it:

### `memory_matrix_v2.counterfactual`

"What if we hadn't recorded this memory?" If the answer is "we'd forget
something important," that's a positive signal for the trajectory that
recorded it. If the answer is "we'd be fine," the trajectory was
neutral — drop it from the training set.

```python
# From memory_matrix_v2
from memory_matrix_v2 import counterfactual
result = counterfactual.what_if_forgotten(memory_id)
# Returns: { 'importance': 0.0-1.0, 'would_lose': <list of facts> }
```

### `symbolic_rules_engine.check_constraints`

"Did the model's output violate a hard rule?" If yes, that's a
negative example. If no, the trajectory can be promoted to a
preference pair with a rule-violating variant.

```python
# From symbolic_rules_engine
from symbolic_rules_engine import check_constraints
result = check_constraints(trajectory['output'])
# Returns: { 'violated': [...], 'satisfied': [...] }
```

### `modal_logic_engine.query_knowledge`

"Did the model *know* a fact it should have used?" If the model
answered without invoking a known fact, that's a hallucination
candidate — demote it.

```python
# From modal_logic_engine
from modal_logic_engine import query_knowledge
result = query_knowledge(question, available_facts)
# Returns: { 'knew': <bool>, 'should_have_used': <list>, 'did_use': <list> }
```

Each of these three services can produce a per-trajectory reward
score. Sum the scores for a fine-grained ranking; use the top
quartile as preference positives, the bottom quartile as negatives.
This is the DPO upgrade path: same buffer, richer reward, same
export format.

---

## The file that doesn't exist yet (the autoDream prompt-builder)

There's no `autoDream --export-system-prompt` yet. It's a 50-line
script that:

1. Reads `E:/training/autoDream/extracted_rules.json`
2. Reads `E:/training/autoDream/knowledge_base.json`
3. Reads `E:/training/autoDream/consolidated_memories.json` (top 50 by
   importance)
4. Concatenates them into a single system prompt
5. Writes `E:/training/system_prompt.md`

Then the local LLM loads that file at boot:

```python
# In your Modelfile or boot script
SYSTEM_PROMPT = open('E:/training/system_prompt.md').read()
```

This file is the bridge. It turns the runtime's *accumulated
experience* into something the model can read on first load.

Worth building once the buffer is feeding real data and the local
LLM is up. Out of scope for this skill — it's a 50-line `autoDream`
addition, not a kernel concern.

---

## One-liner to summarize the whole integration

> **`autoDream` writes the model's world knowledge. The kernel writes
> the model's behavior. The buffer turns the behavior into LoRA data.
> Together, you get a model that acts like the runtime *and* knows what
> the runtime knows.**

That's the self-training loop in one paragraph. Everything else is
mechanics.
