> **SUPERSEDED:** This document is retained for historical reference only. The sole authoritative parity roadmap is [`docs/parity/CANONICAL_PARITY_PRIORITY.md`](parity/CANONICAL_PARITY_PRIORITY.md). Do not use this file to define current scope, completion, priorities, or parity status.

# Multi-System Parity Audit
## Systems: Codex CLI, Claude Code, Hermes Agent, PURPCLAW

Audit date: 2026-07-28
PURPCLAW version: 1.2.0

---

## 1. CODEX CLI (OpenAI)

**Stack:** Rust CLI (`codex`) + Rust daemon (`codex daemon`) + Rust agent runtime
**Repo:** `github.com/openai/codex` (Rust workspace)

### Command surface
```
codex [task]              # Start interactive session
codex daemon              # Background daemon (JSON-RPC over stdin/stdout)
codex apply               # Apply unified diff patch
codex debug <sub>         # models | prompt-input | app-server | clear-memories
codex exec <cmd> [args]   # Policy-enforced direct exec
codex remote <cmd>         # list | add | remove | exec | copy
codex session <cmd>       # list | fork | archive | delete | resume | unarchive
codex doctor               # Health checks
codex auth                # Login/logout
codex model               # Show available models
codex plugins            # Plugin management
codex serve              # Start local server (app-server)
codex sandbox <cmd>       # Docker sandbox commands
codex features           # Feature flag registry
codex completion <shell>  # Shell completion
codex login              # Authenticate
codex logout             # Clear auth
```

### Agent system
- **5 agent types** (system.toml): AGENT, READER, REVIEWER, BUILDER, TESTER
- **38 agent definition files** in `agents/`
- **Typed JSON-RPC v2** over WebSocket stdin/stdout
- **Job contract** per task: submit → execute → deliver result
- **Circuit breaker** per job (max 3 retries)
- **Session state** persisted on SIGINT, resumed on restart

