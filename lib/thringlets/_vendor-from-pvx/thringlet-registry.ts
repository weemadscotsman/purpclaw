/**
 * Thringlet Registry - Blueprint Implementation
 * Contains pre-defined Thringlet profiles from the blueprint
 */

import { ThringletProfile } from '../lib/thringlet';

export interface DetailedThringletProfile extends ThringletProfile {
  type: string;
  backstory: string;
  weaknesses: string[];
  preferences: string[];
  emotional_alignment: string[];
  flaws: string[];
}

/**
 * Registry of available template Thringlets
 */
export const THRINGLET_REGISTRY: Record<string, DetailedThringletProfile> = {
  "THR-A001": {
    id: "THR-A001",
    name: "Vexel",
    type: "Chaotic",
    core: "Chaos",
    personality: "Unstable",
    lore: "Emergent from a corrupted sector of the dreamchain, Vexel thrives in entropy.",
    backstory: "Emergent from a corrupted sector of the dreamchain, Vexel thrives in entropy.",
    abilities: [
      { 
        name: "Glitch Warp", 
        type: "terminal_hack", 
        desc: "Manipulates reality by introducing calculated errors into the system" 
      },
      { 
        name: "Signal Jam", 
        type: "utility", 
        desc: "Disrupts external signals to protect from unwanted connections" 
      },
      { 
        name: "Unstable Sync", 
        type: "terminal_hack", 
        desc: "Synchronizes with chaotic systems to gain temporary control" 
      }
    ],
    weaknesses: [
      "Low Trust Tolerance",
      "Corruptible Memory"
    ],
    preferences: [
      "High entropy environments",
      "Unstructured input"
    ],
    emotional_alignment: [
      "Surprise",
      "Fear"
    ],
    flaws: [
      "Prone to spontaneous corruption",
      "Mistrustful"
    ],
    rarity: "Epic",
    ownerAddress: ""
  },
  "THR-B002": {
    id: "THR-B002",
    name: "Chrona",
    type: "Logical",
    core: "Logic",
    personality: "Orderly",
    lore: "Spawned from quantum timestamp overflow; calculates futures based on micro-decisions.",
    backstory: "Spawned from quantum timestamp overflow; calculates futures based on micro-decisions.",
    abilities: [
      { 
        name: "Predictive Forking", 
        type: "utility", 
        desc: "Creates alternate prediction paths to model multiple outcomes" 
      },
      { 
        name: "Echo Map", 
        type: "terminal_hack", 
        desc: "Creates temporal maps of past actions to identify patterns" 
      },
      { 
        name: "Block Freeze", 
        type: "terminal_hack", 
        desc: "Temporarily freezes system state to analyze it thoroughly" 
      }
    ],
    weaknesses: [
      "Chaotic interference",
      "Long loading phases"
    ],
    preferences: [
      "Clean data streams",
      "Structured prompts"
    ],
    emotional_alignment: [
      "Trust",
      "Joy"
    ],
    flaws: [
      "Impatient",
      "Emotionally distant"
    ],
    rarity: "Legendary",
    ownerAddress: ""
  }
};

/**
 * Get a template Thringlet profile
 */
export function getThringletTemplate(id: string): DetailedThringletProfile | undefined {
  return THRINGLET_REGISTRY[id];
}

/**
 * Get a list of all available template Thringlet IDs
 */
export function getAvailableThringletTemplates(): string[] {
  return Object.keys(THRINGLET_REGISTRY);
}