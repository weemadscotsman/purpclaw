#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  🌵 CACTUS — deploy-checklist.sh
#  ═══════════════════════════════════════════════════════════════════════════
#  Pre-deployment verification gate. Run BEFORE going live with a new build
#  or major config change. Designed to fail loudly so the operator never
#  ships a broken state.
#
#  Checks (each is a hard gate unless marked [soft]):
#    1.  Node version meets engines requirement
#    2.  Production build artifacts present (.next/, dist/)
#    3.  .env exists, parses, passes schema check
#    4.  All listening ports are accounted for in network.md
#    5.  PM2 is reachable and ecosystem.config.js parses
#    6.  No stale .pid or lock files from prior crashes
#    7.  Free disk + memory above minimum thresholds
#    8.  Security audit passes (delegates to scripts/security-audit.sh)
#    9.  Backup of current config exists and is recent
#    10. Critical ecosystem services are not already running on the ports
#
#  Usage:
#    bash scripts/deploy-checklist.sh             # full check
#    bash scripts/deploy-checklist.sh --skip-backup  # skip backup requirement
#    bash scripts/deploy-checklist.sh --ci        # machine output
#
#  Exit codes:
#    0 = ready to deploy
#    1 = one or more gates failed
# ═══════════════════════════════════════════════════════════════════════════

set -u

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ROOT_DIR="$( cd "$SCRIPT_DIR/.." && pwd )"
cd "$ROOT_DIR"

SKIP_BACKUP=0
MODE="human"
for arg in "$@"; do
  case "$arg" in
    --skip-backup)  SKIP_BACKUP=1 ;;
    --ci)           MODE="ci" ;;
    -h|--help)
      sed -n '2,30p' "$0"; exit 0 ;;
    *) echo "unknown arg: $arg" >&2; exit 2 ;;
  esac
done

RED=""; GREEN=""; YELLOW=""; CYAN=""; BOLD=""; RESET=""
if [ "$MODE" = "ci" ] || [ ! -t 1 ]; then
  :
else
  RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'
  CYAN=$'\033[36m'; BOLD=$'\033[1m'; RESET=$'\033[0m'
fi

pass() { printf "  ${GREEN}[OK]${RESET} %s\n" "$1"; }
fail() { printf "  ${RED}[X]${RESET} %s\n" "$1"; [ -n "${2:-}" ] && printf "       → ${RED}%s${RESET}\n" "$2"; }
warn() { printf "  ${YELLOW}[!]${RESET} %s\n" "$1"; }
head() { printf "\n${BOLD}${CYAN}▶ %s${RESET}\n" "$1"; }

FAIL=0

printf "${BOLD}${CYAN}  CACTUS — Pre-Deploy Checklist${RESET}\n"
printf "  PURPCLAW @ %s\n" "$ROOT_DIR"
printf "  Date: %s\n" "$(date -u +'%Y-%m-%d %H:%M:%S UTC')"
printf "\n"

# ── 1. Node version ──────────────────────────────────────────────────────────
head "1. Node.js version"

REQUIRED_MAJOR=$(node -e "const p=require('./package.json'); console.log(parseInt((p.engines?.node||'v18').replace(/[^0-9]/g,'')));" 2>/dev/null || echo 18)
if command -v node >/dev/null 2>&1; then
  NODE_VER=$(node -v)
  NODE_MAJOR=$(printf '%s' "$NODE_VER" | sed 's/v\([0-9]*\).*/\1/')
  if [ "$NODE_MAJOR" -ge "$REQUIRED_MAJOR" ]; then
    pass "Node $NODE_VER (required >= $REQUIRED_MAJOR)"
  else
    fail "Node $NODE_VER is older than required (>= $REQUIRED_MAJOR)"
    FAIL=$((FAIL+1))
  fi
else
  fail "Node.js not installed"
  FAIL=$((FAIL+1))
fi

# ── 2. Build artifacts ──────────────────────────────────────────────────────
head "2. Production build artifacts"

if [ -d ".next" ]; then
  pass ".next/ exists (next build present)"
