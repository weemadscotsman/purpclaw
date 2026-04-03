/**
 * TTS - Text to Speech for Podcast Studio
 * Uses Windows SAPI via PowerShell for cross-voice support
 * With proper rate limiting to prevent audio system overload
 */

const { spawn } = require('child_process');
const { createQueue } = require('./utils');

// Voice name mappings for each agent (proper Windows voice names)
const VOICE_NAMES = {
  goose: 'Microsoft Ryan',
  hermes: 'Microsoft Sonia',
  openclaude: 'Microsoft Connor'
};

// Rate and volume settings per agent (slower = more natural)
const VOICE_CONFIG = {
  goose: { rate: 0, volume: 100 },      // Normal speed - chaos agent speaks clearly
  hermes: { rate: -1, volume: 90 },      // Slightly slower - tactical, measured
  openclaude: { rate: -2, volume: 85 }   // Slowest - philosophical, thoughtful
};

// TTS queue to prevent overwhelming the audio system
let ttsQueue = [];
let isProcessing = false;

/**
 * Process TTS queue sequentially
 */
function processQueue() {
  if (isProcessing || ttsQueue.length === 0) return;

  isProcessing = true;
  const { text, voiceKey, callback } = ttsQueue.shift();

  speakInternal(text, voiceKey).then(callback).finally(() => {
    isProcessing = false;
    // Small delay between TTS calls to let audio system breathe
    setTimeout(processQueue, 300);
  });
}

/**
 * Internal speak function
 */
function speakInternal(text, voiceKey = 'goose') {
  const voiceName = VOICE_NAMES[voiceKey] || VOICE_NAMES.goose;
  const config = VOICE_CONFIG[voiceKey] || VOICE_CONFIG.goose;

  return new Promise((resolve) => {
    // Escape text for PowerShell - handle special characters
    const escaped = text
      .replace(/'/g, "''")
      .replace(/"/g, '`"')
      .replace(/\n/g, ' ')
      .replace(/\r/g, ' ')
      .slice(0, 500); // Limit length to prevent audio weirdness

    const script = `
      Add-Type -AssemblyName System.Speech
      $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
      try {
        $synth.SelectVoice('${voiceName}')
      } catch {
        $synth.SelectVoiceByHints('Male')
      }
      $synth.Rate = ${config.rate}
      $synth.Volume = ${config.volume}
      $synth.Speak('${escaped}')
    `;

    const ps = spawn('powershell', ['-Command', script], {
      windowsHide: true,
      stdio: 'ignore'
    });

    // Kill after 15 seconds max
    const timeout = setTimeout(() => {
      ps.kill();
      resolve();
    }, 15000);

    ps.on('close', () => {
      clearTimeout(timeout);
      resolve();
    });
    ps.on('error', () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

/**
 * Queue a speak request (with rate limiting)
 */
function speakAsync(text, voiceKey = 'goose') {
  return new Promise((resolve) => {
    ttsQueue.push({ text, voiceKey, callback: resolve });
    processQueue();
  });
}

/**
 * Test all voices
 */
async function testVoices() {
  const testText = 'Testing podcast voices. This should sound much better now.';

  for (const [agentId, voiceName] of Object.entries(VOICE_NAMES)) {
    console.log(`[TTS] Testing ${agentId} with voice ${voiceName}...`);
    await speakAsync(testText, agentId);
  }
}

/**
 * Get available voices from Windows
 */
async function getVoices() {
  return new Promise((resolve) => {
    const ps = spawn('powershell', [
      '-Command',
      'Add-Type -AssemblyName System.Speech; (Get-SpeechVoices).Name'
    ], { windowsHide: true });

    let output = '';
    ps.stdout.on('data', (data) => { output += data.toString(); });
    ps.on('close', () => {
      const voices = output.split('\n').map(v => v.trim()).filter(v => v);
      console.log('[TTS] Available voices:', voices.slice(0, 10).join(', '));
      resolve(voices);
    });
    ps.on('error', () => resolve(['Microsoft Server Speech TTS']));
  });
}

/**
 * Stop all pending TTS
 */
function stopAll() {
  ttsQueue = [];
}

module.exports = {
  speakAsync,
  testVoices,
  getVoices,
  stopAll,
  VOICE_NAMES
};