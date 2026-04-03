'use strict';
/**
 * lib/commands/tour.js — First-Time Narrated Walkthrough
 * =======================================================
 * A TTS-guided tour of every PurpClaw system and subsystem.
 * Speaks via Kokoro TTS, shows info between each section.
 *
 * purpclaw tour           → full guided tour (all sections)
 * purpclaw tour --quick   → 2-min quick tour
 * purpclaw tour --section <n> → jump to specific section
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const PURP_DIR = path.resolve(__dirname, '..', '..');
const TTS_SCRIPT = path.join(PURP_DIR, 'scripts', 'speak_kokoro.py');
const HAS_TTS = fs.existsSync(TTS_SCRIPT);

// ── Speak helper ────────────────────────────────────────────────────
function speak(text) {
  if (!HAS_TTS) { console.log('  🔊 [TTS not available]\n'); return; }
  try {
    execSync(`python "${TTS_SCRIPT}" "${text.replace(/"/g, '')}"`, { timeout: 30000, windowsHide: true, stdio: 'ignore' });
  } catch { /* TTS failed — continue silently */ }
}

function pause(ms = 800) {
  return new Promise(r => setTimeout(r, ms));
}

function section(title) {
  console.log(`\n  ╔══════════════════════════════════════════════════════════╗`);
  console.log(`  ║  ${title.padEnd(56)}║`);
  console.log(`  ╚══════════════════════════════════════════════════════════╝\n`);
}

// ── Tour sections ──────────────────────────────────────────────────

async function tourIntro() {
  section('WELCOME TO PURPCLAW');
  const text = 'Welcome to PurpClaw, the open-source AI Workstation Operating System. I will now guide you through every system and subsystem. Press Control C at any time to exit the tour.';
  speak(text);
  console.log('  PurpClaw is a terminal-first, multi-agent, self-improving AI OS.');
  console.log('  17 providers. 110+ tools. 152 agents. 25 microservices. 3 surfaces.\n');
  console.log('  You can interact via CLI, TUI, or WebUI — all talking to the same engine.\n');
  await pause(2000);
}

async function tourSurfaces() {
  section('1. THE THREE SURFACES');
  speak('PurpClaw has three surfaces. CLI for quick one-shot commands. TUI for a full-screen terminal dashboard with live stats. And a WebUI mission control dashboard at port 3000.');
  console.log('  🖥 CLI:    purpclaw ask "your prompt"       — one-shot agent chat');
  console.log('  🖥 TUI:    purpclaw tui   /   purpclaw tui ask   — terminal dashboards');
  console.log('  🖥 WebUI:  http://localhost:3000               — mission control\n');
  console.log('  All three talk to the same unified API on port 7780.\n');
  await pause(1500);
}

async function tourProviders() {
  section('2. PROVIDER ABSTRACTION');
  const setup = require('./setup');
  const found = setup.scanForKeys();
  const ready = Object.keys(found).length;
  speak(`You have ${ready} providers ready. PurpClaw supports 17 total, including OpenAI, Anthropic, Gemini, DeepSeek, Ollama, and GitHub Models. Switch between them without changing your workflow.`);
  console.log(`  ✅ ${ready} providers detected on this system:`);
  Object.entries(found).slice(0, 8).forEach(([id, info]) => {
    console.log(`     ${id} — ${info.source === 'local' ? 'local' : 'API key found'}`);
  });
  console.log(`\n  Switch mid-session:  /provider deepseek   or   purpclaw ask --provider ollama "hello"\n`);
  await pause(1500);
}

async function tourTools() {
  section('3. TOOLS — YOUR AGENT\'S HANDS');
  let toolCount = 0;
  try { toolCount = require('../tools').list().length; } catch {}
  speak(`PurpClaw has over ${toolCount} tools across 4 categories: built-in coding tools, OmniCode MCP for code analysis, G 0 D M 0 D 3 for red-teaming, and full PC control tools.`);
  console.log(`  🛠 ${toolCount} tools total:\n`);
  console.log('  Built-in:      read, write, edit, shell, grep, code-search, web-fetch, git');
  console.log('  OmniCode MCP:  42 tools — search_symbols, dependency_map, blast_radius...');
  console.log('  G0DM0D3:       parseltongue, autotune, stm, godmode');
  console.log('  PC Control:    49 tools — tasklist, ping, cpu, memory, copy, move, notify...\n');
  console.log('  The agent loop calls these automatically — just ask naturally.\n');
  await pause(1500);
}

