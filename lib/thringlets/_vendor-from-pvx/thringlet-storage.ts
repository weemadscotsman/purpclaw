import { 
  ThringletEmotionState,
  ThringletPersonalityTrait,
  BlockchainAffinity 
} from '@shared/types';
import * as fs from 'fs';
import * as path from 'path';

// Thringlet type for storage
export interface Thringlet {
  id: string;
  name: string;
  owner: string;
  createdAt: number;
  lastInteraction: number;
  emotionState: ThringletEmotionState;
  level: number;
  experience: number;
  abilities: string[];
  // Personality system
  personalityTraits: ThringletPersonalityTrait[];
  dominantTrait: ThringletPersonalityTrait;
  blockchainAffinities: BlockchainAffinity[];
  dominantAffinity: BlockchainAffinity;
  // Per-trait intensity values (0-100)
  traitIntensity: Record<ThringletPersonalityTrait, number>;
  // Blockchain activity influences
  miningInfluence: number;      // How mining activity affects this companion
  stakingInfluence: number;     // How staking affects this companion
  tradingInfluence: number;     // How trading affects this companion
  governanceInfluence: number;  // How governance participation affects this companion
  // Visual appearance
  visual: {
    baseColor: string;
    eyeColor: string;
    appendages: number;
    specialFeatures: string[];
  };
  // Emotional history
  stateHistory: {
    state: ThringletEmotionState;
    timestamp: number;
    trigger: string;
  }[];
}

// Serializable storage state
interface StorageState {
  thringlets: [string, Thringlet][];
}

// Path for persisting thringlet data
const DATA_FILE_PATH = './data/thringlet-data.json';

// In-memory thringlet data storage with file persistence
export class ThringletStorage {
  private thringlets: Map<string, Thringlet> = new Map();
  
  constructor() {
    // Create test data if empty
    this.loadFromFile();
    this.addTestThringlets();
    this.migrateThringletPersonalityData();
  }
  
  // Migrate thringlet data to ensure all personality fields are present
  private migrateThringletPersonalityData() {
    let needsMigration = false;
    
    this.thringlets.forEach((thringlet, id) => {
      let updated = false;
      
      // Check and add missing personality fields
      if (!thringlet.personalityTraits) {
        thringlet.personalityTraits = [
          ThringletPersonalityTrait.ANALYTICAL,
          ThringletPersonalityTrait.CURIOUS
        ];
        updated = true;
      }
      
      if (!thringlet.dominantTrait) {
        thringlet.dominantTrait = thringlet.personalityTraits[0] || ThringletPersonalityTrait.ANALYTICAL;
        updated = true;
      }
      
      if (!thringlet.blockchainAffinities) {
        thringlet.blockchainAffinities = [
          BlockchainAffinity.MINING,
          BlockchainAffinity.STAKING
        ];
        updated = true;
      }
      
      if (!thringlet.dominantAffinity) {
        thringlet.dominantAffinity = thringlet.blockchainAffinities[0] || BlockchainAffinity.MINING;
        updated = true;
      }
      
      if (!thringlet.traitIntensity) {
        thringlet.traitIntensity = {} as Record<ThringletPersonalityTrait, number>;
        
        // Initialize trait intensities
        Object.values(ThringletPersonalityTrait).forEach(trait => {
          thringlet.traitIntensity[trait] = thringlet.personalityTraits?.includes(trait) ? 70 : 30;
        });
        updated = true;
      }
      
      if (thringlet.miningInfluence === undefined) {
        thringlet.miningInfluence = Math.floor(Math.random() * 50) + 50; // 50-100
        updated = true;
      }
      
      if (thringlet.stakingInfluence === undefined) {
        thringlet.stakingInfluence = Math.floor(Math.random() * 50) + 50; // 50-100
        updated = true;
      }
      
      if (thringlet.tradingInfluence === undefined) {
        thringlet.tradingInfluence = Math.floor(Math.random() * 50) + 50; // 50-100
        updated = true;
      }
      
      if (thringlet.governanceInfluence === undefined) {
        thringlet.governanceInfluence = Math.floor(Math.random() * 50) + 50; // 50-100
        updated = true;
      }
      
      if (!thringlet.abilities) {
        thringlet.abilities = ['basic_movement'];
        updated = true;
      }
      
      if (!thringlet.stateHistory) {
        thringlet.stateHistory = [{
          state: thringlet.emotionState,
          timestamp: Date.now(),
          trigger: 'system_initialization'
        }];
        updated = true;
      }
      
      if (updated) {
        this.thringlets.set(id, thringlet);
        needsMigration = true;
      }
    });
    
    if (needsMigration) {
      console.log('Migrated Thringlet personality data');
      this.saveToFile();
    }
  }
  
