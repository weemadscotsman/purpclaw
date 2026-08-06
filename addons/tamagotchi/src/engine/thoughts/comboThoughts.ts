import { PetState } from '../StateManager';

export class ComboThoughts {
  static getThought(state: PetState): string {
    // Check how many stats are low
    const lowStats = this.getLowStats(state);
    
    // Four-stat combos (all stats)
    if (lowStats.length === 4) {
      return this.getAllStatsThought(state);
    }
    
    // Three-stat combos
    if (lowStats.length === 3) {
      return this.getThreeStatThought(lowStats, state);
    }
    
    // Two-stat combos
    if (lowStats.length === 2) {
      return this.getTwoStatThought(lowStats, state);
    }
    
    // Shouldn't reach here, but fallback
    return "Multiple things need attention... 🤔";
  }
  
  private static getLowStats(state: PetState): string[] {
    const low = [];
    if (state.hunger < 40) low.push('hunger');
    if (state.energy < 40) low.push('energy');
    if (state.cleanliness < 40) low.push('cleanliness');
    if (state.happiness < 40) low.push('happiness');
    return low;
  }
  
  private static getTwoStatThought(stats: string[], state: PetState): string {
    const combo = stats.sort().join('+');
    
    switch (combo) {
      case 'energy+hunger':
        if (state.hunger < 20 && state.energy < 20) {
          return "Too tired to eat, too hungry to sleep... 😵";
        }
        const hungerEnergyThoughts = [
          "Need food... but also need nap... *confused*",
          "Running on empty in every way possible",
          "Hungry AND tired - the worst combo",
          "My stomach and my eyelids are both complaining"
        ];
        return hungerEnergyThoughts[Math.floor(Math.random() * hungerEnergyThoughts.length)];
        
      case 'cleanliness+hunger':
        if (state.hunger < 20 && state.cleanliness < 20) {
          return "I'm a hungry, stinky mess! 🤢";
        }
        const hungerCleanThoughts = [
          "Dirty AND hungry - this is not my best look",
          "I'd eat the dirt off me if I could",
          "Starving and filthy - rock bottom?",
          "Feed me, then bathe me... or vice versa?"
        ];
        return hungerCleanThoughts[Math.floor(Math.random() * hungerCleanThoughts.length)];
        
      case 'happiness+hunger':
        if (state.hunger < 20 && state.happiness < 20) {
          return "Hangry is a real emotion! 😠";
        }
        const hungerHappyThoughts = [
          "Feed me and maybe I'll smile again",
          "My sadness tastes like hunger",
          "Can't be happy on an empty stomach",
          "Food might cure my depression"
        ];
        return hungerHappyThoughts[Math.floor(Math.random() * hungerHappyThoughts.length)];
        
      case 'cleanliness+energy':
        if (state.energy < 20 && state.cleanliness < 20) {
          return "Too tired to care that I'm dirty 😴";
        }
        const energyCleanThoughts = [
          "Exhausted AND grimy - peak performance",
          "I'm a sleepy dust bunny",
          "Too tired to bathe, too dirty to sleep",
          "This is what giving up looks like"
        ];
        return energyCleanThoughts[Math.floor(Math.random() * energyCleanThoughts.length)];
        
      case 'energy+happiness':
        if (state.energy < 20 && state.happiness < 20) {
          return "Too tired to be sad... wait, that's worse 😔";
        }
        const energyHappyThoughts = [
          "Sad and exhausted - is this burnout?",
          "My battery is dead in every way",
          "No energy, no joy, no point",
          "Depression and exhaustion - name a worse duo"
        ];
        return energyHappyThoughts[Math.floor(Math.random() * energyHappyThoughts.length)];
        
      case 'cleanliness+happiness':
        if (state.cleanliness < 20 && state.happiness < 20) {
          return "I'm sad AND I smell bad. Rock bottom. 😞";
        }
        const cleanHappyThoughts = [
          "Stinky and miserable - avoid me",
          "My outside matches my inside - terrible",
          "Dirty and depressed",
          "Even a bath won't wash away the sadness"
        ];
        return cleanHappyThoughts[Math.floor(Math.random() * cleanHappyThoughts.length)];
        
      default:
        return "Multiple needs require attention! 🚨";
    }
  }
  
