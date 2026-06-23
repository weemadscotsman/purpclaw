# 23 — MetaGPT

**Tier:** 8 (Autonomous / Full-Stack)  
**Vendor:** Geekan (community)  
**License:** MIT  
**Initial release:** 2023  
**Last major update:** 2025 (v0.8, multi-modal, software company simulation)

---

## What it is
Multi-agent framework that simulates a software company. Agents take roles: Product Manager, Architect, Engineer, QA. Standard Operating Procedures (SOPs) drive collaboration. Outputs actual code, docs, tests.

## Core capabilities
- [x] Role-based agents (PM, Architect, Engineer, QA)
- [x] SOPs (Standard Operating Procedures)
- [x] Code generation (full repos)
- [x] Document generation
- [x] Multi-role collaboration
- [x] Memory system
- [x] Tools (search, browser, code exec)
- [x] DataInterpreter (data analysis)
- [x] Multi-modal (image understanding)

## Architecture
```python
async def startup(idea: str, investment: float = 3.0) -> Company:
    company = await Company().hire([ProductManager(), Architect(), ...])
    company.invest(investment)
    company.start_project(idea)
    await company.run(n_round=8)
    return company
```
- Agents follow SOPs
- Shared message pool

## Strengths
- Novel SOP approach
- Generates real code
- Impressive demos (one-line startups)

## Weaknesses
- Output quality variable
- Maintenance slowing
- Niche (software company sim)
- Heavy prompts

## Best use case
Auto-generating software prototypes, exploring software company workflows.

## PURPCLAW fit: 4/10
- Interesting but niche
- Could inform PURPCLAW's "software team" pattern
- Probably not core engine

## Integration sketch
```python
import metagpt
async def main():
    await metagpt.startup(idea="Build a TODO app")
```

## Sources
- https://github.com/geekan/MetaGPT
- MetaGPT paper (ICLR 2024)
