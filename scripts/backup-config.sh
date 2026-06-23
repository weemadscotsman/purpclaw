#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  🌵 CACTUS — backup-config.sh
#  ═══════════════════════════════════════════════════════════════════════════
#  Minimal backup of PURPCLAW configuration. TURTLE-aligned: low overhead,
#  small footprint, restoreable. Excludes secrets by default.
#
#  What gets backed up:
#    - .env.example (template only — never the real .env)
#    - ecosystem.config.js (service definitions)
#    - package.json + package-lock.json (dependency pin)
#    - config/ directory (all app config files)
#    - .github/workflows/ (CI definitions)
#    - deploy/ and infra/ (deployment + hardening artifacts)
#    - install.sh, install.ps1, scripts/*.sh (bootstrap + ops)
#
#  What does NOT get backed up:
#    - .env (real secrets — see flags below to override)
#    - node_modules (regenerable)
#    - logs, build artifacts, runtime state
#
#  Usage:
#    bash scripts/backup-config.sh                    # default backup dir
#    bash scripts/backup-config.sh /path/to/backups   # custom dir
#    bash scripts/backup-config.sh --include-env      # DANGEROUS — backs up real .env
#    bash scripts/backup-config.sh --rotate 7         # keep last 7 backups (default 5)
#
#  Output: a timestamped tar.gz file + a small manifest.
# ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ── Config ───────────────────────────────────────────────────────────────────
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ROOT_DIR="$( cd "$SCRIPT_DIR/.." && pwd )"
cd "$ROOT_DIR"

