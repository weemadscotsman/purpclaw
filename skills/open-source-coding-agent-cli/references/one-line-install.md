# Install Scripts — One-Line PurpClaw Installation
> Built 2026-06-06

## PowerShell (Windows)

```powershell
iex (irm https://raw.githubusercontent.com/weemadscotsman/purpclaw/main/scripts/install.ps1)
```

File: `scripts/install.ps1` (3605 bytes)

Steps:
1. Check Node.js ≥ 18
2. Download `{branch}.zip` from GitHub
3. Extract to `%LOCALAPPDATA%\purpclaw`
4. Run `npm install --production`
5. Run `npm link` for global `purpclaw` command
6. Create `~/.purpclaw/config.json` with default ollama config
7. Clean up temp files

## macOS / Linux

```bash
curl -fsSL https://raw.githubusercontent.com/weemadscotsman/purpclaw/main/scripts/install.sh | bash
```

File: `scripts/install.sh` (2354 bytes)

Same flow as PowerShell: Node check → download → extract → npm install → npm link → config.

## npm (after publish)

```bash
npm install -g purpclaw && purpclaw tui ng
```

## What the install creates

- `~/.purpclaw/` — config directory
- `~/.purpclaw/config.json` — default `{"provider":"ollama","model":"qwen2.5:3b"}`
- Global `purpclaw` command in PATH

## README placement

The one-line install commands are in the `## 🚀 Install (one line)` section, replacing the old multi-step clone+npm install+cp .env+purpclaw safe-start flow. Three lines: npm, PowerShell, macOS/Linux.

## Key design decisions

- No `git clone` required for the installer path
- PowerShell uses `iex (irm ...)` pattern for zero-interaction install
- bash pipe-to-shell pattern is standard for *nix
- Default config uses ollama (local, free, no API key needed)
- `--production` flag in npm install to skip devDependencies
