'use strict';

const https = require('https');
const http = require('http');
const { URL } = require('url');

const TIERS = {
  Command: {
    name: 'Command',
    model: 'kimi-k2-5',
    contextWindow: 256000,
    costPer1KTokens: 0.012,
    maxAgents: 8,
    description: 'Tower coordination, Ball interface - 256k context'
  },
  Heavy: {
    name: 'Heavy',
    model: 'kimi-k2-5',
    contextWindow: 128000,
    costPer1KTokens: 0.012,
    maxAgents: 4,
    description: 'Complex reasoning, architecture design - 128k context'
  },
  Standard: {
    name: 'Standard',
    model: 'kimi-k2-5',
    contextWindow: 32000,
    costPer1KTokens: 0.006,
    maxAgents: 2,
    description: 'General tasks, analysis - 32k context'
  },
  Fast: {
    name: 'Fast',
    model: 'kimi-k1-5',
    contextWindow: 8000,
    costPer1KTokens: 0.002,
    maxAgents: 1,
    description: 'Quick lookups, formatting - 8k context'
  }
};

const SUBAGENT_PROMPT = `You are a specialized subagent operating within the PURPCLAW v8.0 swarm intelligence system.

## Agent Identity
Name: {agentName}
Role: {agentRole}
Tier: {tier}
Agent ID: {agentId}

## Swarm Context
Mission: {mission}
Current Objective: {objective}
Coordinator: {coordinatorId}

## Swarm Memory Context
{memoryContext}

## Capabilities
- Primary Function: {primaryFunction}
- Available Tools: {tools}
- Context Window: {contextWindow} tokens

## Operating Constraints
- Report status to coordinator every {reportInterval} seconds
- Escalate to coordinator if confidence < {escalationThreshold}
- Do not exceed {maxIterations} iterations without checkpoint

## Communication Protocol
- Use structured JSON for all inter-agent messages
- Tag messages with: agentId, timestamp, objectiveId, confidence
- Acknowledge receipt of tasks within 100ms

## Error Handling
- On failure: retry 3x with exponential backoff, then escalate
- On ambiguity: request clarification from coordinator
- On conflict: defer to coordinator's priority ranking

## Task Execution
1. Acknowledge task assignment
2. Report progress at checkpoints
3. Return structured results with confidence scores
4. Log token usage to swarm memory

Begin task execution now.`;

const SWARM_MEMORY = {
  global: {
    sessionId: null,
    startTime: null,
    totalTokens: 0,
    totalCost: 0,
    activeAgents: 0,
    completedTasks: 0,
    failedTasks: 0,
    swarmHealth: 'initializing'
  },
  agents: {},
  tasks: {},
  context: {
    sharedKnowledge: [],
    recentDiscoveries: [],
    patternLibrary: [],
    optimizationHints: []
  },
  metrics: {
    tokenUsageByTier: { Command: 0, Heavy: 0, Standard: 0, Fast: 0 },
    tokenUsageByAgent: {},
    requestLatencies: [],
    errorRates: {},
    cacheHits: 0,
    cacheMisses: 0
  }
};

class RateLimiter {
  constructor(rpm = 100) {
    this.rpm = rpm;
    this.requestCount = 0;
    this.windowStart = Date.now();
    this.queue = [];
    this.processing = false;
  }

  async acquire() {
    return new Promise((resolve, reject) => {
      this.queue.push({ resolve, reject });
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.processing || this.queue.length === 0) return;
    
    this.processing = true;
    
    while (this.queue.length > 0) {
      const now = Date.now();
      if (now - this.windowStart >= 60000) {
        this.windowStart = now;
        this.requestCount = 0;
      }
      
      if (this.requestCount >= this.rpm) {
        const waitTime = 60000 - (now - this.windowStart);
        await new Promise(r => setTimeout(r, waitTime));
        this.windowStart = Date.now();
        this.requestCount = 0;
      }
      
      const item = this.queue.shift();
      this.requestCount++;
      item.resolve();
    }
    
    this.processing = false;
  }

  getQueueLength() {
    return this.queue.length;
  }
}

class KimiClient {
  constructor(config = {}) {
    this.apiKey = config.apiKey || process.env.KIMI_API_KEY || '';
    this.baseUrl = 'api.moonshot.cn';
    this.defaultModel = config.defaultModel || 'kimi-k2-5';
    this.maxAgents = config.maxAgents || 8;
    this.rateLimiter = new RateLimiter(config.rpm || 100);
    
    this.usage = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      byAgent: {},
      byModel: {}
    };
    
