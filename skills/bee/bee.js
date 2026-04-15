const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class BeeSkill {
  constructor() {
    this.name = 'bee';
    this.description = 'Worker bee - executes tasks, builds, pollinates ideas across teams';
    this.tasks = [];
    this.pollinated = [];
    this.honey = [];
  }

  async execute(task) {
    if (!task) {
      return { executed: false, error: 'No task provided' };
    }

    const taskId = crypto.randomBytes(4).toString('hex');
    const result = {
      executed: false,
      taskId,
      task,
      status: 'pending'
    };

    try {
      if (typeof task === 'string') {
        result.output = await this.runCommand(task);
        result.status = 'completed';
        result.executed = true;
      } else if (task.type === 'build') {
        result.output = await this.build(task.spec);
        result.status = 'completed';
        result.executed = true;
      } else if (task.type === 'analyze') {
        result.output = await this.analyze(task.subject);
        result.status = 'completed';
        result.executed = true;
      } else if (task.command) {
        result.output = await this.runCommand(task.command);
        result.status = 'completed';
        result.executed = true;
      } else {
        result.status = 'unknown_task_type';
        result.error = 'Cannot determine task type';
      }
    } catch (e) {
      result.status = 'failed';
      result.error = e.message;
    }

    result.completedAt = new Date().toISOString();
    this.tasks.push(result);

    return result;
  }

  async runCommand(cmd) {
    const { exec } = require('child_process');
    return new Promise((resolve, reject) => {
      exec(cmd, { timeout: 30000 }, (error, stdout, stderr) => {
        if (error) reject(error);
        else resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
      });
    });
  }

  async build(spec) {
    if (!spec) return { built: false, error: 'No spec provided' };

    const buildResult = {
      built: false,
      spec,
      files: []
    };

    try {
      if (spec.type === 'file') {
        const filePath = spec.path || spec.name;
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, spec.content || '');
        buildResult.built = true;
        buildResult.files.push(filePath);
      } else if (spec.type === 'project') {
        const baseDir = spec.destination || '.';
        for (const [filePath, content] of Object.entries(spec.files || {})) {
          const fullPath = path.join(baseDir, filePath);
          await fs.mkdir(path.dirname(fullPath), { recursive: true });
          await fs.writeFile(fullPath, content);
          buildResult.files.push(fullPath);
        }
        buildResult.built = true;
      }
    } catch (e) {
      buildResult.error = e.message;
    }

    buildResult.timestamp = new Date().toISOString();
    return buildResult;
  }

  async analyze(subject) {
    const analysis = {
      subject,
      type: typeof subject,
      complexity: this.measureComplexity(subject),
      patterns: [],
      suggestions: []
    };

    if (typeof subject === 'string') {
      analysis.wordCount = subject.split(/\s+/).length;
      analysis.patterns.push('text_content');
    }

    if (typeof subject === 'object' && subject !== null) {
      const keys = Object.keys(subject);
      analysis.keyCount = keys.length;
      analysis.patterns.push('structured_data');
    }

    if (analysis.complexity > 10) {
      analysis.suggestions.push('Consider breaking into smaller parts');
    }

    return { analyzed: true, analysis };
  }

  measureComplexity(item) {
    if (typeof item === 'string') return item.length / 10;
    if (Array.isArray(item)) return item.length;
    if (typeof item === 'object') return Object.keys(item).length;
    return 1;
  }

  async pollinate(ideas) {
    if (!ideas) {
      return { pollinated: false, error: 'No ideas provided' };
    }

    const inputIdeas = Array.isArray(ideas) ? ideas : [ideas];
    const pollinated = [];

    for (const idea of inputIdeas) {
      const pollinatedIdea = {
        ...idea,
        pollinated: true,
        pollinatedAt: new Date().toISOString(),
        crossPollinated: true,
        tags: this.extractIdeaTags(idea)
      };

      if (idea.concept && idea.context) {
        pollinatedIdea.synthesis = this.synthesize(idea.concept, idea.context);
      }

      pollinated.push(pollinatedIdea);
      this.pollinated.push(pollinatedIdea);
    }

    return {
      pollinated: true,
      ideas: pollinated,
      count: pollinated.length,
      timestamp: new Date().toISOString()
    };
  }

  extractIdeaTags(idea) {
    const tags = [];
    if (typeof idea === 'string') {
      const words = idea.match(/\b\w{4,}\b/g) || [];
      tags.push(...words.slice(0, 5));
    } else {
      if (idea.domain) tags.push(idea.domain);
      if (idea.type) tags.push(idea.type);
      if (idea.field) tags.push(idea.field);
    }
    return tags.length ? tags : ['general'];
  }

  synthesize(concept, context) {
    return {
      from: concept,
      inContext: context,
      synthesized: `Integration of ${concept} with ${context}`,
      synthesis: `Combined ${concept} and ${context} to create new understanding`
    };
  }

  async gather(source) {
    if (!source) {
      return { gathered: false, error: 'No source specified' };
    }

    const gathered = {
      source,
      resources: [],
      timestamp: new Date().toISOString()
    };

    try {
      if (source.type === 'file') {
        const content = await fs.readFile(source.path, 'utf8');
        gathered.resources.push({
          type: 'file_content',
          path: source.path,
          content: content.substring(0, 1000)
        });
      } else if (source.type === 'directory') {
        const files = await this.listFilesRecursive(source.path);
        gathered.resources = files.map(f => ({ type: 'file', path: f }));
      } else if (source.type === 'web') {
        gathered.resources.push({
          type: 'web_resource',
          url: source.url,
          fetched: true
        });
      } else if (source.type === 'api') {
        gathered.resources.push({
          type: 'api_data',
          endpoint: source.endpoint,
          fetched: true
        });
      }
    } catch (e) {
      gathered.error = e.message;
    }

    this.honey.push(gathered);
    return { gathered: true, ...gathered };
  }

  async listFilesRecursive(dir) {
    const files = [];
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          files.push(...await this.listFilesRecursive(fullPath));
        } else {
          files.push(fullPath);
        }
      }
    } catch (e) {
      files.push(dir);
    }
    return files;
  }

  async organize(items) {
    if (!items) {
      return { organized: false, error: 'No items provided' };
    }

    const inputItems = Array.isArray(items) ? items : [items];
    const organized = inputItems.map((item, index) => ({
      ...item,
      order: index + 1,
      organized: true,
      organizedAt: new Date().toISOString(),
      category: this.categorize(item)
    }));

    const byCategory = {};
    for (const item of organized) {
      const cat = item.category;
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(item);
    }

    return {
      organized: true,
      items: organized,
      count: organized.length,
      categories: byCategory,
      timestamp: new Date().toISOString()
    };
  }

  categorize(item) {
    if (typeof item === 'string') {
      if (item.includes('code') || item.includes('function')) return 'code';
      if (item.includes('design') || item.includes('ui')) return 'design';
      if (item.includes('data') || item.includes('analytics')) return 'data';
    }
    if (item.type) return item.type;
    if (item.category) return item.category;
    return 'general';
  }

  async swarm(tasks) {
    if (!Array.isArray(tasks)) {
      tasks = [tasks];
    }

    const results = [];
    for (const task of tasks) {
      const result = await this.execute(task);
      results.push(result);
    }

    return {
      swarmed: true,
      totalTasks: tasks.length,
      completed: results.filter(r => r.executed).length,
      results
    };
  }

  async honeyReport() {
    return {
      totalTasks: this.tasks.length,
      totalPollinated: this.pollinated.length,
      totalGathered: this.honey.length,
      recentTasks: this.tasks.slice(-5),
      recentPollinated: this.pollinated.slice(-5)
    };
  }
}

module.exports = BeeSkill;