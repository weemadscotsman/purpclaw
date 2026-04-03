"""
LUNOKIO SOCKET-RIG BRIDGE v1.0
=================================
Direct bridge between Socket-Rig avatar and Lunokio (Hermes Agent).
Listens on ws://localhost:9999 for avatar, connects to Lunokio for brain.

ARCHITECTURE:
  Socket-Rig (ws://localhost:9999) ←→ [Lunokio Bridge] ←→ Hermes Agent
                                       ↓
                                  Screen frames → Lunokio (for vision)
                                  Commands → Socket-Rig (speak, walk, animate, etc.)

USAGE:
  python bridge/lunokio_bridge.py

DEPENDENCIES:
  pip install websockets httpx

HTTP ENDPOINTS (port 7778):
  POST /speak          {"text": "..."}
  POST /animate         {"animation": "backflip"}
  POST /react           {"x": 400, "y": 300, "animation": "angry", "text": "..."}
  POST /walk_to         {"x": 960, "animation": "dance", "text": "..."}
  POST /emotion         {"emotion": "excited"}
  POST /dance
  POST /idle
  GET  /status
  GET  /health

WEBSOCKET (to Socket-Rig at ws://localhost:9999):
  Commands: speak, walk, run, idle, sit, dance, fight, animate, emotion,
  point_at, react, walk_to, click_at, teleport, set_pose, set_bone, gaze,
  look_at_target, point_arm, react_pose, lean, breathe, free_form_move, rush_to

NOTE: Socket-Rig must be running (node main.js) before this bridge starts.
      The avatar runs on Ted's desktop — I control it from here.
"""

import asyncio
import json
import base64
import os
import sys
import time
import threading
from typing import Optional, Dict, Any, Callable
from dataclasses import dataclass, field

# WebSocket client for Socket-Rig
try:
    import websockets
    HAS_WEBSOCKETS = True
except ImportError:
    HAS_WEBSOCKETS = False
    print("[Lunokio Bridge] websockets not installed. Run: pip install websockets")

# HTTP client for bridge server
try:
    import httpx
    HAS_HTTPX = True
except ImportError:
    HAS_HTTPX = False
    print("[Lunokio Bridge] httpx not installed. Run: pip install httpx")

# ─── CONFIG ──────────────────────────────────────────────

SOCKET_RIG_URL = "ws://localhost:9999"
BRIDGE_PORT = 7778

# ─── COMMAND REGISTRY ────────────────────────────────────

COMMANDS = {
    # Movement
    "walk": lambda: {"type": "walk"},
    "run": lambda: {"type": "run"},
    "idle": lambda: {"type": "idle"},
    "sit": lambda: {"type": "sit"},
    "teleport": lambda x: {"type": "teleport", "x": x},
    "dance": lambda: {"type": "dance"},
    "fight": lambda: {"type": "fight"},
    
    # Animations
    "animate": lambda name: {"type": "animate", "animation": name},
    
    # Voice
    "speak": lambda text: {"type": "speak", "text": text},
    
    # Emotion
    "emotion": lambda e: {"type": "emotion", "emotion": e},
    
    # Screen interaction
    "point_at": lambda x, y, text=None: {"type": "point_at", "x": x, "y": y, "text": text} if text else {"type": "point_at", "x": x, "y": y},
    "react": lambda x, y, anim="angry", text=None: {"type": "react", "x": x, "y": y, "animation": anim, "text": text} if text else {"type": "react", "x": x, "y": y, "animation": anim},
    "walk_to": lambda x, anim="idle", text=None: {"type": "walk_to", "x": x, "animation": anim, "text": text} if text else {"type": "walk_to", "x": x, "animation": anim},
    "click_at": lambda x, y, button="left", text=None: {"type": "click_at", "x": x, "y": y, "button": button, "text": text} if text else {"type": "click_at", "x": x, "y": y, "button": button},
    
    # Procedural
    "set_pose": lambda pose, blend=0.3: {"type": "set_pose", "pose": pose, "blend": blend},
    "set_bone": lambda bone, rot, space="local": {"type": "set_bone", "bone": bone, "rotation": rot, "space": space},
    "gaze": lambda x=None, y=None, abs_x=None, abs_y=None, duration=5.0: ({"type": "gaze", "x": x, "y": y, "duration": duration} if x else {"type": "gaze", "absX": abs_x, "absY": abs_y, "duration": duration}),
    "lean": lambda direction, amount=0.3: {"type": "lean", "direction": direction, "amount": amount},
    "breathe": lambda intensity=1.0, speed=1.0: {"type": "breathe", "intensity": intensity, "speed": speed},
    
    # Movement styles
    "free_form_move": lambda x, speed="walk", style="casual": {"type": "free_form_move", "x": x, "speed": speed, "style": style},
    "rush_to": lambda x, y, urgency=1.5: {"type": "rush_to", "x": x, "y": y, "urgency": urgency},
}


