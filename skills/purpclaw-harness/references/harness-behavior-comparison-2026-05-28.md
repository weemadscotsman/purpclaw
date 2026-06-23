# Harness Behavioral Comparison (2026-05-28)

## Core Finding

**Same model (MiniMax-M2.7), same API key, different behavior across harnesses.**
The API is the engine. The harness is the driver. Different drivers = different results.

```
MiniMax Agent (Electron app) → feels sharp and tight
Hermes (CLI) → acts dumb / verbose in same harness context
PURPCLAW (orchestrator.js) → DIY stack, different prompt framing
```

**Root cause:** System prompt framing, context injection size, tool exposure, and turn budget vary by harness. Not the model.

## Three Harnesses Compared

### MiniMax Agent (Electron app)
- Config: `C:/Users/Admin/AppData/Roaming/MiniMax Agent/minimax-agent-config.json`
- Workspace: `C:\Users\Admin\.minimax-agent\projects`
- **Internal prompts are compiled into the Electron binary — invisible to inspection**
- "Code is cheap, show me the requirement" — product framing, tight requirement elicitation
- Native MCP integrations (GitHub/GitLab/Slack/Figma)
- Polished UX, integrated tools = professional results without DIY effort

### Hermes (CLI)
- Config: `C:/Users/Admin/AppData/Local/hermes/config.yaml`
- Model: MiniMax-M2.7, provider: minimax, base_url: https://api.minimax.io/v1
- `api_key: ''` — pulls from `MINIMAX_API_KEY` env var
- Personality presets in config (helpful, concise, technical, creative, teacher)
- `max_turns: 90` — conversation management differs from MiniMax Agent
- No custom system prompt override visible in config
- Behavior gap likely from: context injection size, tool exposure level, prompt framing

### PURPCLAW (orchestrator.js)
- `.env`: `LLM_PROVIDER=minimax`, `LLM_MODEL=MiniMax-M2.7`, same `MINIMAX_API_KEY=sk-cp-...DlqQ`
- OpenClaw agent tower (port 18789) + orchestrator (port 7784)
- 44 swarm agents, 9 divisions, multi-service PM2 stack
- DIY prompt framing — what gets sent to the API is whatever the orchestrator/builders configured
- **Behavioral gap is in the orchestration prompt layer, not the API**

## Diagnostic Pattern — Same Model, Different Behavior

When Ted says "works in X harness but not in Y harness" with the same API key:

1. **Confirm same API key:** Check `.env` / `config.yaml` for `MINIMAX_API_KEY` vs `LLM_API_KEY`
2. **Confirm same model:** `MiniMax-M2.7` in all three
3. **The difference is the harness:** System prompts + context injection + tool exposure

```bash
# Check Hermes API key
grep -i minimax ~/AppData/Local/hermes/config.yaml

# Check PURPCLAW API key  
grep MINIMAX_API_KEY "E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/.env"

# MiniMax Agent key location
cat "C:/Users/Admin/AppData/Roaming/MiniMax Agent/minimax-agent-config.json" | python3 -m json.tool
```

## What MiniMax Agent Does Better (Product vs DIY)

1. **Requirement framing** — "Code is cheap, show me the requirement" philosophy
2. **Tool integration** — Native MCP (GitHub/GitLab/Slack/Figma), not custom HTTP wrappers
3. **Context management** — Lean per-turn context, less noise injection
4. **Turn budget** — Different conversation management = different follow-through

## To Align PURPCLAW with MiniMax Agent Quality

Options:
1. **Audit orchestration prompts** — log what orchestrator.js sends to the API vs what MiniMax Agent sends
2. **Add API key to HERMES config** — `api_key: ''` currently empty, pull from env or hardcode
3. **Import MCP integrations** — MiniMax Agent's native tool hooks vs PURPCLAW's custom HTTP wrappers
4. **Frame prompts with requirement-first philosophy** — "show me the requirement" not "write me code"

## Key Files

| Harness | Config Location | API Key Var |
|---------|----------------|-------------|
| MiniMax Agent | `AppData/Roaming/MiniMax Agent/` | `accessToken` (OAuth, different from API key) |
| Hermes | `AppData/Local/hermes/config.yaml` | `MINIMAX_API_KEY` env var |
| PURPCLAW | `E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/.env` | `MINIMAX_API_KEY=sk-cp-...` |

## Note on MiniMax Agent Internal Prompts

MiniMax Agent's system prompts are **compiled into the Electron binary** — not accessible to file inspection. Whatever framing makes it feel sharp is baked into the app itself. This is the "secret sauce" that explains the behavioral gap without a code difference.

To replicate MiniMax Agent quality in other harnesses: capture the output patterns (what it produces) and reverse-engineer the input framing that likely produces them.