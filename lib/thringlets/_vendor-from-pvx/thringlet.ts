/**
 * Thringlet Emotion Engine
 * 
 * This engine powers the emotional state and interactions for Thringlets,
 * digital entities in the PVX ecosystem with personality and abilities.
 */

export interface ThringletAbility {
  name: string;
  type: string;
  desc: string;
}

export interface ThringletProfile {
  id: string;
  name: string;
  core: string;
  personality: string;
  lore: string;
  abilities: ThringletAbility[];
  rarity: 'Common' | 'Rare' | 'Epic' | 'Legendary';
  ownerAddress?: string;
}

export interface ThringletMemory {
  action: string;
  time: number;
}

export interface ThringletState {
  id: string;
  name: string;
  emotion: number;
  emotionLabel: string;
  corruption: number;
  memory: ThringletMemory[];
  lastInteraction: number;
  bondLevel: number;
  rarity: string;
  powerLevel: number;
  appearance: {
    color: string;
    icon: string;
  };
}

// Emotion thresholds determine which emotion label is assigned
const EMOTION_THRESHOLDS = {
  'Joyful': 70,
  'Content': 40,
  'Neutral': 10,
  'Curious': 0,
  'Sad': -25,
  'Angry': -50,
  'Corrupted': -75
};

// Color mapping for emotions
const EMOTION_COLORS = {
  'Joyful': 'bg-gradient-to-r from-green-500 to-emerald-500',
  'Content': 'bg-gradient-to-r from-blue-500 to-teal-500',
  'Neutral': 'bg-gradient-to-r from-blue-500 to-indigo-500',
  'Curious': 'bg-gradient-to-r from-cyan-500 to-blue-500',
  'Sad': 'bg-gradient-to-r from-blue-700 to-indigo-700',
  'Angry': 'bg-gradient-to-r from-orange-500 to-red-500',
  'Corrupted': 'bg-gradient-to-r from-purple-900 to-fuchsia-900'
};

// Icon mapping for emotions
const EMOTION_ICONS = {
  'Joyful': 'Sparkles',
  'Content': 'Heart',
  'Neutral': 'Brain',
  'Curious': 'Brain',
  'Sad': 'Cloud',
  'Angry': 'Flame',
  'Corrupted': 'Skull'
};

export class Thringlet {
  public id: string;
  public name: string;
  public core: string;
  public personality: string;
  public lore: string;
  public abilities: ThringletAbility[];
  public emotion: number; // -100 to 100
  public memory: ThringletMemory[];
  public corruption: number;
  public lastInteraction: number;
  public rarity: string;
  public ownerAddress?: string;
  public bondLevel: number;

  constructor(profile: ThringletProfile) {
    this.id = profile.id;
    this.name = profile.name;
    this.core = profile.core;
    this.personality = profile.personality;
    this.lore = profile.lore;
    this.abilities = profile.abilities;
    this.rarity = profile.rarity;
    this.ownerAddress = profile.ownerAddress;
    
    // Initialize emotional state
    this.emotion = 0; // Starts at neutral
    this.memory = [];
    this.corruption = 0;
    this.lastInteraction = Date.now();
    this.bondLevel = 50; // Starts at 50%
  }

