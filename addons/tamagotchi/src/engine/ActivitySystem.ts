import { PetState } from './StateManager';
import { config, getWeatherEffects } from '../utils/config';
import { thoughtSystem } from './ThoughtSystem';

const SESSION_GAP_THRESHOLD = 5 * 60 * 1000; // 5 minutes = new session
const UPDATE_DECAY_INTERVAL = parseInt(process.env.PET_DECAY_INTERVAL || '20'); // Every N updates, decay stats (default 20)
const HUNGER_DECAY_RATE = parseFloat(process.env.PET_HUNGER_DECAY || '3'); // Hunger decay per interval
const ENERGY_DECAY_RATE = parseFloat(process.env.PET_ENERGY_DECAY || '2.5'); // Energy decay per interval
const CLEANLINESS_DECAY_RATE = parseFloat(process.env.PET_CLEAN_DECAY || '2'); // Cleanliness decay per interval
const SLEEP_RECOVERY_RATE = parseFloat(process.env.PET_SLEEP_RECOVERY || '3'); // Energy recovery per update when sleeping (default 3%)

export class ActivitySystem {
  
  // Check if this is a new session
  private isNewSession(state: PetState): boolean {
    const now = Date.now();
    const timeSinceLastUpdate = now - state.lastUpdateTimestamp;
    return timeSinceLastUpdate > SESSION_GAP_THRESHOLD;
  }
  
  // Calculate activity intensity (updates per minute)
  private calculateActivityIntensity(state: PetState): number {
    const now = Date.now();
    const recentUpdates = state.recentUpdateTimestamps.filter(
      t => now - t < 60000 // Last minute
    );
    return recentUpdates.length;
  }
  
  // Apply activity-based updates
  applyActivityUpdate(state: PetState): void {
    const now = Date.now();
    
    // Check for new session
    if (this.isNewSession(state)) {
      this.handleNewSession(state);
      return;
    }
    
    // Update session counters
    state.sessionUpdateCount++;
    state.totalUpdateCount++;
    state.lastUpdateTimestamp = now;
    
    // Track recent updates for intensity calculation
    state.recentUpdateTimestamps.push(now);
    if (state.recentUpdateTimestamps.length > 30) {
      state.recentUpdateTimestamps.shift();
    }
    
    // Toggle breathing animation
    state.breathingState = !state.breathingState;
    
    // Apply sleep recovery every update if sleeping, otherwise decay at intervals
    if (state.isAsleep) {
      // Restore energy using configurable rate (default 3% per update)
      state.energy = Math.min(100, state.energy + SLEEP_RECOVERY_RATE);
      
      // Still apply some decay every N updates (slower when sleeping)
      if (state.sessionUpdateCount % UPDATE_DECAY_INTERVAL === 0) {
        state.hunger = Math.max(0, state.hunger - HUNGER_DECAY_RATE * 0.5);
        state.cleanliness = Math.max(0, state.cleanliness - CLEANLINESS_DECAY_RATE * 0.3);
      }
      
      // Check if fully rested
      if (state.energy >= 100) {
        state.isAsleep = false;
        state.systemMessage = `${state.name} woke up fully rested! 🌟`;
        state.messageTimestamp = Date.now();
      }
    } else if (state.sessionUpdateCount % UPDATE_DECAY_INTERVAL === 0) {
      this.applyActivityDecay(state);
    }
    
    // Update mood based on activity
    this.updateMood(state);
    
    // Handle milestones
    this.checkMilestones(state);
    
    // Update health based on other stats
    this.updateHealth(state);
    
    // Generate thoughts periodically
    this.updateThoughts(state);
  }
  
  private updateThoughts(state: PetState): void {
    const now = Date.now();
    const MIN_THOUGHT_DURATION = parseInt(process.env.PET_THOUGHT_MIN_DURATION || '3000'); // Default 3 seconds
    const THOUGHT_UPDATE_INTERVAL = parseInt(process.env.PET_THOUGHT_UPDATE_INTERVAL || '1'); // Default every session
    
    // Check if it's a new session
    const isNewSession = state.sessionUpdateCount === 1;
    
    // Check if enough time has passed since last thought
    const timeSinceLastThought = now - (state.thoughtTimestamp || 0);
    const shouldUpdateByTime = timeSinceLastThought >= MIN_THOUGHT_DURATION;
    
    // Check if enough updates have passed
    const updatesSinceLastThought = state.totalUpdateCount - (state.lastThoughtUpdate || 0);
    const shouldUpdateByInterval = updatesSinceLastThought >= THOUGHT_UPDATE_INTERVAL;
    
    // Only update thought if: new session OR (enough time passed AND enough updates)
    if (!isNewSession && (!shouldUpdateByTime || !shouldUpdateByInterval)) {
      return; // Don't update thought yet
    }
    
    // Generate a new thought based on current state
    const context = {
      recentInput: state.recentKeywords.join(' '),
      sessionData: {
        sessionLength: state.sessionUpdateCount,
        totalUpdates: state.totalUpdateCount
      }
    };
    
    const thought = thoughtSystem.generateThought(state, context);
    
    if (thought) {
      state.currentThought = thought;
      state.thoughtTimestamp = now;
      state.lastThoughtUpdate = state.totalUpdateCount;
      
      // Add to thought history
      if (!state.thoughtHistory) {
        state.thoughtHistory = [];
      }
      state.thoughtHistory.push(thought);
      if (state.thoughtHistory.length > 10) {
        state.thoughtHistory.shift();
      }
    }
  }
  
