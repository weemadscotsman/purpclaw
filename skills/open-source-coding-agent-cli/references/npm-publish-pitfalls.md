# npm publish pitfalls learned from v0.1.0–v0.1.4 publishes

## CRLF in bin/purpclaw.js strips the bin field

**Problem:** npm publish on Windows sees `#!/usr/bin/env node\r\n` as an invalid shebang because of CRLF line endings. It strips the entire `bin` entry from package.json during publish. Users who `npm install -g purpclaw` get a `purpclaw` command that points to the old root `purpclaw.js` (the pre-CLI version) instead of `bin/purpclaw.js` (the new CLI with all commands).

**Symptoms:** User types `purpclaw` and gets the old help screen, not the new first-run menu with provider detection and 7 launch options. The `purpclaw ask` command works but the no-args experience is wrong.

**Fix:**
```bash
tr -d '\r' < bin/purpclaw.js > bin/purpclaw-lf.js
mv bin/purpclaw-lf.js bin/purpclaw.js
```
Then verify: `file bin/purpclaw.js` should show "UTF-8 text" NOT "with CRLF line terminators".

Also set `"main": "bin/purpclaw.js"` in package.json as a fallback.

## npm 2FA recovery codes are ONE-TIME-USE

Each of the 5 recovery codes from npm can only be used once. After all 5 are consumed, you need:
1. Generate a new token on npmjs.com with **"Bypass two-factor authentication (2FA)"** enabled
2. OR use `--otp=<code>` from an authenticator app

**Token generation:**
- npmjs.com → Access Tokens → Generate New Token
- Type: Granular Access Token
- Permissions: Read and write packages
- ✅ Bypass two-factor authentication (2FA)

## Package.json `files` field must include `bin/`

The `"files"` array in package.json must explicitly include `"bin/"` or npm won't include it in the tarball. Check with `npm pack --dry-run` before publishing.

## npm publish dry-run passes but real publish fails

`npm publish --dry-run` doesn't check auth. Only the real publish catches 2FA/ENEEDAUTH errors. Always budget a few publish attempts for the first time.

## Windows system env vars override .env

On Windows, `setx DEEPSEEK_API_KEY` writes to the system/user environment, which takes precedence over `.env` files loaded by dotenv. If the user has an old key in Windows env, it overrides the new key in `.env`. Fix: `setx DEEPSEEK_API_KEY ""` to clear it, then `setx DEEPSEEK_API_KEY "new-key"`.