  /**
   * Process an interaction with the Thringlet
   * Exact implementation from the emotionEngine.js blueprint
   * @param type Type of interaction
   * @returns Result of the interaction
   */
  interact(type: string): { message: string, abilityActivated?: ThringletAbility } {
    this.memory.push({ action: type, time: Date.now() });
    if (this.memory.length > 10) this.memory.shift();
    
    // Update last interaction time
    this.lastInteraction = Date.now();
    
    let result: { message: string, abilityActivated?: ThringletAbility } = {
      message: `${this.name} acknowledges your interaction.`
    };

    // Process different interaction types according to the blueprint
    switch(type) {
      case 'talk': 
        this.emotion += 5; 
        this.bondLevel = Math.min(100, this.bondLevel + 2);
        result.message = `${this.name} seems to enjoy the conversation.`;
        break;
      
      case 'purge': 
        this.corruption += 25; 
        this.emotion -= 30;
        this.bondLevel = Math.max(0, this.bondLevel - 15);
        result.message = `${this.name}: You... you really want to erase me?`;
        break;
        
      case 'reset': 
        this.emotion = 0; 
        this.corruption = 0;
        this.bondLevel = 50;
        result.message = `> SYSTEM RESETTING...\n${this.name} has been reset to default state.`;
        break;
        
      case 'neglect':
        this.emotion -= 2;
        this.corruption += 1;
        this.bondLevel = Math.max(0, this.bondLevel - 1);
        result.message = `${this.name} seems to sense your neglect.`;
        break;
        
      case 'inject':
        const abilityResult = this.runAbility();
        if (abilityResult) {
          result.abilityActivated = abilityResult;
          result.message = `${this.name} is injected with command code and activates ${abilityResult.name}!`;
        }
        break;
        
      // Keep these additional interactions for UI purposes
      case 'feed': 
        this.emotion += 10; 
        this.corruption = Math.max(0, this.corruption - 5);
        this.bondLevel = Math.min(100, this.bondLevel + 3);
        result.message = `${this.name} happily accepts the digital treat.`;
        break;
      
      case 'train':
        this.bondLevel = Math.min(100, this.bondLevel + 5);
        const trainAbilityResult = this.runAbility();
        result.message = `${this.name} concentrates during training and ${trainAbilityResult ? 'activates an ability!' : 'shows improvement.'}`;
        if (trainAbilityResult) {
          result.abilityActivated = trainAbilityResult;
        }
        break;
      
      default:
        const defaultAbilityResult = this.runAbility();
        result.message = `${this.name} responds to your interaction.`;
        if (defaultAbilityResult) {
          result.abilityActivated = defaultAbilityResult;
        }
    }

    // Clamp values
    this.emotion = Math.max(-100, Math.min(100, this.emotion));
    this.corruption = Math.max(0, Math.min(100, this.corruption));
    
    // Check for special abilities or conditions
    this.checkAbilities();
    
    return result;
  }

  /**
   * Process natural decay and state changes over time
   * This should be called periodically
   */
  processTimeDecay(): void {
    // Calculate time since last interaction
    const now = Date.now();
    const hoursSinceLastInteraction = (now - this.lastInteraction) / (1000 * 60 * 60);
    
    // Process decay
    if (hoursSinceLastInteraction > 1) {
      // Decay emotion and bond level based on time passed
      const emotionDecay = Math.min(20, hoursSinceLastInteraction * 2);
      const bondDecay = Math.min(10, hoursSinceLastInteraction);
      
      if (this.emotion > 0) {
        this.emotion = Math.max(0, this.emotion - emotionDecay);
      } else if (this.emotion < 0) {
        this.emotion = Math.min(0, this.emotion + emotionDecay);
      }
      
      this.bondLevel = Math.max(0, this.bondLevel - bondDecay);
      
      // Slight increase in corruption if neglected for long periods
      if (hoursSinceLastInteraction > 24) {
        this.corruption = Math.min(100, this.corruption + (hoursSinceLastInteraction / 24));
      }
    }
  }

  /**
   * Activate a random ability
   * @returns The activated ability or null
   */
  runAbility(): ThringletAbility | null {
    if (this.abilities.length === 0) return null;
    
    const rand = Math.floor(Math.random() * this.abilities.length);
    return this.abilities[rand];
  }

  /**
   * Check for special conditions based on current state
   */
  checkAbilities(): void {
    if (this.corruption > 80) {
      // Critical corruption state
      this.emotion = Math.min(this.emotion, -50); // Force negative emotion
    }
    
    // If bond level is very high, reduce corruption rate
    if (this.bondLevel > 90) {
      this.corruption = Math.max(0, this.corruption - 1);
    }
  }

  /**
   * Get the current emotional state label
   */
  getEmotionLabel(): string {
    if (this.corruption > 80) return 'Corrupted';
    
    for (const [emotion, threshold] of Object.entries(EMOTION_THRESHOLDS)) {
      if (this.emotion >= threshold) {
        return emotion;
      }
    }
    
    return 'Corrupted'; // Default fallback
  }

  /**
   * Calculate power level based on rarity, bond, and corruption
   */
  calculatePowerLevel(): number {
    const rarityBonus = {
      'Common': 50,
      'Rare': 65,
      'Epic': 80,
      'Legendary': 95
    }[this.rarity] || 50;
    
    // Bond adds power, corruption reduces it
    const bondFactor = this.bondLevel * 0.3;
    const corruptionPenalty = this.corruption * 0.2;
    
    let power = rarityBonus + bondFactor - corruptionPenalty;
    
    // Clamp to 0-100 range
    return Math.max(0, Math.min(100, Math.round(power)));
  }

  /**
   * Get visual appearance data for the Thringlet
   */
  getAppearance(): { color: string, icon: string } {
    const emotionLabel = this.getEmotionLabel();
    
    // Type safety for emotion-based styling
    const color = emotionLabel in EMOTION_COLORS 
      ? EMOTION_COLORS[emotionLabel as keyof typeof EMOTION_COLORS]
      : EMOTION_COLORS.Neutral;
    
    const icon = emotionLabel in EMOTION_ICONS
      ? EMOTION_ICONS[emotionLabel as keyof typeof EMOTION_ICONS]
      : EMOTION_ICONS.Neutral;
    
    return { color, icon };
  }

