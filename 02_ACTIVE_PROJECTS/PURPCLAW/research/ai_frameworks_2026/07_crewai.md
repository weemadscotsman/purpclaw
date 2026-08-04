# 07 — CrewAI

**Tier:** 2 (Open-Source Flagship)  
**Vendor:** CrewAI Inc.  
**License:** MIT (core), commercial (CrewAI Enterprise)  
**Initial release:** 2023  
**Last major update:** 2025 (CrewAI AMP, Flows, multi-modal)

---

## What it is
Role-based multi-agent framework. Agents are "crew members" with **role**, **goal**, **backstory**, and **tools**. They collaborate on **tasks** with defined expected outputs. Inspired by crew/organizational metaphors. Now includes **Flows** for stateful event-driven orchestration.

## Core capabilities
- [x] Role/goal/backstory agent definition
- [x] Task delegation with dependencies
- [x] Sequential and parallel processes
- [x] Hierarchical process (manager agent)
- [x] Tools (custom + Composio integration)
- [x] Memory (short, long, entity)
- [x] CrewAI Flows (event-driven, stateful)
- [x] Multi-modal (image, audio input)
- [x] CrewAI AMP (managed platform)
- [x] YAML/JSON config

## Architecture
```
Crew(
  agents=[researcher, writer, editor],
  tasks=[Task(...), Task(...), Task(...)],
  process=Process.sequential  // or hierarchical
)
```
- Agents collaborate via delegation
- Manager agent can dynamically assign

## Strengths
- Intuitive role-based metaphor
- Low ceremony
- Strong community & content
- YAML config makes it accessible
- Flows add stateful power

## Weaknesses
- Less explicit control than LangGraph
- Memory can be flaky
- Hierarchical process occasionally hallucinates assignments
- Production hardening still catching up

## Best use case
Content creation, research synthesis, role-based team workflows. Quick prototypes where the role metaphor matches the problem.

## PURPCLAW fit: 7/10
- Excellent for PURPCLAW's "agent personas" metaphor
- Each PURPCLAW agent (ROBOT, OWL, PHX, etc.) maps naturally to CrewAI Agent
- Use for persona-driven workflows, not low-level orchestration

## Integration sketch
```python
from crewai import Agent, Task, Crew, Process

researcher = Agent(role="Researcher", goal="Find data", backstory="...")
analyst = Agent(role="Analyst", goal="Analyze findings", backstory="...")

task1 = Task(description="Research AI frameworks", agent=researcher)
task2 = Task(description="Analyze and rank", agent=analyst)

crew = Crew(agents=[researcher, analyst], tasks=[task1, task2], process=Process.sequential)
result = crew.kickoff()
```

## Sources
- https://github.com/crewAIInc/crewAI
- https://docs.crewai.com/
- CrewAI blog (2025)
