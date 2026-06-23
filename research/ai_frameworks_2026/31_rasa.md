# 31 — Rasa

**Tier:** 3 / 9 (Conversational AI focus)  
**Vendor:** Rasa  
**License:** Apache 2.0 (open core)  
**Initial release:** 2017  
**Last major update:** 2025 (CALM, generative flows)

---

## What it is
Open-source conversational AI platform. Traditionally NLU/intent-based, now adding LLM flows (CALM = Conversational AI with Language Models). Enterprise chatbot backbone.

## Core capabilities
- [x] NLU (intent classification, entity extraction)
- [x] Dialogue management
- [x] CALM (LLM-driven flows)
- [x] Custom actions (Python)
- [x] Channels (Slack, Teams, web, etc.)
- [x] Analytics
- [x] Rasa Pro (commercial)
- [x] On-prem deployment

## Architecture
- NLU pipeline (tokenizer → featurizer → classifier)
- Dialogue policies
- Custom actions (Python server)

## Strengths
- Mature, battle-tested
- On-prem (privacy)
- Hybrid LLM + traditional
- Enterprise features

## Weaknesses
- Steep learning curve
- Slower to LLM-native
- Heavier than lightweight alternatives

## Best use case
Enterprise chatbots (banking, healthcare), on-prem conversational AI, hybrid NLU + LLM.

## PURPCLAW fit: 4/10
- Niche (conversational AI)
- Could complement PURPCLAW's chat gateway
- Heavy for general agent work

## Integration sketch
```bash
rasa init    # scaffold
rasa train   # train
rasa run     # serve
```

## Sources
- https://github.com/RasaHQ/Rasa
- https://rasa.com/
