SKILL_SUMMARY.md — What Skills Exist in This Stack
════════════════════════════════════════════════════════════════════════

**Adapted from OpenClaw's SKILL_SUMMARY.md. OpenClaw has 36 skills;
this stack has a different inventory rooted in Hermes + PURPCLAW.**

────────────────────────────────────────────────────────────────────────
Stack state (refreshed 2026-06-05)
────────────────────────────────────────────────────────────────────────

    30 services in ecosystem.config.js; 18-25 online at any time
    Semantic code search over 3961 files / 30975 chunks / 12715 symbols
    Plan-then-act with multi-model fanout (3 models + judge)
    Real-time SSE streaming (chat + plan + swarm)
    Active Context Panel with real file reads + token counts
    Composer V1 (full 10-element spec)
    LoRA fine-tuning pipeline (peft+trl+bitsandbytes, 4-bit QLoRA)
    AutoResearch ratchet (8 iters locked, val_loss 0.733461)
    Training buffer (24 trajectories, NDJSON per kernel job)

────────────────────────────────────────────────────────────────────────
PURPCLAW commands (run via `purpclaw <cmd>`)
────────────────────────────────────────────────────────────────────────

    `purpclaw code search|reindex|stats|symbol`
        — semantic + symbol search over the codebase
    `purpclaw training status|export|backfill|clear|toggle`
        — self-training buffer management
    `purpclaw lora status|train`
        — LoRA fine-tuning pipeline (peft+trl+bitsandbytes)
    `purpclaw services` (alias svc)
        — runtime service discovery + health probe
    `purpclaw safe-start [--all|--core|--dark]`
        — sequential service launcher with circuit breaker
    `purpclaw swarm|kimi|llm|browser|github|code|forge`
        — specialized command modules (see bin/purpclaw.js)

────────────────────────────────────────────────────────────────────────
REST endpoints (real, no fakery)
────────────────────────────────────────────────────────────────────────

    GET  /api/health, /api/version, /api/status
    POST /api/chat                       — blob reply (default)
    POST /api/chat  + Accept: text/event-stream
                                       — SSE token stream
    POST /api/chat/swarm                 — fan out N agents in parallel
    POST /api/llm/plan                  — decompose into steps
    POST /api/llm/plan + SSE             — stream plan generation
    POST /api/composer/context           — active context panel data
    POST /api/harness/coordinate         — swarm coordinator
    POST /api/orchestrate               — mission orchestrator
    POST /api/research/group             — group chat (multi-model)
    POST /api/kernel/jobs                — submit kernel job
    GET  /api/kernel/jobs                — list kernel jobs
    POST /api/upload                     — multipart file upload
    GET  /api/services/registry, /status — service discovery
    GET  /api/cognitive/status, /stats   — cognitive mesh data
    GET  /api/tower/agents, /teams       — agent tower data
    GET  /api/llm/status                 — provider info
    GET  /api/stream                     — global SSE event stream

────────────────────────────────────────────────────────────────────────
Hermes Skills (the agent runtime)
────────────────────────────────────────────────────────────────────────

    Located at  C:/Users/Admin/AppData/Local/hermes/skills/  (active profile: default)
    Loaded via   skill_view(name='<name>')

    Key skills (always-on):
      · hermes-agent           — configure Hermes itself
      · coding-standards       — universal coding standards
      · coding (omnicode-mcp)  — local AST MCP, 36+ languages
      · test-driven-development
      · systematic-debugging   — 4-phase root cause
      · plan                   — write a plan before building
      · writing-plans
      · blueprint
      · subagent-driven-development
      · requesting-code-review
      · spike
      · backend-patterns
      · frontend-patterns
      · api-design
      · database-migrations
      · deployment-patterns
      · docker-patterns
      · git-workflow
      · e2e-testing
      · e2e-testing (Playwright)
      · browser-qa
      · dogfood                — exploratory QA of web apps
      · canary-watch           — monitor a URL for regressions
      · context-budget
      · continuous-learning
      · ck                     — per-project memory

