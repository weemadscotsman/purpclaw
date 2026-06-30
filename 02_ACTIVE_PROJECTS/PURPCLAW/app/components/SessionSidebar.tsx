'use client';

import React, { useEffect, useMemo, useState } from 'react';

export type ChatSessionMeta = {
  id: string;
  title: string;
  updatedAt: string;
  createdAt: string;
  messageCount: number;
  provider?: string;
  model?: string;
};

const STACK_LINKS = [
  ['/mission', 'Mission Control', 'Chat, command, cockpit'],
  ['/system-map', 'System Map', 'Services, agents, routes'],
  ['/evolution', 'Self-Evolution', 'Loops, ticks, controls'],
  ['/agents', 'Agents', 'Tower workforce'],
  ['/mission/harness', 'Execution Harness', 'Verified missions'],
  ['/pipeline', 'Pipeline', 'Workflow flow'],
  ['/swarm', 'Swarm', 'Delegation graph'],
  ['/providers', 'Providers', 'Models and routing'],
  ['/settings', 'Settings', 'Runtime config'],
  ['/omni', 'OMNI', 'Truth cockpit'],
];

export function SessionSidebar({
  activeSessionId,
  onNew,
  onLoad,
  onSave,
  onExport,
}: {
  activeSessionId?: string | null;
  onNew?: () => void;
  onLoad?: (id: string) => void;
  onSave?: () => void;
  onExport?: () => void;
}) {
  const [sessions, setSessions] = useState<ChatSessionMeta[]>([]);
  const [query, setQuery] = useState('');
  const [sessionsOpen, setSessionsOpen] = useState(true);

  const refresh = () => {
    fetch('/api/sessions?limit=10')
      .then(r => r.ok ? r.json() : null)
      .then(j => setSessions(Array.isArray(j?.sessions) ? j.sessions : []))
      .catch(() => {});
  };

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 15000);
    return () => clearInterval(id);
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return sessions;
    return sessions.filter(s => `${s.title} ${s.id} ${s.provider || ''} ${s.model || ''}`.toLowerCase().includes(needle));
  }, [sessions, query]);

  return (
    <aside className="flex h-full w-[19rem] shrink-0 flex-col border-r border-cyan-300/10 bg-black/75 text-white backdrop-blur-xl">
      <div className="border-b border-white/10 p-3">
        <div className="flex items-center justify-between">
          <button onClick={() => setSessionsOpen(v => !v)} className="text-left text-sm font-black uppercase tracking-[0.14em] text-cyan-100">Chats / Sessions</button>
          <span className="text-[10px] font-mono text-white/35">{filtered.length}</span>
        </div>
        {sessionsOpen && (
          <div className="mt-3 space-y-2">
            <div className="flex gap-2">
              <button onClick={onNew} className="flex-1 rounded-lg border border-cyan-300/20 bg-cyan-300/10 px-2 py-2 text-xs font-bold text-cyan-100">New</button>
              <button onClick={() => { onSave?.(); setTimeout(refresh, 250); }} className="flex-1 rounded-lg border border-emerald-300/20 bg-emerald-300/10 px-2 py-2 text-xs font-bold text-emerald-100">Save</button>
            </div>
            <button
              onClick={onExport}
              className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-2 py-2 text-xs font-bold text-white/70 hover:bg-white/[0.08]"
            >
              Export
            </button>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="search chats"
              className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/80 outline-none"
            />
            <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
              {filtered.length === 0 && <div className="rounded-lg border border-white/8 bg-white/[0.02] p-3 text-xs text-white/35">No saved sessions yet.</div>}
              {filtered.map(session => {
                const active = session.id === activeSessionId;
                return (
                  <button
                    key={session.id}
                    onClick={() => onLoad?.(session.id)}
                    className={`w-full rounded-lg border px-3 py-2 text-left ${active ? 'border-cyan-300/45 bg-cyan-300/12' : 'border-white/8 bg-white/[0.025] hover:bg-white/[0.05]'}`}
                  >
                    <div className="truncate text-sm font-semibold text-white/82">{session.title || 'Untitled'}</div>
                    <div className="mt-1 flex justify-between gap-2 text-[10px] font-mono text-white/35">
                      <span>{session.messageCount || 0} msg</span>
                      <span>{session.updatedAt ? new Date(session.updatedAt).toLocaleString() : session.id.slice(0, 18)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Stack Pages nav removed (Eddie, 2026-06-24) ──────────────────────
          The main /mission UI is the only surface. We are NOT deleting the
          standalone pages — their files stay on disk, fully salvageable. Most
          already exist as native /mission lenses (System Map=graph, Self-
          Evolution=evolution, Agents=agents/tower, Harness=harness,
          Pipeline=pipeline, Swarm=swarm). The three with NO native lens yet —
          to be salvaged and integrated INTO /mission as real lenses (not glued
          iframes): Providers, Settings, OMNI. See STACK_LINKS above for the
          salvage manifest. */}
      <div className="min-h-0 flex-1" />
    </aside>
  );
}
