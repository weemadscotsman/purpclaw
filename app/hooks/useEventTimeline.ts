'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

export interface TimelineEvent {
  id: string;
  ts: number;
  topic: string;
  type: string;
  agentId?: string;
  agentName?: string;
  message?: string;
  data?: any;
}

interface UseEventTimelineOptions {
  topics?: string[];
  limit?: number;
}

export function useEventTimeline({ topics = ['agent', 'swarm', 'tool', 'orchestrator'], limit = 100 }: UseEventTimelineOptions = {}) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const autoScrollRef = useRef(true);
  const topicsKey = topics.join(',');

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch('http://localhost:7782/state', { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const data = await res.json();
        const all: TimelineEvent[] = (data.recentEvents || [])
          .filter((e: any) => topics.some(t => (e.topic || '').includes(t)))
          .slice(-limit)
          .map((e: any) => ({
            id: e.id || `${e.ts}-${Math.random()}`,
            ts: e.ts || Date.now(),
            topic: e.topic || '',
            type: e.type || '',
            agentId: e.agentId,
            agentName: e.agentName,
            message: e.message,
            data: e,
          }));
        setEvents(all);
        setLoading(false);
      }
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  }, [topics, limit]);

  useEffect(() => {
    const initialFetch = setTimeout(fetchHistory, 0);

    const es = new EventSource('http://localhost:7782/events/*');
    esRef.current = es;

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        const topic = data.topic || '';
        if (!topics.some(t => topic.includes(t))) return;

        const event: TimelineEvent = {
          id: `${data.ts || Date.now()}-${Math.random()}`,
          ts: data.ts || Date.now(),
          topic,
          type: data.type || '',
          agentId: data.agentId,
          agentName: data.agentName,
          message: data.message,
          data,
        };

        setEvents(prev => {
          const next = [event, ...prev];
          return next.slice(0, limit * 2);
        });
      } catch {}
    };

    es.onerror = () => es.close();
    return () => {
      clearTimeout(initialFetch);
      es.close();
    };
  }, [fetchHistory, topics, limit]);

  const toggleAutoScroll = useCallback(() => {
    autoScrollRef.current = !autoScrollRef.current;
  }, []);

  return { events, loading, error, autoScrollRef, toggleAutoScroll, refetch: fetchHistory };
}