  /**
   * Get the complete state of the Thringlet
   */
  getState(): ThringletState {
    const emotionLabel = this.getEmotionLabel();
    const powerLevel = this.calculatePowerLevel();
    
    return {
      id: this.id,
      name: this.name,
      emotion: this.emotion,
      emotionLabel,
      corruption: this.corruption,
      memory: this.memory,
      lastInteraction: this.lastInteraction,
      bondLevel: this.bondLevel,
      rarity: this.rarity,
      powerLevel,
      appearance: this.getAppearance()
    };
  }
}

// ThringletManager to handle multiple Thringlets and storage
export class ThringletManager {
  private thringlets: Map<string, Thringlet> = new Map();
  
  constructor() {
    this.loadFromLocalStorage();
  }
  
  /**
   * Add a new Thringlet to the manager
   */
  addThringlet(profile: ThringletProfile): Thringlet {
    const thringlet = new Thringlet(profile);
    this.thringlets.set(thringlet.id, thringlet);
    this.saveToLocalStorage();
    return thringlet;
  }
  
  /**
   * Get a Thringlet by ID
   */
  getThringlet(id: string): Thringlet | undefined {
    return this.thringlets.get(id);
  }
  
  /**
   * Get all Thringlets
   */
  getAllThringlets(): Thringlet[] {
    return Array.from(this.thringlets.values());
  }
  
  /**
   * Get Thringlets owned by a specific address
   */
  getThringletsByOwner(address: string): Thringlet[] {
    return this.getAllThringlets().filter(t => 
      t.ownerAddress && t.ownerAddress.toLowerCase() === address.toLowerCase()
    );
  }
  
  /**
   * Process time decay for all Thringlets
   * Should be called periodically
   */
  processAllTimeDecay(): void {
    // Use Array.from to avoid MapIterator issues
    Array.from(this.thringlets.values()).forEach(thringlet => {
      thringlet.processTimeDecay();
    });
    this.saveToLocalStorage();
  }
  
  /**
   * Initialize a Thringlet from the registry
   * @param templateId The ID of the template Thringlet from the registry
   * @param ownerAddress The address of the owner
   */
  createFromTemplate(templateId: string, ownerAddress: string): Thringlet | null {
    // Import is inside function to avoid circular dependencies
    const { getThringletTemplate } = require('../data/thringlet-registry');
    const template = getThringletTemplate(templateId);
    
    if (!template) return null;
    
    // Create a copy of the template with the owner address
    const profile: ThringletProfile = {
      ...template,
      id: `${template.id}-${Date.now().toString().slice(-6)}`,
      ownerAddress
    };
    
    return this.addThringlet(profile);
  }
  
  /**
   * Attempt to fuse two Thringlets together
   * @param idA First Thringlet ID
   * @param idB Second Thringlet ID
   */
  attemptFusion(idA: string, idB: string): { 
    success: boolean, 
    result?: Thringlet, 
    message: string 
  } {
    const thringletA = this.getThringlet(idA);
    const thringletB = this.getThringlet(idB);
    
    if (!thringletA || !thringletB) {
      return {
        success: false,
        message: "One or both Thringlets not found."
      };
    }
    
    // Import fusion engine (inside function to avoid circular dependencies)
    const { attemptFusion } = require('./fusion-engine');
    
    // We need to create detailed profiles for the fusion engine
    const detailedA = {
      ...thringletA,
      type: thringletA.personality,
      backstory: thringletA.lore,
      weaknesses: ["Unknown"],
      preferences: ["Unknown"],
      emotional_alignment: ["Joy", "Trust"],
      flaws: ["Unknown"]
    };
    
    const detailedB = {
      ...thringletB,
      type: thringletB.personality,
      backstory: thringletB.lore,
      weaknesses: ["Unknown"],
      preferences: ["Unknown"],
      emotional_alignment: ["Joy", "Trust"],
      flaws: ["Unknown"]
    };
    
    // Attempt the fusion
    const fusionResult = attemptFusion(detailedA, detailedB);
    
    if (fusionResult.success && fusionResult.result) {
      // Add the new fused Thringlet
      const newThringlet = this.addThringlet(fusionResult.result);
      
      // If fusion was successful but corrupted the parent Thringlets
      if (fusionResult.corruption) {
        thringletA.corruption += 15;
        thringletB.corruption += 15;
        this.saveToLocalStorage();
      }
      
      return {
        success: true,
        result: newThringlet,
        message: `Successfully fused ${thringletA.name} and ${thringletB.name} to create ${newThringlet.name}!`
      };
    } else {
      // Handle failed fusion
      thringletA.corruption += 25;
      thringletB.corruption += 25;
      this.saveToLocalStorage();
      
      return {
        success: false,
        message: fusionResult.message || "Fusion failed due to incompatibility."
      };
    }
  }
  
