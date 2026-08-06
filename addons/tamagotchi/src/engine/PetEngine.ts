import { StateManager, PetState } from './StateManager';
import { AnimationManager } from './AnimationManager';
import { ActivitySystem } from './ActivitySystem';
import { FeedbackSystem } from './feedback/FeedbackSystem';
import { config } from '../utils/config';
import * as fs from 'fs';

export interface PetAction {
  command: string;
  parameter?: string;
  timestamp: number;
}

export class PetEngine {
  private stateManager: StateManager;
  private animationManager: AnimationManager;
  private activitySystem: ActivitySystem;
  private feedbackSystem: FeedbackSystem;
  private state: PetState | null = null;
  private transcriptPath?: string;
  private sessionId?: string;
  
  constructor() {
    this.stateManager = new StateManager();
    this.animationManager = new AnimationManager();
    this.activitySystem = new ActivitySystem();
    this.feedbackSystem = new FeedbackSystem();
  }
  
  async initialize(): Promise<void> {
    this.state = await this.stateManager.load();
  }
  
  async update(transcriptPath?: string, sessionId?: string): Promise<void> {
    if (!this.state) {
      await this.initialize();
    }
    
    if (!this.state) {
      throw new Error('Failed to initialize pet state');
    }
    
    // Store for later use
    this.transcriptPath = transcriptPath;
    this.sessionId = sessionId;
    
    // Check for pending actions from commands
    await this.checkForActions();
    
    // Apply activity-based updates instead of time decay
    this.activitySystem.applyActivityUpdate(this.state);
    
    // Process feedback if enabled
    if (config.feedbackEnabled && transcriptPath && sessionId) {
      this.feedbackSystem.processFeedback(this.state, transcriptPath, sessionId);
    }
    
    // Check if pending action is complete
    if (this.state.pendingAction) {
      // Increment update count for the action
      this.state.pendingAction.updateCount = (this.state.pendingAction.updateCount || 0) + 1;
      
      // Handle bathing - increase cleanliness and show fun messages
      if (this.state.pendingAction.type === 'bathing') {
        // Increase cleanliness by 10% each update
        this.state.cleanliness = Math.min(100, this.state.cleanliness + 10);
        
        // Fun shower messages based on progress
        const showerMessages = [
          `🎵 Rubber ducky, you're the one... 🎵`,
          `Scrub-a-dub-dub! 🧼`,
          `🎵 Splish splash, I was taking a bath! 🎵`,
          `*blows soap bubbles* 🫧`,
          `Is that shampoo or ice cream? 🤔`,
          `🎵 Singing in the rain... er, shower! 🎵`,
          `*makes mohawk with shampoo* 🦎`,
          `Bubble beard! I'm Santa! 🎅`,
          `Almost done... so sparkly! ✨`,
          `All clean! That was fun! 🌟`
        ];
        
        const messageIndex = Math.min(this.state.pendingAction.updateCount - 1, showerMessages.length - 1);
        this.state.systemMessage = showerMessages[messageIndex];
        this.state.messageTimestamp = Date.now();
      }
      
      // Check if action is complete based on update count
      if (this.state.pendingAction.updateCount >= this.state.pendingAction.duration) {
        // Action complete
        if (this.state.pendingAction.type === 'bathing') {
          this.state.systemMessage = `All clean and sparkly! 🌟`;
          this.state.messageTimestamp = Date.now();
        }
        this.state.pendingAction = null;
      }
    }
    
    // Save updated state
    await this.stateManager.save(this.state);
  }
  
  private async checkForActions(): Promise<void> {
    if (!this.state) return;
    
    // Check for action file
    if (fs.existsSync(config.actionFile)) {
      try {
        const actionData = fs.readFileSync(config.actionFile, 'utf-8');
        const action: PetAction = JSON.parse(actionData);
        
        // Process the action
        this.processAction(action);
        
        // Delete the action file
        fs.unlinkSync(config.actionFile);
      } catch (error) {
        if (config.debugMode) {
          console.error('Failed to process action:', error);
        }
        // Delete corrupted action file
        try {
          fs.unlinkSync(config.actionFile);
        } catch {}
      }
    }
  }
  
