// lib/providers/types.ts
// Canonical provider, tool, and event contracts for PURPCLAW.
// See deep-research-report (2) §"The highest-impact file edits":
// define the contracts first, everything else becomes a serializer.

export type StreamMode = 'sse' | 'jsonl' | 'ws' | 'none';

export type CanonicalMessage =
  | { role: 'system' | 'user' | 'assistant'; content: string | ContentBlock[] }
  | { role: 'tool'; content: string; tool_call_id: string };

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; url: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown };

export type ToolCapability = 'read' | 'write' | 'exec' | 'network';
export type ExecutionMode = 'local' | 'provider_native' | 'mcp_remote';
export type AuthPolicy = 'noauth' | 'oauth2' | 'internal' | 'api_key';

export interface CanonicalToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  strict?: boolean;
  aliases?: string[];
  capability?: ToolCapability;
  executionMode?: ExecutionMode;
  authPolicy?: AuthPolicy;
  sideEffect?: boolean;
}

export interface CanonicalToolInvocation {
  callId: string;
  name: string;
  args: Record<string, unknown>;
  sourceAdapter?: string;
  parentRunId?: string;
}

export interface CanonicalToolResult {
  callId: string;
  ok: boolean;
  output?: unknown;
  error?: string;
  durationMs?: number;
}

export interface CanonicalRequest {
  provider: string;
  model: string;
  messages?: CanonicalMessage[];
  input?: unknown;
  tools?: CanonicalToolSpec[];
  toolChoice?: 'auto' | 'none' | { name: string };
  stream?: boolean;
  metadata?: Record<string, unknown>;
  timeoutMs?: number;
  agent?: string;
  bypassSpendGate?: boolean;
}

export type CanonicalEventType =
  | 'message.delta'
  | 'message.completed'
  | 'tool.call'
  | 'tool.result'
  | 'usage'
  | 'error'
  | 'done';

export interface CanonicalEvent {
  type: CanonicalEventType;
  runId: string;
  provider: string;
  payload: Record<string, unknown>;
}

export interface CanonicalUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number;
  observedCostUsd?: number;
}

export interface ProviderAdapter {
  name: string;
  streamMode: StreamMode;
  authType: 'bearer' | 'x-api-key' | 'oauth' | 'none';
  healthCheck(): Promise<{ ok: boolean; detail?: string }>;
  create(req: CanonicalRequest): Promise<{ output: unknown; usage?: CanonicalUsage }>;
  stream?(req: CanonicalRequest): AsyncIterable<CanonicalEvent>;
  // Returns: short-lived header map for this provider (vault-issued when available).
  prepareAuth?(): Promise<Record<string, string>>;
}

export interface CanonicalSpawnRequest {
  agent: string;
  task: string;
  budget?: { usd?: number; maxTokens?: number; ttlMs?: number };
  timeoutMs?: number;
  allowedTools?: string[];
  approvalMode?: 'inherited' | 'workspace-write' | 'danger-full-access' | 'read-only';
  parentRunId?: string;
  metadata?: Record<string, unknown>;
}

export interface CanonicalSpawnResult {
  runId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  output?: unknown;
  usage?: CanonicalUsage;
  events?: CanonicalEvent[];
}

// ── Tool alias policy (runtime contract) ────────────────────────────────────
//
// Aliases are first-class. The same canonical tool can be invoked by any of:
//   - its primary name  (`spawn`)
//   - any declared alias (`delegate_task`, `agent_spawn`, `spawn_agent`)
//
// All adapters and surfaces MUST call `resolveAlias(name)` before invocation.
// Internal callers can also pass the canonical name directly.
export function resolveAlias(name: string, aliasMap: Map<string, string>): string {
  return aliasMap.get(name) || name;
}
