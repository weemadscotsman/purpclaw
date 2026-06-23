/**
 * BALL-TO-RIG BRIDGE v1.0
 * Forwards Xiaozhi Ball transcripts to Rig (OpenClaw)
 * Rig auto-responds via TTS, audio goes to ball speaker
 */

const WebSocket = require('ws');
const https = require('https');

// Config
const XIAOZHI_TOKEN = 'eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjg4MzkwOCwiYWdlbnRJZCI6MTY1NzQ1NiwiZW5kcG9pbnRJZCI6ImFnZW50XzE2NTc0NTYiLCJwdXJwb3NlIjoibWNwLWVuZHBvaW50IiwiaWF0IjoxNzc1ODQ3NjUyLCJleHAiOjE4MDc0MDUyNTJ9.q4GIpv2MQtjF7RgqqYrvBwSEWgSfhXpGUzw7q2G498UtkyHLXg8BKiszRTKRKGz3Shg5KQI_qRQDvyxkIae_vg';
const OPENCLAW_GATEWAY = 'ws://127.0.0.1:18789';
const OPENCLAW_TOKEN = '8efdd0465e989b5d2ebe28bf9849a5186c0a56478b9bbf8e';
const KOKORO = 'C:\\Users\\Admin\\.openclaw\\kokoro_send.bat';

const BALL_WS_URL = `wss://api.xiaozhi.me/mcp/?token=${XIAOZHI_TOKEN}`;

let ballWs = null;
let openClawWs = null;
let connected = false;

function log(msg) {
    const ts = new Date().toISOString().split('T')[1].slice(0, -1);
    console.log(`[BALL→RIG] ${ts} | ${msg}`);
}

function execCmd(cmd) {
    const { execSync } = require('child_process');
    try {
        execSync(cmd, { stdio: 'ignore', windowsHide: true });
    } catch (e) {}
}

function speakToRig(text) {
    log(`Rig would say: ${text.substring(0, 100)}`);
    // Rig speaks via Kokoro TTS
    execCmd(`${KOKORO} "${text.replace(/"/g, '')}"`);
}

function forwardToRig(transcript) {
    log(`Forwarding to Rig: ${transcript.substring(0, 80)}...`);
    
    // POST to OpenClaw REST API endpoint for Rig to process
    const postData = JSON.stringify({
        text: transcript,
        source: 'ball'
    });
    
    const options = {
        hostname: '127.0.0.1',
        port: 18789,
        path: '/api/process',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENCLAW_TOKEN}`,
            'Content-Length': Buffer.byteLength(postData)
        }
    };
    
    const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            log(`OpenClaw response: ${res.statusCode}`);
        });
    });
    
    req.on('error', (e) => {
        log(`OpenClaw error: ${e.message}`);
    });
    
    req.write(postData);
    req.end();
}

function connectToBall() {
    log('Connecting to Xiaozhi Ball MCP...');
    
    ballWs = new WebSocket(BALL_WS_URL);
    
    ballWs.on('open', () => {
        log('Connected to Xiaozhi Ball!');
        connected = true;
        
        // Subscribe to voice transcripts
        ballWs.send(JSON.stringify({
            jsonrpc: '2.0',
            method: 'subscribe',
            params: { events: ['voice.transcript'] },
            id: 1
        }));
    });
    
    ballWs.on('message', (data) => {
        try {
            const msg = JSON.parse(data);
            log(`Ball message: ${JSON.stringify(msg).substring(0, 100)}`);
            
            // Extract transcript from voice events
            if (msg.method === 'voice.transcript' || msg.params?.transcript) {
                const transcript = msg.params?.transcript || msg.params?.text || msg.result?.text;
                if (transcript) {
                    forwardToRig(transcript);
                }
            }
        } catch (e) {
            log(`Parse error: ${e.message}`);
        }
    });
    
    ballWs.on('close', () => {
        log('Ball disconnected, reconnecting...');
        connected = false;
        setTimeout(connectToBall, 5000);
    });
    
    ballWs.on('error', (e) => {
        log(`Ball WS error: ${e.message}`);
    });
}

function connectToOpenClaw() {
    log('Connecting to OpenClaw Gateway...');
    
    openClawWs = new WebSocket(OPENCLAW_GATEWAY, {
        headers: {
            'Authorization': `Bearer ${OPENCLAW_TOKEN}`
        }
    });
    
    openClawWs.on('open', () => {
        log('Connected to OpenClaw!');
        
        // Send initial ping to register
        openClawWs.send(JSON.stringify({
            type: 'ping'
        }));
    });
    
    openClawWs.on('message', (data) => {
        try {
            const msg = JSON.parse(data);
            
            // Handle Rig's responses
            if (msg.type === 'response' || msg.text) {
                const text = msg.text || msg.content || JSON.stringify(msg);
                if (text) {
                    speakToRig(text);
                }
            }
        } catch (e) {}
    });
    
    openClawWs.on('close', () => {
        log('OpenClaw disconnected, reconnecting...');
        setTimeout(connectToOpenClaw, 3000);
    });
    
    openClawWs.on('error', (e) => {
        log(`OpenClaw error: ${e.message}`);
    });
}

function main() {
    log('═══════════════════════════════════════════');
    log(' BALL-TO-RIG BRIDGE v1.0');
    log(' Ball transcripts → Rig (OpenClaw)');
    log('═══════════════════════════════════════════');
    
    connectToBall();
    connectToOpenClaw();
    
    // Keep alive
    setInterval(() => {
        if (connected) {
            log('Still connected...');
        }
    }, 60000);
}

if (require.main === module) {
    main();
}

module.exports = { connectToBall, connectToOpenClaw };
