import { useState, useEffect, useCallback } from 'react';

// Types for swarm control
export type SwarmDivision = 'Engineering' | 'Security' | 'Media Ops' | 'Research';
export type SwarmPriority = 'low' | 'normal' | 'high' | 'critical';
export type SwarmAction = 'reallocate' | 'set_priority' | 'throttle' | 'boost' | 'get_status';

export interface SwarmStatus {
  totalAgents: number;
  activeAgents: number;
  divisions: Array<{
    name: SwarmDivision;
    agentCount: number;
    activeAgents: number;
    priority: SwarmPriority;
    cpuUsage: number;
    memoryUsage: number;
    lastUpdated: string;
  }>;
}

export interface SwarmControlResult {
  success: boolean;
  message: string;
  data?: any;
  error?: string;
}

// MCP Bridge connection - NO MOCK DATA
const MCP_BRIDGE_URL = 'http://localhost:7780';

async function mcpRequest(endpoint: string, method: string = 'GET', body?: any): Promise<any> {
  const opts: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${MCP_BRIDGE_URL}${endpoint}`, opts);
  if (!res.ok) throw new Error(`MCP request failed: ${res.status}`);
  return res.json();
}

export function useSwarmControl() {
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [lastResult, setLastResult] = useState<SwarmControlResult | null>(null);
  const [swarmStatus, setSwarmStatus] = useState<SwarmStatus | null>(null);

  // Division mapping from agent names
  const DIVISION_MAPPING: Record<string, SwarmDivision> = {
    'PURPCLAW': 'Engineering',
    'DeepSeek 3.1': 'Research',
    'Minimax 2.76': 'Media Ops',
    'Kimi Code K2.5': 'Engineering',
    'Gemini 3.1 Pro': 'Research',
    'Kilo Code': 'Security'
  };

  // Status to priority mapping
  const STATUS_TO_PRIORITY: Record<string, SwarmPriority> = {
    'working': 'high',
    'error': 'critical',
    'idle': 'normal',
    'offline': 'low'
  };

  // Connect to MCP bridge - REAL connection
  const connect = useCallback(async () => {
    setIsLoading(true);
    try {
      // Test connection to control API
      const status = await mcpRequest('/api/status');
      setIsConnected(true);

      // Get initial status
      await getStatus();

      return { success: true, message: 'Connected to swarm control' };
    } catch (err) {
      setIsConnected(false);
      return {
        success: false,
        message: 'Failed to connect to MCP bridge',
        error: err instanceof Error ? err.message : 'Unknown error'
      };
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Get current swarm status from REAL MCP bridge
  const getStatus = useCallback(async (): Promise<SwarmControlResult> => {
    setIsLoading(true);
    try {
      // Call real MCP bridge for swarm status
      const data = await mcpRequest('/api/swarm/status');

      const status: SwarmStatus = {
        totalAgents: data.totalAgents || 0,
        activeAgents: data.activeAgents || 0,
        divisions: data.divisions || []
      };

      setSwarmStatus(status);
      const result = {
        success: true,
        message: 'Swarm status retrieved from MCP bridge',
        data: status
      };
      setLastResult(result);
      return result;
    } catch (err) {
      // Bridge not available - return empty standby state
      const standbyStatus: SwarmStatus = {
        totalAgents: 0,
        activeAgents: 0,
        divisions: [
          { name: 'Engineering', agentCount: 0, activeAgents: 0, priority: 'normal', cpuUsage: 0, memoryUsage: 0, lastUpdated: new Date().toISOString() },
          { name: 'Security', agentCount: 0, activeAgents: 0, priority: 'normal', cpuUsage: 0, memoryUsage: 0, lastUpdated: new Date().toISOString() },
          { name: 'Media Ops', agentCount: 0, activeAgents: 0, priority: 'normal', cpuUsage: 0, memoryUsage: 0, lastUpdated: new Date().toISOString() },
          { name: 'Research', agentCount: 0, activeAgents: 0, priority: 'normal', cpuUsage: 0, memoryUsage: 0, lastUpdated: new Date().toISOString() }
        ]
      };
      setSwarmStatus(standbyStatus);
      const result = {
        success: false,
        message: 'MCP bridge unavailable - standby mode',
        error: err instanceof Error ? err.message : 'Unknown error',
        data: standbyStatus
      };
      setLastResult(result);
      return result;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Reallocate agents between divisions - REAL MCP call
  const reallocateAgents = useCallback(async (
    fromDivision: SwarmDivision,
    toDivision: SwarmDivision,
    count: number
  ): Promise<SwarmControlResult> => {
    setIsLoading(true);
    try {
      console.log(`🔄 Reallocating ${count} agents from ${fromDivision} to ${toDivision}`);

      // Call REAL MCP swarm_control tool
      const result = await mcpRequest('/api/swarm/control', 'POST', {
        action: 'reallocate',
        from_division: fromDivision,
        to_division: toDivision,
        count
      });

      setLastResult({
        success: true,
        message: `Successfully reallocated ${count} agents from ${fromDivision} to ${toDivision}`,
        data: result
      });

      // Refresh status after reallocation
      await getStatus();

      return result;
    } catch (err) {
      const result = {
        success: false,
        message: 'Failed to reallocate agents',
        error: err instanceof Error ? err.message : 'Unknown error'
      };
      setLastResult(result);
      return result;
    } finally {
      setIsLoading(false);
    }
  }, [getStatus]);

  // Set division priority - REAL MCP call
  const setPriority = useCallback(async (
    division: SwarmDivision,
    priority: SwarmPriority
  ): Promise<SwarmControlResult> => {
    setIsLoading(true);
    try {
      console.log(`🎯 Setting ${division} priority to ${priority}`);

      // Call REAL MCP swarm_control tool
      const result = await mcpRequest('/api/swarm/control', 'POST', {
        action: 'set_priority',
        division,
        priority
      });

      setLastResult({
        success: true,
        message: `Set ${division} priority to ${priority}`,
        data: result
      });

      // Update local status
      if (swarmStatus) {
        const updatedDivisions = swarmStatus.divisions.map(d =>
          d.name === division ? { ...d, priority } : d
        );
        setSwarmStatus({ ...swarmStatus, divisions: updatedDivisions });
      }

      return result;
    } catch (err) {
      const result = {
        success: false,
        message: 'Failed to set priority',
        error: err instanceof Error ? err.message : 'Unknown error'
      };
      setLastResult(result);
      return result;
    } finally {
      setIsLoading(false);
    }
  }, [swarmStatus]);

  // Handle agent click - REAL MCP call
  const handleAgentClick = useCallback(async (agentName: string): Promise<SwarmControlResult> => {
    const division = DIVISION_MAPPING[agentName];
    if (!division) {
      const result = {
        success: false,
        message: `No division mapping for agent: ${agentName}`,
        error: 'Unknown agent'
      };
      setLastResult(result);
      return result;
    }

    console.log(`🖱️ Agent clicked: ${agentName} → ${division}`);

    // Call REAL MCP dashboard_command tool
    try {
      const result = await mcpRequest('/api/dashboard/command', 'POST', {
        command: 'open_panel',
        division,
        data: { agentName }
      });
      setLastResult({
        success: true,
        message: `Control panel opened for ${division} (${agentName})`,
        data: result
      });
      return result;
    } catch (err) {
      const result = {
        success: false,
        message: `Failed to open control panel for ${division}`,
        error: err instanceof Error ? err.message : 'Unknown error'
      };
      setLastResult(result);
      return result;
    }
  }, []);

  // Handle voice command
  const handleVoiceCommand = useCallback(async (command: string): Promise<SwarmControlResult> => {
    console.log(`🎤 Processing voice command: "${command}"`);

    // Parse voice commands
    const shiftMatch = command.match(/shift (\d+) agents? from (.+?) to (.+)/i);
    if (shiftMatch) {
      const count = parseInt(shiftMatch[1]);
      const fromDivision = shiftMatch[2] as SwarmDivision;
      const toDivision = shiftMatch[3] as SwarmDivision;

      return await reallocateAgents(fromDivision, toDivision, count);
    }

    const priorityMatch = command.match(/set (.+?) priority to (.+)/i);
    if (priorityMatch) {
      const division = priorityMatch[1] as SwarmDivision;
      const priority = priorityMatch[2].toLowerCase() as SwarmPriority;

      if (['low', 'normal', 'high', 'critical'].includes(priority)) {
        return await setPriority(division, priority);
      }
    }

    const statusMatch = command.match(/get status(?: of (.+))?/i);
    if (statusMatch) {
      const division = statusMatch[1] as SwarmDivision | undefined;
      if (division) {
        // Get specific division status
        const status = swarmStatus?.divisions.find(d => d.name === division);
        if (status) {
          const result = {
            success: true,
            message: `Status for ${division}`,
            data: status
          };
          setLastResult(result);
          return result;
        } else {
          return {
            success: false,
            message: `Division not found: ${division}`,
            error: 'Division not found'
          };
        }
      } else {
        return await getStatus();
      }
    }

    const result = {
      success: false,
      message: 'Command not recognized',
      error: 'Unrecognized command',
      data: { command }
    };
    setLastResult(result);
    return result;
  }, [reallocateAgents, setPriority, getStatus, swarmStatus]);

  // Sync agent status with swarm control
  const syncAgentStatus = useCallback(async (agents: Array<{
    name: string;
    status: string;
    cpu: number;
    memory: number;
  }>): Promise<SwarmControlResult> => {
    console.log('🔄 Syncing agent status with swarm control...');

    // Group agents by division
    const divisionStats: Record<SwarmDivision, {
      count: number;
      working: number;
      error: number;
      idle: number;
      totalCpu: number;
      totalMemory: number;
    }> = {
      'Engineering': { count: 0, working: 0, error: 0, idle: 0, totalCpu: 0, totalMemory: 0 },
      'Security': { count: 0, working: 0, error: 0, idle: 0, totalCpu: 0, totalMemory: 0 },
      'Media Ops': { count: 0, working: 0, error: 0, idle: 0, totalCpu: 0, totalMemory: 0 },
      'Research': { count: 0, working: 0, error: 0, idle: 0, totalCpu: 0, totalMemory: 0 }
    };

    agents.forEach(agent => {
      const division = DIVISION_MAPPING[agent.name];
      if (!division) return;

      const stats = divisionStats[division];
      stats.count++;
      stats[agent.status as keyof typeof stats]++;
      stats.totalCpu += agent.cpu;
      stats.totalMemory += agent.memory;
    });

    // Update priorities based on status - REAL MCP calls
    const updates: Array<Promise<SwarmControlResult>> = [];

    for (const [division, stats] of Object.entries(divisionStats)) {
      if (stats.count === 0) continue;

      const avgCpu = stats.totalCpu / stats.count;
      const avgMemory = stats.totalMemory / stats.count;

      // Determine priority based on status
      let priority: SwarmPriority = 'normal';
      if (stats.error > 0) priority = 'critical';
      else if (stats.working > stats.idle) priority = 'high';
      else if (avgCpu > 80 || avgMemory > 80) priority = 'high';

      updates.push(setPriority(division as SwarmDivision, priority));
    }

    // Wait for all updates
    const results = await Promise.all(updates);
    const allSuccess = results.every(r => r.success);

    const result = {
      success: allSuccess,
      message: allSuccess ? 'Agent status synced' : 'Some updates failed',
      data: { divisionStats, results }
    };
    setLastResult(result);
    return result;
  }, [setPriority]);

  // Initialize on mount
  useEffect(() => {
    connect();
  }, [connect]);

  return {
    // State
    isConnected,
    isLoading,
    lastResult,
    swarmStatus,

    // Actions
    connect,
    getStatus,
    reallocateAgents,
    setPriority,
    handleAgentClick,
    handleVoiceCommand,
    syncAgentStatus,

    // Constants
    DIVISION_MAPPING,
    STATUS_TO_PRIORITY
  };
}
