# PURPCLAW — Current State

## Services Running

| Service | Port | Status | Notes |
|---|---|---|---|
| Next.js WebUI | :3000 | check locally | Main UI |
| PM2 daemon | — | check `pm2 list` | 26 services registered |
| Cognitive spine | :7880 | check locally | FAISS vector store |
| Orchestrator | :7784 | check locally | Agent tower |
| TTS gateway | :7799 | check locally | Kokoro + edge-tts |
| STT gateway | :7896 | check locally | faster-whisper |

## Native Tools

| File | Count | Type |
|---|---|---|
| lib/tools/index.js | 30 | Terminal, file, git, search, dev |
| lib/tools/skills-registry.js | 1 | Skill loader |
| **Total** | **31** | |

Note: `lib/tools-pc.js` was deleted — the 49 PC-control tools are no longer available.

## OmniCode MCP

- OmniCode MCP lives in a **separate repo**: `E:/god folder/02_ACTIVE_PROJECTS/omnicode-platform/omnicode-mcp/`
- 45 tool modules in the MCP server
- NOT bundled inside PURPCLAW
- `lib/mcp.js` exists but no servers are configured (no mcp.json)

## Skills

- 383 skills in skills/ directory
- Skills registry at skills/registry.txt
- Categories: coding, devops, research, autonomous-agents, mlops, creative, etc.

## Identity & Workspace

| File | Purpose |
|---|---|
| workspace/SOUL.md | Core identity |
| workspace/IDENTITY.md | Agent persona |
| workspace/USER.md | User profile |
| workspace/AGENTS.md | Agent definitions |
| workspace/BOOT.md | Boot sequence |
| workspace/TOOLS.md | Tool registry |
| registry/souls.json | Soul definitions |
| registry/council-profiles.json | Council governance |

## PM2 Status

PM2 daemon is running but no services are currently active. Services are registered in ecosystem.config.js. To start: `pm2 start ecosystem.config.js`

## Actual Numbers (2026-07-03 verified)

```
Native tools:     31  (30 + 1)
OmniCode MCP:    45  (separate repo — not bundled)
Accessible tools: 76 (31 + 45)
Skills:          383
Agent personas:   42
PM2 services:    26
API routes:       85
Pages:            25
Providers:        17
```
