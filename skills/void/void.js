class VoidSkill {
  constructor() {
    this.name = 'void';
    this.description = 'Eraser - deletes, nullifies, empties';
  }
  
  async delete(target) {
    return { deleted: true, target };
  }
  
  async nullify(data) {
    return { nullified: true, data };
  }
  
  async empty() {
    return { emptied: true };
  }
}

module.exports = VoidSkill;
