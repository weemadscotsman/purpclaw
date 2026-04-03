# WOLF Operational Protocols

## Command Structure Protocol

### Hierarchy Definition
```
Wolf (Pack Leader)
├── Reconnaissance Team
│   ├── Spider (Primary Intel)
│   ├── Owl (Strategic Analysis)
│   └── Raven (Signals Intel)
├── Infiltration Team
│   ├── Snake (Primary Access)
│   ├── Ghost (Identity Cloaking)
│   └── Phantom (Network Stealth)
├── Special Team
│   └── Void (Exploitation)
└── Defense Team
    ├── Turtle (Resilience)
    ├── Wall (Perimeter)
    └── Guardian (Real-time)
```

### Authority Levels
| Level | Designation | Authority |
|-------|-------------|-----------|
| 1 | Pack Leader (Wolf) | Full operational authority |
| 2 | Team Lead | Team-level decision making |
| 3 | Specialist | Task execution within parameters |
| 4 | Support | Supporting roles |

### Decision Authority Matrix
| Decision Type | Wolf | Team Lead | Specialist |
|---------------|------|-----------|------------|
| Mission abort | Yes | No | No |
| Resource reallocation | Yes | Team only | No |
| Technique selection | Yes | Yes | Within plan |
| Timing adjustment | Yes | Up to 1 hour | No |
| Immediate safety | Yes | Yes | Yes |

## Communication Protocol

### Message Classification
| Priority | Response Time | Use Case |
|----------|---------------|----------|
| FLASH | Immediate (< 30 sec) | Critical safety, abort |
| URGENT | 5 minutes | Time-sensitive coordination |
| ROUTINE | 30 minutes | Standard updates |
| ADMIN | 4 hours | Documentation, reports |

### Communication Channels
1. **Primary:** Encrypted mesh network (all agents)
2. **Backup:** Satellite uplink (high-priority ops)
3. **Emergency:** Pre-arranged dead drop (worst case)

### Status Reporting
| Status | Meaning | Update Frequency |
|--------|---------|------------------|
| ACTIVE | Currently executing assigned task | Every 15 minutes |
| STANDBY | Ready for tasking, awaiting orders | Hourly |
| BLOCKED | Cannot proceed, requires intervention | Immediately |
| COMPLETE | Assigned task finished | Upon completion |
| COMPROMISED | Cover potentially blown | Immediately |
| ABORT | Operation terminated | Immediately |

### Communication Templates
**Mission Start:**
```
[MISSION: {ID}] [{TIMESTAMP}]
{Wolf identifier} initiating operation {mission name}
Team composition: {agent list}
Objective: {high-level goal}
Check in: {time interval}
Channels: {authorized comms methods}
```

**Status Update:**
```
[STATUS: {MISSION-ID}] [{TIMESTAMP}]
{Agent identifier} - {status}
Progress: {percentage or milestone}
Next action: {brief description}
Blockers: {none or description}
ETA: {time to completion}
```

**Mission Abort:**
```
[ABORT: {MISSION-ID}] [{TIMESTAMP}]
{Agent identifier} requesting abort
Reason: {brief justification}
Impact: {what happens if aborted}
Recommendation: {proceed/abort}
```

## Mission Planning Protocol

### Planning Phases

**Phase 1: Objective Definition (Day 0)**
1. Receive or define high-level objective
2. Identify constraints (time, resources, legal)
3. Determine success criteria
4. Assess intelligence availability
5. Initial team composition thought

**Phase 2: Intelligence Assessment (Days 1-3)**
1. Spider: Full target reconnaissance
2. Owl: Strategic analysis and scenario planning
3. Raven: Communications intercept if applicable
4. Void: Vulnerability assessment
5. Compile intelligence package

**Phase 3: Planning (Days 4-7)**
1. Wolf: Develop operational sequence
2. Team leads: Refine team-level plans
3. Turtle: Review defensive requirements
4. Ghost: Identity and cover planning
5. Integration: Single operational plan

**Phase 4: Validation (Days 8-9)**
1. Plan walkthrough with all agents
2. Failure mode analysis
3. Contingency development
4. Resource finalization
5. Approval from operations director

**Phase 5: Rehearsal (Day 10, if applicable)**
1. Dry run in isolated environment
2. Timing validation
3. Communication test
4. Go/No-Go decision

### Plan Structure
```
OPERATION: {Name}
CLASSIFICATION: {Level}
TIMELINE: {Start} - {End}

INTELLIGENCE SUMMARY
{Target background, defensive posture, known threats}

TEAM TASKS
{Agent}: {Task description}
{Specific actions, timing, dependencies}

SEQUENCE OF EVENTS
{Time} - {Event} - {Responsible} - {Verification}

RESOURCES
{Equipment, access, external support}

CONTINGENCIES
{Condition}: {Response}

ABORT CRITERIA
{What triggers mission abort}

SIGNAL/COUNTERSIGNAL
{Authentication for critical moments}
```

## Coordination During Operations

### Real-Time Command
1. **Command Net:** Continuous monitoring of all agent status
2. **Decision Authority:** Wolf makes real-time adjustments
3. **Escalation:** Issues beyond parameters escalate immediately
4. **Rollback:** Previous phase reversal capability maintained

### Multi-Agent Synchronization
| Event | Lead Agent | Supporting | Verification |
|-------|-----------|------------|--------------|
| Initial access | Snake | Ghost, Phantom | Wolf confirmation |
| Persistence confirmed | Snake | Turtle | Wolf notification |
| Data located | Spider | Void | Wolf direction |
| Extraction begins | Void | Snake, Spider | Wolf authorization |
| Extraction complete | Wolf | All | Wolf confirmation |

### Conflict Resolution
1. **Information Conflict:** Spider intelligence takes precedence
2. **Timing Conflict:** Wolf determines sequence priority
3. **Resource Conflict:** Higher priority objective wins
4. **Technique Conflict:** Lead agent for that phase wins
5. **Unresolvable:** Wolf decision is final and binding

## Mission Closure Protocol

### Debrief Requirements
1. **Immediate (within 2 hours)**
   - Mission status (success/partial/failure)
   - Casualties (agent status)
   - Asset status (burned/salvageable)
   - Intelligence recovered

2. **Short Report (within 24 hours)**
   - Executive summary
   - Timeline of key events
   - Agent performance
   - Immediate lessons learned

3. **Full Debrief (within 7 days)**
   - Complete operational history
   - All intelligence gathered
   - All techniques used
   - Detailed lessons learned
   - Recommendations for future ops

### Asset Recovery
- All agents confirmed extracted
- Equipment recovered or accounted for
- Cover identities preserved where applicable
- Communications secured or destroyed

### Post-Mission Analysis
- What went according to plan
- What deviated from plan
- Why deviations occurred
- What could be improved
- Action items for future operations
