# PURPCLAW FILESYSTEM MIGRATION MANIFEST

Tag: pre-canonical-filesystem-migration
Generated: 2026-08-04

## Classification Summary

- MIGRATE: 21 files (copy to packages/, add wrapper, update callers)
- COMPAT: 93 files (CLI commands, stay in lib/commands/)
- KEEP_IN_LIB: 59 files (stable lib code, keep in place)
- AGENT_INTERNAL: 1 file

## Migration Order (by dependency)

1. memory/spine, context-engine, memory-client
2. llm-provider, tool-runtime, agent-gateway
3. harness/engine, harness/task-schema, harness/result-schema
4. runtime/provider-config, runtime/autonomy-runner
5. pipeline-registry

## Wrapper Policy

Every migrated file keeps lib/NAME.js as a thin compatibility wrapper.
Wrapper removed only after grep proves zero remaining callers.
