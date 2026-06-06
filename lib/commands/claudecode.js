'use strict';
/**
 * lib/commands/claudecode.js — Claude Code-style utility commands.
 *
 *   purpclaw commit             — generate a commit message from staged/unstaged diff
 *   purpclaw review             — review the working tree, surface issues
 *   purpclaw find <symbol>      — semantic + symbol search (alias for `code search`)
 *
 * Each command is one-shot: no agent loop, just call the LLM once with
 * the relevant context, stream the response, exit.
 *
 * Streaming tokens are emitted on stdout. Pipe-friendly: `purpclaw commit
 * | git apply` won't work, but the LLM-generated message can be passed
 * via -m by re-running.
 */

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { execSafe } = require('../child-registry');

const PURP_DIR = process.env.PURP_DIR || path.resolve(__dirname, '..', '..');

/**
 * Run a shell command and return { stdout, stderr, code }.
 * Tracked + time-bounded via the child registry.
 */
async function sh(cmd, opts = {}) {
  const r = await execSafe(
    process.platform === 'win32' ? 'cmd.exe' : 'sh',
    process.platform === 'win32' ? ['/c', cmd] : ['-c', cmd],
    { cwd: opts.cwd || process.cwd(), timeoutMs: opts.timeoutMs || 30_000, shell: false, stdio: ['ignore', 'pipe', 'pipe'] }
  );
  return { stdout: r.stdout || '', stderr: r.stderr || '', code: r.code };
}

async function getDiff(opts = {}) {
  // 1. Staged changes
  const staged = await sh('git diff --cached', opts);
  // 2. Unstaged changes
  const unstaged = await sh('git diff', opts);
  // 3. Untracked files (just the names)
  const untracked = await sh('git ls-files --others --exclude-standard', opts);
  return { staged: staged.stdout, unstaged: unstaged.stdout, untracked: untracked.stdout.trim().split('\n').filter(Boolean) };
}

async function streamLlm(prompt, opts = {}) {
  const llm = require('../llm-provider');
  const provider = opts.provider || process.env.LLM_PROVIDER;
  const model    = opts.model    || (opts.provider ? null : process.env.LLM_MODEL);
  const messages = [
    { role: 'system', content: opts.system || 'You are Quill, a senior engineer. Be terse. Output ONLY the requested text — no preamble, no labels, no markdown code blocks unless asked.' },
    { role: 'user',   content: prompt },
  ];
  const stream = llm.streamChat(messages, { provider, model, temperature: 0.3, maxTokens: 600 });
  let full = '';
  for await (const chunk of stream) {
    if (chunk.content) {
      process.stdout.write(chunk.content);
      full += chunk.content;
    }
  }
  process.stdout.write('\n');
  return full;
}

// ── commit ───────────────────────────────────────────────────────────────────
async function cmdCommit(args = []) {
  const diff = await getDiff();
  if (!diff.staged && !diff.unstaged && !diff.untracked.length) {
    console.log('nothing to commit. stage some changes first (`git add`) or use `git commit -am`.');
    return 1;
  }
  const parts = [];
  if (diff.staged)   parts.push('STAGED:\n```\n' + diff.staged + '\n```');
  if (diff.unstaged) parts.push('UNSTAGED:\n```\n' + diff.unstaged + '\n```');
  if (diff.untracked.length) parts.push('UNTRACKED:\n' + diff.untracked.map(f => '- ' + f).join('\n'));
  const recent = await sh('git log --oneline -10', {});
  const prompt = [
    'Write a commit message for the following diff. Use Conventional Commits (feat: / fix: / chore: / docs: / refactor: / test: / perf:). Subject line max 72 chars. Blank line. Then 1-3 bullet points explaining the WHY, not the WHAT. Do not include code blocks. Do not include the diff verbatim. No preamble.',
    '',
    'Recent commits (for style):',
    '```',
    recent.stdout.trim(),
    '```',
    '',
    'Changes to commit:',
    parts.join('\n\n'),
  ].join('\n');
  const message = await streamLlm(prompt, { system: 'You write git commit messages. Conventional Commits format. Terse, no preamble.' });
  if (!args.includes('--apply')) {
    console.log('\n--- copy the message above, or rerun with --apply ---');
    return 0;
  }
  // --apply: actually commit
  const tmp = path.join(os.tmpdir(), `purpclaw-commit-${Date.now()}.txt`);
  fs.writeFileSync(tmp, message);
  const r = await sh(`git commit -F "${tmp}"`, {});
  if (r.code === 0) {
    console.log(r.stdout.trim());
    console.log(r.stderr.trim());
  } else {
    console.error('commit failed:');
    console.error(r.stderr);
  }
  fs.unlinkSync(tmp);
  return r.code;
}

// ── review ──────────────────────────────────────────────────────────────────
async function cmdReview(args = []) {
  const diff = await getDiff();
  if (!diff.staged && !diff.unstaged) {
    console.log('no changes to review. stage some changes first.');
    return 1;
  }
  const prompt = [
    'Review the following diff for:',
    '- bugs (correctness, off-by-one, null/undefined, async races)',
    '- security issues (injection, secrets, unsafe paths, eval)',
    '- performance (n+1, blocking calls, missing indexes)',
    '- style issues (unhandled errors, dead code, magic numbers)',
    '- missing tests for the changes',
    '',
    'Output a numbered list of findings. Be terse. For each: file:line, severity (low/med/high), one-line description. If something is fine, say so. No preamble.',
    '',
    'Diff:',
    '```',
    (diff.staged || diff.unstaged).slice(0, 8000),
    '```',
  ].join('\n');
  await streamLlm(prompt, { system: 'You are a senior code reviewer. Terse, concrete, numbered findings. No preamble.' });
  return 0;
}

// ── find (semantic search) ──────────────────────────────────────────────────
async function cmdFind(args = []) {
  const query = args.join(' ').trim();
  if (!query) {
    console.log('usage: purpclaw find <query or symbol name>');
    return 1;
  }
  // Delegate to the existing code search
  const { spawn } = require('child_process');
  const codeCli = path.join(PURP_DIR, 'bin', 'purpclaw.js');
  return new Promise(resolve => {
    const child = spawn(process.execPath, [codeCli, 'code', 'search', query], {
      cwd: process.cwd(), stdio: 'inherit',
    });
    child.on('close', code => resolve(code || 0));
  });
}

async function run(args, ctx) {
  const sub = (args[0] || 'help').toLowerCase();
  const rest = args.slice(1);
  try {
    if (sub === 'commit')  return cmdCommit(rest);
    if (sub === 'review')  return cmdReview(rest);
    if (sub === 'find')    return cmdFind(rest);
    if (sub === 'help' || sub === '--help' || sub === '-h') return printHelp();
    console.error(`unknown claudecode subcommand: ${sub}\n  try: commit | review | find | help`);
    return 1;
  } catch (e) {
    console.error(`error: ${e.message}`);
    return 1;
  }
}

function printHelp() {
  console.log(`
  purpclaw commit  — generate a commit message from staged/unstaged diff
                    add --apply to actually run git commit
  purpclaw review  — review the working tree, surface issues
  purpclaw find <q> — semantic + symbol search (alias for code search)
`);
}

module.exports = { run, cmdCommit, cmdReview, cmdFind, printHelp };
