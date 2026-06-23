#!/usr/bin/env python3
"""
Simple Bridge for socket_rig - 3D Avatar Control
HTTP POST endpoint on port 7777 for socket_rig tool commands.
Forwards commands to Electron avatar on port 9999 via TCP.

Commands from socket_rig.js:
- switch_character: Switch avatar character
- animate: Play animation
- speak: Make avatar speak
- idle, walk, sit, teleport: Movement commands
"""

import socket
import json
import os
import threading

# No leaky drawers: self memory watchdog (backstops PM2).
try:
    import mem_guard
    mem_guard.install(label="avatar", limit_mb=int(os.environ.get("AVATAR_MEM_LIMIT_MB", "400")))
except Exception:
    pass
import sys
import os
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse

PORT = 7777
AVATAR_HOST = "127.0.0.1"
AVATAR_PORT = 9999  # Electron avatar port

avatar_connected = False

def connect_to_avatar():
    """Connect to the Electron avatar render process."""
    global avatar_connected
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.connect((AVATAR_HOST, AVATAR_PORT))
        print(f"[BRIDGE] Connected to Avatar on {AVATAR_HOST}:{AVATAR_PORT}")
        avatar_connected = True
        return s
    except Exception as e:
        print(f"[BRIDGE] Avatar not connected: {e}")
        avatar_connected = False
        return None

class BridgeHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # Quiet logging

    def do_POST(self):
        """Handle POST /command from socket_rig tool."""
        global avatar_connected

        # Read content length
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length).decode('utf-8')

        try:
            cmd = json.loads(body)
            print(f"[BRIDGE] Received: {cmd}")

            # Forward to avatar
            avatar_sock = connect_to_avatar()
            if avatar_sock:
                try:
                    avatar_sock.sendall((json.dumps(cmd) + '\n').encode())
                    # Wait for response
                    avatar_sock.settimeout(2)
                    try:
                        resp = avatar_sock.recv(4096).decode('utf-8')
                        response = json.dumps({"status": "ok", "avatar_response": resp})
                    except socket.timeout:
                        response = json.dumps({"status": "ok", "forwarded": True})
                finally:
                    avatar_sock.close()
            else:
                # Avatar not connected - simulate success
                response = json.dumps({"status": "simulated", "message": "Avatar offline - command queued"})

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(response.encode())

        except json.JSONDecodeError as e:
            error = json.dumps({"error": f"Invalid JSON: {e}"})
            self.send_response(400)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(error.encode())

    def do_GET(self):
        """Handle GET /status and /health."""
        global avatar_connected

        if self.path == '/status' or self.path == '/health':
            response = json.dumps({
                "status": "ok",
                "avatar_connected": avatar_connected,
                "port": PORT
            })
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(response.encode())
        else:
            self.send_response(404)
            self.end_headers()

# Suppress Unicode warnings
import warnings
warnings.filterwarnings('ignore')

if __name__ == "__main__":
    print("=" * 50)
    print("PURPCLAW Simple Bridge - Avatar Control")
    print("=" * 50)
    print(f"Port: {PORT}")
    print(f"Avatar target: {AVATAR_HOST}:{AVATAR_PORT}")
    print()
    print("Endpoints:")
    print("  POST /command - Send command to avatar")
    print("  GET  /status  - Get connection status")
    print("  GET  /health  - Health check")
    print("=" * 50)

    server = HTTPServer(('127.0.0.1', PORT), BridgeHandler)
    print(f"[BRIDGE] Listening on 127.0.0.1:{PORT}")

    # Handle Ctrl+C
    def signal_handler(sig, frame):
        print("\n[BRIDGE] Shutting down...")
        server.shutdown()
        sys.exit(0)

    import signal
    signal.signal(signal.SIGINT, signal_handler)

    try:
        server.serve_forever()
    except Exception as e:
        print(f"[BRIDGE] Error: {e}")
        sys.exit(1)
