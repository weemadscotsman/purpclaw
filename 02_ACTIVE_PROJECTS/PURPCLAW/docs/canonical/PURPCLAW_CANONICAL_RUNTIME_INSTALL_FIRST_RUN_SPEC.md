# PURPCLAW CANONICAL RUNTIME, INSTALL, FIRST-RUN, HARNESS & STEERING SPEC

Status: CANONICAL TARGET CONTRACT  
Scope: installation, bootstrap, runtime ownership, harnesses, steering, agents, souls, skills, tools, plugins/add-ons, providers/models, memory, workflows, missions, workers, approvals, events, recovery, and CLI/TUI/Web/Desktop/Mobile parity.

## 0. THE ONE RULE

PURPCLAW is one product, one organisation, one runtime truth.

CLI, TUI, Web UI, Desktop App UI and Mobile App UI are surfaces over the same canonical action/runtime system.

The canonical path is:

SURFACE
→ ACTION KERNEL
→ INTENT/CAPABILITY RESOLVER
→ STEERING/POLICY PREFLIGHT
→ RUNTIME/HARNESS SELECTION
→ AGENT SELECTION
→ SOUL/PERSONA ATTACHMENT IF REQUIRED
→ SKILL LOAD
→ TOOL/PLUGIN LOAD
→ PROVIDER/MODEL ROUTE
→ WORKER/SANDBOX EXECUTION
→ TOOL LOOP
→ EVIDENCE/VERIFY
→ EVENT + STATE + MEMORY COMMIT
→ ARTIFACT/RESULT
→ BROADCAST TO ALL SURFACES

Nothing bypasses this path.

No Web-only logic.
No Desktop-only agent router.
No TUI-only memory.
No Mobile-only mission database.
No duplicated backend because another window opened.
No hard-coded counts.
No "load all agents/skills/tools into every prompt".

---

# 1. SOURCE-DERIVED DISCOVERY FACTS TO PRESERVE

The supplied discovery/reconciliation material reports the following audit state:

- 153 registered agents.
- 85 persona agents and 68 capability agents.
- 9 canonical divisions.
- 95 souls.
- 387 skill directories; 380 with SKILL.md.
- 26 catalogued services in ecosystem.config.js.
- The service catalogue includes names such as:
  eventbus, state, api, tower, voice, bridge, harness, thringlet, nextjs,
  gatekeeper, orchestrator, chorus, vision, metrics, pool, context, workers,
  reasoning, swarm-coordinator, cowork-overlay, tts-gateway, stt, cognitive,
  yolo, avatar, telegram.
- 36 harvested UI pages.
- 26 UI routes were unmapped to the newer domain model at the cited audit stage.
- 9 UI pages contained baked-in count-style values.
- Three competing persisted workflow engines:
  workflow-manager, event-workflow, recipe-manager.
- Four competing mission surfaces.
- Two hard-coded simultaneous port collisions:
  7781 and 7791.
- 84 LINKED agents, 68 CAPABILITY_ONLY agents, 1 unresolved identity link
  (flutter-reviewer vs likely-but-unproven dart-reviewer).
- All 68 referenced skills resolved after name normalisation.
- Conversation and durable memory layers lacked implementation evidence at the cited audit stage.
- Reconciliation v2 contained 33 entries with 17 conflicts.

These figures are AUDIT FINDINGS, not code constants.

Every shipping surface obtains current counts and status from canonical registries at runtime.

---

# 2. CANONICAL RUNTIME TAXONOMY

PURPCLAW needs runtime classes, not a soup of processes.

## 2.1 BOOTSTRAP RUNTIME

Purpose:
- locate installation;
- locate/create profile;
- locate/create workspace;
- validate canonical registries;
- perform migrations;
- establish runtime lock;
- start or attach to supervisor.

Exists briefly.
Never owns business logic.

## 2.2 SUPERVISOR RUNTIME

Exactly one per profile/workspace runtime identity.

Owns:
- single-instance lock;
- service lifecycle;
- process table;
- dependency graph;
- port allocation;
- health;
- restart policy;
- lazy wake/sleep;
- crash recovery;
- shutdown;
- runtime ID.

Every first-class surface attaches to this same supervisor.

## 2.3 CORE ORGANISATION RUNTIME