async function tourAgents() {
  section('4. AGENTS — THE SWARM');
  const agentCount = fs.readdirSync(path.join(PURP_DIR, 'skills')).filter(d => {
    try { return fs.statSync(path.join(PURP_DIR, 'skills', d)).isDirectory(); } catch { return false; }
  }).length;
  speak(`PurpClaw has 152 specialized agents across 5 divisions: Core, Operations, Media, Cognitive, and Special. Each agent has defined skills, goals, and protocols.`);
  console.log(`  🐝 ${agentCount} agents across 5 divisions:\n`);
  console.log('  CORE:       duck, bee, rabbit, fox, owl, wolf, shark, phoenix, turtle, mantis');
  console.log('  OPS:        crow, panda, penguin, hawk, raven, jellyfish, moth, ghost');
  console.log('  MEDIA:      kraken, octopus, gorilla, dragon');
  console.log('  COGNITIVE:  innovator, scientist, spider, elephant, mushroom');
  console.log('  SPECIAL:    snake, godmode, guardian, void\n');
  console.log('  Use /spawn <name> to deploy one. Swarm mode sends 4 in parallel.\n');
  await pause(1500);
}

async function tourMemory() {
  section('5. MEMORY — THE 7-LAYER WORLD MODEL');
  speak('This is the most important part. PurpClaw has a seven-layer memory architecture. Episodic memory for what happened. Semantic memory for what it knows. Procedural memory for how to do things. Symbolic memory for what it can infer. Temporal memory for when things happened. Counterfactual memory for what almost happened. And emotional memory for how things felt.');
  console.log('  🧠 7 memory layers:\n');
  console.log('  1. Episodic        — what happened (conversations, events, jobs)');
  console.log('  2. Semantic         — what it knows (facts, concepts, preferences)');
  console.log('  3. Procedural       — how to do things (workflows, skills, protocols)');
  console.log('  4. Symbolic         — what it can infer (rules, IF-THEN logic)');
  console.log('  5. Temporal         — when things happened (timelines, ordering)');
  console.log('  6. Counterfactual   — what almost happened (failures, reversions)');
  console.log('  7. Emotional        — how it felt (priority weights, mood)\n');
  console.log('  The memory survives. Everything else — models, providers, tools — is replaceable.\n');
  await pause(2000);
}

async function tourImmune() {
  section('6. IMMUNE SYSTEM — SMITH + NEO');
  speak('PurpClaw tests itself. Smith, the chaos injector, attacks the system with refusal messages, truncation, hallucinations, and memory corruption. Neo, the stabilizer, detects and repairs the damage. Together they form a self-testing immune system.');
  console.log('  🛡️ Smith (Chaos Injector)  →  8 attack types, 4 attack packs');
  console.log('  🛡️ Neo (Stabilizer)       →  100% detection on output attacks');
  console.log('  🛡️ Reliability Ledger     →  tracks every attack, detection, and repair\n');
  console.log('  Try: /bigboss chaos campaign output\n');
  await pause(1500);
}

async function tourVoice() {
  section('7. VOICE PIPELINE');
  speak('PurpClaw has a full local voice pipeline. Microphone to Whisper speech-to-text. The L L M processes your words. Then Kokoro T T S speaks the response. All local, no cloud dependency.');
  console.log('  🎤 Voice pipeline (all local):\n');
  console.log('  Microphone → Whisper STT → LLM → Kokoro TTS → Speaker\n');
  console.log('  /bigboss voice speak "systems nominal"   → speaks through your speakers');
  console.log('  /bigboss voice listen 5                  → transcribes 5 seconds of mic\n');
  await pause(1500);
}

async function tourVision() {
  section('8. VISION SYSTEM');
  speak('PurpClaw can see. A vision monitor captures your screen and camera. YOLO detects objects in real time. And a clap detector can wake the system with sound.');
  console.log('  👁 Vision:\n');
  console.log('  Vision Monitor  — screen + camera capture');
  console.log('  YOLO Service     — real-time object detection');
  console.log('  Clap Detector    — sound-triggered system wake\n');
  await pause(1000);
}

