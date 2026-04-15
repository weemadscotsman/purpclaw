const fs = require('fs');
const path = require('path');

module.exports = {
  name: 'task_manager',
  description: 'A cognitive tool to plan out complex multi-step objectives. Break big objectives into sub-tasks, execute them safely, and check them off to stay organized. IMPORTANT: task_id is REQUIRED for create/update/complete actions. Only action=status works without task_id.',
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['create', 'update', 'complete', 'status'] },
      task_id: { type: 'string', description: 'REQUIRED for create/update/complete actions. Unique ID (e.g. "T1", "T2", "build-step-1")' },
      title: { type: 'string', description: 'What to achieve (required for create)' },
      notes: { type: 'string', description: 'Progress notes or next steps' }
    },
    required: ['action', 'task_id']
  },
  handler: async (args, context) => {
    const { action, task_id, title, notes } = args;
    const { config } = context;
    if (!config || !config.PURP_DIR || typeof config.PURP_DIR !== 'string') {
      throw new Error('Invalid config: PURP_DIR is required');
    }
    const STATE_FILE = path.join(config.PURP_DIR, 'cognitive_tasks.json');
    
    let state = { tasks: {} };
    if (fs.existsSync(STATE_FILE)) {
      try { state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch(e) {}
    }

    if (action === 'status') {
      const active = Object.values(state.tasks).filter(t => t.status !== 'complete');
      const done = Object.values(state.tasks).filter(t => t.status === 'complete');
      
      let out = '=== COGNITIVE TASK PLANNER ===\n';
      out += `Active Tasks (${active.length}):\n`;
      active.forEach(t => out += `[ ] ${t.id}: ${t.title}\n    Notes: ${t.notes}\n`);
      out += `\nCompleted Tasks (${done.length}):\n`;
      done.slice(-5).forEach(t => out += `[x] ${t.id}: ${t.title}\n`);
      return out;
    }

    if (!task_id) throw new Error('task_id is required');

    if (action === 'create') {
      state.tasks[task_id] = { id: task_id, title, notes: notes || '', status: 'active', created: new Date().toISOString() };
      fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
      return `Created task ${task_id}: ${title}`;
    }

    if (!state.tasks[task_id]) throw new Error(`Task ${task_id} not found`);

    if (action === 'update') {
      if (title) state.tasks[task_id].title = title;
      if (notes) state.tasks[task_id].notes = notes;
      fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
      return `Updated task ${task_id}`;
    }

    if (action === 'complete') {
      state.tasks[task_id].status = 'complete';
      if (notes) state.tasks[task_id].notes = notes;
      fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
      return `Completed task ${task_id}! Excellent work.`;
    }
  }
};
