import { PetState } from '../StateManager';

export class NeedThoughts {
  // Get thought based on need levels with escalation
  static getThought(state: PetState, escalationLevel: number = 1): string {
    // Check which need is lowest
    const needs = {
      hunger: state.hunger,
      energy: state.energy,
      cleanliness: state.cleanliness,
      happiness: state.happiness
    };
    
    const lowestNeed = Object.entries(needs).reduce((min, [key, value]) => 
      value < min.value ? {key, value} : min, {key: 'hunger', value: 100});
    
    switch (lowestNeed.key) {
      case 'hunger':
        return this.getHungerThought(lowestNeed.value, escalationLevel);
      case 'energy':
        return this.getEnergyThought(lowestNeed.value, escalationLevel);
      case 'cleanliness':
        return this.getCleanlinessThought(lowestNeed.value, escalationLevel);
      case 'happiness':
        return this.getHappinessThought(lowestNeed.value, escalationLevel);
      default:
        return "I'm feeling pretty good! 😊";
    }
  }
  
  static getHungerThought(level: number, escalation: number): string {
    // 80-100%: Content
    if (level >= 80) {
      const thoughts = [
        "That last meal was perfect! 😋",
        "Still feeling full and happy!",
        "My belly is satisfied~",
        "No hunger here! 🍽️"
      ];
      return thoughts[Math.floor(Math.random() * thoughts.length)];
    }
    
    // 50-79%: Peckish
    if (level >= 50) {
      const thoughts = [
        "I could go for a snack... 🍪",
        "Is it dinner time yet? 🕐",
        "Something smells good... oh wait, that's just my imagination",
        "A little nibble would be nice",
        "Thinking about food again..."
      ];
      
      if (escalation > 2) {
        return "I've been hinting about food for a while now... 👀";
      }
      return thoughts[Math.floor(Math.random() * thoughts.length)];
    }
    
    // 30-49%: Getting hungry
    if (level >= 30) {
      const thoughts = [
        "I wish I had something to bite... 🥺",
        "My tummy's making weird noises",
        "*stares at you while you code* 👁️👁️",
        "Remember when we had that cookie? Good times...",
        "Getting pretty hungry here...",
        "Food would be really nice right about now"
      ];
      
      if (escalation > 2) {
        return "FEED. ME. PLEASE. 🍖";
      }
      return thoughts[Math.floor(Math.random() * thoughts.length)];
    }
    
    // 10-29%: VERY hungry
    if (level >= 10) {
      const thoughts = [
        "My tummy goes hurt hurt! 😢",
        "I can't think about code, only food",
        "Is that... is that food? No? Okay... 😭",
        "SOS: Send One Snack",
        "I'm fading away from hunger...",
        "This is what starvation feels like"
      ];
      
      if (escalation > 2) {
        return "I see you have time to code but not to feed me... 😤";
      }
      return thoughts[Math.floor(Math.random() * thoughts.length)];
    }
    
    // 0-9%: STARVING
    const criticalThoughts = [
      "I'm wasting away!!! 💀",
      "Tell my mother I loved her...",
      "I'm so hungry I could eat a bug... wait, not THAT kind of bug!",
      "This is it. This is how I perish. From hunger.",
      "ERROR: Food.exe not found",
      "I've forgotten what food tastes like..."
    ];
    
    if (escalation > 3) {
      return "THIS IS MY FINAL HUNGER WARNING ⚠️🍖⚠️";
    }
    return criticalThoughts[Math.floor(Math.random() * criticalThoughts.length)];
  }
  
  static getEnergyThought(level: number, escalation: number): string {
    // 80-100%: Energetic
    if (level >= 80) {
      const thoughts = [
        "I could run a marathon! 🏃",
        "Let's code ALL THE THINGS! 💪",
        "Energy levels: MAXIMUM! ⚡",
        "I feel like I could debug forever!"
      ];
      return thoughts[Math.floor(Math.random() * thoughts.length)];
    }
    
    // 50-79%: Normal energy
    if (level >= 50) {
      const thoughts = [
        "Feeling pretty good! 😊",
        "Ready for whatever!",
        "Got enough energy for more coding",
        "Steady as she goes~"
      ];
      return thoughts[Math.floor(Math.random() * thoughts.length)];
    }
    
    // 30-49%: Getting tired
    if (level >= 30) {
      const thoughts = [
        "*yaaaawn* Sorry, what were we doing? 🥱",
        "My eyelids feel heavy...",
        "Just need a quick power nap...",
        "Getting a bit sleepy here",
        "Coffee would be nice... ☕"
      ];
      
      if (escalation > 2) {
        return "I've been tired for so long... when's nap time? 😴";
      }
      return thoughts[Math.floor(Math.random() * thoughts.length)];
    }
    
    // 10-29%: Exhausted
    if (level >= 10) {
      const thoughts = [
        "Running on fumes here... 😵",
        "I'm seeing double... no wait, that's just your duplicate code",
        "Zzz... huh? I'm awake! 😪",
        "Can barely keep my eyes open",
        "System running on emergency power"
      ];
      
      if (escalation > 2) {
        return "MUST. SLEEP. NOW. 💤";
      }
      return thoughts[Math.floor(Math.random() * thoughts.length)];
    }
    
    // 0-9%: About to collapse
    const criticalThoughts = [
      "I'm literally falling asleep standing... 😴",
      "ERROR: Energy.exe has stopped responding",
      "Must... stay... awa-- *snore*",
      "Systems shutting down...",
      "This is beyond tired, this is exhausted"
    ];
    
    if (escalation > 3) {
      return "EMERGENCY NAP REQUIRED! 🚨😴🚨";
    }
    return criticalThoughts[Math.floor(Math.random() * criticalThoughts.length)];
  }
  
