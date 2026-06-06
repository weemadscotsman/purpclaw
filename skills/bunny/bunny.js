class BunnySkill {
  constructor() {
    this.name = 'bunny';
    this.description = 'Rapid response and threat detection specialist';
    this.reactions = 0;
    this.alerts = 0;
    this.escapes = 0;
    this.watchful = true;
  }

  async twitch(trigger) {
    // Instant reaction to stimulus
    this.reactions++;

    return {
      twitched: true,
      trigger,
      reaction_time: 'milliseconds',
      count: this.reactions,
      note: 'HOP! HOP! HOP!'
    };
  }

  async alert(target, severity = 'HIGH') {
    // Sound the alarm immediately
    this.alerts++;

    return {
      alerted: true,
      target,
      severity,
      volume: 'EAR_SPLITTING',
      note: 'ALERT! ALERT! ALERT!'
    };
  }

  async escape(threat) {
    // Flee danger with maximum speed
    this.escapes++;

    return {
      escaped: true,
      threat,
      distance: 'SAFE',
      speed: 'MAXIMUM',
      note: 'GOT AWAY'
    };
  }

  async detect(target) {
    // Scan for threats/things needing attention
    return {
      detected: true,
      target,
      method: 'SENSORY_OVERLOAD',
      watchfulness: 'MAXIMUM',
      note: 'Something is moving...'
    };
  }

  async hop(direction = 'up') {
    // Quick movement in any direction
    return {
      hopped: true,
      direction,
      height: 'impressive',
      speed: 'BLUR',
      note: '*thump thump thump*'
    };
  }

  async flatten() {
    // Become small/hidden when threatened
    return {
      flat: true,
      visibility: 'MINIMUM',
      stealth: 'MAXIMUM',
      note: '...nothing to see here...'
    };
  }

  async thump(warning = 'danger') {
    // Send warning through ground vibrations
    return {
      thumped: true,
      warning,
      transmitted: true,
      note: '*THUMP* *THUMP*'
    };
  }

  async ears(up = true) {
    // Rotate ears toward sound
    return {
      ears: true,
      direction: up ? 'vertical' : 'horizontal',
      range: '360_degrees',
      note: 'I hear EVERYTHING'
    };
  }

  async nest(location) {
    // Establish safe haven
    return {
      nested: true,
      location,
      safety: 'GUARANTEED',
      hidden: true,
      note: 'Safe at last...'
    };
  }

  async quick() {
    // Pure speed mode
    return {
      speed: 'MAXIMUM',
      reaction_time: 'ZERO',
      mode: 'HYPER_ALERT',
      note: 'FASTER THAN THOUGHT'
    };
  }

  async getStats() {
    return {
      reactions: this.reactions,
      alerts: this.alerts,
      escapes: this.escapes,
      status: this.watchful ? 'WATCHING' : 'SLEEPING'
    };
  }
}

module.exports = BunnySkill;
