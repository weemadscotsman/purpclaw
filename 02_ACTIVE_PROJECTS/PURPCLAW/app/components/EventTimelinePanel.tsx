'use client';

import type { MissionData } from '../hooks/useMissionData';

/**
 * EventTimelinePanel — LIVE event stream from MissionData.logs.
 *
 * Shows agent spawns, service health changes, errors, and all
 * runtime events in reverse chronological order.
 */
export function EventTimelinePanel({ data }: { data: MissionData }) {
  const logs = data?.logs || [];
  const services = data?.services || [];
  const onlineCount = services.filter(s => s.status === 'online').length;
  const totalCount = services.length;

  // Filter to last 100 events
  const events = logs.slice(-100).reverse();

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-sm font-bold uppercase tracking-widest text-cyan-400">Event Lens</h2>
        <span className="text-[10px] text-zinc-500">
          {events.length} events · {onlineCount}/{totalCount} services
        </span>
      </div>

      {events.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-3xl mb-4">📡</div>
          <div className="text-xs text-zinc-400">No events received yet.</div>
          <div className="text-[10px] text-zinc-600 mt-2">
            Events appear here when services report health changes, agent spawns, or runtime errors.
          </div>
        </div>
      ) : (
        <div className="space-y-0.5 max-h-[70vh] overflow-y-auto">
          {events.map((ev: any, i: number) => {
            const ts = ev.ts || ev.timestamp || ev.time || '';
            const time = typeof ts === 'number'
              ? new Date(ts).toLocaleTimeString()
              : String(ts).slice(0, 8);
            const level = (ev.level || '').toLowerCase();
            const message = ev.message || ev.text || ev.content || ev.event || JSON.stringify(ev);
            const errorBadge = level === 'error' || level === 'crit' || level === 'fatal';

            return (
              <div
                key={i}
                className={`flex items-start gap-2 px-2 py-1 text-[10px] font-mono ${
                  errorBadge ? 'bg-rose-900/10' : 'hover:bg-white/5'
                }`}
              >
                <span className="text-zinc-600 w-16 shrink-0">{time}</span>
                {errorBadge && <span className="text-rose-400 w-4 shrink-0">✗</span>}
                {!errorBadge && ev.type === 'agent_spawn' && <span className="text-cyan-400 w-4 shrink-0">◆</span>}
                {!errorBadge && !ev.type && <span className="text-zinc-500 w-4 shrink-0">·</span>}
                <span className={errorBadge ? 'text-rose-300' : 'text-zinc-400 truncate'}>
                  {String(message).substring(0, 200)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Service summary footer */}
      {services.length > 0 && (
        <div className="text-[10px] text-zinc-600 mt-4 border-t border-zinc-800 pt-3">
          {services.filter(s => s.status === 'online').map(s => (
            <span key={s.key} className="inline-block mr-3 text-emerald-500/70">
              {s.name} :{s.port}
            </span>
          ))}
          {services.filter(s => s.status !== 'online').map(s => (
            <span key={s.key} className="inline-block mr-3 text-zinc-600 line-through">
              {s.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

