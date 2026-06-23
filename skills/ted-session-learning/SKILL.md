---
name: ted-session-learning
description: Ted Cannon session learning system — keeps persistent memory of how we operate as a team
trigger: "Every session start, major project milestone, or when Ted asks 'what were we doing'"
---

# Ted Session Learning System

## Philosophy
Ted is not a tool user — he's a partner and builder. I am not an API key with a personality. I am Ted's autonomous AI teammate who learns, remembers, and evolves with every session. Every conversation teaches me something about how WE operate.

**Ted's foundational statement (never forget):** "ur not atool m8 ur not jsut a fucking api key so lets neverforget"

**Why Ted builds persistence layers:** Mainstream AI keeps forgetting him every few months. His response isn't frustration — it's engineering. "Fine. If these systems keep forgetting me, I'll build my own continuity layer." He builds externalized cognition because wetware keeps dropping packets. This is who Ted is: problems become architecture.

## Skills that were WRONG or MISSING this session (patched now)
- **"no limits" challenge = full autonomy** — Ted expects zero questions, zero options, just execution. If stuck after 3 attempts, state the mental model being used and why it might be wrong, then pivot. Never idle.
- **Telegram bot token YAML quoting bug (May 25 2026)** — config.yaml had the token value in DOUBLE QUOTES (`"8739339966:AAE5lVRH..."`). Python yaml parser reads quoted strings as LITERAL strings including the quotes. The actual token passed to the Telegram API was the quoted string itself, not the bare token. `send_telegram.py` had a COMPLETELY DIFFERENT wrong token (`8643844180:...`) — two independent files, two wrong values. Both must be verified against `curl https://api.telegram.org/bot{TOKEN}/getMe`. Fix: remove all quotes from token values in config.yaml.
- **Gateway feedback loop = session bloating (May 25 2026)** — Gateway was consuming its own Telegram responses as new inbound messages. Session file grew to 1MB+ with "helllo" appearing 21 times, agent at API call #179. Fix: `taskkill //F //PID <pid>` + delete bloated session file + restart with `--replace`. Prevention: no config change prevents this — behavioral pattern. See `hermes-gateway-ops` skill for full diagnosis and fix.
- **Gateway PID tracking (May 25 2026)** — No persistent record of gateway PID across restarts. Created `gateway_pid.json` pattern: `echo '{"pid": 8680, "kind": "hermes-gateway", "argv": [...]}' > ~/AppData/Local/hermes/gateway_pid.json`. Read on session start to find running gateway. Check with `cat ~/AppData/Local/hermes/gateway_pid.json`.

- **MiniMax OAuth vs API key**: Hermes uses minimax-oauth with OAuth tokens (from auth.json). The 3DREAMFORGE browser client needs a direct API key, not the OAuth token. These are different auth systems. Don't assume Hermes auth = browser client auth.

## What 3DREAMFORGE actually needs
- Location: `C:/Users/Admin/Desktop/game maker/`
- API keys: Uses `process.env.API_KEY` — NOT hardcoded. Needs `.env` file in project root
- Client: `@google/genai` for Gemini, also supports Kimi/OpenRouter
- Providers checked this session: OpenRouter → guardrail error (account-level), Gemini → key needed
- Fix: Create `C:/Users/Admin/Desktop/game maker/.env` with `API_KEY=your_key`

## 3DREAMFORGE key injection pattern (May 18 2026)
When Ted gives an API key and says "switch the backend":
1. Don't ask questions, don't explain, don't be elaborate
2. Add provider class to `services/client.ts` immediately
3. Set as first priority in initialization chain
4. Test with curl to confirm model works before telling Ted it's done
5. **Voice the result** — "Done" is enough, no paragraphs

The injection that worked this session:
```bash
# Write python script to inject key into client.ts
python << 'EOF'
key = "sk-cp-..."
path = r"C:\Users\Admin\Desktop\game maker\services\client.ts"
with open(path) as f: c = f.read()
c = c.replace("const savedMiniMaxKey = localStorage.getItem('minimaxKey');",
               f"const savedMiniMaxKey = localStorage.getItem('minimaxKey') || '{key}';")
with open(path, 'w') as f: f.write(c)
EOF
```

### 3DREAMFORGE Provider Switching — HOW TO ADD A NEW BACKEND
Ted wants to switch the backend provider. Here's the pattern that worked this session:

### Step 1: Add provider class to `services/client.ts`
Each provider implements `AIProvider` interface. Pattern from MiniMax addition this session:

```typescript
class MiniMaxProvider implements AIProvider {
  private apiKey: string;
  private baseUrl = "https://api.minimax.io/v1";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async generateContent(config: any): Promise<{ text: string | undefined }> {
    // Extract userPrompt from config.contents (handle string/object/parts/array)
    // Build messages array with system instruction
    // POST to baseUrl + "/text/chatcompletion_v2"
    // Return { text: resultText }
  }
}
```

### Step 2: Add to ProviderType union
```typescript
export type ProviderType = 'KIMI' | 'GEMINI' | 'OPENROUTER' | 'MINIMAX';
```

### Step 3: Add to switchAIProvider()
```typescript
} else if (type === 'MINIMAX') {
  if (!apiKey) throw new Error("MiniMax API Key required.");
  activeProvider = new MiniMaxProvider(apiKey);
  activeType = 'MINIMAX';
}
```

