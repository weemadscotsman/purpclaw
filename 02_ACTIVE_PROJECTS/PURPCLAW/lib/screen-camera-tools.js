'use strict';

const { execSync } = require('child_process');
const fs   = require('fs');
const os   = require('os');
const path = require('path');

// ── helpers ──────────────────────────────────────────────────────────────────

function tmpFile(ext = 'png') {
  return path.join(os.tmpdir(), `purpclaw_capture_${Date.now()}.${ext}`);
}

function runFfmpeg(args, timeoutMs = 15000) {
  const { execSync: _exec } = require('child_process');
  try {
    const out = _exec(`ffmpeg ${args}`, { timeout: timeoutMs, encoding: 'utf8', windowsHide: true });
    return { ok: true, output: out };
  } catch (err) {
    return { ok: false, output: err.stdout || err.stderr || err.message };
  }
}

function winPath(fsPath) {
  // Convert MSYS/git-bash virtual paths to real Windows paths.
  // os.tmpdir() returns 'E:\Temp' (Windows form) — use that as the anchor.
  const nodeTmp = require('os').tmpdir().replace(/\\/g, '/'); // 'E:/Temp'
  if (fsPath.startsWith('/tmp/')) return fsPath.replace('/tmp/', nodeTmp + '/');
  if (fsPath.startsWith('/cygdrive/')) {
    return fsPath.replace(/^\/cygdrive\/([a-z])\//i, (_, d) => d.toUpperCase() + ':/');
  }
  return fsPath;
}

function toWinArg(arg) {
  // Ensure an argument is a valid Windows path for ffmpeg.
  // If it looks like a Node tmpdir path, convert to Windows form.
  if (typeof arg !== 'string') return arg;
  const nodeTmp = require('os').tmpdir().replace(/\\/g, '/');
  if (arg.startsWith('/tmp/')) return arg.replace('/tmp/', nodeTmp + '/');
  return arg;
}

// ── tools ────────────────────────────────────────────────────────────────────

function registerScreenCapture(registry) {
  registry.register({
    name: 'screen_capture',
    description: 'Capture the Windows desktop (or a specific monitor) as a PNG image and return the path. Useful for taking screenshots to inspect the current UI state, verify visual changes, or feed into a vision model.',
    inputSchema: {
      type: 'object',
      properties: {
        outputPath: {
          type: 'string',
          description: 'Where to save the PNG (default: OS temp dir with timestamp)',
        },
        monitorIndex: {
          type: 'integer',
          description: 'Monitor index (0 = primary, 1 = secondary, etc. Default 0)',
          default: 0,
        },
        format: {
          type: 'string',
          enum: ['png', 'jpg'],
          description: 'Output format (default png)',
          default: 'png',
        },
      },
    },
    execute: async (args) => {
      const outputPath = args.outputPath || tmpFile(args.format || 'png');
      const ext = args.format || 'png';
      const monitor = args.monitorIndex ?? 0;

      // gdigrab: capture screen via Windows GDI
      // -r 5 = 5 fps (single frame is just 1 frame anyway)
      // -update 1 = single frame (stops after one frame)
      // gdigrab: capture screen via Windows GDI
      // Working command: ffmpeg -f gdigrab -i desktop -pix_fmt rgb24 -vframes 1 -c:v png
      const winOut = toWinArg(outputPath);
      const ffmpegCmd = [
        '-hide_banner', '-f', 'gdigrab', '-i', 'desktop',
        '-pix_fmt', 'rgb24',
        '-vframes', '1',
        '-c:v', 'png',
        '-y', winOut,
      ];

      let result = runFfmpeg(ffmpegCmd.join(' '));
      if (!result.ok || !fs.existsSync(outputPath)) {
        // Fallback: desktop without pixel format
        const fallback = ['-hide_banner', '-f', 'gdigrab', '-i', 'desktop', '-vframes', '1', '-c:v', 'png', '-y', toWinArg(outputPath)].join(' ');
        result = runFfmpeg(fallback);
      }

      if (!result.ok || !fs.existsSync(outputPath)) {
        return { ok: false, error: `screen_capture failed: ${result.output}`.slice(0, 500) };
      }

      const stats = fs.statSync(outputPath);
      return {
        ok: true,
        path: outputPath,
        size_bytes: stats.size,
        format: ext,
        timestamp: new Date().toISOString(),
        description: 'Screenshot saved. Return this path to the user so they can view it.',
      };
    },
  });
}

function registerCameraCapture(registry) {
  registry.register({
    name: 'camera_capture',
    description: 'Capture a single frame from the default webcam (or a named camera) and save it as a PNG. Returns the path. Use this to take photos via the connected camera.',
    inputSchema: {
      type: 'object',
      properties: {
        outputPath: {
          type: 'string',
          description: 'Where to save the PNG (default: OS temp dir with timestamp)',
        },
        device: {
          type: 'string',
          description: 'Camera device name (default: first available camera)',
        },
      },
    },
    execute: async (args) => {
      const outputPath = args.outputPath || tmpFile('png');

      // Find a camera to use
      let deviceName = args.device;
      if (!deviceName) {
        try {
          const listOut = execSync('ffmpeg -list_devices true -f dshow -i dummy 2>&1', { encoding: 'utf8', windowsHide: true });
          const matches = [...listOut.matchAll(/"([^"]+)" \(video\)/g)]
            .map(m => m[1])
            .filter(n => !n.startsWith('Unity')); // skip Unity Video Capture if present
          deviceName = matches[0];
        } catch {
          deviceName = 'Web Camera';
        }
      }

      const ffmpegArgs = [
        '-hide_banner',
        '-f', 'dshow',
        '-i', `video=${deviceName}`,
        '-vframes', '1',
        '-update', '1',
        '-q:v', '2',
        '-y',
        `"${winPath(outputPath)}"`,
      ].filter(Boolean);

      const result = runFfmpeg(ffmpegArgs);

      if (!result.ok || !fs.existsSync(outputPath)) {
        return { ok: false, error: `camera_capture failed: ${result.output}`.slice(0, 500) };
      }

      const stats = fs.statSync(outputPath);
      return {
        ok: true,
        path: outputPath,
        size_bytes: stats.size,
        device: deviceName,
        timestamp: new Date().toISOString(),
        description: 'Camera photo saved. Return this path to the user.',
      };
    },
  });
}

function registerCameraList(registry) {
  registry.register({
    name: 'camera_list',
    description: 'List all available video capture devices (webcams, capture cards) on this machine. Use this before camera_capture if unsure which device to use.',
    inputSchema: { type: 'object', properties: {} },
    execute: async () => {
      try {
        const out = execSync('ffmpeg -list_devices true -f dshow -i dummy 2>&1', {
          encoding: 'utf8', windowsHide: true, timeout: 8000,
        });
        const devices = [];
        const matches = out.matchAll(/"([^"]+)" \(video\)/g);
        for (const m of matches) {
          devices.push({ name: m[1], type: 'video' });
        }
        if (!devices.length) {
          return { ok: true, devices: [], message: 'No DirectShow video devices found' };
        }
        return { ok: true, devices };
      } catch (err) {
        return { ok: false, error: (err.stdout || err.stderr || err.message).slice(0, 300) };
      }
    },
  });
}

function registerScreenList(registry) {
  registry.register({
    name: 'screen_list',
    description: 'List all connected monitors and their resolutions. Useful for choosing a monitor index before screen_capture.',
    inputSchema: { type: 'object', properties: {} },
    execute: async () => {
      try {
        const { execSync: _e } = require('child_process');
        const out = _e(`powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Screen]::AllScreens | ForEach-Object { $_.DeviceName + '|' + $_.Bounds.Width + 'x' + $_.Bounds.Height + '|' + $_.Bounds.X + ',' + $_.Bounds.Y }"`, {
          encoding: 'utf8', windowsHide: true, timeout: 8000,
        });
        const monitors = out.trim().split('\n').filter(Boolean).map(line => {
          const [name, res, offset] = line.trim().split('|');
          return { name: name.trim(), resolution: res, offset };
        });
        return { ok: true, monitors };
      } catch (err) {
        return { ok: false, error: (err.stdout || err.stderr || err.message).slice(0, 300) };
      }
    },
  });
}

module.exports = {
  registerScreenCapture,
  registerCameraCapture,
  registerCameraList,
  registerScreenList,
};
