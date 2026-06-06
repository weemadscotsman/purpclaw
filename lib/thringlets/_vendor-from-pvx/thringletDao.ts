import { eq } from 'drizzle-orm';
import { db } from './index';
import { thringlets } from './schema';
import { Thringlet } from '@shared/types';

/**
 * Data access object for Thringlets
 */
export class ThringletDao {
  /**
   * Create a new Thringlet
   * @param thringlet Thringlet to create
   * @returns Created Thringlet
   */
  async createThringlet(thringlet: Thringlet): Promise<Thringlet> {
    try {
      // Convert Thringlet to database format
      const dbThringlet = {
        id: thringlet.id,
        name: thringlet.name,
        ownerAddress: thringlet.ownerAddress,
        emotionState: thringlet.emotionState,
        personalityTraits: thringlet.personalityTraits,
        blockchainAffinities: thringlet.blockchainAffinities,
        level: thringlet.level,
        experience: thringlet.experience,
        backstory: thringlet.backstory,
        abilities: thringlet.abilities,
        lastInteraction: thringlet.lastInteraction,
        stats: thringlet.stats
      };

      // Insert Thringlet
      await db.insert(thringlets).values(dbThringlet);

      // Return original Thringlet
      return thringlet;
    } catch (error) {
      console.error('Error creating Thringlet:', error);
      throw new Error('Failed to create Thringlet');
    }
  }

  /**
   * Get Thringlet by ID
   * @param id Thringlet ID
   * @returns Thringlet or undefined if not found
   */
  async getThringletById(id: string): Promise<Thringlet | undefined> {
    try {
      const result = await db.select()
        .from(thringlets)
        .where(eq(thringlets.id, id))
        .limit(1);

      if (result.length === 0) {
        return undefined;
      }

      // Convert database format to Thringlet
      const dbThringlet = result[0];
      return {
        id: dbThringlet.id,
        name: dbThringlet.name,
        ownerAddress: dbThringlet.ownerAddress,
        emotionState: dbThringlet.emotionState as any,
        personalityTraits: dbThringlet.personalityTraits as any,
        blockchainAffinities: dbThringlet.blockchainAffinities as any,
        level: dbThringlet.level,
        experience: dbThringlet.experience,
        backstory: dbThringlet.backstory,
        abilities: dbThringlet.abilities as any,
        lastInteraction: Number(dbThringlet.lastInteraction),
        stats: dbThringlet.stats as any
      };
    } catch (error) {
      console.error('Error getting Thringlet by ID:', error);
      throw new Error('Failed to get Thringlet');
    }
  }

  /**
   * Get Thringlets by owner address
   * @param ownerAddress Owner wallet address
   * @returns Array of Thringlets
   */
  async getThringletsByOwner(ownerAddress: string): Promise<Thringlet[]> {
    try {
      const result = await db.select()
        .from(thringlets)
        .where(eq(thringlets.ownerAddress, ownerAddress));

      // Convert database format to Thringlet[]
      return result.map(dbThringlet => ({
        id: dbThringlet.id,
        name: dbThringlet.name,
        ownerAddress: dbThringlet.ownerAddress,
        emotionState: dbThringlet.emotionState as any,
        personalityTraits: dbThringlet.personalityTraits as any,
        blockchainAffinities: dbThringlet.blockchainAffinities as any,
        level: dbThringlet.level,
        experience: dbThringlet.experience,
        backstory: dbThringlet.backstory,
        abilities: dbThringlet.abilities as any,
        lastInteraction: Number(dbThringlet.lastInteraction),
        stats: dbThringlet.stats as any
      }));
    } catch (error) {
      console.error('Error getting Thringlets by owner:', error);
      throw new Error('Failed to get Thringlets');
    }
  }

  /**
   * Update a Thringlet
   * @param thringlet Thringlet to update
   * @returns Updated Thringlet
   */
  async updateThringlet(thringlet: Thringlet): Promise<Thringlet> {
    try {
      // Check if Thringlet exists
      const existingThringlet = await this.getThringletById(thringlet.id);
      if (!existingThringlet) {
        return this.createThringlet(thringlet);
      }

      // Convert Thringlet to database format
      const dbThringlet = {
        name: thringlet.name,
        ownerAddress: thringlet.ownerAddress,
        emotionState: thringlet.emotionState,
        personalityTraits: thringlet.personalityTraits,
        blockchainAffinities: thringlet.blockchainAffinities,
        level: thringlet.level,
        experience: thringlet.experience,
        backstory: thringlet.backstory,
        abilities: thringlet.abilities,
        lastInteraction: thringlet.lastInteraction,
        stats: thringlet.stats,
        updatedAt: new Date()
      };

      // Update Thringlet
      await db.update(thringlets)
        .set(dbThringlet)
        .where(eq(thringlets.id, thringlet.id));

      // Return updated Thringlet
      return thringlet;
    } catch (error) {
      console.error('Error updating Thringlet:', error);
      throw new Error('Failed to update Thringlet');
    }
  }