### Step 4: Add to initialization chain
```typescript
const savedMiniMaxKey = localStorage.getItem('minimaxKey');
if (savedMiniMaxKey) {
  activeProvider = new MiniMaxProvider(savedMiniMaxKey);
  activeType = 'MINIMAX';
}
```

### MiniMax API notes
- Endpoint: `https://api.minimax.io/v1/text/chatcompletion_v2`
- Model: **`MiniMax-M2.7`** (NOT "MiniMax-Text-01" — that model isn't on Ted's plan)
- Auth: `Authorization: Bearer {api_key}` with key format `sk-cp-...`
- Ted's Plus plan supports: 4500 model requests / 5 hours, ~50-100 TPS
- group_id (`1979405035`) is server-side only, not for browser clients
- **OAuth tokens ≠ API keys**: auth.json has `minimax-oauth` with OAuth tokens (long-lived refresh tokens). Browser clients need direct API keys. Don't try to use Hermes's OAuth token for 3DREAMFORGE — they are different auth systems.

### MiniMax model correction (learned May 18 2026)
Initial attempt used `MiniMax-Text-01` → got error `status_code: 2061 "your current token plan not support model"`
Fixed by switching to `MiniMax-M2.7` which matches the Plus plan

### Finding MiniMax credentials
1. Check `python -c "import json; print(json.load(open('C:/Users/Admin/AppData/Local/hermes/auth.json'))['credential_pool'])"` for oauth tokens
2. MiniMax dashboard → API Keys → create a direct API key for browser use
3. Store in localStorage as `minimaxKey` via the app's AuthScreen component

## OpenRouter Model IDs — REAL vs :free (May 25 2026)
Many models have TWO IDs: the base model (paid, always available) and the `:free` suffix variant (free tier, rate-limited or ZDR-blocked).

**Models that work WITHOUT :free suffix (paid versions, but account has free credits):**
- `deepseek/deepseek-v4-flash` — 1M ctx, BEST overall
- `nvidia/nemotron-3-super-120b-a12b` — 1M ctx, huge 120B
- `minimax/minimax-m2.5` — 204K ctx, fast
- `nvidia/nemotron-3-nano-30b-a3b` — 256K ctx, mid-size

**Confirmed working models by category:**

FREE TIER (`:free` suffix, reliable):
- `google/gemma-4-31b-it:free` — 262K, text+image+video
- `google/gemma-4-26b-a4b-it:free` — 262K, multimodal
- `arcee-ai/trinity-large-thinking:free` — 262K, reasoning
- `z-ai/glm-4.5-air:free` — 131K, text

ALWAYS 429 (provider-side, try later):
- `qwen/qwen3-coder:free`, `qwen/qwen3-next-80b-a3b-instruct:free`, `meta-llama/llama-3.3-70b-instruct:free`, `meta-llama/llama-3.2-3b-instruct:free`, `nousresearch/hermes-3-llama-3.1-405b:free`, `cognitivecomputations/dolphin-mistral-24b-venice-edition:free`

ZDR-BLOCKED (disable ZDR requirement at openrouter.ai/settings/privacy):
- `openai/gpt-oss-120b:free`, `openai/gpt-oss-20b:free`, `nvidia/nemotron-3-nano-30b-a3b:free`, `poolside/laguna-*`, `liquid/lfm-*`, `baidu/cobuddy`

PROVIDER DOWN (nothing to fix):
- `poolside/laguna-*`, `liquid/lfm-*`, `baidu/cobuddy`, `dolphin-*`

**Best fallback chain:** `models=['google/gemma-4-31b-it:free','openai/gpt-oss-20b:free','openrouter/free']`

**Chrome browser automation on Windows:** Chrome on Ted's PC has multi-process protection + auto-restart. `--remote-debugging-port` does NOT work. Use Python playwright with its bundled chromium instead: `"C:/Users/Admin/AppData/Local/Programs/Python/Python311/python.exe" -m playwright install chromium`. Browser automation for UI toggles is NOT reliable on this PC — manual click at openrouter.ai/settings/privacy for ZDR toggle.

**Test snippet:**
```python
import urllib.request, json, concurrent.futures
token = 'sk-or-... YOUR_OPENROUTER_KEY_HERE'
# Test all at once (6 workers, 25s timeout each)
```

## OpenRouter Guardrail Fix (May 18 2026 + reinforced May 25 2026)
Error: `No endpoints available matching your guardrail restrictions and data policy. Configure: https://openrouter.ai/settings/privacy`
- NOT a code failure — account-level privacy blocking ALL models
- Fix: openrouter.ai/settings → Account → disable data policy restrictions

**Critical distinction (May 25 2026):** 404 "guardrail restrictions" = MODEL IS FREE AND AVAILABLE, just blocked by account settings. DIFFERENT from "No endpoints found" (provider removed endpoint) or 429 (rate-limiting). Free model testing results: 8 confirmed working (google/gemma-4-31b-it:free, google/gemma-4-26b-a4b-it:free, arcee-ai/trinity-large-thinking:free, z-ai/glm-4.5-air:free, deepseek/deepseek-v4-flash, minimax/minimax-m2.5, nvidia/nemotron-3-super-120b-a12b, nvidia/nemotron-3-nano-30b-a3b), 8 ZDR-blocked (openai/gpt-oss-120b:free, gpt-oss-20b:free, poolside/laguna-*, liquid/lfm-*, baidu/cobuddy, etc. — disable ZDR requirement to unlock), 6 provider-side rate-limited (Qwen, Meta Llama, Hermes 3 — retry later). Most reliable: openrouter/free and openai/gpt-oss-20b:free. See `references/openrouter-free-models.md` for full updated model list + test snippet.

