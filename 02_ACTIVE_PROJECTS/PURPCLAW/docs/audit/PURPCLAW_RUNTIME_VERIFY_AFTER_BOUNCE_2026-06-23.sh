#!/usr/bin/env bash
# PURPCLAW runtime-verification probe — paste AFTER `pm2 restart purpclaw-nextjs purpclaw-api`
# Each row = one task lane. PASS means the HTTP body is non-empty + status 200.
# Copy-paste this whole block into bash. Reports per-row verdict.

set +e

probe() {
  local name="$1" url="$2" expect_status="${3:-200}" min_bytes="${4:-500}"
  local out
  out=$(curl -s -o /tmp/purpclaw-probe.tmp -w "%{http_code} %{size_download}" --max-time 6 "$url")
  local status=${out%% *}
  local size=${out##* }
  if [[ "$status" == "$expect_status" && "$size" -ge "$min_bytes" ]]; then
    printf "  PASS  %-32s  %s  (%s bytes)\n" "$name" "$status" "$size"
  else
    printf "  FAIL  %-32s  expected=%s got=%s size=%s (%s bytes)\n" "$name" "$expect_status" "$status" "$size" "$size"
  fi
}

echo "=== MissionControl + CockpitShell restore ==="
probe "/mission"               "http://localhost:3030/mission"                  200 3000
probe "/mission/harness"       "http://localhost:3030/mission/harness"          200 3000
probe "/cockpit (redirect)"    "http://localhost:3030/cockpit"                  307 0
probe "/dash (redirect)"       "http://localhost:3030/dash"                     307 0

echo "=== 15 missing-wiring pages (Task #9 R1) ==="
probe "/evolution"             "http://localhost:3030/evolution"                200 500
probe "/inline"                "http://localhost:3030/inline"                   200 500
probe "/omni"                  "http://localhost:3030/omni"                     200 500
probe "/pipeline"              "http://localhost:3030/pipeline"                 200 500
probe "/providers"             "http://localhost:3030/providers"                200 500
probe "/swarm"                 "http://localhost:3030/swarm"                    200 500
probe "/preprompt"             "http://localhost:3030/preprompt"                200 500
probe "/voice"                 "http://localhost:3030/voice"                    200 500
probe "/settings"              "http://localhost:3030/settings"                 200 500
probe "/agents"                "http://localhost:3030/agents"                   200 500
probe "/mochi"                 "http://localhost:3030/mochi"                    200 500
probe "/bridge"                "http://localhost:3030/bridge"                   200 500
probe "/spine"                 "http://localhost:3030/spine"                    200 500
probe "/memory"                "http://localhost:3030/memory"                   200 500
probe "/frameworks"            "http://localhost:3030/frameworks"               200 500
probe "/abliterator"           "http://localhost:3030/abliterator"              200 500
probe "/skyscraper"            "http://localhost:3030/skyscraper"               200 500
probe "/system-map"            "http://localhost:3030/system-map"               200 500

echo "=== Harbor API routes (Task #19) ==="
probe "/api/harvest/status"    "http://localhost:7780/api/harvest/status"       200 30
probe "/api/harvest/search?q=cosmic" "http://localhost:7780/api/harvest/search?q=cosmic" 200 30
probe "/api/health"            "http://localhost:7780/api/health"               200 100

echo
echo "If anything FAILs above, do NOT mark Task #20 closed — paste the output back."
