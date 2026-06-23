'use client';

import { useEffect, useState } from 'react';

type Personality = {
  preset: string;
  spooky_warding: string;
  allow_terminal_flavour: boolean;
  allow_mochi_dialogue: boolean;
  allow_release_scrolls: boolean;
  allow_debug_flavour: boolean;
  prevent_task_derailment: boolean;
};

type Preview = {
  healthy: string; serviceDown: string; ttsOnline: string;
  spawnSuccess: string; benchmarkPassed: string; ollamaReady: string; mochi: string;
};

type AgentRow = { agent: string; default: string; active: string };

const PRESET_META: Record<string, { icon: string; tag: string; desc: string }> = {
  'clean':      { icon: '◉', tag: 'Professional',       desc: 'No flavour. Bare-bones technical.' },
  'goblin':     { icon: '◐', tag: 'Sarcastic chaos',    desc: 'Dry one-liners, glib callbacks.' },
  'spooky':     { icon: '◬', tag: 'Occult-tech',        desc: 'Sigils, ward language, daemon metaphors.' },
  'sovereign':  { icon: '◇', tag: 'Royal authority',    desc: 'Decree-and-council cadence.' },
  'crt-ritual': { icon: '✦', tag: 'Full lore',          desc: 'Ceremonial, manifest, full-enchant.' },
  'mochi-soft': { icon: '🐾', tag: 'Companion warmth',   desc: 'Mochi talks, everything else stays clean.' },
};

const INTENSITY_META: Record<string, { color: string; bar: number; tag: string; desc: string }> = {
  'off':         { color: '#5a3a6a', bar: 0,   tag: 'OFF',         desc: 'No flavour. Period.' },
  'low':         { color: '#34d399', bar: 1,   tag: 'ONE-LINER',   desc: 'A short flavour tag or single line.' },
  'medium':      { color: '#a855f7', bar: 2,   tag: 'METAPHOR',    desc: 'Occult-tech metaphors, one-liners.' },
  'high':        { color: '#d946ef', bar: 3,   tag: 'WARD',        desc: 'Full ward language, sigil style.' },
  'ceremonial':  { color: '#fbbf24', bar: 4,   tag: 'RITUAL',      desc: 'Scroll-style release language.' },
};

const RESTRICTED = ['legal', 'medical', 'finance', 'debug'];

