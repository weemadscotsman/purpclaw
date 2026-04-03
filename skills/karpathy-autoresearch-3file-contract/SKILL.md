---
name: karpathy-autoresearch-3file-contract
description: The Karpathy AutoResearch 3-file contract pattern, wired into PURPCLAW. Strict division between the LOCKED data prep, the AGENT-EDITABLE training script, and the EXECUTIVE instructions. Plus the git ratchet that commits on improvement and reverts on regression.
when_to_use: Setting up an autonomous LoRA optimization loop; making train.py safe for an agent to edit; adding a ratchet to a training pipeline
---

# Karpathy AutoResearch 3-File Contract — PURPCLAW

The architecture that makes unsupervised model improvement work. Three files, three roles, zero ambiguity. Adapted from Karpathy's `nanochat` AutoResearch, wired into PURPCLAW's training loop.

## The Three Files

```
E:/training/
├── prepare.py       (216 lines)  LOCKED  — agent NEVER touches this
├── train.py         (272 lines)  EDITABLE — the only file the agent may modify
├── program.md       (116 lines)  INSTRUCTIONS — what the agent reads each iteration
├── data/             train.jsonl + val.jsonl (produced by prepare.py)
├── results.tsv       append-only ledger of every iteration
├── autoresearch.log  tail of every iteration
├── autoresearch.status.json  current best, last iter, etc.
├── lib/autoresearch-orchestrator.js  the loop itself
```

## The Contract

| file | who can edit | what it does |
|---|---|---|
| `prepare.py` | **nobody** (or v2 in a new path) | Tokenize data, split train/val, define the eval metric |
| `train.py` | **agent** (the ratchet) | Run training, emit `FINAL_VAL_LOSS: <num>` on stdout, exit 0/non-zero |
| `program.md` | **you** (human) | Executive instructions, hypothesis queue, baseline metric |

The orchestrator enforces:
- The agent's diff is ONLY on `train.py` (else `CONTRACT_VIOLATION`)
- After training, the ratchet compares `val_loss` to the historic best
- If better: keep the commit, log `SUCCESS`, advance baseline
- If worse or crashed: `git reset --hard HEAD~1`, log `REVERT`/`CRASHED`

## prepare.py — the LOCKED ground truth

```python
# E:/training/prepare.py
# Loads NDJSON trajectories, tokenizes with the base tokenizer,
# splits 90/10, writes JSONL files, defines the eval metric.
#
# If this is wrong, fork to prepare_v2.py — DO NOT EDIT IN PLACE.

import json
from pathlib import Path

DATA_DIR = Path(__file__).parent / "data"
TRAIN_JSONL = DATA_DIR / "train.jsonl"
VAL_JSONL   = DATA_DIR / "val.jsonl"

def load_jsonl(path):
    with open(path) as f:
        return [json.loads(l) for l in f if l.strip()]

def tokenize_and_split(rows, tokenizer, train_frac=0.9, seed=42):
    # Deterministic split — the agent cannot touch this
    import random
    random.Random(seed).shuffle(rows)
    cut = int(len(rows) * train_frac)
    return rows[:cut], rows[cut:]

def compute_metric(rows):
    # Whatever metric you pick. Lower is better.
    # Must be a single number that train.py emits as `FINAL_VAL_LOSS: X`
    return {"val_loss": sum(len(r.get("content", "")) for r in rows) / max(len(rows), 1) / 1000}

if __name__ == "__main__":
    # Self-runnable: refresh data/manifest.json on demand
    rows = load_jsonl(Path(__file__).parent / "raw" / "latest.ndjson")
    train, val = tokenize_and_split(rows)
    TRAIN_JSONL.write_text("\n".join(json.dumps(r) for r in train))
    VAL_JSONL.write_text("\n".join(json.dumps(r) for r in val))
    print(f"train: {len(train)}  val: {len(val)}")
    print(f"Initial val_loss: {compute_metric(val)['val_loss']:.6f}")
```

## train.py — the agent's playground

