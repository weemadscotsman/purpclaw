'use client';

import React, { useState, useEffect, useRef } from 'react';
import type { MissionData } from '../hooks/useMissionData';
import { OverviewPanel } from './OverviewPanel';
import { TowerPanel } from './TowerPanel';
import { SwarmPanel } from './SwarmPanel';
import { PipelinePanel } from './PipelinePanel';
import { EventTimelinePanel } from './EventTimelinePanel';
import { GatekeeperPanel } from './GatekeeperPanel';
import { CognitivePanel } from './CognitivePanel';
import { CommandPanel, MochiNarrator } from './CommandPanel';
import { AutonomousHarnessPanel } from './AutonomousHarnessPanel';
import { ErrorBoundary } from './ErrorBoundary';
import { ToastContainer, useToast } from './Toast';
import { PurpClawLogo } from './PurpClawLogo';
import { Onboarding } from './Onboarding';
import { LiveSystemMap } from './LiveSystemMap';
import { SamplerPanel } from './SamplerPanel';
import { AbliteratorPanel } from './AbliteratorPanel';

type TabId = 'overview' | 'evolution' | 'graph' | 'agents' | 'tower' | 'swarm' | 'harness' | 'pipeline' | 'timeline' | 'gatekeeper' | 'cognitive' | 'command' | 'logs' | 'mochi' | 'sampler' | 'dream' | 'abliterator';

interface Tab {
  id: TabId;
  label: string;
  icon: string;
  stage: 'start' | 'build' | 'observe' | 'control';
  purpose: string;
}

const TABS: Tab[] = [
  { id: 'overview', label: 'Mission Spine', icon: 'MS', stage: 'start', purpose: 'Start here. See the whole system, then launch or inspect the latest job.' },
  { id: 'command', label: 'Control Room', icon: 'CM', stage: 'start', purpose: 'Talk to the stack directly: chat, API command, kernel job, mission, agent, or research room.' },
  { id: 'harness', label: 'Execution Harness', icon: 'HX', stage: 'build', purpose: 'Run and inspect autonomous harness missions with verification gates.' },
  { id: 'agents', label: 'Agent Workforce', icon: 'AG', stage: 'build', purpose: 'See which specialist agents exist, what they are doing, and where work is stuck.' },
  { id: 'tower', label: 'Tower State', icon: 'TW', stage: 'build', purpose: 'Manage spawned agents and the tower runtime that executes direct assignments.' },
  { id: 'swarm', label: 'Delegation Graph', icon: 'DG', stage: 'build', purpose: 'Inspect swarm delegation: who got the work, what happened, and what failed.' },
  { id: 'pipeline', label: 'Workflow Flow', icon: 'WF', stage: 'observe', purpose: 'Follow workflow state from queued to active to archived.' },
  { id: 'timeline', label: 'Event Lens', icon: 'EL', stage: 'observe', purpose: 'Read the event timeline when you need exact runtime history.' },
  { id: 'sampler', label: 'Live Metrics', icon: 'SP', stage: 'observe', purpose: 'Sampler-style live dashboards from shell metrics (config/samplers.yml).' },
  { id: 'logs', label: 'Raw Signals', icon: 'LG', stage: 'observe', purpose: 'Drop to raw signal logs when the pretty panels are not enough.' },
  { id: 'dream', label: 'Dream Swarm', icon: 'DR', stage: 'observe', purpose: 'Live altered-states WebGL swarm telemetry visualizer.' },
  { id: 'gatekeeper', label: 'Risk Gate', icon: 'GK', stage: 'control', purpose: 'Check safety gates, approvals, and blocked risky operations.' },
  { id: 'abliterator', label: 'Abliterator', icon: 'AB', stage: 'control', purpose: 'OBLITERATUS refusal weight excision and red-team sandbox.' },
  { id: 'cognitive', label: 'Cognitive Mesh', icon: 'CG', stage: 'control', purpose: 'Use memory, rules, diagnostics, and reasoning lenses.' },
  { id: 'evolution', label: 'Self-Evolution', icon: 'EV', stage: 'control', purpose: 'Track the human-steers, harness-builds, loop-improves learning cycle.' },
  { id: 'graph', label: 'System Map', icon: 'SM', stage: 'control', purpose: 'Map system relationships across services, agents, workflows, and events.' },
  { id: 'mochi', label: 'Asher', icon: '✦', stage: 'start', purpose: 'Talk to your thringlet companion. Live narrator over every event, job, and agent action.' },
];

function serviceReachable(status?: string) {
  return status === 'online' || status === 'healthy' || status === 'ok' || status === 'degraded';
}

function coreServices(services: MissionData['services']) {
  return (services || []).filter(service => !service.optional);
}

function serviceCountLabel(services: MissionData['services']) {
  // Honest count: ALL registered services (the full architecture), not just the
  // non-optional subset. Hiding the optional ones made the header read "8/8"
  // when there are really 22 services defined in the backend manifest.
  const all = services || [];
  const online = all.filter(service => serviceReachable(service.status)).length;
  return { online, total: all.length };
}

const TAB_STAGE_LABELS: Record<Tab['stage'], string> = {
  start: 'Start',
  build: 'Build',
  observe: 'Observe',
  control: 'Control',
};

const COMPANION_SPECIES = ['duck', 'goose', 'blob', 'cat', 'dragon', 'octopus', 'owl', 'penguin', 'turtle', 'snail', 'ghost', 'axolotl', 'capybara', 'cactus', 'robot', 'rabbit', 'mushroom', 'chonk'];

const TAB_CODES: Record<TabId, string> = {
  overview: 'MS',
  evolution: 'EV',
  graph: 'SM',
  harness: 'HX',
  agents: 'AG',
  tower: 'TW',
  swarm: 'DG',
  pipeline: 'WF',
  timeline: 'EL',
  gatekeeper: 'GK',
  cognitive: 'CG',
  command: 'CM',
  logs: 'LG',
  mochi: 'AS',
  sampler: 'SP',
  dream: 'DR',
  abliterator: 'AB',
};

type CommandMode = 'chat' | 'api' | 'kernel' | 'orchestrate' | 'tower' | 'research' | 'groupchat';

type DispatchHistoryItem = {
  mode: CommandMode;
  text: string;
  status: string;
  reply?: string;
  workflowId?: string | null;
  workflow?: {
    id?: string;
    status?: string;
    delegationLabel?: string | null;
    trace?: { stage: string; status: string; detail: string; timestamp?: string }[];
  } | null;
};

function serviceProxyUrl(port: number, path: string) {
  return `/api/service-proxy?port=${port}&path=${encodeURIComponent(path)}`;
}

function HeaderMochi({ onToggle, isOpen, compact = false }: { onToggle: () => void; isOpen: boolean; compact?: boolean }) {
  const [face, setFace] = useState('(·ω·)');
  const [name, setName] = useState('');

  useEffect(() => {
    fetch('/api/mochi').then(r => r.ok ? r.json() : null).then(m => {
      if (!m) return;
      const eye = m.eye ?? '·';
      const fn = MOCHI_FACES[m.species as string] ?? ((e: string) => `(${e}${e})`);
      setFace(fn(eye));
      setName(m.name ?? '');
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const t = setInterval(() => {
      fetch('/api/mochi').then(r => r.ok ? r.json() : null).then(m => {
        if (!m) return;
        const eye = m.eye ?? '·';
        // blink every ~10s
        const blink = (Date.now() / 1000) % 10 < 0.5;
        const fn = MOCHI_FACES[m.species as string] ?? ((e: string) => `(${e}${e})`);
        setFace(fn(blink ? '-' : eye));
        setName(m.name ?? '');
      }).catch(() => {});
    }, 8000);
    return () => clearInterval(t);
  }, []);

  if (!name) return null;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={isOpen}
      title={`${name} — click to ${isOpen ? 'close' : 'open'} narrator`}
      className={`flex items-center justify-center gap-1.5 rounded-lg border transition-all ${compact ? 'h-10 w-10 overflow-hidden px-0 py-0' : 'px-2 py-1'} ${
        isOpen
          ? 'border-fuchsia-400/50 bg-fuchsia-500/15 shadow-[0_0_12px_rgba(217,70,239,0.35)]'
          : 'border-fuchsia-500/15 bg-fuchsia-500/5 hover:bg-fuchsia-500/10 hover:border-fuchsia-400/30'
      }`}
    >
      <span className="text-[10px] font-mono text-fuchsia-300/80" style={{ textShadow: '0 0 8px rgba(217,70,239,0.4)' }}>{face}</span>
      <span className={`text-[9px] font-mono text-white/30 ${compact ? 'hidden' : 'hidden md:inline'}`}>{name}</span>
      <span className="text-[8px] font-mono text-fuchsia-300/60 hidden md:inline">{isOpen ? '▾' : '▴'}</span>
    </button>
  );
}

function OperatorSessionSelector() {
  const [operator, setOperator] = useState('Ted');
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState('');

  const fetchOperator = () => {
    fetch('/api/whoami')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d && d.name) {
          setOperator(d.name);
          setInputValue(d.name);
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetchOperator();
  }, []);

  const saveOperator = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    fetch('/api/whoami', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmed }),
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d && d.success) {
          setOperator(d.name);
          setEditing(false);
          window.dispatchEvent(new CustomEvent('operator-changed', { detail: d.name }));
        }
      })
      .catch(() => {});
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1.5 shrink-0">
        <input
          type="text"
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') saveOperator();
            if (e.key === 'Escape') setEditing(false);
          }}
          className="w-20 bg-black/80 border border-cyan-500/50 rounded px-1 py-0.5 text-[9px] font-mono text-cyan-200 outline-none"
          autoFocus
        />
        <button onClick={saveOperator} className="text-[9px] font-mono text-emerald-400 hover:text-emerald-300">✓</button>
        <button onClick={() => setEditing(false)} className="text-[9px] font-mono text-rose-400 hover:text-rose-300">×</button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-cyan-500/15 bg-cyan-500/5 hover:bg-cyan-500/10 hover:border-cyan-400/30 transition-all shrink-0"
      title="Active Operator Session - Click to edit"
    >
      <span className="text-[8px] font-mono text-cyan-400/60 uppercase">OP:</span>
      <span className="text-[9px] font-mono font-black text-cyan-300" style={{ textShadow: '0 0 6px rgba(34,211,238,0.4)' }}>{operator}</span>
    </button>
  );
}

export function MissionControl({ data }: { data: MissionData }) {
  const [activeTab, setActiveTab] = useState<TabId>('command');
  const [missionDrawerOpen, setMissionDrawerOpen] = useState(false);
  const [mochiFloatOpen, setMochiFloatOpen] = useState(false);
  // Do NOT auto-cover the live cockpit with the onboarding modal. It reads as a
  // static "widget page that isn't wired to anything" because it sits on top of
  // the real, fully-wired MissionControl. Land on the live cockpit directly; the
  // onboarding ("Mission Spine" overview) stays available via the ? button.
  const [showOnboarding, setShowOnboarding] = useState(false);
  const { toasts, dismissToast } = useToast();
  const uniqueAgentCount = getUniqueAgents(data.agents).length;
  const manifestAgentCount = data.manifest?.agents ?? uniqueAgentCount;
  const manifestDivisionCount = data.manifest?.divisions?.length ?? 0;

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const lastProcessedLogId = useRef<string | null>(null);

  useEffect(() => {
    if (!data.logs || data.logs.length === 0) return;
    const latestLog = data.logs[0];
    if (latestLog.id === lastProcessedLogId.current) return;
    lastProcessedLogId.current = latestLog.id;

    const win = iframeRef.current?.contentWindow;
    if (!win) return;

    let eventType: string | null = null;
    let agentName = latestLog.agentName || '';
    let division = '';

    if (agentName) {
      const regAgent = data.agents.find(a => a.name.toLowerCase() === agentName.toLowerCase());
      if (regAgent) {
        division = regAgent.division;
      }
    }

    const typeLower = (latestLog.type || '').toLowerCase();
    const msgLower = (latestLog.message || '').toLowerCase();

    if (typeLower === 'agent.spawned' || typeLower === 'agent.spawn' || typeLower === 'agent_spawned' || typeLower === 'agent') {
      eventType = 'spawn';
    } else if (typeLower === 'error' || typeLower === 'agent_error') {
      eventType = 'error';
    } else if (typeLower === 'agent.completed' || typeLower === 'agent.complete' || typeLower === 'agent_complete' || (typeLower === 'system' && msgLower.includes('completed'))) {
      eventType = 'complete';
    } else if (
      msgLower.includes('running tool') ||
      msgLower.includes('executing tool') ||
      msgLower.includes('invoke') ||
      typeLower === 'tool' ||
      typeLower === 'tool.called'
    ) {
      eventType = 'tool';
    } else if (typeLower === 'chorus' || (typeLower === 'system' && latestLog.source !== 'TOWER')) {
      eventType = 'chorus';
      agentName = latestLog.source;
    } else if (typeLower === 'voice.listening') {
      eventType = 'voice-listening';
    } else if (typeLower === 'voice.speaking') {
      if (msgLower.includes('"speaking":false') || msgLower.includes('speaking: false')) {
        eventType = 'voice-speaking-stop';
      } else {
        eventType = 'voice-speaking-start';
      }
    }

    if (eventType) {
      win.postMessage(
        {
          type: 'purpclaw-swarm-event',
          eventType,
          agentName,
          division,
          message: latestLog.message
        },
        window.location.origin
      );
    }
  }, [data.logs, data.agents]);

  const selectTab = (tab: TabId) => setActiveTab(tab);
  const toggleMochiFloat = () => setMochiFloatOpen(o => !o);
  const openMochiFullView = () => window.open('/mochi', '_blank');

  useEffect(() => {
    try {
      setMissionDrawerOpen(localStorage.getItem('purpclaw.mission.drawer') === 'open');
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('purpclaw.mission.drawer', missionDrawerOpen ? 'open' : 'closed');
    } catch {}
  }, [missionDrawerOpen]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMissionDrawerOpen(false);
      if (event.ctrlKey && event.key.toLowerCase() === 'b') {
        event.preventDefault();
        setMissionDrawerOpen(v => !v);
      }
      if (event.ctrlKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setMissionDrawerOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="h-screen bg-[#030508] text-white relative overflow-hidden flex flex-col">
      {/* Visualizer Backdrop */}
      <div className={`fixed inset-0 z-0 transition-all duration-1000 ${
        activeTab === 'dream'
          ? 'opacity-100 pointer-events-auto scale-100'
          : 'opacity-15 pointer-events-none scale-105 blur-[1px]'
      }`}>
        {/* Only mount the 222KB three.js/WebGL ENTHEA visualizer when its tab
            is active. Previously it was ALWAYS mounted (just dimmed), so the
            heavy GPU render loop ran continuously on every screen — pegging
            the main thread, making /mission laggy, and preventing the page
            from ever settling. The event-forwarding effect + DreamControlPanel
            both guard on iframeRef being present, so this is safe. */}
        {activeTab === 'dream' && (
          <iframe
            ref={iframeRef}
            id="enthea-iframe"
            src="/enthea.html"
            className="w-full h-full border-none"
            title="ENTHEA Visualizer"
          />
        )}
      </div>
      {/* Animated background grid */}
      <div className="absolute inset-0 pointer-events-none">
        <GridBackground />
        <ScanlineOverlay />
        <VignetteOverlay />
      </div>

      {/* Header */}
      <header className="relative z-10 flex shrink-0 items-center justify-between gap-3 px-3 md:px-4 h-14 border-b border-cyan-500/10 bg-black/50 backdrop-blur-2xl">
        {/* Left â€” identity */}
        <div className="flex min-w-0 items-center gap-3 md:gap-4">
          <PurpClawLogo size="header" />
          <div className="flex min-w-0 items-center gap-3">
            <span className="hidden 2xl:inline truncate text-xs md:text-sm font-black tracking-[0.22em] md:tracking-[0.3em] text-white/90 font-mono">PURPCLAW</span>
            <div className="hidden sm:block w-px h-4 bg-cyan-500/30" />
            <span className="hidden lg:inline text-[10px] tracking-[0.25em] text-cyan-400/60 font-mono uppercase">One Mission / Many Lenses</span>
          </div>
          <div className="hidden sm:flex items-center gap-1.5 ml-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" style={{ boxShadow: '0 0 8px rgba(34,197,94,0.6)' }} />
            <span className="text-[9px] text-emerald-400/50 font-mono tracking-widest">LIVE</span>
          </div>
        </div>

        {/* Center â€” system vitals (authoritative totals from /api/manifest) */}
        <div className="hidden lg:flex items-center gap-4">
          {/* online (live health) / total (manifest source of truth) */}
          <VitalBadge label="Services" value={`${serviceCountLabel(data.services).online} live / ${data.manifest?.services ?? serviceCountLabel(data.services).total} total`} color="#22c55e" />
          <div className="w-px h-5 bg-white/10" />
          {/* live active agents / full roster from the manifest */}
          <VitalBadge label="Agents" value={`${uniqueAgentCount} runtime / ${manifestAgentCount} manifest`} sub={data.manifest ? `${manifestDivisionCount} divisions` : 'runtime'} color="#00d4ff" />
          <div className="w-px h-5 bg-white/10" />
          <VitalBadge label="Tools" value={data.manifest?.tools ?? 0} sub={data.manifest ? 'registered' : undefined} color="#f59e0b" />
          <div className="w-px h-5 bg-white/10" />
          <VitalBadge label="Events" value={data.logs.length} color="#a855f7" />
          <div className="w-px h-5 bg-white/10" />
          <VitalBadge label="Errors" value={data.agents.filter(a=>a.status==='error').length} color="#ef4444" />
        </div>

        {/* Right â€” connections + time */}
        <div className="flex shrink-0 items-center gap-2 md:gap-4">
          <div className="hidden xl:flex items-center gap-3">
            {[
              { label: 'API', ok: data.apiConnected },
              { label: 'TOWER', ok: data.towerConnected },
              { label: 'ORCH', ok: data.orchestratorConnected },
              { label: 'EVT', ok: data.eventBusConnected },
            ].map(({ label, ok }) => (
              <div key={label} className="flex items-center gap-1.5">
                <div className={`w-1.5 h-1.5 rounded-full ${ok ? 'bg-emerald-400' : 'bg-rose-500'}`}
                  style={{ boxShadow: ok ? '0 0 6px rgba(34,197,94,0.6)' : '0 0 6px rgba(239,68,68,0.6)' }} />
                <span className="text-[9px] font-mono text-white/30">{label}</span>
              </div>
            ))}
          </div>
          <div className="hidden xl:block w-px h-5 bg-white/10" />
          <OperatorSessionSelector />
          <div className="hidden md:block w-px h-5 bg-white/10" />
          <div className="hidden md:block"><Clock /></div>
          <button
            onClick={() => setShowOnboarding(true)}
            className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 text-white/30 hover:text-cyan-400 hover:border-cyan-500/30 flex items-center justify-center text-[11px] transition-all"
            title="Onboarding / how it works"
          >
            ?
          </button>
          <button
            onClick={() => window.open(`${window.location.origin}/mission?chrome=minimal`, '_blank', 'width=1400,height=900,menubar=no,toolbar=no')}
            className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 text-white/30 hover:text-cyan-400 hover:border-cyan-500/30 flex items-center justify-center text-[10px] transition-all"
            title="Pop out"
          >
            â†—
          </button>
          <button
            onClick={() => window.open('/skyscraper/', '_blank', 'width=1400,height=900,menubar=no,toolbar=no')}
            className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 text-white/30 hover:text-fuchsia-400 hover:border-fuchsia-500/30 flex items-center justify-center text-[10px] transition-all font-bold"
            title="Skyscraper UI — alternate command surface"
          >
            ◈
          </button>
        </div>
      </header>

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Main mission workbench: slim rail + drawer + dominant work canvas */}
      <main className="relative z-10 grid min-h-0 flex-1 grid-cols-[64px_minmax(0,1fr)] overflow-hidden">
        <MissionIconRail
          activeTab={activeTab}
          drawerOpen={missionDrawerOpen}
          onToggleDrawer={() => setMissionDrawerOpen(v => !v)}
          onSelect={(tab) => { selectTab(tab); setMissionDrawerOpen(false); }}
          onMochiToggle={toggleMochiFloat}
          mochiOpen={mochiFloatOpen}
        />
        {missionDrawerOpen && (
          <MissionDrawer
            activeTab={activeTab}
            data={data}
            onSelect={(tab) => { selectTab(tab); setMissionDrawerOpen(false); }}
            onClose={() => setMissionDrawerOpen(false)}
            onMochiToggle={toggleMochiFloat}
            mochiOpen={mochiFloatOpen}
          />
        )}
        <section className="flex min-w-0 flex-col overflow-hidden border-l border-white/6">
          <div className="flex h-10 shrink-0 items-center justify-between gap-3 border-b border-white/8 bg-black/35 px-4">
            <div className="min-w-0 truncate text-sm font-black uppercase tracking-[0.14em] text-cyan-100">
              Mission / {TABS.find(tab => tab.id === activeTab)?.label || 'Control Room'}
            </div>
            <div className="hidden min-w-0 truncate text-xs text-white/35 md:block">
              {TABS.find(tab => tab.id === activeTab)?.purpose}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            <ErrorBoundary>
              <PanelContent tab={activeTab} data={data} iframeRef={iframeRef} />
            </ErrorBoundary>
          </div>
        </section>
      </main>

      {/* Floating tab rail — right edge, vertical */}

      {/* Slide-in drawer overlay */}

      {/* Mochi floating narrator — free-floating, controlled by top-menu icon */}
      <MochiFloat data={data} open={mochiFloatOpen} onClose={() => setMochiFloatOpen(false)} onExpand={openMochiFullView} />

      {/* First-run onboarding / how-it-works (reopen from header ?) */}
      {showOnboarding && <Onboarding data={data} onClose={() => setShowOnboarding(false)} />}
    </div>
  );
}

