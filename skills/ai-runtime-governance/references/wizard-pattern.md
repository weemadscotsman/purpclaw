# Interactive CLI Wizard Pattern — cmdInitWizard (May 24 2026)

Six-step onboarding wizard for `purpclaw init --wizard`. Full implementation in `bin/purpclaw.js` at `cmdInitWizard()`.

---

## Pattern: `ask()` — visible input with default

```javascript
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: isTTY });
const ask = (q, def = '') => new Promise(r => {
  const tail = def ? col(C.gray, ` [${def}]`) : '';
  rl.question(`  ${col(C.cyan, '?')} ${q}${tail} `, ans => r((ans || '').trim() || def));
});
```

---

## Pattern: `askSecret()` — masked hidden input (TTY raw mode)

Handles: character echo as `*`, backspace (`\b`/`\u007f`), Ctrl-C (`\u0003` → hard exit 130), Enter to confirm.

```javascript
const askSecret = (q) => new Promise(r => {
  process.stdout.write(`  ${col(C.cyan, '?')} ${q} `);
  const stdin = process.stdin;
  if (stdin.isTTY) stdin.setRawMode && stdin.setRawMode(true);
  let buf = '';

  function onData(b) {
    const ch = b.toString('utf8');
    if (ch === '\r' || ch === '\n') {
      stdin.removeListener('data', onData);
      if (stdin.isTTY) stdin.setRawMode && stdin.setRawMode(false);
      process.stdout.write('\n');
      r(buf);
    } else if (ch === '\u0003') {  // ctrl-c
      if (stdin.isTTY) stdin.setRawMode && stdin.setRawMode(false);
      process.stdout.write('\n');
      process.exit(130);
    } else if (ch === '\u007f' || ch === '\b') {  // DEL / backspace
      if (buf.length) { buf = buf.slice(0, -1); process.stdout.write('\b \b'); }
    } else {
      buf += ch;
      process.stdout.write('*');
    }
  }

  stdin.on('data', onData);
  stdin.resume();
});
```

**Key rules:**
- `stdin.setRawMode(true)` only on TTY — skip in CI/pipes
- `stdin.removeListener` before resolving to prevent stale callbacks
- `stdin.isTTY && stdin.setRawMode(false)` in both resolve and ctrl-c paths
- Use `'\u0003'` (not `'\x03'`) for Ctrl-C in JavaScript string comparison

---

## Pattern: Detached boot spawn — wizard exits, swarm runs

```javascript
const { spawn } = require('child_process');
const rl2 = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: isTTY });

const boot = await new Promise(r => {
  if (!isTTY) return r(false);  // non-interactive: skip, don't block
  rl2.question(col(C.cyan + C.bold, '  Boot the swarm now? ') + col(C.gray, '[Y/n] '),
    ans => r(ans !== 'n' && ans !== 'N'));
});
rl2.close();

if (boot) {
  const proc = spawn('node', ['bin/purpclaw.js', 'start'], {
    cwd: PURP_DIR,
    stdio: 'inherit',
    detached: true,
    shell: true,
  });
  proc.unref();  // wizard can exit; child keeps running
  console.log(col(C.gray, '  Watch: purpclaw status  ·  Web: http://localhost:3000\n'));
}
```

**Why `shell: true` on Windows**: paths with spaces in `cwd` cause `EINVAL` spawn errors without it. `shell: true` wraps via `cmd.exe /c`.

---

## Pattern: Persist to `.env` — update existing or append

```javascript
function setEnvKey(body, key, value) {
  if (!value) return body;
  const lines = body.split(/\r?\n/);
  let found = false;
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i].trim();
    if (!ln || ln.startsWith('#')) continue;
    const eq = ln.indexOf('=');
    if (eq > 0 && ln.substring(0, eq).trim() === key) {
      lines[i] = `${key}=${value}`;
      found = true; break;
    }
  }
  if (!found) lines.push(`${key}=${value}`);
  return lines.join('\n');
}

// Usage:
envBody = setEnvKey(envBody, 'LLM_PROVIDER', provider.key);
if (apiKey)  envBody = setEnvKey(envBody, 'LLM_API_KEY', apiKey);
if (baseUrl) envBody = setEnvKey(envBody, 'LLM_BASE_URL', baseUrl);
if (model)   envBody = setEnvKey(envBody, 'LLM_MODEL', model);
fs.writeFileSync(envPath, envBody.trim() + '\n', 'utf8');

// Re-export into current process so subsequent steps see the new vars
process.env.LLM_PROVIDER = provider.key;
```

---

## Six-Step Wizard Checklist

| Step | Ask | Persist to .env |
|------|-----|-----------------|
| 1. Provider pick | `ask()` number → pick from list | `setEnvKey('LLM_PROVIDER', key)` |
| 2. API key | `askSecret()` masked | `setEnvKey('LLM_API_KEY', key)` |
| 3. Model name | `ask()` with provider default | `setEnvKey('LLM_MODEL', model)` |
| 4. Base URL | `ask()` for Ollama/Custom | `setEnvKey('LLM_BASE_URL', url)` |
| 5. Companion seed | `ask()` with `$USER` default | `setEnvKey('PURPCLAW_MOCHI_SEED', seed)` |
| 6. LLM smoke-test | `llm.complete('Say the single word: ready')` | — |

After smoke-test: boot offer → ready screen.

---

## Provider Defaults (as wired May 24 2026)

```javascript
const providers = [
  { key: 'minimax',    label: 'MiniMax (M2.7) — recommended, has a generous tier' },
  { key: 'anthropic', label: 'Anthropic Claude' },
  { key: 'openai',    label: 'OpenAI (GPT-4o etc.)' },
  { key: 'kimi',       label: 'Kimi / Moonshot' },
  { key: 'groq',       label: 'Groq (fast inference)' },
  { key: 'deepseek',   label: 'DeepSeek' },
  { key: 'openrouter', label: 'OpenRouter (access 200+ models with one key)' },
  { key: 'ollama',     label: 'Ollama (fully local, no key needed)' },
  { key: 'custom',    label: 'Custom (paste an OpenAI-compatible URL)' },
];
// Model defaults per provider:
if (provider.key === 'minimax')    model = await ask('Model name:', 'MiniMax-M2.7');
if (provider.key === 'anthropic')  model = await ask('Model name:', 'claude-sonnet-4-5');
if (provider.key === 'openai')     model = await ask('Model name:', 'gpt-4o');
if (provider.key === 'ollama')    { baseUrl = await ask('Ollama base URL:', 'http://localhost:11434/v1'); model = await ask('Model name:', 'llama3.2'); }
// Skip key for ollama and custom (baseUrl IS the credential)
```