'use client';

interface Division {
  id: string;
  name: string;
  color: string;
  tier: number;
  agents: string[];
  activeCount: number;
  idleCount: number;
  totalAgents: number;
}

interface ActiveAgent {
  id: string;
  name: string;
  division: string;
  status: string;
  task?: string;
}

interface LogEntry {
  id: string;
  timestamp: string;
  topic: string;
  message: string;
  level: string;
  source: string;
}

interface DivisionActivityPanelProps {
  divisions: Record<string, Division>;
  activeAgents: ActiveAgent[];
  logs: LogEntry[];
  selectedDivision?: string | null;
  onSelectDivision?: (id: string | null) => void;
}

export default function DivisionActivityPanel({
  divisions,
  activeAgents,
  logs,
  selectedDivision,
  onSelectDivision,
}: DivisionActivityPanelProps) {
  const divisionList = Object.values(divisions).sort((a, b) => a.tier - b.tier);

  if (divisionList.length === 0) {
    return (
      <div className="rounded-xl border border-white/5 bg-white/[0.01] p-4 flex items-center justify-center text-white/20 text-xs">
        No division data
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.01] overflow-hidden flex flex-col">
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {divisionList.map(div => {
          const divAgents = activeAgents.filter(a => a.division === div.id);
          const active = divAgents.filter(a => a.status === 'working').length;
          const completed = divAgents.filter(a => a.status === 'completed').length;
          const error = divAgents.filter(a => a.status === 'error').length;
          const latestLog = logs.find(l => l.source.toLowerCase() === div.id.toLowerCase() || div.agents.some(n => l.source.toLowerCase().includes(n.toLowerCase())));
          const isSelected = selectedDivision === div.id;

          return (
            <button
              key={div.id}
              onClick={() => onSelectDivision?.(isSelected ? null : div.id)}
              className={`w-full text-left rounded-lg border border-white/5 p-2 transition-all ${isSelected ? 'bg-white/[0.05] border-white/15' : 'bg-white/[0.02] hover:bg-white/[0.03]'}`}
              style={{ borderLeftColor: div.color, borderLeftWidth: '3px' }}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-white/80">{div.name}</span>
                <span className="text-[9px] text-white/30">{div.totalAgents} agents</span>
              </div>

              <div className="grid grid-cols-3 gap-1 mb-1.5">
                <div className="text-center rounded bg-emerald-500/10 py-1">
                  <div className="text-xs font-bold text-emerald-400">{active}</div>
                  <div className="text-[8px] text-emerald-400/60 uppercase">Active</div>
                </div>
                <div className="text-center rounded bg-white/5 py-1">
                  <div className="text-xs font-bold text-white/60">{completed}</div>
                  <div className="text-[8px] text-white/30 uppercase">Done</div>
                </div>
                <div className="text-center rounded bg-rose-500/10 py-1">
                  <div className="text-xs font-bold text-rose-400">{error}</div>
                  <div className="text-[8px] text-rose-400/60 uppercase">Error</div>
                </div>
              </div>

              {latestLog && (
                <div className="text-[9px] text-white/40 truncate">
                  <span className="text-white/20">Latest:</span> {latestLog.message}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
