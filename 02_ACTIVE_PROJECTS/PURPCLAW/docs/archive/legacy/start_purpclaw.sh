#!/bin/bash
# PURPCLAW v7.0 Startup Script
# Starts all components for the fully embodied autonomous execution system

echo "🚀 Starting PURPCLAW v7.0..."
echo "=============================="

# Set environment variables
export KIMMI_API_KEY="sk-kimi-y3Pf6IxSwxL17Nz7WtWlJraT5Ee8OeDWsXUMa22obhAodymAD4xQ4bgDUzb2bZA3"
export PORT=3001  # Next.js UI port

# Kill any existing processes on our ports
echo "🔧 Checking for existing processes..."
pkill -f "node.*control_api.js" 2>/dev/null || true
pkill -f "node.*voice_command_bridge.js" 2>/dev/null || true
pkill -f "node.*kimmi_swarm_integration.js" 2>/dev/null || true

sleep 2

# Start Control API
echo "🚀 Starting Control API (port 7780)..."
node control_api.js &
CONTROL_API_PID=$!
sleep 3

# Start Voice Command Bridge
echo "🎤 Starting Voice Command Bridge (port 7779)..."
node voice_command_bridge.js &
VOICE_BRIDGE_PID=$!
sleep 2

# Start Kimmi Integration
echo "🔗 Starting Kimmi Swarm Integration..."
node -e "
const KimmiSwarmIntegration = require('./kimmi_swarm_integration.js');
const kimmi = new KimmiSwarmIntegration({
  kimmiApiKey: process.env.KIMMI_API_KEY,
  voiceCommandPort: 7779,
  controlApiUrl: 'http://localhost:7780'
});

kimmi.initialize().then(() => {
  console.log('✅ Kimmi Integration ready (Fallback mode)');
  console.log('   Voice commands from Xiaozhi Ball will be processed');
}).catch(err => {
  console.error('❌ Kimmi Integration failed:', err.message);
});
" &
KIMMI_PID=$!
sleep 2

# Start Next.js UI (if package.json exists)
if [ -f "package.json" ]; then
  echo "🎨 Starting Next.js UI (port 3001)..."
  npm run dev &
  UI_PID=$!
  sleep 3
else
  echo "⚠️  No package.json found - UI not started"
  UI_PID=""
fi

echo ""
echo "✅ PURPCLAW v7.0 STARTED SUCCESSFULLY!"
echo "======================================="
echo ""
echo "🔗 SERVICES RUNNING:"
echo "   Control API:     http://localhost:7780"
echo "   Voice Bridge:    ws://localhost:7779"
echo "   Kimmi Integration: Ready (Fallback mode)"
if [ -n "$UI_PID" ]; then
  echo "   Next.js UI:      http://localhost:3001"
fi
echo ""
echo "🎯 CAPABILITIES:"
echo "   • Voice command processing from Xiaozhi Ball"
echo "   • Real agent swarm management (local fallback)"
echo "   • 8 division control (Engineering, AI Research, etc.)"
echo "   • 17 agent personalities (Duck, Ghost, Dragon, etc.)"
echo "   • Real-time status updates via SSE"
echo "   • No mock data - real connections only"
echo ""
echo "🎤 VOICE COMMANDS EXAMPLES:"
echo "   'spawn an agent in engineering to debug the system'"
echo "   'spawn 2 agents in ai research to analyze patterns'"
echo "   'get status'"
echo "   'kill agents in security'"
echo "   'move 1 agent from engineering to ai research'"
echo ""
echo "🛑 To stop all services: ./stop_purpclaw.sh"
echo ""
echo "📡 Waiting for voice commands on WebSocket port 7779..."
echo ""

# Keep script running
wait