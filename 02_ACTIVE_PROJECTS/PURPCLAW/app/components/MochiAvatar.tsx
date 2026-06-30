'use client';

/**
 * MochiAvatar — the persistent Mochi companion cat in the bottom-right.
 *
 * Styled as the reference mocks: 3D-rendered purple cat with glowing
 * eyes, sovereign collar with PURP charm, speech bubble with
 * encouraging/commentary messages.
 *
 * Reads /api/mochi for live state. Auto-refreshes every 60s.
 * SSR-safe: null on server, mounts on client.
 */

import { useEffect, useState } from 'react';

type MochiData = {
  species?: string;
  name?: string;
  mood?: string;
  bondLevel?: number;
  message?: string;
  healthStatus?: string;
};

const LINES = [
  "I'm listening. Speak naturally. I'll keep you safe. Always.",
  "Hey Boss! ✋ Systems nominal and Mochi's got your back.",
  "Shall we crush some missions today?",
  "Your bond is growing stronger every day.",
  "All systems purrfect. ✨",
  "I've been thinking about that last task. Want a second pass?",
  "You handled a lot today, Human. Take a breath. I've got your back.",
  "Want to run a mission or just chill for a bit?",
];

export function MochiAvatar() {
  const [mounted, setMounted] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [data, setData] = useState<MochiData>({});
  const [pos, setPos] = useState({ x: 24, y: 60 });
  const [bubble, setBubble] = useState<string>(LINES[0]);
  const [showBubble, setShowBubble] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    setMounted(true);
    try {
      const e = localStorage.getItem('purpclaw.mochi.enabled');
      setEnabled(e !== '0');
      const p = localStorage.getItem('purpclaw.mochi.pos');
      if (p) {
        const [x, y] = p.split(',').map(Number);
        if (Number.isFinite(x) && Number.isFinite(y)) setPos({ x, y });
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (!mounted || !enabled) return;
    const load = async () => {
      try {
        const r = await fetch('/api/mochi', { cache: 'no-store' });
        if (!r.ok) return;
        const d = await r.json();
        setData(prev => ({ ...prev, ...d }));
      } catch {}
    };
    load();
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, [mounted, enabled]);

  // Rotate bubble lines
  useEffect(() => {
    if (!mounted) return;
    const id = setInterval(() => {
      const line = LINES[Math.floor(Math.random() * LINES.length)];
      setBubble(line);
      setShowBubble(true);
    }, 30000);
    return () => clearInterval(id);
  }, [mounted]);

  if (!mounted || !enabled) return null;

  // Drag handling
  const onPointerDown = (e: React.PointerEvent) => {
    setDragging(true);
    setDragOffset({ x: e.clientX - pos.x, y: e.clientY - pos.y });
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    const newX = e.clientX - dragOffset.x;
    const newY = e.clientY - dragOffset.y;
    setPos({ x: newX, y: newY });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (!dragging) return;
    setDragging(false);
    try {
      localStorage.setItem('purpclaw.mochi.pos', `${pos.x},${pos.y}`);
    } catch {}
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  return (
    <div
      style={{
        position: 'fixed',
        left: `${pos.x}px`,
        bottom: `${pos.y}px`,
        zIndex: 100,
        cursor: dragging ? 'grabbing' : 'grab',
        touchAction: 'none',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {/* Speech bubble */}
      {showBubble && (
        <div
          className="absolute bottom-full right-0 mb-3 w-64 glass sovereign p-3"
          style={{ animation: 'fadeIn 0.4s ease-out' }}
          onClick={() => setShowBubble(false)}
        >
          <div className="flex items-start gap-2">
            <div className="flex-shrink-0 mt-0.5">
              <span className="dot dot-sovereign" style={{ width: 8, height: 8 }} />
            </div>
            <div className="text-[11px] leading-relaxed text-[var(--text-primary)]">
              {data.message || bubble}
            </div>
          </div>
          <div className="text-[9px] mono text-[var(--accent-magenta)] mt-2 tracking-widest">
            MOCHI · {data.mood?.toUpperCase() || 'HAPPY'}
          </div>
          {/* Triangle pointer */}
          <div className="absolute -bottom-1.5 right-8 w-3 h-3 rotate-45" style={{ background: 'var(--bg-glass)', borderRight: '1px solid var(--border-magenta)', borderBottom: '1px solid var(--border-magenta)' }} />
        </div>
      )}

      {/* The cat itself */}
      <div className="relative" style={{ filter: 'drop-shadow(0 0 16px rgba(217,70,239,0.45))' }}>
        <MochiSvg />

        {/* Companion pill (name + mood) */}
        <div className="absolute -top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded text-[9px] mono font-bold tracking-wider" style={{
          background: 'linear-gradient(135deg, rgba(217,70,239,0.85), rgba(168,85,247,0.85))',
          color: 'white',
          whiteSpace: 'nowrap',
          boxShadow: '0 0 8px rgba(217,70,239,0.5)',
        }}>
          MOCHI · {data.mood?.toUpperCase() || 'HAPPY'}
        </div>
      </div>

      {/* Click target — dismiss bubble or open details */}
      <div
        className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[10px] cursor-pointer"
        style={{
          background: 'var(--bg-tertiary)',
          border: '1px solid var(--border-default)',
          color: 'var(--text-muted)',
        }}
        onClick={(e) => { e.stopPropagation(); setShowBubble(s => !s); }}
      >
        ✕
      </div>
    </div>
  );
}

/**
 * MochiSvg — the purple-black cat mascot.
 * Pure SVG so it scales cleanly and matches the cyberpunk aesthetic.
 */
function MochiSvg() {
  return (
    <svg width="120" height="140" viewBox="0 0 120 140" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="mochiBody" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#3a2056" />
          <stop offset="60%" stopColor="#1a0e2e" />
          <stop offset="100%" stopColor="#0a0518" />
        </radialGradient>
        <radialGradient id="mochiGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#d946ef" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#d946ef" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="mochiEye" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#ec4899" />
          <stop offset="50%" stopColor="#d946ef" />
          <stop offset="100%" stopColor="#7c3aed" />
        </linearGradient>
        <linearGradient id="mochiCollar" x1="0" x2="1">
          <stop offset="0%" stopColor="#d946ef" />
          <stop offset="50%" stopColor="#a855f7" />
          <stop offset="100%" stopColor="#d946ef" />
        </linearGradient>
        <radialGradient id="mochiCharm" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fbbf24" />
          <stop offset="50%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#7c2d12" />
        </radialGradient>
        <filter id="mochiGlowFx" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Outer glow halo */}
      <ellipse cx="60" cy="80" rx="55" ry="60" fill="url(#mochiGlow)" />

      {/* Body / haunches */}
      <ellipse cx="60" cy="100" rx="38" ry="32" fill="url(#mochiBody)" stroke="#d946ef" strokeWidth="0.5" strokeOpacity="0.4" />

      {/* Tail curling around right side */}
      <path
        d="M 92 95 Q 110 88, 105 70 Q 100 58, 88 64"
        stroke="#1a0e2e"
        strokeWidth="11"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M 92 95 Q 110 88, 105 70 Q 100 58, 88 64"
        stroke="#3a2056"
        strokeWidth="9"
        strokeLinecap="round"
        fill="none"
      />
      {/* Tail tip glow */}
      <circle cx="88" cy="64" r="3" fill="#d946ef" filter="url(#mochiGlowFx)" />

      {/* Front paws */}
      <ellipse cx="45" cy="125" rx="9" ry="6" fill="#0a0518" />
      <ellipse cx="75" cy="125" rx="9" ry="6" fill="#0a0518" />
      <ellipse cx="45" cy="122" rx="3" ry="2" fill="#d946ef" opacity="0.6" />
      <ellipse cx="75" cy="122" rx="3" ry="2" fill="#d946ef" opacity="0.6" />

      {/* Head */}
      <ellipse cx="60" cy="65" rx="32" ry="30" fill="url(#mochiBody)" stroke="#d946ef" strokeWidth="0.5" strokeOpacity="0.4" />

      {/* Ears (left + right) */}
      <path d="M 32 50 L 28 25 L 48 38 Z" fill="#1a0e2e" stroke="#d946ef" strokeWidth="0.5" strokeOpacity="0.4" />
      <path d="M 32 50 L 28 25 L 48 38 Z" fill="#d946ef" opacity="0.15" />
      <path d="M 88 50 L 92 25 L 72 38 Z" fill="#1a0e2e" stroke="#d946ef" strokeWidth="0.5" strokeOpacity="0.4" />
      <path d="M 88 50 L 92 25 L 72 38 Z" fill="#d946ef" opacity="0.15" />

      {/* Inner ears (pink) */}
      <path d="M 36 44 L 34 32 L 44 39 Z" fill="#ec4899" opacity="0.7" />
      <path d="M 84 44 L 86 32 L 76 39 Z" fill="#ec4899" opacity="0.7" />

      {/* Eyes — large glowing purple */}
      <ellipse cx="48" cy="60" rx="9" ry="11" fill="#0a0518" />
      <ellipse cx="72" cy="60" rx="9" ry="11" fill="#0a0518" />
      <ellipse cx="48" cy="62" rx="6" ry="8" fill="url(#mochiEye)" filter="url(#mochiGlowFx)" />
      <ellipse cx="72" cy="62" rx="6" ry="8" fill="url(#mochiEye)" filter="url(#mochiGlowFx)" />
      {/* Eye highlights */}
      <circle cx="50" cy="58" r="1.5" fill="#fff" opacity="0.95" />
      <circle cx="74" cy="58" r="1.5" fill="#fff" opacity="0.95" />
      <circle cx="46" cy="64" r="0.8" fill="#f0abfc" />
      <circle cx="70" cy="64" r="0.8" fill="#f0abfc" />

      {/* Nose */}
      <path d="M 58 72 L 62 72 L 60 75 Z" fill="#ec4899" />
      {/* Mouth */}
      <path d="M 60 75 Q 56 78, 53 76" stroke="#d946ef" strokeWidth="0.7" fill="none" strokeOpacity="0.6" />
      <path d="M 60 75 Q 64 78, 67 76" stroke="#d946ef" strokeWidth="0.7" fill="none" strokeOpacity="0.6" />

      {/* Whiskers */}
      <line x1="38" y1="70" x2="50" y2="71" stroke="#a855f7" strokeWidth="0.4" opacity="0.6" />
      <line x1="38" y1="73" x2="50" y2="73" stroke="#a855f7" strokeWidth="0.4" opacity="0.6" />
      <line x1="82" y1="70" x2="70" y2="71" stroke="#a855f7" strokeWidth="0.4" opacity="0.6" />
      <line x1="82" y1="73" x2="70" y2="73" stroke="#a855f7" strokeWidth="0.4" opacity="0.6" />

      {/* Collar */}
      <ellipse cx="60" cy="100" rx="20" ry="4" fill="url(#mochiCollar)" />
      <ellipse cx="60" cy="100" rx="20" ry="4" fill="none" stroke="#fff" strokeOpacity="0.3" />

      {/* Charm — PURP token */}
      <circle cx="60" cy="106" r="5" fill="url(#mochiCharm)" stroke="#fbbf24" strokeWidth="0.5" filter="url(#mochiGlowFx)" />
      <text x="60" y="109" textAnchor="middle" fontSize="6" fontWeight="900" fill="#7c2d12" fontFamily="JetBrains Mono, monospace">P</text>

      {/* Sparkle particles around cat */}
      <circle cx="15" cy="40" r="1" fill="#d946ef" opacity="0.8" />
      <circle cx="105" cy="30" r="1" fill="#a855f7" opacity="0.7" />
      <circle cx="20" cy="100" r="0.8" fill="#ec4899" opacity="0.6" />
      <circle cx="100" cy="115" r="0.8" fill="#f0abfc" opacity="0.7" />
      <circle cx="50" cy="15" r="0.6" fill="#d946ef" opacity="0.5" />
      <circle cx="70" cy="20" r="0.6" fill="#a855f7" opacity="0.5" />
    </svg>
  );
}
