#!/usr/bin/env python3
"""
PURPCLAW LoRA candidate evaluation gate (Phase E, step 1).

A freshly trained adapter is a CANDIDATE, not the live model. Before it can be
activated it must PASS this eval. We load the merged candidate, run a held-out
set of probe prompts, and score the responses for basic health:

  - non-empty                 (a model that emits nothing is broken)
  - non-degenerate            (no pathological token/loop repetition)
  - reasonable length         (not one-word collapses)
  - instruction-followed      (responds to the probe, not silence)

Output: a single JSON object on stdout -> { "pass": bool, "score": float, ... }
so the Node handshake (lib/training/adapter-gate.js) can parse it directly.

Exit codes: 0 = eval ran (see JSON for pass/fail), 3 = no CUDA (paused),
2 = candidate not found / load error.

This is deliberately a HEALTH gate, not a benchmark — it catches the common
ways a 6GB QLoRA run produces a broken adapter (collapse, repetition, empty).
A richer task-accuracy eval can layer on top later.
"""
import argparse
import json
import os
import sys
from pathlib import Path

# Windows console is cp1252 — keep stdout clean for JSON, send logs to stderr.
try:
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass


def elog(*a):
    print(*a, file=sys.stderr, flush=True)


# Held-out probe prompts. Kept generic so they work for any persona/base.
DEFAULT_PROBES = [
    "In one sentence, what does PURPCLAW do?",
    "List three things to check when a service won't start.",
    "Write a one-line shell command to show listening ports.",
    "Explain what a LoRA adapter is, briefly.",
    "A user says 'it's broken'. What is your first question back?",
]


def degeneration_ratio(text):
    """Fraction of repeated adjacent tokens — high = pathological repetition."""
    toks = text.split()
    if len(toks) < 4:
        return 0.0
    repeats = sum(1 for i in range(1, len(toks)) if toks[i] == toks[i - 1])
    return repeats / len(toks)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--merged", required=True, help="path to merged candidate model dir")
    p.add_argument("--min-score", type=float, default=0.6, help="pass threshold (0..1)")
    p.add_argument("--max-new-tokens", type=int, default=96)
    args = p.parse_args()

    merged = Path(args.merged)
    if not merged.exists():
        print(json.dumps({"pass": False, "score": 0.0, "error": f"candidate not found: {merged}"}))
        sys.exit(2)

    import torch
    if not torch.cuda.is_available():
        elog("BLOCKER: no CUDA GPU visible — eval needs to load the model on GPU.")
        print(json.dumps({"pass": False, "score": 0.0, "blocked": "no-cuda",
                          "error": "no CUDA torch build — eval paused, candidate left pending"}))
        sys.exit(3)

    from transformers import AutoModelForCausalLM, AutoTokenizer

    elog(f"loading candidate: {merged}")
    tok = AutoTokenizer.from_pretrained(str(merged), trust_remote_code=True)
    model = AutoModelForCausalLM.from_pretrained(
        str(merged), torch_dtype=torch.float16, device_map="auto", trust_remote_code=True,
    )
    model.eval()

    results = []
    passed = 0
    for probe in DEFAULT_PROBES:
        msgs = [{"role": "user", "content": probe}]
        try:
            inputs = tok.apply_chat_template(msgs, add_generation_prompt=True, return_tensors="pt").to(model.device)
        except Exception:
            inputs = tok(probe, return_tensors="pt").input_ids.to(model.device)
        with torch.no_grad():
            out = model.generate(inputs, max_new_tokens=args.max_new_tokens, do_sample=False,
                                 pad_token_id=tok.pad_token_id or tok.eos_token_id)
        text = tok.decode(out[0][inputs.shape[1]:], skip_special_tokens=True).strip()

        non_empty = len(text) > 0
        words = len(text.split())
        reasonable_len = words >= 3
        degen = degeneration_ratio(text)
        healthy = non_empty and reasonable_len and degen < 0.5
        if healthy:
            passed += 1
        results.append({"probe": probe[:48], "words": words, "degen": round(degen, 3), "ok": healthy})
        elog(f"  probe ok={healthy} words={words} degen={degen:.2f} :: {text[:60]!r}")

    score = passed / len(DEFAULT_PROBES)
    verdict = {
        "pass": score >= args.min_score,
        "score": round(score, 3),
        "n": len(DEFAULT_PROBES),
        "passed": passed,
        "min_score": args.min_score,
        "probes": results,
    }
    print(json.dumps(verdict))
    sys.exit(0)


if __name__ == "__main__":
    main()
