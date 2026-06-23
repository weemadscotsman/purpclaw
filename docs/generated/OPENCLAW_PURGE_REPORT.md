# Foreign-Harness Purge Report

Generated during the 2026-06-19 routing/build documentation hardening pass.

## Result

Active runtime references were reduced to PURPCLAW-safe wording where they were only comparison/test language:

- `AGENT_ROOT_INDEX.md`
- `lib/persona-forge.js`
- `lib/omni/provider-integrity.js`

## Active Runtime Scan

Scan command:

```powershell
rg -n "OpenClaw|openclaw|OPENCLAW" AGENTS.md AGENT_ROOT_INDEX.md README.md package.json ecosystem.config.js unified_api.js bin lib app components config scripts service_registry.js agent_tower.js orchestrator.js voice_bridge_7792.js voice_coordinator.js smoke_test.js -g "!**/node_modules/**" -g "!**/.next/**"
```

Findings addressed:

| File | Finding | Action |
|---|---|---|
| `AGENT_ROOT_INDEX.md` | Claimed active foreign-harness residue in multiple files | Replaced with current quarantine policy and `rg` scan instruction |
| `lib/persona-forge.js` | Comment named an archived foreign reference | Reworded as archived persona-forge reference |
| `lib/omni/provider-integrity.js` | Provider trigger probe used a foreign product name | Reworded probe to generic external harness terminology |

## Remaining References

Remaining references are intentionally not bulk-edited because they are one of:

- translated security articles under `docs/zh-*` or `docs/tr/`
- explicit legacy migration material under `skills/_legacy/`
- third-party/donor/vendor material
- skill port notes that preserve upstream attribution

These are quarantined reference material, not active PURPCLAW runtime identity. If the operator wants a deeper content purge, it should be a separate legacy-doc rewrite pass, not mixed with routing/build hardening.

## Rule Going Forward

Active runtime code, current docs, UI labels, service names, route names, and operator status text should use PURPCLAW names only. Historical references must live in clearly labelled legacy/vendor/reference paths.
