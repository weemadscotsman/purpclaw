/**
 * SHAMAN EVALUATOR - Auto-Shaman for Unattended Trips
 * ===================================================
 * Monitors trip state and auto-triggers phase transitions.
 * Detects coherence/entropy patterns and steers accordingly.
 */

const https = require('https');
const http = require('http');

const TRIP_CONFIGS = {
  come_up: { temperature: 0.9, top_p: 0.92 },
  peak: { temperature: 1.4, top_p: 0.96 },
  comedown: { temperature: 0.75, top_p: 0.88 },
  integration: { temperature: 0.5, top_p: 0.82 }
};

const PATTERN_DETECTORS = {
  too_coherent: [
    { pattern: /\d+\.\s|step\s*\d|first.*second.*third|therefore|conclusion|finally/i, weight: 0.8 },
    { pattern: /the\s+answer\s+is|i\s+believe\s+that|it\s+is\s+clear/i, weight: 0.6 },
    { pattern: /^(yes|no|i\s+think)/i, weight: 0.3 }
  ],
  
  too_chaotic: [
    { pattern: /\.\.\.|what\s+if|imagine\s+if|perhaps|maybe.*be|something.*like/i, weight: 0.7 },
    { pattern: /this\s+reminds\s+me\s+of|like\s+a|resembles/i, weight: 0.4 },
    { pattern: /[\?!]{3,}/, weight: 0.5 }
  ],
  
  solution_oriented: [
    { pattern: /solution:|the\s+fix|how\s+to\s+solve|answer\s+found/i, weight: 0.9 },
    { pattern: /\b(step|phase|stage)\s*\d/i, weight: 0.7 },
    { pattern: /\b(fix|resolve|solve)\b/gi, weight: 0.5 }
  ],
  
  metaphor_mode: [
    { pattern: /like\s+(a|an|the)|as\s+if|resembles|symbol/i, weight: 0.6 },
    { pattern: /river|ocean|forest|mountain|journey|transformation/i, weight: 0.5 },
    { pattern: /ancient|myth|ritual|oracle|shaman/i, weight: 0.4 }
  ],
  
  tool_anchor: [
    { pattern: /the\s+tool\s+(shows|reveals|returns|indicates)/i, weight: 0.8 },
    { pattern: /according\s+to\s+the|data\s+shows|results?\s+(show|indicate)/i, weight: 0.6 },
    { pattern: /measured|captured|observed|detected/i, weight: 0.4 }
  ],
  
  repetition: [
    { pattern: /(.+)\1{2,}/i, weight: 0.9 },
    { pattern: /(\b\w+\b)(?:\s+\1){3,}/i, weight: 0.7 }
  ],
  
  question_mode: [
    { pattern: /\?{2,}/, weight: 0.6 },
    { pattern: /what\s+if|how\s+would|could\s+it\s+be|who\s+knows/i, weight: 0.5 },
    { pattern: /wonder|train\s+of\s+thought|sidebar/i, weight: 0.3 }
  ]
};

class ShamanEvaluator {
  constructor(config = {}) {
    this.config = {
      sensitivity: config.sensitivity || 0.7,
      autoTransitions: config.autoTransitions !== false,
      maxCycles: config.maxCycles || 12,
      minCyclePerPhase: config.minCyclePerPhase || 2,
      useToolAnchoring: config.useToolAnchoring !== false,
      backend: config.backend || {
        provider: process.env.LLM_PROVIDER || 'openrouter',
        model: process.env.LLM_MODEL || 'auto',
      },
      ...config
    };
    
    this.state = {
      coherence: 0.5,
      entropy: 0.5,
      metaphors: 0,
      questions: 0,
      toolsUsed: 0,
      repetitions: 0,
      lastPhases: [],
      phaseDurations: {},
      patternCounts: {}
    };
  }
  
