'use client';

import { useState, useEffect, useRef } from 'react';
import { useAgentEvents } from '../hooks/useAgentEvents';

/**
 * AgentStatusBar — fixed bottom bar with pop-up agent activity bubbles.
 *
 * Lives at the bottom of the app. When an agent spawns or executes,
 * a bubble pops up showing the agent's emoji + name + what it's doing.
 * Bubbles auto-dismiss after a few seconds, but stay visible while
 * the agent is actively working. Click a bubble to see its full output
 * in a small popover.
 *
 * Visual: cyberpunk-cyan/amber on dark slate, monospace text,
 * slide-up + fade-in animation. No external deps.
 */

interface ActiveBubble {
  id: string;
  agentId: string;
  agentName: string;
  emoji: string;
  division: string;
  status: string;
  task: string;
  output: string;
  spawnedAt: number;
  showDetails: boolean;
}

const BUBBLE_DURATION_MS = 6000; // 6s before auto-fade for completed agents
const MAX_BUBBLES = 8;           // show up to 8 concurrent bubbles

export function AgentStatusBar() {
  const { liveOutputs, towerConnected, eventBusConnected } = useAgentEvents();
  const [bubbles, setBubbles] = useState<ActiveBubble[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());

  // Track which agents we've already shown bubbles for, so we only
  // animate NEW spawns. When status changes (working → completed), update.
  useEffect(() => {
    if (liveOutputs.length === 0) return;
    setBubbles(prev => {
      const updated = [...prev];
      for (const live of liveOutputs) {
        const key = live.agentId;
        if (!seenIdsRef.current.has(key)) {
          // NEW agent — pop up a fresh bubble
          seenIdsRef.current.add(key);
          updated.unshift({
            id: `${key}-${Date.now()}`,
            agentId: key,
            agentName: live.agentName,
            emoji: live.emoji,
            division: live.division,
            status: live.status,
            task: live.output.substring(0, 80),
            output: live.output,
            spawnedAt: Date.now(),
            showDetails: false,
          });
        } else {
          // Existing agent — update status and output
          const idx = updated.findIndex(b => b.agentId === key);
          if (idx >= 0) {
            updated[idx] = {
              ...updated[idx],
              status: live.status,
              output: live.output,
              task: live.output.substring(0, 80),
            };
          }
        }
      }
      // Trim to MAX_BUBBLES — drop oldest completed
      while (updated.length > MAX_BUBBLES) {
        const oldestCompleted = updated.findIndex(b => b.status === 'completed');
        if (oldestCompleted >= 0) updated.splice(oldestCompleted, 1);
        else updated.pop();
      }
      return updated;
    });
  }, [liveOutputs]);

  // Auto-fade completed bubbles after BUBBLE_DURATION_MS
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setBubbles(prev =>
        prev
          .map(b => {
            if (b.status === 'completed' && now - b.spawnedAt > BUBBLE_DURATION_MS) {
              return { ...b, fading: true } as ActiveBubble & { fading: boolean };
            }
            return b as ActiveBubble & { fading: boolean };
          })
          .filter(b => {
            const faded = b as ActiveBubble & { fading: boolean };
            // Drop fully-faded after another 500ms transition
            if (faded.fading && now - b.spawnedAt > BUBBLE_DURATION_MS + 500) {
              seenIdsRef.current.delete(b.agentId);
              return false;
            }
            return true;
          })
      );
    }, 500);
    return () => clearInterval(interval);
  }, []);

  if (bubbles.length === 0 && !towerConnected) {
    // Nothing to show and tower isn't connected — hide the bar entirely
    return null;
  }

  const activeCount = bubbles.filter(b => b.status === 'working').length;
  const completedCount = bubbles.filter(b => b.status === 'completed').length;

  return (
    <div
      data-testid="agent-status-bar"
      className="fixed bottom-0 left-0 right-0 z-40 pointer-events-none"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="flex items-end gap-2 px-3 py-2 pointer-events-auto">
        {/* Connection status pill */}
        <div
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono pointer-events-auto backdrop-blur-md border ${
            towerConnected
              ? 'bg-cyan-500/10 border-cyan-500/40 text-cyan-300'
              : 'bg-zinc-500/10 border-zinc-500/40 text-zinc-400'
          }`}
        >
          <div className={`w-1.5 h-1.5 rounded-full ${towerConnected ? 'bg-cyan-400 animate-pulse' : 'bg-zinc-500'}`} />
          <span className="font-semibold tracking-wider">AGENTS</span>
          {activeCount > 0 && (
            <span className="text-emerald-400 ml-1">● {activeCount} live</span>
          )}
          {completedCount > 0 && (
            <span className="text-zinc-500 ml-1">· {completedCount} done</span>
          )}
        </div>

        {/* Agent bubbles */}
        {bubbles.map(bubble => {
          const isWorking = bubble.status === 'working';
          const isError = bubble.status === 'error';
          const colorClass = isError
            ? 'border-rose-500/60 bg-rose-500/15 text-rose-200'
            : isWorking
              ? 'border-cyan-500/60 bg-cyan-500/15 text-cyan-200'
              : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200';
          const expanded = expandedId === bubble.id;

          return (
            <div
              key={bubble.id}
              data-agent={bubble.agentName}
              data-status={bubble.status}
              onClick={() => setExpandedId(expanded ? null : bubble.id)}
              className={`group relative flex items-center gap-2 px-3 py-1.5 rounded-full border ${colorClass} text-[11px] font-mono cursor-pointer pointer-events-auto backdrop-blur-md transition-all duration-200 hover:scale-105 animate-bubble-pop`}
              style={{
                maxWidth: expanded ? '480px' : '280px',
                animation: 'bubblePop 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            >
              {/* Pulse halo while working */}
              {isWorking && (
                <span
                  aria-hidden
                  className="absolute inset-0 rounded-full pointer-events-none"
                  style={{
                    boxShadow: '0 0 12px 0 currentColor',
                    opacity: 0.3,
                    animation: 'bubblePulse 1.6s ease-in-out infinite',
                  }}
                />
              )}
              {/* Status dot */}
              <div
                className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  isError ? 'bg-rose-400' : isWorking ? 'bg-cyan-300 animate-pulse' : 'bg-emerald-400'
                }`}
              />
              {/* Emoji */}
              <span className="text-sm flex-shrink-0">{bubble.emoji}</span>
              {/* Name + task */}
              <div className="flex flex-col min-w-0">
                <span className="font-bold tracking-wide whitespace-nowrap">
                  {bubble.agentName.toUpperCase()}
                  <span className="text-[9px] opacity-60 ml-1.5">{bubble.division}</span>
                </span>
                <span className="text-[10px] opacity-80 truncate">
                  {isError ? '✗ failed' : isWorking ? '⚙ doing' : '✓ done'} {bubble.task}
                </span>
              </div>
              {/* Spinner for working */}
              {isWorking && (
                <span
                  aria-hidden
                  className="ml-1 inline-block w-2 h-2 border border-cyan-300 border-t-transparent rounded-full flex-shrink-0"
                  style={{ animation: 'spin 0.9s linear infinite' }}
                />
              )}
              {/* Expanded output popover */}
              {expanded && (
                <div
                  className="absolute left-0 bottom-full mb-2 z-50 w-[480px] max-h-60 overflow-y-auto p-3 rounded-md border border-cyan-500/40 bg-zinc-950/95 text-[10px] font-mono whitespace-pre-wrap break-words shadow-2xl"
                  onClick={e => e.stopPropagation()}
                >
                  <div className="text-cyan-400 font-bold mb-1.5 flex items-center gap-2">
                    <span>{bubble.emoji}</span>
                    <span>{bubble.agentName}</span>
                    <span className="text-[9px] text-zinc-500">· {bubble.division}</span>
                    <span className="ml-auto text-[9px] text-zinc-500">
                      {new Date(bubble.spawnedAt).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="text-zinc-300">
                    {bubble.output || <span className="text-zinc-500 italic">no output yet</span>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Animation keyframes — injected once via a <style> tag */}
      <style jsx global>{`
        @keyframes bubblePop {
          0% {
            transform: translateY(20px) scale(0.8);
            opacity: 0;
          }
          60% {
            transform: translateY(-4px) scale(1.05);
            opacity: 1;
          }
          100% {
            transform: translateY(0) scale(1);
            opacity: 1;
          }
        }
        @keyframes bubblePulse {
          0%, 100% { box-shadow: 0 0 8px 0 currentColor; }
          50% { box-shadow: 0 0 16px 2px currentColor; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default AgentStatusBar;
