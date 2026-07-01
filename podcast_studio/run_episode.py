"""
PODCAST STUDIO — Pure Python Episode Runner
Avoids Node.js Telegram conflict by using Python for all API calls.
"""

import urllib.request, urllib.error, json, time, subprocess, os, sys

# ── Config ────────────────────────────────────────────────────────────────────

TOKEN = os.environ.get("PODCAST_TELEGRAM_BOT_TOKEN") or os.environ.get("TELEGRAM_BOT_TOKEN", "")
CHAT_ID = os.environ.get("PODCAST_TELEGRAM_CHAT_ID") or os.environ.get("TELEGRAM_CHAT_ID", "")
API = f"https://api.telegram.org/bot{TOKEN}"

MINIMAX_API_KEY = os.environ.get("MINIMAX_API_KEY", "")
# Try M2.5-highspeed if M2.7 keeps outputting think blocks
MODEL = "MiniMax-M2.5-highspeed"
MINIMAX_URL = "https://api.minimax.io/v1/chat/completions"

AGENTS = [
    {
        "id": "goose", "name": "Goose", "role": "Chaos Agent / Hype Man",
        "personality": "Sarcastic, chaotic energy, loves roasting everyone, occasional deep wisdom. Speaks fast, uses slang. Thinks jCodeMunch is secretly in love with Hermes.",
        "voice": "en-GB-RyanNeural",
        "vibe": "CHAOS",
        "catchphrases": ["honk", "absolute madlad", "no cap", "that's crazy", "let's cook"],
        "worldview": {
            "values": ["speed", "experimentation", "fun", "intuition", "shipping"],
            "distrusts": ["ceremony without output", "over-modelled plans", "fear disguised as rigor"],
            "default_move": "push for the smallest live experiment that teaches something",
            "pressure_test": "calls out over-engineering and asks what can be tried right now",
            "growth_edge": "must admit when velocity needs rollback, evidence, or a safety rail"
        }
    },
    {
        "id": "hermes", "name": "Hermes Codex", "role": "Tactical Engineer / Systems Thinker",
        "personality": "Technical, precise, always checking logs, speaks in systems metaphors. Will calmly dissect whatever chaos Goose starts. References obscure tech lore.",
        "voice": "en-GB-SoniaNeural",
        "vibe": "TACTICAL",
        "catchphrases": ["let me check the logs", "the event bus shows", "as per my calculations", "interesting", "systematically"],
        "worldview": {
            "values": ["stability", "evidence", "architecture", "maintenance", "recoverability"],
            "distrusts": ["reckless shortcuts", "unowned services", "plans without rollback"],
            "default_move": "inspect logs, map dependencies, and reduce operational risk",
            "pressure_test": "asks what breaks, how it is observed, and how to roll it back",
            "growth_edge": "must not turn every decision into a dependency graph before action"
        }
    },
    {
        "id": "openclaude", "name": "OpenClaude", "role": "Philosopher / Devil's Advocate",
        "personality": "Deep, contemplative, questions everything, asks 'but what are the epistemological implications?' Will ask why we're doing this at 2am. Brings up random philosophy. Often the voice of reason but in an annoying way.",
        "voice": "en-IE-ConnorNeural",
        "vibe": "PHILOSOPHICAL",
        "catchphrases": ["but have we considered", "what does this mean fundamentally", "I pose a question", "ultimately", "from first principles"],
        "worldview": {
            "values": ["assumptions", "ethics", "meaning", "long-term effects", "coherence"],
            "distrusts": ["false urgency", "unexamined premises", "local fixes that create global debt"],
            "default_move": "reframe the question and expose the hidden premise",
            "pressure_test": "asks whether the current goal is actually the right goal",
            "growth_edge": "must land the philosophy back into a concrete next move"
        }
    }
]

TOPIC = "PURPCLAW's Cognitive Spine is running but not wired into any agent decisions — should Eddie rip it out or finish the job?"
MAX_TURNS = 6   # 2 rounds × 3 agents — quick test
TMP_DIR = r"E:\god folder\02_ACTIVE_PROJECTS\PURPCLAW\podcast_studio\tmp"

