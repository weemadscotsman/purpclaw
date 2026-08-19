'use strict';
/**
 * lib/cli/registry.js — the canonical command registry.
 *
 * Single source of truth for command identity, aliases, module routing,
 * categories (help sections), JSON support, and shell completion. The
 * dispatcher in bin/purpclaw.js consults this registry FIRST (dual-dispatch
 * transition): module-routed commands execute via lib/commands/<module>.js,
 * legacyFn commands still execute in the historical switch until migrated.
 * Unknown commands never fall through to task dispatch — they error with a
 * did-you-mean suggestion and exit 2.
 *
 * Generated initially from the live switch (2026-08-18); hand-curated since.
 * Do not add commands to the switch without adding them here.
 */

const CATEGORY_ORDER = ["lifecycle","chat","workflow","governance","agents","cognition","providers","tools","research","dev","voice","vision","training","systems","identity","workspace"];
const CATEGORY_TITLES = {
  "lifecycle": "LIFECYCLE",
  "chat": "CHAT & SESSIONS",
  "workflow": "WORKFLOW",
  "governance": "GOVERNANCE & SAFETY",
  "agents": "AGENTS & TEAMS",
  "cognition": "COGNITION & MEMORY",
  "providers": "PROVIDERS & MODELS",
  "tools": "TOOLS & SKILLS",
  "research": "RESEARCH",
  "dev": "DEV & RELEASE",
  "voice": "VOICE",
  "vision": "VISION",
  "training": "TRAINING",
  "systems": "SYSTEMS & HEALTH",
  "identity": "IDENTITY",
  "workspace": "WORKSPACE & EXTRAS"
};

