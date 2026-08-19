'use strict';

const assert = require('assert');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { UpdateManager } = require('../../lib/update/update-manager');
const { makeUpdateSlashHandler } = require('../../lib/update/slash-update');

async function mkRelease(root, version, releaseId) {
  const dir = path.join(root, `${version}-${releaseId}`);
  await fsp.mkdir(dir, { recursive: true });
  const app = Buffer.from(`module.exports=${JSON.stringify(version)};\n`);
  await fsp.writeFile(path.join(dir, 'app.js'), app);
  const sha256 = crypto.createHash('sha256').update(app).digest('hex');
  await fsp.writeFile(path.join(dir, 'purpclaw-update.json'), JSON.stringify({
    product: 'purpclaw',
    version,
    releaseId,
    entry: 'app.js',
    channel: 'local',
    createdAt: new Date().toISOString(),
    files: [{ path: 'app.js', sha256 }]
  }, null, 2));
  return dir;
}

async function run() {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'purpclaw-update-test-'));
  const dataRoot = path.join(tmp, 'data');
  const sourceRoot = path.join(tmp, 'sources');
  await fsp.mkdir(sourceRoot, { recursive: true });

  const events = [];
  const activations = [];
  const manager = new UpdateManager({
    dataRoot,
    createSnapshot: async () => ({ snapshot: 'ok' }),
    preflightRelease: async () => ({ ok: true }),
    verifyReleaseRuntime: async () => ({ ok: true }),
    checkpointRuntime: async () => ({ sessions: ['S1'], processes: ['P1'] }),
    activateRelease: async x => activations.push(x.next.version),
    postActivationHealth: async () => ({ ok: true }),
    rollbackRuntime: async () => {}
  });
  manager.on('event', e => events.push(e.type));
  await manager.init();

  const r1 = await mkRelease(sourceRoot, '0.3.0', 'r1');
  const a1 = await manager.applyDirectory(r1);
  assert.equal(a1.current.version, '0.3.0');

  const r2 = await mkRelease(sourceRoot, '0.3.1-dev.1', 'r2');
  const a2 = await manager.applyDirectory(r2);
  assert.equal(a2.current.version, '0.3.1-dev.1');
  assert.equal(a2.previous.version, '0.3.0');

  const status = await manager.status();
  assert.equal(status.current.version, '0.3.1-dev.1');
  assert.equal(status.previous.version, '0.3.0');
  assert.equal(status.rollbackAvailable, true);

  await manager.setAutoMode('safe');
  await manager.setChannel('local');

  const lines = [];
  const slash = makeUpdateSlashHandler(manager, { print: s => lines.push(s) });
  await slash('/update status');
  assert(lines.some(x => x.includes('0.3.1-dev.1')));

  const rb = await manager.rollback();
  assert.equal(rb.current.version, '0.3.0');

  assert(events.includes('runtime.update.staged'));
  assert(events.includes('runtime.update.completed'));
  assert(events.includes('runtime.update.rolled_back'));
  assert.deepEqual(activations, ['0.3.0', '0.3.1-dev.1']);

  console.log('PASS live update contract');
  console.log(`events=${events.length}`);
  console.log(`dataRoot=${dataRoot}`);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
