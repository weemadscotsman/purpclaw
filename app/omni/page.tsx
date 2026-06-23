'use client';

import { useEffect, useState } from 'react';
import { CockpitShell } from '../components/CockpitShell';

// OMNI-SURGEON Cockpit — Phase Five
// Operator surface that shows the truth snapshot, feature registry,
// and patch review status. Reads from /api/omni/* routes.
//
// This is built AFTER the scanner and registry are solid, per the
// master spec: "Pretty cockpit before truth scanner is how humans
// invented dashboards that lie for a living."

type Feature = {
  id: string;
  dir?: string;
  state: string;
  actionRequired: boolean;
  reasons?: string[];
  note?: string;
};

type Stats = {
  features: number;
  services: number;
  routes: number;
  assets: number;
  byFeatureState?: Record<string, number>;
  byServiceState?: Record<string, number>;
  actionRequired?: number;
};

type PatchReview = {
  decision: string;
  violations: { rule: string; severity: string; where: string; note: string }[];
  requiresHonestyTest: boolean;
  requiresOperatorOverride: boolean;
} | null;

const STATE_COLORS: Record<string, string> = {
  'active': '#34d399',
  'partial': '#fbbf24',
  'missing-wiring': '#f472b6',
  'failing': '#f43f5e',
  'blocked-by-dependency': '#a3a300',
  'operator-disabled': '#7b7fa3',
  'legacy': '#67e8f9',
  'external': '#22d3ee',
  'planned': '#a855f7',
};

