'use client';

import { useEffect, useState, useCallback } from 'react';
import { CockpitShell } from '../components/CockpitShell';

// ── The pre-prompt compiler (command-law) control surface ──────────────────
// Isolated page — talks only to /api/preprompt. Shows live status, lets the
// operator switch the active operating profile, and previews the exact prefix
// that gets compiled into every chat/agent/swarm system prompt.

type ProfileDef = { id: string; label: string; description: string; glow: string; rules: string[] };
type Status = {
  ok: boolean; enabled: boolean; activeProfile: string; profiles: string[];
  profileDefs: ProfileDef[]; lastApplied: { profile: string; hash: string; appliedAt: string; source: string } | null;
};

const GLOW: Record<string, string> = { cyan: '#22d3ee', purple: '#a855f7', magenta: '#d946ef', green: '#34d399', amber: '#fbbf24' };

export default function PrepromptPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ profile: string; prefix: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/preprompt', { cache: 'no-store' });
      if (!r.ok) throw new Error(`status ${r.status}`);
      setStatus(await r.json());
      setErr(null);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, []);

  useEffect(() => { load(); const i = setInterval(load, 5000); return () => clearInterval(i); }, [load]);

  const showPreview = useCallback(async (profile: string) => {
    try {
      const r = await fetch(`/api/preprompt?preview=${encodeURIComponent(profile)}`, { cache: 'no-store' });
      const j = await r.json();
      setPreview({ profile, prefix: j.preview?.prefix || '' });
    } catch { /* ignore */ }
  }, []);

  const setProfile = useCallback(async (profile: string) => {
    setBusy(true);
    try {
      const r = await fetch('/api/preprompt', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ profile }),
      });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || `status ${r.status}`); }
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }, [load]);

  const toggleEnabled = useCallback(async () => {
    if (!status) return;
    setBusy(true);
    try {
      await fetch('/api/preprompt', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: !status.enabled }),
      });
      await load();
    } finally { setBusy(false); }
  }, [status, load]);

  return (
    <CockpitShell title="Pre-Prompt Compiler · Command-Law">
    <div style={{ height: '100%', overflowY: 'auto', background: '#050308', color: '#e8d8ff', fontFamily: 'JetBrains Mono, monospace', padding: 24 }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 4 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#d946ef', letterSpacing: 1 }}>PRE-PROMPT COMPILER</h1>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>command-law · system-steering layer</span>
        </div>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 20, lineHeight: 1.6 }}>
          Compiles the active operating profile (mode, refusal policy, tool stance, and the honesty law) into every
          chat / agent / swarm system prompt before the model is called. Every compilation is audited.
        </p>

        {err && <div style={{ padding: 12, marginBottom: 16, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 4, color: '#fb7185', fontSize: 12 }}>compiler unreachable: {err}</div>}

        {status && (
          <>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', padding: '12px 16px', marginBottom: 20, background: 'rgba(20,8,32,0.6)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6 }}>
              <button onClick={toggleEnabled} disabled={busy} style={{ padding: '6px 14px', borderRadius: 4, border: 'none', cursor: busy ? 'wait' : 'pointer', fontWeight: 700, fontSize: 11, letterSpacing: 1, background: status.enabled ? 'linear-gradient(90deg,#34d399,#22d3ee)' : 'rgba(255,255,255,0.1)', color: status.enabled ? '#04050d' : '#fff' }}>
                {status.enabled ? '● ENABLED' : '○ DISABLED'}
              </button>
              <span style={{ fontSize: 12 }}>active profile: <b style={{ color: '#d946ef' }}>{status.activeProfile}</b></span>
              {status.lastApplied && (
                <span style={{ marginLeft: 'auto', fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
                  last applied: {status.lastApplied.profile} · #{status.lastApplied.hash} · {status.lastApplied.source}
                </span>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12, marginBottom: 24 }}>
              {status.profileDefs.map(p => {
                const active = p.id === status.activeProfile;
                const c = GLOW[p.glow] || '#d946ef';
                return (
                  <div key={p.id} onMouseEnter={() => showPreview(p.id)} style={{ padding: 14, background: active ? `${c}14` : 'rgba(20,8,32,0.5)', border: `1px solid ${active ? c : 'rgba(255,255,255,0.08)'}`, borderRadius: 6, cursor: 'default' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontWeight: 700, color: c, letterSpacing: 1 }}>{p.label.toUpperCase()}</span>
                      {active
                        ? <span style={{ fontSize: 9, color: c, fontWeight: 700 }}>● ACTIVE</span>
                        : <button onClick={() => setProfile(p.id)} disabled={busy} style={{ fontSize: 9, padding: '3px 8px', borderRadius: 3, border: `1px solid ${c}55`, background: 'transparent', color: c, cursor: busy ? 'wait' : 'pointer', fontWeight: 700 }}>ACTIVATE</button>}
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginBottom: 8, lineHeight: 1.4 }}>{p.description}</div>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                      {p.rules.map((r, i) => (
                        <li key={i} style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', lineHeight: 1.5, paddingLeft: 10, position: 'relative' }}>
                          <span style={{ position: 'absolute', left: 0, color: c }}>·</span>{r}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>

            {preview && (
              <div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 6 }}>COMPILED PREFIX — <b style={{ color: '#d946ef' }}>{preview.profile}</b> (what every model call inherits)</div>
                <pre style={{ padding: 14, background: '#0a0414', border: '1px solid rgba(168,85,247,0.25)', borderRadius: 6, fontSize: 11, color: '#c4b5fd', whiteSpace: 'pre-wrap', lineHeight: 1.5, maxHeight: 360, overflow: 'auto' }}>{preview.prefix}</pre>
              </div>
            )}
          </>
        )}
        {!status && !err && <div style={{ color: 'rgba(255,255,255,0.3)' }}>connecting to compiler…</div>}
      </div>
    </div>
    </CockpitShell>
  );
}
