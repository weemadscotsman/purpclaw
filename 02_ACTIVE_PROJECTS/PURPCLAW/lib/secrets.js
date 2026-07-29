'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SECRETS_DIR = path.join(__dirname, 'agent_work', 'secrets');

// ── TDO ───────────────────────────────────────────────────────────────────────

// One level up from lib/ → project root
const TDO_FILE = path.join(__dirname, '..', 'agent_work', 'harness_lessons.jsonl');

function tdoRecord(task, success, outputPreview) {
  try {
    if (typeof task === 'object') {
      const o = task;
      task = o.task;
      success = o.success;
      outputPreview = o.outputPreview;
    }
    const entry = {
      source: 'purpclaw-cli',
      agent: 'purpclaw-cli',
      task: String(task || ''),
      success: Boolean(success),
      outputPreview: String(outputPreview || '').slice(0, 120),
      timestamp: new Date().toISOString(),
    };
    fs.appendFileSync(TDO_FILE, JSON.stringify(entry) + '\n');
  } catch {}
}

// ── Provider detection ────────────────────────────────────────────────────────

function detectProvider() {
  const tools = ['bw', 'op', 'keepassxc-cli', 'gopass', 'pass'];
  for (const tool of tools) {
    try {
      execSync(`${tool} --version`, { stdio: 'ignore', timeout: 3000 });
      return tool;
    } catch {}
  }
  return null;
}

const PROVIDER = detectProvider();

// ── Bitwarden CLI ─────────────────────────────────────────────────────────────

function bwAvailable() { return PROVIDER === 'bw'; }

function bwLogin(email, password) {
  if (!bwAvailable()) throw new Error('Bitwarden CLI (bw) not found. Install: scoop install bitwarden-cli');
  const home = process.env.HOME || process.env.USERPROFILE;
  const bwConfigDir = path.join(home, '.bw');
  const sessFile = path.join(bwConfigDir, 'session.key');

  // Check for cached session
  if (fs.existsSync(sessFile)) {
    try {
      const key = fs.readFileSync(sessFile, 'utf8').trim();
      execSync('bw unlock --check', { stdio: 'ignore', env: { ...process.env, BW_SESSION: key } });
      return key;
    } catch {}
  }

  // Attempt login
  const result = execSync(
    `bw login ${JSON.stringify(email)} ${JSON.stringify(password)} --response`,
    { encoding: 'utf8', timeout: 15000 }
  ).trim();

  let sessionKey = null;
  try {
    const parsed = JSON.parse(result);
    sessionKey = parsed.data?.token || parsed.token || null;
  } catch {}

  if (!sessionKey) {
    throw new Error('bw login succeeded but session key not returned. Run `bw login` interactively once.');
  }

  if (!fs.existsSync(bwConfigDir)) fs.mkdirSync(bwConfigDir, { recursive: true });
  fs.writeFileSync(sessFile, sessionKey, { mode: 0o600 });
  return sessionKey;
}

function bwGet(sessionKey, itemId) {
  if (!bwAvailable()) throw new Error('Bitwarden CLI (bw) not found');
  const env = { ...process.env, BW_SESSION: sessionKey };
  const out = execSync(`bw get item ${itemId}`, { encoding: 'utf8', env, timeout: 10000 });
  return JSON.parse(out);
}

function bwGetByName(sessionKey, name) {
  if (!bwAvailable()) throw new Error('Bitwarden CLI (bw) not found');
  const env = { ...process.env, BW_SESSION: sessionKey };
  const out = execSync(`bw list items --search ${JSON.stringify(name)}`, { encoding: 'utf8', env, timeout: 10000 });
  const items = JSON.parse(out);
  return items.find(i => i.name === name) || null;
}

function bwListFields(sessionKey, itemId, fieldName) {
  if (!bwAvailable()) throw new Error('Bitwarden CLI (bw) not found');
  const item = bwGet(sessionKey, itemId);
  const fields = item.fields || [];
  return fields.find(f => f.name === fieldName && f.value) || null;
}

function bwSync(sessionKey) {
  if (!bwAvailable()) throw new Error('Bitwarden CLI (bw) not found');
  const env = { ...process.env, BW_SESSION: sessionKey };
  execSync('bw sync', { env, timeout: 30000 });
}

