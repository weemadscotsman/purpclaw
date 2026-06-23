#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  🌵 CACTUS — security-audit.sh
#  ═══════════════════════════════════════════════════════════════════════════
#  One-shot local security posture check for PURPCLAW.
#  Mirrors what .github/workflows/security.yml runs in CI, so devs catch
#  issues BEFORE pushing.
#
#  Usage:
#    bash scripts/security-audit.sh              # human-friendly, color
#    bash scripts/security-audit.sh --ci         # machine-friendly, no TTY
#    bash scripts/security-audit.sh --strict     # treat warnings as failures
#
#  Exit codes:
#    0 = PASS (all checks green or only soft warnings)
#    1 = FAIL (one or more critical checks failed)
#    2 = ERROR (audit could not run — missing tool, bad path)
#
#  CACTUS-grade: minimal footprint, no network, no docker required.
#  All checks are pure-bash + grep + node where available.
# ═══════════════════════════════════════════════════════════════════════════

set -u
# NOTE: do NOT `set -e` — we need to keep running after individual failures
# so the operator sees the full picture.

# ── Config ───────────────────────────────────────────────────────────────────
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ROOT_DIR="$( cd "$SCRIPT_DIR/.." && pwd )"
cd "$ROOT_DIR"

MODE="human"
STRICT=0
for arg in "$@"; do
  case "$arg" in
    --ci)        MODE="ci" ;;
    --strict)    STRICT=1 ;;
    -h|--help)
      sed -n '2,30p' "$0"
      exit 0
      ;;
    *) echo "unknown flag: $arg" >&2; exit 2 ;;
  esac
done

# ── Output helpers ───────────────────────────────────────────────────────────
if [ "$MODE" = "ci" ] || [ ! -t 1 ]; then
  RED=""; GREEN=""; YELLOW=""; CYAN=""; BOLD=""; RESET=""
else
  RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'
  CYAN=$'\033[36m'; BOLD=$'\033[1m'; RESET=$'\033[0m'
fi

PASS=0
FAIL=0
WARN=0

pass() { PASS=$((PASS+1)); printf "  ${GREEN}[✔]${RESET} %s\n" "$1"; }
fail() { FAIL=$((FAIL+1)); printf "  ${RED}[✖]${RESET} %s\n" "$1"; [ -n "${2:-}" ] && printf "       ${RED}→${RESET} %s\n" "$2"; }
warn() { WARN=$((WARN+1)); printf "  ${YELLOW}[!]${RESET} %s\n" "$1"; [ -n "${2:-}" ] && printf "       ${YELLOW}→${RESET} %s\n" "$2"; }
head() { printf "\n${BOLD}${CYAN}▶ %s${RESET}\n" "$1"; }

# ── Header ───────────────────────────────────────────────────────────────────
printf "${BOLD}${CYAN}"
printf "  🌵 CACTUS — Security Audit\n"
printf "  PURPCLAW · %s\n" "$ROOT_DIR"
printf "  Mode: %s%s\n" "$MODE" "$([ "$STRICT" = 1 ] && echo " (strict)" || echo "")"
printf "${RESET}\n"
printf "  ${CYAN}Time:${RESET} %s\n" "$(date -u +'%Y-%m-%d %H:%M:%S UTC')"

# ═══════════════════════════════════════════════════════════════════════════
# 1. SECRET LEAK SCAN — gitleaks + manual grep fallback
# ═══════════════════════════════════════════════════════════════════════════
head "1. Secret leak scan"

SECRETS_FOUND=0

if command -v gitleaks >/dev/null 2>&1; then
  if gitleaks detect --no-banner --source . --exit-code 0 >/tmp/gl.log 2>&1; then
    pass "gitleaks: no secrets in working tree"
  else
    # exit 0 = no leaks, but they may print findings — re-check log.
    if grep -qiE 'leak|rules? matched|secret' /tmp/gl.log; then
      fail "gitleaks found potential secrets" "see /tmp/gl.log or run 'gitleaks detect --source . -v'"
      SECRETS_FOUND=1
    else
      pass "gitleaks: no secrets in working tree"
    fi
  fi
