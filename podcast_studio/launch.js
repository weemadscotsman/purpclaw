/**
 * LAUNCHER - Start all 3 agents at once
 * Usage: node launch.js [topic]
 */

const { spawn } = require('child_process');
const path = require('path');
const episodeManager = require('./episode_manager');

const agents = ['goose', 'hermes', 'openclaude'];
const processes = [];

console.log('===========================================');
console.log('  PODCAST STUDIO LAUNCHER');
console.log('===========================================\n');

const topic = process.argv[2] || null;

// Start episode first
if (topic) {
  episodeManager.startEpisode(topic);
} else {
  episodeManager.startEpisode();
}

// Small delay to let episode initialize
setTimeout(() => {
  console.log('\n[Launcher] Starting all agents...\n');

  // Launch each agent
  agents.forEach((agentId, i) => {
    setTimeout(() => {
      const process = spawn('node', [path.join(__dirname, 'podcast_runner.js'), agentId], {
        stdio: 'inherit',
        windowsHide: false
      });

      process.on('close', (code) => {
        console.log(`[Launcher] ${agentId} exited with code ${code}`);
      });

      processes.push({ id: agentId, process });
      console.log(`[Launcher] Launched ${agentId}`);
    }, i * 500);
  });

  console.log('\n[Launcher] All agents running!');
  console.log('[Launcher] Press Ctrl+C to stop all agents\n');
}, 1000);

// Cleanup on exit
process.on('SIGINT', () => {
  console.log('\n[Launcher] Stopping all agents...');
  processes.forEach(({ id, process }) => {
    console.log(`[Launcher] Killing ${id}`);
    process.kill();
  });
  process.exit(0);
});