export default function OmniPage() {
  const [registry, setRegistry] = useState<{ features: Feature[]; stats: Stats } | null>(null);
  const [snapshot, setSnapshot] = useState<{ scanStats: Record<string, number> } | null>(null);
  const [patchReview, setPatchReview] = useState<PatchReview>(null);
  const [filter, setFilter] = useState<'all' | 'actionRequired' | 'failing' | 'partial'>('all');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setBusy(true);
    try {
      const [r1, r2, r3] = await Promise.all([
        fetch('/api/omni/registry', { cache: 'no-store' }).then(r => r.json()).catch(() => null),
        fetch('/api/omni/scan', { cache: 'no-store' }).then(r => r.json()).catch(() => null),
        fetch('/api/omni/patch/review', { cache: 'no-store' }).then(r => r.json()).catch(() => null),
      ]);
      if (r1) setRegistry(r1);
      if (r2) setSnapshot(r2);
      if (r3) setPatchReview(r3);
      setErr(null);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }

  useEffect(() => { load(); const i = setInterval(load, 5000); return () => clearInterval(i); }, []);

  const filtered = registry?.features?.filter(f => {
    if (filter === 'all') return true;
    if (filter === 'actionRequired') return f.actionRequired;
    return f.state === filter;
  }) || [];

  return (
    <CockpitShell>
      <div style={{ padding: 24, color: '#e5e7eb', fontFamily: 'system-ui' }}>
        <h1 style={{ color: '#22d3ee', fontSize: 24, margin: '0 0 16px' }}>
          OMNI-SURGEON Cockpit
          <span style={{ color: '#7b7fa3', fontSize: 12, marginLeft: 12 }}>
            scanner / registry / governor
          </span>
        </h1>

        {err && (
          <div style={{ background: '#7f1d1d', padding: 12, marginBottom: 12, borderRadius: 6 }}>
            {err}
          </div>
        )}

        {/* TRUTH SNAPSHOT panel */}
        {snapshot && snapshot.scanStats && (
          <section style={{ background: '#0f172a', padding: 16, marginBottom: 16, borderRadius: 8, border: '1px solid #1e293b' }}>
            <h2 style={{ color: '#a855f7', fontSize: 16, margin: '0 0 12px' }}>Repo Truth Snapshot</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8, fontSize: 12 }}>
              {Object.entries(snapshot.scanStats).map(([k, v]) => (
                <div key={k} style={{ background: '#1e293b', padding: 8, borderRadius: 4 }}>
                  <div style={{ color: '#7b7fa3' }}>{k}</div>
                  <div style={{ color: '#22d3ee', fontWeight: 600, fontSize: 16 }}>{String(v)}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* FEATURE REGISTRY panel */}
        {registry && registry.stats && (
          <section style={{ background: '#0f172a', padding: 16, marginBottom: 16, borderRadius: 8, border: '1px solid #1e293b' }}>
            <h2 style={{ color: '#a855f7', fontSize: 16, margin: '0 0 12px' }}>
              Feature Registry ({registry.stats.features} total, {registry.stats.actionRequired} action-required)
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8, marginBottom: 12, fontSize: 12 }}>
              {Object.entries(registry.stats.byFeatureState || {}).map(([state, n]) => (
                <div key={state} style={{ background: '#1e293b', padding: 8, borderRadius: 4, borderLeft: `3px solid ${STATE_COLORS[state] || '#7b7fa3'}` }}>
                  <div style={{ color: '#7b7fa3' }}>{state}</div>
                  <div style={{ color: STATE_COLORS[state] || '#7b7fa3', fontWeight: 600, fontSize: 16 }}>{String(n)}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
              {(['all', 'actionRequired', 'failing', 'partial'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  style={{
                    background: filter === f ? '#22d3ee' : '#1e293b',
                    color: filter === f ? '#0f172a' : '#e5e7eb',
                    border: 'none', padding: '4px 12px', borderRadius: 4, cursor: 'pointer', fontSize: 12,
                  }}>
                  {f}
                </button>
              ))}
            </div>
            <div style={{ maxHeight: 480, overflow: 'auto', border: '1px solid #1e293b', borderRadius: 4 }}>
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, background: '#1e293b' }}>
                  <tr>
                    <th style={{ textAlign: 'left', padding: 6 }}>id</th>
                    <th style={{ textAlign: 'left', padding: 6 }}>state</th>
                    <th style={{ textAlign: 'left', padding: 6 }}>action</th>
                    <th style={{ textAlign: 'left', padding: 6 }}>note</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(f => (
                    <tr key={f.id} style={{ borderTop: '1px solid #1e293b' }}>
                      <td style={{ padding: 6, color: '#22d3ee' }}>{f.id}</td>
                      <td style={{ padding: 6 }}>
                        <span style={{ color: STATE_COLORS[f.state] || '#7b7fa3' }}>{f.state}</span>
                      </td>
                      <td style={{ padding: 6, color: f.actionRequired ? '#f43f5e' : '#34d399' }}>
                        {f.actionRequired ? 'YES' : '-'}
                      </td>
                      <td style={{ padding: 6, color: '#7b7fa3' }}>{(f.note || (f.reasons || []).join('; ')).slice(0, 120)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* PATCH GOVERNOR panel */}
        {patchReview && (
          <section style={{ background: '#0f172a', padding: 16, marginBottom: 16, borderRadius: 8, border: '1px solid #1e293b' }}>
            <h2 style={{ color: '#a855f7', fontSize: 16, margin: '0 0 12px' }}>
              Patch Governor — Last Review
            </h2>
            <div style={{ marginBottom: 8 }}>
              <span style={{ color: '#7b7fa3' }}>decision: </span>
              <span style={{ color: patchReview.decision === 'block' ? '#f43f5e' : patchReview.decision === 'review' ? '#fbbf24' : '#34d399', fontWeight: 600 }}>
                {patchReview.decision}
              </span>
            </div>
            <div style={{ marginBottom: 8 }}>
              <span style={{ color: '#7b7fa3' }}>requiresOperatorOverride: </span>
              <span style={{ color: patchReview.requiresOperatorOverride ? '#f43f5e' : '#34d399' }}>{String(patchReview.requiresOperatorOverride)}</span>
            </div>
            {patchReview.violations.length > 0 && (
              <div style={{ marginTop: 8 }}>
                {patchReview.violations.map((v, i) => (
                  <div key={i} style={{ background: '#1e293b', padding: 8, borderRadius: 4, marginBottom: 4, fontSize: 12 }}>
                    <span style={{ color: v.severity === 'P0' ? '#f43f5e' : '#fbbf24', fontWeight: 600 }}>[{v.severity}]</span> {v.rule} ({v.where}): {v.note}
                  </div>
                ))}
              </div>
            )}
            {patchReview.violations.length === 0 && (
              <div style={{ color: '#7b7fa3', fontSize: 12 }}>no violations on the last review</div>
            )}
          </section>
        )}

        <div style={{ color: '#7b7fa3', fontSize: 11, marginTop: 24 }}>
          Auto-refresh every 5s. Read <a href="/api/omni/status" style={{ color: '#22d3ee' }}>/api/omni/status</a> for raw JSON.
        </div>
      </div>
    </CockpitShell>
  );
}