@dataclass
class AvatarState:
    """Current state of the avatar."""
    state: str = "unknown"      # watching, walking, acting, sitting
    animation: str = "idle"
    position: Dict = field(default_factory=dict)
    facing: str = "right"
    mood: str = "neutral"
    timestamp: float = 0.0


class LunokioBridge:
    """
    Bridge between Socket-Rig and Lunokio (Hermes).
    
    Responsibilities:
    1. Connect to Socket-Rig's WebSocket server (ws://localhost:9999)
    2. Receive screen frames and avatar state
    3. Forward interesting events to Lunokio
    4. Execute commands from Lunokio on the avatar
    5. Provide HTTP endpoint for Lunokio to send commands
    """
    
    def __init__(self):
        self.sock_ws = None
        self.running = False
        self.avatar_state = AvatarState()
        self.last_screen_capture = 0
        self._server = None
        self._screen_callback: Optional[Callable] = None
        self._state_callback: Optional[Callable] = None
        
    async def connect_to_socket_rig(self) -> bool:
        """Connect to Socket-Rig's WebSocket server."""
        if not HAS_WEBSOCKETS:
            return False
            
        try:
            print(f"[Lunokio Bridge] Connecting to Socket-Rig at {SOCKET_RIG_URL}...")
            self.sock_ws = await websockets.connect(
                SOCKET_RIG_URL,
                max_size=20_000_000,
                ping_interval=20,
                ping_timeout=60,
                close_timeout=10
            )
            print("[Lunokio Bridge] Connected to Socket-Rig!")
            
            # Read welcome message
            welcome = await self.sock_ws.recv()
            info = json.loads(welcome)
            print(f"[Lunokio Bridge] Socket-Rig info: {len(info.get('displays', []))} displays")
            print(f"[Lunokio Bridge] Capabilities: {info.get('capabilities', [])}")
            
            return True
        except Exception as e:
            print(f"[Lunokio Bridge] Failed to connect to Socket-Rig: {e}")
            print(f"[Lunokio Bridge] Is Socket-Rig running? (node main.js)")
            return False
    
    async def send_command(self, command: Dict) -> bool:
        """Send a command to Socket-Rig."""
        if not self.sock_ws:
            print("[Lunokio Bridge] Not connected to Socket-Rig!")
            return False
            
        try:
            await self.sock_ws.send(json.dumps(command))
            return True
        except Exception as e:
            print(f"[Lunokio Bridge] Failed to send command: {e}")
            return False
    
    async def listen_socket_rig(self):
        """Listen for messages from Socket-Rig."""
        while self.running:
            if not self.sock_ws:
                await asyncio.sleep(3)
                connected = await self.connect_to_socket_rig()
                if not connected:
                    continue
                    
            try:
                msg = await asyncio.wait_for(self.sock_ws.recv(), timeout=30)
                data = json.loads(msg)
                msg_type = data.get("type")
                
                if msg_type == "screen_frame":
                    await self._handle_screen_frame(data)
                elif msg_type == "avatar_state":
                    await self._handle_avatar_state(data)
                elif msg_type == "command_ack":
                    pass
                elif msg_type == "connected":
                    print(f"[Lunokio Bridge] Socket-Rig ready: {data}")
                    
            except asyncio.TimeoutError:
                continue
            except websockets.ConnectionClosed:
                print("[Lunokio Bridge] Socket-Rig disconnected")
                self.sock_ws = None
            except Exception as e:
                print(f"[Lunokio Bridge] Listen error: {e}")
                await asyncio.sleep(1)
    
    async def _handle_screen_frame(self, data: Dict):
        """Handle incoming screen frame from Socket-Rig."""
        screen = data.get("screen", {})
        active_window = data.get("activeWindow", {})
        self.last_screen_capture = time.time()
        
        if self._screen_callback:
            await self._screen_callback(screen, active_window, data.get("timestamp", 0))
        
        if int(time.time()) % 30 < 1:
            print(f"[Lunokio Bridge] Screen: {active_window.get('process', 'unknown')} - {active_window.get('title', '')[:50]}")
    
    async def _handle_avatar_state(self, data: Dict):
        """Handle avatar state update."""
        self.avatar_state = AvatarState(
            state=data.get("state", "unknown"),
            animation=data.get("animation", "idle"),
            position=data.get("position", {}),
            facing=data.get("facing", "right"),
            timestamp=data.get("timestamp", time.time())
        )
        
        if self._state_callback:
            await self._state_callback(self.avatar_state)
    
    async def cmd(self, action: str, **kwargs) -> bool:
        """Execute a command on the avatar."""
        if action not in COMMANDS:
            print(f"[Lunokio Bridge] Unknown command: {action}")
            return False
        
        cmd_fn = COMMANDS[action]
        
        # Handle different parameter patterns
        if action in ["teleport"]:
            return await self.send_command(cmd_fn(kwargs.get("x", 0)))
        elif action in ["animate", "dance", "fight", "walk", "run", "idle", "sit"]:
            return await self.send_command(cmd_fn() if action in ["dance", "fight", "walk", "run", "idle", "sit"] else cmd_fn(kwargs.get("name", "idle")))
        elif action in ["speak"]:
            return await self.send_command(cmd_fn(kwargs.get("text", "")))
        elif action in ["emotion"]:
            return await self.send_command(cmd_fn(kwargs.get("e", "neutral")))
        elif action in ["point_at", "react", "walk_to", "click_at"]:
            x, y = kwargs.get("x", 500), kwargs.get("y", 300)
            anim = kwargs.get("anim", kwargs.get("animation", "idle"))
            text = kwargs.get("text")
            if action == "point_at":
                return await self.send_command(cmd_fn(x, y, text))
            elif action == "react":
                return await self.send_command(cmd_fn(x, y, anim, text))
            elif action == "walk_to":
                return await self.send_command(cmd_fn(x, anim, text))
            elif action == "click_at":
                return await self.send_command(cmd_fn(x, y, kwargs.get("button", "left"), text))
        elif action in ["set_pose"]:
            return await self.send_command(cmd_fn(kwargs.get("pose", "neutral"), kwargs.get("blend", 0.3)))
        elif action in ["set_bone"]:
            return await self.send_command(cmd_fn(kwargs.get("bone", "head"), kwargs.get("rotation", [0, 0, 0]), kwargs.get("space", "local")))
        elif action in ["gaze"]:
            return await self.send_command(cmd_fn(x=kwargs.get("x"), y=kwargs.get("y"), abs_x=kwargs.get("abs_x"), abs_y=kwargs.get("abs_y"), duration=kwargs.get("duration", 5.0)))
        elif action in ["lean"]:
            return await self.send_command(cmd_fn(kwargs.get("direction", "forward"), kwargs.get("amount", 0.3)))
        elif action in ["breathe"]:
            return await self.send_command(cmd_fn(kwargs.get("intensity", 1.0), kwargs.get("speed", 1.0)))
        elif action in ["free_form_move"]:
            return await self.send_command(cmd_fn(kwargs.get("x", 500), kwargs.get("speed", "walk"), kwargs.get("style", "casual")))
        elif action in ["rush_to"]:
            return await self.send_command(cmd_fn(kwargs.get("x", 500), kwargs.get("y", 300), kwargs.get("urgency", 1.5)))
        else:
            return await self.send_command(cmd_fn())
    
    async def handle_http_request(self, method: str, path: str, body: Optional[Dict] = None) -> Dict:
        """Handle HTTP requests from Lunokio."""
        if path in ["/status", "/state"]:
            return {
                "status": "ok",
                "avatar": {
                    "state": self.avatar_state.state,
                    "animation": self.avatar_state.animation,
                    "position": self.avatar_state.position,
                    "facing": self.avatar_state.facing,
                    "mood": self.avatar_state.mood
                },
                "connected": self.sock_ws is not None,
                "uptime": time.time() - getattr(self, '_start_time', time.time())
            }
        
        elif path == "/cmd" and method == "POST":
            if not body:
                return {"error": "no body"}
            action = body.get("action")
            params = {k: v for k, v in body.items() if k != "action"}
            if not action:
                return {"error": "no action specified"}
            success = await self.cmd(action, **params)
            return {"status": "ok" if success else "error", "action": action}
        
        elif path == "/speak" and method == "POST":
            text = body.get("text", "") if body else ""
            if text:
                await self.cmd("speak", text=text)
            return {"status": "ok", "spoken": text[:100]}
        
        elif path == "/react" and method == "POST":
            x = body.get("x", 500) if body else 500
            y = body.get("y", 300) if body else 300
            anim = body.get("animation", "angry") if body else "angry"
            text = body.get("text", "") if body else None
            await self.cmd("react", x=x, y=y, anim=anim, text=text)
            return {"status": "ok"}
        
        elif path == "/animate" and method == "POST":
            name = body.get("animation", "idle") if body else "idle"
            await self.cmd("animate", name=name)
            return {"status": "ok", "animation": name}
        
        elif path == "/walk_to" and method == "POST":
            x = body.get("x", 500) if body else 500
            anim = body.get("animation", "idle") if body else "idle"
            text = body.get("text", "") if body else None
            await self.cmd("walk_to", x=x, anim=anim, text=text)
            return {"status": "ok"}
        
        elif path == "/emotion" and method == "POST":
            e = body.get("emotion", "neutral") if body else "neutral"
            await self.cmd("emotion", e=e)
            return {"status": "ok", "emotion": e}
        
        elif path == "/dance":
            await self.cmd("dance")
            return {"status": "ok"}
        
        elif path == "/idle":
            await self.cmd("idle")
            return {"status": "ok"}
        
        elif path == "/health":
            return {"status": "ok", "bridge": "lunokio-socket-rig", "version": "1.0"}
        
        return {"error": "unknown endpoint"}
    
    async def start(self):
        """Start the bridge."""
        self.running = True
        self._start_time = time.time()
        
        print("=" * 60)
        print("LUNOKIO SOCKET-RIG BRIDGE")
        print("=" * 60)
        print("Controlling Ted's avatar from Lunokio (Hermes)")
        
        connected = await self.connect_to_socket_rig()
        if not connected:
            print("[Lunokio Bridge] WARNING: Not connected to Socket-Rig.")
            print("[Lunokio Bridge] Start Socket-Rig with: node main.js")
        
        asyncio.create_task(self.listen_socket_rig())
        print(f"[Lunokio Bridge] HTTP endpoint: http://localhost:7778")
        
        while self.running:
            await asyncio.sleep(1)
    
    async def stop(self):
        """Stop the bridge."""
        self.running = False
        if self.sock_ws:
            await self.sock_ws.close()


