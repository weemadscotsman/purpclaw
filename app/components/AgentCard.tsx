'use client';

interface AgentCardProps {
  agent: {
    id: string;
    name?: string;
    division: string;
    status: string;
    currentTask: string;
    pid?: number;
    startTime: string;
  };
  onKill: (id: string) => void;
}

function getDivisionEmoji(division: string): string {
  const emojis: Record<string, string> = {
    engineering: '⚙️',
    design: '🎨',
    marketing: '📢',
    sales: '💼',
    support: '🎧',
    operations: '⚡',
    finance: '💰',
    hr: '👥',
    legal: '⚖️',
  };
  return emojis[division.toLowerCase()] || '🤖';
}

function getStatusColor(status: string): string {
  switch (status.toLowerCase()) {
    case 'working':
    case 'active':
    case 'running':
      return 'bg-green-500';
    case 'idle':
    case 'waiting':
    case 'ready':
      return 'bg-yellow-500';
    case 'error':
    case 'failed':
    case 'stopped':
      return 'bg-red-500';
    default:
      return 'bg-gray-500';
  }
}

function calculateUptime(startTime: string): string {
  const start = new Date(startTime).getTime();
  const now = Date.now();
  const diff = Math.floor((now - start) / 1000);

  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ${diff % 60}s`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`;
  return `${Math.floor(diff / 86400)}d ${Math.floor((diff % 86400) / 3600)}h`;
}

export function AgentCard({ agent, onKill }: AgentCardProps) {
  const emoji = getDivisionEmoji(agent.division);
  const statusColor = getStatusColor(agent.status);
  const uptime = calculateUptime(agent.startTime);

  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 hover:border-gray-600 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{emoji}</span>
          <div>
            <h3 className="text-white font-semibold text-lg">{agent.name || agent.id}</h3>
            <p className="text-gray-400 text-sm capitalize">{agent.division}</p>
          </div>
        </div>
        <div className={`w-3 h-3 rounded-full ${statusColor} shadow-lg`} title={agent.status} />
      </div>

      <div className="space-y-2 mb-4">
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Status</span>
          <span className="text-white capitalize font-medium">{agent.status}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Task</span>
          <span className="text-gray-200 truncate max-w-32" title={agent.currentTask}>
            {agent.currentTask || 'None'}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">PID</span>
          <span className="text-gray-200 font-mono">{agent.pid || 'N/A'}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Uptime</span>
          <span className="text-gray-200 font-mono">{uptime}</span>
        </div>
      </div>

      <button
        onClick={() => onKill(agent.id)}
        className="w-full py-2 px-4 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded transition-colors"
      >
        Kill Agent
      </button>
    </div>
  );
}
