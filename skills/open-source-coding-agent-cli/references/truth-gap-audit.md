# Truth Gap Audit — Methodology

## When to use
When docs claim numbers that don't match runtime reality. After any major release or doc update. Before showing the project to anyone.

## The 3-source check
For every system claim, cross-reference THREE sources:
1. **README/docs** — what the project says it has
2. **Code on disk** — what files actually exist, their sizes, line counts
3. **Runtime** — what's actually running right now (PM2 online count, port responses)

## Example: Agent Inflation (PurpClaw 2026-06-06)

### Source 1: README
> "152 agents across 5 divisions"

### Source 2: Code on disk
- 152 skill directories in `skills/`
- 54 directories contain `.js` files (executable code)
- 42 directories contain `AGENT.md` (documented persona)
- 98 directories are shells (no code, no docs)

### Source 3: Runtime
- Tower registers 35 agents (PM2 runtime)
- `curl :7790/tower/status` → `totalRegistered: 35`

### Truth Gap
Claim: 152 → Reality: 35 deployable, 54 with code, 56 empty shells.
Classification table:
| Type | Count | Meaning |
|---|---|---|
| Runtime Agent | 35 | Registered in tower, spawnable |
| Skill Agent | 54 | Has .js module, loadable |
| Persona Agent | 42 | Has AGENT.md only |
| Shell | 56 | Directory only |

## Fix applied
Updated README tagline from "152 agents" to "35 runtime agents (152 skill directories)". Added honest-numbers paragraph. Changed comparison table.

## Pattern
The docs didn't lie — they ran ahead of the runtime. Classic engineer disease. All the code exists, but not everything is booted or wired. Fix: replace aspirational numbers with audited numbers, note the gap honestly.

## Verification commands
```bash
# Agent count
ls skills/ | wc -l                                    # total dirs
find skills -name "*.js" | wc -l                      # with code
find skills -name "AGENT.md" | wc -l                  # with docs
curl -s :7790/tower/status | jq .totalRegistered      # runtime

# Service count
pm2 list | grep -c "online"                            # running
grep "name:" ecosystem.config.js | wc -l              # defined

# Memory layers
ls memory_matrix_v2.py                                # exists?
curl -s :7880/health                                  # running?
