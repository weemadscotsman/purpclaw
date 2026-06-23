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
 */
export function classifyRoute(text: string): Route {
  const t = text.toLowerCase();

  const selfTarget = /\b(your|ur|my|the|its|this|all)\b[\s\S]{0,30}\b(files?|code|codebase|stack|repo(sitory)?|systems?|module|service|directory|folder|logs?|brains?|body)\b/.test(t);
  const actionVerb = /\b(look (into|at|through)|go (look|check|find|read|learn|explore|dig|see)|inspect|read|scan|explore|examine|go through|learn about|map( out)?|trace|review|analy[sz]e|check( out)?|dig into|investigate|understand|audit)\b/.test(t);

  if (selfTarget && actionVerb) return 'kernel';
  if (/\b(group ?chat|ask the (models|room)|debate|panel|consensus|poll the models|what do the models)\b/.test(t)) return 'groupchat';
  if (/\b(mission|orchestrate|end[- ]to[- ]end|full build|ship it|deploy|release)\b/.test(t)) return 'mission';
  if (/\b(swarm|whole team|all (the )?agents|divide and conquer|parallel(ize)?|multi[- ]?agent)\b/.test(t)) return 'swarm';
  if (/\b(build|implement|fix|refactor|create|add (a |the )?feature|write (the )?code|audit|run tests?|debug|wire|patch|optimi[sz]e|migrate)\b/.test(t)) return 'kernel';
  if (!selfTarget && /\b(research|look ?up|find out|sources?|cite|latest on|news on|deep[- ]?dive)\b/.test(t)) return 'research';
  if (actionVerb) return 'kernel';
  return 'chat';
}
