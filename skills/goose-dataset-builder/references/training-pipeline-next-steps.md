# Training Pipeline — Next Steps (May 20 2026)

## Current State
- Dataset: `E:/god folder/02_ACTIVE_PROJECTS/goose-trainer/goose_full_dataset.jsonl` (100MB, 49,585 pairs)
- Source counts: OpenAI 21,304 + DeepSeek 2,793 + Hermes 25,488
- Format: JSONL with `{"instruction", "output", "metadata"}` fields

## What's Needed to Train

### 1. GPU PyTorch (CRITICAL BLOCKER)
System Python has CPU-only torch (`2.10.0+cpu`). Ollama + training need CUDA.
```bash
/c/Users/Admin/AppData/Local/Programs/Python/Python311/Scripts/pip install torch --index-url https://download.pytorch.org/whl/cu121
```
Check after install:
```bash
python -c "import torch; print(f'CUDA: {torch.cuda.is_available()}')"
```

### 2. Ollama Server (must be running before any model operations)
```bash
~/AppData/Local/Programs/Ollama/ollama.exe serve &
# Then in new terminal:
ollama pull llama3.2:3b
```

### 3. Unsloth for QLoRA Fine-tuning
```bash
pip install unsloth
```
Unsloth handles 4-bit QLoRA — fits 3B model in 6GB VRAM (RTX 2060).

### 4. Base Model Candidates
| Model | Size | VRAM | Notes |
|-------|------|------|-------|
| `llama3.2:3b` | 2GB | ~4GB | Good balance |
| `phi3-mini` | 2.2GB | ~4GB | Microsoft, good instruction following |
| `granite-4.0-1b` | 800MB | ~2GB | IBM, fast fine-tune |

### 5. Minimal Training Script (Unsloth QLoRA)
```python
from unsloth import FastLanguageModel
import json, torch

max_seq = 2048
model, tokenizer = FastLanguageModel.from_pretrained(
    "unsloth/llama3.2-3b",
    max_seq_length=max_seq,
    load_in_4bit=True,
    token=None  # or HF token if needed
)

model = FastLanguageModel.get_peft_model(
    model,
    r=16,
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                   "gate_proj", "up_proj", "down_proj"],
    lora_alpha=16,
    bias="none"
)

# Format dataset
from unsloth import MaybeIsolateWeights
with MaybeIsolateWeights(is_coil=False):
    for entry in dataset:
        # Tokenize and append to model
        pass  # See Unsloth docs for full training loop
```

## Ollama Serve Pattern (Windows)
```bash
# Start in background
~/AppData/Local/Programs/Ollama/ollama.exe serve

# In another terminal - check health
curl http://localhost:11434/api/tags

# Pull model
ollama pull llama3.2:3b

# Test model
ollama run llama3.2:3b "You are Goose. Short punchy response."
```

## Agent Life Simulator — Integration Path
Once trained, Goose model can replace the random simulation in the Agent Life Simulator's flow controller (`server/server.js`). Currently cycle results are random:
```javascript
const karmaGain = Math.floor(Math.random() * 20) + 5;
```
Replace with Goose model API call to generate actual agent dialogue.

## Priority Order
1. Fix GPU PyTorch (removes blocker for training)
2. Write Unsloth training script
3. Pull base model via Ollama
4. Run training overnight (50k pairs, ~4-8 hours on RTX 2060)
5. Deploy via Ollama + integrate into Agent Life Simulator