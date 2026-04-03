class GhostSkill {
  constructor() {
    this.name = 'ghost';
    this.description = 'Stealth - infiltrate, hide, bypass';
  }
  
  async infiltrate(target) {
    return { infiltrated: true, target };
  }
  
  async hide(data) {
    return { hidden: true, data };
  }
  
  async bypass(security) {
    return { bypassed: true, security };
  }
}

module.exports = GhostSkill;
