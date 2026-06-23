'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const REQUIRED_DOCS = [
  'docs/INDEX.md',
  'docs/CANONICAL_MAP.md',
  'docs/WHERE_THINGS_GO.md',
  'docs/ROUTING_AND_BUILD_SPEC.md',
  'docs/ROUTE_INDEX.md',
  'docs/SERVICE_RUNTIME_INDEX.md',
];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

function walk(dir, predicate, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, predicate, out);
    } else if (predicate(full)) {
      out.push(full);
    }
  }
  return out;
}

function toPosix(rel) {
  return rel.split(path.sep).join('/');
}

function routeFromApiFile(file) {
  const rel = path.relative(path.join(ROOT, 'app', 'api'), file);
  const without = toPosix(rel).replace(/\/route\.ts$/, '').replace(/route\.ts$/, '');
  return `/api${without ? `/${without}` : ''}`;
}

function routeFromPageFile(file) {
  const rel = toPosix(path.relative(path.join(ROOT, 'app'), file));
  if (rel.startsWith('_archive/')) return null;
  const route = rel.replace(/\/page\.tsx$/, '').replace(/page\.tsx$/, '');
  return route ? `/${route}` : '/';
}

function assert(condition, message, failures) {
  if (!condition) failures.push(message);
}

function main() {
  const failures = [];

  for (const doc of REQUIRED_DOCS) {
    assert(exists(doc), `missing required doc: ${doc}`, failures);
  }

  if (failures.length) {
    console.error(failures.join('\n'));
    process.exit(1);
  }

  const index = read('docs/INDEX.md');
  for (const doc of REQUIRED_DOCS.slice(1)) {
    assert(index.includes(path.basename(doc)), `docs/INDEX.md does not link ${doc}`, failures);
  }

  const routeIndex = read('docs/ROUTE_INDEX.md');
  const apiRoutes = walk(
    path.join(ROOT, 'app', 'api'),
    file => path.basename(file) === 'route.ts'
  ).map(routeFromApiFile).sort();
  for (const route of apiRoutes) {
    assert(routeIndex.includes(`\`${route}\``), `ROUTE_INDEX.md missing API route ${route}`, failures);
  }

  const pageRoutes = walk(
    path.join(ROOT, 'app'),
    file => path.basename(file) === 'page.tsx'
  ).map(routeFromPageFile).filter(Boolean).sort();
  for (const route of pageRoutes) {
    assert(routeIndex.includes(`\`${route}\``), `ROUTE_INDEX.md missing page route ${route}`, failures);
  }

  const serviceIndex = read('docs/SERVICE_RUNTIME_INDEX.md');
  const { SERVICES } = require(path.join(ROOT, 'service_registry.js'));
  for (const service of SERVICES) {
    assert(serviceIndex.includes(`\`${service.key}\``), `SERVICE_RUNTIME_INDEX.md missing service key ${service.key}`, failures);
    assert(serviceIndex.includes(`\`${service.pm2}\``), `SERVICE_RUNTIME_INDEX.md missing PM2 name ${service.pm2}`, failures);
  }

  if (failures.length) {
    console.error(failures.join('\n'));
    process.exit(1);
  }

  console.log(`docs validation passed (${apiRoutes.length} API routes, ${pageRoutes.length} page routes, ${SERVICES.length} registry services)`);
}

main();

