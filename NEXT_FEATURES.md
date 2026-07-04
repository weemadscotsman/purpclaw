# PURPCLAW — Next Features

## Must-Fix (startup)

| # | Item | Why |
|---|------|-----|
| 1 | Start PM2 services | 26 registered, 0 running — runtime is dark |
| 2 | Create .env.example | No template for LLM provider keys |
| 3 | Expand README | 110 lines for 122-tool system is thin |

## Should-Improve

| Item | Why |
|------|-----|
| Runtime smoke test | Run `purpclaw ask "hello"` to verify full stack |
| Skills registry audit | 383 skills — some may be stale or broken |
| Memory audit | FAISS cognitive spine, training buffer, session memory |
| Provider routing | Verify MiniMax-M3 is configured as primary |

## Architecture Decisions Needed

| Decision | Options |
|----------|---------|
| WebUI framework | Next.js app/ or standalone? |
| Agent memory | FAISS + NDJSON training buffer — is it working? |
| MCP client | Native or bridged? |
| G0DM0D3 integration | Wired but untested? |

## Do Not Touch (working)

```
bin/purpclaw.js (5969 lines, complex)
lib/agent-loop.js
lib/llm-provider.js
lib/unified_api.js
lib/api-harness-kernel.js
ecosystem.config.js
```

## Skills Cleanup Opportunity

383 skills is a large ecosystem. Some may be:
- Duplicates (same skill, different name)
- Stale (referencing old file paths)
- Experimental (marked as such but not documented)

Consider: skills audit → deduplicate → categorize → document trigger phrases.
