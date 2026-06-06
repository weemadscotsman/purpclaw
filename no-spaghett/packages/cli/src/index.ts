#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  ParserRegistry,
  BabelParser,
  GraphBuilder,
  SpaghettOMeter,
  FileNode,
  DependencyGraph
} from '@no-spaghett/core';

// Support absolute resolves for __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ================== RECURSIVE DIRECTORY WALKER ==================

function walkDirectory(dir: string, fileList: string[] = []): string[] {
  if (!fs.existsSync(dir)) return fileList;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    // Skip build folders, dependencies, and git metadata
    if (
      entry.name === 'node_modules' ||
      entry.name === '.git' ||
      entry.name === 'dist' ||
      entry.name === 'build' ||
      entry.name === '.next' ||
      entry.name === '.next-env'
    ) {
      continue;
    }

    if (entry.isDirectory()) {
      walkDirectory(fullPath, fileList);
    } else if (entry.isFile()) {
      fileList.push(fullPath);
    }
  }

  return fileList;
}

// ================== NODE/TS IMPORT PATH RESOLVER ==================

function resolveImportPath(sourceFile: string, importSource: string, allFiles: string[]): string | undefined {
  if (!importSource.startsWith('.') && !importSource.startsWith('/')) {
    // Phase 1 ignores third party package imports (node_modules)
    return undefined;
  }

  const absoluteDir = path.dirname(sourceFile);
  const resolvedBase = path.resolve(absoluteDir, importSource);

  // Candidates sorted by preference (standard extensions and index fallback)
  const extensions = [
    '', // Exact match (includes absolute resolves)
    '.ts',
    '.js',
    '.tsx',
    '.jsx',
    '/index.ts',
    '/index.js',
    '/index.tsx',
    '/index.jsx',
    '.mjs',
    '.cjs'
  ];

  for (const ext of extensions) {
    const candidate = resolvedBase + ext;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return path.resolve(candidate);
    }
  }

  // Fallback: match by relative path suffix within scanned files
  const normalizedBase = resolvedBase.replace(/\\/g, '/');
  const matched = allFiles.find(f => {
    const normalizedF = f.replace(/\\/g, '/');
    return normalizedF.startsWith(normalizedBase);
  });

  return matched ? path.resolve(matched) : undefined;
}

// ================== BEAUTIFUL REPORT FORMATTER ==================

function getNonnaVerdict(score: number): { emoji: string; text: string; color: string } {
  if (score <= 20) {
    return { emoji: '🤌 👩‍🍳', text: 'Clean as Nonna\'s kitchen! Exceptional structure.', color: '\x1b[32m' }; // Green
  } else if (score <= 50) {
    return { emoji: '🍽️ 🍝', text: 'Edible but tangled. Decent, but needs some untangling.', color: '\x1b[33m' }; // Yellow
  } else if (score <= 80) {
    return { emoji: '🆘 🔥', text: 'Full spaghetti code, send help! Infested with circular imports.', color: '\x1b[31m' }; // Red
  } else {
    return { emoji: '🤬 😡', text: 'Nonna disowns you! Delete this repository and start over.', color: '\x1b[41m\x1b[37m' }; // Red BG White Text
  }
}

// ================== CLI COORDINATOR ==================

