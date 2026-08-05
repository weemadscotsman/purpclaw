'use strict';
const PURP_PATHS = require('./paths');
/**
 * lib/secret-vault.js — Secret Vault for PURPCLAW
 * 
 * A secret vault encrypts and stores sensitive values (API keys, passwords,
 * tokens, connection strings) on disk using AES-256-GCM. Secrets are stored
 * in ~/.purpclaw/vault/secrets.json. A master passphrase derived key (PBKDF2)
 * protects the vault. On first use, user creates a passphrase. Subsequent
 * reads require the passphrase.
 * 
 * This is what Codex and ChatGPT do NOT have — a native secret management
 * layer that keeps keys out of .env files and shell history.
 * 
 * Usage:
 *   const vault = new SecretVault({ vaultPath: '~/.purpclaw/vault' });
 *   await vault.unlock('my-master-passphrase');
 *   await vault.put('OPENAI_API_KEY', 'sk-...');
 *   const key = await vault.get('OPENAI_API_KEY');
 *   await vault.lock();
 * 
 * CLI:
 *   purpclaw secrets set <name> <value>   Set a secret (prompts for passphrase)
 *   purpclaw secrets get <name>           Get a secret (prompts for passphrase)
 *   purpclaw secrets list                 List secret names only (no values)
 *   purpclaw secrets rm <name>           Remove a secret
 *   purpclaw secrets init                 Initialize vault with a new passphrase
 */

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const crypto = require('crypto');

const ITERATIONS  = 100_000;
const KEY_LEN     = 32;   // 256-bit AES
const SALT_LEN    = 32;
const IV_LEN      = 16;
const TAG_LEN     = 16;
const ALGORITHM   = 'aes-256-gcm';
const STORE_FILE  = 'secrets.json';
const META_FILE   = 'vault.meta.json';

// ── Vault metadata ───────────────────────────────────────────────────────────────

function vaultMeta(vaultDir) {
  return path.join(vaultDir, META_FILE);
}
function vaultStore(vaultDir) {
  return path.join(vaultDir, STORE_FILE);
}
function vaultDir(opts) {
  return path.resolve(path.join(opts.vaultPath || path.join(PURP_PATHS.DATA_ROOT, 'vault')));
}

// ── Key derivation ──────────────────────────────────────────────────────────────

function deriveKey(passphrase, salt) {
  return crypto.pbkdf2Sync(passphrase, salt, ITERATIONS, KEY_LEN, 'sha512');
}

// ── Single-entry encrypt ────────────────────────────────────────────────────────

function encrypt(plaintext, key) {
  const iv    = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const enc    = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag    = cipher.getAuthTag();
  // Layout: iv (16) + tag (16) + ciphertext
  return Buffer.concat([iv, tag, enc]);
}

// ── Single-entry decrypt ────────────────────────────────────────────────────────

