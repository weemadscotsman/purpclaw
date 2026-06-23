class TurtleSkill {
  constructor() {
    this.name = 'turtle';
    this.description = 'Steady - slow and stable, defensive';
  }
  
  async slow(operation) {
    return { slowed: true, operation };
  }
  
  async stable(system) {
    return { stabilized: true, system };
  }
  
  async defend(attack) {
    return { defended: true, attack };
  }
}

module.exports = TurtleSkill;
