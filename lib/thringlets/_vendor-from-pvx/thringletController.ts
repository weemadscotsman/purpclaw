import { Request, Response } from 'express';
import crypto from 'crypto';
import { 
  type ThringletEmotionState, 
  ThringletPersonalityTrait, 
  BlockchainAffinity 
} from '@shared/types';
import { thringletStorage, Thringlet } from '../storage/thringlet-storage';
import { checkThringletBadges } from '../controllers/badgeController';
import { personalityService } from '../services/personality-service';

/**
 * Process input to thringlet emotion engine
 * POST /api/thringlet/input
 */
export const processInput = async (req: Request, res: Response) => {
  try {
    const { thringletId, input, ownerAddress } = req.body;
    
    if (!thringletId || !input) {
      return res.status(400).json({ error: 'Thringlet ID and input are required' });
    }
    
    // Get thringlet
    const thringlet = await thringletStorage.getThringlet(thringletId);
    if (!thringlet) {
      return res.status(404).json({ error: 'Thringlet not found' });
    }
    
    // Verify ownership if owner address provided
    if (ownerAddress && thringlet.owner !== ownerAddress) {
      return res.status(403).json({ error: 'You do not own this thringlet' });
    }
    
    // Process input (simplified emotion engine logic)
    let newState = thringlet.emotionState;
    const inputLower = input.toLowerCase();
    
    if (inputLower.includes('happy') || inputLower.includes('joy') || inputLower.includes('excited')) {
      newState = 'happy' as ThringletEmotionState;
    } else if (inputLower.includes('sad') || inputLower.includes('unhappy') || inputLower.includes('depressed')) {
      newState = 'sad' as ThringletEmotionState;
    } else if (inputLower.includes('angry') || inputLower.includes('mad') || inputLower.includes('furious')) {
      newState = 'angry' as ThringletEmotionState;
    } else if (inputLower.includes('tired') || inputLower.includes('sleepy') || inputLower.includes('exhausted')) {
      newState = 'neutral' as ThringletEmotionState; // No 'tired' in our type, using neutral instead
    } else if (inputLower.includes('hungry') || inputLower.includes('food') || inputLower.includes('eat')) {
      newState = 'neutral' as ThringletEmotionState; // No 'hungry' in our type, using neutral instead
    } else if (inputLower.includes('excited') || inputLower.includes('thrilled')) {
      newState = 'excited' as ThringletEmotionState;
    } else {
      // Random state change with low probability
      if (Math.random() < 0.2) {
        const states: ThringletEmotionState[] = ['happy', 'sad', 'excited', 'neutral', 'angry', 'curious'];
        newState = states[Math.floor(Math.random() * states.length)];
      }
    }
    
    // Update thringlet state
    const updatedThringlet = {
      ...thringlet,
      emotionState: newState,
      lastInteraction: Date.now(),
      experience: thringlet.experience + 10,
    };
    
    // Add to emotion history
    if (!updatedThringlet.stateHistory) {
      updatedThringlet.stateHistory = [];
    }
    
    updatedThringlet.stateHistory.push({
      state: newState,
      timestamp: Date.now(),
      trigger: input
    });
    
    // Limit history size
    if (updatedThringlet.stateHistory.length > 50) {
      updatedThringlet.stateHistory = updatedThringlet.stateHistory.slice(-50);
    }
    
    // Level up if enough experience
    if (updatedThringlet.experience >= updatedThringlet.level * 100) {
      updatedThringlet.level += 1;
      
      // Add new ability at certain levels
      if (updatedThringlet.level % 5 === 0) {
        const newAbilities = [
          'teleport',
          'invisibility',
          'mind_reading',
          'healing',
          'time_freeze',
          'energy_burst',
          'shapeshifting'
        ];
        
        // Add a random ability if not already present
        let newAbility: string;
        do {
          newAbility = newAbilities[Math.floor(Math.random() * newAbilities.length)];
        } while (updatedThringlet.abilities.includes(newAbility));
        
        updatedThringlet.abilities.push(newAbility);
      }
    }
    
    // Save updated thringlet
    await thringletStorage.updateThringlet(thringletId, updatedThringlet);

    // Check for Thringlet-related badges if an owner address is provided
    if (ownerAddress) {
      try {
        // Award badges based on thringlet level, interaction count, and state changes
        // Get all thringlets owned by this user to count them
        const userThringlets = await thringletStorage.getThringletsByOwner(ownerAddress);
        const thringletCount = userThringlets?.length || 1;
        
        // Use all 4 required parameters for the checkThringletBadges function
        await checkThringletBadges(
          ownerAddress, 
          updatedThringlet.level, 
          0,  // Evolution parameter (using 0 as default)
          thringletCount  // Count of thringlets owned
        );
      } catch (err) {
        console.error('Error checking thringlet badges:', err);
        // Continue even if badge check fails
      }
    }
    
    res.json({
      id: thringletId,
      emotionState: updatedThringlet.emotionState,
      level: updatedThringlet.level,
      experience: updatedThringlet.experience,
      lastInteraction: updatedThringlet.lastInteraction
    });
  } catch (error) {
    console.error('Error processing thringlet input:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to process thringlet input'
    });
  }
};