// ─── Mochi Float — free-floating draggable narrator ─────────────────────────
function MissionIconRail({ activeTab, drawerOpen, onToggleDrawer, onSelect, onMochiToggle, mochiOpen }: {
  activeTab: TabId;
  drawerOpen: boolean;
  onToggleDrawer: () => void;
  onSelect: (tab: TabId) => void;
  onMochiToggle: () => void;
  mochiOpen: boolean;
}) {
  const primaryTabs: TabId[] = ['command', 'overview', 'graph', 'agents', 'harness', 'pipeline', 'swarm', 'evolution', 'logs'];
  return (
    <aside data-testid="mission-icon-rail" className="flex min-h-0 flex-col items-center gap-2 border-r border-cyan-300/10 bg-black/70 px-2 py-3 backdrop-blur-xl">
      <button
        type="button"
        onClick={onToggleDrawer}
        aria-label="Toggle Mission Drawer"
        aria-expanded={drawerOpen}
        className={`flex h-10 w-10 items-center justify-center rounded-xl border text-sm font-black transition-all ${drawerOpen ? 'border-cyan-300/45 bg-cyan-300/15 text-cyan-100' : 'border-white/10 bg-white/[0.035] text-white/65 hover:border-cyan-300/30 hover:text-cyan-100'}`}
      >
        MENU
      </button>
      <div className="h-px w-full bg-white/8" />
      <div className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto">
        {primaryTabs.map(id => {
          const tab = TABS.find(item => item.id === id)!;
          const active = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              title={tab.label}
              className={`flex h-10 w-10 items-center justify-center rounded-xl border text-[9px] font-mono font-black transition-all ${active ? 'border-violet-300/45 bg-violet-300/15 text-violet-100 shadow-[0_0_18px_rgba(168,85,247,0.18)]' : 'border-white/8 bg-white/[0.025] text-white/40 hover:border-white/20 hover:text-white/80'}`}
            >
              {TAB_CODES[id]}
            </button>
          );
        })}
      </div>
      <HeaderMochi onToggle={onMochiToggle} isOpen={mochiOpen} compact />
    </aside>
  );
}

