// No Spaghett — Core Types
// Non-spaghetti starts here.

export interface FileNode {
  id: string;              // Absolute path or relative id
  path: string;            // File path
  content?: string;        // Raw content (optional, for analysis)
  imports: Import[];
  exports: Export[];
  lines: number;
  size: number;            // Bytes
  language: 'js' | 'ts' | 'jsx' | 'tsx';
}

export interface Import {
  source: string;          // Module name or relative path
  type: 'named' | 'default' | 'namespace' | 'dynamic' | 'commonjs';
  specifiers: string[];    // What's being imported
  isRelative: boolean;
  resolvedPath?: string;   // After resolution
}

export interface Export {
  name: string;
  type: 'named' | 'default' | 'reExport';
  source?: string;         // For re-exports (export * from 'x')
  localName?: string;      // export { x as y }
}

export interface DependencyGraph {
  nodes: Map<string, FileNode>;
  edges: Map<string, string[]>;  // from -> [to]
  reverse: Map<string, string[]>; // to -> [from]
}

export interface SpaghettMetrics {
  score: number;                    // 0-100
  circularDeps: CircularDep[];
  godObjects: GodObject[];
  longFiles: FileMetrics[];
  deepNesting: NestingIssue[];
  deadCode: DeadCode[];
}

export interface CircularDep {
  cycle: string[];          // Paths in cycle
  length: number;
}

export interface GodObject {
  path: string;
  importedByCount: number;
  importedBy: string[];
  suggestion: string;       // How to break it down
}

export interface FileMetrics {
  path: string;
  lines: number;
  threshold: number;        // e.g., 1000
  suggestion: string;
}

export interface NestingIssue {
  path: string;
  line: number;
  depth: number;
}

export interface DeadCode {
  path: string;
  name: string;
  type: 'import' | 'export' | 'variable' | 'function';
  line: number;
}

export interface Report {
  timestamp: string;
  projectPath: string;
  metrics: SpaghettMetrics;
  filesScanned: number;
  totalLines: number;
  summary: {
    circularDepCount: number;
    godObjectCount: number;
    longFileCount: number;
    deadCodeCount: number;
  };
}
