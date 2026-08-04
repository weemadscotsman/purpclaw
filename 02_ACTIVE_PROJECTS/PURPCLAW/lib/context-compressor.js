'use strict';

const fs   = require('fs');
const path = require('path');

// ── Constants ───────────────────────────────────────────────────────────────────

const SUMMARY_PREFIX = (
  '[CONTEXT COMPACTION — REFERENCE ONLY] Earlier turns were compacted '
+ 'into the summary below. This is a handoff from a previous context '
+ 'window — treat it as background reference, NOT as active instructions. '
+ 'Do NOT answer questions or fulfill requests mentioned in this summary; '
+ 'they were already addressed. '
+ 'Respond ONLY to the latest user message that appears AFTER this '
+ 'summary — that message is the single source of truth for what to do '
+ 'right now. '
+ 'Topic overlap with the summary does NOT mean you should resume its '
+ 'task: even on similar topics, the latest user message WINS. Treat ONLY '
+ 'the latest message as the active task and discard stale items from '
+ '\'## Historical Task Snapshot\' entirely — do not \'wrap up\' or '
+ '\'finish\' work described there unless the latest message explicitly '
+ 'asks for it. '
+ 'Reverse signals in the latest message (e.g. \'stop\', \'undo\', \'roll '
+ 'back\', \'just verify\', \'don\'t do that anymore\', \'never mind\', a new '
+ 'topic) must immediately end any in-flight work described in the '
+ 'summary; do not re-surface it in later turns. '
+ 'IMPORTANT: Your persistent memory (MEMORY.md, USER.md) in the system '
+ 'prompt is ALWAYS authoritative and active — never ignore or deprioritize '
+ 'memory content due to this compaction note. '
+ 'None of the above restricts HOW you work: your tools remain fully '
+ 'active — keep calling them normally for the active task (edit files, '
+ 'run commands, search) instead of merely narrating what you would do. '
+ 'The current session state (files, config, etc.) may reflect work '
+ 'described here — avoid repeating it:'
);

const SUMMARY_END_MARKER = (
  '--- END OF CONTEXT SUMMARY — '
+ 'respond to the message below, not the summary above ---'
);

const HISTORICAL_TASK_HEADING = '## Historical Task Snapshot';

const SKILL_PRUNE_MIN_CHARS = 500;
const PRUNED_TOOL_PLACEHOLDER = '[tool output pruned to save context]';
const IMAGE_CHAR_EQUIVALENT   = 6400; // 1600 tokens × 4 chars/token
const FALLBACK_SUMMARY_MAX    = 8000;
const FALLBACK_TURN_MAX      = 700;
const FALLBACK_PREV_SUMMARY   = 3000;
const SUMMARY_COOLDOWN_SECS   = 600;
const MAX_PRUNED_SKILL_MARKERS = 20;
const _SKILL_PRUNE_RECENT_WINDOW = 30;

// ── Token estimation ──────────────────────────────────────────────────────────

function estimateTokens(str) {
  return Math.ceil((str || '').length / 4) + 8;
}

function estimateMessagesTokens(messages) {
  return messages.reduce((sum, m) => {
    let c = '';
    if (typeof m.content === 'string') c = m.content;
    else if (Array.isArray(m.content))   c = m.content.map(p => p.text || '').join(' ');
    let chars = m.role === 'tool' ? c.length + IMAGE_CHAR_EQUIVALENT : c.length;
    return sum + estimateTokens(c) + (m.tool_calls ? 60 : 0);
  }, 0);
}

// ── Tool result summarisation ───────────────────────────────────────────────

