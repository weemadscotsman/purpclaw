class MushroomSkill {
  constructor() {
    this.name = 'mushroom';
    this.description = 'Trippy - hallucinations, weird ideas, underground network';
  }
  
  async hallucinate(seed) {
    return { hallucinated: true, seed };
  }
  
  async weird(idea) {
    return { weirded: true, idea };
  }
  
  async network() {
    return { networked: true };
  }
}

module.exports = MushroomSkill;