async function tourRatchet() {
  section('9. SELF-IMPROVEMENT — THE RATCHET');
  speak('PurpClaw improves itself overnight. A Karpathy-style ratchet modifies the training code, trains a small model, evaluates the result, and keeps what works. It learns from its own codebase.');
  console.log('  🔄 Karpathy Ratchet:\n');
  console.log('  prepare.py   — immutable data pipeline (the ground truth)');
  console.log('  train.py     — mutable LoRA training (rewritten each iteration)');
  console.log('  program.md   — master instruction (what to optimize)\n');
  console.log('  The ratchet commits before training, reverts if it fails.\n');
  await pause(1500);
}

async function tourQuickstart() {
  section('10. QUICK START — WHAT TO DO NEXT');
  speak('You are ready to use PurpClaw. Here is what to do next. Type purpclaw ask followed by your question. Try switching providers with the slash command. Launch the full screen TUI with purpclaw tui ask. Or open the WebUI in your browser at localhost port 3000.');
  console.log('  🚀 Your next commands:\n');
  console.log('  purpclaw ask "hello"                              — chat with the agent');
  console.log('  purpclaw ask --provider deepseek "write code"     — switch provider');
  console.log('  purpclaw ask "/help"                              — slash commands');
  console.log('  purpclaw tui ask                                  — full-screen TUI');
  console.log('  purpclaw setup                                    — configure providers\n');
  console.log('  The candy store is open. Enjoy. 🟣\n');
  await pause(1000);
}

// ── Main tour ──────────────────────────────────────────────────────

