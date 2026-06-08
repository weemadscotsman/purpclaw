/**
 * TOPIC PICKER - Rotating topic duty + fallback topics
 * Each agent takes turns proposing topics, or user can inject
 */

const { TOPIC_POOLS, FALLBACK_TOPICS, PODCAST_AGENTS } = require('./config');
const sharedLog = require('./shared_log');

// Track topic history to avoid repeats
const topicHistory = [];
const MAX_HISTORY = 20;

// Get category weights (can be customized)
const CATEGORY_WEIGHTS = {
  TECH: 0.35,
  CHAOS: 0.30,
  PHILOSOPHY: 0.15,
  EXISTENTIAL: 0.10,
  FINANCE: 0.10
};

// Pick a random category based on weights
function pickCategory() {
  const rand = Math.random();
  let cumulative = 0;
  for (const [cat, weight] of Object.entries(CATEGORY_WEIGHTS)) {
    cumulative += weight;
    if (rand <= cumulative) return cat;
  }
  return 'TECH';
}

// Pick a random topic from a category
function pickFromPool(category) {
  const pool = TOPIC_POOLS[category] || TOPIC_POOLS.TECH;
  const available = pool.filter(t => !topicHistory.includes(t));
  if (available.length === 0) {
    // Reset if all topics used
    topicHistory.length = 0;
    return pool[Math.floor(Math.random() * pool.length)];
  }
  return available[Math.floor(Math.random() * available.length)];
}

// Pick a fallback topic
function pickFallback() {
  const available = FALLBACK_TOPICS.filter(t => !topicHistory.includes(t));
  if (available.length === 0) {
    topicHistory.length = 0;
    return FALLBACK_TOPICS[Math.floor(Math.random() * FALLBACK_TOPICS.length)];
  }
  return available[Math.floor(Math.random() * available.length)];
}

// Main topic selector - combines category + pool + fallback
function selectTopic(preferredCategory = null) {
  const category = preferredCategory || pickCategory();
  let topic = pickFromPool(category);

  // Fallback if pool topic fails
  if (!topic) {
    topic = pickFallback();
  }

  // Add to history
  topicHistory.push(topic);
  if (topicHistory.length > MAX_HISTORY) {
    topicHistory.shift();
  }

  // Update shared log
  sharedLog.setTopic(topic, category);

  return { topic, category };
}

// Agent proposes a topic (for democratic topic selection)
function agentProposeTopic(agentId) {
  const agent = PODCAST_AGENTS.find(a => a.id === agentId);
  const category = pickCategory();

  // Agent-specific topic bias based on personality
  let topic = null;
  if (agentId === 'goose') {
    topic = TOPIC_POOLS.CHAOS[Math.floor(Math.random() * TOPIC_POOLS.CHAOS.length)];
  } else if (agentId === 'hermes') {
    topic = TOPIC_POOLS.TECH[Math.floor(Math.random() * TOPIC_POOLS.TECH.length)];
  } else {
    topic = pickFromPool(category);
  }

  return { topic, category, proposedBy: agent?.name };
}

// User injection (user drops a topic)
function injectTopic(topic, category = 'USER_INJECTED') {
  topicHistory.push(topic);
  sharedLog.setTopic(topic, category);
  return { topic, category };
}

// Get current topic info
function getCurrentTopic() {
  const state = sharedLog.getState();
  return {
    topic: state.currentTopic,
    category: state.topicCategory
  };
}

// Reset history (for new day)
function resetHistory() {
  topicHistory.length = 0;
}

module.exports = {
  selectTopic,
  agentProposeTopic,
  injectTopic,
  getCurrentTopic,
  resetHistory,
  pickCategory
};