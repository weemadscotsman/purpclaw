#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// ================== DIRECTORY WALKER ==================

function walk(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (['node_modules', '.git', 'dist', 'build', '.next'].includes(entry.name)) continue;
    
    if (entry.isDirectory()) {
      walk(full, fileList);
    } else if (entry.isFile()) {
      if (/\.(js|ts|jsx|tsx|mjs|cjs)$/.test(entry.name)) {
        fileList.push(full);
      }
    }
  }
  return fileList;
}

// ================== PARSER & RESOLVER ==================

function parseImports(content) {
  const imports = [];
  
  // ESM static imports: import ... from 'x'
  const esmStatic = /import\s+[\s\S]*?\s+from\s+['"](.*?)['"]/g;
  let match;
  while ((match = esmStatic.exec(content)) !== null) {
    imports.push(match[1]);
  }

  // ESM dynamic imports: import('x')
  const esmDynamic = /import\s*\(\s*['"](.*?)['"]\s*\)/g;
  while ((match = esmDynamic.exec(content)) !== null) {
    imports.push(match[1]);
  }

  // CommonJS requires: require('x')
  const cjsRequire = /require\s*\(\s*['"](.*?)['"]\s*\)/g;
  while ((match = cjsRequire.exec(content)) !== null) {
    imports.push(match[1]);
  }

  return [...new Set(imports)];
}

function resolveImport(sourceFile, importSource, allFiles) {
  if (!importSource.startsWith('.') && !importSource.startsWith('/')) {
    return null; // Ignore third-party
  }

  const absoluteDir = path.dirname(sourceFile);
  const resolvedBase = path.resolve(absoluteDir, importSource);

  const extensions = ['', '.ts', '.js', '.tsx', '.jsx', '/index.ts', '/index.js', '/index.tsx', '/index.jsx'];
  for (const ext of extensions) {
    const candidate = resolvedBase + ext;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return path.resolve(candidate);
    }
  }

  // Suffix matching
  const normalizedBase = resolvedBase.replace(/\\/g, '/');
  const matched = allFiles.find(f => f.replace(/\\/g, '/').startsWith(normalizedBase));
  return matched ? path.resolve(matched) : null;
}

// ================== DFS CYCLE DETECTOR ==================

function findCycles(edges) {
  const cycles = [];
  const visited = new Set();
  const recursionStack = new Set();
  const cycleKeys = new Set();

  function getCanonicalRotation(cycle) {
    if (cycle.length === 0) return [];
    let minIndex = 0;
    let minVal = cycle[0];
    for (let i = 1; i < cycle.length; i++) {
      if (cycle[i] < minVal) {
        minVal = cycle[i];
        minIndex = i;
      }
    }
    return [...cycle.slice(minIndex), ...cycle.slice(0, minIndex)];
  }

  function dfs(node, pathArr) {
    if (recursionStack.has(node)) {
      const start = pathArr.indexOf(node);
      const rawCycle = pathArr.slice(start);
      const rotated = getCanonicalRotation(rawCycle);
      const key = rotated.join(' -> ');
      
      if (!cycleKeys.has(key)) {
        cycleKeys.add(key);
        cycles.push(rotated);
      }
      return;
    }
    if (visited.has(node)) return;

    visited.add(node);
    recursionStack.add(node);
    pathArr.push(node);

    const neighbors = edges[node] || [];
    for (const neighbor of neighbors) {
      dfs(neighbor, [...pathArr]);
    }

    recursionStack.delete(node);
  }

  for (const node of Object.keys(edges)) {
    dfs(node, []);
  }

  return cycles;
}

// ================== MAIN DIAGNOSTICS ==================

function run() {
  const args = process.argv.slice(2);
  const targetPathInput = args[0] || '.';
  const targetPath = path.resolve(targetPathInput);

  if (!fs.existsSync(targetPath)) {
    console.error(`\x1b[31m[GOOP-SIGIL] Target path not found: ${targetPath}\x1b[0m`);
    process.exit(1);
  }

  const allFiles = walk(targetPath);
  const edges = {};
  const reverseEdges = {};
  const fileLines = {};

  // Index files
  allFiles.forEach(f => {
    edges[f] = [];
    reverseEdges[f] = [];
    try {
      const content = fs.readFileSync(f, 'utf8');
      fileLines[f] = content.split('\n').length;
      
      const imports = parseImports(content);
      imports.forEach(imp => {
        const resolved = resolveImport(f, imp, allFiles);
        if (resolved) {
          edges[f].push(resolved);
        }
      });
    } catch (e) {
      fileLines[f] = 0;
    }
  });

  // Compile reverse edges
  Object.keys(edges).forEach(from => {
    edges[from].forEach(to => {
      if (!reverseEdges[to]) reverseEdges[to] = [];
      if (!reverseEdges[to].includes(from)) {
        reverseEdges[to].push(from);
      }
    });
  });

  // Cycle analysis
  const cycles = findCycles(edges);
  
  // God Object analysis (imported by >= 10 files in subset, or >= 20 globally)
  const godObjects = [];
  const GOD_THRESHOLD = allFiles.length > 30 ? 20 : 8;
  Object.keys(reverseEdges).forEach(node => {
    const count = reverseEdges[node].length;
    if (count >= GOD_THRESHOLD) {
      godObjects.push({ path: node, count });
    }
  });

  // Long files
  const longFiles = [];
  Object.keys(fileLines).forEach(f => {
    if (fileLines[f] > 1000) {
      longFiles.push({ path: f, lines: fileLines[f] });
    }
  });

  // Calculate Spaghett-o-Meter score
  let score = 0;
  score += cycles.length * 12;
  score += godObjects.length * 15;
  score += longFiles.length * 8;
  const finalScore = Math.min(100, Math.max(0, score === 0 && allFiles.length > 0 ? 12 : score));

  // Output terminal report
  console.log(`\n\x1b[35m🔮 [GOOP-SIGIL RITUAL COMPLEXITY REPORT]\x1b[0m`);
  console.log(`   Target: \x1b[37m${path.basename(targetPath)}\x1b[0m`);
  console.log(`   Files:  ${allFiles.length} scanned | Lines: ${Object.values(fileLines).reduce((a, b) => a + b, 0)}`);

  console.log(`\n\x1b[36mSpaghett-o-Meter:\x1b[0m \x1b[31m${finalScore}/100\x1b[0m.`);
  if (finalScore >= 50) {
    console.log(`\x1b[33mWarning: Nonna would disown this codebase.\x1b[0m`);
  } else {
    console.log(`\x1b[32mNonna approves. The kitchen is clean. 🤌\x1b[0m`);
  }

  if (cycles.length > 0) {
    console.log(`\n\x1b[31mCircular dependencies (prayer wheels) found in:\x1b[0m`);
    cycles.slice(0, 5).forEach(c => {
      console.log(`  - ${path.relative(targetPath, c[0])}`);
    });
    console.log(`\n\x1b[33m"These are prayer wheels. They repeat the same import logic hoping for a different result."\x1b[0m`);
  }

  if (godObjects.length > 0) {
    console.log(`\n\x1b[31mGod objects (possessions) detected:\x1b[0m`);
    godObjects.forEach(g => {
      const name = path.basename(g.path);
      console.log(`  - \x1b[33m${path.relative(targetPath, g.path)}\x1b[0m (imported by ${g.count} files).`);
      console.log(`    \x1b[36m"${name} is trying to watch everything. Give them helpers."\x1b[0m`);
    });
  }

  if (cycles.length > 0 || godObjects.length > 0) {
    console.log(`\n\x1b[35mRecommend exorcism:\x1b[0m`);
    if (godObjects.length > 0) {
      console.log(`  - Extract God Object responsibilities into domain-driven sub-modules.`);
    }
    if (cycles.length > 0) {
      console.log(`  - Break prayer wheel circular loops with a shared event bus or registry.`);
    }
    
    const firstGod = godObjects[0]?.path || 'watcher.js';
    console.log(`\nRun \x1b[32m'node skills/goop-sigil/exorcise_module.js --path ${path.relative(targetPath, firstGod)} --strategy split_by_domain'\x1b[0m to begin.`);
  }

  console.log(`\n\x1b[36mMay your event loops be shallow and your imports direct. GOOP.\x1b[0m\n`);
}

run();