  private handleNewSession(state: PetState): void {
    const now = Date.now();
    const sessionGap = now - state.lastUpdateTimestamp;
    
    // Pet was sleeping - apply recovery
    if (sessionGap > SESSION_GAP_THRESHOLD) {
      // Restore energy during sleep
      const sleepHours = Math.min(8, sessionGap / (1000 * 60 * 60));
      state.energy = Math.min(100, state.energy + (sleepHours * 10));
      
      // Slight happiness boost from rest
      state.happiness = Math.min(100, state.happiness + 5);
      
      // Mark as new session
      state.previousSessionEnd = state.lastUpdateTimestamp;
      state.sessionStartTime = now;
      state.sessionUpdateCount = 0;
      state.sessionsToday++;
      
      // Wake up from sleep
      if (state.isAsleep) {
        state.isAsleep = false;
      }
      
      // Reset mood for new session
      state.currentMood = 'normal';
    }
    
    state.lastUpdateTimestamp = now;
    state.sessionUpdateCount++;
    state.totalUpdateCount++;
  }
  
  private applyActivityDecay(state: PetState): void {
    const intensity = this.calculateActivityIntensity(state);
    
    // Normal decay when awake
    state.hunger = Math.max(0, state.hunger - HUNGER_DECAY_RATE);
    state.energy = Math.max(0, state.energy - ENERGY_DECAY_RATE);
    state.cleanliness = Math.max(0, state.cleanliness - CLEANLINESS_DECAY_RATE);
    
    // Intensity-based additional decay
    if (intensity > 20) {
      // Intense coding - more energy and hunger drain
      state.energy = Math.max(0, state.energy - 1.5);
      state.hunger = Math.max(0, state.hunger - 1);
      state.cleanliness = Math.max(0, state.cleanliness - 0.5); // Gets dirtier faster when active
    } else if (intensity > 10) {
      // Active coding
      state.energy = Math.max(0, state.energy - 0.5);
      state.hunger = Math.max(0, state.hunger - 0.5);
    }
    
    // Happiness changes based on session length
    if (state.sessionUpdateCount < 100) {
      // Early in session - happy to code
      state.happiness = Math.min(100, state.happiness + 0.5);
    } else if (state.sessionUpdateCount > 300) {
      // Long session - getting tired
      state.happiness = Math.max(0, state.happiness - 0.5);
    }
    
    // Extra cleanliness decay if pet is sick
    if (state.isSick) {
      state.cleanliness = Math.max(0, state.cleanliness - 1);
    }
    
    // Apply weather effects if enabled
    if (config.enableWeatherEffects) {
      const weatherEffects = getWeatherEffects();
      if (weatherEffects.happiness) {
        state.happiness = Math.max(0, Math.min(100, 
          state.happiness + weatherEffects.happiness));
      }
      if (weatherEffects.energy) {
        state.energy = Math.max(0, Math.min(100,
          state.energy + weatherEffects.energy));
      }
    }
  }
  
  private updateMood(state: PetState): void {
    const intensity = this.calculateActivityIntensity(state);
    
    // Check for special moods first
    if (state.energy < 20) {
      state.currentMood = 'tired';
    } else if (state.sessionUpdateCount > 200) {
      state.currentMood = 'focused';
    } else if (intensity > 20) {
      state.currentMood = 'focused';
    } else if (state.happiness > 80 && state.hunger > 50) {
      state.currentMood = 'normal';
    } else if (state.hunger < 30) {
      state.currentMood = 'tired';
    } else {
      state.currentMood = 'normal';
    }
  }
  
