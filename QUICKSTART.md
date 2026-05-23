# PURPCLAW — The Tiny Haunted Workshop

**PURPCLAW** is a local AI agent harness that runs on your machine, connects to LLM providers you choose, and orchestrates specialist agents ("the hammers") to do your bidding — with a goose that files tickets, a mochi that watches the door, and an open knowledge pool that everyone drinks from.

---

## Installation (One Line)

### macOS / Linux
```bash
curl -fsSL https://purpclaw.dev/install.sh | sh
```

### Windows (PowerShell, Run as Administrator)
```powershell
irm https://purpclaw.dev/install.ps1 | iex
```

### Manual
```bash
git clone https://github.com/YOUR_GITHUB/purpclaw.git ~/.purpclaw
cd ~/.purpclaw && npm install
npm install -g pm2
node bin/purpclaw.js init --wizard
```

---

## First Run Wizard

`purpclaw init --wizard` runs a 60-second setup walkthrough:

1. **Pick your LLM provider** — MiniMax (default, generous tier), Anthropic, OpenAI, Kimi, Groq, DeepSeek, OpenRouter, Ollama (local), or custom OpenAI-compatible
2. **Paste your API key** — stored locally in `.env`, never sent anywhere except your chosen provider
3. **Choose your companion** — which sprite blinks at you in the terminal while the swarm works
4. **Boot the swarm** — PM2 starts the 8 core services, Mission Control comes online at `:3000`

---

## Core Commands

```bash
# Boot and shutdown
purpclaw start          Boot the harness (all 8 services)
purpclaw stop           Shut down gracefully
purpclaw status         Live dashboard: services + pool + orchestrator

# The work loop
purpclaw run "task"     Run a task through the orchestrator
purpclaw bg "task"      Background dispatch — fire and forget, results in agent_work/bg-sessions/
purpclaw jobs           List active jobs and their status
purpclaw approve <id>   Approve a held high-risk job
purpclaw reject <id>    Reject and cancel

# Skills and agents
purpclaw install <name>   Install a skill from the local registry
purpclaw search "<text>"  Keyword search across 139 skills + 38 agents
purpclaw registry browse  Full catalog with install status
purpclaw registry publish <name>  Publishing guide (step-by-step PR walkthrough)

# The knowledge pool (always running at :7880)
purpclaw pool query <text>     Search skills by keyword
purpclaw pool show <name>      Full SKILL.md content
purpclaw pool stats            How many skills/agents indexed
purpclaw pool routing <text>   Routing hints for a task
purpclaw pool reindex          Rebuild index from disk

# Session management
purpclaw resume list           List all session checkpoints
purpclaw resume <id>           Reload a specific session
purpclaw workflows             Show active and recent workflows

# Self-inspection
purpclaw doctor         Quick health check
purpclaw policies       Show active governance policies
purpclaw jobs pending   Show jobs waiting for approval
purpclaw jobs recent    Show last 10 completed jobs
purpclaw introspect     Runtime state summary
purpclaw introspect risks  Live risk classification
purpclaw spaghetti audit   Code health scores (lower = cleaner)
purpclaw spaghetti diff A B   Compare code before/after refactor
purpclaw rollback list    Available rollback points
purpclaw rollback undo <id>  Restore state from snapshot

# Help
purpclaw help           Full command reference
```

---

## Architecture

```
PURPCLAW — the tiny haunted workshop

  Layer 5: GOVERNANCE        policies.json + approval ledger
  Layer 4: ORCHESTRATION    orchestrator.js — the foreman
  Layer 3: AGENTS            dragon, owl, mushroom, robot, goose...
  Layer 2: SKILLS            139 skill files (how to do things)
  Layer 1: SERVICES          PM2 swarm (8 processes)
    eventbus   :7782  pub/sub between services
    state      :7783  shared state store
    api        :7780  main HTTP API
    tower      :7790  agent spawner (the hammers)
    orchestrator:7784 orchestration + governance gate
    gatekeeper :7791  security policies
    metrics    :7890  telemetry
    pool       :7880  knowledge pool (skills + agents)
    mission-ctrl:3000  Mission Control web UI

  MISSION CONTROL:  http://localhost:3000
  KNOWLEDGE POOL:  http://localhost:7880
  API:             http://localhost:7780
```

---

## How Work Gets Done

```
you: purpclaw run "build me a landing page for my startup"

orchestrator:
  1. classify (what type of job is this?)
  2. govern (any risks? approval needed?)
  3. contract (give/needs/avoid for this task type)
  4. dispatch (which agent(s)?)
  5. execute (hammers walk)
  6. verify (spaghetti check? tests?)
  7. log (every action appended to agent_work/)

pool (always queryable):
  - skills indexed: "css", "html", "copywriting", "responsive", "image-gen"
  - agents available: goose (drafts), wolf (research), owl (review)
  - past failures: "don't use table layouts for responsiveness"
  - user preferences: "keep copy short, no jargon"

output: a landing page, built by your hammers, remembered by your pool
```

---

## Key Files

```
PURPCLAW/
  bin/purpclaw.js          CLI front door
  orchestrator.js         The foreman
  agent_tower.js          Agent spawning
  unified_api.js          Backend routing
  lib/governance.js       Risk classification + approval ledger
  lib/job-contract.js     Job type classification + gate assignment
  lib/spaghetti-audit.js  Code health scoring
  lib/snapshot.js         Pre-execution rollback snapshots
  pool_service.js         Knowledge pool service (port 7880)
  service_registry.js     Active service registry
  policies.json           Governance rules (editable)
  ecosystem.config.js      PM2 service definitions
  agent_work/             Job history + snapshots
    .pool_index.json      Skill/agent index
    .pool_queries.jsonl   Query audit log
  skills/                 139 skill files (the nails)
  agents/                  Specialist agent profiles
  docs/                   Architecture decision records
```

---

## Mission Control UI

Open http://localhost:3000 when the harness is running. Shows:
- Active services and their health
- Job queue and status
- Spaghetti scores across the codebase
- Governance approval queue
- Pool query log

---

## FAQ

**"Is this secure?"**

The governance layer (policies.json) classifies every job by risk. High-risk jobs (filesystem mutations, external network calls, service restarts) are held for approval before executing. Low-risk jobs (read-only inspection, linting) run directly. The approval ledger is append-only JSONL.

**"Where does it send my code?"**

Only to the LLM provider you configure in `.env`. Code never touches PURPCLAW's infrastructure.

**"How do I add a new skill?"**

Drop a `SKILL.md` file in `skills/<name>/`. The pool service picks it up on next boot, or rebuild the index with `purpclaw pool reindex`.

**"The goose is filing tickets. What does that mean?"**

The GOOSE agent handles enforcement: catching policy violations, maintaining quality gates, and making sure agents don't drift from their assigned roles. It's middle management, but with a beak.

**"Something broke. What do I do?"**

```bash
purpclaw doctor           # quick health check
purpclaw rollback list     # see rollback points
purpclaw rollback undo <id> # restore a snapshot
npm run build             # rebuild Next.js
```

---

## Registry (Skills / Agents)

The workshop has a marketplace of distributable components:

```bash
purpclaw registry browse          # see all 139 skills + 38 agents
purpclaw install ai-first-engineering   # install a skill
purpclaw search python testing      # find by keyword
purpclaw registry publish <name>   # publish your own skill (opens guide)
purpclaw registry update            # rebuild local index from disk
```

---

*Built by Eddie Cannon. Maintained by the goose. Watched by the mochi.*
*The hammers walk. The tickets file themselves. The pool is open.*