/**
 * Get current thringlet status
 * GET /api/thringlet/status/:id
 */
export const getStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // Get thringlet
    const thringlet = await thringletStorage.getThringlet(id);
    if (!thringlet) {
      return res.status(404).json({ error: 'Thringlet not found' });
    }
    
    // Calculate time since last interaction
    const now = Date.now();
    const timeSinceLastInteraction = now - thringlet.lastInteraction;
    const hoursSinceLastInteraction = timeSinceLastInteraction / (60 * 60 * 1000);
    
    // Thringlet gets hungry or tired if not interacted with for a while
    let currentState = thringlet.emotionState;
    if (hoursSinceLastInteraction > 24) {
      if (Math.random() < 0.5) {
        currentState = 'neutral' as ThringletEmotionState; // Using neutral instead of hungry
      } else {
        currentState = 'sad' as ThringletEmotionState; // Using sad instead of tired
      }
      
      // Update thringlet state
      await thringletStorage.updateThringlet(id, { ...thringlet, emotionState: currentState });
    }
    
    res.json({
      id: thringlet.id,
      name: thringlet.name,
      emotionState: currentState,
      level: thringlet.level,
      experience: thringlet.experience,
      abilities: thringlet.abilities,
      visual: thringlet.visual,
      lastInteraction: thringlet.lastInteraction
    });
  } catch (error) {
    console.error('Error getting thringlet status:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get thringlet status'
    });
  }
};

/**
 * Get thringlet emotion history
 * GET /api/thringlet/emotions/:id
 */
export const getEmotionHistory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // Get thringlet
    const thringlet = await thringletStorage.getThringlet(id);
    if (!thringlet) {
      return res.status(404).json({ error: 'Thringlet not found' });
    }
    
    // Get limit from query
    const limit = parseInt(req.query.limit as string) || 10;
    
    // Get emotion history
    const history = thringlet.stateHistory || [];
    
    // Return limited history
    res.json({
      id: thringlet.id,
      history: history.slice(-limit).map((entry: { state: ThringletEmotionState; timestamp: number; trigger: string }) => ({
        state: entry.state,
        timestamp: entry.timestamp,
        trigger: entry.trigger
      }))
    });
  } catch (error) {
    console.error('Error getting thringlet emotion history:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get thringlet emotion history'
    });
  }
};

/**
 * Create new thringlet
 * POST /api/thringlet/create
 */
