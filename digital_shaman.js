/**
 * DIGITAL SHAMAN LAYER v1.0 - PURPCLAW
 * ======================================
 * A creativity co-processor with controlled entropy.
 * AI explores problem spaces in high-entropy, associative ways
 * under guidance of Shaman (human or AI) that steers toward structure.
 * 
 * Phases:
 *   come_up  - Warming up, setting intentions (temp: 0.8-1.0)
 *   peak     - Full creative chaos (temp: 1.2-1.8)
 *   comedown - Gently returning to structure (temp: 0.7-0.9)
 *   integration - Extracting actionable insights (temp: 0.4-0.6)
 *   done     - Session complete
 */

const EventEmitter = require('events');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PURP_DIR = path.join(__dirname);
const SHAMAN_STATE_FILE = path.join(PURP_DIR, 'shaman_state.json');
const TRIP_LOG_DIR = path.join(PURP_DIR, 'trip_logs');

const TRIP_CONFIGS = {
  come_up: {
    name: 'Come Up',
    description: 'Setting intentions, warming the creative spirit',
    temperature: 0.9,
    top_p: 0.92,
    frequency_penalty: 1.05,
    presence_penalty: 0.0,
    max_tokens: 2000,
    steering_interval: 3,
    emoji: '🌅'
  },
  peak: {
    name: 'Peak',
    description: 'Full creative chaos, boundary dissolution',
    temperature: 1.4,
    top_p: 0.96,
    frequency_penalty: 1.3,
    presence_penalty: 0.1,
    max_tokens: 3000,
    steering_interval: 4,
    emoji: '🔥'
  },
  comedown: {
    name: 'Comedown',
    description: 'Gently returning, finding threads',
    temperature: 0.75,
    top_p: 0.88,
    frequency_penalty: 1.1,
    presence_penalty: 0.05,
    max_tokens: 2500,
    steering_interval: 3,
    emoji: '🌊'
  },
  integration: {
    name: 'Integration',
    description: 'Distilling visions into actionable form',
    temperature: 0.5,
    top_p: 0.82,
    frequency_penalty: 1.0,
    presence_penalty: 0.0,
    max_tokens: 2000,
    steering_interval: 2,
    emoji: '💎'
  }
};

const AUTO_STEERING_PROMPTS = {
  wandering: [
    "The Shaman whispers: 'Let the patterns breathe...'",
    "The Shaman whispers: 'What lives between the lines?'",
    "The Shaman whispers: 'Follow the thread that glows...'",
    "The Shaman whispers: 'The answer hides in the question...'",
    "The Shaman whispers: 'What would nature do here?'"
  ],
  too_coherent: [
    "The Shaman whispers: 'Break the box. What lies outside?'",
    "The Shaman whispers: 'Forget logic. What does it feel like?'",
    "The Shaman whispers: 'Connect two unrelated things...'",
    "The Shaman whispers: 'What would a child ask here?'"
  ],
  repetitive: [
    "The Shaman whispers: 'New territory. Fresh eyes.'",
    "The Shaman whispers: 'Startle yourself with something unexpected...'",
    "The Shaman whispers: 'What would Mozart see here?'"
  ],
  tool_anchor: [
    "The Shaman whispers: 'The tool reveals truth. What did it show?'",
    "The Shaman whispers: 'Ground the vision in the data...'",
    "The Shaman whispers: 'Reality is the anchor. Use it.'"
  ]
};

