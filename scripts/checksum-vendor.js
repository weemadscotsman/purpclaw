// ponytail vendor checksum generator.
// Run with: node scripts/checksum-vendor.js
// Writes vendor/ponytail/PURPCLAW_VENDOR_CHECKSUMS.json with a SHA-256
// per file. Used to detect upstream drift and to gate vendor upgrades.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..', 'vendor', 'ponytail');
const out = {};

function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      walk(p);
    } else if (e.isFile()) {
      const buf = fs.readFileSync(p);
      const rel = path.relative(path.resolve(__dirname, '..'), p).split(path.sep).join('/');
      out[rel] = crypto.createHash('sha256').update(buf).digest('hex');
    }
  }
}

walk(root);

const manifest = {
  generated_at: new Date().toISOString(),
  vendor: 'ponytail',
  file_count: Object.keys(out).length,
  files: out,
};

const target = path.join(root, 'PURPCLAW_VENDOR_CHECKSUMS.json');
fs.writeFileSync(target, JSON.stringify(manifest, null, 2) + '\n');
console.log(`[ponytail-vendor] hashed ${manifest.file_count} files -> ${path.relative(path.resolve(__dirname, '..'), target)}`);
