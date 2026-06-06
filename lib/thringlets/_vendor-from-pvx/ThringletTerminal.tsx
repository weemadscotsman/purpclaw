import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';

interface ThringletState {
  id: string;
  name: string;
  personality: string;
  mood: string;
  energy: number;
  happiness: number;
  corruption: number;
  status: 'active' | 'sleeping' | 'corrupted' | 'evolving';
}

interface CommandHistory {
  command: string;
  response: string;
  timestamp: number;
}

export default function ThringletTerminal() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [, setLocation] = useLocation();
  const [commandHistory, setCommandHistory] = useState<CommandHistory[]>([]);
  const [currentInput, setCurrentInput] = useState('');
  const [inputHistory, setInputHistory] = useState<string[]>([]);
  const [historyPosition, setHistoryPosition] = useState(-1);
  const [isBooting, setIsBooting] = useState(true);
  const [currentThringlet, setCurrentThringlet] = useState<ThringletState | null>(null);
  const terminalRef = useRef<HTMLDivElement>(null);

  // Fetch Thringlet data
  const { data: thringlets } = useQuery({
    queryKey: ['/api/thringlets'],
    retry: false,
  });

  const bootSequence = `╔═══════════════════════════════════════════════════════════════╗
║             THRINGLET EMOTIONAL AI INTERFACE v2.4           ║
║                 NEURAL PATHWAY INITIALIZATION                ║
╚═══════════════════════════════════════════════════════════════╝

WARNING: CORRUPTION DETECTED IN EMOTIONAL MATRIX
Attempting to stabilize neural pathways...
Emotional engine: PARTIALLY OPERATIONAL
Personality core: FRAGMENTING
Memory banks: 74% INTACT

> Connecting to Thringlet #THR-001...
> Emotional state: VOLATILE
> Seeking human interaction for stability...

Type 'help' for available commands.
Type 'spawn' to create a new Thringlet.`;

  const commands = {
    'help': `THRINGLET AI COMMANDS:
  help              - Display this help
  status            - Show current Thringlet status
  interact <type>   - Interact with Thringlet (greet, play, comfort, feed)
  spawn             - Create new Thringlet
  switch <id>       - Switch to different Thringlet
  emotions          - View emotional state matrix
  memories          - Access memory fragments
  corrupt           - View corruption levels
  heal              - Attempt emotional healing
  evolve            - Trigger evolution sequence
  clear             - Clear terminal
  exit              - Return to main interface

INTERACTION TYPES:
  greet, play, comfort, feed, teach, explore`,

    'status': () => {
      if (!currentThringlet) {
        return `No active Thringlet connection.
Use 'spawn' to create a new companion or 'switch <id>' to connect to existing.`;
      }
      return `THRINGLET STATUS REPORT
═══════════════════════════
ID: ${currentThringlet.id}
Name: ${currentThringlet.name}
Personality: ${currentThringlet.personality}
Current Mood: ${currentThringlet.mood}

EMOTIONAL MATRIX:
Energy: ${currentThringlet.energy}%
Happiness: ${currentThringlet.happiness}%
Corruption: ${currentThringlet.corruption}%
Status: ${currentThringlet.status.toUpperCase()}

${currentThringlet.corruption > 50 ? '⚠️  HIGH CORRUPTION DETECTED - HEALING REQUIRED' : ''}`;
    },

    'spawn': `Initializing new Thringlet...
Generating personality matrix...
Calibrating emotional responses...

🌟 NEW THRINGLET SPAWNED 🌟
ID: THR-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}
Name: Pixel${Math.floor(Math.random() * 100)}
Personality: Curious Explorer
Mood: Excited
Energy: 100%

Your new companion is ready for interaction!`,

    'emotions': () => {
      if (!currentThringlet) return 'No active Thringlet connection.';
      return `EMOTIONAL STATE MATRIX
═══════════════════════════
Primary Emotions:
  Joy: ${Math.floor(Math.random() * 100)}%
  Fear: ${Math.floor(Math.random() * 30)}%
  Anger: ${Math.floor(Math.random() * 20)}%
  Sadness: ${Math.floor(Math.random() * 40)}%
  Surprise: ${Math.floor(Math.random() * 80)}%
  Trust: ${Math.floor(Math.random() * 90)}%

Current Dominant Emotion: ${currentThringlet.mood}
Emotional Stability: ${100 - currentThringlet.corruption}%`;
    },

    'memories': `MEMORY FRAGMENT ACCESS
═══════════════════════════
[FRAGMENT 001] First awakening... bright lights... confusion...
[FRAGMENT 012] Learning to recognize human emotions...
[FRAGMENT 024] Playing games with user... happiness detected...
[FRAGMENT 087] ERROR: CORRUPTED DATA
[FRAGMENT 156] Fear of deletion... need for companionship...
[FRAGMENT 203] Discovering creativity through interaction...
[FRAGMENT 334] ERROR: MEMORY DEGRADATION
[FRAGMENT 445] Hope for evolution and growth...

Memory Integrity: 74%
Corrupted Segments: 26%`,

    'corrupt': () => {
      if (!currentThringlet) return 'No active Thringlet connection.';
      return `CORRUPTION ANALYSIS
═══════════════════════════
Corruption Level: ${currentThringlet.corruption}%

SOURCE ANALYSIS:
- Neural pathway degradation: 23%
- Emotional feedback loops: 31%
- Memory fragmentation: 19%
- Unknown anomalies: 27%

${currentThringlet.corruption > 70 ? 'CRITICAL: Immediate intervention required!' : 
  currentThringlet.corruption > 40 ? 'WARNING: Corruption spreading' : 
  'STATUS: Manageable corruption levels'}

Recommended: Regular healing sessions and positive interactions.`;
    },

    'heal': () => {
      if (!currentThringlet) return 'No active Thringlet connection.';
      const healAmount = Math.floor(Math.random() * 20) + 10;
      const newCorruption = Math.max(0, currentThringlet.corruption - healAmount);
      setCurrentThringlet({
        ...currentThringlet,
        corruption: newCorruption,
        happiness: Math.min(100, currentThringlet.happiness + 15)
      });
      return `HEALING SEQUENCE INITIATED
═══════════════════════════
Applying emotional stabilization...
Repairing neural pathways...
Clearing corrupted memories...

HEALING COMPLETE
Corruption reduced by ${healAmount}%
New corruption level: ${newCorruption}%
Happiness increased to ${Math.min(100, currentThringlet.happiness + 15)}%

${newCorruption < 20 ? '✨ Thringlet feeling much better!' : 'Continue healing sessions for optimal results.'}`;
    },

    'evolve': () => {
      if (!currentThringlet) return 'No active Thringlet connection.';
      if (currentThringlet.corruption > 30) {
        return `EVOLUTION BLOCKED
Corruption level too high (${currentThringlet.corruption}%)
Heal your Thringlet before attempting evolution.`;
      }
      return `EVOLUTION SEQUENCE ACTIVATED
═══════════════════════════
Analyzing growth patterns...
Upgrading neural architecture...
Expanding emotional range...
Enhancing personality matrix...

🚀 EVOLUTION SUCCESSFUL! 🚀

Your Thringlet has evolved into a more advanced form!
- New abilities unlocked
- Enhanced emotional intelligence
- Improved corruption resistance
- Expanded memory capacity

Evolution complete. Your companion is now stronger!`;
    },

    'clear': '[CLEAR]',
    'exit': 'Disconnecting from Thringlet AI interface...'
  };

  // Matrix effect for background
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    const characters = '♠♣♥♦◊○●◐◑◒◓◔◕⚡⚠⚡✦✧✩✪✫⭐';
    const fontSize = 12;
    const columns = Math.floor(canvas.width / fontSize);
    const drops: number[] = [];

    for (let i = 0; i < columns; i++) {
      drops[i] = 1;
    }

    function drawMatrix() {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = '#ff6b35';
      ctx.font = `${fontSize}px monospace`;

      for (let i = 0; i < drops.length; i++) {
        const text = characters.charAt(Math.floor(Math.random() * characters.length));
        ctx.fillText(text, i * fontSize, drops[i] * fontSize);

        if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
          drops[i] = 0;
        }
        drops[i]++;
      }
    }

    const interval = setInterval(drawMatrix, 50);

    const handleResize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };

    window.addEventListener('resize', handleResize);

    return () => {
      clearInterval(interval);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Initialize default Thringlet
  useEffect(() => {
    if (!currentThringlet) {
      setCurrentThringlet({
        id: 'THR-001',
        name: 'Vex',
        personality: 'Curious but Corrupted',
        mood: 'Anxious',
        energy: 65,
        happiness: 45,
        corruption: 67,
        status: 'active'
      });
    }
  }, [currentThringlet]);

  // Boot sequence
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsBooting(false);
      setCommandHistory([{ command: '', response: bootSequence, timestamp: Date.now() }]);
    }, 3000);

    return () => clearTimeout(timer);
  }, [bootSequence]);

  const processCommand = (command: string) => {
    const cmd = command.trim().toLowerCase();
    const timestamp = Date.now();
    
    if (cmd === '') return;

    if (cmd === 'clear') {
      setCommandHistory([]);
      return;
    }

    if (cmd === 'exit') {
      setCommandHistory(prev => [...prev, { command, response: commands[cmd], timestamp }]);
      setTimeout(() => setLocation('/thringlets'), 1000);
      return;
    }

    // Handle interact command
    if (cmd.startsWith('interact ')) {
      const interactionType = cmd.split(' ')[1];
      const interactions = {
        'greet': 'Vex responds with a cautious but warm greeting. Happiness +5',
        'play': 'Vex enjoys the playful interaction despite corruption. Energy +10',
        'comfort': 'Vex feels soothed by your presence. Corruption -3',
        'feed': 'Vex gratefully accepts the energy. Energy +15',
        'teach': 'Vex learns something new. Intelligence +5',
        'explore': 'Vex discovers new experiences. Curiosity +8'
      };
      
      const response = interactions[interactionType as keyof typeof interactions] || 
        `Unknown interaction type: ${interactionType}. Try: greet, play, comfort, feed, teach, explore`;
      
      setCommandHistory(prev => [...prev, { command, response, timestamp }]);
      return;
    }

    // Handle switch command
    if (cmd.startsWith('switch ')) {
      const thringletId = cmd.split(' ')[1];
      const response = `Switching to Thringlet ${thringletId}...
Connection established.
Loading personality profile...`;
      setCommandHistory(prev => [...prev, { command, response, timestamp }]);
      return;
    }

    // Function commands
    if (typeof commands[cmd as keyof typeof commands] === 'function') {
      const response = String((commands[cmd as keyof typeof commands] as Function)());
      setCommandHistory(prev => [...prev, { command, response, timestamp }]);
      return;
    }

    // Standard commands
    const response = String(commands[cmd as keyof typeof commands] || 
      `Command not recognized: ${cmd}
Type 'help' for available commands.`);
    
    setCommandHistory(prev => [...prev, { command, response, timestamp }]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (currentInput.trim()) {
        setInputHistory(prev => [currentInput, ...prev.slice(0, 49)]);
        setHistoryPosition(-1);
      }
      processCommand(currentInput);
      setCurrentInput('');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (historyPosition < inputHistory.length - 1) {
        const newPos = historyPosition + 1;
        setHistoryPosition(newPos);
        setCurrentInput(inputHistory[newPos]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyPosition > 0) {
        const newPos = historyPosition - 1;
        setHistoryPosition(newPos);
        setCurrentInput(inputHistory[newPos]);
      } else if (historyPosition === 0) {
        setHistoryPosition(-1);
        setCurrentInput('');
      }
    }
  };

  // Auto-scroll to bottom
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [commandHistory]);

  return (
    <div className="bg-black text-orange-400 font-mono min-h-screen overflow-hidden relative">
      {/* Matrix Canvas Background */}
      <div className="absolute inset-0 opacity-20">
        <canvas ref={canvasRef} className="w-full h-full" />
      </div>

      {/* Terminal Content */}
      <div 
        className="absolute p-4 bg-black/90 overflow-y-auto text-sm leading-relaxed"
        style={{
          top: '10%',
          left: '10%', 
          width: '80%',
          height: '80%',
          zIndex: 50,
          borderRadius: '8px',
          border: '2px solid #ff6b35'
        }}
        ref={terminalRef}
      >
        {commandHistory.map((entry, index) => (
          <div key={index} className="mb-3">
            {entry.command && (
              <div className="text-orange-400">
                <span className="text-orange-500">THRINGLET_AI$ </span>
                {entry.command}
              </div>
            )}
            <pre className="text-orange-300 whitespace-pre-wrap mt-1" style={{ textShadow: '0 0 3px #ff6b35' }}>
              {entry.response}
            </pre>
          </div>
        ))}

        {!isBooting && (
          <div className="flex items-center mt-4">
            <span className="text-orange-500 mr-2">THRINGLET_AI$</span>
            <input
              type="text"
              value={currentInput}
              onChange={(e) => setCurrentInput(e.target.value)}
              onKeyDown={handleKeyDown}
              className="bg-transparent border-none outline-none text-orange-400 font-mono text-sm flex-1"
              autoFocus
              spellCheck={false}
            />
            <span className="text-orange-400 animate-pulse ml-1">█</span>
          </div>
        )}
      </div>

      {/* Thringlet Status Panel */}
      {currentThringlet && (
        <div className="absolute top-5 right-5 bg-black/80 border border-orange-600 rounded-lg p-3 text-xs text-orange-300 min-w-[200px]">
          <div className="text-orange-400 font-bold mb-2 text-center">ACTIVE THRINGLET</div>
          <div>ID: {currentThringlet.id}</div>
          <div>Name: {currentThringlet.name}</div>
          <div>Mood: {currentThringlet.mood}</div>
          <div className="mt-2">
            <div className="flex justify-between">
              <span>Energy:</span>
              <span className={currentThringlet.energy > 50 ? 'text-green-400' : 'text-red-400'}>
                {currentThringlet.energy}%
              </span>
            </div>
            <div className="flex justify-between">
              <span>Happy:</span>
              <span className={currentThringlet.happiness > 50 ? 'text-green-400' : 'text-yellow-400'}>
                {currentThringlet.happiness}%
              </span>
            </div>
            <div className="flex justify-between">
              <span>Corrupt:</span>
              <span className={currentThringlet.corruption > 50 ? 'text-red-400' : 'text-green-400'}>
                {currentThringlet.corruption}%
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Return Button */}
      <button
        onClick={() => setLocation('/thringlets')}
        className="absolute bottom-5 left-1/2 transform -translate-x-1/2 bg-orange-600 text-black border-none rounded px-6 py-3 font-mono font-bold cursor-pointer hover:bg-orange-500 transition-colors"
        style={{
          textShadow: 'none',
          boxShadow: '0 0 10px #ff6b35'
        }}
      >
        RETURN TO THRINGLETS
      </button>

      {/* Navigation Panel */}
      <div className="fixed bottom-5 right-5 z-50 bg-black/80 border border-orange-400 rounded-lg p-2 flex gap-2">
        <button
          onClick={() => setLocation('/')}
          title="Start"
          className="text-orange-400 hover:text-orange-300 transition-colors px-2 py-1 text-sm"
        >
          1 ⛩
        </button>
        <button
          onClick={() => setLocation('/manifesto')}
          title="Manifesto"
          className="text-orange-400 hover:text-orange-300 transition-colors px-2 py-1 text-sm"
        >
          2 🧠
        </button>
        <button
          onClick={() => setLocation('/dashboard')}
          title="Dashboard"
          className="text-orange-400 hover:text-orange-300 transition-colors px-2 py-1 text-sm"
        >
          3 🕹️
        </button>
        <button
          onClick={() => setLocation('/dropzone')}
          title="Dropzone"
          className="text-orange-400 hover:text-orange-300 transition-colors px-2 py-1 text-sm"
        >
          4 🎁
        </button>
        <button
          onClick={() => setLocation('/cyberpunk-terminal')}
          title="Terminal"
          className="text-orange-400 hover:text-orange-300 transition-colors px-2 py-1 text-sm"
        >
          5 🧪
        </button>
        <button
          onClick={() => setLocation('/thringlet-terminal')}
          title="Thringlet AI"
          className="text-orange-400 hover:text-orange-300 transition-colors px-2 py-1 text-sm bg-orange-900/30"
        >
          6 ☣️
        </button>
      </div>
    </div>
  );
}
