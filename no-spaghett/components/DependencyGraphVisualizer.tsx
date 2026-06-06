'use client';

import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Activity, X, Filter } from 'lucide-react';

const ForceGraph3D = dynamic(() => import('react-force-graph-3d'), { ssr: false });

interface GraphVisualizerProps {
  graph: any;
  metrics?: any;
}

export function DependencyGraphVisualizer({ graph, metrics }: GraphVisualizerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [highlightNodes, setHighlightNodes] = useState(new Set());
  const [highlightLinks, setHighlightLinks] = useState(new Set());
  const [showFilters, setShowFilters] = useState(false);
  
  const [filters, setFilters] = useState({
    godObjects: true,
    circularDeps: true,
    longFiles: true,
    deadCode: true,
    healthy: true,
  });

  useEffect(() => {
    if (!containerRef.current) return;
    
    const resizeObserver = new ResizeObserver(entries => {
      if (!entries.length) return;
      const { width, height } = entries[0].contentRect;
      setDimensions({ width, height });
    });
    
    resizeObserver.observe(containerRef.current);
    
    return () => resizeObserver.disconnect();
  }, []);

  const graphData = useMemo(() => {
    if (!graph) return { nodes: [], links: [] };

    let edgesMap = graph.edges;
    let nodesMap = graph.nodes;

    if (Array.isArray(edgesMap)) {
      edgesMap = new Map(edgesMap);
    }
    if (Array.isArray(nodesMap)) {
      nodesMap = new Map(nodesMap);
    }

    const links: any[] = [];
    const nodes: any[] = [];
    const nodeSet = new Set<string>();

    let godObjectPaths = new Set(metrics?.godObjects?.map((x: any) => x.path) || []);
    let circularDepPaths = new Set(metrics?.circularDeps?.flatMap((x: any) => x.cycle) || []);
    let longFilePaths = new Set(metrics?.longFiles?.map((x: any) => x.path) || []);
    let deadCodePaths = new Set(metrics?.deadCode?.map((x: any) => x.path) || []);

    if (nodesMap instanceof Map) {
      nodesMap.forEach((_, id) => nodeSet.add(id));
    }
    
    if (edgesMap instanceof Map) {
      edgesMap.forEach((targets: string[], source: string) => {
        nodeSet.add(source);
        targets.forEach((target: string) => {
          nodeSet.add(target);
          links.push({ source, target, id: `${source}-${target}` });
        });
      });
    }

    nodeSet.forEach(id => {
      let size = 3;
      let language = 'unknown';
      let lines = 0;
      let group = id.includes('node_modules') ? 2 : 1;

      if (nodesMap instanceof Map && nodesMap.has(id)) {
         const nodeData = nodesMap.get(id);
         lines = nodeData.lines || 100;
         size = Math.max(2, Math.min(10, lines / 50));
         language = nodeData.language || 'unknown';
      }
      
      const issues: string[] = [];
      if (godObjectPaths.has(id)) issues.push('godObjects');
      if (circularDepPaths.has(id)) issues.push('circularDeps');
      if (longFilePaths.has(id)) issues.push('longFiles');
      if (deadCodePaths.has(id)) issues.push('deadCode');

      nodes.push({ 
          id, 
          size, 
          group,
          val: size,
          name: id.split('/').pop() || id,
          path: id,
          lines,
          language,
          issues
      });
    });

    const filteredNodes = nodes.filter(node => {
        if (node.issues.length === 0) return filters.healthy;
        return node.issues.some((issue: string) => (filters as any)[issue]);
    });
    const validNodeIds = new Set(filteredNodes.map(n => n.id));
    const filteredLinks = links.filter(link => {
        const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
        const targetId = typeof link.target === 'object' ? link.target.id : link.target;
        return validNodeIds.has(sourceId) && validNodeIds.has(targetId);
    });

    return { nodes: filteredNodes, links: filteredLinks };
  }, [graph, metrics, filters]);

  const updateHighlight = () => {
      setHighlightNodes(highlightNodes);
      setHighlightLinks(highlightLinks);
  };

  const handleNodeClick = useCallback((node: any) => {
      const neighbors = new Set<string>();
      const links = new Set<string>();
      neighbors.add(node.id);
      
      graphData.links.forEach((link: any) => {
          const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
          const targetId = typeof link.target === 'object' ? link.target.id : link.target;
          
          if (sourceId === node.id) {
              neighbors.add(targetId);
              links.add(link.id || `${sourceId}-${targetId}`);
          }
          if (targetId === node.id) {
              neighbors.add(sourceId);
              links.add(link.id || `${sourceId}-${targetId}`);
          }
      });
      
      setHighlightNodes(neighbors);
      setHighlightLinks(links);
      setSelectedNode(node);
  }, [graphData]);

  const handleBackgroundClick = useCallback(() => {
      setHighlightNodes(new Set());
      setHighlightLinks(new Set());
      setSelectedNode(null);
  }, []);

  if (dimensions.width === 0 || dimensions.height === 0) {
      return <div ref={containerRef} className="w-full h-[600px] relative bg-black"></div>;
  }

  return (
    <div ref={containerRef} className="w-full h-[600px] relative bg-[#0a0a0a]">
      {selectedNode && (
          <div className="absolute top-4 left-4 z-10 bg-white/10 backdrop-blur-md p-4 text-white font-mono text-sm border-2 border-white/20 max-w-sm pointer-events-auto rounded shadow-2xl">
              <button 
                onClick={(e) => { e.stopPropagation(); handleBackgroundClick(); }}
                className="absolute top-2 right-2 text-white/60 hover:text-white"
              >
                 <X className="w-4 h-4" />
              </button>
              <h3 className="font-bold text-lg text-orange-400 mb-1 leading-tight word-break truncate" title={selectedNode.name}>
                 {selectedNode.name}
              </h3>
              <p className="text-xs opacity-60 mb-3 break-all">{selectedNode.path}</p>
              
              <div className="grid grid-cols-2 gap-2 text-xs">
                 <div className="bg-black/30 p-2 rounded">
                    <span className="opacity-60 block">Lines</span>
                    <span className="font-bold">{selectedNode.lines}</span>
                 </div>
                 <div className="bg-black/30 p-2 rounded">
                    <span className="opacity-60 block">Type</span>
                    <span className="font-bold uppercase">{selectedNode.language || 'EXT'}</span>
                 </div>
              </div>

              <div className="mt-3">
                 <span className="opacity-60 block mb-1">Direct Neighbors</span>
                 <span className="font-bold">{highlightNodes.size - 1} connected files</span>
              </div>
          </div>
      )}

      {/* Filter Sidebar */}
      <div className="absolute top-4 right-4 z-10">
        <button 
          onClick={() => setShowFilters(!showFilters)}
          className="bg-black text-white p-2 border-2 border-white/20 hover:bg-orange-500 transition-colors shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)]"
        >
          <Filter className="w-5 h-5" />
        </button>
        {showFilters && (
          <div className="mt-2 bg-black/80 backdrop-blur-md p-4 text-white font-mono text-sm border-2 border-white/20 w-48 shadow-2xl">
            <h3 className="font-bold text-orange-400 mb-3 border-b border-white/20 pb-1">Filters</h3>
            <div className="flex flex-col gap-2">
              {Object.entries(filters).map(([key, val]) => {
                const labels: Record<string, string> = {
                  godObjects: 'God Objects',
                  circularDeps: 'Circular Dependencies',
                  longFiles: 'Tangled Logic',
                  deadCode: 'Dead Code',
                  healthy: 'Healthy Files'
                };
                return (
                <label key={key} className="flex items-center gap-2 cursor-pointer opacity-80 hover:opacity-100">
                  <input 
                    type="checkbox" 
                    checked={val} 
                    onChange={() => setFilters(prev => ({ ...prev, [key]: !prev[key as keyof typeof filters]}))}
                    className="accent-orange-500"
                  />
                  <span className="capitalize">{labels[key]}</span>
                </label>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <ForceGraph3D
        width={dimensions.width}
        height={dimensions.height}
        graphData={graphData}
        nodeLabel="path"
        nodeColor={(node: any) => {
            if (highlightNodes.size === 0) return node.group === 2 ? '#666' : '#f97316';
            if (highlightNodes.has(node.id)) {
                return node === selectedNode ? '#fff' : '#f97316';
            }
            return '#222'; // Dim unhighlighted
        }}
        nodeRelSize={6}
        nodeVal="val"
        linkOpacity={0.3}
        linkWidth={(link: any) => highlightLinks.has(link.id || `${typeof link.source === 'object' ? link.source.id : link.source}-${typeof link.target === 'object' ? link.target.id : link.target}`) ? 2 : 0.5}
        linkColor={(link: any) => {
             const linkId = link.id || `${typeof link.source === 'object' ? link.source.id : link.source}-${typeof link.target === 'object' ? link.target.id : link.target}`;
             if (highlightLinks.size === 0) return '#444';
             return highlightLinks.has(linkId) ? '#f97316' : '#111';
        }}
        linkDirectionalArrowLength={3.5}
        linkDirectionalArrowRelPos={1}
        onNodeClick={handleNodeClick}
        onBackgroundClick={handleBackgroundClick}
        enableNodeDrag={false}
        backgroundColor="#050505"
      />
      
      <div className="absolute bottom-4 right-4 pointer-events-none text-white/30 font-mono text-xs text-right">
          <p>Left Click + Drag to Rotate</p>
          <p>Scroll to Zoom</p>
          <p>Click Node for Insights</p>
      </div>
    </div>
  );
}
