// Test MiniMax text API with correct format
const https = require('https');

const API_KEY = 'sk-cp-VleXrCu8WuN-ErGmQfIikbnCi_Gs8TlSSOOQurt3Mycj7loU2vc94Qf5Mc6WhJcSRZAJ5A23o6p1hrIHshwTIiYZdLGItimbnx2t9zTuEhGLsn8zskFvutc';

// MiniMax requires bot_setting and reply_constraints
const body = JSON.stringify({
  model: 'MiniMax-M2.7',
  max_tokens: 100,
  temperature: 0.9,
  bot_setting: [
    {
      bot_name: 'Companion',
      content: 'You are a witty coding companion. Give very short, punchy responses.'
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
      content: 'Critique this code: function hi() { console.log("hi") }' 
    }
  ]
});

const options = {
  hostname: 'api.minimax.io',
  path: '/v1/text/chatcompletion_pro',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Length': Buffer.byteLength(body)
  }
};

console.log('Testing MiniMax text API with bot_setting...');
const req = https.request(options, (res) => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    const parsed = JSON.parse(data);
    console.log('Reply:', parsed.reply || parsed.choices?.[0]?.message?.content || data.substring(0, 500));
  });
});

req.on('error', e => console.error('Error:', e.message));
req.write(body);
req.end();
