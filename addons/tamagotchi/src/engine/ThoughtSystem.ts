import { PetState } from './StateManager';
import { NeedThoughts } from './thoughts/needThoughts';
import { ComboThoughts } from './thoughts/comboThoughts';
import { CodingThoughts } from './thoughts/codingThoughts';
import { RandomThoughts } from './thoughts/randomThoughts';
import { ActionThoughts } from './thoughts/actionThoughts';

// Thought category types
export type ThoughtCategory = 'need' | 'combo' | 'coding' | 'random' | 'mood' | 'reactive';

// Thought priority levels
export enum ThoughtPriority {
  CRITICAL = 1,  // Urgent needs (stats < 20%)
  REACTIVE = 2,  // Response to keywords
  HIGH = 3,      // Important needs (stats < 40%)
  COMBO = 4,     // Multiple low stats
  NORMAL = 5,    // Regular thoughts
  LOW = 6        // Random musings
}

// Configuration from environment
const THOUGHT_FREQUENCY = parseInt(process.env.PET_THOUGHT_FREQUENCY || '15');
const NEED_THRESHOLD = parseInt(process.env.PET_NEED_THRESHOLD || '40');
const CRITICAL_THRESHOLD = parseInt(process.env.PET_CRITICAL_THRESHOLD || '20');
const THOUGHT_COOLDOWN = parseInt(process.env.PET_THOUGHT_COOLDOWN || '10');
const CHATTINESS = process.env.PET_CHATTINESS || 'normal';

// Category weights (should sum to 100)
const WEIGHT_NEEDS = parseInt(process.env.PET_THOUGHT_WEIGHT_NEEDS || '40');
const WEIGHT_CODING = parseInt(process.env.PET_THOUGHT_WEIGHT_CODING || '25');
const WEIGHT_RANDOM = parseInt(process.env.PET_THOUGHT_WEIGHT_RANDOM || '20');
const WEIGHT_MOOD = parseInt(process.env.PET_THOUGHT_WEIGHT_MOOD || '15');

export class ThoughtSystem {
  private thoughtHistory: string[] = [];
  private categoryFatigue: Map<ThoughtCategory, number> = new Map();
  private lastThoughtTime: number = 0;
  private thoughtCooldown: number;
  private escalationTracking: Map<string, number> = new Map();
  
  constructor() {
    // Adjust cooldown based on chattiness
    const cooldownMultiplier = CHATTINESS === 'quiet' ? 2 : CHATTINESS === 'chatty' ? 0.5 : 1;
    this.thoughtCooldown = Math.floor(THOUGHT_COOLDOWN * cooldownMultiplier);
    
    // Initialize category fatigue
    this.categoryFatigue.set('need', 0);
    this.categoryFatigue.set('combo', 0);
    this.categoryFatigue.set('coding', 0);
    this.categoryFatigue.set('random', 0);
    this.categoryFatigue.set('mood', 0);
    this.categoryFatigue.set('reactive', 0);
  }
  
  // Main thought generation method
  generateThought(state: PetState, context?: { recentInput?: string, sessionData?: any }): string | null {
    // Update fatigue decay
    this.updateFatigue();
    
    // Check if enough time has passed since last thought
    const updatesSinceLastThought = state.totalUpdateCount - this.lastThoughtTime;
    if (updatesSinceLastThought < this.thoughtCooldown) {
      return null;
    }
    
    // Priority check system
    const priority = this.checkPriority(state, context);
    let thought: string | null = null;
    
    switch (priority) {
      case ThoughtPriority.CRITICAL:
        thought = this.getCriticalThought(state);
        break;
        
      case ThoughtPriority.REACTIVE:
        if (context?.recentInput) {
          thought = this.getReactiveThought(context.recentInput, state);
        }
        break;
        
      case ThoughtPriority.COMBO:
        thought = this.getComboThought(state);
        break;
        
      default:
        // Normal thought selection using category wheel
        thought = this.getNormalThought(state, context);
        break;
    }
    
    // Verify thought isn't too similar to recent ones
    if (thought && !this.isTooSimilar(thought)) {
      this.addToHistory(thought);
      this.lastThoughtTime = state.totalUpdateCount;
      return thought;
    }
    
    // Try fallback if thought was rejected
    if (thought && updatesSinceLastThought > this.thoughtCooldown * 2) {
      thought = this.getFallbackThought(state);
      this.addToHistory(thought);
      this.lastThoughtTime = state.totalUpdateCount;
      return thought;
    }
    
    return null;
  }
  
