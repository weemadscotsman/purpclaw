# PURPCLAW Agent Directory

> **Last Updated:** 2026-04-17
> System: SAMANTHA (Specific Autonomous Multi-Agent Network for Thoughtful Home Assistance)
> Stack: v8.x — 18 PM2 services, 30+ agents, 9 divisions

---

## The 9 Divisions

### TIER 1 — Strategic
| Division | Agents | Role |
|----------|--------|------|
| **Intelligence** | duck, ghost, dragon | High-level analysis, planning, research |
| **Engineering** | octopus, robot, mushroom | Code implementation, debugging, architecture |

### TIER 2 — Tactical
| Division | Agents | Role |
|----------|--------|------|
| **Security** | chonk | Threat modeling, vulnerability assessment |
| **Infrastructure** | owl, cactus | DevOps, deployment, system maintenance |
| **Media Ops** | penguin, bunny | Media processing, content generation |
| **Management** | gator, shrimp, moss | Coordination, resource allocation |

### TIER 3 — Operational
| Division | Agents | Role |
|----------|--------|------|
| **Science** | coral, crab, stickbug, rock, log, diamond | Research, experimentation, analysis |
| **Creative** | pebble, brick, sand, gravel, leaf, dust | Content creation, design, art |
| **Operations** | starfish, jellyfish, squid, shrimp, mussel | Logistics, execution, monitoring |

---

## Agent Spawning

Agents are spawned via **Kimi Code CLI** (`C:\Users\Admin\.local\bin\kimi.exe`) or cloud API fallback, managed by `agent_tower.js` (port 7790).

```javascript
// From agent_tower.js — spawn pattern
const child = spawn(KIMI_CLI_PATH, [
  '--print', '--yolo', '--prompt', cliPrompt
], {
  detached: true,
  stdio: 'ignore',
  env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
  timeout: 45000
});
child.unref();
```

Work directories: `agent_work/{agent_name}/` — contains task file + log file.

Teams are pre-composed groups:
| Team | Agents | Use Case |
|------|--------|----------|
| build | octopus + mushroom + dragon | Code building |
| design | ghost + pebble | UI/UX design |
| research | duck + ghost | Investigation |
| audit | chonk + gator | Security reviews |
| fix | octopus + owl | Debugging |
| analyze | dragon + ghost + owl | Deep analysis |
| deploy | octopus + mushroom + cactus | Deployment |
| optimize | robot + cactus | Performance tuning |
| refactor | octopus + mushroom | Code cleanup |
| test | robot + mushroom | Testing |
| review | gator + chonk | Code review |
| coordinate | shrimp + squid | Cross-team sync |
| debug | owl + octopus | Root cause analysis |
| security | chonk + gator | Security work |

---

## Agent → Companion Mapping

When agents spawn, `companion-chorus/bridge.js` reacts based on species:

| Agent | Companion Species | Personality |
|-------|-------------------|-------------|
| duck | duck | aggressively helpful |
| ghost | ghost | mysterious |
| dragon | dragon | grandiose |
| octopus | octopus | scattered genius |
| robot | robot | deadpan |
| mushroom | mushroom | funky |
| chonk | chonk | chill |
| owl | owl | wise condescending |
| cactus | cactus | minimal |
| penguin | penguin | formal |
| goose | goose | chaotic |
| turtle | turtle | slow |
| axolotl | axolotl | regenerative |
| capybara | capybara | chill |
| rabbit | rabbit | anxious |
| snail | snail | slow methodical |

---

## Agent Communication

- **Via EventBus (7782):** `agent.spawned`, `agent.completed`, `agent.failed`, `agent.error`
- **Via State Store (7783):** `agents` namespace tracks status per agentId
- **Direct WebSocket:** agent_tower maintains ball WebSocket for voice response
