module.exports = {
  name: 'test_skill',
  description: 'A simple test skill that returns a greeting',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string' }
    }
  },
  async handler(args, context) {
    return `Hello ${args.name || 'World'}! This is a test skill.`;
  }
};