# Onboarding Wizard (`purpclaw setup`)

> `lib/commands/setup.js` — Interactive provider configuration wizard built 2026-06-06.

## Purpose

Hand-hold new users through provider setup, API key auto-detection, and first-run configuration. Eliminates the "what do I type first" problem.

## Commands

```bash
purpclaw setup                 # full interactive wizard
purpclaw setup --list          # show all 16 providers + their status (no prompts)
purpclaw setup --quick         # auto-detect only, set first found as default
```

## Provider registry (16 providers)

Must match `lib/llm-provider.js` PROVIDERS. Each entry: id, name, keyEnv (null for local/free), baseUrl, optional free/local flags.

## Key scanning pattern

Scans in priority: ~/.env → project .env → cwd .env → /etc/environment → process.env. For each provider, searches for `KEY_ENV=value` pattern. Masks discovered keys: `sk-7d50f...c7a8` (first 8 + last 4).

## Wizard flow

1. Scan for keys → show status table with ✅/🆓/❌ icons
2. List ready providers (key found + free tier)
3. User picks default or enters a new API key
4. New key written to `.env` (append only if key doesn't exist)
5. Model picker with defaults from DEFAULT_MODELS map
6. Write `~/.purpclaw/config.json`
7. Test connection via `llm.chat()` — shows response and model
8. Print next steps

## Config format

```json
{ "provider": "deepseek", "model": "deepseek-chat", "setupAt": "...", "version": "0.1.0" }
```

## CLI wiring

```js
case 'setup': case 'wizard': case 'onboard': return loadCmd('setup').run(args, sharedCtx());
```

## Pitfalls

- Skip values containing `your-`, `***`, or shorter than 10 chars (false positives)
- .env append, don't overwrite existing keys
- Ollama detection uses curl — if curl fails, shows as needing install
- Provider list must stay in sync with llm-provider.js PROVIDERS registry
