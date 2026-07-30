'use strict';

/**
 * purpclaw eval:fix — run tests, feed failures to LLM, auto-fix, repeat.
 *
 *   purpclaw eval          # auto-detect test framework, run, fix, repeat
 *   purpclaw eval --iterations=3   # max fix loops (default 3)
 *   purpclaw eval --test="npm test"  # explicit test command
 *   purpclaw eval --dry  # show what would be fixed, don't write
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const DEFAULT_ITERATIONS = 3;
const DEFAULT_TEST_CMD = 'npm test';
const LLM_MODEL = process.env.LLM_MODEL || 'MiniMax-M3';
const LLM_PROVIDER = process.env.LLM_PROVIDER || 'minimax';

function exec(cmd, opts = {}) {
  return new Promise((resolve) => {
    const [file, ...args] = cmd.split(' ');
    const child = spawn(file, args, { shell: true, cwd: opts.cwd || process.cwd(), timeout: opts.timeout || 60000 });
    let out = '', err = '';
    child.stdout.on('data', d => out += d);
    child.stderr.on('data', d => err += d);
    child.on('close', code => resolve({ code, stdout: out, stderr: err }));
  });
}

async function run(args, ctx) {
  const dry = args.includes('--dry') || args.includes('-d');
  const iterIdx = args.findIndex(a => a.startsWith('--iterations='));
  const maxIter = iterIdx >= 0 ? parseInt(args[iterIdx].split('=')[1], 10) : DEFAULT_ITERATIONS;
  const testIdx = args.findIndex(a => a.startsWith('--test='));
  const testCmd = testIdx >= 0 ? args[testIdx].split('=')[1] : DEFAULT_TEST_CMD;

  const projectRoot = ctx?.projectRoot || process.cwd();
  const promptFile = path.join(projectRoot, '.purpclaw', 'eval-auto-fix-prompt.md');

  console.log('\n  \x1b[36mPURPCLAW eval:auto-fix\x1b[0m');
  console.log(`  test command : ${testCmd}`);
  console.log(`  max iterations: ${maxIter}`);
  console.log(`  dry run      : ${dry ? 'yes' : 'no'}\n`);

  for (let i = 0; i < maxIter; i++) {
    process.stdout.write(`  \x1b[33m[${i + 1}/${maxIter}]\x1b[0m Running tests... `);
    const result = await exec(testCmd, { cwd: projectRoot, timeout: 120000 });

    if (result.code === 0) {
      console.log(`\x1b[32mPASS\x1b[0m — all tests passed\n`);
      return { ok: true, iterations: i + 1, fixed: i > 0 };
    }

    console.log(`\x1b[31mFAIL\x1b[0m (exit ${result.code})`);
    const failures = extractFailures(result.stdout + '\n' + result.stderr);
    if (!failures.length) {
      console.log('  \x1b[90mcould not parse failures from output\x1b[0m\n');
      break;
    }
    console.log(`  ${failures.length} failure(s) detected`);

    const failureText = failures.map((f, idx) => `  ${idx + 1}. ${f}`).join('\n');
    const prompt = buildFixPrompt(failureText, result.stdout + '\n' + result.stderr);

    if (dry) {
      console.log('\n\x1b[35m[DRY RUN — would send to LLM]:\x1b[0m');
      console.log(prompt.substring(0, 800) + '...\n');
      continue;
    }

    process.stdout.write('  \x1b[36mSending to LLM for fix...\x1b[0m ');
    const fixResult = await getLLMFix(prompt, projectRoot);

    if (!fixResult) {
      console.log('\n  \x1b[31mLLM fix failed\x1b[0m\n');
      break;
    }

    const applied = applyFixes(fixResult, projectRoot);
    console.log(`\x1b[32mApplied ${applied} fix(es)\x1b[0m — re-running tests...\n`);
  }

  console.log('\x1b[33mMax iterations reached or fix loop broken.\x1b[0m\n');
  return { ok: false, iterations: maxIter };
}

function extractFailures(output) {
  const lines = output.split('\n');
  const failures = [];
  let inFailure = false;
  let current = '';

  for (const line of lines) {
    if (/^\s*(FAIL|ERROR|AssertionError|[0-9]+ (passing|pending|failing))\b/i.test(line)) {
      inFailure = true;
      current = line.trim();
    } else if (inFailure && /^\s*(at |^\s*$)/.test(line)) {
      if (current) { failures.push(current); current = ''; }
      inFailure = false;
    } else if (inFailure && line.includes('expected') || line.includes('received')) {
      current += ' | ' + line.trim();
    }
  }
  if (current) failures.push(current);

  // fallback: grep for common patterns
  if (!failures.length) {
    const re = /((?:FAIL|ERROR|AssertionError)[^\n]+)/g;
    let m;
    while ((m = re.exec(output)) !== null) failures.push(m[1].trim());
  }
  return failures.slice(0, 10);
}

function buildFixPrompt(failures, output) {
  return `You are a senior software engineer fixing failing tests.

## Failing Tests
${failures}

## Test Output
${output.substring(0, 3000)}

## Task
Identify the root cause of each failure and write the minimal fix. Return a JSON object:
{
  "analysis": "brief root cause explanation",
  "fixes": [
    {
      "file": "relative/path/to/file.js",
      "old": "exact code to replace (multiline string)",
      "new": "replacement code (multiline string)"
    }
  ]
}

Rules:
- Only fix actual test failures, not working code
- Use minimal changes — don't rewrite entire files
- If the test itself is wrong, say so in analysis
- Return ONLY valid JSON, no markdown fences`;
}

async function getLLMFix(prompt, projectRoot) {
  try {
    const { chat } = require('../llm-provider');
    const res = await chat({
      model: LLM_MODEL,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2000,
      temperature: 0.3,
    });
    const text = res?.choices?.[0]?.message?.content || '';
    const json = text.match(/\{[\s\S]*\}/);
    if (!json) return null;
    return JSON.parse(json[0]);
  } catch (e) {
    return null;
  }
}

function applyFixes(fixResult, projectRoot) {
  let applied = 0;
  try {
    for (const fix of (fixResult?.fixes || [])) {
      const filePath = path.join(projectRoot, fix.file);
      if (!fs.existsSync(filePath)) {
        console.log(`  \x1b[33m  ${fix.file}: file not found, skipping\x1b[0m`);
        continue;
      }
      const content = fs.readFileSync(filePath, 'utf8');
      const newContent = content.replace(fix.old, fix.new);
      if (newContent === content) {
        console.log(`  \x1b[33m  ${fix.file}: pattern not found, skipping\x1b[0m`);
        continue;
      }
      fs.writeFileSync(filePath, newContent, 'utf8');
      console.log(`  \x1b[32m  ${fix.file}: fixed\x1b[0m`);
      applied++;
    }
  } catch (e) {
    console.log(`  \x1b[31m  apply error: ${e.message}\x1b[0m`);
  }
  return applied;
}

module.exports = { run };
