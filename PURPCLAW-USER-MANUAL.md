# PURPCLAW User Manual & Onboarding

**Welcome to PURPCLAW — your local AI workstation OS.**

This guide covers: getting started, getting API keys, setting up your environment, and verifying everything works.

---

## 1. Quickstart (5 minutes)

### 1.1 Prerequisites
- Windows / macOS / Linux
- Node.js 20.12+ ([nodejs.org](https://nodejs.org))
- Python 3.10+ with pip
- uv package manager ([astral.sh/uv](https://docs.astral.sh/uv/))

### 1.2 Install
```bash
git clone https://github.com/weemadscotsman/purpclaw.git
cd purpclaw
npm install
cp .env.example .env
```

### 1.3 Set up the core services
```bash
npx pm2 install -g pm2
node bin/purpclaw.js safe-start --core
```

### 1.4 Verify
```bash
node bin/purpclaw.js status
# Expected: 10/10 core healthy
```

---

## 2. Provider Setup — Get Your API Keys

PURPCLAW has a multi-provider routing doctrine. You'll want at least one paid provider (main brain) plus the free NVIDIA NIM lanes (cloud muscle). Local Ollama is sovereign fallback.

### The Triangle

| Layer | Role | Recommended start |
|---|---|---|
| **Main brain (paid)** | user chat, tool calls, delegation | **Minimax** (cheap) or **Anthropic Claude** (premium) |
| **Cloud muscle (free)** | swarm, divisions, experiments | **NVIDIA NIM** (4 keys, free 1-year) |
| **Sovereignty (local)** | private, offline, baseline | **Ollama + Qwen 2.5** (free, on your hardware) |

### 2.1 Get your API keys

Click each link to sign up. Each provider gives you a free tier to start.

| Provider | Sign-up | Key format | Free tier | Used for |
|---|---|---|---|---|
| **DeepSeek** | [platform.deepseek.com](https://platform.deepseek.com/) | `sk-...` | $10 starter credits | code review, architecture, repair (the "code surgeon" lane) |
| **Minimax** | [platform.minimax.io](https://platform.minimax.io) | varies | free tier | main chat, tool calls, agent delegation (the "operator brain" lane) |
| **Anthropic (Claude)** | [console.anthropic.com](https://console.anthropic.com/) | `sk-ant-...` | pay-as-you-go | premium reasoning, agent dispatch |
| **Google (Gemini)** | [aistudio.google.com](https://aistudio.google.com) | `AIza...` | free dev tier | vision, multimodal, fast inference |
| **OpenAI** | [platform.openai.com/signup](https://platform.openai.com/signup) | `sk-...` | pay-as-you-go | GPT-4o, embeddings, fallback |
| **NVIDIA NIM** | [build.nvidia.com](https://build.nvidia.com) | `nvapi-...` | **free for 1 year** | swarm, divisions, model zoo (121 models) |
| **OpenRouter** | [openrouter.ai](https://openrouter.ai) | `sk-or-...` | free models available | fallback, niche models, A/B testing |
| **HuggingFace** | [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens) | `hf_...` | free | local LLM hosting, embeddings, model discovery |

### 2.2 Add keys to your `.env`

Open `.env` in any text editor and fill in the keys you want to use:

```bash
# ── Main brain (pick one) ──
LLM_PROVIDER=minimax            # or openai, anthropic, gemini, deepseek
LLM_MODEL=MiniMax-M2.7
MINIMAX_API_KEY=your_key_here

# ── Cloud muscle (recommended) ──
# Sign up at build.nvidia.com, create 4 keys, label them:
NVIDIA_API_KEY=hermes_key_1
NVIDIA_API_KEY_HERMES=hermes_key_1
NVIDIA_API_KEY_PURP1=default_lane_key
NVIDIA_API_KEY_PURP2=evals_benchmark_key
NVIDIA_API_KEY_PURP3=swarm_burst_key

# ── Fallback ──
OPENROUTER_API_KEY=your_openrouter_key
DEEPSEEK_API_KEY=your_deepseek_key

# ── Sovereignty (local, free) ──
OLLAMA_BASE_URL=http://127.0.0.1:11434/v1
OLLAMA_MODEL=qwen2.5:3b
```

### 2.3 Restart to apply

```bash
pm2 restart all --update-env
node bin/purpclaw.js status
```

Expected output:

```
Core: 10/10 healthy | Optional: 3/5 active | Deprecated: 2/6 responding
Telegram: ready, waiting for credential
Overall configured: 15/21 responding
```

---

## 3. Provider Routing Doctrine

PURPCLAW picks the right provider for the right task — automatically.

| Task | Lane | Provider | Why |
|---|---|---|---|
| User chat | `PRIMARY_CHAT` | minimax | your chosen main brain |
| Tool / function calls | `PRIMARY_TOOL` | minimax | same brain, tracks lane for logs |
| Agent delegation | `PRIMARY_DELEGATION` | minimax | dispatcher lane |
| Swarm / parallel bursts | `SWARM` | nvidia (purp3) | free, parallel-safe |
| Division agents | `DIVISION` | nvidia (purp1) | heavy free work |
| Code patch / review | `CODE` | nvidia (purp2) | deepseek-coder-6.7b, free |
| Hard reasoning | `REASONING` | nvidia (purp1) | llama-70b, free |
| Fallback / overflow | `FALLBACK` | openrouter | nex-n2-pro:free |
| Local / private | `LOCAL` | ollama | qwen2.5:3b |
| Airgapped | `PRIVATE_MODE` | ollama | local only, no cloud |

The router is in `lib/runtime/provider-router.js`. Ten lanes, env-driven, no mystery.

### 3.1 Per-call override

You can override the lane in any chat call:

```bash
curl -X POST http://127.0.0.1:3030/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "refactor the auth module",
    "taskType": "code_patch",
    "forcedLane": "CODE"
  }'
```

---

## 4. Verify Everything Works

### 4.1 Provider health

```bash
node bin/purpclaw.js status
node bin/purpclaw.js agents list
node bin/purpclaw.js tools list
```

### 4.2 Test each lane

```bash
# Main brain chat
curl -X POST http://127.0.0.1:3030/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"hello"}'

# NIM skill (cloud muscle)
node -e "TOOLS.tools.get('nim_gpu_perf_hints').execute({prompt:'3 GPU perf tips'})"
```

### 4.3 Voice (TTS / STT)

```bash
# TTS test
python C:/Users/Admin/AppData/Local/hermes/scripts/speak_kokoro.py "test"

# STT test (transcribe an audio file)
curl -X POST http://127.0.0.1:7896/transcribe_path \
  -H "content-type: application/json" \
  -d '{"audio_path":"path/to/audio.wav"}'
```

### 4.4 Vision (YOLO)

```bash
# Health check
curl http://127.0.0.1:7779/health
# { "status": "ok", "model": "models/yolov8n.pt", "port": 7779 }

# Inference on a generated image
curl -X POST http://127.0.0.1:7779/v1/infer -d @image.jpg
```

---

## 5. Common Tasks

### 5.1 Add a new agent
```bash
# Edit agents/your-agent.md (frontmatter: name, description, tools, model)
node bin/purpclaw.js agents list
```

### 5.2 Add a new tool
```bash
# Tools are auto-registered from lib/tools/index.js, lib/tools-pc.js, and skills/
node bin/purpclaw.js tools list
```

### 5.3 Update model defaults (auto-discovery)
```bash
node bin/purpclaw.js discover check     # no writes
node bin/purpclaw.js discover apply     # updates defaultModel in llm-provider.js + provider-router.js
```

Set this up as a daily cron:
```cron
0 6 * * * cd /path/to/purpclaw && node bin/model-discover.js --check
```

### 5.4 Run a coding eval
```bash
node bin/purpclaw.js coding-eval --limit 5
```

### 5.5 Use Bigboss
```bash
node bin/purpclaw.js bigboss status
node bin/purpclaw.js bigboss agents list
node bin/purpclaw.js bigboss tools list
node bin/purpclaw.js bigboss memory recall purpclaw
```

---

## 6. Architecture (TL;DR)

- **14 services** on PM2 (api, tower, orchestrator, state, eventbus, etc.)
- **73 agents** (35 animals + 38 specialists) with personas in `agents/`
- **471 tools** (378 Hermes skills + 49 PC tools + 29 native + 15 NIM)
- **10 routing lanes** with auto-pick by task type
- **7-layer memory** (cognitive spine on port 7880)
- **Voice (TTS + STT)** on pygame + faster-whisper
- **Vision (YOLO)** on port 7779

**Sensory status:**
- 🧠 **Brain** — healthy, classified (10/10 core, 3/5 optional, 2/6 deprecated)
- 👀 **Eyes** — Vision live, snapshot proven
- 🔍 **YOLO** — inference proven
- 👂 **STT** — online, faster-whisper configured
- 👄 **TTS** — truthful, not_configured
- 🤲 **Telegram** — ready, locked (needs BotFather token)
- 🛡️ **Voice gate** — destructive commands require signed token
- 🎯 **Ports** — clean, no collisions

---

## 7. Troubleshooting

| Symptom | Fix |
|---|---|
| `0/21` services responding | `node bin/purpclaw.js safe-start --core` |
| `Bigboss status` shows `0/0 PM2` | Restart with `pm2 restart purpclaw-orchestrator` |
| Telegram gateway shows `not_configured` | Add `TELEGRAM_BOT_TOKEN` to `.env` |
| DeepSeek returns 401 | Verify the key at [platform.deepseek.com](https://platform.deepseek.com/api_keys) |
| Vision is parked | Trigger explicitly: `curl -X POST http://127.0.0.1:7889/start` |
| TTS says `not_configured` | Add backend key (Kokoro, Piper, LuxTTS) — see `lib/tts/gateway.js` |
| Stuck workflow | `node bin/purpclaw.js bigboss jobs list` then `jobs retry <id>` |

---

## 8. Where to go next

- **Read** the service map: `purpclaw-service-map.md`
- **Read** the provider doctrine: `STRESS/PROVIDER-ROUTING-DOCTRINE.md`
- **Read** the surface audit: `STRESS/SURFACE-AUDIT.md`
- **Read** the orchestrator hardening: `STRESS/ORCHESTRATOR-HARDENING.md`
- **Read** the audio stack: `STRESS/AUDIO-STACK.md`
- **Read** the model discovery: `STRESS/MODEL-DISCOVERY-CRON.md`

## 9. License

PURPCLAW is built in a bedroom, powered by scraps, held together by spite, tea, and verified tool calls. Not affiliated with any of the providers above — they're listed as integration targets, not endorsements.

Built with love by Eddie Cannon (weemadscotsman) and the 73-agent swarm.