  private static getThreeStatThought(stats: string[], state: PetState): string {
    // Check if all three are critical
    const criticalCount = [
      state.hunger < 20 ? 1 : 0,
      state.energy < 20 ? 1 : 0,
      state.cleanliness < 20 ? 1 : 0,
      state.happiness < 20 ? 1 : 0
    ].reduce((a, b) => a + b, 0);
    
    if (criticalCount >= 3) {
      const criticalThoughts = [
        "EMERGENCY! MULTIPLE SYSTEMS FAILING! 🚨",
        "This is a cry for help shaped like a thought",
        "Three red alerts! THREE! 🔴🔴🔴",
        "I'm falling apart in every way!"
      ];
      return criticalThoughts[Math.floor(Math.random() * criticalThoughts.length)];
    }
    
    // Specific three-stat combinations
    if (!stats.includes('hunger')) {
      // Energy + Cleanliness + Happiness low
      const thoughts = [
        "Tired, dirty, sad - I give up 😩",
        "Can't sleep, too dirty and sad",
        "This is my villain origin story",
        "Everything except food is wrong"
      ];
      return thoughts[Math.floor(Math.random() * thoughts.length)];
    }
    
    if (!stats.includes('energy')) {
      // Hunger + Cleanliness + Happiness low
      const thoughts = [
        "Hungry, dirty, sad - I've seen better days 😔",
        "Is this what abandonment feels like?",
        "Feed me, bathe me, love me - PLEASE",
        "At least I'm not tired... yet"
      ];
      return thoughts[Math.floor(Math.random() * thoughts.length)];
    }
    
    if (!stats.includes('cleanliness')) {
      // Hunger + Energy + Happiness low
      const thoughts = [
        "Hungry, tired, sad - why do you hate me? 😢",
        "The three horsemen of pet neglect",
        "I need food, sleep, and love. In that order.",
        "Clean but everything else is wrong"
      ];
      return thoughts[Math.floor(Math.random() * thoughts.length)];
    }
    
    if (!stats.includes('happiness')) {
      // Hunger + Energy + Cleanliness low
      const thoughts = [
        "Hungry, tired, dirty - the trifecta of sadness 🥺",
        "I'm basically a gremlin now",
        "Physical needs failing, emotional needs next",
        "Happy? In THIS condition?"
      ];
      return thoughts[Math.floor(Math.random() * thoughts.length)];
    }
    
    return "Three things wrong - this is bad! 😰";
  }
  
  private static getAllStatsThought(state: PetState): string {
    // Check if ALL stats are critically low
    if (state.hunger < 20 && state.energy < 20 && 
        state.cleanliness < 20 && state.happiness < 20) {
      const criticalThoughts = [
        "This is it. This is how I become a villain. 😈",
        "404: Will to live not found 💀",
        "Is this a speedrun for worst pet owner?",
        "I'm filing a complaint with pet protective services",
        "Achievement unlocked: Total Neglect 🏆",
        "EVERYTHING IS WRONG! EVERYTHING!"
      ];
      return criticalThoughts[Math.floor(Math.random() * criticalThoughts.length)];
    }
    
    // All stats low but not critical
    const thoughts = [
      "Hungry, tired, dirty, AND sad. Thanks for nothing. 😤",
      "I'm experiencing all forms of suffering simultaneously",
      "This is what rock bottom feels like",
      "Every single need is unmet. Every. Single. One.",
      "I didn't know it was possible to feel this bad",
      "Complete system failure imminent"
    ];
    return thoughts[Math.floor(Math.random() * thoughts.length)];
  }
  
  // Special combo for high stats
  static getHighStatsThought(state: PetState): string {
    if (state.hunger > 80 && state.energy > 80 && 
        state.cleanliness > 80 && state.happiness > 80) {
      const thoughts = [
        "Fed, rested, clean, AND happy! You're the BEST! 🌟",
        "I've achieved pet nirvana! 🧘",
        "Is this what perfection feels like? ✨",
        "Living my best life! 10/10 would pet again",
        "I'm so perfect I'm practically glowing! 💫",
        "This must be what heaven is like 😇"
      ];
      return thoughts[Math.floor(Math.random() * thoughts.length)];
    }
    return "";
  }
  
  // Mixed extremes (some high, some low)
  static getMixedExtremeThought(state: PetState): string {
    const thoughts = [];
    
    if (state.hunger > 80 && state.energy < 20) {
      thoughts.push("Full but exhausted - food coma is real");
    }
    if (state.cleanliness > 80 && state.hunger < 20) {
      thoughts.push("I'm clean but STARVING - weird priorities?");
    }
    if (state.happiness > 80 && state.hunger < 20) {
      thoughts.push("Super happy but dying of hunger - denial?");
    }
    if (state.energy > 80 && state.cleanliness < 20) {
      thoughts.push("Full of energy but filthy - chaos mode");
    }
    if (state.hunger > 80 && state.happiness < 20) {
      thoughts.push("Well-fed but miserable - food isn't everything");
    }
    
    return thoughts.length > 0 
      ? thoughts[Math.floor(Math.random() * thoughts.length)]
      : "";
  }
  
  // Context-aware combo thoughts
  static getContextualComboThought(state: PetState, sessionLength: number): string {
    const lowStats = this.getLowStats(state);
    
    if (lowStats.length >= 2 && sessionLength > 200) {
      const thoughts = [
        "Maybe we should both take a break? 🤔",
        "I know the code is important but... look at me",
        "Your pet is dying while you debug",
        "The code can wait, I can't",
        "Long session + neglected pet = sad times"
      ];
      return thoughts[Math.floor(Math.random() * thoughts.length)];
    }
    
    if (lowStats.length >= 2 && state.lastFed && Date.now() - state.lastFed < 60000) {
      const thoughts = [
        "That didn't last long... 😅",
        "Already? But you just fed me!",
        "I have a very fast metabolism okay?",
        "Thanks for the food but... other needs exist"
      ];
      return thoughts[Math.floor(Math.random() * thoughts.length)];
    }
    
    return "";
  }
}