import { DependencyGraph, SpaghettMetrics, CircularDep, GodObject, FileMetrics, NestingIssue, DeadCode } from '../types.js';

export class SpaghettOMeter {
  private MAX_FILE_LINES = 1000;
  private GOD_OBJECT_THRESHOLD = 20; // Imported by >=20 files
  private CIRCULAR_DEATH_PENALTY = 10;
  private GOD_OBJECT_PENALTY = 15;

  analyze(graph: DependencyGraph): SpaghettMetrics {
    const circularDeps = this.findCircularDependencies(graph);
    const godObjects = this.findGodObjects(graph);
    const longFiles = this.findLongFiles(graph);
    const deepNesting = this.findDeepNesting(graph);
    const deadCode = this.findDeadCode(graph);

    let score = 0;
    score += circularDeps.length * this.CIRCULAR_DEATH_PENALTY;
    score += godObjects.length * this.GOD_OBJECT_PENALTY;
    
    longFiles.forEach(f => {
      score += Math.ceil(f.lines / this.MAX_FILE_LINES) * 5;
    });

    deepNesting.forEach(() => {
      score += 3;
    });

    deadCode.forEach(() => {
      score += 1;
    });

    return {
      score: Math.min(score, 100),
      circularDeps,
      godObjects,
      longFiles,
      deepNesting,
      deadCode,
    };
  }

  private findCircularDependencies(graph: DependencyGraph): CircularDep[] {
    const cycles: CircularDep[] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const cycleKeys = new Set<string>();

    const dfs = (node: string, path: string[]) => {
      if (recursionStack.has(node)) {
        const cycleStart = path.indexOf(node);
        const rawCycle = path.slice(cycleStart);
        
        // Canonical lexical minimum rotation to avoid duplicates (e.g. A->B->A vs B->A->B)
        const rotatedCycle = this.getCanonicalRotation(rawCycle);
        const cycleKey = rotatedCycle.join(' -> ');
        
        if (!cycleKeys.has(cycleKey)) {
          cycleKeys.add(cycleKey);
          cycles.push({ cycle: rotatedCycle, length: rotatedCycle.length });
        }
        return;
      }
      if (visited.has(node)) return;

      visited.add(node);
      recursionStack.add(node);
      path.push(node);

      const edges = graph.edges.get(node) || [];
      for (const neighbor of edges) {
        dfs(neighbor, [...path]);
      }

      recursionStack.delete(node);
    };

    for (const node of graph.nodes.keys()) {
      dfs(node, []);
    }

    return cycles;
  }

  private getCanonicalRotation(cycle: string[]): string[] {
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

  private findGodObjects(graph: DependencyGraph): GodObject[] {
    const gods: GodObject[] = [];
    for (const [nodeId, reverseEdges] of graph.reverse.entries()) {
      if (reverseEdges.length >= this.GOD_OBJECT_THRESHOLD) {
        gods.push({
          path: nodeId,
          importedByCount: reverseEdges.length,
          importedBy: reverseEdges,
          suggestion: `🚨 God Object detected. Split into ${Math.ceil(reverseEdges.length / 5)} separate modules by business concern.`,
        });
      }
    }
    return gods;
  }

  private findLongFiles(graph: DependencyGraph): FileMetrics[] {
    const longFiles: FileMetrics[] = [];
    for (const [_, node] of graph.nodes.entries()) {
      if (node.lines > this.MAX_FILE_LINES) {
        longFiles.push({
          path: node.path,
          lines: node.lines,
          threshold: this.MAX_FILE_LINES,
          suggestion: `🍝 File is too long (${node.lines} lines). Extract modules into at least ${Math.ceil(node.lines / 300)} smaller files.`,
        });
      }
    }
    return longFiles;
  }

  private findDeepNesting(graph: DependencyGraph): NestingIssue[] {
    const issues: NestingIssue[] = [];
    // AST nesting depth analysis placeholder (completed in Phase 2)
    return issues;
  }

  private findDeadCode(graph: DependencyGraph): DeadCode[] {
    const dead: DeadCode[] = [];
    
    // Find unused exports: exports that are never imported by any other file
    const allImports = new Set<string>();
    for (const [_, node] of graph.nodes.entries()) {
      node.imports.forEach(imp => {
        imp.specifiers.forEach(spec => {
          allImports.add(`${imp.resolvedPath || imp.source}:${spec}`);
        });
      });
    }

    for (const [nodeId, node] of graph.nodes.entries()) {
      node.exports.forEach(exp => {
        // Skip default or wildcards
        if (exp.name === '*' || exp.name === 'default') return;
        
        const key = `${nodeId}:${exp.name}`;
        if (!allImports.has(key)) {
          dead.push({
            path: node.path,
            name: exp.name,
            type: 'export',
            line: 1
          });
        }
      });
    }

    return dead;
  }
}
