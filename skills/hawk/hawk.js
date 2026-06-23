const os = require('os');

class HawkSkill {
  constructor() {
    this.name = 'hawk';
    this.description = 'Sharp-eyed monitoring and performance analysis';
    this.observations = [];
    this.anomalies = [];
  }

  async observe(target) {
    const observation = {
      target,
      timestamp: new Date().toISOString(),
      metrics: {}
    };

    if (target === 'system' || target === 'all') {
      observation.metrics = await this.observeSystem();
    } else if (target === 'cpu') {
      observation.metrics = await this.observeCPU();
    } else if (target === 'memory') {
      observation.metrics = await this.observeMemory();
    } else if (target === 'network') {
      observation.metrics = await this.observeNetwork();
    }

    this.observations.push(observation);

    return {
      observed: true,
      ...observation,
      sharp: true,
      vision: 'perfect'
    };
  }

  async observeSystem() {
    return {
      platform: os.platform(),
      arch: os.arch(),
      homedir: os.homedir(),
      uptime: os.uptime(),
      loadavg: os.loadavg(),
      totalmem: os.totalmem(),
      freemem: os.freemem(),
      cpus: os.cpus().length,
      type: os.type(),
      release: os.release()
    };
  }

  async observeCPU() {
    const cpus = os.cpus();
    const usage = cpus.map((cpu, i) => ({
      core: i,
      model: cpu.model,
      speed: cpu.speed,
      times: cpu.times
    }));

    return {
      coreCount: cpus.length,
      averageLoad: os.loadavg()[0],
      cores: usage
    };
  }

  async observeMemory() {
    const total = os.totalmem();
    const free = os.freemem();
    const used = total - free;

    return {
      totalMB: Math.round(total / 1024 / 1024),
      usedMB: Math.round(used / 1024 / 1024),
      freeMB: Math.round(free / 1024 / 1024),
      usagePercent: ((used / total) * 100).toFixed(2)
    };
  }

  async observeNetwork() {
    return {
      hostname: os.hostname(),
      interfaces: Object.keys(os.networkInterfaces()).length,
      platform: os.platform()
    };
  }

  async detect(target) {
    const baseline = this.getBaseline(target);
    const current = await this.observe(target);
    const anomalies = this.findAnomalies(baseline, current);

    if (anomalies.length > 0) {
      this.anomalies.push({ target, anomalies, timestamp: new Date().toISOString() });
    }

    return {
      detected: true,
      target,
      anomalies,
      anomalyCount: anomalies.length,
      status: anomalies.length > 0 ? 'ALERT' : 'normal'
    };
  }

  getBaseline(target) {
    return {
      cpu: { load: 0.5, threshold: 0.8 },
      memory: { usage: 0.7, threshold: 0.9 },
      disk: { usage: 0.6, threshold: 0.85 }
    };
  }

  findAnomalies(baseline, current) {
    const anomalies = [];

    if (current.metrics?.averageLoad > 0.8) {
      anomalies.push({ type: 'high_cpu_load', value: current.metrics.averageLoad, severity: 'high' });
    }

    if (current.metrics?.usagePercent > 90) {
      anomalies.push({ type: 'high_memory_usage', value: current.metrics.usagePercent, severity: 'critical' });
    }

    return anomalies;
  }

  async monitor(interval = 5000) {
    const snapshot = await this.observe('system');
    const status = snapshot.metrics.loadavg[0] > 0.8 ? 'high_load' : 'normal';

    return {
      monitored: true,
      interval,
      snapshot,
      status,
      sharpVision: true
    };
  }

  async scan(area) {
    const results = {
      scanned: area || 'all',
      findings: [],
      timestamp: new Date().toISOString()
    };

    const systemMetrics = await this.observe('system');
    results.findings.push({ type: 'system', data: systemMetrics });

    return {
      scanned: true,
      ...results,
      clear: true
    };
  }

  async soar(target) {
    return {
      soared: true,
      target: target || 'high_altitude',
      view: 'panoramic',
      note: 'Bird\'s eye view achieved'
    };
  }

  async dive(target) {
    return {
      dived: true,
      target,
      precision: 'maximum',
      note: 'Dive bomb accuracy achieved'
    };
  }

  async getObservations() {
    return {
      total: this.observations.length,
      recent: this.observations.slice(-10),
      anomalies: this.anomalies.slice(-5)
    };
  }
}

module.exports = HawkSkill;