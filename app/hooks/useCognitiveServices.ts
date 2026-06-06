'use client';

import { useState, useEffect, useCallback } from 'react';

export interface CognitiveServiceHealth {
  name: string;
  port: number;
  path: string;
  status: 'online' | 'offline' | 'checking' | 'disabled';
  latency?: number;
  details?: Record<string, any>;
  optional?: boolean;
  note?: string;
}

export interface CognitiveData {
  services: CognitiveServiceHealth[];
  memoryStats: Record<string, any> | null;
  bridgeStats: Record<string, any> | null;
  modalStats: Record<string, any> | null;
  diagStats: Record<string, any> | null;
  rulesStats: Record<string, any> | null;
  dreamStats: Record<string, any> | null;
  visionBridgeStatus: Record<string, any> | null;
  loading: boolean;
}

// Consolidated cognitive spine: one service (cognitive_spine.py on :7880) exposes
// all six brains via the unified API at /api/cognitive/status. No more per-port
// probing of 7785/7786/7787/7884/7895 — those were collapsed into the spine.
function proxyUrl(port: number, path: string) {
  return `/api/service-proxy?port=${port}&path=${encodeURIComponent(path)}`;
}

const DISPLAY_NAMES: Record<string, string> = {
  memory: 'Memory Matrix v2',
  'neuro-symbolic': 'Neuro-Symbolic Bridge',
  modal: 'Modal Logic Engine',
  diagnostics: 'Autonomous Diagnostics',
  rules: 'Symbolic Rules Engine',
  autodream: 'AutoDream Consolidation',
};

export function useCognitiveServices(): CognitiveData {
  const [data, setData] = useState<CognitiveData>({
    services: [], memoryStats: null, bridgeStats: null, modalStats: null,
    diagStats: null, rulesStats: null, dreamStats: null, visionBridgeStatus: null, loading: true,
  });

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(proxyUrl(7780, '/api/cognitive/status'), { signal: AbortSignal.timeout(4000) });
      const raw = res.ok ? await res.json() : null;
      const j = raw?.data ?? raw;
      const list = Array.isArray(j?.services) ? j.services : [];
      const byKey = (k: string) => list.find((s: any) => s.key === k);
      const dataFor = (k: string) => {
        const s = byKey(k);
        // memory exposes its numbers at the top level; others nest under data/stats
        return s?.data?.stats ?? s?.data ?? null;
      };

      const services: CognitiveServiceHealth[] = list.map((s: any) => ({
        name: DISPLAY_NAMES[s.key] || s.name || s.key,
        port: s.port || 7880,
        path: s.healthPath || '/health',
        status: s.online ? 'online' : 'offline',
        latency: s.latencyMs,
        details: s.data || null,
        optional: !s.required,
      }));

      setData({
        services,
        memoryStats: dataFor('memory'),
        bridgeStats: dataFor('neuro-symbolic'),
        modalStats: dataFor('modal'),
        diagStats: dataFor('diagnostics'),
        rulesStats: dataFor('rules'),
        dreamStats: dataFor('autodream'),
        visionBridgeStatus: null,
        loading: false,
      });
    } catch {
      setData(d => ({ ...d, loading: false }));
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(refresh, 0);
    const interval = setInterval(refresh, 15000);
    return () => { clearTimeout(t); clearInterval(interval); };
  }, [refresh]);

  return data;
}
