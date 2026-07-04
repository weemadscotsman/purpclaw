# PURPCLAW — Product Definition

```
Product:   PURPCLAW — Local-first AI Organisation Runtime
Version:   0.3.0
Status:    Advanced prototype (open-source CLI, multi-provider agent system)
Git:       github.com/weemadscotsman/purpclaw
Runtime:   Node.js CLI, PM2 managed, 26 services, 42 agent personas
           31 native tools + 45 OmniCode MCP = 76 accessible tools
Providers: 17 (openai, anthropic, gemini, kimi, glm, minimax, groq,
           deepseek, nvidia, together, mistral, huggingface, cloudflare,
           cohere, ollama, lmstudio, custom)
```

## Six Connected Layers

| Layer | Purpose | Location |
|---|---|---|
| Identity | Souls, interviews, values, fears, goals | registry/souls.json |
| Governance | Oracle, Council, dynamic chairs, votes, reputation | purpclaw council |
| Workflow | Discovery, planning, solutioning, implementation | purpclaw next |
| Studio | Council, radio, arena, emergency, commentary | lib/studio.js |
| Ecology | Timeline, Presence, Residue, meeting memory | purpclaw timeline |
| Evolution | AutoResearch, Auto-Evolve, donor archaeology | purpclaw autoresearch |

## Numbers (verified 2026-07-03)

```
Native tools:   30 (lib/tools/index.js) + 1 (skills-registry.js) = 31
OmniCode MCP:  45 tool modules (in omnicode-platform/ — separate repo)
Total accessible: 31 native + 45 OmniCode = 76
Note: lib/tools-pc.js was deleted — previous "80 native tools" claim is stale
PM2 services:  26
Agent personas: 42 (skills/*/AGENT.md files)
Skills:        383 (skill folders)
Providers:     17 (configured in lib/llm-provider.js)
API routes:    85
Next.js pages: 25
CLI entry:     bin/purpclaw.js
```

## Architecture

```
bin/purpclaw.js (CLI) → unified_api.js → agent-loop.js → llm-provider.js
                                                          → lib/tools/index.js (30 tools)
                                                          → lib/tools/skills-registry.js (1 skill-as-tool)
                                                          → lib/mcp.js (MCP client — no servers loaded)
                                                          → orchestrator :7784 → agent_tower :7790
                                                          → cognitive_spine :7880 (FAISS vector)
                                                          → tts :7799
                                                          → stt :7896
```

## Key Files

- bin/purpclaw.js — CLI entry
- lib/agent-loop.js — agent execution loop
- lib/llm-provider.js — 17-provider routing
- lib/unified_api.js — unified REST API
- lib/tools/index.js — 30 native tools
- lib/tools/skills-registry.js — 1 skill-as-tool
- skills/ — 383 skill definitions
- workspace/ — identity, soul, boot, tools
- ecosystem.config.js — 26 PM2 services

## OmniCode MCP

The OmniCode MCP server (45 tool modules) lives in a **separate repo**:
`E:/god folder/02_ACTIVE_PROJECTS/omnicode-platform/omnicode-mcp/`

It is NOT bundled inside PURPCLAW. To use OmniCode tools, run the OmniCode MCP server separately and configure it in `~/.purpclaw/mcp.json`.

## Runtime Status

- PM2: 26 services registered (actual running count varies — check `pm2 list`)
- HTTP: :3000 serving (Next.js app)
- Memory: FAISS vector on cognitive spine :7880
- OmniCode MCP: NOT loaded (no mcp.json config)

## Product Vision

Open-source coding-agent CLI like Claude Code with multi-provider support, terminal-first with TUI + WebUI, MCP native, self-improving via Karpathy ratchet, G0DM0D3 integration. No proprietary lock-in.
