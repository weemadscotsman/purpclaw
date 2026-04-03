---
name: lora-finetune-qlora-on-consumer-gpu
description: "QLoRA fine-tuning on a consumer NVIDIA GPU (RTX 2060 / GTX 1660 / 6GB-class). Uses peft + trl + bitsandbytes for 4-bit quantization so 1-3B parameter models fit. Loads training data from an NDJSON training buffer, trains, saves the adapter, optionally merges + converts to GGUF + imports to Ollama. Reference: PURPCLAW LoRA pipeline (Ted/Eddie Cannon, 2026-06-05)."
when_to_use: "Fine-tuning a small LLM (1-3B params) on a single 6GB consumer GPU; building a self-training loop where the agent tunes its own base model on its own trajectories; integrating LoRA training into a larger runtime; no large H100 / DGX available"
---

# QLoRA Fine-Tuning on Consumer GPU (RTX 2060 / GTX 1660 / 6GB)

Fine-tuning a 1-3B parameter model locally, on a single 6GB card, using 4-bit quantization. No H100. No unsloth (the install is heavy). Just peft + trl + bitsandbytes.

## Stack

| package | purpose | install |
|---|---|---|
| `transformers` | model + tokenizer loader | `pip install transformers` |
| `peft` | LoRA adapters | `pip install peft` |
| `trl` | SFTTrainer | `pip install trl` |
| `bitsandbytes` | 4-bit QLoRA quant | `pip install bitsandbytes` |
| `accelerate` | mixed-precision training | `pip install accelerate` |
| `datasets` | Dataset.from_list | `pip install datasets` |
| `sentencepiece` | tokenizer support | usually transitive |

Tested on RTX 2060 6GB + GTX 1660 6GB (12GB total, 1 GPU used at a time).

## 4-bit QLoRA config (the magic)

```python
from transformers import BitsAndBytesConfig, AutoModelForCausalLM, AutoTokenizer
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training

bnb = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_quant_type="nf4",
    bnb_4bit_compute_dtype="float16",
    bnb_4bit_use_double_quant=True,
)
tokenizer = AutoTokenizer.from_pretrained(base_model, trust_remote_code=True)
if tokenizer.pad_token is None:
    tokenizer.pad_token = tokenizer.eos_token
model = AutoModelForCausalLM.from_pretrained(
    base_model,
    quantization_config=bnb,
    device_map="auto",
    trust_remote_code=True,
)
model = prepare_model_for_kbit_training(model)
```

This brings a 1.5B model from 6GB to ~1GB VRAM, leaving headroom for the LoRA adapter + optimizer states + activations.

## LoRA config (matches the AutoResearch ratchet settings)

```python
lora = LoraConfig(
    r=16,                  # rank — higher = more capacity, more memory
    lora_alpha=32,         # alpha = 2*r is a good default
    lora_dropout=0.05,
    bias="none",
    task_type="CAUSAL_LM",
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                    "gate_proj", "up_proj", "down_proj"],
)
model = get_peft_model(model, lora)
# 18M trainable params (1.18% of 1.5B) — adapter is ~30MB on disk
```

## Training config (single GPU, fp16)

```python
from trl import SFTTrainer, SFTConfig

train_cfg = {
    "num_train_epochs": 1,
    "per_device_train_batch_size": 2,    # bump if you have more VRAM
    "gradient_accumulation_steps": 4,    # effective batch 8
    "learning_rate": 2e-4,
    "lr_scheduler_type": "cosine",
    "warmup_ratio": 0.03,
    "fp16": True,
    "logging_steps": 5,
    "save_strategy": "epoch",
    "save_total_limit": 2,
    "report_to": "none",
    "output_dir": "E:/training/adapters/<base_model_name>",
}
```

## TRL 0.18+ API gotcha

**Critical**: TRL renamed `max_seq_length` → `max_length` in 0.18+. The new SFTConfig will reject `max_seq_length` with a TypeError.

```python
# WRONG (TRL 0.17 and earlier):
train_cfg["max_seq_length"] = 2048
sft_args = SFTConfig(**train_cfg, dataset_text_field=None, packing=False,
                    max_length=train_cfg["max_seq_length"])  # OK old API

# RIGHT (TRL 0.18+):
max_seq_length = train_cfg.pop("max_seq_length", 2048)  # remove from spread
sft_args = SFTConfig(**train_cfg, dataset_text_field=None, packing=False,
                    max_length=max_seq_length)             # new name
```

If you see `TypeError: SFTConfig.__init__() got an unexpected keyword argument 'max_seq_length'`, this is the fix.

## Training data: NDJSON with multiple shapes

The training buffer records multiple shapes per line. The loader must handle all of them:

