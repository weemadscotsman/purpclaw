# PURPCLAW Canonical Parity Priority List

Status: **CANONICAL — SOLE AUTHORITATIVE PARITY ROADMAP**. Adopted 2026-07-29.

This is the single parity list. Every agent follows it. All other parity docs
(`docs/CODEX_PARITY_*.md`, `docs/PARITY_*.md`, `docs/SURFACE_PARITY_*.md`,
`docs/MULTI_SYSTEM_PARITY_AUDIT.md`, `research/PARITY_GAPS.md`, etc.) are
historical input, not authority. Do not redefine parity from whichever file was
opened first.

Comparator note: treat **Open Claude** as **OpenClaw** for PURPCLAW parity work.
The separate **OpenClaude** CLI still contributes useful implementation ideas,
but it is not the primary product comparator.

## Canonical parity statement

> PURPCLAW parity is measured across five layers: runtime, agent workflow,
> product surfaces, platform integrations and ecosystem. A capability is
> complete only when it uses the shared runtime, has automated acceptance tests,
> works across supported surfaces, respects permission policy and produces
> auditable evidence.

## What the competitors actually bring

### OpenClaw

OpenClaw is primarily an always-on, self-hosted agent platform. Its strongest
areas are:

- one Gateway controlling sessions, routing and channel connections
- multi-agent routing with isolated sessions and workspaces
- browser Control UI, Windows Hub, macOS companion and mobile nodes
- numerous messaging channels
- browser, shell, media and device tools
- cron, heartbeat, hooks and webhooks
- memory, skills, plugins and the ClawHub registry
- per-agent sandbox and tool policies
- typed, resumable workflows through Lobster
- Canvas, voice, camera and device actions through paired nodes

### Codex

Codex's strongest product features are:

- desktop command centre for several parallel agents
- isolated Git worktrees
- in-thread diff review and commenting
- shared session history and configuration across CLI, app and IDE
- reusable Skills
- scheduled Automations with a review queue
- local CLI plus cloud agents
- multimodal input
- configurable sandbox and approval modes
- Slack integration, SDK and workspace administration
- plugins that package Skills and connected applications

### Hermes

Hermes is strongest as one highly extensible personal agent core exposed
everywhere:

- classic CLI, modern TUI, desktop app, dashboard and messaging gateway
- common sessions, configuration, skills and memory across surfaces
- many provider and model configurations
- profiles and fallback providers
- persistent session storage and full-text search
- built-in and external memory providers
- Skills Hub with several registries and security scanning
- plugins adding tools, hooks, slash commands, CLI commands and skills
- cron with agent and no-agent scheduled jobs
- MCP server/client support and ACP editor integration
- browser automation and macOS computer use
- several sandbox backends, including Docker, SSH, Modal and Daytona
- remote desktop connection to a headless Hermes backend

### Useful OpenClaude extras

The separate OpenClaude CLI adds several ideas worth reusing:

- background sessions with `ps`, logs and kill
- resume, continue and conversation forking
- per-agent model routing and step limits
- cheap-versus-strong smart model routing
- PageRank and tree-sitter repository maps
- headless bidirectional gRPC
- a project-aware VS Code control centre

---

## Priority 0: Core parity blockers

These must be solid before adding more product surface.

### 1. One canonical agent runtime

Every surface must use the same:

- agent loop
- tool registry
- provider layer
- session store
- permission engine
- skills
- hooks
- memory
- configuration

The CLI, desktop app, web UI, API server and IDE integration must be clients of
one runtime, not independent agents per interface.

**Definition of done:** a session started in the CLI resumes unchanged in
desktop and web, with identical tools, permissions and history.

### 2. Complete session lifecycle

Implement one consistent session subsystem:

- new
- list
- inspect
- resume
- continue latest
- fork
- rename
- archive
- unarchive
- delete
- export
- search
- prune
- attach
- background execution
- live logs
- cancellation
- parent/child relationships

**Definition of done:** interactive, background, desktop and delegated sessions
all appear in one searchable store with proper statuses and ancestry.

### 3. Real permission and sandbox engine

Build a single policy layer covering:

- read paths
- writable paths
- command execution
- network access
- MCP tools
- plugin tools
- destructive actions
- secrets
- approval escalation
- per-agent policies
- audit logs

Support at least:

- trusted/full access
- workspace write
- workspace read-only
- sandboxed
- deny-by-default
- unattended safe mode

**Definition of done:** the same policy decision occurs whether the command came
from the CLI, desktop, scheduler, subagent or remote gateway.

### 4. Reliable tool execution spine

The non-negotiable core tools are:

