#!/usr/bin/env python3
"""
Lunokio v2 Manager — restart, status, send commands
Usage:
  python lunokio_manager.py status
  python lunokio_manager.py start
  python lunokio_manager.py stop
  python lunokio_manager.py restart
  python lunokio_manager.py cmd <json>
"""

import socket
import subprocess
import sys
import time
import os
import json
import re

AVATAR_DIR = r"C:\Users\Admin\Desktop\RECENT WORK\lunokio_v2"
ELECTRON_EXE = os.path.join(AVATAR_DIR, "node_modules", ".bin", "electron.cmd")
MAIN_JS = os.path.join(AVATAR_DIR, "lunokio_v2.js")
PORT = 8989
HOST = "127.0.0.1"


def cmd_port():
    """Send a raw HTTP command to port 8989."""
    import sys as _sys
    body = _sys.argv[2].encode() if len(sys.argv) > 2 else b'{"cmd":"ping"}'
    body = json.dumps(json.loads(body)) if body.startswith(b'{') else body
    if isinstance(body, str):
        body = body.encode()
    s = socket.socket()
    s.settimeout(5)
    try:
        s.connect((HOST, PORT))
        req = (
            f"POST / HTTP/1.1\r\n"
            f"Host: {HOST}\r\n"
            f"Content-Type: application/json\r\n"
            f"Content-Length: {len(body)}\r\n"
            f"\r\n"
        ).encode() + body
        s.sendall(req)
        data = s.recv(4096)
        return data.decode()[:200]
    except Exception as e:
        return f"ERROR: {e}"
    finally:
        s.close()


def cmd_status():
    """Check if port 8989 is alive."""
    s = socket.socket()
    s.settimeout(2)
    try:
        s.connect((HOST, PORT))
        s.close()
        return "ALIVE — Lunokio v2 is running on port 8989"
    except ConnectionRefusedError:
        return "DEAD — Lunokio v2 is NOT running (port 8989 refused)"
    except Exception as e:
        return f"ERROR: {e}"


def cmd_start():
    """Start Lunokio v2 in background."""
    # Kill any existing electron processes for this dir
    subprocess.run(
        ['powershell', '-c', 'Stop-Process -Name electron -Force -ErrorAction SilentlyContinue'],
        capture_output=True
    )
    time.sleep(1)
    # Start background
    subprocess.Popen(
        [ELECTRON_EXE, '.', '--disable-gpu', '--no-sandbox'],
        cwd=AVATAR_DIR,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        creationflags=subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS
    )
    time.sleep(8)
    status = cmd_status()
    print(status)


def cmd_stop():
    """Kill all Electron processes (brutal but effective)."""
    subprocess.run(
        ['powershell', '-c', 'Stop-Process -Name electron -Force -ErrorAction SilentlyContinue'],
        capture_output=True
    )
    print("Killed all electron processes")


def cmd_restart():
    cmd_stop()
    time.sleep(2)
    cmd_start()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    action = sys.argv[1].lower()

    if action == "status":
        print(cmd_status())
    elif action == "start":
        cmd_start()
    elif action == "stop":
        cmd_stop()
    elif action == "restart":
        cmd_restart()
    elif action == "cmd":
        print(cmd_port())
    else:
        print(f"Unknown action: {action}")
        print(__doc__)
