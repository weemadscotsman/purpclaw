# Ponytail × PurpClaw × OmniCode

Ponytail (DietrichGebert/ponytail v4.5.0) is vendored as a subtree at
`vendor/ponytail/`. OmniCode MCP exposes it as three read-only tools:

- `ponytail_system_transform` — returns the filtered instruction block
  for the active mode, ready to prepend to a system prompt.
- `ponytail_audit` — scans an indexed repo and emits the same tag
  format `skills/ponytail-audit/SKILL.md` describes
  (`delete: / stdlib: / native: / yagni: / shrink:`).
- `ponytail_repair_plan` — runs `ponytail_audit`, groups findings by
  file, and writes a real `.md` repair handoff to disk. **Phase D
  format (post-D-3)**: every finding has a stable `id` (`PT-NNN`),
  a `confidence` (high/medium/low, evidence-based), a `risk`
  (low/medium/high/blocked, same classifier the verifier uses), a
  `patch_type` (delete/replace/inline/split), a `status` (planned by
  default — the executor flips to applied/verified), a copy-pasteable
  `verifier` shell command, a `rollback` recipe, an `affected_symbol`,
  and the raw `evidence` from the audit. The MD header carries a
  `Plan hash` (sha256 of touched files) so the verifier can detect
  drift without re-running the audit. **The MD is the canonical
  artifact future agents read instead of re-running the audit.** Like
  `write_repair_handoff` and `omni_patch_review`, this is ADVISORY
  ONLY — it never mutates the repo. The Phase C legacy form (one
  bullet per finding, no fields) is still parsed by the verifier for
  backward compat, but the writer now produces Phase D by default.
- `ponytail_verify_plan` — reads a previously-written
  `PONYTAIL_REPAIR_PLAN.md`, walks every finding against the live
  filesystem and the OmniCode index, and returns per-finding
  **seven-state** verdicts (`valid` / `applied` / `stale` /
  `missing_file` / `ambiguous` / `blocked` / `unknown`), per-finding
  risk classification (`low` / `medium` / `high` / `blocked`),
  per-file rollup with content hashes, and a top-level
  **five-state** verdict (`safe_to_execute` / `partial_execute` /
  `review_required` / `stale_plan` / `invalid_plan`) plus
  `recommendation` + `nextAction`. Sets `legacyPlan: true` for
  Phase C artifacts missing the D-3 fields. Optional `write:true`
  flag exports a `PONYTAIL_VERIFY_REPORT.md` next to the plan.
  Read-only by default. The spine of Phase D — "no plan is
  executable until it has confidence, risk, verifier, and
  staleness status."

PurpClaw wires all three through three integration layers:

- **CLI**: `purpclaw ponytail <sub>` (`status` / `off` / `lite` / `full` /
  `ultra` / `audit <path>` / `plan <path>`). The `audit` and `plan`
  subcommands `require()` OmniCode's tool module directly (same Node
  runtime) — no socket, no JSON-RPC, no spawn. Override the install
  location with `OMNICODE_MCP_DIR`.
- **Tool registry**: `lib/vendor/ponytail.js` is the PurpClaw-side
  wrapper that re-exports the vendored `hooks/ponytail-instructions.js`
  and `hooks/ponytail-config.js`. Lazy-bound, fail-open.
- **Agent loop**: `buildSystemPrompt` in `lib/agent-loop.js` reads the
  active mode from the vendor wrapper and prepends the filtered
  instruction block to the system prompt. Same fail-open contract as
  the preprompt compiler. `ponytail off` removes the block; `ponytail
  full` puts it back. No re-implementation.

## Layout

```
PURPCLAW/
  vendor/ponytail/                            # vendored subtree (source of truth)
    AGENTS.md, skills/, hooks/, ...           # the whole ponytail repo, minus .git
    PURPCLAW_VENDOR_CHECKSUMS.json            # SHA-256 per file, drift detector
  lib/vendor/ponytail.js                      # PurpClaw-side re-export wrapper
  lib/commands/ponytail.js                    # `purpclaw ponytail ...` CLI dispatcher
  lib/agent-loop.js                           # system-prompt doctrine injection (mode-aware)
  scripts/checksum-vendor.js                  # regenerates the checksum manifest
omnicode-mcp/
  dist/tools/ponytail_tools.js                # the four new tool implementations
  dist/server.js                              # +4 dispatcher cases
  dist/tool_registry.js                       # +4 tool definitions
  dist/security/rbac.js                       # +4 permissions (read-only + agent)
```

The vendored subtree is git-ignored (see `.gitignore` line `vendor/ponytail/`)
because it is upstream's source of truth, not our code.

## How to verify

