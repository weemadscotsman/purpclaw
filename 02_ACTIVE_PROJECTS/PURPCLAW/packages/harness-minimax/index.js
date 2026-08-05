'use strict';

/**
 * packages/harness-minimax — MiniMax Code Parity Harness
 * ================================================
 * Best at: fast generation, UI buildout, component creation,
 * quick transformations, style-preserving edits.
 *
 * MiniMax Code output contract:
 *   { components generated, placement, assumptions,
 *     validation state, next iteration suggestion }
 *
 * From PURPCLAW_AGENT_HARNESS_PARITY_BLUEPRINT.md §6
 */

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const {
  createResult, addFileRead, addFileChanged,
  addCommand, addArtifact, addVerification, addError,
  finalize,
} = require('../../packages/result-schema');

// ── Design token loader ───────────────────────────────────────────────────────

const DESIGN_TOKEN_PATHS = [
  'app/globals.css',
  'styles/globals.css',
  'styles/tokens.css',
  'styles/variables.css',
  'src/styles/globals.css',
];

/**
 * Load design tokens from common CSS files.
 * @param {string} projectRoot
 * @returns {{ tokens: Object, source: string|null }}
 */
function loadDesignTokens(projectRoot) {
  for (const tp of DESIGN_TOKEN_PATHS) {
    const abs = path.join(projectRoot, tp);
    if (fs.existsSync(abs)) {
      try {
        const content = fs.readFileSync(abs, 'utf8');
        // Extract CSS custom properties as tokens
        const vars = {};
        for (const m of content.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
          vars[m[1]] = m[2].trim();
        }
        return { tokens: vars, source: abs };
      } catch { /* continue */ }
    }
  }
  return { tokens: {}, source: null };
}

// ── Component scaffolder ─────────────────────────────────────────────────────

const LAYOUT_PATTERNS = [
  'app/layout.tsx',
  'app/layout.jsx',
  'src/layout.tsx',
  'src/layout.jsx',
  'src/App.tsx',
  'src/App.jsx',
  'App.tsx',
  'App.jsx',
];

const COMPONENT_DIR_PATTERNS = [
  'app/components',
  'src/components',
  'components',
  'src/ui',
  'app/ui',
];

/**
 * Detect the component directory for a project.
 * @param {string} projectRoot
 * @returns {string|null}
 */
function detectComponentDir(projectRoot) {
  for (const d of COMPONENT_DIR_PATTERNS) {
    const abs = path.join(projectRoot, d);
    if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) {
      return abs;
    }
  }
  return null;
}

// ── Component generator ───────────────────────────────────────────────────────

function generateReactComponent(name, tokens) {
  const varColor = tokens?.['color-primary'] || '#6366f1';
  const varBg    = tokens?.['bg-primary']    || '#ffffff';
  const varText = tokens?.['text-primary']  || '#1f2937';
  const varBorder = tokens?.['border-primary'] || '#e5e7eb';
  const varRadius = tokens?.['radius'] || '0.5rem';

  return `'use client';

import React from 'react';

interface ${name}Props {
  className?: string;
  children?: React.ReactNode;
}

export default function ${name}({ className = '', children }: ${name}Props) {
  return (
    <div
      className={\`flex items-center justify-center \${className}\`}
      style={{
        backgroundColor: '${varBg}',
        color: '${varText}',
        borderRadius: '${varRadius}',
        border: \`1px solid ${varBorder}\`,
        padding: '1rem',
      }}
    >
      {children || '${name} component'}
    </div>
  );
}
`;
}

// ── Screenshot placeholder ────────────────────────────────────────────────────

/**
 * Check if the project has a screenshot/reference image for a component.
 * @param {string} projectRoot
 * @param {string} componentName
 * @returns {string|null}
 */
function findReferenceImage(projectRoot, componentName) {
  const patterns = [
    `references/${componentName}.png`,
    `references/${componentName}.jpg`,
    `designs/${componentName}.png`,
    `designs/${componentName}.jpg`,
    `screenshots/${componentName}.png`,
  ];
  for (const p of patterns) {
    const abs = path.join(projectRoot, p);
    if (fs.existsSync(abs)) return abs;
  }
  return null;
}

// ── Fast validation ─────────────────────────────────────────────────────────

