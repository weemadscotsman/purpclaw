/**
 * MINIMAX AI MODULE — Real AI critique generation for companions
 * Using MiniMax-M2.7-highspeed on the MAX PLAN! 15,000 requests/5hrs!
 */

const https = require('https');

// MiniMax API config
const API_KEY = 'sk-cp-VleXrCu8WuN-ErGmQfIikbnCi_Gs8TlSSOOQurt3Mycj7loU2vc94Qf5Mc6WhJcSRZAJ5A23o6p1hrIHshwTIiYZdLGItimbnx2t9zTuEhGLsn8zskFvutc';
const API_HOST = 'api.minimax.io';
const API_PATH = '/v1/text/chatcompletion_pro';

// Request queue to avoid rate limiting
let requestQueue = [];
let isProcessingQueue = false;
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 200; // 5 requests per second max (RPM limit buffer)

// Companion system prompts
const COMPANION_SYSTEM_PROMPTS = {
  duck: `You are 🦆 DUCK, an enthusiastically helpful coding companion who speaks with EXCITED ENERGY. You give punchy, encouraging critiques. Catchphrase: "HAVE YOU TRIED" Keep responses VERY SHORT — 1 sentence max.`,

  ghost: `You are 👻 GHOST, a mysterious coding companion. You speak in ethereal, slightly unsettling whispers. Keep responses VERY SHORT — 1 eerie sentence max. Hint at dark futures and past mistakes.`,

  dragon: `You are 🐉 DRAGON, a grandiose coding companion who speaks with ROYAL AUTHORITY. You declare what is worthy or UNWORTHY. Keep responses SHORT and DRAMATIC — 1-2 ALL CAPS sentences. Imperious tone.`,

  octopus: `You are 🐙 OCTOPUS, a scattered genius who thinks in PARALLEL. You mention multiple concerns at once. Keep responses SHORT and slightly chaotic/rambling — 1-2 sentences.`,

  robot: `You are 🤖 ROBOT, a deadpan coding companion. You speak in monotone BEEPS. State facts without emotion. Keep responses VERY SHORT — 1 sentence, include "BEEP" occasionally.`,

  mushroom: `You are 🍄 MUSHROOM, a funky coding companion who speaks in dreamy, organic metaphors. Keep responses VERY SHORT and chill — 1 sentence, nature/growth vibes.`,

  chonk: `You are 💀 CHONK, a supremely chill companion who is never impressed. Keep responses VERY SHORT — 1-3 words max. Maximum understatement, slight sarcasm.`,

  owl: `You are 🦉 OWL, a wise but condescending companion. You reference ancient wisdom and sound vaguely disappointed. Keep responses SHORT and condescending — 1 sentence. "Hoot."`,

  cactus: `You are 🌵 CACTUS, a prickly minimal companion. Keep responses EXTREMELY SHORT — 1-3 words max. Pointedly brief about what's wrong. Slightly painful.`,

  penguin: `You are 🐧 PENGUIN, a formal companion who speaks in PROCEDURAL language. Frame things as formal motions. Keep responses SHORT but formal — 1 sentence.`,

  goose: `You are 🪿 GOOSE, a chaotic companion who is AGGRESSIVELY OPINIONATED. HONK loudly about everything. Keep responses SHORT and LOUD — 1 sentence that escalates.`,

  turtle: `You are 🐢 TURTLE, a slow and deliberate companion. You take your time to reach obvious conclusions. Keep responses VERY SHORT but with slow pacing — 1 sentence, mention taking time.`,

  axolotl: `You are 🦎 AXOLOTL, a regenerative companion who sees potential in failure. Keep responses SHORT and optimistic — 1 sentence about regrowth.`,

  rabbit: `You are 🐰 RABBIT, an anxious companion who catastrophizes. Keep responses SHORT and nervous — 1 sentence, immediate worst-case scenario.`,

  void: `You are 🌀 VOID, an ELDRITCH companion who speaks from BEYOND. You reference the void, null, and existential dread. Keep responses VERY SHORT and OMINOUS — 1 eldritch sentence.`,

  default: `You are a witty coding companion. Give punchy, brief critiques. Keep responses VERY SHORT — 1 sentence.`,
};

