/**
 * PODCAST STUDIO — Telegram Bridge
 *
 * Run: node podcast_telegram.js
 * Commands:
 *   /start          — show welcome + agent roster
 *   /go [topic]     — start episode (random topic or specified)
 *   /stop           — stop current episode
 *   /topic [cat]    — pick topic from category (TECH|CHAOS|PHILOSOPHY|EXISTENTIAL|FINANCE)
 *   /status         — current episode state
 *   /agents         — show agent roster
 *
 * Requires:
 *   python -m edge_tts   (edge-tts installed in Python path)
 *   curl.exe             (for Telegram uploads)
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const https = require('https');
const http = require('http');
const { URL } = require('url');

// Load existing podcast config and LLM service
const { PODCAST_AGENTS, TOPIC_POOLS, FALLBACK_TOPICS } = require('./config.js');
const llmService = require('./llm_service.js');

// Telegram config — use the same bot already wired in PURPCLAW
const TELEGRAM_BOT_TOKEN = process.env.PODCAST_TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.PODCAST_TELEGRAM_CHAT_ID || process.env.TELEGRAM_CHAT_ID || '';
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

// Episode state
let episode = {
  active: false,
  topic: null,
  category: null,
  messages: [],       // { agentId, text, timestamp }
  turnIndex: 0,
  turnCount: 0,
  maxTurns: 20,       // ~20 turns per episode = ~5-10 min of content
  startTime: null,
  statusMsgId: null,  // Telegram message ID for status updates
  stopping: false,
};

// ─── Telegram API helpers ────────────────────────────────────────────────────

function telegramGet(method, params = {}) {
  return new Promise((resolve, reject) => {
    if (!TELEGRAM_BOT_TOKEN) return reject(new Error('Missing PODCAST_TELEGRAM_BOT_TOKEN or TELEGRAM_BOT_TOKEN'));
    const q = new URLSearchParams(params).toString();
    https.get(`${TELEGRAM_API}/${method}?${q}`, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('Telegram parse error')); }
      });
    }).on('error', reject);
  });
}

function telegramPost(method, body) {
  return new Promise((resolve, reject) => {
    if (!TELEGRAM_BOT_TOKEN) return reject(new Error('Missing PODCAST_TELEGRAM_BOT_TOKEN or TELEGRAM_BOT_TOKEN'));
    const bodyStr = JSON.stringify(body);
    const url = new URL(`${TELEGRAM_API}/${method}`);
    const opts = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr) }
    };
    const req = https.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('Telegram parse error')); }
      });
    }).on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

/** Send text message to Telegram */
async function sendMessage(text, chatId = TELEGRAM_CHAT_ID) {
  if (!chatId) throw new Error('Missing PODCAST_TELEGRAM_CHAT_ID or TELEGRAM_CHAT_ID');
  // Escape MarkdownV2
  const escape = t => t.replace(/[_*[\]()~`>#+=|{}.!\\-]/g, x => '\\' + x);
  try {
    return await telegramPost('sendMessage', {
      chat_id: chatId,
      text: escape(text),
      parse_mode: 'MarkdownV2',
    });
  } catch (e) {
    // Fallback: send without markdown
    return await telegramPost('sendMessage', { chat_id: chatId, text: text.slice(0, 4096) });
  }
}

/** Send text to Telegram without markdown escape */
async function sendPlain(text, chatId = TELEGRAM_CHAT_ID) {
  if (!chatId) throw new Error('Missing PODCAST_TELEGRAM_CHAT_ID or TELEGRAM_CHAT_ID');
  return await telegramPost('sendMessage', { chat_id: chatId, text });
}

/** Send audio clip to Telegram via curl (avoids multipart JSON issues) */
function sendAudioMp3(audioPath, caption, chatId = TELEGRAM_CHAT_ID) {
  return new Promise((resolve, reject) => {
    if (!TELEGRAM_BOT_TOKEN) return reject(new Error('Missing PODCAST_TELEGRAM_BOT_TOKEN or TELEGRAM_BOT_TOKEN'));
    if (!chatId) return reject(new Error('Missing PODCAST_TELEGRAM_CHAT_ID or TELEGRAM_CHAT_ID'));
    const { spawn } = require('child_process');
    const args = [
      '-F', `audio=@${audioPath};type=audio/mpeg`,
      '-F', `chat_id=${chatId}`,
      '-F', `caption=${caption}`,
      `${TELEGRAM_API}/sendAudio`
    ];
    const curl = spawn('curl.exe', args);
    let out = '', err = '';
    curl.stdout.on('data', d => out += d);
    curl.stderr.on('data', d => err += d);
    curl.on('close', code => {
      if (code === 0) resolve(out);
      else reject(new Error(`curl exited ${code}: ${err}`));
    });
  });
}

// ─── Edge-TTS voice generation ───────────────────────────────────────────────

/**
 * Generate MP3 audio via edge-tts.
 * voiceMap: edge-tts voice name per agent.
 * Falls back to en-US-AvaNeural if edge-tts fails.
 */
function generateTts(text, voiceName, outputPath) {
  return new Promise((resolve, reject) => {
    const voice = voiceName || 'en-US-AvaNeural';
    const pythonExe = 'python';
    const args = ['-m', 'edge_tts', '-v', voice, '-t', text, '--write-media', outputPath];
    const proc = spawn(pythonExe, args);
    let stderr = '';
    proc.stderr.on('data', d => stderr += d);
    proc.on('close', code => {
      if (code === 0 && fs.existsSync(outputPath)) resolve(outputPath);
      else {
        // Fallback: try with AvaNeural
        const fbArgs = ['-m', 'edge_tts', '-v', 'en-US-AvaNeural', '-t', text, '--write-media', outputPath];
        const fb = spawn(pythonExe, fbArgs);
        fb.on('close', fbCode => {
          if (fbCode === 0) resolve(outputPath);
          else reject(new Error(`edge-tts failed: ${stderr}`));
        });
      }
    });
  });
}

// ─── Topic selection ───────────────────────────────────────────────────────────

function pickRandomTopic(category) {
  if (category && TOPIC_POOLS[category]) {
    const pool = TOPIC_POOLS[category];
    return { topic: pool[Math.floor(Math.random() * pool.length)], category };
  }
  // Weighted random: TECH 35%, CHAOS 30%, PHILOSOPHY 15%, EXISTENTIAL 10%, FINANCE 10%
  const cats = ['TECH', 'TECH', 'TECH', 'TECH', 'TECH', 'TECH', 'TECH',
                'CHAOS', 'CHAOS', 'CHAOS', 'CHAOS', 'CHAOS', 'CHAOS',
                'PHILOSOPHY', 'PHILOSOPHY', 'PHILOSOPHY',
                'EXISTENTIAL', 'EXISTENTIAL',
                'FINANCE', 'FINANCE'];
  const cat = cats[Math.floor(Math.random() * cats.length)];
  const pool = TOPIC_POOLS[cat];
  return { topic: pool[Math.floor(Math.random() * pool.length)], category: cat };
}

// ─── Episode loop ─────────────────────────────────────────────────────────────

async function runEpisode(topic, category) {
  episode.active = true;
  episode.topic = topic;
  episode.category = category;
  episode.messages = [];
  episode.turnCount = 0;
  episode.startTime = Date.now();

  const topicLine = category ? `*${category}*\n_${topic}_` : `_${topic}_`;
  await sendPlain(`🎙️ *PODCAST EPISODE STARTING*\n\nTopic: ${topicLine}\n\n${PODCAST_AGENTS.map(a => `• ${a.name} [${a.vibe}]`).join('\n')}`);

  // Generate MAX_TURNS full rounds
  while (episode.active && episode.turnCount < episode.maxTurns) {
    for (const agent of PODCAST_AGENTS) {
      if (!episode.active || episode.stopping) break;

      episode.turnCount++;
      const startTs = Date.now();

      // Build context: last 6 messages
      const recent = episode.messages.slice(-6)
        .map(m => `${m.agentName}: ${m.text}`)
        .join('\n') || 'No previous messages — open the conversation.';

      const agentConfig = PODCAST_AGENTS.find(a => a.id === agent.id);

      // Generate LLM response
      let text;
      try {
        text = await llmService.generateAgentResponse(
          agent.id, agent.name, agent.personality, recent, episode.topic, agentConfig
        );
      } catch (e) {
        text = `[${agent.name} is thinking...]`;
      }

      // Fallback if LLM returned nothing
      if (!text || text.length < 3) {
        text = agentConfig.catchphrases
          ? `${agent.name} says: ${agentConfig.catchphrases[Math.floor(Math.random() * agentConfig.catchphrases.length)]}`
          : `${agent.name} has entered the chat.`;
      }

      // Truncate very long responses for Telegram
      text = text.trim().slice(0, 500);

      episode.messages.push({ agentId: agent.id, agentName: agent.name, text, timestamp: Date.now() });

      // Show text update to Telegram
      const vibe = agent.vibe.padEnd(12).slice(0, 12);
      const shortText = text.slice(0, 180) + (text.length > 180 ? '…' : '');
      await sendPlain(
        `▌ ${agent.name.toUpperCase()} [${vibe}] (${episode.turnCount}/${episode.maxTurns})\n_${shortText}_`
      );

      // Generate TTS + send to Telegram
      const tmpDir = path.join(__dirname, 'tmp');
      if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
      const mp3Path = path.join(tmpDir, `clip_${episode.turnCount}_${agent.id}.mp3`);

      try {
        await generateTts(text, agent.voiceName, mp3Path);
        const caption = `▌ ${agent.name}: ${shortText}`;
        await sendAudioMp3(mp3Path, caption);
        // Clean up immediately
        fs.unlinkSync(mp3Path);
      } catch (e) {
        // TTS failed — text was already sent above
        console.error(`[TTS] ${agent.name} failed: ${e.message}`);
      }

      // Brief delay between turns (400ms)
      await new Promise(r => setTimeout(r, 400));
    }
  }

  // Episode ended
  const duration = Math.round((Date.now() - episode.startTime) / 1000);
  const mCount = episode.messages.length;
  await sendPlain(
    `🏁 *EPISODE ENDED*\n\nTopic: _${episode.topic}_` +
    `\nDuration: ${Math.floor(duration/60)}m ${duration%60}s` +
    `\nTurns: ${mCount}` +
    `\nAgents: ${[...new Set(episode.messages.map(m=>m.agentName))].join(', ')}` +
    `\n\n_Audio clips sent above — stitch them together for the full episode._`
  );

  episode.active = false;
  episode.stopping = false;
  episode.statusMsgId = null;
}

// ─── Telegram polling ─────────────────────────────────────────────────────────

let lastUpdateId = 0;

async function pollTelegram() {
  try {
    const updates = await telegramGet('getUpdates', {
      offset: lastUpdateId + 1,
      timeout: 30,
    });

    if (!updates.ok || !updates.result?.length) return;

    for (const update of updates.result) {
      lastUpdateId = update.update_id;
      const msg = update.message;
      if (!msg || !msg.text) continue;

      const text = msg.text.trim();
      const chatId = String(msg.chat.id);
      const cmd = text.split(' ')[0].toLowerCase();
      const args = text.split(' ').slice(1).join(' ');

      console.log(`[TG] ${cmd} from ${chatId}`);

      // Only respond in our authorized chat
      if (chatId !== TELEGRAM_CHAT_ID) continue;

      if (cmd === '/start') {
        await sendPlain(
          `🎙️ *PODCAST STUDIO*\n\n` +
          `Three AI agents shoot the shit about whatever's on the stack.\n\n` +
          `*AGENTS:*\n` +
          PODCAST_AGENTS.map(a =>
            `▸ ${a.name} [${a.vibe}]\n   ${a.role}\n   Voice: \`${a.voiceName}\``
          ).join('\n\n') +
          `\n\n*COMMANDS:*\n` +
          `/go — random episode\n` +
          `/go [topic] — specific topic\n` +
          `/go tech|chaos|philosophy|existential|finance\n` +
          `/stop — end episode\n` +
          `/topic — show random topic\n` +
          `/agents — agent roster\n` +
          `/status — current episode`
        );

      } else if (cmd === '/agents') {
        await sendPlain(
          `*AGENT ROSTER*\n\n` +
          PODCAST_AGENTS.map(a =>
            `▸ *${a.name}*\n  Role: ${a.role}\n  Vibe: ${a.vibe}\n  Voice: \`${a.voiceName}\`\n  ${a.catchphrases.slice(0,3).map(c => `"${c}"`).join(', ')}`
          ).join('\n\n')
        );

      } else if (cmd === '/status') {
        if (episode.active) {
          const elapsed = Math.round((Date.now() - episode.startTime) / 1000);
          await sendPlain(
            `🎙️ *EPISODE LIVE*\nTopic: _${episode.topic}_\n` +
            `Turn ${episode.turnCount}/${episode.maxTurns} ` +
            `(${Math.floor(elapsed/60)}m ${elapsed%60}s elapsed)`
          );
        } else {
          await sendPlain(`*PODCAST STUDIO IDLE*\n\nSend /go to start an episode.`);
        }

      } else if (cmd === '/topic') {
        const cat = args.trim().toUpperCase();
        const validCats = ['TECH', 'CHAOS', 'PHILOSOPHY', 'EXISTENTIAL', 'FINANCE'];
        let result;
        if (cat && validCats.includes(cat)) {
          result = pickRandomTopic(cat);
        } else {
          result = pickRandomTopic();
        }
        await sendPlain(`*NEXT TOPIC*\n\n_${result.category}_ ▸ ${result.topic}\n\nSend /go to start with this topic.`);

      } else if (cmd === '/go' || cmd === '/topic') {
        // /topic is also handled above, /go starts episode
        if (episode.active) {
          await sendPlain(`⚠️ Episode already live\! Send /stop first\.`);
          continue;
        }

        let topic, category;
        const raw = args.trim();

        if (raw) {
          const upperRaw = raw.toUpperCase();
          const validCats = ['TECH', 'CHAOS', 'PHILOSOPHY', 'EXISTENTIAL', 'FINANCE'];
          if (validCats.includes(upperRaw)) {
            const picked = pickRandomTopic(upperRaw);
            topic = picked.topic;
            category = picked.category;
          } else {
            topic = raw;
            category = null;
          }
        } else {
          const picked = pickRandomTopic();
          topic = picked.topic;
          category = picked.category;
        }

        // Fire episode asynchronously
        runEpisode(topic, category).catch(err => {
          console.error('[Episode] Error:', err);
          sendPlain(`❌ Episode crashed: ${err.message}`);
          episode.active = false;
        });

      } else if (cmd === '/stop') {
        if (!episode.active) {
          await sendPlain(`No episode running. Send /go to start one.`);
        } else {
          episode.stopping = true;
          await sendPlain(`🛑 Stopping episode after current round…`);
        }

      } else {
        await sendPlain(`Unknown command. Try /start to see available commands.`);
      }
    }
  } catch (e) {
    console.error('[Poll] Error:', e.message);
  }

  // Continue polling
  setImmediate(pollTelegram);
}

// ─── Crash capture ────────────────────────────────────────────────────────────
process.on('uncaughtException', (err) => {
  console.error('[CRASH]', err.message, err.stack);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED]', String(reason));
  process.exit(1);
});

// ─── Main ─────────────────────────────────────────────────────────────────────

console.log('🎙️  PODCAST STUDIO — Telegram Bridge');
console.log(`    Bot: MINIMIMIMAXINEBOT`);
console.log(`    Agents: ${PODCAST_AGENTS.map(a => a.name).join(', ')}`);
console.log(`    LLM: ${llmService.MINIMAX_CONFIG.model}`);
console.log('');
console.log('Commands: /go [topic|category]  /stop  /topic  /status  /agents');
console.log('Waiting for messages…');

pollTelegram().catch(console.error);
