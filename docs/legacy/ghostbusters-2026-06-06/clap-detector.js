const mic = require('mic');
const { bootSequence } = require('./boot');

const AMPLITUDE_THRESHOLD = 0.8;
let isListening = false;
let micInstance = null;

/**
 * Calculates RMS (Root Mean Square) amplitude from audio buffer
 * @param {Buffer} buffer - Audio buffer data
 * @returns {number} RMS amplitude value (0-1)
 */
function calculateRMS(buffer) {
    const samples = buffer.length / 2; // 16-bit samples
    let sum = 0;

    for (let i = 0; i < buffer.length; i += 2) {
        // Convert 16-bit signed integer to normalized value
        const sample = buffer.readInt16LE(i) / 32768;
        sum += sample * sample;
    }

    return Math.sqrt(sum / samples);
}

/**
 * Starts clap detection on microphone
 * When a clap is detected (amplitude > threshold), triggers bootSequence once
 */
function startClapDetection() {
    if (isListening) {
        console.log('Clap detection already active');
        return;
    }

    console.log('Initializing microphone for clap detection...');
    console.log(`Threshold: ${AMPLITUDE_THRESHOLD}`);

    micInstance = mic({
        rate: '16000',
        channels: '1',
        debug: false,
        exitOnSilence: false
    });

    const micStream = micInstance.getAudioStream();

    micStream.on('data', (buffer) => {
        const amplitude = calculateRMS(buffer);

        if (amplitude > AMPLITUDE_THRESHOLD) {
            console.log(`CLAP DETECTED! (amplitude: ${amplitude.toFixed(3)})`);
            console.log('Triggering boot sequence...');

            // Stop listening after clap detection
            stopClapDetection();

            // Trigger boot sequence
            bootSequence();
        }
    });

    micStream.on('error', (err) => {
        console.error('Microphone stream error:', err);
        stopClapDetection();
    });

    micInstance.start();
    isListening = true;
    console.log('Listening for claps... (Ctrl+C to exit)');
}

/**
 * Stops clap detection and releases microphone
 */
function stopClapDetection() {
    if (micInstance) {
        micInstance.stop();
        micInstance = null;
    }
    isListening = false;
    console.log('Clap detection stopped');
}

// Handle process termination
process.on('SIGINT', () => {
    stopClapDetection();
    process.exit(0);
});

module.exports = { startClapDetection, stopClapDetection };

// If run directly, start clap detection
if (require.main === module) {
    startClapDetection();
}
