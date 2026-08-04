# 13 — DSPy

**Tier:** 3 (Specialized)  
**Vendor:** Stanford NLP  
**License:** Apache 2.0  
**Initial release:** 2023  
**Last major update:** 2025 (DSPy 3.0, MIPROv2 optimizer)

---

## What it is
Declarative LM programming framework. Instead of writing prompts, you declare **signatures** (input/output schema) and **modules** (chain-of-thought, ReAct, etc.). DSPy then **optimizes** the prompts automatically using examples and a metric (MIPROv2, BootstrapFewShot).

## Core capabilities
- [x] Declarative signatures (input → output)
- [x] Built-in modules (CoT, ReAct, MultiChain)
- [x] Automatic prompt optimization (teleprompters)
- [x] MIPROv2 (state-of-the-art optimizer)
- [x] BootstrapFewShot, BootstrapFinetune
- [x] Assertions and refinement
- [x] Multi-model (any LM)
- [x] Integrates with LangChain, LlamaIndex
- [x] Tracking & caching
- [x] DSPy programs compile to optimized prompts

## Architecture
```python
class MySig(dspy.Signature):
    question: str -> answer: str

class MyAgent(dspy.Module):
    def __init__(self):
        super().__init__()
        self.cot = dspy.ChainOfThought(MySig)
    def forward(self, question):
        return self.cot(question=question)

optimizer = dspy.MIPROv2(metric=my_metric)
optimized = optimizer.compile(MyAgent(), trainset=examples)
```

## Strengths
- Compilable, optimizable prompts
- Research-backed (Stanford)
- Works with any LM
- Production reliability via optimization

## Weaknesses
- Not an agent framework per se (more a programming model)
- Optimization needs labeled data
- Steeper conceptual learning curve
- Less hand-holding than LangChain

## Best use case
Production systems where prompt quality matters, optimization improves outcomes, or you have evaluation data. Pairs with other agent frameworks.

## PURPCLAW fit: 7/10
- Excellent for optimizing PURPCLAW's prompt templates
- Use as optimization layer, not orchestrator
- Pair with LangGraph for full system

## Integration sketch
```python
import dspy

class RouteSig(dspy.Signature):
    user_intent: str -> agent_name: str

router = dspy.ChainOfThought(RouteSig)
result = router(user_intent="audit swarm")  # → "ROBOT"
```

## Sources
- https://github.com/stanfordnlp/dspy
- https://dspy.ai/
- DSPy papers (NeurIPS 2023-2025)