From a fresh shell:

```bash
# 1. Confirm the wrapper is wired
cd "E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW"
node -e "const p = require('./lib/vendor/ponytail'); console.log(p.vendorStatus())"
# => { present: true, version: "4.5.0", ... }

# 2. Confirm OmniCode exposes the tools
cd "E:/god folder/02_ACTIVE_PROJECTS/omnicode-platform/omnicode-mcp"
OMNICODE_ROLE=admin node -e "console.log(require('./dist/tool_registry').TOOL_DEFINITIONS.filter(t => t.name.startsWith('ponytail_')).map(t => t.name))"
# => [ 'ponytail_system_transform', 'ponytail_audit', 'ponytail_repair_plan' ]

# 3. CLI end-to-end (status, mode-switch, audit, plan)
cd "E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW"
node bin/purpclaw.js ponytail status
# => ponytail mode:  full
node bin/purpclaw.js ponytail ultra
# => ponytail mode set to: ultra, persisted to: ...
node bin/purpclaw.js ponytail audit vendor/ponytail --level=lite
# => ponytail_audit — 10 findings (level=lite, version=4.5.0)
node bin/purpclaw.js ponytail plan vendor/ponytail --level=full
# => ponytail_repair_plan — wrote 5287 bytes, plan: ...PONYTAIL_REPAIR_PLAN.md
node bin/purpclaw.js ponytail verify vendor/ponytail
# => ponytail_verify_plan — counts: {valid: 3, applied: 14, stale: 0, ...}
#    safe_to_execute: yes — 3 valid findings, none stale or unknown
#    per-finding: [verdict|risk] tag file text
node bin/purpclaw.js ponytail verify "E:/god folder/02/omnicode-platform/omnicode-mcp" --write
# => writes PONYTAIL_VERIFY_REPORT.md (17KB) next to the plan
#    full audit trail for human review

# 4. Confirm the agent loop picks up the mode
node -e "
delete require.cache[require.resolve('./lib/vendor/ponytail')];
const al = require('./lib/agent-loop');
const p = al.buildSystemPrompt({});
const t = Array.isArray(p) ? p.join('\n') : p;
const m = t.match(/PONYTAIL MODE ACTIVE — level: (\w+)/);
console.log('mode in agent prompt:', m ? m[1] : '(none — off)');
"
# => mode in agent prompt: full
```

## Routing architecture

```
purpclaw ponytail audit <path> --level=N
   │
   ▼
lib/commands/ponytail.js (resolveOmniToolsModule)
   │
   ▼ walk-up search (or OMNICODE_MCP_DIR)
   │
E:/god folder/02_ACTIVE_PROJECTS/omnicode-platform/omnicode-mcp/dist/tools/ponytail_tools.js
   │
   ▼ same Node process, no socket
   │
ponytailAudit() → SQL on ~/.omnicode/<hash>.db → JSON
```

Same shape for `ponytail plan <path>`. The agent loop's doctrine
injection goes through the **vendored** `lib/vendor/ponytail.js`
(also same Node process) — never through the MCP server's stdio or
the orchestrator's HTTP proxy.

## Upgrading the vendor

1. Pull the new ponytail release: `cd vendor/ponytail && git pull`
   (the vendor copy is a real git checkout, just not under our root).
2. `node scripts/checksum-vendor.js` — regenerates the manifest.
3. `node vendor/ponytail/scripts/check-rule-copies.js` — confirms the
   rule copies inside the vendor still agree with the source.
4. Smoke-test both OmniCode tools against a small indexed repo.

## Known limitations

- `ponytail_audit` over-reports `delete:` for TypeScript `interface`
  and `type` declarations because the AST edges table tracks runtime
  references, not type-only ones. This is honest signal — the
  `get_file_slice` follow-up call should confirm before any cut.
- `ponytail_audit` requires the target repo to already be indexed by
  OmniCode (`omnicode index <path>`). If not indexed, the call returns
  `initDb failed: ...` with the real error.
- The audit does not edit code. It only reports. Cuts are the caller's
  job — same doctrine as `skills/ponytail-audit/SKILL.md`.
- `ponytail_repair_plan` writes a real MD but does NOT detect a stale
  plan. The MD's `Generated:` timestamp is the staleness contract — a
  cold agent should re-run the plan if any file in the cut list has
  been modified since that timestamp. A future iteration could compute
  a content hash and refuse to over-write a newer one.
- `ponytail_repair_plan` caps findings at the same level caps the audit
  uses (lite=10, full=100, ultra=all). On a large repo at `ultra` the
  MD can be large. Same doctrine as the audit — read the top of the
  per-file cut list first, the rest is overflow.
