#!/usr/bin/env bash
# ============================================================
# VOID // void-init.sh
# One-shot local environment bring-up. Dev only.
# ============================================================

set -euo pipefail

readonly ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

log() { printf "\033[0;35m[void-init]\033[0m %s\n" "$*"; }
die() { printf "\033[0;31m[void-init]\033[0m %s\n" "$*" >&2; exit 1; }

cd "${ROOT}"

command -v docker >/dev/null 2>&1 || die "docker required"
docker compose version >/dev/null 2>&1 || die "docker compose v2 required"

[[ -f infra/.env ]] || cp infra/.env.example infra/.env

log "bringing up the void on port ${VOID_WEB_PORT:-8080}"
docker compose -f infra/docker-compose.yml --profile web-only up -d --build

log "waiting for healthz..."
for i in {1..30}; do
  if curl -fsS http://localhost:${VOID_WEB_PORT:-8080}/healthz >/dev/null 2>&1; then
    log "void is online: http://localhost:${VOID_WEB_PORT:-8080}"
    exit 0
  fi
  sleep 1
done

die "void failed to come up. check: docker compose -f infra/docker-compose.yml logs"
