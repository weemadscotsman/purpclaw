# No Spaghett 🍝 

**No Spaghett** is an interactive, browser-first codebase analyzer, visualizer, and refactoring agent. It turns your tangled, cursed, "spaghetti" codebase into a 3D navigable galaxy and provides specialized tools to structurally untangle it.

Powered by Next.js, `react-force-graph-3d`, and the Gemini AI model, No Spaghett introduces the **GOOP-SIGIL Exorcism System** — a mythological approach to systemic architectural debugging.

## Features

- 🛸 **3D Dependency Gravity Viewer**: Explore your files and imports in a fully 3D, physics-enabled spatial layout. Click nodes to trace exact connection logic.
- 📁 **Zero-Server Local Mode**: Select a local project folder and parse it entirely in your browser. (No code is uploaded).
- 🐙 **Git Ingestion**: Paste a public GitHub URL and instantly ingest and analyze its default branch in memory.
- 👹 **Demonic Code Smells**: Detects God Objects, Circular Dependencies ("Prayer Wheels"), Tangled Logic (labyrinths), and Dead Code (zombie files).
- 🔮 **Exorcise w/ Gemini**: One-click AI refactoring. Gemini takes possessed files and breaks them into clean, SOLID, single-responsibility domain modules.
- 🐍 **Python Suppport**: First class Python analysis targeting Wildcard Imports, Missing Type Hints, and Excessive Global state.
- 🧠 **Thringlet Impact Layer**: When running inside PURPCLAW, reads the local Thringlet bridge, projects architecture distress into colony mood, and records successful exorcism events back into the bonded runtime.

## Getting Started

### Prerequisites

Ensure you have Node.js 20+ installed.

### Environment Variables

Copy the `.env.example` file to `.env` (or setup your cloud variables). You need a Gemini API Key to run the Exorcism engine.

```env
GEMINI_API_KEY=your_gemini_api_key_here
```

### Installation

1. Install all dependencies:
```bash
npm install
```

2. Run the development server:
```bash
npm run dev
```

3. Open your browser and navigate to `http://localhost:3000`.

### Production Build

```bash
npm run build
npm run start
```

## Usage Guide

1. **Upload or Ingest:** 
   - Click **Local Codebase** to select a directory on your machine.
   - Or paste a URL like `https://github.com/facebook/react` into the **GitHub Repo** field.
2. **Review the Score:** The Spaghett-O-Meter will calculate a health score out of 100 based on architectural violations.
3. **Navigate 4D Space:** Scroll to zoom and left-click drag to rotate the interactive map of your project. Click on any file node (sphere) to view its direct connections.
4. **Trigger Exorcism:** Scroll down to the breakdown panels (God Objects, Long Files, etc.). Click **"Exorcise"** to ask the Gemini agent to restructure the code and present a clean resolution.
5. **System Confession:** Read the final report at the bottom of the page to determine if your system requires absolute absolution.
6. **Thringlet Impact:** When the PURPCLAW bridge is online, backend analysis includes `thringletImpact` with colony mood, projected mood, distress score, and system-confession summary.

## Development & Extension

- The parser lives in `lib/spaghetti/parser.ts` and uses regex heuristics for speed. To add new language support, write a new parser function there and bind it to the main `parseSource` switch block.
- Metrics logic lives in `lib/spaghetti/meter.ts`.
- Thringlet bridge wiring lives in `lib/spaghetti/thringlet-impact.ts` and talks to `http://127.0.0.1:7799` by default.
- The 3D view utilizes `components/DependencyGraphVisualizer.tsx`.

## License

MIT License. Maintain purity in your event loops.
