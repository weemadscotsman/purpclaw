'use client';

// SPINE — the control-plane truth board. Renders the LIVE backend organs:
// pipeline health (green/amber/red/purple + leak/hide/die/fake-green flags),
// the proof ledger (evidence + fakeGreens), and the output vault (artifacts).
// All data comes straight from the spine proxies — UI truth == backend truth.

import { useEffect, useState, useCallback } from 'react';

const LIGHT: Record<string, string> = { green: '#34d399', amber: '#fbbf24', red: '#fb7185', purple: '#c084fc' };

type Health = { summary?: Record<string, number>; jobs?: any[] };
type Proof = { rows?: any[]; stats?: any };
type Vault = { artifacts?: any[]; stats?: any };

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ border: '1px solid var(--border-default, #2a2440)', borderRadius: 8, background: 'rgba(18,10,31,0.6)', padding: 14, minWidth: 0 }}>
      <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', color: '#c084fc', fontFamily: 'JetBrains Mono, monospace', marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

export default function SpinePage() {
  const [health, setHealth] = useState<Health>({});
  const [proof, setProof] = useState<Proof>({});
  const [vault, setVault] = useState<Vault>({});
  const [err, setErr] = useState<string>('');

  const load = useCallback(async () => {
    try {
      const [h, p, v] = await Promise.all([
        fetch('/api/pipeline', { cache: 'no-store' }).then(r => r.json()).catch(() => null),
        fetch('/api/proof?limit=40', { cache: 'no-store' }).then(r => r.json()).catch(() => null),
        fetch('/api/output/list?limit=40', { cache: 'no-store' }).then(r => r.json()).catch(() => null),
      ]);
      if (h) setHealth(h.health || h);
      if (p) setProof(p);
      if (v) setVault(v);
      setErr('');
    } catch (e: any) { setErr(e?.message || 'load failed'); }
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, [load]);

  const sum = health.summary || {};
  const jobs = health.jobs || [];
  const stop = async (job_id: string, type: string) => {
    await fetch('/api/pipeline', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'stop', jobId: job_id, type }) }).catch(() => {});
    load();
  };

  const mono = { fontFamily: 'JetBrains Mono, monospace', fontSize: 11 } as const;

  return (
    <>
      <div style={{ padding: 16, overflowY: 'auto', height: '100%', color: '#e5e0f0' }}>
        {err && <div style={{ color: '#fb7185', ...mono, marginBottom: 8 }}>spine unreachable: {err}</div>}

        {/* Health summary lights */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          {['green', 'amber', 'red', 'purple'].map(k => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--border-subtle,#2a2440)', borderRadius: 8, padding: '8px 14px', background: 'rgba(0,0,0,0.3)' }}>
              <span style={{ width: 10, height: 10, borderRadius: 5, background: LIGHT[k], boxShadow: `0 0 8px ${LIGHT[k]}` }} />
              <span style={{ fontSize: 20, fontWeight: 800, color: LIGHT[k] }}>{sum[k] ?? 0}</span>
              <span style={{ ...mono, color: '#8b85a0', textTransform: 'uppercase' }}>{k}</span>
            </div>
          ))}
          {proof.stats && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid #fb718540', borderRadius: 8, padding: '8px 14px', background: 'rgba(0,0,0,0.3)' }}>
              <span style={{ fontSize: 20, fontWeight: 800, color: proof.stats.fakeGreens ? '#fb7185' : '#34d399' }}>{proof.stats.fakeGreens ?? 0}</span>
              <span style={{ ...mono, color: '#8b85a0', textTransform: 'uppercase' }}>fake-greens</span>
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 14 }}>
          {/* Pipeline jobs */}
          <Card title={`Pipeline Jobs · ${jobs.length}`}>
            <div style={{ maxHeight: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {jobs.length === 0 && <div style={{ ...mono, color: '#6b6580' }}>no live jobs</div>}
              {jobs.slice().reverse().map((j: any, i: number) => (
                <div key={j.job_id || i} style={{ display: 'flex', alignItems: 'center', gap: 8, ...mono, padding: '3px 0' }}>
                  <span style={{ width: 8, height: 8, borderRadius: 4, background: LIGHT[j.light] || '#888', flexShrink: 0 }} />
                  <span style={{ color: '#c4b5fd', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{j.pipeline_name} <span style={{ color: '#6b6580' }}>· {j.lane}</span></span>
                  {j.flags?.length > 0 && <span style={{ color: '#fb7185' }}>[{j.flags.join(',')}]</span>}
                  <span style={{ color: '#6b6580' }}>{j.source}</span>
                  {j.status === 'running' && <button onClick={() => stop(j.job_id, 'cancel')} style={{ ...mono, cursor: 'pointer', background: 'transparent', border: '1px solid #fb718560', color: '#fb7185', borderRadius: 4, padding: '0 6px' }}>stop</button>}
                </div>
              ))}
            </div>
          </Card>

          {/* Proof ledger */}
          <Card title={`Proof Ledger · ${proof.stats?.total ?? 0} · ${proof.stats?.verified ?? 0} verified`}>
            <div style={{ maxHeight: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {(proof.rows || []).slice().reverse().slice(0, 40).map((r: any, i: number) => (
                <div key={r.id || i} style={{ ...mono, padding: '3px 0', display: 'flex', gap: 8 }}>
                  <span style={{ color: r.verification?.result === 'pass' ? '#34d399' : r.verification?.result === 'fail' ? '#fb7185' : '#fbbf24' }}>{r.verification?.result || '?'}</span>
                  <span style={{ color: '#c4b5fd' }}>{r.lane || r.agent}</span>
                  <span style={{ color: '#8b85a0', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{r.claim}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Output vault */}
          <Card title={`Output Vault · ${vault.stats?.total ?? 0} artifacts`}>
            <div style={{ maxHeight: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {(vault.artifacts || []).slice().reverse().slice(0, 40).map((a: any, i: number) => (
                <div key={a.artifact_id || i} style={{ ...mono, padding: '3px 0', display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ color: a.status === 'approved' ? '#34d399' : a.status === 'rejected' ? '#fb7185' : '#fbbf24' }}>{a.status}</span>
                  <span style={{ color: '#c4b5fd' }}>{a.lane}</span>
                  <span style={{ color: '#6b6580' }}>{a.type}</span>
                  <span style={{ color: '#8b85a0', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{a.summary || a.path}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