function MissionDrawer({ activeTab, data, onSelect, onClose, onMochiToggle, mochiOpen }: {
  activeTab: TabId;
  data: MissionData;
  onSelect: (tab: TabId) => void;
  onClose: () => void;
  onMochiToggle: () => void;
  mochiOpen: boolean;
}) {
  const stages: Tab['stage'][] = ['start', 'build', 'observe', 'control'];
  const serviceCounts = serviceCountLabel(data.services);
  const agents = getUniqueAgents(data.agents);
  const stackLinks = [
    ['/mission', 'Mission Control'],
    ['/system-map', 'System Map'],
    ['/evolution', 'Self-Evolution'],
    ['/agents', 'Agents'],
    ['/mission/harness', 'Execution Harness'],
    ['/pipeline', 'Pipeline'],
    ['/swarm', 'Swarm'],
    ['/providers', 'Providers'],
    ['/voice', 'Voice'],
    ['/settings', 'Settings'],
    ['/omni', 'OMNI'],
  ];

  return (
    <>
      <button
        type="button"
        aria-label="Close Mission Drawer backdrop"
        onClick={onClose}
        className="absolute inset-y-0 left-16 right-0 z-30 bg-black/35 backdrop-blur-[1px] lg:hidden"
      />
      <aside data-testid="mission-drawer" className="absolute bottom-0 left-16 top-0 z-40 flex w-[min(25rem,calc(100vw-4rem))] flex-col border-r border-cyan-300/15 bg-[#05080d]/98 shadow-2xl backdrop-blur-2xl">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div>
            <div className="text-sm font-black uppercase tracking-[0.16em] text-cyan-100">Mission Drawer</div>
            <div className="mt-1 text-xs text-white/35">Navigation, sessions, outputs, stack pages</div>
          </div>
          <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.035] text-white/55 hover:text-cyan-100">x</button>
        </div>
        <div className="grid grid-cols-3 gap-2 border-b border-white/8 p-3 text-[11px] font-mono">
          <div className="rounded-lg border border-emerald-300/15 bg-emerald-300/5 p-2 text-emerald-200">
            <div className="text-white/35">services</div>
            <div>{serviceCounts.online}/{serviceCounts.total}</div>
          </div>
          <div className="rounded-lg border border-cyan-300/15 bg-cyan-300/5 p-2 text-cyan-200">
            <div className="text-white/35">agents</div>
            <div>{agents.length}</div>
          </div>
          <div className="rounded-lg border border-violet-300/15 bg-violet-300/5 p-2 text-violet-200">
            <div className="text-white/35">events</div>
            <div>{data.logs.length}</div>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <section className="mb-4">
            <div className="mb-2 text-[10px] font-mono uppercase tracking-[0.2em] text-white/35">Mission sections</div>
            {stages.map(stage => (
              <div key={stage} className="mb-3">
                <div className="mb-1 px-1 text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-200/55">{TAB_STAGE_LABELS[stage]}</div>
                <div className="space-y-1">
                  {TABS.filter(tab => tab.stage === stage).map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => onSelect(tab.id)}
                      className={`w-full rounded-lg border px-3 py-2 text-left transition-all ${activeTab === tab.id ? 'border-cyan-300/40 bg-cyan-300/12' : 'border-white/8 bg-white/[0.025] hover:border-cyan-300/20 hover:bg-cyan-300/[0.06]'}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-7 rounded border border-white/10 bg-black/35 px-1.5 py-0.5 text-center text-[9px] font-mono text-white/55">{TAB_CODES[tab.id]}</span>
                        <span className="text-sm font-semibold text-white/85">{tab.label}</span>
                      </div>
                      <div className="mt-1 pl-9 text-xs leading-snug text-white/35">{tab.purpose}</div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </section>
          <section className="mb-4 rounded-xl border border-fuchsia-300/12 bg-fuchsia-300/[0.035] p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-fuchsia-100/55">Mochi / outputs</div>
              <button onClick={onMochiToggle} className="rounded border border-fuchsia-300/20 px-2 py-1 text-[10px] font-mono text-fuchsia-100">{mochiOpen ? 'hide' : 'float'}</button>
            </div>
            <MochiNarrator data={data} />
          </section>
          <DrawerSessionPreview onOpenSessions={() => onSelect('command')} />
          <section>
            <div className="mb-2 text-[10px] font-mono uppercase tracking-[0.2em] text-white/35">Stack pages</div>
            <div className="grid grid-cols-1 gap-1">
              {stackLinks.map(([href, label]) => (
                <a key={href} href={href} className="rounded-lg border border-white/8 bg-white/[0.025] px-3 py-2 text-sm text-white/75 hover:border-violet-300/25 hover:bg-violet-300/[0.06]">
                  {label}
                </a>
              ))}
            </div>
          </section>
        </div>
      </aside>
    </>
  );
}

function DrawerSessionPreview({ onOpenSessions }: { onOpenSessions: () => void }) {
  const [sessions, setSessions] = useState<Array<{ id: string; title: string; updatedAt: string; messageCount: number }>>([]);

  useEffect(() => {
    fetch('/api/sessions?limit=5')
      .then(r => r.ok ? r.json() : null)
      .then(j => setSessions(Array.isArray(j?.sessions) ? j.sessions : []))
      .catch(() => {});
  }, []);

  return (
    <section className="mb-4 rounded-xl border border-cyan-300/12 bg-cyan-300/[0.035] p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-cyan-100/55">Chats / Sessions</div>
        <button onClick={onOpenSessions} className="rounded border border-cyan-300/20 px-2 py-1 text-[10px] font-mono text-cyan-100">open</button>
      </div>
      <div className="space-y-1">
        {sessions.length === 0 && <div className="rounded-lg border border-white/8 bg-black/20 p-2 text-xs text-white/35">No saved sessions yet.</div>}
        {sessions.map(session => (
          <button key={session.id} onClick={onOpenSessions} className="w-full rounded-lg border border-white/8 bg-black/20 px-2 py-1.5 text-left hover:border-cyan-300/25">
            <div className="truncate text-xs font-semibold text-white/75">{session.title || 'Untitled'}</div>
            <div className="mt-0.5 flex justify-between gap-2 text-[10px] font-mono text-white/35">
              <span>{session.messageCount || 0} msg</span>
              <span>{session.updatedAt ? new Date(session.updatedAt).toLocaleDateString() : session.id.slice(0, 10)}</span>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

function MochiFloat({ data, open, onClose, onExpand }: {
  data: MissionData;
  open: boolean;
  onClose: () => void;
  onExpand: () => void;
}) {
  const [pos, setPos] = useState({ x: 20, y: 80 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<{ mx: number; my: number; px: number; py: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const onMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, a')) return;
    dragStart.current = { mx: e.clientX, my: e.clientY, px: pos.x, py: pos.y };
    setDragging(true);
    e.preventDefault();
  };

  useEffect(() => {
    if (!dragging) return;
    const move = (e: MouseEvent) => {
      if (!dragStart.current) return;
      const nx = dragStart.current.px + (e.clientX - dragStart.current.mx);
      const ny = dragStart.current.py + (e.clientY - dragStart.current.my);
      const vw = window.innerWidth, vh = window.innerHeight;
      const pw = panelRef.current?.offsetWidth || 280;
      const ph = panelRef.current?.offsetHeight || 400;
      setPos({
        x: Math.max(8, Math.min(vw - pw - 8, nx)),
        y: Math.max(8, Math.min(vh - ph - 8, ny)),
      });
    };
    const up = () => { setDragging(false); dragStart.current = null; };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, [dragging]);

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      className="fixed z-50 w-72 rounded-2xl shadow-2xl"
      style={{
        left: pos.x,
        top: pos.y,
        background: 'linear-gradient(135deg, rgba(10,6,20,0.97) 0%, rgba(30,8,50,0.95) 100%)',
        border: '1px solid rgba(217,70,239,0.25)',
        boxShadow: '0 8px 40px rgba(0,0,0,0.6), 0 0 24px rgba(217,70,239,0.12), inset 0 1px 0 rgba(255,255,255,0.05)',
        backdropFilter: 'blur(24px)',
        animation: 'fadeSlideUp 200ms cubic-bezier(0.16,1,0.3,1) forwards',
        cursor: dragging ? 'grabbing' : 'default',
      }}
    >
      {/* Drag handle / header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] select-none"
        style={{ cursor: dragging ? 'grabbing' : 'grab' }}
        onMouseDown={onMouseDown}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono text-fuchsia-300" style={{ textShadow: '0 0 10px rgba(217,70,239,0.6)' }}>{'<✦~✦>'}</span>
          <div>
            <div className="text-[11px] font-bold text-white/85">Asher</div>
            <div className="text-[8px] font-mono text-fuchsia-300/40">dragon · narrator</div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onExpand}
            className="w-6 h-6 flex items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-white/30 hover:text-fuchsia-300 hover:border-fuchsia-400/30 transition-all text-[9px] font-mono"
            title="Open full Asher view"
          >↗</button>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-white/30 hover:text-rose-300 hover:border-rose-400/30 transition-all text-sm font-mono leading-none"
            title="Close"
          >×</button>
        </div>
      </div>

      {/* Live narrator content */}
      <div className="p-3">
        <MochiNarrator data={data} />
      </div>
    </div>
  );
}

// ─── Hover preview widget data per tab ──────────────────────────────────────
function tabPreviewData(tab: TabId, data: MissionData): { label: string; value: string; ok?: boolean }[] {
  const agents = getUniqueAgents(data.agents);
  const serviceCounts = serviceCountLabel(data.services);
  const working = agents.filter(a => a.status === 'working').length;
  const latest  = data.kernelJobs?.[0];
  switch (tab) {
    case 'overview': return [
      { label: 'Services',  value: `${serviceCounts.online}/${serviceCounts.total}`, ok: serviceCounts.online === serviceCounts.total },
      { label: 'Agents',    value: `${agents.length} registered`, ok: true },
      { label: 'Last job',  value: latest?.state || 'none', ok: latest?.state !== 'failed' },
    ];
    case 'agents': return [
      { label: 'Working',   value: `${working} active`, ok: working > 0 },
      { label: 'Total',     value: `${agents.length} agents`, ok: true },
      { label: 'Top agent', value: agents[0]?.name || '—', ok: true },
    ];
    case 'tower': return [
      { label: 'Tower',     value: data.towerConnected ? 'online' : 'offline', ok: data.towerConnected },
      { label: 'Spawned',   value: `${working} agents`, ok: true },
    ];
    case 'swarm': return [
      { label: 'Missions',  value: `${data.kernelJobs?.filter(j=>j.route==='swarm-coordinator').length || 0}`, ok: true },
      { label: 'Last',      value: latest?.goal?.slice(0,28) || '—', ok: true },
    ];
    case 'pipeline': return [
      { label: 'Active',    value: `${data.pipeline?.active?.length || 0}`, ok: true },
      { label: 'Queued',    value: `${data.pipeline?.queue?.items?.length || 0}`, ok: true },
      { label: 'Done',      value: `${data.pipeline?.completed?.length || 0}`, ok: true },
    ];
    case 'timeline': return [
      { label: 'Events',    value: `${data.logs.length}`, ok: true },
      { label: 'Latest',    value: (data.logs[0] as any)?.type || 'none', ok: true },
    ];
    case 'harness': return [
      { label: 'Bench',     value: `${Math.round(((data.harnessBenchmarks as any)?.summary?.completionRate || 0) * 100)}% pass`, ok: true },
      { label: 'Scored',    value: `${data.agentScores?.meta?.totalTasksRecorded || 0} outcomes`, ok: true },
    ];
    case 'gatekeeper': return [
      { label: 'Gatekeeper', value: data.apiConnected ? 'active' : 'offline', ok: data.apiConnected },
      { label: 'Repair',    value: (data.omnicodeStatus as any)?.destructiveRepairBlocked ? 'blocked' : 'open', ok: true },
    ];
    case 'cognitive': return [
      { label: 'Memory',    value: data.apiConnected ? 'live' : 'offline', ok: data.apiConnected },
    ];
    case 'logs': return [
      { label: 'Signals',   value: `${data.logs.length}`, ok: true },
      { label: 'Errors',    value: `${data.agents.filter(a=>a.status==='error').length}`, ok: data.agents.filter(a=>a.status==='error').length === 0 },
    ];
    case 'mochi': return [
      { label: 'Pet',       value: data.apiConnected ? 'online' : 'offline', ok: data.apiConnected },
      { label: 'Narrator',  value: 'live', ok: true },
      { label: 'Mood',      value: '?', ok: true },
    ];
    case 'dream': return [
      { label: 'WebGL Engine', value: 'online', ok: true },
      { label: 'Altered States', value: 'active', ok: true },
    ];
    case 'abliterator': return [
      { label: 'Excisions', value: 'active', ok: true },
      { label: 'Safety Mode', value: 'aligned', ok: true },
    ];
    default: return [{ label: tab, value: 'see panel', ok: true }];
  }
}

function SectionSidebar({ activeTab, onSelect, data, onMochiToggle, mochiOpen }: {
  activeTab: TabId;
  onSelect: (tab: TabId) => void;
  data: MissionData;
  onMochiToggle: () => void;
  mochiOpen: boolean;
}) {
  const stages: Tab['stage'][] = ['start', 'build', 'observe', 'control'];
  const stageColors: Record<Tab['stage'], string> = {
    start: 'text-cyan-300',
    build: 'text-violet-300',
    observe: 'text-amber-300',
    control: 'text-rose-300',
  };

  return (
    <aside className="hidden w-[20rem] shrink-0 border-r border-cyan-300/10 bg-black/55 backdrop-blur-2xl xl:flex xl:flex-col">
      <div className="border-b border-white/10 p-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-cyan-200/55">Mission Sections</div>
            <div className="mt-1 text-xs text-white/35">Each item opens a live stack page.</div>
          </div>
          <HeaderMochi onToggle={onMochiToggle} isOpen={mochiOpen} compact />
        </div>
        <div className="grid grid-cols-3 gap-2 text-[10px] font-mono">
          <div className="rounded-lg border border-emerald-300/15 bg-emerald-300/5 px-2 py-1.5 text-emerald-200/70">
            <div className="text-white/30">services</div>
            <div>{serviceCountLabel(data.services).online}/{serviceCountLabel(data.services).total}</div>
          </div>
          <div className="rounded-lg border border-cyan-300/15 bg-cyan-300/5 px-2 py-1.5 text-cyan-200/70">
            <div className="text-white/30">agents</div>
            <div>{getUniqueAgents(data.agents).length}</div>
          </div>
          <div className="rounded-lg border border-fuchsia-300/15 bg-fuchsia-300/5 px-2 py-1.5 text-fuchsia-200/70">
            <div className="text-white/30">events</div>
            <div>{data.logs.length}</div>
          </div>
        </div>
      </div>
      <nav className="min-h-0 flex-1 overflow-y-auto p-2">
        {stages.map(stage => {
          const tabs = TABS.filter(tab => tab.stage === stage);
          return (
            <section key={stage} className="mb-3 last:mb-0">
              <div className={`px-2 py-1 font-mono text-[9px] uppercase tracking-[0.22em] ${stageColors[stage]} opacity-70`}>
                {TAB_STAGE_LABELS[stage]}
              </div>
              <div className="space-y-1">
                {tabs.map(tab => {
                  const active = activeTab === tab.id;
                  const preview = tabPreviewData(tab.id, data).slice(0, 2);
                  return (
                    <button
                      key={tab.id}
                      onClick={() => onSelect(tab.id)}
                      className={`w-full rounded-xl border px-3 py-2 text-left transition-all ${
                        active
                          ? 'border-cyan-300/45 bg-cyan-300/12 shadow-[0_0_24px_rgba(34,211,238,0.12)]'
                          : 'border-white/8 bg-white/[0.025] hover:border-cyan-300/25 hover:bg-cyan-300/[0.06]'
                      }`}
                      aria-current={active ? 'page' : undefined}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-white/85">{tab.label}</div>
                          <div className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-white/35">{tab.purpose}</div>
                        </div>
                        <span className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[9px] ${
                          active ? 'border-cyan-300/30 bg-cyan-300/10 text-cyan-100' : 'border-white/10 bg-black/30 text-white/35'
                        }`}>
                          {TAB_CODES[tab.id] || tab.icon}
                        </span>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-1.5">
                        {preview.map(item => (
                          <div key={`${tab.id}-${item.label}`} className="min-w-0 rounded-lg border border-white/8 bg-black/25 px-2 py-1">
                            <div className="truncate font-mono text-[8px] uppercase tracking-[0.14em] text-white/25">{item.label}</div>
                            <div className={`truncate font-mono text-[10px] ${item.ok === false ? 'text-rose-300' : 'text-white/55'}`}>{item.value}</div>
                          </div>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </nav>
    </aside>
  );
}

function FloatingTabRail({ openDrawer, onToggle, data, onMochiToggle, mochiOpen }: {
  openDrawer: TabId | null;
  onToggle: (tab: TabId) => void;
  data: MissionData;
  onMochiToggle: () => void;
  mochiOpen: boolean;
}) {
  const [hovered, setHovered] = useState<TabId | null>(null);
  const stages: Tab['stage'][] = ['start', 'build', 'observe', 'control'];
  const stageColors: Record<Tab['stage'], string> = {
    start:   'text-cyan-400',
    build:   'text-violet-400',
    observe: 'text-amber-400',
    control: 'text-rose-400',
  };

  return (
    <nav className="absolute left-3 top-[72px] bottom-4 z-30 flex w-16 flex-col items-center pointer-events-none">
      <div className="pointer-events-auto flex w-full flex-col items-center gap-2 rounded-2xl border border-fuchsia-300/15 bg-black/75 px-1.5 py-2 shadow-2xl backdrop-blur-xl">
        <HeaderMochi onToggle={onMochiToggle} isOpen={mochiOpen} compact />
        <div className="h-px w-full bg-white/8" />
        {stages.map(stage => {
          const tabs = TABS.filter(t => t.stage === stage);
          return (
            <React.Fragment key={stage}>
              <div className={`text-center text-[7px] uppercase tracking-[0.18em] font-mono px-1 py-0.5 ${stageColors[stage]} opacity-55`}>
                {TAB_STAGE_LABELS[stage]}
              </div>
              {tabs.map(tab => {
                const isOpen = openDrawer === tab.id;
                const preview = hovered === tab.id ? tabPreviewData(tab.id, data) : null;
                return (
                  <div key={tab.id} className="relative" onMouseEnter={() => setHovered(tab.id)} onMouseLeave={() => setHovered(null)}>
                    <button
                      onClick={() => onToggle(tab.id)}
                      className={`flex items-center justify-center w-10 h-10 rounded-xl border text-[9px] font-mono font-bold transition-all duration-200 ${
                        isOpen
                          ? 'border-cyan-400/50 bg-cyan-400/15 text-cyan-200 shadow-[0_0_12px_rgba(34,211,238,0.2)]'
                          : 'border-white/8 bg-white/[0.03] text-white/35 hover:text-white/70 hover:border-white/20 hover:bg-white/[0.06]'
                      }`}
                      title={tab.label}
                    >
                      {TAB_CODES[tab.id] || tab.icon}
                    </button>

                    {/* Hover preview widget */}
                    {preview && (
                      <div
                        className="absolute left-12 top-1/2 -translate-y-1/2 w-52 rounded-xl border border-white/12 bg-black/90 backdrop-blur-xl p-3 shadow-2xl pointer-events-none"
                        style={{ animation: 'fadeIn 120ms ease-out forwards' }}
                      >
                        <div className="text-[8px] uppercase tracking-[0.24em] font-mono text-white/35 mb-2">{tab.label}</div>
                        <div className="text-[10px] font-mono text-white/40 mb-2 leading-4">{tab.purpose}</div>
                        <div className="space-y-1.5">
                          {preview.map((item, i) => (
                            <div key={i} className="flex items-center justify-between">
                              <span className="text-[9px] font-mono text-white/35 uppercase">{item.label}</span>
                              <span className={`text-[10px] font-mono font-bold ${item.ok !== false ? 'text-white/75' : 'text-amber-300'}`}>{item.value}</span>
                            </div>
                          ))}
                        </div>
                        <div className="mt-2 text-[8px] font-mono text-white/20">legacy rail preview</div>
                      </div>
                    )}
                  </div>
                );
              })}
              <div className="h-px w-full bg-white/6 my-0.5" />
            </React.Fragment>
          );
        })}
      </div>
    </nav>
  );
}

function DrawerOverlay({ tab, data, onClose, iframeRef }: { tab: TabId; data: MissionData; onClose: () => void; iframeRef?: React.RefObject<HTMLIFrameElement | null> }) {
  const tabDef = TABS.find(t => t.id === tab) || TABS[0];
  const isDream = tab === 'dream';
  return (
    <>
      {/* Backdrop */}
      <div
        className={`absolute inset-0 z-40 transition-all duration-500 ${
          isDream ? 'bg-black/10 backdrop-blur-none' : 'bg-black/50 backdrop-blur-sm'
        }`}
        onClick={onClose}
        style={{ animation: 'fadeIn 180ms ease-out forwards' }}
      />
      {/* Drawer panel */}
      <div
        className={`absolute top-0 bottom-0 z-50 flex flex-col shadow-2xl transition-all duration-500 ${
          isDream
            ? 'left-20 w-96 border-r border-white/8 bg-[#040a10]/80 backdrop-blur-md'
            // Full-page panel: span from the tab rail (left-20) to the right edge.
            // Was a cramped w-[min(88vw,900px)] side-strip that made every tab feel
            // like a widget. Now each panel gets the whole canvas, wired to live data.
            : 'left-20 right-0 border-r border-white/8 bg-[#040a10]/97 backdrop-blur-2xl'
        }`}
        style={{ animation: 'slideInLeft 200ms cubic-bezier(0.16,1,0.3,1) forwards' }}
      >
        {/* Drawer header */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/8 bg-black/40 px-5 py-3">
          <div className="flex items-center gap-3">
            <span className="rounded border border-cyan-300/20 bg-black/40 px-2 py-1 text-[9px] font-mono text-cyan-100/65">{TAB_CODES[tab]}</span>
            <span className="text-sm font-black tracking-[0.08em] text-white/85">{tabDef.label}</span>
            <span className="hidden md:inline text-[10px] text-white/30">{tabDef.purpose}</span>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-white/40 hover:text-cyan-300 hover:border-cyan-300/30 transition-all text-sm font-mono"
          >
            ×
          </button>
        </div>
        {/* Panel content — full-height, scrolls if the panel overflows */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <ErrorBoundary>
            <PanelContent tab={tab} data={data} iframeRef={iframeRef} />
          </ErrorBoundary>
        </div>
      </div>
    </>
  );
}

function FlowRibbon({ data }: { data: MissionData }) {
  const latest = data.kernelJobs[0];
  const activeAgents = getUniqueAgents(data.agents).filter(agent => agent.status === 'working').length;
  const activeFlows = data.pipeline?.active?.length || 0;
  const steps = [
    { label: 'Hello', detail: data.apiConnected ? 'API listening' : 'API offline', active: data.apiConnected },
    { label: 'Kernel', detail: latest?.id || 'waiting', active: Boolean(latest) },
    { label: 'Job', detail: latest?.state || 'none', active: Boolean(latest && latest.state !== 'failed') },
    { label: 'Swarm', detail: latest?.linkedMissionId || `${activeFlows} workflows`, active: Boolean(latest?.linkedMissionId || activeFlows) },
    { label: 'Agents', detail: `${activeAgents} working`, active: activeAgents > 0 },
    { label: 'Result', detail: latest?.finishedAt ? 'closed' : latest?.state === 'delegated' ? 'delegated' : 'pending', active: Boolean(latest?.finishedAt || latest?.state === 'delegated') },
  ];

  return (
    <section className="relative z-10 shrink-0 border-b border-cyan-300/10 bg-black/35 px-3 py-2 backdrop-blur-xl">
      <div className="flex items-center gap-2 overflow-x-auto">
        <div className="mr-1 shrink-0 text-[8px] font-mono uppercase tracking-[0.24em] text-cyan-200/45">flow</div>
        {steps.map((step, index) => (
          <React.Fragment key={step.label}>
            <div className={`min-w-[118px] rounded-lg border px-2.5 py-1.5 ${step.active ? 'border-cyan-300/25 bg-cyan-300/10' : 'border-white/10 bg-white/[0.025]'}`}>
              <div className="flex items-center gap-2">
                <span className={`h-1.5 w-1.5 rounded-full ${step.active ? 'bg-cyan-300 shadow-[0_0_10px_rgba(103,232,249,0.75)]' : 'bg-white/20'}`} />
                <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-white/60">{step.label}</span>
              </div>
              <div className="mt-1 truncate font-mono text-[9px] text-white/30">{step.detail}</div>
            </div>
            {index < steps.length - 1 && <div className="h-px w-5 shrink-0 bg-cyan-300/20" />}
          </React.Fragment>
        ))}
      </div>
    </section>
  );
}

function TabRail({ activeTab, onSelect }: { activeTab: TabId; onSelect: (tab: TabId) => void }) {
  const stages: Tab['stage'][] = ['start', 'build', 'observe', 'control'];
  return (
    <nav className="relative z-10 shrink-0 border-b border-white/5 bg-black/30 px-3 py-2 backdrop-blur-xl overflow-x-auto">
      <div className="flex min-w-max items-stretch gap-3">
        {stages.map(stage => {
          const tabs = TABS.filter(tab => tab.stage === stage);
          return (
            <div key={stage} className="flex items-center gap-1 rounded-xl border border-white/5 bg-white/[0.018] px-2 py-1">
              <div className="mr-1 w-14 shrink-0 text-[8px] font-mono uppercase tracking-[0.18em] text-white/28">{TAB_STAGE_LABELS[stage]}</div>
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => onSelect(tab.id)}
                  title={tab.purpose}
                  className={`flex shrink-0 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[9px] font-bold tracking-[0.08em] transition-all duration-200 ${
                    activeTab === tab.id
                      ? 'border-cyan-300/30 bg-cyan-300/12 text-cyan-200 shadow-[0_0_15px_rgba(34,211,238,0.08)]'
                      : 'border-transparent text-white/28 hover:border-white/10 hover:bg-white/[0.035] hover:text-white/65'
                  }`}
                >
                  <span className="rounded border border-white/10 bg-black/30 px-1.5 py-0.5 text-[8px] font-mono text-white/45">{TAB_CODES[tab.id] || tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </nav>
  );
}

function ActiveTabGuide({ tab }: { tab: TabId }) {
  const active = TABS.find(item => item.id === tab) || TABS[0];
  const stageSteps = [
    { stage: 'start', label: 'Start', body: 'Ask, launch, or inspect the latest job.' },
    { stage: 'build', label: 'Build', body: 'Agents, harness, and swarm do the work.' },
    { stage: 'observe', label: 'Observe', body: 'Follow workflows, events, and raw signals.' },
    { stage: 'control', label: 'Control', body: 'Review safety, memory, maps, and learning.' },
  ] as const;
  return (
    <section className="relative z-10 shrink-0 border-b border-cyan-300/10 bg-[#050b10]/86 px-3 py-2 backdrop-blur-xl">
      <div className="grid gap-2 xl:grid-cols-[280px_1fr]">
        <div className="rounded-xl border border-cyan-300/12 bg-cyan-300/[0.035] px-3 py-2">
          <div className="text-[8px] font-mono uppercase tracking-[0.24em] text-cyan-200/45">{TAB_STAGE_LABELS[active.stage]} lens</div>
          <div className="mt-1 flex items-center gap-2">
            <span className="rounded border border-cyan-300/20 bg-black/40 px-2 py-0.5 text-[9px] font-mono text-cyan-100/65">{TAB_CODES[active.id]}</span>
            <span className="text-sm font-black tracking-[0.08em] text-white/82">{active.label}</span>
          </div>
          <div className="mt-1 text-[11px] leading-4 text-white/42">{active.purpose}</div>
        </div>
        <div className="grid gap-1 sm:grid-cols-4">
          {stageSteps.map((step, index) => {
            const isActive = active.stage === step.stage;
            return (
              <div key={step.stage} className={`rounded-xl border px-3 py-2 ${isActive ? 'border-cyan-300/24 bg-cyan-300/10' : 'border-white/7 bg-white/[0.02]'}`}>
                <div className="flex items-center gap-2">
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full border text-[9px] font-mono ${isActive ? 'border-cyan-200/40 bg-cyan-200/15 text-cyan-100' : 'border-white/10 bg-black/25 text-white/32'}`}>{index + 1}</span>
                  <span className={`text-[10px] font-bold uppercase tracking-[0.14em] ${isActive ? 'text-cyan-100/75' : 'text-white/35'}`}>{step.label}</span>
                </div>
                <div className="mt-1 line-clamp-2 text-[10px] leading-4 text-white/32">{step.body}</div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function DreamControlPanel({ iframeRef }: { iframeRef: React.RefObject<HTMLIFrameElement | null> }) {
  const triggerEvent = (eventType: string, extra = {}) => {
    const win = iframeRef.current?.contentWindow;
    if (win) {
      win.postMessage({
        type: 'purpclaw-swarm-event',
        eventType,
        ...extra
      }, window.location.origin);
    }
  };

  const substances = [
    { label: 'LSD (Intelligence Division)', eventType: 'spawn', extra: { agentName: 'Intelligence Swarm', division: 'Intelligence' }, color: 'text-purple-400 border-purple-500/20 bg-purple-500/5' },
    { label: 'DMT (Security Division)', eventType: 'spawn', extra: { agentName: 'Security Core', division: 'Security' }, color: 'text-rose-400 border-rose-500/20 bg-rose-500/5' },
    { label: 'Psilocybin (Engineering)', eventType: 'spawn', extra: { agentName: 'Engineering Loop', division: 'Engineering' }, color: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5' },
    { label: 'Mescaline (Infrastructure)', eventType: 'spawn', extra: { agentName: 'Infrastructure Node', division: 'Infrastructure' }, color: 'text-amber-400 border-amber-500/20 bg-amber-500/5' },
    { label: 'Ketamine (Error Wash-out)', eventType: 'error', extra: { agentName: 'Wash-out' }, color: 'text-blue-400 border-blue-500/20 bg-blue-500/5' },
  ];

  const signals = [
    { label: '🎤 Vectorscope (Voice Listening)', eventType: 'voice-listening' },
    { label: '🔊 Chladni eigenmode (Voice Speaking)', eventType: 'voice-speaking-start' },
    { label: '🔇 AI Silent (Voice Stop)', eventType: 'voice-speaking-stop' },
    { label: '🎭 Pulse Bloom (Chorus Broadcast)', eventType: 'chorus', extra: { agentName: 'Companion' } },
    { label: '🛠️ Complexity Surge (Tool Called)', eventType: 'tool' },
  ];

  return (
    <div className="h-full overflow-y-auto p-5 space-y-5">
      <div>
        <span className="text-[9px] uppercase tracking-[0.25em] text-cyan-300/45 font-mono font-bold">swarm visual cortex</span>
        <h3 className="text-base font-black uppercase tracking-wider text-white/85 mt-0.5">ENTHEA Control Bridge</h3>
        <p className="text-xs text-white/40 leading-relaxed mt-2 font-mono">
          Interactive cockpit for the altered-states visual synthesizer. Triggers manual telemetry overrides or simulates swarm stress configurations.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {/* Substances */}
        <div className="rounded-xl border border-white/5 bg-black/25 p-4 space-y-3">
          <span className="text-[9px] uppercase tracking-wider text-white/30 font-mono font-bold block">Substance Emulation Overrides</span>
          <div className="flex flex-col gap-2">
            {substances.map((sub, idx) => (
              <button
                key={idx}
                onClick={() => triggerEvent(sub.eventType, sub.extra)}
                className={`w-full text-left font-mono text-[10px] px-3 py-2 border rounded-lg hover:scale-[1.01] active:scale-[0.99] transition-all duration-200 ${sub.color}`}
              >
                {sub.label}
              </button>
            ))}
          </div>
        </div>

        {/* System Signals */}
        <div className="rounded-xl border border-white/5 bg-black/25 p-4 space-y-3">
          <span className="text-[9px] uppercase tracking-wider text-white/30 font-mono font-bold block">System Signal Triggers</span>
          <div className="flex flex-col gap-2">
            {signals.map((sig, idx) => (
              <button
                key={idx}
                onClick={() => triggerEvent(sig.eventType, sig.extra)}
                className="w-full text-left font-mono text-[10px] px-3 py-2 border border-cyan-500/15 bg-cyan-500/5 hover:border-cyan-500/30 text-cyan-300 hover:text-cyan-200 rounded-lg hover:scale-[1.01] active:scale-[0.99] transition-all duration-200"
              >
                {sig.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Global Reset */}
      <div className="border-t border-white/5 pt-4 flex gap-3">
        <button
          onClick={() => triggerEvent('complete')}
          className="flex-1 rounded-lg border border-white/10 hover:border-white/20 bg-white/[0.02] hover:bg-white/[0.05] py-2.5 text-[10px] font-mono font-bold uppercase tracking-widest text-white/60 hover:text-white transition-all duration-200"
        >
          Reset to Baseline
        </button>
      </div>
    </div>
  );
}

function PanelContent({ tab, data, iframeRef }: { tab: TabId; data: MissionData; iframeRef?: React.RefObject<HTMLIFrameElement | null> }) {
  const content = (() => {
    switch (tab) {
      case 'overview': return <CommandDeckOverview data={data} />;
      case 'evolution': return <SelfEvolutionLens data={data} />;
      case 'graph': return <LiveSystemMap data={data} />;
      case 'harness': return <AutonomousHarnessPanel data={data} />;
      case 'agents': return <AgentRosterPanel data={data} />;
      case 'tower': return <TowerPanel data={data} />;
      case 'swarm': return <SwarmPanel data={data} />;
      case 'pipeline': return <PipelinePanel data={data} />;
      case 'timeline': return <EventTimelinePanel data={data} />;
      case 'sampler': return <SamplerPanel />;
      case 'gatekeeper': return <GatekeeperPanel data={data} />;
      case 'cognitive': return <CognitivePanel />;
      case 'command': return <CommandPanel data={data} />;
      case 'logs': return <LogStreamPanel data={data} />;
      case 'mochi': return <MochiNarrator data={data} />;
      case 'dream': return <DreamControlPanel iframeRef={iframeRef || { current: null }} />;
      case 'abliterator': return <AbliteratorPanel />;
      default: return <OverviewPanel data={data} />;
    }
  })();

  if (tab === 'overview' || tab === 'evolution' || tab === 'graph' || tab === 'harness' || tab === 'logs' || tab === 'command' || tab === 'sampler' || tab === 'dream' || tab === 'abliterator') return content;

  return (
    <div className="grid h-full grid-cols-12 gap-3 p-3 overflow-y-auto">
      <div className="col-span-12 xl:col-span-8 min-h-[420px] xl:min-h-0 overflow-hidden rounded-2xl border border-white/5 bg-black/15">
        {content}
      </div>
      <div className="col-span-12 xl:col-span-4 min-h-[360px] xl:min-h-0 overflow-hidden rounded-2xl border border-cyan-300/10 bg-black/35">
        <TabVisualizer tab={tab} data={data} />
      </div>
    </div>
  );
}

// â”€â”€ Sub-panels â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function getUniqueAgents(agents: MissionData['agents']) {
  const map = new Map<string, MissionData['agents'][number]>();
  for (const agent of agents) {
    const key = agent.name.toLowerCase();
    const existing = map.get(key);
    if (!existing || agent.status === 'working') map.set(key, agent);
  }
  return Array.from(map.values());
}

function TabVisualizer({ tab, data }: { tab: TabId; data: MissionData }) {
  const [pointer, setPointer] = useState({ x: 0, y: 0 });
  const agents = getUniqueAgents(data.agents);
  const active = agents.filter(agent => agent.status === 'working').length;
  const errors = agents.filter(agent => agent.status === 'error').length;
  const serviceCounts = serviceCountLabel(data.services);
  const workflows = (data.pipeline?.active?.length || 0) + (data.pipeline?.queue?.depth || 0);
  const recentLogs = data.logs.slice(0, 36);
  const seed = tab.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const palette: Record<string, string[]> = {
    agents: ['#22d3ee', '#34d399', '#a78bfa'],
    tower: ['#38bdf8', '#fbbf24', '#34d399'],
    swarm: ['#f472b6', '#22d3ee', '#fb923c'],
    pipeline: ['#a78bfa', '#60a5fa', '#34d399'],
    timeline: ['#60a5fa', '#f472b6', '#fbbf24'],
    gatekeeper: ['#34d399', '#fb7185', '#fbbf24'],
    cognitive: ['#22d3ee', '#c084fc', '#f472b6'],
    command: ['#34d399', '#22d3ee', '#fb923c'],
  };
  const colors = palette[tab] || ['#22d3ee', '#a78bfa', '#34d399'];
  const intensity = Math.min(1, (active + workflows + recentLogs.length / 8 + serviceCounts.online / 2) / 18);
  const volumeNodes = [
    ...agents.slice(0, 44).map((agent, i) => ({ kind: 'agent', label: agent.name, status: agent.status, index: i })),
    ...(data.pipeline?.active || []).slice(0, 12).map((workflow, i) => ({ kind: 'job', label: workflow.intent || workflow.id, status: workflow.status, index: i + 50 })),
    ...data.services.slice(0, 12).map((service, i) => ({ kind: 'service', label: service.name, status: service.status, index: i + 80 })),
    ...recentLogs.slice(0, 28).map((log, i) => ({ kind: 'event', label: log.message, status: log.type, index: i + 110 })),
  ];
  const rotateX = pointer.y * -13;
  const rotateY = pointer.x * 18;

  const handleMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setPointer({
      x: ((event.clientX - rect.left) / rect.width - 0.5) * 2,
      y: ((event.clientY - rect.top) / rect.height - 0.5) * 2,
    });
  };

  return (
    <div
      className="relative h-full min-h-[360px] overflow-hidden cursor-crosshair"
      onMouseMove={handleMove}
      onMouseLeave={() => setPointer({ x: 0, y: 0 })}
    >
      <div className="absolute inset-0 opacity-50" style={{ background: `radial-gradient(circle at 50% 42%, ${colors[0]}33, transparent 36%), radial-gradient(circle at 24% 72%, ${colors[1]}22, transparent 28%)` }} />
      <div className="absolute inset-0 opacity-[0.08]" style={{ background: 'repeating-linear-gradient(90deg, transparent 0 18px, rgba(255,255,255,0.55) 19px 20px)' }} />
      <div className="relative z-10 flex h-full flex-col p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[9px] uppercase tracking-[0.3em] text-white/35 font-mono">live visualizer</div>
            <div className="mt-1 text-xl font-black uppercase tracking-[0.18em] text-white/90">{tab}</div>
            <div className="mt-0.5 text-[9px] font-mono text-white/30" title="when this data was last fetched from the API">
              ↻ {data.fetchedAt ? new Date(data.fetchedAt).toLocaleTimeString('en-US', { hour12: false }) : 'live'} · {data.apiConnected ? (data.source || 'unified_api') : 'api offline'}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-mono text-white/45">
              {(intensity * 100).toFixed(0)}% signal
            </div>
            <div className="text-[8px] font-mono text-white/25" title="active = kernel jobs in flight right now">
              active: {active} · jobs: {data.kernelJobs.filter(j => j.state && !['completed', 'failed', 'done', 'aborted'].includes(String(j.state).toLowerCase())).length} · events: {data.logs.length}{data.logs[0]?.timestamp ? ` · latest ${data.logs[0].timestamp}` : ''}
            </div>
          </div>
        </div>

        <div className="relative mt-5 flex-1 [perspective:920px]">
          <div
            className="absolute inset-0 [transform-style:preserve-3d] transition-transform duration-150 ease-out"
            style={{ transform: `rotateX(${rotateX}deg) rotateY(${rotateY}deg)` }}
          >
            {[0, 1, 2].map(layer => (
              <div
                key={layer}
                className="absolute left-1/2 top-1/2 rounded-full border border-white/10"
                style={{
                  width: `${180 + layer * 72}px`,
                  height: `${180 + layer * 72}px`,
                  transform: `translate(-50%, -50%) translateZ(${-90 + layer * 90}px) rotateX(68deg)`,
                  boxShadow: `0 0 ${24 + layer * 18}px ${colors[layer % colors.length]}22`,
                }}
              />
            ))}

            <div
              className="absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full border flex items-center justify-center text-center transition-all duration-300"
              style={{
                borderColor: `${colors[0]}66`,
                boxShadow: `0 0 ${50 + intensity * 60}px ${colors[0]}44`,
                transform: 'translate(-50%, -50%) translateZ(80px)',
              }}
            >
              <div>
                <div className="text-3xl font-black font-mono" style={{ color: colors[0] }}>{tab === 'pipeline' ? workflows : tab === 'gatekeeper' ? errors : active}</div>
                <div className="text-[9px] uppercase tracking-wider text-white/35 font-mono">{tab === 'pipeline' ? 'flow' : tab === 'gatekeeper' ? 'flags' : 'active'}</div>
              </div>
            </div>

            {volumeNodes.slice(0, 96).map((node, i) => {
              const angle = ((Math.PI * 2) / 19) * i + seed * 0.015;
              const band = i % 4;
              const radius = 70 + band * 38 + intensity * 24;
              const x = Math.cos(angle) * radius;
              const y = Math.sin(angle * 1.7) * (54 + band * 14);
              const z = Math.sin(angle) * radius;
              const color = node.kind === 'service'
                ? (node.status === 'online' ? '#34d399' : '#fb7185')
                : node.kind === 'job'
                  ? colors[1]
                  : node.kind === 'event'
                    ? colors[2]
                    : (node.status === 'working' ? '#34d399' : colors[0]);
              const size = node.kind === 'agent' ? 9 : node.kind === 'job' ? 11 : node.kind === 'service' ? 8 : 5;
              return (
                <span
                  key={`${node.kind}-${node.index}`}
                  title={`${node.kind}: ${node.label}`}
                  className="absolute left-1/2 top-1/2 rounded-full border border-white/10"
                  style={{
                    width: size,
                    height: size,
                    transform: `translate3d(${x}px, ${y}px, ${z}px)`,
                    backgroundColor: color,
                    opacity: node.kind === 'event' ? 0.42 + intensity * 0.34 : 0.58 + intensity * 0.36,
                    boxShadow: `0 0 ${10 + intensity * 22}px ${color}`,
                  }}
                />
              );
            })}
          </div>

          <div className="absolute inset-x-3 bottom-2 flex h-20 items-end gap-1">
            {(() => {
              // REAL waveform: 32 time-buckets over the last ~5 minutes,
              // height = number of events in that bucket. No sine, no fake
              // baseline. Empty buckets are short (not tall).
              const now = Date.now();
              const WINDOW_MS = 5 * 60_000;     // 5 min
              const BUCKETS = 32;
              const bucketMs = WINDOW_MS / BUCKETS;
              const heights = new Array(BUCKETS).fill(0);
              for (const log of data.logs) {
                const age = now - new Date(log.ts).getTime();
                if (age < 0 || age > WINDOW_MS) continue;
                const idx = Math.min(BUCKETS - 1, Math.floor((WINDOW_MS - age) / bucketMs));
                heights[idx] += 1;
              }
              const maxH = Math.max(1, ...heights);
              return heights.map((count, i) => {
                // Quiet baseline (4%) only when truly empty; otherwise real
                // count drives height. No sine.
                const h = count === 0 ? 4 : Math.min(100, 8 + (count / maxH) * 88);
                const isRecent = i >= BUCKETS - 8;
                const color = isRecent
                  ? (count > 0 ? colors[1] : 'rgba(255,255,255,0.06)')
                  : (count > 0 ? colors[0] : 'rgba(255,255,255,0.04)');
                return (
                  <span
                    key={i}
                    title={`${count} event(s) in this 9-second bucket`}
                    className="flex-1 rounded-t-sm transition-all duration-300"
                    style={{ height: `${h}%`, backgroundColor: color, opacity: count > 0 ? 0.85 : 0.3 }}
                  />
                );
              });
            })()}
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2 border-t border-white/10 pt-3">
          <VisualizerStat label="agents" value={agents.length} color={colors[0]} />
          <VisualizerStat label="jobs" value={workflows} color={colors[1]} />
          <VisualizerStat label="events" value={data.logs.length} color={colors[2]} />
          <VisualizerStat label="online" value={`${serviceCounts.online}/${serviceCounts.total}`} color="#34d399" />
        </div>
      </div>
    </div>
  );
}

function VisualizerStat({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.035] px-2 py-2 text-center">
      <div className="text-sm font-black font-mono" style={{ color }}>{value}</div>
      <div className="mt-1 text-[8px] uppercase tracking-wider text-white/30 font-mono">{label}</div>
    </div>
  );
}

function MiniProof({ label, value, tone }: { label: string; value: string | number; tone: 'good' | 'bad' | 'live' | 'neutral' }) {
  const toneClass = tone === 'good'
    ? 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100'
    : tone === 'bad'
      ? 'border-rose-300/20 bg-rose-300/10 text-rose-100'
      : tone === 'live'
        ? 'border-cyan-300/20 bg-cyan-300/10 text-cyan-100'
        : 'border-white/10 bg-black/25 text-white/65';
  return (
    <div className={`rounded-lg border px-2 py-1.5 ${toneClass}`}>
      <div className="truncate text-[8px] uppercase tracking-[0.18em] text-white/35 font-mono">{label}</div>
      <div className="mt-0.5 truncate text-[11px] font-mono">{value}</div>
    </div>
  );
}

function ProjectKnowledgeGraph({ data }: { data: MissionData }) {
  const [pointer, setPointer] = useState({ x: 0, y: 0 });
  const [selected, setSelected] = useState<{ label: string; kind: string; detail: string; color: string } | null>(null);
  const agents = getUniqueAgents(data.agents);
  const divisions = [...new Set(agents.map(agent => agent.division || 'UNASSIGNED'))];
  const workflows = [...(data.pipeline?.active || []), ...(data.pipeline?.completed || []).slice(0, 8)];
  const services = data.services;
  const logs = data.logs.slice(0, 24);
  const nodes: Array<{ id: string; label: string; kind: string; detail: string; color: string; x: number; y: number; z: number; size: number }> = [
    { id: 'core', label: 'PURPCLAW', kind: 'core', detail: 'mission control root', color: '#22d3ee', x: 0, y: 0, z: 90, size: 88 },
    ...services.map((service, i) => {
      const angle = (Math.PI * 2 * i) / Math.max(services.length, 1);
      return {
        id: `service-${service.key || service.name}`,
        label: service.name,
        kind: 'service',
        detail: `:${service.port} ${service.status}`,
        color: service.status === 'online' ? '#34d399' : service.status === 'degraded' ? '#fbbf24' : '#fb7185',
        x: Math.cos(angle) * 260,
        y: Math.sin(angle) * 120 - 130,
        z: Math.sin(angle) * 160,
        size: 34,
      };
    }),
    ...divisions.map((division, i) => {
      const angle = (Math.PI * 2 * i) / Math.max(divisions.length, 1) + 0.4;
      const count = agents.filter(agent => agent.division === division).length;
      return {
        id: `division-${division}`,
        label: division,
        kind: 'division',
        detail: `${count} agents`,
        color: '#a78bfa',
        x: Math.cos(angle) * 310,
        y: Math.sin(angle) * 150 + 50,
        z: Math.sin(angle * 1.3) * 190,
        size: 42,
      };
    }),
    ...agents.slice(0, 44).map((agent, i) => {
      const angle = (Math.PI * 2 * i) / Math.max(agents.length, 1);
      const ring = 370 + (i % 4) * 28;
      return {
        id: `agent-${agent.name}`,
        label: agent.name,
        kind: 'agent',
        detail: `${agent.division} / ${agent.role || 'agent'} / ${agent.status}`,
        color: agent.status === 'working' ? '#34d399' : agent.status === 'error' ? '#fb7185' : '#38bdf8',
        x: Math.cos(angle) * ring,
        y: Math.sin(angle * 1.8) * 190 + 120,
        z: Math.sin(angle) * 260,
        size: agent.status === 'working' ? 24 : 18,
      };
    }),
    ...workflows.slice(0, 16).map((workflow, i) => ({
      id: `workflow-${workflow.id || i}`,
      label: workflow.intent || workflow.id || `workflow-${i}`,
      kind: 'workflow',
      detail: workflow.status || 'queued',
      color: workflow.status === 'completed' ? '#34d399' : workflow.status === 'failed' ? '#fb7185' : '#fbbf24',
      x: -360 + (i % 4) * 110,
      y: -40 + Math.floor(i / 4) * 70,
      z: 260 - (i % 5) * 90,
      size: 22,
    })),
    ...logs.slice(0, 24).map((log, i) => ({
      id: `log-${log.id || i}`,
      label: log.source || log.type || 'event',
      kind: 'event',
      detail: log.message,
      color: log.type?.toLowerCase().includes('error') ? '#fb7185' : '#60a5fa',
      x: 360 - (i % 6) * 78,
      y: -220 + Math.floor(i / 6) * 58,
      z: -240 + (i % 4) * 90,
      size: 12,
    })),
  ];

  const handleMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setPointer({
      x: ((event.clientX - rect.left) / rect.width - 0.5) * 2,
      y: ((event.clientY - rect.top) / rect.height - 0.5) * 2,
    });
  };

  return (
    <div
      className="relative h-full min-h-[620px] overflow-hidden bg-black/35"
      onMouseMove={handleMove}
      onMouseLeave={() => setPointer({ x: 0, y: 0 })}
    >
      <div className="absolute inset-0 opacity-60" style={{ background: 'radial-gradient(circle at 50% 48%, rgba(34,211,238,0.22), transparent 34%), radial-gradient(circle at 18% 80%, rgba(167,139,250,0.18), transparent 28%)' }} />
      <div className="absolute left-5 top-5 z-20">
        <div className="text-[9px] uppercase tracking-[0.35em] text-cyan-300/45 font-mono">relative mapped knowledge graph</div>
        <div className="mt-1 text-2xl font-black uppercase tracking-[0.18em] text-white/90">Project Graph</div>
        <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-mono text-white/35">
          <span>{agents.length} agents</span>
          <span>{divisions.length} divisions</span>
          <span>{services.length} services</span>
          <span>{workflows.length} workflows</span>
          <span>{data.logs.length} events</span>
        </div>
      </div>
      <div className="absolute right-5 top-5 z-20 max-w-xs rounded-2xl border border-white/10 bg-black/55 p-4 backdrop-blur-xl">
        {selected ? (
          <>
            <div className="text-[9px] uppercase tracking-[0.24em] font-mono" style={{ color: selected.color }}>{selected.kind}</div>
            <div className="mt-1 text-lg font-black text-white">{selected.label}</div>
            <div className="mt-2 text-xs text-white/55">{selected.detail}</div>
          </>
        ) : (
          <div className="text-xs text-white/40 font-mono">Hover or click graph nodes to inspect project relationships.</div>
        )}
      </div>
      <div className="absolute inset-0 [perspective:1150px]">
        <div
          className="absolute left-1/2 top-1/2 [transform-style:preserve-3d] transition-transform duration-150 ease-out"
          style={{ transform: `rotateX(${pointer.y * -18}deg) rotateY(${pointer.x * 26}deg) translateZ(0px)` }}
        >
          {[0, 1, 2, 3].map(layer => (
            <div
              key={layer}
              className="absolute left-0 top-0 rounded-full border border-white/10"
              style={{
                width: 360 + layer * 180,
                height: 360 + layer * 180,
                transform: `translate(-50%, -50%) translateZ(${-280 + layer * 170}px) rotateX(68deg)`,
                boxShadow: `0 0 ${30 + layer * 18}px rgba(34,211,238,0.12)`,
              }}
            />
          ))}
          {nodes.map(node => (
            <button
              key={node.id}
              onMouseEnter={() => setSelected({ label: node.label, kind: node.kind, detail: node.detail, color: node.color })}
              onClick={() => setSelected({ label: node.label, kind: node.kind, detail: node.detail, color: node.color })}
              className="absolute left-0 top-0 rounded-full border border-white/15 bg-black/80 text-[9px] font-mono text-white/75 transition-transform hover:scale-125"
              style={{
                width: node.size,
                height: node.size,
                transform: `translate3d(${node.x}px, ${node.y}px, ${node.z}px) translate(-50%, -50%)`,
                backgroundColor: node.kind === 'core' ? `${node.color}22` : node.color,
                boxShadow: `0 0 ${node.kind === 'core' ? 80 : 22}px ${node.color}88`,
              }}
              title={`${node.kind}: ${node.label}`}
            >
              {node.kind === 'core' ? 'PC' : ''}
            </button>
          ))}
        </div>
      </div>
      <div className="absolute bottom-4 left-4 right-4 z-20 grid grid-cols-2 md:grid-cols-5 gap-2">
        <VisualizerStat label="agents" value={agents.length} color="#22d3ee" />
        <VisualizerStat label="services" value={`${serviceCountLabel(services).online}/${serviceCountLabel(services).total}`} color="#34d399" />
        <VisualizerStat label="flows" value={workflows.length} color="#fbbf24" />
        <VisualizerStat label="events" value={data.logs.length} color="#60a5fa" />
        <VisualizerStat label="companions" value={COMPANION_SPECIES.length} color="#f472b6" />
      </div>
    </div>
  );
}

function CommandComposerDock({ data }: { data: MissionData }) {
  const [mode, setMode] = useState<CommandMode>('orchestrate');
  const [text, setText] = useState('');
  const [selectedAgent, setSelectedAgent] = useState('');
  const [busy, setBusy] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [delegateFromChat, setDelegateFromChat] = useState(true);
  const [history, setHistory] = useState<DispatchHistoryItem[]>([]);
  const latestResearchJob = data.researchStatus?.latest || data.kernelJobs.find(job => job.route === 'deep-research-group') || null;

  const agentOptions = data.agents
    .filter((agent, index, arr) => arr.findIndex(a => a.name === agent.name) === index)
    .sort((a, b) => a.name.localeCompare(b.name));

  const modeConfig: Record<CommandMode, { label: string; endpoint: string; hint: string; action: string }> = {
    chat: { label: 'Chat', endpoint: ':7780/api/chat', hint: 'Ask the stack without forcing a full mission', action: 'Send Chat' },
    tower: { label: 'Agent', endpoint: ':7790/api/spawn', hint: 'Assign one selected tower agent directly', action: 'Send Agent' },
    kernel: { label: 'Swarm', endpoint: '/api/kernel/jobs', hint: 'Start a canonical API job and hand it to the swarm coordinator', action: 'Send Swarm' },
    orchestrate: { label: 'Mission', endpoint: ':7784/api/orchestrate', hint: 'Plan, route, execute, and verify a full mission', action: 'Launch' },
    research: { label: 'Research', endpoint: ':7780/api/research/group', hint: 'Run source-backed OpenRouter deep research through the kernel', action: 'Research' },
    groupchat: { label: 'Group Chat', endpoint: ':7780/api/research/group', hint: 'Ask the OpenRouter model room and archive the group answer as a kernel job', action: 'Ask Group' },
    api: { label: 'Raw API', endpoint: ':7780/api/command', hint: 'Send a low-level command through the gateway', action: 'Send API' },
  };

  const postJson = async (url: string, body: Record<string, any>) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    let payload: any = {};
    try { payload = await res.json(); } catch {}
    return { res, payload };
  };

  const fetchWorkflowDetail = async (workflowId: string) => {
    const paths = [
      serviceProxyUrl(7784, `/api/workflow/${workflowId}`),
    ];
    for (const path of paths) {
      try {
        const detailRes = await fetch(path);
        if (!detailRes.ok) continue;
        const payload = await detailRes.json();
        return payload.data || payload;
      } catch {}
    }
    return null;
  };

  const submit = async () => {
    const command = text.trim();
    if (!command || busy) return;
    if (mode === 'tower' && !selectedAgent) {
      setHistory(prev => [{ mode, text: command, status: 'select an agent' }, ...prev.slice(0, 4)]);
      return;
    }
    setBusy(true);
    try {
      let url = serviceProxyUrl(7780, '/api/chat');
      let body: Record<string, any> = { message: command, spawnAgents: delegateFromChat };
      let payload: any = {};
      let res: Response;
      if (mode === 'api') {
        url = serviceProxyUrl(7780, '/api/command');
        body = { text: command };
      } else if (mode === 'kernel') {
        url = '/api/kernel/jobs';
        body = { goal: command, route: 'swarm-coordinator', source: 'mission-control-ui' };
      } else if (mode === 'orchestrate') {
        url = serviceProxyUrl(7784, '/api/orchestrate');
        body = { command, text: command, source: 'mission-control' };
      } else if (mode === 'tower') {
        url = serviceProxyUrl(7790, '/api/spawn');
        body = { agentName: selectedAgent, task: command, options: { source: 'mission-control-ui' } };
      } else if (mode === 'research') {
        url = serviceProxyUrl(7780, '/api/research/group');
        body = { query: command, kernelJob: true, depth: 2, model_count: 24, source: 'mission-control-ui' };
      } else if (mode === 'groupchat') {
        url = serviceProxyUrl(7780, '/api/research/group');
        body = { query: command, kernelJob: true, depth: 1, model_count: 8, source: 'mission-control-group-chat', tags: ['group-chat'] };
      }

      ({ res, payload } = await postJson(url, body));
      payload = payload.data || payload;
      let workflow = payload.workflow || null;
      const workflowId = payload.workflowId || workflow?.id || null;
      if (res.ok && workflowId && !workflow) {
        workflow = await fetchWorkflowDetail(workflowId);
      }
      const delegation = workflow?.delegation;
      const delegationLabel = delegation?.mode === 'team'
        ? `team ${delegation.leader || 'leader'} + ${(delegation.members || []).length}`
        : delegation?.selectedAgent
          ? `agent ${delegation.selectedAgent}`
          : null;
      setHistory(prev => [{
        mode,
        text: command,
        status: res.ok ? (payload.job?.id ? `${payload.job.state || 'queued'} ${String(payload.job.id).slice(-6)}` : workflowId ? `${workflow?.status || 'delegated'} ${String(workflowId).slice(-6)}` : (payload.providerStatus || payload.status || payload.message || (payload.success !== false ? 'sent' : 'accepted'))) : (payload.error || `failed ${res.status}`),
        reply: payload.reply || payload.result || payload.note || payload.synthesis || (payload.job ? `${payload.job.route} via Unified API kernel` : undefined) || (payload.memberCount ? `${payload.successCount}/${payload.memberCount} research models answered` : undefined),
        workflowId,
        workflow: workflow ? { ...workflow, delegationLabel } : null,
      }, ...prev.slice(0, 4)]);
      if (res.ok) setText('');
    } catch (e: any) {
      setHistory(prev => [{ mode, text: command, status: e?.message || 'connection failed' }, ...prev.slice(0, 4)]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="relative z-10 shrink-0 border-b border-cyan-300/10 bg-black/45 backdrop-blur-2xl px-3 py-2">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="text-[8px] uppercase tracking-[0.26em] text-cyan-300/45 font-mono whitespace-nowrap">mission command spine</div>
          <div className="hidden md:block h-px w-16 bg-cyan-300/20" />
          <div className="truncate text-[9px] font-mono text-white/30">{modeConfig[mode].hint}</div>
        </div>
        <button onClick={() => setCollapsed(!collapsed)} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1 text-[9px] font-mono uppercase tracking-wider text-white/40 hover:text-cyan-200">
          {collapsed ? 'Open Dock' : 'Compact'}
        </button>
      </div>
      <div className={`grid grid-cols-12 gap-2 items-stretch ${collapsed ? 'hidden' : ''}`}>
        <div className="col-span-12 xl:col-span-2 rounded-xl border border-white/10 bg-white/[0.03] p-2">
          <div className="text-[8px] uppercase tracking-[0.22em] text-white/32 font-mono">selected route</div>
          <div className="mt-2 rounded-lg border border-cyan-300/20 bg-cyan-300/10 px-2 py-2">
            <div className="text-[10px] uppercase tracking-[0.18em] text-cyan-100 font-mono">{modeConfig[mode].label}</div>
            <div className="mt-1 truncate text-[9px] text-white/28 font-mono">{modeConfig[mode].endpoint}</div>
          </div>
          <div className="mt-2 rounded-lg border border-white/10 bg-black/25 px-2 py-2 text-[10px] leading-4 text-white/35">
            {modeConfig[mode].hint}
          </div>
        </div>
        <div className="col-span-12 xl:col-span-8 rounded-xl border border-cyan-300/15 bg-[#031018]/80 p-2.5 shadow-[0_0_40px_rgba(34,211,238,0.08)]">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-cyan-200">{modeConfig[mode].label}</span>
            <span className="text-[9px] font-mono text-white/25">{modeConfig[mode].endpoint}</span>
            {mode === 'chat' && (
              <label className="ml-auto flex items-center gap-2 text-[9px] uppercase tracking-wider text-white/35 font-mono">
                <input type="checkbox" checked={delegateFromChat} onChange={e => setDelegateFromChat(e.target.checked)} className="accent-cyan-300" />
                delegate jobs
              </label>
            )}
            {(mode === 'research' || mode === 'groupchat') && (
              <div className="ml-auto flex flex-wrap items-center justify-end gap-2 text-[9px] font-mono">
                <span className={`rounded border px-2 py-1 ${data.researchStatus?.hasKey ? 'border-emerald-300/25 bg-emerald-300/10 text-emerald-200' : 'border-amber-300/25 bg-amber-300/10 text-amber-200'}`}>
                  OpenRouter {data.researchStatus?.hasKey ? data.researchStatus.keySource || 'keyed' : 'missing key'}
                </span>
                <span className="rounded border border-cyan-300/20 bg-cyan-300/10 px-2 py-1 text-cyan-200">
                  {data.researchStatus?.active || 0} active
                </span>
              </div>
            )}
          </div>
          {(mode === 'research' || mode === 'groupchat') && latestResearchJob && (
            <div className="mb-2 grid gap-2 md:grid-cols-4">
              <MiniProof label="latest" value={latestResearchJob.state} tone={latestResearchJob.state === 'failed' ? 'bad' : latestResearchJob.state === 'completed' ? 'good' : 'live'} />
              <MiniProof label="models" value={latestResearchJob.researchRun ? `${latestResearchJob.researchRun.successCount || 0}/${latestResearchJob.researchRun.memberCount || 0}` : 'queued'} tone="live" />
              <MiniProof label="free" value={latestResearchJob.researchRun?.freeModelCount ?? 'n/a'} tone="neutral" />
              <MiniProof label="sources" value={latestResearchJob.researchRun?.sourceCount ?? 'n/a'} tone="neutral" />
            </div>
          )}
          <div className="flex flex-col md:flex-row gap-2">
            <select
              value={mode}
              onChange={event => setMode(event.target.value as CommandMode)}
              className="w-full md:w-40 rounded-lg border border-cyan-300/15 bg-black/70 px-2 py-2 text-[11px] font-mono text-cyan-100 outline-none focus:border-cyan-300/45"
              aria-label="Select chat route"
            >
              {(Object.keys(modeConfig) as CommandMode[]).map(key => (
                <option key={key} value={key}>{modeConfig[key].label}</option>
              ))}
            </select>
            {mode === 'tower' && (
              <select value={selectedAgent} onChange={e => setSelectedAgent(e.target.value)}
                className="w-full md:w-44 rounded-lg border border-white/10 bg-black/70 px-2 py-2 text-[11px] text-white/70 font-mono outline-none">
                <option value="">Select agent</option>
                {agentOptions.map(agent => <option key={agent.name} value={agent.name}>{agent.name}</option>)}
              </select>
            )}
            <textarea value={text} onChange={e => setText(e.target.value)}
              onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') submit(); }}
              placeholder="Describe the job PURPCLAW should complete end to end..."
              className="min-h-11 max-h-24 flex-1 resize-y rounded-lg border border-cyan-300/15 bg-black/60 px-3 py-2 text-sm text-white/80 placeholder:text-white/20 outline-none focus:border-cyan-300/45"
            />
            <button onClick={submit} disabled={busy || !text.trim()}
              className="w-full md:w-24 rounded-lg border border-emerald-300/30 bg-emerald-300/12 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-200 disabled:opacity-35 hover:bg-emerald-300/20">
              {busy ? 'Sending' : modeConfig[mode].action}
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {[
              { mode: 'kernel' as CommandMode, text: 'Start a canonical API harness job that audits provider routing, tool access, job status, and verification gaps.' },
              { mode: 'research' as CommandMode, text: 'Run deep research on the best self-hosted AI agent stack patterns and summarize implementation risks.' },
              { mode: 'groupchat' as CommandMode, text: 'Ask the model room to compare PURPCLAW against Odysseus and surface the strongest next build move.' },
              { mode: 'orchestrate' as CommandMode, text: 'Analyze this codebase with No Spaghett, then route cleanup work to the right agents.' },
              { mode: 'chat' as CommandMode, text: 'Explain current mission state and blockers. Do not edit.' },
            ].map(chip => (
              <button key={chip.text} onClick={() => { setMode(chip.mode); setText(chip.text); }} className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[9px] font-mono text-white/35 hover:text-cyan-200 hover:border-cyan-300/30">
                {chip.text}
              </button>
            ))}
          </div>
        </div>
        <div className="col-span-12 xl:col-span-2 rounded-xl border border-white/10 bg-white/[0.03] p-2.5 overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[9px] uppercase tracking-[0.22em] text-white/35 font-mono">dispatch trace</span>
            <span className="text-[9px] text-white/25 font-mono">{history.length} recent</span>
          </div>
          <div className="mt-2 max-h-32 space-y-1.5 overflow-y-auto pr-1">
            {history.length === 0 ? (
              <div className="text-[10px] text-white/25 font-mono">No dispatches from this console yet.</div>
            ) : history.map((item, i) => (
              <div key={i} className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5">
                <div className="flex items-center gap-2 text-[9px] font-mono uppercase tracking-wider">
                  <span className="text-cyan-300/70">{item.mode}</span>
                  <span className="text-emerald-300/70">{item.status}</span>
                </div>
                <div className="truncate text-[10px] text-white/45 font-mono">{item.text}</div>
                {item.workflowId && <div className="mt-1 text-[9px] font-mono text-emerald-300/70">workflow {item.workflowId}</div>}
                {item.workflow?.delegationLabel && <div className="mt-1 text-[9px] font-mono text-amber-200/70">delegated to {item.workflow.delegationLabel}</div>}
                {!!item.workflow?.trace?.length && (
                  <div className="mt-2 space-y-1">
                    {item.workflow.trace.slice(0, 5).map((step, stepIndex) => (
                      <div key={`${step.stage}-${stepIndex}`} className="grid grid-cols-[54px_1fr] gap-2 text-[9px] font-mono">
                        <span className={step.status === 'failed' ? 'text-rose-300/80' : step.status === 'started' ? 'text-cyan-300/70' : 'text-emerald-300/70'}>{step.stage}</span>
                        <span className="truncate text-white/38">{step.detail}</span>
                      </div>
                    ))}
                  </div>
                )}
                {item.reply && <div className="mt-1 line-clamp-3 text-[10px] leading-4 text-cyan-100/70">{item.reply}</div>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function CommandDeckOverview({ data }: { data: MissionData }) {
  const uniqueAgents = getUniqueAgents(data.agents);
  const serviceCounts = serviceCountLabel(data.services);
  const working = uniqueAgents.filter(a => a.status === 'working').length;

  return (
    <div className="h-full overflow-y-auto p-3 grid grid-cols-12 auto-rows-auto gap-3">
      <CommandCoreHero data={data} />

      <section className="col-span-12 xl:col-span-7 min-h-[clamp(440px,58vh,720px)] rounded-2xl border border-cyan-300/10 bg-black/35 relative overflow-hidden command-panel">
        <SectionHeader eyebrow="mission lens" title="Swarm Constellation" value={`${working} active`} />
        <AgentConstellation data={data} />
      </section>

      <section className="col-span-12 xl:col-span-5 min-h-[clamp(440px,58vh,720px)] grid grid-rows-[minmax(0,1fr)_minmax(120px,0.5fr)_minmax(170px,0.55fr)] gap-3">
        <div className="rounded-2xl border border-fuchsia-300/10 bg-black/35 relative overflow-hidden command-panel">
          <SectionHeader eyebrow="routing & delegation" title="Delegation Lens" value={routingValue(data)} />
          <DelegationRoutingLens data={data} />
        </div>
        <div className="rounded-2xl border border-fuchsia-400/20 bg-black/40 relative overflow-hidden command-panel" style={{ boxShadow: '0 0 20px rgba(217,70,239,0.06)' }}>
          <MochiWidget />
        </div>
        <div className="rounded-2xl border border-emerald-300/10 bg-black/35 relative overflow-hidden command-panel">
          <SectionHeader eyebrow="service mesh" title="Endpoint Ribbon" value={serviceCounts.online === serviceCounts.total ? 'clean' : 'degraded'} />
          <ServiceRibbon services={data.services} />
        </div>
      </section>

      <section className="col-span-12 xl:col-span-5 min-h-[210px] rounded-2xl border border-white/10 bg-black/35 relative overflow-hidden command-panel">
        <SectionHeader eyebrow="event telemetry" title="Activity Heatmap" value={`${data.logs.length} events`} />
        <ActivityHeatmap logs={data.logs} />
      </section>

      <section className="col-span-12 xl:col-span-7 min-h-[210px] rounded-2xl border border-white/10 bg-black/35 relative overflow-hidden command-panel">
        <SectionHeader eyebrow="live feed" title="Signal Rail" value={data.eventBusConnected ? 'receiving' : 'offline'} />
        <SignalRail logs={data.logs} />
      </section>

      <section className="col-span-12 xl:col-span-6 min-h-[240px] rounded-2xl border border-cyan-300/10 bg-black/35 relative overflow-hidden command-panel">
        <AgentLeaderboardWidget />
      </section>

      <section className="col-span-12 xl:col-span-6 min-h-[240px] rounded-2xl border border-emerald-300/10 bg-black/35 relative overflow-hidden command-panel">
        <LLMLedgerWidget />
      </section>

      <section className="col-span-12 min-h-[260px] rounded-2xl border border-violet-300/10 bg-black/35 relative overflow-hidden command-panel">
        <HarnessBenchmarkWidget data={data} />
      </section>
    </div>
  );
}

function CommandCoreHero({ data }: { data: MissionData }) {
  const uniqueAgents = getUniqueAgents(data.agents);
  const serviceCounts = serviceCountLabel(data.services);
  const requiredLinks = [
    { label: 'API', ok: data.apiConnected },
    { label: 'TOWER', ok: data.towerConnected },
    { label: 'ORCH', ok: data.orchestratorConnected },
    { label: 'EVENTS', ok: data.eventBusConnected },
  ];
  const readiness = Math.round((
    (serviceCounts.online / Math.max(serviceCounts.total, 1)) * 0.55 +
    (requiredLinks.filter(link => link.ok).length / requiredLinks.length) * 0.35 +
    (data.logs.length ? 0.1 : 0)
  ) * 100);
  const activeAgents = uniqueAgents.filter(agent => agent.status === 'working').length;
  const faultCount = uniqueAgents.filter(agent => agent.status === 'error').length;
  const routeTone = faultCount ? '#fb7185' : readiness > 75 ? '#34d399' : '#fbbf24';
  const recent = data.logs.slice(0, 10);

  return (
    <section className="purpclaw-core col-span-12 min-h-[260px] overflow-hidden rounded-2xl border border-cyan-200/15 bg-black/45 relative">
      <div className="absolute inset-0 core-scan" />
      <div className="absolute inset-0 core-grid" />
      <div className="relative z-10 grid h-full grid-cols-12 gap-4 p-4">
        <div className="col-span-12 xl:col-span-5 flex min-h-[220px] flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded border border-cyan-200/20 bg-cyan-200/10 px-2 py-1 text-[9px] font-mono uppercase tracking-[0.22em] text-cyan-100/70">mission runtime</span>
              <span className="rounded border border-white/10 bg-white/[0.03] px-2 py-1 text-[9px] font-mono uppercase tracking-[0.2em] text-white/35">build green</span>
              <span className="rounded border px-2 py-1 text-[9px] font-mono uppercase tracking-[0.2em]" style={{ borderColor: `${routeTone}44`, color: routeTone }}>readiness {readiness}%</span>
            </div>
            <PurpClawLogo size="hero" className="mt-4" />
            <h1 className="mt-4 text-[clamp(2.4rem,7vw,5.8rem)] font-black leading-[0.82] tracking-normal text-white">
              PURPCLAW
            </h1>
            <div className="mt-3 max-w-2xl text-sm leading-6 text-white/55">
              One mission runtime with a command spine, delegated execution, validation gates, and separate visual lenses for every layer of the process.
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-2">
            <CoreReadout label="services" value={`${serviceCounts.online}/${serviceCounts.total}`} color="#34d399" />
            <CoreReadout label="agents" value={uniqueAgents.length} color="#22d3ee" />
            <CoreReadout label="active" value={activeAgents} color="#fbbf24" />
            <CoreReadout label="faults" value={faultCount} color={faultCount ? '#fb7185' : '#34d399'} />
          </div>
        </div>

        <div className="col-span-12 xl:col-span-4 relative min-h-[220px] rounded-xl border border-white/10 bg-black/30 overflow-hidden">
          <div className="absolute left-1/2 top-1/2 h-56 w-56 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-200/15 core-ring" />
          <div className="absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full border border-fuchsia-200/15 core-ring-slow" />
          <div className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-200/20" style={{ boxShadow: `0 0 42px ${routeTone}55` }} />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div className="font-mono text-5xl font-black leading-none" style={{ color: routeTone, textShadow: `0 0 28px ${routeTone}88` }}>{readiness}</div>
              <div className="mt-2 text-[9px] uppercase tracking-[0.32em] text-white/35 font-mono">core sync</div>
            </div>
          </div>
          {requiredLinks.map((link, i) => {
            const angle = -90 + i * 90;
            const x = 50 + Math.cos(angle * Math.PI / 180) * 38;
            const y = 50 + Math.sin(angle * Math.PI / 180) * 38;
            const color = link.ok ? '#34d399' : '#fb7185';
            return (
              <div key={link.label} className="absolute -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-black/75 px-2 py-1 text-[9px] font-mono" style={{ left: `${x}%`, top: `${y}%`, borderColor: `${color}55`, color }}>
                {link.label}
              </div>
            );
          })}
        </div>

        <div className="col-span-12 xl:col-span-3 flex min-h-[220px] flex-col gap-3">
          <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
            <div className="text-[9px] uppercase tracking-[0.24em] text-white/35 font-mono">routing stack</div>
            <div className="mt-3 space-y-2">
              {requiredLinks.map(link => (
                <div key={link.label} className="flex items-center justify-between gap-3 text-[10px] font-mono">
                  <span className="text-white/45">{link.label}</span>
                  <span className={link.ok ? 'text-emerald-300' : 'text-rose-300'}>{link.ok ? 'linked' : 'offline'}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="min-h-0 flex-1 rounded-xl border border-white/10 bg-white/[0.035] p-3">
            <div className="flex items-center justify-between">
              <div className="text-[9px] uppercase tracking-[0.24em] text-white/35 font-mono">last signals</div>
              <div className="text-[9px] text-white/25 font-mono">{data.logs.length}</div>
            </div>
            <div className="mt-3 space-y-1.5 overflow-hidden">
              {recent.length ? recent.slice(0, 5).map(log => (
                <div key={log.id} className="grid grid-cols-[56px_1fr] gap-2 text-[10px] font-mono">
                  <span className="text-white/25">{log.timestamp}</span>
                  <span className="truncate text-white/55">{log.message}</span>
                </div>
              )) : (
                <div className="flex h-24 items-center justify-center text-[10px] uppercase tracking-[0.2em] text-white/25 font-mono">awaiting telemetry</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// OperatorFlowGuide removed — was static text, not live data

function CoreReadout({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3">
      <div className="font-mono text-2xl font-black leading-none" style={{ color, textShadow: `0 0 18px ${color}66` }}>{value}</div>
      <div className="mt-2 text-[9px] uppercase tracking-[0.18em] text-white/35 font-mono">{label}</div>
    </div>
  );
}

function HoloMetric({ label, value, sub, tone }: { label: string; value: string | number; sub: string; tone: 'cyan' | 'green' | 'amber' | 'red' | 'violet' | 'blue' }) {
  const colors = {
    cyan: '#22d3ee',
    green: '#34d399',
    amber: '#fbbf24',
    red: '#fb7185',
    violet: '#a78bfa',
    blue: '#60a5fa',
  };
  const color = colors[tone];

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3">
      <div className="absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }} />
      <div className="text-[9px] uppercase tracking-[0.22em] text-white/35 font-mono">{label}</div>
      <div className="mt-1 flex items-end justify-between gap-3">
        <div className="text-3xl font-black font-mono leading-none" style={{ color, textShadow: `0 0 22px ${color}66` }}>{value}</div>
        <div className="h-9 w-20 opacity-80"><MiniWave color={color} /></div>
      </div>
      <div className="mt-2 text-[10px] text-white/30 font-mono uppercase tracking-wider">{sub}</div>
    </div>
  );
}

function MiniWave({ color }: { color: string }) {
  return (
    <div className="flex h-full items-end gap-1">
      {Array.from({ length: 12 }).map((_, i) => (
        <span
          key={i}
          className="flex-1 rounded-t"
          style={{
            height: `${25 + Math.abs(Math.sin(i * 0.85)) * 70}%`,
            backgroundColor: color,
            opacity: 0.22 + (i % 4) * 0.13,
            boxShadow: `0 0 10px ${color}66`,
          }}
        />
      ))}
    </div>
  );
}

function SelfEvolutionLens({ data }: { data: MissionData }) {
  return (
    <div className="h-full overflow-y-auto p-3">
      <SelfEvolutionDiagram data={data} />
    </div>
  );
}

function SelfEvolutionDiagram({ data, compact = false }: { data: MissionData; compact?: boolean }) {
  const evo        = (data as any).evolutionStatus;
  const scoredTasks  = data.agentScores?.meta?.totalTasksRecorded || 0;
  const leaderboard  = data.agentScores?.leaderboard || [];
  const llmCalls     = data.llmLedger?.totalCalls || 0;
  const llmCost      = data.llmLedger?.totalCost ? `$${data.llmLedger.totalCost.toFixed(4)}` : '$0';
  const benchRate    = Math.round(((data.harnessBenchmarks as any)?.summary?.completionRate || 0) * 100);
  const recentTicks: any[]  = evo?.recentTicks || [];
  const lastTick: any       = evo?.lastTick || null;
  const tickCount    = evo?.tickCount || 0;
  const isRunning    = evo?.running || false;

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4" style={{ minHeight: compact ? 280 : 600 }}>
      {/* Live loop counters */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Scored Outcomes', value: scoredTasks, color: '#22d3ee', sub: 'real task results' },
          { label: 'LLM Calls', value: llmCalls, color: '#a78bfa', sub: `${llmCost} estimated` },
          { label: 'Research Ticks', value: tickCount, color: '#34d399', sub: isRunning ? '🔄 running now' : lastTick ? `last: ${lastTick.status}` : 'waiting' },
          { label: 'Bench Pass', value: `${benchRate}%`, color: benchRate >= 90 ? '#34d399' : '#fbbf24', sub: 'canonical goals' },
        ].map(m => (
          <div key={m.label} className="rounded-xl border border-white/8 bg-black/40 px-4 py-3">
            <div className="text-[8px] uppercase tracking-[0.25em] font-mono" style={{ color: m.color, opacity: 0.6 }}>{m.label}</div>
            <div className="mt-1 text-2xl font-black" style={{ color: m.color }}>{m.value}</div>
            <div className="mt-0.5 text-[9px] font-mono text-white/30">{m.sub}</div>
          </div>
        ))}
      </div>

      {/* Agent leaderboard — real scores */}
      <div className="rounded-xl border border-white/8 bg-black/40 p-4">
        <div className="text-[8px] uppercase tracking-[0.28em] font-mono text-white/30 mb-3">Agent Leaderboard — Real Outcomes</div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {leaderboard.slice(0, 10).map((entry: any, i: number) => (
            <div key={entry.agent} className={`rounded-lg border px-3 py-2 ${i === 0 ? 'border-cyan-300/30 bg-cyan-300/8' : 'border-white/8 bg-white/[0.02]'}`}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold text-white/80">{entry.agent}</span>
                <span className="text-[8px] font-mono text-emerald-400">{Math.round((entry.successRate || 0) * 100)}%</span>
              </div>
              <div className="mt-1 text-[8px] font-mono text-white/30">{entry.totalTasks || 0} tasks · {entry.score || 0}pts</div>
            </div>
          ))}
          {leaderboard.length === 0 && (
            <div className="col-span-5 text-[10px] font-mono text-white/25">No scored outcomes yet — run a swarm mission to start</div>
          )}
        </div>
      </div>

      {/* Self-research tick history */}
      <div className="rounded-xl border border-white/8 bg-black/40 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[8px] uppercase tracking-[0.28em] font-mono text-white/30">Auto-Research History — OpenRouter → Memory Matrix</div>
          {isRunning && <div className="flex items-center gap-1.5 text-[9px] font-mono text-emerald-400"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />researching now</div>}
        </div>
        {recentTicks.length === 0 ? (
          <div className="text-[10px] font-mono text-white/25">No research ticks yet — first tick fires 90s after boot, then every 30 min</div>
        ) : (
          <div className="space-y-2">
            {recentTicks.slice().reverse().map((tick: any, i: number) => (
              <div key={i} className={`rounded-lg border px-3 py-2 ${tick.status === 'ingested' ? 'border-emerald-300/20 bg-emerald-300/5' : tick.status === 'error' ? 'border-rose-300/20 bg-rose-300/5' : 'border-white/8 bg-white/[0.02]'}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`text-[8px] font-mono uppercase px-1.5 py-0.5 rounded border ${tick.status === 'ingested' ? 'border-emerald-300/25 text-emerald-300' : tick.status === 'error' ? 'border-rose-300/25 text-rose-300' : 'border-white/15 text-white/35'}`}>{tick.status}</span>
                    <span className="text-[9px] font-mono text-white/50 truncate max-w-xs">{tick.topic?.slice(0, 60)}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[8px] font-mono text-white/25 shrink-0">
                    <span>{tick.modelsAnswered} models</span>
                    {tick.memoryIngested && <span className="text-emerald-400">→ memory</span>}
                    <span>{tick.startedAt?.slice(11, 19)}</span>
                  </div>
                </div>
                {tick.synthesis && (
                  <div className="mt-1.5 text-[9px] font-mono text-white/35 line-clamp-2">{tick.synthesis.slice(0, 180)}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function LoopRail({ label, text, tone }: { label: string; text: string; tone: 'green' | 'sky' | 'violet' }) {
  const colors = {
    green: '#34d399',
    sky: '#38bdf8',
    violet: '#a78bfa',
  };
  return (
    <div className="rounded-lg border border-white/10 bg-black/25 p-3">
      <div className="text-[10px] uppercase tracking-[0.22em] font-mono" style={{ color: colors[tone] }}>{label}</div>
      <div className="mt-2 text-xs leading-5 text-white/48">{text}</div>
    </div>
  );
}

function SectionHeader({ eyebrow, title, value }: { eyebrow: string; title: string; value: string }) {
  return (
    <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-3 border-b border-white/5 bg-black/25 backdrop-blur-xl">
      <div>
        <div className="text-[8px] uppercase tracking-[0.3em] text-cyan-300/40 font-mono">{eyebrow}</div>
        <div className="text-sm font-bold tracking-[0.16em] uppercase text-white/80">{title}</div>
      </div>
      <div className="text-[10px] font-mono uppercase tracking-wider text-white/35">{value}</div>
    </div>
  );
}

function AgentConstellation({ data }: { data: MissionData }) {
  const [selected, setSelected] = useState<MissionData['agents'][number] | null>(null);
  const agents = data.agents.length ? data.agents : [
    { id: 'offline-1', name: 'ENGINEERING', emoji: 'E', division: 'ENGINEERING', role: 'standby', tier: 1, status: 'idle' as const },
    { id: 'offline-2', name: 'SECURITY', emoji: 'S', division: 'SECURITY', role: 'standby', tier: 1, status: 'idle' as const },
    { id: 'offline-3', name: 'INTELLIGENCE', emoji: 'I', division: 'INTELLIGENCE', role: 'standby', tier: 1, status: 'idle' as const },
  ];
  const divisionColors: Record<string, string> = {
    INTELLIGENCE: '#fb7185',
    ENGINEERING: '#38bdf8',
    SECURITY: '#34d399',
    INFRASTRUCTURE: '#fbbf24',
    MEDIA_OPS: '#c084fc',
    MANAGEMENT: '#2dd4bf',
    SCIENCE: '#22d3ee',
    CREATIVE: '#f472b6',
    OPERATIONS: '#fb923c',
  };
  const divisions = Object.entries(
    agents.reduce<Record<string, MissionData['agents']>>((acc, agent) => {
      const key = agent.division || 'UNASSIGNED';
      acc[key] = acc[key] || [];
      acc[key].push(agent);
      return acc;
    }, {})
  ).sort(([aName, aList], [bName, bList]) => {
    // Busy divisions first so live work dominates the view, then alphabetical.
    const aActive = aList.filter(x => x.status === 'working').length;
    const bActive = bList.filter(x => x.status === 'working').length;
    if (aActive !== bActive) return bActive - aActive;
    return aName.localeCompare(bName);
  });

  return (
    <div className="absolute inset-x-0 bottom-0 top-14 overflow-y-auto overflow-x-visible p-4">
      <div className="mb-3 flex items-center gap-2 rounded-lg border border-cyan-300/15 bg-cyan-300/[0.04] px-3 py-1.5">
        <span className="text-[11px]">✎</span>
        <span className="text-[10px] font-mono text-cyan-200/70">Click any agent to view & edit its role, division, tier and skills — saved live to the tower.</span>
      </div>
      <div className="grid [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))] gap-3">
        <div className="relative min-h-[168px] overflow-hidden rounded-xl border border-cyan-300/20 bg-cyan-300/10 p-4 shadow-[0_0_38px_rgba(34,211,238,0.12)]">
          <div className="absolute inset-0 opacity-50" style={{ background: 'radial-gradient(circle at 50% 45%, rgba(34,211,238,0.35), transparent 62%)' }} />
          <div className="relative flex h-full flex-col justify-between">
            <div>
              <div className="text-[10px] text-cyan-200/60 font-mono tracking-[0.25em]">CORE</div>
              <div className="mt-1 text-4xl font-black text-white">{data.eventBusConnected ? 'ON' : 'OFF'}</div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-center">
                <div className="text-xl font-black font-mono text-cyan-200">{agents.length}</div>
                <div className="text-[8px] uppercase tracking-wider text-white/35 font-mono">nodes</div>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-center">
                <div className="text-xl font-black font-mono text-emerald-300">{agents.filter(agent => agent.status === 'working').length}</div>
                <div className="text-[8px] uppercase tracking-wider text-white/35 font-mono">active</div>
              </div>
            </div>
          </div>
        </div>
        {divisions.map(([division, list], divisionIndex) => {
          const color = divisionColors[division] || '#94a3b8';
          const active = list.filter(agent => agent.status === 'working').length;
          const errors = list.filter(agent => agent.status === 'error').length;
          const orbit = list.slice(0, 10);
          const overflow = list.length - orbit.length;
          const cardTone = errors ? '#fb7185' : active ? '#34d399' : color;
          const dim = !active && !errors;
          return (
            <div key={division} className="relative min-h-[168px] overflow-visible rounded-xl border bg-white/[0.025] p-3 transition-opacity" style={{ borderColor: `${cardTone}33`, opacity: dim ? 0.55 : 1 }}>
              <div className="absolute inset-0 opacity-25" style={{ background: `radial-gradient(circle at 50% 45%, ${color}22, transparent 68%)` }} />
              <div className="relative flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-[9px] font-mono uppercase tracking-[0.18em]" style={{ color }}>{division}</div>
                  <div className="text-[9px] font-mono text-white/30">{active} active / {list.length} agents</div>
                </div>
                <div className="flex h-8 w-8 items-center justify-center rounded-full border text-[11px] font-black font-mono" style={{ borderColor: `${color}55`, color }}>
                  {list.length}
                </div>
              </div>
              <div className="relative mt-3 h-[clamp(90px,13vh,128px)] rounded-lg border border-white/5 bg-black/25 overflow-visible">
                <div className="absolute left-1/2 top-1/2 h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10 bg-black/80" />
                {orbit.map((agent, i) => {
                  const angle = (Math.PI * 2 * i) / Math.max(orbit.length, 1) - Math.PI / 2;
                  const x = 50 + Math.cos(angle) * 32;
                  const y = 50 + Math.sin(angle) * 32;
                  const agentColor = statusColor(agent.status);
                  return (
                    <button
                      key={agent.id}
                      onClick={() => setSelected(agent)}
                      className="absolute group h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border bg-black/90 flex items-center justify-center text-xs transition-transform hover:scale-125"
                      style={{ left: `${x}%`, top: `${y}%`, borderColor: `${agentColor}77`, boxShadow: `0 0 16px ${agentColor}33` }}
                    >
                      <span className="pointer-events-none">{agent.emoji}</span>
                      <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border border-black" style={{ backgroundColor: agentColor }} />
                      <span className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 hidden w-56 -translate-x-1/2 rounded-lg border border-cyan-300/20 bg-black/95 p-2 text-left shadow-[0_0_28px_rgba(34,211,238,0.18)] group-hover:block">
                        <span className="block text-[10px] font-mono uppercase tracking-wider text-cyan-200">{agent.name}</span>
                        <span className="block text-[10px] text-white/50">{agent.role || 'agent'} / {agent.status}</span>
                        <span className="mt-1 block truncate text-[9px] text-white/35 font-mono">{agent.task || 'Idle. No current task reported.'}</span>
                      </span>
                    </button>
                  );
                })}
                {overflow > 0 && (
                  <div className="absolute bottom-2 right-2 rounded-full border border-white/10 bg-black/80 px-2 py-1 text-[9px] font-mono text-white/40">
                    +{overflow}
                  </div>
                )}
              </div>
              <div className="relative mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full" style={{ width: `${Math.max(6, (active / Math.max(list.length, 1)) * 100)}%`, backgroundColor: cardTone, boxShadow: `0 0 12px ${cardTone}` }} />
              </div>
            </div>
          );
        })}
      </div>
      {selected && <AgentDetailModal agent={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

// Short headline value for the Delegation Lens section header.
function routingValue(data: MissionData): string {
  const lm = data.manifest?.laneMap || null;
  const primary = data.llmStatus?.provider?.provider || lm?.PRIMARY_CHAT?.provider;
  const swarm = data.llmStatus?.swarm?.provider || lm?.SWARM?.provider;
  if (primary && swarm && primary !== swarm) return `${primary} → ${swarm}`;
  if (primary) return primary;
  return data.apiConnected ? 'live' : 'offline';
}

/**
 * DelegationRoutingLens — at-a-glance "who handles what, and on which model".
 * Top: the live model routing chain (primary → swarm → fallback, e.g. MiniMax → OpenRouter).
 * Bottom: active job delegation (stage → leader → members) from the pipeline,
 * falling back to the delegation board lanes when no job is mid-flight.
 */
function DelegationRoutingLens({ data }: { data: MissionData }) {
  const llm = data.llmStatus;
  // Fall back to the manifest lane map (the live source of truth) when the
  // dedicated /api/llm/status route isn't available, so model routing shows
  // real providers/models instead of "—".
  const lm = data.manifest?.laneMap || null;
  const primary = llm?.provider || lm?.PRIMARY_CHAT || lm?.PRIMARY_TOOL || null;
  const swarm = llm?.swarm || lm?.SWARM || null;
  const fallback = llm?.fallback || (lm?.FALLBACK ? { enabled: true, ...lm.FALLBACK } : null);
  const minimaxReserved = llm?.minimax?.reserved;

  const hops: { role: string; label: string; model?: string; tone: string; on: boolean }[] = [
    { role: 'primary', label: primary?.provider || '—', model: primary?.model, tone: '#22d3ee', on: !!primary?.provider },
    { role: 'swarm', label: swarm?.provider || '—', model: swarm?.model, tone: '#a78bfa', on: !!swarm?.provider },
  ];
  if (fallback?.enabled) hops.push({ role: 'fallback', label: fallback.provider || '—', model: fallback.model, tone: '#fbbf24', on: true });

  const activeJobs = (data.pipeline?.active || []).filter(w => Array.isArray(w.plan) && w.plan.length);
  const lanes = data.delegationStatus?.lanes || [];

  return (
    <div className="absolute inset-x-0 bottom-0 top-14 overflow-y-auto px-4 pb-4 pt-3 space-y-3">
      {/* Routing chain */}
      <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3">
        <div className="flex items-center justify-between">
          <div className="text-[8px] uppercase tracking-[0.24em] font-mono text-white/35">model routing</div>
          {minimaxReserved && (
            <span className="rounded border border-cyan-300/25 bg-cyan-300/10 px-1.5 py-0.5 text-[8px] font-mono uppercase tracking-wider text-cyan-200/70">minimax reserved</span>
          )}
        </div>
        <div className="mt-3 flex items-stretch gap-1.5">
          {hops.map((hop, i) => (
            <React.Fragment key={hop.role}>
              <div className="min-w-0 flex-1 rounded-lg border px-2.5 py-2" style={{ borderColor: `${hop.tone}${hop.on ? '44' : '1a'}`, background: hop.on ? `${hop.tone}0d` : 'transparent' }}>
                <div className="text-[8px] font-mono uppercase tracking-[0.18em]" style={{ color: hop.on ? hop.tone : '#64748b' }}>{hop.role}</div>
                <div className="mt-1 truncate text-[11px] font-black font-mono text-white/85">{hop.label}</div>
                {hop.model && <div className="truncate text-[9px] font-mono text-white/35">{hop.model}</div>}
              </div>
              {i < hops.length - 1 && <div className="flex shrink-0 items-center text-white/30 font-mono text-xs">→</div>}
            </React.Fragment>
          ))}
        </div>
        {llm?.local?.online && (
          <div className="mt-2 flex items-center gap-1.5 text-[9px] font-mono text-emerald-300/70">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" style={{ boxShadow: '0 0 8px rgba(52,211,153,0.6)' }} />
            local fallback ready{llm.local.models?.[0] ? ` · ${llm.local.models[0]}` : ''}
          </div>
        )}
      </div>

      {/* Active job delegation, else delegation board lanes */}
      <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3">
        <div className="text-[8px] uppercase tracking-[0.24em] font-mono text-white/35 mb-2">who is handling what</div>
        {activeJobs.length ? (
          <div className="space-y-2">
            {activeJobs.slice(0, 4).map(job => {
              const stage = job.plan!.find(p => p.leader) || job.plan![0];
              return (
                <div key={job.id} className="rounded-lg border border-white/8 bg-black/30 px-2.5 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[10px] font-mono text-white/70">{job.intent || job.id}</span>
                    <span className="shrink-0 text-[8px] font-mono uppercase text-cyan-300/60">{stage?.stage || job.status}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1 text-[9px] font-mono">
                    <span className="text-emerald-300/80">{stage?.leader || 'unassigned'}</span>
                    {stage?.members?.length ? <span className="text-white/30">+ {stage.members.slice(0, 4).join(', ')}</span> : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : lanes.length ? (
          <div className="space-y-1.5">
            {lanes.slice(0, 6).map(lane => (
              <div key={lane.id} className="flex items-center justify-between gap-2 text-[10px] font-mono">
                <span className="truncate text-white/55">{lane.name}</span>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-cyan-300/70">{lane.owner}</span>
                  <span className={lane.status === 'result-posted' || lane.status === 'done' ? 'text-emerald-300/70' : 'text-white/35'}>{lane.status}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex h-16 items-center justify-center text-[10px] font-mono uppercase tracking-[0.2em] text-white/25">no work in flight</div>
        )}
      </div>
    </div>
  );
}

function ServiceRibbon({ services }: { services: MissionData['services'] }) {
  return (
    <div className="absolute inset-x-4 bottom-4 top-16 flex items-end gap-2">
      {services.map(svc => {
        const color = svc.status === 'online' ? '#34d399' : svc.status === 'degraded' ? '#fbbf24' : svc.optional ? '#64748b' : '#fb7185';
        const height = svc.status === 'online' ? 86 : svc.status === 'degraded' ? 58 : svc.optional ? 18 : 30;
        return (
          <div key={svc.key || svc.name} className="group flex-1 min-w-0 flex flex-col items-center gap-2">
            <div className="w-full rounded-t-md border border-white/10 bg-white/[0.03] relative overflow-hidden" style={{ height }}>
              <div className="absolute inset-x-0 bottom-0 h-full opacity-80" style={{ background: `linear-gradient(180deg, transparent, ${color}55)` }} />
            </div>
            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 12px ${color}` }} />
            <div className="absolute bottom-2 hidden group-hover:block rounded bg-black/90 px-2 py-1 text-[9px] text-white/60 border border-white/10 whitespace-nowrap">
              {svc.name}: {svc.status}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ActivityHeatmap({ logs }: { logs: MissionData['logs'] }) {
  const cells = Array.from({ length: 80 }).map((_, i) => logs[i % Math.max(logs.length, 1)]);
  return (
    <div className="absolute inset-x-4 bottom-4 top-16 grid [grid-template-columns:repeat(16,minmax(0,1fr))] gap-1">
      {cells.map((log, i) => {
        const color = log?.type?.toLowerCase().includes('error') ? '#fb7185' :
          log?.type?.toLowerCase().includes('agent') ? '#22d3ee' :
          log?.type?.toLowerCase().includes('system') ? '#a78bfa' : '#34d399';
        const active = i < logs.length;
        return <div key={i} className="rounded-sm border border-white/5" style={{ backgroundColor: active ? `${color}${30 + (i % 5) * 18}` : 'rgba(255,255,255,0.025)', boxShadow: active && i < 24 ? `0 0 14px ${color}44` : 'none' }} />;
      })}
    </div>
  );
}

function SignalRail({ logs }: { logs: MissionData['logs'] }) {
  const recent = logs.slice(0, 7);
  return (
    <div className="absolute inset-x-4 bottom-4 top-16 flex flex-col gap-2 overflow-hidden">
      {recent.length === 0 ? (
        <div className="flex h-full items-center justify-center text-[11px] text-white/25 font-mono uppercase tracking-[0.25em]">waiting for signal</div>
      ) : recent.map((log, i) => {
        const color = log.type?.toLowerCase().includes('error') ? '#fb7185' : log.type?.toLowerCase().includes('agent') ? '#22d3ee' : '#a78bfa';
        return (
          <div key={log.id || i} className="grid grid-cols-[80px_110px_1fr] items-center gap-3 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2">
            <div className="text-[10px] text-white/25 font-mono">{log.timestamp}</div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 12px ${color}` }} />
              <span className="text-[9px] uppercase tracking-wider font-mono" style={{ color }}>{log.source || log.type}</span>
            </div>
            <div className="truncate text-[11px] text-white/60 font-mono">{log.message}</div>
          </div>
        );
      })}
    </div>
  );
}

function AgentRosterPanel({ data }: { data: MissionData }) {
  const [filter, setFilter] = useState<string>('all');
  const [selected, setSelected] = useState<MissionData['agents'][number] | null>(null);
  const divisions = [...new Set(data.agents.map(a => a.division))];

  const filtered = filter === 'all' ? data.agents : data.agents.filter(a => a.division === filter);

  return (
    <div className="h-full flex flex-col p-4 gap-3">
      <div className="flex items-center gap-3">
        <h2 className="text-[11px] uppercase tracking-[0.2em] text-white/40 font-mono">Agent Roster</h2>
        <div className="flex gap-1">
          {[{ v: 'all', l: 'All' }, ...divisions.map(d => ({ v: d, l: d.charAt(0).toUpperCase() + d.slice(1) }))].map(opt => (
            <button key={opt.v} onClick={() => setFilter(opt.v)}
              className={`px-2 py-1 rounded text-[9px] font-mono uppercase tracking-wider transition-all ${filter === opt.v ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'text-white/30 hover:text-white/60 border border-transparent'}`}>
              {opt.l}
            </button>
          ))}
        </div>
        <span className="ml-auto text-[10px] text-white/20 font-mono">{filtered.length} agents</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-3 xl:grid-cols-6 2xl:grid-cols-8 gap-2">
          {filtered.map((agent, i) => (
            <button key={i} onClick={() => setSelected(agent)} className="relative text-left rounded-xl border border-white/10 bg-white/[0.03] p-3 hover:bg-white/[0.06] hover:border-cyan-300/30 transition-all group">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">{agent.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] text-white/70 font-mono truncate">{agent.name}</div>
                  <div className="text-[8px] text-white/20 font-mono truncate">{agent.division}</div>
                </div>
                <StatusOrb status={agent.status} />
              </div>
              <div className="text-[9px] text-white/30 font-mono capitalize">{agent.role || 'agent'}</div>
              {agent.task && <div className="text-[9px] text-cyan-400/50 mt-1 truncate font-mono">{agent.task}</div>}
              <div className="pointer-events-none absolute left-1/2 top-full z-30 mt-2 hidden w-72 -translate-x-1/2 rounded-xl border border-cyan-300/20 bg-black/95 p-3 shadow-[0_0_35px_rgba(34,211,238,0.18)] group-hover:block">
                <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-cyan-200">{agent.name}</div>
                <div className="mt-1 text-[11px] text-white/55">{agent.role || 'agent'} / {agent.division}</div>
                <div className="mt-3 rounded-lg bg-white/[0.04] p-2 text-[10px] text-white/45 font-mono">
                  {agent.task || 'Idle. No current task reported by tower.'}
                </div>
                <div className="mt-2 text-[9px] uppercase tracking-wider text-white/25">click to edit details</div>
              </div>
            </button>
          ))}
        </div>
      </div>
      {selected && <AgentDetailModal agent={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function AgentDetailModal({ agent, onClose }: { agent: MissionData['agents'][number]; onClose: () => void }) {
  const [role, setRole] = useState(agent.role || '');
  const [division, setDivision] = useState(agent.division || 'ENGINEERING');
  const [tier, setTier] = useState(agent.tier || 1);
  const [skills, setSkills] = useState((agent as any).skills?.join(', ') || '');
  const [status, setStatus] = useState('');
  const divisions = ['INTELLIGENCE', 'ENGINEERING', 'SECURITY', 'INFRASTRUCTURE', 'MEDIA_OPS', 'MANAGEMENT', 'SCIENCE', 'CREATIVE', 'OPERATIONS'];

  const save = async () => {
    setStatus('saving');
    try {
      const res = await fetch(serviceProxyUrl(7790, `/api/agents/${encodeURIComponent(agent.name)}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role,
          division,
          tier: Number(tier),
          skills: skills.split(',').map((skill: string) => skill.trim()).filter(Boolean),
        }),
      });
      const payload = await res.json().catch(() => ({}));
      setStatus(res.ok ? 'saved' : (payload.error || 'save failed'));
    } catch (e: any) {
      setStatus(e?.message || 'connection failed');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-[560px] max-w-[calc(100vw-32px)] rounded-2xl border border-cyan-300/20 bg-[#05080d] p-5 shadow-[0_0_80px_rgba(34,211,238,0.18)]">
        <div className="flex items-start gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-cyan-300/30 bg-cyan-300/10 text-3xl">{agent.emoji}</div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-[0.28em] text-cyan-300/50 font-mono">agent detail</div>
            <div className="mt-1 text-2xl font-black font-mono text-white">{agent.name}</div>
            <div className="mt-1 text-[11px] text-white/40 font-mono">status: {agent.status} / id: {agent.id}</div>
          </div>
          <button onClick={onClose} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/45 hover:text-white">Close</button>
        </div>

        <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <div className="text-[9px] uppercase tracking-[0.22em] text-white/35 font-mono">current task</div>
          <div className="mt-2 text-sm text-white/70">{agent.task || 'Idle. No current task reported by tower.'}</div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className="text-[9px] uppercase tracking-wider text-white/35 font-mono">role</span>
            <input value={role} onChange={e => setRole(e.target.value)} className="w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm text-white/75 outline-none focus:border-cyan-300/40" />
          </label>
          <label className="space-y-1">
            <span className="text-[9px] uppercase tracking-wider text-white/35 font-mono">division</span>
            <select value={division} onChange={e => setDivision(e.target.value)} className="w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm text-white/75 outline-none focus:border-cyan-300/40">
              {divisions.map(div => <option key={div} value={div}>{div}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[9px] uppercase tracking-wider text-white/35 font-mono">tier</span>
            <input type="number" min={1} max={3} value={tier} onChange={e => setTier(Number(e.target.value))} className="w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm text-white/75 outline-none focus:border-cyan-300/40" />
          </label>
          <label className="space-y-1">
            <span className="text-[9px] uppercase tracking-wider text-white/35 font-mono">skills</span>
            <input value={skills} onChange={e => setSkills(e.target.value)} placeholder="comma separated" className="w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm text-white/75 outline-none focus:border-cyan-300/40" />
          </label>
        </div>

        <div className="mt-5 flex items-center justify-between">
          <span className="text-[10px] font-mono text-white/35">{status}</span>
          <button onClick={save} className="rounded-lg border border-emerald-300/30 bg-emerald-300/12 px-5 py-2 text-xs font-black uppercase tracking-[0.18em] text-emerald-200 hover:bg-emerald-300/20">Save Agent</button>
        </div>
      </div>
    </div>
  );
}

function StatusOrb({ status }: { status: string }) {
  const cfg = status === 'working' ? { color: '#22c55e', glow: 'rgba(34,197,94,0.5)' } :
              status === 'error' ? { color: '#ef4444', glow: 'rgba(239,68,68,0.5)' } :
              status === 'completed' ? { color: '#a855f7', glow: 'rgba(168,85,247,0.5)' } :
              { color: '#525252', glow: 'transparent' };
  return <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cfg.color, boxShadow: `0 0 8px ${cfg.glow}` }} />;
}

function statusColor(status: string) {
  if (status === 'working' || status === 'active') return '#22c55e';
  if (status === 'error' || status === 'failed') return '#ef4444';
  if (status === 'completed') return '#a855f7';
  return '#64748b';
}

function LogStreamPanel({ data }: { data: MissionData }) {
  const [level, setLevel] = useState<string>('all');
  const levels = ['all', 'kernel', 'ERROR', 'WARN', 'INFO', 'DEBUG'];

  const filtered = level === 'all' ? data.logs : data.logs.filter(l => l.type.toLowerCase() === level.toLowerCase());

  return (
    <div className="h-full flex flex-col p-4 gap-3">
      <div className="flex items-center gap-3">
        <h2 className="text-[11px] uppercase tracking-[0.2em] text-white/40 font-mono">Log Stream</h2>
        <div className="flex gap-1">
          {levels.map(l => (
            <button key={l} onClick={() => setLevel(l)}
              className={`px-2 py-1 rounded text-[9px] font-mono uppercase tracking-wider transition-all ${l === level ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'text-white/30 border border-transparent'}`}>
              {l}
            </button>
          ))}
        </div>
        <span className="ml-auto text-[10px] text-white/20 font-mono">{filtered.length} entries</span>
      </div>
      <div className="flex-1 overflow-y-auto font-mono text-[10px] space-y-0.5">
        {filtered.slice(0, 200).map((log, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-1 rounded hover:bg-white/5 transition-colors group">
            <span className="text-white/15 shrink-0 w-20">{log.timestamp?.split('T')[1]?.slice(0, 8) || 'â€”'}</span>
            <TypeBadge type={log.type} />
            <span className="text-white/40 shrink-0 w-16 truncate">{log.source}</span>
            <span className="text-white/60 flex-1 truncate">{log.message}</span>
            {log.agentName && <span className="text-cyan-400/30 shrink-0">{log.agentName}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function TypeBadge({ type }: { type: string }) {
  const normalized = type.toLowerCase();
  const cfg = normalized === 'error' ? { bg: 'bg-rose-500/20', text: 'text-rose-400' } :
              normalized === 'warn' ? { bg: 'bg-amber-500/20', text: 'text-amber-400' } :
              normalized === 'info' ? { bg: 'bg-cyan-500/20', text: 'text-cyan-400' } :
              normalized === 'kernel' ? { bg: 'bg-fuchsia-500/20', text: 'text-fuchsia-300' } :
              { bg: 'bg-white/10', text: 'text-white/30' };
  return <span className={`px-1.5 py-0.5 rounded text-[8px] font-mono uppercase shrink-0 ${cfg.bg} ${cfg.text}`}>{type}</span>;
}

function VitalBadge({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[9px] font-mono text-white/30 uppercase tracking-widest">{label}</span>
      <span className="flex items-baseline gap-1 font-mono">
        <span className="text-sm font-bold" style={{ color, textShadow: `0 0 12px ${color}60` }}>{value}</span>
        {sub && <span className="text-[9px] text-white/30">{sub}</span>}
      </span>
    </div>
  );
}

function Clock() {
  const [time, setTime] = useState('');
  useEffect(() => {
    const update = () => setTime(new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="text-[10px] font-mono text-white/30 tracking-wider">{time}</span>;
}

// â”€â”€ Background Effects â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function GridBackground() {
  return (
    <svg className="absolute inset-0 w-full h-full opacity-[0.04]" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
          <path d="M 60 0 L 0 0 0 60" fill="none" stroke="rgba(34,211,238,0.5)" strokeWidth="0.5" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid)" />
    </svg>
  );
}

// â”€â”€ MochiWidget â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
type MochiData = {
  name?: string; species?: string; eye?: string; hat?: string;
  rarity?: string; shiny?: boolean; interactions?: number; mood?: string;
};
type MochiPool = {
  skillsCount?: number; agentsCount?: number; memories?: number;
  failures?: number; queries?: number; uptimeSec?: number;
};

const MOCHI_FACES: Record<string, (e: string) => string> = {
  duck:     e => `(${e}>`,      goose:    e => `(${e}>`,
  blob:     e => `(${e}${e})`,  cat:      e => `=${e}Ï‰${e}=`,
  dragon:   e => `<${e}~${e}>`, octopus:  e => `~(${e}${e})~`,
  owl:      e => `(${e})(${e})`,penguin:  e => `(${e}>)`,
  turtle:   e => `[${e}_${e}]`, snail:    e => `${e}(@)`,
  ghost:    e => `/${e}${e}\\`, axolotl:  e => `}${e}.${e}{`,
  capybara: e => `(${e}oo${e})`,cactus:   e => `|${e}  ${e}|`,
  robot:    e => `[${e}${e}]`,  rabbit:   e => `(${e}..${e})`,
  mushroom: e => `|${e}  ${e}|`,chonk:    e => `(${e}.${e})`,
};

function mochiStatBars(pool: MochiPool | null, interactions: number) {
  if (!pool) return null;
  const failures = pool.failures ?? 0;
  const memories = pool.memories ?? 0;
  const food  = Math.max(0, Math.min(1, (10 - Math.min(failures, 10)) / 10));
  const joy   = Math.min(1, (interactions * 0.1 + memories * 0.05));
  const clean = Math.max(0, Math.min(1, 1 - failures / 20));
  const bond  = Math.min(1, interactions * 0.08 + memories * 0.02);
  return { food, joy, clean, bond };
}

function MochiStatBar({ label, value, color }: { label: string; value: number; color: string }) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[8px] font-mono uppercase tracking-wider text-white/30 w-8">{label}</span>
      <div className="flex-1 h-1 rounded-full bg-white/5 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="text-[8px] font-mono text-white/20 w-5 text-right">{pct}</span>
    </div>
  );
}

function MochiWidget() {
  const [mochi, setMochi] = useState<MochiData | null>(null);
  const [pool, setPool] = useState<MochiPool | null>(null);
  const [frame, setFrame] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [m, p] = await Promise.all([
          fetch('/api/mochi').then(r => r.ok ? r.json() : null).catch(() => null),
          Promise.resolve(null),
        ]);
        setMochi(m);
        setPool(p);
      } finally {
        setLoading(false);
      }
    }
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, []);

  // Animate face frame
  useEffect(() => {
    const t = setInterval(() => setFrame(f => f + 1), 900);
    return () => clearInterval(t);
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <span className="text-[10px] font-mono text-white/20 animate-pulse">hatching...</span>
    </div>
  );

  const eye = mochi?.eye ?? 'Â·';
  const species = mochi?.species ?? 'blob';
  const faceFn = MOCHI_FACES[species] ?? ((e: string) => `(${e}${e})`);
  // Animate eyes: alternate between normal and blink
  const animEye = frame % 8 === 7 ? '-' : eye;
  const face = faceFn(animEye);
  const name = mochi?.name ?? 'Mochi';
  const interactions = mochi?.interactions ?? 0;
  const rarity = mochi?.rarity ?? 'common';
  const bars = mochiStatBars(pool, interactions);

  const rarityColor: Record<string, string> = {
    common: '#6b7280', rare: '#3b82f6', epic: '#a855f7', legendary: '#f59e0b',
  };
  const rc = rarityColor[rarity] ?? '#6b7280';

  return (
    <div className="h-full flex flex-col gap-2 p-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[8px] uppercase tracking-[0.22em] font-mono text-white/30">companion</span>
        <a href="/mochi" className="text-[8px] font-mono text-fuchsia-300/50 hover:text-fuchsia-200 transition-colors">full view â†’</a>
      </div>

      {/* Face + identity */}
      <div className="flex flex-col items-center gap-1 py-1">
        <div className="text-xl font-mono text-fuchsia-300 tracking-widest" style={{ textShadow: '0 0 12px rgba(217,70,239,0.6)' }}>
          {face}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-bold text-white/80">{name}</span>
          {mochi?.shiny && <span className="text-yellow-300 text-[10px]">âœ¨</span>}
        </div>
        <div className="flex items-center gap-1 text-[8px] font-mono">
          <span className="text-white/30">{species}</span>
          <span className="text-white/15">Â·</span>
          <span style={{ color: rc }}>{rarity}</span>
        </div>
      </div>

      {/* Stat bars */}
      {bars && (
        <div className="flex flex-col gap-1 mt-1">
          <MochiStatBar label="food" value={bars.food}  color="#34d399" />
          <MochiStatBar label="joy"  value={bars.joy}   color="#e879f9" />
          <MochiStatBar label="cln"  value={bars.clean} color="#38bdf8" />
          <MochiStatBar label="bond" value={bars.bond}  color="#fbbf24" />
        </div>
      )}

      {/* Pool snapshot */}
      {pool && (
        <div className="mt-auto pt-1 border-t border-white/5 grid grid-cols-2 gap-x-2 gap-y-0.5">
          <span className="text-[8px] font-mono text-white/20">{pool.skillsCount ?? 0} skills</span>
          <span className="text-[8px] font-mono text-white/20">{pool.agentsCount ?? 0} agents</span>
          <span className="text-[8px] font-mono text-white/20">{pool.memories ?? 0} memories</span>
          <span className="text-[8px] font-mono text-white/20">{interactions} chats</span>
        </div>
      )}
    </div>
  );
}

function AgentLeaderboardWidget() {
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/agent-scores')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d && d.leaderboard) {
          setLeaderboard(d.leaderboard.slice(0, 5));
        }
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <span className="text-[10px] font-mono text-white/20 animate-pulse">loading scoreboard...</span>
    </div>
  );

  return (
    <div className="h-full flex flex-col gap-2 p-3 overflow-y-auto">
      <div className="flex items-center justify-between">
        <span className="text-[8px] uppercase tracking-[0.22em] font-mono text-white/30">agent leaderboard</span>
        <span className="text-[8px] font-mono text-cyan-300/60">top active</span>
      </div>
      <div className="space-y-1.5 mt-1">
        {leaderboard.length === 0 ? (
          <div className="text-[10px] text-white/35 font-mono">No stats recorded yet.</div>
        ) : leaderboard.map((item, idx) => (
          <div key={item.agent} className="flex items-center justify-between rounded border border-white/5 bg-black/15 px-2 py-1 text-[10px] font-mono">
            <div className="flex items-center gap-1.5">
              <span className="text-white/25">#{idx + 1}</span>
              <span className="font-bold text-white/80">{item.agent}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-emerald-400">{item.successRate}% SR</span>
              <span className="text-cyan-300 font-bold">{item.score} pts</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HarnessBenchmarkWidget({ data }: { data: MissionData }) {
  const summary = data.harnessBenchmarks?.summary;
  const trend = data.harnessBenchmarks?.trend;
  const latest = data.harnessBenchmarks?.latest;
  const completionRate = Math.round((summary?.completionRate || 0) * 100);
  const passAt1Rate = Math.round((summary?.passAt1Rate || 0) * 100);
  const passAt3Rate = Math.round((summary?.passAt3Rate || 0) * 100);
  const trendText = trend
    ? `${trend.completionRateDelta >= 0 ? '+' : ''}${Math.round((trend.completionRateDelta || 0) * 100)}% completion delta`
    : 'no prior run';

  return (
    <div className="h-full flex flex-col gap-3 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[8px] uppercase tracking-[0.22em] font-mono text-white/30">self-improvement benchmark</div>
          <div className="mt-1 text-sm font-black tracking-[0.12em] uppercase text-white/80">Canonical Harness Goals</div>
        </div>
        <span className={`rounded border px-2 py-1 text-[9px] uppercase tracking-[0.18em] font-mono ${
          completionRate >= 90 ? 'border-emerald-300/30 bg-emerald-300/10 text-emerald-200' :
          completionRate > 0 ? 'border-amber-300/30 bg-amber-300/10 text-amber-200' :
          'border-white/10 bg-white/[0.03] text-white/35'
        }`}>
          {latest?.status || 'not run'}
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <BenchmarkMetric label="Goals" value={`${summary?.passedGoals || 0}/${summary?.totalGoals || 0}`} />
        <BenchmarkMetric label="Pass" value={`${completionRate}%`} />
        <BenchmarkMetric label="Pass@1" value={`${passAt1Rate}%`} />
        <BenchmarkMetric label="Pass@3" value={`${passAt3Rate}%`} />
        <BenchmarkMetric label="Retries" value={summary?.retries || 0} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
        <div className="rounded-lg border border-white/10 bg-black/25 p-3">
          <div className="text-[9px] uppercase tracking-[0.18em] font-mono text-violet-200/55">learning writes</div>
          <div className="mt-2 text-2xl font-black text-violet-200">{summary?.memoryLessons || 0}</div>
          <div className="mt-1 text-[10px] leading-4 text-white/40">Memory lessons captured by benchmark missions.</div>
        </div>
        <div className="rounded-lg border border-white/10 bg-black/25 p-3">
          <div className="text-[9px] uppercase tracking-[0.18em] font-mono text-cyan-200/55">score updates</div>
          <div className="mt-2 text-2xl font-black text-cyan-200">{summary?.agentScoreRecords || 0}</div>
          <div className="mt-1 text-[10px] leading-4 text-white/40">Routing data fed back into agent selection.</div>
        </div>
        <div className="rounded-lg border border-white/10 bg-black/25 p-3">
          <div className="text-[9px] uppercase tracking-[0.18em] font-mono text-emerald-200/55">trend</div>
          <div className="mt-2 text-sm font-bold text-emerald-200">{trendText}</div>
          <div className="mt-1 text-[10px] leading-4 text-white/40">Repeated runs prove improvement or expose regression.</div>
        </div>
      </div>
    </div>
  );
}

function BenchmarkMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/25 p-2 text-center">
      <div className="text-lg font-black text-white/85">{value}</div>
      <div className="mt-1 text-[8px] uppercase tracking-[0.18em] text-white/28 font-mono">{label}</div>
    </div>
  );
}

function LLMLedgerWidget() {
  const [summary, setSummary] = useState<any>({ totalCalls: 0, totalTokens: 0, totalCost: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/llm-ledger')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d && d.summary) {
          setSummary(d.summary);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <span className="text-[10px] font-mono text-white/20 animate-pulse">summing ledger...</span>
    </div>
  );

  return (
    <div className="h-full flex flex-col gap-2 p-3 justify-between">
      <div>
        <div className="flex items-center justify-between">
          <span className="text-[8px] uppercase tracking-[0.22em] font-mono text-white/30">cost ledger</span>
          <span className="text-[8px] font-mono text-emerald-300/60">real spend</span>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-2">
          <div className="rounded border border-white/5 bg-black/15 p-2 text-center">
            <div className="text-xs font-black text-cyan-200">{summary.totalCalls}</div>
            <div className="text-[8px] uppercase tracking-wider text-white/25 font-mono">calls</div>
          </div>
          <div className="rounded border border-white/5 bg-black/15 p-2 text-center">
            <div className="text-xs font-black text-violet-300">{(summary.totalTokens / 1000).toFixed(1)}k</div>
            <div className="text-[8px] uppercase tracking-wider text-white/25 font-mono">tokens</div>
          </div>
        </div>
      </div>
      <div className="rounded-xl border border-emerald-300/10 bg-emerald-300/5 p-2.5 mt-2 flex items-center justify-between">
        <div>
          <div className="text-[8px] uppercase tracking-[0.16em] text-emerald-300/60 font-mono">estimated cost</div>
          <div className="text-sm font-black text-emerald-300">${summary.totalCost.toFixed(4)}</div>
        </div>
        <div className="text-[18px] text-emerald-400">💸</div>
      </div>
    </div>
  );
}

function ScanlineOverlay() {
  return (
    <div className="absolute inset-0 pointer-events-none opacity-[0.03]"
      style={{ background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(34,211,238,0.3) 2px, rgba(34,211,238,0.3) 4px)' }} />
  );
}

function VignetteOverlay() {
  return (
    <div className="absolute inset-0 pointer-events-none"
      style={{ background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.7) 100%)' }} />
  );
}
