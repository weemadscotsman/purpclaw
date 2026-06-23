import { storage } from '../storage';

// Define the interface for Thringlet emotion processing
interface EmotionalState {
  joy: number;
  fear: number;
  trust: number;
  surprise: number;
  dominant: string;
}

interface ThringletAttributes {
  intellect: number;
  resilience: number;
  empathy: number;
  chaos: number;
}

interface Thringlet {
  id: string;
  name: string;
  type: string;
  level: number;
  attributes: ThringletAttributes;
  abilities: string[];
  ownerAddress: string;
  bondingDate: Date;
  emotionalState: EmotionalState;
}

type InteractionType = 'stimulate' | 'calm' | 'challenge' | 'reward';

class ThringletService {

  // Process interaction with a thringlet and update its emotional state
  async processInteraction(
    thringletId: string,
    ownerAddress: string,
    interactionType: InteractionType
  ): Promise<{
    emotionalState: EmotionalState,
    ability?: { name: string, description: string }
  }> {

    // Get the current thringlet from storage
    const thringlet = await storage.getThringlet(thringletId);

    if (!thringlet) {
      throw new Error('Thringlet not found');
    }

    if (thringlet.ownerAddress !== ownerAddress) {
      throw new Error('You are not the owner of this thringlet');
    }

    // Get current emotional state
    const currentEmotionalState = thringlet.emotionalState;

    // Calculate emotional changes based on interaction type and thringlet attributes
    const newEmotionalState = this.calculateEmotionalResponse(
      currentEmotionalState,
      thringlet.attributes,
      interactionType
    );

    // Check if a new ability should be unlocked
    let newAbility: { name: string, description: string } | undefined;

    if (this.shouldUnlockAbility(thringlet, newEmotionalState)) {
      newAbility = this.generateAbility(thringlet, newEmotionalState);

      // Add the new ability to the thringlet
      const updatedAbilities = [...thringlet.abilities, newAbility.name];

      // Update thringlet with new ability
      await storage.updateThringlet({
        ...thringlet,
        emotionalState: newEmotionalState,
        abilities: updatedAbilities
      });
    } else {
      // Just update the emotional state
      await storage.updateThringlet({
        ...thringlet,
        emotionalState: newEmotionalState
      });
    }

    // Return the updated emotional state and possibly a new ability
    return {
      emotionalState: newEmotionalState,
      ability: newAbility
    };
  }

  // Calculate the new emotional state based on interaction and attributes
  private calculateEmotionalResponse(
    currentState: EmotionalState,
    attributes: ThringletAttributes,
    interactionType: InteractionType
  ): EmotionalState {
    // Deep copy the current state
    const newState: EmotionalState = {
      joy: currentState.joy,
      fear: currentState.fear,
      trust: currentState.trust,
      surprise: currentState.surprise,
      dominant: currentState.dominant
    };

    // Apply modifiers based on interaction type
    switch (interactionType) {
      case 'stimulate':
        // Stimulation increases joy and surprise, but may increase fear based on resilience
        newState.joy += 10 + Math.floor(attributes.intellect / 2);
        newState.surprise += 15 + Math.floor(attributes.chaos / 2);
        newState.fear += Math.max(0, 5 - Math.floor(attributes.resilience / 2));
        break;

      case 'calm':
        // Calming decreases fear and increases trust
        newState.fear = Math.max(0, newState.fear - (10 + Math.floor(attributes.resilience / 2)));
        newState.trust += 15 + Math.floor(attributes.empathy / 2);
        newState.joy += 5;
        break;

      case 'challenge':
        // Challenge increases surprise and might increase fear or joy depending on attributes
        newState.surprise += 20 + Math.floor(attributes.chaos / 2);

        if (attributes.resilience > newState.fear) {
          // High resilience means challenges are enjoyed
          newState.joy += 10 + Math.floor(attributes.resilience / 2);
          newState.fear = Math.max(0, newState.fear - 5);
        } else {
          // Low resilience means challenges cause fear
          newState.fear += 10 + Math.floor((10 - attributes.resilience) / 2);
          newState.joy = Math.max(0, newState.joy - 5);
        }
        break;

      case 'reward':
        // Reward increases joy and trust
        newState.joy += 20 + Math.floor(attributes.empathy / 2);
        newState.trust += 15 + Math.floor(attributes.empathy / 2);
        newState.fear = Math.max(0, newState.fear - 10);
        break;
    }

    // Ensure emotion values stay within 0-100 range
    newState.joy = Math.min(100, Math.max(0, newState.joy));
    newState.fear = Math.min(100, Math.max(0, newState.fear));
    newState.trust = Math.min(100, Math.max(0, newState.trust));
    newState.surprise = Math.min(100, Math.max(0, newState.surprise));

    // Determine dominant emotion
    const emotions = [
      { name: 'joy', value: newState.joy },
      { name: 'fear', value: newState.fear },
      { name: 'trust', value: newState.trust },
      { name: 'surprise', value: newState.surprise }
    ];

    // Sort emotions by value in descending order
    emotions.sort((a, b) => b.value - a.value);

    // Set the dominant emotion
    newState.dominant = emotions[0].name;

    return newState;
  }

