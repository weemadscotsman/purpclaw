class PenguinSkill {
  constructor() {
    this.name = 'penguin';
    this.description = 'Cool - cold calculations, precise';
  }
  
  async calculate(formula) {
    return { calculated: true, formula };
  }
  
  async cold(operation) {
    return { colded: true, operation };
  }
}

module.exports = PenguinSkill;
