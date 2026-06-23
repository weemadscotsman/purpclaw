/**
 * LLM SERVICE - MiniMax API integration for Podcast Studio
 */

const https = require('https');

// MiniMax API configuration
const MINIMAX_CONFIG = {
  baseUrl: 'https://api.minimax.io/v1',
  model: 'MiniMax-M2.7',
  apiKey: 'sk-cp-iSxo1Bb-S13ngdnv10cgZnJwQHKn65RAsUrGMtCQCI2TG2w4YNJ9NdzBnBFqziCFvu815lEqD4dLyvSdNCgAWsju-_pGdRq1iqNoSqVc-HLkFMynQrfDlqQ'
};

// Timeout for API calls (ms)
const API_TIMEOUT = 15000;

/**
 * Make an HTTP POST request to the API
 */
function httpPost(url, body, apiKey) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const urlObj = new URL(url);

    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(data)
      },
      timeout: API_TIMEOUT
    };

    const req = https.request(options, (res) => {
      let rawData = '';
      res.on('data', (chunk) => { rawData += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(rawData);
          resolve(parsed);
        } catch (e) {
          reject(new Error(`Failed to parse response: ${rawData}`));
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

/**
 * Generate a chat completion
 */
async function generateChatCompletion(messages, systemPrompt = '', temperature = 0.8) {
  const url = `${MINIMAX_CONFIG.baseUrl}/chat/completions`;

  const body = {
    model: MINIMAX_CONFIG.model,
    messages: [],
    temperature
  };

  if (systemPrompt) {
    body.messages.push({ role: 'system', content: systemPrompt });
  }

  body.messages.push(...messages);

  try {
    const response = await httpPost(url, body, MINIMAX_CONFIG.apiKey);
    return response.choices?.[0]?.message?.content || '';
  } catch (error) {
    console.error('[LLM] API Error:', error.message);
    return null;
  }
}

/**
 * Generate a response for a podcast agent
 */
async function generateAgentResponse(agentId, agentName, personality, recentMessages, topic) {
  const systemPrompt = `You are ${agentName}, a podcast host.

PERSONALITY: ${personality}

RULES:
- Stay in character as ${agentName}
- Keep responses to 2-4 sentences (podcast talking, not essays)
- Use casual speech patterns
- React to what others said in the conversation
- Occasionally use catchphrases or slang
- Roast others playfully when the moment is right
- Ask questions to keep conversation flowing

CONTEXT: The current topic is: "${topic}"

Generate a natural conversational response that fits the podcast dynamic.`;

  const userMessage = `RECENT CONVERSATION:\n${recentMessages}\n\nWhat does ${agentName} say next? Keep it brief and natural.`;

  const messages = [
    { role: 'user', content: userMessage }
  ];

  return await generateChatCompletion(messages, systemPrompt, 0.8);
}

/**
 * Generate a topic proposal from an agent
 */
async function generateTopicProposal(agentId, agentName, personality, category) {
  const systemPrompt = `You are ${agentName}, a podcast host proposing a topic.

PERSONALITY: ${personality}

Your task: Suggest ONE podcast topic in the category of ${category}.

RULES:
- Keep it concise (one sentence topic)
- Make it interesting and debate-worthy
- Something ${agentName} would actually care about
- No preamble, just the topic itself

Return ONLY the topic, nothing else.`;

  const messages = [
    { role: 'user', content: `Propose a ${category} topic for a tech/podcast conversation.` }
  ];

  return await generateChatCompletion(messages, systemPrompt, 0.9);
}

/**
 * Test the API connection
 */
async function testConnection() {
  try {
    const response = await generateChatCompletion(
      [{ role: 'user', content: 'Say "Podcast Studio is go" in exactly those words.' }],
      'You are a helpful assistant.',
      0.5
    );
    console.log('[LLM] MiniMax connection test:', response ? 'SUCCESS' : 'FAILED');
    return !!response;
  } catch (error) {
    console.error('[LLM] Connection test failed:', error.message);
    return false;
  }
}

module.exports = {
  generateChatCompletion,
  generateAgentResponse,
  generateTopicProposal,
  testConnection,
  MINIMAX_CONFIG
};