  // Check what priority level of thought is needed
  private checkPriority(state: PetState, context?: any): ThoughtPriority {
    // Critical needs override everything
    if (state.hunger < CRITICAL_THRESHOLD || 
        state.energy < CRITICAL_THRESHOLD || 
        state.cleanliness < CRITICAL_THRESHOLD ||
        state.happiness < CRITICAL_THRESHOLD) {
      return ThoughtPriority.CRITICAL;
    }
    
    // Reactive thoughts for keywords
    if (context?.recentInput && this.hasReactiveTrigger(context.recentInput)) {
      return ThoughtPriority.REACTIVE;
    }
    
    // Multiple low stats
    const lowStatCount = [state.hunger, state.energy, state.cleanliness, state.happiness]
      .filter(stat => stat < NEED_THRESHOLD).length;
    if (lowStatCount >= 2) {
      return ThoughtPriority.COMBO;
    }
    
    // Single important need
    if (state.hunger < NEED_THRESHOLD || 
        state.energy < NEED_THRESHOLD || 
        state.cleanliness < NEED_THRESHOLD ||
        state.happiness < NEED_THRESHOLD) {
      return ThoughtPriority.HIGH;
    }
    
    return ThoughtPriority.NORMAL;
  }
  
  // Select category using weighted random with fatigue
  private selectCategory(): ThoughtCategory {
    // Calculate adjusted weights based on fatigue
    const adjustedWeights = {
      need: Math.max(1, WEIGHT_NEEDS * (100 - (this.categoryFatigue.get('need') || 0)) / 100),
      coding: Math.max(1, WEIGHT_CODING * (100 - (this.categoryFatigue.get('coding') || 0)) / 100),
      random: Math.max(1, WEIGHT_RANDOM * (100 - (this.categoryFatigue.get('random') || 0)) / 100),
      mood: Math.max(1, WEIGHT_MOOD * (100 - (this.categoryFatigue.get('mood') || 0)) / 100)
    };
    
    const total = Object.values(adjustedWeights).reduce((a, b) => a + b, 0);
    const roll = Math.random() * total;
    
    let cumulative = 0;
    if (roll < (cumulative += adjustedWeights.need)) return 'need';
    if (roll < (cumulative += adjustedWeights.coding)) return 'coding';
    if (roll < (cumulative += adjustedWeights.random)) return 'random';
    return 'mood';
  }
  
  // Update category fatigue (decay over time)
  private updateFatigue(): void {
    this.categoryFatigue.forEach((value, key) => {
      this.categoryFatigue.set(key, Math.max(0, value - 1));
    });
  }
  
  // Add fatigue when category is used
  private addFatigue(category: ThoughtCategory): void {
    const current = this.categoryFatigue.get(category) || 0;
    this.categoryFatigue.set(category, Math.min(100, current + 30));
  }
  
  // Check if thought is too similar to recent ones
  private isTooSimilar(thought: string): boolean {
    // Check exact duplicates in last 10
    if (this.thoughtHistory.includes(thought)) {
      return true;
    }
    
    // Check for similar topics in last 3
    const recentThoughts = this.thoughtHistory.slice(-3);
    for (const recent of recentThoughts) {
      if (this.areSimilarThoughts(thought, recent)) {
        return true;
      }
    }
    
    return false;
  }
  
  // Check if two thoughts are about the same topic
  private areSimilarThoughts(thought1: string, thought2: string): boolean {
    // Simple similarity check - can be enhanced
    const keywords = ['hungry', 'food', 'tired', 'sleep', 'dirty', 'clean', 'sad', 'happy'];
    
    for (const keyword of keywords) {
      if (thought1.toLowerCase().includes(keyword) && 
          thought2.toLowerCase().includes(keyword)) {
        return true;
      }
    }
    
    return false;
  }
  
  // Add thought to history
  private addToHistory(thought: string): void {
    this.thoughtHistory.push(thought);
    if (this.thoughtHistory.length > 10) {
      this.thoughtHistory.shift();
    }
  }
  
