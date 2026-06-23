#!/usr/bin/env bash
# ============================================================
# VOID // deploy.sh
# Build → test → push → roll. The void rolls silently.
# ============================================================

set -euo pipefail

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
readonly IMAGE_NAME="${VOID_IMAGE:-void-site}"
readonly IMAGE_TAG="${VOID_TAG:-$(date -u +%Y%m%d-%H%M%S)}"
readonly REGISTRY="${VOID_REGISTRY:-}"

readonly VOID='\033[0;35m'
readonly OK='\033[0;32m'
readonly WARN='\033[0;33m'
readonly ERR='\033[0;31m'
readonly NC='\033[0m'

log()   { printf "%b[void]%b %b\n" "$VOID" "$NC" "$*"; }
ok()    { printf "%b[ ok ]%b %b\n" "$OK"  "$NC" "$*"; }
warn()  { printf "%b[warn]%b %b\n" "$WARN" "$NC" "$*" >&2; }
die()   { printf "%b[fail]%b %b\n" "$ERR" "$NC" "$*" >&2; exit 1; }

preflight() {
  log "preflight checks"
  command -v docker >/dev/null 2>&1 || die "docker not found in PATH"
  command -v git    >/dev/null 2>&1 || die "git not found in PATH"
  [[ -d "${PROJECT_ROOT}/infra/void-site" ]] || die "void-site source not found at ${PROJECT_ROOT}/infra/void-site"
  ok "preflight passed"
}

build() {
  log "building ${IMAGE_NAME}:${IMAGE_TAG}"
  docker build \
    --build-arg "BUILDKIT_INLINE_CACHE=1" \
    --cache-from "${IMAGE_NAME}:latest" \
    -t "${IMAGE_NAME}:${IMAGE_TAG}" \
    -t "${IMAGE_NAME}:latest" \
    -f "${PROJECT_ROOT}/infra/void-site/Dockerfile" \
    "${PROJECT_ROOT}/infra/void-site"
  ok "built ${IMAGE_NAME}:${IMAGE_TAG}"
}

test() {
  log "smoke testing image"
  local cid
  cid=$(docker run --rm -d --name void-smoke -p 18080:80 "${IMAGE_NAME}:${IMAGE_TAG}")
  trap 'docker kill "${cid}" >/dev/null 2>&1 || true' EXIT

  local attempt
  for attempt in {1..30}; do
    if curl -fsS http://localhost:18080/healthz >/dev/null 2>&1; then
      ok "healthz responding on attempt ${attempt}"
      break
    fi
    sleep 1
  done

  curl -fsS http://localhost:18080/healthz >/dev/null \
    || die "healthz never came up - image is broken"

  curl -fsS http://localhost:18080/ | head -1 | grep -qi '<!doctype html>' \
    || die "root document missing or malformed"

  ok "image passed smoke tests"
  docker kill "${cid}" >/dev/null 2>&1 || true
  trap - EXIT
}

push() {
  if [[ -z "${REGISTRY}" ]]; then
    warn "VOID_REGISTRY unset - skipping push (local-only deploy)"
    return 0
  fi
  log "pushing to ${REGISTRY}"
  docker push "${REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG}"
  docker push "${REGISTRY}/${IMAGE_NAME}:latest"
  ok "pushed ${REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG}"
}

deploy() {
  log "rolling out via docker compose"
  cd "${PROJECT_ROOT}"
  [[ -f .env ]] || cp -n infra/.env.example .env || true

  export IMAGE_NAME IMAGE_TAG
  docker compose -f infra/docker-compose.yml --profile web-only up -d --no-deps --force-recreate web
  ok "deployment live on port ${VOID_WEB_PORT:-8080}"
}

main() {
  preflight
  build
  test
  push
  deploy
  log "void is live: http://localhost:${VOID_WEB_PORT:-8080}"
}

main "$@"
