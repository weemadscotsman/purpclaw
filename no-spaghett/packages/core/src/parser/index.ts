import { FileNode, DependencyGraph } from '../types.js';

export interface Parser {
  language: string;
  canParse(filePath: string): boolean;
  parse(filePath: string, content: string): Omit<FileNode, 'id' | 'lines' | 'size'>;
}

export class ParserRegistry {
  private parsers: Parser[] = [];

  register(parser: Parser): void {
    this.parsers.push(parser);
  }

  getParser(filePath: string): Parser | null {
    return this.parsers.find(p => p.canParse(filePath)) || null;
  }
}

export class GraphBuilder {
  private graph: DependencyGraph = {
    nodes: new Map(),
    edges: new Map(),
    reverse: new Map(),
  };

  addNode(fileNode: FileNode): void {
    this.graph.nodes.set(fileNode.id, fileNode);
    this.graph.edges.set(fileNode.id, []);
    this.graph.reverse.set(fileNode.id, []);
  }

  addEdge(from: string, to: string): void {
    if (!this.graph.edges.has(from)) this.graph.edges.set(from, []);
    if (!this.graph.reverse.has(to)) this.graph.reverse.set(to, []);
    
    // Deduplicate edges
    const currentEdges = this.graph.edges.get(from)!;
    if (!currentEdges.includes(to)) {
      currentEdges.push(to);
    }

    const currentReverse = this.graph.reverse.get(to)!;
    if (!currentReverse.includes(from)) {
      currentReverse.push(from);
    }
  }

  build(): DependencyGraph {
    return this.graph;
  }
}