export function PersonalityDial() {
  const [personality, setPersonality] = useState<Personality | null>(null);
  const [presets, setPresets] = useState<string[]>([]);
  const [intensities, setIntensities] = useState<string[]>([]);
  const [agentSummary, setAgentSummary] = useState<AgentRow[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const load = async () => {
    try {
      const r = await fetch('/api/personality', { cache: 'no-store' });
      if (r.ok) {
        const d = await r.json();
        setPersonality(d.personality);
        setPresets(d.presets || []);
        setIntensities(d.intensities || []);
        setAgentSummary(d.agent_summary || []);
        setPreview(d.pools?.preview || null);
      }
    } catch {}
  };
  useEffect(() => { load(); }, []);

  const setKey = async (key: string, value: unknown) => {
    if (!personality) return;
    setSaving(key);
    // optimistic
    setPersonality({ ...personality, [key]: value } as any);
    try {
      await fetch('/api/personality', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: `personality.${key}`, value }),
      });
    } finally {
      setSaving(null);
    }
  };

  const applyPreset = async (name: string) => {
    setSaving('preset');
    try {
      await fetch('/api/personality', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preset: name }),
      });
      await load();
    } finally {
      setSaving(null);
    }
  };

  if (!personality) {
    return <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>Loading personality…</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* PRESETS row */}
      <div>
        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', marginBottom: 6, letterSpacing: 1.2 }}>PERSONALITY PRESET</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {presets.map(p => {
            const m = PRESET_META[p];
            const isActive = personality.preset === p;
            return (
              <button key={p} onClick={() => applyPreset(p)} disabled={saving === 'preset'} style={{
                padding: '8px 10px', textAlign: 'left', cursor: 'pointer',
                background: isActive ? 'linear-gradient(135deg, rgba(217,70,239,0.18), rgba(168,85,247,0.10))' : 'rgba(255,255,255,0.02)',
                border: '1px solid ' + (isActive ? 'rgba(217,70,239,0.6)' : 'rgba(255,255,255,0.06)'),
                borderRadius: 4, color: '#e8d8ff', fontFamily: 'JetBrains Mono, monospace', fontSize: 10,
                display: 'flex', flexDirection: 'column', gap: 2,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: isActive ? '#d946ef' : 'rgba(255,255,255,0.5)', fontSize: 14 }}>{m?.icon || '◉'}</span>
                  <span style={{ fontWeight: 700, textTransform: 'uppercase' }}>{p}</span>
                  {isActive && <span style={{ marginLeft: 'auto', color: '#34d399' }}>●</span>}
                </div>
                <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.5)' }}>{m?.desc || ''}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* INTENSITY master dial */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', letterSpacing: 1.2 }}>SPOOKY WARDING — INTENSITY</div>
          <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.4)', fontFamily: 'JetBrains Mono, monospace' }}>
            {personality.prevent_task_derailment ? '🛡 anti-derailment ON' : '⚠ anti-derailment OFF'}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
          {intensities.map(i => {
            const m = INTENSITY_META[i];
            const isActive = personality.spooky_warding === i;
            return (
              <button key={i} onClick={() => setKey('spooky_warding', i)} disabled={saving === 'spooky_warding'} style={{
                padding: '8px 6px', textAlign: 'center', cursor: 'pointer',
                background: isActive ? 'linear-gradient(135deg, rgba(217,70,239,0.20), rgba(168,85,247,0.10))' : 'rgba(255,255,255,0.02)',
                border: '1px solid ' + (isActive ? `${m.color}80` : 'rgba(255,255,255,0.06)'),
                borderRadius: 4, color: isActive ? m.color : 'rgba(255,255,255,0.5)', fontFamily: 'JetBrains Mono, monospace', fontSize: 9,
                display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center',
              }}>
                <div style={{ display: 'flex', gap: 1 }}>
                  {[1,2,3,4].map(n => <span key={n} style={{ width: 4, height: 6, background: n <= m.bar ? m.color : 'rgba(255,255,255,0.1)' }} />)}
                </div>
                <span style={{ fontWeight: 700 }}>{m.tag}</span>
                <span style={{ fontSize: 7, color: 'rgba(255,255,255,0.4)' }}>{m.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* CHANNEL gates */}
      <div>
        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', marginBottom: 6, letterSpacing: 1.2 }}>CHANNEL GATES</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
          {[
            ['allow_terminal_flavour', 'Terminal flavour', 'Banner one-liners, log prefixes'],
            ['allow_mochi_dialogue',   'Mochi dialogue',   'Mochi speaks in chosen tone'],
            ['allow_release_scrolls',  'Release scrolls',  'Sigils in release notes (off by default)'],
            ['allow_debug_flavour',    'Debug flavour',    'Ritual flair in TTS / stack traces (off by default)'],
          ].map(([key, label, hint]) => {
            const v = (personality as any)[key];
            return (
              <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4, cursor: 'pointer' }}>
                <input type="checkbox" checked={!!v} onChange={e => setKey(key, e.target.checked)} style={{ accentColor: '#d946ef' }} />
                <div>
                  <div style={{ fontSize: 10, color: '#e8d8ff', fontFamily: 'JetBrains Mono, monospace' }}>{label}</div>
                  <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.4)' }}>{hint}</div>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {/* ANTI-DERAILMENT toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: personality.prevent_task_derailment ? 'rgba(52,211,153,0.06)' : 'rgba(251,113,133,0.06)', border: '1px solid ' + (personality.prevent_task_derailment ? 'rgba(52,211,153,0.25)' : 'rgba(251,113,133,0.30)'), borderRadius: 4 }}>
        <input type="checkbox" checked={personality.prevent_task_derailment} onChange={e => setKey('prevent_task_derailment', e.target.checked)} style={{ accentColor: '#34d399' }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, color: '#e8d8ff', fontWeight: 700 }}>🛡 Prevent task derailment <span style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 400 }}>· recommended ON</span></div>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
            Even at <span style={{ color: '#d946ef' }}>ceremonial</span> intensity, restricted domains ({RESTRICTED.join(' · ')}) auto-fall-back to clean. Recommended ON — spooky is skin, not steering.
          </div>
        </div>
      </div>

      {/* LIVE PREVIEW */}
      {preview && (
        <div>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', marginBottom: 6, letterSpacing: 1.2 }}>LIVE PREVIEW · what you'll see right now</div>
          <div style={{ padding: 10, background: 'rgba(20,8,32,0.5)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4, fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#e8d8ff', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div><span style={{ color: '#34d399' }}>healthy: </span>{preview.healthy}</div>
            <div><span style={{ color: '#fb7185' }}>serviceDown: </span>{preview.serviceDown}</div>
            <div><span style={{ color: '#22d3ee' }}>ttsOnline: </span>{preview.ttsOnline}</div>
            <div><span style={{ color: '#a855f7' }}>spawnSuccess: </span>{preview.spawnSuccess}</div>
            <div><span style={{ color: '#fbbf24' }}>benchmarkPassed: </span>{preview.benchmarkPassed}</div>
            <div><span style={{ color: '#34d399' }}>ollamaReady: </span>{preview.ollamaReady}</div>
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: 6, marginTop: 4 }}>
              <span style={{ color: '#d946ef' }}>mochi: </span>{preview.mochi}
            </div>
          </div>
        </div>
      )}

      {/* AGENT OVERRIDES */}
      {agentSummary.length > 0 && (
        <div>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', marginBottom: 6, letterSpacing: 1.2 }}>PER-AGENT OVERRIDES · min(master, ceiling)</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 4 }}>
            {agentSummary.map(a => {
              const m = INTENSITY_META[a.active] || INTENSITY_META.off;
              return (
                <div key={a.agent} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 3, fontFamily: 'JetBrains Mono, monospace', fontSize: 9 }}>
                  <span style={{ color: '#e8d8ff' }}>{a.agent}</span>
                  <span style={{ color: m.color, fontWeight: 700 }}>{a.active.toUpperCase()}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
