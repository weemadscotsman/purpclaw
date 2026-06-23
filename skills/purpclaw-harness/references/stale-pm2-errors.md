# Stale PM2 Error Log Investigation — 2026-05-24

## What happened

Old pm2 error log showed:
```
[ORCH] orchestrate catch block: TypeError: governance.appendApproval is not a function
    at failWorkflow (E:\god folder\02_ACTIVE_PROJECTS\PURPCLAW\orchestrator.js:1689:16)
```

This looked like governance.js wasn't exporting `appendApproval` correctly. 

## Investigation steps

1. **Verified governance.js exports are correct:**
   ```bash
   node -e "const g = require('E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/lib/governance.js'); console.log(typeof g.appendApproval)"
   # Output: function
   ```

2. **Checked orchestrator.js loads it correctly:**
   ```javascript
   // line 148-154
   let governance = null;
   try {
     governance = require('./lib/governance.js');
     console.log('[ORCHESTRATOR] Governance layer loaded - approval gates active');
   } catch (e) {
     console.log('[ORCHESTRATOR] lib/governance.js unavailable - approval gates disabled');
   }
   ```
   Module loads fine. No try/catch error.

3. **Verified appendApproval IS called in failWorkflow and completeWorkflow** — already wired, not missing.

4. **Checked current orchestrator status:**
   ```bash
   pm2 list | grep orchestrator
   # pid: 154512, uptime: 4m, status: online
   tail ~/.pm2/logs/purpclaw-orchestrator-error.log
   ```
   Current process has been up for 4 minutes with no new errors. Old log entries from a previous crash remained in the file.

5. **Root cause:** governance.js was updated previously (appendApproval added to exports), but PM2 error logs accumulate in the same file. Old crash entries don't mean current process has the same problem.

## Diagnosis pattern (reusable)

When old error log entries look alarming but the service is running fine:

1. Check `pm2 list` — uptime tells you when process last started
2. If uptime is fresh and no new errors appearing, the old entries predate the current process
3. `tail -n 20 ~/.pm2/logs/*.log` only shows the most recent entries; `grep -v "at Module\|at Object"` to filter stack frames
4. PM2 restart (`pm2 restart servname --time`) clears the process; if new errors don't reappear, it was a one-time historical entry
5. Always verify: `node -e "require('./lib/module.js')"` to check if module actually exports what the error says is missing

## Key insight

PM2 error logs are append-only files for the entire process lifetime. They don't reset on restart. A log entry from a previous process instance doesn't mean the current process has the same problem — it means "at some point in the history of this pm2 service, this error occurred."

Before acting on any pm2 error log entry, check `pm2 list` to see current process uptime, then check whether the error is still occurring in the current process.