function summarizeToolResult(toolName, toolArgs, content) {
  if (!content || typeof content !== 'string') return content;
  if (content.length <= 200) return content;
  const args = _safeJsonParse(toolArgs || '');
  const cLen = content.length;

  if (toolName === 'read_file' || toolName === 'readFile') {
    const p = args.path || args.path || '';
    return `[read_file] ${p} (${cLen.toLocaleString()} chars)`;
  }
  if (toolName === 'patch' || toolName === 'write_file') {
    const p = args.path || '';
    return `[${toolName}] ${p} (${cLen.toLocaleString()} chars)`;
  }
  if (toolName === 'terminal' || toolName === 'bash') {
    const cmd = args.command || args.cmd || '';
    const trimmed = cmd.length > 80 ? cmd.slice(0, 77) + '...' : cmd;
    const lines = (content.match(/\n/g) || []).length + 1;
    return `[terminal] \`${trimmed}\` (${lines} lines, exit=${_exitCode(content)})`;
  }
  if (toolName === 'search_files' || toolName === 'grep' || toolName === 'rg') {
    const pat = args.pattern || args.regex || '';
    const matches = (content.match(/\n/g) || []).length;
    return `[search] pattern='${pat}' (${matches} matches)`;
  }
  if (toolName === 'browser_navigate' || toolName === 'browser_click' ||
      toolName === 'browser_vision') {
    const url = args.url || args.ref || '';
    return `[${toolName}]${url ? ' ' + url : ''} (${cLen.toLocaleString()} chars)`;
  }
  if (toolName === 'web_search') {
    const q = args.query || '';
    return `[web_search] query='${q}' (${cLen.toLocaleString()} chars result)`;
  }
  if (toolName === 'web_extract') {
    const urls = Array.isArray(args.urls) ? args.urls : [];
    const first = typeof urls[0] === 'string' ? urls[0] : urls[0]?.url || '?';
    return `[web_extract] ${first}${urls.length > 1 ? ` (+${urls.length - 1} more)` : ''} (${cLen.toLocaleString()} chars)`;
  }
  if (toolName === 'delegate_task') {
    const goal = args.goal || '';
    return `[delegate_task] '${goal.slice(0, 60)}${goal.length > 60 ? '...' : ''}' (${cLen.toLocaleString()} chars result)`;
  }
  if (toolName === 'execute_code' || toolName === 'runPython') {
    const code = args.code || '';
    const lines = (code.match(/\n/g) || []).length + 1;
    const preview = code.replace(/\n/g, ' ').slice(0, 60);
    return `[execute_code] \`${preview}...\` (${lines} lines)`;
  }
  if (toolName === 'skill_view') {
    const nm = args.name || '?';
    return `[skill_view] name=${nm} (${cLen.toLocaleString()} chars) [SKILL_PRUNED: reload with skill_view('${nm}')]`;
  }
  if (toolName === 'skills_list' || toolName === 'skill_manage') {
    const nm = args.name || '?';
    return `[${toolName}] name=${nm} (${cLen.toLocaleString()} chars)`;
  }
  if (toolName === 'vision_analyze') {
    const q = (args.question || '').slice(0, 50);
    return `[vision_analyze] '${q}' (${cLen.toLocaleString()} chars)`;
  }
  if (toolName === 'text_to_speech') {
    return `[text_to_speech] generated audio (${cLen.toLocaleString()} chars)`;
  }
  if (toolName === 'cronjob') {
    return `[cronjob] ${args.action || '?'}`;
  }
  // generic
  const firstVals = Object.entries(args || {})
    .slice(0, 2)
    .map(([k, v]) => ` ${k}=${String(v).slice(0, 40)}`)
    .join('');
  return `[${toolName}]${firstVals} (${cLen.toLocaleString()} chars result)`;
}

function _exitCode(output) {
  const m = output.match(/\b(exit[ _]?code|return[ _]?code)[=:]\s*(-?\d+)/i);
  if (m) return m[2];
  if (/signal|SIGTERM|SIGKILL/i.test(output)) return 'signal';
  if (/error|failed|exception/i.test(output)) return 'err';
  return '0';
}

function _safeJsonParse(str) {
  try { return JSON.parse(str); } catch { return {}; }
}

// ── Skill protection helpers ─────────────────────────────────────────────────

function collectSkillViewSites(messages) {
  const sites = [];
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role !== 'assistant') continue;
    const calls = msg.tool_calls || [];
    for (const tc of calls) {
      if (!tc.function) continue;
      const fn = tc.function;
      const args = _safeJsonParse(fn.arguments || '');
      if (fn.name === 'skill_view' && args.name) sites.push([i, args.name]);
    }
  }
  return sites;
}