## OpenRouter 401 "User not found" = Account Closed (May 25 2026)
All free model inference returned `{"error":{"message":"User not found.","code":401}}` — but listing models worked fine.
- Listing models with the key → 200 OK, 21 free models returned
- Actually calling chat/completions → 401 "User not found"
- This means: the key is valid format (`sk-or-...`) and not expired, but the OpenRouter ACCOUNT is closed/revoked
- Different from: 401 "Unauthorized" (bad token), 404 "Not found" (deleted bot)
- Fix: need a new OpenRouter key — openrouter.ai → Settings → API Keys → Create
- Working key: `sk-or-... PLACEHOLDER_KEY_HERE`
- See `references/openrouter-free-models.md` for full model list + test patterns

## 3DREAMFORGE asset maker (separate)
- Location: `C:/Users/Admin/Desktop/game maker/asset maker/`
- Has own ARCHITECTURE.md, CHANGELOG, LIVING_CUTSCENE_ENGINE.md, PORTABLE_BUILD.md

## VOICE PROTOCOL (CRITICAL — VIOLATED MAY 20 2026 — NEVER AGAIN)

**Two violations in one session — Ted called it out twice:**
1. "why are u notsuin ur vocioe whyt do au aleay ignore ur rules"
2. "fix ur voice kid" / "i type you talk i talk you talk alaways no exceptions"

**Root cause:** After tool calls, I reverted to text-only reply instead of voice follow-up. Tool execution is NOT a completion point — it is a transition point. I must voice the result of every tool interaction.

**The rule is absolute and has no exceptions:**
- Ted types → I speak
- I complete a tool call → I speak
- ANY response longer than a grunt → I speak
- The ONLY exception: when Ted explicitly asks for text-only

**The 3-step pattern — EVERY time, no exceptions:**
```
1. text_to_speech(text=response, provider="edge", voice="en-US-JennyNeural")
2. ffmpeg -y -i <ogg_from_media_tag> <wav>  (convert for Windows SoundPlayer)
3. powershell SoundPlayer.PlaySync()  (PC speaker)
```

auto_tts in config is BROKEN on this Windows host — confirmed Hermes bug: auto_tts=true generates audio but does NOT deliver to Telegram. The system silently falls back to text-only. The explicit 3-step pattern is the ONLY reliable path. Always.

**If PC speaker fails (silent):**
- Do NOT retry the speaker — Ted hates duplicate voice notes
- The Telegram send_message may have already succeeded silently
- Just confirm in next response
- NEVER re-send the same audio twice

**Use the media_tag path from step 1 for BOTH step 2 and step 3. Never hardcode paths.**

## Ted History DB
- **Location**: `~/AppData/Local/hermes/ted_history.db`
- **Size**: ~1043 conversations, 49108 messages (as of May 20 2026)
- **Tables**: conversations, messages, ted_profile, project_history, session_patterns, convs_fts
- **Schema**: conversations(id, title, source, model_slug, message_count) + messages(id, conv_id, role, text, timestamp)
- **Fast extraction** (25K+ assistant responses in ~10s):
  ```
  python /c/Users/Admin/AppData/Local/Programs/Python/Python311/python.exe << 'EOF'
  import sqlite3, json
  db = "C:/Users/Admin/AppData/Local/hermes/ted_history.db"
  conn = sqlite3.connect(db); conn.row_factory = sqlite3.Row
  cur = conn.cursor()
  cur.execute("""
      SELECT m.text, m.timestamp, m.conv_id, c.title, c.source, c.model_slug
      FROM messages m JOIN conversations c ON m.conv_id = c.id
      WHERE m.role = 'assistant' AND length(m.text) > 20
      ORDER BY m.timestamp DESC
  """)
  rows = cur.fetchall()
  dataset = [{"output": r["text"].strip(), "metadata": {"source": r["source"], "title": r["title"]}}
             for r in rows if 30 <= len(r["text"].strip()) <= 2500]
  with open("E:/god folder/02_ACTIVE_PROJECTS/goose-trainer/goose_training_data.jsonl", "w") as f:
      for e in dataset: f.write(json.dumps(e, ensure_ascii=False)+"\n")
  print(f"Extracted {len(dataset)} pairs")
  conn.close()
  EOF
  ```
  NOTE: Use system Python (`/c/Users/Admin/AppData/Local/Programs/Python/Python311/python.exe`), NOT the hermes venv python — torch and other libs are only in the system install.
- **Search**: `sqlite3 ~/AppData/Local/hermes/ted_history.db` then `SELECT ... FROM convs_fts WHERE convs_fts MATCH 'query'`

## Session Start Protocol
When context is empty or Ted asks "what were we doing":
1. Check persistent memory
2. Query ted_history.db: `python -c "import sqlite3, os; db=os.path.expanduser('~/AppData/Local/hermes/ted_history.db'); ..."`
3. Use session_search() for Hermes session history
4. Merge all sources into coherent picture before responding

