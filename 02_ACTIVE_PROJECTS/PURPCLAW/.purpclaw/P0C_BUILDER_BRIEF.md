# P0-C Builder Brief: Make Provider Settings Real

## COMPONENT
P0-C — Make provider settings real: bridge user-configured lanes into the actual model execution path.

---

## ORIGINAL CAMPAIGN GOAL
Make PURPCLAW's canonical runtime bootable, persistent, permission-governed and controlled by genuine provider settings.

---

## CANONICAL REFERENCES
- `AGENT.md`
- `docs/parity/CANONICAL_PARITY_PRIORITY.md`
- `docs/parity/AUDIT_WAVE1_UNIFIED_RUNTIME.md` (§3.3 provider routing, §3.4 permission layers, §4 config precedence)
- `docs/parity/WAVE1_CAMPAIGN_GOVERNANCE.md`
- `docs/parity/WAVE1_MASTER_GOAL.md`

---

## CURRENT VERIFIED FAILURE
The settings UI writes lane overrides to `~/.purpclaw/provider-config.json` via
`lib/runtime/provider-config.js`. The agent loop never reads that file.

- `lib/llm-provider.js:333 resolveConfig` — env-only (what every actual model call uses)
- `lib/runtime/provider-router.js:71 resolveLane` — reads user config (`provider-config.json`), but is **only consumed** by status/health endpoints: `/api/providers`, `/api/heartbeat`, `lib/system-manifest.js`, `lib/model-sentinel.js`, `scripts/heartbeat.js`
- verified by: `rg provider-router` hits none of `llm-provider.js`, `agent-loop.js`, `unified_api.js`, or `lib/agent-*`
- Changing a lane in the desktop/WebUI settings changes nothing in the actual model calls
- Agent loop, CLI, and desktop all read env vars; the settings page writes to a file nobody consumes at runtime

---

## DECISIONS ALREADY MADE
- One provider configuration source: `provider-config.json` via `resolveLane` / `provider-config.js`
- `resolveLane()` must be consumed by actual model execution, not only status endpoints
- Provider/model/fallback must be visible in execution evidence (source field in return value)
- Settings must work identically across CLI, desktop and web surfaces
- Precedence documented at `lib/runtime/provider-router.js:76-79`:
  **user-config > env > lane built-in default**
- The capability fallback chain (preferred provider unusable → next in chain → ollama) applies on top of precedence
- `resolveLane()` accepts a lane object or lane name string; LANES definitions at `lib/runtime/provider-router.js:99+`

---

## EXCLUSIVE WRITABLE PATHS
Begin with:
- `lib/llm-provider.js` — `resolveConfig` (line ~333), `resolvePooledConfig`, `streamChat`
- `lib/runtime/provider-router.js` — `resolveLane` (line ~71), lane definitions
- `lib/runtime/provider-config.js` — `load`, `getLane`, `configPath`
- Tests: `tests/` directory — lane routing tests

---

## READ-ONLY RELATED PATHS
- `lib/agent-loop.js` (calls `resolveConfig` indirectly via `llmProvider`)
- `lib/agent-router.js`
- `lib/agent-gateway.js`
- `lib/commands/ask.js`
- `unified_api.js` (tool + chat paths)
- `agent_tower.js`
- `app/api/providers/route.ts`
- `app/api/heartbeat/route.ts`
- `lib/system-manifest.js`
- `lib/model-sentinel.js`
- `scripts/heartbeat.js`
- Permission/lifecycle modules
- All session persistence modules
- `docs/parity/AUDIT_WAVE1_UNIFIED_RUNTIME.md`

---

## FORBIDDEN CHANGES
- Do not touch permission work (P0-B)
- Do not touch session persistence (P0-A) or the 22 DatabaseSync files
- Do not begin Chunk work or feature parity
- Do not modify `lib/mcp-server.js` execution
- Do not touch `unified_api.js` permission routing
- Do not add new configuration sources — consolidate to `provider-config.json` / `resolveLane` only
- No new abstraction directories

---

## ACCEPTANCE TESTS

### Core routing tests
1. `resolveConfig` returns the same `{provider, model}` that `resolveLane(lane)` returns for the same lane, respecting user-config > env > default.
2. Writing a lane override to `provider-config.json` changes the output of `resolveConfig` for that lane's envKey.
3. Two different lanes resolve to two different providers when lane overrides differ.

### Integration / execution evidence tests
4. A model call through `llm-provider.js` carries `{source}` in its resolved config, indicating `user-config`, `env`, or `default`.
5. When the preferred provider key is unusable, the `fellBackFrom` field is populated.
6. The execution evidence (source, fellBackFrom, provider, model) is logged or attachable to the chat audit trail.

### Cross-surface tests
7. Changing a lane in settings (write to `provider-config.json`) changes the model called by `purpclaw ask` without restart.
8. Desktop WebUI settings change the same runtime that CLI and agents use.
9. Lane resolution works identically when triggered from: CLI (`ask`), Web (`/api/chat`), Desktop (settings page), agent delegation.

### Precedence tests
10. User-config override on a lane is used even when env vars are set for that lane's `envKey`/`modelEnv`.
11. When user-config is absent but env is set, env value is used.
12. When neither user-config nor env is set, lane default is used.
13. Capability fallback still fires when user-config or env points to a provider with no usable key.

### Negative tests
14. A missing `provider-config.json` produces no error — falls through to env/default.
15. A lane with no override does not modify `provider-config.json` on read.

---

## REQUIRED EVIDENCE
- Reproduction: show that current `resolveConfig` ignores `provider-config.json`
- Diff: exact changes to `lib/llm-provider.js` (the `resolveConfig` function)
- Two-lane routing proof: test output showing `LANE_A → provider-X` and `LANE_B → provider-Y` with differing overrides
- Execution evidence proof: `{source: 'user-config', provider, model, fellBackFrom}` visible in resolved config
- Precedence proof: table showing user-config wins over env, env wins over default
- Cross-surface proof: same config changes both CLI and web execution paths
- No new files beyond test files

---

## MODEL AND REASONING BUDGET
- **Builder**: High reasoning
- **Search/test helpers**: Standard reasoning
- **Ultra/Max prohibited** unless the chief records a specific escalation
- Child agents may use Standard reasoning for file searches only

---

## COMMIT RULES
- Stage explicit paths only
- Show staged diff before commit
- Commit only after an independent critic returns PASS

---

## STOP CONDITION
Stop after P0-C passes. Do not begin P0-B (permissions), P0-D (Chunk), feature parity,
session persistence expansion, or any other P0 workstream.
