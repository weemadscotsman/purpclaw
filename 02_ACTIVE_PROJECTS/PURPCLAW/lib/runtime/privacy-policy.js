'use strict';

const POLICY = Object.freeze({
  id: 'purpclaw-local-only-memory-telemetry',
  version: 1,
  localOnly: true,
  owner: 'user',
  summary: 'PURPCLAW memory, logs, telemetry, traces, chats, sessions, and training data are local-only user assets.',
  rules: [
    'Never send logs, telemetry, memory archives, traces, chats, sessions, or training datasets to a remote telemetry sink.',
    'Telemetry exists only to improve this user-owned PURPCLAW instance and the user personal model/training loop.',
    'Memory retention targets loopback cognitive memory only: 127.0.0.1, localhost, or ::1.',
    'External model/provider calls may happen only for explicit inference work, not telemetry export or hidden retention.',
    'If a remote host is configured for memory retention, ignore it and force loopback.',
  ],
  localFiles: [
    'agent_work/telemetry/pipeline.jsonl',
    'agent_work/memory-retention/journal.jsonl',
    'memory_archive.json.gz',
    'memory_archive.json.gz.bak',
    'E:/training/raw',
    'E:/training/exports',
  ],
});

function privacyPromptBlock() {
  return [
    '# Local Privacy Boundary',
    POLICY.summary,
    '- All telemetry/log/memory/training data is for the user and this local PURPCLAW only.',
    '- Do not create or use any cloud telemetry, remote analytics, hidden upload, or external retention path.',
    '- Use local recall and local training data to make the user personal PURPCLAW sharper over time.',
    '- External providers are allowed only when explicitly selected for model inference/tool work, not for telemetry export.',
  ].join('\n');
}

function privacyMetadata() {
  return {
    privacyPolicyId: POLICY.id,
    privacyPolicyVersion: POLICY.version,
    localOnly: true,
    owner: POLICY.owner,
    telemetryExportAllowed: false,
    remoteRetentionAllowed: false,
  };
}

module.exports = {
  POLICY,
  privacyPromptBlock,
  privacyMetadata,
};
