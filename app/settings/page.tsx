'use client';

import { useCallback, useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { CockpitShell } from '../components/CockpitShell';
import { PersonalityDial } from '../components/PersonalityDial';

type SettingItem = {
  key: string; label: string; category: string; type: string;
  value?: unknown; set?: boolean; hint?: string; options?: string[];
  help: string; modified: boolean; restart: boolean; default?: unknown;
};
type Driver = { name: string; streamMode?: string; authType?: string };

const PRESETS = [
  { id: 'classic',   label: 'Classic',    desc: 'Stable & predictable',      icon: '◉' },
  { id: 'hybrid',    label: 'Hybrid',     desc: 'Balanced power & control', icon: '◇' },
  { id: 'immersive', label: 'Immersive',  desc: 'Maximum presence',         icon: '◬' },
  { id: 'low-power', label: 'Low Power',  desc: 'Efficiency mode',          icon: '◐' },
  { id: 'full-chaos',label: 'Full Chaos', desc: 'No limits. All engines.',  icon: '✦' },
];

// FIX 2026-06-22: Next.js 15 requires useSearchParams() to live inside a
// Suspense boundary at build time, or static prerender fails with
// "useSearchParams() should be wrapped in a suspense boundary at page /settings".
// SettingsPage now wraps SettingsPageInner in Suspense; the inner component
// still owns all the actual page logic.
export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsPageInner />
    </Suspense>
  );
}

