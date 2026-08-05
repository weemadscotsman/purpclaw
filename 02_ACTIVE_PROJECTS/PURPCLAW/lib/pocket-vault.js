'use strict';
const PURP_PATHS = require('./paths');
/**
 * lib/pocket-vault.js — Encrypted secrets storage for Pocket OS
 *
 * Encryption:
 *   - AES-256-GCM with random IV per encryption
 *   - PBKDF2-SHA256, 200K iterations
 *   - Two-key model: master (from password) + recovery (independent)
 *   - Data is stored encrypted with BOTH keys; either can unlock
 *
 * Reliability:
 *   - File locking (pid-stamped) prevents concurrent write corruption
 *   - Atomic writes: write to .tmp.{pid}, fsync, rename to final
 *   - Backup file (.bak) updated after every successful write
 *   - Read tolerance: if primary is corrupt, fall back to .bak
 *
 * Audit:
 *   - vault.enc.log records every action (init/unlock/set/delete/recovery/fail)
 *   - No secrets ever appear in audit log
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ALGO = 'aes-256-gcm';
const KDF_ITERATIONS = 200000;
const KDF_KEYLEN = 32;
const SALT_LEN = 32;
const IV_LEN = 12;
const MIN_PASSWORD_LEN = 12;

const AUDIT_ACTIONS = {
  INIT: 'init', UNLOCK: 'unlock', UNLOCK_FAIL: 'unlock_fail',
  SET: 'set', DELETE: 'delete', RECOVERY: 'recovery', RECOVERY_FAIL: 'recovery_fail',
  WRITE_FAIL: 'write_fail', LOCK_FAIL: 'lock_fail', BACKUP_FAIL: 'backup_fail',
};

class PocketVault {
  constructor(vaultPath) {
    this.vaultPath = vaultPath || path.join(PURP_PATHS.DATA_ROOT, 'vault.enc');
    this.backupPath = this.vaultPath + '.bak';
    this.lockPath = this.vaultPath + '.lock';
    this.auditPath = this.vaultPath + '.log';
    this.data = {};
    this._key = null;             // master key
    this._recoveryKeyRaw = null;  // raw recovery key (hex)
    this._recoverySalt = null;    // salt for deriving recovery key
    this._lockHeld = false;
  }

  static validatePassword(pw) {
    if (typeof pw !== 'string') return 'password must be a string';
    if (pw.length < MIN_PASSWORD_LEN) {
      return `password must be at least ${MIN_PASSWORD_LEN} characters`;
    }
    let classes = 0;
    if (/[a-z]/.test(pw)) classes++;
    if (/[A-Z]/.test(pw)) classes++;
    if (/[0-9]/.test(pw)) classes++;
    if (/[^A-Za-z0-9]/.test(pw)) classes++;
    if (classes < 3) {
      return 'password must include 3 of: lowercase, uppercase, digit, symbol';
    }
    return null;
  }

  // ── Locking (cross-platform) ──────────────────────────────────
  _tryLock() {
    if (this._lockHeld) return true;
    try {
      if (fs.existsSync(this.lockPath)) {
        const ageMs = Date.now() - fs.statSync(this.lockPath).mtimeMs;
        if (ageMs > 30_000) {
          try { fs.unlinkSync(this.lockPath); } catch {}
        } else {
          this._audit(AUDIT_ACTIONS.LOCK_FAIL, 'busy', null, null);
          return false;
        }
      }
      const pid = process.pid;
      const host = os.hostname();
      const ts = new Date().toISOString();
      // Ensure parent dir exists for the lock file
      const lockDir = path.dirname(this.lockPath);
      if (!fs.existsSync(lockDir)) fs.mkdirSync(lockDir, { recursive: true });
      fs.writeFileSync(this.lockPath, `pid=${pid} host=${host} ts=${ts}\n`, { flag: 'wx' });
      this._lockHeld = true;
      return true;
    } catch (e) {
      this._audit(AUDIT_ACTIONS.LOCK_FAIL, 'failed', e.message, null);
      return false;
    }
  }

  _unlock() {
    if (!this._lockHeld) return;
    try { fs.unlinkSync(this.lockPath); } catch {}
    this._lockHeld = false;
  }

  // ── Atomic write (tmp + fsync + rename) ──────────────────────
  _atomicWrite(filePath, data) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmp = filePath + '.tmp.' + process.pid;
    try {
      const fd = fs.openSync(tmp, 'w', 0o600);
      try {
        fs.writeSync(fd, data);
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      const verify = fs.readFileSync(tmp);
      if (verify.length !== data.length) throw new Error('temp file size mismatch');
      fs.renameSync(tmp, filePath);
    } catch (e) {
      try { fs.unlinkSync(tmp); } catch {}
      throw e;
    }
  }

  // ── Audit log ────────────────────────────────────────────────
  _audit(action, result, error, metadata) {
    if (!fs.existsSync(path.dirname(this.auditPath))) {
      try { fs.mkdirSync(path.dirname(this.auditPath), { recursive: true }); } catch {}
    }
    const entry = {
      ts: new Date().toISOString(),
      action, result,
      pid: process.pid,
      host: os.hostname(),
      ...(error && { error: String(error).substring(0, 200) }),
      ...(metadata && { meta: metadata }),
    };
    try {
      fs.appendFileSync(this.auditPath, JSON.stringify(entry) + '\n');
    } catch {}
  }

  readAudit(n = 50) {
    if (!fs.existsSync(this.auditPath)) return [];
    try {
      const lines = fs.readFileSync(this.auditPath, 'utf8').split('\n').filter(Boolean);
      return lines.slice(-n).map(l => {
        try { return JSON.parse(l); } catch { return null; }
      }).filter(Boolean);
    } catch { return []; }
  }

  // ── Encryption primitives ───────────────────────────────────
  _encrypt(plaintext, key) {
    const iv = crypto.randomBytes(IV_LEN);
    const cipher = crypto.createCipheriv(ALGO, key, iv);
    const enc = Buffer.concat([cipher.update(JSON.stringify(plaintext), 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return { iv: iv.toString('base64'), data: enc.toString('base64'), authTag: authTag.toString('base64') };
  }

  _decrypt(envelope, key) {
    const iv = Buffer.from(envelope.iv, 'base64');
    const authTag = Buffer.from(envelope.authTag, 'base64');
    const enc = Buffer.from(envelope.data, 'base64');
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(enc), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8'));
  }

  _deriveKey(password, salt) {
    return crypto.pbkdf2Sync(password, salt, KDF_ITERATIONS, KDF_KEYLEN, 'sha256');
  }

  _recoveryKey() {
    return this._deriveKey(this._recoveryKeyRaw, this._recoverySalt);
  }

  // ── Persist (encrypts with both keys) ───────────────────────
  _persist(operation, key) {
    try {
      const vault = JSON.parse(fs.readFileSync(this.vaultPath, 'utf8'));
      vault.data = this._encrypt(this.data, this._key);
      if (this._recoveryKeyRaw) {
        // Keep recovery envelope in sync with current data
        vault.recovery.data = this._encrypt(this.data, this._recoveryKey());
      }
      vault._updated = new Date().toISOString();
      const json = JSON.stringify(vault, null, 2);

      this._atomicWrite(this.vaultPath, json);

      try { fs.copyFileSync(this.vaultPath, this.backupPath); }
      catch (e) { this._audit(AUDIT_ACTIONS.BACKUP_FAIL, 'persist', e.message, null); }

      this._audit(AUDIT_ACTIONS[operation.toUpperCase()] || 'WRITE', 'ok', null, { key });
    } catch (e) {
      this._audit(AUDIT_ACTIONS.WRITE_FAIL, operation, e.message, { key });
      throw e;
    }
  }

  // ── Public API ───────────────────────────────────────────────

  init(masterPassword) {
    const v = PocketVault.validatePassword(masterPassword);
    if (v) {
      this._audit(AUDIT_ACTIONS.INIT, 'fail', v, null);
      throw new Error(v);
    }
    if (fs.existsSync(this.vaultPath)) {
      throw new Error('Vault already exists at ' + this.vaultPath);
    }
    if (!this._tryLock()) {
      throw new Error('Could not acquire vault lock — another process is using it');
    }

    try {
      const masterSalt = crypto.randomBytes(SALT_LEN);
      const recoverySalt = crypto.randomBytes(SALT_LEN);
      const recoveryKeyRaw = crypto.randomBytes(32).toString('hex');

      const masterKey = this._deriveKey(masterPassword, masterSalt);
      const recoveryKey = this._deriveKey(recoveryKeyRaw, recoverySalt);

      const data = { _created: new Date().toISOString() };
      const vault = {
        version: 3,
        kdf: { algo: 'pbkdf2', iterations: KDF_ITERATIONS, keylen: KDF_KEYLEN, digest: 'sha256' },
        master: { salt: masterSalt.toString('base64') },
        recovery: {
          salt: recoverySalt.toString('base64'),
          data: this._encrypt(data, recoveryKey),
        },
        // Encrypted copy of the recovery key (with master key) so unlock
        // can recover it for keeping the recovery envelope in sync
        _recoveryKeyEnc: this._encrypt(recoveryKeyRaw, masterKey),
        data: this._encrypt(data, masterKey),
      };

      this._atomicWrite(this.vaultPath, JSON.stringify(vault, null, 2));
      this._key = masterKey;
      this._recoveryKeyRaw = recoveryKeyRaw;
      this._recoverySalt = recoverySalt;
      this.data = data;

      this._audit(AUDIT_ACTIONS.INIT, 'ok', null, { path: this.vaultPath });
      return { recoveryKey: recoveryKeyRaw, vaultPath: this.vaultPath };
    } catch (e) {
      this._audit(AUDIT_ACTIONS.INIT, 'fail', e.message, null);
      throw e;
    } finally {
      // Init returns with key in memory but no lock held.
      // The user must explicitly unlock() to use it again — this
      // matches the pattern of any other "this object is now created"
      // initialization in security-sensitive libraries.
      this._unlock();
      // Clear the in-memory key so the next operation must call unlock()
      this._key = null;
      this._recoveryKeyRaw = null;
    }
  }

  unlock(masterPassword) {
    if (typeof masterPassword !== 'string' || masterPassword.length < 1) {
      throw new Error('master password required');
    }
    if (!this._tryLock()) {
      this._audit(AUDIT_ACTIONS.UNLOCK_FAIL, 'lock_busy', null, null);
      throw new Error('Vault is busy — another process has it open');
    }

    try {
      let vault = null;
      let fromBackup = false;
      try {
        vault = JSON.parse(fs.readFileSync(this.vaultPath, 'utf8'));
      } catch (e) {
        if (fs.existsSync(this.backupPath)) {
          vault = JSON.parse(fs.readFileSync(this.backupPath, 'utf8'));
          fromBackup = true;
          this._audit(AUDIT_ACTIONS.UNLOCK, 'fallback_to_backup', e.message, null);
        } else {
          this._audit(AUDIT_ACTIONS.UNLOCK_FAIL, 'no_file', e.message, null);
          throw new Error('Vault file missing or unreadable: ' + e.message);
        }
      }

      const masterSalt = Buffer.from(vault.master.salt, 'base64');
      const masterKey = this._deriveKey(masterPassword, masterSalt);

      let data = null;
      try {
        data = this._decrypt(vault.data, masterKey);
      } catch {
        this._audit(AUDIT_ACTIONS.UNLOCK_FAIL, 'bad_password', null, { fromBackup });
        throw new Error('Invalid master password');
      }

      this._key = masterKey;
      this._recoverySalt = Buffer.from(vault.recovery.salt, 'base64');

      // The recovery key was stored encrypted with the master key inside
      // the vault (vault._recoveryKeyEnc). Recover it so we can keep the
      // recovery envelope in sync with subsequent writes.
      if (vault._recoveryKeyEnc) {
        try {
          this._recoveryKeyRaw = this._decrypt(vault._recoveryKeyEnc, masterKey);
        } catch {
          this._recoveryKeyRaw = null;  // legacy vault
        }
      } else {
        this._recoveryKeyRaw = null;  // legacy vault without encrypted key
      }

      this.data = data;
      this._audit(AUDIT_ACTIONS.UNLOCK, 'ok', null, { fromBackup });
      return true;
    } catch (e) {
      this._key = null;
      this._unlock();
      throw e;
    }
  }

  /**
   * Recover with the recovery key (given at init). The new master password
   * becomes the new lock. The recovery key itself is regenerated — the
   * old one is invalidated.
   */
  recover(recoveryKeyHex, newMasterPassword) {
    if (typeof recoveryKeyHex !== 'string' || recoveryKeyHex.length < 32) {
      this._audit(AUDIT_ACTIONS.RECOVERY_FAIL, 'bad_input', null, null);
      throw new Error('Invalid recovery key');
    }
    const v = PocketVault.validatePassword(newMasterPassword);
    if (v) {
      this._audit(AUDIT_ACTIONS.RECOVERY_FAIL, 'bad_new_password', v, null);
      throw new Error(v);
    }
    if (!this._tryLock()) throw new Error('Vault is busy');

    try {
      const vault = JSON.parse(fs.readFileSync(this.vaultPath, 'utf8'));
      const recoverySalt = Buffer.from(vault.recovery.salt, 'base64');
      const recoveryKey = this._deriveKey(recoveryKeyHex, recoverySalt);

      let data = null;
      try {
        data = this._decrypt(vault.recovery.data, recoveryKey);
      } catch {
        this._audit(AUDIT_ACTIONS.RECOVERY_FAIL, 'bad_recovery_key', null, null);
        throw new Error('Invalid recovery key');
      }

      // Re-encrypt under the new master password
      const newMasterSalt = crypto.randomBytes(SALT_LEN);
      const newRecoveryKeyRaw = crypto.randomBytes(32).toString('hex');
      const newMasterKey = this._deriveKey(newMasterPassword, newMasterSalt);
      const newRecoveryKey = this._deriveKey(newRecoveryKeyRaw, recoverySalt);

      const newVault = {
        version: 3,
        kdf: vault.kdf,
        master: { salt: newMasterSalt.toString('base64') },
        recovery: {
          salt: recoverySalt.toString('base64'),
          data: this._encrypt(data, newRecoveryKey),
        },
        _recoveryKeyEnc: this._encrypt(newRecoveryKeyRaw, newMasterKey),
        data: this._encrypt(data, newMasterKey),
      };

      this._atomicWrite(this.vaultPath, JSON.stringify(newVault, null, 2));
      try { fs.copyFileSync(this.vaultPath, this.backupPath); }
      catch (e) { this._audit(AUDIT_ACTIONS.BACKUP_FAIL, 'recover', e.message, null); }

      this._key = newMasterKey;
      this._recoveryKeyRaw = newRecoveryKeyRaw;
      this._recoverySalt = recoverySalt;
      this.data = data;

      this._audit(AUDIT_ACTIONS.RECOVERY, 'ok', null, null);
      return { ok: true, recoveryKey: newRecoveryKeyRaw };
    } finally {
      this._unlock();
    }
  }
  set(key, value) {
    if (!this._key) {
      this._audit(AUDIT_ACTIONS.WRITE_FAIL, 'no_key', null, { op: 'set', key });
      throw new Error('Vault is locked. Call unlock() first.');
    }
    this.data[key] = value;
    this._persist('set', key);
  }

  get(key) {
    if (!this._key) return undefined;
    return this.data[key];
  }

  has(key) {
    if (!this._key) return false;
    return key in this.data;
  }

  delete(key) {
    if (!this._key) throw new Error('Vault is locked.');
    delete this.data[key];
    this._persist('delete', key);
  }

  list() {
    if (!this._key) return [];
    return Object.keys(this.data).filter(k => !k.startsWith('_'));
  }

  lock() {
    this._key = null;
    this._recoveryKeyRaw = null;
    this._recoverySalt = null;
    this.data = {};
    this._unlock();
  }
}

module.exports = { PocketVault, ALGO, KDF_ITERATIONS, MIN_PASSWORD_LEN, AUDIT_ACTIONS };
