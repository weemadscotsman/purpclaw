# PARITY_MATRIX.md

**PURPCLAW Agent Harness Parity Matrix**
Version 1.0 — 2026-08-04

Cross-reference of capabilities across all four harness modes.

---

## Capability Matrix

| Capability | Codex | Claude | Hermes | MiniMax |
|---|:---:|:---:|:---:|:---:|
| Shared task schema | Required | Required | Required | Required |
| Shared result schema | Required | Required | Required | Required |
| Repo file search | Strong | Strong | Medium | Medium |
| File editing | Strong | Strong | Strong | Strong |
| Test execution | Strong | Required | Required | Required |
| Large-context reasoning | Medium | Strong | Medium | Medium |
| Tool orchestration | Medium | Medium | Strong | Medium |
| Artifact generation | Medium | Medium | Strong | Strong |
| UI generation | Medium | Medium | Medium | Strong |
| Resume state | Required | Required | Required | Required |
| Audit trail | Required | Required | Required | Required |
| Acceptance criteria | Required | Required | Required | Required |
| Architecture-first context | — | Strong | — | — |
| Contradiction detection | — | Strong | — | — |
| Retry + fallback logic | — | — | Strong | — |
| Design-token loading | — | — | — | Strong |
| Screenshot-to-component | — | — | — | Strong |

---

## Phase Status

```
Phase 0  NON-NEGOTIABLE PARITY CONTRACT         ✅ DONE
Phase 1  CANONICAL DIRECTORY LAYOUT            ✅ DONE
Phase 2  SHARED FOUNDATION
  2.1  Shared task schema                     ✅ DONE
  2.2  Shared result schema                   ✅ DONE
  2.3  Context spine                          ✅ DONE
  2.4  Verification core                      ✅ DONE
  2.5  Memory and audit                      ✅ DONE
Phase 3  CODEX PARITY                          ✅ DONE (harness-codex)
Phase 4  CLAUDE PARITY                         ✅ DONE (harness-claude)
Phase 5  HERMES PARITY                         ✅ DONE (harness-hermes)
Phase 6  MINIMAX PARITY                        ✅ DONE (harness-minimax)
Phase 7  CROSS-HARNESS ROUTING                 ✅ DONE (packages/index.js)
Phase 8  PARITY MATRIX                         ✅ DONE (this file)
Phase 9  RELEASE GATES
  Gate A — Contract parity                    ✅ DONE
  Gate B — Context parity                      ✅ DONE
  Gate C — Execution parity                    ✅ DONE
  Gate D — Verification parity                 ✅ DONE
  Gate E — Presentation parity                ✅ DONE (api/harness/parity)
  Gate F — Audit parity                       ✅ DONE
Phase 10 FINAL BUILD ORDER                     ⏳ IN PROGRESS
```

---

## Packages

```
packages/
├── task-schema/          ✅ §2.1 — shared task input
├── result-schema/         ✅ §2.2 — shared result output
├── context-spine/         ✅ §2.3 — context assembly
├── verification-core/     ✅ §2.4 — gate runner
├── memory-audit/          ✅ §2.5 — audit trail
├── harness-codex/         ✅ §3   — Codex adapter
├── harness-claude/        ✅ §4   — Claude adapter
├── harness-hermes/        ✅ §5   — Hermes adapter
└── harness-minimax/       ✅ §6   — MiniMax adapter
```

---

## Verification Gates Available

| Gate | Description |
|---|---|
| `syntax` | Node.js parse check |
| `lint` | Run `npm run lint` |
| `build` | Run `npm run build` |
| `test` | Run `npm run test` |
| `artifact-exists` | Verify required artifact files exist |
| `acceptance-criteria` | Operator-review criteria |
| `doctor` | Run `purpclaw doctor` |
| `file-changed` | Verify expected files were changed |

---

## Result Status Vocabulary

| Status | Meaning |
|---|---|
| `passed` | All acceptance criteria met |
| `partial` | Some criteria met, some not |
| `blocked` | Cannot proceed — missing context or tools |
| `failed` | Exhausted all retries |
| `stopped` | Operator interrupted |

---

## CLI Parity Check

```bash
purpclaw harness parity
```

Returns gate status for A-F against `PURPCLAW_AGENT_HARNESS_PARITY_BLUEPRINT.md §9`.
