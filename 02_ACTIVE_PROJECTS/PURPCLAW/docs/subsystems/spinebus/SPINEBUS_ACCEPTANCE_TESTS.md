# SPINEBUS Phase 2 Acceptance Tests

## Test 1 - Health

Command:

`purpclaw spinebus health`

Pass if:

- returns ok true
- storage paths exist
- registry source found or clear warning emitted
- liveforge/fungus/pxpipe touch dependencies are detected or marked unavailable

## Test 2 - Job envelope

Command:

`purpclaw spinebus route "make a tool workflow from this transcript"`

Pass if:

- creates `job_...`
- writes to `agent_work/spinebus/jobs.jsonl`
- contains raw text or PXPIPE reference
- contains normalized intent
- contains risk class

## Test 3 - Every subsystem touched

The route receipt must show touches for:

- chat_intake
- intent_normalizer
- session_memory
- project_memory
- user_memory
- agent_memory
- skill_memory
- tool_memory
- mycelium_memory
- fungus_amongus
- agent_tower
- skill_registry
- tool_registry
- liveforge
- pxpipe
- execution_gate
- receipts
- truth_audit
- autolearn
- dreamforge

Pass if every required touch exists with a status.

## Test 4 - Only selected executors execute

Phase 2 pass condition:

- no shell execution
- no PC control
- no file mutation outside storage except explicit test files
- no provider call required
- gate is `plan_only`

## Test 5 - Skill card loading

Pass if:

- route includes selected skill cards or warns that no verified skill card exists
- unverified skills are not treated as fully executable
- each selected skill lists required tools or explicitly says none

## Test 6 - Tool/function registry

Pass if registry output includes callable categories:

- native tools
- skills
- agents
- API routes
- CLI commands

Pass if counts are unique and not inflated.

## Test 7 - Receipt

Pass if route writes receipt with:

- job id
- route id
- touched subsystems
- selected agent
- selected skills
- selected tools
- gate status
- status
- createdAt

## Test 8 - Dream queue

Pass if a safe improvement task can be queued.

Must not:

- execute patch
- push to main
- mutate registry
- change permissions

## Test 9 - Invalid input rejection

Bad input:

- missing text
- malformed source
- invalid risk class
- invalid touch status

Pass if rejected with useful error.

## Test 10 - PXPIPE budget path

For a large text payload, pass if:

- PXPIPE is used or recommended
- envelope stores artifact pointer
- raw prompt context is not bloated