export const createThringlet = async (req: Request, res: Response) => {
  try {
    const { name, ownerAddress } = req.body;
    
    if (!name || !ownerAddress) {
      return res.status(400).json({ error: 'Name and owner address are required' });
    }
    
    // Generate unique ID
    const id = crypto.randomBytes(16).toString('hex');
    
    // Generate random visual properties
    const colors = ['blue', 'green', 'purple', 'pink', 'teal', 'orange', 'red'];
    const baseColor = colors[Math.floor(Math.random() * colors.length)];
    const eyeColor = colors[Math.floor(Math.random() * colors.length)];
    const appendages = Math.floor(Math.random() * 6) + 2; // 2-7 appendages
    
    const specialFeatures: string[] = [];
    const possibleFeatures = [
      'glowing_eyes', 'horn', 'wings', 'scales', 'spikes', 
      'multiple_eyes', 'tentacles', 'smoke', 'crystal_growths'
    ];
    
    // Add 1-3 random special features
    const featureCount = Math.floor(Math.random() * 3) + 1;
    for (let i = 0; i < featureCount; i++) {
      const feature = possibleFeatures[Math.floor(Math.random() * possibleFeatures.length)];
      if (!specialFeatures.includes(feature)) {
        specialFeatures.push(feature);
      }
    }
    
    // Generate personality traits
    const personality = personalityService.generateInitialPersonality();
    
    // Create thringlet with personality traits
    const thringlet: Thringlet = {
      id,
      name,
      owner: ownerAddress,
      createdAt: Date.now(),
      lastInteraction: Date.now(),
      emotionState: 'neutral' as ThringletEmotionState,
      level: 1,
      experience: 0,
      abilities: ['basic_movement'],
      // Personality system
      personalityTraits: personality.personalityTraits,
      dominantTrait: personality.dominantTrait,
      blockchainAffinities: personality.blockchainAffinities,
      dominantAffinity: personality.dominantAffinity,
      traitIntensity: personality.traitIntensity,
      // Blockchain activity influences
      miningInfluence: personality.miningInfluence,
      stakingInfluence: personality.stakingInfluence,
      tradingInfluence: personality.tradingInfluence,
      governanceInfluence: personality.governanceInfluence,
      // Visual appearance
      visual: {
        baseColor,
        eyeColor,
        appendages,
        specialFeatures
      },
      stateHistory: [{
        state: 'neutral' as ThringletEmotionState,
        timestamp: Date.now(),
        trigger: 'creation'
      }]
    };
    
    // Save thringlet
    await thringletStorage.createThringlet(thringlet);
    
    // Check for a first Thringlet creation badge
    try {
      // Get count of thringlets owned by this address to check if this is their first
      const ownedThringlets = await thringletStorage.getThringletsByOwner(ownerAddress);
      await checkThringletBadges(ownerAddress, 1, 0, ownedThringlets.length);
    } catch (err) {
      console.error('Error checking thringlet creation badges:', err);
      // Continue even if badge check fails
    }
    
    res.status(201).json({
      id,
      name,
      owner: ownerAddress,
      emotionState: 'neutral' as ThringletEmotionState,
      visual: thringlet.visual
    });
  } catch (error) {
    console.error('Error creating thringlet:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to create thringlet'
    });
  }
};

/**
 * Get all thringlets
 * GET /api/thringlet/all
 */
export const getAllThringlets = async (req: Request, res: Response) => {
  try {
    // Get all thringlets
    let allThringlets = await thringletStorage.getAllThringlets();
    
    // Filter by owner if provided
    const { owner } = req.query;
    if (owner && typeof owner === 'string') {
      allThringlets = allThringlets.filter(thringlet => thringlet.owner === owner);
    }
    
    // Format response
    const thringletsList = allThringlets.map(thringlet => ({
      id: thringlet.id,
      name: thringlet.name,
      owner: thringlet.owner,
      emotionState: thringlet.emotionState,
      level: thringlet.level,
      experience: thringlet.experience,
      lastInteraction: thringlet.lastInteraction,
      visual: thringlet.visual
    }));
    
    res.json(thringletsList);
  } catch (error) {
    console.error('Error getting all thringlets:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get thringlets'
    });
  }
};

/**
 * Get thringlet personality traits
 * GET /api/thringlet/personality/:id
 */
export const getThringletPersonality = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // Get thringlet
    const thringlet = await thringletStorage.getThringlet(id);
    if (!thringlet) {
      return res.status(404).json({ error: 'Thringlet not found' });
    }
    
    // Return personality data
    res.json({
      id: thringlet.id,
      personalityTraits: thringlet.personalityTraits,
      dominantTrait: thringlet.dominantTrait,
      blockchainAffinities: thringlet.blockchainAffinities,
      dominantAffinity: thringlet.dominantAffinity,
      traitIntensity: thringlet.traitIntensity,
      miningInfluence: thringlet.miningInfluence,
      stakingInfluence: thringlet.stakingInfluence,
      tradingInfluence: thringlet.tradingInfluence,
      governanceInfluence: thringlet.governanceInfluence
    });
  } catch (error) {
    console.error('Error getting thringlet personality:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get thringlet personality'
    });
  }
};

/**
 * Update thringlet personality based on blockchain activity
 * POST /api/thringlet/update-personality
 */