  private checkMilestones(state: PetState): void {
    // Celebrate every 100 updates
    if (state.sessionUpdateCount > 0 && state.sessionUpdateCount % 100 === 0) {
      state.currentMood = 'celebrating';
      state.happiness = Math.min(100, state.happiness + 5);
      
      // Add care points for good session
      state.careLevelPoints += 1;
    }
    
    // Marathon coding session
    if (state.sessionUpdateCount === 200) {
      state.currentMood = 'focused';
      // Achievement unlocked!
    }
  }
  
  private updateHealth(state: PetState): void {
    // Health is derived from other stats
    const avgStats = (state.happiness + state.hunger + state.energy + state.cleanliness) / 4;
    
    // Health tends toward average of other stats
    const healthTarget = avgStats;
    const healthDiff = healthTarget - state.health;
    
    // Gradually adjust health
    state.health = Math.max(0, Math.min(100, 
      state.health + (healthDiff * 0.1)));
    
    // Check for sickness
    if (state.health < 30 || state.cleanliness < 20) {
      state.isSick = true;
    } else if (state.isSick && state.health > 60 && state.cleanliness > 50) {
      state.isSick = false;
    }
  }
  
  // Apply effects after an action completes
  applyActionEffects(state: PetState): void {
    if (!state.pendingAction) return;
    
    const action = state.pendingAction;
    
    switch (action.type) {
      case 'eating':
        // Eating gives bigger boost during intense coding
        const intensity = this.calculateActivityIntensity(state);
        const hungerBoost = intensity > 15 ? 40 : 30;
        
        state.hunger = Math.min(100, state.hunger + hungerBoost);
        state.happiness = Math.min(100, state.happiness + 10);
        state.totalFeedings++;
        
        if (action.item) {
          state.foodEaten.push(action.item);
          // Track favorite food
          const foodCounts: Record<string, number> = {};
          state.foodEaten.forEach(food => {
            foodCounts[food] = (foodCounts[food] || 0) + 1;
          });
          state.favoriteFood = Object.keys(foodCounts).reduce((a, b) => 
            foodCounts[a] > foodCounts[b] ? a : b);
        }
        
        // Generate eating thought
        const eatingThought = thoughtSystem.getActionThought('eating', action.item, state);
        if (eatingThought) {
          state.currentThought = eatingThought;
          state.thoughtTimestamp = Date.now();
        }
        break;
        
      case 'playing':
        // Playing during long sessions gives more happiness
        const playBoost = state.sessionUpdateCount > 100 ? 25 : 20;
        state.happiness = Math.min(100, state.happiness + playBoost);
        state.energy = Math.max(0, state.energy - 10);
        state.totalPlaySessions++;
        
        // Generate playing thought
        const playingThought = thoughtSystem.getActionThought('playing', action.item, state);
        if (playingThought) {
          state.currentThought = playingThought;
          state.thoughtTimestamp = Date.now();
        }
        break;
        
      case 'sleeping':
        state.energy = 100;
        state.isAsleep = false;
        
        // Generate waking thought
        const wakingThought = thoughtSystem.getActionThought('waking', undefined, state);
        if (wakingThought) {
          state.currentThought = wakingThought;
          state.thoughtTimestamp = Date.now();
        }
        break;
        
      case 'bathing':
        state.cleanliness = 100;
        state.happiness = Math.min(100, state.happiness + 5);
        
        // Generate bathing complete thought
        const bathingThought = thoughtSystem.getActionThought('bathing', undefined, state);
        if (bathingThought) {
          state.currentThought = bathingThought;
          state.thoughtTimestamp = Date.now();
        }
        break;
    }
    
    // Clear the pending action
    state.pendingAction = undefined;
  }
  
  // Detect keywords in conversation for mood changes
  detectKeywords(state: PetState, input: string): void {
    const lowerInput = input.toLowerCase();
    
    // Add to recent keywords
    state.recentKeywords.push(lowerInput);
    if (state.recentKeywords.length > 10) {
      state.recentKeywords.shift();
    }
    
    // Check for debugging keywords
    if (lowerInput.includes('error') || lowerInput.includes('bug') || 
        lowerInput.includes('issue') || lowerInput.includes('problem')) {
      state.currentMood = 'debugging';
    }
    
    // Check for success keywords
    if (lowerInput.includes('fixed') || lowerInput.includes('works') || 
        lowerInput.includes('success') || lowerInput.includes('done')) {
      state.currentMood = 'celebrating';
      state.happiness = Math.min(100, state.happiness + 3);
    }
    
    // Check for question
    if (lowerInput.includes('?')) {
      // Pet is curious when you're asking questions
      state.microAnimationFrame = 1; // Tilt head
    }
  }
}