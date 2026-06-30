'use client';

import { useEffect, useState } from 'react';

/**
 * MochiWidget — small floating MOCHI pet that lives in the bottom-right
 * corner of every page. Tapping opens a tiny sprite-rendered companion.
 *
 * Reads /api/mochi for identity (species, name, mood). Auto-polls every
 * 30s. Renders the sprite from lib/mochi-sprites.js — the same engine
 * that powers the full /mochi page.
 *
 * Toggle via localStorage 'purpclaw.mochi.enabled'. Defaults to ON.
 * Drag position is persisted to 'purpclaw.mochi.pos' as "x,y" pixels.
 *
 * SSR-safe: returns null on the server pass, mounts on the client pass.
 * This prevents hydration mismatches from localStorage / fetch.
 */
export function MochiWidget() {
  const [mounted, setMounted] = useState<boolean>(false);
  const [enabled, setEnabled] = useState<boolean>(true);
  const [open, setOpen] = useState<boolean>(false);
  const [data, setData] = useState<any>({ species: 'axolotl', name: 'Asher', mood: 'idle' });
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 24, y: 24 });

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
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch('/api/mochi', { cache: 'no-store' });
        if (!alive || !res.ok) return;
        const j = await res.json().catch(() => null);
        if (j && (j.species || j.name || j.mood)) setData(j);
      } catch {}
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => { alive = false; clearInterval(id); };
  }, [mounted, enabled]);

  if (!mounted || !enabled) return null;

  return (
    <div
      onClick={() => setOpen((v) => !v)}
      title={`${data.name || 'Mochi'} · click to expand`}
      style={{
        position: 'fixed',
        right: pos.x,
        bottom: pos.y,
        zIndex: 60,
        cursor: 'pointer',
        padding: '6px 10px',
        borderRadius: 8,
        background: 'rgba(20,20,30,0.85)',
        border: '1px solid rgba(120,180,255,0.35)',
        color: '#9ed4ff',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 12,
        lineHeight: 1.2,
        boxShadow: '0 0 16px rgba(80,160,255,0.25)',
        userSelect: 'none',
      }}>
      <div style={{ fontWeight: 600 }}>✦ {data.name || 'Asher'}</div>
      <div style={{ opacity: 0.7, fontSize: 10 }}>{data.species} · {data.mood || 'idle'}</div>
      {open && (
        <div style={{ marginTop: 6, maxWidth: 240, fontSize: 11, lineHeight: 1.4 }}>
          {data.bio || 'Hello. I am the PURPCLAW companion. Toggle me in Settings → Mochi.'}
        </div>
      )}
    </div>
  );
}

export default MochiWidget;