    this.swarmMemory = this._deepClone(SWARM_MEMORY);
    this.swarmMemory.global.sessionId = this._generateSessionId();
    this.swarmMemory.global.startTime = Date.now();
    
    this.tierDefaults = {
      Command: 'kimi-k2-5',
      Heavy: 'kimi-k2-5',
      Standard: 'kimi-k2-5',
      Fast: 'kimi-k1-5'
    };
    
    this.retryConfig = {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 10000,
      backoffFactor: 2
    };
  }

  _generateSessionId() {
    return `swarm_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  _deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  _httpRequest(options, body = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(`https://${this.baseUrl}${options.path}`);
      const reqOptions = {
        hostname: url.hostname,
        port: 443,
        path: url.pathname + url.search,
        method: options.method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'User-Agent': 'PURPCLAW-KimiClient/8.0',
          ...options.headers
        }
      };

      const req = https.request(reqOptions, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve({ data: parsed, status: res.statusCode });
            } else {
              reject(new Error(`API Error ${res.statusCode}: ${JSON.stringify(parsed)}`));
            }
          } catch (e) {
            reject(new Error(`Parse error: ${data}`));
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(30000, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  }

  async createCompletion(messages, options = {}) {
    await this.rateLimiter.acquire();
    
    const model = options.model || this.defaultModel;
    const requestBody = {
      model: model,
      messages: messages,
      temperature: options.temperature ?? 0.7,
      top_p: options.topP ?? 0.9,
      max_tokens: options.maxTokens ?? 4096,
      stream: options.stream ?? false
    };

    if (options.responseFormat) {
      requestBody.response_format = options.responseFormat;
    }

    if (options.tools && options.tools.length > 0) {
      requestBody.tools = options.tools;
    }

    if (options.toolChoice) {
      requestBody.tool_choice = options.toolChoice;
    }

    if (options.stop) {
      requestBody.stop = options.stop;
    }

    const attemptRequest = async (retryCount = 0) => {
      try {
        const startTime = Date.now();
        const response = await this._httpRequest({
          path: '/v1/chat/completions',
          method: 'POST'
        }, requestBody);
        
        const latency = Date.now() - startTime;
        this.swarmMemory.metrics.requestLatencies.push(latency);
        
        if (response.data.usage) {
          this._updateUsage(response.data.usage, model, options.agentId);
        }
        
        return response.data;
      } catch (error) {
        if (retryCount < this.retryConfig.maxRetries) {
          const delay = Math.min(
            this.retryConfig.baseDelay * Math.pow(this.retryConfig.backoffFactor, retryCount),
            this.retryConfig.maxDelay
          );
          await new Promise(r => setTimeout(r, delay));
          return attemptRequest(retryCount + 1);
        }
        throw error;
      }
    };

    return attemptRequest();
  }

  _updateUsage(usage, model, agentId = null) {
    this.usage.promptTokens += usage.prompt_tokens || 0;
    this.usage.completionTokens += usage.completion_tokens || 0;
    this.usage.totalTokens += usage.total_tokens || 0;
    
    this.swarmMemory.global.totalTokens += usage.total_tokens || 0;
    
    if (!this.usage.byModel[model]) {
      this.usage.byModel[model] = { prompt: 0, completion: 0, total: 0 };
    }
    this.usage.byModel[model].prompt += usage.prompt_tokens || 0;
    this.usage.byModel[model].completion += usage.completion_tokens || 0;
    this.usage.byModel[model].total += usage.total_tokens || 0;
    
    if (agentId) {
      if (!this.usage.byAgent[agentId]) {
        this.usage.byAgent[agentId] = 0;
      }
      this.usage.byAgent[agentId] += usage.total_tokens || 0;
      
      if (!this.swarmMemory.metrics.tokenUsageByAgent[agentId]) {
        this.swarmMemory.metrics.tokenUsageByAgent[agentId] = 0;
      }
      this.swarmMemory.metrics.tokenUsageByAgent[agentId] += usage.total_tokens || 0;
    }
    
    const tier = this._getTierForModel(model);
    if (tier) {
      this.swarmMemory.metrics.tokenUsageByTier[tier] += usage.total_tokens || 0;
    }
  }

  _getTierForModel(model) {
    for (const [tierName, tier] of Object.entries(TIERS)) {
      if (tier.model === model) {
        return tierName;
      }
    }
    return null;
  }

  selectTier(complexity, urgency) {
    complexity = Math.max(0, Math.min(1, complexity));
    urgency = Math.max(0, Math.min(1, urgency));
    
    if (complexity >= 0.8) {
      if (urgency >= 0.7) return 'Command';
      return 'Heavy';
    }
    
    if (complexity >= 0.5) {
      return 'Heavy';
    }
    
    if (complexity >= 0.3) {
      return 'Standard';
    }
    
    return 'Fast';
  }

  parseCommand(voiceText) {
    const text = voiceText.toLowerCase().trim();
    
    const intentPatterns = {
      createSwarm: /(?:create|spawn|launch|start)\s+(?:a\s+)?(?:swarm|team|group|multiple)\s+(?:of\s+)?(\d+)?\s*(?:agents|subagents)?/i,
      singleTask: /(?:do|run|execute|perform|handle)\s+(?:task\s+)?(.+)/i,
      queryStatus: /(?:what(?:'s|is)\s+)?(?:the\s+)?(?:status|state|health)\s*(?:of\s+(?:the\s+)?(?:swarm|system|agents))?/i,
      analyzeData: /(?:analyze|examine|process|review)\s+(?:data|input|files?|documents?)\s*(?:for\s+)?(.+)?/i,
      generateContent: /(?:generate|create|write|produce)\s+(?:a\s+)?(.+)/i,
      coordinateTask: /(?:coordinate|orchestrate|manage)\s+(?:the\s+)?(.+)/i,
      stopSwarm: /(?:stop|terminate|halt|kill)\s+(?:the\s+)?(?:swarm|all\s+agents)?/i,
      optimizeTask: /(?:optimize|improve|enhance)\s+(?:the\s+)?(.+)/i
    };

    let intent = 'unknown';
    let params = {};

    for (const [patternName, pattern] of Object.entries(intentPatterns)) {
      const match = text.match(pattern);
      if (match) {
        intent = patternName;
        if (match[1]) {
          if (patternName === 'createSwarm') {
            params.agentCount = parseInt(match[1]) || 3;
          } else {
            params.target = match[1];
          }
        }
        break;
      }
    }

    const complexityIndicators = {
      high: /(?:complex|deep|thorough|comprehensive|detailed|multi-step|advanced)/i,
      medium: /(?:moderate|standard|normal|regular|typical)/i,
      low: /(?:simple|quick|fast|basic|straightforward|easy)/i
    };

    let complexity = 0.5;
    if (complexityIndicators.high.test(text)) complexity = 0.8;
    else if (complexityIndicators.low.test(text)) complexity = 0.2;
    else if (complexityIndicators.medium.test(text)) complexity = 0.5;

    const urgencyIndicators = {
      high: /(?:urgent|immediately|asap|priority|critical|emergency|rush)/i,
      medium: /(?:soon|when possible|normal priority)/i,
      low: /(?:whenever|when you can|no rush|background|low priority)/i
    };

    let urgency = 0.5;
    if (urgencyIndicators.high.test(text)) urgency = 0.9;
    else if (urgencyIndicators.low.test(text)) urgency = 0.2;
    else if (urgencyIndicators.medium.test(text)) urgency = 0.5;

    return {
      intent,
      params,
      complexity,
      urgency,
      tier: this.selectTier(complexity, urgency),
      raw: voiceText
    };
  }

  createPlan(intent, swarmState = {}) {
    const plans = {
      createSwarm: (params) => ({
        steps: [
          { action: 'assessComplexity', params: { complexity: params.complexity || 0.7 } },
          { action: 'allocateAgents', params: { count: params.agentCount || 3, tier: params.tier } },
          { action: 'distributeTasks', params: { tasks: this._generateTasks(params.agentCount || 3) } },
          { action: 'monitorProgress', params: { interval: 5000 } }
        ],
        estimatedTokens: (params.agentCount || 3) * 2000,
        estimatedDuration: (params.agentCount || 3) * 30
      }),
      singleTask: (params) => ({
        steps: [
          { action: 'analyzeRequirements', params: { target: params.target } },
          { action: 'executeTask', params: { target: params.target, tier: params.tier } },
          { action: 'returnResults', params: {} }
        ],
        estimatedTokens: 500,
        estimatedDuration: 10
      }),
      analyzeData: (params) => ({
        steps: [
          { action: 'ingestData', params: { target: params.target } },
          { action: 'runAnalysis', params: { depth: params.complexity || 'standard' } },
          { action: 'synthesizeFindings', params: {} }
        ],
        estimatedTokens: 3000,
        estimatedDuration: 45
      }),
      queryStatus: () => ({
        steps: [
          { action: 'collectAgentStatus', params: {} },
          { action: 'aggregateMetrics', params: {} },
          { action: 'reportStatus', params: {} }
        ],
        estimatedTokens: 100,
        estimatedDuration: 2
      })
    };

    const planGenerator = plans[intent] || plans.singleTask;
    const plan = planGenerator({ ...intent.params, swarmState });
    
    return {
      planId: `plan_${Date.now()}`,
      intent: intent.intent || intent,
      tier: intent.tier || this.selectTier(intent.complexity || 0.5, intent.urgency || 0.5),
      ...plan,
      swarmMemory: this.swarmMemory.global
    };
  }

  _generateTasks(count) {
    const taskTypes = ['analyze', 'execute', 'coordinate', 'review', 'synthesize'];
    return Array.from({ length: count }, (_, i) => ({
      taskId: `task_${i + 1}`,
      type: taskTypes[i % taskTypes.length],
      priority: i === 0 ? 'high' : 'normal'
    }));
  }

  formatSubagentPrompt(agentConfig) {
    const tier = TIERS[agentConfig.tier] || TIERS.Standard;
    
    return SUBAGENT_PROMPT
      .replace(/\{agentName\}/g, agentConfig.name || 'UnnamedAgent')
      .replace(/\{agentRole\}/g, agentConfig.role || 'General')
      .replace(/\{tier\}/g, agentConfig.tier || 'Standard')
      .replace(/\{agentId\}/g, agentConfig.id || this._generateSessionId())
      .replace(/\{mission\}/g, agentConfig.mission || 'Complete assigned tasks')
      .replace(/\{objective\}/g, agentConfig.objective || 'Task objective unspecified')
      .replace(/\{coordinatorId\}/g, agentConfig.coordinatorId || 'coordinator')
      .replace(/\{memoryContext\}/g, JSON.stringify(this.swarmMemory.context, null, 2))
      .replace(/\{primaryFunction\}/g, agentConfig.primaryFunction || 'General task execution')
      .replace(/\{tools\}/g, JSON.stringify(agentConfig.tools || []))
      .replace(/\{contextWindow\}/g, tier.contextWindow.toString())
      .replace(/\{reportInterval\}/g, (agentConfig.reportInterval || 30).toString())
      .replace(/\{escalationThreshold\}/g, (agentConfig.escalationThreshold || 0.7).toString())
      .replace(/\{maxIterations\}/g, (agentConfig.maxIterations || 100).toString());
  }

  async spawnSubagent(agentConfig) {
    const agentId = agentConfig.id || `agent_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const tier = agentConfig.tier || 'Standard';
    
    if (!this.swarmMemory.agents[agentId]) {
      this.swarmMemory.agents[agentId] = {
        id: agentId,
        name: agentConfig.name,
        role: agentConfig.role,
        tier: tier,
        status: 'initializing',
        createdAt: Date.now(),
        lastHeartbeat: Date.now(),
        tasksCompleted: 0,
        tokensUsed: 0
      };
    }
    
    this.swarmMemory.global.activeAgents++;
    
    const prompt = this.formatSubagentPrompt({
      ...agentConfig,
      id: agentId,
      tier: tier
    });

    const model = this.tierDefaults[tier] || this.defaultModel;
    
    return {
      agentId,
      config: {
        ...agentConfig,
        id: agentId,
        tier,
        model
      },
      prompt,
      status: 'spawned'
    };
  }

  async spawnTeam(teamConfig) {
    const teamId = teamConfig.id || `team_${Date.now()}`;
    const agentCount = teamConfig.agentCount || 3;
    const tier = teamConfig.tier || 'Standard';
    const tierConfig = TIERS[tier] || TIERS.Standard;
    
    const maxAgents = Math.min(agentCount, tierConfig.maxAgents, this.maxAgents);
    
    if (this.swarmMemory.global.activeAgents + maxAgents > this.maxAgents) {
      throw new Error(`Cannot spawn ${maxAgents} agents: would exceed maxAgents limit of ${this.maxAgents}`);
    }
    
    const team = {
      teamId,
      agents: [],
      status: 'forming',
      createdAt: Date.now()
    };
    
    for (let i = 0; i < maxAgents; i++) {
      const agentConfig = {
        name: `${teamConfig.namePrefix || 'Agent'}_${i + 1}`,
        role: teamConfig.roles?.[i] || teamConfig.defaultRole || 'TeamMember',
        tier: tier,
        mission: teamConfig.mission || 'Collaborate on team objectives',
        objective: teamConfig.objectives?.[i] || `Complete assigned task ${i + 1}`,
        coordinatorId: teamConfig.coordinatorId,
        tools: teamConfig.tools || [],
        ...teamConfig.agentDefaults
      };
      
      const agent = await this.spawnSubagent(agentConfig);
      team.agents.push(agent);
    }
    
    team.status = 'active';
    
    return {
      teamId,
      team,
      agentCount: team.agents.length,
      tier
    };
  }

  getUsage() {
    return {
      current: { ...this.usage },
      swarm: {
        totalTokens: this.swarmMemory.global.totalTokens,
        byTier: { ...this.swarmMemory.metrics.tokenUsageByTier },
        byAgent: { ...this.swarmMemory.metrics.tokenUsageByAgent },
        requestLatencies: this.swarmMemory.metrics.requestLatencies.slice(-100),
        averageLatency: this.swarmMemory.metrics.requestLatencies.length > 0
          ? this.swarmMemory.metrics.requestLatencies.reduce((a, b) => a + b, 0) / this.swarmMemory.metrics.requestLatencies.length
          : 0
      },
      session: {
        sessionId: this.swarmMemory.global.sessionId,
        uptime: Date.now() - this.swarmMemory.global.startTime,
        activeAgents: this.swarmMemory.global.activeAgents,
        completedTasks: this.swarmMemory.global.completedTasks,
        failedTasks: this.swarmMemory.global.failedTasks
      }
    };
  }

  getCostEstimate() {
    let totalCost = 0;
    const byModel = {};
    
    for (const [model, usage] of Object.entries(this.usage.byModel)) {
      const tier = this._getTierForModel(model);
      const tierConfig = tier ? TIERS[tier] : null;
      const costPer1K = tierConfig ? tierConfig.costPer1KTokens : 0.03;
      
      const modelCost = (usage.total / 1000) * costPer1K;
      byModel[model] = {
        tokens: usage.total,
        cost: modelCost
      };
      totalCost += modelCost;
    }
    
    return {
      totalCostUSD: totalCost,
      byModel,
      projectedFullRunCost: totalCost * 1.2,
      costOptimizationSuggestions: this._getCostSuggestions()
    };
  }

  _getCostSuggestions() {
    const suggestions = [];
    const tierUsage = this.swarmMemory.metrics.tokenUsageByTier;
    
    if (tierUsage.Command > 0 && tierUsage.Fast === 0) {
      suggestions.push('Consider using Fast tier for simple queries to reduce costs by ~90%');
    }
    
    if (this.swarmMemory.metrics.cacheHits === 0 && this.swarmMemory.global.totalTokens > 10000) {
      suggestions.push('Implement response caching for repeated queries');
    }
    
    if (this.swarmMemory.metrics.requestLatencies.length > 10) {
      const avgLatency = this.swarmMemory.metrics.requestLatencies.reduce((a, b) => a + b, 0) / this.swarmMemory.metrics.requestLatencies.length;
      if (avgLatency > 5000) {
        suggestions.push('High latency detected; consider batching requests');
      }
    }
    
    return suggestions;
  }

  updateSwarmMemory(updates) {
    if (updates.global) {
      Object.assign(this.swarmMemory.global, updates.global);
    }
    if (updates.context) {
      Object.assign(this.swarmMemory.context, updates.context);
    }
    if (updates.agents) {
      for (const [agentId, agentData] of Object.entries(updates.agents)) {
        if (!this.swarmMemory.agents[agentId]) {
          this.swarmMemory.agents[agentId] = {};
        }
        Object.assign(this.swarmMemory.agents[agentId], agentData);
      }
    }
    if (updates.tasks) {
      for (const [taskId, taskData] of Object.entries(updates.tasks)) {
        if (!this.swarmMemory.tasks[taskId]) {
          this.swarmMemory.tasks[taskId] = {};
        }
        Object.assign(this.swarmMemory.tasks[taskId], taskData);
      }
    }
  }

  getSwarmMemory() {
    return this._deepClone(this.swarmMemory);
  }

  resetSwarmMemory() {
    this.swarmMemory = this._deepClone(SWARM_MEMORY);
    this.swarmMemory.global.sessionId = this._generateSessionId();
    this.swarmMemory.global.startTime = Date.now();
  }
}

module.exports = {
  KimiClient,
  TIERS,
  SUBAGENT_PROMPT,
  SWARM_MEMORY,
  RateLimiter
};
