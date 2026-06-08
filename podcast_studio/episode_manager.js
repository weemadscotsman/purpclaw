/**
 * EPISODE MANAGER - Handle episode lifecycle + HTTP Dashboard
 * Start/stop episodes, serve dashboard, manage schedules
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const url = require('url');
const sharedLog = require('./shared_log');
const topicPicker = require('./topic_picker');
const llm = require('./llm_service');
const { spawn } = require('child_process');

const EPISODES_DIR = path.join(__dirname, 'episodes');
const PORT = 7890;

// Ensure episodes directory exists
if (!fs.existsSync(EPISODES_DIR)) {
  fs.mkdirSync(EPISODES_DIR, { recursive: true });
}

// MIME types
const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

/**
 * Start HTTP server for dashboard
 */
function startServer() {
  const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    // API endpoints
    if (pathname === '/api/state') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(sharedLog.getState()));
      return;
    }

    if (pathname === '/api/start') {
      const topic = parsedUrl.query.topic;
      startEpisode(topic);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', topic: sharedLog.getState().currentTopic }));
      return;
    }

    if (pathname === '/api/stop') {
      stopEpisode();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'stopped' }));
      return;
    }

    if (pathname === '/api/llm-test') {
      llm.testConnection().then(ok => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: ok }));
      });
      return;
    }

    // Serve static files
    let filePath = pathname === '/' ? '/index.html' : pathname;
    filePath = path.join(__dirname, filePath);

    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || 'text/plain';

    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    });
  });

  server.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════╗
║  🎙️  PODCAST STUDIO DASHBOARD                    ║
║══════════════════════════════════════════════════║
║  Dashboard:  http://localhost:${PORT}
║  API:        http://localhost:${PORT}/api/state
║══════════════════════════════════════════════════║
║  Start:      GET /api/start?topic=YOUR_TOPIC
║  Stop:       GET /api/stop
║  State:      GET /api/state
╚══════════════════════════════════════════════════╝
`);
  });

  return server;
}

/**
 * Start a new episode
 */
function startEpisode(topic = null) {
  let selectedTopic = null;

  if (topic) {
    topicPicker.injectTopic(topic, 'USER_INJECTED');
    selectedTopic = topic;
  } else {
    const result = topicPicker.selectTopic();
    selectedTopic = result.topic;
  }

  sharedLog.startEpisode(selectedTopic);

  // Kick off turn sequence - give first agent their turn
  sharedLog.getNextSpeaker();

  console.log('===========================================');
  console.log(`  PODCAST EPISODE STARTED`);
  console.log(`  Topic: ${selectedTopic}`);
  console.log(`  Time: ${new Date().toISOString()}`);
  console.log('===========================================');

  // Launch 3 agent processes
  launchAgents();

  return selectedTopic;
}

/**
 * Launch all 3 agent processes
 */
function launchAgents() {
  const agents = ['goose', 'hermes', 'openclaude'];

  agents.forEach(agentId => {
    const process = spawn('node', [path.join(__dirname, 'podcast_runner.js'), agentId], {
      detached: false,
      stdio: 'inherit',
      windowsHide: false
    });

    process.unref();
    console.log(`[Episode] Launched ${agentId}`);
  });
}

/**
 * Stop current episode and save transcript
 */
function stopEpisode() {
  const transcript = sharedLog.getTranscript();

  // Save transcript
  const filename = `episode_${Date.now()}.json`;
  const filepath = path.join(EPISODES_DIR, filename);

  fs.writeFileSync(filepath, JSON.stringify({
    ...transcript,
    endedAt: new Date().toISOString()
  }, null, 2));

  sharedLog.endEpisode();

  console.log('===========================================');
  console.log(`  EPISODE ENDED`);
  console.log(`  Duration: ${transcript.duration}s`);
  console.log(`  Messages: ${transcript.messageCount}`);
  console.log(`  Transcript: ${filename}`);
  console.log('===========================================');

  return transcript;
}

/**
 * Get recent episodes
 */
function getRecentEpisodes(count = 10) {
  const files = fs.readdirSync(EPISODES_DIR)
    .filter(f => f.endsWith('.json'))
    .sort()
    .reverse()
    .slice(0, count);

  return files.map(f => {
    const raw = fs.readFileSync(path.join(EPISODES_DIR, f), 'utf8');
    const data = JSON.parse(raw);
    return {
      filename: f,
      topic: data.topic,
      duration: data.duration,
      messageCount: data.messageCount,
      endedAt: data.endedAt
    };
  });
}

/**
 * Load and display episode transcript
 */
function loadEpisode(filename) {
  const filepath = path.join(EPISODES_DIR, filename);
  if (!fs.existsSync(filepath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filepath, 'utf8'));
}

/**
 * Format transcript as text for display/export
 */
function formatTranscript(transcript) {
  const lines = [];
  lines.push('='.repeat(50));
  lines.push(`TOPIC: ${transcript.topic}`);
  lines.push(`DURATION: ${Math.floor(transcript.duration / 60)}m ${transcript.duration % 60}s`);
  lines.push(`MESSAGES: ${transcript.messageCount}`);
  lines.push('='.repeat(50));
  lines.push('');

  const { PODCAST_AGENTS } = require('./config');

  transcript.messages.forEach(msg => {
    const agent = PODCAST_AGENTS.find(a => a.id === msg.agentId);
    const name = agent?.name || msg.agentId;
    const emoji = agent?.vibe === 'CHAOS' ? '🔥' :
                  agent?.vibe === 'TACTICAL' ? '🔧' : '🤔';
    lines.push(`${emoji} [${name}]: ${msg.content}`);
  });

  lines.push('');
  lines.push('='.repeat(50));
  lines.push('END OF TRANSCRIPT');

  return lines.join('\n');
}

/**
 * Check if episode is currently recording
 */
function isRecording() {
  const state = sharedLog.getState();
  return state.episodeStatus === 'RECORDING';
}

module.exports = {
  startServer,
  startEpisode,
  stopEpisode,
  getRecentEpisodes,
  loadEpisode,
  formatTranscript,
  isRecording,
  launchAgents
};

// CLI mode
if (require.main === module) {
  if (process.argv.includes('--start')) {
    const topicIndex = process.argv.indexOf('--start') + 1;
    const topic = process.argv[topicIndex] || null;
    startEpisode(topic);
    return;
  }

  if (process.argv.includes('--stop')) {
    stopEpisode();
    return;
  }

  if (process.argv.includes('--status')) {
    console.log(JSON.stringify(sharedLog.getState(), null, 2));
    return;
  }

  // Start the dashboard server
  startServer();
}