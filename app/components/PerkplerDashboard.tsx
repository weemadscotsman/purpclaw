'use client';
/**
 * PERKPLER — Mission Control Dashboard
 * 4-screen clap-activated multi-monitor command center
 * Built on PURPCLAW agent infrastructure
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import AgentTower from './AgentTower';
import AgentList from './AgentList';
import LogFeed from './LogFeed';

interface PerkplerProps {
  className?: string;
}

interface MonitorPanel {
  id: string;
  label: string;
  component: 'agents' | 'swarm' | 'pipeline' | 'voice' | 'logs' | 'shaman';
  metrics?: {
    active: number;
    idle: number;
    error: number;
  };
}

const DEFAULT_PANELS: MonitorPanel[] = [
  { id: 'tower', label: 'AGENT TOWER', component: 'agents', metrics: { active: 0, idle: 0, error: 0 } },
  { id: 'swarm', label: 'SWARM MONITOR', component: 'swarm', metrics: { active: 0, idle: 0, error: 0 } },
  { id: 'pipeline', label: 'TASK PIPELINE', component: 'pipeline', metrics: { active: 0, idle: 0, error: 0 } },
  { id: 'voice', label: 'VOICE CORE', component: 'voice', metrics: { active: 0, idle: 0, error: 0 } },
];

export const PerkplerDashboard: React.FC<PerkplerProps> = ({ className = '' }) => {
  const [isOnline, setIsOnline] = useState(false);
  const [clapCount, setClapCount] = useState(0);
  const [lastClap, setLastClap] = useState(0);
  const [panels, setPanels] = useState<MonitorPanel[]>(DEFAULT_PANELS);
  const [activePanel, setActivePanel] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'offline' | 'connecting' | 'online'>('offline');
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);
  const clapThresholdRef = useRef<number>(0.6);
  const lastClapTimeRef = useRef<number>(0);

  // Initialize clap detection
  const initClapDetection = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioContextRef.current = new AudioContext();
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);
      
      setIsOnline(true);
      detectClaps();
    } catch (e) {
      console.error('Microphone access denied:', e);
    }
  }, []);

  // Clap detection loop
  const detectClaps = useCallback(() => {
    if (!analyserRef.current) return;
    
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    
    const tick = () => {
      if (!analyserRef.current) return;
      analyserRef.current.getByteFrequencyData(dataArray);
      
      // Calculate average volume
      const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
      const normalized = avg / 255;
      
      const now = Date.now();
      
      // Detect clap: sharp volume spike above threshold
      if (normalized > clapThresholdRef.current && normalized > 0.5) {
        if (now - lastClapTimeRef.current > 300) { // Debounce 300ms
          lastClapTimeRef.current = now;
          setClapCount(c => c + 1);
          setLastClap(now);
          
          // Toggle online state on double-clap pattern
          if (now - lastClapTimeRef.current < 600) {
            setConnectionStatus(prev => prev === 'online' ? 'offline' : 'online');
          }
        }
      }
      
      animationRef.current = requestAnimationFrame(tick);
    };
    
    tick();
  }, []);

  useEffect(() => {
    initClapDetection();
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (audioContextRef.current) audioContextRef.current.close();
    };
  }, [initClapDetection]);

  // Fetch metrics from agent tower API
  const fetchMetrics = useCallback(async () => {
    try {
      const res = await fetch('http://localhost:7790/metrics');
      if (res.ok) {
        const data = await res.json();
        setPanels(prev => prev.map(p => ({
          ...p,
          metrics: {
            active: data.activeAgents || 0,
            idle: data.idleAgents || 0,
            error: data.errorAgents || 0
          }
        })));
      }
    } catch (e) {
      // API not available
    }
  }, []);

  useEffect(() => {
    if (connectionStatus === 'online') {
      fetchMetrics();
      const interval = setInterval(fetchMetrics, 2000);
      return () => clearInterval(interval);
    }
  }, [connectionStatus, fetchMetrics]);

  // Render panel content
  const renderPanelContent = (panel: MonitorPanel) => {
    switch (panel.component) {
      case 'agents':
        return <AgentTower compact />;
      case 'swarm':
        return <AgentList view="grid" />;
      case 'pipeline':
        return (
          <div className="pipeline-view">
            <LogFeed source="pipeline" />
          </div>
        );
      case 'voice':
        return (
          <div className="voice-view">
            <VoiceCoreStatus />
          </div>
        );
      case 'logs':
        return <LogFeed source="all" />;
      case 'shaman':
        return <ShamanDashboard />;
      default:
        return <div className="empty-panel">No data</div>;
    }
  };

  return (
    <div className={`perkpler-dashboard ${className} ${connectionStatus === 'online' ? 'online' : 'offline'}`}>
      {/* Header */}
      <header className="perkpler-header">
        <div className="header-left">
          <div className="logo-icon">⚡</div>
          <div className="logo-text">PERKPLER</div>
          <div className="clap-indicator">
            <span className="clap-count">{clapCount}</span>
            <span className="clap-label">CLAPS</span>
          </div>
        </div>
        
        <div className="header-center">
          <div className="status-bar">
            <div className={`status-item ${connectionStatus}`}>
              <span className="status-dot" />
              <span className="status-text">
                {connectionStatus === 'online' ? 'MISSION CONTROL ACTIVE' : 
                 connectionStatus === 'connecting' ? 'CONNECTING...' : 'STANDBY'}
              </span>
            </div>
          </div>
        </div>
        
        <div className="header-right">
          <button 
            className="power-btn"
            onClick={() => setConnectionStatus(prev => prev === 'online' ? 'offline' : 'online')}
          >
            {connectionStatus === 'online' ? '⬛' : '⚪'}
          </button>
        </div>
      </header>

      {/* Monitor Grid */}
      <div className="monitor-grid">
        {panels.map(panel => (
          <div 
            key={panel.id}
            className={`monitor-panel ${activePanel === panel.id ? 'focused' : ''}`}
            onClick={() => setActivePanel(prev => prev === panel.id ? null : panel.id)}
          >
            <div className="panel-header">
              <span className="panel-label">{panel.label}</span>
              {panel.metrics && (
                <div className="panel-metrics">
                  <span className="metric active">{panel.metrics.active} ACTIVE</span>
                  <span className="metric idle">{panel.metrics.idle} IDLE</span>
                  <span className="metric error">{panel.metrics.error} ERR</span>
                </div>
              )}
            </div>
            <div className="panel-content">
              {renderPanelContent(panel)}
            </div>
          </div>
        ))}
      </div>

      <style jsx>{`
        .perkpler-dashboard {
          display: flex;
          flex-direction: column;
          height: 100vh;
          background: #0a0a0f;
          color: #e0e0e0;
          font-family: 'Segoe UI', system-ui, sans-serif;
        }
        
        .perkpler-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 15px 25px;
          background: linear-gradient(135deg, #12121a 0%, #1a0a2a 100%);
          border-bottom: 1px solid #2a2a3a;
        }
        
        .header-left {
          display: flex;
          align-items: center;
          gap: 15px;
        }
        
        .logo-icon {
          width: 40px;
          height: 40px;
          background: linear-gradient(135deg, #9b4dca 0%, #ff00ff 100%);
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
        }
        
        .logo-text {
          font-size: 24px;
          font-weight: 700;
          background: linear-gradient(135deg, #9b4dca 0%, #ff00ff 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        
        .clap-indicator {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 8px 15px;
          background: #1a1a25;
          border-radius: 8px;
          border: 1px solid #2a2a3a;
        }
        
        .clap-count {
          font-size: 24px;
          font-weight: 700;
          color: #00ff88;
        }
        
        .clap-label {
          font-size: 10px;
          color: #888;
          letter-spacing: 2px;
        }
        
        .header-center {
          display: flex;
          align-items: center;
        }
        
        .status-bar {
          display: flex;
          gap: 20px;
        }
        
        .status-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 15px;
          background: #1a1a25;
          border-radius: 8px;
        }
        
        .status-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
        }
        
        .status-item.online .status-dot {
          background: #00ff88;
          animation: pulse 2s infinite;
        }
        
        .status-item.connecting .status-dot {
          background: #ffaa00;
          animation: pulse 1s infinite;
        }
        
        .status-item.offline .status-dot {
          background: #ff4444;
        }
        
        .status-text {
          font-size: 13px;
          font-weight: 600;
          letter-spacing: 1px;
        }
        
        .status-item.online .status-text { color: #00ff88; }
        .status-item.connecting .status-text { color: #ffaa00; }
        .status-item.offline .status-text { color: #ff4444; }
        
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        
        .power-btn {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          border: 2px solid #9b4dca;
          background: transparent;
          font-size: 18px;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .power-btn:hover {
          background: #9b4dca;
        }
        
        .monitor-grid {
          flex: 1;
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          grid-template-rows: repeat(2, 1fr);
          gap: 2px;
          padding: 2px;
          background: #000;
        }
        
        .monitor-panel {
          background: #12121a;
          display: flex;
          flex-direction: column;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .monitor-panel:hover {
          background: #1a1a25;
        }
        
        .monitor-panel.focused {
          grid-column: span 2;
          grid-row: span 2;
          position: fixed;
          inset: 60px 2px 2px 2px;
          z-index: 100;
        }
        
        .panel-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 15px;
          background: #1a1a25;
          border-bottom: 1px solid #2a2a3a;
        }
        
        .panel-label {
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 2px;
          color: #9b4dca;
        }
        
        .panel-metrics {
          display: flex;
          gap: 10px;
        }
        
        .metric {
          font-size: 10px;
          padding: 2px 8px;
          border-radius: 4px;
          font-weight: 600;
        }
        
        .metric.active {
          background: #00ff8820;
          color: #00ff88;
        }
        
        .metric.idle {
          background: #ffaa0020;
          color: #ffaa00;
        }
        
        .metric.error {
          background: #ff444420;
          color: #ff4444;
        }
        
        .panel-content {
          flex: 1;
          overflow: auto;
        }
        
        .empty-panel {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: #888;
          font-size: 14px;
        }
      `}</style>
    </div>
  );
};