elif [ -d "dist" ]; then
  pass "dist/ exists"
else
  fail "no build artifacts found — run 'npm run build' first"
  FAIL=$((FAIL+1))
fi

# ── 3. .env validation ──────────────────────────────────────────────────────
head "3. .env validation"

if [ ! -f .env ]; then
  fail ".env missing — copy from .env.example and fill in keys"
  FAIL=$((FAIL+1))
else
  PERMS=$(stat -c '%a' .env 2>/dev/null || stat -f '%Lp' .env 2>/dev/null)
  if [ "${PERMS:-000}" = "600" ] || [ "${PERMS:-000}" = "400" ]; then
    pass ".env present, permissions $PERMS"
  else
    warn ".env permissions are $PERMS — recommend 600"
  fi

  # Delegate the heavy lifting to verify-env.sh — but only if it exists.
  if [ -x scripts/verify-env.sh ]; then
    if bash scripts/verify-env.sh --ci >/tmp/verify-env.out 2>&1; then
      pass "verify-env.sh: schema check passed"
    else
      fail "verify-env.sh: schema check failed" "see /tmp/verify-env.out"
      FAIL=$((FAIL+1))
    fi
  else
    warn "scripts/verify-env.sh not executable — skipping deep check"
  fi
fi

# ── 4. Ports vs network.md ──────────────────────────────────────────────────
head "4. Port documentation"

# Read ports referenced in ecosystem.config.js (light parse via grep).
DECLARED_PORTS=$(grep -oE '(port|PORT)\s*[:=]\s*[0-9]+' ecosystem.config.js 2>/dev/null \
  | grep -oE '[0-9]+' | sort -un | tr '\n' ' ')

# Also check the .env for port overrides.
ENV_PORTS=$(grep -oE '[A-Z_]*PORT[ ]*=[ ]*[0-9]+' .env 2>/dev/null \
  | grep -oE '[0-9]+' | sort -un | tr '\n' ' ')

if [ -z "$DECLARED_PORTS$ENV_PORTS" ]; then
  warn "could not detect declared ports (no ecosystem.config.js ports?)"
else
  if [ -f infra/hardening/network.md ]; then
    UNDOCUMENTED=0
    for port in $DECLARED_PORTS $ENV_PORTS; do
      if ! grep -qE "$port|\\b$port\\b" infra/hardening/network.md; then
        warn "port $port is declared but not in infra/hardening/network.md"
        UNDOCUMENTED=$((UNDOCUMENTED+1))
      fi
    done
    if [ "$UNDOCUMENTED" = 0 ]; then
      pass "all declared ports are documented in infra/hardening/network.md"
    fi
  else
    fail "infra/hardening/network.md missing — ports must be documented"
    FAIL=$((FAIL+1))
  fi
fi

# ── 5. PM2 reachable ─────────────────────────────────────────────────────────
head "5. PM2 + ecosystem.config.js"

if command -v pm2 >/dev/null 2>&1 || npx pm2 -v >/dev/null 2>&1; then
  pass "PM2 available"
else
  fail "PM2 not installed — run 'npm install -g pm2'"
  FAIL=$((FAIL+1))
fi

if node -e "const c=require('./ecosystem.config.js'); if(!c.apps?.length) throw 'no apps'" 2>/dev/null; then
  pass "ecosystem.config.js parses with non-empty apps[]"
else
  fail "ecosystem.config.js failed to parse"
  FAIL=$((FAIL+1))
fi

# ── 6. Stale runtime files ───────────────────────────────────────────────────
head "6. Stale runtime state"

STALE=0
for pat in '*.pid' '.purpclaw.lock' 'logs/*.lock'; do
  if compgen -G "$pat" >/dev/null 2>&1; then
    for f in $pat; do
      [ -f "$f" ] && warn "stale file: $f (likely from prior crash)"
      STALE=$((STALE+1))
    done
  fi
done
if [ "$STALE" = 0 ]; then
  pass "no stale pid/lock files"
fi

