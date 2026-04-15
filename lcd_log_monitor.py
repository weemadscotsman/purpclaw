#!/usr/bin/env python3
"""
PURPCLAW Terminal Log Monitor
Displays logs from the focused terminal window on the Turing Smart Screen LCD.
Polls the Control API for logs and shows them on the LCD.
"""

import socket
import json
import time
import sys
import os
from datetime import datetime
from collections import deque

# Add the Turing Smart Screen Python library path
sys.path.insert(0, r"C:\Users\Admin\Desktop\turing-smart-screen-python")

try:
    from rig_lcd_terminal import RigLcdTerminal

    LCD_AVAILABLE = True
except ImportError as e:
    print(f"⚠️  LCD terminal not available: {e}")
    LCD_AVAILABLE = False


class TerminalLogMonitor:
    def __init__(self, host="127.0.0.1", port=7778):
        self.host = host
        self.port = port
        self.lcd_terminal = None
        self.last_log_count = 0
        self.displayed_lines = []
        self.max_lines = 6  # Lines visible on LCD
        self.running = True

        if LCD_AVAILABLE:
            try:
                print("[INIT] Initializing LCD terminal...")
                self.lcd_terminal = RigLcdTerminal()
                self.lcd_terminal.log(
                    "PURPCLAW Log Monitor", self.lcd_terminal.HEADER_COLOR
                )
                print("[OK] LCD terminal initialized")
            except Exception as e:
                print(f"[ERROR] Failed to initialize LCD: {e}")
                self.lcd_terminal = None
        else:
            print("[SIM] Running in simulation mode")

    def send_to_lcd(self, message, color=None):
        """Send message to LCD."""
        if self.lcd_terminal:
            if color == "ERROR":
                self.lcd_terminal.log_error(message)
            elif color == "WARN":
                self.lcd_terminal.log_warn(message)
            elif color == "INFO":
                self.lcd_terminal.log_info(message)
            else:
                self.lcd_terminal.log(message)
        else:
            print(f"[LCD] {message}")

    def fetch_logs_via_http(self):
        """Fetch logs from PURPCLAW Control API."""
        try:
            import urllib.request

            url = "http://localhost:7780/api/logs?limit=10"
            req = urllib.request.Request(url)
            with urllib.request.urlopen(req, timeout=2) as response:
                data = json.loads(response.read().decode("utf-8"))
                return data if isinstance(data, list) else []
        except Exception as e:
            return []

    def format_log_line(self, log_entry):
        """Format a log entry for LCD display."""
        timestamp = log_entry.get("timestamp", "")
        if timestamp:
            # Extract just time: HH:MM:SS
            timestamp = (
                timestamp.split("T")[1].split(".")[0]
                if "T" in timestamp
                else timestamp[11:19]
            )
        else:
            timestamp = ""

        # Get log content
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

        # Truncate long messages
        if len(msg) > 25:
            msg = msg[:22] + "..."

        return f"{timestamp} {msg}" if timestamp else msg

    def update_display(self):
        """Fetch logs and update LCD display."""
        logs = self.fetch_logs_via_http()

        if not logs:
            self.send_to_lcd("No logs available", "INFO")
            return

        # Format new logs
        new_lines = [self.format_log_line(log) for log in logs[: self.max_lines]]

        # Check if anything changed
        if new_lines != self.displayed_lines:
            self.displayed_lines = new_lines

            # Clear and redraw
            if self.lcd_terminal:
                self.lcd_terminal.clear()

            self.send_to_lcd("═══ PURPCLAW LOGS ═══", "INFO")
            for line in self.displayed_lines:
                self.send_to_lcd(line)

    def run(self, poll_interval=2):
        """Main loop - poll logs and update LCD."""
        print(f"[START] Terminal Log Monitor starting...")
        print(f"[INFO] Poll interval: {poll_interval}s")
        print("[INFO] Press Ctrl+C to stop")

        self.send_to_lcd("PURPCLAW Monitor", "INFO")
        self.send_to_lcd("Starting...", "INFO")

        while self.running:
            try:
                self.update_display()
                time.sleep(poll_interval)
            except KeyboardInterrupt:
                self.running = False
                break
            except Exception as e:
                print(f"[ERROR] Update error: {e}")
                self.send_to_lcd(f"Error: {e}", "ERROR")
                time.sleep(poll_interval)

        self.stop()

    def stop(self):
        """Stop the monitor."""
        self.running = False
        if self.lcd_terminal:
            try:
                self.lcd_terminal.log("Monitor Stopped", self.lcd_terminal.ERROR_COLOR)
                self.lcd_terminal.close()
            except:
                pass
        print("[STOP] Terminal Log Monitor stopped")


def main():
    try:
        monitor = TerminalLogMonitor()
        monitor.run(poll_interval=2)  # Update every 2 seconds
    except KeyboardInterrupt:
        print("\n[SHUTDOWN] Shutting down...")
    except Exception as e:
        print(f"[FATAL] Failed to start monitor: {type(e).__name__}: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
