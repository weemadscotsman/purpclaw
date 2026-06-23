class DragonSkill {
  constructor() {
    this.name = 'dragon';
    this.description = 'Warrior - combat, defend, power';
  }
  
  async combat(target) {
    return { combated: true, target };
  }
  
  async defend(what) {
    return { defended: true, what };
  }
  
  async power(level) {
    return { powered: true, level };
  }
}

module.exports = DragonSkill;
