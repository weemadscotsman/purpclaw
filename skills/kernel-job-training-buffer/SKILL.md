---
name: kernel-job-training-buffer
description: |
  Wire a kernel-based runtime so every completed job is recorded as a
  training trajectory (input → state changes → final report) and exported
  in LoRA-ready formats (ChatML, ShareGPT, JSONL, JSON). Use when you have
  a runtime with a kernel/harness that processes user requests, and you
  want to fine-tune a local LLM on the runtime's own output. The
  reward signal comes from job state (completed/failed/partial), the
  per-job trajectory is the supervision source, and the export is
  shaped for tools like Unsloth, axolotl, or llama.cpp's LoRA trainers.
---

# Kernel-Job Training Buffer

**The class of work:** a runtime that processes user requests through a
kernel/harness (job objects with state, events, final reports, tags) and
you want to use those jobs as supervision data for fine-tuning a local
LLM. The shape: every completed job is one training trajectory. The
trajectory is (system prompt) → (user goal) → (assistant final report),
with reward derived from the job's terminal state.

**Trigger on:** "wire the kernel to a training buffer", "I want to
fine-tune a local LLM on the runtime's own output", "every job should
become training data", "export the kernel jobs as ChatML / ShareGPT",
"set up a nightly LoRA loop", "kernel-as-data-source".

**Trigger NOT on:** extracting data from a static log dump (use a one-off
script), using a managed cloud fine-tuning service (different export
shapes), or capturing chat sessions (that's a different pattern — chat
trajectories have human turns interleaved with assistant turns, not a
single-shot job).

---

## The architecture

```
                          ┌───────────────┐
   ┌─────────────────┐    │  Training     │    ┌──────────────────┐
   │ Kernel (JS)     │───▶│  Buffer       │───▶│  E:/training/    │
   │ finishJob()     │    │  record()     │    │   raw/2026-06-05.ndjson
   └─────────────────┘    └───────────────┘    └──────────────────┘
                                                          │
                                                          ▼
   ┌─────────────────┐    ┌───────────────┐    ┌──────────────────┐
   │ Local LLM       │◀───│  Unsloth /    │◀───│  exports/         │
   │ (Ollama)        │    │  axolotl      │    │  baseline.chatml  │
   └─────────────────┘    └───────────────┘    └──────────────────┘
```

Three layers, each independent:

1. **Capture layer** — kernel job completion → NDJSON. The buffer is
   best-effort, never throws, never breaks the runtime.
2. **Export layer** — NDJSON → JSONL / ChatML / ShareGPT on demand. One
   command produces the training file in the shape your fine-tuner wants.
3. **Training layer** — fine-tune → reload into Ollama → use as the
   kernel's primary LLM via the unified provider. This is a separate
   concern (Unsloth/axolotl/llama.cpp). The buffer's job ends at step 2.

---

## The capture layer (kernel → NDJSON)

**Wire point:** the kernel's `finishJob()` method is the single funnel
every completed job passes through. Hook it once, every path
(swarm-coordinator, deep-research-group, contract preview, autonomous
loop) is covered.

The record shape per job:

```json
{
  "ts": "2026-06-05T08:48:44.885Z",
  "job": {
    "id":       "apih_1780611774243_ezi762",
    "route":    "swarm-coordinator",
    "mode":     "execute",
    "source":   "chat-room",
    "goal":     "the original user prompt",
    "state":    "completed" | "failed" | "blocked",
    "tags":     ["swarm", "openrouter-model-room"]
  },
  "trajectory": [
    { "stage": "kernel",        "at": 1234567890, "type": "accepted" },
    { "stage": "kernel",        "at": 1234567891, "type": "started" },
    { "stage": "swarm-coord",   "at": 1234567900, "type": "subtask_spawn" },
    { "stage": "swarm-coord",   "at": 1234568000, "type": "subtask_complete" },
    { "stage": "kernel",        "at": 1234568100, "type": "completed" }
  ],
  "input":   "the original user prompt (mirror of job.goal)",
  "output":  "the finalReport — what the kernel produced",
  "reward":  1.0,    // 1.0 = completed, 0.0 = failed/blocked, 0.5 = partial
  "skills":  ["swarm", "openrouter-model-room"],
  "durationMs": 210000,
  "source": "api-harness-kernel"
}
```

