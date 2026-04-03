import { spawn, ChildProcess } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

// ============================================================================
// 1. THE WINDOWS TERMINAL PUPPETEER (The Hands)
// ============================================================================
// On Windows, we can't easily hook into an already-open cmd.exe window. 
// Instead, PURPCLAW SPAWNS the cmd/powershell processes itself and holds 
// their input/output streams open in the background.
const activeTerminals: Record<string, ChildProcess> = {};
const outputBuffers: Record<string, string> = {};
const terminalConfigs: Record<string, { command: string, args: string[] }> = {};

export const TerminalAutomation = {
  /**
   * Boots up a CLI tool inside a persistent background process.
   * Example: startTerminal('deepseek', 'cmd.exe', ['/c', 'deepseek-cli'])
   */
  startTerminal(sessionName: string, command: string, args: string[] = []) {
    if (activeTerminals[sessionName]) return;

    console.log(`[PURPCLAW] Booting terminal: ${sessionName}`);
    terminalConfigs[sessionName] = { command, args };
    const proc = spawn(command, args, { shell: true });
    
    activeTerminals[sessionName] = proc;
    outputBuffers[sessionName] = "";

    // Constantly read what the CLI is printing to the screen
    proc.stdout?.on('data', (data) => {
      outputBuffers[sessionName] += data.toString();
    });

    proc.stderr?.on('data', (data) => {
      outputBuffers[sessionName] += data.toString();
    });
  },

  /**
   * Kills a hung terminal and restarts it with the original config.
   */
  restartTerminal(sessionName: string) {
    console.log(`[PURPCLAW] ⚠️ Restarting hung terminal: ${sessionName}`);
    if (activeTerminals[sessionName]) {
      activeTerminals[sessionName].kill();
      delete activeTerminals[sessionName];
    }
    const config = terminalConfigs[sessionName];
    if (config) {
      this.startTerminal(sessionName, config.command, config.args);
    }
  },

  /**
   * Types a prompt into the running CLI process and presses Enter.
   */
  async sendPrompt(sessionName: string, prompt: string): Promise<void> {
    const proc = activeTerminals[sessionName];
    if (!proc || !proc.stdin) throw new Error(`Terminal ${sessionName} is not running.`);

    // Clear the buffer so we only read the response to THIS prompt
    outputBuffers[sessionName] = "";
    
    // Send the text, then send the Enter key (\r\n for Windows)
    proc.stdin.write(prompt + '\r\n');
  },

  /**
   * Captures the current screen output of the terminal.
   */
  async readOutput(sessionName: string): Promise<string> {
    return outputBuffers[sessionName] || "";
  },

  /**
   * Waits for the AI to finish generating by checking if the terminal prompt has returned.
   * (Assumes the terminal prompt ends with '>' or '$' or '?')
   */
  async waitForCompletion(sessionName: string, timeoutMs: number = 45000): Promise<string> {
    const startTime = Date.now();
    let lastOutput = "";

    while (Date.now() - startTime < timeoutMs) {
      const output = await this.readOutput(sessionName);
      
      // If the output ends with a standard shell/CLI prompt, the AI is done typing
      if (output.match(/([>$?])\s*$/) && output !== lastOutput && output.length > 0) {
        return output;
      }
      lastOutput = output;
      await new Promise(r => setTimeout(r, 2000)); // Poll every 2 seconds
    }
    throw new Error(`TIMEOUT:${sessionName}`);
  }
};

// ============================================================================
// 2. THE PARSER (The Strict Contract)
// ============================================================================
export interface AIResponse {
  status: "success" | "fail";
  type: "code" | "plan" | "review";
  content: string;
  issues: { type: string, severity: "critical" | "high" | "medium" | "low", description: string }[];
  confidence: number;
  errorType?: "FORMAT_FAIL" | "LOGIC_FAIL";
}