function bwLogout(sessionKey) {
  if (!bwAvailable()) return;
  try {
    const env = { ...process.env, BW_SESSION: sessionKey };
    execSync('bw lock', { env, stdio: 'ignore', timeout: 5000 });
  } catch {}
  const home = process.env.HOME || process.env.USERPROFILE;
  const sessFile = path.join(home, '.bw', 'session.key');
  if (fs.existsSync(sessFile)) fs.unlinkSync(sessFile);
}

// ── 1Password CLI ─────────────────────────────────────────────────────────────

function opAvailable() { return PROVIDER === 'op'; }

function opGet(vault, itemName) {
  if (!opAvailable()) throw new Error('1Password CLI (op) not found');
  const out = execSync(`op read "op://${vault}/${itemName}/password"`, { encoding: 'utf8', timeout: 10000 }).trim();
  return out;
}

// ── Unified API ────────────────────────────────────────────────────────────────

let _sessionKey = null;

function getSessionKey() {
  if (_sessionKey) return _sessionKey;
  if (!bwAvailable()) return null;
  const home = process.env.HOME || process.env.USERPROFILE;
  const sessFile = path.join(home, '.bw', 'session.key');
  if (fs.existsSync(sessFile)) {
    _sessionKey = fs.readFileSync(sessFile, 'utf8').trim();
    return _sessionKey;
  }
  return null;
}

function ensureUnlocked() {
  const key = getSessionKey();
  if (key) return key;
  if (!bwAvailable()) return null;
  throw new Error('Bitwarden vault is locked. Run: purpclaw secrets unlock <email> <password>');
}

/**
 * Get a secret by name (searches Bitwarden by name).
 * Returns the password/notes of the matching item.
 */
function get(name) {
  if (!bwAvailable()) throw new Error('Bitwarden CLI (bw) not installed. Install: scoop install bitwarden-cli');
  const key = ensureUnlocked();
  const item = bwGetByName(key, name);
  if (!item) throw new Error(`Secret not found: ${name}`);
  const login = item.login || {};
  return {
    name: item.name,
    username: login.username || null,
    password: login.password || null,
    notes: item.notes || null,
    uris: (login.uris || []).map(u => u.uri),
    totp: login.totp || null,
    fields: item.fields || [],
  };
}

/**
 * Get a specific field from a secret item.
 */
function getField(name, field) {
  if (!bwAvailable()) throw new Error('Bitwarden CLI (bw) not installed. Install: scoop install bitwarden-cli');
  const key = ensureUnlocked();
  const item = bwGetByName(key, name);
  if (!item) throw new Error(`Secret not found: ${name}`);
  if (field === 'password') return item.login?.password || null;
  if (field === 'username') return item.login?.username || null;
  if (field === 'notes') return item.notes || null;
  if (field === 'totp') return item.login?.totp || null;
  if (field === 'uri' || field === 'url') return item.login?.uris?.[0]?.uri || null;
  const f = (item.fields || []).find(f => f.name === field);
  return f?.value || null;
}

/**
 * Inject secrets into environment variables for a child process.
 * Reads secrets from Bitwarden and merges into process.env.
 */
function injectToEnv(names, extraEnv) {
  const key = ensureUnlocked();
  const env = { ...(extraEnv || process.env) };
  for (const name of names) {
    const secret = get(name);
    const envKey = name.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    if (secret.password) env[envKey + '_PASSWORD'] = secret.password;
    if (secret.username) env[envKey + '_USERNAME'] = secret.username;
    if (secret.uris && secret.uris[0]) env[envKey + '_URL'] = secret.uris[0];
    if (secret.totp) env[envKey + '_TOTP'] = secret.totp;
  }
  return env;
}

/**
 * Status of the vault provider.
 */
function status() {
  if (!PROVIDER) {
    return {
      provider: null,
      available: false,
      message: 'No vault CLI found. Install Bitwarden CLI: scoop install bitwarden-cli',
    };
  }
  const key = getSessionKey();
  if (!key) {
    return { provider: PROVIDER, available: true, locked: true, message: 'Vault is locked. Run: purpclaw secrets unlock <email> <password>' };
  }
  return { provider: PROVIDER, available: true, locked: false, message: 'Vault is unlocked' };
}

function lock() {
  if (bwAvailable()) {
    bwLogout(_sessionKey);
    _sessionKey = null;
  }
}

function unlock(email, password) {
  if (!bwAvailable()) throw new Error('Bitwarden CLI (bw) not installed');
  _sessionKey = bwLogin(email, password);
  return _sessionKey;
}

