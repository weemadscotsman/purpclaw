'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';

type TraceEvent = {
  id: string;
  at: string;
  source: string;
  route?: string;
  sessionId?: string;
  jobId?: string;
  status: string;
  action: string;
  detail?: string;
};

function lineFor(event: TraceEvent) {
  const bits = [
    event.at?.slice(11, 19) || '--:--:--',
    event.source || 'unknown',
    event.status || 'info',
    event.action || 'event',
    event.route ? `route=${event.route}` : '',
    event.sessionId ? `session=${event.sessionId}` : '',
    event.jobId ? `job=${event.jobId}` : '',
    event.detail || '',
  ].filter(Boolean);
  return bits.join(' | ');
}

export function TraceTerminal({ compact = false }: { compact?: boolean }) {
  const [events, setEvents] = useState<TraceEvent[]>([]);
  const [paused, setPaused] = useState(false);
  const [open, setOpen] = useState(false);          // collapsed to a tiny pill by default
  const [expanded, setExpanded] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [filter, setFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [copied, setCopied] = useState<string | null>(null);
  const pausedRef = useRef(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { pausedRef.current = paused; }, [paused]);

  useEffect(() => {
    let es: EventSource | null = null;
    fetch('/api/trace/recent?limit=120')
      .then(r => r.ok ? r.json() : null)
      .then(j => {
        if (Array.isArray(j?.events)) setEvents(j.events);
      })
      .catch(() => {});

    try {
      es = new EventSource('/api/trace/stream');
      es.addEventListener('trace', (event) => {
        if (pausedRef.current) return;
        try {
          const item = JSON.parse((event as MessageEvent).data);
          setEvents(prev => [...prev, item].slice(-300));
        } catch {}
      });
    } catch {}
    return () => { try { es?.close(); } catch {} };
  }, []);

  useEffect(() => {
    if (!paused && autoScroll) endRef.current?.scrollIntoView({ block: 'end' });
  }, [events, paused, autoScroll]);

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return events.filter(event => {
      if (sourceFilter !== 'all' && event.source !== sourceFilter) return false;
      if (!needle) return true;
      return lineFor(event).toLowerCase().includes(needle);
    });
  }, [events, filter, sourceFilter]);

  const sources = useMemo(() => {
    return Array.from(new Set(events.map(event => event.source).filter(Boolean))).sort();
  }, [events]);

  const copyAll = async () => {
    const text = visible.map(lineFor).join('\n');
    try { await navigator.clipboard.writeText(text); } catch {}
  };

  // Collapsed: a tiny pop-open pill in the corner. position:fixed → it NEVER
  // consumes layout space, so the page fits the screen. `compact` is ignored
  // now (kept for call-site API compat) — the widget always floats.
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Open trace terminal"
        className="fixed bottom-3 right-3 z-40 flex items-center gap-2 rounded-full border border-cyan-300/30 bg-black/85 px-3 py-1.5 text-[11px] font-mono text-cyan-200 shadow-2xl backdrop-blur hover:border-cyan-300/60"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 animate-pulse" />
        TRACE{events.length > 0 && <span className="text-white/40">{events.length}</span>}
      </button>
    );
  }

  // Open = small floating window bottom-right; expanded = fullscreen "see
  // everything" overlay. Either way it overlays, never reserving grid space.
  const frame = expanded
    ? 'fixed inset-4 z-50'
    : 'fixed bottom-3 right-3 z-40 w-[min(92vw,460px)] h-[min(60vh,360px)]';

  return (
    <section data-testid="trace-terminal" className={`${frame} flex flex-col overflow-hidden rounded-xl border border-cyan-300/25 bg-black/92 shadow-2xl backdrop-blur-xl`}>
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-white/10 px-2.5 py-1.5">
        <div className="text-[11px] font-black uppercase tracking-[0.16em] text-cyan-200">Trace</div>
        <div className="text-[10px] font-mono text-white/35">{visible.length}/{events.length}</div>
        <input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="filter…"
          className="ml-auto min-w-20 flex-1 rounded border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] text-white/75 outline-none"
        />
        <select
          value={sourceFilter}
          onChange={e => setSourceFilter(e.target.value)}
          className="rounded border border-white/10 bg-black px-1.5 py-0.5 text-[10px] font-mono text-white/65 outline-none"
        >
          <option value="all">all</option>
          {sources.map(source => <option key={source} value={source}>{source}</option>)}
        </select>
        <button onClick={() => setPaused(v => !v)} title={paused ? 'resume' : 'pause'} aria-label={paused ? 'resume' : 'pause'} className="rounded border border-white/10 px-1.5 py-0.5 text-[10px] font-mono text-white/65">{paused ? '▶' : '❙❙'}</button>
        <button onClick={() => setAutoScroll(v => !v)} title={autoScroll ? 'auto-scroll on' : 'auto-scroll off'} aria-label={autoScroll ? 'auto-scroll on' : 'auto-scroll off'} className="rounded border border-white/10 px-1.5 py-0.5 text-[10px] font-mono text-white/65">{autoScroll ? '⤓' : '⇅'}</button>
        <button onClick={copyAll} title="copy all visible" aria-label="copy all visible" className="rounded border border-white/10 px-1.5 py-0.5 text-[10px] font-mono text-white/65">⧉</button>
        <button onClick={() => setEvents([])} title="clear" aria-label="clear" className="rounded border border-white/10 px-1.5 py-0.5 text-[10px] font-mono text-white/45">✕</button>
        <button onClick={() => setExpanded(v => !v)} title={expanded ? 'shrink' : 'fullscreen'} aria-label={expanded ? 'shrink' : 'fullscreen'} className="rounded border border-white/10 px-1.5 py-0.5 text-[10px] font-mono text-white/45">{expanded ? '⊟' : '⛶'}</button>
        <button onClick={() => setOpen(false)} title="minimize to pill" aria-label="minimize to pill" className="rounded border border-white/10 px-1.5 py-0.5 text-[10px] font-mono text-white/45">—</button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-1.5 font-mono text-[11px] leading-5">
        {visible.length === 0 && <div className="text-white/25">No trace events yet. Actions appear here as they route. Click any line to copy.</div>}
        {visible.map(event => (
          <div
            key={event.id}
            onClick={() => { try { navigator.clipboard.writeText(lineFor(event)); setCopied(event.id); setTimeout(() => setCopied(c => c === event.id ? null : c), 800); } catch {} }}
            title="click to copy this line"
            className={`cursor-pointer rounded px-1 -mx-1 hover:bg-white/10 ${copied === event.id ? 'bg-cyan-400/25' : ''} ${event.status === 'error' || event.status === 'failed' ? 'text-rose-300' : event.status === 'ok' ? 'text-emerald-300' : 'text-cyan-100/70'}`}
          >
            {lineFor(event)}
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </section>
  );
}