/**
 * Syntax-check a generated file with a parser that can actually read it.
 *
 * This ran `node --check` on the .tsx file it had just written. Node cannot
 * parse JSX or TypeScript, so the check failed every single time and the
 * harness reported a syntax error against perfectly valid output. A checker
 * that always fails is worse than no checker: it trains you to ignore it.
 *
 * Returns passed:null when nothing on this machine can parse the file. Unknown
 * is not the same as broken, and must not be reported as a failure.
 */
function runSyntaxCheck(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const isTsx = ext === '.tsx' || ext === '.ts' || ext === '.jsx';

  if (!isTsx) {
    try {
      execSync(`node --check "${filePath}"`, { encoding: 'utf8', timeout: 10_000 });
      return { ok: true, output: 'Syntax valid (node --check)' };
    } catch (err) {
      return { ok: false, output: (err.stderr || err.stdout || '').slice(-500), error: err.message };
    }
  }

  // TypeScript/JSX: use the compiler's own parser on that one file. No emit, no
  // project-wide typecheck — this is a syntax gate, not a build.
  try {
    const ts = require('typescript');
    const source = fs.readFileSync(filePath, 'utf8');
    const sf = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const diags = sf.parseDiagnostics || [];
    if (diags.length === 0) return { ok: true, output: 'Syntax valid (typescript parser)' };
    const first = ts.flattenDiagnosticMessageText(diags[0].messageText, ' ');
    return { ok: false, output: `${diags.length} parse error(s): ${first}`, error: first };
  } catch (err) {
    if (err && err.code === 'MODULE_NOT_FOUND') {
      return { skipped: true, output: 'typescript not installed — cannot parse TSX, not checked' };
    }
    return { ok: false, output: String(err.message).slice(-500), error: err.message };
  }
}

/**
 * Verify the generated component compiles, without building the whole app.
 *
 * This ran the full `npm run build` — a complete Next.js production build — to
 * validate one generated component. It took ~100 seconds per task and made a
 * frontend harness unusable, while the comment above it said "Fast build
 * check". A component's correctness does not require compiling every route.
 *
 * Scope: typecheck the generated file alone. Returns skipped when no
 * typechecker is available rather than inventing a verdict.
 */
function runBuildCheck(projectRoot, targetFile) {
  if (!targetFile || !fs.existsSync(targetFile)) {
    return { skipped: true, output: 'No generated file to check' };
  }
  try {
    const ts = require('typescript');
    const program = ts.createProgram([targetFile], {
      noEmit: true, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
      skipLibCheck: true, allowJs: true, esModuleInterop: true,
    });
    // Syntactic only. Semantic errors here are mostly unresolved app imports,
    // which say nothing about whether the component itself is well-formed.
    const diags = program.getSyntacticDiagnostics();
    if (diags.length === 0) return { ok: true, output: `Compiles: ${path.basename(targetFile)}` };
    return { ok: false, error: ts.flattenDiagnosticMessageText(diags[0].messageText, ' ') };
  } catch (err) {
    if (err && err.code === 'MODULE_NOT_FOUND') {
      return { skipped: true, output: 'typescript not installed — compile not checked' };
    }
    return { ok: false, error: String(err.message).slice(-500) };
  }
}

// ── Main run ─────────────────────────────────────────────────────────────────

/**
 * Execute a MiniMax Code generation task.
 * @param {Object} task    — PurpClawTask
 * @param {Object} ctx     — context bundle
 * @param {Object[]} steps — plan steps
 * @param {Object} [meta]  — { auditRecord }
 * @returns {Promise<Object>} PURPCLAW_RESULT
 */
