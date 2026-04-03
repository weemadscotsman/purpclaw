# npm publish with 2FA — Recovery Code Pattern

## Problem
npm requires 2FA to publish. Access tokens with "bypass 2FA" need to be explicitly enabled, and the user may not have set that up. Recovery codes can be used as OTP to bypass 2FA.

## Recovery Code Pattern

When npm says:
```
403 Forbidden - Two-factor authentication or granular access token with bypass 2fa enabled is required
```

Use a recovery code from the user's npm recovery codes:

```bash
npm publish --otp=<recovery-code>
```

Each recovery code works ONCE. You need one fresh code per publish attempt.

## Token Pattern (Better)

If the user generates an access token with "Bypass 2FA" enabled:

```bash
npm publish --//registry.npmjs.org/:_authToken=npm_XXXXXXXXXXXXXXXXXXXX
```

## Session Example (2026-06-06)

Eddie published purpclaw@0.1.0 through 0.1.4 using recovery codes:

1. `npm publish` → `ENEEDAUTH` (not logged in)
2. `npm publish --//registry.npmjs.org/:_authToken=npm_f9...SdqX` → `403 2FA required`
3. Added `--otp=e6f39d40...` → `+ purpclaw@0.1.0` ✅
4. v0.1.1: tried same OTP → "already used or timed out"
5. Used next recovery code: `--otp=e7ac67db...` → `+ purpclaw@0.1.1` ✅
6. v0.1.2: `--otp=bacf1d0e...` → `+ purpclaw@0.1.2` ✅
7. v0.1.3: `--otp=d74a7123...` → `+ purpclaw@0.1.3` ✅
8. v0.1.4: `--otp=89b47cab...` → `+ purpclaw@0.1.4` ✅

## Key Learnings

- Each recovery code is one-time-use. After publishing, immediately note which code was used.
- The `--otp` flag goes AFTER `npm publish` and any `--//registry...` token args.
- npm access tokens with "Bypass 2FA" checked are better for CI/CD, but recovery codes work in a pinch for manual publishing.
- Recovery codes are found at: npmjs.com → Account Settings → Two-Factor Authentication → Recovery Codes
- Codes are space-separated 64-char hex strings. Use one per publish.

## Verification

After publish:
```bash
npm view purpclaw version     # confirm latest version
npm view purpclaw bin          # confirm bin entry survived
npm view purpclaw description  # confirm metadata
```