# 18 — Langflow

**Tier:** 5 (Visual / No-Code)  
**Vendor:** Langflow (DataStax acquired 2024)  
**License:** MIT  
**Initial release:** 2023  
**Last major update:** 2025 (Langflow 1.x, multi-agent, Astra DB integration)

---

## What it is
Another visual builder, but Python-native (vs Flowise's Node backend). Direct LangChain integration. Strong community and templates. DataStax backing adds enterprise features.

## Core capabilities
- [x] Visual drag-and-drop
- [x] Python-native (easier to extend)
- [x] LangChain direct integration
- [x] Multi-agent flows
- [x] Custom Python components
- [x] Astra DB (Cassandra) integration
- [x] Export to Python code
- [x] API generation
- [x] Playground testing
- [x] Templates gallery

## Architecture
- React frontend
- Python (FastAPI) backend
- Flows = Python dict (exportable)

## Strengths
- Python-native (easier customization)
- Strong LangChain integration
- DataStax enterprise backing
- Templates accelerate start

## Weaknesses
- Same visual abstraction limits
- LangChain coupling
- Performance overhead

## Best use case
Same as Flowise — non-developer builders, Python shops, DataStax/Cassandra users.

## PURPCLAW fit: 4/10
- Same niche as Flowise
- Slightly better for Python shops

## Integration sketch
```bash
# Install
pip install langflow
langflow run
# Open http://localhost:7860
```

## Sources
- https://github.com/langflow-ai/langflow
- https://www.langflow.org/
- DataStax blog
