class GooseSkill {
  constructor() {
    this.name = 'goose';
    this.description = 'Defender - guards, alerts, aggressive protection';
  }
  
  async guard(what) {
    return { guarded: true, what };
  }
  
  async alert(message) {
    return { alerted: true, message };
  }
  
  async protect(asset) {
    return { protected: true, asset };
  }
}

module.exports = GooseSkill;
