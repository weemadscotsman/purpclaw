#!/usr/bin/env python3
"""Riko Control Script — send commands to Riko via port 8989

Usage:
  python riko_control.py sit              # Sit and watch
  python riko_control.py dance boom_dance # Dance animation
  python riko_control.py speak "Hello"    # Speech bubble
  python riko_control.py stop_autonomy    # Disable autonomy loop
"""
import socket
import sys
import time

PORT = 8989
HOST = '127.0.0.1'

def send(cmd, anim=None, text=None, wait=0.5):
    s = socket.socket()
    s.settimeout(5)
    s.connect((HOST, PORT))
    
    body = {}
    body['cmd'] = cmd
    if anim:
        body['anim'] = anim
    if text:
        body['text'] = text
    
    import json
    body_bytes = json.dumps(body).encode()
    
    req = (
        f"POST / HTTP/1.1\r\n"
        f"Host: {HOST}\r\n"
        f"Content-Type: application/json\r\n"
        f"Content-Length: {len(body_bytes)}\r\n"
        f"\r\n"
    ).encode() + body_bytes
    
    s.sendall(req)
    data = s.recv(4096)
    s.close()
    return data

def sit_and_watch(message="Watching..."):
    """Put Riko in sit-watch mode. ALWAYS stop autonomy first."""
    print("[Riko] Stopping autonomy...")
    send("stop_autonomy")
    time.sleep(1)
    print("[Riko] Sitting...")
    send("sit")
    time.sleep(1)
    if message:
        print(f"[Riko] Speaking: {message}")
        send("speak", text=message)
    print("[Riko] Sit-watch mode active")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    
    cmd = sys.argv[1]
    
    if cmd == "sit":
        sit_and_watch()
    elif cmd == "sit_watch":
        msg = sys.argv[2] if len(sys.argv) > 2 else "Watching the screen..."
        sit_and_watch(msg)
    elif cmd == "dance":
        anim = sys.argv[2] if len(sys.argv) > 2 else "dance"
        print(f"[Riko] Dancing: {anim}")
        send("dance", anim=anim)
    elif cmd == "speak":
        text = sys.argv[2] if len(sys.argv) > 2 else "Hello Ted"
        print(f"[Riko] Speaking: {text}")
        send("speak", text=text)
    elif cmd == "idle":
        print("[Riko] Returning to idle")
        send("idle")
    elif cmd == "stop_autonomy":
        print("[Riko] Stopping autonomy loop")
        send("stop_autonomy")
    elif cmd == "interrupt":
        print("[Riko] Interrupting all")
        send("interrupt")
    else:
        print(f"[Riko] Unknown command: {cmd}")
        print(__doc__)