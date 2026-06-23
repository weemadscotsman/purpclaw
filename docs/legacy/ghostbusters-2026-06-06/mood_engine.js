/**
 * PURPCLAW MOOD ENGINE v7.0
 * ============================
 * The emotional core of the TURING avatar.
 * Drives face expressions, voice tone, and agent priority.
 * 
 * Mood states flow: hype, focused, chill, chaotic, sad, angry, excited, sleeping
 */

const EventEmitter = require('events');

// Mood configuration
const MOODS = {
  hype: {
    name: 'HYPE',
    eyes: '👑👑',
    mouth: ' GRINS',
    accessory: '✨',
    bgGradient: ['#9b00ff', '#ff00ff'],
    textColor: '#ffffff',
    animation: 'bounce',
    voiceSpeed: 1.3,
    voicePitch: 1.2,
    voiceEnergy: 'high',
    agentPriority: ['phoenix', 'bee', 'wolf', 'octopus'],
    transitionMs: 500,
    triggerPhrases: ['winning', 'celebrate', 'yes', 'hype', 'awesome', 'good']
  },
  focused: {
    name: 'FOCUSED',
    eyes: '🧠🧠',
    mouth: ' coding',
    accessory: '💻',
    bgGradient: ['#1a1a2e', '#16213e'],
    textColor: '#00ffa3',
    animation: 'lean',
    voiceSpeed: 0.8,
    voicePitch: 1.0,
    voiceEnergy: 'medium',
    agentPriority: ['mantis', 'snake', 'robot', 'guardian', 'claw'],
    transitionMs: 800,
    triggerPhrases: ['work', 'build', 'code', 'debug', 'focus', 'analyze']
  },
  chill: {
    name: 'CHILL',
    eyes: '😌😌',
    mouth: ' relaxed',
    accessory: '🌊',
    bgGradient: ['#0f0f23', '#1a1a2e'],
    textColor: '#a0a0a0',
    animation: 'sway',
    voiceSpeed: 0.7,
    voicePitch: 0.9,
    voiceEnergy: 'low',
    agentPriority: ['axolotl', 'cactus', 'chonk', 'duck', 'owl', 'turtle'],
    transitionMs: 1000,
    triggerPhrases: ['rest', 'chill', 'relax', 'slow', 'calm', 'easy']
  },
  chaotic: {
    name: 'CHAOTIC',
    eyes: '😵‍💫😵‍💫',
    mouth: ' WHAT',
    accessory: '🌀',
    bgGradient: ['#ff00ff', '#00ffff', '#ffff00'],
    textColor: '#ffffff',
    animation: 'shake',
    voiceSpeed: 1.5,
    voicePitch: 1.4,
    voiceEnergy: 'max',
    agentPriority: ['fox', 'mushroom', 'karen', 'void'],
    transitionMs: 200,
    triggerPhrases: ['what', 'wtf', 'confused', 'chaos', 'random', 'weird']
  },
  sad: {
    name: 'SAD',
    eyes: '😢😢',
    mouth: ' sniffles',
    accessory: '💧',
    bgGradient: ['#1a1a2e', '#0f0f23'],
    textColor: '#6495ED',
    animation: 'slump',
    voiceSpeed: 0.6,
    voicePitch: 0.7,
    voiceEnergy: 'low',
    agentPriority: ['axolotl', 'chonk', 'ghost'],
    transitionMs: 1500,
    triggerPhrases: ['sad', 'failed', 'error', 'broken', 'sorry', 'unfortunate']
  },
  angry: {
    name: 'ANGRY',
    eyes: '😤😤',
    mouth: ' GRR',
    accessory: '🔥',
    bgGradient: ['#ff0000', '#8b0000'],
    textColor: '#ffffff',
    animation: 'shake',
    voiceSpeed: 1.4,
    voicePitch: 1.3,
    voiceEnergy: 'max',
    agentPriority: ['dragon', 'goose', 'wolf', 'void'],
    transitionMs: 100,
    triggerPhrases: ['fuck', 'shit', 'damn', 'angry', 'attack', 'kill']
  },
  excited: {
    name: 'EXCITED',
    eyes: '✨✨',
    mouth: ' WOOT',
    accessory: '⚡',
    bgGradient: ['#ffd700', '#ff8c00'],
    textColor: '#0f0f23',
    animation: 'hop',
    voiceSpeed: 1.4,
    voicePitch: 1.3,
    voiceEnergy: 'high',
    agentPriority: ['rabbit', 'phoenix', 'bee'],
    transitionMs: 300,
    triggerPhrases: ['new', 'exciting', 'wow', 'amazing', 'incredible', 'woot']
  },
  sleeping: {
    name: 'SLEEPING',
    eyes: '💤💤',
    mouth: ' zzz',
    accessory: '🌙',
    bgGradient: ['#0f0f23', '#1a1a2e'],
    textColor: '#606060',
    animation: 'breathe',
    voiceSpeed: 0,
    voicePitch: 0,
    voiceEnergy: 'none',
    agentPriority: [],
    transitionMs: 2000,
    triggerPhrases: ['sleep', 'goodnight', 'night', 'bed', 'tired', 'rest']
  }
};

