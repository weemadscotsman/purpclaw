# Engineering Pickup

Read `divisions/engineering/memory/handoff-engineering.md` first.

Current state: The side-folder audit pass is documentation-only, and the shared surface catalog now includes direct Photon-backed iMessage plus Raft Agent Network as an external gateway channel across CLI/TUI/web action capabilities. The legacy `skills/imessage` file is Mac/imsg-based reference material only; the shared iMessage capability is explicitly Photon-only and no-Mac-relay.

Important boundary: do not patch runtime code from the audit alone. Pick one future batch first, then implement that batch only.

Open tasks:
- Batch 1: registry truth reconciliation.
- Batch 2: steering/context loader.
- Batch 3: task system separation.
- Batch 4: stress/evidence integration.
- Batch 5: podcast/studio/media capability.
- Batch 6: skill/tool provenance.
- Batch 7: archive/donor quarantine.
- Continue parity verification for new capabilities through `purpclaw feature --verify --json`, `purpclaw action <capability> --dry-run --json`, TUI smoke, and TypeScript.
- Real Raft dispatch still needs `RAFT_AGENT_NETWORK_BASE_URL` or `RAFT_API_BASE_URL`, `RAFT_AGENT_NETWORK_API_KEY` or `RAFT_API_KEY`, and `RAFT_AGENT_NETWORK_ENABLE_DISPATCH=true`.
