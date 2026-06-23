const os = require('os');

class PandaSkill {
  constructor() {
    this.name = 'panda';
    this.description = 'Relaxed code review - thorough but chill';
    this.reviews = [];
    this.bamboo = 100;
  }

  async munch(target) {
    return {
      munched: true,
      target,
      bambooLeft: this.bamboo,
      mood: 'relaxed',
      note: 'Munching bamboo... this code needs work'
    };
  }

  async review(code) {
    const review = {
      code: typeof code === 'string' ? code.substring(0, 100) : code,
      issues: [],
      rating: 7,
      timestamp: new Date().toISOString()
    };

    if (typeof code === 'string') {
      if (code.includes('TODO')) review.issues.push('unresolved_todos');
      if (code.includes('any')) review.issues.push('unsafe_types');
      if (code.length > 500) review.issues.push('too_long');
      review.rating = Math.max(1, 10 - review.issues.length);
    }

    this.reviews.push(review);

    return {
      reviewed: true,
      ...review,
      status: review.issues.length > 2 ? 'needs_work' : 'acceptable',
      note: 'Analyzed with maximum chill'
    };
  }

  async sleep() {
    return {
      slept: true,
      duration: 'adequate',
      restored: true,
      note: 'Recharged for next review'
    };
  }

  async roll() {
    return {
      rolled: true,
      direction: 'any',
      grace: 'high',
      note: 'Rolled with perfect grace'
    };
  }

  async nap(duration = 30) {
    return {
      napped: true,
      minutes: duration,
      energyRestored: true,
      note: 'Brief nap completed'
    };
  }

  async lounge(target) {
    return {
      lounged: true,
      target,
      posture: 'relaxed',
      mood: 'very_chill',
      note: 'Lounging casually'
    };
  }

  async getReviews() {
    return {
      totalReviews: this.reviews.length,
      recentReviews: this.reviews.slice(-5),
      bamboo: this.bamboo
    };
  }
}

module.exports = PandaSkill;