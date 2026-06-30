'use client';
import { useState, useEffect, useRef, useCallback } from 'react';

interface LogEntry {
  id: string;
  type: 'tool_call' | 'swarm_spawn' | 'error' | 'info' | 'warning' | 'api_response';
  message: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

interface UseApiReturn {
  logs: LogEntry[];
  addLog: (log: Omit<LogEntry, 'id' | 'timestamp'>) => void;
  clearLogs: () => void;
}

function useApi(): UseApiReturn {
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const addLog = useCallback((entry: Omit<LogEntry, 'id' | 'timestamp'>) => {
    const newLog: LogEntry = {
      ...entry,
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    };
    setLogs((prev) => [...prev.slice(-499), newLog]);
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  useEffect(() => {
    const eventSource = new EventSource('/api/logs/stream');
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        addLog(data);
      } catch {
        addLog({ type: 'info', message: event.data });
      }
    };
    eventSource.onerror = () => {
      addLog({ type: 'error', message: 'SSE connection lost' });
      eventSource.close();
    };
    return () => eventSource.close();
  }, [addLog]);

  return { logs, addLog, clearLogs };
}

const LOG_TYPE_COLORS: Record<string, string> = {
  tool_call: '#3b82f6',
  swarm_spawn: '#22c55e',
  error: '#ef4444',
  warning: '#f59e0b',
  info: '#6b7280',
  api_response: '#8b5cf6',
};

const LOG_TYPE_LABELS: Record<string, string> = {
  tool_call: 'Tool',
  swarm_spawn: 'Spawn',
  error: 'Error',
  warning: 'Warn',
  info: 'Info',
  api_response: 'API',
};

export default function LogFeed() {
  const { logs, clearLogs } = useApi();
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const filteredLogs = filter ? logs.filter((log) => log.type === filter) : logs;

  useEffect(() => {
    if (!paused && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, paused]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const isAtBottom = target.scrollHeight - target.scrollTop <= target.clientHeight + 50;
    if (isAtBottom && !paused) {
      setPaused(false);
    }
  }, [paused]);

  const formatTimestamp = (ts: string) => {
    const date = new Date(ts);
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }) + '.' + date.getMilliseconds().toString().padStart(3, '0');
  };

  return (
    <div className="log-feed">
      <div className="log-feed-header">
        <div className="log-feed-controls">
          <button
            onClick={() => setPaused((p) => !p)}
            className={`log-feed-btn ${paused ? 'paused' : ''}`}
          >
            {paused ? '▶ Resume' : '⏸ Pause'}
          </button>
          <button onClick={clearLogs} className="log-feed-btn clear">
            Clear
          </button>
        </div>
        <div className="log-feed-filters">
          <button
            onClick={() => setFilter(null)}
            className={`filter-btn ${filter === null ? 'active' : ''}`}
          >
            All
          </button>
          {Object.entries(LOG_TYPE_LABELS).map(([type, label]) => (
            <button
              key={type}
              onClick={() => setFilter(filter === type ? null : type)}
              className={`filter-btn ${filter === type ? 'active' : ''}`}
              style={{ '--filter-color': LOG_TYPE_COLORS[type] } as React.CSSProperties}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="log-feed-scroll" ref={scrollRef} onScroll={handleScroll}>
        {filteredLogs.length === 0 ? (
          <div className="log-feed-empty">
            {filter ? `No ${LOG_TYPE_LABELS[filter] || filter} logs` : 'Waiting for logs...'}
          </div>
        ) : (
          filteredLogs.map((log) => (
            <div key={log.id} className={`log-entry log-${log.type}`}>
              <span className="log-timestamp">{formatTimestamp(log.timestamp)}</span>
              <span
                className="log-type-badge"
                style={{ backgroundColor: LOG_TYPE_COLORS[log.type] }}
              >
                {LOG_TYPE_LABELS[log.type] || log.type}
              </span>
              <span className="log-message">{log.message}</span>
              {log.data && (
                <details className="log-data">
                  <summary>Data</summary>
                  <pre>{JSON.stringify(log.data, null, 2)}</pre>
                </details>
              )}
            </div>
          ))
        )}
      </div>
      {paused && (
        <div className="log-feed-paused-indicator">
          <span>⏸ Paused</span>
          <span className="log-count">{filteredLogs.length} entries</span>
        </div>
      )}
      <style jsx>{`
        .log-feed {
          display: flex;
          flex-direction: column;
          height: 400px;
          background: #0f172a;
          border-radius: 8px;
          border: 1px solid #1e293b;
          font-family: 'JetBrains Mono', 'Fira Code', monospace;
          font-size: 12px;
          color: #e2e8f0;
          overflow: hidden;
        }
        .log-feed-header {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          padding: 12px;
          background: #1e293b;
          border-bottom: 1px solid #334155;
          align-items: center;
          justify-content: space-between;
        }
        .log-feed-controls {
          display: flex;
          gap: 8px;
        }
        .log-feed-filters {
          display: flex;
          gap: 4px;
          flex-wrap: wrap;
        }
        .log-feed-btn {
          padding: 6px 12px;
          border-radius: 4px;
          border: 1px solid #475569;
          background: #334155;
          color: #e2e8f0;
          cursor: pointer;
          font-size: 11px;
          font-family: inherit;
          transition: all 0.15s;
        }
        .log-feed-btn:hover {
          background: #475569;
        }
        .log-feed-btn.paused {
          background: #22c55e;
          border-color: #22c55e;
          color: #0f172a;
        }
        .log-feed-btn.clear {
          background: transparent;
          border-color: #ef4444;
          color: #ef4444;
        }
        .log-feed-btn.clear:hover {
          background: #ef4444;
          color: white;
        }
        .filter-btn {
          padding: 4px 8px;
          border-radius: 4px;
          border: 1px solid #475569;
          background: transparent;
          color: #94a3b8;
          cursor: pointer;
          font-size: 10px;
          font-family: inherit;
          transition: all 0.15s;
        }
        .filter-btn:hover {
          background: #334155;
          color: #e2e8f0;
        }
        .filter-btn.active {
          background: var(--filter-color, #475569);
          border-color: var(--filter-color, #475569);
          color: white;
        }
        .log-feed-scroll {
          flex: 1;
          overflow-y: auto;
          padding: 8px;
          scroll-behavior: smooth;
        }
        .log-feed-scroll::-webkit-scrollbar {
          width: 8px;
        }
        .log-feed-scroll::-webkit-scrollbar-track {
          background: #1e293b;
        }
        .log-feed-scroll::-webkit-scrollbar-thumb {
          background: #475569;
          border-radius: 4px;
        }
        .log-feed-empty {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: #64748b;
          font-style: italic;
        }
        .log-entry {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          padding: 6px 8px;
          border-radius: 4px;
          margin-bottom: 4px;
          background: #1e293b;
          align-items: baseline;
          line-height: 1.5;
        }
        .log-entry:hover {
          background: #334155;
        }
        .log-timestamp {
          color: #64748b;
          font-size: 10px;
          min-width: 90px;
        }
        .log-type-badge {
          padding: 2px 6px;
          border-radius: 3px;
          font-size: 9px;
          font-weight: 600;
          color: white;
          text-transform: uppercase;
          min-width: 50px;
          text-align: center;
        }
        .log-message {
          flex: 1;
          word-break: break-word;
          color: #e2e8f0;
        }
        .log-entry.log-error {
          background: rgba(239, 68, 68, 0.1);
          border-left: 3px solid #ef4444;
        }
        .log-entry.log-error:hover {
          background: rgba(239, 68, 68, 0.15);
        }
        .log-entry.log-warning {
          background: rgba(245, 158, 11, 0.1);
          border-left: 3px solid #f59e0b;
        }
        .log-data {
          width: 100%;
          margin-top: 4px;
        }
        .log-data summary {
          cursor: pointer;
          color: #64748b;
          font-size: 10px;
        }
        .log-data pre {
          background: #0f172a;
          padding: 8px;
          border-radius: 4px;
          margin-top: 4px;
          overflow-x: auto;
          font-size: 10px;
          color: #94a3b8;
        }
        .log-feed-paused-indicator {
          display: flex;
          justify-content: space-between;
          padding: 8px 12px;
          background: #22c55e;
          color: #0f172a;
          font-weight: 600;
          font-size: 11px;
        }
        .log-count {
          opacity: 0.8;
        }
      `}</style>
    </div>
  );
}