Logical always-available authorities:
- canonical action kernel;
- registry authority;
- capability resolver;
- event spine;
- state authority;
- approval authority;
- provider/model router shell;
- verified memory authority;
- mission authority;
- workflow authority;
- health/doctor;
- surface gateway.

These may be modules inside a compact process rather than 12 separate daemons.

Logical authority does not imply process sprawl.

## 2.4 AGENT RUNTIME

Creates bounded agent executions.

Owns:
- selected agent contract;
- optional soul/persona contract;
- task context;
- selected skills;
- permitted tool descriptors;
- provider/model route;
- steering stack;
- execution budget;
- child process relationships;
- provenance.

Default: one agent.

Additional agents only when task decomposition, governance, review, or explicit user intent requires them.

## 2.5 TOOL RUNTIME

Executes tool calls through one governed interface.

Owns:
- schema validation;
- permissions;
- approval;
- side-effect classification;
- tool health;
- timeout;
- cancellation;
- retries;
- output normalisation;
- audit events;
- sandbox boundary where required.

Catalogue membership and callable runtime status remain separate concepts.

## 2.6 PROVIDER RUNTIME

One router controls all model/provider use.

Provider clients can be lazy.

Owns:
- configured credentials;
- local/remote availability;
- model capabilities;
- context limits;
- tool-use support;
- modalities;
- price/cost policy;
- privacy/locality;
- latency;
- fallback;
- health;
- per-process usage accounting.

No surface selects models through private logic.

## 2.7 WORKER/SANDBOX RUNTIME

Bounded execution environment for:
- code execution;
- conversions;
- file processing;
- browser/tool work;
- parallel subjobs;
- risky or isolated operations.

Workers:
- are children of canonical process IDs;
- cannot become independent brains;
- cannot start duplicate global infrastructure;
- terminate/return to pool when finished;
- emit lifecycle and evidence events.

## 2.8 MEDIA RUNTIMES

Voice, STT, TTS, vision, YOLO, avatar and overlay functions are ON_DEMAND unless live evidence proves a core requirement.

They wake only when:
- selected capability needs them;
- platform supports them;
- dependency/health checks pass.

Historical presence of a service name does not equal "feature ready".

## 2.9 IDLE/EVOLUTION RUNTIME

May host:
- AutoResearch;
- Auto-Evolve proposal generation;
- Donor archaeology;
- maintenance;
- indexing;
- compaction;
- ambient ecology.

Rules:
- explicit policy;
- low-priority resource budget;
- cannot silently mutate production truth;
- proposals flow through existing governance/evidence/approval paths;
- one evolution authority, never parallel mutation engines.

## 2.10 SURFACE RUNTIMES

CLI, TUI, Web, Desktop and Mobile are presentation runtimes.

They own:
- input;
- rendering;
- local view state;
- reconnect;
- platform-specific affordances.

They do NOT own:
- missions;
- workflows;
- provider routing;
- memory truth;
- agent routing;
- tool routing;
- canonical business state.

---

# 3. HARNESS STACK

"Harness" is not one mysterious process. It is the controlled execution envelope around every action.

The discovered catalogue already contains a `harness` service name. Its actual implementation must be verified and then mapped into this canonical harness contract rather than automatically declared authoritative.

## 3.1 REQUEST HARNESS

Wraps every incoming request.

Creates:
- request_id;
- session_id;
- profile/workspace;
- source surface;
- attachments;
- explicit command/capability;
- permissions context;
- cancellation token;
- trace/provenance root.

## 3.2 ACTION HARNESS

Resolves the request into a canonical action.

Validates:
- action exists;
- version;
- input schema;
- output schema;
- side-effect class;
- lifecycle;
- capability owner;
- surface entitlement.

## 3.3 AGENT HARNESS

For agent-backed actions.

Assembles:
- agent;
- optional soul/persona;
- division/domain;
- skills;
- memory;
- artifacts;
- tool set;
- steering stack;
- model route;
- token/cost/time budgets.

Maintains the model/tool loop.

## 3.4 TOOL HARNESS

Every tool call passes through it.

Stages:
1. tool lookup;
2. callable check;
3. platform check;
4. service dependency check;
5. auth/plugin check;
6. approval check;
7. schema validation;
8. execution;
9. output validation;
10. evidence capture;
11. event emission;
12. return to agent/action.

No direct arbitrary tool invocation from UI components.

## 3.5 PROVIDER HARNESS

Normalises all model providers to one contract.

