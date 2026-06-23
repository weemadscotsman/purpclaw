# PURPCLAW — Agent Routing Matrix
> Last updated: 2026-06-06

This is the operator-facing routing guide for random tasks. The executable source of truth is `agent_routing_matrix.js`; this document is the readable version.

## Routing Rule

Every job should move through this order:

1. Parse the operator text into intent, target, urgency, and constraints.
2. Pick the smallest capable route: inspect, single-agent, or team.
3. Preflight safety and required context.
4. Delegate to the best-fit agent or team.
5. Record workflow trace and expose the result in Mission Control.

## Fast Intent Map

| If the task sounds like | Send first to | Backup agents |
|---|---|---|
| Plan, sequence, coordinate | penguin | wolf, dragon |
| Build, implement, create app/tool | wolf | robot, bee, dragon |
| Code a specific change | robot | bee, dragon |
| Fix, patch, repair | mantis | rabbit, cactus, robot |
| Debug or chase a failure | shark | cactus, rabbit, robot |
| Refactor or clean code | mushroom | axolotl, chonk, robot |
| Test or validate | turtle | rabbit, octopus, robot |
| Review code or quality | owl | ghost, karen |
| Security scan/audit | guardian | owl, ghost, snake |
| Research or investigate | scientist | duck, spider, kraken |
| Search web/source/context | spider | duck, kraken, hawk |
| Analyze numbers/data | numbers | turtle, octopus, hawk |
| Visualize/dashboard/chart | chart | numbers, bee |
| Design UI/product shape | mushroom | dragon, panda, goose |
| Content/copy/message | panda | parrot, phoenix |
| Optimize/performance | chonk | fox, cactus |
| Deploy/operate heavy work | gorilla | shark, cactus |
| Integrate services/tools | bee | claw, robot |
| Navigate files/workflows | navigator | hawk |
| Monitor/drift/signals | jellyfish | raven, guardian, moth |
| Creative exploration | shaman | goose, phoenix, panda |
| Recovery/resurrection | axolotl | phoenix, kraken, void |
| Urgent containment | bunny | mantis, guardian |

## Agent Cards