  // Add some test thringlets
  private addTestThringlets() {
    if (this.thringlets.size === 0) {
      const testThringlet1: Thringlet = {
        id: "test-thringlet-1",
        name: "Nebula",
        owner: "PVX_1e1ee32c2770a6af3ca119759c539907",
        createdAt: Date.now(),
        lastInteraction: Date.now(),
        emotionState: 'happy' as ThringletEmotionState,
        level: 3,
        experience: 250,
        abilities: ['basic_movement', 'teleport'],
        // Personality traits
        personalityTraits: [
          ThringletPersonalityTrait.ANALYTICAL,
          ThringletPersonalityTrait.CURIOUS,
          ThringletPersonalityTrait.CREATIVE
        ],
        dominantTrait: ThringletPersonalityTrait.ANALYTICAL,
        blockchainAffinities: [
          BlockchainAffinity.PRIVACY,
          BlockchainAffinity.INNOVATION
        ],
        dominantAffinity: BlockchainAffinity.PRIVACY,
        traitIntensity: {
          [ThringletPersonalityTrait.ANALYTICAL]: 85,
          [ThringletPersonalityTrait.ADVENTUROUS]: 30,
          [ThringletPersonalityTrait.CAUTIOUS]: 45,
          [ThringletPersonalityTrait.CREATIVE]: 70,
          [ThringletPersonalityTrait.SOCIAL]: 35,
          [ThringletPersonalityTrait.CURIOUS]: 75,
          [ThringletPersonalityTrait.PROTECTIVE]: 50,
          [ThringletPersonalityTrait.CHAOTIC]: 20,
          [ThringletPersonalityTrait.LOGICAL]: 65,
          [ThringletPersonalityTrait.EMOTIONAL]: 25
        },
        // Blockchain activity influences
        miningInfluence: 70,
        stakingInfluence: 40,
        tradingInfluence: -20,
        governanceInfluence: 50,
        // Visual
        visual: {
          baseColor: 'purple',
          eyeColor: 'teal',
          appendages: 4,
          specialFeatures: ['glowing_eyes', 'crystal_growths']
        },
        stateHistory: [{
          state: 'neutral' as ThringletEmotionState,
          timestamp: Date.now() - 86400000,
          trigger: 'creation'
        }, {
          state: 'happy' as ThringletEmotionState,
          timestamp: Date.now(),
          trigger: 'user interaction'
        }]
      };
      
      const testThringlet2: Thringlet = {
        id: "test-thringlet-2",
        name: "Spark",
        owner: "PVX_f5ba480b7db6010eecb453eca8e67ff0",
        createdAt: Date.now() - 172800000,
        lastInteraction: Date.now() - 36000000,
        emotionState: 'excited' as ThringletEmotionState,
        level: 5,
        experience: 490,
        abilities: ['basic_movement', 'invisibility', 'energy_burst'],
        // Personality traits
        personalityTraits: [
          ThringletPersonalityTrait.ADVENTUROUS,
          ThringletPersonalityTrait.CHAOTIC,
          ThringletPersonalityTrait.EMOTIONAL
        ],
        dominantTrait: ThringletPersonalityTrait.ADVENTUROUS,
        blockchainAffinities: [
          BlockchainAffinity.MINING,
          BlockchainAffinity.DEFI
        ],
        dominantAffinity: BlockchainAffinity.MINING,
        traitIntensity: {
          [ThringletPersonalityTrait.ANALYTICAL]: 25,
          [ThringletPersonalityTrait.ADVENTUROUS]: 90,
          [ThringletPersonalityTrait.CAUTIOUS]: 15,
          [ThringletPersonalityTrait.CREATIVE]: 55,
          [ThringletPersonalityTrait.SOCIAL]: 60,
          [ThringletPersonalityTrait.CURIOUS]: 50,
          [ThringletPersonalityTrait.PROTECTIVE]: 20,
          [ThringletPersonalityTrait.CHAOTIC]: 75,
          [ThringletPersonalityTrait.LOGICAL]: 30,
          [ThringletPersonalityTrait.EMOTIONAL]: 70
        },
        // Blockchain activity influences
        miningInfluence: 90,
        stakingInfluence: -10,
        tradingInfluence: 70,
        governanceInfluence: -30,
        // Visual
        visual: {
          baseColor: 'orange',
          eyeColor: 'blue',
          appendages: 6,
          specialFeatures: ['smoke', 'wings']
        },
        stateHistory: [{
          state: 'neutral' as ThringletEmotionState,
          timestamp: Date.now() - 172800000,
          trigger: 'creation'
        }, {
          state: 'excited' as ThringletEmotionState,
          timestamp: Date.now() - 36000000,
          trigger: 'level up'
        }]
      };
      
      this.thringlets.set(testThringlet1.id, testThringlet1);
      this.thringlets.set(testThringlet2.id, testThringlet2);
      
      // Save the test data
      this.saveToFile();
    }
  }
  
