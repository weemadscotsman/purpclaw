/**
 * Claim Extractor — Accuracy Fish
 * Finds claims inside agent output using regex + heuristics.
 * Each claim gets a unique ID, surface text, and initial classification.
 */

const CLAIM_PATTERNS = [
  // Strong factual claims
  { pattern: /^(?:the system|this (?:code|service|module|file|function|api))\s+(?:is|was|will be|can|does|doesn't|doesn't)\s+(\S[\s\S]{10,200})/im, type: 'state', certainty: 'asserted' },
  { pattern: /^(?:all|every|each|none|no)\s+\S+\s+(?:is|are|was|were)\s+(\S[\s\S]{10,200})/im, type: 'universal', certainty: 'asserted' },
  { pattern: /^(?:is|are|was|were)\s+(?:guaranteed|guaranteed to be|always|never|100%|impossible)/im, type: 'absolute', certainty: 'asserted' },

  // Performance / numerical claims
  { pattern: /^(?:faster|quicker|slower|better|worse|more efficient|less efficient)\s+by\s+([0-9]+(?:\.[0-9]+)?)\s*(?:%|times?|ms|s|seconds?|minutes?)/im, type: 'metric', certainty: 'asserted' },
  { pattern: /^(?:[0-9]+(?:\.[0-9]+)?)\s*(?:%|ms|s|seconds?|minutes?|times?|x)\s+(?:faster|quicker|slower|better|worse)/im, type: 'metric', certainty: 'asserted' },
  { pattern: /\b(scalable|performant|optimized|production-ready|secure|tested|working|functional|complete)\b/gi, type: 'quality', certainty: 'asserted' },

  // Causal claims
  { pattern: /(?:because|since|as a result|therefore|thus|hence)\s+(\S[\s\S]{20,300})/im, type: 'causal', certainty: 'inferred' },
  { pattern: /(?:causes?|leads to|results in|triggers?|produces?|creates?)\s+(\S[\s\S]{10,200})/im, type: 'causal', certainty: 'inferred' },

  // Security / safety claims
  { pattern: /\b(?:secure|safe|protected|authenticated|authorized|encrypted|validated|sanitized)\b/gi, type: 'security', certainty: 'asserted' },
  { pattern: /\b(?:no (?:security|risk|vulnerability|bug|issue|problem)|fully protected|completely safe)\b/gi, type: 'security', certainty: 'asserted' },

  // Implication / inference markers
  { pattern: /(?:it appears|it seems|looks like|appears to be|sounds like)\s+(\S[\s\S]{10,200})/im, type: 'observation', certainty: 'speculative' },
  { pattern: /(?:probably|possibly|likely|unlikely|might be|may be|could be)\s+(\S[\s\S]{10,200})/im, type: 'hedged', certainty: 'speculative' },

  // "Based on" evidence markers
  { pattern: /based on\s+(\S[\s\S]{20,300})/im, type: 'evidenced', certainty: 'inferred' },

  // Testing / verification
  { pattern: /\b(?:tested|verified|confirmed|proven|validated|demonstrated|checked)\b/gi, type: 'verification', certainty: 'asserted' },
  { pattern: /\b(?:all tests? (?:pass|passed|are green)|test suite (?:passes|passed|is green)|no test failures?)\b/gi, type: 'verification', certainty: 'asserted' },
];

const CERTAINTY_INDICATORS = {
  proven:     { words: ['proven', 'confirmed', 'verified', 'demonstrated', 'tested', 'logged', 'in production', 'observed'], delta: 0 },
  likely:     { words: ['likely', 'probably', 'appears to be', 'seems to be', 'generally', 'usually'], delta: -1 },
  inferred:   { words: ['based on', 'suggests', 'indicates', 'implies', 'thus', 'therefore'], delta: -2 },
  speculative: { words: ['possibly', 'might be', 'may be', 'could be', 'perhaps', 'speculative'], delta: -3 },
  metaphor:    { words: ['metaphor', 'analogy', 'like when', 'think of it as', 'imagine'], delta: -4 },
  unsupported: { words: [], delta: -5 },
};

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function classifyInitialCertainty(claimText) {
  const lower = claimText.toLowerCase();
  let best = 'asserted';
  let lowestDelta = 0;
  for (const [level, data] of Object.entries(CERTAINTY_INDICATORS)) {
    for (const word of data.words) {
      if (lower.includes(word)) {
        if (data.delta < lowestDelta) {
          lowestDelta = data.delta;
          best = level;
        }
      }
    }
  }
  return best;
}

function extractClaimType(claimText) {
  const lower = claimText.toLowerCase();
  if (/\b(secure|safe|protected|authenticated|authorized|encrypted|permission|auth)\b/.test(lower)) return 'security';
  if (/\b(scalable|performance?|optimize|latency|throughput|faster|slower)\b/.test(lower)) return 'performance';
  if (/\b(immutable|append-only|consistency|atomic|transactional|isolated)\b/.test(lower)) return 'integrity';
  if (/\b(tested|verified|test suite|tests? pass|test coverage)\b/.test(lower)) return 'testing';
  if (/\b(conscious|aware|thinking|feeling|sentient|autonomous|independent)\b/.test(lower)) return 'capability';
  if (/\b(buyer-ready|production_ready|production-ready|marketable|shippable)\b/.test(lower)) return 'readiness';
  if (/\b(completed?|finished|done|complete|implement|built|constructed|shipped)\b/.test(lower)) return 'readiness';
  return 'general';
}

/**
 * Extract all claims from agent output text.
 * @param {string} output — raw agent output
 * @param {object} options — { minLength: 20, maxClaims: 50 }
 * @returns {Array<Claim>} claims array
 */
function extractClaims(output, options = {}) {
  const { minLength = 20, maxClaims = 50 } = options;
  const claims = [];
  const seen = new Set();

  // Split into sentences first for easier processing
  const sentences = output.split(/(?<=[.!?])\s+/);

  for (const sentence of sentences) {
    if (claims.length >= maxClaims) break;
    const stripped = sentence.trim();
    if (stripped.length < minLength) continue;

    // Check each pattern
    for (const { pattern, type, certainty } of CLAIM_PATTERNS) {
      const match = stripped.match(pattern);
      if (match) {
        const claimText = (match[1] || stripped).trim();
        if (claimText.length < minLength) continue;
        if (seen.has(claimText)) continue;
        seen.add(claimText);

        claims.push({
          id: `claim_${Date.now()}_${claims.length}`,
          text: claimText,
          sentence: stripped,
          type: type || classifyInitialCertainty(claimText),
          subtype: extractClaimType(claimText),
          certainty: certainty || classifyInitialCertainty(claimText),
          flagged: false,
          verdict: null,
          evidence: [],
        });
        break; // one claim per sentence per pattern
      }
    }

    // Catch-all: long sentences that make declarative statements
    if (claims.length < maxClaims && stripped.length > minLength + 20) {
      const hasKeyword = /(\b(is|are|was|were|does|do|will|can|has|have)\b)/.test(stripped);
      if (hasKeyword && !seen.has(stripped)) {
        seen.add(stripped);
        claims.push({
          id: `catchall_${Date.now()}_${claims.length}`,
          text: stripped,
          sentence: stripped,
          type: 'general',
          subtype: extractClaimType(stripped),
          certainty: classifyInitialCertainty(stripped),
          flagged: false,
          verdict: null,
          evidence: [],
        });
      }
    }
  }

  return claims;
}

module.exports = { extractClaims, CLAIM_PATTERNS, CERTAINTY_INDICATORS };
