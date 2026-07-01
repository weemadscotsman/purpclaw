'use client';

import { useCallback, useEffect, useState } from 'react';

type LaneCfg = {
  lane: string; label: string; provider: string; model: string;
  source: string; fellBackFrom: string | null;
  userChoice: { provider?: string; model?: string } | null;
  default: { provider: string; model: string };
  useFor: string[];
};
type Available = { provider: string; hasKey: boolean; models: string[] };
type Spend = { dailyTokens: number; dailyRequests: number; dailyCost: number; config?: { dailyTokenCap: number } } | null;
type Resp = { ok: boolean; lanes: LaneCfg[]; available: Available[]; spend: Spend };

const card: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: 12, padding: 18, marginBottom: 18 };
const h2: React.CSSProperties = { fontSize: 13, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--text-secondary)', margin: '0 0 14px' };
const sel: React.CSSProperties = { background: 'var(--bg-void)', color: 'var(--text-primary)', border: '1px solid var(--border-default)', borderRadius: 6, padding: '5px 8px', fontSize: 12, maxWidth: 230 };
const btn: React.CSSProperties = { background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border-strong)', borderRadius: 6, padding: '5px 12px', fontSize: 12, cursor: 'pointer' };

function badge(text: string, color: string) {
  return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: `${color}22`, color, border: `1px solid ${color}55`, textTransform: 'uppercase' }}>{text}</span>;
}