async function getUserInfo() {
  const readline = require('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise(res => rl.question(q, res));

  console.log('\n  👋 Before we start — what should I call you?\n');
  const name = await ask('  Your name or nickname (or press Enter to skip): ');
  const nameTrimmed = name?.trim();
  const displayName = nameTrimmed || 'friend';

  let interests = '';
  if (nameTrimmed) {
    console.log(`\n  Nice to meet you, ${nameTrimmed}! 🟣`);
    const interestAnswer = await ask('\n  What kind of work do you do? (coding, research, creative, etc — or Enter to skip): ');
    interests = interestAnswer?.trim() || '';
  }

  rl.close();

  if (interests) {
    return { name: nameTrimmed, interests };
  }
  return { name: displayName, interests: '' };
}

async function run(args, ctx) {
  const quick = args.includes('--quick') || args.includes('-q');
  const sectionArg = args.find(a => a.startsWith('--section='));
  const sectionNum = sectionArg ? parseInt(sectionArg.split('=')[1]) : 0;
  const skipIntro = args.includes('--skip-intro');

  // Get user info for personalization
  let user = { name: 'friend', interests: '' };
  if (!skipIntro) {
    user = await getUserInfo();
  }

  console.log(`\n  🟣 PURPCLAW GUIDED TOUR — for ${user.name}\n`);
  console.log('  I\'ll walk you through every system. Press Ctrl+C to exit at any time.\n');
  if (HAS_TTS) console.log('  🔊 TTS narration active — you\'ll hear explanations as we go.\n');

  // Personalize sections
  async function tourIntro() {
    section(`WELCOME, ${user.name.toUpperCase()}!`);
    const greeting = `Welcome to PurpClaw, ${user.name}. I will now guide you through the AI Workstation Operating System. ` +
      (user.interests ? `Since you work in ${user.interests}, I'll focus on what matters most to you. ` : '') +
      `Press Control C at any time to exit.`;
    speak(greeting);
    console.log('  PurpClaw is a terminal-first, multi-agent, self-improving AI OS.');
    console.log('  17 providers. 110+ tools. 152 agents. 25 microservices. 3 surfaces.\n');
    if (user.interests) {
      console.log(`  🎯 I'll highlight features relevant to ${user.interests}.\n`);
    }
    console.log('  You can interact via CLI, TUI, or WebUI — all talking to the same engine.\n');
    await pause(2000);
  }

  async function tourSurfaces() {
    section(`1. THE THREE SURFACES`);
    speak('PurpClaw has three surfaces. CLI for quick one-shot commands. TUI for a full-screen terminal dashboard with live stats. And a WebUI mission control dashboard at port 3000.');
    console.log(`  🖥 CLI:    purpclaw ask "your prompt"       — one-shot agent chat`);
    console.log(`  🖥 TUI:    purpclaw tui   /   purpclaw tui ask   — terminal dashboards`);
    console.log(`  🖥 WebUI:  http://localhost:3000               — mission control\n`);
    if (user.interests && /code|dev|engineer|program/i.test(user.interests)) {
      console.log('  💡 Pro tip: use purpclaw commit to generate git messages from your diffs.\n');
    }
    console.log('  All three talk to the same unified API on port 7780.\n');
    await pause(1500);
  }

  async function tourProviders() {
    section('2. PROVIDER ABSTRACTION');
    const setup = require('./setup');
    const found = setup.scanForKeys();
    const ready = Object.keys(found).length;
    speak(`${user.name}, you have ${ready} providers ready. PurpClaw supports 17 total, including OpenAI, Anthropic, Gemini, DeepSeek, Ollama, and GitHub Models. Switch between them without changing your workflow.`);
    console.log(`  ✅ ${ready} providers detected on your system, ${user.name}:`);
    Object.entries(found).slice(0, 8).forEach(([id, info]) => {
      console.log(`     ${id} — ${info.source === 'local' ? 'local' : 'API key found'}`);
    });
    console.log(`\n  Switch mid-session:  /provider deepseek   or   purpclaw ask --provider ollama "hello"\n`);
  }

  async function tourTools() {
    section('3. TOOLS — YOUR AGENT\'S HANDS');
    let toolCount = 0;
    try { toolCount = require('../tools').list().length; } catch {}
    speak(`PurpClaw has over ${toolCount} tools across 4 categories. Your agent can read files, write code, search symbols, control your PC, and more.`);
    console.log(`  🛠 ${toolCount} tools total:\n`);
    console.log('  Built-in:      read, write, edit, shell, grep, code-search, web-fetch, git');
    console.log('  OmniCode MCP:  42 tools — saves 99% on token burn');
    console.log('  G0DM0D3:       parseltongue, autotune, stm, godmode');
    console.log('  PC Control:    49 tools — tasklist, ping, cpu, memory, notify...\n');
    await pause(1000);
  }

  async function tourAgents() {
    section('4. AGENTS — THE SWARM');
    const agentCount = 152;
    speak(`${user.name}, PurpClaw has ${agentCount} specialized agents across 5 divisions. Each has defined skills, goals, and protocols. You can spawn them from the chat with a slash command.`);
    console.log(`  🐝 ${agentCount} agents: Core, Ops, Media, Cognitive, Special\n`);
    console.log('  Use /spawn duck "review the latest commit" to deploy one.\n');
    await pause(1000);
  }

  async function tourMemory() {
    section('5. MEMORY — THE 7-LAYER WORLD MODEL');
    speak(`This is the most important part, ${user.name}. PurpClaw has a seven-layer memory architecture. Unlike other AI tools that forget everything after each session, PurpClaw remembers.`);
    console.log('  🧠 7 memory layers: Episodic, Semantic, Procedural, Symbolic,\n');
    console.log('     Temporal, Counterfactual, Emotional\n');
    console.log('  The memory survives. Everything else is replaceable.\n');
    await pause(1500);
  }

  async function tourQuickstart() {
    section('QUICK START — WHAT TO DO NEXT');
    const qsGreeting = `You are ready, ${user.name}. ` +
      (user.interests ? `Based on your interest in ${user.interests}, I recommend starting with purpclaw ask. ` : '') +
      `Try a simple question, switch providers with slash commands, or launch the full TUI.`;
    speak(qsGreeting);
    console.log('  🚀 Your next commands:\n');
    console.log('  purpclaw ask "hello"                              — chat with the agent');
    console.log('  purpclaw ask --provider deepseek "write code"     — switch provider');
    console.log('  purpclaw ask "/help"                              — slash commands');
    console.log('  purpclaw tui ask                                  — full-screen TUI');
    console.log('  purpclaw setup                                    — configure providers\n');
    console.log(`  The candy store is open, ${user.name}. Enjoy. 🟣\n`);
    await pause(1000);
  }

  const sections = [
    tourIntro, tourSurfaces, tourProviders, tourTools,
    tourAgents, tourMemory, tourImmune, tourVoice,
    tourVision, tourRatchet, tourQuickstart,
  ];

  if (quick) {
    await tourIntro();
    await tourSurfaces();
    await tourQuickstart();
  } else if (sectionNum > 0 && sectionNum <= sections.length) {
    await sections[sectionNum - 1]();
  } else {
    for (const fn of sections) {
      await fn();
    }
  }

  speak(`Tour complete, ${user.name}. PurpClaw is ready. Type purpclaw ask to begin.`);
  console.log(`  🟣 Tour complete. Type purpclaw ask "hello" to begin, ${user.name}.\n`);
}

module.exports = { run };
