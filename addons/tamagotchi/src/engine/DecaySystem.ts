import { PetState } from './StateManager';
import { config, getWeatherEffects } from '../utils/config';

export class DecaySystem {
  applyDecay(state: PetState): void {
    const now = Date.now();
    const timeSinceLastUpdate = now - state.lastUpdate;
    const minutesElapsed = timeSinceLastUpdate / 60000;
    
    if (minutesElapsed <= 0) return;
    
    // Don't decay while sleeping (except hunger)
    if (state.isAsleep) {
      // Restore energy while sleeping
      state.energy = Math.min(100, state.energy + (minutesElapsed * 2));
      // Still get hungry while sleeping, but slower
      state.hunger = Math.max(0, state.hunger - (config.hungerDecayRate * minutesElapsed * 0.5));
      return;
    }
    
    // Apply base decay rates
    state.hunger = Math.max(0, state.hunger - (config.hungerDecayRate * minutesElapsed));
    state.happiness = Math.max(0, state.happiness - (config.happinessDecayRate * minutesElapsed));
    state.energy = Math.max(0, state.energy - (config.energyDecayRate * minutesElapsed));
    state.cleanliness = Math.max(0, state.cleanliness - (config.cleanlinessDecayRate * minutesElapsed));
    
    // Apply weather effects if enabled
    if (config.enableWeatherEffects) {
      const weatherEffects = getWeatherEffects();
      
      if (weatherEffects.happiness) {
        state.happiness = Math.max(0, Math.min(100, 
          state.happiness + (weatherEffects.happiness * minutesElapsed)));
      }
      
      if (weatherEffects.energy) {
        state.energy = Math.max(0, Math.min(100,
          state.energy + (weatherEffects.energy * minutesElapsed)));
      }
      
      if ((weatherEffects as any).cleanliness) {
        state.cleanliness = Math.max(0, Math.min(100,
          state.cleanliness + ((weatherEffects as any).cleanliness * minutesElapsed)));
      }
    }
    
    // Health is affected by other stats
    this.updateHealth(state);
    
    // Check for sickness
    this.checkSickness(state);
    
    // Update age
    state.age = Math.floor((now - state.birthTime) / 60000);
    
    // Evolution check
    if (config.enableEvolution) {
      this.checkEvolution(state);
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
  }
  
  private checkSickness(state: PetState): void {
    // Get sick if health is too low or cleanliness is too low
    if (state.health < 30 || state.cleanliness < 20) {
      state.isSick = true;
    } else if (state.isSick && state.health > 60 && state.cleanliness > 50) {
      // Recover from sickness
      state.isSick = false;
    }
  }
  
  private checkEvolution(state: PetState): void {
    // Evolution stages based on age and care level
    const hoursOld = state.age / 60;
    const avgCare = (state.happiness + state.hunger + state.energy + state.cleanliness) / 4;
    
    // Calculate care points (good care over time)
    if (avgCare > 70) {
      state.careLevelPoints += 0.1;
    }
    
    // Evolution thresholds
    if (state.evolutionStage === 0 && hoursOld > 1 && state.careLevelPoints > 30) {
      state.evolutionStage = 1; // Baby -> Child
    } else if (state.evolutionStage === 1 && hoursOld > 12 && state.careLevelPoints > 200) {
      state.evolutionStage = 2; // Child -> Teen
    } else if (state.evolutionStage === 2 && hoursOld > 24 && state.careLevelPoints > 500) {
      state.evolutionStage = 3; // Teen -> Adult
    }
  }
  
  // Apply effects after an action completes
  applyActionEffects(state: PetState): void {
    if (!state.pendingAction) return;
    
    const action = state.pendingAction;
    
    switch (action.type) {
      case 'eating':
        state.hunger = Math.min(100, state.hunger + 30);
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
        break;
        
      case 'playing':
        state.happiness = Math.min(100, state.happiness + 20);
        state.energy = Math.max(0, state.energy - 15);
        state.totalPlaySessions++;
        break;
        
      case 'sleeping':
        state.energy = 100;
        state.isAsleep = false;
        break;
        
      case 'bathing':
        state.cleanliness = 100;
        state.happiness = Math.min(100, state.happiness + 5);
        break;
    }
    
    // Clear the pending action
    state.pendingAction = undefined;
  }
}