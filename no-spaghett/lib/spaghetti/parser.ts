import { FileNode, Import, Export, DependencyGraph } from './types';

function normalizePath(path: string): string {
  // Strip extensions for id matching
  return path.replace(/\.(tsx?|jsx?|py)$/, '');
}

function resolveRelativePath(basePath: string, relativePath: string): string {
  if (!relativePath.startsWith('.')) return relativePath;
  
  const baseParts = basePath.split('/');
  baseParts.pop(); // remove filename
  
  const relParts = relativePath.split('/');
  
  for (const part of relParts) {
    if (part === '.') continue;
    if (part === '..') {
      baseParts.pop();
    } else {
      baseParts.push(part);
    }
  }
  
  return baseParts.join('/');
}

const IMPORT_REGEX = /import\s+(?:(?:[\w*\s{},]*)\s+from\s+)?['"]([^'"]+)['"]/g;
const DYNAMIC_IMPORT_REGEX = /import\(['"]([^'"]+)['"]\)/g;
const REQUIRE_REGEX = /require\(['"]([^'"]+)['"]\)/g;
const EXPORT_REGEX = /export\s+(?:const|let|var|function|class|type|interface|default)?\s*([a-zA-Z0-9_]+)?/g;
const RE_EXPORT_REGEX = /export\s+(?:[\w\s{},*]+)\s+from\s+['"]([^'"]+)['"]/g;

const PY_IMPORT_REGEX = /^import\s+([a-zA-Z0-9_.,\s]+)/gm;
const PY_FROM_IMPORT_REGEX = /^from\s+([a-zA-Z0-9_.]+)\s+import\s+([a-zA-Z0-9_.,\s*]+)/gm;
const PY_DEF_REGEX = /^(?:async\s+)?def\s+([a-zA-Z0-9_]+)\s*\(/gm;
const PY_CLASS_REGEX = /^class\s+([a-zA-Z0-9_]+)\s*[:(]/gm;

export function parsePythonSource(filePath: string, content: string): FileNode {
  const lines = content.split('\n');
  const imports: Import[] = [];
  const exports: Export[] = [];
  
  let match;
  
  const importRegex = new RegExp(PY_IMPORT_REGEX);
  while ((match = importRegex.exec(content)) !== null) {
    if (match[1]) {
       const sources = match[1].split(',').map(s => s.trim());
       for (const source of sources) {
           imports.push({
               source: source.replace(/\./g, '/'),
               isRelative: source.startsWith('.')
           });
       }
    }
  }
  
  const fromImportRegex = new RegExp(PY_FROM_IMPORT_REGEX);
  while ((match = fromImportRegex.exec(content)) !== null) {
     if (match[1]) {
         const source = match[1].replace(/\./g, '/');
         imports.push({
             source,
             isRelative: source.startsWith('/')
         });
     }
  }

  const defRegex = new RegExp(PY_DEF_REGEX);
  while ((match = defRegex.exec(content)) !== null) {
      if (match[1] && !match[1].startsWith('_')) {
         exports.push({ name: match[1] });
      }
  }

  const classRegex = new RegExp(PY_CLASS_REGEX);
  while ((match = classRegex.exec(content)) !== null) {
      if (match[1] && !match[1].startsWith('_')) {
         exports.push({ name: match[1] });
      }
  }
  
  return {
      id: normalizePath(filePath),
      path: filePath,
      content,
      language: 'py',
      lines: lines.length,
      size: content.length,
      imports,
      exports
  };
}

export function parseSource(filePath: string, content: string): FileNode {
  const language = filePath.split('.').pop() as any;
  if (language === 'py') {
      return parsePythonSource(filePath, content);
  }

  const lines = content.split('\n');
  const imports: Import[] = [];
  const exports: Export[] = [];
  
  let match;
  
  const matchers = [
      new RegExp(IMPORT_REGEX),
      new RegExp(DYNAMIC_IMPORT_REGEX),
      new RegExp(REQUIRE_REGEX),
      new RegExp(RE_EXPORT_REGEX)
  ];

  for (const matcher of matchers) {
      while ((match = matcher.exec(content)) !== null) {
          if (match[1]) {
              imports.push({
                  source: match[1],
                  isRelative: match[1].startsWith('.')
              });
          }
      }
  }

  const exportRegex = new RegExp(EXPORT_REGEX);
  while ((match = exportRegex.exec(content)) !== null) {
      if (match[1]) {
          exports.push({ name: match[1] });
      }
  }

  return {
      id: normalizePath(filePath),
      path: filePath,
      content,
      language,
      lines: lines.length,
      size: content.length,
      imports,
      exports
  };
}

export function buildProjectGraph(files: {path: string, content: string}[]): DependencyGraph {
  const nodes = new Map<string, FileNode>();
  const edges = new Map<string, string[]>();
  const reverse = new Map<string, string[]>();

  for (const file of files) {
      const node = parseSource(file.path, file.content);
      nodes.set(node.id, node);
      edges.set(node.id, []);
      reverse.set(node.id, []);
  }

  const allIds = new Set(nodes.keys());

  for (const node of nodes.values()) {
      for (const imp of node.imports) {
          if (imp.isRelative) {
              let resolvedId = resolveRelativePath(node.id, imp.source);
              
              if (!allIds.has(resolvedId)) {
                  if (allIds.has(resolvedId + '/index')) {
                      resolvedId = resolvedId + '/index';
                  } else if (allIds.has(resolvedId + '/__init__')) {
                      resolvedId = resolvedId + '/__init__';
                  }
              }
              
              imp.resolvedPath = resolvedId;
              if (allIds.has(resolvedId)) {
                  edges.get(node.id)!.push(resolvedId);
                  
                  if (!reverse.has(resolvedId)) reverse.set(resolvedId, []);
                  reverse.get(resolvedId)!.push(node.id);
              }
          } else {
             let resolvedId = imp.source.replace(/^@\//, '');
             if (!allIds.has(resolvedId)) {
                 if (allIds.has(resolvedId + '/index')) {
                     resolvedId = resolvedId + '/index';
                 } else if (allIds.has(resolvedId + '/__init__')) {
                     resolvedId = resolvedId + '/__init__';
                 }
             }
             
             imp.resolvedPath = resolvedId;
             if (allIds.has(resolvedId)) {
                 edges.get(node.id)!.push(resolvedId);
                 if (!reverse.has(resolvedId)) reverse.set(resolvedId, []);
                 reverse.get(resolvedId)!.push(node.id);
             } else {
                 imp.isExternal = true;
             }
          }
      }
      edges.set(node.id, [...new Set(edges.get(node.id))]);
  }
  
  for (const [k, v] of reverse.entries()) {
      reverse.set(k, [...new Set(v)]);
  }

  return { nodes, edges, reverse };
}