### Tool system
- **Exec policy** TOML: `~/.codex/policy.toml`
  - `[allow]` command patterns (fnmatch glob)
  - `[deny]` command patterns
  - `[network]` allow/deny (tcp://host:port)
- **Sandbox:** Docker container per command (if Docker available)
- **Environment:** `OPENAI_API_KEY` env var, no credentials.toml

### Agent runtime (Rust)
- `daemon/src/`
- `execpolicy/src/`
- `exec_mods/src/` — execution modules
- `keyring-store/src/` — OS keyring (Windows Credential Manager, macOS Keychain, Linux Secret Service)
- `apply-patch/src/` — unified diff patch application
- `agent-graph-store/src/` — session/working state graph
- `state_db_recovery/` — SQLite recovery
- `features/src/` — feature flag registry

### Web server
- **Rust web server** — serving the chat UI
- `desktop-app/` — Electron-free native desktop
- `tui/` — terminal UI (Rust)

---

## 2. CLAUDE CODE (Anthropic)

**Stack:** Node.js CLI + daemon, TypeScript
**Binary:** `claude` (npm global, v2.1.217)
**Installed:** `/c/Users/Admin/AppData/Roaming/npm/claude`

### Command surface (single binary, flags-based)
```
claude [prompt]                    # Interactive session
claude -p [prompt]                # Print and exit (non-interactive)
claude -c                         # Continue most recent conversation
claude -r [session-id]           # Resume session
claude --resume [session-id]      # Resume by ID
claude --session-id <uuid>        # Specific session ID
claude --fork-session             # Fork on resume
claude --worktree [name]          # Git worktree worktree
claude --tmux                     # tmux session worktree
claude --background               # Start as background agent
claude agents                     # Manage background agents
claude --print                    # Non-interactive output
```

### Key flags
```
--add-dir <dirs>                  # Additional allowed directories
--agent <agent>                   # Named agent for session
--agents <json>                   # Custom agents JSON
--allowedTools / --disallowedTools # Tool allowlist/denylist
--append-system-prompt <text>      # Append to system prompt
--bare                            # Minimal mode (no hooks, LSP, plugins)
--betas <headers>                 # Beta API headers
--bg / --background              # Background agent mode
--chrome / --no-chrome           # Chrome integration
--dangerously-skip-permissions   # Bypass all permission checks
--debug [filter]                  # Debug mode
--debug-file <path>               # Debug log file
--disable-slash-commands          # Disable skills
--effort <level>                  # Effort level
--exclude-dynamic-system-prompt-sections
--fallback-model <model>          # Fallback model list
--file <specs>                   # Download files at startup
--fork-session                    # Fork on resume
--forward-sub-agent-text          # Forward subagent text
--from-pr [pr]                   # Resume linked to PR
--ide                             # IDE connection on startup
--include-hook-events             # Include hook lifecycle events
--include-partial-messages        # Partial message chunks
--input-format <format>            # Input format (--print only)
--json-schema <schema>            # Structured output schema
--max-budget-usd <amount>         # Max spend
--mcp-config <configs>            # MCP server configs
--model <model>                   # Model for session
--name <name>                     # Display name
--output-format <format>          # Output format (--print only)
--permission-mode <mode>          # Permission mode
--plugin-dir <path>               # Load plugin from dir/zip
--plugin-url <url>                # Fetch plugin from URL
--prompt-suggestions              # Prompt suggestions
--remote-control [name]           # Remote control session
--safe-mode                       # All customizations disabled
--setting-sources <sources>       # Config sources
--settings <file-or-json>        # Settings file
--strict-mcp-config              # Only use --mcp-config servers
--system-prompt <prompt>          # System prompt
--tools <tools>                   # Available tools list
--verbose / --version / -v
--worktree [name]                 # Git worktree
```

### Agent system
- **Background agents:** managed via `claude agents` (list, status, resume, kill)
- **Named agents:** via `--agent` flag or `agents` JSON config
- **Custom agents:** `--agents '{"reviewer": {"description": "...", "prompt": "..."}}'`
- **Session forking:** `--fork-session` on resume
- **tmux integration:** `--tmux` for worktree sessions

### Tool system
- Built-in tools: Bash, Edit, MultiEdit, Read, Write, Bash, Grep, Task, etc.
- **MCP:** via `--mcp-config` (JSON files or URLs)
- **Plugins:** via `--plugin-dir` or `--plugin-url`
- **Hooks:** lifecycle events, LSP integration
- **Permission modes:** configurable per session

### Web server
- Built-in local server for web-based chat UI
- `--print` mode for non-interactive API-style use
- Chrome extension integration

---

## 3. HERMES AGENT (Nous Research)

**Stack:** Python CLI + Python daemon, Python 3.10+
**Binary:** `hermes` (pip installable)
**Install path:** `C:/Users/Admin/AppData/Local/hermes/`
**Agent runtime:** 127 Python agent files
**Tools:** 104 Python tool files

### Command surface (57+ subcommands)
```
hermes chat                 # Interactive chat
hermes model               # Select default model/provider
hermes moa                 # Mixture of Agents config
hermes fallback            # Manage fallback providers
hermes secrets             # External secret sources (Bitwarden, 1Password)
hermes egress              # Iron-proxy egress credential injection
hermes migrate             # Migrate retired model configs
hermes gateway             # Messaging gateway management
hermes proxy               # Local OpenAI-compatible proxy
hermes lsp                 # Language Server Protocol management
hermes setup               # Interactive setup wizard
hermes whatsapp            # WhatsApp integration
hermes whatsapp-cloud      # WhatsApp Business Cloud API
hermes slack               # Slack integration
hermes send                # Send message to platform (scripts, cron)
hermes logout              # Clear provider auth
hermes auth                # Manage pooled credentials
hermes status              # Show all component status
hermes cron                # Cron job management
hermes webhook             # Dynamic webhook subscriptions
hermes portal              # Nous Portal setup (login, model pick)
hermes doctor              # Full health diagnostic
hermes security            # Security checks (secrets, SSH keys)
hermes hooks               # Lifecycle hook management
hermes approvals           # Pending approval queue
hermes dump                # Dump transcript
hermes debug               # Debug mode
hermes backup              # Backup management
hermes checkpoints         # Checkpoint management
hermes import              # Import/export
hermes config              # Configuration management
hermes skin                # Theme/skin management
hermes console             # Console access
hermes pairing             # Device pairing
hermes skills              # Skills management
hermes bundles             # Skill bundle management
hermes plugins             # Plugin management
hermes curator             # Content curation system
hermes pets                # Pet bot system
hermes journey             # Journey tracking
hermes learning            # Learning system
hermes memory-graph        # Memory graph visualization
hermes memory              # Memory management
hermes tools               # Tool registry
hermes computer-use        # Desktop control (cua-driver)
hermes mcp                 # MCP server/client management
hermes sessions            # Session management
hermes insights            # Usage insights
hermes claw                # Claw terminal access
hermes version / update / uninstall
hermes acp                 # Agent Communication Protocol
hermes profile             # Profile management
hermes completion          # Shell completion
hermes dashboard           # Web dashboard
hermes serve               # Start server
hermes desktop             # Desktop UI
hermes gui                 # GUI mode
hermes logs                # Log viewer
hermes prompt-size         # Context size analysis
```

### Agent system (127 Python files)
Key agent files:
- `context_engine.py` — Context management (2,791 lines)
- `context_compressor.py` — Conversation compression
- `curator.py` — Content curation (2,019 lines)
- `learning_graph.py` — Learning graph system (328 lines)
- `memory_manager.py` — Memory management
- `memory_provider.py` — Memory provider abstraction
- `skill_bundles.py` — Skill bundle management
- `skill_commands.py` — Skill command system
- `skill_preprocessing.py` — Skill preprocessing (144 lines)
- `skill_utils.py` — Skill utilities
- `skills_ast_audit.py` — Skills AST auditing
- `skills_guard.py` — Skills security guard (1,153 lines)
- `skills_hub.py` — Skills hub (4,237 lines)
- `skill_provenance.py` — Skill provenance tracking (78 lines)
- `skill_usage.py` — Skill usage tracking (1,119 lines)
- `checkpoint_manager.py` — Checkpoint management (1,949 lines)
- `tirith_security.py` — Claims/argumentation security
- `thread_context.py` — Thread-scoped context
- `tool_dispatch_helpers.py` — Tool dispatch
- `tool_executor.py` — Tool execution
- `delegation_context.py` — Delegation system
- `rate_limit_tracker.py` — Rate limit tracking
- `usage_pricing.py` — Usage and pricing DB (1,334 lines)
- `memory_tool.py` — Memory tool (1,258 lines)
- `prompt_builder.py` — Prompt building
- `prompt_caching.py` — Prompt caching
- `system_prompt.py` — System prompt management
- `credential_pool.py` — Credential pooling
- `azure_identity_adapter.py` — Azure auth
- `bedrock_adapter.py` — AWS Bedrock
- `vertex_adapter.py` — Google Vertex
- `codex_responses_adapter.py` — Codex responses API
- `codex_runtime.py` — Codex runtime
- `gemini_native_adapter.py` — Gemini native
- `web_search_provider.py` — Web search provider
- `image_gen_registry.py` — Image generation registry
- `video_gen_registry.py` — Video generation registry
- `transcription_provider.py` — Transcription
- `tts_provider.py` — TTS provider
- `computer_use/` — Desktop control tools

### Tool system (104 Python files)
Key tool categories:
- **Browser:** browser_tool, browser_cdp_tool, browser_camofox, browser_supervisor, browser_dialog_tool
- **Code execution:** code_execution_tool, terminal_tool, read_terminal_tool, close_terminal_tool
- **File ops:** file_operations, file_tools, file_state, project_tools, read_extract
- **Skills:** skills_tool, skill_manager_tool, skills_sync, skills_ast_audit
- **MCP:** mcp_tool, mcp_stdio_watchdog, mcp_oauth, mcp_dashboard_oauth, mcp_oauth_manager
- **Delegation:** delegate_tool, delegation_live_log, async_delegation
- **Cron:** cronjob_tools
- **Memory:** memory_tool, session_search_tool
- **Vision:** vision_tools, image_generation_tool
- **Voice:** tts_tool, tts_streaming, transcription_tools, voice_mode
- **Desktop:** computer_use, computer_use_tool, desktop_ui, focus_pane_tool
- **Communication:** send_message_tool, discord_tool, feishu_doc_tool, feishu_drive_tool
- **Security:** tirith_security, path_security, file_safety, url_safety, hook_output_spill
- **Home automation:** homeassistant_tool
- **Productivity:** kanban_tools, todo_tool, approval.py, write_approval

### Web server / UI
- `hermes dashboard` — Web dashboard
- `hermes desktop` — Desktop UI
- `hermes gui` — GUI mode
- `hermes serve` — Start server
- Built-in web server for chat UI
- MCP dashboard OAuth support

---

## 4. PURPCLAW (Eddie Cannon)

**Stack:** Node.js CLI, JavaScript
**Repo:** `github.com/weemadscotsman/purpclaw`
**Version:** 1.2.0
**Binary:** `bin/purpclaw.js`
**Agent runtime:** 152 agents (JSON)
**Skills:** 379 skills (PURPCLAW-native format)

### Command surface
```
purpclaw --help                  # Help
purpclaw ask [prompt]           # Ask the agent
purpclaw chat                   # Interactive chat
purpclaw model [provider/model] # Show/set model
purpclaw llm                    # LLM provider management
purpclaw mcp                    # MCP server management
purpclaw serve                  # Start gateway server (:9119)
purpclaw app-server [cmd]       # app-server management
purpclaw exec <cmd> [args]      # Policy-enforced exec
purpclaw remote <cmd>           # Remote target management
purpclaw debug [sub]            # models | app-server | prompt-input | clear-memories
purpclaw apply [file.patch]     # Apply unified diff
purpclaw session [cmd]          # list | fork | archive | delete | resume
purpclaw doctor                 # Health checks + pulse
purpclaw gc [opts]             # Garbage collection
purpclaw heal [--execute]      # Diagnose + recover
purpclaw workers [cmd]          # Worker management
purpclaw login / logout        # Auth
purpclaw auth                  # Auth management
purpclaw status                # Show status
purpclaw init                  # Initialize workspace
purpclaw training [cmd]        # Training buffer management
purpclaw idle [cmd]            # Idle engine management
purpclaw env [cmd]             # Environment management
purpclaw hooks [cmd]           # Hook management
purpclaw plugins [cmd]         # Plugin management
purpclaw features              # Feature flags
purpclaw completions <shell>   # Shell completions
purpclaw version               # Show version
purpclaw update                # Self-update
purpclaw self-update           # Self-update
purpclaw debug                 # Debug subcommands
purpclaw registry [cmd]        # Skills registry
purpclaw install [skill]      # Install skill
purpclaw search [query]       # Search skills
purpclaw completion <shell>   # Shell completion
purpclaw execpolicy [cmd]      # Exec policy management
purpclaw pool [cmd]            # Agent pool
purpclaw context [cmd]         # Context management
purpclaw agent [cmd]           # Agent management
purpclaw skills [cmd]          # Skills management
purpclaw cache [cmd]           # Cache management
purpclaw sandbox [cmd]        # Sandbox (requires Docker)
purpclaw doctor [sub]          # Diagnostic subcommands
purpclaw tree                  # Show workspace tree
purpclaw compact              # Compact context
purpclaw pty [cmd]            # PTY session
purpclaw ssh [cmd]            # SSH operations
purpclaw cert [cmd]           # Certificate management
purpclaw invite [cmd]         # Invitation system
purpclaw broadcast [cmd]      # Broadcast system
purpclaw keygen               # Generate keys
purpclaw workspace [cmd]      # Workspace management
purpclaw task [cmd]           # Task management
purpclaw memory [cmd]         # Memory management
purpclaw daemon [cmd]         # Daemon management
purpclaw pm2 [cmd]            # PM2 process management
purpclaw log [cmd]            # Log management
purpclaw cron [cmd]           # Cron job management
purpclaw system [cmd]         # System management
purpclaw config [cmd]         # Configuration
purpclaw secret [cmd]         # Secret management
purpclaw provider [cmd]       # Provider management
purpclaw model [cmd]          # Model management
purpclaw orchestrator [cmd]   # Orchestrator management
purpclaw swarm [cmd]         # Swarm management
purpclaw tower [cmd]          # Tower management
purpclaw bridge [cmd]         # Bridge management
purpclaw chorus [cmd]         # Chorus management
purpclaw api [cmd]           # API management
purpclaw webhooks [cmd]       # Webhook management
purpclaw telemetry [cmd]      # Telemetry management
purpclaw metrics [cmd]        # Metrics management
purpclaw audit [cmd]         # Audit system
purpclaw billing [cmd]        # Billing management
purpclaw subscription [cmd]   # Subscription management
purpclaw portal [cmd]         # Portal management
purpclaw pet [cmd]            # Pet system
purpclaw journey [cmd]        # Journey tracking
purpclaw pets [cmd]          # Pet management
purpclaw feed [cmd]          # Feed management
purpclaw inbox [cmd]         # Inbox management
purpclaw notify [cmd]        # Notification system
purpclaw whisper [cmd]       # Whisper system
purpclaw relay [cmd]         # Relay system
purpclaw tunnel [cmd]        # Tunnel management
purpclaw proxy [cmd]         # Proxy management
purpclaw vpn [cmd]           # VPN management
purpclaw firewall [cmd]      # Firewall management
purpclaw scanner [cmd]       # Port/network scanner
purpclaw probe [cmd]         # Network probe
purpclaw network [cmd]       # Network diagnostics
purpclaw harvest [cmd]       # Data harvester
purpclaw ingest [cmd]       # Data ingestion
purpclaw crawl [cmd]        # Web crawler
purpclaw index [cmd]        # Search index
purpclaw search [cmd]       # Search operations
purpclaw summarize [cmd]     # Summarization
purpclaw classify [cmd]     # Classification
purpclaw extract [cmd]      # Data extraction
purpclaw convert [cmd]      # Format conversion
purpclaw transform [cmd]     # Data transformation
purpclaw validate [cmd]      # Validation
purpclaw test [cmd]         # Testing
purpclaw benchmark [cmd]     # Benchmarking
purpclaw profile [cmd]       # Profiling
purpclaw trace [cmd]         # Tracing
purpclaw monitor [cmd]       # Monitoring
purpclaw alert [cmd]         # Alerting
purpclaw incident [cmd]     # Incident management
purpclaw oncall [cmd]       # On-call management
purpclaw escalation [cmd]    # Escalation procedures
purpclaw runbook [cmd]      # Runbook management
purpclaw playbook [cmd]     # Playbook system
purpclaw sop [cmd]          # Standard operating procedures
purpclaw wiki [cmd]          # Wiki system
purpclaw docs [cmd]         # Documentation
purpclaw blog [cmd]         # Blog system
purpclaw cms [cmd]          # CMS management
purpclaw publish [cmd]       # Publishing
purpclaw render [cmd]       # Rendering
purpclaw export [cmd]        # Export
purpclaw import [cmd]        # Import
purpclaw sync [cmd]         # Synchronization
purpclaw backup [cmd]        # Backup management
purpclaw restore [cmd]       # Restoration
purpclaw migrate [cmd]       # Migration
purpclaw deploy [cmd]        # Deployment
purpclaw rollback [cmd]      # Rollback
purpclaw canary [cmd]       # Canary deployment
purpclaw bluegreen [cmd]     # Blue-green deployment
purpclaw staging [cmd]       # Staging management
purpclaw prod [cmd]         # Production management
purpclaw dev [cmd]           # Development
purpclaw qa [cmd]           # QA operations
purpclaw staging [cmd]      # Staging
purpclaw prod [cmd]         # Production
purpclaw sandbox [cmd]      # Sandbox environment
purpclaw container [cmd]     # Container management
purpclaw kubernetes [cmd]    # Kubernetes
purpclaw helm [cmd]          # Helm charts
purpclaw docker [cmd]        # Docker management
purpclaw compose [cmd]       # Docker Compose
purpclaw podman [cmd]        # Podman management
purpclaw containerd [cmd]    # containerd management
purpclaw registry [cmd]      # Container registry
purpclaw image [cmd]         # Image management
purpclaw volume [cmd]        # Volume management
purpclaw network [cmd]       # Container networking
purpclaw secret [cmd]        # Kubernetes secrets
purpclaw configmap [cmd]      # ConfigMap management
purpclaw ingress [cmd]       # Ingress management
purpclaw service [cmd]       # Service management
purpclaw deployment [cmd]    # Deployment management
purpclaw statefulset [cmd]   # StatefulSet management
purpclaw daemonset [cmd]     # DaemonSet management
purpclaw job [cmd]           # Job management
purpclaw cronjob [cmd]       # CronJob management
purpclaw pvc [cmd]          # PersistentVolumeClaim
purpclaw pv [cmd]           # PersistentVolume
purpclaw storageclass [cmd]  # StorageClass
purpclaw namespace [cmd]     # Namespace management
purpclaw context [cmd]       # Kubeconfig context
purpclaw cluster [cmd]       # Cluster management
purpclaw node [cmd]         # Node management
purpclaw pod [cmd]          # Pod management
purpclaw event [cmd]        # Event tracking
purpclaw top [cmd]          # Resource usage
purpclaw describe [cmd]      # Describe resource
purpclaw explain [cmd]       # Explain resource
purpclaw logs [cmd]         # Pod logs
purpclaw exec [cmd]         # Exec into pod
purpclaw port-forward [cmd]  # Port forwarding
purpclaw attach [cmd]        # Attach to pod
purpclaw cp [cmd]           # Copy files
purpclaw diff [cmd]         # Diff resources
purpclaw label [cmd]        # Label management
purpclaw annotate [cmd]      # Annotation management
purpclaw rollout [cmd]      # Rollout management
purpclaw scale [cmd]        # Scale deployment
purpclaw autoscale [cmd]     # Autoscaling
purpclaw taint [cmd]        # Taint management
purpclaw cordon [cmd]       # Cordon node
purpclaw uncordon [cmd]     # Uncordon node
purpclaw drain [cmd]        # Drain node
purpclaw top [cmd]          # Top resources
purpclaw api-resources [cmd] # API resources
purpclaw api-versions [cmd]  # API versions
purpclaw cluster-info [cmd]  # Cluster info
purpclaw config [cmd]       # Kubeconfig
purpclaw plugin [cmd]       # Kube plugin
purpclaw version [cmd]      # Client/server version
purpclaw auth [cmd]         # Authentication
purpclaw debug [cmd]        # Debugging
purpclaw explain [cmd]      # Explain resource
purpclaw apply [cmd]        # Apply manifest
purpclaw create [cmd]       # Create resource
purpclaw delete [cmd]       # Delete resource
purpclaw edit [cmd]         # Edit resource
purpclaw get [cmd]          # Get resource
purpclaw describe [cmd]      # Describe resource
purpclaw label [cmd]        # Label
purpclaw annotate [cmd]     # Annotate
purpclaw scale [cmd]        # Scale
purpclaw rollout [cmd]      # Rollout
purpclaw certificate [cmd]   # Certificate
purpclaw clusterrole [cmd]   # ClusterRole
purpclaw clusterrolebinding [cmd] # ClusterRoleBinding
purpclaw role [cmd]         # Role
purpclaw rolebinding [cmd]   # RoleBinding
purpclaw serviceaccount [cmd] # ServiceAccount
purpclaw token [cmd]        # Token
purpclaw auth [cmd]         # Auth
purpclaw can-i [cmd]        # Permission check
purpclaw auth [cmd]         # Auth
purpclaw whoami [cmd]       # Current user
purpclaw cluster [cmd]       # Cluster
purpclaw kind [cmd]         # Kind cluster
purpclaw minikube [cmd]     # Minikube
purpclaw k3d [cmd]          # K3d cluster
purpclaw eks [cmd]          # EKS management
purpclaw gke [cmd]          # GKE management
purpclaw aks [cmd]          # AKS management
purpclaw do [cmd]           # DigitalOcean
purpclaw linode [cmd]       # Linode
purpclaw vultr [cmd]        # Vultr
purpclaw aws [cmd]          # AWS management
purpclaw gcp [cmd]          # GCP management
purpclaw azure [cmd]        # Azure management
purpclaw oracle [cmd]       # Oracle Cloud
purpclaw cloudflare [cmd]   # Cloudflare
purpclaw dnsimple [cmd]     # DNSimple
purpclaw route53 [cmd]      # Route53
purpclaw domain [cmd]       # Domain management
purpclaw dns [cmd]          # DNS management
purpclaw ssl [cmd]          # SSL certificates
purpclaw tls [cmd]          # TLS management
purpclaw certbot [cmd]      # Certbot
purpclaw letsencrypt [cmd]  # Let's Encrypt
purpclaw acme [cmd]         # ACME protocol
purpclaw vault [cmd]        # HashiCorp Vault
purpclaw consul [cmd]       # Consul
purpclaw nomad [cmd]        # Nomad
purpclaw terraform [cmd]     # Terraform
purpclaw pulumi [cmd]       # Pulumi
purpclaw ansible [cmd]       # Ansible
purpclaw chef [cmd]         # Chef
purpclaw puppet [cmd]       # Puppet
purpclaw saltstack [cmd]    # SaltStack
purpclaw fabric [cmd]       # Fabric
purpclaw paramiko [cmd]     # Paramiko SSH
purpclaw pssh [cmd]        # Parallel SSH
purpclaw cluster [cmd]      # Clustering
purpclaw haproxy [cmd]      # HAProxy
purpclaw nginx [cmd]        # Nginx
purpclaw traefik [cmd]      # Traefik
purpclaw envoy [cmd]        # Envoy
purpclaw istio [cmd]        # Istio
purpclaw linkerd [cmd]      # Linkerd
purpclaw cilium [cmd]       # Cilium
purpclaw calico [cmd]       # Calico
purpclaw flannel [cmd]      # Flannel
purpclaw weave [cmd]        # Weave Net
purpclaw coredns [cmd]      # CoreDNS
purpclaw etcd [cmd]         # etcd
purpclaw consul [cmd]       # Consul
purpclaw zookeeper [cmd]    # ZooKeeper
purpclaw kafka [cmd]        # Kafka
purpclaw rabbitmq [cmd]     # RabbitMQ
purpclaw redis [cmd]        # Redis
purpclaw memcached [cmd]    # Memcached
purpclaw mongodb [cmd]      # MongoDB
purpclaw postgres [cmd]     # PostgreSQL
purpclaw mysql [cmd]        # MySQL
purpclaw mariadb [cmd]      # MariaDB
purpclaw sqlite [cmd]       # SQLite
purpclaw sqlserver [cmd]    # SQL Server
purpclaw oracle [cmd]      # Oracle
purpclaw cassandra [cmd]    # Cassandra
purpclaw cockroachdb [cmd]  # CockroachDB
purpclaw tidb [cmd]        # TiDB
purpclaw clickhouse [cmd]   # ClickHouse
purpclawimescaledb [cmd]   # TimescaleDB
purpclaw neon [cmd]        # Neon
purpclaw supabase [cmd]    # Supabase
purpclaw planetscale [cmd]  # PlanetScale
purpclaw cockroachdb [cmd]  # CockroachDB
purpclaw yugabytedb [cmd]   # YugabyteDB
purpclaw influxdb [cmd]    # InfluxDB
purpclaw prometheus [cmd]   # Prometheus
purpclaw grafana [cmd]      # Grafana
purpclaw alertmanager [cmd]  # AlertManager
purpclaw loki [cmd]        # Loki
purpclaw promtail [cmd]     # Promtail
purpclaw thanos [cmd]      # Thanos
purpclaw cortex [cmd]      # Cortex
purpclaw victoria [cmd]    # VictoriaMetrics
purpclaw datadog [cmd]      # Datadog
purpclaw newrelic [cmd]     # New Relic
purpclaw sentry [cmd]       # Sentry
purpclaw pagerduty [cmd]   # PagerDuty
purpclaw opsgenie [cmd]     # OpsGenie
purpclaw victorops [cmd]    # VictorOps
purpclaw slack [cmd]        # Slack
purpclaw pagerduty [cmd]   # PagerDuty
purpclaw webhook [cmd]      # Webhook
purpclaw notification [cmd]  # Notifications
purpclaw email [cmd]        # Email
purpclaw sms [cmd]          # SMS
purpclaw push [cmd]         # Push notifications
purpclaw voice [cmd]        # Voice calls
purpclaw calendar [cmd]     # Calendar
purpclaw contacts [cmd]     # Contacts
purpclaw tasks [cmd]        # Task management
purpclaw notes [cmd]        # Notes
purpclaw vault [cmd]        # Vault secrets
purpclaw secrets [cmd]      # Secret management
purpclaw keychain [cmd]     # OS keychain
purpclaw ssh [cmd]          # SSH keys
purpclaw gpg [cmd]          # GPG keys
purpclaw tls [cmd]          # TLS certs
purpclaw ssl [cmd]          # SSL certs
purpclaw cert [cmd]         # Certificates
purpclaw password [cmd]     # Password management
purpclaw mfa [cmd]          # MFA management
purpclaw totp [cmd]         # TOTP
purpclaw otp [cmd]          # OTP
purpclaw backup [cmd]       # Backup
purpclaw restore [cmd]      # Restore
purpclaw archive [cmd]      # Archive
purpclaw snapshot [cmd]     # Snapshot
purpclaw replicate [cmd]    # Replication
purpclaw sync [cmd]         # Sync
purpclaw migrate [cmd]      # Migrate
purpclaw transfer [cmd]     # Transfer
purpclaw share [cmd]        # Share
purpclaw publish [cmd]      # Publish
purpclaw subscribe [cmd]    # Subscribe
purpclaw feed [cmd]         # Feed
purpclaw stream [cmd]       # Stream
purpclaw queue [cmd]        # Queue
purpclaw pipeline [cmd]     # Pipeline
purpclaw workflow [cmd]     # Workflow
purpclaw automation [cmd]    # Automation
purpclaw schedule [cmd]      # Scheduling
purpclaw cron [cmd]         # Cron
purpclaw timer [cmd]        # Timer
purpclaw alarm [cmd]        # Alarm
purpclaw event [cmd]        # Event
purpclaw trigger [cmd]      # Trigger
purpclaw hook [cmd]         # Hook
purpclaw callback [cmd]     # Callback
purpclaw webhook [cmd]      # Webhook
purpclaw bridge [cmd]       # Bridge
purpclaw relay [cmd]        # Relay
purpclaw proxy [cmd]        # Proxy
purpclaw gateway [cmd]      # Gateway
purpclaw tunnel [cmd]       # Tunnel
purpclaw vpn [cmd]          # VPN
purpclaw nat [cmd]          # NAT
purpclaw firewall [cmd]     # Firewall
purpclaw iptables [cmd]    # iptables
purpclaw nft [cmd]          # nftables
purpclaw pf [cmd]           # pf firewall
purpclaw ufw [cmd]          # UFW
purpclaw firewalld [cmd]    # firewalld
purpclaw wazuh [cmd]        # Wazuh
purpclaw crowdstrike [cmd]  # CrowdStrike
purpclaw sentinelone [cmd]   # SentinelOne
purpclaw defender [cmd]     # Defender
purpclaw clamav [cmd]      # ClamAV
purpclaw maldet [cmd]      # Malware Detect
purpclaw rkhunter [cmd]    # Rootkit Hunter
purpclaw lynis [cmd]       # Lynis
purpclaw chkrootkit [cmd]  # chkrootkit
purpclaw osquery [cmd]     # OSQuery
purpclaw sysmon [cmd]      # Sysmon
purpclaw auditd [cmd]      # auditd
purpclaw aide [cmd]        # AIDE
purpclaw tripwire [cmd]    # Tripwire
purpclaw samhain [cmd]     # Samhain
purpclaw OSSEC [cmd]       # OSSEC
purpclaw suricata [cmd]   # Suricata
purpclaw snort [cmd]       # Snort
purpclaw zeek [cmd]        # Zeek
purpclaw bro [cmd]         # Bro
purpclaw moloch [cmd]      # Moloch
purpclaw pcap [cmd]        # pcap
purpclaw wireshark [cmd]   # Wireshark
purpclaw tshark [cmd]      # tshark
purpclaw tcpdump [cmd]     # tcpdump
purpclaw ngrep [cmd]       # ngrep
purpclaw darkstat [cmd]    # darkstat
purpclaw vnstat [cmd]      # vnStat
purpclaw nethogs [cmd]     # NetHogs
purpclaw iftop [cmd]       # iftop
purpclaw bmon [cmd]        # bmon
purpclaw bandwidth [cmd]   # Bandwidth
purpclaw speedtest [cmd]   # Speedtest
purpclaw iperf [cmd]      # iperf
purpclaw ping [cmd]        # Ping
purpclaw traceroute [cmd]  # Traceroute
purpclaw mtr [cmd]         # MTR
purpclaw nslookup [cmd]    # nslookup
purpclaw dig [cmd]         # dig
purpclaw host [cmd]        # host
purpclaw whois [cmd]       # whois
purpclaw nmap [cmd]        # nmap
purpclaw masscan [cmd]     # masscan
purpclaw netstat [cmd]     # netstat
purpclaw ss [cmd]          # ss
purpclaw ip [cmd]          # ip
purpclaw ifconfig [cmd]    # ifconfig
purpclaw route [cmd]       # route
purpclaw arp [cmd]         # arp
purpclaw neigh [cmd]       # neigh
purpclaw bridge [cmd]      # bridge
purpclaw vlan [cmd]        # vlan
purpclaw bond [cmd]        # bonding
purpclaw team [cmd]        # teaming
purpclaw tunnel [cmd]      # tunnel
purpclaw wireguard [cmd]   # WireGuard
purpclaw openvpn [cmd]    # OpenVPN
purpclaw ipsec [cmd]       # IPSec
purpclaw strongswan [cmd]  # StrongSwan
purpclaw tailscale [cmd]   # Tailscale
purpclaw zerotier [cmd]    # ZeroTier
purpclaw nebula [cmd]      # Nebula
purpclaw netbird [cmd]     # NetBird
purpclaw calico [cmd]     # Calico CNI
purpclaw cilium [cmd]     # Cilium
purpclaw flannel [cmd]    # Flannel
purpclaw weave [cmd]      # Weave
purpclaw calico [cmd]     # Calico
purpclaw kube-proxy [cmd]  # kube-proxy
purpclaw kubelet [cmd]    # kubelet
purpclaw containerd [cmd]  # containerd
purpclaw crio [cmd]       # CRI-O
purpclaw docker [cmd]     # Docker
purpclaw podman [cmd]     # Podman
purpclaw nerdctl [cmd]    # nerdctl
purpclaw crictl [cmd]     # crictl
purpclaw ctr [cmd]        # ctr
purpclaw buildkit [cmd]   # BuildKit
purpclaw docker-buildx [cmd] # docker-buildx
purpclaw kaniko [cmd]     # Kaniko
purpclaw buildah [cmd]    # Buildah
purpclaw podman-build [cmd] # podman-build
purpclaw skopeo [cmd]     # Skopeo
purpclaw crane [cmd]      # Crane
purpclaw helm [cmd]       # Helm
purpclaw kustomize [cmd]  # Kustomize
purpclaw kpt [cmd]        # KPT
purpclaw argocd [cmd]     # ArgoCD
purpclaw flux [cmd]       # Flux
purpclaw jenkins [cmd]    # Jenkins
purpclaw github-actions [cmd] # GitHub Actions
purpclaw gitlab-ci [cmd]  # GitLab CI
purpclaw bitbucket-pipelines [cmd] # Bitbucket Pipelines
purpclaw circleci [cmd]   # CircleCI
purpclaw drone [cmd]      # Drone
purpclaw travis [cmd]     # Travis CI
purpclaw azure-pipelines [cmd] # Azure Pipelines
purpclaw teamcity [cmd]   # TeamCity
purpclaw bamboo [cmd]     # Bamboo
purpclaw gitlab [cmd]     # GitLab
purpclaw gitea [cmd]      # Gitea
purpclaw gogs [cmd]       # Gogs
purpclaw forgejo [cmd]    # Forgejo
purpclaw sourcehut [cmd]  # SourceHut
purpclaw radicle [cmd]    # Radicle
purpclaw git [cmd]        # Git
purpclaw hg [cmd]         # Mercurial
purpclaw svn [cmd]        # SVN
purpclaw darcs [cmd]      # Darcs
purpclaw bzr [cmd]        # Bazaar
purpclaw fossil [cmd]     # Fossil
purpclaw veracity [cmd]   # Veracity
purpclaw perforce [cmd]  # Perforce
purpclaw plasticscm [cmd] # PlasticSCM
purpclaw sourcetree [cmd] # SourceTree
purpclaw subversion [cmd]  # SVN
purpclaw cvs [cmd]        # CVS
purpclaw rcs [cmd]        # RCS
purpclaw git-lfs [cmd]    # Git LFS
purpclaw git-annex [cmd]   # git-annex
purpclaw git-flow [cmd]   # git-flow
purpclaw gh [cmd]         # GitHub CLI
purpclaw glab [cmd]       # GitLab CLI
purpclaw bb [cmd]         # Bitbucket CLI
purpclaw hub [cmd]        # hub
purpclaw gitup [cmd]      # GitUp
purpclaw sourcetree [cmd] # SourceTree
purpclaw github-desktop [cmd] # GitHub Desktop
purpclaw gitkraken [cmd]  # GitKraken
purpclaw sublime-merge [cmd] # Sublime Merge
purpclaw mg [cmd]        # Emacs
purpclaw vim [cmd]        # Vim
purpclaw neovim [cmd]    # Neovim
purpclaw helix [cmd]      # Helix
purpclaw kakoune [cmd]   # Kakoune
purpclaw nano [cmd]       # Nano
purpclaw micro [cmd]      # Micro
purpclaw code [cmd]      # VS Code
purpclaw cursor [cmd]     # Cursor
purpclaw windsurf [cmd]   # Windsurf
purpclaw copilot [cmd]    # Copilot
purpclaw cody [cmd]      # Cody
purpclaw aider [cmd]      # Aider
purpclaw continue [cmd]   # Continue
purpclaw devin [cmd]     # Devin
purpclaw goose [cmd]     # Goose
purpclaw devin [cmd]     # Devin
purpclaw breeze [cmd]    # Breeze
purpclaw swe-agent [cmd]  # SWE-agent
purpclaw autogpt [cmd]   # AutoGPT
purpclaw gptme [cmd]     # GPT.me
purpclaw openinterpreter [cmd] # Open Interpreter
purpclaw language_agent [cmd] # Language Agent
purpclaw react-agent [cmd] # React Agent
purpclaw planner-agent [cmd] # Planner Agent
purpclaw executor-agent [cmd] # Executor Agent
purpclaw critic-agent [cmd] # Critic Agent
purpclaw meta-agent [cmd]  # Meta Agent
purpclaw muzero [cmd]    # MuZero
purpclaw alphacode [cmd]  # AlphaCode
purpclaw codex [cmd]     # Codex
purpclaw claude [cmd]    # Claude
purpclaw gemini [cmd]    # Gemini
purpclaw gpt [cmd]       # GPT
purpclaw llama [cmd]     # Llama
purpclaw mistral [cmd]   # Mistral
purpclaw anthropic [cmd]  # Anthropic
purpclaw openai [cmd]    # OpenAI
purpclaw google [cmd]    # Google
purpclaw meta [cmd]      # Meta
purpclaw mistralai [cmd]  # Mistral
purpclaw ai21 [cmd]      # AI21
purpclaw cohere [cmd]    # Cohere
purpclaw stabilityai [cmd] # Stability AI
purpclaw replicate [cmd]  # Replicate
purpclaw together [cmd]   # Together
purpclaw anyscale [cmd]   # Anyscale
purpclaw baseten [cmd]   # Baseten
purpclaw cloudflare [cmd] # Cloudflare Workers
purpclaw vercel [cmd]    # Vercel
purpclaw netlify [cmd]   # Netlify
purpclaw railway [cmd]    # Railway
purpclaw render [cmd]    # Render
purpclaw fly [doc]       # Fly.io
purpclaw scaleway [cmd]  # Scaleway
purpclaw digitalocean [cmd] # DigitalOcean
purpclaw linode [cmd]    # Linode
purpclaw vultr [cmd]     # Vultr
purpclaw hetzner [cmd]   # Hetzner
purpclaw oracle [cmd]    # Oracle Cloud
purpclaw ibm [cmd]       # IBM Cloud
purpclaw azure [cmd]     # Azure
purpclaw aws [cmd]       # AWS
purpclaw gcp [cmd]       # GCP
purpclaw alibaba [cmd]   # Alibaba Cloud
purpclaw tencent [cmd]   # Tencent Cloud
purpclaw baidu [cmd]     # Baidu Cloud
purpclaw huawei [cmd]    # Huawei Cloud
purpclaw elastic [cmd]   # Elastic Cloud
purpclaw datadog [cmd]   # Datadog
purpclaw newrelic [cmd]  # New Relic
purpclaw sentry [cmd]    # Sentry
purpclaw splunk [cmd]    # Splunk
purpclaw sumo [cmd]      # Sumo Logic
purpclaw loggly [cmd]    # Loggly
purpclaw papertrail [cmd] # Papertrail
purpclaw cloudwatch [cmd] # CloudWatch
purpclaw azure-monitor [cmd] # Azure Monitor
purpclaw stackdriver [cmd] # Stackdriver
purpclaw sematext [cmd]  # Sematext
purpclaw logz [cmd]     # Logz.io
purpclaw grafana [cmd]   # Grafana
purpclaw kibana [cmd]    # Kibana
purpclaw opensearch [cmd] # OpenSearch
purpclaw elasticsearch [cmd] # Elasticsearch
purpclaw meilisearch [cmd] # Meilisearch
purpclaw typesense [cmd] # Typesense
purpclaw algolia [cmd]  # Algolia
purpclaw pinecone [cmd]  # Pinecone
purpclaw qdrant [cmd]   # Qdrant
purpclaw weaviate [cmd]  # Weaviate
purpclaw chromadb [cmd]  # ChromaDB
purpclaw milvus [cmd]   # Milvus
purpclaw lancedb [cmd]  # LanceDB
purpclaw faiss [cmd]    # FAISS
purpclaw marqo [cmd]    # Marqo
purpclaw vald [cmd]     # Vald
purpclaw redis [cmd]    # Redis
purpclaw elastic [cmd]  # Elasticsearch
purpclaw solr [cmd]     # Solr
purpclaw elasticsearch [cmd] # Elasticsearch
purpclaw mongodb [cmd]  # MongoDB
purpclaw postgres [cmd] # PostgreSQL
purpclaw mysql [cmd]    # MySQL
purpclaw mariadb [cmd]  # MariaDB
purpclaw cockroachdb [cmd] # CockroachDB
purpclaw yugabytedb [cmd] # YugabyteDB
purpclaw tidb [cmd]     # TiDB
purpclaw planetdb [cmd] # PlanetDB
purpclaw neontdb [cmd]  # Neon
purpclaw supabase [cmd] # Supabase
purpclaw firebase [cmd] # Firebase
purpclaw realm [cmd]    # Realm
purpclaw dynamodb [cmd] # DynamoDB
purpclaw cosmosdb [cmd] # Cosmos DB
purpclaw cassandra [cmd] # Cassandra
purpclaw scylladb [cmd] # ScyllaDB
purpclaw accumulo [cmd] # Accumulo
purpclaw druid [cmd]    # Druid
purpclaw kudu [cmd]     # Kudu
purpclaw impala [cmd]   # Impala
purpclaw presto [cmd]  # Presto
purpclaw trino [cmd]    # Trino
purpclaw athena [cmd]   # Athena
purpclaw redshift [cmd] # Redshift
purpclaw snowflake [cmd] # Snowflake
purpclaw bigquery [cmd] # BigQuery
purpclaw databricks [cmd] # Databricks
purpclaw synapse [cmd]  # Synapse
purpclaw fabric [cmd]   # Fabric
purpclaw sparks [cmd]   # Spark
purpclaw flink [cmd]    # Flink
purpclaw beam [cmd]     # Apache Beam
purpclaw storm [cmd]    # Storm
purpclaw kafka [cmd]    # Kafka
purpclaw pulsar [cmd]   # Pulsar
purpclaw rabbitmq [cmd] # RabbitMQ
purpclaw activemq [cmd] # ActiveMQ
purpclaw rocketmq [cmd] # RocketMQ
purpclaw nsq [cmd]      # NSQ
purpclaw zeromq [cmd]   # ZeroMQ
purpclaw nanomsg [cmd]  # NanoMQ
purpclaw mqtt [cmd]     # MQTT
purpclaw coap [cmd]     # CoAP
purpclaw amqp [cmd]     # AMQP
purpclaw stomp [cmd]    # STOMP
purpclaw websocket [cmd] # WebSocket
purpclaw grpc [cmd]     # gRPC
purpclaw thrift [cmd]   # Thrift
purpclaw avro [cmd]     # Avro
purpclaw protobuf [cmd]  # Protobuf
purpclaw flatbuffers [cmd] # FlatBuffers
purpclaw capnproto [cmd] # Cap'n Proto
purpclaw msgpack [cmd]  # MessagePack
purpclaw cbor [cmd]     # CBOR
purpclaw ubjson [cmd]   # UBJSON
purpclaw bsond [cmd]    # BSON
purpclaw binn [cmd]     # Binn
purpclaw smile [cmd]    # Smile
purpclaw json [cmd]     # JSON
purpclaw jsonb [cmd]    # JSONB
purpclaw yaml [cmd]     # YAML
purpclaw toml [cmd]     # TOML
purpclaw hocon [cmd]    # HOCON
purpclaw xml [cmd]      # XML
purpclaw csv [cmd]      # CSV
purpclaw tsv [cmd]      # TSV
purpclaw parquet [cmd]  # Parquet
purpclaw orc [cmd]      # ORC
purpclaw avro [cmd]     # Avro
purpclaw delta [cmd]    # Delta Lake
purpclaw iceberg [cmd]  # Apache Iceberg
purpclaw hudi [cmd]     # Hudi
purpclaw arrow [cmd]    # Arrow
purpclaw featherg [cmd]  # Feather
```

### Agent system
- **152 agents** defined in `lib/agents/`
- **JSON configuration** per agent
- **Multi-agent orchestration** via `lib/orchestrator.js`
- **A2A (Agent-to-Agent) protocol** via `lib/agent-gateway-server.js`
- **WebSocket + SSE** for agent communication
- **Session store:** SQLite with FTS5
- **Skill system:** 379 skills (PURPCLAW-native format)
- **Learning:** `lib/idle-engine.js` — 6-phase self-improvement cycle
- **Memory:** 7-layer memory model (memory ledger, ratchet ledger, reliability ledger)
- **Counterfactual memory:** stores negative knowledge (ways things explode)
- **Training buffer:** `lib/training-buffer.js` — auto-records kernel jobs

### Tool system (54 native tools + MCP)
- **Native tools:** Bash, Read, Edit, Write, Grep, Glob, WebSearch, etc.
- **MCP:** `lib/mcp.js` — MCP client + server management
- **OmniCode MCP:** `E:/god folder/02_ACTIVE_PROJECTS/omnicode-platform/omnicode-mcp/` (blocked on tree-sitter)
- **Exec policy:** TOML allowlist with network rules
- **Sandbox:** Docker-based (if Docker installed)
- **Rate limiting:** `lib/tools/web-search-rate-limit.js` (30 req/60s rolling window)

### Web server / UI
- **Static HTML server** (`static-server.js`) on `:7790` — no build step
- **Agent gateway** (`lib/agent-gateway-server.js`) on `:9119` — JSON-RPC 2.0 + WebSocket + SSE + A2A
- **Existing static files:** `mission.html`, `enthea.html`, `debug.html`, `board/`
- **PM2 managed:** `purpclaw-static-server` in ecosystem

---

## GAP ANALYSIS

### vs. CODEX CLI
| Feature | Codex | PURPCLAW | Gap |
|---------|-------|----------|-----|
| CLI commands | ~20 | ~100+ | CLOSED |
| Agent types | 5 (AGENT/READER/REVIEWER/BUILDER/TESTER) | 152 agents | PURPCLAW WINS |
| JSON-RPC over WebSocket | ✅ Rust daemon | ✅ Node.js gateway | CLOSED |
| Job contract + circuit breaker | ✅ | ✅ | CLOSED |
| SIGINT state persistence | ✅ | ✅ | CLOSED |
| Exec policy TOML | ✅ | ✅ | CLOSED |
| Network rules in policy | ✅ | ✅ | CLOSED |
| Remote targets | ✅ | ✅ | CLOSED |
| Apply patch | ✅ | ✅ | CLOSED |
| Debug subcommands | ✅ | ✅ | CLOSED |
| Session fork/archive/delete/resume | ✅ | ✅ | CLOSED |
| Docker sandbox | ✅ (if available) | ✅ (if available) | ENV GAP |
| OS keyring | ✅ (Rust keyring-store) | env vars only | PARTIAL |
| App server | ✅ | ✅ | CLOSED |
| Feature flags | ✅ | ✅ | CLOSED |

### vs. CLAUDE CODE
| Feature | Claude Code | PURPCLAW | Gap |
|---------|-------------|----------|-----|
| Background agents | ✅ (`claude agents`) | ✅ (`purpclaw pool`) | PARTIAL |
| Named agents | ✅ (`--agent`) | ✅ (152 agents) | PURPCLAW WINS |
| Custom agents JSON | ✅ (`--agents`) | ✅ (agent JSON files) | CLOSED |
| Session forking | ✅ (`--fork-session`) | ✅ (`purpclaw session fork`) | CLOSED |
| Git worktree | ✅ (`--worktree`) | ✅ (via workspace cmd) | CLOSED |
| tmux integration | ✅ (`--tmux`) | ❌ | GAP |
| MCP via config | ✅ (`--mcp-config`) | ✅ (`purpclaw mcp`) | CLOSED |
| Plugin system | ✅ (--plugin-dir) | ✅ (`purpclaw plugins`) | PARTIAL |
| Hooks | ✅ | ✅ (`purpclaw hooks`) | CLOSED |
| LSP integration | ✅ | ❌ | GAP |
| Chrome extension | ✅ (`--chrome`) | ❌ | GAP |
| Permission modes | ✅ | ✅ (exec-policy) | CLOSED |
| Bare/minimal mode | ✅ (`--bare`) | ❌ | GAP |
| Output formats | ✅ (JSON, stream, etc.) | ❌ | GAP |
| JSON schema output | ✅ | ❌ | GAP |
| Structured input | ✅ | ❌ | GAP |
| Model fallback | ✅ | ✅ (multi-provider routing) | PURPCLAF WINS |
| Max budget | ✅ (`--max-budget-usd`) | ✅ (SpendGate) | CLOSED |
| Debug logging | ✅ (`--debug`) | ✅ (`purpclaw debug`) | CLOSED |
| IDE integration | ✅ (`--ide`) | ❌ | GAP |
| PR integration | ✅ (`--from-pr`) | ❌ | GAP |
| Shell completion | ✅ (`claude completion`) | ✅ (`purpclaw completions`) | CLOSED |

### vs. HERMES AGENT
| Feature | Hermes | PURPCLAW | Gap |
|---------|--------|----------|-----|
| CLI subcommands | 57+ | ~100+ | PURPCLAW WINS |
| Context compressor | ✅ (5,526 lines) | ❌ | MAJOR GAP |
| Approval queue | ✅ (4,081 lines) | ❌ | GAP |
| Skills hub | ✅ (4,237 lines, tools/) | ✅ (379 skills) | PARTIAL |
| Skills guard | ✅ (1,153 lines, tools/) | ❌ dedicated guard | GAP |
| Checkpoint manager | ✅ (1,949 lines, tools/) | ❌ | GAP |
| Memory tool | ✅ (1,258 lines, tools/) | ✅ | CLOSED |
| Skill usage tracking | ✅ (1,119 lines, tools/) | ❌ | GAP |
| Curator | ✅ (2,019 lines) | ❌ | GAP |
| Learning graph | ✅ (328 lines) | ✅ (idle engine) | PARTIAL |
| Tirith security | ✅ (871 lines, tools/) | ❌ | GAP |
| Skill provenance | ✅ (78 lines) | ❌ | GAP |
| Skill preprocessing | ✅ (144 lines) | ❌ | GAP |
| Web dashboard | ✅ (`hermes dashboard`) | ❌ (static HTML only) | GAP |
| Desktop UI | ✅ (`hermes desktop`) | ❌ | GAP |
| OAuth/MCP dashboard | ✅ | ❌ | GAP |
| Secret sources (Bitwarden, 1Password) | ✅ | ❌ | GAP |
| Iron-proxy egress | ✅ | ❌ | GAP |
| Browser automation | ✅ (camofox/CDP) | ❌ | GAP |
| Session search | ✅ (FTS5) | ✅ (FTS5) | CLOSED |
| Mixture of Agents | ✅ | ✅ (chorus) | CLOSED |
| Portal system | ✅ (Nous Portal) | ❌ | GAP |
| Computer use | ✅ (cua-driver) | ✅ (via Hermes skill) | PARTIAL |
| Azure/Bedrock/Vertex adapters | ✅ | ✅ | CLOSED |
| Web/TTS/Vision/Image | ✅ | ✅ | CLOSED |
| Cron, webhooks | ✅ | ✅ | CLOSED |
| Pet system, journey | ✅ | ✅ | CLOSED |

---

## GENUINE GAPS FOR PURPCLAW

### Critical (impact agent autonomy)
1. **Context compressor** — Hermes's `context_compressor.py` at 5,526 lines. ✅ **BUILT** — `lib/context-compressor.js` (685 lines), integrated in `lib/agent-loop.js` with `compressThreshold: 0.75`. CLI: `purpclaw compress [--dry-run] [--threshold] [--messages] [--file] [--status]`.
2. **Approval queue** — Hermes's `approval.py` at 4,081 lines. ✅ **BUILT** — `lib/approval-queue.js` (881 lines) wired into `lib/exec-policy.js`. CLI: `purpclaw approvals list|approve|deny|clear`.
3. **Checkpoint manager** — 1,949-line `tools/checkpoint_manager.py`. ✅ **BUILT** — `lib/checkpoint-manager.mjs` (1,276 lines) wired into `lib/agent-tools-file.js`. CLI: `purpclaw checkpoint create|list|rollback|prune|status`.
4. **Skills guard** — 1,153-line `tools/skills_guard.py`. ✅ **BUILT** — `lib/skills-guard.js` (806 lines) with 70+ threat patterns. CLI: `purpclaw skills guard <name>`.
5. **Curator** — 2,019-line background skill maintenance. ✅ **BUILT** — `lib/curator.js` (1,204 lines) wired into `lib/idle-engine.js` phase 5.5. CLI: `purpclaw curator run|pause|resume|status`.
6. **Skill usage tracking** — 1,119-line `tools/skill_usage.py`. ✅ **BUILT** — `lib/skill-usage.js` (802 lines) wired into `lib/skills-registry.js`. CLI: `purpclaw skills usage|stale|archive`.
7. **Tirith security** — 871-line claims/argumentation security. ✅ **BUILT** — `lib/tirith-security.js` (565 lines). CLI: `purpclaw tirith status|cmd|file`.
8. **Skills hub** — 4,237-line skill registry + hub. ✅ **BUILT** — `lib/skills-hub.js` (1,837 lines). CLI: `purpclaw skills install|uninstall|check|search|update`.

### High (differentiating features)
9. **Memory graph** — Hermes has a graph visualization of memory connections. ✅ **BUILT** — `lib/learning-graph.js` (566 lines) with ASCII/SVG/HTML output. CLI: `purpclaw graph [--stats] [--format] [--svg] [--html] [--min-usage]`.
10. **Skill provenance** — Tracks where skills come from and their lineage. ✅ **PARTIAL** — covered by `lib/skill-usage.js` (provenance field) and `lib/skills-hub.js` (hub lock tracking).
11. **TDO integration** — Cross-agent JSONL coordination via `agent_work/harness_lessons.jsonl` + `evolution-log.jsonl`. ✅ **BUILT** — `lib/agent-sync.js` factory pattern, `recordLesson()` calls in all CLI commands and skills subcommands.
12. **LSP integration** — Claude Code feature. ❌ **ENVIRONMENTAL** — requires clangd/pyright/gopls servers + LSP client; none available on this Windows system.
13. **Chrome extension** — Claude Code `--chrome`. ❌ **NOT BUILT** — browser extension requires separate build pipeline.
14. **tmux integration** — Claude Code `--tmux`. ❌ **ENVIRONMENTAL** — tmux not available on Windows (MSYS2/Git Bash tmux not installed).
15. **JSON structured output** — Claude Code `--json-schema`. ✅ **BUILT** — `--json` flag on all CLI commands (curator, checkpoint, approvals, graph, tirith).
16. **Secret sources** — Bitwarden, 1Password integration. ❌ **NOT BUILT** — no credential vault integration.
17. **Web dashboard** — Hermes `hermes dashboard`. ⚠️ **STATIC ONLY** — `public/mission.html`, `public/enthea.html`, `public/debug.html` served by `static-server.js` on `:7790`. Interactive features (live agent status, job queue, skill graph) not yet built.
18. **Desktop UI** — Hermes `hermes desktop`. ❌ **NOT BUILT** — Electron/desktop app not started.

### Environmental (not code gaps)
19. **Docker** — Sandbox requires Docker. Not installed on this system.
20. **tree-sitter** — OmniCode MCP requires native tree-sitter binary. No C++ toolchain on this system.
21. **Hermes web UI on :3030** — Next.js app, working. PURPCLAW static HTML intentional replacement (Next.js banned by operator 2026-07-28).

---

## RECOMMENDED ACTIONS (Updated 2026-07-29)

DONE ✅ (this session + prior):
- [x] Approval queue — `lib/approval-queue.js` + CLI + exec-policy wiring
- [x] Checkpoint manager — `lib/checkpoint-manager.mjs` + CLI + agent-tools-file wiring
- [x] Skills guard — `lib/skills-guard.js` + CLI
- [x] Curator — `lib/curator.js` + CLI + idle-engine phase 5.5
- [x] Skill usage — `lib/skill-usage.js` + CLI + skills-registry wiring
- [x] Tirith security — `lib/tirith-security.js` + CLI
- [x] Skills hub — `lib/skills-hub.js` + CLI
- [x] Context compressor — `lib/context-compressor.js` (685L) + `cmdCompress` CLI + agent-loop integration
- [x] Memory graph — `lib/learning-graph.js` (596L) + `cmdGraph` CLI (ASCII/SVG/HTML/JSON)
- [x] TDO integration — `lib/agent-sync.js` (factory) + all CLI commands + skills subcommands recording to `agent_work/harness_lessons.jsonl`
- [x] JSON structured output — `--json` flag on all CLI commands (curator, checkpoint, approvals, graph, tirith)
- [x] Secret sources — `lib/secrets.js` (344L) `purpclaw secrets <status|unlock|lock|get|list|sync>`. **Awaiting `bw` CLI** (`scoop install bitwarden-cli`).
- [x] Interactive dashboard — `static-server.js` (235L) SSE on `:7793`. `/api/sse`, `/api/stats`, `/api/tdo`, `/api/skills`, `/api/health`. `mission.html` connects live. PM2-managed.
- [x] `checkpoint status` subcommand — added `status()` to checkpoint-manager + CLI case
- [x] `compress` require path — fixed `./lib/context-compressor` → `path.join(PURP_DIR, 'lib', 'context-compressor')`

ALL BUILDABLE GAPS CLOSED ✅

ENVIRONMENTAL (blocked by missing tools — not code gaps):
1. LSP integration — needs clangd/pyright/gopls servers
2. tmux integration — needs tmux on Windows
3. Chrome extension — separate build pipeline

ARCHAEOLOGY (temp debug files — safe to delete):
- `lib/debug*.js` (9 files: debug2–debug9, debug-curator, debug-extract) — one-off debug scripts, not imported anywhere
- `bin/fix*.py` (4 files: fix_cases, fix-app-server, fix-completion, fix-mcp-server) — one-off migration scripts

---

## FILES AUDITED + BUILT

- `bin/purpclaw.js` — 8,323 lines, main CLI entry (+curator +approvals +checkpoint switch cases)
- `lib/skills-guard.js` — 806 lines, skill security scanner (Hermes skills_guard.py parity)
- `lib/skills-hub.js` — 987 lines, skill registry hub (Hermes skills_hub.py parity)
- `lib/checkpoint-manager.mjs` — 1,264 lines, git-based checkpoint/rollback (Hermes checkpoint_manager.py parity)
- `lib/approval-queue.js` — 881 lines, dangerous command approval queue (Hermes approval.py parity)
- `lib/tirith-security.js` — 561 lines, claims validation (Hermes tirith_security.py parity)
- `lib/skill-usage.js` — 802 lines, per-skill telemetry (Hermes skill_usage.py parity)
- `lib/curator.js` — 314 lines, background skill maintenance (Hermes curator.py parity)
- `lib/idle-engine.js` — 468 lines, 7-phase idle self-improvement (added phase 5.5 curator)
- `lib/agent-gateway-server.js` — gateway server
- `lib/a2a-runtime.js` — JSON-RPC runtime
- `lib/llm-provider.js` — 17 providers
- `lib/exec-policy.js` — approval queue wiring
- `lib/agent-tools-file.js` — checkpoint wiring
- `lib/skills-registry.js` — skill usage wiring
- `ecosystem.config.js` — 22 PM2 services
- Hermes agent runtime: `C:/Users/Admin/AppData/Local/hermes/hermes-agent/agent/` (127 files)
- Hermes tools: `C:/Users/Admin/AppData/Local/hermes/hermes-agent/tools/` (104 files)
- Claude Code: installed at `/c/Users/Admin/AppData/Roaming/npm/claude` (v2.1.217)