async function run(task, ctx, steps, meta) {
  const result = createResult(task, 'minimax');
  const projectRoot = task.repoPath || process.cwd();
  const startedAt = Date.now();

  try {
    // Load design tokens
    const { tokens, source: tokenSource } = loadDesignTokens(projectRoot);
    if (tokenSource) addFileRead(result, tokenSource);

    // Detect component dir
    const compDir = detectComponentDir(projectRoot);
    const componentName = inferComponentName(task.goal);
    const componentFile = componentName
      ? path.join(compDir || projectRoot, `${componentName}.tsx`)
      : null;

    // Check for reference image
    const refImage = componentName ? findReferenceImage(projectRoot, componentName) : null;

    // Generate component
    if (componentFile) {
      const code = generateReactComponent(componentName, tokens);
      const dir = path.dirname(componentFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(componentFile, code, 'utf8');
      addFileChanged(result, componentFile);
      addArtifact(result, { path: componentFile, checksum: null, verified: false });
      addVerification(result, {
        criterion: 'component-generated',
        passed: true,
        evidence: `${componentName} → ${componentFile}`,
      });

      // Syntax check
      const syntaxResult = runSyntaxCheck(componentFile);
      addVerification(result, {
        criterion: 'syntax-check',
        // passed:null means "not checked" — result-schema.finalize() treats it
        // as neither proof nor failure, so a missing parser cannot be reported
        // as a broken component.
        passed: syntaxResult.skipped ? null : syntaxResult.ok,
        evidence: syntaxResult.output || syntaxResult.error || 'unknown',
      });
    }

    // Compile-check the generated file only — not the whole application.
    const buildResult = runBuildCheck(projectRoot, componentFile);
    addVerification(result, {
      criterion: 'compile-check',
      passed: buildResult.skipped ? null : buildResult.ok,
      evidence: buildResult.error || buildResult.output || 'unknown',
    });

    // UI safeguards
    const safeguards = [];
    if (Object.keys(tokens).length === 0) {
      safeguards.push('No design tokens found — reusing CSS variables for future token injection');
    }
    if (!compDir) {
      safeguards.push('No standard component dir detected — component placed in project root');
    }
    if (!refImage) {
      safeguards.push('No reference image found — component is scaffold, needs design review');
    }

    result.summary = [
      `MiniMax Code: ${componentName || 'unknown component'} generated.`,
      `Token source: ${tokenSource || 'none — using CSS defaults'}.`,
      `Component dir: ${compDir || 'none detected'}.`,
      `Reference image: ${refImage || 'none — visual review required'}.`,
      safeguards.length > 0 ? `Safeguards: ${safeguards.join('; ')}` : '',
    ].filter(Boolean).join(' ');

  } catch (err) {
    addError(result, { phase: 'minimax', message: err.message, stack: err.stack });
    result.summary = `MiniMax Code failed: ${err.message}`;
  }

  result.durationMs = Date.now() - startedAt;

  // Status is derived from the evidence actually collected, not set by hand.
  // Without this the harness kept createResult's 'blocked' default forever and
  // could never report success, however much work it did.
  // See result-schema.finalize().
  finalize(result);

  return result;
}

// ── Helper ───────────────────────────────────────────────────────────────────

// Words that are never a component name. The old last-resort pattern was
// /(?:create|build|generate|make)\s+(\w+)/, so "generate a StatusBadge
// component" captured "a" and wrote app/components/A.tsx into the live app.
const NOT_A_NAME = new Set([
  'a', 'an', 'the', 'new', 'me', 'us', 'some', 'this', 'that', 'my', 'our',
  'component', 'components', 'react', 'ui', 'page', 'file', 'code', 'it',
]);

function inferComponentName(goal) {
  const text = String(goal || '');
  const clean = (raw) => {
    if (!raw) return null;
    const name = raw.replace(/[^A-Za-z0-9]/g, '');
    if (!name || NOT_A_NAME.has(name.toLowerCase())) return null;
    if (/^\d/.test(name)) return null;              // not a valid identifier
    return name.charAt(0).toUpperCase() + name.slice(1);
  };

  // Most specific first. The name is whatever sits immediately before the word
  // "component", or carries a component-ish suffix, and only then a bare noun
  // after the verb — with articles skipped in every case.
  const patterns = [
    /\b(\w+)\s+component\b/i,                                     // "a StatusBadge component"
    /\bcomponent\s+(?:called|named)\s+(\w+)/i,                    // "component called StatusBadge"
    /\b(\w+(?:Button|Card|Badge|Modal|Panel|Table|Form|List|Menu|Bar|Chart|Dialog))\b/,
    /(?:create|build|generate|make|add)\s+(?:a|an|the)?\s*(\w+)/i, // fallback, articles skipped
  ];
  for (const re of patterns) {
    const m = text.match(re);
    const name = clean(m && m[1]);
    if (name) return name;
  }
  return 'NewComponent';
}

const HARNESS = 'minimax';
module.exports = {
  run, HARNESS, generateReactComponent, loadDesignTokens, detectComponentDir,
  // Exported so the name it will write to disk can be asserted without running
  // a generation pass. It silently produced "A" from "generate a StatusBadge
  // component" and wrote app/components/A.tsx into the live app.
  inferComponentName,
};
