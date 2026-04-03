import { FileNode, Import, Export } from './types';

export class GraphBuilder {
  private graph = {
    nodes: new Map<string, FileNode>(),
    edges: new Map<string, string[]>(),
    reverse: new Map<string, string[]>(),
  };

  addNode(fileNode: FileNode): void {
    this.graph.nodes.set(fileNode.id, fileNode);
    if (!this.graph.edges.has(fileNode.id)) {
      this.graph.edges.set(fileNode.id, []);
    }
    if (!this.graph.reverse.has(fileNode.id)) {
      this.graph.reverse.set(fileNode.id, []);
    }
  }

  addEdge(from: string, to: string): void {
    if (!this.graph.edges.has(from)) this.graph.edges.set(from, []);
    if (!this.graph.reverse.has(to)) this.graph.reverse.set(to, []);
    
    // Check for duplicates before pushing
    if (!this.graph.edges.get(from)!.includes(to)) {
      this.graph.edges.get(from)!.push(to);
    }
    if (!this.graph.reverse.get(to)!.includes(from)) {
      this.graph.reverse.get(to)!.push(from);
    }
  }

  build() {
    return this.graph;
  }
}
