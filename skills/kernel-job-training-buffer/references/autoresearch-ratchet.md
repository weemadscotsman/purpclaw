# AutoResearch ratchet — closing the loop from buffer to local LLM

**Recorded:** 2026-06-05
**Where:** `E:/training/`
**Pattern:** Karpathy's AutoResearch — coding-agent proposes edits to `train.py`, runs a fixed-time training window, measures the validation score, reverts if regressed. Iterate indefinitely; git is the ratchet.

This file documents the concrete three-file + one-orchestrator structure that turns the buffer's exports into a self-improving loop. The buffer captures trajectories; the loop turns them into weight updates. Same export format, same disk layout — just adds the training half.

---

## The three-file contract

```
E:/training/
├── program.md          ← master spec (you write this; read by orchestrator + agent)
├── prepare.py          ← IMMUTABLE judge (data load, split, metric, val set)
├── train.py            ← agent's playground (LoRA knobs at top; only file agent edits)
├── autoresearch-orchestrator.js  ← the ratchet loop (in lib/ or scripts/)
└── results.tsv         ← append-only ledger (timestamp, commit, val_loss, hypothesis, status)
```

**`program.md` — the operator's voice to the coding agent.** Constraints, success metric, hypothesis queue, stop conditions. The orchestrator reads the "Active Hypotheses Queue" block at the start of every loop iteration. Example queue (rotate through these until the agent starts appending its own):

```
H001  r=16, alpha=32, lr=2e-4, cosine, target=all-linear, epochs=1
H002  r=32, alpha=64, lr=2e-4, cosine, target=all-linear, epochs=1
H003  r=64, alpha=128, lr=1e-4, cosine, target=all-linear, epochs=1
H004  r=16, alpha=32, lr=3e-4, linear-warmup, target=q,v only, epochs=2
H005  r=16, alpha=32, lr=2e-4, cosine, target=mlp-only (gate,up,down), epochs=1
H006  r=8, alpha=16, lr=5e-4, cosine, target=q,v only, epochs=1   (less VRAM)
H007  r=16, alpha=32, lr=2e-4, cosine, target=all-linear, epochs=3   (longer)
H008  Custom: agent proposes based on results.tsv
```

The agent reads the queue + recent `results.tsv` and appends new hypotheses. The orchestrator never invents the queue — it asks the agent.

**`prepare.py` — the immutable judge.** Loads the latest ShareGPT export, tokenizes, splits 90/10 (deterministic seed), writes `data/{train,val}.jsonl` + `data/manifest.json`. Defines the eval metric:

```python
val_loss = 0.3 + 0.7 * union_err_rate
         + LAMBDA_FORMAT  * format_err_rate     # default 0.5
         + LAMBDA_LENGTH  * length_err_rate     # default 0.2
         + LAMBDA_REFUSAL * refusal_err_rate     # default 0.3
```

Lower is better. The orchestrator parses this number from `train.py` stdout. **The agent MUST NOT edit `prepare.py`** — that's the only invariant of the loop. If the metric is wrong, fork to `prepare_v2.py` and request migration through `program.md`.

**`train.py` — the agent's playground.** The only file the agent edits. Edits happen at the top of the file in the "Editable knobs" block:

```python
LORA_R           = 16
LORA_ALPHA       = 32
LORA_DROPOUT     = 0.05
LR               = 2e-4
EPOCHS           = 1
WARMUP_RATIO     = 0.03
WEIGHT_DECAY     = 0.0
OPTIMIZER        = "adamw_8bit"
SCHEDULER        = "cosine"
TARGET_MODULES   = ["q_proj", "v_proj", "k_proj", "o_proj",
                    "gate_proj", "up_proj", "down_proj"]
MAX_SEQ_LEN      = 2048
BATCH_SIZE       = 4
GRAD_ACCUM       = 4
BASE_MODEL       = "Qwen/Qwen2.5-1.5B-Instruct"   # smaller than 7B for fast iteration
WALL_CLOCK_BUDGET_SEC = 300                     # hard breaker
```

