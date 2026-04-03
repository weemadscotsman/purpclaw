'use client';

import AgentOutputStream from '../components/AgentOutputStream';

export default function MissionControlPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6 text-slate-200">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-sm font-bold uppercase tracking-[0.3em] text-cyan-400">
              Mission Control
            </h1>
            <p className="mt-1 text-[11px] text-slate-400">
              Real-time swarm telemetry and agent output
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-full border border-slate-700/60 bg-slate-900/60 px-3 py-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              <span className="text-[10px] font-medium uppercase tracking-wider text-slate-300">
                Online
              </span>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-slate-700/60 bg-slate-900/60 px-3 py-1.5">
              <span className="text-[10px] font-medium uppercase tracking-wider text-slate-300">
                Division
              </span>
              <span className="text-[10px] font-bold text-cyan-400">ENGINEERING</span>
            </div>
          </div>
        </header>

        <section className="grid gap-6 md:grid-cols-3">
          <div className="md:col-span-2 h-[70vh]">
            <AgentOutputStream maxLines={300} />
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-4 backdrop-blur">
              <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-200">
                Active Agents
              </h2>
              <ul className="space-y-2 text-[12px]">
                <li className="flex items-center justify-between rounded-md bg-slate-800/40 px-3 py-2">
                  <span className="flex items-center gap-2">
                    <span>🐝</span>
                    <span className="text-slate-300">bee</span>
                  </span>
                  <span className="text-[10px] text-emerald-400">Running</span>
                </li>
                <li className="flex items-center justify-between rounded-md bg-slate-800/40 px-3 py-2">
                  <span className="flex items-center gap-2">
                    <span>🕷️</span>
                    <span className="text-slate-300">spider</span>
                  </span>
                  <span className="text-[10px] text-emerald-400">Running</span>
                </li>
                <li className="flex items-center justify-between rounded-md bg-slate-800/40 px-3 py-2">
                  <span className="flex items-center gap-2">
                    <span>🐺</span>
                    <span className="text-slate-300">wolf</span>
                  </span>
                  <span className="text-[10px] text-emerald-400">Running</span>
                </li>
                <li className="flex items-center justify-between rounded-md bg-slate-800/40 px-3 py-2">
                  <span className="flex items-center gap-2">
                    <span>🐉</span>
                    <span className="text-slate-300">dragon</span>
                  </span>
                  <span className="text-[10px] text-emerald-400">Running</span>
                </li>
              </ul>
            </div>

            <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-4 backdrop-blur">
              <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-200">
                Quick Stats
              </h2>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-md bg-slate-800/40 px-3 py-2 text-center">
                  <div className="text-lg font-bold text-cyan-400">4</div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">Agents</div>
                </div>
                <div className="rounded-md bg-slate-800/40 px-3 py-2 text-center">
                  <div className="text-lg font-bold text-violet-400">0</div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">Alerts</div>
                </div>
                <div className="rounded-md bg-slate-800/40 px-3 py-2 text-center">
                  <div className="text-lg font-bold text-emerald-400">99.9%</div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">Uptime</div>
                </div>
                <div className="rounded-md bg-slate-800/40 px-3 py-2 text-center">
                  <div className="text-lg font-bold text-pink-400">12ms</div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">Latency</div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
