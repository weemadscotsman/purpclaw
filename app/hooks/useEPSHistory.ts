'use client';

import { useState, useEffect, useRef } from 'react';

interface EPSDataPoint {
  timestamp: number;
  eps: number;
}

export function useEPSHistory(windowSeconds = 60) {
  const [history, setHistory] = useState<EPSDataPoint[]>([]);
  const countRef = useRef(0);
  const lastResetRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    lastResetRef.current = Date.now();

    const proxyUrl = (port: number, path: string) =>
      `/api/service-proxy?port=${port}&path=${encodeURIComponent(path)}&soft=1`;

    const unwrapProxy = (payload: any) => payload?.data ?? payload;

    // Poll eventbus /state to count recentEvents.length
    const poll = async () => {
      try {
        const res = await fetch(proxyUrl(7782, '/state'), { signal: AbortSignal.timeout(2000) });
        if (res.ok) {
          const data = unwrapProxy(await res.json());
          const events = data.recentEvents || [];
          const now = Date.now();
          // Count events in the last 2 seconds as a rough EPS
          const recent = events.filter((e: any) => {
            const age = now - (e.ts || now);
            return age < 2000;
          });
          countRef.current = recent.length;
        }
      } catch {}
    };

    poll();
    const pollInterval = setInterval(poll, 2000);

    // Every second, record a data point
    intervalRef.current = setInterval(() => {
      const now = Date.now();
      const elapsed = (now - lastResetRef.current) / 1000;
      const eps = elapsed > 0 ? Math.round(countRef.current / elapsed) : 0;

      setHistory(prev => {
        const cutoff = now - windowSeconds * 1000;
        const next = [...prev, { timestamp: now, eps }].filter(p => p.timestamp > cutoff);
        return next.length > 200 ? next.slice(-200) : next;
      });

      countRef.current = 0;
      lastResetRef.current = now;
    }, 1000);

    return () => {
      clearInterval(pollInterval);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [windowSeconds]);

  return history;
}
