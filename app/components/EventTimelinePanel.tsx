'use client';

import React, { useState, useMemo } from 'react';
import { useEventTimeline, type TimelineEvent } from '../hooks/useEventTimeline';
import { LoadingSpinner } from './LoadingSpinner';

const TOPICS = ['agent', 'swarm', 'tool', 'orchestrator'];

const TYPE_COLORS: Record<string, string> = {
  spawned: 'text-emerald-400',
  completed: 'text-violet-400',
  failed: 'text-rose-400',
  killed: 'text-rose-400',
  output: 'text-cyan-400',
  error: 'text-rose-400',
  system: 'text-amber-400',
  info: 'text-emerald-400',
};

function EventRow({ event }: { event: TimelineEvent }) {
  const type = event.type || 'info';
  const color = TYPE_COLORS[type] || 'text-white/40';
  const time = new Date(event.ts).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <div className="flex items-start gap-3 text-[11px] font-mono hover:bg-white/[0.02] px-2 py-1.5 rounded border border-transparent hover:border-white/5">
      <span className="text-white/20 shrink-0 w-16">{time}</span>
      <span className={`uppercase text-[9px] tracking-wider shrink-0 w-20 ${color}`}>{type}</span>
      <span className="text-white/30 shrink-0 w-32 truncate">{event.topic}</span>
      <span className="text-white/50 shrink-0 w-20 truncate">{event.agentName || '—'}</span>
      <span className="text-white/60 truncate flex-1">{event.message || JSON.stringify(event.data).substring(0, 80)}</span>
    </div>
  );
}

export function EventTimelinePanel() {
  const { events, loading, error, refetch } = useEventTimeline({ topics: TOPICS, limit: 200 });
  const [filterTopic, setFilterTopic] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);

  const filtered = useMemo(() => {
    return events.filter(e => {
      if (filterTopic !== 'all' && !e.topic.includes(filterTopic)) return false;
      if (search) {
        const q = search.toLowerCase();
        return (e.agentName || '').toLowerCase().includes(q) ||
          (e.message || '').toLowerCase().includes(q) ||
          (e.topic || '').toLowerCase().includes(q);
      }
      return true;
    });
  }, [events, filterTopic, search]);

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(filtered, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `events-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <LoadingSpinner size={24} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <div className="text-2xl mb-3">⚠</div>
        <div className="text-sm text-rose-400 font-mono">{error}</div>
        <button onClick={refetch} className="mt-4 px-4 py-1.5 rounded-md bg-white/5 border border-white/10 text-xs hover:bg-white/10">Retry</button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-1">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3 mb-3">
        <div className="flex gap-2">
          <button
            onClick={() => setFilterTopic('all')}
            className={`px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${filterTopic === 'all' ? 'bg-white/15 text-white' : 'bg-white/5 text-white/50 hover:bg-white/10'}`}
          >
            All
          </button>
          {TOPICS.map(t => (
            <button
              key={t}
              onClick={() => setFilterTopic(t)}
              className={`px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all border`}
              style={{
                backgroundColor: filterTopic === t ? `${TYPE_COLORS[t.replace('agent', 'spawned')]?.replace('text-', '')}20` || 'rgba(34,211,238,0.1)' : 'rgba(255,255,255,0.05)',
                borderColor: filterTopic === t ? 'rgba(34,211,238,0.3)' : 'rgba(255,255,255,0.1)',
                color: filterTopic === t ? '#22d3ee' : 'rgba(255,255,255,0.5)',
              }}
            >
              {t}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search agents or messages..."
          className="px-3 py-1.5 rounded-md bg-black/40 border border-white/10 text-xs text-white/70 placeholder:text-white/20 focus:outline-none focus:border-white/30 w-48"
        />
        <div className="flex-1" />
        <label className="flex items-center gap-2 text-[10px] text-white/40 cursor-pointer">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={e => setAutoScroll(e.target.checked)}
            className="accent-cyan-400"
          />
          Auto-scroll
        </label>
        <button
          onClick={exportJSON}
          className="px-3 py-1.5 rounded-md bg-white/5 border border-white/10 text-[10px] text-white/50 hover:bg-white/10 transition-all"
        >
          Export JSON
        </button>
      </div>

      {/* Event list */}
      <div className="flex-1 overflow-y-auto rounded-xl border border-white/10 bg-black/20">
        <div className="sticky top-0 flex items-center gap-3 text-[10px] font-mono text-white/30 uppercase tracking-wider bg-[#060a12] border-b border-white/5 px-3 py-2 z-10">
          <span className="w-16">Time</span>
          <span className="w-20">Type</span>
          <span className="w-32">Topic</span>
          <span className="w-20">Agent</span>
          <span className="flex-1">Message</span>
        </div>
        {filtered.length === 0 ? (
          <div className="text-white/20 text-xs text-center py-12">No events match your filter</div>
        ) : (
          filtered.map(evt => <EventRow key={evt.id} event={evt} />)
        )}
      </div>

      <div className="mt-2 text-[10px] text-white/20 text-right font-mono">
        {filtered.length} events{search ? ` matching "${search}"` : ''}
      </div>
    </div>
  );
}