```python
def load_training_ndjson():
    examples = []
    for f in sorted(RAW_DIR.glob("*.ndjson")):
        for line in f.read_text().splitlines():
            if not line.strip(): continue
            try: t = json.loads(line)
            except: continue

            # Shape 1: native messages
            if isinstance(t.get("messages"), list) and t["messages"]:
                examples.append({"messages": t["messages"]})
                continue

            # Shape 2: {prompt, response}
            if "prompt" in t and "response" in t:
                examples.append({"messages": [
                    {"role": "user",      "content": str(t["prompt"])[:2000]},
                    {"role": "assistant", "content": str(t["response"])[:2000]},
                ]})
                continue

            # Shape 3: trajectory (job + trajectory events)
            job = t.get("job") or {}
            goal = job.get("goal")
            if not goal: continue
            for ev in (t.get("trajectory") or []):
                typ = ev.get("type", "")
                if typ in ("research_group_complete", "kernel_completed",
                           "job_complete", "completed"):
                    detail = ev.get("detail") or {}
                    if isinstance(detail, dict):
                        reply = (detail.get("synthesis") or detail.get("result")
                                 or detail.get("summary") or "")
                        if not reply:
                            for m in (detail.get("members") or []):
                                if (m.get("status") == "ok" and m.get("answer")):
                                    reply = m["answer"]; break
                    if not reply: reply = ev.get("message", "")
                    if reply:
                        examples.append({"messages": [
                            {"role": "user",      "content": str(goal)[:2000]},
                            {"role": "assistant", "content": str(reply)[:4000]},
                        ]})
                        break
    return examples
```

## Full pipeline (one script)

```
1. Load NDJSON          →  15-100 examples
2. Load base model      →  1.5B params @ 4-bit
3. Train (1 epoch)      →  5-30 min on RTX 2060
4. Save adapter         →  E:/training/adapters/<base>/  (~30MB)
5. Merge LoRA + base    →  E:/training/merged/<base>/    (~3GB fp16)
6. Convert to GGUF      →  llama.cpp convert.py
7. Create Ollama model  →  ollama create <name> -f Modelfile
8. Update .env          →  LLM_MODEL=<name>
9. pm2 restart purpclaw-api
```

Steps 6-9 are gated behind `--skip-export` for fast iteration.

## When training gets killed

Symptoms:
- Process exits with `-15` (SIGTERM) right after model load
- No `[lora-train] training config:` log line
- GPU memory shows ~830 MiB but no activity

Common causes:
- PM2 restart or the parent process being cycled
- User or another process killing `python.exe`
- The Bash session timeout in a tool runner (e.g. 600s) closing the parent while child is still running

Mitigations:
- Write a log file (`> E:/training/lora-train.log 2>&1`) and `tail -f` it
- Run in `terminal(background=true, notify_on_complete=true)` not foreground
- If the model is already downloaded, re-runs are fast (only the training step takes long)
- Set `HF_HUB_DISABLE_SYMLINKS_WARNING=1` to silence the harmless symlinks warning

## Alternative: smaller base for faster iteration

If a 1.5B model is still too slow on your hardware:
- `Qwen/Qwen2.5-0.5B-Instruct` — half the size, ~5x faster training
- `microsoft/Phi-3-mini-4k-instruct` — 3.8B but heavily optimized
- `TinyLlama/TinyLlama-1.1B-Chat-v1.0` — 1.1B, very fast

For the ratchet's first real pass, 0.5B is plenty.

## GGUF conversion

If you have llama.cpp installed (`git clone https://github.com/ggerganov/llama.cpp && pip install -r llama.cpp/requirements.txt`):

```python
# scripts/convert-to-gguf.py
import subprocess, sys
subprocess.run([sys.executable, "llama.cpp/convert.py", str(merged_dir),
                "--outfile", str(gguf_path), "--outtype", "q4_k_m"])
```

Then:
```python
# Create Modelfile next to the .gguf:
# FROM <path>.gguf
# PARAMETER temperature 0.2
# PARAMETER num_ctx 4096
# SYSTEM "You are Quill, the PURPCLAW runtime assistant. ..."
# Then: ollama create purpclaw-quill -f <Modelfile>
```

## Anti-patterns

- **Don't train without `prepare_model_for_kbit_training`** — gradient checkpointing and layer norm casting won't be set up, will OOM or NaN
- **Don't use `max_seq_length` in TRL 0.18+** — see above
- **Don't trust 1 epoch on <20 examples** — model overfits, will regurgitate training data
- **Don't use `device_map="cuda:0"`** if you have multiple GPUs — let `device_map="auto"` figure it out, or the model will half-load
- **Don't skip the merge step** — Ollama needs the merged fp16 model, not the LoRA adapter alone
- **Don't update `.env` LLM_MODEL before the model exists in ollama** — runtime will 404 on every chat

## Reference script

`scripts/lora-train.py` in the PURPCLAW repo is a working example with all the above patterns. ~420 lines, all imports correct, all options handled, returns clean exit codes.

## Where this is used

- `E:/training/adapters/Qwen_Qwen2.5-1.5B-Instruct/` — adapter output
- `E:/training/raw/YYYY-MM-DD.ndjson` — input data (training buffer)
- `E:/training/results.tsv` — AutoResearch ratchet ledger (separate concern, same dir)
- `bin/purpclaw.js:cmdLora()` — CLI wrapper: `purpclaw lora status|train`
