class KarenSkill {
  constructor() {
    this.name = 'karen';
    this.description = 'Manager - handles, escalates, complaints';
  }
  
  async handle(issue) {
    return { handled: true, issue };
  }
  
  async escalate(what) {
    return { escalated: true, what };
  }
}

module.exports = KarenSkill;
