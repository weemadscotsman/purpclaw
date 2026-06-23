const { exec } = require('child_process');

class CactusSkill {
  constructor() {
    this.name = 'cactus';
    this.description = 'Prickly but effective debugger - efficient, direct, minimal pain';
    this.waterStorage = 100;
    this.fixes = [];
    this.owCount = 0;
  }

  async endure(condition) {
    const enduranceLevel = this.calculateEndurance(condition);

    return {
      endured: true,
      condition,
      enduranceLevel,
      resourcesUsed: this.waterStorage > 50 ? 'minimal' : 'critical',
      survived: true,
      timestamp: new Date().toISOString()
    };
  }

  calculateEndurance(condition) {
    if (typeof condition === 'number') {
      return Math.min(1, condition / 100);
    }
    if (condition.severity) {
      return condition.severity < 50 ? 0.9 : 0.3;
    }
    return 0.7;
  }

  async thrive(scarcity) {
    const scarcityLevel = typeof scarcity === 'number' ? scarcity : (scarcity.level || 0.5);
    const efficiency = scarcityLevel > 0.5 ? 0.9 : 0.5;
    const waterNeeded = scarcityLevel > 0.7 ? 20 : 5;

    this.waterStorage = Math.max(0, this.waterStorage - waterNeeded);

    return {
      thrived: true,
      scarcity: scarcityLevel,
      efficiency,
      waterUsed: waterNeeded,
      remainingWater: this.waterStorage,
      adaptations: this.determineAdaptations(scarcityLevel),
      timestamp: new Date().toISOString()
    };
  }

  determineAdaptations(scarcity) {
    const adaptations = ['water_conservation'];
    if (scarcity > 0.6) adaptations.push('slow_metabolism');
    if (scarcity > 0.8) adaptations.push('deep_roots');
    return adaptations;
  }

  async conserve(resources) {
    const original = { ...resources };
    const conserved = {};

    for (const [key, value] of Object.entries(resources)) {
      if (typeof value === 'number') {
        conserved[key] = Math.floor(value * 0.9);
      } else {
        conserved[key] = value;
      }
    }

    const waterSaved = this.waterStorage > 80 ? 10 : 2;

    return {
      conserved: true,
      original,
      conserved,
      waterSaved,
      remainingWater: this.waterStorage,
      efficiency: 'high',
      timestamp: new Date().toISOString()
    };
  }

  async store(resource, amount) {
    if (resource !== 'water') {
      return { stored: false, error: 'Cactus only stores water' };
    }

    this.waterStorage = Math.min(100, this.waterStorage + amount);

    return {
      stored: true,
      resource,
      amount,
      currentStorage: this.waterStorage,
      capacity: 100,
      timestamp: new Date().toISOString()
    };
  }

  async adapt(environment) {
    const temp = environment?.temperature || 25;
    const water = environment?.water || 50;
    const sunlight = environment?.sunlight || 50;

    const adaptations = [];
    let survivalRate = 0.8;

    if (temp > 40) {
      adaptations.push('heat_resistance');
      survivalRate += 0.1;
    }
    if (temp < 5) {
      adaptations.push('cold_resistance');
      survivalRate += 0.05;
    }
    if (water < 20) {
      adaptations.push('drought_resistance');
      survivalRate += 0.1;
      this.waterStorage = Math.max(0, this.waterStorage - 15);
    }
    if (sunlight > 80) {
      adaptations.push('uv_protection');
      survivalRate += 0.05;
    }

    return {
      adapted: true,
      environment: { temperature: temp, water, sunlight },
      adaptations,
      survivalRate: Math.min(1, survivalRate),
      waterRemaining: this.waterStorage,
      timestamp: new Date().toISOString()
    };
  }

  async debug(target) {
    this.owCount++;
    const result = {
      fixed: false,
      target,
      issues: [],
      fixes: []
    };

    try {
      if (typeof target === 'string') {
        result.issues.push({ type: 'unknown', detail: target });
      } else if (typeof target === 'object') {
        for (const [key, value] of Object.entries(target)) {
          if (value === null || value === undefined) {
            result.issues.push({ field: key, issue: 'null_value' });
            result.fixes.push({ field: key, fix: `defaulted_${key}` });
          }
          if (key === 'error' && value) {
            result.issues.push({ field: key, issue: 'error_present' });
            result.fixes.push({ field: key, fix: 'cleared_error' });
          }
        }
      }
      result.fixed = true;
    } catch (e) {
      result.error = e.message;
      result.fixed = false;
    }

    this.fixes.push({ ...result, timestamp: new Date().toISOString() });

    return {
      ...result,
      ow: true,
      owCount: this.owCount,
      message: 'Ow. Fixed it. Ow.'
    };
  }

  async pierce(thing) {
    const result = {
      pierced: true,
      subject: thing,
      observations: []
    };

    if (typeof thing === 'string') {
      result.observations.push(`String "${thing}" has length ${thing.length}`);
    } else if (Array.isArray(thing)) {
      result.observations.push(`Array with ${thing.length} items`);
    } else if (typeof thing === 'object') {
      const keys = Object.keys(thing);
      result.observations.push(`Object with ${keys.length} keys: ${keys.join(', ')}`);
    }

    return result;
  }

  async刺痛(target) {
    return this.debug(target);
  }

  async dry() {
    return {
      dried: true,
      waterLevel: this.waterStorage,
      status: this.waterStorage < 20 ? 'thirsty' : 'hydrated',
      timestamp: new Date().toISOString()
    };
  }

  async root(target) {
    return {
      rooted: true,
      target,
      depth: typeof target === 'object' ? Object.keys(target).length : 1,
      found: true
    };
  }

  async getOwCount() {
    return {
      totalFixes: this.fixes.length,
      owCount: this.owCount,
      recentFixes: this.fixes.slice(-3)
    };
  }
}

module.exports = CactusSkill;