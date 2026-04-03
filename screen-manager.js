const { exec: rawExec, spawn: rawSpawn, execSync } = require('child_process');
const { trackedSpawn } = require('./lib/child-registry');

/**
 * Monitor information structure
 * @typedef {Object} Monitor
 * @property {string} name - Monitor name
 * @property {number} x - X position
 * @property {number} y - Y position
 * @property {number} width - Width in pixels
 * @property {number} height - Height in pixels
 */

/**
 * Gets all monitors using PowerShell Get-WmiObject
 * @returns {Monitor[]} Array of monitor objects
 */
function getMonitors() {
    try {
        const psCommand = `
            Get-WmiObject Win32_DesktopMonitor |
            ForEach-Object {
                [PSCustomObject]@{
                    Name = $_.Name
                    X = $_.ScreenTop
                    Y = $_.ScreenLeft
                    Width = $_.ScreenWidth
                    Height = $_.ScreenHeight
                }
            } | ConvertTo-Json
        `;

        const result = execSync(`powershell -c "${psCommand}"`, {
            encoding: 'utf8',
            windowsHide: true
        });

        const parsed = JSON.parse(result || '[]');
        // Normalize to array
        const monitors = Array.isArray(parsed) ? parsed : [parsed];

        return monitors.map(m => ({
            name: m.Name || 'Unknown',
            x: parseInt(m.X) || 0,
            y: parseInt(m.Y) || 0,
            width: parseInt(m.Width) || 1920,
            height: parseInt(m.Height) || 1080
        }));
    } catch (error) {
        console.warn('Failed to get monitors via WMI, using defaults:', error.message);
        // Return default monitor
        return [{
            name: 'Primary',
            x: 0,
            y: 0,
            width: 1920,
            height: 1080
        }];
    }
}

/**
 * Launches a window and positions it using PowerShell SetWindowPos
 * @param {string} command - Command to execute for the window
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {number} width - Window width
 * @param {number} height - Window height
 */
function launchWindow(command, x, y, width, height) {
    // Launch via rundll32 — no cmd.exe wrapper. FileProtocolHandler resolves
    // URLs, file paths, and executables the same way Windows 'start' does.
    const child = trackedSpawn('rundll32', ['url.dll,FileProtocolHandler', command], {
        tag: `window-${command.substring(0, 30)}`,
        timeoutMs: 10_000,  // window launch is fast; clean up if stuck
        stdio: 'ignore',
    });
    child.unref();  // don't block parent but child-registry still tracks it

    console.log(`Launching window: ${command.substring(0, 50)}... at (${x}, ${y}) ${width}x${height}`);

    // Wait for window to spawn, then position it
    setTimeout(() => {
        positionWindow(x, y, width, height);
    }, 1000);
}

/**
 * Positions a window using PowerShell SetWindowPos
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {number} width - Window width
 * @param {number} height - Window height
 */
function positionWindow(x, y, width, height) {
    try {
        const psCommand = `
            Add-Type @"
            using System;
            using System.Runtime.InteropServices;
            public class Win32 {
                [DllImport("user32.dll")]
                public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter,
                    int X, int Y, int cx, int cy, uint uFlags);
                public static readonly IntPtr HWND_TOP = IntPtr.Zero;
                public const uint SWP_NOZORDER = 0x0004;
            }
"@
            $windows = Get-Process | Where-Object { $_.MainWindowTitle -ne "" }
            if ($windows) {
                $hWnd = $windows[0].MainWindowHandle
                [Win32]::SetWindowPos($hWnd, [Win32]::HWND_TOP, ${x}, ${y}, ${width}, ${height}, [Win32]::SWP_NOZORDER)
            }
        `;

        exec(`powershell -c "${psCommand}"`, (error) => {
            if (error) {
                console.warn('Window positioning failed:', error.message);
            }
        });
    } catch (error) {
        console.warn('Failed to position window:', error.message);
    }
}

module.exports = { launchWindow, getMonitors, positionWindow };
