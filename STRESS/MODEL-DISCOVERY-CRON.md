# Model Discovery — Daily Auto-Update

## Cron setup

Add to your `crontab -e` (Windows: use Task Scheduler):

```cron
# Daily 6am — discover new models and apply
0 6 * * * cd /e/god\ folder/02_ACTIVE_PROJECTS/PURPCLAW && node bin/model-discover.js --apply >> agent_work/model-discovery/cron.log 2>&1
```

Or dry-run mode (recommended until you trust it):
```cron
0 6 * * * cd /e/god\ folder/02_ACTIVE_PROJECTS/PURPCLAW && node bin/model-discover.js --check >> agent_work/model-discovery/cron.log 2>&1
```

## What it does

1. Probes 3 sources: NVIDIA NIM, OpenRouter, HuggingFace trending
2. Compares against `agent_work/model-discovery/last-seen.json`
3. Ranks new models by score (NIM > OpenRouter :free > HF downloads)
4. **In `--check` mode**: writes report to `agent_work/model-discovery/latest-report.json`
5. **In `--apply` mode**: updates the top candidate's `defaultModel` in:
   - `lib/llm-provider.js`
   - `lib/runtime/provider-router.js`

## Manual run

```bash
# Check (no writes)
node bin/model-discover.js --check
node bin/purpclaw.js models check

# Apply (writes to provider registry)
node bin/model-discover.js --apply
node bin/purpclaw.js models apply

# JSON output (for CI)
node bin/model-discover.js --check --json
```

## First-run baseline

The very first run marked **597 of 616** discovered models as "new" (everything was unknown). Subsequent runs will only flag models added since the last check.
