'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type {
  Route, ComposerMode, AccessMode, MemoryMode, ComposerSpeed,
  IntelligenceLevel, ProviderId, WorkspaceId, AgentId,
  Attachment, ContextItem, OperatorContext, LauncherActionKind,
} from './types';
import {
  COMPOSER_MODES, AGENT_TOGGLES, WORKSPACES, QUICK_CHIPS, QUICK_CHIP_LABELS,
  SPEEDS, INTELLIGENCE_LEVELS, PROVIDERS, ACCESS_MODES, MEMORY_MODES,
  FREE_MODELS, ROUTES, C, MODE_GLOW, LAUNCHER_SECTIONS, CONTEXT_ICONS,
  CHIP_CATEGORY_COLORS,
} from './types';

// ─── Flyout Menu (reusable) ──────────────────────────────────────────────────
// A tiny popover that anchors to its trigger. Opens upward above the input bar.

type FlyoutId = 'mode' | 'agents' | 'model' | 'access' | 'memory' | 'workspace' | 'chips' | 'launcher' | 'context' | null;

function Flyout({ open, children, align = 'left', wide }: {
  open: boolean;
  children: React.ReactNode;
  align?: 'left' | 'center' | 'right';
  wide?: boolean;
}) {
  if (!open) return null;
  const pos = align === 'right' ? 'right-0' : align === 'center' ? 'left-1/2 -translate-x-1/2' : 'left-0';
  return (
    <div className={`absolute bottom-full mb-2 ${pos} z-50 ${wide ? 'w-[22rem]' : 'w-auto min-w-[11rem]'} launcher-enter`}>
      <div className="composer-launcher rounded-xl p-2.5 shadow-2xl">
        {children}
      </div>
    </div>
  );
}

// ─── Pill button for the toolbar row ─────────────────────────────────────────

function ToolbarPill({ active, color, onClick, children, title, glow }: {
  active?: boolean;
  color?: string;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
  glow?: boolean;
}) {
  const cl = color && C[color];
  return (
    <button
      onClick={onClick}
      title={title}
      className={`relative flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-mono uppercase tracking-wider transition-all duration-200 chip-hover ${
        active && cl
          ? `${cl.pill} font-bold`
          : 'text-white/35 hover:text-white/65 hover:bg-white/[0.04]'
      }`}
      style={active && glow && color ? { boxShadow: MODE_GLOW[color] } : undefined}
    >
      {children}
    </button>
  );
}

// ─── Flyout section header ───────────────────────────────────────────────────

function FlyoutHeader({ children }: { children: React.ReactNode }) {
  return <div className="mb-1.5 text-[8px] font-mono uppercase tracking-[0.18em] text-white/30">{children}</div>;
}

// ─── Flyout option row ───────────────────────────────────────────────────────