function SettingsPageInner() {
  const searchParams = useSearchParams();
  const [all, setAll] = useState<SettingItem[]>([]);
  const [registry, setRegistry] = useState<{ drivers: Driver[]; tools: { name: string; description: string; aliases: string[] }[] } | null>(null);
  const [q, setQ] = useState(searchParams.get('setting') || searchParams.get('q') || '');
  const [scopeFilter, setScopeFilter] = useState<string>(searchParams.get('scope') || 'all');
  const [msg, setMsg] = useState<string | null>(null);
  const [activePreset, setActivePreset] = useState<string>('hybrid');
  const focusedSetting = searchParams.get('setting') || '';

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/settings', { cache: 'no-store' });
      const d = await r.json();
      if (d.ok) {
        const items = Object.values(d.settings || {}).flat() as SettingItem[];
        setAll(items);
        const mode = items.find(item => item.key === 'ui.mode')?.value;
        // FIX 2026-06-22: only honor ui.mode if it's a known preset id.
        // Old legacy keys (e.g. an Immersive setting that wrote ui.mode='immersive'
        // long ago) shouldn't force the highlight onto Immersive when the user
        // actually picked Full Chaos. Falling through keeps the user's optimistic
        // applyPreset highlight intact until they pick something else.
        if (typeof mode === 'string' && PRESETS.some(p => p.id === mode)) {
          setActivePreset(mode);
        }
      }
    } catch { /* ignore */ }
    try {
      const r = await fetch('/api/registry', { cache: 'no-store' });
      setRegistry(await r.json());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    return () => clearTimeout(first);
  }, [load]);

  const setSetting = async (key: string, value: unknown) => {
    const r = await fetch('/api/settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value }),
    });
    const d = await r.json();
    if (d.ok) {
      setMsg(`✓ ${key} saved`);
      setTimeout(() => setMsg(null), 1800);
      load();
    } else {
      setMsg(`Save failed: ${d.error || r.status}`);
    }
  };

  const applyPreset = async (preset: string) => {
    const r = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preset }),
    });
    const d = await r.json();
    if (!r.ok || !d.ok) {
      setMsg(`Preset failed: ${d.error || r.status}`);
      return;
    }
    setActivePreset(preset);
    setMsg(`✓ ${preset} preset applied`);
    setTimeout(() => setMsg(null), 1800);
    load();
  };

  const exportSettings = async () => {
    const r = await fetch('/api/settings?export=1', { cache: 'no-store' });
    const d = await r.json();
    if (!r.ok || !d.ok) {
      setMsg(`Export failed: ${d.error || r.status}`);
      return;
    }
    const blob = new Blob([JSON.stringify(d.export, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'purpclaw-settings.json';
    anchor.click();
    URL.revokeObjectURL(url);
    setMsg('✓ Settings exported');
  };

  const filtered = all.filter(s => {
    if (q && !s.label.toLowerCase().includes(q.toLowerCase()) && !s.key.toLowerCase().includes(q.toLowerCase())) return false;
    if (scopeFilter === 'modified' && !s.modified) return false;
    if (scopeFilter === 'system' && s.category !== 'core') return false;
    if (scopeFilter === 'user' && s.category !== 'providers' && s.category !== 'ui' && s.category !== 'voice') return false;
    if (scopeFilter === 'runtime' && s.category !== 'memory' && s.category !== 'safety' && s.category !== 'spend') return false;
    if (scopeFilter === 'secret' && s.type !== 'secret') return false;
    return true;
  });

  // Group by category
  const grouped: Record<string, SettingItem[]> = {};
  filtered.forEach(s => {
    if (!grouped[s.category]) grouped[s.category] = [];
    grouped[s.category].push(s);
  });

  return (
    <CockpitShell title="Settings Center · Control every layer of your PURPCLAW stack">
      <div className="settings-layout" style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 14, padding: 14, minHeight: '100%' }}>

        {/* ── MAIN COLUMN ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>

          {/* Search + filters */}
          <div className="settings-toolbar" style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 14px', background: 'linear-gradient(180deg, rgba(18,10,31,0.85), rgba(10,6,18,0.95))', border: '1px solid var(--border-default)', borderRadius: 8 }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <input
                type="text"
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="Search settings, services, keys…"
                style={{
                  width: '100%', padding: '8px 12px 8px 36px',
                  background: '#0a0612', border: '1px solid var(--border-strong)',
                  borderRadius: 4, color: '#f5f0ff', fontSize: 12,
                  fontFamily: 'JetBrains Mono, monospace',
                }}
              />
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>🔍</span>
              <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}>/</span>
            </div>
            {['all', 'modified', 'system', 'user', 'runtime', 'secret'].map(s => (
              <button key={s} onClick={() => setScopeFilter(s)} style={{
                padding: '6px 10px', background: scopeFilter === s ? 'rgba(217,70,239,0.20)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${scopeFilter === s ? 'rgba(217,70,239,0.5)' : 'rgba(255,255,255,0.10)'}`,
                borderRadius: 4, color: scopeFilter === s ? '#d946ef' : 'rgba(255,255,255,0.6)',
                fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8, cursor: 'pointer',
              }}>{s}</button>
            ))}
            <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
              <SmallBtn label="IMPORT" disabled title="Import requires a reviewed file-picker flow and is not enabled yet." />
              <SmallBtn label="EXPORT" onClick={exportSettings} />
            </div>
          </div>

          {/* Presets */}
          <Section title="Presets">
            <div className="settings-presets" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr) 1fr', gap: 8, padding: 10 }}>
              {PRESETS.map(p => (
                <button key={p.id} onClick={() => applyPreset(p.id)} style={{
                  padding: '10px 12px', textAlign: 'left',
                  background: activePreset === p.id ? 'linear-gradient(180deg, rgba(217,70,239,0.20), rgba(168,85,247,0.08))' : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${activePreset === p.id ? 'rgba(217,70,239,0.6)' : 'rgba(255,255,255,0.10)'}`,
                  borderRadius: 6, color: '#f5f0ff', cursor: 'pointer',
                  position: 'relative',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 14, color: activePreset === p.id ? '#d946ef' : 'rgba(255,255,255,0.4)' }}>{p.icon}</span>
                    <span style={{ fontSize: 12, fontWeight: 700 }}>{p.label}</span>
                  </div>
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{p.desc}</div>
                  {activePreset === p.id && <div style={{ position: 'absolute', bottom: 6, right: 8, fontSize: 8, color: '#34d399', fontWeight: 700, letterSpacing: 1 }}>ACTIVE</div>}
                  {activePreset !== p.id && <div style={{ position: 'absolute', bottom: 6, right: 8, fontSize: 8, color: 'rgba(217,70,239,0.5)', fontWeight: 700, letterSpacing: 1 }}>APPLY</div>}
                </button>
              ))}
              <button disabled title="Custom preset persistence is not implemented." style={{ padding: '10px 12px', textAlign: 'left', background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.15)', borderRadius: 6, color: 'rgba(255,255,255,0.4)', cursor: 'not-allowed' }}>
                <div style={{ fontSize: 18, marginBottom: 4 }}>+</div>
                <div style={{ fontSize: 10, fontWeight: 700 }}>Save Preset</div>
              </button>
            </div>
          </Section>

          {/* Personality · Spooky Warding — separate lane from the runtime presets above */}
          <Section title="Personality · Spooky Warding">
            <div style={{ padding: 12 }}>
              <PersonalityDial />
            </div>
          </Section>

          {/* Settings table */}
          <Section title={`Settings (${filtered.length})`}>
            <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr 220px 100px 100px 120px', padding: '6px 12px', fontSize: 9, color: 'rgba(255,255,255,0.4)', letterSpacing: 1, textTransform: 'uppercase', borderBottom: '1px solid var(--border-subtle)' }}>
              <span></span>
              <span>Setting</span>
              <span>Value</span>
              <span>Status</span>
              <span>Scope</span>
              <span>Last Modified</span>
            </div>
            <div style={{ maxHeight: 460, overflowY: 'auto' }}>
              {Object.entries(grouped).map(([cat, items]) => (
                <div key={cat}>
                  <div style={{ padding: '8px 12px', fontSize: 10, color: '#d946ef', fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', background: 'rgba(217,70,239,0.06)' }}>
                    ▾ {cat}
                  </div>
                  {items.map(s => (
                    <div id={`setting-${s.key}`} key={s.key} style={{ display: 'grid', gridTemplateColumns: '40px 1fr 220px 100px 100px 120px', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: 11, background: focusedSetting === s.key ? 'rgba(217,70,239,0.16)' : 'transparent', boxShadow: focusedSetting === s.key ? 'inset 3px 0 0 #d946ef' : 'none' }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.modified ? '#d946ef' : 'rgba(255,255,255,0.2)', boxShadow: s.modified ? '0 0 6px #d946ef' : 'none' }} />
                      <div>
                        <div style={{ color: '#f5f0ff', fontWeight: 600 }}>{s.label}</div>
                        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', fontFamily: 'JetBrains Mono, monospace' }}>{s.key}</div>
                      </div>
                      <div>{s.type === 'secret' ? <SecretModalEditor item={s} autoOpen={focusedSetting === s.key} onSave={v => setSetting(s.key, v)} /> : <InlineEditor item={s} onSave={v => setSetting(s.key, v)} />}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#34d399', boxShadow: '0 0 6px #34d399' }} />
                        <span style={{ fontSize: 10, color: '#34d399' }}>Live</span>
                      </div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>{s.category === 'core' ? 'System' : s.type === 'secret' ? 'User' : s.category === 'memory' || s.category === 'safety' ? 'Runtime' : 'User'}</div>
                      <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>{s.modified ? 'Just now' : '2m ago'}</div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </Section>
        </div>

        {/* ── RIGHT PREVIEW COLUMN ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Live Preview tabs */}
          <Section title="Live Preview" tabs={['OVERLAY', 'TERMINAL', 'PANELS']}>
            <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ textAlign: 'center', padding: 8 }}>
                <RiskShield level={32} />
                <div style={{ fontSize: 10, color: '#34d399', fontWeight: 700, marginTop: 4 }}>RISK SHIELD NOMINAL</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontSize: 9 }}>
                <Mini label="INPUT"  v="✓" color="#34d399" />
                <Mini label="MODEL"  v="✓" color="#34d399" />
                <Mini label="TOOLS"  v="✓" color="#34d399" />
                <Mini label="DATA"   v="✓" color="#34d399" />
                <Mini label="OUTPUT" v="✓" color="#34d399" />
              </div>
            </div>
          </Section>

          <Section title="Dream Swarm">
            <div style={{ padding: 10, textAlign: 'center' }}>
              <Waveform color="#d946ef" />
              <div style={{ fontSize: 16, color: '#d946ef', fontWeight: 700, marginTop: 6, textShadow: '0 0 8px rgba(217,70,239,0.5)' }}>72%</div>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)' }}>SIGNAL COHERENCE: HIGH</div>
            </div>
          </Section>

          <Section title="Router Flow">
            <div style={{ fontSize: 9, display: 'grid', gap: 3, padding: 8 }}>
              {[
                { name: 'DeepSeek v4 Pro', pct: 95, cost: '$0.0012' },
                { name: 'Mistral MLX',     pct: 91, cost: '$0.0009' },
                { name: 'OpenAI 32b',      pct: 89, cost: '$0.0014' },
                { name: 'Gemini 2.5 Pro',  pct: 88, cost: '$0.0011' },
                { name: 'Claude 3.7 Sonnet',pct: 86, cost: '$0.0013' },
              ].map(r => (
                <div key={r.name} style={{ display: 'grid', gridTemplateColumns: '1fr 60px 40px', gap: 4, alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#34d399' }} />
                    <span style={{ fontSize: 9, color: '#f5f0ff' }}>{r.name}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <div style={{ width: 30, height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ width: `${r.pct}%`, height: '100%', background: 'linear-gradient(90deg, #22d3ee, #34d399)' }} />
                    </div>
                    <span style={{ fontSize: 8, color: '#22d3ee' }}>{r.pct}%</span>
                  </div>
                  <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.5)', textAlign: 'right' }}>{r.cost}</span>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Telemetry Snapshot">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontSize: 9, padding: 8 }}>
              <Mini label="TPS"  v="2,347/s" color="#22d3ee" />
              <Mini label="P95 LAT" v="412ms" color="#fbbf24" />
              <Mini label="ERROR"  v="0.18%" color="#34d399" />
              <Mini label="COST/MIN" v="$0.042" color="#34d399" />
            </div>
            <MiniSparkline data={[5, 8, 4, 9, 6, 12, 7, 10, 8, 14, 9, 11, 13, 10, 12]} color="#d946ef" />
          </Section>

          <Section title="System Notes" statusColor="#fbbf24">
            <div style={{ padding: 10, fontSize: 10 }}>
              <div style={{ color: '#fbbf24', fontWeight: 700, marginBottom: 6 }}>⚠ MODIFIED SETTINGS</div>
              <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 9, lineHeight: 1.5 }}>
                You have unsaved changes. Apply or export your profile to persist.
              </div>
              <button style={{ marginTop: 8, width: '100%', padding: '6px 0', background: 'linear-gradient(90deg, rgba(251,191,36,0.25), rgba(251,113,133,0.15))', border: '1px solid rgba(251,191,36,0.5)', color: '#fbbf24', borderRadius: 3, fontSize: 9, fontWeight: 700, letterSpacing: 1, cursor: 'pointer' }}>REVIEW CHANGES</button>
            </div>
          </Section>

          <Section title="Config Scope">
            <div style={{ fontSize: 9, display: 'grid', gap: 3, padding: 8 }}>
              <ScopeRow label="System"  count={58} color="#22d3ee" />
              <ScopeRow label="User"    count={34} color="#a855f7" />
              <ScopeRow label="Runtime" count={12} color="#34d399" />
              <ScopeRow label="Secret"  count={9}  color="#fb7185" />
            </div>
          </Section>
        </div>
      </div>
      {msg && <div style={{ position: 'fixed', bottom: 60, left: '50%', transform: 'translateX(-50%)', padding: '8px 18px', background: 'rgba(52,211,153,0.15)', border: '1px solid rgba(52,211,153,0.4)', borderRadius: 4, color: '#34d399', fontSize: 11, zIndex: 100 }}>{msg}</div>}
    </CockpitShell>
  );
}

function Section({ title, children, tabs, status, statusColor }: { title: string; children: React.ReactNode; tabs?: string[]; status?: string; statusColor?: string }) {
  return (
    <div style={{ background: 'linear-gradient(180deg, rgba(18,10,31,0.85), rgba(10,6,18,0.95))', border: '1px solid var(--border-default)', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid var(--border-subtle)' }}>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 600 }}>{title}</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {tabs && tabs.map(t => <span key={t} style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', padding: '2px 6px', background: 'rgba(255,255,255,0.04)', borderRadius: 3 }}>{t}</span>)}
          {status && <span style={{ fontSize: 9, color: statusColor || '#34d399', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: statusColor || '#34d399', boxShadow: `0 0 6px ${statusColor || '#34d399'}` }} />
            {status}
          </span>}
        </div>
      </div>
      {children}
    </div>
  );
}

function SmallBtn({ label, onClick, disabled = false, title }: { label: string; onClick?: () => void; disabled?: boolean; title?: string }) {
  return <button type="button" onClick={onClick} disabled={disabled} title={title} style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 4, color: disabled ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: 600, letterSpacing: 0.8, cursor: disabled ? 'not-allowed' : 'pointer' }}>{label}</button>;
}

function Mini({ label, v, color = '#f5f0ff' }: { label: string; v: React.ReactNode; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 6px', background: 'rgba(255,255,255,0.03)', borderRadius: 3 }}>
      <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)' }}>{label}</span>
      <span style={{ fontSize: 9, color, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>{v}</span>
    </div>
  );
}

function MiniSparkline({ data, color = '#22d3ee' }: { data: number[]; color?: string }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  return (
    <svg viewBox={`0 0 ${data.length * 6} 30`} style={{ width: '100%', height: 30, marginTop: 4 }} preserveAspectRatio="none">
      <polyline fill="none" stroke={color} strokeWidth="1.5" points={data.map((v, i) => `${i * 6},${30 - ((v - min) / Math.max(1, max - min)) * 28}`).join(' ')} />
    </svg>
  );
}

function ScopeRow({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 6px', background: 'rgba(255,255,255,0.02)', borderRadius: 3 }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, boxShadow: `0 0 6px ${color}` }} />
        <span style={{ fontSize: 9, color: '#f5f0ff' }}>{label}</span>
      </span>
      <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)' }}>{count} settings</span>
    </div>
  );
}

function RiskShield({ level }: { level: number }) {
  return (
    <div style={{ position: 'relative', width: 90, height: 90, margin: '0 auto' }}>
      <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%' }}>
        {[0, 1, 2, 3].map(i => (
          <polygon
            key={i}
            points="50,5 92,28 92,72 50,95 8,72 8,28"
            fill="none"
            stroke={['#d946ef', '#a855f7', '#22d3ee', '#34d399'][i]}
            strokeWidth="1.5"
            opacity={0.4 + i * 0.2}
            transform={`scale(${0.45 + i * 0.12})`}
            style={{ transformOrigin: 'center', transformBox: 'fill-box' }}
          />
        ))}
        <text x="50" y="48" textAnchor="middle" fill="#d946ef" fontSize="22" fontWeight="800" style={{ textShadow: '0 0 8px #d946ef' }}>{level}</text>
        <text x="50" y="62" textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize="7" fontWeight="700">/ 100</text>
      </svg>
    </div>
  );
}

function Waveform({ color = '#d946ef' }: { color?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 32, gap: 2 }}>
      {Array.from({ length: 30 }, (_, i) => {
        const h = 4 + Math.abs(Math.sin(i * 0.7)) * 24;
        const opacity = 0.5 + ((i * 17) % 10) / 20;
        return <div key={i} style={{ width: 2, height: h, background: color, borderRadius: 1, opacity }} />;
      })}
    </div>
  );
}

function InlineEditor({ item, onSave }: { item: SettingItem; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(item.value ?? ''));

  if (item.type === 'boolean') {
    return (
      <button onClick={() => onSave(item.value === 'true' ? 'false' : 'true')} style={{
        padding: '4px 10px', background: item.value === 'true' ? 'rgba(52,211,153,0.20)' : 'rgba(255,255,255,0.05)',
        border: `1px solid ${item.value === 'true' ? 'rgba(52,211,153,0.5)' : 'rgba(255,255,255,0.10)'}`,
        borderRadius: 4, color: item.value === 'true' ? '#34d399' : 'rgba(255,255,255,0.6)',
        fontSize: 10, fontWeight: 700, cursor: 'pointer', minWidth: 60,
      }}>{item.value === 'true' ? 'ON' : 'OFF'}</button>
    );
  }
  if (item.type === 'enum' && item.options) {
    return (
      <select value={String(item.value ?? '')} onChange={e => onSave(e.target.value)} style={{
        padding: '4px 8px', background: '#0a0612', border: '1px solid var(--border-strong)',
        borderRadius: 4, color: '#f5f0ff', fontSize: 10, fontFamily: 'JetBrains Mono, monospace', width: '100%',
      }}>
        {item.options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  if (item.type === 'number') {
    return (
      <input type="number" defaultValue={String(item.value ?? 0)} onBlur={e => onSave(e.target.value)} style={{
        padding: '4px 8px', background: '#0a0612', border: '1px solid var(--border-strong)',
        borderRadius: 4, color: '#f5f0ff', fontSize: 10, fontFamily: 'JetBrains Mono, monospace', width: '100%',
      }} />
    );
  }
  if (editing) {
    return (
      <div style={{ display: 'inline-flex', gap: 4 }}>
        <input autoFocus value={val} onChange={e => setVal(e.target.value)} style={{
          padding: '4px 8px', background: '#0a0612', border: '1px solid var(--border-strong)',
          borderRadius: 4, color: '#f5f0ff', fontSize: 10, fontFamily: 'JetBrains Mono, monospace', width: 160,
        }} />
        <button onClick={() => { onSave(val); setEditing(false); }} style={{ padding: '2px 8px', background: 'rgba(217,70,239,0.20)', border: '1px solid rgba(217,70,239,0.5)', color: '#d946ef', borderRadius: 3, fontSize: 9, fontWeight: 700, cursor: 'pointer' }}>save</button>
      </div>
    );
  }
  return (
    <span onClick={() => setEditing(true)} style={{ padding: '4px 8px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 3, color: '#f5f0ff', fontSize: 10, fontFamily: 'JetBrains Mono, monospace', cursor: 'pointer', display: 'inline-block', minWidth: 60 }}>
      {String(item.value || item.hint || '—')}
    </span>
  );
}

function SecretEditor({ item, onSave }: { item: SettingItem; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState('');
  return editing ? (
    <div style={{ display: 'inline-flex', gap: 4 }}>
      <input autoFocus value={val} onChange={e => setVal(e.target.value)} type="password" placeholder="enter new value" style={{ padding: '4px 8px', background: '#0a0612', border: '1px solid var(--border-strong)', borderRadius: 4, color: '#f5f0ff', fontSize: 10, fontFamily: 'JetBrains Mono, monospace', width: 140 }} />
      <button onClick={() => { if (val) onSave(val); setEditing(false); setVal(''); }} style={{ padding: '2px 8px', background: 'rgba(217,70,239,0.20)', border: '1px solid rgba(217,70,239,0.5)', color: '#d946ef', borderRadius: 3, fontSize: 9, fontWeight: 700, cursor: 'pointer' }}>save</button>
      <button onClick={() => setEditing(false)} style={{ padding: '2px 8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.5)', borderRadius: 3, fontSize: 9, cursor: 'pointer' }}>✕</button>
    </div>
  ) : (
    <span onClick={() => setEditing(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 3, cursor: 'pointer' }}>
      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', fontFamily: 'JetBrains Mono, monospace' }}>{item.set ? '••••' + (item.hint || '').slice(-4) : 'not set'}</span>
      <span style={{ fontSize: 9, color: '#d946ef', border: '1px solid rgba(217,70,239,0.4)', padding: '1px 6px', borderRadius: 3 }}>edit</span>
    </span>
  );
}

function SecretModalEditor({ item, onSave, autoOpen = false }: { item: SettingItem; onSave: (v: string) => void; autoOpen?: boolean }) {
  const [editing, setEditing] = useState(autoOpen);
  const [val, setVal] = useState('');

  const save = () => {
    if (!val.trim()) return;
    onSave(val.trim());
    setEditing(false);
    setVal('');
  };

  return (
    <>
      <button type="button" onClick={() => setEditing(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', background: item.set ? 'rgba(52,211,153,0.08)' : 'rgba(251,191,36,0.08)', border: `1px solid ${item.set ? 'rgba(52,211,153,0.25)' : 'rgba(251,191,36,0.35)'}`, borderRadius: 3, cursor: 'pointer' }}>
        <span style={{ fontSize: 10, color: item.set ? '#34d399' : '#fbbf24', fontFamily: 'JetBrains Mono, monospace' }}>{item.set ? '••••' + (item.hint || '').slice(-4) : 'not set'}</span>
        <span style={{ fontSize: 9, color: '#d946ef', border: '1px solid rgba(217,70,239,0.4)', padding: '1px 6px', borderRadius: 3 }}>{item.set ? 'replace' : 'add key'}</span>
      </button>
      {editing && (
        <div role="dialog" aria-label={`Set ${item.label}`} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1200, display: 'grid', placeItems: 'center', padding: 20 }} onClick={() => setEditing(false)}>
          <div onClick={e => e.stopPropagation()} style={{ width: 'min(520px, 96vw)', background: 'linear-gradient(180deg, rgba(18,10,31,0.98), rgba(10,6,18,1))', border: '1px solid rgba(217,70,239,0.4)', borderRadius: 8, boxShadow: '0 20px 70px rgba(0,0,0,0.55)', padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
              <div>
                <div style={{ color: '#f5f0ff', fontSize: 14, fontWeight: 800 }}>Set {item.label}</div>
                <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, marginTop: 4, fontFamily: 'JetBrains Mono, monospace' }}>{item.key}</div>
              </div>
              <button type="button" onClick={() => setEditing(false)} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#f5f0ff', borderRadius: 4, padding: '5px 9px', cursor: 'pointer' }}>close</button>
            </div>
            <div style={{ color: 'rgba(255,255,255,0.58)', fontSize: 11, lineHeight: 1.5, marginTop: 10 }}>
              {item.help || 'Paste the provider key. It is written to local settings/env storage and returned masked only.'}
              {item.restart ? <div style={{ color: '#fbbf24', marginTop: 4 }}>Restart required for already-running backend services to pick this up.</div> : null}
            </div>
            <input autoFocus value={val} onChange={e => setVal(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }} type="password" placeholder="paste key here" style={{ marginTop: 14, width: '100%', boxSizing: 'border-box', padding: '10px 12px', background: '#0a0612', border: '1px solid var(--border-strong)', borderRadius: 5, color: '#f5f0ff', fontSize: 12, fontFamily: 'JetBrains Mono, monospace' }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
              <button type="button" onClick={() => setEditing(false)} style={{ padding: '7px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.65)', borderRadius: 4, cursor: 'pointer' }}>Cancel</button>
              <button type="button" onClick={save} disabled={!val.trim()} style={{ padding: '7px 14px', background: val.trim() ? 'rgba(217,70,239,0.22)' : 'rgba(255,255,255,0.04)', border: `1px solid ${val.trim() ? 'rgba(217,70,239,0.5)' : 'rgba(255,255,255,0.08)'}`, color: val.trim() ? '#d946ef' : 'rgba(255,255,255,0.35)', borderRadius: 4, cursor: val.trim() ? 'pointer' : 'not-allowed', fontWeight: 800 }}>Save Key</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
