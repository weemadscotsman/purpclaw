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

        {/* RESEARCH EVIDENCE — filesystem evidence only */}
        <section className="mt-5 rounded-xl border border-white/10 bg-black/35 p-4">
          <div className="mb-3 text-sm font-black uppercase tracking-[0.16em] text-cyan-100">
            Auto-Research Evidence
          </div>
          <div className="text-xs text-white/35 mb-3">
            Evidence: <code className="text-cyan-400">research/</code>
            {' — filesystem, no editor'}
          </div>
          <ResearchPanel />
        </section>

        {/* STEERING DRIFT WATCHER — evidence only */}
        <section className="mt-5 rounded-xl border border-white/10 bg-black/35 p-4">
          <div className="mb-3 text-sm font-black uppercase tracking-[0.16em] text-violet-100">
            Steering Directives
          </div>
          <div className="text-xs text-white/35 mb-3">
            Evidence: <code className="text-cyan-400">steering/</code>
            {' — read-only evidence, no editor'}
          </div>
          <SteeringPanel />
        </section>

        {/* SKILLS EVIDENCE — evidence only */}
        <section className="mt-5 rounded-xl border border-white/10 bg-black/35 p-4">
          <div className="mb-3 text-sm font-black uppercase tracking-[0.16em] text-emerald-100">
            Skill Registry
          </div>
          <div className="text-xs text-white/35 mb-3">
            Evidence: <code className="text-cyan-400">skills/</code>
            {' — '}<span className="text-amber-400">read-only</span>{' — no unsafe clickable controls'}
          </div>
          <SkillsPanel />
        </section>
      </div>
    </CockpitShell>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ResearchPanel() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/evolution/research', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setData(d); })
      .catch(() => null)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-sm text-white/35">loading research evidence…</div>;
  if (!data?.ok) return (
    <div className="text-sm text-amber-400">
      no research files found — <span className="text-white/35">UNKNOWN</span>
    </div>
  );

  const { files, subFiles } = data;
  const allFiles = [...files];
  if (subFiles) {
    for (const [subDir, subFileList] of Object.entries(subFiles)) {
      for (const f of subFileList) {
        allFiles.push({ ...f, name: `${subDir}/${f.name}`, subDir });
      }
    }
  }

  return (
    <div>
      <div className="text-xs text-white/35 mb-2">{allFiles.length} research files</div>
      <div className="max-h-64 overflow-auto rounded border border-white/10">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-white/5">
            <tr>
              <th className="text-left p-2 text-white/35">file</th>
              <th className="text-right p-2 text-white/35">size</th>
              <th className="text-right p-2 text-white/35">modified</th>
            </tr>
          </thead>
          <tbody>
            {allFiles.slice(0, 50).map((f: any, i: number) => (
              <tr key={i} className="border-t border-white/5">
                <td className="p-2 text-cyan-400">{f.name}</td>
                <td className="p-2 text-right text-white/50">{f.size > 1024 ? `${(f.size/1024).toFixed(1)}KB` : f.size + 'B'}</td>
                <td className="p-2 text-right text-white/35">{new Date(f.mtime).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SteeringPanel() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/evolution/steering', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setData(d); })
      .catch(() => null)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-sm text-white/35">loading steering evidence…</div>;
  if (!data?.ok || !data.directives.length) return (
    <div className="text-sm text-amber-400">
      no steering files found — <span className="text-white/35">UNKNOWN</span>
    </div>
  );

  return (
    <div>
      <div className="text-xs text-white/35 mb-2">{data.directives.length} steering directives</div>
      <div className="max-h-64 overflow-auto rounded border border-white/10">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-white/5">
            <tr>
              <th className="text-left p-2 text-white/35">directive</th>
              <th className="text-right p-2 text-white/35">modified</th>
            </tr>
          </thead>
          <tbody>
            {data.directives.slice(0, 50).map((d: any, i: number) => (
              <tr key={i} className="border-t border-white/5">
                <td className="p-2 text-violet-400">{d.name}</td>
                <td className="p-2 text-right text-white/35">{new Date(d.mtime).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SkillsPanel() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/evolution/skills', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setData(d); })
      .catch(() => null)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-sm text-white/35">loading skill registry…</div>;
  if (!data?.ok) return (
    <div className="text-sm text-amber-400">
      no skills found — <span className="text-white/35">UNKNOWN</span>
    </div>
  );

  return (
    <div>
      <div className="text-xs text-white/35 mb-2">{data.skills?.length ?? 0} skills registered</div>
      <div className="max-h-64 overflow-auto rounded border border-white/10">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-white/5">
            <tr>
              <th className="text-left p-2 text-white/35">skill</th>
              <th className="text-right p-2 text-white/35">size</th>
              <th className="text-right p-2 text-white/35">modified</th>
            </tr>
          </thead>
          <tbody>
            {(data.skills || []).slice(0, 50).map((s: any, i: number) => (
              <tr key={i} className="border-t border-white/5">
                <td className="p-2 text-emerald-400">{s.name}</td>
                <td className="p-2 text-right text-white/50">{s.size > 1024 ? `${(s.size/1024).toFixed(1)}KB` : s.size + 'B'}</td>
                <td className="p-2 text-right text-white/35">{new Date(s.mtime).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
