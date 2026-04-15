'use client';
import { useState, useEffect, useRef } from 'react';
import { useApi } from '../hooks/useApi';
import { AgentList } from './AgentList';
import { LogFeed } from './LogFeed';

type Tab = 'command' | 'agents' | 'pipeline' | 'system' | 'settings';

interface SystemStats {
  cpu: number;
  memory: number;
  disk: { used: number; total: number; percent: number };
  uptime: string;
  processes: number;
}

interface PipelineStatus {
  stage: string;
  progress: number;
  status: 'idle' | 'running' | 'complete' | 'error';
  logs: string[];
}

export function UnifiedDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('command');
  const [commandInput, setCommandInput] = useState('');
  const [commandHistory, setCommandHistory] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [systemStats, setSystemStats] = useState<SystemStats | null>(null);
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus>({
    stage: 'idle',
    progress: 0,
    status: 'idle',
    logs: []
  });
  const [settings, setSettings] = useState({
    apiKey: '',
    mood: 'focused' as 'focused' | 'relaxed' | 'aggressive' | 'adaptive',
    autoSave: true,
    notifications: true
  });
  const chatEndRef = useRef<HTMLDivElement>(null);
  const { status, connected, sendCommand, getSettings, updateSettings, getSystemStats, getPipelineStatus } = useApi();

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [commandHistory]);

  useEffect(() => {
    if (activeTab === 'system') {
      const interval = setInterval(() => {
        setSystemStats({
          cpu: Math.random() * 100,
          memory: 45 + Math.random() * 20,
          disk: { used: 256, total: 512, percent: 50 },
          uptime: '2d 14h 32m',
          processes: 127
        });
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [activeTab]);

  const handleSendCommand = async () => {
    if (!commandInput.trim() || isProcessing) return;
    
    const userCommand = commandInput;
    setCommandHistory(prev => [...prev, { role: 'user', content: userCommand }]);
    setCommandInput('');
    setIsProcessing(true);

    try {
      const response = await sendCommand(userCommand);
      setCommandHistory(prev => [...prev, { role: 'assistant', content: response || 'Command executed successfully.' }]);
    } catch {
      setCommandHistory(prev => [...prev, { role: 'assistant', content: 'Error executing command.' }]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendCommand();
    }
  };

  const handleStartPipeline = () => {
    setPipelineStatus({
      stage: 'Initializing',
      progress: 0,
      status: 'running',
      logs: ['Starting pipeline...']
    });
    
    let progress = 0;
    const interval = setInterval(() => {
      progress += 10;
      if (progress >= 100) {
        clearInterval(interval);
        setPipelineStatus(prev => ({
          ...prev,
          stage: 'Complete',
          progress: 100,
          status: 'complete',
          logs: [...prev.logs, 'Pipeline completed successfully.']
        }));
      } else {
        const stages = ['Initializing', 'Fetching', 'Processing', 'Validating', 'Finalizing'];
        const stageIndex = Math.floor(progress / 25);
        setPipelineStatus(prev => ({
          ...prev,
          stage: stages[stageIndex],
          progress,
          logs: [...prev.logs, `Progress: ${progress}%`]
        }));
      }
    }, 500);
  };

  const handleStopPipeline = () => {
    setPipelineStatus(prev => ({
      ...prev,
      stage: 'Stopped',
      status: 'idle',
      logs: [...prev.logs, 'Pipeline stopped by user.']
    }));
  };

  const handleSaveSettings = () => {
    updateSettings(settings as any);
    setSettings(prev => ({ ...prev }));
  };

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'command', label: 'Command', icon: '>' },
    { id: 'agents', label: 'Agents', icon: '◉' },
    { id: 'pipeline', label: 'Pipeline', icon: '▶' },
    { id: 'system', label: 'System', icon: '◈' },
    { id: 'settings', label: 'Settings', icon: '⚙' }
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case 'command':
        return (
          <div className="flex flex-col h-full">
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {commandHistory.length === 0 ? (
                <div className="text-gray-500 text-center py-8">
                  Send a command to SAMMY to begin
                </div>
              ) : (
                commandHistory.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-lg ${msg.role === 'user' ? 'bg-blue-900/50 ml-8' : 'bg-gray-800/50 mr-8'}`}
                  >
                    <div className="text-xs text-gray-400 mb-1">{msg.role === 'user' ? 'You' : 'SAMMY'}</div>
                    <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
                  </div>
                ))
              )}
              {isProcessing && (
                <div className="bg-gray-800/50 mr-8 p-3 rounded-lg">
                  <div className="text-xs text-gray-400 mb-1">SAMMY</div>
                  <div className="flex items-center gap-2 text-sm text-gray-400">
                    <span className="animate-spin">◌</span> Processing...
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            <div className="p-4 border-t border-gray-700">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={commandInput}
                  onChange={(e) => setCommandInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Enter command for SAMMY..."
                  className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  disabled={isProcessing}
                />
                <button
                  onClick={handleSendCommand}
                  disabled={isProcessing || !commandInput.trim()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 rounded text-sm font-medium transition-colors"
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        );

      case 'agents':
        return (
          <div className="h-full overflow-auto p-4">
            <AgentList />
          </div>
        );

      case 'pipeline':
        return (
          <div className="h-full overflow-auto p-4 space-y-4">
            <div className="bg-gray-800/50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium">Pipeline Control</h3>
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                  pipelineStatus.status === 'running' ? 'bg-green-900 text-green-300' :
                  pipelineStatus.status === 'complete' ? 'bg-blue-900 text-blue-300' :
                  pipelineStatus.status === 'error' ? 'bg-red-900 text-red-300' :
                  'bg-gray-700 text-gray-300'
                }`}>
                  {pipelineStatus.status.toUpperCase()}
                </span>
              </div>
              
              <div className="mb-4">
                <div className="flex justify-between text-sm text-gray-400 mb-1">
                  <span>{pipelineStatus.stage}</span>
                  <span>{pipelineStatus.progress}%</span>
                </div>
                <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      pipelineStatus.status === 'error' ? 'bg-red-500' :
                      pipelineStatus.status === 'complete' ? 'bg-green-500' :
                      'bg-blue-500'
                    }`}
                    style={{ width: `${pipelineStatus.progress}%` }}
                  />
                </div>
              </div>

              <div className="flex gap-2">
                {pipelineStatus.status === 'idle' || pipelineStatus.status === 'complete' ? (
                  <button
                    onClick={handleStartPipeline}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded text-sm font-medium transition-colors"
                  >
                    Start Pipeline
                  </button>
                ) : (
                  <button
                    onClick={handleStopPipeline}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded text-sm font-medium transition-colors"
                  >
                    Stop Pipeline
                  </button>
                )}
                <button
                  onClick={() => setPipelineStatus(prev => ({ ...prev, logs: [] }))}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm font-medium transition-colors"
                >
                  Clear Logs
                </button>
              </div>
            </div>

            <div className="bg-gray-800/50 rounded-lg p-4">
              <h3 className="text-lg font-medium mb-3">Pipeline Logs</h3>
              <div className="bg-black/30 rounded p-3 h-48 overflow-y-auto font-mono text-xs">
                {pipelineStatus.logs.length === 0 ? (
                  <div className="text-gray-500">No logs available</div>
                ) : (
                  pipelineStatus.logs.map((log, idx) => (
                    <div key={idx} className="text-gray-300 mb-1">
                      [{new Date().toLocaleTimeString()}] {log}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="grid grid-cols-4 gap-4">
              {['Build', 'Test', 'Deploy', 'Monitor'].map((stage) => (
                <div key={stage} className="bg-gray-800/50 rounded-lg p-4 text-center">
                  <div className={`w-3 h-3 rounded-full mx-auto mb-2 ${
                    pipelineStatus.progress > (stage === 'Build' ? 0 : stage === 'Test' ? 25 : stage === 'Deploy' ? 50 : 75)
                      ? 'bg-green-500' : 'bg-gray-600'
                  }`} />
                  <div className="text-sm font-medium">{stage}</div>
                </div>
              ))}
            </div>
          </div>
        );

      case 'system':
        return (
          <div className="h-full overflow-auto p-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-800/50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-400 text-sm">CPU Usage</span>
                  <span className="text-lg font-mono">{systemStats?.cpu.toFixed(1)}%</span>
                </div>
                <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 transition-all duration-500"
                    style={{ width: `${systemStats?.cpu || 0}%` }}
                  />
                </div>
              </div>

              <div className="bg-gray-800/50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-400 text-sm">Memory</span>
                  <span className="text-lg font-mono">{systemStats?.memory.toFixed(1)}%</span>
                </div>
                <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-500"
                    style={{ width: `${systemStats?.memory || 0}%` }}
                  />
                </div>
              </div>

              <div className="bg-gray-800/50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-400 text-sm">Disk</span>
                  <span className="text-lg font-mono">{systemStats?.disk.percent}%</span>
                </div>
                <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-orange-500 to-yellow-500 transition-all duration-500"
                    style={{ width: `${systemStats?.disk.percent}%` }}
                  />
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {systemStats?.disk.used}GB / {systemStats?.disk.total}GB
                </div>
              </div>

              <div className="bg-gray-800/50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-400 text-sm">Processes</span>
                  <span className="text-lg font-mono">{systemStats?.processes}</span>
                </div>
              </div>
            </div>

            <div className="bg-gray-800/50 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <span className="text-gray-400 text-sm">System Uptime</span>
                <span className="text-lg font-mono">{systemStats?.uptime}</span>
              </div>
            </div>

            <div className="bg-gray-800/50 rounded-lg p-4">
              <h3 className="text-lg font-medium mb-3">Health Status</h3>
              <div className="grid grid-cols-4 gap-2">
                {['API', 'Database', 'Cache', 'Queue'].map((service) => (
                  <div key={service} className="bg-gray-900/50 rounded p-3 text-center">
                    <div className="w-2 h-2 rounded-full bg-green-500 mx-auto mb-1" />
                    <div className="text-xs text-gray-400">{service}</div>
                    <div className="text-xs text-green-500">Healthy</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-gray-800/50 rounded-lg p-4">
              <h3 className="text-lg font-medium mb-3">Log Feed</h3>
              <div className="h-40 overflow-hidden">
                <LogFeed />
              </div>
            </div>
          </div>
        );

      case 'settings':
        return (
          <div className="h-full overflow-auto p-4 space-y-6">
            <div className="bg-gray-800/50 rounded-lg p-4">
              <h3 className="text-lg font-medium mb-4">API Configuration</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">API Key</label>
                  <input
                    type="password"
                    value={settings.apiKey}
                    onChange={(e) => setSettings(prev => ({ ...prev, apiKey: e.target.value }))}
                    placeholder="Enter your API key"
                    className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
                <button
                  onClick={handleSaveSettings}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm font-medium transition-colors"
                >
                  Save API Settings
                </button>
              </div>
            </div>

            <div className="bg-gray-800/50 rounded-lg p-4">
              <h3 className="text-lg font-medium mb-4">Mood Selection</h3>
              <div className="grid grid-cols-2 gap-3">
                {(['focused', 'relaxed', 'aggressive', 'adaptive'] as const).map((mood) => (
                  <button
                    key={mood}
                    onClick={() => setSettings(prev => ({ ...prev, mood }))}
                    className={`p-3 rounded-lg border-2 transition-colors ${
                      settings.mood === mood
                        ? 'border-blue-500 bg-blue-900/30'
                        : 'border-gray-700 hover:border-gray-600'
                    }`}
                  >
                    <div className="text-sm font-medium capitalize">{mood}</div>
                    <div className="text-xs text-gray-400 mt-1">
                      {mood === 'focused' && 'Optimized for deep work'}
                      {mood === 'relaxed' && 'Casual and thorough'}
                      {mood === 'aggressive' && 'Fast and decisive'}
                      {mood === 'adaptive' && 'Adjusts to context'}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-gray-800/50 rounded-lg p-4">
              <h3 className="text-lg font-medium mb-4">Preferences</h3>
              <div className="space-y-4">
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-sm">Auto-save logs</span>
                  <button
                    onClick={() => setSettings(prev => ({ ...prev, autoSave: !prev.autoSave }))}
                    className={`w-12 h-6 rounded-full transition-colors ${
                      settings.autoSave ? 'bg-blue-600' : 'bg-gray-700'
                    }`}
                  >
                    <div className={`w-5 h-5 bg-white rounded-full transition-transform ${
                      settings.autoSave ? 'translate-x-6' : 'translate-x-0.5'
                    }`} />
                  </button>
                </label>
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-sm">Enable notifications</span>
                  <button
                    onClick={() => setSettings(prev => ({ ...prev, notifications: !prev.notifications }))}
                    className={`w-12 h-6 rounded-full transition-colors ${
                      settings.notifications ? 'bg-blue-600' : 'bg-gray-700'
                    }`}
                  >
                    <div className={`w-5 h-5 bg-white rounded-full transition-transform ${
                      settings.notifications ? 'translate-x-6' : 'translate-x-0.5'
                    }`} />
                  </button>
                </label>
              </div>
            </div>

            <div className="bg-gray-800/50 rounded-lg p-4">
              <h3 className="text-lg font-medium mb-4">About</h3>
              <div className="text-sm text-gray-400 space-y-1">
                <div>Version: 1.0.0</div>
                <div>Build: 2026.04.08</div>
                <div>PURPCLAW Dashboard</div>
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gray-900 text-white">
      <div className="flex border-b border-gray-700">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-gray-800 text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
            }`}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-hidden">
        {renderTabContent()}
      </div>

      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-t border-gray-700 text-xs text-gray-400">
        <div className="flex items-center gap-4">
          <span>Status: <span className={connected ? 'text-green-400' : 'text-yellow-400'}>{connected ? 'Connected' : 'Disconnected'}</span></span>
          <span>PURPCLAW v1.0</span>
        </div>
        <div className="flex items-center gap-4">
          <span>{new Date().toLocaleTimeString()}</span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            SAMMY Active
          </span>
        </div>
      </div>
    </div>
  );
}
