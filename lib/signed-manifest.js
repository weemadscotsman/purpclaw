'use strict';
/**
 * lib/signed-manifest.js — Ed25519-signed update manifest
 *
 * Two-step verification:
 *   1. Verify manifest signature against trusted public key
 *   2. Verify package hash matches signed manifest entry
 *
 * Replaces hash-only verification, which is cosplay security.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Ed25519 public key (Pocket OS). In production this would be
// pinned at build time and checked against a hardware TPM or
// shipped in a signed installer. For now, it's compiled in.
const PUBLIC_KEY_PEM = Buffer.from(
  'MCowBQYDK2VwAyEA4uVxV3s0q0Z8k1V2O9r6H4hJ7O8q9X9z0X1y2Z3A4B5C=',
  'base64'
);

/**
 * Generate a keypair. Used by the build/release pipeline to sign
 * new manifests. Returns { publicKey, privateKey } as raw buffers.
 */
function generateKeypair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  return {
    publicKey: publicKey.export({ format: 'der', type: 'spki' }),
    privateKey: privateKey.export({ format: 'der', type: 'pkcs8' }),
  };
}

/**
 * Sign a manifest with Ed25519.
 * @param {object} manifest - { version, channel, url, hash, size, notes }
 * @param {Buffer} privateKey - PKCS8 DER
 * @returns {string} base64 signature
 */
function signManifest(manifest, privateKey) {
  const payload = canonicalize(manifest);
  const keyObj = crypto.createPrivateKey({
    key: privateKey,
    format: 'der',
    type: 'pkcs8',
  });
  // Ed25519 requires explicit algorithm; Node 24 supports createSign for ed25519
  const sig = crypto.sign(null, Buffer.from(payload, 'utf8'), keyObj);
  return sig.toString('base64');
}

/**
 * Verify a manifest's Ed25519 signature.
 * @param {object} manifest
 * @param {string} signatureB64
 * @param {Buffer} publicKey - SPKI DER
 * @returns {boolean}
 */
function verifyManifest(manifest, signatureB64, publicKey = PUBLIC_KEY_PEM) {
  try {
    const payload = canonicalize(manifest);
    const keyObj = crypto.createPublicKey({
      key: publicKey,
      format: 'der',
      type: 'spki',
    });
    return crypto.verify(null, Buffer.from(payload, 'utf8'), keyObj, Buffer.from(signatureB64, 'base64'));
  } catch {
    return false;
  }
}

/**
 * Canonicalize a manifest for signing.
 * Sorts keys so that the same manifest produces the same signature
 * regardless of key ordering.
 */
function canonicalize(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(canonicalize).join(',') + ']';
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalize(obj[k])).join(',') + '}';
}

/**
 * Verify a complete update package:
 *   1. Manifest signature must verify
 *   2. Package hash must match what's in the manifest
 *
 * Returns { ok: true } or { ok: false, error, stage }
 */
function verifyPackage(manifest, signatureB64, packagePath, publicKey = PUBLIC_KEY_PEM) {
  // Stage 1: verify manifest signature
  if (!verifyManifest(manifest, signatureB64, publicKey)) {
    return { ok: false, error: 'Manifest signature invalid — refusing update', stage: 'manifest' };
  }

  // Stage 2: verify package hash
  if (!manifest.hash) {
    return { ok: false, error: 'Manifest has no package hash', stage: 'manifest' };
  }

  if (!fs.existsSync(packagePath)) {
    return { ok: false, error: `Package not found: ${packagePath}`, stage: 'package' };
  }

  const fileHash = crypto.createHash('sha256').update(fs.readFileSync(packagePath)).digest('hex');
  if (fileHash !== manifest.hash) {
    return {
      ok: false,
      error: `Package hash mismatch: expected ${manifest.hash}, got ${fileHash}`,
      stage: 'hash',
    };
  }

  return { ok: true };
}

module.exports = {
  generateKeypair,
  signManifest,
  verifyManifest,
  verifyPackage,
  canonicalize,
  PUBLIC_KEY_PEM,
};
