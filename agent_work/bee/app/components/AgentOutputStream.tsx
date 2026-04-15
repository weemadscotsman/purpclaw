'use client';

import React, { useEffect, useRef, useState } from 'react';

export type StreamLine = {
  id: string;
  agentEmoji: string;
  agentName: string;
  timestamp: string;
  stream: 'stdout' | 'stderr';
  text: string;
};

export type AgentOutputStreamProps = {
  streamUrl?: string;
  initialLines?: StreamLine[];
  maxLines?: number;
};

function formatTime(d = new Date()) {
  return d.toLocaleTimeString('en-US', { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0');
}

export default function AgentOutputStream({
  streamUrl,
  initialLines = [],
  maxLines = 250,
}: AgentOutputStreamProps) {
  const [lines, setLines] = useState<StreamLine[]>(initialLines);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [isLive, setIsLive] = useState(true);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScroll = useRef(true);

  // SSE real-time connection
  useEffect(() => {
    if (!streamUrl) return;
    const es = new EventSource(streamUrl);
    es.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data);
        const line: StreamLine = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          agentEmoji: payload.agentEmoji ?? '🐝',
          agentName: payload.agentName ?? 'bee',
          timestamp: payload.timestamp ?? formatTime(),
          stream: payload.stream === 'stderr' ? 'stderr' : 'stdout',
          text: String(payload.text ?? ''),
        };
        setLines((prev) => {
          const next = [...prev, line];
          return next.length > maxLines ? next.slice(next.length - maxLines) : next;
        });
      } catch {
        // ignore malformed
      }
    };
    es.onerror = () => {
      // auto-reconnect handled by EventSource
    };
    return () => es.close();
  }, [streamUrl, maxLines]);

  // Demo stream when no URL is provided
  useEffect(() => {
    if (streamUrl) return;
    const agents = [
      { emoji: '🐝', name: 'bee' },
      { emoji: '🕷️', name: 'spider' },
      { emoji: '🐺', name: 'wolf' },
      { emoji: '🐉', name: 'dragon' },
    ];
    const messages = [
      'Compiling module...',
      'Lint check passed',
      'Connecting to event bus',
      'Retrying in 500ms',
      'Payload received',
      'Dispatching task to swarm',
      'Memory matrix updated',
      'Health check OK',
    ];
    const id = setInterval(() => {
      if (!isLive) return;
      const agent = agents[Math.floor(Math.random() * agents.length)];
      const text = messages[Math.floor(Math.random() * messages.length)];
      const stream = Math.random() > 0.85 ? 'stderr' : 'stdout';
      const line: StreamLine = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        agentEmoji: agent.emoji,
        agentName: agent.name,
        timestamp: formatTime(),
        stream,
        text,
      };
      setLines((prev) => {
        const next = [...prev, line];
        return next.length > maxLines ? next.slice(next.length - maxLines) : next;
      });
    }, 1200);
    return () => clearInterval(id);
  }, [streamUrl, maxLines, isLive]);

  // Auto-scroll logic
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => {
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
      shouldAutoScroll.current = nearBottom;
    };
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (shouldAutoScroll.current && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [lines]);

  const grouped = lines.reduce<Record<string, StreamLine[]>>((acc, line) => {
    const key = `${line.agentEmoji} ${line.agentName}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(line);
    return acc;
  }, {});

  const toggleGroup = (key: string) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="flex h-full flex-col rounded-xl border border-slate-700/60 bg-slate-900/60 backdrop-blur">
      <div className="flex items-center justify-between border-b border-slate-700/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-200">
            Agent Output Stream
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsLive((v) => !v)}
            className={`rounded px-2 py-1 text-[10px] font-medium uppercase tracking-wider transition ${
              isLive
                ? 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
                : 'bg-rose-500/20 text-rose-300 hover:bg-rose-500/30'
            }`}
          >
            {isLive ? 'Live' : 'Paused'}
          </button>
          <button
            onClick={() => setLines([])}
            className="rounded px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-slate-300 transition hover:bg-slate-700/60 hover:text-slate-100"
          >
            Clear
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto p-3 font-mono text-[12px]"
      >
        {lines.length === 0 && (
          <div className="py-8 text-center text-slate-500">Waiting for output...</div>
        )}

        {Object.entries(grouped).map(([agentKey, agentLines]) => {
          const isOpen = expanded[agentKey] !== false; // default expanded
          const stdoutCount = agentLines.filter((l) => l.stream === 'stdout').length;
          const stderrCount = agentLines.filter((l) => l.stream === 'stderr').length;
          return (
            <div key={agentKey} className="mb-3">
              <button
                onClick={() => toggleGroup(agentKey)}
                className="flex w-full items-center justify-between rounded-md bg-slate-800/60 px-3 py-2 text-left transition hover:bg-slate-800"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm">{agentLines[0].agentEmoji}</span>
                  <span className="font-semibold text-slate-200">{agentLines[0].agentName}</span>
                  <span className="text-[10px] text-slate-400">
                    {agentLines.length} line{agentLines.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {stderrCount > 0 && (
                    <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[10px] text-rose-300">
                      {stderrCount} err
                    </span>
                  )}
                  <span
                    className={`text-[10px] text-slate-400 transition ${isOpen ? 'rotate-180' : ''}`}
                  >
                    ▼
                  </span>
                </div>
              </button>

              {isOpen && (
                <div className="mt-1 space-y-1 border-l-2 border-slate-700/60 pl-3">
                  {agentLines.map((line) => (
                    <div
                      key={line.id}
                      className={`flex items-start gap-3 rounded px-2 py-1 ${
                        line.stream === 'stderr'
                          ? 'bg-rose-500/10 text-rose-200'
                          : 'text-slate-300'
                      }`}
                    >
                      <span className="shrink-0 text-[10px] text-slate-500">{line.timestamp}</span>
                      <span
                        className={`shrink-0 text-[10px] font-bold uppercase ${
                          line.stream === 'stderr' ? 'text-rose-400' : 'text-cyan-400'
                        }`}
                      >
                        {line.stream}
                      </span>
                      <span className="whitespace-pre-wrap break-all">{line.text}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        <div ref={bottomRef} />
      </div>

      <div className="flex items-center justify-between border-t border-slate-700/60 px-4 py-2 text-[10px] text-slate-500">
        <span>Total lines: {lines.length}</span>
        <span>Max: {maxLines}</span>
      </div>
    </div>
  );
}