export const OutputParser = {
  /**
   * Enforces the strict JSON contract. No exceptions.
   */
  parse(aiName: string, rawTerminalOutput: string): AIResponse {
    // Find the first '{' and last '}' to extract potential JSON
    const firstBrace = rawTerminalOutput.indexOf('{');
    const lastBrace = rawTerminalOutput.lastIndexOf('}');
    
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      try {
        const jsonStr = rawTerminalOutput.substring(firstBrace, lastBrace + 1);
        const parsed = JSON.parse(jsonStr);
        
        // Validate schema shape
        if (parsed.status && parsed.type && parsed.content !== undefined) {
          return {
            status: parsed.status === 'success' ? 'success' : 'fail',
            type: parsed.type,
            content: parsed.content,
            issues: Array.isArray(parsed.issues) ? parsed.issues : [],
            confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.0,
            errorType: parsed.status === 'success' ? undefined : 'LOGIC_FAIL'
          };
        }
      } catch (e) {
        // JSON parse failed, fall through to strict failure
      }
    }

    // 💀 STRICT ENFORCEMENT: If it's not valid JSON matching the schema, it's a failure.
    return {
      status: "fail",
      type: "review",
      content: rawTerminalOutput,
      issues: [{ type: "system", severity: "critical", description: "FATAL: AI failed to conform to the strict JSON output schema." }],
      confidence: 0.0,
      errorType: "FORMAT_FAIL"
    };
  }
};

// ============================================================================
// 3. THE ROUTING LOGIC (Deterministic Stage Routing)
// ============================================================================
export type PipelineStage = 'plan' | 'code' | 'review' | 'fix';

export const TaskRouter = {
  /**
   * Routing is now based on STATE + STAGE, not keywords.
   */
  route(stage: PipelineStage): string {
    switch (stage) {
      case 'plan': return 'kilo';       // Planning & Orchestration
      case 'code': return 'kimi';       // Raw Code Generation
      case 'review': return 'deepseek'; // Audit & Reasoning
      case 'fix': return 'minimax';     // Optimization & Fixing
      default: throw new Error(`Unknown pipeline stage: ${stage}`);
    }
  }
};

// ============================================================================
// 4. THE LOOP (Disciplined Execution Engine)
// ============================================================================
const SCHEMA_PROMPT = `
CRITICAL INSTRUCTION: You MUST output ONLY valid JSON matching this exact schema. No markdown outside the JSON. No conversational text.
{
  "status": "success" | "fail",
  "type": "code" | "plan" | "review",
  "content": "your actual output here (code, plan, or review notes)",
  "issues": [
    { "type": "security", "severity": "critical", "description": "SQL injection vulnerability" }
  ],
  "confidence": 0.9
}`;

let globalAiCallCount = 0;
const MAX_GLOBAL_AI_CALLS = 50;
const INTEGRATION_OVERFLOW = 10;
let currentPipelinePhase: 'planning' | 'tasks' | 'integration' = 'planning';

/**
 * Robust wrapper that handles Hang Detection and Partial Output (FORMAT_FAIL) retries.
 */
