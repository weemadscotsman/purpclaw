# PURPCLAW — Doc vs Stack Comparison Report
**Generated:** 2026-07-04 00:15
**Base:** `E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW`

---

## CRITICAL FINDING: GitHub vs Local Divergence

| Dimension | GitHub `weemadscotsman/purpclaw` | Local E: drive (v0.3.0) |
|---|---|---|
| README version | **v0.2.0** (491 tools, 35 agents, 9 providers) | **v0.3.0** (110 lines, no inflated numbers) |
| Remote | `zamp.git` (NOT `purpclaw.git`) | local only |
| git status | clean export | modified (GOTHAM changes) |
| tools-pc.js | v0.2.0 had it | DELETED |
| agents | 35 (in GitHub README) | 42 (AGENT.md files locally) |
| providers | 9 (GitHub README) | 17 (llm-provider.js) |

**The local E: drive is NOT synced to GitHub.** The last GitHub commit (`22bb510`) is from 2026-07-01. The local repo has modifications not pushed. The GitHub README is a v0.2.0 export with wildly inflated numbers (491 tools, 35 agents).

The local README.md is the accurate one — version 0.3.0, 110 lines, no inflated tool/agent claims.

---

## VERIFIED ACTUAL STACK (2026-07-03)

| Dimension | Actual Count | Notes |
|---|---|---|
| Native tools | **31** | 30 (lib/tools/index.js) + 1 (skills-registry.js) |
| tools-pc.js | **DELETED** | Was 49 tools — file no longer exists |
| OmniCode MCP | **NOT IN PURPCLAW** | Separate repo at `omnicode-platform/`, 45 tool modules |
| MCP client (lib/mcp.js) | **Present but dark** | No mcp.json config — no servers loaded |
| Skills (folders) | **383** | |
| Agent personas | **42** | Counted by AGENT.md files in skills/ |
| API routes | **85** | |
| Next.js pages | **25** | |
| PM2 services | **26** | All registered in ecosystem.config.js |
| LLM providers | **17** | openai, kimi, glm, minimax, groq, deepseek, nvidia, together, mistral, huggingface, cloudflare, cohere, ollama, lmstudio, anthropic, gemini, custom |

---

## MAJOR OUTDATED CLAIMS BY FILE

### 🚨 PRODUCT.md — MOST WRONG

| Line | Claim | Truth | Severity |
|---|---|---|---|
| 8 | 461 tools | 31 native + external OmniCode | CRITICAL |
| 8 | 85 agents | 42 personas | HIGH |
| 8 | 399 skills | 383 folders | MEDIUM |
| 26 | 80 native tools | 31 native | CRITICAL |
| 26 | 30 + 49 + 1 | tools-pc.js (49) DELETED | CRITICAL |
| 27 | 42 OmniCode MCP | External, not PURPCLAW | HIGH |
| 28 | 122 total tools | 31 native (OmniCode is separate repo) | HIGH |

### 🚨 LAUNCH.md — v0.2.0 STALE

| Line | Claim | Truth | Severity |
|---|---|---|---|
| 8 | 54 tools | 31 native | HIGH |
| 8 | 152 agents | 42 personas | HIGH |
| 8 | 17 providers | CORRECT ✓ | — |

### 🚨 CLAUDE.md — ARCHITECTURE LIES

| Line | Claim | Truth | Severity |
|---|---|---|---|
| 34 | 25-service platform | 26 services | LOW |
| 34 | 152-agent swarm | 42 personas | CRITICAL |
| 195 | 110 tools confirmed | 31 native | CRITICAL |
| 195 | 17 providers | CORRECT ✓ | — |

### 🚨 CHANGELOG.md — HISTORICAL BUT WRONG

| Line | Claim | Truth | Severity |
|---|---|---|---|
| 310 | 110 tools confirmed | tools-pc.js later deleted | MEDIUM |

### 🚨 CURRENT_STATE.md — WRONG ON TOOLS

| Line | Claim | Truth | Severity |
|---|---|---|---|
| (tools table) | lib/tools-pc.js = 49 tools | DELETED | CRITICAL |
| (tools table) | 80 native tools | 31 native | CRITICAL |
| (skills row) | 399 skills | 383 | MEDIUM |

### 🚨 NEXT_FEATURES.md

| Line | Claim | Truth | Severity |
|---|---|---|---|
| (table) | 399 skills | 383 | LOW |

### 🚨 AGENT.md

| Line | Claim | Truth | Severity |
|---|---|---|---|
| (intro) | 152 agents | 42 personas | CRITICAL |

---

## ARCHIVED / DEAD DOCS (should be in docs/archive/)

These docs contain v0.2.0-era numbers (54 tools, 152 agents) and should be treated as historical:

- CHANGELOG.md line 310 — "110 tools confirmed"
- LAUNCH.md — entire file (v0.2.0 launch copy)
- PRODUCT.md — entire file (multiple critical lies)

---

## WHAT'S ACTUALLY GOOD

| File | Status |
|---|---|
| README.md | Mostly OK — version 0.3.0, no specific tool/agent counts |
| CHANGELOG.md | Service counts, feature descriptions mostly accurate |
| CLAUDE.md | UI freeze, spawn safety, service ports — mostly accurate |
| ecosystem.config.js | 26 services — CORRECT ✓ |
| lib/llm-provider.js | 17 providers — CORRECT ✓ |
| lib/tools/index.js | 30 tools — CORRECT ✓ |
| skills/ | 383 folders — mostly accurate |
| docs/ARCHITECTURE.md | (not read — needs separate check) |

---

## RECOMMENDATIONS

### Immediate (fix before next commit)

1. **PRODUCT.md** — rewrite from scratch. Current version is marketing fiction.
2. **LAUNCH.md** — delete or clearly stamp as v0.2.0 historical.
3. **CURRENT_STATE.md** — fix tool counts, remove tools-pc.js reference.
4. **NEXT_FEATURES.md** — fix skill count (383 not 399).
5. **CLAUDE.md** — fix "152 agents" → "42 agent personas".
6. **CHANGELOG.md** — remove "110 tools confirmed" entry or annotate as superseded.

### What TO SAY instead of the fake numbers:

**Native tools:** "31 built-in tools in lib/tools/"
**OmniCode MCP:** "45 tools in the companion OmniCode MCP server (omnicode-platform/)"
**Total tools accessible to PURPCLAW:** "31 native + 45 OmniCode = 76, plus MCP client can connect more servers"
**Agent personas:** "42 named agent personas"
**Skills:** "383 skill definitions"
**Providers:** "17 configured LLM providers"
**Services:** "26 PM2-managed services"

---

## NOTES

- `tools-pc.js` was deleted between v0.2.0 and now. All docs claiming "80 native tools" via 30+49+1 are post-deletion stale.
- OmniCode MCP (omnicode-platform/) is a SEPARATE git repo, NOT inside PURPCLAW. Calling it "PURPCLAW's 42 MCP tools" is wrong.
- `lib/mcp.js` exists but has no config file — MCP client is dark.
- 17 providers claim is CORRECT and verified.
- 26 services claim is CORRECT and verified.
