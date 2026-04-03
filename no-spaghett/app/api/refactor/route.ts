import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";
import { recordExorcismEvent } from "@/lib/spaghetti/thringlet-impact";

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY is required for AI refactor requests' },
        { status: 503 }
      );
    }

    const { filePath, issueType, fileContent, graphData, queue } = await req.json();

    if (!issueType) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    let prompt = "";

    if (issueType === 'Architecture Suggestion') {
      if (!graphData) {
        return NextResponse.json({ error: 'Missing graphData for architecture suggestion' }, { status: 400 });
      }
      
      prompt = `You are the GOOP-SIGIL Grand Architect (Architecture Suggestion Agent).
The following dependency graph data and metrics represent an entire project's structure, heavily afflicted by God Objects, Circular Dependencies, and other demonic code smells.

Please analyze the entire dependency graph summary and suggest a directory-level reorganization to resolve these God Objects and cycles.

Rules:
1. Return ONLY a markdown document containing a proposed directory structure (using an ASCII tree representation) and a step-by-step execution plan for the structural exorcism.
2. Be precise. No yapping.
3. Identify the structural anti-patterns from the data and explain how your new architecture resolves them.
4. You may include a brief "Architecture Exorcism Plan" summary at the top.

Project Data:
\`\`\`json
${JSON.stringify(graphData, null, 2).substring(0, 500000)} // Truncated to avoid extreme token counts if graph is massive
\`\`\`
`;
    } else if (issueType === 'Automated Queue') {
      if (!queue || !Array.isArray(queue)) {
        return NextResponse.json({ error: 'Missing queue data for automated exorcism' }, { status: 400 });
      }

      prompt = `You are the GOOP-SIGIL Multi-Core Exorcism Engine.
You have been tasked with generating an aggregated, multi-file refactoring plan for a queue of highly afflicted files.

Queue Details:
${queue.map(q => `- **${q.path}** (Affliction: ${q.issueType})`).join('\n')}

Please provide a sequential action plan to systematically exorcise each file in the queue.
For each file, analyze its affliction and explain the precise changes required (e.g., how to split the God Object, where to extract shared logic to break cycles).

Queue Source Code Context:
${queue.map(q => `\n### Path: ${q.path}\n\`\`\`\n${q.content ? q.content.substring(0, 10000) : 'Content not available'}\n\`\`\``).join('\n')}

Rules:
1. Return ONLY a markdown document outlining the aggregated refactoring plan.
2. Be precise. No yapping.
3. Include specific code replacement snippets where applicable.
`;
    } else {
      if (!filePath || !fileContent) {
        return NextResponse.json({ error: 'Missing required parameters for file exorcism' }, { status: 400 });
      }

      prompt = `
You are the GOOP-SIGIL Exorcism Engine.
The following file (${filePath}) has been identified as being possessed by the following demonic code smell: ${issueType}.

Please exorcise the file to resolve this issue and return it to a clean, SOLID structure.
If it is a 'God Object', split it into smaller, single-responsibility domain modules.
If it is a 'Circular Dependency', break the cycle by extracting shared logic into a neutral file.
If it is 'Tangled Logic', untangle it into smaller, pure functions.
If it has 'Dead Code', remove the sleeping processes.

Rules:
1. Return ONLY the markdown code block containing the exorcised code or proposed architecture. 
2. Be precise. No yapping.
3. Use the matching language (TypeScript/JavaScript/Python).
4. You may include a brief "Exorcism Complete" summary at the top before the code block.

Original Code:
\`\`\`
${fileContent}
\`\`\`
      `;
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    const thringletEvent = await recordExorcismEvent(issueType, filePath);

    return NextResponse.json({ suggestion: response.text, thringletEvent });
  } catch (error: any) {
     console.error('Refactor Error:', error);
     return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
