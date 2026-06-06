"use client";

import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FolderUp, Code2, AlertTriangle, CheckCircle2, Activity, ArrowRight, XCircle } from 'lucide-react';
import { parseSource, buildProjectGraph } from '@/lib/spaghetti/parser';
import { SpaghettOMeter } from '@/lib/spaghetti/meter';
import { SpaghettMetrics, Report } from '@/lib/spaghetti/types';
import { DependencyGraphVisualizer } from '@/components/DependencyGraphVisualizer';

interface RefactoringLogEntry {
  id: string;
  timestamp: string;
  target: string;
  issueType: string;
  suggestion: string;
}

export default function NoSpaghettApp() {
  const [analyzing, setAnalyzing] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [sourceFiles, setSourceFiles] = useState<{path: string; content: string}[]>([]);
  const [gitUrl, setGitUrl] = useState('');
  const [refacting, setRefactoring] = useState<string | null>(null);
  const [architecting, setArchitecting] = useState<boolean>(false);
  const [refactorSuggestion, setRefactorSuggestion] = useState<string | null>(null);
  const [refactoringLogs, setRefactoringLogs] = useState<RefactoringLogEntry[]>([]);
  const [exorcismQueue, setExorcismQueue] = useState<{path: string, issueType: string}[]>([]);
  const [processingQueue, setProcessingQueue] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggleQueueItem = (path: string, issueType: string) => {
    setExorcismQueue(prev => {
      const exists = prev.find(item => item.path === path && item.issueType === issueType);
      if (exists) {
        return prev.filter(item => !(item.path === path && item.issueType === issueType));
      } else {
        return [...prev, { path, issueType }];
      }
    });
  };

  const isInQueue = (path: string, issueType: string) => {
    return exorcismQueue.some(item => item.path === path && item.issueType === issueType);
  };

  const handleQueueExorcism = async () => {
    if (exorcismQueue.length === 0 || !report) return;
    setProcessingQueue(true);
    
    try {
      const queuedFilesData = exorcismQueue.map(q => {
        let content = 'Content unavailable';
        const file = sourceFiles.find(f => f.path.endsWith(q.path) || f.path === q.path);
        if (file) {
           content = file.content;
        }
        return {
          path: q.path,
          issueType: q.issueType,
          content
        };
      });

      const res = await fetch('/api/refactor', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ 
           issueType: 'Automated Queue', 
           queue: queuedFilesData 
         })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      
      setRefactorSuggestion(data.suggestion);
      setRefactoringLogs(prev => [{
          id: Date.now().toString(),
          timestamp: new Date().toISOString(),
          target: `${exorcismQueue.length} Queued Issues`,
          issueType: 'Automated Queue',
          suggestion: data.suggestion
      }, ...prev]);
      
      setExorcismQueue([]);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setProcessingQueue(false);
    }
  };

  const handleFolderSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    setAnalyzing(true);
    setReport(null);

    try {
      const allowedExts = /\.(js|ts|jsx|tsx|py)$/;
      const filesArr: { path: string; content: string }[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (allowedExts.test(file.name) && !file.webkitRelativePath.includes('node_modules') && !file.webkitRelativePath.includes('dist') && !file.webkitRelativePath.includes('.next') && !file.webkitRelativePath.includes('.venv')) {
          const content = await file.text();
          filesArr.push({ path: file.webkitRelativePath || file.name, content });
        }
      }

      if (filesArr.length === 0) {
        alert("No valid source files found (.js, .ts, .jsx, .tsx, .py). Avoided node_modules.");
        setAnalyzing(false);
        return;
      }
      setSourceFiles(filesArr);

      setTimeout(() => {
        const graph = buildProjectGraph(filesArr);
        const meter = new SpaghettOMeter();
        const metrics = meter.analyze(graph);

        const totalLines = filesArr.reduce((acc, f) => acc + f.content.split('\n').length, 0);

        setReport({
          timestamp: new Date().toISOString(),
          projectPath: filesArr[0].path.split('/')[0],
          metrics,
          filesScanned: filesArr.length,
          totalLines,
          rawGraph: graph,
          summary: {
            circularDepCount: metrics.circularDeps.length,
            godObjectCount: metrics.godObjects.length,
            longFileCount: metrics.longFiles.length,
            deadCodeCount: metrics.deadCode.length,
            wildcardImportCount: metrics.wildcardImports.length,
            excessiveGlobalsCount: metrics.excessiveGlobals.length,
            missingTypeHintsCount: metrics.missingTypeHints.length,
          }
        });

        setAnalyzing(false);
      }, 1500);

    } catch (err) {
      console.error(err);
      setAnalyzing(false);
    }
  };

  const handleGitIngest = async () => {
      if (!gitUrl) return;
      setAnalyzing(true);
      setReport(null);
      
      try {
          const res = await fetch('/api/analyze-git', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ repoUrl: gitUrl })
          });
          
          if (!res.ok) {
              const data = await res.json();
              throw new Error(data.error || 'Failed to analyze git repo');
          }
          
          const reportData = await res.json();
          setReport(reportData);
          if (reportData.sourceFiles) {
              setSourceFiles(reportData.sourceFiles);
          }
      } catch (err: any) {
          alert(err.message);
      } finally {
          setAnalyzing(false);
      }
  };

  const handleFix = async (path: string, issueType: string) => {
      const file = sourceFiles.find(f => f.path.endsWith(path) || f.path === path);
      if (!file) {
          alert('Source code not available for this file (Git ingested repos do not transfer full source to client).');
          return;
      }

      setRefactoring(path);
      try {
           const res = await fetch('/api/refactor', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ filePath: file.path, issueType, fileContent: file.content })
          });
          const data = await res.json();
          if (data.error) throw new Error(data.error);
          setRefactorSuggestion(data.suggestion);
          setRefactoringLogs(prev => [{
              id: Date.now().toString(),
              timestamp: new Date().toISOString(),
              target: path,
              issueType,
              suggestion: data.suggestion
          }, ...prev]);
      } catch (err: any) {
           alert(err.message);
      } finally {
           setRefactoring(null);
      }
  };

  const handleArchitectureSuggestion = async () => {
    if (!report) return;
    setArchitecting(true);
    try {
      // Just passing summary + metrics stringified up to API to avoid extreme token usage.
      const graphData = {
        summary: report.summary,
        metrics: {
          ...report.metrics,
          circularDeps: report.metrics.circularDeps,
          godObjects: report.metrics.godObjects,
          longFiles: report.metrics.longFiles.map((x: any) => x.path),
          deadCode: report.metrics.deadCode.map((x: any) => x.path),
        }
      };

      const res = await fetch('/api/refactor', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ 
           issueType: 'Architecture Suggestion', 
           graphData 
         })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setRefactorSuggestion(data.suggestion);
      setRefactoringLogs(prev => [{
          id: Date.now().toString(),
          timestamp: new Date().toISOString(),
          target: 'Entire Project',
          issueType: 'Architecture Suggestion',
          suggestion: data.suggestion
      }, ...prev]);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setArchitecting(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score <= 20) return 'text-green-600';
    if (score <= 50) return 'text-yellow-500';
    if (score <= 80) return 'text-orange-500';
    return 'text-red-600';
  };

  const exportConfession = () => {
    if (!report) return;
    
    let md = `# System Confession — Project: ${report.projectPath}\n\n`;
    md += `**Score:** ${report.metrics.score}/100\n`;
    md += `**Files Scanned:** ${report.filesScanned}\n`;
    md += `**Lines of Code:** ${report.totalLines}\n\n`;
    
    md += `## Sins:\n`;
    if (report.metrics.circularDeps.length > 0) md += `- ${report.metrics.circularDeps.length} circular dependencies (prayer wheels)\n`;
    if (report.metrics.godObjects.length > 0) md += `- ${report.metrics.godObjects.length} god objects (absorbing responsibilities)\n`;
    if (report.metrics.longFiles.length > 0) md += `- ${report.metrics.longFiles.length} tangled logic files (spaghetti labyrinths)\n`;
    if (report.metrics.deadCode.length > 0) md += `- Dead code: ${report.metrics.deadCode.length} files (sleeping, not dead)\n`;
    if (report.metrics.wildcardImports && report.metrics.wildcardImports.length > 0) md += `- ${report.metrics.wildcardImports.length} wildcard imports (namespace pollution)\n`;
    if (report.metrics.excessiveGlobals && report.metrics.excessiveGlobals.length > 0) md += `- ${report.metrics.excessiveGlobals.length} instances of excessive globals (summoned chaos)\n`;
    if (report.metrics.missingTypeHints && report.metrics.missingTypeHints.length > 0) md += `- ${report.metrics.missingTypeHints.length} files missing type hints (unbound entities)\n`;
    if (report.metrics.score > 80) md += `- No major sins found. A rare purity.\n`;
    
    md += `\n## Penance:\n`;
    if (report.metrics.godObjects.length > 0) md += `- Run exorcise on ${report.metrics.godObjects[0].path.split('/').pop()} --strategy split_by_domain\n`;
    if (report.metrics.circularDeps.length > 0) md += `- Break circular imports by extracting shared event buses.\n`;
    if (report.metrics.godObjects.length === 0 && report.metrics.circularDeps.length === 0 && report.metrics.score <= 80) md += `- Review sleeping processes and untangle logic loops.\n`;
    if (report.metrics.score > 80) md += `- Maintain vigilance.\n`;
    
    md += `\n## Blessing:\n`;
    md += `_May your imports be direct and your event loops shallow. GOOP._\n\n`;
    md += `**Absolution:** ${report.metrics.score > 80 ? 'Granted' : 'Pending (Exorcism Required)'}\n`;
    
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `confession-${report.projectPath.replace(/\//g, '-')}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen font-sans bg-[#f4f4f0] selection:bg-orange-500 selection:text-white pb-20">
      <header className="border-b-4 border-black p-4 sm:p-6 bg-white sticky top-0 z-10 shadow-[0_4px_0_0_rgba(0,0,0,1)]">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
             <div className="bg-orange-500 p-2 border-2 border-black">
                <AlertTriangle className="w-6 h-6 text-black" />
             </div>
             <div>
               <h1 className="text-2xl font-black uppercase text-black tracking-tight leading-none">No Spaghett</h1>
               <p className="text-xs font-mono font-bold text-black opacity-60">Code Smell Analyzer</p>
             </div>
          </div>
          {report && (
            <button 
              onClick={() => setReport(null)}
              className="bg-black text-white font-black uppercase text-sm px-4 py-2 hover:bg-orange-500 hover:text-black transition-colors border-2 border-black"
            >
              Analyze Another
            </button>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-12">
        <AnimatePresence mode="wait">
          {!report && !analyzing && (
            <motion.div 
              key="upload"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="mt-16 max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8"
            >
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="group relative flex flex-col items-center justify-center p-12 border-4 border-black bg-white hover:bg-orange-400 transition-colors shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] cursor-pointer h-full"
              >
                <FolderUp className="w-16 h-16 text-black group-hover:-translate-y-2 transition-transform duration-300 mb-6" />
                <h3 className="text-2xl font-black uppercase text-black mb-2 text-center">Local Codebase</h3>
                <p className="text-black font-mono font-bold text-center text-sm mb-8 opacity-80">
                  Select a local folder. Analyzed securely in your browser.
                </p>
                <div className="text-xs font-mono px-3 py-1 bg-black text-white font-bold uppercase shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] mt-auto">
                  JS / TS / PY
                </div>
                
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFolderSelect}
                  className="hidden"
                  // @ts-ignore - webkitdirectory is non-standard but works in most modern browsers
                  webkitdirectory="true"
                  directory="true"
                  multiple
                />
              </div>

              <div className="flex flex-col items-center justify-center p-12 border-4 border-black bg-white shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] h-full">
                 <Code2 className="w-16 h-16 text-black mb-6" />
                 <h3 className="text-2xl font-black uppercase text-black mb-2 text-center">GitHub Repo</h3>
                 <p className="text-black font-mono font-bold text-center text-sm mb-6 opacity-80">
                  Paste a public repo URL to pull & analyze default branch.
                 </p>
                 <div className="flex flex-col w-full gap-3 mt-auto">
                    <input 
                       type="url"
                       placeholder="https://github.com/owner/repo"
                       value={gitUrl}
                       onChange={e => setGitUrl(e.target.value)}
                       className="w-full border-2 border-black p-3 font-mono text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                    />
                    <button 
                       onClick={handleGitIngest}
                       disabled={!gitUrl}
                       className="bg-black text-white w-full py-3 font-black uppercase text-sm disabled:opacity-50 hover:bg-orange-500 transition-colors border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-px active:shadow-none"
                    >
                       Analyze Repo
                    </button>
                 </div>
              </div>
            </motion.div>
          )}

          {analyzing && (
            <motion.div 
              key="analyzing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mt-32 flex flex-col items-center justify-center"
            >
               <div className="w-16 h-16 border-8 border-black border-r-orange-500 animate-spin rounded-full mb-8"></div>
               <h2 className="text-3xl font-black uppercase text-black mb-2">Analyzing Spaghett</h2>
               <p className="text-black font-mono font-bold opacity-80">Parsing syntax trees & resolving graphs...</p>
            </motion.div>
          )}

          {report && (
            <motion.div 
              key="report"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col gap-8"
            >
               {/* Hero Stats */}
               <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="bg-white border-4 border-black p-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col justify-between">
                     <p className="text-sm font-black uppercase text-black opacity-50 mb-2">Files Scanned</p>
                     <p className="text-4xl font-black text-black">{report.filesScanned}</p>
                  </div>
                  <div className="bg-white border-4 border-black p-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col justify-between">
                     <p className="text-sm font-black uppercase text-black opacity-50 mb-2">Lines of Code</p>
                     <p className="text-4xl font-black text-black">{report.totalLines.toLocaleString()}</p>
                  </div>
                  <div className="bg-white border-4 border-black p-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col justify-between md:col-span-2 relative overflow-hidden">
                     <div className="relative z-10">
                       <p className="text-sm font-black uppercase text-black opacity-50 mb-2">Overall Spaghett Score (0 = Bad, 100 = Good)</p>
                       <div className="flex items-baseline gap-2">
                         <p className={`text-6xl font-black ${getScoreColor(report.metrics.score)}`}>
                            {report.metrics.score}
                         </p>
                         <span className="font-bold text-black text-xl">/ 100</span>
                       </div>
                     </div>
                     <Activity className={`absolute -right-10 -bottom-10 w-48 h-48 opacity-10 ${getScoreColor(report.metrics.score)}`} />
                  </div>
               </div>

               {/* Dependency Graph Visualizer */}
               <div className="bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col mb-8">
                  <div className="p-4 border-b-4 border-black bg-blue-400 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Activity className="w-6 h-6 text-black" />
                      <h2 className="text-xl font-black uppercase text-black">4D Spaghett-Space Viewer</h2>
                    </div>
                  </div>
                  <div className="h-[600px] w-full bg-black overflow-hidden relative">
                     <DependencyGraphVisualizer graph={report.rawGraph} metrics={report.metrics} />
                  </div>
               </div>

               {/* Grand Architect Command */}
               <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                  <div className="bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col items-start justify-between p-6 gap-4">
                    <div>
                      <h2 className="text-2xl font-black uppercase text-black mb-1">Architecture Exorcism</h2>
                      <p className="font-mono text-sm opacity-80 font-bold">Ask the GOOP-SIGIL Grand Architect how to restructure the entire project to resolve cycles and God Objects.</p>
                    </div>
                    <button 
                      onClick={handleArchitectureSuggestion}
                      disabled={architecting}
                      className="bg-black w-full text-white font-black uppercase px-6 py-4 border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:bg-orange-500 hover:text-black transition-colors disabled:opacity-50 active:translate-y-px active:shadow-none whitespace-nowrap shrink-0 mt-auto"
                    >
                      {architecting ? 'Summoning Architect...' : 'Run Structural Exorcism (Gemini)'}
                    </button>
                  </div>
                  
                  <div className="bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col items-start justify-between p-6 gap-4">
                    <div className="w-full">
                      <div className="flex justify-between items-center mb-1">
                         <h2 className="text-2xl font-black uppercase text-black">Automated Exorcism Queue</h2>
                         <span className="bg-black text-white font-black px-3 py-1 text-sm">{exorcismQueue.length} Selected</span>
                      </div>
                      <p className="font-mono text-sm opacity-80 font-bold mb-4">Select individual issues below to generate an aggregated multi-file refactoring plan.</p>
                      <div className="max-h-24 overflow-y-auto w-full flex flex-col gap-1 mb-4">
                          {exorcismQueue.length === 0 ? (
                             <p className="text-sm font-mono opacity-50 italic">Queue is empty. Select issues from breakdowns.</p>
                          ) : (
                             exorcismQueue.map((q, i) => (
                               <div key={i} className="flex justify-between items-center text-xs border-b border-gray-200 pb-1">
                                  <span className="truncate max-w-[70%] font-bold" title={q.path}>{q.path.split('/').pop()}</span>
                                  <span className="opacity-80 uppercase font-mono">{q.issueType}</span>
                               </div>
                             ))
                          )}
                      </div>
                    </div>
                    <button 
                      onClick={handleQueueExorcism}
                      disabled={processingQueue || exorcismQueue.length === 0}
                      className="bg-black w-full text-white font-black uppercase px-6 py-4 border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:bg-orange-500 hover:text-black transition-colors disabled:opacity-50 active:translate-y-px active:shadow-none whitespace-nowrap shrink-0 mt-auto"
                    >
                      {processingQueue ? 'Aggregating...' : 'Run Queued Exorcism (Gemini)'}
                    </button>
                  </div>
               </div>

               {/* Detailed Breakdowns */}
               <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                 
                 {/* Circular Dependencies */}
                 <div className="bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col">
                    <div className="p-4 border-b-4 border-black bg-red-400 flex items-center justify-between">
                       <h2 className="text-xl font-black uppercase text-black">Circular Dependencies</h2>
                       <span className="bg-black text-white font-black px-3 py-1 text-sm">{report.summary.circularDepCount}</span>
                    </div>
                    <div className="p-4 bg-gray-50 flex-1">
                      {report.metrics.circularDeps.length === 0 ? (
                        <div className="flex items-center gap-2 text-green-600 font-bold p-4">
                          <CheckCircle2 className="w-5 h-5" /> No cycles detected.
                        </div>
                      ) : (
                        <div className="flex flex-col gap-4">
                          {report.metrics.circularDeps.map((circ, i) => (
                            <div key={i} className="flex flex-col gap-2 p-4 border-2 border-black bg-white">
                               <div className="flex items-center gap-2 flex-wrap">
                              {circ.cycle.map((node, j) => (
                                 <React.Fragment key={j}>
                                   <div className="flex items-center gap-1">
                                     <input 
                                       type="checkbox" 
                                       checked={isInQueue(node, 'Circular Dependency')}
                                       onChange={() => toggleQueueItem(node, 'Circular Dependency')}
                                       className="w-4 h-4 accent-orange-500 shrink-0 cursor-pointer"
                                     />
                                     <span className="text-xs font-mono font-bold bg-black text-white px-2 py-1">{node.split('/').pop()}</span>
                                   </div>
                                   {j < circ.cycle.length - 1 && <ArrowRight className="w-4 h-4 text-red-500" />}
                                 </React.Fragment>
                              ))}
                               </div>
                               <p className="text-xs font-mono text-black opacity-80 mt-2">{circ.suggestion}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                 </div>

                 {/* God Objects */}
                 <div className="bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col">
                    <div className="p-4 border-b-4 border-black bg-orange-400 flex items-center justify-between">
                       <h2 className="text-xl font-black uppercase text-black">God Objects</h2>
                       <span className="bg-black text-white font-black px-3 py-1 text-sm">{report.summary.godObjectCount}</span>
                    </div>
                    <div className="p-4 bg-gray-50 flex-1">
                      {report.metrics.godObjects.length === 0 ? (
                        <div className="flex items-center gap-2 text-green-600 font-bold p-4">
                          <CheckCircle2 className="w-5 h-5" /> No god objects detected.
                        </div>
                      ) : (
                        <div className="flex flex-col gap-3">
                          {report.metrics.godObjects.map((god, i) => (
                            <div key={i} className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center p-3 border-2 border-black bg-white">
                               <div className="flex-1 min-w-0 pr-4">
                                 <div className="flex items-center gap-2 mb-1">
                                    <input 
                                       type="checkbox" 
                                       checked={isInQueue(god.path, 'God Object')}
                                       onChange={() => toggleQueueItem(god.path, 'God Object')}
                                       className="w-4 h-4 accent-orange-500 shrink-0 cursor-pointer"
                                    />
                                    <div className="text-sm font-bold text-black truncate" title={god.path}>{god.path}</div>
                                 </div>
                                 <div className="text-xs text-black font-mono opacity-80">Imported by <span className="text-red-600 font-bold">{god.importedByCount}</span> files</div>
                               </div>
                               <div className="flex flex-col gap-2 shrink-0 sm:items-end">
                                 <div className="text-black font-mono text-xs font-bold uppercase">
                                   {god.suggestion}
                                 </div>
                                 <button 
                                   onClick={() => handleFix(god.path, 'God Object')}
                                   disabled={refacting === god.path}
                                   className="bg-black text-white text-[10px] font-black uppercase px-2 py-1 flex items-center justify-center border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:bg-orange-500 hover:text-black transition-colors disabled:opacity-50 active:translate-y-px active:shadow-none"
                                 >
                                   {refacting === god.path ? 'Exorcising...' : 'Exorcise (Gemini)'}
                                 </button>
                               </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                 </div>

                 {/* Tangled Logic (Long Files) */}
                 <div className="bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col">
                    <div className="p-4 border-b-4 border-black bg-yellow-400 flex items-center justify-between">
                       <h2 className="text-xl font-black uppercase text-black">Long Files</h2>
                       <span className="bg-black text-white font-black px-3 py-1 text-sm">{report.summary.longFileCount}</span>
                    </div>
                    <div className="p-4 bg-gray-50 flex-1 max-h-96 overflow-y-auto border-b-4 border-transparent">
                      {report.metrics.longFiles.length === 0 ? (
                        <div className="flex items-center gap-2 text-green-600 font-bold p-4">
                          <CheckCircle2 className="w-5 h-5" /> All files are reasonably sized.
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2">
                          {report.metrics.longFiles.sort((a: any,b: any) => report.rawGraph.nodes instanceof Map ? report.rawGraph.nodes.get(b.path)?.lines - report.rawGraph.nodes.get(a.path)?.lines : 0).map((file: any, i) => {
                             let lines = 0;
                             if (report.rawGraph.nodes instanceof Map) {
                                 lines = report.rawGraph.nodes.get(file.path)?.lines || 0;
                             } else {
                                 const fNode = report.rawGraph.nodes.find((n: any) => n[0] === file.path);
                                 if (fNode) lines = fNode[1].lines;
                             }
                             return (
                             <div key={i} className="flex justify-between items-center p-3 border-2 border-black bg-white">
                               <div className="flex-1 min-w-0 pr-4">
                                  <div className="flex items-center gap-2 mb-1">
                                    <input 
                                       type="checkbox" 
                                       checked={isInQueue(file.path, 'Tangled Logic')}
                                       onChange={() => toggleQueueItem(file.path, 'Tangled Logic')}
                                       className="w-4 h-4 accent-orange-500 shrink-0 cursor-pointer"
                                    />
                                    <p className="text-sm font-bold text-black truncate" title={file.path}>{file.path.split('/').pop()}</p>
                                  </div>
                                  <p className="text-[10px] text-black opacity-80 font-mono truncate" title={file.path}>{file.path}</p>
                               </div>
                               <div className="flex flex-col items-end gap-2 shrink-0 border-l-2 border-black pl-3 py-1">
                                 <div className="text-black font-black text-lg">
                                   {lines}
                                 </div>
                                 <button 
                                   onClick={() => handleFix(file.path, 'Tangled Logic')}
                                   disabled={refacting === file.path}
                                   className="bg-black text-white text-[10px] font-black uppercase px-2 py-1 flex items-center justify-center border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:bg-orange-500 hover:text-black transition-colors disabled:opacity-50 active:translate-y-px active:shadow-none"
                                 >
                                   {refacting === file.path ? 'Exorcising...' : 'Exorcise'}
                                 </button>
                               </div>
                             </div>
                             );
                          })}
                        </div>
                      )}
                    </div>
                 </div>

                 {/* Dead Code */}
                 <div className="bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col">
                    <div className="p-4 border-b-4 border-black bg-gray-400 flex items-center justify-between">
                       <h2 className="text-xl font-black uppercase text-black">Potentially Dead Code</h2>
                       <span className="bg-black text-white font-black px-3 py-1 text-sm">{report.summary.deadCodeCount}</span>
                    </div>
                    <div className="p-4 bg-gray-50 flex-1 max-h-96 overflow-y-auto">
                      {report.metrics.deadCode.length === 0 ? (
                        <div className="flex items-center gap-2 text-green-600 font-bold p-4">
                          <CheckCircle2 className="w-5 h-5" /> No orphaned files found.
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2">
                          {report.metrics.deadCode.map((dead, i) => (
                            <div key={i} className="flex flex-col justify-center p-3 border-2 border-black bg-white">
                               <div className="flex items-center gap-2 mb-1">
                                 <input 
                                    type="checkbox" 
                                    checked={isInQueue(dead.path, 'Dead Code')}
                                    onChange={() => toggleQueueItem(dead.path, 'Dead Code')}
                                    className="w-4 h-4 accent-orange-500 shrink-0 cursor-pointer"
                                 />
                                 <p className="text-sm font-bold text-black truncate" title={dead.path}>{dead.path.split('/').pop()}</p>
                               </div>
                               <p className="text-[10px] text-black opacity-80 font-mono truncate" title={dead.path}>{dead.path}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                 </div>

                 {/* Wildcard Imports */}
                 <div className="bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col">
                    <div className="p-4 border-b-4 border-black bg-purple-400 flex items-center justify-between">
                       <h2 className="text-xl font-black uppercase text-black">Wildcard Imports (PY)</h2>
                       <span className="bg-black text-white font-black px-3 py-1 text-sm">{report.summary.wildcardImportCount}</span>
                    </div>
                    <div className="p-4 bg-gray-50 flex-1 max-h-96 overflow-y-auto">
                      {report.metrics.wildcardImports.length === 0 ? (
                        <div className="flex items-center gap-2 text-green-600 font-bold p-4">
                          <CheckCircle2 className="w-5 h-5" /> No wildcard imports detected.
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2">
                          {report.metrics.wildcardImports.map((issue, i) => (
                            <div key={i} className="flex flex-col justify-center p-3 border-2 border-black bg-white">
                               <p className="text-sm font-bold text-black truncate" title={issue.path}>{issue.path.split('/').pop()}</p>
                               <p className="text-[10px] text-black opacity-80 font-mono mt-1">{issue.description}</p>
                               <p className="text-[10px] text-black font-black uppercase mt-1">{issue.suggestion}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                 </div>

                 {/* Excessive Globals */}
                 <div className="bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col">
                    <div className="p-4 border-b-4 border-black bg-pink-400 flex items-center justify-between">
                       <h2 className="text-xl font-black uppercase text-black">Excessive Globals (PY)</h2>
                       <span className="bg-black text-white font-black px-3 py-1 text-sm">{report.summary.excessiveGlobalsCount}</span>
                    </div>
                    <div className="p-4 bg-gray-50 flex-1 max-h-96 overflow-y-auto">
                      {report.metrics.excessiveGlobals.length === 0 ? (
                        <div className="flex items-center gap-2 text-green-600 font-bold p-4">
                          <CheckCircle2 className="w-5 h-5" /> State management looks clean.
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2">
                          {report.metrics.excessiveGlobals.map((issue, i) => (
                            <div key={i} className="flex flex-col justify-center p-3 border-2 border-black bg-white">
                               <p className="text-sm font-bold text-black truncate" title={issue.path}>{issue.path.split('/').pop()}</p>
                               <p className="text-[10px] text-black opacity-80 font-mono mt-1">{issue.description}</p>
                               <p className="text-[10px] text-black font-black uppercase mt-1">{issue.suggestion}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                 </div>

                 {/* Missing Type Hints */}
                 <div className="bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col">
                    <div className="p-4 border-b-4 border-black bg-cyan-400 flex items-center justify-between">
                       <h2 className="text-xl font-black uppercase text-black">Missing Type Hints (PY)</h2>
                       <span className="bg-black text-white font-black px-3 py-1 text-sm">{report.summary.missingTypeHintsCount}</span>
                    </div>
                    <div className="p-4 bg-gray-50 flex-1 max-h-96 overflow-y-auto">
                      {report.metrics.missingTypeHints.length === 0 ? (
                        <div className="flex items-center gap-2 text-green-600 font-bold p-4">
                          <CheckCircle2 className="w-5 h-5" /> Type hints are acceptable.
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2">
                          {report.metrics.missingTypeHints.map((issue, i) => (
                            <div key={i} className="flex flex-col justify-center p-3 border-2 border-black bg-white">
                               <p className="text-sm font-bold text-black truncate" title={issue.path}>{issue.path.split('/').pop()}</p>
                               <p className="text-[10px] text-black opacity-80 font-mono mt-1">{issue.description}</p>
                               <p className="text-[10px] text-black font-black uppercase mt-1">{issue.suggestion}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                 </div>

               </div>

               {/* System Confession */}
               <div className="bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col mt-4">
                  <div className="p-4 border-b-4 border-black bg-black text-white flex items-center justify-between">
                     <div className="flex items-center gap-2">
                        <h2 className="text-xl font-black uppercase text-white">System Confession</h2>
                        <span className="text-sm font-mono opacity-60">- GOOP-SIGIL -</span>
                     </div>
                     <button 
                        onClick={exportConfession}
                        className="bg-white text-black font-black uppercase text-xs px-3 py-1 hover:bg-orange-500 transition-colors shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)]"
                     >
                        Export MD
                     </button>
                  </div>
                  <div className="p-6 bg-gray-50 font-mono text-sm sm:text-base">
                     <p className="font-bold mb-4 uppercase">System Confession — Project: {report.projectPath}</p>
                     
                     <p className="font-bold border-b-2 border-black inline-block mb-2 mt-2">Sins:</p>
                     <ul className="list-disc pl-6 mb-6 opacity-90 space-y-1">
                        {report.metrics.circularDeps.length > 0 && (
                          <li>{report.metrics.circularDeps.length} circular dependencies (prayer wheels)</li>
                        )}
                        {report.metrics.godObjects.length > 0 && (
                          <li>{report.metrics.godObjects.length} god objects (absorbing responsibilities)</li>
                        )}
                        {report.metrics.longFiles.length > 0 && (
                          <li>{report.metrics.longFiles.length} tangled logic files (spaghetti labyrinths)</li>
                        )}
                        {report.metrics.deadCode.length > 0 && (
                          <li>Dead code: {report.metrics.deadCode.length} files (sleeping, not dead)</li>
                        )}
                        {report.metrics.wildcardImports && report.metrics.wildcardImports.length > 0 && (
                          <li>{report.metrics.wildcardImports.length} wildcard imports (namespace pollution)</li>
                        )}
                        {report.metrics.excessiveGlobals && report.metrics.excessiveGlobals.length > 0 && (
                          <li>{report.metrics.excessiveGlobals.length} instances of excessive globals (summoned chaos)</li>
                        )}
                        {report.metrics.missingTypeHints && report.metrics.missingTypeHints.length > 0 && (
                          <li>{report.metrics.missingTypeHints.length} files missing type hints (unbound entities)</li>
                        )}
                        {report.metrics.score > 80 && (
                           <li>No major sins found. A rare purity.</li>
                        )}
                     </ul>

                     <p className="font-bold border-b-2 border-black inline-block mb-2">Penance:</p>
                     <ul className="list-disc pl-6 mb-6 opacity-90 space-y-1">
                        {report.metrics.godObjects.length > 0 && (
                          <li>Run exorcise on {report.metrics.godObjects[0].path.split('/').pop()} --strategy split_by_domain</li>
                        )}
                        {report.metrics.circularDeps.length > 0 && (
                          <li>Break circular imports by extracting shared event buses.</li>
                        )}
                        {(report.metrics.godObjects.length === 0 && report.metrics.circularDeps.length === 0 && report.metrics.score <= 80) && (
                          <li>Review sleeping processes and untangle logic loops.</li>
                        )}
                        {report.metrics.score > 80 && (
                           <li>Maintain vigilance.</li>
                        )}
                     </ul>

                     <p className="font-bold border-b-2 border-black inline-block mb-2">Blessing:</p>
                     <p className="italic opacity-90 mb-6">&quot;May your imports be direct and your event loops shallow. GOOP.&quot;</p>

                     <p className="pt-4 border-t-4 border-black font-black uppercase text-lg">
                        Absolution: {report.metrics.score > 80 ? 'Granted' : 'Pending (Exorcism Required)'}
                     </p>
                  </div>
               </div>
               
               {/* Refactoring Logs */}
               {refactoringLogs.length > 0 && (
                 <div className="bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col mt-4 mb-16">
                    <div className="p-4 border-b-4 border-black bg-green-400 flex items-center justify-between">
                       <h2 className="text-xl font-black uppercase text-black">Refactoring Log</h2>
                       <span className="bg-black text-white font-black px-3 py-1 text-sm">{refactoringLogs.length}</span>
                    </div>
                    <div className="p-4 bg-gray-50 flex flex-col gap-4 max-h-[500px] overflow-y-auto">
                       {refactoringLogs.map(log => (
                          <div key={log.id} className="border-2 border-black bg-white p-4">
                             <div className="flex justify-between items-start mb-2">
                                <div>
                                   <h3 className="font-bold text-black">{log.target.split('/').pop() || log.target}</h3>
                                   <p className="text-xs font-mono opacity-80">{log.issueType}</p>
                                </div>
                                <span className="text-xs font-mono bg-black text-white px-2 py-1">{new Date(log.timestamp).toLocaleTimeString()}</span>
                             </div>
                             <button
                               onClick={() => setRefactorSuggestion(log.suggestion)}
                               className="text-xs font-black uppercase bg-black text-white px-3 py-2 hover:bg-orange-500 hover:text-black transition-colors"
                             >
                               View Exorcism Plan
                             </button>
                          </div>
                       ))}
                    </div>
                 </div>
               )}
            </motion.div>
          )}
        </AnimatePresence>
        
        <AnimatePresence>
            {refactorSuggestion && (
              <motion.div 
                 initial={{ opacity: 0 }}
                 animate={{ opacity: 1 }}
                 exit={{ opacity: 0 }}
                 className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8"
              >
                 <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setRefactorSuggestion(null)} />
                 <motion.div 
                    initial={{ scale: 0.95, y: 20 }}
                    animate={{ scale: 1, y: 0 }}
                    exit={{ scale: 0.95, y: 20 }}
                    className="relative bg-white border-4 border-black shadow-[16px_16px_0px_0px_rgba(0,0,0,1)] w-full max-w-4xl max-h-full flex flex-col overflow-hidden"
                 >
                    <div className="p-4 border-b-4 border-black bg-orange-400 flex items-center justify-between">
                       <h2 className="text-xl font-black uppercase text-black">Nonna&apos;s Exorcism Plan</h2>
                       <button onClick={() => setRefactorSuggestion(null)} className="p-1 hover:bg-black hover:text-white border-2 border-transparent hover:border-black transition-colors rounded-full">
                           <XCircle className="w-6 h-6" />
                       </button>
                    </div>
                    <div className="p-6 overflow-y-auto whitespace-pre-wrap font-mono text-sm bg-gray-50 flex-1 markdown-body">
                       {refactorSuggestion}
                    </div>
                 </motion.div>
              </motion.div>
            )}
        </AnimatePresence>
      </main>
    </div>
  );
}