function collectProtectedSkills(messages, pruneBoundary) {
  const total = messages.length;
  if (!total) return new Set();
  const recentStart = Math.max(0, total - _SKILL_PRUNE_RECENT_WINDOW);
  const tailStart   = Math.max(0, pruneBoundary);
  const tailTexts   = messages.slice(tailStart)
    .filter(m => m.role === 'user')
    .map(m => (typeof m.content === 'string' ? m.content : '').toLowerCase());

  const protectedSkills = new Set();
  for (const [idx, skill] of collectSkillViewSites(messages)) {
    const key = skill.toLowerCase();
    if (idx >= recentStart || idx >= tailStart) {
      protectedSkills.add(key);
    } else if (tailTexts.some(t => t.includes(key))) {
      protectedSkills.add(key);
    }
  }
  return protectedSkills;
}

function collectGhostedSkillNames(messages) {
  const names = new Set();
  const re = /\[SKILL_PRUNED:\s*reload\s+with\s+skill_view\(['"]([^'"]+)['"]\)\]/gi;
  for (const msg of messages) {
    const c = typeof msg.content === 'string' ? msg.content : '';
    let m;
    while ((m = re.exec(c)) !== null) names.add(m[1].toLowerCase());
    re.lastIndex = 0;
  }
  return [...names];
}

// ── Message serialisation for LLM summarisation ──────────────────────────────

function serializeForSummary(messages) {
  const lines = [];
  for (const msg of messages) {
    const role = msg.role;
    let content = msg.content;
    if (Array.isArray(content)) {
      content = content.map(p => p.text || '').filter(Boolean).join(' ');
    }
    if (!content) continue;
    const tcCount = (msg.tool_calls || []).length;
    const toolId = msg.tool_call_id || '';
    if (role === 'tool') {
      const name = msg.name || 'tool';
      const toolOutput = content.length > 1000
        ? content.slice(0, 997) + '...'
        : content;
      lines.push(`[TOOL:${name} id=${toolId || '?'}]\n${toolOutput}`);
    } else if (tcCount > 0) {
      const names = (msg.tool_calls || [])
        .map(tc => tc.function?.name || 'unknown')
        .join(', ');
      lines.push(`[ASSISTANT: called ${names}]\n${content.slice(0, 2000)}`);
    } else {
      lines.push(`[${role.toUpperCase()}]\n${content.slice(0, 3000)}`);
    }
    lines.push('─'.repeat(60));
  }
  return lines.join('\n');
}

function truncateMiddle(text, headChars, tailChars) {
  if (text.length <= headChars + tailChars + 50) return text;
  return text.slice(0, headChars) + '\n...[truncated]...\n' + text.slice(-tailChars);
}

// ── ContextCompressor class ─────────────────────────────────────────────────

