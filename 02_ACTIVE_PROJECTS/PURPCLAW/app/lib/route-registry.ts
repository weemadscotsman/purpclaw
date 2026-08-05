// Stub — route registry for tab validation.

const VALID_TABS = new Set([
  'overview', 'evolution', 'graph', 'agents', 'tower',
  'swarm', 'harness', 'pipeline', 'timeline', 'gatekeeper',
  'cognitive', 'command', 'logs', 'mochi', 'sampler',
  'dream', 'abliterator', 'data',
]);

export function isMissionTab(tab: string | null | undefined): tab is string {
  return !!tab && VALID_TABS.has(tab);
}
