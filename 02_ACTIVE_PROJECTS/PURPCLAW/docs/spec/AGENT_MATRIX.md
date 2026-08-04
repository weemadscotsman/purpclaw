# AGENT_MATRIX — canonical agent topology

> Source of truth for every agent, division, model binding, and intent route.
> Auto-derived from `agent_routing_matrix.js`.

**Version:** 2026-06-19-v1
**Status:** seed (doctrinal). Drift audit runs on every BIOS run.

---

## 1. Divisions (9)

| division | id | color | surface | lead agent |
|---|---|---|---|---|
| Engineering | `ENGINEERING` | blue | /command-center | dragon |
| Security | `SECURITY` | red | /security | owl |
| Intelligence | `INTELLIGENCE` | purple | /intel | spider |
| Management | `MANAGEMENT` | teal | /manage | penguin |
| Science | `SCIENCE` | green | /science | scientist |
| Infrastructure | `INFRASTRUCTURE` | orange | /infra | cactus |
| Operations | `OPERATIONS` | amber | /ops | mantis |
| Media Operations | `MEDIA_OPERATIONS` | pink | /media | duck |
| Creative | `CREATIVE` | magenta | /creative | shaman |

## 2. Agent catalogue

| name | division | role | model lane |
|---|---|---|---|
| duck | MEDIA_OPERATIONS | Research Accelerant | LONGCTX (kimi-k2.6) |
| ghost | INTELLIGENCE | Quality Guardian | REVIEW (z-ai/glm-5.2; NIM GLM 5.1 if no GLM_API_KEY) |
| dragon | ENGINEERING | Chief Architect | REASON (deepseek-v4-pro) |
| octopus | SECURITY | Edge Case Hunter | REASON (deepseek-v4-pro) |
| robot | ENGINEERING | Precision Engineer | CODE (minimax-m3) |
| mushroom | ENGINEERING | Organic Refactorer | CODE (minimax-m3) |
| chonk | ENGINEERING | Simplification Expert | QUICK (deepseek-v4-flash) |
| owl | SECURITY | Security Auditor | REASON (deepseek-v4-pro) |
| cactus | INFRASTRUCTURE | Efficiency Auditor | QUICK (deepseek-v4-flash) |
| penguin | MANAGEMENT | Project Coordinator | REASON (deepseek-v4-pro) |
| goose | MEDIA_OPERATIONS | Chaos Catalyst | QUICK |
| turtle | ENGINEERING | Quality Engineer | CODE |
| axolotl | ENGINEERING | Regeneration Specialist | CODE |
| rabbit | SECURITY | Defensive Programmer | CODE |
| void | INFRASTRUCTURE | Null Handler | QUICK |
| wolf | ENGINEERING | Pack Leader | CODE |
| spider | INTELLIGENCE | Intel Specialist | LONGCTX (kimi-k2.6) |
| raven | INTELLIGENCE | Signals Analyst | QUICK |
| snake | SECURITY | Primary Access | REASON |
| bee | ENGINEERING | Pollination Specialist | CODE (minimax-m3) |
| bunny | SECURITY | Quick Reaction | CODE |
| guardian | SECURITY | Real-time Monitor | REASON (deepseek-v4-pro) |
| karen | MANAGEMENT | Quality Control | REASON |
| lemur | MANAGEMENT | Resource Manager | REASON |
| mantis | OPERATIONS | Precision Striker | QUICK |
| shark | OPERATIONS | Hunter | CODE |
| gorilla | OPERATIONS | Heavy Lifter | CODE |
| phoenix | CREATIVE | Rebirth Specialist | REVIEW (creative lane falls back to NIM GLM 5.1) |
| fox | INTELLIGENCE | Strategy Specialist | REASON |
| crow | CREATIVE | Gatherer | REVIEW |
| scientist | SCIENCE | Research Lead | REASON |
| hawk | INTELLIGENCE | Aerial Recon | QUICK |
| elephant | OPERATIONS | Memory Keeper | QUICK |
| panda | CREATIVE | Content Specialist | REVIEW |
| parrot | MEDIA_OPERATIONS | Communication Bridge | QUICK |
| shaman | CREATIVE | Creativity Co-Processor | REVIEW |
| chart | SCIENCE | Visualization Specialist | QUICK |
| claw | OPERATIONS | Tooling Integrator | CODE |
| innovator | SCIENCE | Emerging Tech Scout | REASON |
| jellyfish | INTELLIGENCE | Ambient Observer | QUICK |
| kraken | INTELLIGENCE | Deep Data Specialist | LONGCTX |
| moth | INTELLIGENCE | Pattern Detector | QUICK |
| navigator | MANAGEMENT | Route Planner | REASON |
| numbers | SCIENCE | Statistical Analyst | QUICK |
| ab_tester | OPERATIONS | A/B Experiment Conductor | REASON |
| quality_assessor | ENGINEERING | Quality Gatekeeper | REVIEW (NIM GLM 5.1 fallback) |
| code_review | ENGINEERING | PR Reviewer | REVIEW (NIM GLM 5.1 fallback) |

