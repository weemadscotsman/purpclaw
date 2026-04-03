# AutoResearch Three-File Pattern (Karpathy's ratchet)

When you want a self-improving local LLM training loop — agent proposes
code edits to a training script, runs a fixed-time training window,
measures a precise validation score, and either locks the improvement
or `git reset --hard` to the baseline — use this pattern. Adapted from
Andrej Karpathy's AutoResearch for the PURPCLAW stack.

## The three files

All three live at the root of the training dir (default: `E:/training/`).

### 1. `program.md` — the master spec

This is the conversation between you and the agent. Lists:
- **Objective** — what the model should optimize
- **Success metric** — the exact `val_loss` formula (cross-entropy +
  format/length/refusal penalties, see `prepare.py::compute_metric`)
- **Current best baseline** — read from `results.tsv` at the start of
  every loop iteration
- **Core constraints** (NEVER BREAK):
  1. 5-minute wall-clock budget per iteration (hard breaker)
  2. `prepare.py` is **immutable** — the agent edits `train.py` only
  3. 8-bit or 16-bit precision only (no FP32, no FP64)
  4. LoRA only (no full fine-tuning)
  5. Reproducibility (seed all RNGs at the top of `train.py`)
- **Active hypotheses queue** — `H001` through `H008+` with explicit
  knob configs the agent tries in order. The agent appends new
  hypotheses based on `results.tsv` findings.
- **Stop conditions** — hard stop (12h or 50 iters), soft stop
  (5 consecutive failures)

### 2. `prepare.py` — the immutable judge

Locked. Defines:
- Where the data comes from (latest ShareGPT export in `E:/training/exports/`)
- Tokenization (cheap regex-based by default; swap to `transformers.AutoTokenizer` if installed)
- 90/10 train/val split with deterministic seed
- `data/manifest.json` with the val_loss at the time of prep
- `compute_metric(val_rows)` with format/length/refusal penalties:
  ```python
  LAMBDA_FORMAT  = 0.5   # tool-call format errors
  LAMBDA_LENGTH  = 0.2   # over-length replies (>500 words)
  LAMBDA_REFUSAL = 0.3   # false refusals ("I cannot", "I'm sorry", etc.)
  val_loss = 0.3 + 0.7 * union_err_rate + (
      LAMBDA_FORMAT  * format_errs  / n +
      LAMBDA_LENGTH  * length_errs  / n +
      LAMBDA_REFUSAL * refusal_errs / n
  )
  ```

### 3. `train.py` — the agent's playground

Top-of-file knobs the agent edits:
```python
LORA_R           = 16
LORA_ALPHA       = 32
LORA_DROPOUT     = 0.05
LR               = 2e-4
EPOCHS           = 1
WARMUP_RATIO     = 0.03
WEIGHT_DECAY     = 0.0
OPTIMIZER        = "adamw_8bit"
SCHEDULER        = "cosine"   # 'cosine' | 'linear'
TARGET_MODULES   = ["q_proj","v_proj","k_proj","o_proj","gate_proj","up_proj","down_proj"]
MAX_SEQ_LEN      = 2048
BATCH_SIZE       = 4
GRAD_ACCUM       = 4
BASE_MODEL       = "Qwen/Qwen2.5-1.5B-Instruct"
WALL_CLOCK_BUDGET_SEC = 300
```

**The training path:** unsloth preferred → peft + bitsandbytes fallback.

**The smoke path** (no unsloth/peft/torch installed): applies a
knob-aware penalty to the pre-eval val_loss so different hypotheses
produce different scores and the ratchet has signal:
```python
pre = pre_eval(val_rows)
knob_penalty = (args.r * args.alpha) / 1_000_000
final = round(pre + knob_penalty, 6)
print(f"FINAL_VAL_LOSS: {final}")
os._exit(0)  # force exit so the background Timer doesn't keep the process alive
```

**Cross-platform wall-clock breaker:**
```python
deadline = __import__("threading").Event()
if hasattr(signal, "SIGALRM"):
    signal.signal(signal.SIGALRM, graceful_exit_handler)
    signal.alarm(WALL_CLOCK_BUDGET_SEC)
else:
    import threading
    threading.Timer(WALL_CLOCK_BUDGET_SEC, lambda: (deadline.set(), print("hit deadline"))).start()
```

The orchestrator parses `FINAL_VAL_LOSS: <num>` from stdout. If the
marker is missing, the run is treated as `CRASHED` (no best, just
revert). If the marker is present, the number is the val_loss.

## The orchestrator (`lib/autoresearch-orchestrator.js`)

The ratchet loop. Lives at `E:/training/lib/autoresearch-orchestrator.js`.

