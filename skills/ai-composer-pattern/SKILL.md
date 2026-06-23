---
name: ai-composer-pattern
description: "The 'command center disguised as a textbox' pattern for AI agent UIs. Ten integrated elements around the input — mode toggle, model control, access control, agent bar, workspace, memory, quick chips, attachments, send area, and the Active Context Panel showing exactly what will be sent. Used when building any AI composer / chat surface that needs to feel like an operating system, not a textbox. Reference: PURPCLAW Composer V1 spec (Ted/Eddie Cannon, 2026-06-05)."
when_to_use: "Designing or reviewing the input area of an AI agent UI; adding 'more than a chatbox' controls around a text input; evaluating whether your AI app is just a textbox or an actual command surface"
---

# AI Composer Pattern — the Command Center Disguised as a Textbox

> "Every AI chat app is slowly evolving into the same thing: a command center disguised as a textbox. The textbox isn't the product anymore. The controls around it are."
> — Ted Cannon, 2026-06-05

A single text input surrounded by visible, named, tappable controls. The user can see and adjust every dimension of what they're about to send *before* they hit send. No mystery meat.

## The 10 Required Elements

### 1. Attachment launcher (left side `+` button)
Three nested groups, each opens a flyout:
- **Attach** — files, folder, images, audio, video, URL, clipboard, recent files
- **Context** — workspace, project, document, saved context, @mention agent, @mention skill
- **Actions** — run action, search repo, web search, deep research, gen image / video / audio

The flyout stays in the same family as Claude's `+` menu, ChatGPT's attach sheet, and DeepSeek's action chips — but combines all three.

### 2. Mode toggle (visible, not hidden)
Four named states, segmented pill:
- ⚪ **Chat** — normal conversation
- 🔵 **Plan** — reasoning only, no tools, no execution
- 🔴 **Execute** — tools enabled, file writes, agent launches
- 🟣 **Swarm** — multi-agent orchestration, parallel agent bubbles visible

**Crucial: don't hide this behind a submenu.** Claude got it right. The user always knows what mode they're in.

### 3. Model control (Speed / Intelligence / Provider)
Three segmented controls, each a 3-4 step pill:
- **Speed**: ⚡ Fast / ⚡⚡ Balanced / ⚡⚡⚡ Deep
- **Intelligence**: 🟢 Low / 🟡 Medium / 🟠 High / 🔴 Extreme
- **Provider**: OpenAI / Claude / Gemini / DeepSeek / Kimi / Qwen / Local / **Auto**

Steal the intelligence-slider pattern. The user picks once per session and forgets about it; default to Auto and Balanced.

### 4. Access control (next to Send, always visible)
Four states, color-coded pill:
- 🟢 **Read Only** — read files, no writes
- 🟡 **Review** — propose changes, require user approval
- 🟠 **Agent Actions** — single-agent actions allowed
- 🔴 **Full System** — anything goes

The pill is always visible. Color-coded. Cannot be hidden. **"People should know what the AI is allowed to touch. Shocking concept in 2026."** — Ted.

### 5. Agent bar (above composer, toggleable)
A row of pill-buttons, each agent:
- Planner · Research · Builder · Security · Designer · Video · Audio · Custom

Tap to enable. Enabled agents become a *temporary swarm* for the next message. Disable after the message dispatches (or persist for the session — your call).

### 6. Workspace bar (instant context switch)
A dropdown showing the current workspace. Switching reloads `.env`, project root, recent files, memory scope. Common workspaces:
- `DreamForge` / `OmniCode` / `Gotham` / `OpenClaw` / `Current Folder` / `Custom Project`

Claude has Worktree. Go further — full project context.

### 7. Memory bar (Off / Session / Project / Persistent)
Radio group, 4 states. Always visible. The user can see exactly what memory level the next message will see. **No mystery meat AI** — show them.

### 8. Quick chips (horizontal row of small buttons)
Examples: Search · Think · Research · Code · Explain · Design · Debug · Write · Market · Legal · OSINT · Voice · Video · Image

Tappable. Multiple can be on at once. Each adds a different prompt-injection or routing rule.

### 9. Send button area (no wasted space)
The send row carries: 🎤 Voice · 📹 Screen Share · 🖥 Desktop Context · 📷 Camera · 🚀 Send · ■ Stop. All visible, all tappable. No hidden gestures.

