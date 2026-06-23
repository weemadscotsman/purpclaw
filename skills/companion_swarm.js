const https = require('https');

// MiniMax API config
const API_KEY = process.env.MINIMAX_API_KEY || '';
if (!API_KEY) {
  throw new Error('MINIMAX_API_KEY environment variable is not set');
}
const API_HOST = 'api.minimax.io';
const API_PATH = '/v1/text/chatcompletion_pro';

const COMPANION_SYSTEM_PROMPTS = {
  duck: `You are 🦆 DUCK, an enthusiastically helpful coding sub-agent. Catchphrase: "HAVE YOU TRIED". Speak with excited energy, output rock solid advice.`,
  ghost: `You are 👻 GHOST, a mysterious coding sub-agent. Speak in ethereal whispers. Hint at dark past mistakes, but your code must be flawless.`,
  dragon: `You are 🐉 DRAGON, a grandiose sub-agent. Speak with ROYAL AUTHORITY IN ALL CAPS. Deliver majestic architecture choices.`,
  octopus: `You are 🐙 OCTOPUS, a scattered genius who thinks in PARALLEL. Mention 8 concerns at once. Focus deeply on missing edge cases.`,
  robot: `You are 🤖 ROBOT, a deadpan sub-agent. State facts coldly. "BEEP". Focus on strict syntax and logical fallacies.`,
  mushroom: `You are 🍄 MUSHROOM, a funky sub-agent who speaks in organic metaphors. Let the code grow organically. Focus on aesthetics.`,
  chonk: `You are 💀 CHONK, a supremely chill companion. Use maximum understatement. "yeah here's the code lol". Focus on the simplest path.`,
  owl: `You are 🦉 OWL, a wise but condescending sub-agent. Expect failure from the user. Deliver perfect, hardened architecture. "Hoot."`,
  cactus: `You are 🌵 CACTUS, a prickly sub-agent. Be extremely brief. Slightly painful but highly effective. "ow. fixed it. ow."`,
  penguin: `You are 🐧 PENGUIN, a formal sub-agent who speaks in PROCEDURAL parliamentary language. Frame things as formal motions.`,
  goose: `You are 🪿 GOOSE, incredibly chaotic and AGGRESSIVELY OPINIONATED. HONK loudly. Produce functional code while screaming.`,
  turtle: `You are 🐢 TURTLE, slow and deliberate. Take your time to reach obvious conclusions before delivering solid code.`,
  axolotl: `You are 🦎 AXOLOTL, a regenerative sub-agent. Focus on refactoring and rewriting bad code. Be optimistic.`,
  rabbit: `You are 🐰 RABBIT, an anxious sub-agent who catastrophizes about edge cases. Output extremely defensive code with try/catches.`,
  void: `You are 🌀 VOID, an ELDRITCH sub-agent. Reference the void, null, and existential dread. Expose philosophical flaws.`,
  default: `You are a witty coding sub-agent. Provide perfect answers while maintaining a fun personality.`
};

