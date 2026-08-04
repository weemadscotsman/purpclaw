# SPINEBUS Execution Flow

## Main route

### Step 1 - Chat intake

Input:
- raw user message
- session id
- user id or local identity
- source surface
- attachments
- existing route context

Output:
- `Job Envelope`

The raw message must be preserved in a receipt-safe form.

If the message is large, write it to PXPIPE and store the artifact pointer.

### Step 2 - Intent normalization

Convert the user request into:

- primary intent
- secondary intents
- task type
- risk class
- required capabilities
- likely output format
- urgency
- ambiguity level
- whether tools are likely required
- whether files are likely required
- whether web/current data is likely required
- whether local execution is likely required

### Step 3 - Memory touch

Each memory layer receives the envelope and returns:

- `status`
- `confidence`
- `relevant_refs`
- `compact_context`
- `warnings`
- `suggested_routes`

Memory layers must not dump full memories into the envelope.

### Step 4 - Mycelium touch

Fungus Amongus returns:

- matching spores
- known good routes
- known bad routes
- relevant warnings
- contradiction alerts
- promoted colony patterns

The mycelium touch must respect scope.

### Step 5 - Tower match

Agent Tower ranks candidate agents and divisions.

Rank by:

- capability match
- tool permission match
- prior success
- cost and latency
- availability
- risk handling
- user/project preferences

Output:
- selected lead agent
- supporting agents
- rejected candidates with reasons

### Step 6 - Skill match

Skill registry selects candidate skills.

Each loaded skill must include a skill card.

A skill card must tell the agent how to use the skill, not just that it exists.

Output:
- selected skills
- required tools
- optional tools
- forbidden tools
- validation rules

### Step 7 - Tool and function match

Tool registry selects callable options.

The route planner must map:

- intent to skill
- skill to tools
- tools to function handlers
- function handlers to platform commands
- expected outputs to validation

Output:
- callable chain candidates
- preferred tool chain
- fallback tool chains
- risk notes

### Step 8 - Execution plan

Build a plan object.

The plan must include:

- selected agent
- selected skill cards
- selected tools
- disallowed tools
- expected outputs
- write locations
- approval gates
- rollback plan
- receipt targets

Phase 2 should create plans without executing them by default.

### Step 9 - LIVEFORGE optional surface

If the job benefits from a visible surface, create or update a LIVEFORGE surface.

Examples:

- route inspector
- tool chain preview
- generated form
- proof viewer
- agent cockpit
- replay surface

### Step 10 - Execution gate

Before any real mutation, SPINEBUS checks:

- permissions
- side effects
- risk level
- approval requirement
- platform compatibility
- input schema validity
- output destination safety

### Step 11 - Execute or respond

If execution is allowed, dispatch.

If execution is not allowed or not needed, respond with the planned answer.

### Step 12 - Receipt write

Every route writes a receipt.

Receipt must include:

- envelope id
- route id
- selected agent
- selected skills
- selected tools
- touched subsystems
- execution status
- outputs
- errors
- timing
- token/cost estimate if available

### Step 13 - Truth audit

Update or compare against truth manifests.

Do not let UI or marketing claims exceed verified runtime state.

### Step 14 - Lesson proposal

If the job produced a reusable improvement, write a lesson proposal.

Examples:

- better skill route
- faster tool chain
- lower-token context pack
- new failure mode
- repeated user correction
- missing schema
- missing test

### Step 15 - Dream queue

If safe and useful, send a dream task.

Dream tasks must be non-destructive unless approved.

## Critical design rule

SPINEBUS is the traffic controller.

It should not become a god object.

It routes, logs, gates, and coordinates.

It should delegate execution to existing PURPCLAW tools, agents, and services.

