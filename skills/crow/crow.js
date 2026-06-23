const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class CrowSkill {
  constructor() {
    this.name = 'crow';
    this.description = 'Intelligence - learns patterns, gathers info, scavenges solutions';
    this.memoryPath = path.join(__dirname, 'crow_memory.json');
    this.patterns = {};
    this.learned = [];
  }

  async learn(data) {
    if (!data) return { learned: false, error: 'No data provided' };

    const patternId = crypto.randomBytes(4).toString('hex');
    const entry = {
      id: patternId,
      data,
      timestamp: new Date().toISOString(),
      tags: this.extractTags(data),
      hash: crypto.createHash('md5').update(JSON.stringify(data)).digest('hex')
    };

    this.learned.push(entry);

    if (!this.patterns[entry.tags[0]]) {
      this.patterns[entry.tags[0]] = [];
    }
    this.patterns[entry.tags[0]].push(entry);

    await this.saveMemory();

    return {
      learned: true,
      patternId,
      tags: entry.tags,
      totalLearned: this.learned.length
    };
  }

  extractTags(data) {
    const tags = [];
    if (typeof data === 'string') {
      const words = data.toLowerCase().match(/\b\w{4,}\b/g) || [];
      tags.push(...words.slice(0, 3));
    } else if (data.type) tags.push(data.type);
    else if (data.domain) tags.push(data.domain);
    else tags.push('general');
    return tags.length ? tags : ['general'];
  }

  async pattern(input) {
    if (!input) return { pattern: false, error: 'No input provided' };

    const searchTerm = (typeof input === 'string' ? input : input.term || '').toLowerCase();
    const matches = [];

    for (const [tag, entries] of Object.entries(this.patterns)) {
      if (tag.includes(searchTerm) || searchTerm.includes(tag)) {
        matches.push(...entries);
      }
    }

    if (matches.length === 0 && this.learned.length > 0) {
      const recent = this.learned.slice(-5);
      return {
        pattern: true,
        closest: recent,
        similarity: 0.1,
        note: 'No exact match, returning recent patterns'
      };
    }

    return {
      pattern: true,
      matches: matches.slice(0, 10),
      count: matches.length,
      confidence: matches.length > 0 ? Math.min(0.9, matches.length * 0.1) : 0
    };
  }

  async scavenge(query) {
    const searchTerm = (query.term || query.subject || '').toLowerCase();
    const results = [];

    for (const entry of this.learned) {
      const searchable = JSON.stringify(entry.data).toLowerCase();
      if (searchable.includes(searchTerm)) {
        results.push(entry);
      }
    }

    return {
      scavenged: true,
      query: searchTerm,
      found: results.length,
      results: results.slice(0, 5)
    };
  }

  async findSimilar(target) {
    if (!target || !target.data) {
      return { similar: false, error: 'No target data provided' };
    }

    const targetHash = crypto.createHash('md5').update(JSON.stringify(target.data)).digest('hex');
    const similar = this.learned.filter(entry => {
      const similarity = this.calculateSimilarity(entry.data, target.data);
      return similarity > 0.3;
    });

    return {
      similar: true,
      targetHash,
      matches: similar.slice(0, 5),
      count: similar.length
    };
  }

  calculateSimilarity(a, b) {
    if (typeof a === 'string' && typeof b === 'string') {
      const wordsA = new Set(a.toLowerCase().split(/\s+/));
      const wordsB = new Set(b.toLowerCase().split(/\s+/));
      const intersection = [...wordsA].filter(x => wordsB.has(x));
      return intersection.length / Math.max(wordsA.size, wordsB.size);
    }
    return 0;
  }

  async memorize(solution) {
    if (!solution) return { memorized: false, error: 'No solution provided' };

    const memory = {
      id: crypto.randomBytes(4).toString('hex'),
      solution,
      context: solution.context || null,
      useCount: 0,
      lastUsed: null,
      createdAt: new Date().toISOString()
    };

    this.learned.push(memory);
    await this.saveMemory();

    return { memorized: true, memoryId: memory.id };
  }

  async recall(query) {
    const results = this.learned.filter(entry => {
      const searchable = JSON.stringify(entry).toLowerCase();
      return searchable.includes(query.toLowerCase());
    });

    return {
      recalled: true,
      query,
      hits: results.length,
      results: results.slice(0, 3)
    };
  }

  async analyze(thing) {
    const analysis = {
      type: typeof thing,
      complexity: this.measureComplexity(thing),
      patterns: this.findPatterns(thing),
      suggestions: []
    };

    if (analysis.complexity > 10) {
      analysis.suggestions.push('Consider breaking this into smaller parts');
    }

    return {
      analyzed: true,
      analysis,
      timestamp: new Date().toISOString()
    };
  }

  measureComplexity(obj) {
    if (typeof obj === 'string') return obj.length / 10;
    if (Array.isArray(obj)) return obj.length;
    if (typeof obj === 'object') return Object.keys(obj).length;
    return 1;
  }

  findPatterns(obj) {
    const patterns = [];
    if (Array.isArray(obj) && obj.length > 2) {
      const firstType = typeof obj[0];
      if (obj.every(item => typeof item === firstType)) {
        patterns.push(`homogeneous_${firstType}_array`);
      }
    }
    if (typeof obj === 'object' && obj !== null) {
      const keys = Object.keys(obj);
      if (keys.length > 5) patterns.push('complex_object');
    }
    return patterns;
  }

  async saveMemory() {
    try {
      const data = JSON.stringify({ patterns: this.patterns, learned: this.learned }, null, 2);
      await fs.writeFile(this.memoryPath, data);
    } catch (e) {
      console.error(`Crow memory save failed: ${e.message}`);
    }
  }

  async loadMemory() {
    try {
      const data = await fs.readFile(this.memoryPath, 'utf8');
      const parsed = JSON.parse(data);
      this.patterns = parsed.patterns || {};
      this.learned = parsed.learned || [];
    } catch (e) {
      this.patterns = {};
      this.learned = [];
    }
  }
}

module.exports = CrowSkill;