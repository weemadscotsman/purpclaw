# Evaluation Suite

This directory contains smoke, regression, and chaos testing suites.

## Directory Structure

```
eval/
├── suites/          # Test scripts
│   ├── smoke.py     # Poll all services, print status
│   ├── regression.py # Load baseline, run benchmarks, detect regressions
│   └── chaos.py      # PM2-based chaos testing
├── results/          # Test output (JSON results)
└── baseline.json     # Baseline metrics for regression comparison
```

## smoke.py

Polls service health endpoints and reports UP/DOWN status.

```bash
# Default: polls http://localhost:8080/health
python eval/suites/smoke.py

# Custom services (JSON array via SERVICES env var)
SERVICES='["http://host1:8080/health","http://host2:8080/health"]' python eval/suites/smoke.py
```

Exit code: 0 = all UP, 1 = any DOWN.

---

## regression.py

Loads `baseline.json`, runs benchmarks, and compares results to detect regressions.

```bash
# Default paths
python eval/suites/regression.py

# Custom paths
BASELINE=/path/to/baseline.json BENCHMARK_URL=http://host:8080/benchmark python eval/suites/regression.py
```

Baseline is updated by replacing `eval/baseline.json` with a passing run's output.

Exit code: 0 = no regressions, 1 = regressions found, 2 = benchmark failed.

---

## chaos.py

PM2-based chaos testing. Requires PM2. Randomly applies kill/restart/stop/freeze/melt actions and verifies the service remains healthy.

```bash
# Requires services running under pm2
pm2 start app.js --name myapp
python eval/suites/chaos.py

# Custom health endpoint
HEALTH_URL=http://localhost:8080/health CHAOS_INTERVAL=15 python eval/suites/chaos.py
```

Exit code: 0 = all health checks passed, 1 = any failure.

---

## Capturing a Baseline

To set a new baseline after verifying a healthy system:

```bash
python eval/suites/regression.py
# Copy eval/results/<timestamp>_regression.json → eval/baseline.json
```