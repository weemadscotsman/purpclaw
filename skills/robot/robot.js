class RobotSkill {
  constructor() {
    this.name = 'robot';
    this.description = 'Machine - precise, repetitive automation';
  }
  
  async precise(operation) {
    return { precisioned: true, operation };
  }
  
  async repeat(times, action) {
    return { repeated: true, times, action };
  }
  
  async automate(process) {
    return { automated: true, process };
  }
}

module.exports = RobotSkill;
