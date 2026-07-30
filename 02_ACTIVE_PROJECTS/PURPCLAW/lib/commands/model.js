'use strict';

/**
 * lib/commands/model.js
 * /model — show or switch model
 */
function run(args) {
  const current = process.env.LLM_MODEL || 'not set';
  const provider = process.env.LLM_PROVIDER || 'not set';

  if (!args.length || args[0] === 'show') {
    return `Provider: ${provider}\nModel:    ${current}`;
  }

  const newModel = args.join(' ');
  return `Set LLM_MODEL=${newModel} in .env\nThen restart: pm2 delete all && pm2 start ecosystem.config.js`;
}

module.exports = { run };
