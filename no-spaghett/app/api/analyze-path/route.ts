import { NextRequest, NextResponse } from 'next/server';
import { readdir, readFile, stat } from 'fs/promises';
import path from 'path';
import { buildProjectGraph } from '@/lib/spaghetti/parser';
import { SpaghettOMeter } from '@/lib/spaghetti/meter';
import { buildThringletImpact } from '@/lib/spaghetti/thringlet-impact';
import type { DependencyGraph, Report, SpaghettMetrics } from '@/lib/spaghetti/types';

export const runtime = 'nodejs';

type SourceFile = {
  path: string;
  content: string;
};

const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.py']);
const IGNORED_DIRS = new Set([
  '.cache',
  '.git',
  '.next',
  '.turbo',
  '.venv',
  '__pycache__',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'target',
  'venv',
]);
const DEFAULT_MAX_FILES = 2500;
const MAX_FILES_CAP = 10000;
const MAX_FILE_BYTES = 1024 * 1024;

function toGraphPath(root: string, filePath: string): string {
  return path.relative(root, filePath).split(path.sep).join('/');
}

function clampMaxFiles(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_MAX_FILES;
  return Math.max(1, Math.min(Math.floor(value), MAX_FILES_CAP));
}

async function collectSourceFiles(root: string, current: string, files: SourceFile[], maxFiles: number): Promise<void> {
  if (files.length >= maxFiles) return;

  const entries = await readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    if (files.length >= maxFiles) return;
    const fullPath = path.join(current, entry.name);

    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      await collectSourceFiles(root, fullPath, files, maxFiles);
      continue;
    }

    if (!entry.isFile() || !SOURCE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      continue;
    }

    const info = await stat(fullPath);
    if (info.size > MAX_FILE_BYTES) continue;

    files.push({
      path: toGraphPath(root, fullPath),
      content: await readFile(fullPath, 'utf8'),
    });
  }
}

function summarize(metrics: SpaghettMetrics): Report['summary'] {
  return {
    circularDepCount: metrics.circularDeps.length,
    godObjectCount: metrics.godObjects.length,
    longFileCount: metrics.longFiles.length,
    deadCodeCount: metrics.deadCode.length,
    wildcardImportCount: metrics.wildcardImports.length,
    excessiveGlobalsCount: metrics.excessiveGlobals.length,
    missingTypeHintsCount: metrics.missingTypeHints.length,
  };
}

function serializeGraph(graph: DependencyGraph) {
  return {
    nodes: Array.from(graph.nodes.values()).map((node) => ({
      id: node.id,
      path: node.path,
      imports: node.imports,
      exports: node.exports,
      lines: node.lines,
      size: node.size,
      language: node.language,
    })),
    edges: Array.from(graph.edges.entries()),
    reverse: Array.from(graph.reverse.entries()),
  };
}

function topIssueLines(metrics: SpaghettMetrics): string[] {
  const issues = [
    ...metrics.circularDeps,
    ...metrics.godObjects,
    ...metrics.longFiles,
    ...metrics.deadCode,
    ...metrics.wildcardImports,
    ...metrics.excessiveGlobals,
    ...metrics.missingTypeHints,
  ];

  return issues.slice(0, 20).map((issue, index) => {
    return `${index + 1}. ${issue.severity.toUpperCase()} ${issue.type}: ${issue.path} - ${issue.suggestion}`;
  });
}

function graphMermaid(graph: DependencyGraph): string {
  const lines = ['graph TD'];
  let count = 0;
  for (const [from, targets] of graph.edges.entries()) {
    for (const target of targets) {
      if (count >= 120) break;
      lines.push(`  ${JSON.stringify(from)} --> ${JSON.stringify(target)}`);
      count += 1;
    }
    if (count >= 120) break;
  }

  if (lines.length === 1) {
    lines.push('  "No internal dependency edges detected"');
  }

  return lines.join('\n');
}

function generateDocs(projectPath: string, graph: DependencyGraph, metrics: SpaghettMetrics, summary: Report['summary']) {
  const issueLines = topIssueLines(metrics);
  const issueBlock = issueLines.length ? issueLines.join('\n') : 'No high-signal spaghetti issues detected.';

  return {
    'CODE_HEALTH.md': `# Code Health Report

Project: ${projectPath}

Score: ${metrics.score}/100
Files scanned: ${metrics.totalFiles}
Internal dependencies: ${metrics.totalDependencies}

## Findings

- Circular dependencies: ${summary.circularDepCount}
- God objects: ${summary.godObjectCount}
- Long files: ${summary.longFileCount}
- Dead code candidates: ${summary.deadCodeCount}
- Python wildcard imports: ${summary.wildcardImportCount}
- Python excessive globals: ${summary.excessiveGlobalsCount}
- Python missing type-hint hotspots: ${summary.missingTypeHintsCount}

## Top Issues

${issueBlock}
`,
    'ARCHITECTURE_GRAPH.md': `# Architecture Graph

\`\`\`mermaid
${graphMermaid(graph)}
\`\`\`
`,
    'CLEANUP_PLAN.md': `# Cleanup Plan

1. Break circular dependencies first by extracting shared contracts or shared utilities into neutral modules.
2. Split God objects by responsibility before moving call sites.
3. Refactor long files into feature modules, controller/service pairs, or component subfolders.
4. Verify dead-code candidates before deleting because dynamic imports and framework routing can hide usage.
5. For Python, replace wildcard imports, move global state behind explicit objects, and add return type hints to large modules.

## Agent Handoff

Use the exact findings from the JSON report as the source of truth. Make one structural change at a time, run the project test/build gate after each batch, and keep imports updated with the graph.
`,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const targetPath = typeof body?.path === 'string' ? body.path : '';
    const includeContent = Boolean(body?.includeContent);
    const maxFiles = clampMaxFiles(body?.maxFiles);

    if (!targetPath.trim()) {
      return NextResponse.json({ error: 'path is required' }, { status: 400 });
    }

    const root = path.resolve(targetPath);
    const rootStat = await stat(root);
    if (!rootStat.isDirectory()) {
      return NextResponse.json({ error: 'path must be a directory', path: root }, { status: 400 });
    }

    const sourceFiles: SourceFile[] = [];
    await collectSourceFiles(root, root, sourceFiles, maxFiles);

    const graph = buildProjectGraph(sourceFiles);
    const metrics = new SpaghettOMeter().analyze(graph);
    const summary = summarize(metrics);
    const totalLines = sourceFiles.reduce((sum, file) => sum + file.content.split('\n').length, 0);
    const thringletImpact = await buildThringletImpact(metrics);

    return NextResponse.json({
      ok: true,
      service: 'no-spaghett',
      mode: 'local-path',
      timestamp: new Date().toISOString(),
      projectPath: root,
      filesScanned: sourceFiles.length,
      maxFiles,
      truncated: sourceFiles.length >= maxFiles,
      totalLines,
      metrics,
      summary,
      rawGraph: serializeGraph(graph),
      docs: generateDocs(root, graph, metrics, summary),
      thringletImpact,
      sourceFiles: includeContent ? sourceFiles : undefined,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'unknown error';
    return NextResponse.json({ error: 'analyze-path failed', detail: message }, { status: 500 });
  }
}