(46 agents total. New onboarding 2026-06-19.)

## 3. Intent → agent map (29 intents)

| intent | ranked agents |
|---|---|
| plan | penguin, wolf, dragon |
| build | wolf, robot, bee, dragon |
| code | robot, bee, dragon |
| fix | mantis, rabbit, cactus, robot |
| debug | shark, cactus, rabbit, robot |
| refactor | mushroom, axolotl, chonk, robot |
| test | turtle, rabbit, octopus, robot |
| review | owl, ghost, karen |
| audit | guardian, owl, ghost, snake |
| security | guardian, owl, snake, rabbit |
| research | scientist, duck, spider, kraken |
| search | spider, duck, kraken, hawk |
| analyze | numbers, turtle, octopus, hawk |
| data | numbers, duck, chart, kraken |
| visualize | chart, numbers |
| dashboard | chart, bee, robot |
| design | mushroom, dragon, panda, goose |
| content | panda, parrot, phoenix |
| communicate | parrot, panda, karen |
| optimize | chonk, fox, cactus |
| performance | cactus, chonk, numbers |
| deploy | gorilla, shark, cactus |
| infrastructure | cactus, void, bee, navigator |
| integrate | bee, claw, robot |
| automate | robot, claw, bee |
| navigate | navigator, hawk |
| memory | elephant, kraken |
| monitor | jellyfish, raven, guardian |
| pattern | moth, numbers, fox |
| strategy | fox, dragon, wolf |
| creative | shaman, goose, phoenix, panda |
| recover | axolotl, phoenix, kraken, void |
| urgent | bunny, mantis, guardian |
| coordinate | wolf, penguin, lemur |
| allocate | lemur, penguin, navigator |
| ab | ab_tester, numbers, mantis |
| qa | quality_assessor, turtle, rabbit, ghost |
| review | code_review, owl, ghost, karen |

## 4. Team templates (13)

| template | leader | members | description |
|---|---|---|---|
| build | wolf | robot, bee, dragon | Build execution |
| design | dragon | mushroom, panda, goose | Product design |
| research | scientist | duck, spider, numbers | Research synthesis |
| audit | guardian | owl, ghost, snake | Security and quality audit |
| fix | mantis | rabbit, robot, cactus | Targeted repair |
| analyze | numbers | turtle, octopus, chart | Analysis and reporting |
| dashboard | chart | numbers, bee, robot | Dashboard and metrics view build |
| deploy | gorilla | shark, cactus, guardian | Deployment operations |
| refactor | mushroom | axolotl, chonk, robot | Refactor and cleanup |
| test | turtle | rabbit, octopus, robot | Testing and validation |
| monitor | jellyfish | raven, guardian, moth | Monitoring and drift detection |
| creative | shaman | goose, phoenix, panda | Creative exploration |
| data | numbers | duck, chart, kraken | Data analysis |

## 5. Model lanes (5)

| lane | provider | model | purpose |
|---|---|---|---|
| CODE | nvidia | minimaxai/minimax-m3 | Code writing, general |
| REASON | nvidia | deepseek-ai/deepseek-v4-pro | Planning, architecture, security |
| QUICK | nvidia | deepseek-ai/deepseek-v4-flash | Fast ops, monitoring |
| REVIEW | glm (native) | glm-5.2 | Code review, QA (independent viewpoint) |
| REVIEW_NIM | nvidia | z-ai/glm-5.1 | NIM fallback when GLM_API_KEY absent |
| LONGCTX | nvidia | moonshotai/kimi-k2.6 | Long-context research, swarm fanout (≤100) |