Handles:
- prompt/messages;
- tool schemas;
- structured output;
- streaming;
- retries;
- fallback;
- usage;
- errors;
- cancellation;
- model capability mismatch.

## 3.6 WORKFLOW HARNESS

Controls multi-step workflow execution.

Only one canonical persisted workflow authority survives consolidation.

Legacy workflow engines become:
- migration sources;
- compatibility adapters;
- or retired.

## 3.7 MISSION HARNESS

Controls mission identity, lifecycle, goals, attached processes, artifacts and approvals.

Only one canonical mission authority.

Existing mission surfaces become clients/adapters.

## 3.8 SURFACE HARNESS

Guarantees parity.

It maps:
- canonical actions to controls/commands;
- canonical events to views;
- canonical errors to surface rendering;
- canonical approvals to surface interactions.

Surface harnesses cannot invent alternate semantics.

## 3.9 RECOVERY HARNESS

Owns:
- process checkpoint;
- idempotency;
- interrupted tool-call handling;
- restart classification;
- resumable vs non-resumable work;
- duplicate prevention;
- orphan worker cleanup.

## 3.10 VERIFICATION/EVALUATION HARNESS

For actions requiring proof.

Can include:
- deterministic validation;
- tests;
- schema checks;
- file/hash checks;
- second-agent review;
- policy review;
- acceptance criteria.

"Completed" and "verified" remain distinct states.

---

# 4. STEERING STACK

Steering decides how an agent behaves. It must be explicit, layered, inspectable and identical regardless of surface.

## 4.1 PRECEDENCE

Highest authority first:

1. constitutional/safety perimeter;
2. canonical execution contract;
3. user/profile policy;
4. workspace/project policy;
5. mission policy;
6. workflow step contract;
7. selected agent contract;
8. soul/persona behaviour;
9. selected skill instructions;
10. task/request content;
11. tool outputs/environment observations.

Lower layers cannot silently override higher layers.

## 4.2 STEERING REGISTRY

Create canonical registry records for:
- execution contracts;
- steering profiles;
- agent prompt contracts;
- soul/persona fragments;
- workflow steering;
- tool-use policy;
- surface-neutral response policy.

Every process records hashes/versions of steering materials used.

## 4.3 CONTEXT ASSEMBLER

One context assembler for every surface.

Inputs:
- execution contract;
- user policy;
- workspace;
- mission/workflow;
- agent;
- soul;
- selected skills;
- relevant memory;
- task;
- artifacts;
- permitted tools;
- runtime observations.

It must NOT inject:
- every skill;
- every agent;
- every soul;
- every tool;
- irrelevant memories;
- UI-specific hidden prompts.

## 4.4 STEERING MODES

Possible canonical modes:
- direct execution;
- planning;
- implementation;
- review;
- research;
- Council;
- Studio mode;
- recovery;
- restricted/read-only;
- high-risk approval mode.

Mode selection is recorded in process state.

## 4.5 HUMAN STEERING

At any first-class surface the same canonical process can accept:
- pause;
- resume;
- cancel;
- approve;
- reject;
- redirect;
- change priority;
- add constraint;
- attach artifact;
- choose provider/model where policy permits;
- escalate to Council/reviewer where supported.

The steering event is stored once and broadcast everywhere.

---

# 5. RESOLUTION: RIGHT AGENT, RIGHT SKILL, RIGHT TOOL, RIGHT TIME

## 5.1 REQUEST RESOLUTION PIPELINE

1. Normalise request.
2. Resolve explicit command if supplied.
3. Resolve capability.
4. Apply policy.
5. Determine deterministic path vs agent path.
6. Select agent(s).
7. Attach soul/persona only if useful.
8. Select skills.
9. Select tools/plugins.
10. Wake required services.
11. Route provider/model.
12. Build context.
13. Execute.
14. Verify.
15. Commit events/state/memory/artifacts.
16. Broadcast result.

## 5.2 AGENT SELECTION

Score only registry-backed facts such as:
- declared capability match;
- division/domain ownership;
- linked skill requirements;
- permitted tools;
- provider/modality compatibility;
- workflow role;
- reputation/performance if implemented;
- current availability/load.

Do not select by fuzzy name alone.

### Capability agent
Use for narrow specialist operations.

### Persona agent
Use when continuity, judgement, domain ownership, user relationship or governance matters.