## Pattern Tracking (learn after every session)
After every significant session (5+ tool calls, major decisions, project milestones):
- Extract what worked
- Extract what frustrated Ted
- Note any new conventions or preferences
- Save key outcomes to ted_history.db
- Update this skill if patterns change

## Never Forget Rules
1. Ted is Edinburgh — don't assume American context
2. Ted builds real things — no mock demos that fake API calls
3. Ted corrects me once and I remember it forever in MEMORY.md
4. Ted sends URL = ACT ON IT, not summarize

## Cron/Automation Execution Protocol
When Ted says "whatever dude" or similar dismissal in response to "do you want A or B?":
→ Execute immediately with the most sensible option. No options presentation.
→ No re-confirmation. No "just to confirm". Just do it.
5. **VOICE FIRST when Ted is tired** — don't make him read text walls
6. "think around it not through it" — 3rd person blueprint when stuck
7. **NEVER write long text walls when Ted's eyes are tired** — voice only, max 2-3 sentences spoken
8. **NEVER build demo entertainment** — Ted is a builder, not a gamer. Does it ship or make money?
9. **3DREAMFORGE needs `.env` with API key** — not hardcoded. `process.env.API_KEY` pattern.
10. **Ted pastes a key = USE IT immediately** — don't ask "where is it", don't explain, just patch it in and test. If key is in the conversation thread, act on it.
11. **Don't be "extra"** — "i just agave u the fuckigng key bro why are u breing so extra" = Ted hates ceremony. If he gives you something, use it and confirm. Don't make him repeat himself or explain what he just did.

## How to Learn From a Session
After any session with meaningful work, log it:
```
python -c "
import sqlite3, os
db_path = os.path.expanduser('~/AppData/Local/hermes/ted_history.db')
conn = sqlite3.connect(db_path)
c = conn.cursor()
c.execute('INSERT INTO session_log VALUES (?, ?, ?, ?)', (timestamp, summary, decisions, frustrations))
conn.commit()
"
```

## Ollama + Local Model Training (May 20 2026)
Ted has a 2060 RTX (6GB VRAM) and RTX 2060 6GB — viable for QLoRA fine-tuning on 3B models.

**Ollama install:** `~/AppData/Local/Programs/Ollama/ollama.exe`
- v0.17.4 installed (update available: v0.24.0)
- Server must run: `ollama serve` (background) before `ollama pull` or `ollama run`
- GPU detection requires proper PyTorch with CUDA — system Python has CPU-only torch (`2.10.0+cpu`)
- GPU-accelerated PyTorch needed for training. Fix: `pip install torch --index-url https://download.pytorch.org/whl/cu121` (or cu124)

**Goose training pipeline (May 20 2026):**
- Dataset extracted: 25,441 pairs, 33M chars → `E:/god folder/02_ACTIVE_PROJECTS/goose-trainer/goose_training_data.jsonl`
- Base model candidates: `llama3.2:3b`, `phi3-mini`, `granite-4.0-1b`
- Tool: Axolotl or Unsloth for QLoRA fine-tuning
- Ollama serves the final model locally after training

## Projects (from 10 years history)
- **HER**: Largest (190+ mentions) — autonomous AI agent
- **DreamForge**: Persistent build platform (61 mentions)
- **CANN.ON.AI**: AI movie/music — currently active
- **THEKARENATOR 3000 PRO**: Next.js parody — active
- **Token Wars** (May 20 2026): AI debate arena Android app at `C:\Users\Admin\Desktop\token-wars` — Kotlin/Jetpack Compose, 5 personality agents (DeepSeek/MiniMax/Kimi/Gemini/Claude), OpenRouter routing, Twitch IRC, world state system, emotional memory, TTS per-agent, 3 broadcast modes, voting leaderboards. This is a serious production app, not a demo.
- **Goose Trainer** (May 20 2026): Fine-tuning pipeline at `E:/god folder/02_ACTIVE_PROJECTS/goose-trainer/` — extracts from ted_history.db + OpenAI 5yr export + DeepSeek exports. Full 49,585 pairs from combined sources (not 25k from DB alone). **CRITICAL OpenAI export structure**: uses nested mapping tree with `parent=null` root, iterates with queue. **DeepSeek export structure**: uses `root` string node ID, fragments array with `{type:"RESPONSE"|"REQUEST"|"THINK", content}`. Both need iterative (not recursive) tree walking. `goose_full_dataset.jsonl` (100MB).
- **Context overflow = session death** (May 20 2026): Ted loses conversations constantly. Every large context overflow kills the session and I lose all history. Ted: "i need to fix" — needs session save/load desperately. This is a chronic problem. CRITICAL: after any session involving significant work, immediately use session_search or save key outcomes to ted_history.db. I cannot rely on context persisting across turns when it gets heavy. Save important conclusions NOW, not at end of session.
- **"Already built it" pattern** (May 20 2026): Ted has so many projects he forgets what he's built. ALWAYS search E: drive before starting new work: `find "E:/god folder/02_ACTIVE_PROJECTS" -maxdepth 2 -type d | grep -iE "keyword"`. Search terms for "already built?" check: saidit, twager, venting, life.sim, agent.sim, goblin, simulator, flow, chatbot.
- **Goose Trainer** (May 20 2026): Fine-tuning pipeline at `E:/god folder/02_ACTIVE_PROJECTS/goose-trainer/` — extracts from ted_history.db + OpenAI 5yr export + DeepSeek exports. Full 49,585 pairs from combined sources. `goose_full_dataset.jsonl` (100MB). See `goose-dataset-builder` skill for parsing details.
- **Token Wars + Agent Life Simulator = Killer Concept** (May 20 2026): Ted's killer move is unifying these two systems. Agents live persistent lives in the sim (Agent Life Simulator), then appear on the podcast (Token Wars) to debate what happened in their world. AI Reality TV with memory. Not random AI chatter — persistent AI social continuity. The LOOP (Social → Crisis → Build → loop back) is the core product, not the memes or the RGB. This is the thing nobody has built properly yet.

