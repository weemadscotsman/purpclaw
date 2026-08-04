# PURPCLAW Architecture

> Version source: `package.json` · Updated: 2026-08-04 · Status: CURRENT

## Thesis

PurpClaw is a local-first AI workstation OS and governed organisation runtime. Multiple personalities, models and surfaces are allowed; duplicated execution, permission, persistence and evidence plumbing are not.

## Canonical Execution Spine

```text
Request
  -> surface adapter
  -> AgentGateway
  -> provider/lane resolution
  -> context + session assembly
  -> agent loop or pipeline runner
  -> ToolRuntime policy decision
  -> tool/model execution
  -> verification
  -> proof ledger + session persistence + memory/timeline
  -> shared result envelope
```

Every supported surface must use this spine or a documented adapter that rejoins it before execution.

## Major Layers

| Layer | Purpose | Primary truth |
|---|---|---|
| Operator surfaces | CLI, TUI, Mission Control and supported external entry points | route and command source |
| Agent gateway | request normalisation, agent/provider selection and routing | `lib/agent-gateway.js` and routing source |
| Sessions and context | persistence, resume, branching and context assembly | session repository and memory source |
| Agent execution | tool loop, orchestration, delegation and stop control | agent loop and pipeline registry |
| Tools and policy | registry, caller identity, permissions and dispatch | `lib/tools/index.js`, `lib/tool-runtime.js` |
| Evidence | verification, proof receipts and audit history | tests, proof ledger and generated reports |
| Runtime services | service definitions, ports and health | `service_registry.js`, `ecosystem.config.js` |
| Organisation | Oracle, chairs, councils, Studio and governance | workspace and registry sources |
| Continuity | Timeline, Presence, Residue and durable memory | registry and memory source |
| Evolution | Donor Archaeology, Auto-Evolve and AutoResearch | governed proposal and training sources |

## Organisation Model

```text
Question or world event
  -> classify domain
  -> select Oracle or relevant chair
  -> invite relevant specialists
  -> debate, verify and red-team
  -> record decision
  -> assign actions
  -> execute through the canonical runtime
  -> record proof, memory and Timeline evidence
```

Agents may have identity, values and organisational roles, but identity never grants an execution bypass.

## Workspace and Concurrency

The canonical tree is the default workspace. Concurrent write-capable agents require explicit path ownership and registered temporary isolation. The registry entry must contain agent, task, branch, path, creation time, expiry and status. Temporary workspaces are deleted after integration or abandonment.

Critics remain independent, do not modify production code and evaluate candidate commits from clean temporary checkouts.

## External Harness References

Codex, Claude Code, Hermes and MiniMax Code inform behavioural benchmarks:

- Codex: precise repo editing, diffs and test-led completion.
- Claude Code: large-context synthesis and architecture reasoning.
- Hermes: tool orchestration, retry state and artifact workflows.
- MiniMax Code: rapid component generation and visual iteration.

They map onto PurpClaw's shared runtime contract. They must not create four separate runtimes.

## Architecture Guardrails

- No second session framework.
- No second permission runtime.
- No second provider-routing authority.
- No direct MCP shell bypass.
- No pass status without verification evidence.
- No copied registry counts or live claims in hand-written docs.
- No new competing parity roadmap.
