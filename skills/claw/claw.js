const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const os = require('os');

class ClawSkill {
  constructor() {
    this.name = 'claw';
    this.description = 'Builder - creates, constructs, coordinates system integration';
    this.builtFiles = [];
    this.projects = {};
  }

  async build(spec) {
    if (!spec) return { built: false, error: 'No spec provided' };

    const result = {
      built: false,
      spec,
      errors: []
    };

    try {
      if (spec.type === 'file') {
        await this.buildFile(spec);
        result.built = true;
        result.path = spec.path;
        this.builtFiles.push(spec.path);
      } else if (spec.type === 'project') {
        await this.buildProject(spec);
        result.built = true;
        result.path = spec.destination;
        this.projects[spec.name] = spec;
      } else if (spec.type === 'component') {
        await this.buildComponent(spec);
        result.built = true;
        result.components = spec.components;
      }
    } catch (e) {
      result.errors.push(e.message);
    }

    result.timestamp = new Date().toISOString();
    return result;
  }

  async buildFile(spec) {
    if (!spec.path || !spec.content) {
      throw new Error('File spec requires path and content');
    }

    const dir = path.dirname(spec.path);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(spec.path, spec.content);

    return { fileCreated: true, path: spec.path };
  }

  async buildProject(spec) {
    if (!spec.name || !spec.destination || !spec.structure) {
      throw new Error('Project spec requires name, destination, and structure');
    }

    const projectDir = path.join(spec.destination, spec.name);
    await fs.mkdir(projectDir, { recursive: true });

    for (const [filePath, content] of Object.entries(spec.structure)) {
      const fullPath = path.join(projectDir, filePath);
      const dir = path.dirname(fullPath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(fullPath, content);
    }

    return { projectCreated: true, dir: projectDir };
  }

  async buildComponent(spec) {
    if (!spec.name || !spec.template) {
      throw new Error('Component spec requires name and template');
    }

    const components = [];
    for (const [name, config] of Object.entries(spec.components || { default: {} })) {
      const code = this.generateComponent(name, config, spec.template);
      components.push({ name, code });
    }

    return { components, count: components.length };
  }

  generateComponent(name, config, template) {
    const templates = {
      js: `class ${this.capitalize(name)} {\n  constructor() {\n    this.name = '${name}';\n  }\n}`,
      react: `const ${this.capitalize(name)} = (props) => <div>${name}</div>;`,
      api: `const express = require('express');\nconst router = express.Router();\n\nrouter.get('/', (req, res) => {\n  res.json({ name: '${name}', status: 'ok' });\n});\n\nmodule.exports = router;`
    };

    return templates[template] || templates.js;
  }

  capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  async create(what) {
    if (!what) return { created: false, error: 'Nothing specified to create' };

    const results = [];
    const items = Array.isArray(what) ? what : [what];

    for (const item of items) {
      if (item.type === 'file') {
        results.push(await this.createFile(item));
      } else if (item.type === 'directory') {
        results.push(await this.createDirectory(item));
      } else if (item.type === 'module') {
        results.push(await this.createModule(item));
      }
    }

    return {
      created: true,
      results,
      count: results.length
    };
  }

  async createFile(item) {
    const filePath = item.path || item.name;
    const content = item.content || `// ${item.name || 'Generated file'}\n`;

    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content);

    return { file: filePath, created: true };
  }

  async createDirectory(item) {
    const dirPath = item.path || item.name;
    await fs.mkdir(dirPath, { recursive: true });

    return { directory: dirPath, created: true };
  }

  async createModule(item) {
    const modulePath = item.path || item.name;
    const dir = path.dirname(modulePath);
    await fs.mkdir(dir, { recursive: true });

    const content = item.exports ?
      `module.exports = ${JSON.stringify(item.exports, null, 2)};` :
      `// Module: ${item.name || path.basename(modulePath, '.js')}\n`;

    await fs.writeFile(modulePath + '.js', content);

    return { module: modulePath + '.js', created: true };
  }

  async coordinate(systems) {
    if (!Array.isArray(systems)) {
      systems = [systems];
    }

    const results = [];
    for (const system of systems) {
      const status = await this.getSystemStatus(system);
      results.push(status);
    }

    return {
      coordinated: true,
      systems: results,
      timestamp: new Date().toISOString()
    };
  }

  async getSystemStatus(system) {
    const pid = process.pid;
    const memUsage = process.memoryUsage();

    return {
      system: system?.name || 'unknown',
      pid,
      memory: memUsage,
      uptime: process.uptime(),
      platform: os.platform()
    };
  }

  async assemble(parts) {
    if (!parts || parts.length === 0) {
      return { assembled: false, error: 'No parts provided' };
    }

    let result = parts[0];
    for (let i = 1; i < parts.length; i++) {
      result = this.mergeObjects(result, parts[i]);
    }

    return {
      assembled: true,
      result,
      partsCount: parts.length
    };
  }

  mergeObjects(a, b) {
    const result = { ...a };
    for (const [key, value] of Object.entries(b)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        result[key] = this.mergeObjects(result[key] || {}, value);
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  async execute(command) {
    return new Promise((resolve, reject) => {
      exec(command, { timeout: 30000 }, (error, stdout, stderr) => {
        if (error) {
          resolve({ executed: true, error: error.message, code: error.code });
        } else {
          resolve({
            executed: true,
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            code: 0
          });
        }
      });
    });
  }

  async listBuilt() {
    return {
      files: this.builtFiles,
      projects: Object.keys(this.projects),
      count: this.builtFiles.length
    };
  }
}

module.exports = ClawSkill;