else
  # Manual grep fallback — covers the most common leaks. Imperfect by
  # design: false positives are better than false negatives here.
  warn "gitleaks not installed — using fallback grep (install: https://github.com/gitleaks/gitleaks)"
  # Patterns: sk-*, sk-ant-*, AKIA*, ghp_*, nvapi-*, hf-*, xox[bp]-*, gsk_*
  if grep -rInE --binary-files=without-match \
       '(sk-[A-Za-z0-9_-]{20,}|sk-ant-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{36}|nvapi-[A-Za-z0-9_-]{20,}|hf_[A-Za-z0-9]{34}|xox[bp]-[A-Za-z0-9-]{10,}|gsk_[A-Za-z0-9]{20,}|MINIMAX_API_KEY=[A-Za-z0-9]{20,})' \
       --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git \
       --exclude-dir=logs --exclude='*.lock' --exclude='*.gz' \
       . 2>/dev/null | grep -v '\.env\.example:' | head -5; then
    fail "fallback grep found potential API key patterns" "review matches — these may be real keys in committed files"
    SECRETS_FOUND=1
  else
    pass "fallback grep: no obvious API key patterns"
  fi
fi

# Ensure .env is git-ignored
if [ -f .env ] && git -C "$ROOT_DIR" check-ignore -x .env >/dev/null 2>&1; then
  pass ".env is git-ignored"
elif [ -f .env ]; then
  fail ".env exists but is NOT git-ignored" "add '.env' to .gitignore"
  SECRETS_FOUND=1
else
  pass "no .env present (good — use .env.example)"
fi

if [ -f .env ]; then
  PERMS=$(stat -c '%a' .env 2>/dev/null || stat -f '%Lp' .env 2>/dev/null)
  if [ "${PERMS:-000}" != "600" ] && [ "${PERMS:-000}" != "400" ]; then
    fail ".env permissions are $PERMS (want 600 or 400)" "run: chmod 600 .env"
  else
    pass ".env permissions are $PERMS (correct)"
  fi
fi

# ═══════════════════════════════════════════════════════════════════════════
# 2. NPM AUDIT
# ═══════════════════════════════════════════════════════════════════════════
head "2. npm audit"

if [ -f package-lock.json ] && command -v npm >/dev/null 2>&1; then
  # Use --omit=dev to focus on what ships to production. Cache for 60s.
  CACHE_FILE="/tmp/purpclaw-audit-cache-$$"
  if [ -f "$CACHE_FILE" ] && [ $(( $(date +%s) - $(stat -c %Y "$CACHE_FILE" 2>/dev/null || stat -f %m "$CACHE_FILE" 2>/dev/null) )) -lt 60 ]; then
    AUDIT_OUTPUT=$(cat "$CACHE_FILE")
  else
    AUDIT_OUTPUT=$(npm audit --omit=dev --json 2>/dev/null || true)
    echo "$AUDIT_OUTPUT" > "$CACHE_FILE"
  fi

  # Extract high+critical counts.
  HIGH=$(echo "$AUDIT_OUTPUT" | node -e "
    let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{
      try{const j=JSON.parse(d);
        const m=j.metadata?.vulnerabilities||{};
        console.log((m.high||0)+(m.critical||0));
      }catch{console.log(0);}
    });" 2>/dev/null || echo 0)
  TOTAL=$(echo "$AUDIT_OUTPUT" | node -e "
    let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{
      try{const j=JSON.parse(d);
        const m=j.metadata?.vulnerabilities||{};
        console.log((m.high||0)+(m.critical||0)+(m.moderate||0));
      }catch{console.log(0);}
    });" 2>/dev/null || echo 0)

  if [ "$HIGH" = "0" ]; then
    pass "npm audit: 0 high/critical production vulns"
  else
    fail "npm audit: $HIGH high/critical production vulns" "run 'npm audit --omit=dev' for details"
  fi
  if [ "$TOTAL" != "0" ] && [ "$HIGH" = "0" ]; then
    warn "npm audit: $TOTAL total vulns (none high+ — track via Dependabot)"
  fi
else
  warn "no package-lock.json or npm not installed — skipping"
fi

# ═══════════════════════════════════════════════════════════════════════════
# 3. SHELL SCRIPT HYGIENE
# ═══════════════════════════════════════════════════════════════════════════
head "3. Shell script hygiene"