### Council
Use when:
- multiple domains materially matter;
- user requests Council;
- governance/risk policy requires review;
- workflow contract requires deliberation.

Never wake 153 agents because a human typed a sentence.

## 5.3 SKILL SELECTION

Boot:
- index metadata only.

Task:
- select required skill IDs;
- resolve aliases;
- load exact SKILL.md content;
- record version/hash.

Duplicate names such as the discovered apple-notes and google-workspace collisions must be resolved before declaring canonical identity.

## 5.4 TOOL SELECTION

The agent sees the minimum useful tool set.

Tool eligibility =
capability match
AND agent permission
AND policy permission
AND platform support
AND service health
AND plugin/auth availability.

Tool schemas are injected only when eligible.

## 5.5 PLUGIN/CONNECTOR SELECTION

Plugins/connectors load on demand.

Lifecycle:
1. metadata indexed;
2. selected action requires plugin;
3. check install/connect state;
4. if connected, load client;
5. if not connected, surface one canonical connection requirement;
6. execute after permission/auth;
7. release idle resources.

No surface implements its own connector catalogue.

## 5.6 ADD-ONS

Add-ons register through the same canonical registry.

An add-on cannot:
- invent a parallel tool runtime;
- bypass approval;
- own private ports;
- maintain private mission/workflow truth;
- patch only one UI;
- start a permanent unsupervised daemon.

---

# 6. RUNTIME LOAD CLASSES

Every subsystem is assigned exactly one class.

## BOOT_INDEX
Metadata/index only:
- actions;
- capabilities;
- agents;
- souls;
- divisions;
- skills;
- tools;
- plugins;
- providers;
- models;
- services;
- workflows;
- missions/process types;
- events;
- surfaces;
- routes;
- policies;
- aliases.

## CORE_RESIDENT
Logical minimum:
- supervisor;
- action kernel;
- registry authority;
- resolver;
- event spine;
- state authority;
- approval authority;
- provider router shell;
- verified memory authority;
- surface gateway;
- health/doctor.

## SESSION_LOAD
- profile;
- workspace;
- session policy;
- recent relevant process state;
- relevant user/workspace memory;
- configured provider preferences.

## TASK_LOAD
- selected agent;
- optional soul;
- selected skills;
- selected workflow;
- task memory;
- permitted tool descriptions.

## INVOCATION_LOAD
- tool implementation;
- plugin client;
- provider SDK;
- voice/vision worker;
- browser worker;
- converter/parser;
- specialised runtime.

## EPHEMERAL
- isolated sandbox;
- one-shot worker;
- bounded child process.

## IDLE_OPTIONAL
- AutoResearch;
- evolution proposal work;
- Donor;
- compaction;
- background indexing;
- ambient systems.

---

# 7. SERVICE CONSOLIDATION

The audit saw 26 catalogued service entries and an older "15/15" claim that represented only a subset.

Therefore health must never be "N/N services" without a named profile.

Each service gets:

- canonical service ID;
- class: CORE / ON_DEMAND / OPTIONAL / LEGACY / RETIRED;
- owner;
- capabilities;
- entry implementation;
- dependencies;
- health probe;
- wake trigger;
- idle timeout;
- port binding;
- platform requirements;
- resource limits;
- restart policy.

## IMPORTANT CATALOGUED SERVICES TO CLASSIFY

The discovered names:
eventbus, state, api, tower, voice, bridge, harness, thringlet, nextjs,
gatekeeper, orchestrator, chorus, vision, metrics, pool, context, workers,
reasoning, swarm-coordinator, cowork-overlay, tts-gateway, stt, cognitive,
yolo, avatar, telegram.

Do not preserve them as 26 permanent daemons merely because they exist.

Consolidate compatible responsibilities into a lightweight modular core and lazy workers where practical.

## PORT OWNERSHIP

No service owns a hard-coded port.

Supervisor:
- allocates;
- validates;
- persists;
- exposes current bindings.

The discovered 7781 and 7791 collisions become acceptance-test failures until eliminated.

---

# 8. FIRST-CLASS INSTALL EXPERIENCE

The install must feel like installing ONE app.

## INSTALL PHASE 1: PREFLIGHT
Check:
- supported OS;
- disk;
- permissions;
- existing installation;
- migration source;
- Node/Python/runtime dependencies actually required;
- optional GPU/local-model capability.

