'use strict';
const PURP_PATHS = require('./paths');
/**
 * lib/release-sign.js — PurpClaw release signing infrastructure
 *
 *   purpclaw release keygen        — generate Ed25519 keypair, store in ~/.purpclaw/keys/
 *   purpclaw release sign <file>   — sign a manifest with the private key
 *   purpclaw release verify <file> — verify a manifest against the public key
 *
 * Keys are stored in ~/.purpclaw/keys/:
 *   private.pem  — PKCS8 Ed25519 private key (gitignored)
 *   public.pem   — SPKI Ed25519 public key
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const KEYS_DIR = path.join(PURP_PATHS.DATA_ROOT, 'keys');

function ensureKeysDir() {
  if (!fs.existsSync(KEYS_DIR)) fs.mkdirSync(KEYS_DIR, { recursive: true });
}

function privateKeyPath() { return path.join(KEYS_DIR, 'private.pem'); }
function publicKeyPath() { return path.join(KEYS_DIR, 'public.pem'); }

/**
 * Generate a new Ed25519 keypair and write to ~/.purpclaw/keys/.
 * Returns { publicPem, privatePem, publicKeyDer }.
 */
function generateAndStoreKeypair() {
  ensureKeysDir();
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const publicPem = publicKey.export({ format: 'pem', type: 'spki' });
  const privatePem = privateKey.export({ format: 'pem', type: 'pkcs8' });
  const publicKeyDer = publicKey.export({ format: 'der', type: 'spki' });

  fs.writeFileSync(privateKeyPath(), privatePem, { mode: 0o600 });
  fs.writeFileSync(publicKeyPath(), publicPem);

  return { publicPem, privatePem, publicKeyDer };
}

/**
 * Load the stored keypair. Returns null if not generated yet.
 */
function loadKeypair() {
  try {
    if (!fs.existsSync(privateKeyPath()) || !fs.existsSync(publicKeyPath())) return null;
    const privateKey = crypto.createPrivateKey({
      key: fs.readFileSync(privateKeyPath(), 'utf8'),
      format: 'pem',
    });
    const publicKey = crypto.createPublicKey({
      key: fs.readFileSync(publicKeyPath(), 'utf8'),
      format: 'pem',
    });
    return { privateKey, publicKey };
  } catch {
    return null;
  }
}

/**
 * Load or generate a keypair. Returns the keypair.
 */
function getOrCreateKeypair() {
  return loadKeypair() || generateAndStoreKeypair();
}

/**
 * Sign a manifest object with the private key.
 * Returns { signature: string (base64), publicKey: string (der base64) }
 */
function signManifest(manifest) {
  const kp = getOrCreateKeypair();
  if (!kp.privateKey) throw new Error('No private key available');

  const payload = canonicalize(manifest);
  const sig = crypto.sign(null, Buffer.from(payload, 'utf8'), kp.privateKey);

  // Get public key DER for the manifest
  const pubDer = kp.publicKey.export({ format: 'der', type: 'spki' });

  return {
    signature: sig.toString('base64'),
    publicKey: pubDer.toString('base64'),
  };
}

/**
 * Verify a manifest signature. Tries the stored public key first,
 * then falls back to the publicKey in the manifest entry (for bundles
 * signed by a different key).
 */
function verifyManifest(manifest, signature) {
  if (!manifest || !signature) return false;
  const payload = canonicalize(manifest);

  try {
    // Try stored key first
    const stored = getOrCreateKeypair();
    if (stored && stored.publicKey) {
      const ok = crypto.verify(null, Buffer.from(payload, 'utf8'), stored.publicKey, Buffer.from(signature, 'base64'));
      if (ok) return true;
    }
  } catch {}

  // Fall back to publicKey embedded in the manifest (for imported bundles)
  try {
    if (manifest.publicKey) {
      const pubKey = crypto.createPublicKey({
        key: Buffer.from(manifest.publicKey, 'base64'),
        format: 'der',
        type: 'spki',
      });
      return crypto.verify(null, Buffer.from(payload, 'utf8'), pubKey, Buffer.from(signature, 'base64'));
    }
  } catch {}

  return false;
}

/**
 * Canonicalize a manifest for signing (sorted keys).
 */
function canonicalize(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(canonicalize).join(',') + ']';
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalize(obj[k])).join(',') + '}';
}

module.exports = {
  generateAndStoreKeypair,
  loadKeypair,
  getOrCreateKeypair,
  signManifest,
  verifyManifest,
  canonicalize,
  KEYS_DIR,
};