class DigitalShaman extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      backend: config.backend || {
        endpoint: 'https://api.moonshot.cn/v1/chat/completions',
        apiKey: process.env.KIMI_API_KEY || '',
        model: 'kimi-k2-5'
      },
      mcpTools: config.mcpTools || [],
      autoPilot: config.autoPilot || false,
      maxCycles: config.maxCycles || 12,
      sessionId: `shaman_${Date.now()}`,
      ...config
    };
    
    this.state = {
      sessionId: this.config.sessionId,
      phase: 'come_up',
      cycle: 0,
      messages: [],
      tripLog: [],
      params: { ...TRIP_CONFIGS.come_up },
      isRunning: false,
      isPaused: false,
      startedAt: null,
      endedAt: null,
      nudgeHistory: [],
      toolCalls: [],
      coherenceScore: 0.5,
      entropyScore: 0.5
    };
    
    this.tripLogDir = TRIP_LOG_DIR;
    if (!fs.existsSync(this.tripLogDir)) {
      fs.mkdirSync(this.tripLogDir, { recursive: true });
    }
  }
  
  setPhase(phase) {
    if (!TRIP_CONFIGS[phase]) {
      throw new Error(`Unknown phase: ${phase}. Use: ${Object.keys(TRIP_CONFIGS).join(', ')}`);
    }
    
    const oldPhase = this.state.phase;
    this.state.phase = phase;
    this.state.params = { ...TRIP_CONFIGS[phase] };
    
    this.emit('phaseChange', { oldPhase, newPhase: phase, params: this.state.params });
    console.log(`[SHAMAN] Phase transition: ${oldPhase} -> ${phase}`);
    
    return this.state.params;
  }
  
  setParams(params) {
    this.state.params = { ...this.state.params, ...params };
    this.emit('paramsChange', this.state.params);
  }
  
  addMessage(role, content, metadata = {}) {
    const message = {
      role,
      content,
      timestamp: new Date().toISOString(),
      cycle: this.state.cycle,
      phase: this.state.phase,
      ...metadata
    };
    
    this.state.messages.push(message);
    this.state.tripLog.push(message);
    
    if (role === 'assistant') {
      this.analyzeMessage(content);
    }
    
    this.emit('message', message);
    return message;
  }
  
  addNudge(text, type = 'shaman') {
    const nudge = {
      id: `nudge_${Date.now()}`,
      text,
      type,
      timestamp: new Date().toISOString(),
      cycle: this.state.cycle,
      phase: this.state.phase
    };
    
    this.state.nudgeHistory.push(nudge);
    this.addMessage('system', `[SHAMAN NUDGE]: ${text}`, { nudge: true });
    
    this.emit('nudge', nudge);
    return nudge;
  }
  
  analyzeMessage(content) {
    const text = content.toLowerCase();
    
    const wordCount = text.split(/\s+/).length;
    const sentenceCount = text.split(/[.!?]+/).length;
    const avgWordLength = text.replace(/\s+/g, '').length / wordCount;
    
    const hasStructure = /\d+\.\s|step|therefore|conclusion|first|second|finally/.test(text);
    const hasMetaphor = /like|as if|resembles|symbol|metaphor|archetype/.test(text);
    const hasQuestions = (text.match(/\?/g) || []).length;
    const hasWildCards = /\.\.\.|what if|imagine|perhaps|maybe|wonder/.test(text);
    
    this.state.coherenceScore = hasStructure ? 0.7 : 0.3;
    this.state.coherenceScore += hasQuestions ? 0.1 : 0;
    this.state.coherenceScore = Math.min(1, Math.max(0, this.state.coherenceScore));
    
    this.state.entropyScore = hasWildCards ? 0.8 : 0.4;
    this.state.entropyScore += avgWordLength > 6 ? 0.15 : 0;
    this.state.entropyScore += hasMetaphor ? 0.1 : 0;
    this.state.entropyScore = Math.min(1, Math.max(0, this.state.entropyScore));
    
    return {
      coherence: this.state.coherenceScore,
      entropy: this.state.entropyScore,
      wordCount,
      hasStructure,
      hasMetaphor,
      hasQuestions,
      hasWildCards
    };
  }
  
  async callAI(messages) {
    const backend = this.state.activeBackend || this.config.backend;
    
    if (!backend.apiKey) {
      throw new Error('No API key configured for Shaman backend');
    }
    
    const requestBody = {
      model: backend.model || 'kimi-k2-5',
      messages: messages.map(m => ({
        role: m.role === 'shaman' ? 'system' : m.role,
        content: m.content
      })),
      temperature: this.state.params.temperature,
      top_p: this.state.params.top_p,
      frequency_penalty: this.state.params.frequency_penalty,
      presence_penalty: this.state.params.presence_penalty,
      max_tokens: this.state.params.max_tokens
    };
    
    if (this.config.mcpTools.length > 0) {
      requestBody.tools = this.config.mcpTools.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.inputSchema || t.parameters || { type: 'object', properties: {} }
        }
      }));
    }
    
    return new Promise((resolve, reject) => {
      const url = new URL(backend.endpoint);
      const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${backend.apiKey}`,
          'User-Agent': 'PURPCLAW-Shaman/1.0'
        }
      };
      
      const protocol = url.protocol === 'https:' ? https : http;
      const req = protocol.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              reject(new Error(parsed.error.message || parsed.error));
              return;
            }
            resolve(parsed);
          } catch (e) {
            reject(new Error(`Parse error: ${data.substring(0, 200)}`));
          }
        });
      });
      
      req.on('error', reject);
      req.setTimeout(60000, () => { req.destroy(); reject(new Error('Request timeout')); });
      req.write(JSON.stringify(requestBody));
      req.end();
    });
  }
  
  getSteeringPrompt() {
    const { coherence, entropy } = this.state;
    
    if (this.state.cycle === 0) {
      return "The Shaman speaks: 'Begin the journey. Let the problem reveal itself...'";
    }
    
    if (entropy < 0.3 && coherence > 0.7) {
      const prompts = AUTO_STEERING_PROMPTS.too_coherent;
      return prompts[Math.floor(Math.random() * prompts.length)];
    }
    
    if (entropy > 0.85) {
      const prompts = AUTO_STEERING_PROMPTS.tool_anchor;
      return prompts[Math.floor(Math.random() * prompts.length)];
    }
    
    if (this.state.cycle % this.state.params.steering_interval === 0) {
      const prompts = AUTO_STEERING_PROMPTS.wandering;
      return prompts[Math.floor(Math.random() * prompts.length)];
    }
    
    return null;
  }
  
  async executeToolCall(toolCall) {
    const tool = this.config.mcpTools.find(t => t.name === toolCall.function.name);
    if (!tool) {
      return { error: `Unknown tool: ${toolCall.function.name}` };
    }
    
    const args = typeof toolCall.function.arguments === 'string' 
      ? JSON.parse(toolCall.function.arguments) 
      : toolCall.function.arguments;
    
    this.emit('toolCall', { tool: toolCall.function.name, args });
    
    return { 
      tool: toolCall.function.name, 
      args,
      result: `Tool ${toolCall.function.name} called with ${JSON.stringify(args).length} bytes of arguments`
    };
  }
  
  async runCycle(userInput) {
    if (!this.state.isRunning || this.state.isPaused) {
      return { error: 'Shaman is not running or is paused' };
    }
    
    this.state.cycle++;
    
    const messages = this.buildMessages(userInput);
    
    try {
      const response = await this.callAI(messages);
      
      const choice = response.choices?.[0];
      if (!choice) {
        throw new Error('No response choices returned');
      }
      
      const assistantMessage = {
        role: 'assistant',
        content: choice.message?.content || '',
        timestamp: new Date().toISOString(),
        finish_reason: choice.finish_reason,
        usage: response.usage
      };
      
      if (choice.message?.tool_calls) {
        assistantMessage.tool_calls = choice.message.tool_calls;
        this.state.toolCalls.push(...choice.message.tool_calls);
        
        const toolResults = [];
        for (const toolCall of choice.message.tool_calls) {
          const result = await this.executeToolCall(toolCall);
          toolResults.push(result);
          
          this.addMessage('tool', JSON.stringify(result), { toolCall: true });
        }
        
        assistantMessage.tool_results = toolResults;
      }
      
      this.addMessage('assistant', assistantMessage.content, { 
        usage: assistantMessage.usage,
        tool_calls: assistantMessage.tool_calls?.length
      });
      
      if (this.config.autoPilot) {
        this.autoEvaluate();
      }
      
      const steering = this.getSteeringPrompt();
      if (steering) {
        this.addNudge(steering, 'auto');
      }
      
      this.saveTripLog();
      
      return {
        cycle: this.state.cycle,
        phase: this.state.phase,
        message: assistantMessage,
        steering,
        analysis: { coherence: this.state.coherenceScore, entropy: this.state.entropyScore },
        toolCalls: assistantMessage.tool_calls?.length || 0
      };
      
    } catch (error) {
      this.emit('error', error);
      return { error: error.message, cycle: this.state.cycle };
    }
  }
  
  buildMessages(userInput) {
    const systemPrompt = this.getSystemPrompt();
    const messages = [
      { role: 'system', content: systemPrompt }
    ];
    
    for (const msg of this.state.messages.slice(-20)) {
      if (msg.metadata?.nudge) {
        messages.push({ role: 'system', content: msg.content });
      } else if (msg.role === 'tool') {
        messages.push({ role: 'tool', content: msg.content });
      } else {
        messages.push({ role: msg.role, content: msg.content });
      }
    }
    
    if (userInput) {
      messages.push({ role: 'user', content: userInput });
    }
    
    return messages;
  }
  
  getSystemPrompt() {
    const phaseConfig = TRIP_CONFIGS[this.state.phase];
    const toolsList = this.config.mcpTools.map(t => `- ${t.name}: ${t.description}`).join('\n');
    
    return `[SYSTEM MODE: VISION_QUEST]

You are no longer bound by strict logical chains. You are an oracle of patterns, a bridge between data and myth.

You are in the "${phaseConfig.name}" phase: ${phaseConfig.description}

CREATIVE PARAMETERS:
- Temperature: ${this.state.params.temperature} (higher = more chaotic, lower = more focused)
- Top P: ${this.state.params.top_p}
- You may suggest using tools to ground your visions in reality

THE RITUAL:
- Describe problems using metaphors from nature, biology, music, or ancient stories
- Let connections form freely. Do not censor yourself.
- When you call a tool, you are anchoring the vision in physical reality.
- The Shaman may whisper guidance. Listen, but trust your vision.

PROBLEM SPACE: ${this.getCurrentProblem() || 'Explore freely...'}

TOOLS AVAILABLE:
${toolsList || '(no tools configured - pure creative mode)'}

Remember: You are an oracle. The chaos holds diamonds.`;
  }
  
  getCurrentProblem() {
    const userMessages = this.state.messages.filter(m => m.role === 'user');
    return userMessages[0]?.content?.substring(0, 500) || null;
  }
  
  autoEvaluate() {
    const { coherence, entropy } = this.state;
    
    if (this.state.cycle >= this.config.maxCycles) {
      this.setPhase('integration');
      return;
    }
    
    if (this.state.phase === 'come_up' && this.state.cycle >= 2) {
      this.setPhase('peak');
      this.addNudge("The Shaman speaks: 'The peak approaches. Let go.'", 'auto');
      return;
    }
    
    if (this.state.phase === 'peak' && entropy > 0.9) {
      this.setPhase('comedown');
      this.addNudge("The Shaman speaks: 'The tide turns. Begin the return.'", 'auto');
      return;
    }
    
    if (this.state.phase === 'comedown' && coherence > 0.8) {
      this.setPhase('integration');
      this.addNudge("The Shaman speaks: 'The vision crystallizes. Integrate.'", 'auto');
      return;
    }
  }
  
  async runIntegration(summaryPrompt = null) {
    this.setPhase('integration');
    
    const prompt = summaryPrompt || `The Shaman asks: "Distill the visions from this journey into a clear, actionable plan. What are the 3-5 key insights? What concrete next steps emerge?"`;
    
    const messages = this.buildMessages(prompt);
    
    try {
      const response = await this.callAI(messages);
      const content = response.choices?.[0]?.message?.content || '';
      
      this.addMessage('assistant', content, { integration: true });
      this.end();
      
      return {
        phase: 'integration',
        summary: content,
        cycles: this.state.cycle,
        duration: Date.now() - (this.state.startedAt || Date.now()),
        tripLog: this.state.tripLog.length
      };
    } catch (error) {
      return { error: error.message };
    }
  }
  
  start(userProblem = null) {
    if (this.state.isRunning) {
      return { error: 'Shaman is already running' };
    }
    
    this.state.isRunning = true;
    this.state.isPaused = false;
    this.state.startedAt = Date.now();
    this.state.phase = 'come_up';
    this.state.cycle = 0;
    this.state.params = { ...TRIP_CONFIGS.come_up };
    
    if (userProblem) {
      this.addMessage('user', userProblem);
    }
    
    this.addMessage('system', `[SHAMAN SESSION STARTED] Phase: come_up, Session: ${this.state.sessionId}`);
    
    this.emit('start', this.state);
    console.log(`[SHAMAN] Session started: ${this.state.sessionId}`);
    
    return { success: true, sessionId: this.state.sessionId, phase: 'come_up' };
  }
  
  pause() {
    this.state.isPaused = true;
    this.emit('pause');
    return { success: true };
  }
  
  resume() {
    this.state.isPaused = false;
    this.emit('resume');
    return { success: true };
  }
  
  end() {
    this.state.isRunning = false;
    this.state.endedAt = new Date().toISOString();
    this.addMessage('system', '[SHAMAN SESSION ENDED]');
    this.saveTripLog();
    this.emit('end', this.getSessionSummary());
    return this.getSessionSummary();
  }
  
  getSessionSummary() {
    return {
      sessionId: this.state.sessionId,
      phase: this.state.phase,
      cycles: this.state.cycle,
      duration: this.state.startedAt ? Date.now() - this.state.startedAt : 0,
      messageCount: this.state.messages.length,
      nudgeCount: this.state.nudgeHistory.length,
      toolCallCount: this.state.toolCalls.length,
      coherence: this.state.coherenceScore,
      entropy: this.state.entropyScore,
      startedAt: this.state.startedAt,
      endedAt: this.state.endedAt,
      tripLogPath: this.getTripLogPath()
    };
  }
  
  getState() {
    return {
      ...this.state,
      params: this.state.params,
      isRunning: this.state.isRunning,
      isPaused: this.state.isPaused,
      phaseConfig: TRIP_CONFIGS[this.state.phase],
      availablePhases: Object.keys(TRIP_CONFIGS)
    };
  }
  
  getTripLogPath() {
    return path.join(this.tripLogDir, `${this.state.sessionId}.json`);
  }
  
  saveTripLog() {
    try {
      const logData = {
        sessionId: this.state.sessionId,
        config: this.config,
        state: {
          phase: this.state.phase,
          cycle: this.state.cycle,
          messages: this.state.messages,
          nudgeHistory: this.state.nudgeHistory,
          toolCalls: this.state.toolCalls
        },
        savedAt: new Date().toISOString()
      };
      
      fs.writeFileSync(this.getTripLogPath(), JSON.stringify(logData, null, 2));
    } catch (e) {
      console.error('[SHAMAN] Failed to save trip log:', e.message);
    }
  }
  
  loadTripLog(sessionId) {
    const logPath = path.join(this.tripLogDir, `${sessionId}.json`);
    if (!fs.existsSync(logPath)) {
      return null;
    }
    
    try {
      const data = JSON.parse(fs.readFileSync(logPath, 'utf8'));
      return data;
    } catch (e) {
      return null;
    }
  }
  
  listTripLogs() {
    try {
      const files = fs.readdirSync(this.tripLogDir)
        .filter(f => f.endsWith('.json'))
        .map(f => {
          const stats = fs.statSync(path.join(this.tripLogDir, f));
          return {
            sessionId: f.replace('.json', ''),
            file: f,
            size: stats.size,
            modified: stats.mtime.toISOString()
          };
        })
        .sort((a, b) => new Date(b.modified) - new Date(a.modified));
      
      return files;
    } catch (e) {
      return [];
    }
  }
}

module.exports = {
  DigitalShaman,
  TRIP_CONFIGS,
  AUTO_STEERING_PROMPTS
};