BACKUP_DIR="${HOME}/.purpclaw-backups"
KEEP=5
INCLUDE_ENV=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --include-env) INCLUDE_ENV=1; shift ;;
    --rotate)      KEEP="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,30p' "$0"; exit 0 ;;
    /*|./*|~/*)    BACKUP_DIR="$1"; shift ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

# ── Output helpers ───────────────────────────────────────────────────────────
C_CYAN=$'\033[36m'; C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'; C_BOLD=$'\033[1m'; C_RESET=$'\033[0m'
[ ! -t 1 ] && C_CYAN="" && C_GREEN="" && C_YELLOW="" && C_BOLD="" && C_RESET=""
step() { printf "  ${C_CYAN}[backup]${C_RESET} %s\n" "$1"; }
ok()   { printf "  ${C_GREEN}[OK]${C_RESET}     %s\n" "$1"; }
warn() { printf "  ${C_YELLOW}[!]${C_RESET}     %s\n" "$1"; }

# ── Prepare backup destination ───────────────────────────────────────────────
TIMESTAMP=$(date -u +'%Y%m%dT%H%M%SZ')
BACKUP_NAME="purpclaw-config-${TIMESTAMP}.tar.gz"
MANIFEST_NAME="purpclaw-config-${TIMESTAMP}.manifest.txt"

mkdir -p "$BACKUP_DIR"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_NAME}"
MANIFEST_PATH="${BACKUP_DIR}/${MANIFEST_NAME}"

printf "${C_BOLD}${C_CYAN}  CACTUS — Config Backup${C_RESET}\n"
printf "  Source: %s\n" "$ROOT_DIR"
printf "  Target: %s\n" "$BACKUP_DIR"
printf "  Rotation: keep last %d\n" "$KEEP"
printf "\n"

# ── Build file list ──────────────────────────────────────────────────────────
FILES_TO_BACKUP=(
  ".env.example"
  "ecosystem.config.js"
  "package.json"
  "package-lock.json"
  "config/"
  ".github/workflows/"
  "deploy/"
  "infra/"
  "install.sh"
  "install.ps1"
  "scripts/"
  "tsconfig.json"
  "next.config.ts"
  "eslint.config.mjs"
  ".eslintrc.json"
  ".eslintignore"
)

# Only include .env if explicitly asked — and warn loudly.
if [ "$INCLUDE_ENV" = 1 ]; then
  warn "--include-env is set: real .env WILL be in this backup"
  warn "encrypt the archive before transporting it (gpg -c ${BACKUP_PATH})"
  FILES_TO_BACKUP+=(".env")
fi

# Verify each entry exists before passing to tar.
EXISTING=()
MISSING=()
for f in "${FILES_TO_BACKUP[@]}"; do
  if [ -e "$f" ]; then
    EXISTING+=("$f")
  else
    MISSING+=("$f")
  fi
done

step "found ${#EXISTING[@]} paths, ${#MISSING[@]} missing (skipped)"
if [ "${#MISSING[@]}" -gt 0 ]; then
  printf "       missing: %s\n" "$(IFS=, ; echo "${MISSING[*]}")"
fi

# ── Build manifest ───────────────────────────────────────────────────────────
{
  echo "PURPCLAW Config Backup Manifest"
  echo "================================"
  echo "Timestamp (UTC):  $TIMESTAMP"
  echo "Source:           $ROOT_DIR"
  echo "Git SHA:          $(git rev-parse HEAD 2>/dev/null || echo 'not a git repo')"
  echo "Git branch:       $(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'n/a')"
  echo "Node:             $(node -v 2>/dev/null || echo 'n/a')"
  echo "PM2:              $(npx pm2 -v 2>/dev/null || echo 'n/a')"
  echo "Includes .env:    $([ "$INCLUDE_ENV" = 1 ] && echo 'YES' || echo 'no')"
  echo ""
  echo "Files included:"
  printf "  %s\n" "${EXISTING[@]}"
  echo ""
  echo "Files missing from source (skipped):"
  printf "  %s\n" "${MISSING[@]}"
} > "$MANIFEST_PATH"

# ── Create tarball ───────────────────────────────────────────────────────────
step "creating archive..."
# tar with -C so paths are relative. Use -cz for gzip.
# --exclude any large/transient bits that may have slipped in.
tar -czf "$BACKUP_PATH" \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='*.log' \
  --exclude='logs/' \
  --exclude='*.gz' \
  -C "$ROOT_DIR" \
  "${EXISTING[@]}"

# ── Verify archive ───────────────────────────────────────────────────────────
step "verifying archive integrity..."
if tar -tzf "$BACKUP_PATH" >/dev/null 2>&1; then
  ok "archive verified — $(du -h "$BACKUP_PATH" | cut -f1)"
else
  warn "archive verification FAILED — re-run recommended"
  exit 1
fi

# ── Rotation ─────────────────────────────────────────────────────────────────
step "rotating old backups (keep last $KEEP)..."
# List existing backups sorted by mtime, newest first.
EXISTING_BACKUPS=$(ls -1t "$BACKUP_DIR"/purpclaw-config-*.tar.gz 2>/dev/null || true)
if [ -n "$EXISTING_BACKUPS" ]; then
  COUNT=0
  while IFS= read -r f; do
    COUNT=$((COUNT+1))
    if [ "$COUNT" -gt "$KEEP" ]; then
      # Strip the .tar.gz to find the matching .manifest.txt
      MANIF="${f%.tar.gz}.manifest.txt"
      rm -f -- "$f" "$MANIF"
      ok "pruned $(basename "$f")"
    fi
  done <<< "$EXISTING_BACKUPS"
fi

# ── Summary ──────────────────────────────────────────────────────────────────
printf "\n${C_BOLD}═══════════════════════════════════════════════════════════════${C_RESET}\n"
printf "  ${C_BOLD}Backup complete${C_RESET}\n"
printf "  Archive:  %s\n" "$BACKUP_PATH"
printf "  Manifest: %s\n" "$MANIFEST_PATH"
printf "  Size:     %s\n" "$(du -h "$BACKUP_PATH" | cut -f1)"
printf "  ${C_CYAN}To restore: tar -xzf %s -C /path/to/restore${C_RESET}\n" "$BACKUP_PATH"
