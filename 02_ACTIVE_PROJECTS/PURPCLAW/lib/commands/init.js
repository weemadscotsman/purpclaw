'use strict';

/**
 * lib/commands/init.js
 * /init — re-run first-run setup (workspace, .env, skills)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const WORKSPACE = path.join(ROOT, 'workspace');

function run(args) {
  const steps = [];
  const errors = [];

  // Ensure workspace dir
  try {
    fs.mkdirSync(WORKSPACE, { recursive: true });
    steps.push('workspace/ created');
  } catch (e) {
    errors.push(`workspace: ${e.message}`);
  }

  // Ensure .env from example
  const envExample = path.join(ROOT, '.env.example');
  const envFile = path.join(ROOT, '.env');
  if (!fs.existsSync(envFile) && fs.existsSync(envExample)) {
    try {
      fs.copyFileSync(envExample, envFile);
      steps.push('.env copied from .env.example');
    } catch (e) {
      errors.push(`.env copy: ${e.message}`);
    }
  } else if (fs.existsSync(envFile)) {
    steps.push('.env already exists');
  } else {
    errors.push('.env.example not found — cannot scaffold');
  }

  const msg = steps.length ? steps.join('\n') : 'nothing to do';
  const err = errors.length ? `\nErrors:\n${errors.join('\n')}` : '';
  return msg + err;
}

module.exports = { run };
