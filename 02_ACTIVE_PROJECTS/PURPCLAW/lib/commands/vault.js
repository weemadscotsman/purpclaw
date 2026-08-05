'use strict';
const PURP_PATHS = require('../paths');
/**
 * lib/commands/vault.js — Native Secret Vault CLI command
 * 
 * AES-256-GCM encrypted secret store. Commands:
 *   purpclaw vault init        Create a new vault with a passphrase
 *   purpclaw vault set <n> <v> Set a secret
 *   purpclaw vault get <n>    Get a secret (prints to stdout)
 *   purpclaw vault list       List secret names
 *   purpclaw vault rm <n>    Remove a secret
 *   purpclaw vault passwd     Change passphrase
 */

const path = require('path');
const os   = require('os');
const fs   = require('fs');
const readline = require('readline');
const { SecretVault } = require('../secret-vault');

const VAULT_DIR = path.join(PURP_PATHS.DATA_ROOT, 'vault');

function ask(prompt) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(prompt, ans => { rl.close(); resolve(ans); });
  });
}

function vaultPath() {
  if (!fs.existsSync(VAULT_DIR)) fs.mkdirSync(VAULT_DIR, { recursive: true });
  return VAULT_DIR;
}

async function cmdVault(args) {
  const sub = args[0] || 'help';
  const vault = new SecretVault({ vaultPath: vaultPath() });

  // ── vault init ───────────────────────────────────────────────────────────────
  if (sub === 'init') {
    if (vault.exists()) {
      console.log('Vault already initialized. Use `purpclaw vault passwd` to change your passphrase.');
      return 1;
    }
    const p1 = await ask('Create vault passphrase: ');
    const p2 = await ask('Confirm passphrase: ');
    if (p1 !== p2) { console.log('Passphrases do not match.'); return 1; }
    if (p1.length < 8) { console.log('Passphrase must be at least 8 characters.'); return 1; }
    await vault.init(p1);
    await vault.putTest();
    vault.lock();
    console.log('Vault initialized at ~/.purpclaw/vault/');
    console.log('Store your passphrase safely — it cannot be recovered if lost.');
    return 0;
  }

  // ── vault status / list ────────────────────────────────────────────────────
  if (sub === 'status' || sub === 'list') {
    if (!vault.exists()) {
      console.log('Vault not initialized. Run `purpclaw vault init` first.');
      return 1;
    }
    const names = vault.list();
    console.log('Vault: ~/.purpclaw/vault/');
    console.log('Secrets: ' + names.length);
    if (names.length) names.forEach(n => console.log('  ' + n));
    else console.log('  (empty)');
    return 0;
  }

  // ── vault set ─────────────────────────────────────────────────────────────
  if (sub === 'set' || sub === 'put') {
    const [name, ...restVal] = args.slice(1);
    if (!name) { console.log('Usage: purpclaw vault set <name> [value]'); return 1; }
    let value = restVal.join(' ');
    if (!value) value = await ask('Secret value: ');
    const pw = await ask('Vault passphrase: ');
    try {
      await vault.unlock(pw);
      await vault.put(name, value);
      vault.lock();
      console.log('Stored: ' + name);
      return 0;
    } catch (e) {
      vault.lock();
      if (e.message.includes('Invalid passphrase')) {
        console.log('Error: Invalid passphrase.');
      } else {
        console.error('Error: ' + e.message);
      }
      return 1;
    }
  }

  // ── vault get ─────────────────────────────────────────────────────────────
  if (sub === 'get') {
    const name = args[1];
    if (!name) { console.log('Usage: purpclaw vault get <name>'); return 1; }
    const pw = await ask('Vault passphrase: ');
    try {
      await vault.unlock(pw);
      const val = await vault.get(name);
      vault.lock();
      if (val === null) { console.log('Secret not found: ' + name); return 1; }
      process.stdout.write(val + '\n');
      return 0;
    } catch (e) {
      vault.lock();
      if (e.message.includes('Invalid passphrase')) {
        console.log('Error: Invalid passphrase.');
      } else {
        console.error('Error: ' + e.message);
      }
      return 1;
    }
  }

  // ── vault rm ──────────────────────────────────────────────────────────────
  if (sub === 'rm' || sub === 'remove') {
    const name = args[1];
    if (!name) { console.log('Usage: purpclaw vault rm <name>'); return 1; }
    const pw = await ask('Vault passphrase: ');
    try {
      await vault.unlock(pw);
      const removed = await vault.remove(name);
      vault.lock();
      console.log(removed ? 'Removed: ' + name : 'Not found: ' + name);
      return removed ? 0 : 1;
    } catch (e) {
      vault.lock();
      console.error('Error: ' + e.message);
      return 1;
    }
  }

  // ── vault passwd ──────────────────────────────────────────────────────────
  if (sub === 'passwd' || sub === 'change-passphrase') {
    if (!vault.exists()) { console.log('Vault not initialized.'); return 1; }
    const oldPw = await ask('Current passphrase: ');
    const newPw = await ask('New passphrase: ');
    const newPw2 = await ask('Confirm new passphrase: ');
    if (newPw !== newPw2) { console.log('New passphrases do not match.'); return 1; }
    if (newPw.length < 8) { console.log('New passphrase must be at least 8 characters.'); return 1; }
    try {
      await vault.changePassphrase(oldPw, newPw);
      console.log('Passphrase changed successfully.');
      return 0;
    } catch (e) {
      if (e.message.includes('Invalid passphrase')) {
        console.log('Error: Invalid current passphrase.');
      } else {
        console.error('Error: ' + e.message);
      }
      return 1;
    }
  }

  // ── vault help ───────────────────────────────────────────────────────────
  console.log('Usage: purpclaw vault <init|set|get|list|rm|passwd>');
  console.log('');
  console.log('  init      Create a new encrypted vault with a passphrase');
  console.log('  set <n> [v]  Store secret "n" with value "v" (prompts if omitted)');
  console.log('  get <n>      Print secret "n" to stdout (prompts for passphrase)');
  console.log('  list         Show all secret names (no values)');
  console.log('  rm <n>       Remove secret "n"');
  console.log('  passwd       Change vault passphrase');
  console.log('');
  console.log('Vault: ~/.purpclaw/vault/ (AES-256-GCM, PBKDF2 100k, per-secret salts)');
  return 1;
}

module.exports = { run: cmdVault };
