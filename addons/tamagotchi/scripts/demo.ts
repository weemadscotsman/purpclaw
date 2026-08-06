#!/usr/bin/env bun
import { PetEngine } from '../src/engine/PetEngine';
import { CommandProcessor } from '../src/commands/CommandProcessor';
import * as readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function clearLine() {
  process.stdout.write('\r\x1B[K');
}

function hideCursor() {
  process.stdout.write('\x1B[?25l');
}

function showCursor() {
  process.stdout.write('\x1B[?25h');
}

async function demo() {
  console.log('🎮 Claude Code Pet - Interactive Demo\n');
  console.log('Your pet will appear below. Try commands like:');
  console.log('  /pet, /feed cookie, /play ball, /pet-stats\n');
  console.log('Press Ctrl+C to exit\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  const engine = new PetEngine();
  await engine.initialize();
  
  // Animation loop
  const animationInterval = setInterval(async () => {
    clearLine();
    await engine.update();
    const display = engine.getDisplay();
    const stats = engine.getStats();
    process.stdout.write(`${display} | ${stats}`);
  }, 300);
  
  // Command input loop
  const prompt = () => {
    rl.question('\n> ', async (input) => {
      if (input.trim()) {
        const response = await CommandProcessor.processCommand(input);
        console.log(response);
      }
      
      // Continue prompting
      setTimeout(prompt, 100);
    });
  };
  
  // Start prompting after a short delay
  setTimeout(prompt, 500);
  
  // Handle exit
  process.on('SIGINT', () => {
    clearInterval(animationInterval);
    showCursor();
    console.log('\n\n👋 Goodbye! Your pet will be waiting for you!\n');
    process.exit(0);
  });
}

// Hide cursor and run demo
hideCursor();
demo().catch(console.error);