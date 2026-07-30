'use strict';

/**
 * lib/commands/secrets.js
 * purpclaw secrets — Credential + secret management CLI
 *
 * Codex parity: codex secrets detect/scrub/check
 * Credentials: lib/credentials-store.js (TOML, 26 env vars mapped, migrate/import)
 * Redaction: lib/secret-redactor.js (redact(), sanitizeApiKey(), maskForDisplay())
 * Storage: ~/.purpclaw/credentials.toml
 */

const path = require('path');
const fs   = require('fs');

const CREDS = (() => {
  try { return require(path.join(__dirname, '..', 'credentials-store')); } catch { return null; }
})();

const REDACTOR = (() => {
  try { return require(path.join(__dirname, '..', 'secret-redactor')); } catch { return null; }
})();

async function run(args, ctx = {}) {
  if (!CREDS) {
    console.log('error: credentials-store not available');
    return 1;
  }

  const sub  = (args[0] || 'list').toLowerCase();
  const json = args.includes('--json');
  const env  = args.includes('--env');  // show env var names too

  // ── secrets list ──────────────────────────────────────────────────────────
  if (sub === 'list' || sub === 'ls') {
    const entries = CREDS.list();
    if (json) {
      console.log(JSON.stringify({ secrets: entries }, null, 2));
      return;
    }
    if (!entries.length) {
      console.log('No credentials stored. Run `purpclaw login <provider>` to add one.');
      return;
    }
    console.log(`\nSTORED CREDENTIALS  (${entries.length})\n`);
    for (const e of entries) {
      console.log(`  ${e.provider.padEnd(16)}  ${e.masked}`);
    }
    console.log('');
    return;
  }

  // ── secrets add <provider> <key> [--env VAR] ────────────────────────────
  if (sub === 'add' || sub === 'set') {
    const provider = args[1];
    const rawKey   = args[2];
    if (!provider || !rawKey) {
      console.log('usage: purpclaw secrets add <provider> <key> [--env VAR] [--json]');
      return 1;
    }
    try {
      CREDS.store(provider, rawKey);
      const masked = REDACTOR ? REDACTOR.maskForDisplay(rawKey) : rawKey.slice(0,4) + '…' + rawKey.slice(-4);
      console.log(json
        ? JSON.stringify({ ok: true, provider, masked })
        : `✓ stored ${provider}: ${masked}`);
    } catch (e) {
      console.log(json ? JSON.stringify({ ok: false, error: e.message }) : `error: ${e.message}`);
    }
    return;
  }

  // ── secrets remove <provider> ────────────────────────────────────────────
  if (sub === 'remove' || sub === 'rm' || sub === 'delete') {
    const provider = args[1];
    if (!provider) {
      console.log('usage: purpclaw secrets remove <provider> [--json]');
      return 1;
    }
    const ok = CREDS.remove(provider);
    console.log(json
      ? JSON.stringify({ ok, provider })
      : ok ? `✓ removed ${provider}` : `✗ not found: ${provider}`);
    return ok ? 0 : 1;
  }

  // ── secrets check <string> ───────────────────────────────────────────────
  if (sub === 'check' || sub === 'detect') {
    const target = args[1];
    if (!target) {
      console.log('usage: purpclaw secrets check <string-or-file> [--json]');
      return 1;
    }
    let content = target;
    if (fs.existsSync(target)) {
      try { content = fs.readFileSync(target, 'utf-8'); } catch { /* use target as string */ }
    }
    if (REDACTOR) {
      const result = REDACTOR.detect(content);
      if (json) {
        console.log(JSON.stringify({ clean: result.clean, findings: result.findings }, null, 2));
      } else if (result.clean) {
        console.log('✓ no secrets detected');
      } else {
        console.log(`⚠ ${result.findings.length} secret(s) detected:\n`);
        for (const f of result.findings) {
          const shown = f.match.length > 16 ? f.match.slice(0, 12) + '…' : f.match;
          console.log(`  [${f.type}] ${shown}`);
        }
      }
    } else {
      console.log(json
        ? JSON.stringify({ clean: true, findings: [], note: 'redactor not available' })
        : 'redactor not available — cannot check content');
    }
    return;
  }

  // ── secrets redact <string-or-file> ───────────────────────────────────────
  if (sub === 'redact') {
    const target = args[1];
    if (!target) {
      console.log('usage: purpclaw secrets redact <string-or-file> [--json]');
      return 1;
    }
    let content = target;
    if (fs.existsSync(target)) {
      try { content = fs.readFileSync(target, 'utf-8'); } catch { /* use target as string */ }
    }
    if (REDACTOR) {
      const scrubbed = REDACTOR.redact(content);
      console.log(scrubbed);
    } else {
      console.log(content);
    }
    return;
  }

  // ── secrets migrate [path-to-env] ─────────────────────────────────────────
  if (sub === 'migrate') {
    const dotenvPath = args[1] || null;
    const results = CREDS.migrateFromEnv(dotenvPath);
    if (!results.length) {
      console.log(json ? JSON.stringify({ imported: 0, skipped: 0 }) : 'No API key env vars found to migrate.');
      return;
    }
    const imported = results.filter(r => r.imported);
    const skipped  = results.filter(r => !r.imported);
    if (json) {
      console.log(JSON.stringify({ imported, skipped }, null, 2));
    } else {
      if (imported.length) console.log(`↑ imported: ${imported.map(r => r.provider).join(', ')}`);
      if (skipped.length)  console.log(`⊘ skipped (already set): ${skipped.map(r => r.provider).join(', ')}`);
      if (!imported.length && !skipped.length) console.log('No API key env vars found to migrate.');
    }
    return;
  }

  // ── secrets env ───────────────────────────────────────────────────────────
  // Show which env vars map to which providers
  if (sub === 'env' || sub === 'envvars') {
    const MAP = [
      ['OPENAI_API_KEY',                  'openai'],
      ['ANTHROPIC_API_KEY',               'anthropic'],
      ['CLAUDE_API_KEY',                  'anthropic'],
      ['GEMINI_API_KEY',                  'gemini'],
      ['GOOGLE_API_KEY',                  'gemini'],
      ['KIMI_API_KEY',                   'kimi'],
      ['MOONSHOT_API_KEY',                'kimi'],
      ['GLM_API_KEY',                    'glm'],
      ['ZAI_API_KEY',                    'glm'],
      ['MINIMAX_API_KEY',                'minimax'],
      ['NVIDIA_API_KEY',                  'nvidia'],
      ['NVIDIA_NIM_API_KEY',             'nvidia'],
      ['OPENROUTER_API_KEY',             'openrouter'],
      ['HUGGINGFACE_API_KEY',            'huggingface'],
      ['HF_TOKEN',                       'huggingface'],
      ['GROQ_API_KEY',                   'groq'],
      ['DEEPSEEK_API_KEY',               'deepseek'],
      ['TOGETHER_API_KEY',               'together'],
      ['MISTRAL_API_KEY',                'mistral'],
      ['COHERE_API_KEY',                 'cohere'],
      ['CLOUDFLARE_API_TOKEN',          'cloudflare'],
      ['LLM_API_KEY',                    'openai'],
    ];
    if (json) {
      console.log(JSON.stringify({ envvars: MAP }, null, 2));
    } else {
      console.log('\nENV VAR → PROVIDER MAP\n');
      for (const [envVar, provider] of MAP) {
        console.log(`  ${envVar.padEnd(30)} → ${provider}`);
      }
      console.log('');
    }
    return;
  }

  // Help
  console.log(`purpclaw secrets — Credential & secret management
  purpclaw secrets list                    list stored credentials (masked)
  purpclaw secrets add <provider> <key>  store a credential
  purpclaw secrets remove <provider>      delete a credential
  purpclaw secrets check <string|file>    detect secrets in text or file
  purpclaw secrets redact <string|file>   scrub secrets from text or file
  purpclaw secrets migrate [.env]        import API keys from env vars
  purpclaw secrets env                    show all env var → provider mappings
  purpclaw secrets --env                  show env var names in list output
  purpclaw secrets --json                 JSON output (append to any subcommand)
`);
}

module.exports = { run };