function FlyoutOption({ active, onClick, children, tone }: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tone?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full rounded-lg px-2.5 py-1.5 text-left text-[10px] font-mono transition-all ${
        active
          ? (tone || 'border border-cyan-400/30 bg-cyan-400/10 text-cyan-100')
          : 'text-white/50 hover:bg-white/[0.05] hover:text-white/80'
      }`}
    >
      {children}
    </button>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// COMPOSER INPUT — The one true chatbox. Everything lives inside it.
// ═════════════════════════════════════════════════════════════════════════════

export interface ComposerInputProps {
  // State
  composerMode: ComposerMode;
  setComposerMode: (m: ComposerMode) => void;
  accessMode: AccessMode;
  setAccessMode: (m: AccessMode) => void;
  memoryMode: MemoryMode;
  setMemoryMode: (m: MemoryMode) => void;
  workspace: WorkspaceId;
  setWorkspace: (w: WorkspaceId) => void;
  provider: ProviderId;
  setProvider: (p: ProviderId) => void;
  speed: ComposerSpeed;
  setSpeed: (s: ComposerSpeed) => void;
  intelligence: IntelligenceLevel;
  setIntelligence: (i: IntelligenceLevel) => void;
  enabledAgents: AgentId[];
  toggleAgent: (id: AgentId) => void;
  quickChips: string[];
  toggleQuickChip: (label: string) => void;
  // Input
  input: string;
  setInput: (val: string) => void;
  onSend: () => void;
  busy: boolean;
  // Attachments
  attachments: Attachment[];
  setAttachments: React.Dispatch<React.SetStateAction<Attachment[]>>;
  uploadFiles: (files: FileList | File[]) => void;
  uploading: boolean;
  // Context
  activeContext: ContextItem[];
  estimatedTokens: number;
  // Services
  voiceOnline: boolean;
  // Launcher action
  onLauncherAction: (kind: LauncherActionKind) => void;
  // Current route info
  currentRoute: Route;
  selectedModels: string[];
}

export function ComposerInput(props: ComposerInputProps) {
  const {
    composerMode, setComposerMode, accessMode, setAccessMode,
    memoryMode, setMemoryMode, workspace, setWorkspace,
    provider, setProvider, speed, setSpeed,
    intelligence, setIntelligence,
    enabledAgents, toggleAgent, quickChips, toggleQuickChip,
    input, setInput, onSend, busy,
    attachments, setAttachments, uploadFiles, uploading,
    activeContext, estimatedTokens,
    voiceOnline, onLauncherAction,
    currentRoute, selectedModels,
  } = props;

  const [openMenu, setOpenMenu] = useState<FlyoutId>(null);
  const [dragging, setDragging] = useState(false);
  const [contextExpanded, setContextExpanded] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Local voice input (STT) ──────────────────────────────────────────────
  // Two-way voice is ON BY DEFAULT, not an optional extra: clicking the mic
  // uses the browser's built-in SpeechRecognition to transcribe speech straight
  // into the composer. No backend voice service required.
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);
  const toggleMic = () => {
    if (typeof window === 'undefined') return;
    const SR = (window as unknown as { SpeechRecognition?: new () => any; webkitSpeechRecognition?: new () => any })
      .SpeechRecognition || (window as unknown as { webkitSpeechRecognition?: new () => any }).webkitSpeechRecognition;
    if (!SR) { alert('Voice input needs a Chromium-based browser (SpeechRecognition API not found).'); return; }
    if (listening) { try { recognitionRef.current?.stop(); } catch {} return; }
    const rec = new SR();
    rec.lang = 'en-US';
    rec.interimResults = true;
    rec.continuous = false;
    const base = input;
    rec.onresult = (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => {
      let txt = '';
      for (let i = 0; i < e.results.length; i++) txt += e.results[i][0].transcript;
      setInput((base ? base + ' ' : '') + txt);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    try { rec.start(); setListening(true); } catch { setListening(false); }
  };

  // Close flyout on click outside
  useEffect(() => {
    if (!openMenu) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openMenu]);

  // Close on Escape
  useEffect(() => {
    if (!openMenu) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenMenu(null); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [openMenu]);

  const toggle = (id: FlyoutId) => setOpenMenu(prev => prev === id ? null : id);

  const onKey = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); onSend(); }
  };

  // Drag & drop
  const onDrop = (e: React.DragEvent) => { e.preventDefault(); setDragging(false); if (e.dataTransfer?.files?.length) uploadFiles(e.dataTransfer.files); };
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); if (!dragging) setDragging(true); };
  const onDragLeave = (e: React.DragEvent) => { e.preventDefault(); setDragging(false); };

  // Current mode config
  const modeConfig = COMPOSER_MODES.find(m => m.id === composerMode)!;
  const modeColor = modeConfig.color;
  const cl = C[modeColor] || C.cyan;
  const accessConfig = ACCESS_MODES.find(a => a.id === accessMode)!;

  // Active agent count
  const agentCount = enabledAgents.length;

  // Auto-resize textarea
  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }, [input]);

  return (
    <div ref={containerRef} className="shrink-0 border-t border-white/6 bg-black/60 px-4 pt-2 pb-2.5">

      {/* ── Active Context Strip (collapsible, above textbox) ─────────── */}
      {(attachments.length > 0 || contextExpanded) && (
        <div className="mb-2 context-panel-enter">
          {/* Attachment chips */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
              {attachments.map((a, i) => (
                <span key={a.path} className="flex items-center gap-1 rounded-lg border border-cyan-300/20 bg-cyan-300/6 px-2 py-0.5 text-[9px] font-mono text-cyan-100/80" title={a.path}>
                  📎 {a.name} <span className="text-white/25">{a.kind}</span>
                  <button aria-label="Remove attachment" onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))} className="ml-0.5 text-rose-300/60 hover:text-rose-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/50 rounded"><span aria-hidden="true">×</span></button>
                </span>
              ))}
              {uploading && <span className="text-[9px] font-mono text-white/35 animate-pulse">uploading…</span>}
            </div>
          )}
          {/* Context items (expanded view) */}
          {contextExpanded && (
            <div className="flex flex-wrap gap-1.5 pb-1">
              {activeContext.slice(0, 14).map((item, i) => (
                <span key={`${item.kind}-${i}`} className="rounded-md border border-white/8 bg-white/[0.025] px-1.5 py-0.5 text-[8px] font-mono text-white/50" title={item.detail || item.kind}>
                  {CONTEXT_ICONS[item.kind] || '·'} {item.label}
                </span>
              ))}
              {activeContext.length > 14 && <span className="text-[8px] font-mono text-white/25">+{activeContext.length - 14}</span>}
            </div>
          )}
        </div>
      )}

      {/* ── The Textbox ──────────────────────────────────────────────── */}
      <div
        className={`relative rounded-2xl border transition-all duration-300 ${
          input.trim() ? cl.border : 'border-white/10'
        } bg-black/50`}
        style={input.trim() ? { boxShadow: MODE_GLOW[modeColor] || 'none' } : undefined}
        onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave}
      >
        {/* Drag overlay */}
        {dragging && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-2xl border-2 border-dashed border-cyan-300/50 bg-cyan-300/8 text-[10px] font-mono uppercase tracking-[0.2em] text-cyan-100">
            drop any file
          </div>
        )}

        {/* Textarea */}
        <textarea
          ref={textRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKey}
          placeholder={
            composerMode === 'swarm' ? 'Describe the mission — swarm agents will decompose it...'
            : composerMode === 'execute' ? 'What should the agents build?'
            : composerMode === 'plan' ? 'What should I plan?'
            : 'Message PURPCLAW... (Ctrl+Enter to send)'
          }
          rows={1}
          className="w-full resize-none bg-transparent px-4 pt-3 pb-1 text-sm text-white/90 placeholder:text-white/20 focus:outline-none leading-relaxed"
          style={{ minHeight: '2.5rem', maxHeight: '10rem' }}
        />

        {/* ── Toolbar Row — ALL controls live here as compact pills ──── */}
        <div className="flex items-center gap-0.5 px-2 pb-2 flex-wrap">

          {/* (+) Launcher */}
          <div className="relative">
            <button
              aria-label="Launcher menu"
              onClick={() => toggle('launcher')}
              className={`h-7 w-7 rounded-lg border text-sm font-black transition-all plus-rotate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 ${
                openMenu === 'launcher'
                  ? 'border-cyan-400/30 bg-cyan-400/12 text-cyan-100'
                  : 'border-white/10 bg-white/[0.03] text-white/40 hover:text-white/70 hover:bg-white/[0.06]'
              }`}
              title="Attach / Context / Actions"
            ><span aria-hidden="true">+</span></button>
            <Flyout open={openMenu === 'launcher'} wide>
              {LAUNCHER_SECTIONS.map(section => (
                <div key={section.title} className="mb-2.5 last:mb-0">
                  <FlyoutHeader>{section.title}</FlyoutHeader>
                  <div className="grid grid-cols-2 gap-0.5">
                    {section.items.map(([kind, label, icon]) => (
                      <button
                        key={kind}
                        onClick={() => { onLauncherAction(kind); setOpenMenu(null); }}
                        className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[10px] font-mono text-white/55 transition-all hover:bg-white/[0.05] hover:text-white/85"
                      >
                        <span className="text-xs">{icon}</span>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </Flyout>
          </div>

          <div className="w-px h-4 bg-white/8 mx-1" />

          {/* Mode Toggle */}
          <div className="relative">
            <ToolbarPill active color={modeColor} onClick={() => toggle('mode')} glow title="Composer Mode">
              <span className="text-xs">{modeConfig.icon}</span>
              {modeConfig.label}
            </ToolbarPill>
            <Flyout open={openMenu === 'mode'}>
              <FlyoutHeader>Mode</FlyoutHeader>
              {COMPOSER_MODES.map(m => (
                <FlyoutOption
                  key={m.id}
                  active={composerMode === m.id}
                  onClick={() => { setComposerMode(m.id); setOpenMenu(null); }}
                  tone={`border ${C[m.color].pill}`}
                >
                  <span className="mr-1.5">{m.icon}</span>
                  {m.label}
                  {composerMode === m.id && <span className="ml-auto text-white/40">✓</span>}
                </FlyoutOption>
              ))}
            </Flyout>
          </div>

          {/* Agents */}
          <div className="relative">
            <ToolbarPill onClick={() => toggle('agents')} active={agentCount > 0} color="violet" title="Agents">
              👤 {agentCount > 0 ? agentCount : '–'}
            </ToolbarPill>
            <Flyout open={openMenu === 'agents'}>
              <FlyoutHeader>Agents ({agentCount} active)</FlyoutHeader>
              {AGENT_TOGGLES.map(a => (
                <FlyoutOption
                  key={a.id}
                  active={enabledAgents.includes(a.id)}
                  onClick={() => toggleAgent(a.id)}
                  tone="border border-violet-400/30 bg-violet-400/10 text-violet-100"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${enabledAgents.includes(a.id) ? 'bg-violet-400' : 'bg-white/15'}`} />
                    {a.label}
                  </span>
                </FlyoutOption>
              ))}
            </Flyout>
          </div>

          {/* Model Control */}
          <div className="relative">
            <ToolbarPill onClick={() => toggle('model')} title="Model / Speed / Intelligence">
              🤖 {PROVIDERS.find(p => p.id === provider)?.label || 'Auto'}
            </ToolbarPill>
            <Flyout open={openMenu === 'model'} align="center">
              <FlyoutHeader>Provider</FlyoutHeader>
              <div className="grid grid-cols-2 gap-0.5 mb-2">
                {PROVIDERS.map(p => (
                  <FlyoutOption key={p.id} active={provider === p.id} onClick={() => setProvider(p.id)}>
                    {p.label}
                  </FlyoutOption>
                ))}
              </div>
              <FlyoutHeader>Speed</FlyoutHeader>
              <div className="flex gap-1 mb-2">
                {SPEEDS.map(s => (
                  <FlyoutOption key={s.id} active={speed === s.id} onClick={() => setSpeed(s.id)}>
                    {'⚡'.repeat(s.id === 'fast' ? 1 : s.id === 'balanced' ? 2 : 3)} {s.label}
                  </FlyoutOption>
                ))}
              </div>
              <FlyoutHeader>Intelligence</FlyoutHeader>
              <div className="flex gap-1">
                {INTELLIGENCE_LEVELS.map(l => {
                  const dot = l.id === 'low' ? '🟢' : l.id === 'medium' ? '🟡' : l.id === 'high' ? '🟠' : '🔴';
                  return (
                    <FlyoutOption key={l.id} active={intelligence === l.id} onClick={() => setIntelligence(l.id)}>
                      {dot} {l.label}
                    </FlyoutOption>
                  );
                })}
              </div>
            </Flyout>
          </div>

          {/* Memory */}
          <div className="relative">
            <ToolbarPill onClick={() => toggle('memory')} active={memoryMode !== 'off'} color="cyan" title="Memory">
              🧠 {MEMORY_MODES.find(m => m.id === memoryMode)?.label || 'Off'}
            </ToolbarPill>
            <Flyout open={openMenu === 'memory'}>
              <FlyoutHeader>Memory Level</FlyoutHeader>
              {MEMORY_MODES.map(m => (
                <FlyoutOption key={m.id} active={memoryMode === m.id} onClick={() => { setMemoryMode(m.id); setOpenMenu(null); }}>
                  {m.id === 'persistent' ? '🧠' : m.id === 'project' ? '◉' : m.id === 'session' ? '◐' : '○'} {m.label}
                </FlyoutOption>
              ))}
            </Flyout>
          </div>

          {/* Workspace */}
          <div className="relative">
            <ToolbarPill onClick={() => toggle('workspace')} title="Workspace">
              📂 {WORKSPACES.find(w => w.id === workspace)?.label || 'Current'}
            </ToolbarPill>
            <Flyout open={openMenu === 'workspace'}>
              <FlyoutHeader>Workspace</FlyoutHeader>
              {WORKSPACES.map(w => (
                <FlyoutOption key={w.id} active={workspace === w.id} onClick={() => { setWorkspace(w.id); setOpenMenu(null); }}>
                  {w.label}
                </FlyoutOption>
              ))}
            </Flyout>
          </div>

          {/* Quick Chips */}
          <div className="relative">
            <ToolbarPill onClick={() => toggle('chips')} active={quickChips.length > 0} color="fuchsia" title="Quick Actions">
              ⚡ {quickChips.length > 0 ? quickChips.length : 'Chips'}
            </ToolbarPill>
            <Flyout open={openMenu === 'chips'} wide>
              <FlyoutHeader>Quick Actions</FlyoutHeader>
              <div className="grid grid-cols-3 gap-0.5">
                {QUICK_CHIPS.map(chip => (
                  <button
                    key={chip.label}
                    onClick={() => toggleQuickChip(chip.label)}
                    className={`rounded-lg border-l-2 px-2 py-1.5 text-[10px] font-mono transition-all ${
                      CHIP_CATEGORY_COLORS[chip.category] || ''
                    } ${
                      quickChips.includes(chip.label)
                        ? 'bg-fuchsia-400/10 text-fuchsia-100 font-bold'
                        : 'text-white/45 hover:text-white/75 hover:bg-white/[0.04]'
                    }`}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </Flyout>
          </div>

          {/* Context (token count + expand) */}
          <button
            onClick={() => setContextExpanded(v => !v)}
            className="ml-auto flex items-center gap-1 rounded-lg px-2 py-1 text-[9px] font-mono text-white/30 hover:text-white/55 transition-all"
            title="Show active context"
          >
            <span className="token-counter text-cyan-300/70">{estimatedTokens.toLocaleString()} tk</span>
            <span className={`transition-transform duration-200 ${contextExpanded ? 'rotate-180' : ''}`}>▴</span>
          </button>

          <div className="w-px h-4 bg-white/8 mx-1" />

          {/* Access Control — always visible beside Send */}
          <div className="relative">
            <button
              onClick={() => toggle('access')}
              className={`rounded-lg border px-2 py-1 text-[9px] font-mono uppercase tracking-wider transition-all ${accessConfig.tone}`}
              title="Access level"
            >
              {accessMode === 'readOnly' ? '🟢' : accessMode === 'review' ? '🟡' : accessMode === 'agentActions' ? '🟠' : '🔴'} {accessConfig.label}
            </button>
            <Flyout open={openMenu === 'access'} align="right">
              <FlyoutHeader>Access Control</FlyoutHeader>
              {ACCESS_MODES.map(a => (
                <FlyoutOption
                  key={a.id}
                  active={accessMode === a.id}
                  onClick={() => { setAccessMode(a.id); setOpenMenu(null); }}
                  tone={`border ${a.tone}`}
                >
                  {a.id === 'readOnly' ? '🟢' : a.id === 'review' ? '🟡' : a.id === 'agentActions' ? '🟠' : '🔴'} {a.label}
                </FlyoutOption>
              ))}
            </Flyout>
          </div>

          {/* Voice input — local browser STT, on by default (no service needed) */}
          <button
            onClick={toggleMic}
            className={`h-7 w-7 rounded-lg border text-xs transition-all ${listening
              ? 'border-rose-400/60 bg-rose-500/20 text-rose-300 animate-pulse'
              : 'border-white/8 bg-white/[0.02] text-white/45 hover:text-white/70 hover:bg-white/[0.05]'}`}
            title={listening ? 'Listening… click to stop' : 'Voice input — speak into chat'}
          >🎤</button>

          {/* Send */}
          <button
            onClick={onSend}
            disabled={busy || (!input.trim() && !attachments.length)}
            className={`h-7 rounded-xl border px-4 text-[10px] font-black uppercase tracking-wider transition-all disabled:opacity-25 ${cl.pill} hover:opacity-85 active:scale-95 ${
              input.trim() ? `send-pulse-${composerMode}` : ''
            }`}
          >
            {busy ? '■' : '→'}
          </button>
        </div>
      </div>

      {/* Hint line */}
      <div className="mt-1 text-[7px] font-mono text-white/12 px-1">
        Ctrl+Enter · drop files · menus above ↑
      </div>
    </div>
  );
}