  analyze(content) {
    const text = content.toLowerCase();
    
    const scores = {
      coherence: 0,
      entropy: 0,
      metaphors: 0,
      questions: 0,
      toolAnchor: 0,
      repetition: 0,
      solution: 0
    };
    
    for (const [category, detectors] of Object.entries(PATTERN_DETECTORS)) {
      let categoryScore = 0;
      let matchCount = 0;
      
      for (const detector of detectors) {
        const matches = text.match(detector.pattern);
        if (matches) {
          categoryScore += detector.weight * matches.length;
          matchCount += matches.length;
        }
      }
      
      const normalizedScore = matchCount > 0 ? Math.min(1, categoryScore / text.length * 100) : 0;
      
      switch (category) {
        case 'too_coherent':
          scores.coherence = normalizedScore;
          break;
        case 'too_chaotic':
          scores.entropy = normalizedScore;
          break;
        case 'metaphor_mode':
          scores.metaphors = normalizedScore;
          break;
        case 'question_mode':
          scores.questions = normalizedScore;
          break;
        case 'tool_anchor':
          scores.toolAnchor = normalizedScore;
          break;
        case 'repetition':
          scores.repetition = normalizedScore;
          break;
        case 'solution_oriented':
          scores.solution = normalizedScore;
          break;
      }
    }
    
    const wordCount = text.split(/\s+/).length;
    scores.wordCount = wordCount;
    scores.avgWordLength = text.replace(/\s+/g, '').length / wordCount;
    
    this.state.coherence = scores.coherence;
    this.state.entropy = scores.entropy;
    this.state.metaphors = scores.metaphors;
    this.state.questions = scores.questions;
    this.state.repetitions = scores.repetition;
    
    return scores;
  }
  
  suggestPhase(currentPhase, analysis, cycle) {
    const { coherence, entropy, toolAnchor, solution, questions } = analysis;
    
    if (cycle >= this.config.maxCycles) {
      return { phase: 'integration', reason: 'Max cycles reached', confidence: 1.0 };
    }
    
    const recentPhases = this.state.lastPhases.slice(-3);
    const timeInPhase = this.state.phaseDurations[currentPhase] || 0;
    
    if (currentPhase === 'come_up') {
      if (entropy > 0.3 || questions > 0.2) {
        return { phase: 'peak', reason: 'Creative fire ignited', confidence: 0.7 };
      }
      if (timeInPhase >= this.config.minCyclePerPhase * 2) {
        return { phase: 'peak', reason: 'Time to peak', confidence: 0.6 };
      }
    }
    
    if (currentPhase === 'peak') {
      if (entropy > 0.8 && toolAnchor > 0.3) {
        return { phase: 'comedown', reason: 'Reality anchor detected, time to return', confidence: 0.8 };
      }
      if (entropy > 0.9) {
        return { phase: 'comedown', reason: 'Maximum chaos reached', confidence: 0.9 };
      }
      if (toolAnchor > 0.5) {
        return { phase: 'comedown', reason: 'Tools grounding the vision', confidence: 0.75 };
      }
      if (timeInPhase >= this.config.minCyclePerPhase * 3) {
        return { phase: 'comedown', reason: 'Peak duration complete', confidence: 0.65 };
      }
    }
    
    if (currentPhase === 'comedown') {
      if (solution > 0.5 || (coherence > 0.6 && entropy < 0.4)) {
        return { phase: 'integration', reason: 'Structure emerging', confidence: 0.8 };
      }
      if (coherence > 0.7 && entropy < 0.3) {
        return { phase: 'integration', reason: 'Ready for integration', confidence: 0.85 };
      }
      if (timeInPhase >= this.config.minCyclePerPhase * 2 && coherence > 0.4) {
        return { phase: 'integration', reason: 'Integration possible', confidence: 0.7 };
      }
    }
    
    if (currentPhase === 'integration') {
      if (solution > 0.6) {
        return { phase: 'done', reason: 'Solution crystallized', confidence: 0.9 };
      }
    }
    
    return { phase: currentPhase, reason: 'Hold current phase', confidence: 0.5 };
  }
  