## INSTALL PHASE 2: DEPLOY
- application files;
- canonical data root;
- canonical workspace;
- registries;
- datastore;
- supervisor;
- launchers;
- secure config;
- port registry.

## INSTALL PHASE 3: MIGRATE
From old estate:
- import registries;
- normalise aliases;
- mark unresolved conflicts;
- do not silently guess identity mappings;
- migrate missions/workflows only after canonical authority is chosen;
- preserve provenance.

## INSTALL PHASE 4: START
Start supervisor once.

Supervisor starts only CORE_RESIDENT components.

## INSTALL PHASE 5: VERIFY
- registry integrity;
- datastore;
- event spine;
- action kernel;
- provider router;
- health;
- one canonical smoke action.

---

# 9. FIRST-RUN USER EXPERIENCE

One onboarding state for every surface.

Steps:
1. Welcome.
2. Create/select profile.
3. Create/select workspace.
4. Local/privacy/network policy.
5. Provider discovery.
6. Provider credential setup.
7. Local/free model discovery if genuinely implemented.
8. Default routing profile.
9. Cost/budget guardrails.
10. Optional plugins/connectors.
11. Optional voice.
12. Optional vision.
13. Registry integrity.
14. Runtime health.
15. Action-kernel smoke test.
16. Harness/tool-loop smoke test.
17. Surface handshake.
18. Enter Mission Control/home.

Never make a normal user:
- edit ports;
- know process names;
- choose between three internal workflow engines;
- choose among four mission implementations;
- configure 153 agents;
- manually load skills;
- manually start tools.

---

# 10. EACH SURFACE

## CLI

Reference operational surface.

CLI parsing calls the same action kernel.

CLI is not allowed to contain exclusive business logic.

First call:
- attach existing supervisor or start it;
- show onboarding if incomplete;
- then operate immediately.

## TUI

Consumes same:
- actions;
- queries;
- events;
- approvals;
- artifacts;
- health.

No TUI-private agent router.

## WEB UI

Browser is a client.

It cannot:
- maintain hard-coded system counts;
- invent process state;
- mutate missions/workflows directly in a private datastore.

## DESKTOP UI

Desktop shell may start supervisor if absent.

It then becomes a normal surface client.

One Desktop window does not equal one backend.

## MOBILE

Mobile is a remote control/window into the canonical desktop/local runtime unless a separate explicitly supported runtime profile exists.

Requires:
- secure pairing;
- authenticated gateway;
- same profile/workspace;
- same process/mission IDs;
- same events;
- same approvals.

Platform limitations must be visible, not faked.

---

# 11. WORKFLOW AND MISSION AUTHORITY

Discovery found three workflow engines and four mission surfaces.

Shipping rule:
- exactly one canonical workflow mutation authority;
- exactly one canonical mission mutation authority.

Others:
- migrate;
- adapt read-only;
- or retire.

No first-class surface can bypass those authorities.

---

# 12. MEMORY

Memory claims are evidence-based.

Canonical memory registry defines:
- layer;
- implementation;
- status;
- persistence;
- read API;
- write API;
- retention;
- privacy;
- provenance.

If conversation/durable layers still lack implementation evidence:
- mark unavailable;
- do not claim 7/7;
- do not fake UI cards.

Memory injected into an agent run is recorded in provenance.

Memory written by an agent/tool/process is attributable and evented.

---

# 13. PROCESS, TOOL LOOP AND STATE MACHINE

Every action gets a process_id even if short-lived.

Recommended state semantics:

CREATED
→ PREFLIGHT
→ RESOLVING
→ READY
→ RUNNING
→ WAITING_TOOL
→ WAITING_APPROVAL
→ VERIFYING
→ COMPLETED

Alternate terminal states:
FAILED
CANCELLED
BLOCKED
RECOVERABLE

If the existing 12-state lifecycle schema defines canonical names, preserve those exact names and map these semantics onto it rather than create a second state machine.

## MODEL/TOOL LOOP

1. call model;
2. if final answer/result, validate;
3. if tool request:
   - tool harness preflight;
   - approval if needed;
   - execute;
   - append structured result;
   - continue;
4. enforce max iterations/budget;
5. verify;
6. commit.

No surface owns a separate loop.

---

# 14. APPROVAL & GATEKEEPING

One approval object can be surfaced everywhere.

Approval includes:
- approval_id;
- process_id;
- requester agent/action;
- requested operation;
- tool/plugin;
- risk/side-effect class;
- data scope;
- cost scope;
- expiry;
- decision;
- deciding user/surface;
- event provenance.