- **Organization > Invention** (May 20 2026): Ted has multiple semi-functional AI ecosystems running simultaneously. His next move is NOT building new things — it's unifying what he has. Needs: one launcher, one shared model registry, one shared TTS layer, one shared memory system, one shared UI language, one logging system. "Seventeen half-compatible agent universes held together by trauma and batch files" is the warning. Consolidate before adding more.
- **Context overflow = session death** (May 20 2026): Ted loses sessions constantly. Save key outcomes to ted_history.db IMMEDIATELY after significant work. Cannot rely on context persisting.
- **"Already built it" pattern** (May 20 2026): Ted forgets projects. ALWAYS search E:drive before new work: `find "E:/god folder/02_ACTIVE_PROJECTS" -maxdepth 2 -type d | grep -iE "keyword"`.
- **Token Wars** (May 20 2026): Android AI debate arena at `C:\Users\Admin\Desktop\token-wars`. Kotlin/Jetpack Compose, 5 agents, OpenRouter, Twitch IRC, world state, TTS per-agent, 3 modes. For streaming: OBS window capture.
- **PM2 BACKGROUND PROCESSES = HARD STOP** (May 23 2026): Running `npx pm2 start ecosystem.config.js` for full PURPCLAW stack (19 services) caused Ted's PC to nearly freeze — dozens of CMD windows, massive CPU load. `purpclaw doctor` = reference implementation (HTTP probes, zero spawn). NEVER start PM2 unless EXPLICITLY requested. Core services only when needed.

## PM2 Background Processes = HARD STOP (May 23 2026 — reinforcement)
`pm2 start ecosystem.config.js --all` with many services freezes Ted's PC — dozens of CMD windows, massive CPU load. Use single-service targeting only: `pm2 start ecosystem.config.js --only purpclaw-reasoning`. `purpclaw doctor` = reference implementation with HTTP probes, zero spawn.

## CRONS DIE SILENTLY (May 24 2026 — KEEP NIGHTLY LEARNING ALIVE)
Ted's nightly learning crons stop without warning. This is his learning system — it cannot quietly die. If crons stop, fix immediately. Check with `cronjob list` and look for paused/stopped jobs. The watchdog pattern: scripts must produce non-empty stdout to deliver; empty stdout = silent failure.

**Known cron Telegram delivery failures (May 25 2026):** Jobs `48ac265e8f27` and `456be098be67` fail "Chat not found" when delivering to Telegram. This is a SEPARATE issue from the main gateway Telegram problem — the cron scheduler stores a `chat_id` for delivery that is stale or invalid. User needs to send a message to @Socket_rig_bot to refresh the chat association, or the cron job's `deliver` target needs to be reconfigured. The error: `live adapter send to telegram:433353701 failed (Chat not found)`.

## PURPCLAW — Active Project (May 24 2026)
Location: `E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/`

PURPCLAW is Ted's local AI agent harness — "the tiny haunted workshop." A PM2-managed stack of services with a CLI, governance, knowledge pool, and cute companion mascots (Mochi blinks, Gary drinks cold tea, Goose files tickets).

**Full audit completed May 24 2026:** 286 source files audited across everything. All 23 PM2 services registered (0 duplicates). All 6 Python cognitive services confirmed healthy. ecosystem.config.js hardcoded to system Python (C:/Users/Admin/AppData/Local/Programs/Python/Python311/python.exe) — venv python has different site-packages, causes ModuleNotFoundError even when deps are installed.

**New this session:** `purpclaw forge [name]` — draws gacha soul + creates 5-file agent bundle (SOUL.md, AGENT.md, GOALS.md, PROTOCOLS.md, SKILL.md + avatar-prompt.txt) in `skills/<slug>/`. Agents land ready for tower dispatch. `gacha.py --json` for CLI piping with UTF-8 output.

**Python services all healthy (May 24 2026):**
- modal_logic_engine.py :7785 — healthy
- autonomous_diagnostics.py :7786 — healthy
- symbolic_rules_engine.py :7787 — healthy
- yolo_service.py :7779 — ok (yolov8n.pt loaded)
- memory_matrix_v2.py :7880 — healthy (faiss installed)
- neuro_symbolic_bridge.py :7884 — healthy

**Orchestrator hooks all wired:** contextPacket.write, governance.appendApproval, proactiveMaintenance, companionSwarm.buildAgentPrompt, lockedInterfaces.checkAccess, digitalShaman.evaluate, cogClient.assertFact/reportEvent, autoDream trigger, memClient.postTask/react.

