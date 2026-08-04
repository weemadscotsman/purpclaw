# System Overview

Last updated: 2026-07-20.

```text
operator surfaces
  CLI | TUI | Mission Control | optional gateways
                         |
                   shared gateway
       sessions | policy | usage | attachments
                         |
                 gather-act-verify loop
       provider | tools | MCP | memory | delegation
                         |
       services | receipts | checkpoints | registries
```

`service_registry.js` defines CLI health expectations. `ecosystem.config.js`
defines PM2 processes. `app/` defines browser pages and APIs. Generated route and
service indexes expose definition truth; probes expose health truth.

Automatic rollback covers direct `write`, `edit`, and `delete` tool calls, not
arbitrary shell mutations. Delegation isolates sessions and default tools, not
the filesystem.
