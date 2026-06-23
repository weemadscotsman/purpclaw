class DuckSkill {
  constructor() {
    this.name = 'duck';
    this.description = 'Utility - debugs, assists, calm under pressure';
  }
  
  async debug(code) {
    return { debugged: true, code };
  }
  
  async assist(task) {
    return { assisted: true, task };
  }
}

module.exports = DuckSkill;
