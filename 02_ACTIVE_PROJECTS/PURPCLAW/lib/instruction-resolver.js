'use strict';

/**
 * lib/instruction-resolver.js — Resolve dynamic instructions against context
 * Takes a template string + context, returns resolved instructions.
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Used by agent-gateway to inject dynamic instructions into prompts.
 * Usage: INSTRUCTIONS.resolve(templateString, contextObject)
 */

const INSTRUCTION_VAR_PATTERN = /\{\{(\w+(?:\.\w+)*)\}\}/g;

/**
 * Resolve {{var}} and {{nested.prop}} tokens in a template string.
 * @param {string} template - Template with {{token}} placeholders
 * @param {object} context - Object to resolve tokens from
 * @returns {string} Resolved string
 */
function resolve(template, context = {}) {
  if (!template || typeof template !== 'string') return template || '';
  return template.replace(INSTRUCTION_VAR_PATTERN, (match, path) => {
    const value = getNestedValue(context, path);
    return value !== undefined ? String(value) : match;
  });
}

/**
 * Get a nested property from an object via dot-notation path.
 * @param {object} obj
 * @param {string} path - e.g. 'user.name' or 'session.id'
 * @returns {*}
 */
function getNestedValue(obj, path) {
  return path.split('.').reduce((cur, key) => (cur && cur[key] !== undefined) ? cur[key] : undefined, obj);
}

module.exports = { resolve };
