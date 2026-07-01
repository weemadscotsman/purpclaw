'use client';

/**
 * MOCHI · Mission Control Tamagotchi
 * ===================================
 * Retro Game Boy CRT Tamagotchi for your PURPCLAW companion.
 * Ported from menu_mochi_extension (Chrome extension) to live PURPCLAW data.
 *
 *   - Reads /api/mochi for companion identity (species, name, hat, eye)
 *   - Reads pool stats (port 7885) via /api/service-proxy
 *   - Reads reasoning health (port 7892) for "alive" indicator
 *   - Stats are computed from real swarm state, not random numbers
 */

import { useEffect, useRef, useState, useCallback } from 'react';

// Real face engine — loaded dynamically for Next.js SSR compat
type Mochi = {
  hatched: boolean;
  name?: string;
  species?: string;
  eye?: string;
  hat?: string;
  rarity?: string;
  shiny?: boolean;
  tone?: string;
  verb?: string;
  hatchedAt?: string;
  interactions?: number;
  bond?: number;
  lastFedAt?: string | null;
  lastPlayedAt?: string | null;
  lastCleanedAt?: string | null;
  lastSleptAt?: string | null;
  mood?: string;
  hint?: string;
};

type PoolStats = {
  skillsCount?: number;
  agentsCount?: number;
  routingProfiles?: number;
  memories?: number;
  failures?: number;
  queries?: number;
  uptimeSec?: number;
};

type ReasoningHealth = {
  status?: string;
  tickCount?: number;
  intervalMs?: number;
  uptimeSec?: number;
};

const FACES: Record<string, (e: string) => string> = {
  duck    : e => `(${e}>`,         goose   : e => `(${e}>`,
  blob    : e => `(${e}${e})`,    cat     : e => `=${e}ω${e}=`,
  dragon  : e => `<${e}~${e}>`,    octopus : e => `~(${e}${e})~`,
  owl     : e => `(${e})(${e})`,  penguin : e => `(${e}>)`,
  turtle  : e => `[${e}_${e}]`,    snail   : e => `${e}(@)`,
  ghost   : e => `/${e}${e}\\`,    axolotl : e => `}${e}.${e}{`,
  capybara: e => `(${e}oo${e})`,   cactus  : e => `|${e}  ${e}|`,
  robot   : e => `[${e}${e}]`,    rabbit  : e => `(${e}..${e})`,
  mushroom: e => `|${e}  ${e}|`,   chonk   : e => `(${e}.${e})`,
};

function face(species?: string, eye?: string, mood?: string): string {
  const e = eye || '·';
  const fn = species && FACES[species];
  return fn ? fn(e) : `(${e}${e})`;
}

// Stats derived from real PURPCLAW state, not random
function computeStats(mochi: Mochi | null, pool: PoolStats | null, reasoning: ReasoningHealth | null) {
  const interactions = mochi?.interactions || 0;
  const bond = mochi?.bond ?? 0;
  const poolAlive    = pool !== null;
  const reasoningOn  = reasoning?.status === 'healthy';
  const failures     = pool?.failures || 0;
  const memories     = pool?.memories || 0;
  const ticks        = reasoning?.tickCount || 0;

  // Action decay: each stat is "full" right after its action, decays linearly to 0 over the action window.
  const now = Date.now();
  const decay = (iso: string | null | undefined, windowMs: number) => {
    if (!iso) return 0;          // never done → 0
    const age = now - new Date(iso).getTime();
    if (age < 0) return 100;     // future timestamp (clock skew) → treat as fresh
    return Math.max(0, Math.min(100, 100 * (1 - age / windowMs)));
  };
  const FOOD  = poolAlive ? Math.max(decay(mochi?.lastFedAt, 4 * 3600_000), 40) : 10;
  const CLEAN = Math.max(decay(mochi?.lastCleanedAt, 6 * 3600_000), 20);
  const REST  = Math.max(decay(mochi?.lastSleptAt, 8 * 3600_000), reasoningOn ? 30 : 80);
  // BORED is inverse of PLAY: starts at 100, decays toward 0 over 2h after play
  const BORED = 100 - decay(mochi?.lastPlayedAt, 2 * 3600_000);
  // JOY comes from interactions + bond + pool liveness
  const JOY  = Math.min(100, 30 + bond * 0.5 + Math.min(40, interactions * 4) + (poolAlive ? 10 : 0));
  return { FOOD: Math.round(FOOD), JOY: Math.round(JOY), CLEAN: Math.round(CLEAN), REST: Math.round(REST), BORED: Math.round(BORED), BOND: Math.round(bond) };
}

