# PURPCLAW BMad Organs Plan

Built: 2026-06-29

PURPCLAW should not copy BMad ceremony. It should absorb the useful operating organs and translate them into PURPCLAW's existing Oracle, Weatherman, registry, agent, and memory system.

## Priority Order

1. `purpclaw next` / Oracle next-step engine
2. Scale-adaptive task classifier
3. Workflow registry
4. Oracle + Weatherman reports
5. Council Mode
6. Export packs
7. Agent/workflow builder

## Implemented Now

- `registry/workflows.json` is the typed workflow catalog.
- `lib/workflow-registry.js` reads workflow data, classifies task scale, inspects artifacts, determines phase, and returns one next command.
- `lib/commands/next.js` exposes `purpclaw next [task] [--json]`.
- `lib/commands/workflow.js` exposes `purpclaw workflow [id] [--json]`.
- `lib/surface-capabilities.js` advertises `next-step` and `council-mode`.

## Workflow Type

```ts
type PurpWorkflow = {
  id: string;
  name: string;
  phase: 'discovery' | 'planning' | 'solutioning' | 'implementation' | 'runtime';
  requiredInputs: string[];
  outputs: string[];
  agents: string[];
  next: string[];
  command: string;
};
```

## Scale Classifier

| Level | Meaning | Default Ceremony |
|---|---|---|
| 0 | tiny fix | patch plus affected check |
| 1 | bug | reproduction, patch, regression check |
| 2 | feature | brief, acceptance criteria, tests |
| 3 | module | architecture, stories, tests, review |
| 4 | product | PRD, UX map, architecture, epics, test plan |
| 5 | enterprise/system | risk, contracts, operations, security review |

## Oracle / Weatherman Split

Oracle decides:

- what phase the project is in
- what matters next
- what is missing
- what command should run next

Weatherman warns:

- build health
- provider health
- memory health
- duplicate UI risk
- broken routes
- token burn
- agent loop risk
- unwired features

The next-step engine must stay read-only. It can recommend workflow commands, but it must not patch files or execute work by itself.

## Next Implementation Targets

- Wire `purpclaw next` into Oracle report output.
- Add test-result and git-status evidence to `artifactState()`.
- Add `purpclaw council` as a read-only decision session wrapper around Podcast Studio.
- Add `purpclaw pack` exporters after the planning artifact paths stabilize.
