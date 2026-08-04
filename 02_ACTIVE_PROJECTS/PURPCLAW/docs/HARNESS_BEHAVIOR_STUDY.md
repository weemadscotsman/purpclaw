# Serious Harness Behavior Study

Date: 2026-07-12. Scope: production coding/general-agent harness behavior worth rebuilding inside PURPCLAW. Only official documentation and official repositories were used. PURPCLAW retains its own architecture, identity, provider routing, tools, and UI.

## Sources studied

- Hermes Agent: official repository architecture, gateway/session lifecycle, goal judge, desktop and programmatic integration.
- Codex: [official app-server protocol](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md), [official configuration schema](https://github.com/openai/codex/blob/main/codex-rs/core/config.schema.json), and official repository guidance.
- Claude Code: [official CLI reference](https://docs.anthropic.com/en/docs/claude-code/cli-usage) covering exact session resume, scoped allowed/disallowed tools, permission modes, structured output, and non-interactive permission delegation.
- OpenHands: [persistence](https://docs.openhands.dev/sdk/guides/convo-persistence), [SDK architecture](https://docs.openhands.dev/sdk/arch/sdk), [runtime architecture](https://docs.openhands.dev/openhands/usage/architecture/runtime), and resumable task-tool documentation.
- Aider: [repository maps](https://aider.chat/docs/repomap.html), [edit formats](https://aider.chat/docs/more/edit-formats.html), and [automatic lint/test repair](https://aider.chat/docs/usage/lint-test.html).
- Goose: [official product documentation](https://block.github.io/goose/) for portable parameterized recipes, MCP extensions/apps, ACP, subagents, security review, and shared desktop/CLI/API behavior.
- Cline: official documentation was searched for checkpoints, task history, browser use, MCP and rules. PURPCLAW already had checkpoints/rollback, browser tools, MCP, and durable project instructions; no Cline-specific code was copied.
- OpenAI Agents SDK: [agents](https://openai.github.io/openai-agents-python/agents/), [handoffs](https://openai.github.io/openai-agents-python/handoffs/), [running agents](https://openai.github.io/openai-agents-python/running_agents/), and [tracing](https://openai.github.io/openai-agents-python/tracing/) for typed handoffs, guardrails, lifecycle hooks, sessions, and hierarchical traces.
- Anthropic Claude Agent SDK: [official SDK overview](https://docs.anthropic.com/en/docs/claude-code/sdk/sdk-overview) and Claude Code permission/session documentation for resumable sessions, hooks, tool policy, and programmatic agents.
- Google ADK: [session service](https://google.github.io/adk-docs/api-reference/java/com/google/adk/sessions/BaseSessionService.html), workflow, evaluation, deployment, A2A, and observability documentation for state deltas, event streams, artifacts, sequential/parallel/loop agents, and trace-backed evals.
- LangGraph: [subgraphs](https://docs.langchain.com/oss/python/langgraph/use-subgraphs) and [time travel](https://docs.langchain.com/oss/python/langgraph/use-time-travel) for checkpoint modes, interrupts, replay, resume, and forked state.
- CrewAI: official agents/tasks/crews/flows documentation for sequential and hierarchical process modes, persisted flows, state, human feedback, and event listeners.
- AutoGen: [teams](https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/tutorial/teams.html), [state](https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/tutorial/state.html), and graph-flow references for portable team state, handoffs, termination conditions, fan-out, joins, branches, and bounded loops.
- Pydantic AI: official graph/decision and [eval dataset](https://ai.pydantic.dev/evals/how-to/dataset-serialization/) documentation for typed input/output, schema validation, durable graphs, JSON/YAML cases, and composable evaluators.
- Semantic Kernel: [agent orchestration](https://learn.microsoft.com/en-us/semantic-kernel/frameworks/agent/agent-orchestration/) and filters documentation for concurrent, sequential, handoff, group-chat and magentic patterns with invocation filters.
- Haystack: official pipeline, serialization, tracing, and [breakpoint](https://docs.haystack.deepset.ai/docs/pipeline-breakpoints) documentation for typed component graphs and persisted execution snapshots.
- DSPy: [official documentation](https://dspy.ai/) for typed signatures, composable modules, metric-based evaluation, and optimizer-selected prompt programs.
- LlamaIndex: official workflows and agent documentation for event-driven steps, context/state, human-in-the-loop events, checkpointing, and document/RAG connectors.

## Accepted behaviors rebuilt as PURPCLAW-native

| Source advantage | PURPCLAW implementation | Proof |
|---|---|---|
| Typed, replayable event trajectory (OpenHands/Codex) | SQLite append-only `event-ledger`; paged list/replay over gateway | `scripts/test-harness-behaviors.js` |
| Query-aware compact repository map (Aider) | Token-budgeted symbol map, ignored generated/vendor trees, prompt relevance ranking and cache | `scripts/test-harness-behaviors.js` |
| Automatic post-edit lint/test repair (Aider) | Configurable verification runner; failures feed a repair turn; success is withheld until checks pass | `scripts/test-verification-runner.js` plus gateway contracts |
| Portable parameterized workflows (Goose) | YAML recipes with parameters, prompt/tool/subrecipe steps, shared sessions, approvals and events | `scripts/test-recipe-manager.js` |
| Scoped permissions and session approvals (Claude/Codex) | plan/standard/trusted/autonomous/dangerous profiles; explicit patterns beat defaults; true session caching | `scripts/test-permission-manager.js` |
| Isolated execution backends (OpenHands) | Pluggable local/WSL/Docker/SSH runtime discovery and execution; no silent fallback; gateway approval gate | `scripts/test-execution-runtime.js` |
| Durable goals with strict continuation judge (Hermes/Codex) | DONE/CONTINUE/WAIT controller, evidence contract, wait without turn burn, parse-failure pause | `scripts/test-goal-controller.js` |
| Rich bidirectional client protocol (Hermes/Codex/Goose) | Shared JSON-RPC/WebSocket, HTTP/OpenAI-compatible API, ACP, approvals, artifacts, recipes and runtime events | gateway/ACP tests and Electron E2E |
| Persistent attachments and artifacts (Hermes/Goose) | SHA-addressed attachments, session artifacts, tool-output discovery, desktop preview | attachment/artifact tests and desktop build |
| Durable graphs, interrupts, replay and portable state (LangGraph/ADK/AutoGen/Pydantic/Haystack/LlamaIndex) | SQLite workflow runs and per-node checkpoints; prompt/tool/handoff/set/condition/parallel/loop/interrupt nodes; resume after process loss | `scripts/test-advanced-harness.js` |
| Typed outputs and tripwire guardrails (OpenAI/Pydantic/Semantic Kernel) | JSON Schema validation plus input/output/handoff guardrails; structured results returned by the canonical gateway | `scripts/test-advanced-harness.js` and gateway contract |
| Hierarchical observability (OpenAI/ADK/Pydantic) | Durable traces and parentable spans with status, timing, metadata and sensitive-payload redaction | `scripts/test-advanced-harness.js` |
| Dataset evaluation and prompt selection (Pydantic/DSPy/ADK) | JSON cases, exact/contains/regex/schema scorers, thresholds, comparable variants and winning variant selection | `scripts/test-advanced-harness.js`; `purpclaw eval` |
| Human approval across rich clients (Codex/Claude/OpenHands) | Gateway approval cache plus desktop allow-once/session/deny controls; trusted local operator mode and fail-closed autonomous mode | permission contract and Electron E2E |

## Behaviors deliberately not copied blindly

- No provider-specific identity or proprietary authentication was transplanted. PURPCLAW keeps MiniMax as the currently proven provider and the existing provider registry for later adapters.
- No unsafe “skip all permissions” default. The dangerous profile exists only as an explicit mode; remote and autonomous work fail closed.
- No fake sandbox label. Docker is reported unavailable on this machine; local execution says `isolation: none`; WSL/Docker/SSH availability is probed.
- No full-history payload requirement for every client. SQLite event/session paging prevents multi-gigabyte resume payloads.
- No desktop-private agent backend. The packaged desktop consumes the same gateway used by CLI, web, ACP, cron, recipes, and messaging.

## Remaining audit rule

A behavior is complete only when its current implementation has a contract test and, where applicable, a real process/provider/client E2E. File presence and feature counts are not proof.