export default function ProvidersPage() {
  const [data, setData] = useState<Resp | null>(null);
  const [edit, setEdit] = useState<Record<string, { provider: string; model: string }>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [hb, setHb] = useState<any>(null);

  const load = useCallback(async () => {
    const d = await fetch('/api/providers', { cache: 'no-store' }).then(r => r.json()).catch(() => null);
    if (d?.ok) setData(d);
  }, []);
  useEffect(() => { load(); }, [load]);

  // Read-only heartbeat pulse — polls /api/heartbeat. No actions, just status.
  useEffect(() => {
    const tick = () => fetch('/api/heartbeat', { cache: 'no-store' }).then(r => r.json()).then(setHb).catch(() => {});
    tick();
    const t = setInterval(tick, 60_000);
    return () => clearInterval(t);
  }, []);

  const refresh = useCallback(async () => {
    setBusy(true); setMsg('Discovering models across providers…');
    await fetch('/api/models?action=refresh', { cache: 'no-store' }).catch(() => {});
    await load(); setMsg('Discovery complete.'); setBusy(false);
  }, [load]);

  const saveLane = useCallback(async (lane: string) => {
    const e = edit[lane]; if (!e) return;
    setBusy(true);
    const r = await fetch('/api/providers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lane, provider: e.provider, model: e.model }) }).then(x => x.json()).catch(() => null);
    setMsg(r?.ok ? `${lane} saved → ${e.provider}/${e.model}` : `Save failed`);
    setEdit(p => { const n = { ...p }; delete n[lane]; return n; });
    await load(); setBusy(false);
  }, [edit, load]);

  const resetLane = useCallback(async (lane: string) => {
    setBusy(true);
    await fetch('/api/providers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lane, provider: '', model: '' }) }).catch(() => {});
    setMsg(`${lane} reset to default`); await load(); setBusy(false);
  }, [load]);

  const available = data?.available || [];
  const modelsFor = (prov: string) => available.find(a => a.provider === prov)?.models || [];
  const spend = data?.spend;
  const cap = spend?.config?.dailyTokenCap ?? 1_000_000;
  const used = spend?.dailyTokens ?? 0;
  const pct = Math.min(100, Math.round((used / cap) * 100));

  return (
    <>
      <div style={{ maxWidth: 1040, margin: '0 auto', padding: '8px 4px 40px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h1 style={{ fontSize: 21, color: 'var(--text-primary)', margin: 0 }}>🛰️ Provider Routing — your models, your call</h1>
          <button onClick={refresh} disabled={busy} style={{ ...btn, opacity: busy ? 0.6 : 1 }}>{busy ? '⟳ …' : '⟳ Refresh catalog'}</button>
        </div>
        {msg && <div style={{ ...card, padding: '9px 14px', fontSize: 12.5, color: 'var(--text-secondary)' }}>{msg}</div>}

        {/* ── Heartbeat pulse (read-only) ── */}
        <div style={{ ...card, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', borderColor: hb ? (hb.green ? '#34d39955' : '#fbbf2455') : 'var(--border-default)' }}>
          <span style={{ fontSize: 18, color: hb?.green ? '#34d399' : '#fbbf24' }}>{hb ? (hb.green ? '♥' : '✗') : '·'}</span>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 1 }}>Heartbeat</span>
          {hb ? (
            <span style={{ fontSize: 12.5, color: 'var(--text-primary)', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <span>Core <strong>{hb.core.healthy}/{hb.core.total}</strong>{hb.core.down?.length ? <em style={{ color: '#fbbf24' }}> down: {hb.core.down.join(',')}</em> : null}</span>
              <span>Providers <strong>{hb.providers.usable}/{hb.providers.total}</strong></span>
              <span>Memory <strong style={{ color: hb.memory === 'green' ? '#34d399' : '#f87171' }}>{hb.memory}</strong></span>
              <span>Hands <strong>{hb.hands}</strong></span>
              <span>Autonomy <strong style={{ color: hb.autonomy === 'off' ? 'var(--text-secondary)' : '#f87171' }}>{hb.autonomy}{hb.autonomy !== 'off' ? ' ⚠' : ''}</strong></span>
            </span>
          ) : <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>reading pulse…</span>}
        </div>

        <section style={card}>
          <h2 style={h2}>Daily Token Budget</h2>
          <div style={{ height: 12, background: 'var(--bg-void)', borderRadius: 999, overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: pct >= 95 ? '#f87171' : pct >= 80 ? '#fbbf24' : '#22d3ee' }} />
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>{used.toLocaleString()} / {cap.toLocaleString()} ({pct}%) · {spend?.dailyRequests ?? 0} reqs · ${Number(spend?.dailyCost ?? 0).toFixed(4)}</div>
        </section>

        <section style={card}>
          <h2 style={h2}>Routing Lanes — pick a provider + model per lane. Empty key → falls back to a provider you have, then local.</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(data?.lanes || []).map(l => {
              const e = edit[l.lane];
              const curProvider = e?.provider ?? (l.userChoice?.provider || l.provider);
              const curModel = e?.model ?? (l.userChoice?.model || l.model);
              const dirty = !!e;
              return (
                <div key={l.lane} style={{ background: 'var(--bg-tertiary)', borderRadius: 8, padding: '10px 14px', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ minWidth: 150 }}>
                      <strong style={{ color: 'var(--text-primary)', fontSize: 13 }}>{l.lane}</strong>
                      <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{l.label}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      <select style={sel} value={curProvider}
                        onChange={ev => setEdit(p => ({ ...p, [l.lane]: { provider: ev.target.value, model: modelsFor(ev.target.value)[0] || '' } }))}>
                        {available.map(a => <option key={a.provider} value={a.provider}>{a.provider}{a.hasKey ? '' : ' (no key)'}</option>)}
                      </select>
                      <select style={sel} value={curModel}
                        onChange={ev => setEdit(p => ({ ...p, [l.lane]: { provider: curProvider, model: ev.target.value } }))}>
                        {[curModel, ...modelsFor(curProvider).filter(m => m !== curModel)].filter(Boolean).map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                      {dirty && <button style={btn} onClick={() => saveLane(l.lane)}>Save</button>}
                      {l.userChoice && !dirty && <button style={{ ...btn, opacity: 0.7 }} onClick={() => resetLane(l.lane)}>Reset</button>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center' }}>
                    {l.source === 'user-config' ? badge('your choice', '#a78bfa') : l.source === 'env' ? badge('env', '#22d3ee') : badge('default', '#8b7ca8')}
                    {l.fellBackFrom
                      ? badge(`⚠ fell back from ${l.fellBackFrom} (no key)`, '#fbbf24')
                      : badge('live', '#34d399')}
                    <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>effective: {l.provider}/{l.model}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section style={card}>
          <h2 style={h2}>Providers — key status & discovered models</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 8 }}>
            {available.map(a => (
              <div key={a.provider} style={{ background: 'var(--bg-tertiary)', borderRadius: 8, padding: '8px 12px', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 600 }}>{a.provider}</div>
                <div style={{ marginTop: 3 }}>{a.hasKey ? badge('key', '#34d399') : badge('no key', '#8b7ca8')}</div>
                <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 3 }}>{a.models.length} models</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