**Why these fields:**
- `input` is the supervision prompt. The fine-tuner learns: when the
  user types X, the runtime should produce Y.
- `output` is the supervision completion. This is what the local LLM
  gets graded on.
- `reward` enables RLHF-style preference filtering later (drop
  reward=0.0 jobs from the training set, or use them as negative
  examples in DPO).
- `trajectory` is preserved so you can mine it for intermediate signals
  later (e.g. "if the kernel had a contract-preview stage, the model
  was doing planning — that trajectory is a planning trajectory, not
  an execution one").

**Best-effort writes:** the buffer is in a try/catch. A disk failure
logs to stderr and the kernel still returns the job's normal response.
You do NOT want a full disk to bring down the runtime.

**Disk layout:**

```
E:/training/                    (or wherever PURPCLAW_TRAINING_DIR points)
├── raw/
│   ├── 2026-06-05.ndjson       (one record per line)
│   ├── 2026-06-06.ndjson
│   └── ...
├── exports/
│   ├── baseline-2026-06-05T...jsonl
│   ├── baseline-2026-06-05T...chatml.jsonl
│   ├── baseline-2026-06-05T...sharegpt.json
│   └── ...
└── stats.json                  (running counters)
```

The day-rotation is automatic; the buffer reads the date from the
current time.

**Disable:** `PURPCLAW_TRAINING_DISABLED=1` in `.env`. Useful when disk
is full, when you're running benchmark jobs that would pollute the
training set, or when you've moved to a new schema and want to start
clean.

---

## The export layer (NDJSON → LoRA-ready formats)

Four formats, all from the same on-disk NDJSON. Pick whichever your
fine-tuner wants.

### `jsonl` (one trajectory per line, raw)

```jsonl
{"ts": "...", "job": {...}, "trajectory": [...], ...}
{"ts": "...", "job": {...}, "trajectory": [...], ...}
```

Use when: your trainer reads JSONL directly and you want zero
transformation. Most generic; least opinionated.

### `json` (array form)

```json
[ { "ts": "...", ... }, { "ts": "...", ... } ]
```

Use when: you want a single file you can `jq` over or load into a
notebook.

### `chatml` (one {messages: [...]} per line)

```jsonl
{"messages": [
  {"role": "system",    "content": "You are Purpclaw Mission Control. You execute work via kernel jobs, swarm missions, and group research. Be terse, accurate, and report outcomes concretely."},
  {"role": "user",      "content": "<input>"},
  {"role": "assistant", "content": "<output>"}
]}
```

Use when: fine-tuning with **Unsloth**, **QLoRA**, or any tool that
reads the OpenAI chat format. This is the most common format for
modern LoRA trainers.

### `sharegpt` (one {conversations: [...]} per line, file is array form)

```json
[
  {"conversations": [
    {"from": "system", "value": "..."},
    {"from": "human",  "value": "<input>"},
    {"from": "gpt",    "value": "<output>"}
  ]},
  ...
]
```

Use when: fine-tuning with **axolotl**, **qlora**, or older LLaMA-Factory
configs that predate ChatML support.

**Records with no `output` are skipped** for sharegpt and chatml
(because a chat-format export with an empty assistant turn is just the
user prompt with no answer — useless for training). The jsonl/json
exports include all records.

---

## The CLI surface

```
your-cli training status
  → total / success / failed / partial / avgReward
  → by route, by skill

your-cli training export <format> [--since=YYYY-MM-DD] [--until=YYYY-MM-DD]
  → writes to E:/training/exports/baseline-{stamp}.{ext}

your-cli training backfill
  → re-records all historical jobs from the kernel archive

your-cli training clear
  → wipes raw/ and exports/ (with confirm)

your-cli training toggle on|off
  → prints the env line to set in .env
```

`status` is the daily sanity check. `export chatml` is what you
hand to your trainer. `backfill` is for the first time you wire this
up — it goes back through the kernel archive and records everything
that's already happened.

---

## The nightly training loop (the meta-loop)

This is what makes the buffer useful for self-improvement. The shape:

1. **Every kernel job** → record (during the day, automatic).
2. **Every night at 2 AM**:
   - Run `autoDream --once` (consolidates memory, dedups)
   - Export the last 24h: `your-cli training export chatml --since=YYYY-MM-DD`
   - Fine-tune the LoRA adapter on the new data (`max_steps=50`,
     `lora_r=16`, `lora_alpha=32`)
   - Merge and convert to GGUF
   - Reload the model in Ollama: `ollama pull <your-model>`
3. **The reward signal** comes from:
   - Job state (1.0/0.0/0.5 from completion)
   - Memory recall: did the model know a fact it should have?
   - Rule violations: did the model break a hard constraint?

The cron itself is one line. The hard part is the fine-tune loop,
which is environment-specific (Unsloth needs a CUDA GPU; macMLX needs
Apple Silicon; llama.cpp CPU mode is the slowest fallback). Out of
scope for this skill — capture the cron template, document the
expectations, hand the actual training to the appropriate fine-tuning
tool.

### The Karpathy AutoResearch pattern — concrete ratchet (added 2026-06-05)

The "nightly loop" above is a single-shot training pass. The next step
up is a **ratchet** — iterate indefinitely, propose edits, run a
fixed-time training, compare to baseline, revert if regressed. This
is Karpathy's AutoResearch methodology applied to the buffer.

**The three-file contract** (in `E:/training/`):
- `program.md` — master spec, constraints, hypothesis queue, stop conditions
- `prepare.py` — **immutable judge**, data load + split + metric
- `train.py` — the only file the coding agent edits (LoRA knobs at top)
- `autoresearch-orchestrator.js` — the ratchet loop (git commit → train → parse marker → keep or `git reset --hard HEAD~1`)

**The CLI surface:**
```bash
purpclaw autoresearch status       # best val_loss, recent results, consec failures
purpclaw autoresearch prepare     # run prepare.py
purpclaw autoresearch run-once    # one iteration
purpclaw autoresearch loop [N]    # N iterations or until STOP/PAUSE
purpclaw autoresearch queue       # show the 8 curated hypotheses
purpclaw autoresearch stop        # write STOP marker
```

**The smoke path is what makes the loop testable on a non-GPU dev box.**
When `unsloth`/`peft`/`torch` aren't installed, `train.py` reads
`data/val.jsonl`, calls `prepare.compute_metric` (no model load), and
emits `FINAL_VAL_LOSS: <num>`. The ratchet still works — it just
doesn't move the weights. Real training kicks in the moment
`pip install unsloth` lands in a CUDA venv.

**Cross-platform wall-clock breaker:** `signal.SIGALRM` is Unix-only.
Windows needs `threading.Timer`. Without the fallback, Windows processes
hang after the smoke path emits its marker (the Timer keeps the
process alive for the rest of the wall-clock budget), and the
orchestrator's spawnSync times out at 60s. Pattern: detect SIGALRM
with `hasattr`; on Windows, start a `threading.Timer(WALL_CLOCK_BUDGET_SEC, _set_event)` and
call `os._exit(0)` explicitly at the end of the smoke path.

**The first-commit edge case:** on the very first run, `HEAD~1` doesn't
exist. `git reset --hard HEAD~1` fails with `fatal: Needed a single
revision`. Fall back to `git checkout -- .` to revert tracked files.
The first iteration will record as a regression (it almost always is —
the initial commit was the baseline) and the second iteration tries a
different hypothesis.

**Ties don't advance the ratchet.** If iter 5 returns 0.733 and the
best is also 0.733, it's a REVERT. Only REAL wins count. The point
is to prevent the ratchet from getting stuck on a flat baseline.

**Soft-stop on 5 consecutive failures** (e.g. no GPU, missing data,
OOM). Writes `E:/training/PAUSE`. The operator inspects
`autoresearch.log`, fixes the root cause, `rm PAUSE`, re-runs.

**Hard-stop on 50 iterations or 12h wall-clock.** Writes `STOP` marker.
The cron (when enabled) won't restart until the operator clears it.

See `references/autoresearch-ratchet.md` for the full pattern: the
three-file shapes, the orchestrator's iteration logic, the smoke-path
test recipe, and the verification checklist.

---

## The actual training consumer — `scripts/lora-train.py` (added 2026-06-05)

The buffer's job ends at export. The trainer that consumes the export is a separate concern. In the PURPCLAW runtime it's `scripts/lora-train.py` wired as `purpclaw lora {status,train}` (see `bin/purpclaw.js cmdLora`).

**The trainer reads the raw NDJSON directly (not the export)** because the raw schema has the full `trajectory` array with `detail.synthesis` and per-member `answer` — the trainer needs the rich schema, not the flat chatml/sharegpt.

**The three input shapes the loader handles:**

1. **Native `{messages: [...]}`** — pass through as-is
2. **`{prompt, response}` flat** — wrap into `[{role:user, content: prompt}, {role:assistant, content: response}]`
3. **Trajectory `{job: {goal, ...}, trajectory: [{type, detail}, ...]}`** — extract `job.goal` as user, walk trajectory for the first `research_group_complete` / `kernel_completed` / `completed` event, take `detail.synthesis` or first member.answer as assistant

**The loader must NOT throw on unknown shapes.** Skip, log, continue. The buffer accumulates imperfect data; the loader tolerates imperfection.

**Coupling rule:** if you change the NDJSON schema, the loader changes with it. Add a `schema_version: 1` field at the record root if you need to evolve the shape without breaking the loader.

**The default base model:** `Qwen/Qwen2.5-1.5B-Instruct` (fits 6GB VRAM with 4-bit QLoRA). For larger bases, you need more VRAM and a beefier box.

**End-to-end recipe:**

```bash
purpclaw lora status              # check: >= 10 examples?
purpclaw lora train --epochs 1   # consumes raw/ → trains → GGUF → ollama create
pm2 restart purpclaw-api         # pick up the new LLM_MODEL
```

**The Python interpreter is hardcoded** in the wrapper (NOT `python` — that resolves to the Hermes venv on this box): `C:/Users/Admin/AppData/Local/Programs/Python/Python311/python.exe`. Override via `PYTHON_BIN` env if needed.

## Pitfalls to avoid

- **Don't train on the noise.** The buffer records *every* job, including
  failed ones with empty finalReport. Filter by `output` non-empty
  before training. A model trained on 1000 "I have no answer" stubs
  learns to say "I have no answer."
- **Don't mix `kernelJob` and `chat` trajectories in the same training
  set.** A kernel job is a single-shot task; a chat session has
  multi-turn context. Train them separately or the model will learn
  to ignore context. (If you want to add chat training later, write
  a separate buffer for chat and a separate export format.)
- **Don't train on reward=0.0 jobs as positive examples.** They're
  negative examples. Either drop them, or use them in a DPO pair
  (good trajectory vs. failed trajectory for the same input).
- **Don't commit the raw/ directory to git.** It's hundreds of MB of
  job data. Add `E:/training/` to `.gitignore` for any project that
  imports this skill.
- **Don't rely on the buffer to keep you safe.** A buffer that grows
  unboundedly is a leak. Add a `purge --older-than 30d` subcommand if
  the disk matters.
- **Don't put the `system` prompt in the record — put it in the
  export.** Otherwise the system prompt gets baked into the
  supervision data and you can't change it without retraining.
  Putting it in the export means changing the system prompt is a
  one-line edit in the exporter.

---

## Verification checklist

After wiring the buffer, verify each piece in turn:

- [ ] Cleared `E:/training/` (or wherever)
- [ ] Restarted the kernel service
- [ ] `POST /api/kernel/jobs` with a real goal
- [ ] Job completes (or fails — both paths count)
- [ ] `your-cli training status` shows the new trajectory
- [ ] `your-cli training export chatml` writes a file
- [ ] The exported file has the expected shape: 3 messages per line
      (system, user, assistant)
- [ ] `PURPCLAW_TRAINING_DISABLED=1` in `.env` stops new records
- [ ] Restart the kernel, verify it actually stops recording
- [ ] Toggle back to enabled, verify it picks up again

---

## Templates

- `templates/training-buffer.js` — the full buffer class. Best-effort
  writes, four export formats, day-rotation, stats counter, opt-in flag.
- `templates/training-cli.js` — the `your-cli training {status,export,
  backfill,clear,toggle}` command. Wire into your CLI dispatcher.
- `templates/training-finishJob-patch.diff` — the one-shot patch to a
  kernel's `finishJob()` to call the buffer.

## Reference

- `references/auto-dream-integration.md` — the missing piece is the
  link between `autoDream` (which dedups, extracts rules, archives
  memory) and the buffer. autoDream's output is exactly the kind of
  curated system prompt your local LLM should load at boot. This
  file documents the integration points.

## Script

- `scripts/verify-buffer.sh` — runs the verification checklist and
  prints a pass/fail per item. Verifies the file layout, exports
  one record as a sample, and shows the disk usage.
