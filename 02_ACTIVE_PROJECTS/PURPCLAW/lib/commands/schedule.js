"use strict";

/**
 * purpclaw schedule - PurpClaw-native cron scheduling
 * Uses existing cron-manager.js (SQLite-based, Hermes-free).
 *
 *   purpclaw schedule list              -- show all scheduled tasks
 *   purpclaw schedule add "prompt" --every=2h  -- add a recurring task
 *   purpclaw schedule add "prompt" --cron="0 * * * *"  -- add with raw cron
 *   purpclaw schedule remove <id>       -- remove a task
 *   purpclaw schedule run <id>          -- run a task immediately
 */

const { CronScheduler, add, list, remove: cronRemove, run: cronRun } = require('../cron-manager');

let _scheduler = null;

function getScheduler() {
  if (!_scheduler) {
    _scheduler = new CronScheduler({ intervalMs: 30_000 }).start();
  }
  return _scheduler;
}

function banner(ctx) {
  const C = ctx.C || {};
  const col = ctx.col || ((c, s) => s);
  console.log('\n  PURPCLAW SCHEDULE  · native cron (Hermes-free)\n');
}

async function run(args, ctx) {
  if (args.includes('--help') || args.includes('-h')) {
    console.log('\n  purpclaw schedule list                  show all scheduled tasks');
    console.log('  purpclaw schedule add "<prompt>" --every=<n>   add a recurring task');
    console.log('  purpclaw schedule remove <id>          remove a task');
    console.log('  purpclaw schedule run <id>            run a task immediately');
    console.log('  purpclaw schedule --help              this help\n');
    return;
  }
  const C = ctx.C || {};
  const col = ctx.col || ((c, s) => s);
  const PURP_DIR = ctx.PURP_DIR || process.cwd();
  const sub = (args[0] || 'list').toLowerCase();
  const rest = args.slice(1);

  // list
  if (sub === 'list' || sub === 'ls') {
    banner(ctx);
    const jobs = list('default');
    if (!jobs.length) {
      console.log('  No scheduled tasks. Add one:');
      console.log('  purpclaw schedule add "check system health" --every=1h\n');
      return;
    }
    console.log('  ID  NAME/PROMPT  SCHEDULE  NEXT RUN  LAST RUN  STATUS');
    console.log('  ' + '-'.repeat(100));
    for (const j of jobs) {
      const name = (j.name || j.prompt || '').slice(0, 46);
      const sched = (j.schedule || '').padEnd(14);
      const next = j.next_run ? j.next_run.replace('T', ' ').slice(0, 19) : '--';
      const last = j.last_run ? j.last_run.replace('T', ' ').slice(0, 19) : 'never';
      const status = j.status === 'enabled' ? 'enabled'
                 : j.status === 'running' ? 'running'
                 : (j.status || '--');
      console.log(`  ${j.id.slice(0, 20)}  ${name.padEnd(48)}  ${sched}  ${next}  ${last}  ${status}`);
    }
    console.log('');
    return;
  }

  // add
  if (sub === 'add') {
    banner(ctx);
    const prompt = rest.filter(a => !a.startsWith('--')).join(' ').trim();
    const everyArg = rest.find(a => a.startsWith('--every='));
    const cronArg  = rest.find(a => a.startsWith('--cron='));
    const nameArg  = rest.find(a => a.startsWith('--name='));

    if (!prompt) {
      console.log('Usage: purpclaw schedule add "prompt text" --every=2h');
      console.log('  --every=     natural interval: 30m, 1h, 2h, 3h, 6h, 12h, 1d, 2d, 7d');
      console.log('  --cron=      raw cron syntax: minute hour day month weekday');
      console.log('  --name=      optional label for the task\n');
      return;
    }

    const schedule = cronArg ? cronArg.split('=')[1]
                  : everyArg ? everyArg.split('=')[1]
                  : null;

    if (!schedule) {
      console.log('ERROR: must provide --every=<interval> or --cron=<expression>');
      console.log('Intervals: 30m, 1h, 2h, 3h, 6h, 12h, 1d, 2d, 7d\n');
      return;
    }

    try {
      let normalized;
      if (cronArg) {
        normalized = cronArg.split('=')[1];
      } else {
        const { NL } = require('../scheduler/nl-cron');
        const parsed = NL.parse(schedule);
        if (!parsed.ok) {
          console.log('ERROR: invalid interval: ' + schedule);
          console.log('Valid intervals: 30m, 1h, 2h, 3h, 6h, 12h, 1d, 2d, 7d\n');
          return;
        }
        normalized = parsed.cron;
      }

      const job = add({
        prompt,
        schedule: normalized,
        name: nameArg ? nameArg.split('=')[1] : null,
        profile: 'default',
        skills: [],
      });

      console.log('OK: scheduled  ' + (job.name || prompt.slice(0, 60)));
      console.log('  id:     ' + job.id);
      console.log('  every:  ' + schedule + ' -> ' + job.schedule);
      console.log('  next:   ' + (job.next_run || '').replace('T', ' ').slice(0, 19));
      console.log('');
    } catch (e) {
      console.log('ERROR: failed: ' + e.message + '\n');
    }
    return;
  }

  // remove
  if (sub === 'remove' || sub === 'rm' || sub === 'delete' || sub === 'del') {
    banner(ctx);
    const id = rest[0];
    if (!id) {
      console.log('Usage: purpclaw schedule remove <id>\n');
      return;
    }
    const ok = cronRemove(id);
    if (ok) {
      console.log('OK: removed  ' + id.slice(0, 20) + '\n');
    } else {
      console.log('ERROR: not found: ' + id + '\n');
    }
    return;
  }

  // run (manual trigger)
  if (sub === 'run' || sub === 'execute' || sub === 'trigger') {
    banner(ctx);
    const id = rest[0];
    if (!id) {
      console.log('Usage: purpclaw schedule run <id>\n');
      return;
    }
    console.log('Running: ' + id.slice(0, 20) + '...\n');
    try {
      const result = await cronRun(id, {
        provider: null,
        model: null,
        cwd: PURP_DIR,
        maxTurns: 10,
      });
      const msg = (result.result || '').slice(0, 120);
      console.log('OK: completed  result: ' + msg + '\n');
    } catch (e) {
      console.log('ERROR: failed: ' + e.message + '\n');
    }
    return;
  }

  // help
  banner(ctx);
  console.log('Commands:');
  console.log('  purpclaw schedule list                 show all scheduled tasks');
  console.log('  purpclaw schedule add "..." --every=2h add a recurring task');
  console.log('  purpclaw schedule add "..." --cron="0 * * * *" add with raw cron');
  console.log('  purpclaw schedule remove <id>          remove a task');
  console.log('  purpclaw schedule run <id>             run a task immediately');
  console.log('');
  console.log('Intervals (--every):');
  console.log('  30m          every 30 minutes');
  console.log('  1h, 2h, 3h, 6h, 12h  hourly to twice-daily');
  console.log('  1d, 2d, 7d  daily, bi-daily, weekly');
  console.log('');
  console.log('Tasks run through the agent gateway (same as purpclaw ask).');
  console.log('Persistence: .purpclaw/state.db (SQLite, Hermes-free)\n');
}

module.exports = { run };
