'use client';

import React, { useEffect, useState } from 'react';
import { CockpitShell } from '../components/CockpitShell';
import { TraceTerminal } from '../components/TraceTerminal';

type EvolutionStatus = {
  ok?: boolean;
  enabled?: boolean;
  running?: boolean;
  tickCount?: number;
  tickIntervalMs?: number;
  throttle?: {
    ticksToday?: number;
    maxTicksPerDay?: number;
    spentTodayUSD?: number;
    dailyCeilingUSD?: number;
    backoffMultiplier?: number;
    blockedReason?: string | null;
  };
  lastTick?: any;
  recentTicks?: any[];
  nextTickIn?: number | null;
  error?: string;
};

export default function EvolutionPage() {
  const [status, setStatus] = useState<EvolutionStatus | null>(null);
  const [busy, setBusy] = useState('');

  const load = async () => {
    const res = await fetch('/api/evolution/status', { cache: 'no-store' });
    const data = await res.json().catch(() => null);
    setStatus(data || { ok: false, error: 'status unavailable' });
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, []);

  const act = async (action: string) => {
    setBusy(action);
    try {
      await fetch('/api/evolution/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      await load();
    } finally {
      setBusy('');
    }
  };

  const cards = [
    ['Enabled', status?.enabled ? 'yes' : 'no'],
    ['Running', status?.running ? 'yes' : 'no'],
    ['Ticks', String(status?.tickCount ?? 0)],
    ['Today', `${status?.throttle?.ticksToday ?? 0}/${status?.throttle?.maxTicksPerDay ?? '?'}`],
    ['Spend', `$${status?.throttle?.spentTodayUSD ?? 0} / $${status?.throttle?.dailyCeilingUSD ?? '?'}`],
    ['Backoff', `${status?.throttle?.backoffMultiplier ?? 1}x`],
  ];

  return (
    <CockpitShell title="Self-Evolution">
      <div className="min-h-full bg-[#05070c] p-5 text-white">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-lg font-black uppercase tracking-[0.18em] text-violet-100">Self-Evolution Controls</div>
            <div className="mt-1 max-w-3xl text-sm leading-6 text-white/50">
              Governed auto-research and memory-improvement loop. Buttons act on the running runtime; persistent enable/disable still belongs in env/PM2 config.
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button disabled={!!busy} onClick={() => act('run-once')} className="rounded border border-emerald-300/30 bg-emerald-300/10 px-4 py-2 text-sm font-bold text-emerald-100">Run Once</button>
            <button disabled={!!busy} onClick={() => act('pause')} className="rounded border border-amber-300/30 bg-amber-300/10 px-4 py-2 text-sm font-bold text-amber-100">Pause</button>
            <button disabled={!!busy} onClick={() => act('resume')} className="rounded border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-sm font-bold text-cyan-100">Resume</button>
            <button onClick={load} className="rounded border border-white/10 px-4 py-2 text-sm font-bold text-white/65">Refresh</button>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          {cards.map(([label, value]) => (
            <div key={label} className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-white/35">{label}</div>
              <div className="mt-2 text-2xl font-black text-white/85">{value}</div>
            </div>
          ))}
        </div>
        {status?.throttle?.blockedReason && (
          <div className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm text-amber-100">
            Blocked: {status.throttle.blockedReason}
          </div>
        )}
        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          <section className="rounded-xl border border-white/10 bg-black/35 p-4">
            <div className="mb-3 text-sm font-black uppercase tracking-[0.16em] text-cyan-100">Last Tick</div>
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap text-sm leading-6 text-white/65">{JSON.stringify(status?.lastTick || { state: 'no tick yet' }, null, 2)}</pre>
          </section>
          <section className="rounded-xl border border-white/10 bg-black/35 p-4">
            <div className="mb-3 text-sm font-black uppercase tracking-[0.16em] text-violet-100">Recent History</div>
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap text-sm leading-6 text-white/65">{JSON.stringify(status?.recentTicks || [], null, 2)}</pre>
          </section>
        </div>
        <TraceTerminal />
      </div>
    </CockpitShell>
  );
}