```python
# E:/training/train.py
# Read top-to-bottom by the agent. The "Active Hypotheses" section
# in program.md is the change surface. Hard requirements below.
#
# Hard requirements (do not break — the orchestrator parses the output):
#   - Print `FINAL_VAL_LOSS: <number>` before exiting.
#   - Exit 0 on success, non-zero on crash.
#   - Self-terminate at 300s with a graceful save.
#
# Use unsloth if available (faster, less VRAM), else peft+trl+bnb.

import argparse, signal, sys, time, json, os
from pathlib import Path

WALL_CLOCK_BUDGET_SEC = 300  # hard 5-min breaker

LORA_R           = 16         # ← agent can change
LORA_ALPHA       = 32         # ← agent can change
LR               = 2e-4       # ← agent can change
EPOCHS           = 1          # ← agent can change
SCHEDULER        = "cosine"   # ← agent can change
TARGET_MODULES   = ["q_proj", "v_proj"]  # ← agent can change

BASE_MODEL = os.environ.get("PURPCLAW_LORA_BASE", "Qwen/Qwen2.5-1.5B-Instruct")
DATA_DIR  = Path(__file__).parent / "data"
TRAIN_JSONL = DATA_DIR / "train.jsonl"
VAL_JSONL   = DATA_DIR / "val.jsonl"

def graceful_exit_handler(signum, frame):
    print(f"\n[WALL_CLOCK] hit {WALL_CLOCK_BUDGET_SEC}s, exiting.")
    sys.exit(0)

def pre_eval(val_rows):
    try:
        from prepare import compute_metric
        return compute_metric(val_rows)["val_loss"]
    except ImportError:
        return 1.0

def emit(s):
    print(s, flush=True)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--r", type=int, default=LORA_R)
    ap.add_argument("--alpha", type=int, default=LORA_ALPHA)
    ap.add_argument("--lr", type=float, default=LR)
    ap.add_argument("--epochs", type=int, default=EPOCHS)
    ap.add_argument("--target", default=",".join(TARGET_MODULES))
    ap.add_argument("--scheduler", default=SCHEDULER)
    ap.add_argument("--max-steps", type=int, default=0)
    args = ap.parse_args()

    # Hard wall-clock breaker — cross-platform
    if hasattr(signal, "SIGALRM"):
        signal.signal(signal.SIGALRM, graceful_exit_handler)
        signal.signal(signal.SIGALRM, graceful_exit_handler)
        signal.alarm(WALL_CLOCK_BUDGET_SEC)
    else:
        # Windows: Timer fires but doesn't kill — orchestrator's
        # spawnSync timeout is the real hard stop there.
        import threading
        threading.Timer(WALL_CLOCK_BUDGET_SEC, lambda: (
            print(f"\n[WALL_CLOCK] hit {WALL_CLOCK_BUDGET_SEC}s (windows timer)"),
            sys.exit(0)
        )).start()

    # Detect training stack
    have_unsloth = have_peft = have_torch = False
    try: import unsloth; have_unsloth = True
    except ImportError: pass
    try: import peft; have_peft = True
    except ImportError: pass
    try: import torch; have_torch = True
    except ImportError: pass

    if not (have_unsloth or (have_peft and have_torch)):
        # Smoke path: returns pre-eval metric + small knob penalty
        # so the ratchet has signal even before GPU is available.
        pre = pre_eval(load_jsonl(VAL_JSONL))
        knob_penalty = (args.r * args.alpha) / 1_000_000.0
        final = round(pre + knob_penalty, 6)
        emit(f"[SMOKE] base={pre}  knob_penalty={knob_penalty}  final={final}")
        emit(f"FINAL_VAL_LOSS: {final}")
        return 0

    # REAL TRAINING
    # (use unsloth if available, else peft+trl+bnb — see scripts/lora-train.py)
    # ... full training loop ...
    emit(f"FINAL_VAL_LOSS: {final_val_loss}")
    return 0

if __name__ == "__main__":
    sys.exit(main() or 0)
```

## program.md — executive instructions