async function askAIWithRobustRetries(aiName: string, prompt: string, stage: PipelineStage, timeoutMs: number = 45000, maxRetries = 3): Promise<AIResponse> {
  globalAiCallCount++;
  const effectiveLimit = currentPipelinePhase === 'integration'
    ? MAX_GLOBAL_AI_CALLS + INTEGRATION_OVERFLOW
    : MAX_GLOBAL_AI_CALLS;
  if (globalAiCallCount > effectiveLimit) {
    console.warn(`[PURPCLAW] ⚠️ Fatigue limit hit at ${globalAiCallCount} calls (phase: ${currentPipelinePhase}, limit: ${effectiveLimit})`);
    throw new Error(`ESCALATION: System fatigue limit reached (> ${effectiveLimit} AI calls). Phase: ${currentPipelinePhase}.`);
  }

  let timeoutCount = 0;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await TerminalAutomation.sendPrompt(aiName, prompt);
      const raw = await TerminalAutomation.waitForCompletion(aiName, timeoutMs);
      const parsed = OutputParser.parse(aiName, raw);
      
      if (parsed.status === 'fail' && parsed.errorType === 'FORMAT_FAIL') {
        console.warn(`[PURPCLAW] ⚠️ FORMAT_FAIL from ${aiName}. Retrying (${attempt}/${maxRetries})...`);
        continue; // Retry same AI
      }

      // Confidence Escalation Trigger (Only reviewers can trigger escalation for low confidence)
      if (parsed.confidence < 0.7 && stage === 'review') {
        throw new Error(`ESCALATION: ${aiName} reported low confidence (${parsed.confidence}) during REVIEW. Human review required.`);
      }

      return parsed; // Success or LOGIC_FAIL
    } catch (e: any) {
      if (e.message && e.message.startsWith('TIMEOUT')) {
        timeoutCount++;
        if (timeoutCount > 2) {
          throw new Error(`ESCALATION: Persistent timeout for ${aiName} - likely prompt or model issue.`);
        }
        console.warn(`[PURPCLAW] ⚠️ HANG DETECTED for ${aiName}. Restarting terminal and retrying (${attempt}/${maxRetries})...`);
        TerminalAutomation.restartTerminal(aiName);
        await new Promise(r => setTimeout(r, 2000)); // Wait for boot
      } else {
        throw e; // Unhandled error
      }
    }
  }
  throw new Error(`ESCALATION: ${aiName} failed to produce valid output after ${maxRetries} attempts.`);
}

