const { extractClaims } = require('../../accuracy-fish');

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    console.log(`  ✗ ${name}`);
    console.log(`    ${e.message}`);
  }
}

function assertEqual(actual, expected, msg = '') {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${msg}\n  Expected: ${JSON.stringify(expected)}\n  Actual:   ${JSON.stringify(actual)}`);
  }
}

function assertTrue(value, msg = '') {
  if (!value) throw new Error(msg || 'Expected truthy');
}

console.log('\nclaim_extractor.js tests\n');

test('extracts no claims from empty string', () => {
  const results = extractClaims('', { minLength: 20 });
  assertEqual(results.length, 0);
});

test('extracts a simple state claim', () => {
  const results = extractClaims('The system is running correctly.', { minLength: 15 });
  assertTrue(results.length >= 1, 'should find at least one claim');
  const texts = results.map(r => r.text);
  const match = texts.find(t => t.toLowerCase().includes('running'));
  assertTrue(!!match, 'should find "running" claim');
});

test('flags quality keyword claims as asserted', () => {
  const results = extractClaims('This code is production-ready and secure.', { minLength: 15 });
  assertTrue(results.length >= 1, 'should find at least one claim');
  // production-ready triggers quality/asserted — or gets classified to security sub-type
  const claim = results.find(r => r.certainty === 'asserted');
  assertTrue(!!claim, 'should have an asserted claim');
});

test('marks speculative language as speculative', () => {
  // "might be faster" is hedged/speculative — minLength must cover the full sentence chunk
  const results = extractClaims('This might be faster by 30%.', { minLength: 5 });
  assertTrue(results.length >= 1);
  const claim = results.find(r => r.certainty === 'speculative');
  assertTrue(!!claim, 'speculative claim should be marked');
});

test('caps claims at maxClaims', () => {
  // Each unique sentence produces 2 claims (pattern + catchall) — 30 reps = 60 total
  const text = 'The system is operational. '.repeat(30);
  const results = extractClaims(text, { minLength: 15, maxClaims: 5 });
  assertTrue(results.length <= 5, `expected <= 5, got ${results.length}`);
});

test('classifies security claims correctly', () => {
  const results = extractClaims('The API is authenticated and encrypted.', { minLength: 15 });
  const security = results.filter(r => r.type === 'security' || r.subtype === 'security');
  assertTrue(security.length >= 1, 'should have security claim');
});

test('returns claim objects with required fields', () => {
  const results = extractClaims('All tests are passing and verified.', { minLength: 10 });
  assertTrue(results.length >= 1);
  const claim = results[0];
  assertTrue(typeof claim.id === 'string', 'should have id');
  assertTrue(typeof claim.text === 'string', 'should have text');
  assertTrue(typeof claim.certainty === 'string', 'should have certainty');
  assertTrue(typeof claim.type === 'string', 'should have type');
  assertTrue(typeof claim.flagged === 'boolean', 'should have flagged');
});

console.log('\nDone.\n');