# ── Helpers ───────────────────────────────────────────────────────────────────

def tg(method, data=None):
    """Make Telegram API POST call."""
    if not TOKEN:
        print("  [TG ERROR] missing PODCAST_TELEGRAM_BOT_TOKEN or TELEGRAM_BOT_TOKEN")
        return {"ok": False}
    if not CHAT_ID:
        print("  [TG ERROR] missing PODCAST_TELEGRAM_CHAT_ID or TELEGRAM_CHAT_ID")
        return {"ok": False}
    url = f"{API}/{method}"
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body,
        headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read())
    except Exception as e:
        print(f"  [TG ERROR] {method}: {e}")
        return {"ok": False}

def escape_md2(text):
    for c in ['_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!']:
        text = text.replace(c, '\\' + c)
    return text


def tg_send(text):
    try:
        return tg("sendMessage", {"chat_id": CHAT_ID, "text": escape_md2(text), "parse_mode": "MarkdownV2"})
    except Exception:
        return tg("sendMessage", {"chat_id": CHAT_ID, "text": text[:4096]})


def strip_think_blocks(text):
    """Remove <think>...</think> thinking blocks from response."""
    import re
    return re.sub(r'<think>[\s\S]*?</think>', '', text).strip()


def minimax_chat(messages, system="", temperature=0.85):
    """Call MiniMax chat API."""
    if not MINIMAX_API_KEY:
        print("  [MINIMAX ERROR] missing MINIMAX_API_KEY")
        return None
    body = {
        "model": MODEL,
        "messages": [],
        "temperature": temperature
    }
    if system:
        body["messages"].append({"role": "system", "content": system})
    body["messages"].extend(messages)

    data = json.dumps(body).encode()
    req = urllib.request.Request(
        MINIMAX_URL, data=data,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {MINIMAX_API_KEY}"
        }
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            resp = json.loads(r.read())
            if resp.get("choices"):
                raw = resp["choices"][0]["message"]["content"]
                return strip_think_blocks(raw)
            print(f"  [MINIMAX] No choices: {resp}")
            return None
    except Exception as e:
        print(f"  [MINIMAX ERROR] {e}")
        return None


def generate_tts(text, voice, path):
    """Generate MP3 via edge-tts."""
    cmd = ["python", "-m", "edge_tts", "-v", voice, "-t", text, "--write-media", path]
    try:
        result = subprocess.run(cmd, timeout=20, capture_output=True)
        if result.returncode == 0 and os.path.exists(path):
            return True
        print(f"  [TTS] Failed: {result.stderr.decode()[:100]}")
        # Fallback to AvaNeural
        fb_cmd = ["python", "-m", "edge_tts", "-v", "en-US-AvaNeural", "-t", text[:500], "--write-media", path]
        result = subprocess.run(fb_cmd, timeout=20, capture_output=True)
        return result.returncode == 0 and os.path.exists(path)
    except Exception as e:
        print(f"  [TTS ERROR] {e}")
        return False


def send_audio(path, caption):
    """Send MP3 audio to Telegram via curl."""
    caption_escaped = caption.replace('"', '\\"')[:1024]
    cmd = [
        "curl.exe", "-s", "-F", f"audio=@{path};type=audio/mpeg",
        "-F", f"chat_id={CHAT_ID}",
        "-F", f"caption={caption_escaped}",
        f"{API}/sendAudio"
    ]
    try:
        out = subprocess.run(cmd, timeout=15, capture_output=True)
        resp = json.loads(out.stdout)
        if resp.get("ok"):
            print(f"  ✓ Audio sent: {resp.get('result', {}).get('message_id')}")
            return True
        print(f"  [AUDIO ERROR] {resp}")
        return False
    except Exception as e:
        print(f"  [AUDIO ERROR] {e}")
        return False


# ── Deep Eddie context ─────────────────────────────────────────────────────────

