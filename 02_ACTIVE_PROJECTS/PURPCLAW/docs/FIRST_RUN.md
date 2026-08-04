# First Run

Last updated: 2026-07-20.

## Install and Configure

```powershell
pnpm install
Copy-Item .env.example .env
node bin/purpclaw.js init
```

Choose one configured provider. Ollama and LM Studio can run locally; hosted
providers require their own credentials. Never assume demo/local mode is available
until the selected runtime answers a probe.

## Start and Verify

```powershell
node bin/purpclaw.js safe-start --core
node bin/purpclaw.js doctor
node bin/purpclaw.js bughunt
node bin/purpclaw.js ask "Say hello and report the active provider."
```

Open `http://127.0.0.1:3030/mission` for Mission Control. If startup fails, use
`safe-start`, `doctor`, and the recovery guide; avoid broad direct PM2 starts on
Windows when a bounded profile will do.

See [`INSTALL.md`](INSTALL.md), [`TROUBLESHOOTING.md`](TROUBLESHOOTING.md), and
[`SERVICE_RUNTIME_INDEX.md`](SERVICE_RUNTIME_INDEX.md).
