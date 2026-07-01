#!/usr/bin/env bash
# phoenix_smoke.sh — PHOENIX Recovery Smoke Test (bash + curl edition)
#
# Same contract as scripts/phoenix_smoke.py but with zero Python deps.
# Tries python first; falls back to a thin bash version of the same checks.
#
# Exit codes:
#   0   all checks passed
#   1   one or more checks failed
#   2   neither python nor curl available

set -u  # NOTE: deliberately not -e — we want to keep going through every check

PURPCLAW_BASE="${PURPCLAW_BASE:-http://127.0.0.1:3030}"
UNIFIED_API="${PURPCLAW_API_URL:-http://127.0.0.1:7780}"
AGENT_TOWER="${PURPCLAW_TOWER_URL:-http://127.0.0.1:7790}"
REPORT_PATH="${PHOENIX_REPORT:-agent_work/phoenix_smoke_report.sh.json}"

# Prefer python if available — it's the real smoke test
if command -v python >/dev/null 2>&1; then
    PY="python"
elif command -v python3 >/dev/null 2>&1; then
    PY="python3"
else
    PY=""
fi

if [ -n "$PY" ]; then
    exec env PURPCLAW_BASE="$PURPCLAW_BASE" \
              PURPCLAW_API_URL="$UNIFIED_API" \
              PURPCLAW_TOWER_URL="$AGENT_TOWER" \
              PHOENIX_REPORT="$REPORT_PATH" \
              "$PY" "$(dirname "$0")/phoenix_smoke.py" "$@"
fi

# Fallback: pure bash + curl
if ! command -v curl >/dev/null 2>&1; then
    echo "❌ phoenix_smoke.sh: need either python or curl installed" >&2
    exit 2
fi

echo "🔥 PHOENIX — bash fallback smoke test"
echo "  PURPCLAW_BASE=$PURPCLAW_BASE"
echo "  UNIFIED_API=$UNIFIED_API"
echo "  AGENT_TOWER=$AGENT_TOWER"

PASS=0
FAIL=0

check() {
    local name="$1"
    local cond="$2"   # 0 = pass, non-zero = fail
    local detail="$3"
    if [ "$cond" = "0" ]; then
        echo "  ✓ $name — $detail"
        PASS=$((PASS+1))
    else
        echo "  ✗ $name — $detail"
        FAIL=$((FAIL+1))
    fi
}

probe() {
    local url="$1"
    local timeout="${2:-4}"
    curl -sS -m "$timeout" -o /tmp/phoenix_body_$$ -w "%{http_code}" "$url" 2>/dev/null
    local code=$?
    local body
    body=$(cat /tmp/phoenix_body_$$ 2>/dev/null)
    rm -f /tmp/phoenix_body_$$
    echo "$code|$body"
}

# --- Phase 1: env ---
echo
echo "🔥 PHASE 1 — Environment validation"
MISSING=""
for v in PURPCLAW_MODE PURPCLAW_OPERATOR UNIFIED_API_URL; do
    if [ -z "${!v:-}" ]; then MISSING="$MISSING $v"; fi
done
if [ -n "${MISSING// /}" ]; then
    check "env/required" 1 "missing:$MISSING"
else
    check "env/required" 0 "all required env vars present"
fi

WIRED=0
for v in MINIMAX_API_KEY OPENROUTER_API_KEY DEEPSEEK_API_KEY NVIDIA_API_KEY \
         ANTHROPIC_API_KEY OPENAI_API_KEY GITHUB_MODELS_API_KEY \
         KIMI_API_KEY OLLAMA_HOST; do
    if [ -n "${!v:-}" ]; then WIRED=$((WIRED+1)); fi
done
if [ "$WIRED" -eq 0 ]; then
    check "env/providers" 1 "no provider API keys present"
else
    check "env/providers" 0 "$WIRED provider(s) wired"
fi

# --- Phase 2: health ---
echo
echo "🔥 PHASE 2 — Service health probes"
for path in /api/yo /api/heartbeat /api/services /api/spine-health \
            /api/pulse /api/llm-status /api/manifest /api/host-telemetry \
            /api/delegation/status /api/internal/check; do
    out=$(probe "${PURPCLAW_BASE}${path}" 6)
    code=${out%%|*}
    body=${out#*|}
    if [ "$code" = "200" ]; then
        check "health$path" 0 "code=200 body=${body:0:80}"
    elif [ "$code" = "502" ]; then
        check "health$path" 0 "code=502 (proxy fallback)"
    else
        check "health$path" 1 "code=$code"
    fi
done

# --- Phase 3+4: agent spawn + dispatch (best-effort) ---
echo
echo "🔥 PHASE 3/4 — Agent spawn + dispatch (best-effort)"
PERSONAS="phoenix:creative architect:engineering owl:intelligence wolf:management mantis:media-operations crow:operations scientist:science guardian:security cactus:voice-infrastructure"
for p in $PERSONAS; do
    agent="${p%%:*}"
    division="${p##*:}"
    payload="{\"agent\":\"$agent\",\"division\":\"$division\",\"task\":\"phoenix smoke test\"}"
    out=$(curl -sS -m 8 -X POST -H "Content-Type: application/json" \
                -d "$payload" -o /tmp/phoenix_body_$$ -w "%{http_code}" \
                "${AGENT_TOWER}/tower/spawn" 2>/dev/null)
    code=$?
    body=$(cat /tmp/phoenix_body_$$ 2>/dev/null)
    rm -f /tmp/phoenix_body_$$
    if [ "$out" = "200" ] || [ "$out" = "201" ] || [ "$out" = "202" ]; then
        check "agents/spawn/$agent" 0 "code=$out division=$division"
    else
        check "agents/spawn/$agent" 1 "code=$out division=$division"
    fi
done

# --- Phase 5: telemetry ---
echo
echo "🔥 PHASE 5 — Telemetry + queue depth"
for path in /api/host-telemetry /api/delegation/status /api/internal/check /api/llm-status; do
    out=$(probe "${PURPCLAW_BASE}${path}" 4)
    code=${out%%|*}
    if [ "$code" = "200" ]; then
        check "telemetry$path" 0 "code=200"
    else
        check "telemetry$path" 1 "code=$code"
    fi
done

# --- Report ---
echo
echo "==========================================================="
echo "🔥 PHOENIX SMOKE REPORT (bash fallback)"
echo "==========================================================="
echo "  Total: $((PASS+FAIL))   Pass: $PASS   Fail: $FAIL"
if [ "$FAIL" -eq 0 ]; then
    echo "🔥 SMOKE TEST PASSED — swarm is healthy."
else
    echo "💀 SMOKE TEST FAILED — $FAIL check(s) need attention."
fi
echo "==========================================================="

# JSON-ish report (best effort)
mkdir -p "$(dirname "$REPORT_PATH")" 2>/dev/null
cat > "$REPORT_PATH" <<EOF
{
  "ok": $([ "$FAIL" -eq 0 ] && echo true || echo false),
  "passed": $PASS,
  "failed": $FAIL,
  "total": $((PASS+FAIL)),
  "at": $(date +%s),
  "mode": "bash-fallback"
}
EOF

exit $FAIL