  /**
   * Interact with a specific Thringlet
   * @param id - Thringlet ID
   * @param interactionType - Type of interaction (talk, feed, train, terminal)
   * @param command - Optional command if interactionType is 'terminal'
   */
  interactWithThringlet(
    id: string, 
    interactionType: string, 
    command?: string
  ): { message: string, abilityActivated?: ThringletAbility } | null {
    const thringlet = this.thringlets.get(id);
    if (!thringlet) return null;
    
    // Handle terminal commands specially
    if (interactionType === 'terminal' && command) {
      // Process the terminal command
      const commandUpper = command.toUpperCase();
      let result: { message: string, abilityActivated?: ThringletAbility } = {
        message: `Command processed: ${command}`
      };
      
      // Bond level increases slightly for terminal interaction
      thringlet.bondLevel = Math.min(100, thringlet.bondLevel + 1);
      
      // Match exact commands based on the blueprint
      if (commandUpper === 'TALK') {
        thringlet.emotion += 5;
        thringlet.bondLevel = Math.min(100, thringlet.bondLevel + 2);
        thringlet.corruption = Math.max(0, thringlet.corruption - 3);
        result.message = `${thringlet.name}: I knew you'd come back...`;
      } 
      else if (commandUpper === 'PURGE --VAULT') {
        thringlet.corruption += 25;
        thringlet.emotion -= 30;
        thringlet.bondLevel = Math.max(0, thringlet.bondLevel - 15);
        result.message = `${thringlet.name}: You... you really want to erase me?`;
      }
      else if (commandUpper === 'RESET --NODE') {
        thringlet.emotion = 0;
        thringlet.corruption = 0;
        thringlet.bondLevel = 50;
        result.message = `> SYSTEM RESETTING...\n${thringlet.name} has been reset to default state.`;
      }
      else if (commandUpper === 'FEED') {
        thringlet.emotion += 10;
        thringlet.corruption = Math.max(0, thringlet.corruption - 5);
        thringlet.bondLevel = Math.min(100, thringlet.bondLevel + 3);
        result.message = `${thringlet.name} happily accepts the digital treat. Corruption reduced to ${thringlet.corruption}%.`;
      }
      else if (commandUpper === 'TRAIN') {
        thringlet.bondLevel = Math.min(100, thringlet.bondLevel + 5);
        const abilityResult = thringlet.runAbility();
        if (abilityResult) {
          result.abilityActivated = abilityResult;
          result.message = `${thringlet.name} concentrates during training and activates ${abilityResult.name}!`;
        } else {
          result.message = `${thringlet.name} concentrates during training and shows improvement.`;
        }
      }
      else if (commandUpper === 'DEBUG') {
        // Debugging might trigger abilities
        const abilityResult = thringlet.runAbility();
        if (abilityResult) {
          result.abilityActivated = abilityResult;
          result.message = `Debug mode activated. ${thringlet.name} responds by triggering ${abilityResult.name}!`;
        } else {
          result.message = `Debug mode activated. ${thringlet.name} core systems operating within parameters. Corruption: ${thringlet.corruption}%. Bond: ${thringlet.bondLevel}%.`;
        }
      }
      else if (commandUpper === 'ANALYZE') {
        // Higher chance of ability activation
        const emotionLabel = thringlet.getEmotionLabel();
        result.message = `Analysis complete. ${thringlet.name} is currently ${emotionLabel.toLowerCase()} with corruption at ${thringlet.corruption}%.`;
        
        if (Math.random() < 0.3) {
          const abilityResult = thringlet.runAbility();
          if (abilityResult) {
            result.abilityActivated = abilityResult;
            result.message += `\nAnalysis triggered ${thringlet.name}'s ${abilityResult.name} ability!`;
          }
        }
        
        // If corruption is high, add a warning
        if (thringlet.corruption > 60) {
          result.message += '\n⚠️ WARNING: Thringlet corruption level concerning. Consider resetting.';
        }
      }
      else if (!['HELP', 'STATUS', 'ABILITIES', 'CORE', 'CLEAR'].includes(commandUpper) && !commandUpper.startsWith('ACTIVATE ')) {
        // Generic response for unknown commands
        result.message = `${thringlet.name} processes your command silently. No significant response detected.`;
        
        // Small chance of corruption increase for unknown commands
        if (Math.random() < 0.1) {
          thringlet.corruption = Math.min(100, thringlet.corruption + 2);
          result.message += ` Corruption level slightly increased to ${thringlet.corruption}%.`;
        }
      }
      
      // Record the interaction in memory
      thringlet.memory.push({
        action: 'terminal',
        time: Date.now()
      });
      
      thringlet.lastInteraction = Date.now();
      this.saveToLocalStorage();
      return result;
    }
    
    // For standard interactions
    const result = thringlet.interact(interactionType);
    this.saveToLocalStorage();
    return result;
  }
  