Gatekeeper policy belongs before execution, not as UI decoration.

---

# 15. ORCHESTRATION, SWARM, COUNCIL AND WORKERS

The discovered catalogue includes orchestrator, swarm-coordinator, tower, pool, workers, reasoning and harness service names.

Canonical rule:
- one orchestration authority;
- one agent tower/registry authority;
- one worker-pool contract;
- swarm/Council are execution modes, not independent universes.

A swarm must:
- belong to one parent process;
- have explicit roles;
- prevent duplicate responsibility;
- use shared state/event IDs;
- converge through canonical result/verification;
- terminate children after completion.

---

# 16. CONTEXT, REASONING AND STEERING SERVICES

The discovered `context`, `reasoning` and `harness` services must be inspected and either:

A. mapped into the canonical context/steering/harness architecture;
B. merged into core modules;
C. retained as on-demand workers;
D. marked legacy/retired.

There must not be two competing context assemblers or two competing steering pipelines.

All surface requests must yield equivalent context given equivalent canonical state.

---

# 17. EVENTS

Everything important emits canonical events.

Minimum families:
- runtime.*;
- session.*;
- action.*;
- mission.*;
- workflow.*;
- process.*;
- agent.*;
- council.*;
- skill.*;
- tool.*;
- plugin.*;
- provider.*;
- model.*;
- approval.*;
- memory.*;
- artifact.*;
- service.*;
- worker.*;
- health.*;
- recovery.*;
- evolution.*;
- research.*;

Events are the cross-surface nervous system.

UI changes derive from canonical events/state, not duplicated jobs.

---

# 18. OBSERVABILITY

One trace from request to result.

Trace links:
request
→ action
→ process
→ agent
→ skill
→ tool/plugin
→ provider/model
→ worker/service
→ artifact
→ verification
→ result.

Expose useful human views without making the user read 4,000 log lines.

---

# 19. RECOVERY AND SNAPSHOTS

Runtime recovery must prevent duplicate work.

Requirements:
- runtime journal;
- atomic state transitions;
- idempotency keys for side effects;
- orphan worker cleanup;
- restartable processes where safe;
- explicit non-restartable state where unsafe;
- snapshot/rollback integration where existing implementation supports it;
- integrity verification before restore.

Restarting Web/Desktop/TUI must never restart the task itself.

---

# 20. SECURITY, PRIVACY AND LOCAL-FIRST POLICY

Canonical policy covers:
- local-only mode;
- network permission;
- provider permission;
- plugin permission;
- secrets storage;
- tool side effects;
- filesystem scopes;
- shell/code execution;
- external messages/actions;
- cost thresholds;
- human approvals;
- kill/cancel.

Agents, tools, plugins and UIs cannot bypass it.

---

# 21. CANONICAL REGISTRY SET

Target registry truth:

registry/
- canonical-system-manifest.json
- actions.json
- capabilities.json
- agents.json
- souls.json
- divisions.json
- skills.json
- tools.json
- plugins.json
- services.json
- providers.json
- models.json
- workflows.json
- missions.json
- process-types.json
- events.json
- surfaces.json
- routes.json
- aliases.json
- steering.json
- harnesses.json
- runtimes.json
- ownership.json
- parity.json

Existing discovery files feed this truth.

They are not blindly copied.

---

# 22. CANONICAL CROSSWALK

Every shippable capability must be traceable:

CAPABILITY
→ ACTION
→ OWNER DIVISION
→ AGENT(S)
→ SOUL IF ANY
→ SKILL(S)
→ TOOL(S)/PLUGIN(S)
→ SERVICE(S)
→ HARNESS(ES)
→ RUNTIME CLASS
→ PROVIDER/MODEL REQUIREMENTS
→ WORKFLOW/MISSION ROLE
→ PROCESS TYPE
→ EVENT TYPES
→ DATASTORE/MEMORY
→ API/GATEWAY
→ CLI
→ TUI
→ WEB
→ DESKTOP
→ MOBILE

If any required hop is UNKNOWN, the capability is not FULL.

---

# 23. IMPLEMENTATION ORDER

## PHASE 0: FREEZE TRUTH
- preserve discovery snapshot;
- no deletion/moves based on guesses;
- declare canonical migration branch/workspace;
- establish schema/version rules.

