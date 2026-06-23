'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { CockpitShell } from '../components/CockpitShell';
import { LiveSystemMap } from '../components/LiveSystemMap';
import { TraceTerminal } from '../components/TraceTerminal';
import { useMissionData } from '../hooks/useMissionData';

export default function SystemMapPage() {
  const data = useMissionData();
  const [view, setView] = useState<'map' | 'stack'>('map');
  const liveServices = data.services.filter(s => ['online', 'healthy', 'ok', 'degraded'].includes(String(s.status))).length;
  const stuckJobs = (data.kernelJobs || []).filter((job: any) => ['running', 'delegated', 'queued'].includes(job.state) && job.createdAt && Date.now() - job.createdAt > 120000);

  return (
    <CockpitShell title="System Map">
      <div className="flex h-full flex-col bg-[#05070c] text-white">
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
          <div>
            <div className="text-base font-black uppercase tracking-[0.18em] text-cyan-100">Live System Map</div>
            <div className="text-sm text-white/45">Services, agents, workflows, events, architecture contracts.</div>
          </div>
          <div className="flex items-center gap-2 text-sm font-mono">
            <span className="rounded border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-emerald-100">{liveServices}/{data.services.length} services</span>
            <span className="rounded border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-cyan-100">{data.agents.length} agents</span>
            <span className="rounded border border-violet-300/20 bg-violet-300/10 px-3 py-1 text-violet-100">{data.pipeline?.active?.length || 0} flows</span>
            <span className={`rounded border px-3 py-1 ${stuckJobs.length ? 'border-rose-300/30 bg-rose-300/10 text-rose-100' : 'border-white/10 bg-white/[0.03] text-white/50'}`}>{stuckJobs.length} stuck</span>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setView('map')} className={`rounded border px-3 py-2 text-sm font-bold ${view === 'map' ? 'border-cyan-300/40 bg-cyan-300/15 text-cyan-100' : 'border-white/10 text-white/55'}`}>2D Graph</button>
            <button onClick={() => setView('stack')} className={`rounded border px-3 py-2 text-sm font-bold ${view === 'stack' ? 'border-fuchsia-300/40 bg-fuchsia-300/15 text-fuchsia-100' : 'border-white/10 text-white/55'}`}>3D Stack</button>
          </div>
        </header>
        <main className="min-h-0 flex-1">
          {view === 'map' ? (
            <LiveSystemMap data={data} />
          ) : (
            <div className="flex h-full items-center justify-center bg-[#050208] p-6">
              <div className="max-w-xl rounded border border-fuchsia-300/20 bg-fuchsia-300/10 p-6 text-center">
                <div className="text-sm font-black uppercase tracking-[0.18em] text-fuchsia-100">3D Stack Is A Full Page</div>
                <p className="mt-3 text-sm text-white/55">
                  The old iframe embedded a complete shell inside this panel. Open the canonical tower view as its own page instead.
                </p>
                <Link href="/skyscraper" className="mt-5 inline-flex rounded border border-fuchsia-300/40 bg-fuchsia-300/15 px-4 py-2 text-sm font-bold text-fuchsia-100">
                  Open Agent Tower
                </Link>
              </div>
            </div>
          )}
        </main>
        <TraceTerminal />
      </div>
    </CockpitShell>
  );
}
