'use strict';
/**
 * lib/pocket-vault.js — Encrypted secrets storage for Pocket OS
 * Uses AES-256-GCM with PBKDF2 key derivation from master password.
 * No external dependencies — pure Node crypto.
 *
 * The vault file contains:
 *   - salt (for KDF)
 *   - data: { iv, ciphertext, authTag } (the encrypted JSON of all secrets)
 *
 * Without the master password, the data cannot be read.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ALGO = 'aes-256-gcm';
const KDF = 'pbkdf2';
const KDF_ITERATIONS = 200000;
const KDF_KEYLEN = 32;
const SALT_LEN = 32;
const IV_LEN = 12;

class PocketVault {
  constructor(vaultPath) {
    this.vaultPath = vaultPath || path.join(os.homedir(), '.purpclaw', 'vault.enc');
    this.data = {};
    this._key = null;
  }

  /**
   * Encrypt a JSON-serializable object. Returns { iv, data, authTag }.
   */
  _encrypt(plaintext) {
    const iv = crypto.randomBytes(IV_LEN);
    const cipher = crypto.createCipheriv(ALGO, this._key, iv);
    const enc = Buffer.concat([cipher.update(JSON.stringify(plaintext), 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return { iv: iv.toString('base64'), data: enc.toString('base64'), authTag: authTag.toString('base64') };
  }

  /**
   * Decrypt a { iv, data, authTag } object. Throws on bad password.
   */
  _decrypt(envelope) {
    const iv = Buffer.from(envelope.iv, 'base64');
    const authTag = Buffer.from(envelope.authTag, 'base64');
    const enc = Buffer.from(envelope.data, 'base64');
    const decipher = crypto.createDecipheriv(ALGO, this._key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(enc), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8'));
  }

  /**
   * Initialize a new vault with master password.
   */
  init(masterPassword) {
    if (typeof masterPassword !== 'string' || masterPassword.length < 8) {
      throw new Error('Master password must be at least 8 characters');
    }

    const salt = crypto.randomBytes(SALT_LEN);
    this._key = crypto.pbkdf2Sync(masterPassword, salt, KDF_ITERATIONS, KDF_KEYLEN, 'sha256');

    const data = { _created: new Date().toISOString() };
    const encData = this._encrypt(data);

    const vault = {
      version: 2,
      salt: salt.toString('base64'),
      kdf: { algo: KDF, iterations: KDF_ITERATIONS, keylen: KDF_KEYLEN, digest: 'sha256' },
      data: encData,
    };

    fs.mkdirSync(path.dirname(this.vaultPath), { recursive: true });
    fs.writeFileSync(this.vaultPath, JSON.stringify(vault, null, 2));
    this.data = data;

    return { vaultPath: this.vaultPath };
  }

  /**
   * Open existing vault with master password.
   */
  unlock(masterPassword) {
    if (!fs.existsSync(this.vaultPath)) {
      throw new Error('Vault does not exist. Run init() first.');
    }
    const vault = JSON.parse(fs.readFileSync(this.vaultPath, 'utf8'));
    const salt = Buffer.from(vault.salt, 'base64');
    this._key = crypto.pbkdf2Sync(masterPassword, salt, KDF_ITERATIONS, KDF_KEYLEN, 'sha256');

    try {
      this.data = this._decrypt(vault.data);
    } catch {
      this._key = null;
      throw new Error('Invalid master password');
    }
    return true;
  }

  set(key, value) {
    if (!this._key) throw new Error('Vault is locked. Call unlock() first.');
    this.data[key] = value;
    this._persist();
  }

  get(key) {
    if (!this._key) throw new Error('Vault is locked. Call unlock() first.');
    return this.data[key];
  }

  has(key) {
    if (!this._key) return false;
    return key in this.data;
  }

  delete(key) {
    if (!this._key) throw new Error('Vault is locked. Call unlock() first.');
    delete this.data[key];
    this._persist();
  }

  list() {
    if (!this._key) throw new Error('Vault is locked. Call unlock() first.');
    return Object.keys(this.data).filter(k => !k.startsWith('_'));
  }

  lock() {
    this._key = null;
    this.data = {};
  }

  _persist() {
    const vault = JSON.parse(fs.readFileSync(this.vaultPath, 'utf8'));
    vault.data = this._encrypt(this.data);
    vault._updated = new Date().toISOString();
    fs.writeFileSync(this.vaultPath, JSON.stringify(vault, null, 2));
  }
}

module.exports = { PocketVault, ALGO, KDF_ITERATIONS };
