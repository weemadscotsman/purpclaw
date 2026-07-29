---
**SUPERSEDED:** This document is retained for historical reference only. The sole authoritative parity roadmap is [`docs/parity/CANONICAL_PARITY_PRIORITY.md`](../CANONICAL_PARITY_PRIORITY.md). Do not use this file to define current scope, completion, priorities, or parity status.
---

# SPEC-011: Vision Lane

**Spec version:** 1.0.0
**Date:** 2026-07-20
**Steering vNext item:** S11
**Source:** Codex

## Purpose

A dedicated lane for vision-capable models to process images, screenshots, and UI state. Vision tasks are routed to providers with vision capability, with structured output that feeds back into the agent loop.

## Vision Routing

```javascript
{
  vision: {
    providers: ['openai', 'anthropic'],
    models: ['gpt-4o', 'claude-3-5-sonnet-20241022'],
    max_image_size: '10MB',
    timeout_ms: 30_000
  }
}
```

## Current State

PURPCLAW has no dedicated vision lane. Image inputs are passed through the standard LLM provider which may not support them. `lib/tool-runtime.js` has no image-specific tool handling.

## Target API

```javascript
// Submit image for analysis
vision.analyze({ image, prompt, model? });

// Submit screenshot for UI inspection
vision.screenshot({ prompt });

// Get vision analysis result
vision.result(task_id); // → { description, findings, coordinates }
```

## Probe

```
1. Submit screenshot of browser → assert: structured description returned
2. Submit image with UI elements → assert: coordinates of key elements returned
3. Use vision model → assert: non-vision model not used for image input
4. Large image (>10MB) → assert: rejected with size error
5. Provider outage → assert: fallback to secondary vision provider
```

## Open Questions

- [ ] What is the structured output schema for UI inspection?
- [ ] Does vision lane support multi-image comparison?
- [ ] Is there a streaming mode for real-time screen analysis?