// ── CLI command ────────────────────────────────────────────────────────────────

function cmdSecrets(args) {
  const sub = args[0] || 'status';
  const rest = args.slice(1);

  switch (sub) {
    case 'status': {
      const s = status();
      console.log(`Provider:  ${s.provider || 'none'}`);
      console.log(`Available: ${s.available ? 'yes' : 'no'}`);
      if (s.locked !== undefined) console.log(`Locked:    ${s.locked}`);
      console.log(`Message:   ${s.message}`);
      tdoRecord({ task: 'secrets status', success: true, outputPreview: `provider=${s.provider || 'none'}` });
      return 0;
    }

    case 'unlock': {
      if (!bwAvailable()) { console.log('Bitwarden CLI not found.'); return 1; }
      const email = rest[0];
      const password = rest[1];
      if (!email || !password) { console.log('Usage: purpclaw secrets unlock <email> <password>'); return 1; }
      try {
        unlock(email, password);
        console.log('Vault unlocked. Session cached.');
        tdoRecord({ task: 'secrets unlock', success: true, outputPreview: 'unlocked' });
        return 0;
      } catch (e) {
        console.log('Unlock failed:', e.message);
        tdoRecord({ task: 'secrets unlock', success: false, outputPreview: e.message });
        return 1;
      }
    }

    case 'lock': {
      lock();
      console.log('Vault locked.');
      tdoRecord({ task: 'secrets lock', success: true, outputPreview: 'locked' });
      return 0;
    }

    case 'get': {
      if (!bwAvailable()) { console.log('Bitwarden CLI not found.'); return 1; }
      const name = rest[0];
      const field = rest[1];
      if (!name) { console.log('Usage: purpclaw secrets get <name> [field]'); return 1; }
      try {
        if (field) {
          const val = getField(name, field);
          if (val === null) { console.log(`Field '${field}' not found on secret '${name}'`); return 1; }
          console.log(val);
          tdoRecord({ task: `secrets get ${name} ${field}`, success: true, outputPreview: field + '=***' });
        } else {
          const secret = get(name);
          console.log(`Name:     ${secret.name}`);
          console.log(`Username: ${secret.username || '—'}`);
          console.log(`Password: ${secret.password ? '********' : '—'}`);
          console.log(`URL:      ${secret.uris[0] || '—'}`);
          tdoRecord({ task: `secrets get ${name}`, success: true, outputPreview: 'found' });
        }
        return 0;
      } catch (e) {
        console.log('Error:', e.message);
        tdoRecord({ task: `secrets get ${name}`, success: false, outputPreview: e.message });
        return 1;
      }
    }

    case 'list': {
      if (!bwAvailable()) { console.log('Bitwarden CLI not found.'); return 1; }
      try {
        const key = ensureUnlocked();
        const env = { ...process.env, BW_SESSION: key };
        const out = execSync('bw list items', { encoding: 'utf8', env, timeout: 10000 });
        const items = JSON.parse(out);
        if (!items.length) { console.log('No items found.'); return 0; }
        items.forEach(i => console.log(`  ${i.name}  [${i.id}]`));
        tdoRecord({ task: 'secrets list', success: true, outputPreview: `${items.length} items` });
        return 0;
      } catch (e) {
        console.log('Error listing items:', e.message);
        tdoRecord({ task: 'secrets list', success: false, outputPreview: e.message });
        return 1;
      }
    }

    case 'sync': {
      if (!bwAvailable()) { console.log('Bitwarden CLI not found.'); return 1; }
      try {
        const key = ensureUnlocked();
        bwSync(key);
        console.log('Vault synced.');
        tdoRecord({ task: 'secrets sync', success: true, outputPreview: 'synced' });
        return 0;
      } catch (e) {
        console.log('Sync failed:', e.message);
        tdoRecord({ task: 'secrets sync', success: false, outputPreview: e.message });
        return 1;
      }
    }

    default:
      console.log('Usage: purpclaw secrets <status|unlock|lock|get|list|sync>');
      console.log('Native vault: purpclaw vault <init|set|get|list|rm|passwd>');
      return 1;
  }
}

module.exports = {
  get, getField, injectToEnv,
  status, unlock, lock,
  cmdSecrets,
  isAvailable: bwAvailable,
  provider: PROVIDER,
};
