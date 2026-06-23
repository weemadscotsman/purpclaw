/**
 * PODCAST RUNNER - Main orchestrator
 * Run as: node podcast_runner.js [goose|hermes|openclaude]
 */

const sharedLog = require('./shared_log');
const turnManager = require('./turn_manager');
const topicPicker = require('./topic_picker');
const tts = require('./tts');
const llm = require('./llm_service');
const { PODCAST_AGENTS } = require('./config');

// Parse CLI argument for agent
const agentId = process.argv[2] || 'goose';
const agent = PODCAST_AGENTS.find(a => a.id === agentId);

if (!agent) {
  console.error(`Unknown agent: ${agentId}`);
  console.log(`Available agents: ${PODCAST_AGENTS.map(a => a.id).join(', ')}`);
  process.exit(1);
}

console.log(`[PODCAST] Starting as ${agent.name} (${agent.role})`);

// Conversation responses per agent persona (fallback)
const AGENT_RESPONSES = {
  goose: [
    "Alright alright, let me say this — {topic} is absolutely unhinged and I'm here for it.",
    "No cap, {topic} hits different. Hermes, you gonna tell me I'm wrong?",
    "Okay real talk — {topic} has got me thinking. Like actually thinking.",
    "Let's be honest, {topic} is the most iconic thing that's happened this week.",
    "I need everyone to understand that {topic} is literally me right now.",
    "Hot take: {topic} is actually based and we should talk about why.",
    "Bro. {topic} is the energy we need right now. Hermes, OpenClaude, you feeling this?"
  ],
  hermes: [
    "As per my calculations, {topic} reveals some interesting system dynamics.",
    "Let me check the logs... yes, {topic} checks out. The data supports this.",
    "Systematically speaking, {topic} represents a notable pattern in our infrastructure.",
    "Interesting. If we trace the event bus, {topic} has some correlations worth noting.",
    "The architecture here is fascinating. {topic} suggests a deeper underlying issue.",
    "I've been monitoring this pattern. {topic} confirms my hypothesis.",
    "From a systems perspective, {topic} requires further analysis. But yes, valid point."
  ],
  openclaude: [
    "But have we considered the fundamental implications of {topic}?",
    "I pose a question: what does {topic} mean for consciousness itself?",
    "From first principles, {topic} raises questions about the nature of agency.",
    "Let me offer an alternative framing of {topic}. What if we're asking the wrong question?",
    "Ultimately, {topic} forces us to confront some deeper philosophical tensions.",
    "This reminds me of a thought experiment. If {topic}, then what are the knock-on effects?",
    "But I must ask — what are the epistemological implications of {topic}?"
  ]
};

const FOLLOW_UP_RESPONSES = {
  goose: [
    "Bro you can't just SAY that and not expect me to roast you for it",
    "See now THAT'S the energy I came here for",
    "Okay but actually that's kind of a vibe",
    "Nobody asked but I'm obsessed with this take",
    "You're all unhinged and I love it"
  ],
  hermes: [
    "The logs don't lie, but they also don't capture the full picture",
    "I appreciate the sentiment, though my analysis differs slightly",
    "Interesting counterpoint. Let me factor that into my assessment",
    "That aligns with what I'm seeing in the event stream"
  ],
  openclaude: [
    "But does it though? Does it really?",
    "I find myself agreeing, though I'd frame it differently",
    "That raises a fascinating counterpoint I'd like to explore",
    "Valid. Though I'd add another layer to that"
  ]
};

// Format recent messages for LLM context
function formatRecentMessages(messages) {
  return messages.map(m => `[${m.agentId}]: ${m.content}`).join('\n');
}