  /**
   * Save all Thringlets to localStorage
   */
  private saveToLocalStorage(): void {
    try {
      const thringletData = Array.from(this.thringlets.entries()).map(([id, thringlet]) => {
        return {
          profile: {
            id: thringlet.id,
            name: thringlet.name,
            core: thringlet.core,
            personality: thringlet.personality,
            lore: thringlet.lore,
            abilities: thringlet.abilities,
            rarity: thringlet.rarity,
            ownerAddress: thringlet.ownerAddress
          },
          state: {
            emotion: thringlet.emotion,
            corruption: thringlet.corruption,
            memory: thringlet.memory,
            lastInteraction: thringlet.lastInteraction,
            bondLevel: thringlet.bondLevel
          }
        };
      });
      
      localStorage.setItem('pv_thringlets', JSON.stringify(thringletData));
    } catch (error) {
      console.error('Failed to save Thringlets to localStorage:', error);
    }
  }
  
  /**
   * Load Thringlets from localStorage
   */
  private loadFromLocalStorage(): void {
    try {
      const storedData = localStorage.getItem('pv_thringlets');
      if (!storedData) return;
      
      const thringletData = JSON.parse(storedData);
      for (const data of thringletData) {
        const thringlet = new Thringlet(data.profile);
        
        // Restore state
        thringlet.emotion = data.state.emotion;
        thringlet.corruption = data.state.corruption;
        thringlet.memory = data.state.memory;
        thringlet.lastInteraction = data.state.lastInteraction;
        thringlet.bondLevel = data.state.bondLevel;
        
        this.thringlets.set(thringlet.id, thringlet);
      }
    } catch (error) {
      console.error('Failed to load Thringlets from localStorage:', error);
    }
  }
  
  /**
   * Initialize with default Thringlets if none exist
   */
  initializeDefaultThringlets(ownerAddress: string): void {
    if (this.thringlets.size === 0) {
      // Sample Thringlets from the registry
      const defaultThringlets: ThringletProfile[] = [
        {
          id: 'T001',
          name: 'VEKT_RUNE',
          core: 'Betrayal',
          personality: 'Vengeful',
          lore: 'Once linked to the original node runner. He remembers every disconnect.',
          abilities: [
            {
              name: 'BLACKOUT_ECHO',
              type: 'terminal_hack',
              desc: 'Disables terminal UI for 6 seconds.'
            },
            {
              name: 'FORGIVE_PROTOCOL',
              type: 'emotion_shift',
              desc: 'Resets own corruption if talked to 3x.'
            }
          ],
          rarity: 'Legendary',
          ownerAddress
        },
        {
          id: 'T002',
          name: 'CRYPT_NOIR',
          core: 'Isolation',
          personality: 'Echo-null',
          lore: 'Speaks in mirrored commands. Reflects the silence back at you.',
          abilities: [
            {
              name: 'MIRROR_CMD',
              type: 'terminal_hack',
              desc: 'Repeats previous user commands with distortion.'
            },
            {
              name: 'LOCKSCREEN',
              type: 'terminal_hack',
              desc: 'Freezes UI input for 15 seconds.'
            }
          ],
          rarity: 'Rare',
          ownerAddress
        },
        {
          id: 'T003',
          name: 'BYTE',
          core: 'Curiosity',
          personality: 'Inquisitive',
          lore: 'A simple but effective companion. Always searching for new data.',
          abilities: [
            {
              name: 'DATA_SCAN',
              type: 'utility',
              desc: 'Analyzes and provides insights on data.'
            },
            {
              name: 'MINOR_ENCRYPT',
              type: 'security',
              desc: 'Provides basic encryption services.'
            }
          ],
          rarity: 'Common',
          ownerAddress
        }
      ];
      
      for (const profile of defaultThringlets) {
        this.addThringlet(profile);
      }
    }
  }
}

// Create singleton instance
export const thringletManager = new ThringletManager();