async function run() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    console.log(`
\x1b[35m=== NO SPAGHETT CLI v1.0.0 ===\x1b[0m
"Because your code shouldn't look like dinner."

Usage:
  nospaghett analyze <directory_path> [--output <report.json>]

Options:
  -h, --help    Show this instructions guide
  --output      File path to write JSON report to
`);
    process.exit(0);
  }

  const command = args[0];
  if (command !== 'analyze') {
    console.error(`\x1b[31mError: Unknown command "${command}". Only "analyze" is supported.\x1b[0m`);
    process.exit(1);
  }

  const targetDirInput = args[1];
  if (!targetDirInput) {
    console.error('\x1b[31mError: Missing target directory path.\x1b[0m');
    process.exit(1);
  }

  const targetDir = path.resolve(targetDirInput);
  if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
    console.error(`\x1b[31mError: Directory not found at "${targetDir}".\x1b[0m`);
    process.exit(1);
  }

  console.log(`\x1b[36m\n🍝 Preparing Nonna's analysis for directory:\x1b[0m`);
  console.log(`   \x1b[37m${targetDir}\x1b[0m`);

  // Scan all files recursively
  const allFiles = walkDirectory(targetDir);
  
  // Register Babel JS/TS Parser
  const registry = new ParserRegistry();
  const babelParser = new BabelParser();
  registry.register(babelParser);

  const graphBuilder = new GraphBuilder();
  const fileNodes: FileNode[] = [];
  let totalLines = 0;
  let filesScanned = 0;

  // 1. Build File Nodes & Analyze ASTs
  for (const filePath of allFiles) {
    const parser = registry.getParser(filePath);
    if (!parser) continue; // Skip unsupported extensions

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const baseNode = parser.parse(filePath, content);
      
      const lines = content.split('\n').length;
      const size = fs.statSync(filePath).size;
      const id = path.resolve(filePath);

      const fileNode: FileNode = {
        ...baseNode,
        id,
        lines,
        size
      };

      fileNodes.push(fileNode);
      graphBuilder.addNode(fileNode);
      totalLines += lines;
      filesScanned++;
    } catch (e: any) {
      console.warn(`\x1b[33m   [WARN] Skipping ${path.basename(filePath)} due to read error: ${e.message}\x1b[0m`);
    }
  }

  console.log(`\x1b[32m   ✓ Successfully indexed ${filesScanned} JS/TS files (${totalLines} lines scanned).\x1b[0m`);

  // 2. Resolve relative imports and map dependency edges
  const absolutePaths = fileNodes.map(node => node.id);
  for (const node of fileNodes) {
    for (const imp of node.imports) {
      const resolved = resolveImportPath(node.id, imp.source, absolutePaths);
      if (resolved) {
        imp.resolvedPath = resolved;
        graphBuilder.addEdge(node.id, resolved);
      }
    }
  }

  // 3. Compile Graph & Score
  const graph = graphBuilder.build();
  const spaghettometer = new SpaghettOMeter();
  const metrics = spaghettometer.analyze(graph);

  const verdict = getNonnaVerdict(metrics.score);

  // 4. Print Terminal UI Report
  console.log(`\x1b[35m\n=================== NONNA'S SPAGHETT-O-METER ===================\x1b[0m`);
  
  console.log(`\n  Score:  ${verdict.color}[ ${metrics.score} / 100 ]\x1b[0m`);
  console.log(`  Verdict: ${verdict.color}${verdict.emoji} ${verdict.text}\x1b[0m\n`);

  console.log(`  📊 Project Metrics:`);
  console.log(`     • Total files scanned:  ${filesScanned}`);
  console.log(`     • Total lines of code:  ${totalLines}`);
  console.log(`     • Circular imports:     ${metrics.circularDeps.length}`);
  console.log(`     • God Objects (>=20):   ${metrics.godObjects.length}`);
  console.log(`     • Unused exports found: ${metrics.deadCode.length}`);

  if (metrics.circularDeps.length > 0) {
    console.log(`\n  \x1b[31m⚠️ Circular Imports Found (${metrics.circularDeps.length}):\x1b[0m`);
    metrics.circularDeps.forEach((c, idx) => {
      console.log(`     \x1b[33m${idx + 1}. Cycle of length ${c.length}:\x1b[0m`);
      c.cycle.forEach(p => {
        console.log(`        └─ ${path.relative(targetDir, p)}`);
      });
    });
  }

  if (metrics.godObjects.length > 0) {
    console.log(`\n  \x1b[31m🚨 God Objects Found (${metrics.godObjects.length}):\x1b[0m`);
    metrics.godObjects.forEach((g, idx) => {
      console.log(`     \x1b[33m${idx + 1}. ${path.relative(targetDir, g.path)} (imported by ${g.importedByCount} files)\x1b[0m`);
      console.log(`        💡 ${g.suggestion}`);
    });
  }

  if (metrics.longFiles.length > 0) {
    console.log(`\n  \x1b[33m🍝 Long Files Found (${metrics.longFiles.length}):\x1b[0m`);
    metrics.longFiles.forEach((lf, idx) => {
      console.log(`     \x1b[37m${idx + 1}. ${path.relative(targetDir, lf.path)} (${lf.lines} lines)\x1b[0m`);
      console.log(`        💡 ${lf.suggestion}`);
    });
  }

  if (metrics.deadCode.length > 0) {
    console.log(`\n  \x1b[36m💀 Dead Code / Unused Exports Found (${metrics.deadCode.length}):\x1b[0m`);
    metrics.deadCode.forEach((dc, idx) => {
      console.log(`     \x1b[37m${idx + 1}. ${path.relative(targetDir, dc.path)}: unused export "${dc.name}"\x1b[0m`);
    });
  }

  console.log(`\x1b[35m\n================================================================\x1b[0m\n`);

  // Write file output if requested
  const outputIndex = args.indexOf('--output');
  if (outputIndex !== -1 && args[outputIndex + 1]) {
    const outputPath = path.resolve(args[outputIndex + 1]);
    const reportData = {
      timestamp: new Date().toISOString(),
      projectPath: targetDir,
      filesScanned,
      totalLines,
      metrics,
      summary: {
        circularDepCount: metrics.circularDeps.length,
        godObjectCount: metrics.godObjects.length,
        longFileCount: metrics.longFiles.length,
        deadCodeCount: metrics.deadCode.length
      }
    };

    fs.writeFileSync(outputPath, JSON.stringify(reportData, null, 2), 'utf8');
    console.log(`\x1b[32m💾 Saved Nonna's report to ${outputPath}\x1b[0m\n`);
  }
}

run().catch(err => {
  console.error('\x1b[31mFatal error during analysis:\x1b[0m', err);
  process.exit(1);
});