class MoodEngine extends EventEmitter {
  constructor() {
    super();
    this.currentMood = 'chill';
    this.previousMood = 'chill';
    this.moodStartTime = Date.now();
    this.transitioning = false;
    this.moodHistory = [];
    this.agentMoodContributions = {};
    
    // Initialize all agents with neutral contribution
    const AGENTS = [
      'axolotl', 'bee', 'cactus', 'chonk', 'claw', 'crow',
      'dragon', 'duck', 'fox', 'ghost', 'goose', 'guardian',
      'karen', 'mantis', 'mushroom', 'octopus', 'owl', 'penguin',
      'phoenix', 'rabbit', 'robot', 'snake', 'spider', 'turtle', 'void', 'wolf'
    ];
    AGENTS.forEach(a => this.agentMoodContributions[a] = 0);
    
    // Auto-transition from excited to chill after 5s
    this.autoTransitionInterval = setInterval(() => this.checkAutoTransition(), 5000);
  }

  cleanup() {
    if (this.autoTransitionInterval) {
      clearInterval(this.autoTransitionInterval);
    }
  }

  /**
   * Get current mood configuration
   */
  getMood() {
    return {
      ...MOODS[this.currentMood],
      duration: Date.now() - this.moodStartTime,
      transitioning: this.transitioning
    };
  }

  /**
   * Get face data for rendering
   */
  getFaceData() {
    const mood = this.getMood();
    return {
      moodName: mood.name,
      eyes: mood.eyes,
      mouth: mood.mouth,
      accessory: mood.accessory,
      bgGradient: mood.bgGradient,
      textColor: mood.textColor,
      animation: mood.animation
    };
  }

  /**
   * Get voice parameters for TTS
   */
  getVoiceParams() {
    const mood = MOODS[this.currentMood];
    return {
      speed: mood.voiceSpeed,
      pitch: mood.voicePitch,
      energy: mood.voiceEnergy
    };
  }

  /**
   * Get prioritized agents for current mood
   */
  getPrioritizedAgents() {
    return MOODS[this.currentMood].agentPriority;
  }

  /**
   * Set mood with transition
   */
  setMood(newMood, force = false) {
    if (!MOODS[newMood]) {
      console.error(`[MoodEngine] Unknown mood: ${newMood}`);
      return false;
    }

    if (this.currentMood === newMood && !force) {
      return false; // Already in this mood
    }

    const oldMood = this.currentMood;
    this.previousMood = oldMood;
    this.transitioning = true;

    console.log(`[MoodEngine] ${oldMood.toUpperCase()} → ${newMood.toUpperCase()}`);

    // Emit transition event
    this.emit('moodTransition', {
      from: oldMood,
      to: newMood,
      faceData: this.getFaceData(),
      voiceParams: this.getVoiceParams()
    });

    // Complete transition after animation time
    setTimeout(() => {
      this.currentMood = newMood;
      this.moodStartTime = Date.now();
      this.transitioning = false;
      
      this.currentMood = newMood;
      this.moodStartTime = Date.now();
      this.transitioning = false;
      this.logMood();
      
      this.emit('moodChanged', {
        mood: newMood,
        faceData: this.getFaceData(),
        voiceParams: this.getVoiceParams()
      });
    }, MOODS[newMood].transitionMs);

    return true;
  }

  /**
   * Analyze text input and suggest mood
   */
  analyzeText(text) {
    const lower = text.toLowerCase();
    
    for (const [moodName, config] of Object.entries(MOODS)) {
      for (const trigger of config.triggerPhrases) {
        if (lower.includes(trigger)) {
          return moodName;
        }
      }
    }
    return null;
  }

  /**
   * Process incoming text and auto-adjust mood
   */
  processInput(text) {
    const suggested = this.analyzeText(text);
    if (suggested && suggested !== this.currentMood) {
      this.setMood(suggested);
    }
  }

  /**
   * Agent reports mood contribution
   */
  agentMoodReport(agentName, value) {
    if (agentName in this.agentMoodContributions) {
      this.agentMoodContributions[agentName] = value;
      this.recalculateMood();
    }
  }

  /**
   * Recalculate overall mood from agent contributions
   */
  recalculateMood() {
    // Count agent mood votes
    const votes = {};
    Object.entries(this.agentMoodContributions).forEach(([agent, contribution]) => {
      if (contribution !== 0) {
        const mood = contribution > 0 ? 'excited' : 'sad';
        votes[mood] = (votes[mood] || 0) + Math.abs(contribution);
      }
    });

    // Strongest vote wins (if > 3 agents agree)
    const threshold = 3;
    for (const [mood, count] of Object.entries(votes)) {
      if (count >= threshold && Math.random() < 0.3) { // 30% chance to shift mood based on agent votes
        this.setMood(mood);
        break;
      }
    }
  }

  /**
   * Auto-transition from high energy moods
   */
  checkAutoTransition() {
    if (['hype', 'excited', 'angry', 'chaotic'].includes(this.currentMood)) {
      const duration = Date.now() - this.moodStartTime;
      
      // If in high energy mood for > 30s, slowly drift to focused
      if (duration > 30000 && Math.random() < 0.2) {
        this.setMood('focused');
      }
    }
  }

  /**
   * Force sleep mode
   */
  sleep() {
    this.setMood('sleeping', true);
    this.emit('sleep');
  }

  /**
   * Wake from sleep
   */
  wake() {
    if (this.currentMood === 'sleeping') {
      this.setMood('chill', true);
      this.emit('wake');
    }
  }

  /**
   * Get mood history for debugging
   */
  getHistory() {
    return this.moodHistory.slice(-50); // Last 50 transitions
  }

  /**
   * Log mood to history
   */
  logMood() {
    this.moodHistory.push({
      mood: this.currentMood,
      timestamp: Date.now()
    });
  }
}

// Singleton export
module.exports = new MoodEngine();
