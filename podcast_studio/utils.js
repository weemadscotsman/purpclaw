/**
 * Utility functions for Podcast Studio
 */

/**
 * Create a simple async queue for rate limiting
 */
function createQueue() {
  let queue = [];
  let isProcessing = false;

  async function process() {
    if (isProcessing || queue.length === 0) return;
    isProcessing = true;

    while (queue.length > 0) {
      const task = queue.shift();
      try {
        await task();
      } catch (e) {
        console.error('[Queue] Task error:', e.message);
      }
      // Rate limit delay between tasks
      await new Promise(r => setTimeout(r, 200));
    }

    isProcessing = false;
  }

  return {
    add: (task) => {
      queue.push(task);
      process();
    },
    clear: () => { queue = []; },
    size: () => queue.length
  };
}

module.exports = { createQueue };