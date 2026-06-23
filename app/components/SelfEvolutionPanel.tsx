'use client';

import { useEffect, useState } from 'react';

export function SelfEvolutionPanel() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setTick(t => t + 1), 3000);
    return () => clearInterval(i);
  }, []);

  const learnings = 4823 + (tick % 5);
  const adaptations = 1392 + (tick % 3);
  const evalScore = 0.074 + (Math.sin(tick * 0.5) * 0.002);
  const drift = 0.021 + (Math.cos(tick * 0.3) * 0.001);

  return (
    <div style={{
      background: 'linear-gradient(180deg, rgba(18,10,31,0.85), rgba(10,6,18,0.95))',
      border: '1px solid var(--border-default)',
      borderRadius: 8,
      padding: 12,
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: '#d946ef', fontWeight: 700, letterSpacing: 1.5, textShadow: '0 0 8px rgba(217,70,239,0.4)' }}>SELF-EVOLUTION</span>
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>· GENESIS v0.9.18</span>
        </div>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, color: '#fbbf24', fontWeight: 700, letterSpacing: 1 }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#fbbf24', boxShadow: '0 0 6px #fbbf24', animation: 'pulse 2s ease-in-out infinite' }} />
          EVOLVING
        </span>
      </div>

      {/* Body: brain + stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 12, alignItems: 'center' }}>
        {/* 3D brain visualization */}
        <div style={{ position: 'relative', height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%' }}>
            <defs>
              <radialGradient id="brain-glow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#d946ef" stopOpacity="0.6" />
                <stop offset="100%" stopColor="#a855f7" stopOpacity="0" />
              </radialGradient>
            </defs>
            <circle cx="50" cy="50" r="48" fill="url(#brain-glow)" />
            {/* Brain hemispheres via overlapping circles */}
            <g opacity="0.9">
              <ellipse cx="40" cy="50" rx="20" ry="26" fill="none" stroke="#d946ef" strokeWidth="0.5" />
              <ellipse cx="60" cy="50" rx="20" ry="26" fill="none" stroke="#a855f7" strokeWidth="0.5" />
              {/* Neural pathways */}
              {Array.from({ length: 12 }, (_, i) => {
                const angle = (i * 30) * (Math.PI / 180);
                const r1 = 14 + (i % 3) * 4;
                const r2 = 22 - (i % 3) * 3;
                const x1 = 50 + Math.cos(angle) * r1;
                const y1 = 50 + Math.sin(angle) * r1;
                const x2 = 50 + Math.cos(angle + 0.3) * r2;
                const y2 = 50 + Math.sin(angle + 0.3) * r2;
                return (
                  <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
                    stroke="#d946ef" strokeWidth="0.4" opacity={0.5 + Math.sin((tick + i) * 0.5) * 0.5} />
                );
              })}
              {/* Active neuron nodes */}
              {[[35, 40], [50, 35], [65, 40], [40, 55], [60, 55], [50, 65], [45, 50], [55, 50]].map(([x, y], i) => (
                <circle key={i} cx={x} cy={y} r="1.5" fill={i % 2 === 0 ? '#d946ef' : '#22d3ee'}
                  style={{ filter: `drop-shadow(0 0 4px ${i % 2 === 0 ? '#d946ef' : '#22d3ee'})` }}>
                </circle>
              ))}
            </g>
            {/* Faint fissures */}
            <path d="M 50 28 Q 48 38 50 48 Q 52 58 50 70" fill="none" stroke="rgba(217,70,239,0.4)" strokeWidth="0.3" />
          </svg>
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 36, opacity: 0.85, filter: 'drop-shadow(0 0 12px #d946ef)',
          }}>
            🧠
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <Stat label="LEARNINGS"    value={learnings.toLocaleString()} color="#d946ef" />
          <Stat label="ADAPTATIONS"  value={adaptations.toLocaleString()} color="#a855f7" />
          <Stat label="EVAL SCORE"   value={evalScore.toFixed(3)}          color="#22d3ee" />
          <Stat label="DRIFT"        value={drift.toFixed(3)}              color="#fbbf24" />
        </div>
      </div>

      {/* Footer: status + actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 6, borderTop: '1px solid var(--border-subtle)' }}>
        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', letterSpacing: 1 }}>STATUS: <b style={{ color: '#fbbf24' }}>EVOLVING</b></span>
        <button style={{ padding: '3px 8px', background: 'rgba(217,70,239,0.15)', border: '1px solid rgba(217,70,239,0.3)', borderRadius: 3, fontSize: 9, color: '#d946ef', fontWeight: 700, letterSpacing: 1, cursor: 'pointer' }}>VIEW LOG →</button>
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 8px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 3 }}>
      <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', letterSpacing: 0.8, textTransform: 'uppercase' }}>{label}</span>
      <span style={{ fontSize: 11, color, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>{value}</span>
    </div>
  );
}