```markdown
# PurpClaw AutoResearch — Master Spec

## Objective
Optimize a LoRA adapter for Qwen2.5-1.5B-Instruct to minimize
validation loss on PURPCLAW tool-use trajectories.

## Metric
Cross-entropy loss on target tokens (assistant responses). Lower = better.
Emitted as `FINAL_VAL_LOSS: <number>` on stdout.

## Constraints
- Do not modify prepare.py. Only edit train.py.
- Every experiment has a hard 5-minute wall-clock timeout.
- VRAM budget: 6GB per GPU (RTX 2060 / GTX 1660).
- If you crash, the ratchet reverts. Don't be afraid to try wild things.

## Current Baseline
- Best val_loss: 0.733461
- Parameters: r=8, alpha=16, target=['q_proj','v_proj'], epochs=1

## Active Hypotheses Queue

```
H001  r=16, alpha=32, lr=2e-4, cosine, target=all-linear, epochs=1
H002  r=32, alpha=64, lr=2e-4, cosine, target=all-linear, epochs=1
H003  r=64, alpha=128, lr=1e-4, cosine, target=all-linear, epochs=1
H004  r=16, alpha=32, lr=3e-4, linear-warmup, target=q,v only, epochs=2
H005  r=16, alpha=32, lr=2e-4, cosine, target=mlp-only (gate,up,down), epochs=1
H006  r=8, alpha=16, lr=5e-4, cosine, target=q,v only, epochs=1
H007  r=16, alpha=32, lr=2e-4, cosine, target=all-linear, epochs=3
H008  Custom: agent proposes based on results.tsv
```

## Strategies to Explore
- Higher LoRA rank with proportional alpha
- Expand target modules to MLP layers
- Different LR schedules (cosine vs constant + warmup)
- Longer epochs vs more steps
- Smaller models (0.5B) for sub-minute iterations
```

## The Loop (`lib/autoresearch-orchestrator.js`)

```js
function oneIteration(iterNum) {
  const hypothesis = nextHypothesis(iterNum);
  // 1. Apply hypothesis to train.py
  applyHypothesisToTrainPy(hypothesis);
  // 2. Commit (ratchet pre-state)
  const beforeCommit = gitCurrentShort();
  gitCommit(`autoresearch: iter ${iterNum} — ${hypothesis.slice(0, 80)}`, ['train.py']);
  // 3. Run training (with 5-min hard timeout via spawnSync)
  const { status, valLoss } = runTrainingOnce();
  // 4. Ratchet
  const best = getBestValidationLoss();
  const won = status === 'SUCCESS' && valLoss < best;
  if (won) {
    recordRow(hypothesis, 'SUCCESS', valLoss, gitCurrentShort());
  } else {
    gitReset(); // back to baseline
    recordRow(hypothesis, 'REVERT', valLoss, beforeCommit);
  }
}
```

## The Ratchet

```
for each hypothesis in queue:
  modify train.py
  git commit -m "iter N: <hyp>"
  run train.py
  parse FINAL_VAL_LOSS
  if valLoss < best:
    keep commit, log SUCCESS, advance best
  else:
    git reset --hard HEAD~1
    log REVERT
```

## Pitfalls