- read
- write
- patch
- file search
- text search
- directory listing
- terminal
- long-running process control
- structured code execution
- web search
- web fetch
- browser
- MCP
- skill loading
- task delegation
- image inspection

Add:

- streamed stdout and stderr
- timeouts
- cancellation
- output truncation with retrieval
- correct working-directory handling
- structured errors
- retry classification
- tool call IDs
- evidence capture

**Definition of done:** tools behave identically across Windows, Linux and
macOS, including background and delegated runs.

### 5. Provider, model and routing layer

Implement:

- multiple provider profiles
- API key and OAuth authentication
- model discovery
- model aliases
- primary and fallback models
- per-agent model overrides
- per-task routing
- cheap/strong routing
- context and output limit awareness
- capability detection
- rate-limit failover
- token and cost tracking

**Definition of done:** a user can route planning, coding and verification
agents to different models without restarting or copying credentials everywhere.

---

## Priority 1: Agent workflow parity

### 6. Skills, commands, hooks and plugins

Treat these as four different concepts:

- **Skills:** reusable instructions, scripts and resources
- **Commands:** explicit user-triggered actions
- **Hooks:** lifecycle reactions
- **Plugins:** executable extensions adding tools, providers, channels or UI

Required capabilities:

- personal and project-local scopes
- enable and disable
- precedence rules
- install, update and remove
- security scanning
- manifest validation
- environment and credential declarations
- automatic skill selection
- explicit skill invocation
- lifecycle hooks around prompts, tools, sessions and agent runs
- compatibility importers for Codex, Claude and OpenClaw bundles

**Definition of done:** one plugin can contribute a tool, hook, command and skill
without modifying PURPCLAW core.

### 7. Multi-agent orchestration with isolation

Implement:

- named agent roles
- concurrent subagents
- model routing by role
- per-agent permissions
- step and time budgets
- parent-child task trees
- cancellation and steering
- result aggregation
- shared goals
- independent worktrees
- conflict detection
- verifier agents
- explicit ownership boundaries

**Definition of done:** twelve agents can work on one repository without sharing
mutable working trees or overwriting one another's files.

### 8. Deterministic workflow engine

Do not make the model manually orchestrate every repeated process.

Add:

- typed workflow definitions
- sequential and parallel steps
- conditions
- retries
- approval checkpoints
- resumable tokens
- persisted state
- structured outputs
- replay
- audit history

**Definition of done:** a release, audit or migration workflow can pause for
approval and continue without rerunning completed stages.

### 9. Verification and evidence system

Every agent task should produce:

- files changed
- commands run
- test results
- screenshots where applicable
- before and after metrics
- unresolved risks
- commit identifier
- machine-readable result status

Add a canonical parity harness that runs against PURPCLAW, Codex-compatible and
Hermes-compatible behaviours.

**Definition of done:** completed is impossible unless acceptance checks pass or
the agent explicitly returns blocked.

---

## Priority 2: Product parity

### 10. Desktop command centre

Build:

- projects sidebar
- several simultaneous threads
- active/background status
- live tool activity
- structured tool summaries
- diff viewer
- inline review comments
- file browser
- preview pane
- terminal output
- session search
- model and permission controls
- skills and plugin management
- scheduler view
- review inbox
- desktop notifications

**Definition of done:** you can supervise twelve agents without arranging twelve
terminal windows.

### 11. Headless agent server and remote clients

Choose one canonical protocol internally, then provide adapters:

- WebSocket/JSON-RPC for desktop and web
- gRPC for integrations
- MCP server mode
- OpenAI-compatible HTTP endpoint
- authentication
- remote backend profiles
- reconnect and resume
- health and capability negotiation
- protocol versioning

**Definition of done:** desktop, web, IDE and remote clients do not shell out to
the CLI or scrape terminal text.

### 12. Automations and background queue

Implement:

- one-shot jobs
- recurring schedules
- pause/resume/edit/delete
- manual trigger
- optional skill attachment
- isolated run sessions
- delivery to review inbox
- webhook delivery
- local script-only jobs
- concurrency limits
- run history
- retries and failure alerts

**Definition of done:** scheduled runs survive UI restarts and produce
reviewable, searchable execution records.

### 13. Persistent memory and context engine

Separate:

- user profile
- project knowledge
- session summary
- explicit saved memory
- retrieved memories
- agent-specific memory
- disposable working context

Required controls:

- inspect
- edit
- forget
- disable
- export
- source attribution
- retention limits
- retrieval budget
- provider plugins

**Definition of done:** memory is visible and controllable, with source and
retention controls.

### 14. IDE and editor integration

First target:

- VS Code extension
- project-aware launch
- in-editor chat
- selected-file and selection context
- diff review
- terminal commands
- approvals
- session resume
- agent status
- model and profile selection

