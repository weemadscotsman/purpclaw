'use strict';
/**
 * test-signed-update.js — Verify the signed update pipeline end-to-end.
 *
 * Covers:
 *   1. signed-manifest.js: sign + verify + tamper rejection
 *   2. pocket-updater.js: fetchManifest no-cfg-crash
 *   3. release-sign.js: keygen + sign + verify (real keys, stored on disk)
 *   4. Full roundtrip: keygen → sign → verify → tamper → reject
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const tmpDir = path.join(os.tmpdir(), 'signed-update-test-' + Date.now());
fs.mkdirSync(tmpDir, { recursive: true });
process.chdir(tmpDir);

let pass = 0, fail = 0;

function test(name, ok, detail) {
  if (ok) { pass++; console.log('  \x1b[32m\xe2\x9c\x85\x1b[0m ' + name); }
  else { fail++; console.log('  \x1b[31m\xe2\x9c\x97\x1b[0m ' + name + ': ' + (detail || 'fail')); }
}

console.log('\n\xf0\x9f\xa7\xaa Signed update path test');
console.log('========================================\n');

const ROOT = path.resolve(__dirname, '..');

// ── 1. signed-manifest.js: sign + verify + tamper ──
{
  const sm = require(path.join(ROOT, 'lib/signed-manifest'));
  const kp = sm.generateKeypair();

  const manifest = {
    version: '0.1.7', channel: 'stable', url: 'file://test',
    hash: crypto.createHash('sha256').update('content').digest('hex'),
    size: 7, notes: 'test',
  };

  const sig = sm.signManifest(manifest, kp.privateKey);
  test('1a. signManifest produces signature', !!sig && sig.length > 20, 'len=' + (sig || '').length);

  const ok1 = sm.verifyManifest(manifest, sig, kp.publicKey);
  test('1b. verifyManifest accepts valid signature', ok1 === true);

  const tampered = { ...manifest, version: '99.99.99' };
  const ok2 = sm.verifyManifest(tampered, sig, kp.publicKey);
  test('1c. Tampered manifest rejected', ok2 === false);

  const badSig = sig.substring(0, sig.length - 4) + 'AAAA';
  const ok3 = sm.verifyManifest(manifest, badSig, kp.publicKey);
  test('1d. Tampered signature rejected', ok3 === false);

  // verifyPackage (hash + sig combined)
  const pkgPath = path.join(tmpDir, 'pkg.zip');
  fs.writeFileSync(pkgPath, 'content');
  const pkgOk = sm.verifyPackage(manifest, sig, pkgPath, kp.publicKey);
  test('1e. verifyPackage passes with valid content', pkgOk.ok === true);

  fs.writeFileSync(pkgPath, 'tampered');
  const pkgBad = sm.verifyPackage(manifest, sig, pkgPath, kp.publicKey);
  test('1f. verifyPackage rejects tampered content', pkgBad.ok === false);
}

// ── 2. pocket-updater.js: no cfg crash in fetchManifest ──
{
  const pu = require(path.join(ROOT, 'lib/pocket-updater'));
  test('2a. PocketUpdater loads', typeof pu.PocketUpdater === 'function');

  // Verify the cfg fix: read fetchManifest specifically, not the whole file
  const src = fs.readFileSync(path.join(ROOT, 'lib/pocket-updater.js'), 'utf8');
  const lines = src.split('\n');

  // Find the fetchManifest function boundaries
  let inFetchManifest = false;
  let braceDepth = 0;
  let cfgBug = false;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    // Track if we're inside fetchManifest
    if (trimmed.startsWith('async fetchManifest()')) {
      inFetchManifest = true;
      braceDepth = 0;
    }
    if (inFetchManifest) {
      for (const ch of trimmed) {
        if (ch === '{') braceDepth++;
        if (ch === '}') braceDepth--;
      }
      if (braceDepth === 0 && trimmed === '}') {
        inFetchManifest = false;
      }
      // Check for bare cfg.channel (not this.config)
      if (trimmed.includes('cfg.channel') && !trimmed.includes('this.config')) {
        cfgBug = true;
        console.log('  cfg bug in fetchManifest line ' + (i + 1) + ': ' + trimmed.substring(0, 80));
      }
    }
  }
  test('2b. No bare cfg.channel in fetchManifest', !cfgBug);
}

// ── 3. release-sign.js: keygen → sign → verify ──
{
  // Override home to a temp dir so we don't pollute real keys
  const oldHome = process.env.HOME;
  const oldUserProfile = process.env.USERPROFILE;
  process.env.HOME = tmpDir;
  // On Windows, also set USERPROFILE
  process.env.USERPROFILE = tmpDir;

  // Create .purpclaw/keys dir
  const keysDir = path.join(tmpDir, '.purpclaw', 'keys');
  fs.mkdirSync(keysDir, { recursive: true });

  try {
    const rs = require(path.join(ROOT, 'lib/release-sign'));

    const kp = rs.generateAndStoreKeypair();
    test('3a. Keypair generated', !!kp.publicKeyDer);

    const loaded = rs.loadKeypair();
    test('3b. Keypair loads from disk', !!loaded && !!loaded.publicKey);

    const manifest = { version: '0.1.7', channel: 'test', hash: 'abc' };
    const signed = rs.signManifest(manifest);
    test('3c. signManifest returns signature + publicKey',
      !!signed.signature && !!signed.publicKey);

    // Verify (try stored key)
    const verOk = rs.verifyManifest(manifest, signed.signature);
    test('3d. verifyManifest with stored key', verOk === true);

    // Tamper + reject
    const tampered = { ...manifest, version: '99.99.99' };
    const tamperReject = rs.verifyManifest(tampered, signed.signature);
    test('3f. Tampered manifest rejected by release-sign', tamperReject === false);
  } finally {
    process.env.HOME = oldHome;
    process.env.USERPROFILE = oldUserProfile;
  }
}

// ── 4. Canonicalization stability ──
{
  const sm = require(path.join(ROOT, 'lib/signed-manifest'));
  const m1 = { channel: 'stable', version: '0.1.7', notes: 'x' };
  const m2 = { notes: 'x', version: '0.1.7', channel: 'stable' };
  const c1 = sm.canonicalize(m1);
  const c2 = sm.canonicalize(m2);
  test('4. Canonicalization is order-independent', c1 === c2,
    'diff: ' + (c1 === c2 ? '' : c1 + ' vs ' + c2));
}

console.log('\n========================================');
console.log('Results: ' + pass + ' passed, ' + fail + ' failed');
console.log('========================================\n');

if (fail > 0) process.exit(1);
