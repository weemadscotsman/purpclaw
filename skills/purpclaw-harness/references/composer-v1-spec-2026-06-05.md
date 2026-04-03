# Composer V1 — Unified Command Center (2026-06-05)

Eddie Cannon's UX spec for the PURPCLAW textbox replacement. The thesis: "Every AI chat app is slowly evolving into the same thing — a command center disguised as a textbox. The textbox isn't the product anymore. The controls around it are."

## The 10 Elements

All wired into `app/components/composer/ComposerInput.tsx` + `CommandPanel.tsx`:

1. **Attachment launcher** (left side +) — `📎` files, folder, images, audio, video, URL, clipboard. CONTEXT: workspace, project, doc, saved context, @mention agent, @mention skill. ACTIONS: run action, search repo, web search, deep research, gen image/video/audio. Drag-drop files anywhere.
2. **Mode toggle** (visible, not hidden) — Chat / Plan / Execute / Swarm. Color-coded, glow on active.
3. **Model control** (Claude-style) — Speed (Fast/Balanced/Deep), Intelligence (Low/Medium/High/Extreme), Provider (OpenAI/Claude/Gemini/DeepSeek/Kimi/Qwen/Local/Auto).
4. **Access control** (next to send, always visible) — Read Only / Review / Agent Actions / Full System. Color-coded pill, "shocking concept in 2026".
5. **Agent bar** (above composer) — Planner / Researcher / Builder / Security / Designer / Video / Audio / Custom. Tap to enable → creates temporary swarm.
6. **Workspace bar** — DreamForge / OmniCode / Gotham / OpenClaw / Current Folder / Custom Project. Instant context switch.
7. **Memory bar** — Off / Session / Project / Persistent. "No mystery meat AI."
8. **Quick chips** — Search, Think, Research, Code, Explain, Design, Debug, Write, Market, Legal, OSINT, Voice, Video, Image.
9. **Send button area** — Voice / Screen Share / Desktop Context / Camera / Send / Stop. All visible.
10. **ACTIVE CONTEXT PANEL** — above textbox, shows exactly what WILL be sent: attached files, mentioned agents/skills, workspace, memory, token count. **The differentiator.**

## Type System (single source of truth — `app/components/composer/types.ts`)

```ts
export type ComposerMode = 'chat' | 'plan' | 'execute' | 'swarm';
export type AccessMode   = 'readOnly' | 'review' | 'agentActions' | 'fullSystem';
export type MemoryMode   = 'off' | 'session' | 'project' | 'persistent';
export type ComposerSpeed = 'fast' | 'balanced' | 'deep';
export type IntelligenceLevel = 'low' | 'medium' | 'high' | 'extreme';
export type ProviderId   = 'auto' | 'openai' | 'claude' | 'gemini' | 'deepseek' | 'kimi' | 'qwen' | 'local';
export type WorkspaceId  = 'dreamforge' | 'omnicode' | 'gotham' | 'openclaw' | 'current' | 'custom';
export type AgentId      = 'planner' | 'researcher' | 'builder' | 'security' | 'designer' | 'video' | 'audio' | 'custom';
```

Don't fork these in other files. They map 1:1 to the toolbar pill IDs and to the active-context chip kinds.

## Active Context Strip (the differentiator — `ComposerInput.tsx:211-237`)

```tsx
{(attachments.length > 0 || contextExpanded) && (
  <div className="mb-2 context-panel-enter">
    {attachments.map((a, i) => (
      <span key={a.path} className="flex items-center gap-1 ..." title={a.path}>
        📎 {a.name} <span className="text-white/25">{a.kind}</span>
        <button onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))}>×</button>
      </span>
    ))}
    {activeContext.slice(0, 14).map((item, i) => (
      <span className="..." title={item.detail || item.kind}>
        {CONTEXT_ICONS[item.kind] || '·'} {item.label}
      </span>
    ))}
  </div>
)}
```

Always visible. Real values. User can see exactly what's attached before they send. Click the token counter to expand for full preview.

## Real Token Count (`CommandPanel.tsx:1777-1781`)

```ts
const estimatedTokens = useMemo(() => {
  const attachmentChars = attachments.reduce((s, a) =>
    s + (a.preview?.length || 0) + a.name.length + a.path.length, 0);
  const contextChars = activeContext.reduce((s, i) =>
    s + i.label.length + (i.detail?.length || 0), 0);
  return Math.max(1, Math.ceil((input.length + attachmentChars + contextChars) / 4));
}, [activeContext, attachments, input]);
```

`useMemo` recomputes as user types. `chars/4` is a tight approximation of GPT-style tokenization. Show as `{count.toLocaleString()} tk` in the bottom-right of the toolbar.