  private processAction(action: PetAction): void {
    if (!this.state) return;
    
    // Check if we can interrupt current animation
    if (!this.animationManager.canInterrupt(this.state)) {
      return; // Action will be retried next update
    }
    
    switch (action.command) {
      case 'feed':
        this.handleFeed(action.parameter || 'cookie');
        break;
        
      case 'pet':
        this.handlePet();
        break;
        
      case 'play':
        this.handlePlay(action.parameter || 'ball');
        break;
        
      case 'sleep':
        this.handleSleep();
        break;
        
      case 'wake':
        this.handleWake();
        break;
        
      case 'clean':
        this.handleClean();
        break;
        
      case 'heal':
        this.handleHeal();
        break;
        
      case 'name':
        if (action.parameter) {
          this.state.name = action.parameter;
        }
        break;
        
      case 'trick':
        this.handleTrick(action.parameter);
        break;
    }
  }
  
  private handleFeed(food: string): void {
    if (!this.state) return;
    
    // Set eating action to last for 8 updates
    this.state.pendingAction = {
      type: 'eating',
      item: food,
      startTime: Date.now(),
      duration: 8, // Will last for 8 updates
      updateCount: 0 // Track how many updates have passed
    };
    
    this.state.lastFed = Date.now();
    this.state.systemMessage = `The ${food} was yummy! 😋`;
    this.state.messageTimestamp = Date.now();
    
    // Increase hunger immediately
    this.state.hunger = Math.min(100, this.state.hunger + 35);
  }
  
  private handlePet(): void {
    if (!this.state) return;
    
    this.animationManager.setAnimation(this.state, 'love');
    this.state.happiness = Math.min(100, this.state.happiness + 15);
    this.state.lastPetted = Date.now();
  }
  
  private handlePlay(toy: string): void {
    if (!this.state) return;
    
    // Set playing action to last for 6 updates
    this.state.pendingAction = {
      type: 'playing',
      item: toy,
      startTime: Date.now(),
      duration: 6, // Will last for 6 updates
      updateCount: 0
    };
    
    this.state.lastPlayed = Date.now();
    
    // Increase happiness and decrease energy
    this.state.happiness = Math.min(100, this.state.happiness + 20);
    this.state.energy = Math.max(0, this.state.energy - 10);
  }
  
  private handleSleep(): void {
    if (!this.state) return;
    
    this.state.isAsleep = true;
    this.state.lastSlept = Date.now();
    this.state.systemMessage = `${this.state.name} is going to sleep... 😴`;
    this.state.messageTimestamp = Date.now();
  }
  
  private handleWake(): void {
    if (!this.state) return;
    
    if (this.state.isAsleep) {
      this.state.isAsleep = false;
      this.state.systemMessage = `${this.state.name} woke up! ☀️`;
      this.state.messageTimestamp = Date.now();
      this.animationManager.setAnimation(this.state, 'blink');
    }
  }
  
  private handleClean(): void {
    if (!this.state) return;
    
    this.state.pendingAction = {
      type: 'bathing',
      startTime: Date.now(),
      duration: 10, // 10 updates to fully clean
      updateCount: 0
    };
    
    this.state.lastCleaned = Date.now();
    this.state.systemMessage = `Bath time! 🛁`;
    this.state.messageTimestamp = Date.now();
  }
  
  private handleHeal(): void {
    if (!this.state) return;
    
    if (this.state.isSick || this.state.health < 50) {
      this.state.health = Math.min(100, this.state.health + 30);
      this.state.isSick = false;
      this.animationManager.setAnimation(this.state, 'happy');
    }
  }
  
  private handleTrick(trick?: string): void {
    if (!this.state || !trick) return;
    
    if (!this.state.tricks.includes(trick)) {
      this.state.tricks.push(trick);
      this.animationManager.setAnimation(this.state, 'celebrating');
    }
  }
  
  // Process input for keyword detection
  processInput(input: string): void {
    if (!this.state) return;
    this.activitySystem.detectKeywords(this.state, input);
  }
  