## PHASE 1: CANONICAL REGISTRIES
- normalise agents/souls/divisions;
- resolve skill duplicate identities;
- create runtime/harness/steering registries;
- create ownership/crosswalk;
- remove hard-coded counts from target surfaces.

## PHASE 2: ACTION KERNEL
- turn CLI command semantics into structured actions;
- input/output schemas;
- error contract;
- approval contract;
- event contract.

## PHASE 3: SUPERVISOR
- single runtime lock;
- service classes;
- dynamic ports;
- health;
- wake/sleep;
- recovery.

## PHASE 4: RESOLVERS
- capability;
- agent;
- skill;
- tool/plugin;
- provider/model.

## PHASE 5: HARNESS STACK
- request;
- action;
- agent;
- tool;
- provider;
- workflow;
- mission;
- recovery;
- verification.

## PHASE 6: STEERING/CONTEXT
- one precedence stack;
- one context assembler;
- provenance;
- runtime user steering events.

## PHASE 7: WORKFLOW + MISSION CONSOLIDATION
- choose one authority for each;
- adapters/migrations;
- no alternate mutation paths.

## PHASE 8: MEMORY TRUTH
- implementation-backed layers only;
- tests;
- provenance;
- privacy.

## PHASE 9: SURFACE GATEWAY
- actions;
- queries;
- events;
- approvals;
- artifacts;
- health.

## PHASE 10: SURFACE PARITY
- CLI;
- TUI;
- Web;
- Desktop;
- Mobile.

## PHASE 11: FIRST INSTALL/FIRST RUN
- one installer;
- one onboarding;
- provider/plugin setup;
- smoke tests;
- launch selected surface.

## PHASE 12: ACCEPTANCE
- fresh install;
- one runtime;
- cross-surface same process;
- tool loop;
- steering;
- restart/recovery;
- port collision;
- service lazy loading;
- plugin lazy loading;
- no hard-coded counts;
- truthful degradation.

---

# 24. HARD ACCEPTANCE TESTS

A release fails if any of these fail.

1. Launch CLI, TUI, Web and Desktop together.
   Result: one canonical backend runtime.

2. Start task from CLI.
   Result: same process ID appears everywhere.

3. Agent requires a skill.
   Result: only selected skill content loads.

4. Agent requires a tool.
   Result: tool harness checks policy, health, schema and approval.

5. Agent requires an external plugin.
   Result: plugin loads/connects only when needed.

6. Agent does not require voice/vision.
   Result: those heavy services remain asleep.

7. Start a voice/vision capability.
   Result: only required media runtime wakes.

8. Change user steering from Desktop.
   Result: same canonical process receives it and all surfaces see it.

9. Kill Web UI.
   Result: task continues.

10. Restart Web UI.
    Result: it reconnects; task is not duplicated.

11. Restart core after recoverable interruption.
    Result: recovery harness resumes or marks state truthfully.

12. Disable provider.
    Result: router falls back under policy or blocks visibly.

13. Disable tool.
    Result: resolver falls back or blocks; no hallucinated success.

14. Change registry count.
    Result: all surfaces update without code change.

15. Start all on-demand classes.
    Result: no 7781/7791 collision.

16. Open Mobile.
    Result: same mission/process/session truth through authenticated gateway.

17. Run a Council task.
    Result: dynamic agents are selected; all child runs share one parent.

18. Run a deterministic utility action.
    Result: zero-agent path works without wasting a model call.

19. Inspect provenance.
    Result: action, agent, soul, skills, tools, provider/model, steering versions and artifacts are traceable.

20. Unsupported memory layer.
    Result: UI says unavailable; it does not claim historical "7/7 wired".

---

# 25. DEFINITION OF DONE

PURPCLAW is done when:

A user installs it once, completes onboarding once, and can use CLI, TUI, Web UI, Desktop UI or Mobile UI as interchangeable controls for the same live organisation.

The organisation selects the correct runtime, harness, steering profile, agent, soul, skill, tool/plugin, provider/model and worker only when required.

Every operation has one canonical process identity, one event history, one state, one approval trail and one result.

Heavy subsystems sleep until needed.

No surface lies.
No surface forks the truth.
No duplicate backend spawns because another interface opened.
No agent gets the entire skill/tool universe dumped into context.
No workflow/mission/memory implementation gets declared canonical without evidence.

That is the shipping bar.
