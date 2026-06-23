/**
 * SHARED LOG - Message Bus for Podcast Studio
 * All agents read/write here for inter-agent communication
 */

const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, 'shared_log.json');

const DEFAULT_STATE = {
  messages: [],
  currentTopic: null,
  topicCategory: null,
  turnQueue: ['goose', 'hermes', 'openclaude'],
  activeSpeaker: null,
  turnStartTime: null,
  episodeStatus: 'IDLE', // IDLE, RECORDING, COOLDOWN
  episodeStart: null,
  messageCount: 0,
  lastActivity: null
};

// Ensure log file exists
function initLog() {
  if (!fs.existsSync(LOG_FILE)) {
    fs.writeFileSync(LOG_FILE, JSON.stringify(DEFAULT_STATE, null, 2));
  }
}

// Read current state
function readLog() {
  initLog();
  try {
    const raw = fs.readFileSync(LOG_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return { ...DEFAULT_STATE };
  }
}

// Write state
function writeLog(state) {
  fs.writeFileSync(LOG_FILE, JSON.stringify(state, null, 2));
}

// Add message from an agent
function addMessage(agentId, content, emotion = 'Speaking') {
  const state = readLog();
  const message = {
    id: `${agentId}-${Date.now()}`,
    agentId,
    content,
    emotion,
    timestamp: new Date().toISOString()
  };
  state.messages.push(message);
  state.lastActivity = Date.now();
  state.messageCount++;
  writeLog(state);
  return message;
}

// Get last N messages
function getRecentMessages(count = 10) {
  const state = readLog();
  return state.messages.slice(-count);
}

// Get messages by agent
function getAgentMessages(agentId, count = 5) {
  const state = readLog();
  return state.messages.filter(m => m.agentId === agentId).slice(-count);
}

// Set current topic
function setTopic(topic, category = 'CHAT') {
  const state = readLog();
  state.currentTopic = topic;
  state.topicCategory = category;
  state.turnQueue = ['goose', 'hermes', 'openclaude']; // Reset turn order
  writeLog(state);
}

// Get next speaker (round-robin)
function getNextSpeaker() {
  const state = readLog();
  if (state.turnQueue.length === 0) {
    state.turnQueue = ['goose', 'hermes', 'openclaude'];
  }
  const next = state.turnQueue.shift();
  state.turnQueue.push(next);
  state.activeSpeaker = next;
  state.turnStartTime = Date.now();
  writeLog(state);
  return next;
}

// Check if it's a specific agent's turn
function isMyTurn(agentId) {
  const state = readLog();
  return state.activeSpeaker === agentId;
}

// Get time since last turn started (ms)
function getTurnAge() {
  const state = readLog();
  if (!state.turnStartTime) return 0;
  return Date.now() - state.turnStartTime;
}

// Skip current turn (timeout)
function skipTurn() {
  const state = readLog();
  state.turnQueue = state.turnQueue.slice(1); // Remove stuck agent, put at back
  writeLog(state);
  return getNextSpeaker();
}

// Start episode
function startEpisode(topic) {
  const state = readLog();
  state.episodeStatus = 'RECORDING';
  state.episodeStart = Date.now();
  state.messages = [];
  state.messageCount = 0;
  state.currentTopic = topic;
  state.turnQueue = ['goose', 'hermes', 'openclaude'];
  state.activeSpeaker = null;
  writeLog(state);
}

// End episode
function endEpisode() {
  const state = readLog();
  state.episodeStatus = 'COOLDOWN';
  writeLog(state);
}

// Get episode duration in seconds
function getEpisodeDuration() {
  const state = readLog();
  if (!state.episodeStart) return 0;
  return Math.floor((Date.now() - state.episodeStart) / 1000);
}

// Export full transcript
function getTranscript() {
  const state = readLog();
  return {
    topic: state.currentTopic,
    category: state.topicCategory,
    duration: getEpisodeDuration(),
    messageCount: state.messageCount,
    messages: state.messages
  };
}

// Reset log
function resetLog() {
  writeLog({ ...DEFAULT_STATE });
}

// Get state
function getState() {
  return readLog();
}

module.exports = {
  addMessage,
  getRecentMessages,
  getAgentMessages,
  setTopic,
  getNextSpeaker,
  isMyTurn,
  getTurnAge,
  skipTurn,
  startEpisode,
  endEpisode,
  getEpisodeDuration,
  getTranscript,
  resetLog,
  getState,
  LOG_FILE
};