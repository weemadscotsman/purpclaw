import * as fs from 'fs';
import * as path from 'path';
import { config } from '../utils/config';

export interface PetState {
  // Core identity
  name: string;
  type: 'dog' | 'cat' | 'dragon' | 'robot';
  birthTime: number;
  age: number; // in minutes
  
  // Vital stats (0-100)
  happiness: number;
  hunger: number;
  energy: number;
  health: number;
  cleanliness: number;
  
  // Timestamps
  lastUpdate: number;
  lastFed: number;
  lastPlayed: number;
  lastPetted: number;
  lastCleaned: number;
  lastSlept: number;
  
  // Current state
  currentAnimation: string;
  animationFrame: number;
  animationStartTime: number;
  isAsleep: boolean;
  isSick: boolean;
  
  // Activity tracking (NEW)
  sessionUpdateCount: number;     // Updates in current session
  totalUpdateCount: number;       // Lifetime update counter
  lastUpdateTimestamp: number;    // For gap detection
  recentUpdateTimestamps: number[]; // Last 30 updates for activity rate
  sessionStartTime: number;       // When current session began
  previousSessionEnd: number;     // End of last session
  sessionsToday: number;         // Number of coding sessions
  
  // Animation state (NEW)
  breathingState: boolean;        // Simple toggle for breathing
  microAnimationFrame: number;    // For small animations
  animationFrame: number;         // Current frame in animation sequence (0-n)
  currentAnimationName: string;   // Name of current animation being played
  
  // Mood and patterns (NEW)
  currentMood: 'normal' | 'debugging' | 'celebrating' | 'tired' | 'focused' | 'sleeping' | 
               'proud' | 'excited' | 'concerned' | 'confused' | 'suspicious' |
               'annoyed' | 'frustrated' | 'angry' | 'furious';
  recentKeywords: string[];       // Recent keywords from conversation
  
  // Feedback system fields (NEW)
  claudeBehaviorScore: number;    // 0-100, how well Claude is behaving
  recentViolations: number;       // Count of recent issues
  feedbackHistory: Array<{
    type: string;
    severity: string;
    remark: string;
    timestamp: number;
  }>;
  lastTranscriptCheck?: string;   // Last message UUID checked
  currentFeedback?: {              // Current feedback being displayed
    icon: string;
    remark: string;
    timestamp: number;
  };
  
  // Legacy activity tracking
  foodEaten: string[];
  totalFeedings: number;
  totalPlaySessions: number;
  favoriteFood: string;
  tricks: string[];
  
  // Special states
  pendingAction?: {
    type: 'eating' | 'playing' | 'sleeping' | 'bathing';
    item?: string;
    startTime: number;
    duration: number;
    updateCount?: number;
  };
  
  // System messages for user
  systemMessage?: string;
  messageTimestamp?: number;
  
  // Thought system fields (NEW)
  currentThought?: string;          // Current thought being displayed
  thoughtTimestamp?: number;         // When thought was generated
  lastThoughtUpdate: number;        // Last update count when thought changed
  thoughtHistory: string[];          // Recent thought history
  thoughtCategoryFatigue: Record<string, number>; // Fatigue for each category
  thoughtEscalation: Record<string, number>;      // Escalation tracking for needs
  
  
  // Evolution
  evolutionStage: number;
  careLevelPoints: number;
}

export class StateManager {
  private stateFile: string;
  private lockFile: string;
  private state: PetState | null = null;
  
  constructor() {
    this.stateFile = config.stateFile;
    this.lockFile = `${this.stateFile}.lock`;
  }
  
  private createDefaultState(): PetState {
    const now = Date.now();
    return {
      name: config.petName,
      type: config.petType,
      birthTime: now,
      age: 0,
      
      happiness: 80,
      hunger: 70,
      energy: 90,
      health: 100,
      cleanliness: 100,
      
      lastUpdate: now,
      lastFed: now,
      lastPlayed: now,
      lastPetted: now,
      lastCleaned: now,
      lastSlept: now,
      
      currentAnimation: 'idle',
      animationFrame: 0,
      animationStartTime: now,
      isAsleep: false,
      isSick: false,
      
      // Activity tracking
      sessionUpdateCount: 0,
      totalUpdateCount: 0,
      lastUpdateTimestamp: now,
      recentUpdateTimestamps: [],
      sessionStartTime: now,
      previousSessionEnd: now,
      sessionsToday: 1,
      
      // Animation state
      breathingState: false,
      microAnimationFrame: 0,
      animationFrame: 0,
      currentAnimationName: 'idle',
      
      // Mood
      currentMood: 'normal',
      recentKeywords: [],
      
      // Feedback system
      claudeBehaviorScore: 80,
      recentViolations: 0,
      feedbackHistory: [],
      lastTranscriptCheck: undefined,
      currentFeedback: undefined,
      
      // Legacy
      foodEaten: [],
      totalFeedings: 0,
      totalPlaySessions: 0,
      favoriteFood: 'cookie',
      tricks: [],
      
      // Thought system
      currentThought: undefined,
      thoughtTimestamp: undefined,
      lastThoughtUpdate: 0,
      thoughtHistory: [],
      thoughtCategoryFatigue: {},
      thoughtEscalation: {},
      
      evolutionStage: 0,
      careLevelPoints: 0,
    };
  }
  