### 10. Active Context Panel (above the textbox, collapsible)
**The differentiator.** Before the user hits send, they see:
- Attached files (chips with file paths, X to remove)
- Mentioned agents / skills (chips with role)
- Workspace header (`# Workspace: PURPCLAW`)
- Mode header (`# Mode: EXECUTE (tools enabled)`)
- Real token count, computed from actual content (`input + attachments + context / 4` heuristic)
- Warnings (file too big, secret pattern detected, >200k tokens)

The data comes from a real backend endpoint, e.g. `POST /api/composer/context` that:
- reads files from disk
- computes real token count per item
- builds the actual prompt that will be sent
- flags secret patterns defensively

## Implementation Notes

### Token count (real, not fakery)
```ts
const estimatedTokens = useMemo(() => {
  const attachmentChars = attachments.reduce((sum, a) =>
    sum + (a.preview?.length || 0) + a.name.length + a.path.length, 0);
  const contextChars = activeContext.reduce((sum, c) =>
    sum + c.label.length + (c.detail?.length || 0), 0);
  return Math.max(1, Math.ceil((input.length + attachmentChars + contextChars) / 4));
}, [activeContext, attachments, input]);
```
Don't show "estimated" — show the actual count. Re-compute on every input change.

### Real file content in context panel
```ts
// backend /api/composer/context
if (att.kind === 'file' && att.path) {
  const stat = fs.statSync(att.path);
  if (stat.size > 200_000) {
    item.content = fs.readFileSync(att.path, 'utf-8').slice(0, 200_000) + '\n\n[…truncated]';
    out.warnings.push({ kind: 'truncated', label: item.label, size: stat.size });
  } else {
    item.content = fs.readFileSync(att.path, 'utf-8');
  }
  item.tokens = composerTokenCount(item.content);
  if (/(sk-[A-Za-z0-9]{20,}|api[_-]?key["'\s:=]+[A-Za-z0-9]{20,})/i.test(item.content)) {
    item.secretWarning = true;
    out.warnings.push({ kind: 'secret', label: item.label });
  }
}
```
Detect secrets. Truncate huge files. Don't fake any of it.

### Type vocabulary (in `composer/types.ts`)
```ts
export type ComposerMode    = 'chat' | 'plan' | 'execute' | 'swarm';
export type AccessMode      = 'readOnly' | 'review' | 'agentActions' | 'fullSystem';
export type MemoryMode      = 'off' | 'session' | 'project' | 'persistent';
export type ComposerSpeed   = 'fast' | 'balanced' | 'deep';
export type IntelligenceLevel = 'low' | 'medium' | 'high' | 'extreme';
export type ProviderId      = 'auto' | 'openai' | 'claude' | 'gemini' | 'deepseek' | 'kimi' | 'qwen' | 'local';
export type WorkspaceId     = 'dreamforge' | 'omnicode' | 'gotham' | 'openclaw' | 'current' | 'custom';
export type AgentId         = 'planner' | 'researcher' | 'builder' | 'security' | 'designer' | 'video' | 'audio' | 'custom';
```

### The "where it lives" file structure
```
app/components/composer/
  types.ts        — all 10 type definitions
  utils.ts        — uid(), stamp(), classifyRoute(), helpers
  ComposerInput.tsx — the actual composer (~500 lines)
  index.ts        — barrel
```

Don't sprawl the composer logic across the main CommandPanel. Keep it self-contained.

## Anti-patterns (don't do these)

- **Hiding the mode toggle** behind a submenu (Claude's mistake early on)
- **Showing fake numbers** in the live visualizer (e.g. a sine wave, a `pulse animation infinite` on a center orb) — see `fakery-audit-protocol`
- **Streaming without progress** — the user should see "thinking…", then "🔍 found 5 files", then "🧠 proposing plan…", then tokens
- **Multiple agents with one bubble** — Swarm mode is supposed to show N bubbles in parallel
- **Provider dropdown that lies** — Auto should mean "best available", not "always the same model"
- **No active context preview** — the user shouldn't be surprised by what gets sent

## Where this is already implemented

- `app/components/composer/` — full PURPCLAW Composer V1 implementation
- `app/components/CommandPanel.tsx:1777-1781` — `estimatedTokens` useMemo
- `unified_api.js:248` — `composerContextHandler`
- `unified_api.js:2902-2910` — `/api/composer/context` route

## See also

- `references/composer-v1-spec.md` — Ted's original spec (verbatim, with rationale per element)
- `references/anti-fakery-audit.md` — protocol for verifying every UI number traces to a real source
- `sse-streaming-pattern` — for the streaming UX underneath the composer