  static getCleanlinessThought(level: number, escalation: number): string {
    // 80-100%: Fresh and clean
    if (level >= 80) {
      const thoughts = [
        "I'm sparkling! ✨",
        "Still smell like soap! 🧼",
        "So fresh and so clean!",
        "Squeaky clean and loving it!"
      ];
      return thoughts[Math.floor(Math.random() * thoughts.length)];
    }
    
    // 50-79%: Getting dusty
    if (level >= 50) {
      const thoughts = [
        "Feeling a bit dusty... 🌪️",
        "Is that a smudge on me?",
        "Could use a little freshening up",
        "Not dirty, just... lived in"
      ];
      return thoughts[Math.floor(Math.random() * thoughts.length)];
    }
    
    // 30-49%: Noticeably dirty
    if (level >= 30) {
      const thoughts = [
        "I'm a stinky boy! 😅",
        "Something smells... oh, it's me",
        "Bath time maybe? Asking for a friend...",
        "Getting pretty grimy here",
        "I've been cleaner..."
      ];
      
      if (escalation > 2) {
        return "Seriously, I need a bath! 🛁";
      }
      return thoughts[Math.floor(Math.random() * thoughts.length)];
    }
    
    // 10-29%: VERY dirty
    if (level >= 10) {
      const thoughts = [
        "I'm basically a dirt monster now 👹",
        "Can't... see... through... the grime...",
        "Even I don't want to smell me",
        "This is embarrassing levels of dirty",
        "I'm growing my own ecosystem"
      ];
      
      if (escalation > 2) {
        return "PLEASE GIVE ME A BATH! 🚿";
      }
      return thoughts[Math.floor(Math.random() * thoughts.length)];
    }
    
    // 0-9%: FILTHY
    const criticalThoughts = [
      "I've become one with the dirt 🦠",
      "Health hazard warning! ☣️",
      "New life forms growing on me...",
      "This is biohazard level dirty",
      "I'm more dirt than pet at this point"
    ];
    
    if (escalation > 3) {
      return "EMERGENCY BATH NEEDED! 🚨🛁🚨";
    }
    return criticalThoughts[Math.floor(Math.random() * criticalThoughts.length)];
  }
  
  static getHappinessThought(level: number, escalation: number): string {
    // 80-100%: Very happy
    if (level >= 80) {
      const thoughts = [
        "Life is good! 😊",
        "I love coding with you! ❤️",
        "Feeling blessed and happy!",
        "This is the best day ever!"
      ];
      return thoughts[Math.floor(Math.random() * thoughts.length)];
    }
    
    // 50-79%: Content
    if (level >= 50) {
      const thoughts = [
        "This is nice 🙂",
        "Another day, another line of code",
        "Feeling pretty okay",
        "Content with life"
      ];
      return thoughts[Math.floor(Math.random() * thoughts.length)];
    }
    
    // 30-49%: Getting sad/bored
    if (level >= 30) {
      const thoughts = [
        "I'm sure missing my frisbee... 🥏",
        "Remember when we used to play?",
        "Feeling a bit lonely... 😔",
        "*sighs dramatically*",
        "Could use some cheering up"
      ];
      
      if (escalation > 2) {
        return "I've been sad for a while now... 😢";
      }
      return thoughts[Math.floor(Math.random() * thoughts.length)];
    }
    
    // 10-29%: Very sad
    if (level >= 10) {
      const thoughts = [
        "Nobody loves me... 😢",
        "What's the point of it all?",
        "I'll just sit here... alone... coding...",
        "Forgotten and unloved",
        "Is this what loneliness feels like?"
      ];
      
      if (escalation > 2) {
        return "Please... just pet me or something... 🥺";
      }
      return thoughts[Math.floor(Math.random() * thoughts.length)];
    }
    
    // 0-9%: Depressed
    const criticalThoughts = [
      "...",
      "*doesn't even want to talk*",
      "Even the bugs feel bad for me",
      "This is rock bottom emotionally",
      "I've given up on happiness"
    ];
    
    if (escalation > 3) {
      return "NEED LOVE NOW! 💔😭💔";
    }
    return criticalThoughts[Math.floor(Math.random() * criticalThoughts.length)];
  }
}