#!/usr/bin/env python3
"""
LCD Bridge Server for PURPCLAW MCP Bridge
Listens on port 7778 for JSON messages and forwards them to the Turing Smart Screen LCD.
"""

import socket
import json
import threading
import time
import sys
import os
from datetime import datetime
import urllib.request

# Add the Turing Smart Screen Python library path
sys.path.insert(0, r"C:\Users\Admin\Desktop\turing-smart-screen-python")

try:
    from rig_lcd_terminal import RigLcdTerminal

    LCD_AVAILABLE = True
except ImportError as e:
    print(f"⚠️  LCD terminal not available: {e}")
    LCD_AVAILABLE = False


class LCDBridgeServer:
    def __init__(self, host="127.0.0.1", port=7778):
        self.host = host
        self.port = port
        self.server = None
        self.running = False
        self.lcd_terminal = None
        self.log_monitor_active = False
        self.log_monitor_thread = None
        self.last_log_count = 0
        self.displayed_lines = []

        # Check if port is already in use (by existing LCD process)
        import socket

        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            sock.bind((host, port))
            sock.close()
            port_available = True
        except OSError:
            port_available = False
            sock.close()

        if port_available and LCD_AVAILABLE:
            try:
                print("[INIT] Initializing LCD terminal...")
                self.lcd_terminal = RigLcdTerminal()
                self.lcd_terminal.log(
                    "LCD Bridge Server Online", self.lcd_terminal.HEADER_COLOR
                )
                print("[OK] LCD terminal initialized")
            except ImportError as e:
                print(f"[ERROR] Import error: {e}")
                print("[WARN] Running in simulation mode (import failed)")
                self.lcd_terminal = None
            except Exception as e:
                print(f"[ERROR] Failed to initialize LCD: {type(e).__name__}: {e}")
                print("[WARN] Running in simulation mode (LCD hardware unavailable)")
                self.lcd_terminal = None
        else:
            if not port_available:
                print("[WARN] Port 7778 already in use - running in simulation mode")
            elif not LCD_AVAILABLE:
                print("[WARN] Running in simulation mode (no LCD library)")
            else:
                print("[WARN] Running in simulation mode")

    def handle_client(self, client_socket, address):
        """Handle a single client connection."""
        try:
            data = client_socket.recv(4096).decode("utf-8")
            if not data:
                return

            try:
                message = json.loads(data)
                msg_type = message.get("type", "lcd_message")
                msg_text = message.get("message", "")
                msg_color = message.get("color", "FG_COLOR")

                print(
                    f"[RECV] Received: {msg_text[:50]}... ({msg_color}) from {address}"
                )

                # Display on LCD
                if self.lcd_terminal:
                    if msg_color == "ERROR_COLOR":
                        self.lcd_terminal.log_error(msg_text)
                    elif msg_color == "WARN_COLOR":
                        self.lcd_terminal.log_warn(msg_text)
                    elif msg_color == "INFO_COLOR":
                        self.lcd_terminal.log_info(msg_text)
                    elif msg_color == "RIG_COLOR":
                        self.lcd_terminal.log_rig(msg_text)
                    else:  # FG_COLOR or default
                        self.lcd_terminal.log(msg_text)

                    response = {"status": "success", "displayed": True}
                else:
                    print(f"[SIM] LCD: {msg_text}")
                    response = {
                        "status": "success",
                        "displayed": False,
                        "mode": "simulation",
                    }

                # Send response
                client_socket.send(json.dumps(response).encode("utf-8"))

            except json.JSONDecodeError:
                response = {"status": "error", "message": "Invalid JSON"}
                client_socket.send(json.dumps(response).encode("utf-8"))

            # Handle log monitor commands
            if msg_type == "monitor_logs":
                action = message.get("action", "start")
                if action == "start":
                    self.start_log_monitor()
                    response = {
                        "status": "success",
                        "mode": "log_monitor",
                        "active": self.log_monitor_active,
                    }
                elif action == "stop":
                    self.stop_log_monitor()
                    response = {
                        "status": "success",
                        "mode": "log_monitor",
                        "active": False,
                    }
                elif action == "status":
                    response = {
                        "status": "success",
                        "mode": "log_monitor",
                        "active": self.log_monitor_active,
                    }
                client_socket.send(json.dumps(response).encode("utf-8"))
                return

        except Exception as e:
            print(f"[ERROR] Client error: {e}")
        finally:
            client_socket.close()

    def fetch_logs_from_api(self):
        """Fetch logs from PURPCLAW Control API."""
        try:
            url = "http://localhost:7780/api/logs?limit=8"
            req = urllib.request.Request(url)
            with urllib.request.urlopen(req, timeout=2) as response:
                data = json.loads(response.read().decode("utf-8"))
                return data if isinstance(data, list) else []
        except Exception as e:
            return []

    def format_log_line(self, log_entry):
        """Format a log entry for LCD display."""
        timestamp = log_entry.get("timestamp", "")
        if timestamp and "T" in timestamp:
            timestamp = timestamp.split("T")[1].split(".")[0]
        elif timestamp:
            timestamp = timestamp[11:19] if len(timestamp) > 11 else timestamp
        else:
            timestamp = ""

        if "data" in log_entry:
            data = log_entry.get("data", {})
            if isinstance(data, dict):
                msg = data.get("name", data.get("message", str(data)))
            else:
                msg = str(data)
        elif "text" in log_entry:
            msg = log_entry.get("text", "")
        else:
            msg = str(log_entry)

        if len(msg) > 25:
            msg = msg[:22] + "..."

        return f"{timestamp} {msg}" if timestamp else msg

    def log_monitor_loop(self):
        """Background thread that polls logs and updates LCD."""
        while self.log_monitor_active:
            try:
                logs = self.fetch_logs_from_api()
                if logs:
                    new_lines = [self.format_log_line(log) for log in logs[:6]]
                    if new_lines != self.displayed_lines:
                        self.displayed_lines = new_lines
                        if self.lcd_terminal:
                            self.lcd_terminal.clear()
                            self.lcd_terminal.log(
                                "=== PURPCLAW LOGS ===", self.lcd_terminal.INFO_COLOR
                            )
                            for line in self.displayed_lines:
                                self.lcd_terminal.log(line)
                        else:
                            print("[LCD-LOG]" + " | ".join(new_lines[:3]))
            except Exception as e:
                print(f"[LOG-MONITOR] Error: {e}")
            time.sleep(2)
        print("[LOG-MONITOR] Stopped")

    def start_log_monitor(self):
        """Start the log monitor thread."""
        if not self.log_monitor_active:
            self.log_monitor_active = True
            self.displayed_lines = []
            self.log_monitor_thread = threading.Thread(
                target=self.log_monitor_loop, daemon=True
            )
            self.log_monitor_thread.start()
            print("[LOG-MONITOR] Started")

    def stop_log_monitor(self):
        """Stop the log monitor thread."""
        self.log_monitor_active = False
        if self.log_monitor_thread:
            self.log_monitor_thread.join(timeout=3)
            self.log_monitor_thread = None
        print("[LOG-MONITOR] Stopped")

    def start(self):
        """Start the LCD bridge server."""
        self.server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)

        try:
            self.server.bind((self.host, self.port))
            self.server.listen(5)
            self.running = True

            print(f"[START] LCD Bridge Server started on {self.host}:{self.port}")
            print(f"[INFO] LCD Available: {LCD_AVAILABLE}")
            print("[INFO] Send JSON messages to this port:")
            print(
                '  {"type": "lcd_message", "message": "Hello LCD!", "color": "FG_COLOR"}'
            )
            print("  Colors: FG_COLOR, ERROR_COLOR, WARN_COLOR, INFO_COLOR, RIG_COLOR")
            print("[INFO] Press Ctrl+C to stop")

            while self.running:
                try:
                    client_socket, address = self.server.accept()
                    client_thread = threading.Thread(
                        target=self.handle_client,
                        args=(client_socket, address),
                        daemon=True,
                    )
                    client_thread.start()
                except KeyboardInterrupt:
                    break
                except Exception as e:
                    print(f"[ERROR] Accept error: {e}")

        except Exception as e:
            print(f"[ERROR] Server error: {e}")
        finally:
            self.stop()

    def stop(self):
        """Stop the server."""
        self.running = False
        self.stop_log_monitor()
        if self.server:
            self.server.close()
        if self.lcd_terminal:
            try:
                self.lcd_terminal.close()
            except:
                pass
        print("[STOP] LCD Bridge Server stopped")


def main():
    try:
        server = LCDBridgeServer()
        server.start()
    except KeyboardInterrupt:
        print("\n[SHUTDOWN] Shutting down...")
        if "server" in locals():
            server.stop()
    except Exception as e:
        print(f"[FATAL] Failed to start server: {type(e).__name__}: {e}")
        print("[INFO] Exiting...")
        sys.exit(1)


if __name__ == "__main__":
    main()
