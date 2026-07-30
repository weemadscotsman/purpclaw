// Test: verify workflow resume callback fires when a real approval ID is resolved
const AQ = require('../lib/approval-queue.js');

// Register callback with a real-looking ID
const fakeId = 'apr_' + 'a'.repeat(16);
let cbFired = false;

AQ.onWorkflowApprovalResolved(fakeId, (approvalId, resolution) => {
  cbFired = true;
  console.log('CALLBACK FIRED: id=' + approvalId + ' res=' + resolution);
  process.exit(0);
});

// Try to resolve a non-existent approval — should return false
AQ.resolveApproval(fakeId, 'approved', 'test').then(r => {
  console.log('resolveApproval (non-existent) returned:', r, 'cbFired:', cbFired);
  // Now try with the first pending approval from the queue
  const pending = AQ.getPendingApprovals();
  if (pending.length > 0) {
    const realId = pending[0].id;
    console.log('Testing with real pending approval:', realId);
    AQ.onWorkflowApprovalResolved(realId, (approvalId, resolution) => {
      console.log('CALLBACK FIRED ON REAL ID: id=' + approvalId + ' res=' + resolution);
      process.exit(0);
    });
    AQ.resolveApproval(realId, 'denied', 'test').then(r2 => {
      console.log('resolveApproval (real) returned:', r2);
      setTimeout(() => { console.log('FAIL: callback did not fire'); process.exit(1); }, 500);
    });
  } else {
    console.log('No pending approvals — test inconclusive');
    process.exit(1);
  }
});