export async function runDelegationLoop(objective: string) {
  console.log(`[PURPCLAW] Starting disciplined loop for objective: ${objective}`);
  let codebase = "";
  globalAiCallCount = 0; // Reset fatigue counter

  // Fast State & Deep History Tracking Setup
  const stateFile = path.join(process.cwd(), 'loop_state.json');
  const historyFile = path.join(process.cwd(), 'history.log');
  
  const state: any = {
    objective,
    status: 'running',
    currentStage: 'init',
    currentTask: null,
    error: null
  };

  const saveState = async () => {
    try {
      await fs.writeFile(stateFile, JSON.stringify(state, null, 2));
    } catch (e) {
      console.error("[PURPCLAW] Failed to write state file", e);
    }
  };

  const appendHistory = async (entryType: string, data: any) => {
    try {
      const logEntry = JSON.stringify({ timestamp: new Date().toISOString(), type: entryType, data }) + '\n';
      await fs.appendFile(historyFile, logEntry);
    } catch (e) {
      console.error("[PURPCLAW] Failed to write history log", e);
    }
  };

  await saveState();
  await appendHistory('pipeline_start', { objective });

  try {
    // Boot up the CLI processes in the background
    TerminalAutomation.startTerminal('kilo', 'cmd.exe', ['/c', 'kilo-cli']);
    TerminalAutomation.startTerminal('kimi', 'cmd.exe', ['/c', 'kimi-cli']);
    TerminalAutomation.startTerminal('deepseek', 'cmd.exe', ['/c', 'deepseek-cli']);
    TerminalAutomation.startTerminal('minimax', 'cmd.exe', ['/c', 'minimax-cli']);
    TerminalAutomation.startTerminal('gemini', 'cmd.exe', ['/c', 'gemini-cli']);  // Tie-breaker reviewer

    // Give them a second to boot up
    await new Promise(r => setTimeout(r, 2000));

    // ------------------------------------------------------------------------
    // STAGE 1: PLAN
    // ------------------------------------------------------------------------
    const planner = TaskRouter.route('plan');
    console.log(`[PURPCLAW] STAGE: PLAN -> Assigned to ${planner}`);
    state.currentStage = 'plan';
    await saveState();
    
    // 30s timeout for planning
    const planResponse = await askAIWithRobustRetries(planner, `Objective: ${objective}\nBreak this down into technical tasks. Put the tasks as a JSON array string inside the 'content' field.\n${SCHEMA_PROMPT}`, 'plan', 30000);
    await appendHistory('plan_generated', planResponse);

    if (planResponse.status === 'fail') {
      const issuesText = planResponse.issues.map((i: any) => `[${i.severity}] ${i.description}`).join(', ');
      throw new Error(`ESCALATION: Planning failed. Issues: ${issuesText}`);
    }

    let tasks: string[] = [];
    try {
      tasks = JSON.parse(planResponse.content);
    } catch {
      tasks = [planResponse.content]; // Fallback if they didn't stringify the array properly
    }

    console.log(`[PURPCLAW] Tasks locked:`, tasks);
    await appendHistory('tasks_locked', { tasks });

    // ------------------------------------------------------------------------
    // STAGE 2: EXECUTION LOOP
    // ------------------------------------------------------------------------
    currentPipelinePhase = 'tasks';
    for (const task of tasks) {
      console.log(`\n[PURPCLAW] --- STARTING TASK: ${task} ---`);
      state.currentTask = task;
      state.currentStage = 'coding';
      await saveState();
      
      let taskPass = false;
      let loopCount = 0;
      const MAX_RETRIES = 3;
      let currentCode = "";
      let lastIssues: any[] = [];
      let sameIssuesCount = 0;

      // INITIAL CODE GENERATION
      const coder = TaskRouter.route('code');
      console.log(`[PURPCLAW] STAGE: CODE -> Assigned to ${coder}`);
      // 60s timeout for coding
      const codeResponse = await askAIWithRobustRetries(coder, `Task: ${task}\nContext: ${codebase}\nWrite the code. Put the raw code in the 'content' field.\n${SCHEMA_PROMPT}`, 'code', 60000);
      currentCode = codeResponse.content;
      await appendHistory('code_generated', { task, content: currentCode });

      // REVIEW & FIX LOOP
      while (!taskPass && loopCount < MAX_RETRIES) {
        loopCount++;
        console.log(`[PURPCLAW] Review Loop ${loopCount}/${MAX_RETRIES}`);
        state.currentStage = 'reviewing';
        await saveState();

        // REVIEW
        const reviewer = TaskRouter.route('review');
        console.log(`[PURPCLAW] STAGE: REVIEW -> Assigned to ${reviewer}`);
        // 45s timeout for review
        const reviewResponse = await askAIWithRobustRetries(reviewer, `Review this code for task: ${task}\nCode:\n${currentCode}\nIf perfect, status="success". If flawed, status="fail" and list issues.\n${SCHEMA_PROMPT}`, 'review', 45000);
        
        await appendHistory('code_reviewed', { task, review: reviewResponse });

        if (reviewResponse.status === 'success' && reviewResponse.issues.length === 0) {
          console.log(`[PURPCLAW] GATE PASSED. Code accepted.`);
          taskPass = true;
          codebase += `\n// Task: ${task}\n${currentCode}\n`;
          await appendHistory('task_passed', { task });
          break;
        }

        // TIE-BREAKER FALLBACK: If reviewer confidence is low, get second opinion
        if (reviewResponse.confidence < 0.85 && reviewResponse.status === 'fail') {
          console.log(`[PURPCLAW] ⚖️ TIE-BREAKER: Primary reviewer confidence ${reviewResponse.confidence} < 0.85. Consulting Gemini...`);
          await appendHistory('tie_breaker_triggered', { task, primaryConfidence: reviewResponse.confidence });

          const tieBreakerPrompt = `Review this code for task: ${task}\nCode:\n${currentCode}\nIf perfect, status="success". If flawed, status="fail" and list issues.\n${SCHEMA_PROMPT}`;
          const tieBreaker = await askAIWithRobustRetries('gemini', tieBreakerPrompt, 'review', 45000);
          await appendHistory('tie_breaker_result', { task, tieBreakerReview: tieBreaker });

          if (tieBreaker.status === 'success' && tieBreaker.issues.length === 0) {
            console.log(`[PURPCLAW] ⚖️ TIE-BREAK RESOLVED: Gemini overrides. Code accepted.`);
            taskPass = true;
            codebase += `\n// Task: ${task}\n${currentCode}\n`;
            await appendHistory('tie_breaker_accepted', { task });
            break;
          } else {
            console.log(`[PURPCLAW] ⚖️ TIE-BREAK CONFIRMED: Both reviewers agree on failure.`);
          }
        }

        // ESCALATION PRIORITY: Collect signals, fire only highest priority
        const escalationSignals: { priority: number; message: string }[] = [];

        // Priority 1: Critical severity issues
        const hasCritical = reviewResponse.issues.some((i: any) => i.severity === 'critical');
        if (hasCritical) {
          escalationSignals.push({ priority: 1, message: `Critical severity issue detected in task "${task}". Halting pipeline.` });
        }

        // Priority 3: Semantic convergence (hash type+severity, not raw text)
        // "Null pointer in user service" and "User service crashes due to null" → same signature
        const currentSignatures = reviewResponse.issues.map((i: any) => `${i.type}:${i.severity}`).sort().join('|');
        const lastSignatures = lastIssues.map((i: any) => `${i.type}:${i.severity}`).sort().join('|');

        if (currentSignatures === lastSignatures && currentSignatures !== "") {
          sameIssuesCount++;
          if (sameIssuesCount >= 2) {
            escalationSignals.push({ priority: 3, message: `No convergence - stuck on same issue types (${currentSignatures}) for task "${task}".` });
          }
        } else {
          sameIssuesCount = 0;
        }

        // FIRE ONLY HIGHEST PRIORITY ESCALATION
        if (escalationSignals.length > 0) {
          escalationSignals.sort((a, b) => a.priority - b.priority);
          const fired = escalationSignals[0];
          console.error(`[PURPCLAW] 🚨 ESCALATION (priority ${fired.priority}): ${fired.message}`);
          if (escalationSignals.length > 1) {
            console.warn(`[PURPCLAW] ⚠️ Suppressed ${escalationSignals.length - 1} lower-priority escalation(s)`);
          }
          throw new Error(`ESCALATION: ${fired.message}`);
        }

        lastIssues = reviewResponse.issues;
        console.log(`[PURPCLAW] GATE FAILED. Issues found:`, lastIssues);

        // FIX (If we haven't hit max retries)
        if (loopCount < MAX_RETRIES) {
          state.currentStage = 'fixing';
          await saveState();

          const fixer = TaskRouter.route('fix');
          console.log(`[PURPCLAW] STAGE: FIX -> Assigned to ${fixer}`);
          // 60s timeout for fixing
          const issuesText = lastIssues.map((i: any) => `[${i.severity}] ${i.type}: ${i.description}`).join('\n');
          const fixResponse = await askAIWithRobustRetries(fixer, `Fix these issues in the code.\nIssues:\n${issuesText}\nCode:\n${currentCode}\nPut the fixed code in the 'content' field.\n${SCHEMA_PROMPT}`, 'fix', 60000);
          
          await appendHistory('code_fixed', { task, fix: fixResponse });
          // Update current code for the next review pass
          currentCode = fixResponse.content;
        }
      }

      // ESCALATION TRIGGER
      if (!taskPass) {
        const issuesText = lastIssues.map((i: any) => `[${i.severity}] ${i.description}`).join(', ');
        throw new Error(`ESCALATION: Task "${task}" failed to pass review after ${MAX_RETRIES} attempts. Final issues: ${issuesText}`);
      }
    }

    // ------------------------------------------------------------------------
    // STAGE 3: FINAL SYSTEM INTEGRATION TEST
    // ------------------------------------------------------------------------
    console.log(`\n[PURPCLAW] --- STAGE 3: FINAL SYSTEM INTEGRATION TEST ---`);
    state.currentStage = 'integration';
    state.currentTask = 'final_audit';
    currentPipelinePhase = 'integration';  // Unlocks +10 fatigue overflow
    await saveState();

    let integrationPass = false;
    let integrationRetries = 0;
    const MAX_INTEGRATION_RETRIES = 2;
    let previousIssueCount = 0;

    while (!integrationPass && integrationRetries < MAX_INTEGRATION_RETRIES) {
      integrationRetries++;
      console.log(`[PURPCLAW] Integration Loop ${integrationRetries}/${MAX_INTEGRATION_RETRIES}`);
      
      const auditor = TaskRouter.route('review'); // DeepSeek
      const auditPrompt = `Perform a final integration test on this complete codebase. Does it build and run together correctly?\nCodebase:\n${codebase}\nIf perfect, status="success". If integration fails, status="fail" and list issues.\n${SCHEMA_PROMPT}`;
      
      // 60s timeout for integration audit
      const auditResponse = await askAIWithRobustRetries(auditor, auditPrompt, 'review', 60000);
      await appendHistory('integration_audit', auditResponse);
      
      if (auditResponse.status === 'success' && auditResponse.issues.length === 0) {
        integrationPass = true;
        console.log(`[PURPCLAW] INTEGRATION PASSED. Codebase is ready for production.`);
        await appendHistory('integration_passed', { success: true });
      } else {
        // INTEGRATION ESCALATION PRIORITY: Collect signals, fire only highest
        const integrationEscalations: { priority: number; message: string }[] = [];

        // Priority 1: Critical severity
        const hasCritical = auditResponse.issues.some((i: any) => i.severity === 'critical');
        if (hasCritical) {
          integrationEscalations.push({ priority: 1, message: `Critical severity issue during integration. Halting pipeline.` });
        }

        // Priority 2: Regression
        const currentIssueCount = auditResponse.issues.length;
        if (integrationRetries > 1 && currentIssueCount > previousIssueCount) {
          integrationEscalations.push({ priority: 2, message: `Regression during integration. Fix created more problems (${previousIssueCount} -> ${currentIssueCount} issues).` });
        }
        previousIssueCount = currentIssueCount;

        // Fire only highest priority
        if (integrationEscalations.length > 0) {
          integrationEscalations.sort((a, b) => a.priority - b.priority);
          const fired = integrationEscalations[0];
          console.error(`[PURPCLAW] 🚨 INTEGRATION ESCALATION (priority ${fired.priority}): ${fired.message}`);
          throw new Error(`ESCALATION: ${fired.message}`);
        }

        console.log(`[PURPCLAW] INTEGRATION FAILED. Issues:`, auditResponse.issues);

        const fixer = TaskRouter.route('fix'); // Minimax
        const issuesText = auditResponse.issues.map((i: any) => `[${i.severity}] ${i.type}: ${i.description}`).join('\n');
        const fixPrompt = `Fix these global integration issues.\nIssues:\n${issuesText}\nCodebase:\n${codebase}\nOutput the fully fixed codebase in the 'content' field.\n${SCHEMA_PROMPT}`;
        // 60s timeout for global fix
        const fixResponse = await askAIWithRobustRetries(fixer, fixPrompt, 'fix', 60000);
        await appendHistory('integration_fix', fixResponse);
        codebase = fixResponse.content; // Update codebase with global fixes
      }
    }

    if (!integrationPass) {
      throw new Error(`ESCALATION: Final integration test failed after ${MAX_INTEGRATION_RETRIES} attempts.`);
    }

    console.log(`[PURPCLAW] ALL TASKS COMPLETE. Pipeline finished.`);
    state.status = 'completed';
    state.currentStage = 'done';
    state.currentTask = null;
    await saveState();
    await appendHistory('pipeline_completed', { success: true });
    return codebase;

  } catch (error: any) {
    console.error(`[PURPCLAW] PIPELINE HALTED:`, error);
    state.status = 'escalated';
    state.error = error.message;
    await saveState();
    await appendHistory('pipeline_escalated', { error: error.message });
    // LAYER 4 ESCALATION TRIGGERED HERE
    throw error;
  }
}