function moodLabel(stats: ReturnType<typeof computeStats>) {
  if (stats.FOOD < 30)  return 'hungry';
  if (stats.CLEAN < 30) return 'dirty';
  if (stats.REST < 30)  return 'sleeping';
  if (stats.BORED > 70) return 'bored';
  if (stats.JOY > 70)   return 'happy';
  return 'idle';
}

const FACE_OVERRIDES: Record<string, string> = {
  hungry  : '•﹏•',
  dirty   : 'x_x',
  sleeping: '-_-',
  bored   : '◔_◔',
  happy   : '^ᴗ^',
  idle    : '·ᴗ·',
};

export default function MochiPage() {
  const [mochi, setMochi]         = useState<Mochi | null>(null);
  const [pool, setPool]           = useState<PoolStats | null>(null);
  const [reasoning, setReasoning] = useState<ReasoningHealth | null>(null);
  const [diary, setDiary]         = useState<string[]>([]);
  const [busy, setBusy]           = useState<string | null>(null); // which button is active
  const [petState, setPetState]   = useState<string | null>(null); // 'eating' | 'playing' | 'sleeping' | 'cleaning' | 'purring'
  const [particles, setParticles] = useState<Array<{ id: number; emoji: string; dx: number; ts: number }>>([]);
  const [blinking, setBlinking]   = useState(false);
  const particleIdRef = useRef(0);

  // Initial + polling refresh
  useEffect(() => {
    const tick = async () => {
      try {
        const [m, p, r] = await Promise.all([
          fetch('/api/mochi').then(x => x.json()).catch(() => null),
          fetch('/api/service-proxy?port=7885&path=%2Fpool%2Fstats').then(x => x.json()).catch(() => null),
          fetch('/api/service-proxy?port=7892&path=%2Fhealth').then(x => x.json()).catch(() => null),
        ]);
        if (m && m.hatched) setMochi(m);
        else if (m) setMochi(m);
        // service-proxy wraps the upstream body in { data: ... } — unwrap it
        if (p && !p.error) {
          const poolData = p.data && typeof p.data === 'object' ? p.data : p;
          setPool(poolData as any);
        }
        if (r && !r.error && r.status === 'healthy') setReasoning(r);
      } catch { /* swallow */ }
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => clearInterval(id);
  }, []);

  const stats = computeStats(mochi, pool, reasoning);
  const mood  = moodLabel(stats);
  const faceText = FACE_OVERRIDES[mood] || (mochi ? face(mochi.species, mochi.eye, mood) : '(·_·)');
  // Don't set the early-return faceText — use the live recompute below

  function logDiary(line: string) {
    setDiary(d => [`[${new Date().toLocaleTimeString()}] ${line}`, ...d].slice(0, 30));
  }

  function spawnParticles(emojis: string[], count = 6) {
    const now = Date.now();
    const fresh = Array.from({ length: count }, () => ({
      id: ++particleIdRef.current,
      emoji: emojis[Math.floor(Math.random() * emojis.length)],
      dx: (Math.random() - 0.5) * 80, // horizontal jitter ±40px
      ts: now,
    }));
    setParticles((p) => [...p, ...fresh]);
    // Garbage-collect particles after their animation finishes (1.6s)
    setTimeout(() => {
      const firstId = fresh[0]?.id ?? 0;
      const lastId = fresh[fresh.length - 1]?.id ?? 0;
      setParticles((p) => p.filter((x) => x.id < firstId || x.id > lastId));
    }, 1700);
  }

  const actionFx: Record<string, { emojis: string[]; pet: string; dur: number }> = {
    feed : { emojis: ['🍖', '🥩', '🍎', '🍞', '💧'], pet: 'eating',   dur: 1400 },
    play : { emojis: ['✨', '🎾', '🪀', '⚽', '🎀'],   pet: 'playing',  dur: 1600 },
    clean: { emojis: ['💧', '🫧', '✨', '🧼', '💦'],   pet: 'cleaning', dur: 1300 },
    sleep: { emojis: ['💤', '💭', '⭐', '🌙'],          pet: 'sleeping', dur: 1800 },
    pet  : { emojis: ['❤️', '💖', '💕', '💗', '✨'],   pet: 'purring',  dur: 1500 },
  };

  async function onAction(label: string, action: string) {
    if (busy) return;
    setBusy(action);
    logDiary(`${label}: sending...`);
    try {
      const res = await fetch('/api/mochi-action', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      logDiary(`${label}: ${data.message || (data.ok ? 'done' : data.error || 'failed')}`);
      if (data.detail?.found) logDiary(`  → ${data.detail.found}`);
      if (data.ok) {
      // Spawn particles + pet-state for the feels
      const fx = actionFx[action];
      if (fx) {
        spawnParticles(fx.emojis, 7);
        setPetState(fx.pet);
        setTimeout(() => setPetState(null), fx.dur);
      }
      // Bump local mochi state so the UI reflects the interaction immediately
      if (mochi) {
        const nowIso = new Date().toISOString();
        const bondGain = action === 'pet' ? 12 : 8;
        const updated: any = {
          ...mochi,
          interactions: (mochi.interactions || 0) + 1,
          bond: Math.min(100, (mochi.bond ?? 0) + bondGain),
        };
        if (action === 'feed')   updated.lastFedAt    = nowIso;
        if (action === 'play')   updated.lastPlayedAt = nowIso;
        if (action === 'clean')  updated.lastCleanedAt = nowIso;
        if (action === 'sleep')  updated.lastSleptAt  = nowIso;
        setMochi(updated);
      }
      } // close if (data.ok)
    } catch (e: any) {
      logDiary(`${label}: error — ${e.message}`);
    } finally {
      setBusy(null);
    }
  }

  // Random blink every 3-6 seconds (the pet feels alive between actions)
  useEffect(() => {
    let id: any;
    const schedule = () => {
      id = setTimeout(() => {
        setBlinking(true);
        setTimeout(() => setBlinking(false), 160);
        schedule();
      }, 3000 + Math.random() * 3000);
    };
    schedule();
    return () => clearTimeout(id);
  }, []);

  // Compute the "in-action" face overlay — overrides the mood face for ~1.5s after an action
  const actionFace: Record<string, string> = {
    eating  : 'ᐛ﹏ᐛ',
    playing : '★ω★',
    cleaning: '✧﹏✧',
    sleeping: '-ˍ-',
    purring : 'ᵔ﹏ᵔ',
  };
  const displayFace = petState
    ? (actionFace[petState] || faceText)
    : faceText;
  const moodClass = `mood-${mood}`;

  if (mochi && !mochi.hatched) {
    return (
      <main className="mochi-shell">
        <h1>MOCHI</h1>
        <p>No companion hatched yet.</p>
        <p style={{ marginTop: 12, fontSize: 12, opacity: 0.8 }}>{mochi.hint}</p>
        <style jsx>{`
          .mochi-shell { min-height: 100vh; padding: 40px; background: #101018; color: #fff6d6; font-family: 'Courier New', monospace; }
          h1 { font-size: 32px; letter-spacing: 1px; text-shadow: 2px 2px 0 #ff3df2, -2px 0 0 #38f8ff; }
        `}</style>
      </main>
    );
  }

  return (
    <main className="mochi-shell">
      <div className="card">
        <header className="topline">
          <div>
            <h1>{mochi?.name || 'MOCHI'}</h1>
            <p className="subtitle">
              {mochi?.species || 'mochi'} · {mochi?.rarity || 'common'}
              {mochi?.shiny && <span className="shiny"> ✨ shiny</span>}
              {mochi?.hat && mochi.hat !== 'none' && <span> · {mochi.hat}</span>}
            </p>
          </div>
          <div className="link-block">
            <span className={`dot ${reasoning ? 'alive' : 'idle'}`} />
            <span className="link-label">{reasoning ? `ticking · ${reasoning.tickCount || 0}` : 'idle'}</span>
          </div>
        </header>

        {/* CRT screen with face */}
        <section className={`screen crt mood-${mood}${petState ? ` pet-${petState}` : ''}${blinking ? ' blinking' : ''}`}>
          <div className="pet-wrap">
            {/* Floating particles — keyed by id, GC'd after their animation */}
            {particles.map((p) => (
              <span
                key={p.id}
                className="particle"
                style={{ ['--dx' as any]: `${p.dx}px` }}
              >{p.emoji}</span>
            ))}
            <div className="pet"><div className="pet-face">{displayFace}</div></div>
          </div>
          <div className="mood">{mood.toUpperCase()}</div>
        </section>

        {/* Stats */}
        <section className="stats">
          {(['FOOD', 'JOY', 'CLEAN', 'REST', 'BORED', 'BOND'] as const).map(key => {
            const v = stats[key];
            const bar = '█'.repeat(Math.round(v / 10)).padEnd(10, '░');
            return (
              <div className="stat" key={key}>
                <span className="stat-label">{key}</span>
                <span className={`stat-bar v-${Math.round(v / 25)}`}>{bar}</span>
                <span className="stat-num">{v}</span>
              </div>
            );
          })}
        </section>

        {/* Action buttons */}
        <section className="buttons">
          <button onClick={() => onAction('FEED', 'feed')} data-action="feed" disabled={!!busy}>
            <b>A</b> {busy === 'feed' ? '...' : 'FEED'}
          </button>
          <button onClick={() => onAction('PLAY', 'play')} data-action="play" disabled={!!busy}>
            <b>B</b> {busy === 'play' ? '...' : 'PLAY'}
          </button>
          <button onClick={() => onAction('CLEAN', 'clean')} data-action="clean" disabled={!!busy}>
            <b>C</b> {busy === 'clean' ? '...' : 'CLEAN'}
          </button>
          <button onClick={() => onAction('SLEEP', 'sleep')} data-action="sleep" disabled={!!busy}>
            <b>D</b> {busy === 'sleep' ? '...' : 'SLEEP'}
          </button>
          <button onClick={() => onAction('PET', 'pet')} data-action="pet" disabled={!!busy} style={{ background: '#ff7ab6', color: '#0d0d11' }}>
            <b>♥</b> {busy === 'pet' ? '...' : 'PET'}
          </button>
        </section>

        {/* Pool snapshot */}
        <section className="pool">
          <h2>POOL · {pool ? '✓ alive' : '✗ offline'}</h2>
          {pool && (
            <div className="pool-grid">
              <div><span>SKILLS</span><b>{pool.skillsCount || 0}</b></div>
              <div><span>AGENTS</span><b>{pool.agentsCount || 0}</b></div>
              <div><span>MEMORIES</span><b>{pool.memories || 0}</b></div>
              <div><span>FAILURES</span><b>{pool.failures || 0}</b></div>
              <div><span>QUERIES</span><b>{pool.queries || 0}</b></div>
              <div><span>UPTIME</span><b>{Math.round((pool.uptimeSec || 0) / 60)}m</b></div>
            </div>
          )}
        </section>

        {/* Diary */}
        <section className="diary">
          <h2>📔 DIARY</h2>
          <div className="diary-body">
            {diary.length === 0 && <div className="diary-empty">No actions yet. Press a button.</div>}
            {diary.map((line, i) => <div key={i}>{line}</div>)}
          </div>
        </section>

        {/* COMPANION CHORUS — terminal companions from ~/.companion-chorus/companions.json */}
        <ChorusPanel />
      </div>

      <style jsx>{`
        .mochi-shell {
          min-height: 100vh;
          padding: 40px 20px;
          background: radial-gradient(circle at 40% 20%, #2e245b 0, #101018 45%, #05050a 100%);
          color: #fff6d6;
          font-family: 'Courier New', monospace;
          display: flex;
          justify-content: center;
        }
        .card {
          width: 100%;
          max-width: 560px;
          padding: 18px;
          border: 4px solid #05050a;
          background: #1b1b2b;
          box-shadow: inset 0 0 0 3px #ff3df2, inset 0 0 40px #000, 8px 8px 0 #000;
        }
        .topline { display: flex; align-items: start; justify-content: space-between; gap: 10px; }
        h1 { margin: 0; font-size: 30px; letter-spacing: 1px; text-shadow: 2px 2px 0 #ff3df2, -2px 0 0 #38f8ff; }
        .subtitle { margin: 4px 0 0; font-size: 12px; opacity: 0.9; }
        .shiny { color: #ffe14d; font-weight: 900; }
        .link-block { display: flex; align-items: center; gap: 6px; padding: 6px 10px; background: #060611; border: 3px solid #05050a; }
        .dot { width: 10px; height: 10px; border-radius: 50%; background: #555; }
        .dot.alive { background: #6dff7a; box-shadow: 0 0 8px #6dff7a; animation: pulse 2s infinite; }
        @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.5 } }
        .link-label { font-size: 11px; font-weight: 900; }

        .screen { margin-top: 16px; height: 200px; border: 5px solid #05050a; border-radius: 18px;
                  background: #9bbc0f; position: relative; overflow: hidden;
                  box-shadow: inset 0 0 0 5px #306230, 6px 6px 0 #000; display: grid; place-items: center; }
        .crt::after { content: ''; position: absolute; inset: 0;
                       background: repeating-linear-gradient(0deg, rgba(0,0,0,.18), rgba(0,0,0,.18) 2px, transparent 2px, transparent 5px);
                       pointer-events: none; mix-blend-mode: multiply; }
        .crt::before { content: ''; position: absolute; inset: -20%;
                        background: radial-gradient(circle, transparent 60%, rgba(0,0,0,.28)); pointer-events: none; }
        .pet { width: 120px; height: 120px; position: relative;
               animation: bob 1.2s steps(2) infinite; filter: drop-shadow(4px 4px 0 rgba(0,0,0,.4));
               display: grid; place-items: center; }
        .pet::before { content: ''; position: absolute; inset: 22px 18px 18px;
                       background: #0f380f; border-radius: 42% 42% 35% 35%;
                       box-shadow: inset 0 -12px 0 #306230, -14px 20px 0 -4px #0f380f, 14px 20px 0 -4px #0f380f; }
        .pet-face { position: relative; color: #9bbc0f; font-weight: 900; font-size: 24px; letter-spacing: 1px; z-index: 1; }
        @keyframes bob { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-6px) } }
        .mood { position: absolute; left: 12px; bottom: 10px; right: 12px;
                color: #0f380f; font-weight: 900; text-align: center; font-size: 12px; letter-spacing: 2px; }

        .stats { margin-top: 16px; display: grid; gap: 8px; }
        .stat { display: grid; grid-template-columns: 60px 1fr 40px; align-items: center; gap: 10px;
                font-size: 13px; font-weight: 900; }
        .stat-label { font-size: 11px; }
        .stat-bar { font-family: 'Courier New', monospace; letter-spacing: 1px; }
        .v-0, .v-1 { color: #ff4f61; }
        .v-2 { color: #ffe14d; }
        .v-3, .v-4 { color: #38f8ff; }
        .stat-num { text-align: right; font-size: 11px; opacity: 0.7; }

        .buttons { margin-top: 16px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .buttons button { background: #38f8ff; border: 4px solid #05050a; color: #05050a;
                          font-weight: 900; padding: 12px; border-radius: 12px;
                          font-family: 'Courier New', monospace; cursor: pointer; box-shadow: 5px 5px 0 #000;
                          transition: transform .08s; }
        .buttons button[data-action="play"]  { background: #ff3df2; color: white; }
        .buttons button[data-action="clean"] { background: #ffe14d; }
        .buttons button[data-action="sleep"] { background: #6dff7a; }
        .buttons button:active { transform: translate(3px, 3px); box-shadow: 2px 2px 0 #000; }
        .buttons button:disabled { opacity: 0.45; cursor: not-allowed; transform: none; }
        .buttons b { display: inline-grid; place-items: center; width: 24px; height: 24px;
                     margin-right: 6px; border-radius: 50%; background: #05050a; color: white; }

        .pool { margin-top: 16px; padding: 12px; border: 4px solid #05050a;
                 background: #060611; box-shadow: 5px 5px 0 #000; }
        .pool h2 { margin: 0 0 8px; font-size: 14px; color: #ffe14d; letter-spacing: 1px; }
        .pool-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; font-size: 11px; }
        .pool-grid > div { display: flex; flex-direction: column; gap: 2px; }
        .pool-grid span { color: #888; font-size: 10px; }
        .pool-grid b { color: #38f8ff; font-size: 16px; font-weight: 900; }

        .diary { margin-top: 16px; padding: 12px; border: 4px solid #05050a;
                  background: #060611; box-shadow: 5px 5px 0 #000; }
        .diary h2 { margin: 0 0 8px; font-size: 14px; color: #ffe14d; letter-spacing: 1px; }
        .diary-body { max-height: 160px; overflow: auto; font-size: 11px; line-height: 1.5; }
        .diary-empty { opacity: 0.5; }

        /* ── Feels: idle micro-animations + in-action reactions ──────────── */
        .pet-wrap { position: relative; width: 140px; height: 140px; display: grid; place-items: center; }
        .particle {
          position: absolute; left: 50%; bottom: 30%;
          font-size: 22px; line-height: 1; pointer-events: none;
          animation: float-up 1.4s ease-out forwards;
          transform: translate(-50%, 0);
          will-change: transform, opacity;
        }
        @keyframes float-up {
          0%   { transform: translate(calc(-50% + var(--dx, 0px)), 0)        scale(0.6)  rotate(0);   opacity: 0; }
          20%  { transform: translate(calc(-50% + var(--dx, 0px)), -10px)    scale(1.1)  rotate(-8deg); opacity: 1; }
          100% { transform: translate(calc(-50% + var(--dx, 0px)), -110px)   scale(0.9)  rotate(12deg); opacity: 0; }
        }
        /* Breathing — always on, subtle scale */
        .pet { animation: breathe 2.6s ease-in-out infinite; }
        @keyframes breathe { 0%,100% { transform: scale(1); } 50% { transform: scale(1.04); } }
        /* Blink — eye area squashes briefly */
        .blinking .pet { animation: blink 0.16s steps(2) 1, breathe 2.6s ease-in-out 0.16s infinite; }
        @keyframes blink { 0%,100% { transform: scaleY(1); } 50% { transform: scaleY(0.08); } }
        /* In-action squash and bounce */
        .pet-eating  .pet { animation: chomp 0.4s steps(2) 3, breathe 2.6s ease-in-out 1.4s infinite; }
        .pet-playing .pet { animation: wiggle 0.18s steps(2) 6, breathe 2.6s ease-in-out 1.6s infinite; }
        .pet-cleaning .pet { animation: sparkle 0.5s ease-out 2, breathe 2.6s ease-in-out 1.3s infinite; }
        .pet-sleeping .pet { animation: snooze 3.6s ease-in-out infinite; }
        .pet-purring .pet { animation: purr 0.7s ease-in-out infinite; }
        @keyframes chomp   { 0%,100% { transform: scale(1, 1); } 50% { transform: scale(1.08, 0.92); } }
        @keyframes wiggle  { 0%,100% { transform: rotate(0); } 50% { transform: rotate(6deg); } }
        @keyframes sparkle { 0%,100% { filter: brightness(1); } 50% { filter: brightness(1.5) drop-shadow(0 0 6px #ffe14d); } }
        @keyframes snooze  { 0%,100% { transform: translateY(0) scale(1); } 50% { transform: translateY(3px) scale(0.98); } }
        @keyframes purr    { 0%,100% { transform: scale(1); } 50% { transform: scale(1.06); } }
        /* Mood-tinted CRT */
        .screen.mood-hungry  { box-shadow: inset 0 0 0 5px #6c2222, 6px 6px 0 #000; }
        .screen.mood-dirty   { box-shadow: inset 0 0 0 5px #6c4d22, 6px 6px 0 #000; }
        .screen.mood-sleeping{ box-shadow: inset 0 0 0 5px #1f3a6c, 6px 6px 0 #000; }
        .screen.mood-bored   { box-shadow: inset 0 0 0 5px #3a1f6c, 6px 6px 0 #000; }
        .screen.mood-happy   { box-shadow: inset 0 0 0 5px #306230, 6px 6px 0 #000; filter: saturate(1.2); }
        /* Stat bar smooth transitions */
        .stat-bar { transition: color 200ms ease; }

        /* Chorus panel — compact companion roster */
        .chorus-panel { margin-top: 16px; border-top: 2px dashed #ff7ab6; padding-top: 12px; }
        .chorus-title { font-size: 13px; font-weight: bold; letter-spacing: 0.12em; color: #ff7ab6; margin-bottom: 8px; }
        .chorus-grid { display: flex; flex-wrap: wrap; gap: 8px; }
        .companion-chip {
          display: flex; align-items: center; gap: 5px;
          padding: 4px 10px; border-radius: 20px; border: 1px solid;
          font-size: 11px; font-family: 'Courier New', monospace;
        }
        `}</style>
    </main>
  );
}

// ── Companion Chorus sub-component

function ChorusPanel() {
  const [roster, setRoster] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/companion-chorus/roster', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.ok) setRoster(d.companions || []); })
      .catch(() => null)
      .finally(() => setLoading(false));
  }, []);

  const RARITY_COLORS: Record<string, string> = {
    common: '#9ca3af',
    uncommon: '#34d399',
    rare: '#60a5fa',
    epic: '#a855f7',
    legendary: '#fbbf23',
  };

  if (loading) return null;
  if (!roster.length) {
    return (
      <div className="chorus-panel">
        <div className="chorus-title">🐙 COMPANION CHORUS — no companions rolled</div>
        <div style={{ fontSize: 11, color: '#ff7ab6', fontFamily: 'Courier New' }}>
          Run <code>node companion-chorus/main.js</code> to hatch companions.
        </div>
      </div>
    );
  }

  return (
    <div className="chorus-panel">
      <div className="chorus-title">🐙 COMPANION CHORUS — {roster.length} companions</div>
      <div className="chorus-grid">
        {roster.map((c: any, i: number) => {
          const rarity = c.bones?.rarity || 'common';
          const species = c.bones?.species || c.defId || '?';
          const stats = c.bones?.stats || {};
          const color = RARITY_COLORS[rarity] || '#9ca3af';
          const emoji = EMOJI_MAP[species] || '🐙';
          return (
            <div key={i} className="companion-chip" style={{ borderColor: color, color }}>
              <span>{emoji}</span>
              <span>{species}</span>
              <span style={{ color: '#6b7280', fontSize: 10 }}>
                {stats.DEBUGGING}/{stats.PATIENCE}/{stats.WISDOM}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const EMOJI_MAP: Record<string, string> = {
  duck: '🦆', ghost: '👻', dragon: '🐉', octopus: '🐙', robot: '🤖',
  mushroom: '🍄', chonk: '💀', owl: '🦉', cactus: '🌵', penguin: '🐧',
  turtle: '🐢', goose: '🪿', rabbit: '🐇', cat: '🐱', axolotl: '🦎',
  capybara: '🦫', snail: '🐌', blob: '🫧',
};