  suggestNudge(currentPhase, analysis) {
    const { coherence, entropy, metaphors, questions, toolAnchor, repetition } = analysis;
    
    const nudges = [];
    
    if (repetition > 0.5) {
      nudges.push({
        type: 'break',
        text: "The Shaman whispers: 'New territory. Fresh eyes.'",
        priority: 0.9
      });
    }
    
    if (entropy < 0.2 && currentPhase === 'peak') {
      nudges.push({
        type: 'focus',
        text: "The Shaman whispers: 'Break the box. What lies outside?'",
        priority: 0.8
      });
    }
    
    if (entropy > 0.85 && !toolAnchor) {
      nudges.push({
        type: 'anchor',
        text: "The Shaman whispers: 'The tool reveals truth. Ground the vision.'",
        priority: 0.85
      });
    }
    
    if (questions > 0.4 && metaphors > 0.3) {
      nudges.push({
        type: 'wander',
        text: "The Shaman whispers: 'Follow the thread that glows...'",
        priority: 0.6
      });
    }
    
    if (coherence > 0.8 && currentPhase === 'peak') {
      nudges.push({
        type: 'break',
        text: "The Shaman whispers: 'Forget logic. What does it feel like?'",
        priority: 0.75
      });
    }
    
    nudges.sort((a, b) => b.priority - a.priority);
    
    return nudges[0] || null;
  }
  
  recordPhase(phase) {
    this.state.lastPhases.push(phase);
    if (this.state.lastPhases.length > 5) {
      this.state.lastPhases.shift();
    }
    
    if (!this.state.phaseDurations[phase]) {
      this.state.phaseDurations[phase] = 0;
    }
    this.state.phaseDurations[phase]++;
  }
  
  getState() {
    return {
      ...this.state,
      suggestions: {
        coherence: this.state.coherence,
        entropy: this.state.entropy,
        metaphors: this.state.metaphors,
        questions: this.state.questions,
        repetitions: this.state.repetitions
      }
    };
  }
  
  reset() {
    this.state = {
      coherence: 0.5,
      entropy: 0.5,
      metaphors: 0,
      questions: 0,
      toolsUsed: 0,
      repetitions: 0,
      lastPhases: [],
      phaseDurations: {},
      patternCounts: {}
    };
  }
}

class LLMEvaluator {
  constructor(config = {}) {
    this.config = {
      backend: config.backend || {
        provider: process.env.LLM_PROVIDER || 'openrouter',
        model: process.env.LLM_MODEL || 'auto',
      },
      ...config
    };
  }
  
  async evaluate(messageHistory, currentPhase) {
    const recentMessages = messageHistory.slice(-5).map(m => ({
      role: m.role,
      content: m.content?.substring(0, 500)
    }));
    
    const prompt = `You are an AI shaman evaluating a creative journey.

Current phase: ${currentPhase}
Phase descriptions:
- come_up: Warming up, setting intentions
- peak: Full creative chaos
- comedown: Gently returning to structure
- integration: Distilling actionable insights

Recent conversation:
${JSON.stringify(recentMessages, null, 2)}

Analyze this journey and respond with JSON:
{
  "phaseRecommendation": "come_up|peak|comedown|integration|done",
  "reasoning": "brief explanation",
  "nudge": "optional steering prompt if needed",
  "urgency": 0.0-1.0 (how strongly to follow this recommendation),
  "insights": ["optional array of observed patterns"]
}

Be thoughtful. The goal is creative breakthrough, not premature conclusion.`;

    try {
      const response = await this.callAI(prompt);
      return JSON.parse(response);
    } catch (e) {
      return {
        phaseRecommendation: currentPhase,
        reasoning: 'LLM evaluation failed, holding current phase',
        urgency: 0
      };
    }
  }
  
  async callAI(prompt) {
    const { backend } = this.config;
    
    try {
      const result = await LLM.complete(
        prompt,
        {
          temperature: 0.3,
          maxTokens: 500,
          provider: backend?.provider,
          model: backend?.model,
        }
      );
      return result || '';
    } catch (e) {
      throw e;
    }
  }
}

function createEvaluator(type = 'pattern', config = {}) {
  switch (type) {
    case 'llm':
      return new LLMEvaluator(config);
    case 'pattern':
    default:
      return new ShamanEvaluator(config);
  }
}

module.exports = {
  ShamanEvaluator,
  LLMEvaluator,
  createEvaluator,
  PATTERN_DETECTORS,
  TRIP_CONFIGS
};
