'use strict';
/**
 * App command handler for bin/purpclaw.js switch.
 * Lives in lib/ so sibling Claude Code processes can't overwrite it.
 */
module.exports = {
  async runAppCmd(args, deps) {
    const { loadCmd, sharedCtx } = deps;
    const cmd = loadCmd('desktop');
    await cmd.run(args, sharedCtx());
  }
};
