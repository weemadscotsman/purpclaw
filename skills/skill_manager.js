const fs = require('fs');
const path = require('path');

function getRegistryPath(dir) {
  return path.join(dir, 'skills_registry.json');
}

function loadRegistry(dir) {
  const regPath = getRegistryPath(dir);
  if (fs.existsSync(regPath)) {
    try { return JSON.parse(fs.readFileSync(regPath, 'utf8')); } catch { return {}; }
  }
  return {};
}

function saveRegistry(dir, data) {
  fs.writeFileSync(getRegistryPath(dir), JSON.stringify(data, null, 2), 'utf8');
}

module.exports = {
  name: 'skill_manager',
  description: 'Manage dynamic PURPCLAW skills. Create .pending.js skills, test them, and approve them to load into your brain.',
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['create', 'read', 'delete', 'list', 'test_and_approve'] },
      skill_name: { type: 'string', description: 'Name of the skill file (e.g. blender_api)' },
      code: { 
        type: 'string', 
        description: 'JavaScript code exporting an object with name, description, inputSchema, and an async handler(args, context).' 
      },
      test_args: {
        type: 'object',
        description: 'Arguments to pass to the skill handler during test_and_approve.'
      }
    },
    required: ['action']
  },
  handler: async (args, context) => {
    const { action, skill_name, code, test_args } = args;
    const { config } = context;
    if (!config || !config.SKILLS_DIR || typeof config.SKILLS_DIR !== 'string') {
      throw new Error('Invalid config: SKILLS_DIR is required');
    }
    const SKILLS_DIR = config.SKILLS_DIR;
    
    if (!fs.existsSync(SKILLS_DIR)) {
      fs.mkdirSync(SKILLS_DIR, { recursive: true });
    }

    const registry = loadRegistry(SKILLS_DIR);

    if (action === 'list') {
      const allFiles = fs.readdirSync(SKILLS_DIR);
      const active = allFiles.filter(f => f.endsWith('.js') && !f.endsWith('.pending.js'));
      const pending = allFiles.filter(f => f.endsWith('.pending.js'));
      
      let report = `### Skill Registry Status ###\n\n`;
      report += `Active Skills:\n${active.length > 0 ? active.map(f => `- ${f} (v${registry[f.replace('.js', '')]?.version || 1})`).join('\n') : 'none'}\n\n`;
      report += `Pending Skills (Needs Approval):\n${pending.length > 0 ? pending.map(f => `- ${f}`).join('\n') : 'none'}\n\n`;
      
      return report;
    }

    if (!skill_name) throw new Error('skill_name is required for this action');
    const safeName = skill_name.replace(/[^a-zA-Z0-9_-]/g, '');
    const activePath = path.join(SKILLS_DIR, `${safeName}.js`);
    const pendingPath = path.join(SKILLS_DIR, `${safeName}.pending.js`);

    if (action === 'create') {
      if (!code) throw new Error('code is required to create a skill');
      fs.writeFileSync(pendingPath, code, 'utf8');
      
      registry[safeName] = registry[safeName] || { version: 0, status: 'pending', created_at: new Date().toISOString() };
      registry[safeName].status = 'pending';
      saveRegistry(SKILLS_DIR, registry);

      return `Successfully created PENDING skill: ${safeName}.pending.js\nYou MUST run 'test_and_approve' to dry-run it before it is loaded into your brain.`;
    }

    if (action === 'test_and_approve') {
      if (!fs.existsSync(pendingPath)) {
        throw new Error(`Pending skill ${safeName}.pending.js not found. Only pending skills can be tested and approved.`);
      }
      
      let skillDef;
      try {
        delete require.cache[require.resolve(pendingPath)];
        skillDef = require(pendingPath);
      } catch (e) {
        throw new Error(`Syntax Error loading ${safeName}.pending.js: ${e.message}\nFix the code and recreate it.`);
      }

      if (!skillDef.name || !skillDef.description || typeof skillDef.handler !== 'function') {
        throw new Error(`Validation Error: Skill must export an object with 'name', 'description', and a 'handler' async function.`);
      }

      // Dry run
      try {
        console.log(`[SKILL-TEST] Dry running ${skillDef.name}...`);
        const result = await skillDef.handler(test_args || {}, context);
        console.log(`[SKILL-TEST] Success:`, result);
      } catch (e) {
        throw new Error(`Execution Error during dry-run of ${skillDef.name}: ${e.message}\nFix the logic and recreate it.`);
      }

      // Safe to approve!
      fs.renameSync(pendingPath, activePath);
      
      // Update Registry Persistence
      registry[safeName] = registry[safeName] || { created_at: new Date().toISOString() };
      registry[safeName].status = 'approved';
      registry[safeName].version = (registry[safeName].version || 0) + 1;
      registry[safeName].last_approved = new Date().toISOString();
      saveRegistry(SKILLS_DIR, registry);

      return `SUCCESS! ${safeName} passed tests and has been APPROVED (v${registry[safeName].version}). It is now loaded into your brain.`;
    }

    if (action === 'read') {
      if (fs.existsSync(pendingPath)) return fs.readFileSync(pendingPath, 'utf8');
      if (fs.existsSync(activePath)) return fs.readFileSync(activePath, 'utf8');
      throw new Error('Skill not found in active or pending states.');
    }

    if (action === 'delete') {
      let deleted = [];
      if (fs.existsSync(pendingPath)) { fs.unlinkSync(pendingPath); deleted.push(`${safeName}.pending.js`); }
      if (fs.existsSync(activePath)) { fs.unlinkSync(activePath); deleted.push(`${safeName}.js`); }
      
      if (registry[safeName]) {
        delete registry[safeName];
        saveRegistry(SKILLS_DIR, registry);
      }

      if (deleted.length > 0) return `Deleted: ${deleted.join(', ')}`;
      return 'Skill not found';
    }

    throw new Error('Invalid action');
  }
};
