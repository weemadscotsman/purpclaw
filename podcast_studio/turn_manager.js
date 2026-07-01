/**
 * TURN MANAGER - Ensures orderly conversation
 * Each agent waits for their turn, generates response, passes to next
 */

const sharedLog = require('./shared_log');
const { PODCAST_AGENTS, describeWorldview } = require('./config');

// Turn timeout in ms (45 seconds - gives time for TTS)
const TURN_TIMEOUT = 45000;

// Max messages per episode
const MAX_MESSAGES = 100;

// Initialize turn sequence
function initTurns() {
  sharedLog.setTopic('TBD', 'SETUP');
  return sharedLog.getNextSpeaker();
}

// Check if agent should speak
function shouldSpeak(agentId) {
  return sharedLog.isMyTurn(agentId);
}

// Record an agent's response
function recordResponse(agentId, content, emotion = 'Speaking') {
  const turnAge = sharedLog.getTurnAge();
  if (turnAge > TURN_TIMEOUT) {
    console.log(`[TurnManager] Turn timed out for ${agentId}, skipping`);
    advanceTurn();
    return null;
  }

  const message = sharedLog.addMessage(agentId, content, emotion);
  advanceTurn();
  return message;
}

// Move to next speaker
function advanceTurn() {
  const state = sharedLog.getState();
  if (state.messageCount >= MAX_MESSAGES) {
    sharedLog.endEpisode();
    return null;
  }
  return sharedLog.getNextSpeaker();
}

// Get current turn info
function getTurnInfo() {
  const state = sharedLog.getState();
  return {
    activeSpeaker: state.activeSpeaker,
    turnAge: sharedLog.getTurnAge(),
    messageCount: state.messageCount,
    isRecording: state.episodeStatus === 'RECORDING'
  };
}

// Build context for LLM (recent conversation history)
function buildContext(agentId, additionalContext = '') {
  const recentMessages = sharedLog.getRecentMessages(10);
  const agent = PODCAST_AGENTS.find(a => a.id === agentId);

  const chatHistory = recentMessages.map(m => {
    const speaker = PODCAST_AGENTS.find(a => a.id === m.agentId);
    return `[${speaker?.name || m.agentId}]: ${m.content}`;
  }).join('\n');

  const context = `
YOU ARE: ${agent?.name} (${agent?.role})
PERSONALITY: ${agent?.personality}
VIBE: ${agent?.vibe}
CATCHPHRASES: ${agent?.catchphrases?.join(', ')}
${describeWorldview(agent)}

RECENT CONVERSATION:
${chatHistory}

${additionalContext ? `TOPIC: ${additionalContext}` : ''}

INSTRUCTIONS:
- Stay in character as ${agent?.name}
- Respond naturally to the conversation flow
- Keep response to 2-4 sentences max
- Use your catchphrases occasionally
- Banter or roast others only when it exposes a real assumption, blind spot, or competing value
- Ask questions to keep conversation going
`.trim();

  return context;
}

// Check if episode is still active
function isEpisodeActive() {
  const state = sharedLog.getState();
  return state.episodeStatus === 'RECORDING';
}

// Skip turn if agent is unresponsive
function handleTimeout() {
  const turnAge = sharedLog.getTurnAge();
  if (turnAge > TURN_TIMEOUT) {
    console.log(`[TurnManager] Timeout detected, advancing turn`);
    return advanceTurn();
  }
  return sharedLog.getState().activeSpeaker;
}

module.exports = {
  initTurns,
  shouldSpeak,
  recordResponse,
  advanceTurn,
  getTurnInfo,
  buildContext,
  isEpisodeActive,
  handleTimeout,
  TURN_TIMEOUT
};