  // Save data to file
  private async saveToFile() {
    try {
      // Ensure data directory exists
      const dataDir = path.dirname(DATA_FILE_PATH);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      
      // Prepare data for serialization
      const data: StorageState = {
        thringlets: Array.from(this.thringlets.entries())
      };
      
      // Write to file
      fs.writeFileSync(DATA_FILE_PATH, JSON.stringify(data, null, 2));
      console.log("Thringlet data saved to file");
    } catch (error) {
      console.error("Failed to save thringlet data:", error);
    }
  }
  
  // Load data from file
  private loadFromFile() {
    try {
      if (fs.existsSync(DATA_FILE_PATH)) {
        const data = JSON.parse(fs.readFileSync(DATA_FILE_PATH, 'utf8')) as StorageState;
        
        // Restore thringlets
        this.thringlets = new Map(data.thringlets || []);
        
        console.log("Thringlet data loaded from file");
      } else {
        console.log("No thringlet data file found, starting with empty state");
      }
    } catch (error) {
      console.error("Failed to load thringlet data:", error);
    }
  }
  
  // Thringlet methods
  async getThringlet(id: string): Promise<Thringlet | undefined> {
    return this.thringlets.get(id);
  }
  
  async getAllThringlets(): Promise<Thringlet[]> {
    return Array.from(this.thringlets.values());
  }
  
  async createThringlet(thringlet: Thringlet): Promise<Thringlet> {
    // Ensure all personality fields are properly initialized
    if (!thringlet.personalityTraits) {
      thringlet.personalityTraits = [
        ThringletPersonalityTrait.ANALYTICAL,
        ThringletPersonalityTrait.CURIOUS
      ];
    }
    
    if (!thringlet.dominantTrait) {
      thringlet.dominantTrait = thringlet.personalityTraits[0];
    }
    
    if (!thringlet.blockchainAffinities) {
      thringlet.blockchainAffinities = [
        BlockchainAffinity.MINING,
        BlockchainAffinity.STAKING
      ];
    }
    
    if (!thringlet.dominantAffinity) {
      thringlet.dominantAffinity = thringlet.blockchainAffinities[0];
    }
    
    if (!thringlet.traitIntensity) {
      thringlet.traitIntensity = {} as Record<ThringletPersonalityTrait, number>;
      
      // Initialize trait intensities
      Object.values(ThringletPersonalityTrait).forEach(trait => {
        thringlet.traitIntensity[trait] = thringlet.personalityTraits?.includes(trait) ? 70 : 30;
      });
    }
    
    if (thringlet.miningInfluence === undefined) {
      thringlet.miningInfluence = Math.floor(Math.random() * 50) + 50; // 50-100
    }
    
    if (thringlet.stakingInfluence === undefined) {
      thringlet.stakingInfluence = Math.floor(Math.random() * 50) + 50; // 50-100
    }
    
    if (thringlet.tradingInfluence === undefined) {
      thringlet.tradingInfluence = Math.floor(Math.random() * 50) + 50; // 50-100
    }
    
    if (thringlet.governanceInfluence === undefined) {
      thringlet.governanceInfluence = Math.floor(Math.random() * 50) + 50; // 50-100
    }
    
    if (!thringlet.abilities) {
      thringlet.abilities = ['basic_movement'];
    }
    
    if (!thringlet.stateHistory) {
      thringlet.stateHistory = [{
        state: thringlet.emotionState,
        timestamp: Date.now(),
        trigger: 'creation'
      }];
    }
    
    this.thringlets.set(thringlet.id, thringlet);
    await this.saveToFile();
    return thringlet;
  }
  
  async updateThringlet(id: string, updates: Partial<Thringlet>): Promise<Thringlet | undefined> {
    const thringlet = this.thringlets.get(id);
    if (!thringlet) return undefined;
    
    const updatedThringlet = { ...thringlet, ...updates };
    this.thringlets.set(id, updatedThringlet);
    await this.saveToFile();
    return updatedThringlet;
  }
  
  async deleteThringlet(id: string): Promise<boolean> {
    const success = this.thringlets.delete(id);
    if (success) {
      await this.saveToFile();
    }
    return success;
  }
  
  async getThringletsByOwner(ownerAddress: string): Promise<Thringlet[]> {
    return Array.from(this.thringlets.values()).filter(t => t.owner === ownerAddress);
  }
}

// Export singleton instance
export const thringletStorage = new ThringletStorage();