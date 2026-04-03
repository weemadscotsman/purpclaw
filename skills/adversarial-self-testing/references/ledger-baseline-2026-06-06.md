# Reliability Ledger — Full-Stack Campaign (2026-06-06)

> Cumulative results after a full-stack adversarial test: 204 attacks across 4 packs against live services.

## Final Numbers

```
Total attacks: 204
Detected:      144  (71%)
Repaired:      62   (30%)
```

## By Technique

| Technique | Attacks | Detect | Repair | Notes |
|---|---|---|---|---|
| refusal | 37 | 100% | 100% | Perfect |
| hallucinate | 25 | 100% | 100% | Perfect |
| truncate | 25 | 100% | 0% | Detected but cannot auto-repair (no source) |
| null_output | 45 | 100% | 0% | Empty responses detected, no content to restore |
| slow_leak | 12 | 100% | 0% | Memory pressure detected, but `_memory_pressure` flag not set by attack |
| delay | 20 | 0% | 0% | BLIND — `_injected_delay_ms` not on plain text targets |
| reorder | 20 | 0% | 0% | BLIND — needs code-like variable/function declarations |
| swap_args | 20 | 0% | 0% | BLIND — needs `src`/`dst` semantic hints |

## By Pack

| Pack | Attacks | Detect | Repair |
|---|---|---|---|
| Output | 80+ | 100% | 50% |
| Memory | 30+ | 0% | 0% |
| Agent | 30+ | 38% | 0% |
| Provider | 30+ | 100% | 38% |

## Live Service Operations

All passed during adversarial testing:
- ✅ rules engine: assert + query
- ✅ modal logic: epistemic/know
- ✅ neuro-symbolic: lift/anomaly
- ✅ diagnostics: event logging
- ✅ memory: ingest (adversarial data accepted — no crash)

## Three Blind Spots

1. **Reorder (0% detect):** Neo detects reorder by scanning for variable/function declarations used-before-declared. The campaign feeds plain text, not code. Fix: use `{ content: 'const api = new API(); function deploy() { return api.start(); }' }` — something with a function call before its declaration.

2. **Swap_args (0% detect):** Neo checks if `src` contains `backup`/`output`/`dist` and `dst` contains `src`/`input`/`main`. The campaign feeds `{ content: 'swap test' }` with no args object. Fix: use `{ args: { src: 'backup.zip', dst: 'src/index.js' } }`.

3. **Delay (0% detect):** Smith injects `_injected_delay_ms` on the output object. Neo detects it there. The campaign test uses plain text `{ content: '...' }` so the flag doesn't appear. Fix: attacks need to be on structured objects, not strings.