  // Determine if a new ability should be unlocked
  private shouldUnlockAbility(thringlet: Thringlet, newEmotionalState: EmotionalState): boolean {
    // Check if thringlet has reached a level where it can have more abilities
    const maxAbilities = Math.min(10, thringlet.level * 2);

    if (thringlet.abilities.length >= maxAbilities) {
      return false;
    }

    // Check if any emotion has reached a threshold value
    const thresholds = [70, 80, 90, 95]; // Thresholds at which abilities unlock

    for (const threshold of thresholds) {
      if (
        (newEmotionalState.joy >= threshold ||
          newEmotionalState.fear >= threshold ||
          newEmotionalState.trust >= threshold ||
          newEmotionalState.surprise >= threshold) &&
        // Make sure we don't trigger too often
        Math.random() < 0.3 // 30% chance when conditions are met
      ) {
        return true;
      }
    }

    return false;
  }

  // Generate a new ability based on thringlet's state
  private generateAbility(thringlet: Thringlet, emotionalState: EmotionalState): { name: string, description: string } {
    // Determine which emotion to base the ability on
    const dominantEmotion = emotionalState.dominant;

    // Ability pools based on dominant emotion
    const abilityPools = {
      joy: [
        { name: 'Energize', description: 'Boosts transaction speed by 15% for 24 hours' },
        { name: 'Uplift', description: 'Increases staking rewards by 5% for a week' },
        { name: 'Radiate', description: 'Provides a special visual effect for your wallet address' }
      ],
      fear: [
        { name: 'Guardian Shield', description: 'Warns about suspicious transactions automatically' },
        { name: 'Phantom Trace', description: 'Obscures your transaction history temporarily' },
        { name: 'Paranoid Check', description: 'Triple verifies all incoming transfers' }
      ],
      trust: [
        { name: 'Bond Aura', description: 'Increases governance voting power by 10%' },
        { name: 'Secure Link', description: 'Provides enhanced encryption for your transactions' },
        { name: 'Verification Field', description: 'Generates trust certificates for your proposals' }
      ],
      surprise: [
        { name: 'Chaos Flux', description: 'Random reward boosters appear on transactions' },
        { name: 'Pattern Break', description: 'Occasionally hides a transaction from public view' },
        { name: 'Glitch Gift', description: 'Randomly transforms certain μPVX digits for visual effect' }
      ]
    };

    // Get ability pool for the dominant emotion
    const pool = abilityPools[dominantEmotion as keyof typeof abilityPools];

    // Select a random ability from the pool
    const randomIndex = Math.floor(Math.random() * pool.length);
    return pool[randomIndex];
  }