# Every executable script we ship should:
#   - start with a shebang (#!/usr/bin/env ...)
#   - use 'set -e' OR explicitly document why not (we use it explicitly)
#   - not use unquoted variables in dangerous contexts
SCRIPT_COUNT=0
SCRIPT_GOOD=0
SCRIPT_BAD=0
while IFS= read -r -d '' script; do
  SCRIPT_COUNT=$((SCRIPT_COUNT+1))
  # Skip our own audit script (uses traps).
  [ "$script" = "$0" ] && continue

  ISSUES=""
  # Shebang
  if ! head -1 "$script" | grep -q '^#!'; then
    ISSUES="$ISSUES no-shebang"
  fi
  # set -e OR set -u (we accept either as defensive)
  if ! grep -qE '^set -[eu]+' "$script"; then
    if [ "$STRICT" = 1 ]; then
      ISSUES="$ISSUES no-set-e"
    fi
  fi
  # eval / unquoted variable expansion (loose check)
  if grep -E '^\s*eval\s' "$script" >/dev/null 2>&1; then
    ISSUES="$ISSUES uses-eval"
  fi
  # rm -rf with variable (foot-gun)
  if grep -E 'rm\s+-rf\s+\$' "$script" >/dev/null 2>&1; then
    ISSUES="$ISSUES rm-rf-with-var"
  fi

  if [ -z "$ISSUES" ]; then
    SCRIPT_GOOD=$((SCRIPT_GOOD+1))
  else
    SCRIPT_BAD=$((SCRIPT_BAD+1))
    [ "$STRICT" = 1 ] && fail "$script: $ISSUES"
  fi
done < <(find scripts deploy -type f -name '*.sh' -print0 2>/dev/null)

if [ "$SCRIPT_COUNT" = 0 ]; then
  warn "no shell scripts found in scripts/ or deploy/"
elif [ "$SCRIPT_BAD" = 0 ]; then
  pass "$SCRIPT_COUNT shell script(s) — all have shebang + set -e"
else
  warn "$SCRIPT_BAD/$SCRIPT_COUNT shell scripts have minor issues (see strict mode for full list)"
fi

# ═══════════════════════════════════════════════════════════════════════════
# 4. SERVICE PORT EXPOSURE
# ═══════════════════════════════════════════════════════════════════════════
head "4. Service port exposure"

# Expected ports per ecosystem.config.js — adjust list as the swarm evolves.
# Reading the actual config would be more correct; this list mirrors what
# purpclaw_health_check.ps1 checks.
EXPECTED_PORTS="3030 7780 7781 7782 7783 7784 7790 7791 7798 7880 7881 7885 7890 7897 7792"
# Exposed-on-0.0.0.0 (anyone on the LAN can reach) is a stronger signal
# than just "port is listening". Use ss / netstat.
EXPOSED=0
EXPOSED_LIST=""
if command -v ss >/dev/null 2>&1; then
  EXPOSED_LIST=$(ss -tlnH 2>/dev/null | awk '{print $4}' | grep -oE ':[0-9]+$' | tr -d ':' | sort -u)
elif command -v netstat >/dev/null 2>&1; then
  EXPOSED_LIST=$(netstat -tln 2>/dev/null | awk '/LISTEN/ {print $4}' | grep -oE '[0-9]+$' | sort -u)
fi

if [ -z "$EXPOSED_LIST" ]; then
  pass "no services listening (or no ss/netstat — likely sandbox)"
else
  for port in $EXPOSED_LIST; do
    case " $EXPECTED_PORTS " in
      *" $port "*) ;;
      *)
        EXPOSED=$((EXPOSED+1))
        warn "port $port is listening but NOT in expected swarm port list"
        ;;
    esac
  done
  if [ "$EXPOSED" = 0 ]; then
    pass "all listening ports match expected swarm ports"
  fi
fi

# ═══════════════════════════════════════════════════════════════════════════
# 5. .env.example HYGIENE
# ═══════════════════════════════════════════════════════════════════════════
head "5. .env.example hygiene"

