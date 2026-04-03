import { DependencyGraph, SpaghettMetrics, CircularDependency, GodObject, DeadCode, TangledLogic, WildcardImport, ExcessiveGlobals, MissingTypeHints } from './types';

export class SpaghettOMeter {
  
  analyze(graph: DependencyGraph): SpaghettMetrics {
    const circularDeps = this.findCircularDependencies(graph);
    const godObjects = this.findGodObjects(graph);
    const deadCode = this.findDeadCode(graph);
    const longFiles = this.findLongFiles(graph);

    const wildcardImports = this.findWildcardImports(graph);
    const excessiveGlobals = this.findExcessiveGlobals(graph);
    const missingTypeHints = this.findMissingTypeHints(graph);

    let baseScore = 100;
    baseScore -= (circularDeps.length * 5);
    baseScore -= (godObjects.length * 3);
    baseScore -= (longFiles.length * 2);
    baseScore -= (deadCode.length * 1);
    baseScore -= (wildcardImports.length * 2);
    baseScore -= (excessiveGlobals.length * 2);
    baseScore -= (missingTypeHints.length * 1);
    
    return {
      totalFiles: graph.nodes.size,
      totalDependencies: Array.from(graph.edges.values()).reduce((a, b) => a + b.length, 0),
      circularDeps,
      godObjects,
      deadCode,
      longFiles,
      wildcardImports,
      excessiveGlobals,
      missingTypeHints,
      score: Math.max(0, baseScore)
    };
  }

  private findCircularDependencies(graph: DependencyGraph): CircularDependency[] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const path: string[] = [];

    const dfs = (nodeId: string) => {
      visited.add(nodeId);
      recursionStack.add(nodeId);
      path.push(nodeId);

      const neighbors = graph.edges.get(nodeId) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          dfs(neighbor);
        } else if (recursionStack.has(neighbor)) {
          const cycleStart = path.indexOf(neighbor);
          const cycle = [...path.slice(cycleStart), neighbor];
          
          const cycleHash = [...cycle].sort().join(',');
          if (!cycles.some(c => [...c].sort().join(',') === cycleHash)) {
             cycles.push(cycle);
          }
        }
      }

      recursionStack.delete(nodeId);
      path.pop();
    };

    for (const nodeId of graph.nodes.keys()) {
      if (!visited.has(nodeId)) {
         dfs(nodeId);
      }
    }

    return cycles.map(cycle => ({
      type: 'Circular Dependency',
      severity: 'high',
      path: cycle.join(' -> '),
      description: `Circular dependency detected between ${cycle.length - 1} files.`,
      suggestion: 'Extract shared logic to a new neutral module.',
      cycle
    }));
  }

  private findGodObjects(graph: DependencyGraph): GodObject[] {
    const godObjects: GodObject[] = [];
    const threshold = 5;

    for (const [nodeId, incoming] of graph.reverse.entries()) {
      if (incoming.length >= threshold) {
        godObjects.push({
          type: 'God Object',
          severity: incoming.length > 10 ? 'high' : 'medium',
          path: nodeId,
          description: `File is imported by ${incoming.length} other files, indicating it might be a God Object or overly coupled utility.`,
          suggestion: 'Split into smaller, single-responsibility files.',
          importedByCount: incoming.length
        });
      }
    }
    return godObjects.sort((a,b) => b.importedByCount - a.importedByCount);
  }

  private findDeadCode(graph: DependencyGraph): DeadCode[] {
    const deadCode: DeadCode[] = [];
    let hasEntry = false;
    
    // Naive entry point detection - root files
    for (const id of graph.nodes.keys()) {
       if (!id.includes('/')) hasEntry = true;
       if (id.includes('index') || id.includes('main') || id.includes('app') || id.includes('route') || id.includes('page')) {
           hasEntry = true;
       }
    }
    
    if (!hasEntry) return []; // If we can't guess entry points, don't report dead code.

    for (const [nodeId, incoming] of graph.reverse.entries()) {
       if (incoming.length === 0) {
           // Might be an entry point. Check heuristics
           const isEntryPoint = nodeId.includes('index') || nodeId.includes('main') || nodeId.includes('layout') || nodeId.includes('page') || nodeId.includes('route');
           if (!isEntryPoint && !nodeId.includes('test') && !nodeId.includes('config')) {
               deadCode.push({
                  type: 'Dead Code',
                  severity: 'low',
                  path: nodeId,
                  description: 'This file has no incoming imports and is not a recognized entry point.',
                  suggestion: 'Verify if this file is dynamically imported or delete it.'
               });
           }
       }
    }
    return deadCode;
  }

  private findLongFiles(graph: DependencyGraph): TangledLogic[] {
     const issues: TangledLogic[] = [];
     for (const [id, node] of graph.nodes.entries()) {
        if (node.lines > 300) {
           issues.push({
               type: 'Tangled Logic (Long File)',
               severity: node.lines > 500 ? 'high' : 'medium',
               path: id,
               description: `File contains ${node.lines} lines, exceeding the 300 line threshold.`,
               suggestion: 'Refactor into smaller functions or extract classes/components.'
           });
        }
     }
     return issues;
  }

  private findWildcardImports(graph: DependencyGraph): WildcardImport[] {
     const issues: WildcardImport[] = [];
     for (const [id, node] of graph.nodes.entries()) {
        if (node.language === 'py') {
           const wildcardRegex = /^from\s+[a-zA-Z0-9_.]+\s+import\s+\*/gm;
           if (wildcardRegex.test(node.content)) {
               issues.push({
                   type: 'Wildcard Import',
                   severity: 'medium',
                   path: id,
                   description: `File contains wildcard imports (from ... import *), which clutters the namespace.`,
                   suggestion: 'Import specific functions or classes instead.'
               });
           }
        }
     }
     return issues;
  }

  private findExcessiveGlobals(graph: DependencyGraph): ExcessiveGlobals[] {
     const issues: ExcessiveGlobals[] = [];
     for (const [id, node] of graph.nodes.entries()) {
        if (node.language === 'py') {
           const globalRegex = /^\s*global\s+[a-zA-Z0-9_]+/gm;
           const matches = node.content.match(globalRegex);
           if (matches && matches.length > 3) {
               issues.push({
                   type: 'Excessive Globals',
                   severity: 'high',
                   path: id,
                   description: `File uses the 'global' keyword ${matches.length} times, indicating poor state management.`,
                   suggestion: 'Encapsulate state within classes or pass variables explicitly.',
                   count: matches.length
               });
           }
        }
     }
     return issues;
  }

  private findMissingTypeHints(graph: DependencyGraph): MissingTypeHints[] {
     const issues: MissingTypeHints[] = [];
     for (const [id, node] of graph.nodes.entries()) {
        if (node.language === 'py' && node.lines > 100) {
           const defRegex = /^\s*(?:async\s+)?def\s+[a-zA-Z0-9_]+\s*\(/gm;
           const defMatches = node.content.match(defRegex) || [];
           if (defMatches.length > 5) {
               const hintRegex = /->\s*[a-zA-Z0-9_\[\]\|"']+/g;
               const hintMatches = node.content.match(hintRegex) || [];
               
               if (hintMatches.length < (defMatches.length / 4)) {
                   issues.push({
                       type: 'Missing Type Hints',
                       severity: 'medium',
                       path: id,
                       description: `Large file (${node.lines} lines) defines ${defMatches.length} functions but uses fewer than ${Math.floor(defMatches.length/4)} return type hints.`,
                       suggestion: 'Add type hints to improve readability and tooling support.'
                   });
               }
           }
        }
     }
     return issues;
  }
}