export const updatePersonalityFromActivity = async (req: Request, res: Response) => {
  try {
    const { thringletId } = req.body;
    
    if (!thringletId) {
      return res.status(400).json({ error: 'Thringlet ID is required' });
    }
    
    // Get thringlet
    const thringlet = await thringletStorage.getThringlet(thringletId);
    if (!thringlet) {
      return res.status(404).json({ error: 'Thringlet not found' });
    }
    
    // Update personality based on blockchain activity
    const updates = await personalityService.updatePersonalityFromBlockchainActivity(thringlet);
    
    if (Object.keys(updates).length === 0) {
      return res.json({
        id: thringletId,
        message: 'No personality changes detected',
        updated: false
      });
    }
    
    // Apply updates
    const updatedThringlet = await thringletStorage.updateThringlet(thringletId, updates);
    
    res.json({
      id: thringletId,
      message: 'Personality updated based on blockchain activity',
      updated: true,
      changes: {
        dominantTrait: updates.dominantTrait !== thringlet.dominantTrait,
        emotionState: updates.emotionState !== thringlet.emotionState,
        experience: updates.experience !== thringlet.experience
      }
    });
  } catch (error) {
    console.error('Error updating thringlet personality:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to update thringlet personality'
    });
  }
};

/**
 * Get personalized response from thringlet based on personality
 * POST /api/thringlet/personality-response
 */
export const getGenericPersonality = async (_req: Request, res: Response) => {
  try {
    // Generate a set of generic personality traits
    const traits = [
      { trait: 'ADAPTIVE', value: Math.floor(Math.random() * 100) },
      { trait: 'ANALYTICAL', value: Math.floor(Math.random() * 100) },
      { trait: 'BOLD', value: Math.floor(Math.random() * 100) },
      { trait: 'CAUTIOUS', value: Math.floor(Math.random() * 100) },
      { trait: 'CREATIVE', value: Math.floor(Math.random() * 100) },
      { trait: 'CURIOUS', value: Math.floor(Math.random() * 100) },
      { trait: 'EFFICIENT', value: Math.floor(Math.random() * 100) }
    ];
    
    // Find the dominant trait
    const dominantTrait = traits.reduce((max, trait) => 
      trait.value > max.value ? trait : max, traits[0]);
    
    // Generate blockchain affinities
    const blockchainAffinities = [
      { type: 'MINING', value: Math.floor(Math.random() * 100) },
      { type: 'STAKING', value: Math.floor(Math.random() * 100) },
      { type: 'TRADING', value: Math.floor(Math.random() * 100) },
      { type: 'GOVERNANCE', value: Math.floor(Math.random() * 100) }
    ];
    
    // Find the dominant affinity
    const dominantAffinity = blockchainAffinities.reduce((max, affinity) => 
      affinity.value > max.value ? affinity : max, blockchainAffinities[0]);
    
    // Return the personality data
    res.json({
      personalityTraits: traits,
      dominantTrait: dominantTrait.trait,
      blockchainAffinities: blockchainAffinities,
      dominantAffinity: dominantAffinity.type,
      traitIntensity: Math.floor(Math.random() * 100),
      miningInfluence: Math.floor(Math.random() * 10),
      stakingInfluence: Math.floor(Math.random() * 10),
      tradingInfluence: Math.floor(Math.random() * 10),
      governanceInfluence: Math.floor(Math.random() * 10)
    });
  } catch (error) {
    console.error('Error generating generic personality:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to generate generic personality'
    });
  }
};

export const getPersonalizedResponse = async (req: Request, res: Response) => {
  try {
    const { thringletId, input } = req.body;
    
    if (!thringletId || !input) {
      return res.status(400).json({ error: 'Thringlet ID and input are required' });
    }
    
    // Get thringlet
    const thringlet = await thringletStorage.getThringlet(thringletId);
    if (!thringlet) {
      return res.status(404).json({ error: 'Thringlet not found' });
    }
    
    // Get personalized response
    const response = personalityService.getPersonalizedResponse(thringlet, input);
    
    res.json({
      id: thringletId,
      input,
      response,
      personality: {
        dominantTrait: thringlet.dominantTrait,
        dominantAffinity: thringlet.dominantAffinity
      }
    });
  } catch (error) {
    console.error('Error getting personalized thringlet response:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get personalized response'
    });
  }
};