```js
function oneIteration(iterNum) {
  const hypothesis = nextHypothesis(iterNum);  // from program.md queue
  maybeInvokeAgent(hypothesis);                // optional: spawn a coding agent
  applyHypothesisToTrainPy(hypothesis);        // direct rewrite if no agent
  const commit = gitCurrentShort();
  gitCommit(`autoresearch: iter ${iterNum}`);
  const { status, valLoss } = runTrainingOnce();
  const best = getBestValidationLoss();
  if (status === 'SUCCESS' && valLoss < best) {
    log('🏆 NEW BEST — locking commit');
    recordRow(hypothesis, 'SUCCESS', valLoss, commit);
  } else {
    log('no improvement — reverting');
    try { gitCmd('reset --hard HEAD~1'); }
    catch { try { gitCmd('checkout -- .'); } catch {} }  // first-commit fallback
    recordRow(hypothesis, status === 'SUCCESS' ? 'REVERT' : status, valLoss, commit);
  }
}
```

**Run modes:**
- `node autoresearch-orchestrator.js run-once` — one iteration
- `node autoresearch-orchestrator.js loop [N]` — N iterations or until STOP marker
- `node autoresearch-orchestrator.js status` — show current baseline + recent results
- `node autoresearch-orchestrator.js reset` — wipe results, revert all

**Soft stops:** 5 consecutive crashes/failures → write `PAUSE` marker. Hard stops: 12h wall-clock, 50 iters, or `STOP` marker.

**Git ratchet caveat:** `git reset --hard HEAD~1` fails on the first commit (no parent). Fall back to `git checkout -- .` to clean the working tree.

## The CLI (`lib/commands/autoresearch.js`)

Wired into `purpclaw autoresearch`:
```
purpclaw autoresearch status
purpclaw autoresearch run-once
purpclaw autoresearch loop [N]
purpclaw autoresearch prepare     # run prepare.py
purpclaw autoresearch queue        # show curated hypotheses
purpclaw autoresearch reset        # wipe results, revert all
purpclaw autoresearch stop         # write STOP marker
purpclaw autoresearch resume       # clear STOP/PAUSE
purpclaw autoresearch logs [N=40]  # tail autoresearch.log
```

## Wiring to an AI coding agent

Set `PURPCLAW_AUTORESEARCH_AGENT=claude-code` (or `aider`, `cursor-cli`,
your own orchestrator). The orchestrator will shell out to it:

```js
const agent = process.env.PURPCLAW_AUTORESEARCH_AGENT;
execSync(`${agent} --non-interactive --prompt "Read ${PROGRAM_MD} then edit ${TRAIN_PY} to test this hypothesis: ${hypothesis}"`, {
  stdio: 'inherit', timeout: 180_000,
});
```

The agent must respect the constraints in `program.md` (5-min budget,
no `prepare.py` edit, 8-bit precision, LoRA only). It edits `train.py`
and the orchestrator commits.

## The curated queue (default H001–H008)

```
H001  r=16, alpha=32, lr=2e-4, cosine, target=all-linear, epochs=1
H002  r=32, alpha=64, lr=2e-4, cosine, target=all-linear, epochs=1
H003  r=64, alpha=128, lr=1e-4, cosine, target=all-linear, epochs=1
H004  r=16, alpha=32, lr=3e-4, linear-warmup, target=q,v only, epochs=2
H005  r=16, alpha=32, lr=2e-4, cosine, target=mlp-only (gate,up,down), epochs=1
H006  r=8,  alpha=16, lr=5e-4, cosine, target=q,v only, epochs=1   ← smaller wins
H007  r=16, alpha=32, lr=2e-4, cosine, target=all-linear, epochs=3   ← longer
H008  Custom: agent proposes based on results.tsv
```

Edit `program.md` to add new hypotheses (H009+). The agent will pick up
the next H0NN not yet tried.

## What the ratchet tells you after a real run

After 50 iterations of a real LoRA training run, `results.tsv` shows:
- which knob config won (the `SUCCESS` row with the lowest val_loss)
- which hypotheses lost (any bigger LoRA tied or lost → REVERT)
- the time-per-iteration cost (the orchestrator writes `elapsed` per row — track this for GPU-hour budgeting)
- the cumulative improvement curve (val_loss over time is a downward staircase)

The best commit's adapter lives in `E:/training/adapters/iter-*/` ready
to merge into Ollama.

## Setup checklist (the first time)

1. `cd E:/training && git init -b main && git config user.email purpclaw@local && git config user.name "PurpClaw AutoResearch"`
2. Write `program.md` (copy the umbrella template, edit the queue)
3. Write `prepare.py` (immutable, copy from the umbrella)
4. Write `train.py` (the agent's playground, copy from the umbrella)
5. Write `lib/autoresearch-orchestrator.js` (the ratchet)
6. `pip install unsloth peft bitsandbytes torch` (in a venv with CUDA, for real training)
7. Wire into `bin/purpclaw.js` as `autoresearch` command
8. First dry-run: `purpclaw autoresearch prepare && purpclaw autoresearch run-once` (smoke path, <1s)
9. Real run: `purpclaw autoresearch loop 50 &` and let it cook overnight
10. Morning: `purpclaw autoresearch status` → see the winner
