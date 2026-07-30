'use strict';
/**
 * lib/commands/harvest.js — purpclaw harvest
 * Data Harvester: crawl → fingerprint → classify → extract → index → search
 */
const path = require('path');
const fs = require('fs');
const { scanDirectory, classifyFile } = require('../harvest/crawler');
const { extract } = require('../harvest/extractors');
const indexer = require('../harvest/indexer');

const HARVEST_CONFIG = path.join(__dirname, '..', '..', 'harvest-config.json');

async function run(args, ctx) {
  const { C, col } = ctx;
  const sub = (args[0] || 'help').toLowerCase();
  const rest = args.slice(1);

  if (sub === 'help' || sub === '--help') {
    return showHelp(ctx);
  }

  if (sub === 'scan') {
    const dirPath = rest[0] || process.cwd();
    const isPreview = rest.includes('--preview');
    
    console.log(`\n  ${col(C.cyan, '📡 SCANNING')}  ${col(C.white, dirPath)}\n`);
    
    const progress = (msg) => process.stdout.write(`\r${msg}`);
    const result = scanDirectory(dirPath, { progress });
    console.log(`\r  ${col(C.green, '✓')}  ${result.count} files found`);
    if (result.errors.length > 0) {
      console.log(`  ${col(C.yellow, '⚠')}  ${result.errors.length} errors (permissions, etc)`);
    }
    
    // Group by type
    const byType = {};
    for (const f of result.files) {
      const type = classifyFile(f);
      byType[type] = (byType[type] || 0) + 1;
    }
    console.log(`  ${col(C.gray, 'by type:')}`);
    for (const [type, count] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${col(C.white, type.padEnd(18))} ${count}`);
    }
    
    if (isPreview) {
      console.log(`\n  ${col(C.gray, 'samples:')}`);
      for (const f of result.files.slice(0, 10)) {
        const type = classifyFile(f);
        console.log(`    ${col(C.cyan, type.padEnd(14))} ${col(C.gray, f.path.slice(-60).padStart(60))}`);
      }
    }
    console.log('');
    
    // Save scan result for later use
    const scanCache = path.join(__dirname, '..', '..', 'agent_work', 'harvest-scan-cache.json');
    fs.writeFileSync(scanCache, JSON.stringify(result.files.slice(0, 50000)));
    console.log(`  ${col(C.gray, `cached ${Math.min(result.files.length, 50000)} files for harvest run`)}\n`);
    
    return;
  }

  if (sub === 'run') {
    const scanCache = path.join(__dirname, '..', '..', 'agent_work', 'harvest-scan-cache.json');
    if (!fs.existsSync(scanCache)) {
      console.log(`\n  ${col(C.yellow, '⚠')}  No scan cache found. Run: purpclaw harvest scan <dir> first\n`);
      return;
    }
    
    const files = JSON.parse(fs.readFileSync(scanCache, 'utf8'));
    const limit = parseInt(rest.find(a => a.startsWith('--limit='))?.split('=')[1] || '1000', 10);
    const toProcess = files.slice(0, limit);
    
    console.log(`\n  ${col(C.cyan, '🔧 HARVEST RUN')}  processing ${toProcess.length} files\n`);
    
    let ingested = 0, errors = 0, skipped = 0;
    const entries = [];
    
    for (let i = 0; i < toProcess.length; i++) {
      const file = toProcess[i];
      process.stdout.write(`\r  ${col(C.gray, `[${i + 1}/${toProcess.length}]`)} ${file.path.slice(-60).padStart(60)}`);
      
      try {
        const ext = path.extname(file.path).toLowerCase();
        const result = await extract(file.path, ext);
        
        if (result.ok && result.text && result.text.length > 20) {
          entries.push({
            ts: Date.now(),
            source: 'harvest',
            category: classifyFile(file),
            file: file.path,
            hash: file.hash,
            content: result.text.substring(0, 8000),
            metadata: result.metadata,
          });
          ingested++;
          
          if (entries.length >= 50) {
            // Batch ingest to buffer
            for (const e of entries) {
              indexer.appendToBuffer(e);
              indexer.addToLedger(e);
            }
            indexer.updateIndex(entries);
            entries.length = 0;
          }
        } else {
          skipped++;
        }
      } catch (e) {
        errors++;
      }
    }
    
    // Flush remaining
    if (entries.length > 0) {
      for (const e of entries) {
        indexer.appendToBuffer(e);
        indexer.addToLedger(e);
      }
      indexer.updateIndex(entries);
    }
    
    const status = indexer.getStatus();
    console.log(`\n  ${col(C.green, '✓')}  Harvest complete`);
    console.log(`  ${col(C.gray, `ingested: ${ingested}, skipped: ${skipped}, errors: ${errors}`)}`);
    console.log(`  ${col(C.gray, `index: ${status.indexedFiles} files`)}`);
    console.log('');
    return;
  }

  if (sub === 'search') {
    const query = rest.join(' ');
    if (!query) {
      console.log(`\n  ${col(C.yellow, 'usage:')} purpclaw harvest search <query>\n`);
      return;
    }
    const r = indexer.searchIndex(query);
    console.log(`\n  ${col(C.cyan, '🔍')}  ${r.count} results for "${query}"`);
    if (r.count > 0) {
      for (const f of r.results.slice(0, 20)) {
        const short = f.path.length > 70 ? '...' + f.path.slice(-67) : f.path;
        console.log(`  ${col(C.gray, '[' + f.category + ']')} ${col(C.white, short)}`);
      }
    }
    console.log('');
    return;
  }

  if (sub === 'status') {
    const s = indexer.getStatus();
    console.log(`\n  ${col(C.cyan, '📊 HARVEST STATUS')}`);
    console.log(`  ${col(C.gray, `indexed:  ${s.indexedFiles} files`)}`);
    console.log(`  ${col(C.gray, `ledger:   ${s.ledgerEntries} entries`)}`);
    console.log(`  ${col(C.gray, `size:     ${(s.totalSize / 1024 / 1024).toFixed(1)} MB`)}`);
    if (s.updatedAt) console.log(`  ${col(C.gray, `updated:  ${s.updatedAt}`)}`);
    if (Object.keys(s.categories).length > 0) {
      console.log(`  ${col(C.gray, 'categories:')}`);
      for (const [cat, n] of Object.entries(s.categories)) {
        console.log(`    ${col(C.white, cat.padEnd(18))} ${n}`);
      }
    }
    console.log('');
    return;
  }

  if (sub === 'convert') {
    const filePath = rest[0];
    if (!filePath || !fs.existsSync(filePath)) {
      console.log(`\n  ${col(C.yellow, 'usage:')} purpclaw harvest convert <file>\n`);
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    console.log(`\n  ${col(C.cyan, '🔄 CONVERTING')}  ${filePath}`);
    const result = await extract(filePath, ext);
    if (result.ok) {
      console.log(`  ${col(C.green, '✓')}  ${result.method} — ${result.text.length} chars`);
      console.log(`  ${col(C.gray, result.text.substring(0, 300))}`);
      if (result.text.length > 300) console.log(`  ${col(C.gray, '...')}`);
    } else {
      console.log(`  ${col(C.yellow, '⚠')}  ${result.error || 'No extractor available'}`);
    }
    console.log('');
    return;
  }

  showHelp(ctx);
}

function showHelp(ctx) {
  const { C, col } = ctx;
  console.log(`\n  ${col(C.cyan, '🌾 PURPCLAW DATA HARVESTER')}`);
  console.log(`  ${col(C.gray, 'Turn your hard drives into PurpClaw\'s external memory.')}\n`);
  console.log(`  ${col(C.cyan, 'purpclaw harvest scan <dir>')}          crawl directory, show stats`);
  console.log(`  ${col(C.cyan, 'purpclaw harvest scan <dir> --preview')} scan + show sample files`);
  console.log(`  ${col(C.cyan, 'purpclaw harvest run')}                  extract + index cached scan`);
  console.log(`  ${col(C.cyan, 'purpclaw harvest run --limit=N')}        process at most N files`);
  console.log(`  ${col(C.cyan, 'purpclaw harvest search <query>')}       search indexed content`);
  console.log(`  ${col(C.cyan, 'purpclaw harvest status')}               harvest index stats`);
  console.log(`  ${col(C.cyan, 'purpclaw harvest convert <file>')}       test-extract a single file`);
  console.log(`  ${col(C.cyan, 'purpclaw harvest help')}                 this help\n`);
}

module.exports = { run };