const COMMANDS = [
  {
    "name": "awaken",
    "aliases": [],
    "module": "awaken",
    "category": "lifecycle",
    "description": "Wake ritual: boot stack into work / watch mode",
    "json": false,
    "legacyFn": false,
    "inSwitch": false
  },
  {
    "name": "init",
    "aliases": [],
    "module": null,
    "category": "lifecycle",
    "description": "Audit env, keys, and services",
    "json": false,
    "legacyFn": true,
    "inSwitch": true
  },
  {
    "name": "onboard",
    "aliases": [],
    "module": "onboard",
    "category": "lifecycle",
    "description": "Guided onboarding flow",
    "json": false,
    "legacyFn": false,
    "inSwitch": true
  },
  {
    "name": "restart",
    "aliases": [],
    "module": null,
    "category": "lifecycle",
    "description": "Restart the PM2 stack (safe lifecycle)",
    "json": false,
    "legacyFn": true,
    "inSwitch": true
  },
  {
    "name": "safe-start",
    "aliases": [
      "safestart"
    ],
    "module": "safe-start",
    "category": "lifecycle",
    "description": "One-at-a-time PM2 boot with cascade guard",
    "json": false,
    "legacyFn": false,
    "inSwitch": true
  },
  {
    "name": "safe-stop",
    "aliases": [
      "safestop"
    ],
    "module": "safe-stop",
    "category": "lifecycle",
    "description": "Graceful full-stack shutdown",
    "json": false,
    "legacyFn": false,
    "inSwitch": true
  },
  {
    "name": "setup",
    "aliases": [
      "wizard"
    ],
    "module": "setup",
    "category": "lifecycle",
    "description": "Interactive first-run wizard",
    "json": false,
    "legacyFn": false,
    "inSwitch": true
  },
  {
    "name": "start",
    "aliases": [],
    "module": null,
    "category": "lifecycle",
    "description": "Boot the harness (bounded profile)",
    "json": false,
    "legacyFn": true,
    "inSwitch": true
  },
  {
    "name": "stop",
    "aliases": [],
    "module": null,
    "category": "lifecycle",
    "description": "Shut down gracefully",
    "json": false,
    "legacyFn": true,
    "inSwitch": true
  },
  {
    "name": "chat",
    "aliases": [],
    "module": null,
    "category": "chat",
    "description": "Interactive chat REPL (slash commands)",
    "json": false,
    "legacyFn": true,
    "inSwitch": true
  },
  {
    "name": "clear",
    "aliases": [],
    "module": null,
    "category": "chat",
    "description": "Clear transient journals + build cache (durable state kept)",
    "json": false,
    "legacyFn": true,
    "inSwitch": true
  },
  {
    "name": "compact",
    "aliases": [],
    "module": null,
    "category": "chat",
    "description": "Prune old JSONL journals, preserve durable files",
    "json": false,
    "legacyFn": true,
    "inSwitch": true
  },
  {
    "name": "context",
    "aliases": [],
    "module": null,
    "category": "chat",
    "description": "Show the current session context window",
    "json": true,
    "legacyFn": true,
    "inSwitch": true
  },
  {
    "name": "plan",
    "aliases": [],
    "module": null,
    "category": "chat",
    "description": "Plan a goal: probe registry + parity, scaffold next steps",
    "json": true,
    "legacyFn": true,
    "inSwitch": true
  },
  {
    "name": "resume",
    "aliases": [],
    "module": null,
    "category": "chat",
    "description": "Resume the last saved session",
    "json": false,
    "legacyFn": true,
    "inSwitch": true
  },
  {
    "name": "run",
    "aliases": [],
    "module": null,
    "category": "chat",
    "description": "Run a natural-language task through the agent loop",
    "json": false,
    "legacyFn": true,
    "inSwitch": true
  },
  {
    "name": "sessionlog",
    "aliases": [
      "session-log",
      "session"
    ],
    "module": null,
    "category": "chat",
    "description": "Session log viewer",
    "json": true,
    "legacyFn": true,
    "inSwitch": true
  },
  {
    "name": "tui",
    "aliases": [
      "ui"
    ],
    "module": null,
    "category": "chat",
    "description": "Full-screen TUI",
    "json": false,
    "legacyFn": true,
    "inSwitch": true
  },
  {
    "name": "next",
    "aliases": [],
    "module": "next",
    "category": "workflow",
    "description": "Discover the live project phase + next step",
    "json": true,
    "legacyFn": false,
    "inSwitch": false
  },
  {
    "name": "workflow",
    "aliases": [],
    "module": "workflow",
    "category": "workflow",
    "description": "Workflow engine: run / list / inspect",
    "json": true,
    "legacyFn": false,
    "inSwitch": false
  },
  {
    "name": "approve",
    "aliases": [],
    "module": null,
    "category": "governance",
    "description": "Approve a pending gated action",
    "json": false,
    "legacyFn": true,
    "inSwitch": true
  },
  {
    "name": "audit",
    "aliases": [],
    "module": null,
    "category": "governance",
    "description": "Stack audit: integrity + wiring",
    "json": true,
    "legacyFn": true,
    "inSwitch": true
  },
  {
    "name": "certify",
    "aliases": [
      "cert"
    ],
    "module": null,
    "category": "governance",
    "description": "Run / report certification gates",
    "json": true,
    "legacyFn": true,
    "inSwitch": true
  },
  {
    "name": "checkpoint",
    "aliases": [
      "cp"
    ],
    "module": null,
    "category": "governance",
    "description": "Create or list checkpoints",
    "json": true,
    "legacyFn": true,
    "inSwitch": true
  },
  {
    "name": "constitution",
    "aliases": [
      "law"
    ],
    "module": null,
    "category": "governance",
    "description": "Verify the governing contract files",
    "json": true,
    "legacyFn": true,
    "inSwitch": true
  },
  {
    "name": "council",
    "aliases": [],
    "module": "council",
    "category": "governance",
    "description": "Convene the council on a decision",
    "json": false,
    "legacyFn": false,
    "inSwitch": false
  },
  {
    "name": "cryosleep",
    "aliases": [
      "sleep",
      "wake"
    ],
    "module": null,
    "category": "governance",
    "description": "Sleep / wake: bundle state for pause + resume",
    "json": true,
    "legacyFn": true,
    "inSwitch": true
  },
  {
    "name": "evolve",
    "aliases": [],
    "module": "evolve",
    "category": "governance",
    "description": "Governed self-evolution proposals",
    "json": true,
    "legacyFn": false,
    "inSwitch": true
  },
  {
    "name": "hooks",
    "aliases": [],
    "module": "hooks",
    "category": "governance",
    "description": "Lifecycle hooks registry + wiring",
    "json": true,
    "legacyFn": false,
    "inSwitch": true
  },
  {
    "name": "oracle",
    "aliases": [],
    "module": "oracle",
    "category": "governance",
    "description": "Oracle forecast for decisions",
    "json": true,
    "legacyFn": false,
    "inSwitch": false
  },
  {
    "name": "permissions",
    "aliases": [],
    "module": "permissions",
    "category": "governance",
    "description": "Interactive permissions manager",
    "json": false,
    "legacyFn": false,
    "inSwitch": false
  },
  {
    "name": "policy",
    "aliases": [],
    "module": null,
    "category": "governance",
    "description": "List / edit permission policies",
    "json": true,
    "legacyFn": true,
    "inSwitch": true
  },
  {
    "name": "registry-audit",
    "aliases": [],
    "module": "registry-audit",
    "category": "governance",
    "description": "Audit registry integrity",
    "json": true,
    "legacyFn": false,
    "inSwitch": false
  },
  {
    "name": "reject",
    "aliases": [],
    "module": null,
    "category": "governance",
    "description": "Reject a pending gated action",
    "json": false,
    "legacyFn": true,
    "inSwitch": true
  },
  {
    "name": "rollback",
    "aliases": [],
    "module": null,
    "category": "governance",
    "description": "Roll back to a checkpoint",
    "json": false,
    "legacyFn": true,
    "inSwitch": true
  },
  {
    "name": "sandbox",
    "aliases": [],
    "module": "sandbox",
    "category": "governance",
    "description": "Sandbox lifecycle management (Docker/local)",
    "json": true,
    "legacyFn": false,
    "inSwitch": false
  },
  {
    "name": "steering",
    "aliases": [],
    "module": null,
    "category": "governance",
    "description": "Inspect the steering resolver + capsules",
    "json": true,
    "legacyFn": true,
    "inSwitch": true
  },
  {
    "name": "agents",
    "aliases": [],
    "module": null,
    "category": "agents",
    "description": "Agent tower registry + status",
    "json": true,
    "legacyFn": true,
    "inSwitch": true
  },
  {
    "name": "crew",
    "aliases": [],
    "module": "crew",
    "category": "agents",
    "description": "Crew roster + model-per-agent routing preview",
    "json": true,
    "legacyFn": false,
    "inSwitch": false
  },
  {
    "name": "forge",
    "aliases": [],
    "module": null,
    "category": "agents",
    "description": "Forge: build skills/agents from prompts",
    "json": false,
    "legacyFn": true,
    "inSwitch": true
  },
  {
    "name": "grow",
    "aliases": [],
    "module": "grow",
    "category": "agents",
    "description": "Grow the agent pool / skills garden",
    "json": true,
    "legacyFn": false,
    "inSwitch": false
  },
  {
    "name": "harness",
    "aliases": [],
    "module": "harness",
    "category": "agents",
    "description": "Autonomous productivity harness control",
    "json": true,
    "legacyFn": false,
    "inSwitch": false
  },
  {
    "name": "hivemind",
    "aliases": [],
    "module": "hivemind",
    "category": "agents",
    "description": "Hivemind multi-agent consensus run",
    "json": true,
    "legacyFn": false,
    "inSwitch": false
  },
  {
    "name": "liveforge",
    "aliases": [],
    "module": "liveforge",
    "category": "agents",
    "description": "Liveforge run control",
    "json": true,
    "legacyFn": false,
    "inSwitch": false
  },
  {
    "name": "personas",
    "aliases": [],
    "module": "roster",
    "category": "agents",
    "description": "Tower swarm vs disk persona audit",
    "json": true,
    "legacyFn": false,
    "inSwitch": false
  },
  {
    "name": "profiles",
    "aliases": [],
    "module": null,
    "category": "agents",
    "description": "Agent persona profiles",
    "json": true,
    "legacyFn": true,
    "inSwitch": true
  },
  {
    "name": "skill-forge",
    "aliases": [
      "skillforge"
    ],
    "module": null,
    "category": "agents",
    "description": "Forge skills from a spec",
    "json": false,
    "legacyFn": true,
    "inSwitch": true
  },
  {
    "name": "subagent",
    "aliases": [
      "bridge"
    ],
    "module": null,
    "category": "agents",
    "description": "Dispatch a bounded sub-agent task",
    "json": false,
    "legacyFn": true,
    "inSwitch": true
  },
  {
    "name": "team",
    "aliases": [],
    "module": null,
    "category": "agents",
    "description": "Form / manage persistent agent teams",
    "json": true,
    "legacyFn": true,
    "inSwitch": true
  },
  {
    "name": "team-roster",
    "aliases": [
      "roster"
    ],
    "module": null,
    "category": "agents",
    "description": "Team roster: roles, history, persistence",
    "json": true,
    "legacyFn": true,
    "inSwitch": true
  },
  {
    "name": "thringlets",
    "aliases": [],
    "module": "thringlets",
    "category": "agents",
    "description": "Thringlet colony lens + interaction",
    "json": true,
    "legacyFn": false,
    "inSwitch": false
  },
  {
    "name": "workflows",
    "aliases": [],
    "module": null,
    "category": "agents",
    "description": "Workflow registry",
    "json": true,
    "legacyFn": true,
    "inSwitch": true
  },
  {
    "name": "cognition",
    "aliases": [
      "cog"
    ],
    "module": "cognition",
    "category": "cognition",
    "description": "Cognitive spine: memory, rules, diagnostics",
    "json": true,
    "legacyFn": false,
    "inSwitch": true
  },
  {
    "name": "dream",
    "aliases": [],
    "module": null,
    "category": "cognition",
    "description": "Auto-dream: memory consolidation run",
    "json": true,
    "legacyFn": true,
    "inSwitch": true
  },
  {
    "name": "embed",
    "aliases": [],
    "module": null,
    "category": "cognition",
    "description": "Embed a file or text into the index",
    "json": false,
    "legacyFn": true,
    "inSwitch": true
  },
  {
    "name": "embeddings",
    "aliases": [],
    "module": null,
    "category": "cognition",
    "description": "Embeddings index stats / query",
    "json": true,
    "legacyFn": true,
    "inSwitch": true
  },
  {
    "name": "memory",
    "aliases": [],
    "module": null,
    "category": "cognition",
    "description": "Memory layers: recall, forget, stats",
    "json": true,
    "legacyFn": true,
    "inSwitch": true
  },
  {
    "name": "mycelium",
    "aliases": [],
    "module": "mycelium",
    "category": "cognition",
    "description": "Mycelium knowledge-network queries",
    "json": true,
    "legacyFn": false,
    "inSwitch": false
  },
  {
    "name": "soul-memory",
    "aliases": [
      "memory-contract"
    ],
    "module": null,
    "category": "cognition",
    "description": "Soul memory contract inspection",
    "json": true,
    "legacyFn": true,
    "inSwitch": true
  },
  {
    "name": "spinebus",
    "aliases": [],
    "module": "spinebus",
    "category": "cognition",
    "description": "Spine bus state + queries",
    "json": true,
    "legacyFn": false,
    "inSwitch": false
  },
  {
    "name": "vector",
    "aliases": [],
    "module": null,
    "category": "cognition",
    "description": "Vector store benchmark",
    "json": true,
    "legacyFn": true,
    "inSwitch": true
  },
  {
    "name": "bench",
    "aliases": [
      "provider-bench",
      "benchmarks"
    ],
    "module": null,
    "category": "providers",
    "description": "Benchmark providers (latency / quality)",
    "json": true,
    "legacyFn": true,
    "inSwitch": true
  },
  {
    "name": "llm",
    "aliases": [],
    "module": "llm",
    "category": "providers",
    "description": "Provider routing table + health",
    "json": true,
    "legacyFn": false,
    "inSwitch": true
  },
  {
    "name": "model",
    "aliases": [],
    "module": null,
    "category": "providers",
    "description": "Hot-swap provider/model, list, test, serve GGUF",
    "json": true,
    "legacyFn": true,
    "inSwitch": true
  },
  {
    "name": "models",
    "aliases": [],
    "module": null,
    "category": "providers",
    "description": "Alias for model list",
    "json": true,
    "legacyFn": true,
    "inSwitch": true
  },
  {
    "name": "provider",
    "aliases": [],
    "module": "provider",
    "category": "providers",
    "description": "Provider config + keys health (no values)",
    "json": true,
    "legacyFn": false,
    "inSwitch": false
  },
  {
    "name": "automate",
    "aliases": [
      "atbs"
    ],
    "module": "automate",
    "category": "tools",
    "description": "ATBS automation surface",
    "json": false,
    "legacyFn": false,
    "inSwitch": true
  },
  {
    "name": "browser",
    "aliases": [
      "browse"
    ],
    "module": "browser",
    "category": "tools",
    "description": "Browser automation surface",
    "json": false,
    "legacyFn": false,
    "inSwitch": true
  },
  {
    "name": "code",
    "aliases": [
      "github",
      "gitx"
    ],
    "module": "code",
    "category": "tools",
    "description": "Code intelligence (github / repo ops)",
    "json": false,
    "legacyFn": false,
    "inSwitch": true
  },
  {
    "name": "gc",
    "aliases": [
      "cleanup"
    ],
    "module": "gc",
    "category": "tools",
    "description": "Garbage-collect caches + orphaned state",
    "json": false,
    "legacyFn": false,
    "inSwitch": true
  },
  {
    "name": "install",
    "aliases": [],
    "module": null,
    "category": "tools",
    "description": "Install a skill or package",
    "json": false,
    "legacyFn": true,
    "inSwitch": true
  },
  {
    "name": "marketplace",
    "aliases": [],
    "module": "marketplace",
    "category": "tools",
    "description": "Skill/agent package marketplace",
    "json": true,
    "legacyFn": false,
    "inSwitch": false
  },
  {
    "name": "mcp",
    "aliases": [],
    "module": "mcp",
    "category": "tools",
    "description": "MCP server registry + health",
    "json": true,
    "legacyFn": false,
    "inSwitch": false
  },
  {
    "name": "plugin",
    "aliases": [],
    "module": "plugin",
    "category": "tools",
    "description": "Plugin list/enable/disable (Codex parity)",
    "json": true,
    "legacyFn": false,
    "inSwitch": false
  },
  {
    "name": "registry",
    "aliases": [],
    "module": null,
    "category": "tools",
    "description": "Skill/package registry: search, install, list",
    "json": true,
    "legacyFn": true,
    "inSwitch": true
  },
  {
    "name": "search",
    "aliases": [],
    "module": null,
    "category": "tools",
    "description": "Search the local registry (skills, agents)",
    "json": true,
    "legacyFn": true,
    "inSwitch": true
  },
  {
    "name": "skill-discovery",
    "aliases": [
      "discover"
    ],
    "module": "skill-discovery",
    "category": "tools",
    "description": "Discover skills for the current task",
    "json": true,
    "legacyFn": false,
    "inSwitch": true
  },
  {
    "name": "skillgraph",
    "aliases": [
      "skill-graph",
      "skills"
    ],
    "module": null,
    "category": "tools",
    "description": "Skill dependency graph",
    "json": true,
    "legacyFn": true,
    "inSwitch": true
  },
  {
    "name": "autoresearch",
    "aliases": [],
    "module": "autoresearch",
    "category": "research",
    "description": "Auto-research orchestrator front door",
    "json": true,
    "legacyFn": false,
    "inSwitch": false
  },
  {
    "name": "harvest",
    "aliases": [],
    "module": "harvest",
    "category": "research",
    "description": "Data harvester: crawl, fingerprint, classify, index",
    "json": true,
    "legacyFn": false,
    "inSwitch": false
  },
  {
    "name": "websearch",
    "aliases": [],
    "module": null,
    "category": "research",
    "description": "Web search via the active provider",
    "json": true,
    "legacyFn": true,
    "inSwitch": true
  },
  {
    "name": "apply-diff",
    "aliases": [],
    "module": "apply-diff",
    "category": "dev",
    "description": "Parse and apply a unified diff (stdin or file)",
    "json": false,
    "legacyFn": false,
    "inSwitch": false
  },
  {
    "name": "autofix-pr",
    "aliases": [
      "autofix"
    ],
    "module": "autofix-pr",
    "category": "dev",
    "description": "Auto-fix a PR from review comments",
    "json": false,
    "legacyFn": false,
    "inSwitch": true
  },
  {
    "name": "bughunt",
    "aliases": [],
    "module": "bughunt",
    "category": "dev",
    "description": "Scan the repo for defect patterns",
    "json": true,
    "legacyFn": false,
    "inSwitch": true
  },
  {
    "name": "commit",
    "aliases": [
      "review",
      "find",
      "claudecode"
    ],
    "module": "claudecode",
    "category": "dev",
    "description": "Guided commit with context",
    "json": false,
    "legacyFn": false,
    "inSwitch": true
  },
  {
    "name": "cross-review",
    "aliases": [
      "xreview"
    ],
    "module": null,
    "category": "dev",
    "description": "Cross-family code review gate",
    "json": false,
    "legacyFn": true,
    "inSwitch": true
  },
  {
    "name": "ctx-viz",
    "aliases": [
      "ctxviz"
    ],
    "module": "ctx-viz",
    "category": "dev",
    "description": "Context window visualizer",
    "json": true,
    "legacyFn": false,
    "inSwitch": true
  },
  {
    "name": "deploy",
    "aliases": [],
    "module": "deploy",
    "category": "dev",
    "description": "One-command VPS deployment via Docker",
    "json": false,
    "legacyFn": false,
    "inSwitch": false
  },
  {
    "name": "feature",
    "aliases": [],
    "module": "feature",
    "category": "dev",
    "description": "Feature verify / track",
    "json": true,
    "legacyFn": false,
    "inSwitch": false
  },
  {
    "name": "forgecode",
    "aliases": [
      "forge-code",
      "ptc"
    ],
    "module": null,
    "category": "dev",
    "description": "Forge Code: guided code generation lane",
    "json": false,
    "legacyFn": true,
    "inSwitch": true
  },
  {
    "name": "init-project",
    "aliases": [],
    "module": "init-project",
    "category": "dev",
    "description": "Scaffold a new project from templates",
    "json": false,
    "legacyFn": false,
    "inSwitch": false
  },
  {
    "name": "pr",
    "aliases": [],
    "module": "pr",
    "category": "dev",
    "description": "Pull-request helper (branch, diff, message)",
    "json": false,
    "legacyFn": false,
    "inSwitch": true
  },
  {
    "name": "release",
    "aliases": [],
    "module": "release",
    "category": "dev",
    "description": "Release artifact build / show (signed)",
    "json": true,
    "legacyFn": false,
    "inSwitch": true
  },
  {
    "name": "remotion",
    "aliases": [],
    "module": "remotion",
    "category": "dev",
    "description": "Remotion video stack control surface",
    "json": true,
    "legacyFn": false,
    "inSwitch": false
  },
  {
    "name": "repomap",
    "aliases": [],
    "module": "repomap",
    "category": "dev",
    "description": "Repository map generator",
    "json": true,
    "legacyFn": false,
    "inSwitch": false
  },
  {
    "name": "watch",
    "aliases": [],
    "module": "watch",
    "category": "dev",
    "description": "File system watcher CLI",
    "json": true,
    "legacyFn": false,
    "inSwitch": false
  },
  {
    "name": "worktree",
    "aliases": [],
    "module": "worktree",
    "category": "dev",
    "description": "Git worktree management",
    "json": true,
    "legacyFn": false,
    "inSwitch": false
  },
  {
    "name": "voice",
    "aliases": [],
    "module": null,
    "category": "voice",
    "description": "Voice loop: STT, TTS, personas",
    "json": false,
    "legacyFn": true,
    "inSwitch": true
  },
  {
    "name": "look",
    "aliases": [],
    "module": null,
    "category": "vision",
    "description": "Screen capture + vision describe",
    "json": false,
    "legacyFn": true,
    "inSwitch": true
  },
  {
    "name": "eval",
    "aliases": [],
    "module": "eval",
    "category": "training",
    "description": "Run an eval dataset through the stack",
    "json": true,
    "legacyFn": false,
    "inSwitch": false
  },
  {
    "name": "feedback",
    "aliases": [],
    "module": "feedback",
    "category": "training",
    "description": "Personal model feedback submit/status/list",
    "json": true,
    "legacyFn": false,
    "inSwitch": false
  },
  {
    "name": "lora",
    "aliases": [],
    "module": null,
    "category": "training",
    "description": "LoRA train / list / merge local models",
    "json": false,
    "legacyFn": true,
    "inSwitch": true
  },
  {
    "name": "training",
    "aliases": [],
    "module": null,
    "category": "training",
    "description": "Training feedback loop capture",
    "json": true,
    "legacyFn": true,
    "inSwitch": true
  },
  {
    "name": "capabilities",
    "aliases": [],
    "module": "capabilities",
    "category": "systems",
    "description": "Capability report (built vs running vs integrated)",
    "json": true,
    "legacyFn": false,
    "inSwitch": false
  },
  {
    "name": "update",
    "aliases": ["up", "upgrade"],
    "module": "update",
    "category": "systems",
    "description": "Show version/commit and reload to newest code (--restart backend, --log, --pull)",
    "json": true,
    "legacyFn": false,
    "inSwitch": false
  },
  {
    "name": "config",
    "aliases": [],
    "module": null,
    "category": "systems",
    "description": "Config get / set / list",
    "json": true,
    "legacyFn": true,
    "inSwitch": true
  },
  {
    "name": "doctor",
    "aliases": [],
    "module": null,
    "category": "systems",
    "description": "One-command system health verification",
    "json": true,
    "legacyFn": true,
    "inSwitch": true
  },
  {
    "name": "drift",
    "aliases": [],
    "module": "drift",
    "category": "systems",
    "description": "Drift watcher: config vs reality, optional --fix",
    "json": true,
    "legacyFn": false,
    "inSwitch": false
  },
  {
    "name": "health",
    "aliases": [],
    "module": null,
    "category": "systems",
    "description": "Core service health probes",
    "json": true,
    "legacyFn": true,
    "inSwitch": true
  },
  {
    "name": "idle",
    "aliases": [],
    "module": null,
    "category": "systems",
    "description": "Idle engine: cycles, dataset, LoRA",
    "json": true,
    "legacyFn": true,
    "inSwitch": true
  },
  {
    "name": "intelligence",
    "aliases": [],
    "module": "intelligence",
    "category": "systems",
    "description": "Full intelligence report (health + capability)",
    "json": true,
    "legacyFn": false,
    "inSwitch": false
  },
  {
    "name": "introspect",
    "aliases": [],
    "module": null,
    "category": "systems",
    "description": "Live process introspection",
    "json": true,
    "legacyFn": true,
    "inSwitch": true
  },
  {
    "name": "jobs",
    "aliases": [],
    "module": null,
    "category": "systems",
    "description": "Job list / inspect",
    "json": true,
    "legacyFn": true,
    "inSwitch": true
  },
  {
    "name": "logs",
    "aliases": [],
    "module": null,
    "category": "systems",
    "description": "Tail service logs (PM2 aware)",
    "json": false,
    "legacyFn": true,
    "inSwitch": true
  },
  {
    "name": "parity",
    "aliases": [],
    "module": null,
    "category": "systems",
    "description": "Capability parity dashboard (6 tiles)",
    "json": true,
    "legacyFn": true,
    "inSwitch": true
  },
  {
    "name": "parity-offline",
    "aliases": [],
    "module": "parity",
    "category": "systems",
    "description": "Pure-Node parity report (no Python/TUI needed)",
    "json": true,
    "legacyFn": false,
    "inSwitch": false
  },
  {
    "name": "pool",
    "aliases": [],
    "module": null,
    "category": "systems",
    "description": "Agent pool status",
    "json": true,
    "legacyFn": true,
    "inSwitch": true
  },
  {
    "name": "queue",
    "aliases": [],
    "module": null,
    "category": "systems",
    "description": "Orchestrator queue depth + jobs",
    "json": true,
    "legacyFn": true,
    "inSwitch": true
  },
  {
    "name": "remote",
    "aliases": [],
    "module": "remote",
    "category": "systems",
    "description": "Remote session transport",
    "json": false,
    "legacyFn": false,
    "inSwitch": false
  },
  {
    "name": "schedule",
    "aliases": [],
    "module": "schedule",
    "category": "systems",
    "description": "PurpClaw-native cron scheduling",
    "json": true,
    "legacyFn": false,
    "inSwitch": false
  },
  {
    "name": "services",
    "aliases": [],
    "module": "services",
    "category": "systems",
    "description": "Service registry + port map",
    "json": true,
    "legacyFn": false,
    "inSwitch": true
  },
  {
    "name": "show",
    "aliases": [
      "stack"
    ],
    "module": null,
    "category": "systems",
    "description": "Full-stack status board (alias: stack)",
    "json": true,
    "legacyFn": true,
    "inSwitch": true
  },
  {
    "name": "smoke",
    "aliases": [
      "selftest"
    ],
    "module": "smoke",
    "category": "systems",
    "description": "Smoke-test the live services",
    "json": true,
    "legacyFn": false,
    "inSwitch": true
  },
  {
    "name": "spaghetti",
    "aliases": [],
    "module": null,
    "category": "systems",
    "description": "Dependency-graph visual of the stack",
    "json": false,
    "legacyFn": true,
    "inSwitch": true
  },
  {
    "name": "stats",
    "aliases": [],
    "module": "stats",
    "category": "systems",
    "description": "Usage + telemetry statistics",
    "json": true,
    "legacyFn": false,
    "inSwitch": false
  },
  {
    "name": "status",
    "aliases": [],
    "module": null,
    "category": "systems",
    "description": "Registry-driven service dashboard",
    "json": true,
    "legacyFn": true,
    "inSwitch": true
  },
  {
    "name": "telemetry",
    "aliases": [],
    "module": "telemetry",
    "category": "systems",
    "description": "Local telemetry loop controls",
    "json": true,
    "legacyFn": false,
    "inSwitch": false
  },
  {
    "name": "tick",
    "aliases": [],
    "module": null,
    "category": "systems",
    "description": "Advance the orchestrator one tick",
    "json": false,
    "legacyFn": true,
    "inSwitch": true
  },
  {
    "name": "workers",
    "aliases": [
      "worker"
    ],
    "module": "workers",
    "category": "systems",
    "description": "Worker lane status",
    "json": true,
    "legacyFn": false,
    "inSwitch": true
  },
  {
    "name": "identity",
    "aliases": [],
    "module": "identity",
    "category": "identity",
    "description": "Identity registry inspection",
    "json": true,
    "legacyFn": false,
    "inSwitch": true
  },
  {
    "name": "whoami",
    "aliases": [
      "about"
    ],
    "module": null,
    "category": "identity",
    "description": "Identity + capability self-description",
    "json": true,
    "legacyFn": true,
    "inSwitch": true
  },
  {
    "name": "app",
    "aliases": [],
    "module": "desktop",
    "category": "workspace",
    "description": "WebUI desktop launcher status/control",
    "json": true,
    "legacyFn": false,
    "inSwitch": false
  },
  {
    "name": "architecture",
    "aliases": [
      "arch",
      "concepts"
    ],
    "module": "architecture",
    "category": "workspace",
    "description": "Architecture map + concepts",
    "json": false,
    "legacyFn": false,
    "inSwitch": true
  },
  {
    "name": "ask",
    "aliases": [],
    "module": "ask",
    "category": "workspace",
    "description": "REPL mode â€” /exit /clear /help /status, sessions saved â”‚",
    "json": false,
    "legacyFn": false,
    "inSwitch": true
  },
  {
    "name": "bars",
    "aliases": [],
    "module": null,
    "category": "workspace",
    "description": "Toggle status bars wrapping",
    "json": false,
    "legacyFn": true,
    "inSwitch": true
  },
  {
    "name": "bg",
    "aliases": [],
    "module": null,
    "category": "workspace",
    "description": "List active background jobs â”‚",
    "json": false,
    "legacyFn": true,
    "inSwitch": true
  },
  {
    "name": "buddy",
    "aliases": [],
    "module": "buddy",
    "category": "workspace",
    "description": "Buddy pairing surface",
    "json": false,
    "legacyFn": false,
    "inSwitch": false
  },
  {
    "name": "business",
    "aliases": [],
    "module": "business",
    "category": "workspace",
    "description": "Business operations + Twilio surface",
    "json": true,
    "legacyFn": false,
    "inSwitch": false
  },
  {
    "name": "completion",
    "aliases": [],
    "module": "completion",
    "category": "workspace",
    "description": "Emit shell completion script (bash/zsh/powershell)",
    "json": false,
    "legacyFn": false,
    "inSwitch": false
  },
  {
    "name": "heal",
    "aliases": [
      "recover"
    ],
    "module": "heal",
    "category": "workspace",
    "description": "Diagnose stack state, print recovery plan (no execution) â”‚",
    "json": false,
    "legacyFn": false,
    "inSwitch": true
  },
  {
    "name": "help",
    "aliases": [],
    "module": null,
    "category": "workspace",
    "description": "Show help (all commands, or one command)",
    "json": false,
    "legacyFn": false,
    "inSwitch": false
  },
  {
    "name": "mochi",
    "aliases": [],
    "module": null,
    "category": "workspace",
    "description": "Mochi status bars config",
    "json": false,
    "legacyFn": true,
    "inSwitch": true
  },
  {
    "name": "open",
    "aliases": [],
    "module": "open",
    "category": "workspace",
    "description": "Explicit UI launcher (web, tui, mission)",
    "json": false,
    "legacyFn": false,
    "inSwitch": false
  },
  {
    "name": "overview",
    "aliases": [
      "what-is-purpclaw",
      "whatis"
    ],
    "module": "overview",
    "category": "workspace",
    "description": "What-is-purpclaw overview",
    "json": false,
    "legacyFn": false,
    "inSwitch": true
  },
  {
    "name": "pocket",
    "aliases": [],
    "module": "pocket",
    "category": "workspace",
    "description": "Pocket OS: USB-portable mode, vault, spend",
    "json": true,
    "legacyFn": false,
    "inSwitch": true
  },
  {
    "name": "policies",
    "aliases": [],
    "module": null,
    "category": "workspace",
    "description": "Show active governance policies â”‚",
    "json": false,
    "legacyFn": true,
    "inSwitch": true
  },
  {
    "name": "secrets",
    "aliases": [],
    "module": "secrets",
    "category": "workspace",
    "description": "Secrets management surface",
    "json": false,
    "legacyFn": false,
    "inSwitch": false
  },
  {
    "name": "teleport",
    "aliases": [],
    "module": "teleport",
    "category": "workspace",
    "description": "Jump between project workspaces",
    "json": false,
    "legacyFn": false,
    "inSwitch": true
  },
  {
    "name": "tour",
    "aliases": [
      "walkthrough"
    ],
    "module": "tour",
    "category": "workspace",
    "description": "Guided tour of the stack",
    "json": false,
    "legacyFn": false,
    "inSwitch": true
  },
  {
    "name": "vault",
    "aliases": [],
    "module": "vault",
    "category": "workspace",
    "description": "AES-256-GCM encrypted vault",
    "json": false,
    "legacyFn": false,
    "inSwitch": false
  },
  {
    "name": "version",
    "aliases": [],
    "module": null,
    "category": "workspace",
    "description": "Print the purpclaw version",
    "json": false,
    "legacyFn": false,
    "inSwitch": false
  },
  {
    "name": "weather",
    "aliases": [],
    "module": "weather",
    "category": "workspace",
    "description": "Operational weather report",
    "json": true,
    "legacyFn": false,
    "inSwitch": false
  }
];

function index() {
  const byName = new Map();
  for (const e of COMMANDS) {
    byName.set(e.name, e);
    for (const a of e.aliases || []) byName.set(a, e);
  }
  return byName;
}
const BY_NAME = index();

function find(name) {
  return BY_NAME.get(String(name || '').toLowerCase()) || null;
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

function suggest(input) {
  const q = String(input || '').toLowerCase();
  if (!q) return [];
  const scored = [];
  for (const e of COMMANDS) {
    for (const cand of [e.name, ...(e.aliases || [])]) {
      let score = levenshtein(q, cand);
      if (cand.startsWith(q)) score -= 2;          // strong prefix signal
      if (score <= Math.max(1, Math.floor(cand.length / 3))) scored.push({ cand, score });
    }
  }
  scored.sort((a, b) => a.score - b.score);
  return [...new Set(scored.map(s => s.cand))].slice(0, 3);
}

function commands() { return COMMANDS; }
function categories() { return CATEGORY_ORDER.map(c => ({ key: c, title: CATEGORY_TITLES[c] })); }

module.exports = { commands, categories, find, suggest, CATEGORY_ORDER, CATEGORY_TITLES };
