# No Spaghett - Technical Documentation

## 1. System Overview

**No Spaghett** is a code smell analyzer and visualization engine designed to detect, diagnose, and visualize architectural anti-patterns in complex codebases (JavaScript, TypeScript, and Python). It combines structural analysis (Abstract Syntax Tree heuristics and regex parsing) with mythological "GOOP-SIGIL" abstractions to identify circular dependencies, God objects, dead code, and overly tangled logic.

The tool provides an immersive 3D/4D spatial visualization of the module dependency graph, allowing engineers to rotate, zoom, and explore connections dynamically. An integrated AI agent powered by Gemini (the "Exorcism Engine") can propose fully refactored, SOLID code alternatives for possessed logic.

## 2. Architecture & Technology Stack

### Frontend & Runtime
- **Framework:** [Next.js 15](https://nextjs.org/) (App Router paradigm)
- **Language:** TypeScript (ESNext)
- **Styling:** Tailwind CSS v4 via PostCSS, with utility class primitives.
- **Animations:** `motion/react` for layout transitions and micro-interactions.
- **Icons:** `lucide-react`.

### 3D Spatial Visualization
- **Graphing Engine:** `react-force-graph-3d` wrapping `three.js`.
- **Implementation:** Custom React component (`DependencyGraphVisualizer.tsx`) rendering a 3-dimensional force-directed graph. Physics include node repulsion, center gravity, and spring-forces on links.

### Backend APIs (Next.js Edge/Serverless Functions)
- **`/api/analyze-git/route.ts`**: Handles remote repository ingestions. Uses `adm-zip` to extract GitHub repository zipballs directly in memory.
- **`/api/refactor/route.ts`**: The "Exorcism" dispatcher powered by the `@google/genai` SDK using `gemini-2.5-flash`.

### Static Analysis Engine (`/lib/spaghetti`)
The core heuristic engine avoids heavy AST parsers (like Babel) on the client layer to maintain extreme performance when scanning hundreds of code files locally in the browser. 

- **`types.ts`**: Data contracts for metrics, AST nodes, and exact issue typologies.
- **`parser.ts`**: 
  - Regex-based recursive module resolver.
  - Implements import/export discovery for JS/TS (ESM/CJS) and Python (`import x`, `from x import *`).
  - Graph construction maps nodes to dependency edges and reverse-dependency edges.
- **`meter.ts` (SpaghettOMeter)**:
  - **God Objects:** Analyzes in-degree (reverse dependency count) against predefined thresholds ($>5$).
  - **Circular Dependencies (Prayer Wheels):** Uses DFS traversal with a recursion stack to identify precise cyclic loops.
  - **Tangled Logic:** File length and method density boundaries.
  - **Dead Code:** Identifies orphaned files lacking in-degree edges that do not match entry-point heuristics (e.g., `index`, `main`).
  - **Python Specifics:** Detects wildcard imports, excessive globals, and missing type hints based on density thresholds.

## 3. Data Flow

### A. Local Codebase Analysis
1. User drops a folder into the virtual file system handler (Client-side HTML5 Directory API).
2. `parser.ts` reads file text, strips binary/vendor files (`node_modules`, `dist`), and parses semantic imports.
3. Graph links (edges) are evaluated and resolved against the local namespace tree.
4. `meter.ts` runs diagnostics, producing a `Report` object.
5. When running as a PURPCLAW backend service, `thringlet-impact.ts` reads the local Thringlet bridge and appends colony mood, projected mood, distress score, and system-confession data.
6. The UI surfaces the `Report`, drawing the 3D topology and calculating the "System Confession".

### B. Remote Git Ingestion
1. User pastes a GitHub URL.
2. The `/api/analyze-git` endpoint receives the request, determines the `default_branch` via the GitHub REST API.
3. Node fetches the ZIP bundle as an `ArrayBuffer`.
4. `adm-zip` cracks the archive in memory.
5. The server runs the identical `parser.ts` and `meter.ts` processes as the client.
6. The resulting JSON graph payload is transmitted back to the client-side D3/Three.js renderers.

### C. The GOOP-SIGIL AI Exorcism
When an issue is flagged (e.g., God Object):
1. The client triggers a request to `/api/refactor`.
2. The system packages the raw source string, the identified issue topology, and the filepath into a specialized prompt context block.
3. Gemini acts as the "GOOP-SIGIL Engine", mapping the prompt to standard Refactoring Patterns (e.g. Domain Splitting, Extract Class, Invert Dependencies).
4. A markdown block with the proposed refactored architecture is presented on-screen.
5. If the Thringlet bridge is online, the successful exorcism is recorded as a runtime interaction.

### D. Thringlet-Aware Refactoring
No Spaghett can run as a PURPCLAW backend service on `127.0.0.1:7797` and consume the Thringlet bridge on `127.0.0.1:7799`.

- Dependency graph: social network of files.
- Spaghett-O-Meter: architecture distress score.
- Circular dependency: prayer wheel.
- God object: overloaded social hub.
- Dead code: forgotten file.
- Exorcism: structural therapy recorded back into the Thringlet colony.

The `POST /api/analyze-path` response includes `thringletImpact` with bridge status, colony mood, projected mood, distress score, and a system-confession summary.

## 4. Sub-Systems

### 4D Dependency Viewer
The dependency viewer is a dynamically imported Client Component (`react-force-graph-3d` relies on the window object and cannot SSR).
- **Nodes** represent files. Size correlates to Lines of Code (LoC).
- **Edges** represent imports (direction indicates dependency flow).
- **Physics Tick:** Runs on requestAnimationFrame. Link highlights trigger re-renders of specific colors on hover/click.
- **Interactivity:** Clicking a node flags it as 'Active', fetching the object from the Map and computing a 1-degree nearest-neighbor radius to glow.

## 5. Security & Deployment

- **Processing Boundaries:** Local codebase analysis never leaves the client's machine (zero telemetry). Git analysis parses the zip solely in volatile memory on the backend API layer.
- **Environment Management:** The application requires `GEMINI_API_KEY` for the AI refactoring loop. 
- **Build Target:** Outputs to a static asset bucket and a lightweight Node server (`next start`), deployable seamlessly via Docker/Google Cloud Run.
