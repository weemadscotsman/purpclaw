const { exec, spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { GlobalKeyboardListener } = require('node-global-key-listener');

const CONFIG_PATH = path.join(__dirname, 'boot-sequence.json');

/**
 * Plays audio file using PowerShell SoundPlayer
 * @param {string} audioPath - Path to the audio file
 */
function playAudio(audioPath) {
    return new Promise((resolve, reject) => {
        const psCommand = `(New-Object Media.SoundPlayer '${audioPath.replace(/'/g, "''")}').PlaySync()`;
        const child = exec(`powershell -c "${psCommand}"`, (error) => {
            if (error) {
                console.error('Audio playback error:', error);
                reject(error);
            } else {
                resolve();
            }
        });
    });
}

/**
 * Loads boot sequence configuration from JSON file
 * @returns {Object} Configuration object
 */
function loadConfig() {
    const configData = fs.readFileSync(CONFIG_PATH, 'utf8');
    return JSON.parse(configData);
}

/**
 * Launches a screen/window using start cmd with specified command
 * @param {string} command - Command to execute
 */
function launchScreen(command) {
    const child = spawn('cmd', ['/k', command], {
        stdio: 'ignore',
        detached: true,
        shell: true
    });
    child.unref();
    console.log(`Launched: ${command.substring(0, 60)}...`);
}

/**
 * Main boot sequence orchestrator
 * Plays music and launches screens in sequence with delays
 */
async function bootSequence() {
    console.log('=== PURPCLAW BOOT SEQUENCE INITIATED ===');

    const config = loadConfig();

    // Play back-in-black.mp3
    console.log('Playing boot music...');
    try {
        await playAudio(config.music);
    } catch (err) {
        console.warn('Music playback failed, continuing...');
    }

    // Read screens from config
    const screens = config.screens;

    console.log(`Launching ${screens.length} screens...`);

    // Launch each screen with its configured delay
    for (const screen of screens) {
        setTimeout(() => {
            launchScreen(screen.command);
            console.log(`[${screen.delay}ms] ${screen.name} launched`);
        }, screen.delay);
    }

    console.log('=== BOOT SEQUENCE COMPLETE ===');
}

/**
 * Sets up global hotkey listener for Ctrl+Shift+P
 */
function setupHotkeyListener() {
    const keyboardListener = new GlobalKeyboardListener();

    keyboardListener.addListener((e, down) => {
        // Check for Ctrl+Shift+P
        if (e.name === 'P' && down && e.state === 'DOWN') {
            const ctrl = keyboardListener.isDown('LEFT CTRL') || keyboardListener.isDown('RIGHT CTRL');
            const shift = keyboardListener.isDown('LEFT SHIFT') || keyboardListener.isDown('RIGHT SHIFT');
            if (ctrl && shift) {
                console.log('Hotkey triggered: Ctrl+Shift+P');
                bootSequence();
            }
        }
    });

    console.log('Hotkey listener active: Ctrl+Shift+P to trigger boot sequence');
}

module.exports = { bootSequence, setupHotkeyListener };

// If run directly, call bootSequence()
if (require.main === module) {
    bootSequence();
}
