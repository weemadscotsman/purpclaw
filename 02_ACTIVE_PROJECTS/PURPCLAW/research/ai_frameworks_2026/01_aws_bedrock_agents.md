# 01 — AWS Bedrock Agents

**Tier:** 1 (Enterprise / Hyperscaler)  
**Vendor:** Amazon Web Services  
**License:** Proprietary (managed service)  
**Initial release:** 2023 (GA 2024)  
**Last major update:** 2025 (multi-agent collaboration + flows)

---

## What it is
Fully managed agent runtime on AWS Bedrock. Define agents via console/API, attach foundation models (Claude, Nova, Llama, Mistral, AI21), connect to knowledge bases (OpenSearch/RDS/S3), Lambda functions for actions, and Guardrails for safety. Supports session memory, multi-agent collaboration ("Bedrock AgentCore"), and Flows for low-code orchestration.

## Core capabilities
- [x] Multi-agent collaboration (supervisor + collaborator pattern)
- [x] Knowledge base grounding (RAG)
- [x] Tool / action group definitions (Lambda, OpenAPI)
- [x] Session memory + contextual carryover
- [x] Guardrails (content filtering, PII redaction, topic denial)
- [x] Code interpretation (sandbox)
- [x] Browser tool (preview)
- [x] Flows (visual orchestration)
- [x] VPC / private network support
- [x] IAM-based access control

## Architecture
- Managed runtime, agents are serverless
- State persisted in Bedrock service
- Knowledge bases backed by OpenSearch Serverless or Pinecone
- Tool execution via Lambda or outbound OpenAPI
- Memory: short-term (session) + optional long-term via KB

## Strengths
- Zero infrastructure to manage
- Deep AWS integration (IAM, VPC, CloudTrail, CloudWatch)
- Enterprise compliance (SOC2, HIPAA, FedRAMP)
- Built-in guardrails
- Strong RAG tooling

## Weaknesses
- AWS lock-in
- Less flexible than LangGraph / AutoGen for complex flows
- Custom orchestration logic still requires Lambda hops
- Pricing can escalate with token throughput

## Best use case
Enterprise agents on AWS needing managed infrastructure, compliance, and tight IAM integration. Customer support, internal knowledge assistants, document processing pipelines.

## PURPCLAW fit: 7/10
- Strong if PURPCLAW deploys on AWS
- Less ideal for local-first or multi-cloud
- Use Bedrock Agents as one of several backends, not primary orchestrator

## Integration sketch
```python
import boto3
client = boto3.client("bedrock-agent-runtime")
response = client.invoke_agent(
    agentId="PURPCLAW_AGENT_ID",
    agentAliasId="PROD",
    sessionId="user-123",
    inputText="Summarize today's swarm log.",
)
```

## Sources
- https://aws.amazon.com/bedrock/agents/
- https://docs.aws.amazon.com/bedrock/latest/userguide/agents.html
- AWS re:Invent 2025 announcements
