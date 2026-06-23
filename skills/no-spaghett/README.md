# No Spaghett Skill

Use this skill when an agent needs to inspect a codebase for architecture problems, circular dependencies, dead code, long files, God objects, or Python hygiene issues.

Service base URL: `http://127.0.0.1:7797`

## Endpoints

- `GET /api/health` - service status and available operations.
- `POST /api/analyze-path` - analyze a local folder already on this machine.
- `POST /api/analyze-git` - analyze a public GitHub repository URL.
- `POST /api/refactor` - ask the Gemini refactor engine for a specific issue or architecture plan.

## Local Folder Analysis

Request:

```json
{
  "path": "E:\\god folder\\02_ACTIVE_PROJECTS\\PURPCLAW\\some-project",
  "maxFiles": 2500,
  "includeContent": false
}
```

Response contains:

- `metrics` - score, circular deps, God objects, dead code, long files, Python issues.
- `rawGraph` - nodes, edges, reverse edges.
- `docs` - generated `CODE_HEALTH.md`, `ARCHITECTURE_GRAPH.md`, and `CLEANUP_PLAN.md` content.
- `thringletImpact` - bridge status, colony mood, projected mood, distress score, and a system-confession summary.

## Thringlet Integration

No Spaghett talks to the PURPCLAW Thringlet bridge at `http://127.0.0.1:7799`.

- Analysis is read-only: it includes colony mood and projected codebase distress.
- AI refactor/exorcism is write-aware: successful refactor requests post an interaction back to the bridge.
- If the bridge is offline, analysis still works and reports `bridgeOnline: false`.

The emotional mapping is structural, not decorative:

- Circular dependencies are prayer wheels.
- God objects are overloaded social hubs.
- Dead-code candidates are forgotten files.
- Low architecture score increases projected distress.

## Agent Rules

1. Analyze before editing.
2. Treat `metrics` and `rawGraph` as the structural source of truth.
3. Fix dependency cycles before moving files.
4. Split God objects by responsibility, then update imports.
5. Verify with the target repo build/test gate after each cleanup batch.
6. If `thringletImpact.bridgeOnline` is true, include the mood and distress summary in handoff reports.