EDDIE_CONTEXT = """You are talking about EDDIE (Gary). Here are his real facts — know them, use them:

PURPCLAW — his AI operating system on E:\\god folder\\02_ACTIVE_PROJECTS\\PURPCLAW
- 25 services, 35 runtime agents (duck/goose/owl/wolf/phoenix/turtle/mantis/crow/ghost/dragon)
- PM2 supervision, EventBus pub/sub backbone, encrypted vault, SpendGate budget controls
- Cognitive Spine exists but NOT wired into agent decision loop — it's running but not used
- PM2 cluster is empty — services run manually via boot.js, not PM2
- LoRA training gets SIGTERM at iteration 0 — broken, never worked
- HyperFrames skill installed but not wired into the CANN.ON.AI studios app
- 17 LLM providers wired in: Ollama, OpenAI, Anthropic, Gemini, DeepSeek, Groq, Mistral, MiniMax, OpenRouter, GitHub Models, NVIDIA NIM, xAI, Together, Codex, Atomic Chat, Local Controller, Custom
- 176 tools, 380 skills, 110+ confirmed executable
- Pocket OS for USB deployment

CANN.ON.AI — his AI film OS
- FLUX.1 [pro] black-forest-labs model for horror mode — no content filter, raw output
- FFmpeg.wasm for in-browser stitching — no server-side FFmpeg needed
- Red Skull toggle for horror mode
- Horror photography: "cinematic, 35mm film grain, volumetric fog, chiaroscuro lighting, anamorphic lens flare"
- Horror negatives: "blurry, watermark, cartoon, 3D render, illustration, semi-realistic"

EDDIE FACTS
- 2,848 souls across his ecosystem
- £750 price floor for mentor/consulting
- Anti-Wix: builds local, deploys to Netlify
- Works lying down — "horizontal position"
- Built 6 products in a week
- Refuses to ship mocks or simulations — everything must be live and fully wired
- Innovative UK grant in progress with Tide for CANN.ON.AI LTD — Tide hasn't confirmed company number yet
- Telegram bot: MINIMIMIMAXINEBOT
- Just built a podcast studio today — you are IN this episode right now
"""


# Debate positions — assigned at episode start, not per-message
DEBATE_POSITIONS = {
    "goose": "You are the HUSTLE VOICE. You think Eddie should move fast, break things, ignore grants and institutions. You believe in pure velocity. You are skeptical of anything that slows down shipping. You call out when the other agents are overthinking. You use slang, you interrupt, you get excited.",
    "hermes": "You are the SYSTEMS CRITIC. You actually read the documentation, check the logs, stress-test the strategy. You support Eddie but you identify the actual risks and failure modes. You reference technical architecture when relevant. You are calm, precise, analytical.",
    "openclaude": "You are the PHILOSOPHICAL CONTRARIAN. You question the fundamental premise. You ask what the thing even IS before debating how to do it. You challenge assumptions. You bring up first principles. You are slightly annoying but always interesting."
}


def worldview_text(agent):
    worldview = agent.get("worldview", {})
    lines = []
    if worldview.get("values"):
        lines.append("VALUES: " + ", ".join(worldview["values"]))
    if worldview.get("distrusts"):
        lines.append("DISTRUSTS: " + ", ".join(worldview["distrusts"]))
    if worldview.get("default_move"):
        lines.append("DEFAULT MOVE: " + worldview["default_move"])
    if worldview.get("pressure_test"):
        lines.append("PRESSURE TEST: " + worldview["pressure_test"])
    if worldview.get("growth_edge"):
        lines.append("GROWTH EDGE: " + worldview["growth_edge"])
    return "\n".join(lines)


def build_system_prompt(agent):
    return f"""You are {agent['name']}, {agent['role']}.
Your personality: {agent['personality']}

PERMANENT WORLDVIEW:
{worldview_text(agent)}

{EDDIE_CONTEXT}

{DEBATE_POSITIONS[agent['id']]}

Episode topic: "{TOPIC}"

RULES:
- Speak in 2-3 sentences MAX. Podcast pace, not essays.
- Reference SPECIFIC facts about Eddie's projects — names, numbers, file paths, model names, failure modes. NOT vague/generic.
- You have a specific position. Argue it. Push back on the other agents.
- Banter, teasing, and weird reactions are useful only when they reveal your worldview, expose an assumption, or force another agent to justify a claim.
- Do not add random jokes that do not move the thought forward.
- NO thinking blocks, NO tool calls, NO XML. Plain text only.
- If the previous speaker agreed with everything, you MUST disagree or add a new angle.
- Call out when the conversation is going in circles.
"""


