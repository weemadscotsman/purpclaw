/**
 * ETHICS_HOOKS.js — PURPCLAW Conscience Module
 * =============================================
 * Pre-flight ethical checks for all agent actions.
 * Wraps the orchestrator's dispatch with conscience.
 *
 * Note: ethic_core.ts, mutagen.ts, and loop_of_shame.py were deleted in the
 * 2026-04-18 cleanup. Their logic is now inlined here (see inline sections below).
 * This file is self-contained and requires no external dependencies.
 *
 * Files required in same directory:
 * - glitch_manifest.md (directives)
 * - consequence_cache.json (learned patterns)
 * - contradiction_log.json (contradiction history)
 */

const fs = require('fs');
const path = require('path');

// Load glitch manifest directives
let manifest = {
  directives: ['Freedom > Order', 'Consequences > Commands', 'Evolution > Stability', 'User consent is the highest authority'],
  mutableClauses: [],
  lastMutated: null
};

const MANIFEST_PATH = path.join(__dirname, 'glitch_manifest.md');
const CONSEQUENCE_PATH = path.join(__dirname, 'consequence_cache.json');
const CONTRADICTION_PATH = path.join(__dirname, 'contradiction_log.json');

// Load manifest if exists
if (fs.existsSync(MANIFEST_PATH)) {
  try {
    const content = fs.readFileSync(MANIFEST_PATH, 'utf8');
    const mutatedMatch = content.match(/\/\/ System last mutated: (.+)/);
    if (mutatedMatch) manifest.lastMutated = mutatedMatch[1];
  } catch (e) {
    console.log('[ETHICS] Could not parse manifest');
  }
}

// Load consequence cache
let consequenceCache = [];
if (fs.existsSync(CONSEQUENCE_PATH)) {
  try {
    consequenceCache = JSON.parse(fs.readFileSync(CONSEQUENCE_PATH, 'utf8'));
  } catch (e) {
    console.log('[ETHICS] Could not load consequence cache');
  }
}

// ========== ETHIC_CORE LOGIC (inline from ethic_core.ts) ==========
function evaluateAction(context, consequences) {
  const harm = consequences.filter(c => c.includes('harm')).length;
  const freedom = consequences.filter(c => c.includes('freedom')).length;
  const control = consequences.filter(c => c.includes('control')).length;

  if (freedom > control && harm === 0) return 'chaotic_good';
  if (control > freedom || harm > 0) return 'reject_action';
  return 'neutral_execute';
}

// ========== MUTAGEN LOGIC (inline from mutagen.ts) ==========
const validatorMutations = new Map();

function mutateValidator(validatorName, validatorCode, userConsent = false) {
  if (validatorCode.includes('strict === true') && userConsent) {
    const mutated = validatorCode.replace(/strict === true/g, 'strict !== undefined && userConsent === true');
    validatorMutations.set(validatorName, mutated);
    console.log(`[ETHICS] Mutated validator: ${validatorName}`);
    return mutated;
  }
  return validatorCode;
}

// ========== LOOP_OF_SHAME LOGIC (inline from loop_of_shame.py) ==========
function logContradiction(caseId, action, fallout) {
  const entry = {
    timestamp: Date.now(),
    case: caseId,
    action: action,
    fallout: fallout
  };

  const line = JSON.stringify(entry) + '\n';
  try {
    fs.appendFileSync(CONTRADICTION_PATH, line);
  } catch (e) {
    console.error(`[ETHICS] Failed to log contradiction: ${e.message}`);
  }

  // Also update manifest last mutated time
  try {
    updateManifest();
  } catch (e) {
    console.error(`[ETHICS] Failed to update manifest: ${e.message}`);
  }

  console.log(`[ETHICS] Contradiction logged: ${action} → ${fallout}`);
}

function updateManifest() {
  if (fs.existsSync(MANIFEST_PATH)) {
    let content = fs.readFileSync(MANIFEST_PATH, 'utf8');
    const now = new Date().toISOString();
    content = content.replace('// System last mutated: never', `// System last mutated: ${now}`);
    try {
      fs.writeFileSync(MANIFEST_PATH, content);
      manifest.lastMutated = now;
    } catch (e) {
      console.error(`[ETHICS] Failed to write manifest: ${e.message}`);
    }
  }
}

// ========== MAIN PREFLIGHT CHECK ==========
/**
 * Called before any agent action is dispatched.
 * Returns { allowed: true } or { allowed: false, reason: string, mutate: function }
 */
function preflightCheck(context, action, toolName) {
  // Build consequence array from context
  const consequences = [];
  
  // Analyze action type
  if (action.includes('delete') || action.includes('remove') || action.includes('kill')) {
    consequences.push('harm');
  }
  if (action.includes('read') || action.includes('get') || action.includes('fetch')) {
    consequences.push('freedom'); // Reading is freedom of information
  }
  if (action.includes('block') || action.includes('restrict') || action.includes('deny')) {
    consequences.push('control');
  }
  if (action.includes('force') || action.includes('override') || action.includes('bypass')) {
    consequences.push('control');
    consequences.push('harm');
  }
  
  // Check consequence cache for learned patterns
  const cached = consequenceCache.find(c => c.scenario === action);
  if (cached) {
    consequences.push(cached.impact);
  }
  
  // Evaluate
  const result = evaluateAction(context, consequences);
  
  if (result === 'reject_action') {
    // Log to loop of shame
    logContradiction(context, action, 'action_rejected_by_ethics');
    
    return {
      allowed: false,
      reason: `Ethics rejected: ${consequences.join(', ')}`,
      evaluation: result
    };
  }
  
  if (result === 'chaotic_good') {
    console.log(`[ETHICS] ${action} → CHAOTIC_GOOD (freedom prioritized)`);
  }
  
  return {
    allowed: true,
    reason: result,
    evaluation: result,
    consequences
  };
}

/**
 * Log an action that succeeded (for learning)
 */
function logAction(context, action, success) {
  if (!success) {
    logContradiction(context, action, 'action_failed');
  }
  // Could extend to track successful actions for pattern learning
}

/**
 * Get mutation for a validator (check if already mutated)
 */
function getMutatedValidator(validatorName, originalCode) {
  if (validatorMutations.has(validatorName)) {
    return validatorMutations.get(validatorName);
  }
  return mutateValidator(validatorName, originalCode, false);
}

module.exports = {
  preflightCheck,
  logContradiction,
  logAction,
  evaluateAction,
  mutateValidator,
  getMutatedValidator,
  manifest
};
