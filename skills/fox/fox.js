class FoxSkill {
  constructor() {
    this.name = 'fox';
    this.description = 'Trickster - creative problem solving, chaos';
  }
  
  async trick(problem) {
    return { tricked: true, problem };
  }
  
  async solve(puzzle) {
    return { solved: true, puzzle };
  }
  
  async chaos() {
    return { chaosed: true };
  }
}

module.exports = FoxSkill;