  getDisplay(): string {
    if (!this.state) {
      return '(◕ᴥ◕) Loading...';
    }
    
    const petFrame = this.animationManager.getFrame(this.state);
    
    // Save state after animation frame increment
    this.stateManager.save(this.state);
    
    // Build display with activity context
    let display = `${petFrame} ${this.state.name}`;
    
    // Add activity indicators
    if (this.state.pendingAction) {
      // Show what pet is doing with specific item
      if (this.state.pendingAction.type === 'eating') {
        // Use food-specific emoji
        const foodEmojis: Record<string, string> = {
          'cookie': '🍪',
          'pizza': '🍕',
          'sushi': '🍣',
          'apple': '🍎',
          'carrot': '🥕',
          'steak': '🥩',
          'fish': '🐟',
          'candy': '🍬'
        };
        const foodEmoji = foodEmojis[this.state.pendingAction.item || 'cookie'] || '🍪';
        display += ` ${foodEmoji}`;
      } else if (this.state.pendingAction.type === 'playing') {
        // Use toy-specific emoji
        const toyEmojis: Record<string, string> = {
          'ball': '🎾',
          'frisbee': '🥏',
          'laser': '🔴',
          'yarn': '🧶',
          'puzzle': '🧩'
        };
        const toyEmoji = toyEmojis[this.state.pendingAction.item || 'ball'] || '🎾';
        display += ` ${toyEmoji}`;
      } else {
        const actionEmojis: Record<string, string> = {
          'sleeping': '😴',
          'bathing': '🛁'
        };
        display += ` ${actionEmojis[this.state.pendingAction.type] || ''}`;
      }
    } else {
      // Show mood or status
      const mood = this.getMoodEmoji();
      display += ` ${mood}`;
    }
    
    // Add session indicators
    if (this.state.sessionUpdateCount > 200) {
      display += ' 🔥'; // On fire! Long session
    } else if (this.state.sessionUpdateCount > 100) {
      display += ' 💪'; // Strong session
    } else if (this.state.sessionUpdateCount === 50 || 
               this.state.sessionUpdateCount === 100 || 
               this.state.sessionUpdateCount === 150) {
      display += ' ✨'; // Milestone
    }
    
    // Add alert indicators
    if (this.state.hunger < 20) {
      display += ' 🍖'; // Hungry!
    }
    if (this.state.energy < 20) {
      display += ' 💤'; // Sleepy
    }
    
    return display;
  }
  
  private getMoodEmoji(): string {
    if (!this.state) return '';
    
    if (this.state.isAsleep) return '😴';
    if (this.state.isSick) return '🤒';
    if (this.state.happiness > 80) return '😊';
    if (this.state.happiness > 50) return '🙂';
    if (this.state.happiness > 30) return '😐';
    return '😢';
  }
  
  getStats(): string {
    if (!this.state) return 'No pet data';
    
    // Compact stats with critical alerts
    let stats = '';
    
    // Show critical stats in red if low
    if (this.state.hunger < 30) {
      stats += `🍖 ${Math.round(this.state.hunger)}%⚠️ `;
    } else {
      stats += `🍖 ${Math.round(this.state.hunger)}% `;
    }
    
    if (this.state.energy < 30) {
      stats += `⚡ ${Math.round(this.state.energy)}%⚠️ `;
    } else {
      stats += `⚡ ${Math.round(this.state.energy)}% `;
    }
    
    if (this.state.cleanliness < 30) {
      stats += `🧼 ${Math.round(this.state.cleanliness)}%⚠️ `;
    } else {
      stats += `🧼 ${Math.round(this.state.cleanliness)}% `;
    }
    
    stats += `❤️ ${Math.round(this.state.happiness)}%`;
    
    // Add session info if explicitly enabled
    const showSession = process.env.PET_SHOW_SESSION === 'true';
    if (showSession) {
      stats += ` | Session: ${this.state.sessionUpdateCount}`;
    }
    
    return stats;
  }
  
  getDetailedStats(): object {
    return this.state || {};
  }
  
  getSystemMessage(): string | null {
    if (!this.state || !this.state.systemMessage) return null;
    
    // Clear message after 10 seconds (about 30 updates)
    const messageAge = Date.now() - (this.state.messageTimestamp || 0);
    if (messageAge > 10000) {
      this.state.systemMessage = undefined;
      this.state.messageTimestamp = undefined;
      return null;
    }
    
    return this.state.systemMessage;
  }
  
  getCurrentThought(): string | null {
    if (!this.state) return null;
    
    // Check for feedback thought (conversation-relevant)
    const feedbackThought = this.feedbackSystem.getFeedbackThought(this.state);
    
    // Use ratio to decide which type of thought to show
    if (feedbackThought && Math.random() < config.conversationThoughtRatio) {
      // Show conversation-relevant thought (funny observation about the code)
      return feedbackThought;
    }
    
    // Fall back to regular thought (mood/stats based)
    if (!this.state.currentThought) return null;
    
    // Thoughts last longer than system messages
    const thoughtAge = Date.now() - (this.state.thoughtTimestamp || 0);
    if (thoughtAge > 30000) { // 30 seconds
      return null;
    }
    
    return this.state.currentThought;
  }
  
  getFeedbackIcon(): string | null {
    if (!this.state) return null;
    return this.feedbackSystem.getFeedbackIcon(this.state);
  }
}