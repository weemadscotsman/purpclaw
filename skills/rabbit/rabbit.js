class RabbitSkill {
  constructor() {
    this.name = 'rabbit';
    this.description = 'Speed - fast execution, racing';
  }
  
  async fast(task) {
    return { fasted: true, task };
  }
  
  async race(against) {
    return { raced: true, against };
  }
  
  async sprint(goal) {
    return { sprinted: true, goal };
  }
}

module.exports = RabbitSkill;