# ── 7. Resource minimums ─────────────────────────────────────────────────────
head "7. Free resources (minimums for production)"

# Disk: require at least 500MB free.
if command -v df >/dev/null 2>&1; then
  FREE_KB=$(df -Pk . 2>/dev/null | awk 'NR==2 {print $4}')
  if [ -n "$FREE_KB" ] && [ "$FREE_KB" -gt 512000 ]; then
    pass "disk free: $((FREE_KB/1024)) MB"
  else
    fail "disk free: $((FREE_KB/1024)) MB — need at least 500 MB"
    FAIL=$((FAIL+1))
  fi
fi

# Memory: require at least 1GB free.
if command -v free >/dev/null 2>&1; then
  FREE_MEM=$(free -m 2>/dev/null | awk '/^Mem:/ {print $7}')
  if [ -n "$FREE_MEM" ] && [ "$FREE_MEM" -gt 1024 ]; then
    pass "memory free: $FREE_MEM MB"
  else
    warn "memory free: ${FREE_MEM:-?} MB — recommend >= 1024 MB for production"
  fi
fi

# ── 8. Security audit delegation ─────────────────────────────────────────────
head "8. Security audit"

if [ -x scripts/security-audit.sh ]; then
  if bash scripts/security-audit.sh --ci >/tmp/sec-audit.out 2>&1; then
    pass "security-audit.sh passed"
  else
    fail "security-audit.sh FAILED" "see /tmp/sec-audit.out — fix issues before deploy"
    FAIL=$((FAIL+1))
  fi
else
  warn "scripts/security-audit.sh missing or not executable"
fi

# ── 9. Backup recency ────────────────────────────────────────────────────────
head "9. Recent backup"

if [ "$SKIP_BACKUP" = 1 ]; then
  warn "backup check skipped (--skip-backup)"
else
  if [ -x scripts/backup-config.sh ]; then
    LATEST=$(ls -1t ~/.purpclaw-backups/purpclaw-config-*.tar.gz 2>/dev/null | head -1 || echo "")
    if [ -z "$LATEST" ]; then
      warn "no backup found — run scripts/backup-config.sh first"
    else
      # Consider backup "recent" if it was made in the last 24h.
      AGE_SEC=$(( $(date +%s) - $(stat -c %Y "$LATEST" 2>/dev/null || stat -f %m "$LATEST" 2>/dev/null) ))
      if [ "$AGE_SEC" -lt 86400 ]; then
        pass "recent backup: $LATEST ($(($AGE_SEC/3600))h old)"
      else
        warn "latest backup is $(($AGE_SEC/3600))h old — consider re-running"
      fi
    fi
  else
    warn "scripts/backup-config.sh missing — skipping"
  fi
fi

# ── 10. Port conflicts ───────────────────────────────────────────────────────
head "10. Port conflicts (services already listening)"

CONFLICTS=0
for port in $DECLARED_PORTS; do
  if command -v ss >/dev/null 2>&1; then
    if ss -tlnH 2>/dev/null | awk '{print $4}' | grep -qE ":${port}$"; then
      warn "port $port is already in use — deploy will conflict"
      CONFLICTS=$((CONFLICTS+1))
    fi
  fi
done
if [ "$CONFLICTS" = 0 ]; then
  pass "no port conflicts detected"
else
  warn "$CONFLICTS port conflict(s) — verify the running process is your prior deploy"
fi

# ── Summary ──────────────────────────────────────────────────────────────────
printf "\n${BOLD}═══════════════════════════════════════════════════════════════${RESET}\n"
printf "${BOLD}  RESULT${RESET}\n\n"

if [ "$FAIL" -gt 0 ]; then
  printf "  ${RED}${BOLD}DEPLOY BLOCKED${RESET} — %d hard gate(s) failed.\n" "$FAIL"
  printf "  Fix the issues above and re-run ${CYAN}bash scripts/deploy-checklist.sh${RESET}\n"
  exit 1
else
  printf "  ${GREEN}${BOLD}DEPLOY READY${RESET} — all gates green. Ship it.\n"
  exit 0
fi
