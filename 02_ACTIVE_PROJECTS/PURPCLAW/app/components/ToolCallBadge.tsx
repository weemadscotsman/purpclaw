'use client';

import { useEffect, useState } from 'react';

/**
 * ToolCallBadge — animated badge for tool/function calls in chat.
 *
 * Visual:
 *   - Color per tool category (file=cyan, code=green, web=purple, shell=orange,
 *     search=blue, agent=violet, system=slate, default=cyan)
 *   - Animated shine: a diagonal gradient sweeps left-to-right while running
 *   - States: 'running' (pulsing + shine) → 'success' (green check, settle) /
 *             'failure' (red x, settle)
 *   - Per-tool icon glyph
 *
 * Props:
 *   tool:  string              — tool name (e.g. "read", "shell.run")
 *   args?: any                 — first 200 chars shown in collapsed preview
 *   status: 'running' | 'success' | 'failure'
 *   result?: string            — short result preview on success
 *   durationMs?: number        — total time taken
 */

// Color + icon for known tools. Anything else falls through to default.
const TOOL_STYLES: Record<string, { color: string; bg: string; border: string; icon: string; label: string }> = {
  read:            { color: 'text-cyan-300',    bg: 'bg-cyan-500/15',    border: 'border-cyan-500/40',    icon: '📄', label: 'Read' },
  glob:            { color: 'text-cyan-300',    bg: 'bg-cyan-500/15',    border: 'border-cyan-500/40',    icon: '🔍', label: 'Glob' },
  grep:            { color: 'text-cyan-300',    bg: 'bg-cyan-500/15',    border: 'border-cyan-500/40',    icon: '🔎', label: 'Grep' },
  shell:           { color: 'text-orange-300',  bg: 'bg-orange-500/15',  border: 'border-orange-500/40',  icon: '⚡', label: 'Shell' },
  write:           { color: 'text-emerald-300', bg: 'bg-emerald-500/15', border: 'border-emerald-500/40', icon: '✍',  label: 'Write' },
  patch:           { color: 'text-emerald-300', bg: 'bg-emerald-500/15', border: 'border-emerald-500/40', icon: '🩹', label: 'Patch' },
  edit:            { color: 'text-emerald-300', bg: 'bg-emerald-500/15', border: 'border-emerald-500/40', icon: '✏',  label: 'Edit' },
  code:            { color: 'text-green-300',   bg: 'bg-green-500/15',   border: 'border-green-500/40',   icon: '🧬', label: 'Code' },
  bash:            { color: 'text-orange-300',  bg: 'bg-orange-500/15',  border: 'border-orange-500/40',  icon: '⚡', label: 'Bash' },
  browser_open:    { color: 'text-purple-300',  bg: 'bg-purple-500/15',  border: 'border-purple-500/40',  icon: '🌐', label: 'Browser' },
  browser_click:   { color: 'text-purple-300',  bg: 'bg-purple-500/15',  border: 'border-purple-500/40',  icon: '👆', label: 'Click' },
  browser_type:    { color: 'text-purple-300',  bg: 'bg-purple-500/15',  border: 'border-purple-500/40',  icon: '⌨',  label: 'Type' },
  browser_screenshot: { color: 'text-purple-300', bg: 'bg-purple-500/15', border: 'border-purple-500/40',  icon: '📸', label: 'Screenshot' },
  browser_extract: { color: 'text-purple-300',  bg: 'bg-purple-500/15',  border: 'border-purple-500/40',  icon: '📑', label: 'Extract' },
  browser_close:   { color: 'text-purple-300',  bg: 'bg-purple-500/15',  border: 'border-purple-500/40',  icon: '✖',  label: 'Close' },
  search:          { color: 'text-blue-300',    bg: 'bg-blue-500/15',    border: 'border-blue-500/40',    icon: '🧭', label: 'Search' },
  mcp:             { color: 'text-fuchsia-300',bg: 'bg-fuchsia-500/15',border: 'border-fuchsia-500/40',icon: '🔌', label: 'MCP' },
  memory:          { color: 'text-violet-300',  bg: 'bg-violet-500/15',  border: 'border-violet-500/40',  icon: '🧠', label: 'Memory' },
  spend:           { color: 'text-yellow-300',  bg: 'bg-yellow-500/15',  border: 'border-yellow-500/40',  icon: '💰', label: 'Spend' },
  agent:           { color: 'text-violet-300',  bg: 'bg-violet-500/15',  border: 'border-violet-500/40',  icon: '🤖', label: 'Agent' },
  file:            { color: 'text-cyan-300',    bg: 'bg-cyan-500/15',    border: 'border-cyan-500/40',    icon: '📁', label: 'File' },
  web:             { color: 'text-purple-300',  bg: 'bg-purple-500/15',  border: 'border-purple-500/40',  icon: '🌍', label: 'Web' },
  network:         { color: 'text-blue-300',    bg: 'bg-blue-500/15',    border: 'border-blue-500/40',    icon: '🛰', label: 'Network' },
  test:            { color: 'text-pink-300',    bg: 'bg-pink-500/15',    border: 'border-pink-500/40',    icon: '🧪', label: 'Test' },
  build:           { color: 'text-amber-300',   bg: 'bg-amber-500/15',   border: 'border-amber-500/40',   icon: '🔨', label: 'Build' },
};

const DEFAULT_STYLE = { color: 'text-cyan-300', bg: 'bg-cyan-500/15', border: 'border-cyan-500/40', icon: '⚙', label: 'Tool' };

