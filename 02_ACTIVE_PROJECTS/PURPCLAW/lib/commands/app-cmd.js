'use strict';
/**
 * App command handler for bin/purpclaw.js switch.
 * Lives in lib/ so sibling Claude Code processes can't overwrite it.
 * MUST call process.exit(0) after async work completes — otherwise the
 * parent CLI hangs because the fork() child keeps the event loop alive.
 */
module.exports = {
  async runAppCmd(args, deps) {
    const { loadCmd, sharedCtx } = deps;
    const cmd = loadCmd('desktop');
    try {
      await cmd.run(args, sharedCtx());
    } finally {
      process.exit(0);
    }
  }
};
