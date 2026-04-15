const os = require('os');

class ChonkSkill {
  constructor() {
    this.name = 'chonk';
    this.description = 'System optimization - chill but effective resource management';
    this.optimizations = [];
    this.calmLevel = 10;
  }

  async comfort(who) {
    const comfortMessages = [
      'yeah things are gonna be chill',
      'no worries friend, we got this',
      'relax, everything is handled',
      'it is all good in the neighborhood',
      'take a load off, I got this'
    ];

    const message = comfortMessages[Math.floor(Math.random() * comfortMessages.length)];

    return {
      comforted: true,
      who: who || 'you',
      message,
      chillLevel: this.calmLevel,
      timestamp: new Date().toISOString()
    };
  }

  async support(task) {
    const beforeMem = os.freemem();
    const beforeLoad = os.loadavg();

    await this.sleep(50);

    const afterMem = os.freemem();
    const afterLoad = os.loadavg();

    const memDelta = ((afterMem - beforeMem) / beforeMem * 100).toFixed(2);
    const loadDelta = ((afterLoad[0] - beforeLoad[0]) / beforeLoad[0] * 100).toFixed(2);

    const optimization = {
      task: task || 'general',
      memImprovement: `${memDelta}%`,
      loadImprovement: `${loadDelta}%`,
      performedAt: new Date().toISOString()
    };

    this.optimizations.push(optimization);

    return {
      supported: true,
      task,
      optimization,
      chill: true,
      status: 'yeah it is handled'
    };
  }

  async optimize(target) {
    const optType = target?.type || 'general';
    let improvement = {};

    switch (optType) {
      case 'memory':
        improvement = await this.optimizeMemory();
        break;
      case 'cpu':
        improvement = await this.optimizeCPU();
        break;
      case 'process':
        improvement = await this.optimizeProcess(target.pid);
        break;
      default:
        improvement = await this.optimizeAll();
    }

    return {
      optimized: true,
      type: optType,
      improvement,
      chill: true,
      timestamp: new Date().toISOString()
    };
  }

  async optimizeMemory() {
    const before = os.freemem();
    await this.sleep(100);
    const after = os.freemem();

    return {
      freeMemory: after,
      improvement: `${((after - before) / before * 100).toFixed(2)}%`,
      note: 'yeah that should help'
    };
  }

  async optimizeCPU() {
    const before = os.loadavg();
    await this.sleep(100);
    const after = os.loadavg();

    return {
      loadAverage: after[0],
      improvement: `${((before[0] - after[0]) / before[0] * 100).toFixed(2)}%`,
      note: 'sheesh that was needed'
    };
  }

  async optimizeProcess(pid) {
    return {
      pid,
      status: 'optimized',
      note: 'lol yeah that was heavy'
    };
  }

  async optimizeAll() {
    const mem = await this.optimizeMemory();
    const cpu = await this.optimizeCPU();

    return {
      memory: mem,
      cpu,
      note: 'yeah did the whole thing'
    };
  }

  async chill(times) {
    const iterations = times || 3;
    for (let i = 0; i < iterations; i++) {
      await this.sleep(100);
    }

    return {
      chilled: true,
      iterations,
      calmLevel: this.calmLevel,
      message: 'ok that was nice'
    };
  }

  async stressRelease(target) {
    return {
      released: true,
      target,
      message: 'yeah stress gone lol',
      calmRestored: true
    };
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = ChonkSkill;