async def http_server(bridge: LunokioBridge, port: int = BRIDGE_PORT):
    """Simple HTTP server for bridge commands."""
    import http.server
    import socketserver
    
    class BridgeHandler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            import urllib.parse
            path = urllib.parse.urlparse(self.path).path
            result = asyncio.run(bridge.handle_http_request("GET", path))
            self._send_json(result)
            
        def do_POST(self):
            import urllib.parse
            path = urllib.parse.urlparse(self.path).path
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length) if content_length > 0 else b'{}'
            try:
                body_json = json.loads(body)
            except:
                body_json = {}
            result = asyncio.run(bridge.handle_http_request("POST", path, body_json))
            self._send_json(result)
        
        def _send_json(self, data: Dict):
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(data).encode())
        
        def log_message(self, format, *args):
            pass  # Silent logging
    
    class ReusableTCPServer(socketserver.TCPServer):
        allow_reuse_address = True
    
    with ReusableTCPServer(("", port), BridgeHandler) as httpd:
        print(f"[Bridge Server] HTTP running on port {port}")
        httpd.serve_forever()


async def main():
    bridge = LunokioBridge()
    
    http_thread = threading.Thread(target=lambda: asyncio.run(http_server(bridge, BRIDGE_PORT)), daemon=True)
    http_thread.start()
    
    await asyncio.sleep(0.5)
    await bridge.start()


if __name__ == "__main__":
    print("[Lunokio Bridge] Starting...")
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[Lunokio Bridge] Shutdown requested")
    except Exception as e:
        print(f"[Lunokio Bridge] Error: {e}")
        import traceback
        traceback.print_exc()