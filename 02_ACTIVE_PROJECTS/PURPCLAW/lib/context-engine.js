'use strict';

function estimateTokens(messages) {
  return messages.reduce((sum, message) => sum + Math.ceil(String(message.content || '').length / 4) + 8, 0);
}

function structuredSummary(messages) {
  const user = messages.filter(m => m.role === 'user').map(m => String(m.content || '')).filter(Boolean);
  const assistant = messages.filter(m => m.role === 'assistant').map(m => String(m.content || '')).filter(Boolean);
  const failures = messages.filter(m => m.status === 'failed' || m.error).map(m => m.error || m.content);
  const files = [...new Set(messages.flatMap(m => String(m.content || '').match(/(?:[A-Za-z]:\\|\.\/|\/)?[\w .-]+\.(?:js|ts|tsx|json|md|py|css|html|yaml|yml)/g) || []))].slice(0, 20);
  return [
    '[CONTEXT COMPACTION] Earlier turns were compacted.',
    '## Goal', user[0] || 'Continue the active conversation objective.',
    '## Constraints & Preferences', user.slice(1, 4).join('\n- ') || 'Preserve prior user constraints.',
    '## Progress', assistant.slice(-4).map(text => `- ${text.slice(0, 500)}`).join('\n') || '- No completed progress recorded.',
    '## Blocked', failures.length ? failures.slice(-3).map(text => `- ${String(text).slice(0, 500)}`).join('\n') : '- None recorded.',
    '## Relevant Files', files.length ? files.map(file => `- ${file}`).join('\n') : '- None recorded.',
    '## Next Steps', user[user.length - 1] || 'Resume from the latest protected turns.',
    '## Critical Context', `Compacted ${messages.length} messages deterministically; consult session search for verbatim history.`,
  ].join('\n\n');
}

class ContextEngine {
  constructor(options = {}) {
    // S5 — read threshold/length from env so operators can tune per session
    // without code changes. Default contextLength raised to 200k for modern
    // models; threshold lowered to 0.4 so we compact before the provider
    // rejects. Override with PURPCLAW_CTX_LENGTH / PURPCLAW_CTX_THRESHOLD.
    this.threshold = options.threshold
      ?? (process.env.PURPCLAW_CTX_THRESHOLD ? Number(process.env.PURPCLAW_CTX_THRESHOLD) : 0.4);
    this.contextLength = options.contextLength
      ?? (process.env.PURPCLAW_CTX_LENGTH ? Number(process.env.PURPCLAW_CTX_LENGTH) : 200_000);
    this.protectFirst = options.protectFirst ?? 3;
    this.protectLast = options.protectLast ?? 20;
  }
  shouldCompress(messages) { return messages.length >= 4 && estimateTokens(messages) >= this.contextLength * this.threshold; }
  compress(messages, options = {}) {
    if (messages.length <= this.protectFirst + this.protectLast) return { messages: [...messages], compressed: false, tokensBefore: estimateTokens(messages), tokensAfter: estimateTokens(messages) };
    const head = messages.slice(0, this.protectFirst);
    const tail = messages.slice(-this.protectLast);
    const middle = messages.slice(this.protectFirst, -this.protectLast).map(message => {
      if (message.role === 'tool' && String(message.content || '').length > 200) return { ...message, content: '[Old tool output cleared to save context space]' };
      return message;
    });
    const middleChars = middle.reduce((sum, message) => sum + String(message.content || '').length, 0);
    const summaryBudget = Math.max(200, Math.floor(middleChars * 0.4));
    const summary = String(options.summary || structuredSummary(middle)).slice(0, summaryBudget);
    const role = head[head.length - 1]?.role === 'assistant' ? 'user' : 'assistant';
    const result = [...head, { role, content: summary, status: 'compacted', compactedCount: middle.length }, ...tail];
    const tokensBefore = estimateTokens(messages), tokensAfter = estimateTokens(result);
    if (tokensAfter >= tokensBefore) return { messages: [...messages], compressed: false, reason: 'summary_not_smaller', tokensBefore, tokensAfter };
    return { messages: result, compressed: true, summary, compactedCount: middle.length, tokensBefore, tokensAfter };
  }
}

module.exports = { ContextEngine, estimateTokens, structuredSummary };