  private async waitForLock(maxAttempts = 2): Promise<boolean> {
    for (let i = 0; i < maxAttempts; i++) {
      // Check if lock file exists and is stale (older than 2 seconds)
      if (fs.existsSync(this.lockFile)) {
        try {
          const stats = fs.statSync(this.lockFile);
          const age = Date.now() - stats.mtimeMs;
          if (age > 2000) {
            // Stale lock, remove it
            fs.unlinkSync(this.lockFile);
          }
        } catch {
          // Ignore errors checking lock file
        }
      }
      
      if (!fs.existsSync(this.lockFile)) {
        try {
          fs.writeFileSync(this.lockFile, process.pid.toString());
          return true;
        } catch {
          // Another process got the lock first
        }
      }
      
      // Only wait if this isn't the last attempt (max 20ms wait)
      if (i < maxAttempts - 1) {
        await new Promise(resolve => setTimeout(resolve, 20));
      }
    }
    return false;
  }
  
  private releaseLock(): void {
    try {
      if (fs.existsSync(this.lockFile)) {
        fs.unlinkSync(this.lockFile);
      }
    } catch {
      // Ignore errors
    }
  }
  
  async load(): Promise<PetState> {
    if (this.state && Date.now() - this.state.lastUpdate < 100) {
      return this.state;
    }
    
    const locked = await this.waitForLock();
    if (!locked) {
      // Fallback to cached state or default
      return this.state || this.createDefaultState();
    }
    
    try {
      if (fs.existsSync(this.stateFile)) {
        const data = fs.readFileSync(this.stateFile, 'utf-8');
        this.state = JSON.parse(data);
        
        // Validate state
        if (!this.state || typeof this.state !== 'object') {
          throw new Error('Invalid state file');
        }
        
        // Update age
        if (this.state) {
          const ageMinutes = Math.floor((Date.now() - this.state.birthTime) / 60000);
          this.state.age = ageMinutes;
          
          // Migrate old state to include new fields
          const now = Date.now();
          if (this.state.sessionUpdateCount === undefined) {
            this.state.sessionUpdateCount = 0;
            this.state.totalUpdateCount = 0;
            this.state.lastUpdateTimestamp = this.state.lastUpdate || now;
            this.state.recentUpdateTimestamps = [];
            this.state.sessionStartTime = now;
            this.state.previousSessionEnd = now;
            this.state.sessionsToday = 1;
            this.state.breathingState = false;
            this.state.microAnimationFrame = 0;
            this.state.currentMood = 'normal';
            this.state.recentKeywords = [];
          }
          
          // Migrate animation frame tracking
          if (this.state.animationFrame === undefined) {
            this.state.animationFrame = 0;
            this.state.currentAnimationName = 'idle';
          }
          
          // Migrate thought system fields
          if (this.state.lastThoughtUpdate === undefined) {
            this.state.lastThoughtUpdate = 0;
            this.state.thoughtHistory = [];
            this.state.thoughtCategoryFatigue = {};
            this.state.thoughtEscalation = {};
          }
          
          // Migrate feedback system fields
          if (this.state.claudeBehaviorScore === undefined) {
            this.state.claudeBehaviorScore = 80;
            this.state.recentViolations = 0;
            this.state.feedbackHistory = [];
            this.state.lastTranscriptCheck = undefined;
            this.state.currentFeedback = undefined;
          }
        }
      } else {
        this.state = this.createDefaultState();
        await this.save(this.state);
      }
    } catch (error) {
      // State file corrupted, create new pet
      if (config.debugMode) {
        console.error('State file corrupted, creating new pet:', error);
      }
      this.state = this.createDefaultState();
      await this.save(this.state);
    } finally {
      this.releaseLock();
    }
    
    return this.state!;
  }
  
  async save(state: PetState): Promise<void> {
    // Ensure the directory exists FIRST
    const dir = path.dirname(this.stateFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    const locked = await this.waitForLock();
    if (!locked) {
      // Still try to save even without lock - better than losing data
      if (config.debugMode) {
        console.error('Warning: Saving without lock');
      }
    }
    
    try {
      
      // Update timestamp
      state.lastUpdate = Date.now();
      
      // Write to temp file first (atomic write)
      const tempFile = `${this.stateFile}.tmp`;
      fs.writeFileSync(tempFile, JSON.stringify(state, null, 2));
      
      // Rename atomically
      fs.renameSync(tempFile, this.stateFile);
      
      this.state = state;
    } catch (error) {
      if (config.debugMode) {
        console.error('Failed to save state:', error);
      }
    } finally {
      this.releaseLock();
    }
  }
  
  async reset(): Promise<void> {
    const newState = this.createDefaultState();
    await this.save(newState);
  }
}