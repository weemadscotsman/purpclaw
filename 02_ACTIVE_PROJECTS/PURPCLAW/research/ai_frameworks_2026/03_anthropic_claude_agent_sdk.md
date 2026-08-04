# 03 — Anthropic Claude Agent SDK

**Tier:** 1 (Enterprise / Hyperscaler)  
**Vendor:** Anthropic  
**License:** Open-source SDK (Python + TypeScript), Claude API proprietary  
**Initial release:** 2024 (Claude computer use), expanded 2025  
**Last major update:** 2025 (Agent Skills, MCP integration, sub-agents)

---

## What it is
Anthropic's agent framework built around Claude's tool-use capabilities. Originally focused on "computer use" (Claude controlling a desktop), now a full SDK for building autonomous agents with native support for the **Model Context Protocol (MCP)**, sub-agents, Skills (reusable capability bundles), and long-horizon task execution.

## Core capabilities
- [x] MCP-native (Anthropic's open standard)
- [x] Computer use (screenshot + mouse/keyboard)
- [x] Tool use (bash, file edit, web search)
- [x] Sub-agents (orchestrator spawning workers)
- [x] Agent Skills (bundled reusable prompts/tools)
- [x] Long-horizon execution (hours+)
- [x] Context management (compaction, summarization)
- [x] Claude Sonnet/Opus/Haiku support
- [x] Session forking (resume from checkpoints)
- [x] Permission system (allow/deny tools)

## Architecture
- Loop: observe → think → act → observe
- Tools: Bash, Read, Write, Edit, Glob, Grep, WebSearch, WebFetch, computer (mouse/keyboard/screenshot)
- Sub-agents: each has own context window
- Skills: markdown prompts + tool configs loaded on demand
- MCP servers: external tool/resource providers

## Strengths
- Best-in-class tool use (Claude is optimized for it)
- Computer use is unique and powerful
- MCP is open standard, adopted by competitors
- Skills system is genuinely useful for specialization
- Strong prompt caching for cost

## Weaknesses
- Claude API lock-in (model)
- Computer use expensive ($ per screenshot)
- Smaller ecosystem than LangChain
- Sub-agent coordination is basic (no DAG)

## Best use case
Claude-native agents, especially those needing browser/desktop control or MCP tool servers. Coding agents, research agents, anything needing robust tool use.

## PURPCLAW fit: 8/10
- Excellent fit since PURPCLAW can register MCP servers
- Computer use is unique value-add for desktop OS
- Skills align with PURPCLAW's agent personas

## Integration sketch
```python
from claude_code_sdk import query, ClaudeCodeOptions

options = ClaudeCodeOptions(
    system_prompt="You are ROBOT, the precision engineer...",
    allowed_tools=["Bash", "Read", "Write", "Edit", "mcp__purpclaw__*"]
)

async for message in query(prompt="Audit agent telemetry", options=options):
    print(message)
```

## Sources
- https://docs.anthropic.com/en/docs/agents-and-tools/claude-agent-sdk/overview
- https://www.anthropic.com/engineering/building-effective-agents
- https://modelcontextprotocol.io/
