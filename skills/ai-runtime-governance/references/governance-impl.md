# Governance Implementation Notes (PURPCLAW — 2026-05-23)

## How the orchestrator preflight gate actually works

The orchestrator loads governance at startup:
```javascript
let governance = null;
try {
  governance = require('./lib/governance.js');
  console.log('[ORCHESTRATOR] Governance layer loaded - approval gates active');
} catch (e) {
  console.log('[ORCHESTRATOR] lib/governance.js unavailable - approval gates inactive');
}
```

In the workflow execution path, at the governance stage:
```javascript
if (governance) {
  const check = governance.checkWorkflow(__dirname, workflow.command, workflow.contract, {
    approvalId: workflowInput.approvalId,
  });

  if (!check.requiresApproval || check.approved) {
    // proceed with execution
  } else {
    const approval = governance.requestApproval(
      __dirname, workflowId, workflow.command, workflow.contract, check
    );
    workflow.approval = approval;
    workflow.status = 'waiting_approval';
    workflow.result = {
      status: 'approval_required',
      approvalId: approval.id,
      risks: check.risks,
      message: `Approval required before PURPCLAW can execute this ${workflow.contract?.type || 'job'}`,
    };
    return; // execution held here
  }
}
```

The `waiting_approval` status is checked at multiple points:
- In the main workflow loop (`if (workflow.status === 'waiting_approval')`)
- In `holdWorkflowForApproval()` which publishes events and streams results to SSE clients
- On re-run, the operator passes `--approvalId` to bypass (after approving)

## Approval flow

1. Job enters orchestrator → risk classified via `checkWorkflow()`
2. Risky jobs → `requestApproval()` → status set to `waiting_approval`
3. Approval ID returned to CLI → operator runs `purpclaw approve <id>`
4. On next orchestrator poll (or re-run), `setApprovalStatus()` marks it approved → workflow resumes

## Governance commands and what they do

```bash
# View pending
purpclaw jobs pending
# → reads agent_work/approval_requests.jsonl, filters for status='pending'

# Approve
purpclaw approve approval-<timestamp>-<random>
# → appends {id, status:'approved', decidedAt} to JSONL

# Reject
purpclaw reject approval-<timestamp>-<random> "reason here"
# → appends {id, status:'rejected', decidedAt} to JSONL

# Check orchestrator has reloaded the approval
# Orchestrator reads JSONL each poll cycle — no restart needed
```

## Risk classification (lib/governance.js classifyRisk)

Uses regex against the command text:
- `/\b(delete|remove|wipe|kill|drop|truncate|reset|purge|clean)\b/` → destructive
- `/\b(npm install|pip install|...)\b/` → dependency-change
- `/\b(deploy|publish|release|...)\b/` → deployment
- `/\b(secret|token|api key|\.env|credential|password)\b/` → secret-change
- `/\b(self|purpclaw|orchestrator|tower|memory matrix|backend|service_registry|ecosystem)\b/` → self-modification
- `/\b(fetch|download|external|internet|webhook|remote|api call)\b/` → external-network
- `/\b(voice|vision|yolo|cognitive|all services|optional stack)\b/` → optional-service-launch

Default: if no risks matched but has test/lint/build → `test`, otherwise → `draft`.

Contract types also add risks: `research` → external-network, `operations` → self-modification.

## Policy mode

Currently: `supervised` (the only mode implemented).
`requireApprovalFor`: destructive, dependency-change, deployment, secret-change, self-modification, external-network, optional-service-launch.
`allowWithoutApproval`: read-only, diagnostic, draft, test.

## Key gotchas

- `purpclaw rollback` is surface only — needs snapshot manifest per approved job to actually revert. Currently shows job metadata but doesn't auto-restore.
- Governance preflight only fires for new jobs routed through the orchestrator. Direct CLI commands bypass it — that's by design for `purpclaw doctor` etc.
- JSONL format means the orchestrator can append without reading the whole log. On poll, it reads the whole file and de-dupes by latest status per ID.