Then add ACP support for compatible editors.

**Definition of done:** the IDE is a proper client of the runtime, not merely a
button that opens another terminal.

### 15. Repository intelligence

Add an indexed project map using:

- syntax-aware symbol extraction
- definitions and references
- dependency graph
- importance ranking
- incremental cache
- language-server integration
- token-budgeted context rendering
- focus paths and symbols

**Definition of done:** agents receive a compact architectural map before
spending tool calls rediscovering the repository entrance.

---

## Priority 3: Platform expansion

### 16. Browser and computer use

Build in this order:

1. Browser accessibility-tree navigation
2. Screenshots and vision
3. Form and download handling
4. Persistent browser sessions
5. Browser profile isolation
6. Operating-system computer use
7. Device-node execution

### 17. Messaging gateway

Prioritise:

1. Telegram
2. Discord
3. Slack
4. WhatsApp
5. Microsoft Teams
6. Generic webhooks

Required infrastructure:

- sender allowlists and pairing
- isolated sender sessions
- account routing
- group mention gating
- attachments
- streaming/chunking
- message retries
- audit logs

Do not attempt thirty channels before six are reliable.

### 18. Mobile and remote supervision

Eventually add:

- view running agents
- approve or deny actions
- steer tasks
- inspect diffs
- receive completion notifications
- voice input
- paired device tools
- secure remote gateway connection

### 19. Marketplace and compatibility ecosystem

Support:

- skills registry
- plugins registry
- versions and update channels
- publisher identity
- signatures or digests
- security scan results
- compatibility metadata
- install provenance
- rollback
- local, Git, registry and archive sources
- Claude-, Codex- and OpenClaw-compatible bundles

**Definition of done:** install, upgrade, disable, inspect and remove all work
without manually editing configuration.

### 20. Administration, diagnostics and analytics

Add:

- doctor/repair
- health checks
- configuration validation
- migration tools
- update channels
- logs
- token usage
- cost by provider/model/project/agent
- tool success rates
- task duration
- compaction counts
- permission events
- plugin health
- scheduler health

---

## Do later, not now

These are legitimate features, but they are **not parity blockers**:

- twenty-plus messaging-channel adapters
- smart-home controls
- Spotify integrations
- animated pets beyond the existing ambient UI
- music and video generation
- camera and location tools
- public marketplace publishing
- elaborate themes
- exotic HPC backends
- every model provider ever discovered on the internet
- social features

Product capability does not improve when peripheral integrations advance while
session cancellation, policy, runtime and evidence remain unreliable.

---

## Recommended implementation order

### Wave 1: Stabilise the spine

1. Unified runtime
2. Session engine
3. Permission and sandbox engine
4. Tool runtime
5. Provider and routing layer
6. Verification harness

### Wave 2: Make the agents genuinely scalable

1. Skills, commands, hooks and plugins
2. Multi-agent worktrees and ownership
3. Deterministic workflow engine
4. Background execution and scheduler
5. Memory and context engine

### Wave 3: Make it pleasant to operate

1. Desktop command centre
2. Headless server and remote protocol
3. Diff and review workflow
4. IDE/ACP integration
5. Repository intelligence

### Wave 4: Turn it into a platform

1. Browser and computer use
2. Messaging gateway
3. Mobile supervision
4. Marketplace and compatibility
5. Admin analytics and diagnostics

## Source URLs

- OpenClaw: https://github.com/openclaw/openclaw/blob/main/docs/index.md
- Codex app: https://openai.com/index/introducing-the-codex-app/
- Hermes desktop: https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/desktop.md
- OpenClaude: https://github.com/Gitlawb/openclaude/blob/main/README.md
- Hermes tools: https://github.com/NousResearch/hermes-agent/blob/main/website/docs/reference/tools-reference.md
- OpenClaude smart routing: https://github.com/Gitlawb/openclaude/blob/main/docs/smart-routing.md
- Hermes plugins: https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/plugins.md
- OpenClaw Lobster: https://docs.openclaw.ai/tools/lobster
- Codex automations: https://openai.com/academy/codex-automations/
- Hermes integrations: https://github.com/NousResearch/hermes-agent/blob/main/website/docs/integrations/index.md
- Hermes ACP: https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/acp.md
- OpenClaude repo map: https://github.com/Gitlawb/openclaude/blob/main/docs/repo-map.md
- Hermes computer use: https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/computer-use.md
- OpenClaw features: https://docs.openclaw.ai/concepts/features
- Codex mobile: https://openai.com/index/work-with-codex-from-anywhere/
- ClawHub: https://docs.openclaw.ai/clawhub/how-it-works
- OpenClaw doctor: https://docs.openclaw.ai/cli/doctor
