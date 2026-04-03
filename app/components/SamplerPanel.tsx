'use client';

import React, { useEffect, useRef, useState } from 'react';

// Web lens for the Sampler engine — renders the same live series the CLI/TUI show,
// fed by /api/sampler (config/samplers.yml). Sparklines, bars, gauges, textboxes.

type Item = { label: string; value: number; raw?: string; history?: number[]; min?: number; max?: number; color?: string };
type Component = { type: string; title: string; items: Item[]; triggers?: { title: string }[] };
type Snapshot = { ok?: boolean; title?: string; components?: Component[]; generatedAt?: number };

const PALETTE = ['#22d3ee', '#34d399', '#a78bfa', '#fbbf24', '#fb7185', '#60a5fa', '#f472b6'];

function Spark({ data, color }: { data: number[]; color: string }) {
  const nums = (data || []).filter(Number.isFinite);
  if (nums.length < 2) return <div className="h-8 text-[9px] font-mono text-white/25 flex items-center">collecting…</div>;
  const min = Math.min(...nums), max = Math.max(...nums), span = max - min || 1;
  const W = 200, H = 32;
  const pts = nums.map((v, i) => `${(i / (nums.length - 1)) * W},${H - ((v - min) / span) * (H - 4) - 2}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-8" preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

function fmt(v: number, raw?: string) { return Number.isFinite(v) ? (Math.round(v * 100) / 100).toLocaleString() : (raw || '—'); }

export function SamplerPanel() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const timer = useRef<any>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch('/api/sampler', { signal: AbortSignal.timeout(15000) });
        const j = await r.json();
        if (j.ok === false) setErr(j.error || 'sampler error'); else { setErr(null); setSnap(j); }
      } catch (e: any) { setErr(e?.message || 'unreachable'); }
    };
    load();
    timer.current = setInterval(load, 3000);
    return () => clearInterval(timer.current);
  }, []);

  const comps = snap?.components || [];

  return (
    <div className="h-full overflow-y-auto p-3">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-[8px] uppercase tracking-[0.3em] text-cyan-300/40 font-mono">live metrics</div>
          <div className="text-sm font-black tracking-[0.16em] uppercase text-white/80">{snap?.title || 'PURPCLAW Sampler'}</div>
        </div>
        <span className="text-[9px] font-mono text-white/30">{comps.length} components · config/samplers.yml · 3s</span>
      </div>

      {err && <div className="mb-3 rounded-lg border border-rose-400/20 bg-rose-400/5 px-3 py-2 text-[11px] font-mono text-rose-300/80">sampler: {err}</div>}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {comps.map((c, ci) => (
          <div key={c.title + ci} className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] uppercase tracking-[0.18em] font-mono text-white/55">{c.title}</span>
              <span className="text-[8px] font-mono text-white/25">{c.type}</span>
            </div>

            {(c.type === 'sparkline' || c.type === 'runchart') && c.items.map((it, i) => (
              <div key={it.label + i} className="mb-1.5">
                <div className="flex items-center justify-between text-[10px] font-mono">
                  <span className="text-white/45">{it.label}</span>
                  <span className="font-bold" style={{ color: PALETTE[i % PALETTE.length] }}>{fmt(it.value, it.raw)}</span>
                </div>
                <Spark data={it.history || []} color={PALETTE[i % PALETTE.length]} />
              </div>
            ))}

            {c.type === 'barchart' && (() => {
              const max = Math.max(1, ...c.items.map(it => (Number.isFinite(it.value) ? it.value : 0)));
              return c.items.map((it, i) => (
                <div key={it.label + i} className="mb-1.5">
                  <div className="flex items-center justify-between text-[10px] font-mono mb-0.5">
                    <span className="text-white/45">{it.label}</span>
                    <span className="font-bold text-white/75">{fmt(it.value, it.raw)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/8 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${Math.max(2, ((Number.isFinite(it.value) ? it.value : 0) / max) * 100)}%`, backgroundColor: PALETTE[i % PALETTE.length] }} />
                  </div>
                </div>
              ));
            })()}

            {c.type === 'gauge' && c.items.map((it, i) => {
              const pct = Math.max(0, Math.min(1, ((it.value - (it.min ?? 0)) / (((it.max ?? 100) - (it.min ?? 0)) || 1))));
              return (
                <div key={i}>
                  <div className="flex items-end justify-between mb-1">
                    <span className="text-2xl font-black font-mono text-cyan-300">{fmt(it.value, it.raw)}</span>
                    <span className="text-[10px] font-mono text-white/35">{(pct * 100).toFixed(0)}%</span>
                  </div>
                  <div className="h-3 rounded-full bg-white/8 overflow-hidden">
                    <div className="h-full rounded-full bg-cyan-400" style={{ width: `${pct * 100}%`, boxShadow: '0 0 12px rgba(34,211,238,0.5)' }} />
                  </div>
                </div>
              );
            })}

            {(c.type === 'textbox' || c.type === 'asciibox') && (
              <pre className="text-[11px] font-mono text-white/70 whitespace-pre-wrap max-h-32 overflow-y-auto">{c.items[0]?.raw || '—'}</pre>
            )}

            {(c.triggers || []).map((t, i) => (
              <div key={i} className="mt-1.5 text-[10px] font-mono text-amber-300/80">⚠ {t.title}</div>
            ))}
          </div>
        ))}
        {!comps.length && !err && <div className="text-[11px] font-mono text-white/30">Loading samplers…</div>}
      </div>
    </div>
  );
}

export default SamplerPanel;