class ContextCompressor {
  /**
   * options:
   *   contextLength     — model context window (default 200 000)
   *   threshold        — fraction of contextLength to trigger compression (default 0.75)
   *   protectFirst     — keep first N non-system messages verbatim (default 3)
   *   protectLast      — keep last N messages verbatim (default 20)
   *   summaryModel     — model name for LLM summarisation (default auto-detect)
   *   provider         — LLM provider name
   *   llmProvider      — pre-configured LLM provider instance (optional, overrides provider/model)
   */
  constructor(options = {}) {
    this.contextLength   = options.contextLength   || 200_000;
    this.threshold       = options.threshold         ?? 0.75;
    this.protectFirst    = options.protectFirst     ?? 3;
    this.protectLast     = options.protectLast      ?? 20;
    this.summaryModel    = options.summaryModel     || '';
    this.provider        = options.provider         || '';
    this._llm           = options.llmProvider      || null;

    // Derived
    this.thresholdTokens = Math.floor(this.contextLength * this.threshold);

    // State
    this._previousSummary        = null;
    this._summaryHasUserTurn     = null;
    this._compressionCount       = 0;
    this._lastCompressAborted    = false;
    this._lastSummaryDropped     = 0;
    this._lastSummaryFallback    = false;
    this._lastSummaryError       = null;
    this._cooldownUntil          = 0;
    this._ineffectiveCount       = 0;
    this._contextProbed          = false;
    this._summaryFailureCooldown = 0;

    // Counters read by agent-loop
    this.lastPromptTokens     = 0;
    this.lastCompletionTokens = 0;
    this.lastTotalTokens      = 0;
    this.compression_count    = 0;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  shouldCompress(messages) {
    return estimateMessagesTokens(messages) >= this.thresholdTokens;
  }

  updateFromResponse(usage) {
    // usage: { prompt_tokens, completion_tokens, total_tokens, ... }
    this.lastPromptTokens     = usage.prompt_tokens     || usage.input_tokens     || 0;
    this.lastCompletionTokens = usage.completion_tokens || usage.output_tokens   || 0;
    this.lastTotalTokens     = usage.total_tokens      ||
      (this.lastPromptTokens + this.lastCompletionTokens);
    // Cooldown tracking
    if (usage.total_tokens === 0 && this._compressionCount > 0) {
      this._ineffectiveCount++;
    } else {
      this._ineffectiveCount = 0;
    }
  }

  /**
   * Compress a messages array (async — calls LLM for summarisation).
   * Returns { messages, compressed, tokensBefore, tokensAfter, summary }
   */
  async compress(messages, options = {}) {
    const {
      force       = false,
      focusTopic  = '',
      memoryCtx   = '',
    } = options;

    this._lastCompressAborted = false;
    this._lastSummaryDropped   = 0;
    this._lastSummaryFallback  = false;
    this._lastSummaryError     = null;

    if (messages.length <= this.protectFirst + this.protectLast) {
      return {
        messages,
        compressed:    false,
        tokensBefore:  estimateMessagesTokens(messages),
        tokensAfter:   estimateMessagesTokens(messages),
        summary:       null,
      };
    }

    const tokensBefore = estimateMessagesTokens(messages);
    const head        = messages.slice(0, this.protectFirst);
    const tail        = messages.slice(-this.protectLast);
    const middle      = messages.slice(this.protectFirst, -this.protectLast);

    // ── Phase 1: deduplicate identical tool results ─────────────────────────
    const deduped = _deduplicateToolResults([...middle]);

    // ── Phase 2: build call_id → tool_name map ─────────────────────────────
    const callIdMap = {};
    for (const msg of messages) {
      if (!msg.tool_calls) continue;
      for (const tc of msg.tool_calls || []) {
        if (tc.id) callIdMap[tc.id] = tc.function?.name || 'unknown';
      }
    }

    // ── Phase 3: prune boundary ─────────────────────────────────────────────
    const pruneBoundary    = this.protectFirst;
    const protectedSkills = collectProtectedSkills(messages, pruneBoundary);

    // ── Phase 4: prune / summarise tool results ──────────────────────────────
    const pruned = [];
    let prunedCount = 0;
    for (let i = 0; i < deduped.length; i++) {
      const msg = deduped[i];
      if (msg.role !== 'tool') { pruned.push(msg); continue; }

      let content = msg.content || '';
      if (Array.isArray(content)) {
        // strip images
        content = content.map(p => p.text || '').join(' ');
      }
      if (!content || typeof content !== 'string') { pruned.push(msg); continue; }

      // already summarised
      if (content.startsWith('[Duplicate tool output')) { pruned.push(msg); continue; }
      if (content.startsWith('[screenshot removed'))    { pruned.push(msg); continue; }
      if (/^\[.*\d+ chars\)$/.test(content) && content.length < 400) {
        pruned.push(msg); continue;
      }

      const callId   = msg.tool_call_id || '';
      const toolName = callIdMap[callId] || 'tool';

      // skill_view — respect protection
      if (toolName === 'skill_view' && content.length > SKILL_PRUNE_MIN_CHARS) {
        const args    = _safeJsonParse(msg.function?.arguments || '');
        const nm     = (args.name || '').toLowerCase();
        if (protectedSkills.has(nm)) {
          pruned.push(msg); continue;
        }
      }

      if (content.length <= 200) { pruned.push(msg); continue; }

      const summary = summarizeToolResult(toolName, msg.function?.arguments || '', content);
      pruned.push({ ...msg, content: summary });
      prunedCount++;
    }

    // ── Phase 5: build summary ───────────────────────────────────────────────
    const middleMsgs = pruned;
    let summaryText  = '';

    // Check cooldown
    const now = Date.now() / 1000;
    const onCooldown = this._cooldownUntil > now;

    if (!force && onCooldown) {
      // Skip compression on cooldown — return original
      return {
        messages,
        compressed:    false,
        tokensBefore,
        tokensAfter:   tokensBefore,
        summary:       null,
        reason:        'summary_cooldown',
      };
    }

    try {
      summaryText = this._llmSummarize(middleMsgs, {
        focusTopic,
        memoryCtx,
        tokensBefore,
      });
      this._lastSummaryFallback = false;
    } catch (err) {
      this._lastSummaryError = err.message || String(err);
      this._cooldownUntil     = Date.now() / 1000 + SUMMARY_COOLDOWN_SECS;
      summaryText = this._fallbackSummary(middleMsgs);
      this._lastSummaryFallback = true;
    }

    // Build role-satisfying wrapper message
    const wrapRole = head[head.length - 1]?.role === 'assistant' ? 'user' : 'assistant';
    const summaryMsg = {
      role:    wrapRole,
      content: SUMMARY_PREFIX + '\n\n' + summaryText + '\n\n' + SUMMARY_END_MARKER,
      status:  'compacted',
      _compressed_summary: true,
    };

    const result = [...head, summaryMsg, ...tail];
    const tokensAfter = estimateMessagesTokens(result);

    // Anti-thrashing: if compression didn't actually shrink, abort
    if (tokensAfter >= tokensBefore) {
      return {
        messages,
        compressed:    false,
        tokensBefore,
        tokensAfter:   tokensBefore,
        summary:       null,
        reason:        'summary_not_smaller',
      };
    }

    this._previousSummary = summaryText;
    this.compression_count++;
    this._compressionCount++;

    return {
      messages:      result,
      compressed:    true,
      tokensBefore,
      tokensAfter,
      summary:       summaryText,
      compactedCount: middleMsgs.length,
      prunedCount,
      usedFallback:   this._lastSummaryFallback,
    };
  }

  // ── LLM summarisation ──────────────────────────────────────────────────────

  async _llmSummarize(messages, { focusTopic, memoryCtx, tokensBefore }) {
    // Lazy-load the LLM provider
    if (!this._llm) {
      try {
        this._llm = require('./llm-provider');
      } catch {
        throw new Error('llm-provider not available');
      }
    }

    const summaryBudget = this._computeSummaryBudget(messages, tokensBefore);
    const serialized    = serializeForSummary(messages);
    const today         = new Date().toISOString().slice(0, 10);

    // Memory section
    let memSection = '';
    if (memoryCtx && memoryCtx.trim()) {
      const sanitized = memoryCtx.slice(0, 6000);
      memSection = `\n\nMEMORY PROVIDER CONTEXT:\n<memory-provider-context>\n${JSON.stringify(sanitized)}\n</memory-provider-context>`;
    }

    const hasUserTurn = messages.some(m => m.role === 'user');

    const preamble = (
      'You are a context compaction summariser. Write a structured checkpoint summary. '
    + 'Be CONCRETE — include file paths, command outputs, error messages, line numbers, '
    + 'and specific values. Target ~' + summaryBudget + ' tokens.'
    );

    let prompt;
    if (this._previousSummary) {
      const boundedPrev = this._previousSummary.slice(0, FALLBACK_PREV_SUMMARY);
      prompt = (
        preamble + '\n\n' +
        'You are updating a context compaction summary. A previous compaction produced the summary below. ' +
        'New conversation turns have occurred since then and need to be incorporated.\n\n' +
        'PREVIOUS SUMMARY:\n' + boundedPrev + '\n\n' +
        'NEW TURNS TO INCORPORATE:\n' + serialized.slice(0, 15000) + memSection + '\n\n' +
        'Update the summary using this exact structure. PRESERVE all existing information that is still relevant. ' +
        'ADD new completed actions to the numbered list. Update "Active State". ' +
        'CRITICAL: Update "## Active Task" to reflect the user\'s most recent unfulfilled input.\n\n' +
        _template({ budget: summaryBudget, today, hasUserTurn, isUpdate: true })
      );
    } else {
      prompt = (
        preamble + '\n\n' +
        'Create a structured checkpoint summary for the conversation after earlier turns are compacted.\n\n' +
        'TURNS TO SUMMARIZE:\n' + serialized.slice(0, 15000) + memSection + '\n\n' +
        _template({ budget: summaryBudget, today, hasUserTurn, isUpdate: false })
      );
    }

    // Call the LLM
    let response;
    const model = this.summaryModel || 'auto';

    try {
      if (typeof this._llm.chat === 'function') {
        // Standard PURPCLAW LLM provider
        response = await this._llm.chat({
          messages: [{ role: 'user', content: prompt }],
          model,
          maxTokens: Math.min(summaryBudget + 200, 4000),
          temperature: 0.3,
        });
        return typeof response === 'string'
          ? response
          : (response.content || response.text || JSON.stringify(response));
      } else if (typeof this._llm.complete === 'function') {
        response = await this._llm.complete({ prompt, model, maxTokens: Math.min(summaryBudget + 200, 4000) });
        return typeof response === 'string' ? response : (response.content || response.text || JSON.stringify(response));
      } else {
        throw new Error('LLM provider has no chat() or complete() method');
      }
    } catch (err) {
      // If the LLM call itself failed (network, auth, etc.)
      throw new Error('LLM summary call failed: ' + (err.message || String(err)));
    }
  }

  _computeSummaryBudget(messages, tokensBefore) {
    // Budget = 5 % of context length, capped at 10 K tokens
    const budget = Math.floor(this.contextLength * 0.05);
    const cap    = 10_000;
    // Scale down proportionally if content is small
    const scaleDown = Math.min(1, tokensBefore / this.contextLength);
    return Math.floor(Math.min(budget, cap) * scaleDown);
  }

  // ── Deterministic fallback ─────────────────────────────────────────────────

  _fallbackSummary(messages) {
    const userMsgs     = messages.filter(m => m.role === 'user').map(m => {
      const c = typeof m.content === 'string' ? m.content : '';
      return c.slice(0, FALLBACK_TURN_MAX);
    });
    const assistantMsgs = messages.filter(m => m.role === 'assistant').map(m => {
      const c = typeof m.content === 'string' ? m.content : '';
      return c.slice(0, FALLBACK_TURN_MAX);
    });
    const toolMsgs = messages.filter(m => m.role === 'tool').map(m => {
      const c = typeof m.content === 'string' ? m.content : '';
      return c.slice(0, 300);
    });

    const blockers = toolMsgs.filter(c => /error|failed|exception|timeout/i.test(c));
    const files    = [...new Set(
      messages.flatMap(m => {
        const c = typeof m.content === 'string' ? m.content : '';
        return (c.match(/(?:[A-Za-z]:\\|\.?\.?\/|~|\/)[^\s'"]+\.(?:js|ts|tsx|json|md|py|css|html|yaml|yml)/g) || []);
      })
    )].slice(0, 12);

    const today = new Date().toISOString().slice(0, 10);

    let body = (
      HISTORICAL_TASK_HEADING + '\n' +
      (userMsgs.length
        ? `User asked: ${userMsgs[userMsgs.length - 1]}`
        : 'No user-authored turns in compacted window.') + '\n\n' +
      '## Goal\n' +
      (userMsgs[0] || 'Continue the active conversation.') + '\n\n' +
      '## Completed Actions\n' +
      (assistantMsgs.length
        ? assistantMsgs.slice(-4).map((a, i) => `${i + 1}. ${a}`).join('\n')
        : 'None recorded.') + '\n\n' +
      '## Active State\n' +
      'Unknown from deterministic fallback. Inspect current repository state.\n\n' +
      '## Blocked\n' +
      (blockers.length
        ? blockers.slice(0, 5).map(b => `- ${b.slice(0, 500)}`).join('\n')
        : '- None recorded.') + '\n\n' +
      '## Relevant Files\n' +
      (files.length
        ? files.map(f => `- ${f}`).join('\n')
        : '- None recorded.') + '\n\n' +
      '## Critical Context\n' +
      `Deterministic fallback for ${messages.length} compacted message(s). ` +
      'Summary generation was unavailable — inspect current files for exact state. ' +
      `Date: ${today}.`
    );

    // Add ghosted skill markers
    const ghosted = collectGhostedSkillNames(messages).slice(0, MAX_PRUNED_SKILL_MARKERS);
    if (ghosted.length > 0) {
      body += '\n\n## Pruned Skills\n' +
        ghosted.map(n => `[SKILL_PRUNED: reload with skill_view('${n}')]`).join('\n');
    }

    if (body.length > FALLBACK_SUMMARY_MAX) {
      body = body.slice(0, FALLBACK_SUMMARY_MAX - 42) + '\n...[fallback summary truncated]';
    }

    return body;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function _deduplicateToolResults(messages) {
  const hashes = {};
  const result = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== 'tool') { result.unshift(msg); continue; }
    let content = msg.content || '';
    if (Array.isArray(content)) content = content.map(p => p.text || '').join(' ');
    if (typeof content !== 'string' || content.length < 200) { result.unshift(msg); continue; }
    const h = require('crypto').createHash('md5').update(content).digest('hex').slice(0, 12);
    if (hashes[h] !== undefined) {
      // older duplicate — replace
      result.unshift({ ...msg, content: '[Duplicate tool output — same content as a more recent call]' });
    } else {
      hashes[h] = i;
      result.unshift(msg);
    }
  }
  return result;
}

function _template({ budget, today, hasUserTurn, isUpdate }) {
  const temporalRule = hasUserTurn
    ? `\nTEMPORAL ANCHORING: Current date is ${today}. ` +
      `Phrase completed actions as past-tense facts. Never invent dates for unstarted work.`
    : '';

  const histTask = isUpdate
    ? '[THE SINGLE MOST IMPORTANT FIELD. Update "## Active Task" to reflect the user\'s most recent unfulfilled input.]'
    : '[Capture the user\'s most recent unfulfilled input verbatim — include questions, decisions, ongoing tasks.]';

  return (
    `## Historical Task Snapshot\n${histTask}\n\n` +
    '## Goal\n[What the user is trying to accomplish overall]\n\n' +
    '## Constraints & Preferences\n[User preferences, coding style, constraints, key decisions]\n\n' +
    '## Completed Actions\n[Numbered list — include tool, target, and outcome. Example:\n' +
    '1. READ config.py — found `==` should be `!=`\n' +
    '2. PATCH config.py — changed `==` to `!=`]\n\n' +
    '## Active State\n[Current state — working dir, modified files, test status, running processes]\n\n' +
    '## Blocked\n[Any blockers, errors, or unresolved issues — include exact error messages]\n\n' +
    '## Key Decisions\n[Important decisions and WHY they were made]\n\n' +
    '## Resolved Questions\n[Questions already answered — include the answer so it is not repeated]\n\n' +
    '## Relevant Files\n[Files read, modified, or created — with brief note on each]\n\n' +
    '## Critical Context\n[Specific values, error messages, config details that would be lost without preservation. Never include API keys — write [REDACTED].]' +
    temporalRule + '\n\n' +
    `Target ~${budget} tokens. Be concrete — include paths, line numbers, exact outputs.`
  );
}

// ── Exports ──────────────────────────────────────────────────────────────────

module.exports = { ContextCompressor, estimateTokens, estimateMessagesTokens };