function getStyle(tool: string) {
  const name = (tool || '').toLowerCase();
  // Try direct match, then strip module prefix (mcp__foo__read → read)
  if (TOOL_STYLES[name]) return TOOL_STYLES[name];
  const stripped = name.split('__').pop() || name;
  if (TOOL_STYLES[stripped]) return TOOL_STYLES[stripped];
  // Try prefix match (browser_*, mcp_*, etc.)
  for (const key of Object.keys(TOOL_STYLES)) {
    if (stripped.startsWith(key) || stripped.includes('.' + key) || stripped.endsWith('_' + key)) {
      return TOOL_STYLES[key];
    }
  }
  return DEFAULT_STYLE;
}

function truncate(s: any, max = 80) {
  if (s == null) return '';
  const str = typeof s === 'string' ? s : JSON.stringify(s);
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + '…';
}

function getArgSummary(args: any): string {
  if (!args) return '';
  if (typeof args === 'string') return truncate(args);
  if (typeof args !== 'object') return truncate(String(args));
  // Pick the most identifying field
  const candidates = ['path', 'file', 'filename', 'command', 'cmd', 'query', 'q', 'url', 'selector', 'text', 'content', 'name'];
  for (const k of candidates) {
    if (args[k] != null) return truncate(args[k]);
  }
  // Fallback: first non-empty string
  for (const k of Object.keys(args)) {
    const v = args[k];
    if (typeof v === 'string' && v.length > 0) return truncate(v);
  }
  return '';
}

function formatDuration(ms?: number) {
  if (!ms || ms < 1) return '';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

interface Props {
  tool: string;
  args?: any;
  status: 'running' | 'success' | 'failure';
  result?: string;
  error?: string;
  durationMs?: number;
}

export default function ToolCallBadge({ tool, args, status, result, error, durationMs }: Props) {
  const style = getStyle(tool);
  const argSummary = getArgSummary(args);
  const [displayStatus, setDisplayStatus] = useState(status);
  const [showDetails, setShowDetails] = useState(false);
  const [startTime] = useState(() => Date.now());
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => { setDisplayStatus(status); }, [status]);

  // Tick while running so the user sees time pressure
  useEffect(() => {
    if (displayStatus !== 'running') return;
    const t = setInterval(() => setElapsed(Date.now() - startTime), 100);
    return () => clearInterval(t);
  }, [displayStatus, startTime]);

  const stateColor =
    displayStatus === 'success' ? 'border-emerald-500/60' :
    displayStatus === 'failure' ? 'border-rose-500/60' :
    style.border;

  const stateBg =
    displayStatus === 'success' ? 'bg-emerald-500/10' :
    displayStatus === 'failure' ? 'bg-rose-500/10' :
    style.bg;

  const stateText =
    displayStatus === 'success' ? 'text-emerald-300' :
    displayStatus === 'failure' ? 'text-rose-300' :
    style.color;

  return (
    <div
      className={`relative inline-flex items-center gap-1.5 px-2.5 py-1 my-1 rounded-full border ${stateColor} ${stateBg} text-[11px] font-mono ${stateText} overflow-hidden select-none max-w-full`}
      title={typeof args === 'object' ? JSON.stringify(args, null, 2) : String(args || '')}
      data-tool={tool}
      data-status={displayStatus}
      style={{ minWidth: 120 }}
    >
      {/* Animated shine sweep */}
      {displayStatus === 'running' && (
        <span
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'linear-gradient(110deg, transparent 0%, transparent 35%, rgba(255,255,255,0.18) 50%, transparent 65%, transparent 100%)',
            animation: 'toolShine 1.6s linear infinite',
            mixBlendMode: 'screen',
          }}
        />
      )}
      {/* Pulse halo while running */}
      {displayStatus === 'running' && (
        <span
          aria-hidden
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            boxShadow: '0 0 0 0 currentColor',
            animation: 'toolPulse 1.4s ease-out infinite',
            opacity: 0.35,
          }}
        />
      )}
      {/* Icon */}
      <span
        className="relative z-10 inline-flex items-center justify-center"
        style={{
          animation: displayStatus === 'running' ? 'toolIconSpin 2s linear infinite' : undefined,
        }}
      >
        {displayStatus === 'success' ? '✅' : displayStatus === 'failure' ? '❌' : style.icon}
      </span>
      {/* Label */}
      <span className="relative z-10 font-semibold whitespace-nowrap">
        {tool.split('__').pop()}
      </span>
      {/* Arg summary */}
      {argSummary && (
        <span className="relative z-10 text-zinc-400 font-normal truncate" style={{ maxWidth: 220 }}>
          {argSummary}
        </span>
      )}
      {/* Time / status */}
      <span className="relative z-10 text-zinc-500 font-normal ml-1 whitespace-nowrap">
        {displayStatus === 'running' ? (
          <span style={{ animation: 'toolDots 1.2s steps(3, end) infinite' }}>···</span>
        ) : displayStatus === 'success' ? (
          formatDuration(durationMs || elapsed)
        ) : (
          'failed'
        )}
      </span>
      {/* Toggle details button */}
      {(result || error) && (
        <button
          onClick={(e) => { e.stopPropagation(); setShowDetails(s => !s); }}
          className="relative z-10 ml-1 text-zinc-500 hover:text-zinc-200 transition-colors"
          title="Toggle result"
        >
          {showDetails ? '▾' : '▸'}
        </button>
      )}
      {/* Details popover */}
      {showDetails && (result || error) && (
        <div
          className="absolute left-0 top-full mt-1 z-50 w-full max-w-md p-2 rounded-md border border-zinc-700 bg-zinc-950/95 text-[10px] font-mono whitespace-pre-wrap break-words shadow-2xl"
          style={{ minWidth: 240 }}
        >
          {error ? (
            <span className="text-rose-300">{truncate(error, 300)}</span>
          ) : (
            <span className="text-zinc-300">{truncate(result, 300)}</span>
          )}
        </div>
      )}
    </div>
  );
}