// Voice core status component
const VoiceCoreStatus: React.FC = () => {
  const [voiceStatus, setVoiceStatus] = useState({
    listening: false,
    speaking: false,
    lastIntent: ''
  });

  return (
    <div className="voice-core">
      <div className="voice-indicator">
        <div className={`voice-dot ${voiceStatus.listening ? 'listening' : ''}`} />
        <span>{voiceStatus.listening ? 'LISTENING' : 'IDLE'}</span>
      </div>
      <div className="voice-indicator">
        <div className={`voice-dot ${voiceStatus.speaking ? 'speaking' : ''}`} />
        <span>{voiceStatus.speaking ? 'SPEAKING' : 'SILENT'}</span>
      </div>
      
      <style jsx>{`
        .voice-core {
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .voice-indicator {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 14px;
          font-weight: 600;
        }
        .voice-dot {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: #888;
        }
        .voice-dot.listening {
          background: #00ff88;
          animation: pulse 1s infinite;
        }
        .voice-dot.speaking {
          background: #9b4dca;
          animation: pulse 0.5s infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
};

// Shaman dashboard component
const ShamanDashboard: React.FC = () => {
  const [mood, setMood] = useState('neutral');
  
  return (
    <div className="shaman-dashboard">
      <div className="mood-indicator">
        <span className="mood-label">SYSTEM MOOD:</span>
        <span className={`mood-value ${mood}`}>{mood.toUpperCase()}</span>
      </div>
      
      <style jsx>{`
        .shaman-dashboard {
          padding: 20px;
        }
        .mood-indicator {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }
        .mood-label {
          font-size: 10px;
          color: #888;
          letter-spacing: 2px;
        }
        .mood-value {
          font-size: 24px;
          font-weight: 700;
        }
        .mood-value.calm { color: #00ff88; }
        .mood-value.neutral { color: #ffaa00; }
        .mood-value.alert { color: #ff4444; }
      `}</style>
    </div>
  );
};

export default PerkplerDashboard;
