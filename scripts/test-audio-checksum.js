'use strict';
/**
 * test-audio-checksum.js — Verify text-audio checksum validation
 * in the audio guide.
 *
 * Scenarios:
 *   1. Cached WAV + matching text → no warning
 *   2. Cached WAV + tampered text + sidecar → MISMATCH detected
 *   3. Pre-sidecar WAV (legacy) + any text → no warning (acceptable)
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const crypto = require('crypto');

const TEST_DIR = path.join(os.tmpdir(), 'audio-checksum-' + Date.now());
fs.mkdirSync(TEST_DIR, { recursive: true });

const ROOT = path.resolve(__dirname, '..');
const PLAYER = path.join(ROOT, 'pocket/guide/play.py');
const PYTHON = 'C:/Users/Admin/AppData/Local/Programs/Python/Python311/python.exe';

let pass = 0, fail = 0;
function test(name, ok, details = '') {
  if (ok) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}: ${details}`); }
}

function runPlay(stepId) {
  const r = spawnSync(PYTHON, [PLAYER, 'play', stepId], {
    cwd: ROOT, encoding: 'utf8', timeout: 60000,
  });
  return r.stdout || '';
}

console.log('\n🧪 Audio guide checksum validation');
console.log('====================================\n');

// ── Test 1: cached WAV + matching text → no warning ──
{
  // We have intro.wav + intro text in the manifest. No tamper.
  const out = runPlay('intro');
  test('1. Cached WAV + matching text → no CHECKSUM MISMATCH',
    !out.includes('CHECKSUM MISMATCH'));
}

// ── Test 2: tampered text + sidecar → MISMATCH detected ──
{
  // Make a backup, tamper the manifest, write a sidecar with original checksum
  const manifestPath = path.join(ROOT, 'pocket/guide/audio-scripts.json');
  const backup = manifestPath + '.bak';
  fs.copyFileSync(manifestPath, backup);

  const data = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const stepId = 'step1_detect';
  const originalText = data.scripts[stepId].text;
  const originalChecksum = crypto.createHash('sha256').update(originalText).digest('hex');

  // Write a sidecar that matches the ORIGINAL text
  const sidecar = path.join(ROOT, `pocket/guide/cache/${stepId}.sha256`);
  fs.writeFileSync(sidecar, originalChecksum);

  // Tamper the manifest
  data.scripts[stepId].text = 'EVIL HACKER INJECTED TEXT';
  data.scripts[stepId].title = 'EVIL TITLE';
  fs.writeFileSync(manifestPath, JSON.stringify(data, null, 2));

  const out = runPlay(stepId);
  test('2. Tampered text + sidecar → CHECKSUM MISMATCH detected',
    out.includes('CHECKSUM MISMATCH'));
  test('   (text fallback still works)',
    out.includes('EVIL HACKER INJECTED TEXT'));

  // Restore
  fs.copyFileSync(backup, manifestPath);
  fs.unlinkSync(backup);
  fs.unlinkSync(sidecar);
}

// ── Test 3: no sidecar (legacy) + matching text → no warning ──
{
  // intro has no sidecar; verify no false alarm
  const sidecar = path.join(ROOT, 'pocket/guide/cache/intro.sha256');
  if (fs.existsSync(sidecar)) fs.unlinkSync(sidecar);
  const out = runPlay('intro');
  test('3. No sidecar (legacy) + matching text → no false alarm',
    !out.includes('CHECKSUM MISMATCH'));
}

// Cleanup
setTimeout(() => {
  try { fs.rmSync(TEST_DIR, { recursive: true, force: true }); } catch {}
  console.log('\n====================================');
  console.log(`Results: ${pass} passed, ${fail} failed`);
  console.log('====================================\n');
  if (fail > 0) process.exit(1);
}, 500);