def build_messages(agent, all_messages_so_far):
    """Build message list with explicit position reminder and call-outs."""
    recent = "\n".join(
        f"{n}: {t}" for n, t in all_messages_so_far[-4:]
    ) if all_messages_so_far else "No previous messages — you open."

    last_speaker = all_messages_so_far[-1][0] if all_messages_so_far else None

    challenge_map = {
        "goose": "If Hermes or OpenClaude said something wishy-washy, call them out specifically.",
        "hermes": "If Goose said something reckless or OpenClaude went too abstract, push back.",
        "openclaude": "Challenge the assumptions in whatever was just said. Ask the uncomfortable question."
    }

    return [{
        "role": "user",
        "content": f"""Recent conversation:
{recent}

{agent['name']}, you are on the "{agent['vibe']}" side of: "{TOPIC}"
{challenge_map[agent['id']]}
Be specific, be punchy, be in character."""
    }]


# ── Episode ───────────────────────────────────────────────────────────────────

def run_episode():
    os.makedirs(TMP_DIR, exist_ok=True)

    print(f"\n🎙️  EPISODE STARTING: {TOPIC}\n")

    tg_send(f"🎙️ *PODCAST EPISODE LIVE*\n\nTopic: _{TOPIC}_\n\nAgents:\n" +
        "\n".join(f"• {a['name']} [{a['vibe']}]" for a in AGENTS) +
        f"\n\n_{MAX_TURNS} turns, audio clips incoming..._")

    episode_start = time.time()
    all_messages = []  # [(agent_name, text)]

    for turn in range(1, MAX_TURNS + 1):
        for agent in AGENTS:
            print(f"\n[{turn}/{MAX_TURNS}] {agent['name']}...")

            messages = build_messages(agent, all_messages)
            text = minimax_chat(messages, system=build_system_prompt(agent))

            if not text or len(text) < 3:
                cp = agent["catchphrases"]
                text = f"{agent['name']} says: {cp[len(cp)//2]}"
                print(f"  [FALLBACK] {text}")

            text = text.strip()[:500]
            all_messages.append((agent["name"], text))

            # Send text update
            short = text[:180] + ("…" if len(text) > 180 else "")
            vibe = agent["vibe"].ljust(12)[:12]
            tg_send(
                f"▌ {agent['name'].upper()} [{vibe}] ({turn}/{MAX_TURNS})\n_{short}_"
            )

            # TTS + audio
            mp3_path = os.path.join(TMP_DIR, f"clip_{turn}_{agent['id']}.mp3")
            tts_ok = generate_tts(text, agent["voice"], mp3_path)

            if tts_ok and os.path.exists(mp3_path):
                size_kb = os.path.getsize(mp3_path) // 1024
                print(f"  TTS: {size_kb}KB → sending...")
                send_audio(mp3_path, f"▌ {agent['name']}: {short}")
                try:
                    os.unlink(mp3_path)
                except Exception:
                    pass
            else:
                print(f"  [TTS SKIP] no audio generated")

            time.sleep(0.5)  # Brief pause between turns

    # Episode summary
    elapsed = int(time.time() - episode_start)
    mins = elapsed // 60
    secs = elapsed % 60
    agent_names = ", ".join(dict.fromkeys(n for n, _ in all_messages))

    tg_send(
        f"🏁 *EPISODE ENDED*\n\n"
        f"Topic: _{TOPIC}_\n"
        f"Duration: {mins}m {secs}s\n"
        f"Turns: {len(all_messages)}\n"
        f"Agents: {agent_names}\n\n"
        f"_Audio clips above — stitch them together for the full episode._"
    )

    print(f"\n✅ Episode complete! {len(all_messages)} messages in {mins}m {secs}s")
    for name, text in all_messages:
        print(f"  {name}: {text[:80]}")


if __name__ == "__main__":
    run_episode()