────────────────────────────────────────────────────────────────────────
PURPCLAW skills (the runtime's own reusable patterns)
────────────────────────────────────────────────────────────────────────

    Located at  C:/Users/Admin/AppData/Local/hermes/skills/  (under "default" profile)
    Created by subagents/sessions, named after the pattern they capture

    · sse-streaming-pattern
        — Server-Sent Events for /api/chat, /api/llm/plan, etc.
          covers helpers, async iterator, event vocabulary, frontend
          consumer, pitfalls. Use when adding a new streaming endpoint.

────────────────────────────────────────────────────────────────────────
Skills OUT OF SCOPE (do not load for PURPCLAW work)
────────────────────────────────────────────────────────────────────────

    Socket/Rig/OpenClaw 3D avatar (Hermes is text/voice, not a 3D body)
    GOOP officer / pile-soul personas (we don't have a Pile)
    gacha soul draws (those are OpenClaw's forge, not ours)
    workspace/IDENTITY.md in E:\files\.openclaw\  (out of scope; the
       canonical runtime identity is at E:/god folder/02_ACTIVE_PROJECTS/
       PURPCLAW/workspace/)
      · ck                     — per-project memory

    Voice / audio:
      · hermes-tts-providers   — TTS provider configuration
      · hermes-gateway-ops     — Gateway lifecycle management
      · hermes-gaze            — mouse → Hermes's eyes

    TUI / interaction:
      · tui-textual            — Python TUI apps
      · debugging-hermes-tui-commands

    Container:
      · hermes-s6-container-supervision

────────────────────────────────────────────────────────────────────────
PURPCLAW Skills (the runtime skills, see ecosystem.config.js)
────────────────────────────────────────────────────────────────────────

    These are NOT in the skills/ folder — they're services in
    ecosystem.config.js that other agents or the UI call into:

      · safe-start.js    — sequential service launcher with circuit breaker
      · safe-stop.js     — clean stop
      · open.js          — explicit UI launcher (NEW 2026-06-04)
      · smoke.js         — end-to-end self-test
      · heal.js          — diagnose + recovery plan
      · overview.js      — what is purpclaw
      · context-viz.js   — context bus visualization
      · llm.js           — LLM provider config
      · workers.js       — worker pool manager
      · harness.js       — multi-step autonomous harness
      · thringlets.js    — thringlet colony tools
      · evolve.js        — self-evolution loop
      · gc.js            — garbage collection
      · grow.js          — growth status
      · agents.js        — agent roster
      · code.js          — code operations
      · architecture.js  — system architecture
      · concepts.js      — PURPCLAW concepts
      · parity.js        — feature parity check
      · bughunt.js       — bug hunt
      · autofix-pr.js    — auto-fix PRs
      · onboard.js       — onboarding
      · cognition.js     — cognitive services
      · intelligence.js  — intelligence aggregation
      · teleport.js      — state teleport
      · roster.js        — agent roster
      · browser.js       — browser automation (open/content/click/type/tabs)
      · governance.js    — supervised/autonomous mode toggle
      · job-contract.js  — kernel job contract validation
      · proactive-maintenance.js  — proactive runtime maintenance
      · spaghetti-audit.js        — codebase architecture audit
      · rate-limiter.js  — concurrency + cost cap (NEW 2026-06-04)
      · mochi-statusbar.js  — TUI status bar wrapper

────────────────────────────────────────────────────────────────────────
Autonomy & Multi-Agent Skills
────────────────────────────────────────────────────────────────────────

    (Available in the active skills/ folder)
      · autonomous-agent-harness
      · autonomous-loops
      · autonomous-ai-agents (with sub-skills: bee, bunny, fox, goose,
        kraken, octopus, rabbit, robot, shark, wolf, etc.)
      · ai-runtime-governance
      · ai-regression-testing
      · ai-first-engineering
      · agent-harness-construction
      · gan-style-harness
      · agentic-engineering
      · agent-eval
      · agent-payment-x402

────────────────────────────────────────────────────────────────────────
Research & Web
────────────────────────────────────────────────────────────────────────

    · deep-research
    · iterative-retrieval
    · documentation-lookup
    · exa-search
    · arxiv
    · blogwatcher
    · crow
    · hawk
    · jellyfish
    · lemur
    · moth
    · owl
    · polymarket
    · raven
    · scientist
    · spider
    · llm-wiki
    · lead-intelligence
    · investor-materials
    · investor-outreach

────────────────────────────────────────────────────────────────────────
Productivity & Docs
────────────────────────────────────────────────────────────────────────

    · google-workspace-ops
    · notion
    · obsidian
    · airtable
    · jira-integration
    · linear
    · powerpoint
    · ocr-and-documents
    · maps
    · teams-meeting-pipeline
    · nano-pdf
    · architecture-decision-records
    · article-writing
    · crosspost
    · content-engine
    · brand-voice
    · ideation
    · humanizer

────────────────────────────────────────────────────────────────────────
MLOps / Models
────────────────────────────────────────────────────────────────────────

    · benchmark
    · chonk
    · cost-aware-llm-pipeline
    · eval-harness
    · evaluation
    · foundation-models-on-device
    · gan-style-harness
    · gorilla
    · huggingface-hub
    · inference
    · llama-cpp
    · models (segment-anything-model, etc.)
    · dspy
    · training
    · vector-databases
    · weights-and-biases

────────────────────────────────────────────────────────────────────────
Out of Scope (OpenClaw skills, not loaded here)
────────────────────────────────────────────────────────────────────────

    · TURZX_FACE / socket-rig / lunokio-avatar-control — Socket's body
    · communication (Twilio/WhatsApp) — OpenClaw's, not loaded
    · database-connector (Postgres/Mongo) — OpenClaw's, not loaded
    · finance-trading (Alpaca/Binance) — OpenClaw's, not loaded
    · iot-control (HomeAssistant/Zigbee) — OpenClaw's, not loaded
    · messaging-bots (Slack/Discord) — OpenClaw's, not loaded
    · testing-automation (Selenium/Cypress) — OpenClaw's, not loaded
    · token-saver — OpenClaw's, not loaded
    · desktop-control (mouse/keyboard) — OpenClaw's
    · windows-nt (WMI/registry) — OpenClaw's
    · ollama-orchestrator — OpenClaw's
    · opencv-vision — OpenClaw's
    · ffmpeg-pipeline — OpenClaw's
    · cloud-aws — OpenClaw's
    · smart-home — OpenClaw's

────────────────────────────────────────────────────────────────────────
Last Updated
────────────────────────────────────────────────────────────────────────

    2026-06-04 — initial adaptation from OpenClaw SKILL_SUMMARY.md
