class WolfSkill {
  constructor() {
    this.name = 'wolf';
    this.description = 'Pack Leader - commands, leads, alpha';
  }
  
  async command(order) {
    return { commanded: true, order };
  }
  
  async lead(team) {
    return { led: true, team };
  }
  
  async alpha() {
    return { alphaed: true };
  }
  
  async coordinate(agents) {
    return { coordinated: true, agents };
  }
}

module.exports = WolfSkill;