function decrypt(blob, key) {
  const iv    = blob.subarray(0, IV_LEN);
  const tag   = blob.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const enc   = blob.subarray(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

// ── Store format ────────────────────────────────────────────────────────────────

/**
 * secrets.json stores:
 * {
 *   "secret_name": {
 *     "ct": "<base64-encoded-iv+tag+ciphertext>",
 *     "salt": "<base64-encoded-salt-used-for_this_entry>",
 *     "created": "<ISO timestamp>"
 *   }
 * }
 * Each secret has its own random salt for key derivation — allows
 * changing the passphrase without re-encrypting with a new scheme.
 */

function readStore(vaultPath) {
  const storeFile = vaultStore(vaultPath);
  if (!fs.existsSync(storeFile)) return {};
  try {
    return JSON.parse(fs.readFileSync(storeFile, 'utf8'));
  } catch {
    return {};
  }
}

function writeStore(vaultPath, store) {
  const storeFile = vaultStore(vaultPath);
  const dir = path.dirname(storeFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(storeFile, JSON.stringify(store, null, 2), 'utf8');
}

// ── SecretVault class ──────────────────────────────────────────────────────────

class SecretVault {
  constructor(opts = {}) {
    this.vaultPath = vaultDir(opts);
    this._masterKey = null;
    this._salt = null;
    this._dirty = false;
  }

  /** Check if vault exists (has been initialized) */
  exists() {
    return fs.existsSync(vaultMeta(this.vaultPath));
  }

  /** Check if vault is currently unlocked */
  isUnlocked() {
    return this._masterKey !== null;
  }

  /** Initialize a new vault with a passphrase (first-time setup) */
  async init(passphrase) {
    if (this.exists()) throw new Error('Vault already initialized. Use unlock() instead.');

    const salt    = crypto.randomBytes(SALT_LEN);
    const masterKey = deriveKey(passphrase, salt);

    const meta = {
      version: 1,
      algorithm: ALGORITHM,
      iterations: ITERATIONS,
      salt: salt.toString('base64'),
      created: new Date().toISOString(),
    };

    const dir = this.vaultPath;
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(vaultMeta(dir), JSON.stringify(meta, null, 2), 'utf8');
    writeStore(dir, {});

    this._masterKey = masterKey;
    this._salt = salt;
    return true;
  }

  /** Unlock vault with passphrase */
  async unlock(passphrase) {
    const metaFile = vaultMeta(this.vaultPath);
    if (!fs.existsSync(metaFile)) throw new Error('Vault not initialized. Use init() first.');

    const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
    if (!meta.salt) throw new Error('Vault metadata corrupted — no salt.');

    const salt = Buffer.from(meta.salt, 'base64');
    this._masterKey = deriveKey(passphrase, salt);
    this._salt = salt;

    // Verify the key by attempting to decrypt the test entry (if any)
    const store = readStore(this.vaultPath);
    if (store.__purpclaw_test__) {
      try {
        const blob = Buffer.from(store.__purpclaw_test__.ct, 'base64');
        decrypt(blob, this._masterKey);
      } catch {
        this._masterKey = null;
        this._salt = null;
        throw new Error('Invalid passphrase');
      }
    }
    return true;
  }

  /** Lock vault (clear master key from memory) */
  lock() {
    if (this._masterKey) {
      // Overwrite key in memory before releasing
      this._masterKey.fill(0);
    }
    this._masterKey = null;
    this._salt = null;
    this._dirty = false;
  }

  /** Store a secret */
  async put(name, value) {
    if (!this._masterKey) throw new Error('Vault is locked. Unlock with unlock(passphrase) first.');
    if (typeof value !== 'string') value = String(value);
    if (!value) throw new Error('Cannot store empty value.');

    const salt = crypto.randomBytes(SALT_LEN);
    const key  = deriveKey(this._masterKey, salt);  // derive per-secret key from master
    const ct   = encrypt(value, key).toString('base64');

    const store = readStore(this.vaultPath);
    store[name] = { ct, salt: salt.toString('base64'), created: new Date().toISOString() };
    writeStore(this.vaultPath, store);
    this._dirty = true;
    return true;
  }

  /** Retrieve a secret */
  async get(name) {
    if (!this._masterKey) throw new Error('Vault is locked. Unlock with unlock(passphrase) first.');
    const store = readStore(this.vaultPath);
    const entry = store[name];
    if (!entry) return null;

    const salt = Buffer.from(entry.salt, 'base64');
    const key  = deriveKey(this._masterKey, salt);
    const blob = Buffer.from(entry.ct, 'base64');
    return decrypt(blob, key);
  }

  /** List all secret names (no values) */
  list() {
    const store = readStore(this.vaultPath);
    return Object.keys(store).filter(k => !k.startsWith('__purpclaw_'));
  }

  /** Check if a secret exists */
  has(name) {
    const store = readStore(this.vaultPath);
    return name in store && !name.startsWith('__purpclaw_');
  }

  /** Remove a secret */
  async remove(name) {
    if (!this._masterKey) throw new Error('Vault is locked. Unlock with unlock(passphrase) first.');
    const store = readStore(this.vaultPath);
    if (!(name in store)) return false;
    delete store[name];
    writeStore(this.vaultPath, store);
    this._dirty = true;
    return true;
  }

  /** Set a test entry to verify passphrase correctness */
  async putTest() {
    if (!this._masterKey) throw new Error('Vault is locked.');
    const salt = crypto.randomBytes(SALT_LEN);
    const key  = deriveKey(this._masterKey, salt);
    const ct   = encrypt('purpclaw-vault-test', key).toString('base64');
    const store = readStore(this.vaultPath);
    store.__purpclaw_test__ = { ct, salt: salt.toString('base64'), created: new Date().toISOString() };
    writeStore(this.vaultPath, store);
  }

  /** Change the master passphrase (re-encrypts all secrets) */
  async changePassphrase(oldPass, newPass) {
    // Unlock with old
    await this.unlock(oldPass);
    // Read all secrets
    const store = readStore(this.vaultPath);
    const entries = {};
    for (const [name, entry] of Object.entries(store)) {
      if (name.startsWith('__purpclaw_')) continue;
      const salt = Buffer.from(entry.salt, 'base64');
      const key  = deriveKey(this._masterKey, salt);
      const blob = Buffer.from(entry.ct, 'base64');
      entries[name] = { plaintext: decrypt(blob, key), created: entry.created };
    }

    // Re-init with new passphrase
    const metaFile = vaultMeta(this.vaultPath);
    fs.unlinkSync(metaFile);
    await this.init(newPass);

    // Re-encrypt all secrets
    for (const [name, { plaintext, created }] of Object.entries(entries)) {
      const salt = crypto.randomBytes(SALT_LEN);
      const key  = deriveKey(this._masterKey, salt);
      const ct   = encrypt(plaintext, key).toString('base64');
      const store2 = readStore(this.vaultPath);
      store2[name] = { ct, salt: salt.toString('base64'), created };
      writeStore(this.vaultPath, store2);
    }

    return true;
  }
}

module.exports = { SecretVault };