  /**
   * Update Thringlet emotion state
   * @param id Thringlet ID
   * @param emotionState New emotion state
   * @returns Updated Thringlet
   */
  async updateEmotionState(id: string, emotionState: string): Promise<Thringlet | undefined> {
    try {
      // Get existing Thringlet
      const thringlet = await this.getThringletById(id);
      if (!thringlet) {
        return undefined;
      }

      // Update emotion state
      thringlet.emotionState = emotionState as any;
      thringlet.lastInteraction = Date.now();

      // Save Thringlet
      return await this.updateThringlet(thringlet);
    } catch (error) {
      console.error('Error updating Thringlet emotion state:', error);
      throw new Error('Failed to update Thringlet emotion state');
    }
  }

  /**
   * Add experience to a Thringlet and level up if needed
   * @param id Thringlet ID
   * @param experience Experience to add
   * @returns Updated Thringlet
   */
  async addExperience(id: string, experience: number): Promise<Thringlet | undefined> {
    try {
      // Get existing Thringlet
      const thringlet = await this.getThringletById(id);
      if (!thringlet) {
        return undefined;
      }

      // Add experience
      thringlet.experience += experience;
      thringlet.lastInteraction = Date.now();

      // Check if Thringlet should level up
      // This is a simplified level up calculation - adjust as needed
      const nextLevelThreshold = thringlet.level * 1000;
      if (thringlet.experience >= nextLevelThreshold) {
        thringlet.level++;
        // Could also add new abilities or stats when leveling up
      }

      // Save Thringlet
      return await this.updateThringlet(thringlet);
    } catch (error) {
      console.error('Error adding experience to Thringlet:', error);
      throw new Error('Failed to add experience to Thringlet');
    }
  }

  /**
   * Transfer a Thringlet to a new owner
   * @param id Thringlet ID
   * @param newOwnerAddress New owner address
   * @returns Updated Thringlet
   */
  async transferThringlet(id: string, newOwnerAddress: string): Promise<Thringlet | undefined> {
    try {
      // Get existing Thringlet
      const thringlet = await this.getThringletById(id);
      if (!thringlet) {
        return undefined;
      }

      // Update owner
      thringlet.ownerAddress = newOwnerAddress;
      thringlet.lastInteraction = Date.now();

      // Save Thringlet
      return await this.updateThringlet(thringlet);
    } catch (error) {
      console.error('Error transferring Thringlet:', error);
      throw new Error('Failed to transfer Thringlet');
    }
  }

  /**
   * Delete a Thringlet
   * @param id Thringlet ID
   * @returns Success status
   */
  async deleteThringlet(id: string): Promise<boolean> {
    try {
      await db.delete(thringlets)
        .where(eq(thringlets.id, id));

      return true;
    } catch (error) {
      console.error('Error deleting Thringlet:', error);
      throw new Error('Failed to delete Thringlet');
    }
  }

  /**
   * Fuse two Thringlets to create a new one
   * @param thringletA First parent Thringlet ID
   * @param thringletB Second parent Thringlet ID
   * @param ownerAddress Owner address for the new Thringlet
   * @returns Newly created Thringlet
   */
  async fuseThringlets(thringletA: string, thringletB: string, ownerAddress: string): Promise<Thringlet | undefined> {
    try {
      // Get parent Thringlets
      const parentA = await this.getThringletById(thringletA);
      const parentB = await this.getThringletById(thringletB);

      if (!parentA || !parentB) {
        return undefined;
      }

      // Generate new Thringlet properties based on parents
      // This is a simplified fusion logic - adjust as needed
      const newThringlet: Thringlet = {
        id: `THR_${Date.now().toString(16)}`,
        name: `${parentA.name.substring(0, 3)}${parentB.name.substring(0, 3)}`,
        ownerAddress,
        emotionState: Math.random() > 0.5 ? parentA.emotionState : parentB.emotionState,
        personalityTraits: {
          ...parentA.personalityTraits,
          ...parentB.personalityTraits
        },
        blockchainAffinities: {
          ...parentA.blockchainAffinities,
          ...parentB.blockchainAffinities
        },
        level: 1,
        experience: 0,
        backstory: `Born from the fusion of ${parentA.name} and ${parentB.name}`,
        abilities: [
          ...(parentA.abilities || []).slice(0, 2),
          ...(parentB.abilities || []).slice(0, 2)
        ],
        lastInteraction: Date.now(),
        stats: {
          strength: Math.round((parentA.stats.strength + parentB.stats.strength) / 2),
          intelligence: Math.round((parentA.stats.intelligence + parentB.stats.intelligence) / 2),
          agility: Math.round((parentA.stats.agility + parentB.stats.agility) / 2),
          charisma: Math.round((parentA.stats.charisma + parentB.stats.charisma) / 2)
        }
      };

      // Create the new Thringlet
      return await this.createThringlet(newThringlet);
    } catch (error) {
      console.error('Error fusing Thringlets:', error);
      throw new Error('Failed to fuse Thringlets');
    }
  }
}

// Create a singleton instance
export const thringletDao = new ThringletDao();