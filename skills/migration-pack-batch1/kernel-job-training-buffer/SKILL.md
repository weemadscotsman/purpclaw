---
name: kernel-job-training-buffer
description: Wire a kernel-based runtime so every completed job is recorded as a training trajectory and exported in LoRA-ready formats.
when_to_use: Training a local LLM on runtime output, building a training dataset from agent work.
purpclaw_wiring: lib/training-buffer.js, lib/api-harness-kernel.js
---

# Training Buffer

Every job auto-recorded to E:/training/raw/YYYY-MM-DD.ndjson.
```bash
purpclaw training status
purpclaw training export chatml
```