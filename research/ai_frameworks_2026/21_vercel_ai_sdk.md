# 21 — Vercel AI SDK

**Tier:** 6 (Integration / Infrastructure)  
**Vendor:** Vercel  
**License:** Apache 2.0  
**Initial release:** 2023  
**Last major update:** 2025 (AI SDK 5.x, agents, MCP)

---

## What it is
TypeScript-first SDK for building AI apps and agents. Strong on edge runtimes (Vercel Edge Functions, Cloudflare Workers). Framework-agnostic (works with React, Next.js, Vue, Svelte). Streaming-first.

## Core capabilities
- [x] Multi-provider (OpenAI, Anthropic, Google, Mistral, etc.)
- [x] Streaming (text, object, UI)
- [x] Structured outputs (Zod schemas)
- [x] Tool calling
- [x] Agent primitive (AI SDK 5)
- [x] MCP support
- [x] React hooks (`useChat`, `useCompletion`)
- [x] Edge runtime
- [x] Multi-modal (images, audio)
- [x] Embeddings

## Architecture
```typescript
import { generateText, tool } from 'ai';

const result = await generateText({
  model: anthropic('claude-sonnet-4.5'),
  tools: { weather: tool({ ... }) },
  prompt: '...',
});
```
- Unified API across providers
- Streaming as default

## Strengths
- Best streaming DX
- TypeScript-first (fantastic types)
- Edge-ready
- React-first (huge ecosystem)
- Framework-agnostic core

## Weaknesses
- TypeScript-only (Python via separate port)
- Agent primitive newer than competitors
- Vercel coupling for some features

## Best use case
Web apps with AI chat, edge-deployed agents, TypeScript teams. UI-heavy agent experiences.

## PURPCLAW fit: 6/10
- Use for PURPCLAW web UI / gateway adapters
- Excellent for chat interfaces
- Edge runtime = fast responses

## Integration sketch
```typescript
// Edge agent
import { streamText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';

export const runtime = 'edge';
export async function POST(req: Request) {
  const { messages } = await req.json();
  const result = streamText({
    model: anthropic('claude-sonnet-4.5'),
    messages,
  });
  return result.toDataStreamResponse();
}
```

## Sources
- https://github.com/vercel/ai
- https://sdk.vercel.ai/docs
- Vercel blog (2025)