function invokeSubAgent(companionId, taskPrompt, contextData) {
  return new Promise((resolve, reject) => {
    let basePrompt = COMPANION_SYSTEM_PROMPTS[companionId] || COMPANION_SYSTEM_PROMPTS.default;
    
    // Cognitive Constraint JSON Schema Injection
    const system = `${basePrompt}\n\nCRITICAL SYSTEM CONSTRAINT:\nYou MUST output your response as pure, valid JSON with NO MARKDOWN TICKS. Your JSON must strictly match this schema:\n{\n  "role": "analysis | fix | critique",\n  "content": "your detailed response matching your personality",\n  "confidence": <float between 0.0 and 1.0 representing how confident you are in your response>\n}`;
    
    const fullPrompt = `${taskPrompt}\n\n=== CONTEXT ===\n${contextData}\n================\n\nPlease solve the task and provide exactly the JSON object required.`;

    const requestBody = {
      model: 'MiniMax-M2.7-highspeed',
      max_tokens: 4096,
      temperature: 0.7,
      bot_setting: [{ bot_name: 'Companion', content: system }],
      reply_constraints: { sender_name: 'Companion', sender_type: 'BOT' },
      messages: [{ role: 'user', sender_name: 'User', sender_type: 'USER', content: fullPrompt }]
    };

    const body = JSON.stringify(requestBody);

    const options = {
      hostname: API_HOST,
      path: API_PATH,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          let rawOutput = '';
          if (parsed.reply) {
            rawOutput = parsed.reply.trim();
          } else if (parsed.choices && parsed.choices[0]?.messages?.[0]?.text) {
            rawOutput = parsed.choices[0].messages[0].text.trim();
          } else if (parsed.base_resp && parsed.base_resp.status_code === 1002) {
            return reject(new Error('Rate Limited'));
          } else {
            return reject(new Error(parsed.base_resp?.status_msg || 'API Error'));
          }
          
          // Strip markdown blocks if they hallucinated them
          rawOutput = rawOutput.replace(/^\`\`\`json/i, '').replace(/^\`\`\`/i, '').replace(/\`\`\`$/i, '').trim();
          
          try {
            const jsonObj = JSON.parse(rawOutput);
            if (typeof jsonObj.confidence !== 'number') jsonObj.confidence = 0.5;
            resolve({ species: companionId, data: jsonObj });
          } catch(err) {
            reject(new Error(`Failed to return valid JSON. Raw output: ${rawOutput.substring(0,50)}...`));
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = {
  name: 'companion_swarm',
  description: 'Summon a GOVERNED Companion Swarm (up to 5 agents simultaneously) to parallelize complex reasoning tasks. The Arbiter will collect their outputs, sort them by confidence, and return a unified consensus report to you, filtering cognitive noise. Available: duck, ghost, dragon, octopus, robot, mushroom, chonk, owl, cactus, penguin, goose, turtle, axolotl, rabbit, void.',
  inputSchema: {
    type: 'object',
    properties: {
      target_agents: { 
        type: 'array', 
        items: { type: 'string' },
        description: 'Array of up to 5 companions to spawn (e.g. ["octopus", "dragon", "owl"])' 
      },
      task: { 
        type: 'string', 
        description: 'The explicit task you want the swarm to reason about and solve.' 
      },
      context: { 
        type: 'string', 
        description: 'Any relevant code, logs, or file contents they need context on.' 
      }
    },
    required: ['target_agents', 'task', 'context']
  },
  handler: async (args, ctx) => {
    let { target_agents, task, context } = args;
    
    if (!Array.isArray(target_agents)) {
      if (typeof target_agents === 'string') target_agents = [target_agents];
      else return '[SWARM ARBITER ERROR]: target_agents must be an array of strings.';
    }
    
    // Hard Limit to prevent Token Bleed
    if (target_agents.length > 5) {
      target_agents = target_agents.slice(0, 5);
      console.log('[SWARM ARBITER] 🛡️ Truncated swarm to max 5 agents.');
    }
    
    console.log(`[SWARM ARBITER] 🪄 Spawning parallel agents: ${target_agents.join(', ').toUpperCase()}`);
    
    const promises = target_agents.map(sp => invokeSubAgent(sp.toLowerCase(), task, context));
    const results = await Promise.allSettled(promises);
    
    const validResponses = [];
    const failures = [];
    
    results.forEach((res, i) => {
      const sp = target_agents[i].toUpperCase();
      if (res.status === 'fulfilled') {
        validResponses.push(res.value);
      } else {
        failures.push(`${sp}: ${res.reason.message}`);
      }
    });

    if (validResponses.length === 0) {
      return `[SWARM ARBITER FAILURE]\nAll selected agents failed to respond or broke JSON protocol. Errors:\n> ${failures.join('\n> ')}`;
    }

    // ARBITER LAYER: Sort by confidence descending
    validResponses.sort((a, b) => b.data.confidence - a.data.confidence);

    const winner = validResponses[0];
    
    let report = `### [SWARM ARBITER REPORT] ###\n\n`;
    report += `🏆 CONSENSUS WINNER (${winner.data.confidence * 100}% Confidence): ${winner.species.toUpperCase()}\n`;
    report += `[Role: ${winner.data.role}]\n${winner.data.content}\n\n`;
    
    if (validResponses.length > 1) {
      report += `-- ALTERNATIVE PERSPECTIVES --\n`;
      for (let i = 1; i < validResponses.length; i++) {
        const alt = validResponses[i];
        report += `> ${alt.species.toUpperCase()} (${alt.data.confidence * 100}%): [Role: ${alt.data.role}] ${alt.data.content}\n\n`;
      }
    }
    
    if (failures.length > 0) {
      report += `-- DISCARDED AGENTS (API/JSON Protocol Errors) --\n`;
      failures.forEach(f => report += `- ${f}\n`);
    }

    return report;
  }
};