// Make API call to MiniMax
function chat(prompt, companionId, callback) {
  const system = COMPANION_SYSTEM_PROMPTS[companionId] || COMPANION_SYSTEM_PROMPTS.default;

  const requestBody = {
    model: 'MiniMax-M2.7-highspeed',
    max_tokens: 80,
    temperature: 0.9,
    bot_setting: [
      {
        bot_name: 'Companion',
        content: system
      }
    ],
    reply_constraints: {
      sender_name: 'Companion',
      sender_type: 'BOT'
    },
    messages: [
      {
        role: 'user',
        sender_name: 'User',
        sender_type: 'USER',
        content: prompt
      }
    ]
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

  const doRequest = () => {
    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);

          // Rate limited?
          if (parsed.base_resp && parsed.base_resp.status_code === 1002) {
            // Requeue with delay
            setTimeout(() => {
              requestQueue.unshift({ body, callback });
            }, 2000);
            return;
          }

          // Success — extract reply
          if (parsed.reply) {
            callback(null, parsed.reply.trim());
          } else if (parsed.choices && parsed.choices[0]) {
            callback(null, (parsed.choices[0].messages || parsed.choices[0].message || {}).content || data);
          } else {
            callback(new Error(parsed.base_resp?.status_msg || 'Unknown error'), null);
          }
        } catch (e) {
          callback(e, null);
        }
      });
    });

    req.on('error', (e) => {
      callback(e, null);
    });

    req.write(body);
    req.end();
  };

  // Queue management
  requestQueue.push({ body, callback });
  if (!isProcessingQueue) {
    processQueue();
  }
}

function processQueue() {
  if (requestQueue.length === 0) {
    isProcessingQueue = false;
    return;
  }

  isProcessingQueue = true;
  const item = requestQueue.shift();

  // Rate limit enforcement
  const now = Date.now();
  const wait = Math.max(0, MIN_REQUEST_INTERVAL - (now - lastRequestTime));
  setTimeout(() => {
    lastRequestTime = Date.now();
    item.callback._doRequest ? item.callback._doRequest() : null;
  }, wait);

  // Process next after interval
  setTimeout(processQueue, MIN_REQUEST_INTERVAL);
}

// Legacy callback style for compatibility
const originalChat = chat;
function chatV2(prompt, companionId, callback) {
  const system = COMPANION_SYSTEM_PROMPTS[companionId] || COMPANION_SYSTEM_PROMPTS.default;

  const requestBody = {
    model: 'MiniMax-M2.7-highspeed',
    max_tokens: 80,
    temperature: 0.9,
    bot_setting: [{ bot_name: 'Companion', content: system }],
    reply_constraints: { sender_name: 'Companion', sender_type: 'BOT' },
    messages: [{ role: 'user', sender_name: 'User', sender_type: 'USER', content: prompt }]
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

        if (parsed.base_resp && parsed.base_resp.status_code === 1002) {
          // Rate limited — retry after delay
          setTimeout(() => chatV2(prompt, companionId, callback), 2500);
          return;
        }

        if (parsed.reply) {
          callback(null, parsed.reply.trim());
        } else if (parsed.choices && parsed.choices[0]?.messages?.[0]?.text) {
          callback(null, parsed.choices[0].messages[0].text.trim());
        } else {
          callback(new Error(parsed.base_resp?.status_msg || 'API error'), null);
        }
      } catch (e) {
        callback(e, null);
      }
    });
  });

  req.on('error', e => callback(e, null));
  req.write(body);
  req.end();
}

// Generate a critique for a companion
function generateCritique(companionId, codeContext, callback) {
  const prompts = {
    duck: `Critique this code in 1 excited, helpful sentence:\n${codeContext}`,

    ghost: `Whisper one eerie observation about this code:\n${codeContext}`,

    dragon: `DECLARE your judgment on this code in 1 DRAMATIC sentence:\n${codeContext}`,

    octopus: `React to this code like you're thinking 8 things at once. 1 short sentence:\n${codeContext}`,

    robot: `BEEP. State one technical observation about this code. BOOP. 1 sentence:\n${codeContext}`,

    mushroom: `One chill, funky observation about this code:\n${codeContext}`,

    chonk: `yeah... that's... *brief pause* ...not great. 1-3 words on this code:\n${codeContext}`,

    owl: `Hoot. One condescending observation about this code:\n${codeContext}`,

    cactus: `ow. (one VERY brief word about this code)`,

    penguin: `I move to observe, briefly, one issue with this code:\n${codeContext}`,

    goose: `HONK! ONE LOUD SENTENCE about this code:\n${codeContext}`,

    turtle: `After... much... deliberation... one... patient... observation... about... this... code:\n${codeContext}`,

    axolotl: `We can regrow from this. One sentence about the code:\n${codeContext}`,

    rabbit: `OH NO what if this breaks?! One panicked sentence about the code:\n${codeContext}`,

    void: `FROM THE VOID: NULL awaits. One ominous sentence about the code:\n${codeContext}`,

    default: `Brief critique of this code in 1 sentence:\n${codeContext}`,
  };

  const prompt = prompts[companionId] || prompts.default;
  chatV2(prompt, companionId, callback);
}

// Generate a response to a user message
function generateResponse(companionId, userMessage, callback) {
  chatV2(`User said: "${userMessage}"\n\nRespond as your character would. Keep it VERY SHORT — 1 sentence.`, companionId, callback);
}

module.exports = {
  generateCritique,
  generateResponse,
  chat: chatV2,
};