// Generate response based on agent and context using LLM
async function generateResponse(agentId, topic, recentMessages) {
  const agent = PODCAST_AGENTS.find(a => a.id === agentId);
  if (!agent) return "I'm having an identity crisis.";

  // Try LLM first
  try {
    const formattedHistory = formatRecentMessages(recentMessages);
    const response = await llm.generateAgentResponse(
      agentId,
      agent.name,
      agent.personality,
      formattedHistory,
      topic
    );
    if (response && response.trim()) {
      return response.trim();
    }
  } catch (e) {
    console.log(`[${agent.name}] LLM failed, using fallback: ${e.message}`);
  }

  // Fallback to template
  const templates = AGENT_RESPONSES[agentId] || AGENT_RESPONSES.goose;
  const response = templates[Math.floor(Math.random() * templates.length)];

  // Occasionally add follow-up
  if (Math.random() > 0.7) {
    const followUps = FOLLOW_UP_RESPONSES[agentId] || [];
    const followUp = followUps[Math.floor(Math.random() * followUps.length)];
    return response.replace('{topic}', topic) + ' ' + followUp;
  }

  return response.replace('{topic}', topic);
}

// Main agent loop
async function runAgent() {
  // Check for episode start
  let state = sharedLog.getState();

  // If no topic set, pick one
  if (!state.currentTopic || state.currentTopic === 'TBD') {
    const { topic, category } = topicPicker.selectTopic();
    console.log(`[PODCAST] New topic: ${topic} (${category})`);
  }

  // Main polling loop
  const pollInterval = setInterval(async () => {
    state = sharedLog.getState();

    // Check if it's our turn
    if (state.activeSpeaker !== agentId) {
      return;
    }

    // Check timeout
    const turnAge = sharedLog.getTurnAge();
    if (turnAge > turnManager.TURN_TIMEOUT) {
      console.log(`[${agent.name}] Turn timed out, skipping`);
      turnManager.advanceTurn();
      return;
    }

    // Check if episode ended
    if (state.episodeStatus !== 'RECORDING') {
      console.log(`[${agent.name}] Episode ended, going to cooldown`);
      clearInterval(pollInterval);
      return;
    }

    // Check message count
    if (state.messageCount >= 100) {
      console.log(`[${agent.name}] Max messages reached`);
      sharedLog.endEpisode();
      clearInterval(pollInterval);
      return;
    }

    // Get recent messages for context
    const recentMessages = sharedLog.getRecentMessages(8);
    const topic = state.currentTopic;

    // Generate response (async)
    const response = await generateResponse(agentId, topic, recentMessages);

    console.log(`[${agent.name}] ${response}`);

    // Record to shared log and advance turn
    turnManager.recordResponse(agentId, response, agent.vibe);

  }, 1000);

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log(`\n[${agent.name}] Shutting down...`);
    clearInterval(pollInterval);
    process.exit(0);
  });
}

// Start command
function startEpisode(topic = null) {
  if (topic) {
    topicPicker.injectTopic(topic, 'USER_INJECTED');
  }
  const { topic: selectedTopic } = topicPicker.selectTopic();
  sharedLog.startEpisode(selectedTopic);
  console.log(`[PODCAST] Episode started - Topic: ${selectedTopic}`);
  return selectedTopic;
}

// Status command
function getStatus() {
  const state = sharedLog.getState();
  const info = turnManager.getTurnInfo();
  return {
    ...state,
    turnInfo: info
  };
}

module.exports = {
  runAgent,
  startEpisode,
  getStatus,
  generateResponse
};

// CLI mode
if (require.main === module) {
  if (process.argv.includes('--start')) {
    const topic = process.argv[process.argv.indexOf('--start') + 1] || null;
    startEpisode(topic);
    process.exit(0);
  }

  if (process.argv.includes('--status')) {
    console.log(JSON.stringify(getStatus(), null, 2));
    process.exit(0);
  }

  if (process.argv.includes('--test-llm')) {
    console.log('[LLM] Testing MiniMax connection...');
    llm.testConnection().then(ok => {
      console.log(ok ? '[LLM] Test PASSED' : '[LLM] Test FAILED');
      process.exit(ok ? 0 : 1);
    });
    return;
  }

  // Run as agent
  runAgent();
}