export interface Import {
  source: string;
  isRelative: boolean;
  resolvedPath?: string;
  isExternal?: boolean;
}

export interface Export {
  name: string;
  isReExport?: boolean;
}

export interface FileNode {
  id: string;
  path: string;
  content: string;
  imports: Import[];
  exports: Export[];
  lines: number;
  size: number;
  language: 'js' | 'ts' | 'jsx' | 'tsx' | 'py';
}

export interface DependencyGraph {
  nodes: Map<string, FileNode>;
  edges: Map<string, string[]>;
  reverse: Map<string, string[]>;
}

export interface Issue {
  type: string;
  severity: 'low' | 'medium' | 'high';
  path: string;
  description: string;
  suggestion: string;
}

export interface CircularDependency extends Issue {
  type: 'Circular Dependency';
  cycle: string[];
}

export interface GodObject extends Issue {
  type: 'God Object';
  importedByCount: number;
}

export interface DeadCode extends Issue {
  type: 'Dead Code';
}

export interface TangledLogic extends Issue {
  type: 'Tangled Logic (Long File)';
}

export interface WildcardImport extends Issue {
  type: 'Wildcard Import';
}

export interface ExcessiveGlobals extends Issue {
  type: 'Excessive Globals';
  count: number;
}

export interface MissingTypeHints extends Issue {
  type: 'Missing Type Hints';
}

export interface SpaghettMetrics {
  totalFiles: number;
  totalDependencies: number;
  circularDeps: CircularDependency[];
  godObjects: GodObject[];
  deadCode: DeadCode[];
  longFiles: TangledLogic[];
  wildcardImports: WildcardImport[];
  excessiveGlobals: ExcessiveGlobals[];
  missingTypeHints: MissingTypeHints[];
  score: number;
}

export interface Report {
  timestamp: string;
  projectPath: string;
  metrics: SpaghettMetrics;
  filesScanned: number;
  totalLines: number;
  rawGraph: any;
  summary: {
    circularDepCount: number;
    godObjectCount: number;
    longFileCount: number;
    deadCodeCount: number;
    wildcardImportCount: number;
    excessiveGlobalsCount: number;
    missingTypeHintsCount: number;
  };
}