## Backend: `/api/composer/context` (`unified_api.js:composerContextHandler`)

Real, not fakery. The UI calls this with the current attachments and gets back:
- per-item preview (file content read from disk, URL host, agent name)
- real token count (`composerTokenCount` = `Math.ceil(text.length / 4)`)
- the actual prompt that will be built (mode header + workspace header + items joined)
- warnings: file truncated >200KB, secret patterns detected (`sk-...`, `api_key=...`)

```js
async function composerContextHandler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, ...);
  const body = await parseBody(req);
  const { attachments = [], mentions = [], mode = 'chat', workspace = 'current' } = body;
  // ... reads files, computes tokens, builds prompt
  return sendJson(res, 200, {
    ok: true, mode, workspace, items, totalTokens, totalChars, prompt, warnings,
  });
}
```

Live test (proven 2026-06-05):
```bash
curl -X POST http://127.0.0.1:7780/api/composer/context \
  -H "Content-Type: application/json" \
  -d '{"attachments":[{"kind":"file","label":"README","path":"E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/README.md"}],"mode":"plan"}'
# → ok: True, items: 1, totalTokens: 1162, totalChars: 4646
```

## Pitfalls (real, encountered)

1. **Don't add sine-wave / fake-loading animations to context panels.** The "what will be sent" panel must show REAL data — if there's nothing attached, show nothing. Empty state ≠ decorative wave.
2. **Don't reuse emoji icons across elements** — `🔍` should be context search, not model picker. The CONTEXT_ICONS map is the source of truth.
3. **Mode toggle is the entry point to agent permissions.** Switching from Chat → Execute should always warn once (or at least show a visible "tools enabled" pill). Switching to Swarm should pre-tick at least the Planner agent.
4. **Access mode is non-trivial.** Read Only must actually block write tools. Review must require approval before execution. Agent Actions means tools can be used but file writes go to staging. Full System is unrestricted. Implement these checks in the dispatch layer (`send()` in CommandPanel), NOT just in the UI.
5. **Token count is approximate.** Real GPT-4 tokenizer is closer to chars/3.5 for English, chars/2 for code. For UI hints "chars/4" is fine; for API budget, use a real tokenizer (tiktoken, gpt-tokenizer).
6. **The composer is NOT a replacement for the route system.** The ComposerInput wraps the route buttons. Plan mode → POSTs to `/api/llm/plan` (which has its own SSE stream). Chat mode → `/api/chat`. The composer is a UI layer on top of the existing route system, not a parallel system.

## Wired in production (2026-06-05)

- `app/components/composer/ComposerInput.tsx` (509 lines) — main component
- `app/components/composer/types.ts` — type system
- `app/components/composer/utils.ts` — uid/stamp/classifyRoute helpers
- `app/components/composer/index.ts` — barrel export
- `app/components/CommandPanel.tsx:2023-2061` — `<ComposerInput ... />` integration with full state
- `unified_api.js:composerContextHandler` — `/api/composer/context` backend
- `unified_api.js` — `/api/upload` (existing) for file attachments

## Composer's "Active Context" data model

```ts
type Attachment = {
  name: string;      // filename
  path: string;      // absolute path on disk
  kind: string;      // 'file' | 'image' | 'url' | 'clipboard' | 'audio' | 'video'
  size: number;      // bytes
  preview?: string;  // first ~600 chars for the context panel
  uploadedAt?: number;
};
type ContextItem = {
  kind: 'workspace' | 'agent' | 'skill' | 'memory' | 'model' | 'tool' | 'doc';
  label: string;
  detail?: string;
};
```

`activeContext: ContextItem[]` is computed by a `useMemo` from `attachments + workspace + memoryMode + enabledAgents + quickChips + provider + composerSpeed + intelligence + accessMode`. Whenever any input changes, the context strip updates. Estimated token count updates with it.

## When NOT to use this spec

- Internal CLI tooling (`purpclaw training status`, `purpclaw lora train`) — the composer is a UI surface, not a runtime architecture
- Telemetry dashboards — different surface, different needs
- Mobile / native shell apps — reimplement per platform, don't port the JSX

## How to extend without breaking the spec

1. **Add a new ComposerMode** to `types.ts` + `COMPOSER_MODES` array + `COLOR` map. The toolbar auto-renders the new pill.
2. **Add a new ContextItem kind** to `CONTEXT_ICONS` + `activeContext` builder in CommandPanel. The context strip auto-includes it.
3. **Add a new AgentId** to `AGENT_TOGGLES` + the tower spawn mapping. The agent bar auto-includes it.
4. **Add a new ProviderId** to `PROVIDERS` in `lib/llm-provider.js` + the dropdown. Auto-routed by model name.

Don't hardcode IDs in the JSX. The data structures are the source of truth.