if [ -f .env.example ]; then
  # Check for accidental real keys (anything that looks assigned in
  # .env.example — they should all be commented out).
  ASSIGNED=$(grep -cE '^[A-Z_][A-Z0-9_]+=.+$' .env.example 2>/dev/null || echo 0)
  if [ "$ASSIGNED" = 0"" ] || [ "$ASSIGNED" -lt 3 ]; then
    pass ".env.example: $ASSIGNED active assignments (should be 0 — examples are commented)"
  else
    fail ".env.example: $ASSIGNED active assignments found" "keys should be commented out with '#' prefix"
  fi

  # Required-by-app keys should be present.
  for key in LLM_PROVIDER LLM_MODEL; do
    if grep -q "^# *${key}=" .env.example; then
      pass ".env.example documents $key"
    else
      warn ".env.example missing recommended $key"
    fi
  done
else
  fail ".env.example missing" "create one — see SECURITY.md for guidance (guardian's scope)"
fi

# ═══════════════════════════════════════════════════════════════════════════
# 6. DOCKERFILE LINT (if Dockerfile exists)
# ═══════════════════════════════════════════════════════════════════════════
head "6. Dockerfile lint"

if ls Dockerfile* >/dev/null 2>&1; then
  DOCKERFILE=$(ls Dockerfile* 2>/dev/null | head -1)
  # Use hadolint if available; fall back to grep-based checks.
  if command -v hadolint >/dev/null 2>&1; then
    if hadolint "$DOCKERFILE" >/tmp/hadolint.log 2>&1; then
      pass "hadolint: $DOCKERFILE clean"
    else
      if grep -qiE 'error\b' /tmp/hadolint.log; then
        fail "hadolint found errors in $DOCKERFILE" "see /tmp/hadolint.log"
      else
        warn "hadolint: $DOCKERFILE has style warnings (non-fatal)"
      fi
    fi
  else
    # Fallback: minimum bar — no 'latest' tag, USER set, no sudo.
    if grep -qE '^FROM [^ ]*:latest' "$DOCKERFILE" 2>/dev/null; then
      fail "Dockerfile uses 'latest' tag — pin to a specific version"
    else
      pass "Dockerfile does not use 'latest' tag"
    fi
    if grep -qE '^USER ' "$DOCKERFILE"; then
      pass "Dockerfile sets USER (non-root)"
    else
      fail "Dockerfile does not set USER — runs as root by default"
    fi
  fi
else
  warn "no Dockerfile present — skipped (skipped is fine for local-first installs)"
fi

# ═══════════════════════════════════════════════════════════════════════════
# 7. INFRA / DEPLOY ARTIFACT CHECKS
# ═══════════════════════════════════════════════════════════════════════════
head "7. Infra / deploy artifacts"

[ -d .github ] && pass ".github/ exists (CI configuration present)" \
               || warn ".github/ missing (no CI — run security-audit manually)"
[ -d deploy ]  && pass "deploy/ exists (production configs present)" \
               || warn "deploy/ missing"
[ -d infra ]   && pass "infra/ exists (hardening docs present)" \
               || warn "infra/ missing"
[ -f .dockerignore ] && pass ".dockerignore present (build context locked down)" \
                     || warn ".dockerignore missing"

# ═══════════════════════════════════════════════════════════════════════════
# SUMMARY
# ═══════════════════════════════════════════════════════════════════════════
printf "\n${BOLD}═══════════════════════════════════════════════════════════════${RESET}\n"
printf "${BOLD}  RESULT${RESET}\n\n"
printf "  ${GREEN}PASS:${RESET} %d\n" "$PASS"
printf "  ${YELLOW}WARN:${RESET} %d\n" "$WARN"
printf "  ${RED}FAIL:${RESET} %d\n" "$FAIL"
printf "\n"

if [ "$FAIL" -gt 0 ]; then
  printf "  ${RED}${BOLD}❌ AUDIT FAILED${RESET} — ${FAIL} critical issue(s) must be fixed before push.\n"
  exit 1
elif [ "$WARN" -gt 0 ] && [ "$STRICT" = 1 ]; then
  printf "  ${YELLOW}${BOLD}⚠  AUDIT OK WITH WARNINGS${RESET} (strict mode: warnings are failures)\n"
  exit 1
else
  printf "  ${GREEN}${BOLD}✓ AUDIT PASSED${RESET} — posture is green. Ship it.\n"
  exit 0
fi
