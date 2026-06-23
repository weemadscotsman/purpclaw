'use strict';

const fs = require('fs');
const path = require('path');

let ts = null;
try {
  ts = require('typescript');
} catch {}

const DEFAULT_ROOT = path.resolve(__dirname, '..');
const CODE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const RESOLVE_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json'];
const SKIP_DIRS = new Set([
  '.git', '.next', '.claude', '.archive', '_vendor-from-pvx', 'node_modules', 'dist', 'build', 'coverage',
  'runtime', 'cache', '.cache', 'logs', 'agent_work', 'workspace', 'no-spaghett'
]);

let cache = null;

function toPosix(value) {
  return String(value || '').replace(/\\/g, '/');
}

function normalizeRel(root, filePath) {
  const absolute = path.isAbsolute(filePath) ? filePath : path.join(root, filePath);
  return toPosix(path.relative(root, absolute));
}

function safeRead(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function walkCodeFiles(root) {
  const out = [];
  const walk = (dir) => {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(full);
        continue;
      }
      if (CODE_EXTS.has(path.extname(entry.name))) out.push(full);
    }
  };
  walk(root);
  return out;
}

function resolveModule(root, fromRel, specifier) {
  if (!specifier || !specifier.startsWith('.')) return null;
  const fromDir = path.dirname(path.join(root, fromRel));
  const base = path.resolve(fromDir, specifier);
  const candidates = [];
  candidates.push(base);
  for (const ext of RESOLVE_EXTS) candidates.push(base + ext);
  for (const ext of RESOLVE_EXTS) candidates.push(path.join(base, 'index' + ext));
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return normalizeRel(root, candidate);
      }
    } catch {}
  }
  return null;
}

function parseWithTypescript(root, absPath, relPath, text) {
  const ext = path.extname(absPath);
  const kind = ext === '.tsx' ? ts.ScriptKind.TSX
    : ext === '.jsx' ? ts.ScriptKind.JSX
    : ext === '.ts' ? ts.ScriptKind.TS
    : ts.ScriptKind.JS;
  const source = ts.createSourceFile(absPath, text, ts.ScriptTarget.Latest, true, kind);
  const imports = [];
  const externalImports = [];
  const exports = [];

  function addImport(specifier) {
    const resolved = resolveModule(root, relPath, specifier);
    if (resolved) imports.push(resolved);
    else if (specifier) externalImports.push(specifier);
  }

  function exportedName(node) {
    return node && node.name && typeof node.name.text === 'string' ? node.name.text : null;
  }

  function visit(node) {
    if (ts.isImportDeclaration(node) && node.moduleSpecifier) {
      addImport(String(node.moduleSpecifier.text || ''));
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      addImport(String(node.moduleSpecifier.text || ''));
    } else if (ts.isCallExpression(node)) {
      const expr = node.expression;
      if (expr && expr.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) {
        addImport(node.arguments[0].text);
      }
      if (ts.isIdentifier(expr) && expr.text === 'require' && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) {
        addImport(node.arguments[0].text);
      }
    }

    const mods = node.modifiers ? Array.from(node.modifiers) : [];
    const isExported = mods.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
    if (isExported && (
      ts.isFunctionDeclaration(node) ||
      ts.isClassDeclaration(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isTypeAliasDeclaration(node) ||
      ts.isEnumDeclaration(node)
    )) {
      const name = exportedName(node);
      if (name) exports.push(name);
    }
    if (isExported && ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations || []) {
        const name = exportedName(decl);
        if (name) exports.push(name);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(source);
  return { imports, externalImports, exports };
}

function parseWithRegex(root, relPath, text) {
  const imports = [];
  const externalImports = [];
  const exports = [];
  const importPattern = /\b(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]|\brequire\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const match of text.matchAll(importPattern)) {
    const specifier = match[1] || match[2];
    const resolved = resolveModule(root, relPath, specifier);
    if (resolved) imports.push(resolved);
    else if (specifier) externalImports.push(specifier);
  }
  for (const match of text.matchAll(/\bexport\s+(?:async\s+)?(?:function|class|interface|type|const|let|var)\s+([A-Za-z_$][\w$]*)/g)) {
    exports.push(match[1]);
  }
  return { imports, externalImports, exports };
}

function unique(list) {
  return [...new Set(list.filter(Boolean))];
}

function buildGraph(root = DEFAULT_ROOT) {
  root = path.resolve(root);
  const startedAt = Date.now();
  const files = walkCodeFiles(root);
  const nodes = {};
  const reverse = {};

  for (const absPath of files) {
    const relPath = normalizeRel(root, absPath);
    const text = safeRead(absPath);
    const parsed = ts
      ? parseWithTypescript(root, absPath, relPath, text)
      : parseWithRegex(root, relPath, text);
    nodes[relPath] = {
      file: relPath,
      imports: unique(parsed.imports),
      externalImports: unique(parsed.externalImports),
      exports: unique(parsed.exports),
      bytes: Buffer.byteLength(text, 'utf8'),
      mtimeMs: fs.statSync(absPath).mtimeMs
    };
  }

  for (const [file, node] of Object.entries(nodes)) {
    for (const imported of node.imports) {
      if (!reverse[imported]) reverse[imported] = [];
      reverse[imported].push(file);
    }
  }
  for (const key of Object.keys(reverse)) reverse[key] = unique(reverse[key]).sort();

  cache = {
    root,
    builtAt: new Date().toISOString(),
    buildMs: Date.now() - startedAt,
    parser: ts ? 'typescript' : 'regex',
    files: Object.keys(nodes).length,
    edges: Object.values(nodes).reduce((sum, node) => sum + node.imports.length, 0),
    nodes,
    reverse
  };
  return cache;
}

function getGraph(root = DEFAULT_ROOT) {
  root = path.resolve(root);
  if (!cache || cache.root !== root) return buildGraph(root);
  return cache;
}

function normalizeTarget(root, target) {
  if (!target) return null;
  const cleaned = String(target).replace(/^file:\/+/, '').replace(/:\d{1,6}(?::\d{1,6})?$/, '');
  return normalizeRel(root, cleaned);
}

function dependencyContext(targets, options = {}) {
  const root = path.resolve(options.root || DEFAULT_ROOT);
  const graph = getGraph(root);
  const depth = Math.max(1, Math.min(Number(options.depth || 1), 3));
  const normalizedTargets = unique((Array.isArray(targets) ? targets : [targets]).map(t => normalizeTarget(root, t)));
  const out = {};

  for (const target of normalizedTargets) {
    const node = graph.nodes[target] || null;
    const visited = new Set();
    let frontier = graph.reverse[target] || [];
    const dependents = [];
    for (let d = 0; d < depth; d++) {
      const next = [];
      for (const file of frontier) {
        if (visited.has(file)) continue;
        visited.add(file);
        dependents.push(file);
        next.push(...(graph.reverse[file] || []));
      }
      frontier = next;
    }
    out[target] = {
      exists: Boolean(node),
      imports: node ? node.imports : [],
      externalImports: node ? node.externalImports : [],
      exports: node ? node.exports : [],
      dependents: unique(dependents).sort(),
      readOnlyContext: unique([...(node ? node.imports : []), ...dependents]).filter(f => f !== target).sort()
    };
  }
  return { builtAt: graph.builtAt, parser: graph.parser, depth, targets: out };
}

module.exports = {
  buildGraph,
  getGraph,
  dependencyContext,
  normalizeRel,
  DEFAULT_ROOT
};