  // Check if input has reactive triggers
  private hasReactiveTrigger(input: string): boolean {
    const triggers = ['error', 'bug', 'fixed', 'success', 'todo', 'delete', '//', 'git'];
    return triggers.some(trigger => input.toLowerCase().includes(trigger));
  }
  
  // Get critical thought for urgent needs
  private getCriticalThought(state: PetState): string {
    // Track escalation for critical needs
    const lowestStat = this.getLowestStat(state);
    const escalation = this.trackEscalation(lowestStat.name);
    
    return NeedThoughts.getThought(state, escalation);
  }
  
  private getLowestStat(state: PetState): {name: string, value: number} {
    const stats = [
      {name: 'hunger', value: state.hunger},
      {name: 'energy', value: state.energy},
      {name: 'cleanliness', value: state.cleanliness},
      {name: 'happiness', value: state.happiness}
    ];
    
    return stats.reduce((min, stat) => 
      stat.value < min.value ? stat : min
    );
  }
  
  private getReactiveThought(input: string, state: PetState): string {
    return CodingThoughts.getReactiveThought(input, state);
  }
  
  private getComboThought(state: PetState): string {
    return ComboThoughts.getThought(state);
  }
  
  private getNormalThought(state: PetState, context?: any): string {
    // Select category and generate appropriate thought
    const category = this.selectCategory();
    this.addFatigue(category);
    
    switch (category) {
      case 'need':
        const escalation = this.trackEscalation('general_need');
        return NeedThoughts.getThought(state, escalation);
        
      case 'coding':
        return CodingThoughts.getObservation(state, state.sessionUpdateCount);
        
      case 'random':
        return RandomThoughts.getThought(state, context);
        
      case 'mood':
        // Mood-based thoughts based on current mood
        return this.getMoodThought(state);
        
      default:
        return RandomThoughts.getSillyThought(state);
    }
  }
  
  private getMoodThought(state: PetState): string {
    switch (state.currentMood) {
      case 'debugging':
        return CodingThoughts.getDebuggingThought(state);
      case 'celebrating':
        return ActionThoughts.getSpecialActionThought('celebrate', state);
      case 'tired':
        return NeedThoughts.getEnergyThought(state.energy, 1);
      case 'focused':
        return CodingThoughts.getCodeQualityThought(state);
      case 'sleeping':
        return ActionThoughts.getSleepingThought(state);
      default:
        return RandomThoughts.getMotivationalThought(state);
    }
  }
  
  private getFallbackThought(state: PetState): string {
    const fallbacks = [
      "Just thinking... 💭",
      "Hi there! 👋",
      "How's the coding going? 💻",
      "I'm here for you! 🤗",
      "*stares at code* 👀"
    ];
    return fallbacks[Math.floor(Math.random() * fallbacks.length)];
  }
  
  // Track escalation for repeated needs
  trackEscalation(topic: string): number {
    const current = this.escalationTracking.get(topic) || 0;
    this.escalationTracking.set(topic, current + 1);
    return current + 1;
  }
  
  // Reset escalation when need is met
  resetEscalation(topic: string): void {
    this.escalationTracking.delete(topic);
  }
  
  // Get action-specific thoughts
  getActionThought(action: string, item?: string, state?: PetState): string {
    if (!state) return '';
    
    switch (action) {
      case 'eating':
        return ActionThoughts.getEatingThought(item || 'food', state);
      case 'playing':
        return ActionThoughts.getPlayingThought(item || 'toy', state);
      case 'bathing':
        const cleanProgress = state.cleanliness;
        return ActionThoughts.getBathingThought(cleanProgress);
      case 'sleeping':
        return ActionThoughts.getSleepingThought(state);
      case 'petting':
        return ActionThoughts.getPettingThought(state);
      case 'waking':
        return ActionThoughts.getWakeUpThought(state);
      case 'training':
        return ActionThoughts.getTrainingThought(item || 'skill');
      case 'medicine':
        return ActionThoughts.getMedicineThought(state);
      default:
        return ActionThoughts.getSpecialActionThought(action, state);
    }
  }
}

// Export a singleton instance
export const thoughtSystem = new ThoughtSystem();