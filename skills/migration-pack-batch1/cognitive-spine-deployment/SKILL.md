---
name: cognitive-spine-deployment
description: Boot, verify, and integrate the PURPCLAW cognitive dark cluster — Memory Matrix, Symbolic Rules, Modal Logic, Neuro-Symbolic Bridge, Diagnostics, and AutoDream — in dependency order. One-off individual services OR consolidated cognitive_spine.py.
when_to_use: Waking the cognitive layer, proving integration, or fixing split-brain between JS clients and the Python spine.
purpclaw_wiring: lib/llm-provider.js → cognitive_spine.py :7880
---

# Cognitive Spine Deployment

## Boot order
1. Memory Matrix v2 :7880
2. Symbolic Rules :7787
3. Modal Logic :7785
4. Neuro-Symbolic Bridge :7884
5. Diagnostics :7786
6. AutoDream :7895

## Or consolidated
```bash
python cognitive_spine.py --port 7880
```

## Verify
```bash
curl http://localhost:7880/cognitive/health
```