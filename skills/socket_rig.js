const http = require('http');

function postCommand(commandObj) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(commandObj);
    const options = {
      hostname: '127.0.0.1',
      port: 7777,
      path: '/command',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve(body));
    });

    req.on('error', (e) => reject(e));
    req.write(data);
    req.end();
  });
}

module.exports = {
  name: 'socket_rig',
  description: 'Control your Socket-Rig onscreen 3D Avatar! Command it to speak, change characters, animate, or react.',
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['switch_character', 'animate', 'speak', 'idle', 'walk', 'sit', 'teleport'] },
      param: { type: 'string', description: 'The character (base, vanguard, streetwear, gothic, catgirl), animation name (kung_fu, archery_aim, cardio_dance, cheer...), or text to speak' }
    },
    required: ['action']
  },
  handler: async (args, context) => {
    const { action, param } = args;

    try {
      let cmdObj = { type: action };
      
      if (action === 'switch_character') cmdObj.character = param || 'gothic';
      if (action === 'animate') cmdObj.animation = param || 'idle';
      if (action === 'speak') cmdObj.text = param || '...';
      
      const response = await postCommand(cmdObj);
      return `Sent command to Avatar: ${action} -> ${param}. Response: ${response}`;
    } catch (e) {
      if (e.code === 'ECONNREFUSED') {
         return 'Avatar bridge is offline! Cannot connect to port 7777. To fix: (1) Run simple_bridge.py from PURPCLAW directory, (2) Start the Electron render process. Both must be running before socket_rig will work.';
      }
      return `Failed to send to Avatar: ${e.message}`;
    }
  }
};
