'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';

type Probe = {
  id: string;
  label: string;
  port: number;
  path: string;
  status: 'online' | 'offline' | 'checking';
  detail?: string;
};

type Receipt = {
  ok?: boolean;
  status?: string;
  workflowId?: string;
  approvalId?: string;
  route?: string;
  error?: string;
  [key: string]: unknown;
};

const TARGETS = [
  { id: 'tray', label: 'Windows tray agent', port: 7796, path: '/health' },
  { id: 'coordinator', label: 'Voice coordinator', port: 7781, path: '/health' },
  { id: 'bridge', label: 'TTS bridge', port: 7792, path: '/health' },
  { id: 'stt', label: 'Speech-to-text', port: 7896, path: '/health' },
];

export default function VoicePage() {
  const [probes, setProbes] = useState<Probe[]>(
    TARGETS.map(target => ({ ...target, status: 'checking' })),
  );
  const [command, setCommand] = useState('');
  const [pending, setPending] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  const load = useCallback(async () => {
    const results = await Promise.all(TARGETS.map(async target => {
      try {
        const response = await fetch(
          `/api/service-proxy?port=${target.port}&path=${encodeURIComponent(target.path)}&soft=1`,
          { cache: 'no-store' },
        );
        const body = await response.json();
        return {
          ...target,
          status: body.status === 'online' ? 'online' as const : 'offline' as const,
          detail: body.status === 'online'
            ? String(body.data?.status || body.data?.mode || 'ready')
            : String(body.error || 'not running'),
        };
      } catch {
        return { ...target, status: 'offline' as const, detail: 'probe failed' };
      }
    }));
    setProbes(results);
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 10_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const text = command.trim();
    if (!text || pending) return;
    setPending(true);
    setReceipt(null);
    try {
      const response = await fetch('/api/voice-command', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, approved: false }),
      });
      const body = await response.json();
      setReceipt({ ...body, ok: response.ok && body.ok !== false });
    } catch (error) {
      setReceipt({ ok: false, error: error instanceof Error ? error.message : String(error) });
    } finally {
      setPending(false);
      load();
    }
  };

  const online = probes.filter(probe => probe.status === 'online').length;
  const trayOnline = probes.find(probe => probe.id === 'tray')?.status === 'online';

  return (
    <>
      <div className="voice-console-grid">
        <section className="panel voice-console-panel">
          <div className="panel-head">
            <span>Voice Runtime</span>
            <span style={{ color: online === probes.length ? '#34d399' : '#fbbf24' }}>
              {online}/{probes.length} online
            </span>
          </div>
          <div style={{ display: 'grid', gap: 8, padding: 14 }}>
            {probes.map(probe => (
              <div key={probe.id} style={{ display: 'grid', gridTemplateColumns: '10px 1fr auto', gap: 10, alignItems: 'center', padding: 10, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6 }}>
                <span className={`dot ${probe.status === 'online' ? 'dot-ok' : probe.status === 'checking' ? 'dot-warn' : 'dot-error'}`} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{probe.label}</div>
                  <div className="mono" style={{ marginTop: 3, fontSize: 9, color: 'var(--text-muted)' }}>
                    127.0.0.1:{probe.port}{probe.path}
                  </div>
                </div>
                <span className="mono" style={{ fontSize: 10, color: probe.status === 'online' ? '#34d399' : '#fb7185' }}>
                  {probe.status.toUpperCase()} {probe.detail ? `- ${probe.detail}` : ''}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="panel voice-console-panel">
          <div className="panel-head">
            <span>Voice Command</span>
            <span style={{ color: trayOnline ? '#34d399' : '#fb7185' }}>
              {trayOnline ? 'READY' : 'TRAY OFFLINE'}
            </span>
          </div>
          <form onSubmit={submit} style={{ display: 'grid', gap: 10, padding: 14 }}>
            <label htmlFor="voice-command" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              This text follows the same router and approval gates used by microphone input.
            </label>
            <textarea
              id="voice-command"
              value={command}
              onChange={event => setCommand(event.target.value)}
              placeholder="Ask PURPCLAW to inspect status, open a tool, or run a governed task..."
              rows={7}
              style={{ width: '100%', resize: 'vertical', padding: 12, borderRadius: 6, border: '1px solid var(--border-strong)', background: '#0a0612', color: '#f5f0ff', fontFamily: 'JetBrains Mono, monospace' }}
            />
            <button type="submit" disabled={!trayOnline || pending || !command.trim()} style={{ padding: '10px 14px', border: '1px solid rgba(217,70,239,0.55)', borderRadius: 6, background: trayOnline ? 'linear-gradient(90deg, #7e22ce, #a21caf)' : '#27272a', color: 'white', cursor: trayOnline && !pending ? 'pointer' : 'not-allowed', fontWeight: 700 }}>
              {pending ? 'Routing command...' : 'Send through voice router'}
            </button>
          </form>
        </section>

        <section className="panel voice-console-panel voice-console-receipt">
          <div className="panel-head">
            <span>Execution Receipt</span>
            <span>{receipt ? (receipt.ok ? 'ACCEPTED' : 'BLOCKED / FAILED') : 'NO COMMAND'}</span>
          </div>
          <div style={{ padding: 14 }}>
            {receipt ? (
              <pre style={{ margin: 0, padding: 12, maxHeight: 360, overflow: 'auto', borderRadius: 6, background: '#07040c', color: receipt.ok ? '#a7f3d0' : '#fda4af', fontSize: 11, whiteSpace: 'pre-wrap' }}>
                {JSON.stringify(receipt, null, 2)}
              </pre>
            ) : (
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 11 }}>
                A real workflow ID, approval requirement, route, or error will appear here. No sample conversation is displayed.
              </p>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
