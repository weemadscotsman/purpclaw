'use client';

import React, { useState, useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  Node,
  Edge,
  useNodesState,
  useEdgesState,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCognitiveServices } from '../hooks/useCognitiveServices';

function proxyUrl(port: number, path: string) {
  return `/api/service-proxy?port=${port}&path=${encodeURIComponent(path)}`;
}

function serviceReachable(status?: string) {
  return status === 'online' || status === 'degraded';
}

export function CognitivePanel() {
  const {
    services,
    memoryStats,
    bridgeStats,
    modalStats,
    diagStats,
    rulesStats,
    dreamStats,
    visionBridgeStatus,
    loading,
  } = useCognitiveServices();

  const [rulesQuery, setRulesQuery] = useState('');
  const [rulesResult, setRulesResult] = useState<any>(null);
  const [memoryQuery, setMemoryQuery] = useState('');
  const [memoryResult, setMemoryResult] = useState<any>(null);
  const [diagRunning, setDiagRunning] = useState(false);
  const [diagResult, setDiagResult] = useState<any>(null);
  const [causalDot, setCausalDot] = useState<string | null>(null);
  const [showCausal, setShowCausal] = useState(false);

  const healthyCount = services.filter(s => serviceReachable(s.status)).length;

  const runRulesQuery = useCallback(async () => {
    if (!rulesQuery.trim()) return;
    try {
      const res = await fetch(proxyUrl(7787, '/query'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: rulesQuery }),
      });
      const proxied = await res.json();
      setRulesResult(proxied.data ?? proxied);
    } catch (e) {
      setRulesResult({ error: 'Rules engine offline' });
    }
  }, [rulesQuery]);

  const runRulesInfer = useCallback(async () => {
    try {
      const res = await fetch(proxyUrl(7787, '/infer'));
      const proxied = await res.json();
      setRulesResult(proxied.data ?? proxied);
    } catch (e) {
      setRulesResult({ error: 'Rules engine offline' });
    }
  }, []);

  const runMemoryRecall = useCallback(async () => {
    if (!memoryQuery.trim()) return;
    try {
      const res = await fetch(proxyUrl(7880, '/recall'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: memoryQuery, limit: 5 }),
      });
      const proxied = await res.json();
      setMemoryResult(proxied.data ?? proxied);
    } catch (e) {
      setMemoryResult({ error: 'Memory Matrix offline' });
    }
  }, [memoryQuery]);

  const runDiagnostics = useCallback(async () => {
    setDiagRunning(true);
    try {
      const [diagRes, voteRes] = await Promise.all([
        fetch(proxyUrl(7786, '/diagnose')),
        fetch(proxyUrl(7786, '/vote')),
      ]);
      const diagProxy = await diagRes.json();
      const voteProxy = await voteRes.json();
      const diagData = diagProxy.data ?? diagProxy;
      const voteData = voteProxy.data ?? voteProxy;
      setDiagResult({ ...diagData, votes: voteData });
    } catch (e) {
      setDiagResult({ error: 'Diagnostics offline' });
    } finally {
      setDiagRunning(false);
    }
  }, []);

  const fetchCausalGraph = useCallback(async () => {
    try {
      const res = await fetch(proxyUrl(7786, '/causal-graph/dot'));
      const proxied = await res.json();
      setCausalDot(typeof proxied.data === 'string' ? proxied.data : '// Causal graph unavailable');
      setShowCausal(true);
    } catch (e) {
      setCausalDot('// Causal graph unavailable');
      setShowCausal(true);
    }
  }, []);

  const statusDot = (status: string) => {
    const color = status === 'online' ? '#22c55e' : status === 'checking' ? '#f59e0b' : '#ef4444';
    return <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }} />;
  };

  return (
    <div className="h-full overflow-y-auto space-y-4 p-1">
      {/* Service Health */}
      <section className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[11px] uppercase tracking-[0.2em] text-white/40 font-mono">Cognitive Services</h3>
          <span className="text-[10px] text-white/30 font-mono">{healthyCount}/{services.length} online {loading && '•'}</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {services.map(svc => (
            <div key={svc.name} className="relative rounded-lg border border-white/10 bg-white/[0.03] p-3 hover:border-white/20 transition-all">
              <div className="flex items-center gap-2 mb-2">
                {statusDot(svc.status)}
                <span className="text-[10px] uppercase tracking-wider text-white/60 font-mono truncate">{svc.name}</span>
              </div>
              <div className="text-xs text-white/40 font-mono">:{svc.port}</div>
              {svc.latency !== undefined && <div className="text-[10px] text-white/30 font-mono mt-1">{svc.latency}ms</div>}
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Memory Matrix */}
        <section className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
          <h3 className="text-[11px] uppercase tracking-[0.2em] text-white/40 font-mono">Memory Matrix v2</h3>
          <div className="grid grid-cols-3 gap-3">
            <Metric label="Atoms" value={memoryStats?.total_atoms ?? '-'} />
            <Metric label="Projections" value={memoryStats?.temporal_entities ?? memoryStats?.temporal_projections ?? '-'} />
            <Metric label="Branches" value={memoryStats?.counterfactual_branches ?? '-'} />
          </div>
          <div className="flex gap-2">
            <input
              value={memoryQuery}
              onChange={e => setMemoryQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && runMemoryRecall()}
              placeholder="Recall query..."
              className="flex-1 px-3 py-2 rounded-md bg-black/40 border border-white/10 text-xs text-white/70 placeholder:text-white/20 focus:outline-none focus:border-white/30"
            />
            <button onClick={runMemoryRecall} className="px-3 py-2 rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold uppercase tracking-wider hover:bg-emerald-500/30 transition-all">
              Recall
            </button>
          </div>
          {memoryResult && (
            <div className="rounded-lg bg-black/30 p-2 text-[11px] font-mono text-white/60 max-h-40 overflow-y-auto">
              <pre className="whitespace-pre-wrap">{JSON.stringify(memoryResult, null, 2)}</pre>
            </div>
          )}
        </section>

        {/* Symbolic Rules */}
        <section className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
          <h3 className="text-[11px] uppercase tracking-[0.2em] text-white/40 font-mono">Symbolic Rules Engine</h3>
          <div className="grid grid-cols-3 gap-3">
            <Metric label="Facts" value={rulesStats?.facts ?? rulesStats?.total_facts ?? '-'} />
            <Metric label="Rules" value={rulesStats?.rules ?? '-'} />
            <Metric label="Derived" value={rulesStats?.derived_facts ?? '-'} />
          </div>
          <div className="flex gap-2">
            <input
              value={rulesQuery}
              onChange={e => setRulesQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && runRulesQuery()}
              placeholder="Datalog query..."
              className="flex-1 px-3 py-2 rounded-md bg-black/40 border border-white/10 text-xs text-white/70 placeholder:text-white/20 focus:outline-none focus:border-white/30"
            />
            <button onClick={runRulesQuery} className="px-3 py-2 rounded-md bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 text-xs font-bold uppercase tracking-wider hover:bg-cyan-500/30 transition-all">
              Query
            </button>
            <button onClick={runRulesInfer} className="px-3 py-2 rounded-md bg-purple-500/20 text-purple-400 border border-purple-500/30 text-xs font-bold uppercase tracking-wider hover:bg-purple-500/30 transition-all">
              Infer
            </button>
          </div>
          {rulesResult && (
            <div className="rounded-lg bg-black/30 p-2 text-[11px] font-mono text-white/60 max-h-40 overflow-y-auto">
              <pre className="whitespace-pre-wrap">{JSON.stringify(rulesResult, null, 2)}</pre>
            </div>
          )}
        </section>

        {/* Modal Logic */}
        <section className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
          <h3 className="text-[11px] uppercase tracking-[0.2em] text-white/40 font-mono">Modal Logic Engine</h3>
          <div className="grid grid-cols-4 gap-3">
            <Badge label="Agents" value={modalStats?.agents ?? '-'} color="#a855f7" />
            <Badge label="Worlds" value={modalStats?.worlds ?? modalStats?.total_worlds ?? '-'} color="#22d3ee" />
            <Badge label="Beliefs" value={modalStats?.beliefs ?? '-'} color="#f472b6" />
            <Badge label="Events" value={modalStats?.temporal_events ?? modalStats?.events ?? '-'} color="#4ade80" />
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="text-[10px] px-2 py-1 rounded bg-white/5 text-white/40 border border-white/10">Epistemic</span>
            <span className="text-[10px] px-2 py-1 rounded bg-white/5 text-white/40 border border-white/10">Temporal</span>
            <span className="text-[10px] px-2 py-1 rounded bg-white/5 text-white/40 border border-white/10">Doxastic</span>
            <span className="text-[10px] px-2 py-1 rounded bg-white/5 text-white/40 border border-white/10">Deontic</span>
          </div>
        </section>

        {/* Neuro-Symbolic Bridge */}
        <section className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
          <h3 className="text-[11px] uppercase tracking-[0.2em] text-white/40 font-mono">Neuro-Symbolic Bridge</h3>
          <div className="grid grid-cols-3 gap-3">
            <Metric label="Lifted Facts" value={bridgeStats?.lifted_count ?? bridgeStats?.facts_total ?? '-'} />
            <Metric label="Queries" value={bridgeStats?.query_count ?? '-'} />
            <Metric label="Entities" value={bridgeStats?.entity_index_size ?? '-'} />
          </div>
          {visionBridgeStatus && (
            <div className="flex items-center gap-3 text-[11px] font-mono text-white/50">
              <span>Vision Bridge:</span>
              <span className={visionBridgeStatus.bridgeConnected ? 'text-emerald-400' : 'text-rose-400'}>
                {visionBridgeStatus.bridgeConnected ? 'Connected' : 'Disconnected'}
              </span>
              {visionBridgeStatus.liftedCount !== undefined && (
                <span className="text-white/30">Lifted: {visionBridgeStatus.liftedCount}</span>
              )}
            </div>
          )}
        </section>
      </div>

      {/* Diagnostics */}
      <section className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-[11px] uppercase tracking-[0.2em] text-white/40 font-mono">Autonomous Diagnostics</h3>
          <div className="flex gap-2">
            <button
              onClick={runDiagnostics}
              disabled={diagRunning}
              className="px-3 py-1.5 rounded-md bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-bold uppercase tracking-wider hover:bg-amber-500/30 disabled:opacity-50 transition-all"
            >
              {diagRunning ? 'Running...' : 'Run Diagnosis'}
            </button>
            <button
              onClick={fetchCausalGraph}
              className="px-3 py-1.5 rounded-md bg-white/5 text-white/60 border border-white/10 text-xs font-bold uppercase tracking-wider hover:bg-white/10 transition-all"
            >
              Causal Graph
            </button>
          </div>
        </div>

        {diagResult && !diagResult.error && (
          <div className="space-y-3">
            {diagResult.votes?.tally && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {Object.entries(diagResult.votes.tally).map(([cause, count]: [string, any]) => (
                  <div key={cause} className="rounded-lg bg-black/30 px-3 py-2">
                    <div className="text-[10px] text-white/30 uppercase truncate">{cause}</div>
                    <div className="text-lg font-light text-cyan-400">{count as number}</div>
                  </div>
                ))}
              </div>
            )}
            {diagResult.results && (
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {Object.entries(diagResult.results).map(([agent, findings]: [string, any]) =>
                  findings.length > 0 ? (
                    <div key={agent} className="rounded-lg bg-black/30 px-3 py-2">
                      <div className="text-[10px] text-white/30 uppercase mb-1">{agent}</div>
                      <div className="space-y-1">
                        {findings.map((f: any, i: number) => (
                          <div key={i} className="text-[11px] text-white/60 flex items-center gap-2">
                            <span className={`w-1.5 h-1.5 rounded-full ${f.severity === 'CRITICAL' ? 'bg-rose-400' : f.severity === 'ERROR' ? 'bg-rose-400' : f.severity === 'WARNING' ? 'bg-amber-400' : 'bg-cyan-400'}`} />
                            <span className="truncate">{f.description}</span>
                            <span className="text-white/30 ml-auto">{f.confidence}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null
                )}
              </div>
            )}
          </div>
        )}

        {diagResult?.error && (
          <div className="text-[11px] text-rose-400 font-mono">{diagResult.error}</div>
        )}

        {showCausal && causalDot && (
          <CausalGraphView dot={causalDot} />
        )}
      </section>

      {/* AutoDream Consolidation */}
      <section className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
        <h3 className="text-[11px] uppercase tracking-[0.2em] text-white/40 font-mono">AutoDream Consolidation</h3>
        {dreamStats ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Metric label="Entries" value={dreamStats.entries ?? dreamStats.entryCount ?? '-'} />
            <Metric label="Threshold" value={dreamStats.threshold ?? '-'} />
            <Metric label="Cycles" value={dreamStats.totalCycles ?? '-'} />
            <Metric label="Merged" value={dreamStats.entriesMerged ?? '-'} />
            <Metric label="Rules Extracted" value={dreamStats.rulesExtracted ?? '-'} />
            <Metric label="Needs Consolidation" value={dreamStats.needsConsolidation ? 'Yes' : 'No'} />
            {dreamStats.lastConsolidation && (
              <div className="col-span-2 text-[10px] font-mono text-white/30 mt-1">
                Last: {new Date(dreamStats.lastConsolidation).toLocaleTimeString()}
              </div>
            )}
          </div>
        ) : (
          <div className="text-[11px] text-white/30 font-mono">AutoDream offline — daemon not running</div>
        )}
      </section>
    </div>
  );
}

function parseDotToGraph(dot: string): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  // Parse DOT: node "name" [label="Label"]; and edge "a" -> "b";
  const nodeRe = /^\s*"(\w+)"\s*\[label="([^"]+)"[^]]*\];?\s*$/gm;
  const edgeRe = /^\s*"(\w+)"\s*->\s*"(\w+)"[^;]*;?\s*$/gm;
  const bareNodeRe = /^\s*"(\w+)"\s*\[.*?\];?\s*$/gm;
  let match: RegExpExecArray | null;
  while ((match = nodeRe.exec(dot)) !== null) {
    nodes.push({ id: match[1], data: { label: match[2] }, position: { x: 0, y: 0 } });
  }
  while ((match = edgeRe.exec(dot)) !== null) {
    edges.push({
      id: `${match[1]}->${match[2]}`,
      source: match[1],
      target: match[2],
      style: { stroke: '#ffffff30', strokeWidth: 1 },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#ffffff30' },
    });
  }
  // Bare nodes (no label attr)
  nodeRe.lastIndex = 0;
  while ((match = bareNodeRe.exec(dot)) !== null) {
    const nodeId = match[1];
    if (nodeId != null && !nodes.find(n => n.id === nodeId)) {
      nodes.push({ id: nodeId, data: { label: nodeId }, position: { x: 0, y: 0 } });
    }
  }
  return { nodes, edges };
}

function CausalGraphView({ dot }: { dot: string }) {
  const { nodes: rawNodes, edges: rawEdges } = useMemo(() => parseDotToGraph(dot), [dot]);
  const [nodes, , onNodesChange] = useNodesState(rawNodes);
  const [edges, , onEdgesChange] = useEdgesState(rawEdges);

  if (rawNodes.length === 0) {
    return <pre className="text-[10px] font-mono text-white/50 whitespace-pre-wrap">{dot}</pre>;
  }

  return (
    <div className="rounded-lg bg-black/30 p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-white/30 uppercase">Causal Graph</span>
      </div>
      <div className="h-64 rounded border border-white/10 overflow-hidden">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          fitView
          nodesDraggable={false}
          panOnDrag
          zoomOnScroll
          style={{ background: 'transparent' }}
        >
          <Background color="rgba(255,255,255,0.05)" gap={16} size={1} />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-black/30 px-3 py-2 text-center">
      <div className="text-lg font-light text-white/90">{value}</div>
      <div className="text-[9px] text-white/30 uppercase">{label}</div>
    </div>
  );
}

function Badge({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="rounded-lg px-3 py-2 text-center border border-white/10" style={{ backgroundColor: `${color}10` }}>
      <div className="text-lg font-light" style={{ color }}>{value}</div>
      <div className="text-[9px] text-white/30 uppercase">{label}</div>
    </div>
  );
}