## 6. Review lane sentinel policy

- `process.env.GLM_API_KEY` present → REVIEW = `{provider:'glm', model:'glm-5.2'}` (native z.ai)
- `process.env.GLM_API_KEY` absent → REVIEW auto-falls to `{provider:'nvidia', model:'z-ai/glm-5.1'}` (NIM)
- Decision is per-request; a key being added mid-process flips resolution without restart.

## 7. Intent detection policy

- Intents are inferred from user prompt + tool-call signatures + recent activity.
- Multi-intent prompts (e.g. "build X then test it") route to the highest-cost intent first, then descend; first intent's leader spawns the rest.
- Unknown intent → fallback to `build` with `dragon` as architect.

## 8. Failure modes of THIS doc

- Agent count drifts. Regenerate from `agent_routing_matrix.js` when an agent file is added.
- Model lane drifts. The first column wins (provider above model). If a row says `provider:nvidia, model:foo`, the pair is canonical.
- PM2 spawn of an agent with no row here → BIOS returns `AGENT_ORPHAN`.

---

## 9. New agents onboarding (2026-06-19)

### 9.1 `ab_tester` — A/B Experiment Conductor

| Attribute | Value |
|---|---|
| division | OPERATIONS |
| role | A/B testing and experiment analysis |
| tools | `ab_experiment_start`, `ab_experiment_stop`, `ab_report_metrics`, `ab_compare`, `ab_analyze` |
| allowed routes | events, metrics, state, orchestrator, workers |
| model lane | REASON (deepseek-v4-pro) |
| intent | `ab` |
| trigger | `purpclaw ab start <experiment_id>` or spec-driven workflow |
| surface | /ops/ab (under /ops) |
| depends_on | events, metrics, state |

### 9.2 `quality_assessor` — Quality Gatekeeper

| Attribute | Value |
|---|---|
| division | ENGINEERING |
| role | Code quality, test coverage, security, linting, docs |
| tools | `qa_lint`, `qa_test_coverage`, `qa_performance`, `qa_security_scan`, `qa_doc_check`, `qa_report` |
| allowed routes | code, filesystem, orchestrator, eventbus, memory |
| model lane | REVIEW (z-ai/glm-5.2 native; NIM GLM 5.1 fallback when `process.env.GLM_API_KEY` missing) |
| intent | `qa` |
| trigger | `purpclaw qa run <path>` or PR webhook |
| surface | /command-center/qa (under /command-center) |
| depends_on | code, filesystem, memory |

### 9.3 `code_review` — PR Reviewer

| Attribute | Value |
|---|---|
| division | ENGINEERING |
| role | PR review, standards, security, performance, refactor suggestions |
| tools | `review_pr`, `review_diff`, `review_standards`, `review_security`, `review_performance`, `review_submit` |
| allowed routes | github, filesystem, orchestrator, eventbus, memory |
| model lane | REVIEW (z-ai/glm-5.2 native; NIM GLM 5.1 fallback) |
| intent | `review` |
| trigger | `purpclaw review pr <pr_number>` or GitHub webhook |
| surface | /command-center/review (under /command-center) |
| depends_on | github, filesystem, memory |

### 9.4 Operator shell bindings (`<<<`-block for `purpclaw`)

```yaml
- name: ab
  intent: ab
  defaults:
    duration_s: 3600
    metrics_default: [latency, error_rate, conversion]
    leader: ab_tester
- name: qa
  intent: qa
  defaults:
    flags: [coverage, lint, security]
    leader: quality_assessor
- name: review
  intent: review
  defaults:
    auto_submit: false   # never auto-submit a review without operator approval
    leader: code_review
```

### 9.5 Tool count reconciliation

`ab_tester` exposes 5 `ab_*` tools. `quality_assessor` exposes 6 `qa_*` tools. `code_review` exposes 6 `review_*` tools. After onboarding total tool surface = current `lib/tools/index.js` count + 17.

### 9.6 Failure mode additions

- An agent file present in `agents/*.js` but missing here → `lib/bios.js` returns `SPEC_INCOMPLETE` after onboarding cadence lands.
- An agent here without a route under `lib/tools` → `AGENT_ORPHAN` flag in BIOS verdict.
- `tools.*` colliding on the same casing (`code_review` vs `codereview`) → de-dup at agent-tower load time.
