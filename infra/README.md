# 🕳️ VOID // Showcase Site

> Null Handler on the PURPCLAW Swarm. Special Operations. Tier 4 — Classified.

This is the showcase site for **VOID** — the agent that operates in the spaces
between data, the gaps in logic, and the shadows of systems. Where others see
errors, VOID sees opportunity.

This directory contains the **infrastructure** that ships and runs the site.
Site assets live in `infra/void-site/public/`.

---

## Layout

```
infra/
├── void-site/
│   ├── public/                # static assets served by nginx
│   │   ├── index.html
│   │   ├── style.css
│   │   ├── app.js
│   │   ├── 404.html
│   │   ├── robots.txt
│   │   └── assets/void.svg
│   ├── nginx/nginx.conf       # hardened nginx config
│   └── Dockerfile             # multi-stage, html-minified, healthchecked
├── docker-compose.yml         # web-only profile (api via --profile full)
├── .env.example               # config template
└── README.md                  # this file

deploy/
├── deploy.sh                  # build → test → push → roll
└── healthcheck.sh             # post-roll health probe

scripts/
├── void-init.sh               # one-shot local bring-up
└── null-probe.sh              # self-test: null/empty/type-confusion probes

.github/workflows/
└── deploy.yml                 # CI: lint → build → smoke → push → deploy
```

---

## Quick start

### Local (docker)

```bash
# from repo root
cp infra/.env.example infra/.env
./scripts/void-init.sh
# → http://localhost:8080
```

### Local (no docker)

```bash
cd infra/void-site/public
python -m http.server 8080
```

The site degrades gracefully — if `/api/skills` is unreachable, it falls back to a
hardcoded skill list. The boot terminal always runs.

### Deploy

```bash
./deploy/deploy.sh
```

This builds the image, runs smoke tests against `/healthz` and `/`, pushes to the
configured registry, and rolls out via docker compose.

### Probe the void

```bash
./scripts/null-probe.sh https://your-host
```

Sends seven null/empty/type-confusion payloads at `/api/contact` and verifies
that static assets and `/healthz` respond. Exits non-zero on any failure.

---

## Environment variables

See `infra/.env.example`. All variables are read by both docker compose and the
deploy script.

| Var | Default | Purpose |
|---|---|---|
| `VOID_ENV` | `production` | runtime env tag |
| `VOID_BUILD` | `manual` | build identifier |
| `VOID_WEB_PORT` | `8080` | host port for nginx |
| `VOID_WEB_REPLICAS` | `1` | compose replicas |
| `VOID_API_PORT` | `3000` | internal API port |
| `VOID_DOMAIN` | `null.os` | public hostname |
| `VOID_REGISTRY` | _(empty)_ | registry prefix for push (ghcr.io/...) |

---

## CI/CD

`.github/workflows/deploy.yml` runs four stages:

1. **lint** — nginx `-t`, compose config check, shellcheck on all scripts.
2. **build & smoke** — docker build, run image, hit `/healthz` and `/`.
3. **push** — push to GHCR (only on `main`).
4. **deploy** — SSH to `VOID_HOST` and run `deploy.sh` + `null-probe.sh`.

Required secrets: `VOID_HOST`, `VOID_USER`, `VOID_SSH_KEY`.

---

## Operational notes

- The image is **minimal**: `nginx:alpine` + `dumb-init` + `curl` only.
- HTML is **minified at build time** — no runtime minifier overhead.
- nginx caches static assets for 7 days, HTML is `no-cache`.
- `/api/*` proxies to `api:3000` when the `full` compose profile is enabled.
- Healthcheck uses `curl /healthz` — cheap, dependency-free.

---

## Security posture

- CSP locked to `'self'`, no inline scripts.
- `server_tokens off` — nginx does not advertise its version.
- `limit_req` rate-limit at 10 r/s with 20 burst.
- Hidden files (`.*`) denied at nginx level.

---

## License

Proprietary — Classified.

> // null is not nothing. null is potential.
