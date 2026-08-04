# Codex Handoff: Add Fungus Amongus Mycelium to PURPCLAW

You are implementing the **Fungus Amongus Mycelium** subsystem as a companion to LIVEFORGE.

Do not build the fancy visual graph first. That would be visually impressive and operationally useless, the classic software industry mating ritual.

## Read first

1. `docs/subsystems/liveforge/PURPCLAW_LIVEFORGE_INSTRUCTION_SET.md`
2. `docs/subsystems/liveforge/FUNGUS_AMONGUS_MYCELIUM_SPEC.md`
3. `docs/subsystems/liveforge/fungus_amongus.mycelium.yaml`
4. `docs/subsystems/liveforge/fungus_amongus.contracts.json`

## Phase One only

Build the spine:

1. Spore Packet type.
2. Hypha Route type.
3. Nutrient Bundle type.
4. Colony Pattern type.
5. JSONL stores under `.purpclaw/mycelium/`.
6. Scope validator.
7. Query by tags/task/consumer/scope.
8. Nutrient bundle builder.
9. Receipt writer.
10. Health command.

## Required commands

Add CLI commands if PURPCLAW CLI exists:

- `purpclaw mycelium health`
- `purpclaw mycelium spore add`
- `purpclaw mycelium query`
- `purpclaw mycelium bundle`
- `purpclaw mycelium route list`

If the current CLI architecture uses another command layout, preserve repo conventions.

## Required API routes if WebUI/API layer exists

- `GET /api/mycelium/health`
- `POST /api/mycelium/spores`
- `POST /api/mycelium/query`
- `POST /api/mycelium/bundles`

## Do not implement yet

- animated graph UI
- automatic permanent learning
- global memory mutation
- direct tool execution changes
- background daemons
- cross-user sharing
- secret capture

## Non-negotiable tests

1. Valid spore writes to JSONL.
2. Invalid spore is rejected.
3. Private spore is excluded from public bundle.
4. Stale spore is marked stale.
5. Conflicting spores create a conflict record.
6. Bundle has source refs and confidence labels.
7. Pattern promotion fails without replay evidence.
8. Every write creates a receipt.

## Design rule

The mycelium does not make PURPCLAW “know everything”. It makes PURPCLAW know what it has evidence for, who is allowed to use it, and whether that knowledge is fresh, stale, disputed, private, or approved.
