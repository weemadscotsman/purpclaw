# Prove-It Testing Pattern (Eddie's Law)

> "PROVE THAT AGAIN"

Eddie demands real proof, not claims. Every feature, every tool, every service must be verified on real hardware with live output. No stubs, no faked curl responses, no "it should work."

## The pattern

For any claimed capability:

1. **List the claim** — what you say works
2. **Run it live** — on Eddie's actual hardware
3. **Show the output** — unedited, unfaked terminal output
4. **Count successes vs failures** — honest accounting

## Example: OmniCode MCP tools (2026-06-06)

Claim: "42 MCP tools available"

Test:
```
1. health_check         → ✅ OK: {"status":"healthy","version":"0.1.0","rbac":"enforcing"}
2. session_resume_brief → ✅ OK: {"repo":{"name":"PURPCLAW","path":"..."}}
3. get_tool_schema      → ✅ OK: search_symbols schema returned
4. runtime_telemetry    → ✅ OK: win32 x64 · 23.97 GB RAM
5. get_session_stats    → ✅ OK: token savings stats live
6. list_tools           → ✅ OK: 42 tools in full mode
```

Result: 6/6 tools verified live. NOT "should work" — actually works.

## Example: Provider HAL test (2026-06-06)

Claim: "17 providers, switch mid-call"

Test:
```
deepseek → "Hello hi hey" | model: deepseek-v4-pro
ollama   → "Hi there!"     | model: qwen2.5:3b
```
Both providers return real responses on the same interface.

## The standard

- Never say "X works" without showing real output from X
- Tools that return empty but don't crash = "needs arg fix" NOT "broken"
- Always count: N/N tested, not "most work"
- The user WILL call you out if you fake it