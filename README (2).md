# PURPCLAW Tony Stark Boot Sequence

## Overview

This is the Tony Stark-style JARVIS-inspired boot sequence for the PURPCLAW neural network system. It orchestrates multiple screens, plays boot music, and can be triggered by a clap or hotkey.

## Files

- **boot.js** - Main orchestrator that plays music and launches screens
- **clap-detector.js** - Microphone-triggered boot activation
- **screen-manager.js** - Multi-monitor window placement utilities
- **agent_tower.js** - Terminal-based visualization of all 26 agents
- **boot-sequence.json** - Configuration for screens and music
- **package.json** - Dependencies

## Installation

```bash
cd C:\Users\Admin\Desktop\purpclaw-boot
npm install
```

## Usage

### Standard Boot Sequence

```bash
npm start
```

### Clap Detection Mode

```bash
npm run clap
```

Clap your hands to trigger the boot sequence!

### Hotkey Trigger

When running the app, press `Ctrl+Shift+P` to trigger the boot sequence at any time.

## Dependencies

- `node-global-key-listener` - Global hotkey detection
- `mic` - Microphone input for clap detection
- `blessed` - Terminal UI for agent_tower

## Configuration

Edit `boot-sequence.json` to customize:
- Boot music path
- Screen launch commands
- Screen launch delays
- Monitor positions

## Agent Tower

Run `node agent_tower.js` to see all 26 PURPCLAW agents displayed in a terminal table with their chaos and wisdom stats.

## Notes

- Requires PowerShell for audio playback and window positioning
- Microphone requires permission access
- Multiple monitors are auto-detected via WMI