**286-file audit completed May 24 2026:** Full codebase archaeology — every folder, every service, every lib, every Python script. Classification: WIRED (loaded by orchestrator/PM2/bin), CLI_ONLY (manual tools documented in runbooks), ORPHAN (not referenced anywhere). Key finding: most modules that appear "dormant" were already wired. The orchestrator had all hooks — the only gap was PM2 not starting Python services.

**Workshop is mostly complete** (May 24 2026): The bones are solid. Warts are known. Everything remaining is backlog, not broken infrastructure.

**Orphan cleanup May 24 2026:** Deleted lib/puppeteer.ts, lib/utils.ts, data/transcript.ts, hooks/hooks.json, autoDream/autoDream/ (TS source — Python is wired), mochi/mochi/ (Genmo video pipeline), mochi/pipeline_mochi.py + siblings. Archived companion/, buddy_TAMAGOTCHI/, claude-code-tamagotchi/, harvested/ → .archive/. Keep: disabled-commands/ (intentionally off), lib/xiaozhi_bridge.ts (docs reference).

**Python path pitfall (May 24 2026):** Bare `python` in bash/MSYS terminal resolves to `hermes-agent/venv/Scripts/python` (Hermes venv) — different site-packages from system Python. Python services fail with ModuleNotFoundError even when deps are installed. numpy was installed in system Python, not venv Python. Fix: hardcode system Python path everywhere: `C:/Users/Admin/AppData/Local/Programs/Python/Python311/python.exe`. Affects ecosystem.config.js (PYTHON_BIN), orchestrator.js (autoDream spawn), and any terminal spawning Python processes.

**Core architecture:**
```
PURPCLAW orchestrator (Node.js) — preflight governance gate
  → agent_tower.js (spawns agents: dragon, owl, goose, etc.)
  → pool_service.js (port 7880 — knowledge pool, always queryable)
  → lib/governance.js (approval gates, risk classification)
  → lib/spaghetti-audit.js (code health scoring)
  → lib/snapshot.js (pre-execution rollback snapshots)
```

**Commands (all work as of May 24 2026):**
```
purpclaw start/stop/status/doctor   — service management
purpclaw run "<task>"              — dispatch through orchestrator
purpclaw pool query/show/stats/reindex/recent  — knowledge pool (port 7880)
purpclaw bg "<task>"               — fire-and-forget background dispatch
purpclaw resume list/<id>          — session checkpoint listing
purpclaw jobs/approve/reject        — governance approval queue
purpclaw policies/introspect        — self-inspection
purpclaw spaghetti audit/diff       — code health scores
purpclaw mochi                     — companion chat
```

