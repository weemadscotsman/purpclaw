'use strict';

/**
 * HTTP Worker — reference documentation + helpers
 * ═══════════════════════════════════════════════
 * HTTP workers are remote PURPCLAW instances or lightweight runner services
 * that expose the worker HTTP API on a port (default 7897).
 *
 * API contract (the remote service must implement these):
 *
 *   GET  /health           → { status:'healthy', active:N, capacity:M, version:'...' }
 *   POST /task             → { jobId:'...', queued:true }
 *   GET  /task/:jobId      → { jobId, status:'running'|'completed'|'failed', result?, error? }
 *   GET  /tasks            → [ { jobId, agentName, status, startedAt, ... }, ... ]
 *   DELETE /task/:jobId    → { cancelled:true }
 *
 * The worker_service.js in the root PURPCLAW directory implements this contract
 * so any PURPCLAW node can act as an HTTP worker for another orchestrator.
 *
 * Registration example:
 *   purpclaw workers add --name gpu-box --type http --url http://192.168.1.50:7897
 */

module.exports = {
  /** Documented API contract — actual dispatch is in worker-pool.js _dispatchHttp() */
  API_PATHS: {
    health:   '/health',
    postTask: '/task',
    getTask:  '/task/:jobId',
    listTasks: '/tasks',
    deleteTask: '/task/:jobId',
  },

  /** Default port for remote worker service */
  DEFAULT_PORT: 7897,

  /** Suggested curl for manual testing */
  smokeTest(url) {
    return [
      `curl -s ${url}/health`,
      `curl -s -X POST ${url}/task -H 'Content-Type: application/json' -d '{"agentName":"dragon","task":"test","options":{}}'`,
    ];
  }
};
