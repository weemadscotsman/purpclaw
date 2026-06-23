'use client';

import { useEffect, useState } from 'react';
import type { MissionData } from '../hooks/useMissionData';

/**
 * GatekeeperPanel — LIVE safety gate status.
 *
 * Pulls the dedicated /api/gatekeeper-status route (gatekeeper :7791) for the
 * real check counts + posture, and falls back to MissionData service health /
 * diagnostics when that route is unreachable.
 */
export function GatekeeperPanel({ data }: { data: MissionData }) {
  const diag = data?.diagnostics;
  const gates = (diag as any)?.gatekeepers || [];
  const services = data?.services || [];

  // Live pull from the gatekeeper's own endpoint (richer than service health).
  const [live, setLive] = useState<any>(null);
  useEffect(() => {
    let alive = true;
    const pull = async () => {
      try {
        const r = await fetch('/api/gatekeeper-status', { signal: AbortSignal.timeout(5000) });
        if (alive && r.ok) setLive(await r.json());
      } catch { /* fall back to service health */ }
    };
    pull();
    const t = setInterval(pull, 5000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  // Derive gate info from the live route, else service health.
  const gatekeeperService = services.find(s => s.key === 'gatekeeper');
  const online = (live?.ok && live?.status === 'operational') || gatekeeperService?.status === 'online';
  const checks = live?.checks || null;

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-sm font-bold uppercase tracking-widest text-cyan-400">Risk Gate</h2>
        <span className={`text-[10px] px-2 py-0.5 ${online ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}>
          {online ? (live?.status ? String(live.status).toUpperCase() : 'ONLINE') : 'OFFLINE'}
        </span>
        {live?.port && <span className="text-[10px] text-zinc-600 font-mono">:{live.port}</span>}
      </div>

      {/* Live check categories from the gatekeeper endpoint */}
      {checks && (
        <div className="grid grid-cols-3 gap-3">
          {Object.entries(checks).map(([cat, n]: [string, any]) => (
            <div key={cat} className="rounded-lg border border-cyan-500/15 bg-cyan-500/[0.04] p-3 text-center">
              <div className="text-2xl font-black text-cyan-200 tabular-nums">{n}</div>
              <div className="text-[9px] uppercase tracking-widest text-zinc-500 mt-1">{cat}</div>
              <div className="text-[8px] text-zinc-600">checks</div>
            </div>
          ))}
          {live?.agentScoreAvailable && (
            <div className="col-span-3 text-[10px] text-emerald-400/70 font-mono">● agent-score gate active</div>
          )}
        </div>
      )}

      {gates.length > 0 ? (
        <div className="space-y-2">
          {gates.map((g: any, i: number) => (
            <div key={i} className="flex items-center justify-between p-3 bg-zinc-900/60 border border-zinc-800">
              <div>
                <div className="text-xs font-mono text-zinc-200">{g.name || g.rule || `Gate ${i + 1}`}</div>
                <div className="text-[10px] text-zinc-500 mt-0.5">{g.check || g.description || '-'}</div>
              </div>
              <span className={`text-[10px] px-2 py-0.5 ${
                g.status === 'pass' || g.status === true ? 'bg-emerald-500/20 text-emerald-300' :
                g.status === 'fail' || g.status === false ? 'bg-rose-500/20 text-rose-300' :
                'bg-zinc-700/50 text-zinc-400'
              }`}>
                {g.status === 'pass' || g.status === true ? 'PASS' :
                 g.status === 'fail' || g.status === false ? 'BLOCK' :
                 g.status ? String(g.status) : 'UNKNOWN'}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <div className="text-3xl mb-4">
            {online ? '⚖️' : '🔴'}
          </div>
          <div className="text-xs text-zinc-400">
            {online
              ? 'Gatekeeper service is online but no gate data received yet.'
              : 'Gatekeeper service is not running. No risk gates active.'}
          </div>
          <div className="text-[10px] text-zinc-600 mt-2 font-mono">
            port 7791 · {new Date(data?.fetchedAt || Date.now()).toLocaleTimeString()}
          </div>
        </div>
      )}

      {data?.logs && data.logs.length > 0 && (
        <div className="mt-4">
          <h3 className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">Recent Events</h3>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {data.logs.slice(-10).reverse().map((log: any, i: number) => (
              <div key={i} className="text-[10px] font-mono text-zinc-500 truncate">
                <span className="text-zinc-600">{log.ts || ''}</span>
                {' '}
                <span className={log.level === 'error' ? 'text-rose-400' : 'text-zinc-400'}>
                  {log.message || log.text || String(log)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

