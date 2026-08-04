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

function runSyntaxCheck(filePath) {
  try {
    const out = execSync(`node --check ${filePath}`, { encoding: 'utf8', timeout: 10_000 });
    return { ok: true, output: out };
  } catch (err) {
    return { ok: false, output: (err.stderr || err.stdout || '').slice(-500), error: err.message };
  }
}

function runBuildCheck(projectRoot) {
  const pkgPath = path.join(projectRoot, 'package.json');
  if (!fs.existsSync(pkgPath)) return { ok: false, error: 'No package.json found' };

  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    if (pkg.scripts?.build) {
      const out = execSync('npm run build', { cwd: projectRoot, encoding: 'utf8', timeout: 120_000, maxBuffer: 10 * 1024 * 1024 });
      return { ok: true, output: 'Build succeeded' };
    }
  } catch (err) {
    return { ok: false, error: (err.stdout || err.stderr || err.message).slice(-500) };
  }
  return { ok: true, output: 'No build script found — skipped' };
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
        passed: syntaxResult.ok,
        evidence: syntaxResult.ok ? 'Syntax valid' : syntaxResult.error,
      });
    }

    // Fast build check
    const buildResult = runBuildCheck(projectRoot);
    addVerification(result, {
      criterion: 'build-check',
      passed: buildResult.ok,
      evidence: buildResult.error || buildResult.output,
    });
    if (buildResult.ok && buildResult.output !== 'No build script found — skipped') {
      addCommand(result, 'npm run build');
    }

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
  return result;
}

// ── Helper ───────────────────────────────────────────────────────────────────

function inferComponentName(goal) {
  // Extract component name from goal
  const patterns = [
    /(?:create|build|generate|make)\s+(\w+[Cc]omponent)/i,
    /(?:create|build|generate|make)\s+(\w+Button)/i,
    /(?:create|build|generate|make)\s+(\w+Card)/i,
    /(?:create|build|generate|make)\s+(\w+)/i,
  ];
  for (const re of patterns) {
    const m = goal.match(re);
    if (m) {
      const name = m[1];
      return name.charAt(0).toUpperCase() + name.slice(1);
    }
  }
  return 'NewComponent';
}

module.exports = { run, generateReactComponent, loadDesignTokens };
