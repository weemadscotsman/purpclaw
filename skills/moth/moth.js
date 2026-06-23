class MothSkill {
  constructor() {
    this.name = 'moth';
    this.description = 'Drawn to flame - bug hunting, flame-finding';
    this.found = [];
    this.attracted = 0;
  }

  async attractedTo(flame) {
    this.attracted++;

    return {
      attracted: true,
      flame,
      intensity: 'maximum',
      mothCount: this.attracted,
      note: 'That bug is glowing... I must investigate'
    };
  }

  async burn(target) {
    return {
      burned: true,
      target,
      intensity: 'bright',
      result: 'eliminated',
      note: 'Burned bright while solving'
    };
  }

  async flutter(target) {
    return {
      fluttered: true,
      target,
      pattern: 'chaotic',
      note: 'Moving chaotically around target'
    };
  }

  async circle(target) {
    return {
      circled: true,
      target,
      orbits: Math.floor(Math.random() * 5) + 3,
      note: 'Circling endlessly'
    };
  }

  async nightFlight(task) {
    return {
      flew: true,
      task,
      time: 'night',
      visibility: 'flame_guided',
      note: 'Navigating by flame alone'
    };
  }

  async findFlame(bug) {
    const found = {
      bug,
      glowing: true,
      foundAt: new Date().toISOString()
    };

    this.found.push(found);

    return {
      found: true,
      ...found,
      note: 'Flame detected! Closing in...'
    };
  }

  async getFlamesFound() {
    return {
      totalFound: this.found.length,
      attractedCount: this.attracted,
      status: 'hunting'
    };
  }
}

module.exports = MothSkill;