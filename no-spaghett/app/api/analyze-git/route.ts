import { NextRequest, NextResponse } from 'next/server';
import AdmZip from 'adm-zip';
import { buildProjectGraph } from '@/lib/spaghetti/parser';
import { SpaghettOMeter } from '@/lib/spaghetti/meter';

export async function POST(req: NextRequest) {
  try {
    const { repoUrl, branch } = await req.json();

    if (!repoUrl) {
      return NextResponse.json({ error: 'Repo URL is required' }, { status: 400 });
    }

    const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/.]+)/);
    if (!match) {
      return NextResponse.json({ error: 'Only GitHub URLs are supported currently.' }, { status: 400 });
    }

    const [, owner, repo] = match;
    
    let targetRef = branch;
    
    if (!targetRef) {
        const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
            headers: { 'User-Agent': 'No-Spaghett-Analyzer' }
        });
        if (repoRes.ok) {
            const repoData = await repoRes.json();
            targetRef = repoData.default_branch;
        } else {
            targetRef = 'main';
        }
    }
    
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/zipball/${targetRef}`, {
        headers: {
            'User-Agent': 'No-Spaghett-Analyzer',
        }
    });

    if (!res.ok) {
        if (targetRef === 'main') {
             const resMaster = await fetch(`https://api.github.com/repos/${owner}/${repo}/zipball/master`, {
                headers: { 'User-Agent': 'No-Spaghett-Analyzer' }
             });
             if (resMaster.ok) {
                 const arrayBuffer = await resMaster.arrayBuffer();
                 return processZip(arrayBuffer, owner, repo, 'master');
             }
        }
        return NextResponse.json({ error: `Failed to fetch repo: ${res.statusText}` }, { status: res.status });
    }

    const arrayBuffer = await res.arrayBuffer();
    return processZip(arrayBuffer, owner, repo, targetRef);
  } catch (error: any) {
    console.error('Git analysis error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

function processZip(arrayBuffer: ArrayBuffer, owner: string, repo: string, branch: string) {
    const buffer = Buffer.from(arrayBuffer);
    const zip = new AdmZip(buffer);
    const zipEntries = zip.getEntries(); 

    const allowedExts = /\.(js|ts|jsx|tsx|py)$/;
    const sourceFiles: { path: string; content: string }[] = [];

    zipEntries.forEach((zipEntry) => {
        if (!zipEntry.isDirectory) {
             const name = zipEntry.entryName;
             const parts = name.split('/');
             parts.shift();
             const cleanPath = parts.join('/');
             
             if (allowedExts.test(cleanPath) && !cleanPath.includes('node_modules') && !cleanPath.includes('dist') && !cleanPath.includes('.next') && !cleanPath.includes('.venv')) {
                  sourceFiles.push({
                      path: cleanPath,
                      content: zipEntry.getData().toString('utf8'),
                  });
             }
        }
    });

    if (sourceFiles.length === 0) {
        return NextResponse.json({ error: 'No valid source files found in repo.' }, { status: 400 });
    }

    const graph = buildProjectGraph(sourceFiles);
    const meter = new SpaghettOMeter();
    const metrics = meter.analyze(graph);

    const totalLines = sourceFiles.reduce((acc, f) => acc + f.content.split('\n').length, 0);

    const report = {
        timestamp: new Date().toISOString(),
        projectPath: `${owner}/${repo} (${branch})`,
        metrics,
        filesScanned: sourceFiles.length,
        totalLines,
        rawGraph: {
           nodes: Array.from(graph.nodes.entries()),
           edges: Array.from(graph.edges.entries()),
           reverse: Array.from(graph.reverse.entries())
        },
        summary: {
          circularDepCount: metrics.circularDeps.length,
          godObjectCount: metrics.godObjects.length,
          longFileCount: metrics.longFiles.length,
          deadCodeCount: metrics.deadCode.length,
          wildcardImportCount: metrics.wildcardImports.length,
          excessiveGlobalsCount: metrics.excessiveGlobals.length,
          missingTypeHintsCount: metrics.missingTypeHints.length,
        },
        sourceFiles
    };

    return NextResponse.json(report);
}
