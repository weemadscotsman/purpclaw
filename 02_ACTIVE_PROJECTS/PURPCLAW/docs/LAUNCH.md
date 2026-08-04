# PurpClaw Launch Notes

> Version source: `package.json` · Updated: 2026-08-04 · Status: CURRENT

## Release Copy Template

Use release copy that separates product capability, generated registry facts and current health:

> PurpClaw `<version from package.json>` is a local-first AI workstation OS with CLI, TUI, Mission Control, persistent sessions and memory, multi-provider routing, governed tools, MCP, delegation, checkpoints and optional messaging, voice and vision lanes. Generated registry facts come from `public/showcase/truth-manifest.json`. Configuration and live health vary by installation and must be verified with current probes.

Do not paste fixed tool, agent, provider, service or route counts into this file.

## Claim Rules

- “Registered” means present in canonical generated inventory.
- “Executor-backed” means a real implementation path exists.
- “Strict-live” requires the proof ladder.
- “Healthy” and “running” require current probes.
- Adapter presence does not imply credentials, quota or successful calls.
- PM2 definition does not imply process health.
- External MCP tool counts must not be added to native totals as though permanently connected.

Canonical install instructions: `README.md` and `QUICKSTART.md`.
Canonical operational semantics: `STATUS.md`.
Canonical release gates: `RELEASE_CHECKLIST.md`.