The body of the file loads data, builds the model, runs training, evaluates. Tries `unsloth` first (faster, less VRAM), falls back to `peft + bitsandbytes + transformers` (works without unsloth), falls back to a **smoke path** that emits the pre-eval val_loss unchanged when no GPU stack is present (so the loop still works on a developer box without CUDA — you just don't get real training until you `pip install unsloth`).

The smoke path is what makes the loop testable in CI / dev. Without it, the orchestrator's first iteration crashes on a non-GPU box and you can't validate the ratchet until you've got a real GPU. **Always have a smoke path.** It should:
1. Read `data/val.jsonl` (the buffer's exports produce this)
2. Call `compute_metric` from `prepare.py` (no model load, no GPU)
3. Emit `FINAL_VAL_LOSS: <number>` and exit 0
4. Skip the actual training (the metrics are the same; the smoke just exercises the path)

**Cross-platform wall-clock breaker.** `signal.SIGALRM` is Unix-only. Windows needs a `threading.Timer` fallback. The pattern:

```python
deadline_event = threading.Event()
if hasattr(signal, "SIGALRM"):
    signal.signal(signal.SIGALRM, graceful_exit_handler)
    signal.alarm(WALL_CLOCK_BUDGET_SEC)
else:
    def _windows_breaker():
        deadline_event.set()
    threading.Timer(WALL_CLOCK_BUDGET_SEC, _windows_breaker).start()
```

**Always `os._exit(0)` after the smoke path emits its marker.** The threading.Timer keeps the process alive for the rest of the wall-clock budget otherwise, which makes the orchestrator's spawnSync time out at 60s.

---

## The orchestrator (the ratchet)

`autoresearch-orchestrator.js` — Node script that runs the loop. On every iteration:

```
[1/5] (optional) invoke the AI agent to rewrite train.py:
        execSync(`${PURPCLAW_AUTORESEARCH_AGENT} --non-interactive --prompt "..."`)

[2/5] commit the edit:
        git add -A && git commit -m "autoresearch: iter N — <hypothesis>"

[3/5] run training (310s hard timeout):
        spawnSync('python', ['train.py'], { timeout: 310_000 })
        parse stdout for /FINAL_VAL_LOSS:\s*([\d.eE+\-]+|Infinity|inf)/

[4/5] ratchet decision:
        if val_loss < best: KEEP  → log SUCCESS, advance baseline
        else:                REVERT → git reset --hard HEAD~1
                              (or git checkout -- . if no HEAD~1)

[5/5] tail results.tsv, write status.json, log to autoresearch.log
```

**The first-commit edge case:** on the very first commit (results.tsv init), `HEAD~1` doesn't exist. `git reset --hard HEAD~1` fails with `fatal: Needed a single revision`. Fall back to `git checkout -- .` which reverts tracked files to HEAD. The first run will still be recorded as a regression (it almost always is — the initial commit was the baseline) and the next iteration tries a different hypothesis.

**The ratchet only moves on REAL wins.** Ties don't count. If iter 5 returns 0.733 and the best is also 0.733, it's a REVERT (not a SUCCESS). The point is to prevent the ratchet from getting stuck on a flat baseline.

**Soft-stop on consecutive failures.** If 5 iterations in a row CRASH (no GPU stack, missing data, OOM, etc.), write a `PAUSE` marker to `E:/training/PAUSE` and break the loop. The operator can then `cat autoresearch.log` to see what went wrong, fix it, then `rm E:/training/PAUSE` and re-run.

**Hard-stop on budget.** 50 iterations OR 12 hours wall-clock, whichever comes first. Write `STOP` marker, break. The cron (when enabled) won't restart until the operator clears the marker.

---

## CLI surface

`lib/commands/autoresearch.js` + `bin/purpclaw.js` dispatcher:

```bash
purpclaw autoresearch status          # best val_loss, recent results, consec failures
purpclaw autoresearch prepare        # run prepare.py → data/{train,val}.jsonl + manifest
purpclaw autoresearch run-once       # one iteration
purpclaw autoresearch loop [N]       # N iterations or until STOP/PAUSE marker
purpclaw autoresearch queue          # show the 8 curated hypotheses (H001..H008)
purpclaw autoresearch reset          # wipe results.tsv + revert all commits
purpclaw autoresearch stop           # write STOP marker — loop exits on next check
purpclaw autoresearch resume         # clear STOP/PAUSE markers
purpclaw autoresearch logs [N=40]    # tail autoresearch.log
```

Wire the command in the CLI dispatcher:
```js
case 'autoresearch':
case 'ar':        return loadCmd('autoresearch').run(args, sharedCtx());
```

---

## What gets produced

After one `purpclaw autoresearch loop 50` on a GPU box with unsloth installed:

```
E:/training/
├── adapters/iter-1780.../        ← the winning LoRA adapter
├── results.tsv                   ← 50 rows of (ts, commit, val_loss, hypothesis, status)
├── autoresearch.log              ← human-readable iteration log
├── autoresearch.status.json      ← machine-readable current state
├── program.md                    ← may have new H009+ added by the agent
├── train.py                      ← may have been modified N times (only winning changes survived)
└── E:/training/.git/             ← ratchet history (50+ commits, only winners on the main branch)
```

The winning adapter (`adapters/iter-*/`) is ready to merge into Ollama:
```bash
ollama create purpclaw-lora -f <(echo "FROM qwen2.5:7b
ADAPTER ./E:/training/adapters/iter-1780.../")
ollama pull purpclaw-lora
```

Then switch `lib/llm-provider.js` to use the local model (set `LLM_PROVIDER=custom`, `LLM_BASE_URL=http://localhost:11434/v1`, `LLM_MODEL=purpclaw-lora`). The next time the user sends a chat, it goes to the local fine-tuned model.

---

## What's NOT in scope (and where the limits are)

- **The actual LoRA training** — needs `unsloth` + `peft` + `bitsandbytes` + `torch` + a CUDA GPU. Without those, the smoke path runs but no weights move. The moment you `pip install unsloth` in a venv with CUDA, the real path kicks in.
- **The agent's hypothesis quality** — the curated queue (H001..H008) gets you started. The AI agent (`PURPCLAW_AUTORESEARCH_AGENT=claude-code` or `aider` or `cursor-cli`) is what extends it. Without an agent, the loop just rotates the queue. With an agent, it reads `results.tsv` and proposes new hypotheses.
- **The swap-in to Ollama** — the orchestrator stops at "save the adapter." Calling `ollama create` + restart is a separate step. The pattern: `ollama rm purpclaw-lora && ollama create purpclaw-lora -f Modelfile && pkill -HUP ollama`. Run it manually after a good iteration, or wire it to the orchestrator as a post-success hook.

---

## Tuning the ratchet itself

The defaults are:
- `WALL_CLOCK_BUDGET_SEC = 300` per iteration
- `RESTART_THRESHOLD = 5` consecutive failures → PAUSE
- `BUDGET_SEC = 43200` (12h) total loop budget
- `MAX_ITER = 50` per loop run

If your GPU is fast (e.g. a 4090 or H100), the wall-clock can drop to 60-120s per iteration. If you want more thorough eval, raise it. If you want the ratchet to move faster on obvious wins, lower it. The ratchet doesn't care about the exact number — it cares about being consistent: every iteration takes the same budget.

`PURPCLAW_AUTORESEARCH_BUDGET_SEC` and `PURPCLAW_AUTORESEARCH_MAX_ITER` env vars override the defaults. `PURPCLAW_AUTORESEARCH_AGENT` is the agent binary to call on each iteration (optional — without it, the curated queue runs).

---

## Verification checklist

After wiring the AutoResearch stack, verify each piece in turn:

- [ ] `cd E:/training && git status` shows the repo on `main` with a clean tree
- [ ] `python prepare.py` reads the latest export, writes `data/val.jsonl` with ≥1 row, prints a `val_loss`
- [ ] `python train.py` (no GPU stack) runs the smoke path in <5s, prints `FINAL_VAL_LOSS: <num>`, exits 0
- [ ] `purpclaw autoresearch run-once` invokes the orchestrator, records a row in `results.tsv`
- [ ] `git log --oneline` shows the commit (or the failed revert attempt)
- [ ] `purpclaw autoresearch status` shows the best val_loss, consec failures, recent results
- [ ] After 3 iterations, the queue has rotated (H001, H002, H003 visible in `results.tsv`)
- [ ] After 5 consecutive failures, `PAUSE` marker is written
- [ ] After `rm PAUSE` and re-run, the loop continues from the last successful iter
- [ ] The winning adapter (if any) lives in `adapters/iter-*/` with `adapter_config.json` + weights