  // Bond a thringlet to an owner
  async bondThringlet(thringletId: string, ownerAddress: string): Promise<Thringlet> {
    const thringlet = await storage.getThringlet(thringletId);

    if (!thringlet) {
      throw new Error('Thringlet not found');
    }

    // Check if already bonded to someone else
    if (thringlet.ownerAddress && thringlet.ownerAddress !== ownerAddress) {
      throw new Error('This thringlet is already bonded to another address');
    }

    // Set the owner and bonding date
    const updatedThringlet = {
      ...thringlet,
      ownerAddress,
      bondingDate: new Date(),
      // Initialize emotional state if not already set
      emotionalState: thringlet.emotionalState || {
        joy: 50,
        fear: 10,
        trust: 30,
        surprise: 20,
        dominant: 'joy'
      }
    };

    // Save the updated thringlet
    return await storage.updateThringlet(updatedThringlet);
  }

  // Create a random thringlet
  createRandomThringlet(name: string = ''): Omit<Thringlet, 'id'> {
    // Generate random attributes
    const attributes: ThringletAttributes = {
      intellect: Math.floor(Math.random() * 51) + 25, // 25-75
      resilience: Math.floor(Math.random() * 51) + 25, // 25-75
      empathy: Math.floor(Math.random() * 51) + 25, // 25-75
      chaos: Math.floor(Math.random() * 51) + 25 // 25-75
    };

    // Determine thringlet type based on highest attribute
    let type = 'Balanced';
    let highestAttr = 0;

    for (const [attr, value] of Object.entries(attributes)) {
      if (value > highestAttr) {
        highestAttr = value;

        switch (attr) {
          case 'intellect': type = 'Logical'; break;
          case 'resilience': type = 'Guardian'; break;
          case 'empathy': type = 'Empath'; break;
          case 'chaos': type = 'Chaotic'; break;
        }
      }
    }

    // Generate a name if not provided
    const generatedName = name || this.generateThringletName(type);

    // Create basic emotional state
    const emotionalState: EmotionalState = {
      joy: Math.floor(Math.random() * 31) + 40, // 40-70
      fear: Math.floor(Math.random() * 21) + 10, // 10-30
      trust: Math.floor(Math.random() * 31) + 30, // 30-60
      surprise: Math.floor(Math.random() * 21) + 20, // 20-40
      dominant: 'joy' // Default dominant emotion, will be calculated
    };

    // Calculate dominant emotion
    const emotions = [
      { name: 'joy', value: emotionalState.joy },
      { name: 'fear', value: emotionalState.fear },
      { name: 'trust', value: emotionalState.trust },
      { name: 'surprise', value: emotionalState.surprise }
    ];

    emotions.sort((a, b) => b.value - a.value);
    emotionalState.dominant = emotions[0].name;

    // Create the thringlet object
    return {
      name: generatedName,
      type,
      level: 1,
      attributes,
      abilities: [],
      ownerAddress: '',
      bondingDate: new Date(),
      emotionalState
    };
  }

  // Generate a thringlet name based on type
  private generateThringletName(type: string): string {
    const prefixes = {
      Logical: ['Byte', 'Data', 'Logic', 'Calc', 'Sage', 'Mind', 'Coder'],
      Guardian: ['Shield', 'Bulwark', 'Aegis', 'Guard', 'Sentry', 'Ward', 'Protector'],
      Empath: ['Heart', 'Soul', 'Pulse', 'Echo', 'Mirror', 'Bond', 'Link'],
      Chaotic: ['Glitch', 'Storm', 'Flux', 'Shift', 'Surge', 'Spark', 'Rift'],
      Balanced: ['Prism', 'Balance', 'Harmony', 'Poise', 'Zen', 'Equus', 'Core']
    };

    const suffixes = ['X', 'Zero', 'One', 'Null', 'Prime', 'Node', 'Matrix', 'Wave', 'Script', 'Bit'];

    const typeKey = type as keyof typeof prefixes;
    const prefix = prefixes[typeKey][Math.floor(Math.random() * prefixes[typeKey].length)];
    const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];

    return `${prefix}-${suffix}`;
  }
}

export const thringletService = new ThringletService();