- **Use the right Python** — the orchestrator's `python` may not have peft. Set `PURPCLAW_PYTHON_BIN=C:/Users/Admin/AppData/Local/Programs/Python/Python311/python.exe` so it uses the system Python that has peft+trl+bnb. Without this, the smoke path runs every time. (The orchestrator also auto-detects: if `PURPCLAW_PYTHON_BIN` isn't set, it falls back to the system Python at `C:/Users/Admin/AppData/Local/Programs/Python/Python311/python.exe`, then to whatever's on PATH.)
- **Contract check is strict** — any uncommitted file in the working dir other than train.py will fail the contract. Clean `autoresearch.log`, `lora-*.log`, stray adapter dirs before running. Or, more robust, change the check to only look at `git diff --name-only HEAD~1 -- train.py`.
- **Signal.SIGALRM doesn't work on Windows** — train.py falls back to `threading.Timer` which doesn't actually kill the process. The orchestrator's `spawnSync(timeout: 315s)` is the real hard stop.
- **Smoke path returns deterministic val_loss** — the ratchet correctly identifies "no improvement" and reverts. The smoke is for testing the loop, not for finding better weights.
- **GPU is shared with other PM2 services** — kill any other GPU consumers (e.g. lora-train.py running in another process) before launching the ratchet.
- **Windows CRLF poisons TSV parsing.** When the orchestrator writes `results.tsv` from a Node `fs.appendFileSync` on Windows, the OS uses `\r\n` line endings. A naive `data.split('\n')` leaves a trailing `\r` on each status field (e.g. `c[4] === 'SUCCESS\r'`). The filter `c[4] === 'SUCCESS'` then matches nothing, the historic-best reader returns `Infinity`, and the ratchet thinks "no best yet" — every iteration reverts, the loop never improves. **Fix**: parse TSV with a CRLF-aware split AND strip trailing `\r` from each cell. Two patterns that both work:
   ```js
   // Option A: explicit \r stripping
   const data = raw.split(/\r?\n/);
   const valid = data.slice(1)
     .map(line => line.split('\t').map(c => c.replace(/\r/g, '').trim()))
     .filter(c => c[4] === 'SUCCESS' && ...);
   ```
   ```js
   // Option B: character codes (avoids the patch tool mangling
   // \r\n in a regex literal — see sse-streaming-pattern pitfall #13)
   const LF = String.fromCharCode(10);
   const CR = String.fromCharCode(13);
   const stripCR = new RegExp(CR, 'g');
   const data = raw.split(LF);
   const valid = data.slice(1)
     .map(line => line.split('\t').map(c => c.replace(stripCR, '').trim()))
     .filter(c => c[4] === 'SUCCESS' && ...);
   ```
   Without the CRLF fix, the ratchet silently does nothing useful — the iteration log shows everything "running" but `results.tsv` never updates past the initial baseline.
- **`getBestValidationLoss` must read the historic best, not the current run.** The function reads `results.tsv` and finds the minimum val_loss across all `SUCCESS` rows. If you skip this and use a single in-memory variable, the ratchet loses its memory after each iteration. Use the file as the source of truth.
- **Replacing the orchestrator file wholesale loses functions.** When you rewrite `lib/autoresearch-orchestrator.js`, double-check that `shouldStop`, `oneIteration`, `runTrainingOnce`, `applyHypothesisToTrainPy`, `recordRow`, `enforceTrainOnlyContract`, and `writeStatus` are all present. A 200-line orchestrator missing any of these throws `ReferenceError` at runtime. Verify with `node -c file.js` AND with `run-once` after deploying.

## Verification

```bash
# Verify the loop end-to-end
cd E:/training
git status        # clean
PURPCLAW_PYTHON_BIN=C:/Users/Admin/AppData/Local/Programs/Python/Python311/python.exe \
  node lib/autoresearch-orchestrator.js run-once

# Should produce a results.tsv entry with:
# - real commit_hash (b081c45, not 'no-commit')
# - val_loss from the smoke path
# - status: SUCCESS or REVERT
# - git log shows new commit (or reverts via reset --hard)

# Then loop unattended
node lib/autoresearch-orchestrator.js loop 50
```

## Where It's Already Wired

- `E:/training/prepare.py` — locked, runs `python prepare.py`
- `E:/training/train.py` — editable, runs `python train.py`
- `E:/training/program.md` — executive instructions, hypothesis queue
- `E:/training/lib/autoresearch-orchestrator.js` — the ratchet (377 lines)
- `E:/training/results.tsv` — append-only ledger
- `E:/training/autoresearch.status.json` — current state
- `E:/training/autoresearch.log` — tail-able iteration log
- `E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/lib/commands/autoresearch.js` — CLI wrapper
- `E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/scripts/lora-train.py` — full peft+trl+bnb pipeline (referenced from train.py)