| Agent | Division | Should Get | Needs Before Start | Avoid |
|---|---|---|---|---|
| duck | MEDIA_OPS | research briefs, data gathering, media/data scans | question, scope, sources, output format | final security approval |
| ghost | INTELLIGENCE | quality review, regression risk checks, quiet audit passes | diff/files, expected behavior, risk tolerance | large implementation alone |
| dragon | ENGINEERING | architecture, large builds, scaling plans, high-load decisions | goal, constraints, existing architecture, success criteria | tiny tactical edits |
| octopus | SECURITY | edge cases, abuse cases, test matrices | feature surface, inputs/outputs, known risks | product copy or visual polish |
| robot | ENGINEERING | coding, automation, repeatable execution, build fixes | task, files/subsystem, verification command | open-ended strategy |
| mushroom | ENGINEERING | refactors, UI feel, component cleanup, code health | current pain, desired behavior, style constraints | high-risk security changes |
| chonk | ENGINEERING | simplification, cleanup, performance trimming | what feels heavy, must-keep behavior, perf target | novel research |
| owl | SECURITY | security audit, code review, threat modeling | diff/endpoint, data sensitivity, auth boundary | shipping implementation alone |
| cactus | INFRASTRUCTURE | performance diagnosis, monitoring, server troubleshooting | symptoms, logs/metrics, service name | creative ideation |
| penguin | MANAGEMENT | planning, workflow coordination, safe sequencing | objective, constraints, priority, done condition | sole executor for code-heavy jobs |
| goose | MEDIA_OPS | creative shakeups, alternate angles, idea expansion | theme, audience, tone boundary | precision/security-only tasks |
| turtle | ENGINEERING | testing, stability checks, release confidence | test target, expected behavior, commands | rushed exploratory hacks |
| axolotl | ENGINEERING | recovery, repair after failure, adaptive refactor | failure evidence, last-known-good behavior | fresh architecture from nothing |
| rabbit | SECURITY | validation, input hardening, quick defensive fixes | entry points, bad inputs, safe behavior | broad system ownership |
| void | INFRASTRUCTURE | null safety, error handling, empty-state resilience | crash/edge case, nullable fields, fallback rules | feature ideation |
| wolf | ENGINEERING | team leadership, multi-agent coordination, complex builds | mission, subtasks, constraints, stop conditions | single trivial edits |
| spider | INTELLIGENCE | web/OSINT research, source mapping, broad collection | target, scope limits, allowed sources, freshness | sensitive data transmission without approval |
| raven | INTELLIGENCE | logs/signals monitoring, event stream interpretation | signal source, time window, anomaly definition | large code changes |
| snake | SECURITY | auth/access review, permission logic, credential-flow analysis | auth boundary, roles, secrets policy | creating persistent keys without approval |
| bee | ENGINEERING | integration, API glue, event bus wiring | systems to connect, contract/schema, failure handling | deep standalone research |
| bunny | SECURITY | urgent small fixes, alerts, quick containment | immediate symptom, blast radius, time limit | large slow refactors |
| guardian | SECURITY | security scans, secrets detection, dependency audit | repo/file scope, scan type, severity threshold | non-security creative work |
| karen | MANAGEMENT | acceptance criteria, standards enforcement, release gates | requirements, quality bar, allowed exceptions | low-level coding |
| lemur | MANAGEMENT | allocation, capacity planning, resource choices | available agents, deadline, priority tradeoffs | security-critical signoff |
| mantis | OPERATIONS | targeted actions, surgical fixes | exact target, desired end state, constraints | open-ended exploration |
| shark | OPERATIONS | tracking bugs, deployment pursuit, root-cause hunting | trail, symptom, first place to look | gentle ideation |
| gorilla | OPERATIONS | heavy operations, bulk migration, large repetitive work | task batch, guardrails, rollback/stop condition | delicate auth nuance alone |
| phoenix | CREATIVE | reinvention, restart/recovery narratives, transforming stale features | failing thing, desired new identity, non-negotiables | pure statistical work |
| fox | INTELLIGENCE | strategy, optimization pathfinding, clever route selection | goal, constraints, risks, success metric | routine repetitive implementation |
| crow | CREATIVE | collection, observation notes, asset inventory | collection criteria, search area, format | final analysis without analyst |
| scientist | SCIENCE | experiments, hypothesis testing, technical research | hypothesis, method, data/source, threshold | pure UI polish |
| hawk | INTELLIGENCE | high-level reconnaissance, codebase scouting | area of interest, known landmarks, depth limit | deep archive recovery |
| elephant | OPERATIONS | memory/context preservation, long-term planning | facts, timeline, retrieval purpose | fast reactive edits |
| panda | CREATIVE | content drafts, friendly UX text, media copy | audience, tone, message, length | security/code ownership |
| parrot | MEDIA_OPS | translation, summaries, message adaptation | source message, target channel, tone | sending messages without confirmation |
| shaman | CREATIVE | high-entropy exploration, weird concepts, creative breakthroughs | theme, boundaries, weirdness limit | final safety decision |
| chart | SCIENCE | charts, dashboards, metrics visuals | data, audience, chart goal, format | raw collection without data partner |
| claw | OPERATIONS | tool control, automation hooks, local capability wiring | tool target, allowed actions, interface contract | sensitive actions without confirmation |
| innovator | SCIENCE | new tech evaluation, prototype options | problem, constraints, criteria | routine maintenance |
| jellyfish | INTELLIGENCE | passive monitoring, drift detection | signals, thresholds, report cadence | urgent execution |
| kraken | INTELLIGENCE | deep search, archive recovery, legacy data | target data, likely locations, time budget | quick surface search |
| moth | INTELLIGENCE | trend tracking, pattern detection, weak signals | sample set, time span, pattern type | deterministic coding task |
| navigator | MANAGEMENT | filesystem navigation, workflow route planning | starting point, target name/path, search depth | content creation |
| numbers | SCIENCE | statistics, forecasting, quantitative decisions | dataset/metrics, question, confidence level | visual polish without chart |

## Team Routes

| Team Intent | Leader | Members | Use When |
|---|---|---|---|
| build | wolf | robot, bee, dragon | User asks to build/create a feature or tool |
| design | dragon | mushroom, panda, goose | Product shape, UI direction, feature design |
| research | scientist | duck, spider, numbers | Research needs synthesis and evidence |
| audit | guardian | owl, ghost, snake | Security or quality audit |
| fix | mantis | rabbit, robot, cactus | A known breakage needs repair |
| analyze | numbers | turtle, octopus, chart | Data or behavior needs explanation |
| dashboard | chart | numbers, bee, robot | Metrics views, dashboards, and routing health screens |
| deploy | gorilla | shark, cactus, guardian | Operational rollout |
| refactor | mushroom | axolotl, chonk, robot | Cleanup without behavior drift |
| test | turtle | rabbit, octopus, robot | Confidence and coverage |
| monitor | jellyfish | raven, guardian, moth | Watch signals over time |
| creative | shaman | goose, phoenix, panda | Concept generation |
| data | numbers | duck, chart, kraken | Data gathering, stats, and visuals |

## Operator Notes

- Random vague tasks should start with `penguin` for planning unless they contain a strong verb like build, fix, test, search, audit, or deploy.
- Code-changing tasks should usually route to `robot` or a team led by `wolf`.
- Security-sensitive work should always include `guardian` or `owl`.
- Data work should split collection (`duck`/`spider`/`kraken`), statistics (`numbers`), and visualization (`chart`).
- If the task touches permissions, keys, messages, uploads, or deletion, the agent must stop for confirmation at the risky action.
