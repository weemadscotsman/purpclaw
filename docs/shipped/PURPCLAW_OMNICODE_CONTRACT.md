# PURPCLAW OmniCode Contract

PURPCLAW is the control plane. OmniCode is the repo intelligence engine.

This contract keeps the stack API-first:

- PURPCLAW owns job intake, routing, agent delegation, reports, and operator-visible proof.
- OmniCode owns repo indexing, symbol retrieval, resolution ledger, benchmark proof, and repair safety.
- Repo-aware PURPCLAW jobs must attach OmniCode intake proof before swarm delegation.
- Destructive repair is blocked unless OmniCode reports zero unknown files and zero blocking repair gaps.

## HTTP Surface

### `GET /api/omnicode/status`

Returns bridge health, platform discovery, MCP readiness, ledger proof, and repair-governor state.

Primary fields:

- `mode`: `mcp-build-present`, `source-ready-build-needed`, or `ledger-only`
- `capabilities`: MCP runner/source/dist/ledger availability
- `gates.zeroUnknownFiles`: true only when the local ledger has zero unknown files
- `gates.destructiveRepairAllowed`: true only when unknown files and blocking repair gaps are both zero
- `proof`: `.omnicode/benchmark.json` summary

### `POST /api/omnicode/repo-intake`

Body:

```json
{
  "repoPath": "E:\\god folder\\02_ACTIVE_PROJECTS\\PURPCLAW",
  "goal": "audit repo and plan repair",
  "tools": ["session_resume_brief", "repo_map", "resolve_all", "benchmark"]
}
```

Returns a concrete execution contract:

- ordered OmniCode tool steps
- invocation shape through MCP `invoke_tool`
- local ledger proof payload
- repair-governor state
- next action if OmniCode MCP build/runtime is not ready

## MCP Surface

PURPCLAW exposes `omnicode_repo_intake` as an MCP tool. External agents should call PURPCLAW first, then let PURPCLAW delegate to OmniCode.

That preserves the control-plane rule: agents do not freeload around the job spine.

## Kernel Integration

When `/api/kernel/jobs` receives `repoPath`, `repo`, or `repository`, the API harness kernel attaches `omnicodeIntake` to the job snapshot.

This lets Mission Control show:

- the repo path
- ledger proof
- unknown file count
- blocking repair gaps
- whether destructive repair is allowed

## Current Honest State

On this machine the OmniCode platform source, `run_omnicode.cmd`, and built MCP server artifact are present. PURPCLAW reports `mcp-build-present` when it can discover the MCP server build. The bridge also reports that it does not run a live MCP health probe on every status request, so live health must be proven by an explicit verification command.

The current repo ledger still reports blocking repair gaps, so destructive repair remains blocked even when the MCP build is present.
