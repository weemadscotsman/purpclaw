// ─── Composer V1 — Utility functions ─────────────────────────────────────────
// Extracted from CommandPanel.tsx to keep the composer self-contained.

import type { Route } from './types';

/** Generate a short random ID */
export function uid() {
  return Math.random().toString(36).slice(2, 9);
}

/** Timestamp in HH:MM:SS format */
export function stamp() {
  return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/** Truncate text to max chars */
export function compact(value: unknown, max = 64) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/**
 * Auto-router: pick the right route from what the user actually typed.
 * Order matters — most specific intent wins.
 *
 * v2.1 — chat-first. Casual messages ALWAYS route to chat. The selected
 * composer mode / agents / chips only set the metadata/context, they
 * never replace the primary route. Kernel/swarm is reserved for actual
 * build/fix/research tasks, not for "are you still there?" or "yo".
 */
export function classifyRoute(text: string, composerMode?: string): Route {
  const t = text.toLowerCase();

  // ── 1. Conversational signals — these ALWAYS win, regardless of mode ──
  // Short messages, greetings, check-ins, "are you there" — all chat.
  if (!t.trim()) return 'chat';
  const trimmed = t.trim();
  if (trimmed.length <= 8) {
    // Tiny messages: "yo", "hi", "ok", "lol", "yes", "no", "thanks", "fyi"
    return 'chat';
  }
  if (/^(yo|hi|hey|hello|ok|okay|lol|thx|thanks|ty|fyi|gg|nice|good|great|sorry|please|please|br|bruh|bro|fam)[.!?,]?$/.test(trimmed)) {
    return 'chat';
  }
  // Phrases that are conversational even with verbs ("read me the room")
  if (/^(are you (still )?there|you (still )?there|you good|what happened|what('s| is) up|status check|how('s| is) it going|how (are )?you|any update|what do you think|thoughts|opinions?|are you (ok|okay|alright)|is (this|that|it) (ok|okay|alright|broken|done)\??)\??$/.test(trimmed)) {
    return 'chat';
  }
  // Phrases that LOOK like kernel commands but are actually questions
  // ("read me X" is a request to read out loud, not to spawn a job)
  if (/\?$/.test(trimmed) && trimmed.length < 60) {
    return 'chat';
  }
  // No tool / no work indicator + short message → chat.
  // v2.1 (Phase 3): include restore|recover|rebuild|research|debug in
  // hasWorkIntent so they reach the kernel/swarm overrides below. Without
  // this, "restore the legacy UI" exits at the "short chat" rule before
  // ever hitting the tech-target gate.
  const hasWorkIntent = /\b(make|build|create|write|fix|patch|refactor|implement|deploy|ship|run|test|debug|audit|search|find|fetch|grep|read|scan|list|show|trace|investigate|explore|examine|map|plan|publish|install|configure|set up|wire|integrate|restore|recover|rebuild|reset|revive|research|deep[- ]?dive)\b/.test(t);
  if (!hasWorkIntent) {
    // Question mark + no work verb → chat
    if (/\?$/.test(trimmed)) return 'chat';
    // Greeting + "thanks/ty" + "ok" patterns + short conversational endings
    if (trimmed.length < 30) return 'chat';
  }

  // ── 2. From here on, we have work intent. Composer mode + intent decide route. ──

  const selfTarget = /\b(your|ur|my|the|its|this|all)\b[\s\S]{0,30}\b(files?|code|codebase|stack|repo(sitory)?|systems?|module|service|directory|folder|logs?|brains?|body)\b/.test(t);
  const actionVerb = /\b(look (into|at|through)|go (look|check|find|read|learn|explore|dig|see)|inspect|read|scan|explore|examine|go through|learn about|map( out)?|trace|review|analy[sz]e|check( out)?|dig into|investigate|understand|audit)\b/.test(t);

  // ── 3. Specific overrides — kernel/swarm/mission/groupchat/research ──
  // v2.1 (Phase 3): Demote restore|research|build|debug|fix|patch|audit to
  // kernel ONLY when they target real artifacts (ui/system/server/etc.).
  // Casual "research the meaning", "build me a sandwich", "restore my faith"
  // must stay chat. Only "restore the legacy UI" / "build the dashboard"
  // should go to kernel.
  if (/\b(group ?chat|ask the (models|room)|debate|panel|consensus|poll the models|what do the models)\b/.test(t)) return 'groupchat';
  if (/\b(swarm|whole team|all (the )?agents|divide and conquer|parallel(ize)?|multi[- ]?agent)\b/.test(t)) return 'swarm';
  // Mission-trace explicit phrases still go kernel (BEFORE generic mission)
  if (/\b(mission[- ]?trace|trace the mission|trace the kernel|trace the swarm|trace the (chat|route))\b/.test(t)) return 'kernel';
  if (/\b(mission|orchestrate|end[- ]to[- ]end|full build|ship it|release)\b/.test(t)) return 'mission';
  // Tech-target detector: must reference a real artifact (system, ui, server,
  // file, route, etc.) for a restore/build/research to count as kernel/research.
  // v2.1 (Phase 3 final): NO verbs in this list. "build me a sandwich" has no
  // artifact target — it's casual. Only NOUNS go here (system, ui, server,
  // file, route, model, dashboard, etc.). Verbs live in their own override rules.
  const techTarget = /(?<![\w-])(ui|system|server|stack|app|page|route|api|database|cache|state|version|config|service|backup|file|files|module|library|project|cockpit|swarm|kernel|spine|dashboard|component|lens|tab|menu|nav|provider|providers|model|key|env|prompt|train|migration|legacy|missing|broken|dead|stuck|crash|loop|chat|login|auth|webhook|job)(?![\w-])/.test(t);
  // Kernel: build|fix|patch|debug|audit + tech target (e.g. "fix the bug in
  // the auth route", "audit the providers", "debug the chat"). Casual usages
  // like "fix me a coffee" or "patch me through" stay chat.
  if (techTarget && /\b(implement|fix|refactor|create|add (a |the )?feature|write (the )?code|audit|debug|wire|patch|optimi[sz]e|migrate|deploy|ship)\b/.test(t)) return 'kernel';
  // Restore|recover|revive|rebuild + tech target = kernel (only when there's
  // something concrete to restore — "restore the legacy UI" qualifies, but
  // "restore my faith in humanity" doesn't).
  if (techTarget && /\b(restore|recover|revive|rebuild|reset|reinstall|redeploy|recreate)\b/.test(t)) return 'kernel';
  // Build alone needs a tech target too: "build me a sandwich" = chat,
  // "build the dashboard" = kernel.
  if (techTarget && /\bbuild\b/.test(t)) return 'kernel';
  // Research: only when there's a tech/research target, not casual "research
  // the meaning of life" or "what's the research on".
  if (techTarget && /\b(research|look ?up|find out|sources?|cite|latest on|news on|deep[- ]?dive)\b/.test(t)) return 'research';
  // "read me X" / "show me X" / "tell me X" — conversational, not kernel
  if (/^(read|show|tell) (me|us)\b/.test(trimmed)) return 'chat';
  // "run X" alone is conversational, not a kernel job (chat can describe what it sees)
  if (/^run\b/.test(trimmed) && trimmed.split(/\s+/).length <= 4) return 'chat';
  // "look at X" / "see X" — also conversational, the user wants a description
  if (/^(look|see|show|tell|read)\b[\s\S]{0,8}\b(at|me|us|if|whether|why|how|what)\b/.test(trimmed)) return 'chat';

  // ── 4. actionVerb fallback — but ONLY if the user explicitly chose ──
  // "execute" composer mode. The bottom options can SUGGEST delegation,
  // not force it. A casual "look at this" is still chat.
  if (actionVerb && composerMode === 'execute') return 'kernel';
  if (actionVerb && composerMode === 'swarm') return 'swarm';

  // ── 5. Default: chat. Always chat. ──
  return 'chat';
}