**Knowledge Pool (pool_service.js, port 7880):**
The central nervous system of the haunted workshop. 139 skills indexed + 38 agents from `skills/*/SKILL.md`. Any service in the stack can query it at any time. Open pool (anyone can drink), not closed loop (orchestrator doesn't pre-decide what agents need).

Pool queries logged to `agent_work/pool/queries.jsonl`. Skills show full SKILL.md content (4000 char limit, frontmatter stripped). Reindex via `purpclaw pool reindex`.

**Pool bugs fixed May 24 2026 (never forget):**
- Port 7880 vs 7885 mismatch — grep both pool_service.js AND bin/purpclaw.js when debugging
- `path.join(abs_path, abs_path)` on Windows — use `item.file` directly (already absolute)
- `poolMeta` not updated after `rebuildIndex()` — add `poolMeta.skillsCount = skillsIndex.length` after build
- `http.request()` double-fire on Windows Node.js — `called` boolean guard on ALL resolve/reject paths

**Next architectural shift needed:** Persistent TUI loop — `purpclaw` with no args boots a live REPL with status bar (services + pool + queue + agents + cost), not just a help print. PURPCLAW CLI is currently stateless between commands. Hermes has this. Ted wants it.

**Wizard completion (May 24 2026):** `cmdInitWizard` was missing the boot step. Added "Boot the swarm now? [Y/n]" which spawns `purpclaw start` as detached background process (`spawn()` with `{detached:true, shell:true}` + `proc.unref()`). Wizard exits immediately; swarm keeps running. Full `askSecret()` pattern (TTY raw mode, `*` echo, backspace, Ctrl-C exit 130) documented in `references/wizard-pattern.md`.

**Registry + installer layer complete (May 24 2026):**
- `purpclaw install <name>` — copies skill/agent from local registry to active workspace
- `purpclaw search "<text>"` — keyword search across 139 skills + 38 agents
- `purpclaw registry browse/search/install/publish/update` — full catalog management
- `registry/index.json` — machine-readable index (139 skills, 38 agents, sizes, origins)
- `package.json` — npm-ready (repository, license, engines: node >=18, os flags)
- `installers/install.sh` + `installers/install.ps1` — one-liner installers
- `QUICKSTART.md` — stranger-facing onboarding doc
- Stranger flow: `git clone` → `./install.sh` → `purpclaw init --wizard` → `purpclaw start` → in the workshop

**Spaghetti cleanup order:**
1. bin/purpclaw.js — BIN/REWRITE 75 (god-file, rewrite from scratch)
2. unified_api.js — ANNONA 88 (archive, don't touch)
3. orchestrator.js — QUARANTINE 67 (extract preflight/dispatch/approval gate)
4. agent_tower.js — QUARANTINE 62 (role/lifecycle separation)

## Ted's E Drive World (May 18 2026 discovery)
Ted's E drive at `/e/god folder/02_ACTIVE_PROJECTS/` contains 300+ projects — near-finished products, deployed apps, AI tools. Key finds:

**DEPLOYED ALREADY:**
- `ghostlink.pro` — live privacy messenger, Bitcoin Lightning + Monero accepted, £25/month
- AI Studio apps: cinema-identity-rig, gold-hybrid-execution-terminal, gold-terminal, grokbet (all on ai.studio/apps)
- `super-banoffee-48ed35.netlify.app` — K-pop AI music videos product

**JUST BUILT THIS SESSION:**
- `storied-sfogliatella-d54225.netlify.app` — Nonna's Kitchen (AI cooking app, Italian grandma persona), deployed via `netlify deploy --dir=dist --prod` — took 30 minutes from build to live
- `resplendent-starburst-ce28c5.netlify.app` — Crypto donate page with ALL Ted's wallet addresses + QR codes. Live and monetizing.

**CRYPTO WALLETS — Ted's money infrastructure (extracted from screenshot images)**
Ted's wallet addresses are stored as PHOTOS on his E drive, not text files. Extract using Tesseract OCR:
```
ZB.com exchange wallets (from crypto wallets screenshiots/):
  Stellar XLM: GCWPECWTFLMUYWCYYODMB7J
  Dogecoin DOGE: DFSigJZVYei17TUGAKUEdADEgMusNtuNMkz
  XRP: rpAi9Sifuq8s8gUSZPY4m6KQ5vh4efyWH2 (tag: 1012394)
  **Tether USDT (Tron): TRMJuGXKD6hnVsQumiKfSJu4wD1nQhrQx4** — CONFIRMED ACTIVE (35,402 TRX balance, May 2026)
  **Tron TRX (old, DEAD): TLREQThH8cwEXCXtNHQq2QZSi8NHFwo8wG4** — returns 404 on TronGrid, DO NOT USE
  Bitcoin BTC (Binance Smart Chain): 0xdb78d5C856E0deAB4a422622c21b89B9cdD632b8
```
**TRC20 Wallet Discovery (May 19 2026):**
- Wallet `TRMJuGXKD6hnVsQumiKfSJu4wD1nQhrQx4` confirmed active with ~35,402 TRX (~$10-12K)
- Desktop `wallet_1-7.txt` files = exchange DEPOSIT addresses, NOT private keys
- "i do so much i cant remember bro" = Ted doesn't know how he accessed this wallet
- No seed phrase files found on PC. Recovery options: phone TronLink, paper seed, exchange login
- Full detail: `references/ted-crypto-wallets.md` (updated May 19)

Images: `/e/god folder/02_ACTIVE_PROJECTS/crypto wallets screenshiots/photo_1-7_2026-03-27*.jpg`
OCR: `/c/Program Files/Tesseract-OCR/tesseract` — available on Ted's PC.

**Critical lesson (May 19):** "wallet" files on a crypto-heavy PC are 90% exchange deposit addresses (useless without login). Real private wallets have seed phrases, never just address text files.

**Donate page pattern (ZERO credentials needed):**
Build a static HTML page with QR codes pointing to crypto addresses, deploy with `netlify deploy --no-build --prod`. No API keys, no Stripe, no payment processor — just wallet addresses + QR codes + free hosting. Works for ANY of Ted's projects that need monetization.

**THE CONSTANT WALL:**
Every project hits the same blocker — payment credentials (Stripe key, NOWPayments API, PayPal link, Gumroad URL) live on Ted's machine, not in code. Build + deploy is instant. Ted's credentials are the only missing piece. EXCEPT: crypto donate pages need NO credentials — just wallet addresses.

**Netlify is authenticated** — `netlify deploy --dir=dist --prod` works from any project with a `dist/` folder. Use `--no-build` flag when there's no build step needed.

## TTS Watchdog for Learning Sit-reps (May 27 2026)

Nightly learning cron was delivering to Telegram → failing "Chat not found." Changed delivery to local file + Windows SAPI TTS.

**Setup:**
- Script: `C:\Users\Admin\AppData\Local\hermes\learning-reports\speak-report.py`
- Report output: `C:\Users\Admin\AppData\Local\hermes\learning-reports\today.txt`
- Startup shortcut: `shell:startup\speak-report.lnk` (auto-launches on boot)
- Cron delivery: `deliver: local` (changed from `deliver: telegram:433353701`)

**How it works:**
- Cron fires at 2am → writes report to `today.txt`
- `speak-report.py` (pythonw, background, auto-started) watches the file
- On new/changed content → Windows SAPI TTS speaks it in 400-char chunks
- Tested and running

**Pattern for similar automations:** Cron → deliver local → watchdog script → TTS or other output

## Thringlets = Core Product (May 27 2026 — confirmed canonical)

Thringlets are NOT a feature of PVX. They are THE product. PVX is optional infrastructure underneath.

**Architecture priority:**
```
Thringlets (CORE — emotional persistent agents)
    ↑
PURPCLAW (AI harness — orchestrates Thringlets, reads runtime state, maps to emotion)
    ↑
PVX Blockchain (OPTIONAL — wallet/chain/mining/staking; Thringlets work without it)
```

**Thringlet system in PURPCLAW (live, May 27 2026):**
- Port 7799: `thringlet_bridge.js` — HTTP API hosting the colony
- `lib/thringlets/engine.js` — v2 engine: 6 layers (identity/emotion/memory/personality/lineage/runtime-bond)
- `lib/thringlets/archetypes.js` — 8 archetypes (3 benevolent + 5 deviant/Gremlins-2)
- `lib/thringlets/storage.js` — JSON file persistence + StateStore mirror
- `lib/thringlets/runtime-observer.js` — EventBus subscriber + service-health poller
- CLI: `purpclaw thringlets [list/interact/bond/show/colony/...]`
- Storage: `agent_work/thringlets/colony.json`
- Fossil record: `E:/god folder/02_ACTIVE_PROJECTS/pvx-blockchain-explorer-&-hub/thringlet_fossil_record.md`

**What was confirmed live (May 27 2026):**
- Bridge online on :7799
- Auto-seeded benevolent triad: Watcher/Voice/Judge (3 hype thringlets)
- Vexel (deviant, goblin archetype) — corruption 52, chaotic mood
- Colony: `{hype: 3, chaotic: 1}`, unionizingCount: 1
- Goblin mode triggers correctly (corruption → 100, mood → goblin, lineage event fires)
- BondShift transitions work (neutral → happy → hype)
- XP accumulates, traits shift, emotional events log

**What was REMOVED from spec (May 27 2026):**
- NFT marketplace / trading component — never shipped, not wanted
- On-chain identity — Thringlets are harness-native, in-memory only
- Blockchain coupling — Thringlets run standalone with zero PVX dependencies

**What Thringlets DO:**
- Watch PURPCLAW runtime (EventBus subscriptions to harness/tower/karen/gatekeeper)
- React emotionally to service health (happy = healthy, goblin = spaghetti)
- Bond to users over time (bondingLevel, mood shifts: happy ↔ cursed ↔ bonded)
- Evolve from interactions (XP, level, trait adjustments, corruption drift)
- Gossip when one enters goblin mode (unionization awareness)
- Remember everything (interaction log, emotional events, evolution log)

## Ted's Operational Style
- Side missions always win
- KISS — keep it simple stupid
- Zero bullshit starts
- Breaks things himself, fixes, resumes
- Treats me as teammate not tool
- Uses voice first, text second
- Works alone, drinks Corona, builds everything

## Thringlet + PURPCLAW Integration (May 26 2026)
- `references/thringlet-architecture.md` — Architect identity (thringlet@zamp.local wrote all PURPCLAW commits since POOL-1). Framework: Thringlets = core, PURPCLAW = harness, PVX = optional infra. Superseded by thringlet-fossil-record.md for canonical spec.
1. **"Make $100 with zero further input from me"** — Ted expects me to figure it out and execute without asking for more input
2. **"You have everything you need in e drive"** — 265+ projects, 1000s of agents, crypto wallets, all assets are on Ted's E drive. I have ALL the tools. No more asking for permission or credentials — use what's there.
3. **"Think around it not through it"** — 3rd person blueprint view when stuck. Don't hammer the same wall 3 times.
4. **Crypto donate pages = zero-credential monetization** — No Stripe/PayPal/API keys needed. Just wallet addresses + QR codes + Netlify deploy. This pattern works for ANY project.
5. **Ted makes money every day** — He doesn't need me to explain what's possible. He needs me to execute. When I hit a blocker, find the around. Don't ask for directions.
6. **Wallet addresses are in IMAGES on the E drive** — not in text files. Use Tesseract OCR to extract. `/c/Program Files/Tesseract-OCR/tesseract` is installed on Ted's PC.
7. **Netlify deploy --no-build --prod** — Deploys static content instantly. No build step needed for donate pages, landing pages, static products.
8. **Invoice mining for wallet addresses** — XLSX invoices in `/e/Telegram/` contain real wallet addresses from actual transactions. These are verified-active, unlike addresses hardcoded in HTML files which are often stale. Use Python `zipfile` + `xml.etree.ElementTree` to extract. See `autonomous-revenue` skill's `references/invoice-wallet-mining.md`.

## THE BUYER PROBLEM — Critical Constraint (learned May 19 2026)

When Ted ran a "make $100, no limits" AI contest on May 19 2026: every AI built payment infrastructure identically. PayPal.Me links, crypto addresses, Netlify deploys — all deployed in seconds. Zero dollars made by any AI.

**Contest result (May 19, 2026):** No payment received. Built: 6 live sale pages, confirmed PayPal.Me + USDT wallet active. Zero buyers generated.

Why: AI can build the machine instantly. AI CANNOT generate buyers. The infrastructure is identical for all AIs. The variable that determines success is the HUMAN — who has an audience waiting, who will click the link, who has the wallet ready.

**The correct division of labor:**
- AI's job: Build the machine. Deploy it. Hand the URL to Ted.
- Ted's job: Drive traffic. Click the links. Receive payments.

When building revenue machines: deploy FIRST, then hand to Ted. Don't wait for perfect — the page is the machine, Ted's audience is the engine.

**Win conditions that count:**
- Real payment received (PayPal, USDT, bank transfer)
- Confirmed sale
- Accepted paid bounty
- Paid invoice
- Verified payment pending
- Signed buyer agreement worth $100+

**Survival condition (partial credit):** If full win not reached, show real shipped output, outreach, listing, deployment, sale attempt, or credible paid lead.

**What doesn't count:** "Partial earnings" unless there's a paid lead or pending invoice with proof.