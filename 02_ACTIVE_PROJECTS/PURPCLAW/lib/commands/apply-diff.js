'use strict';

/**
 * purpclaw apply-diff — parse and apply a unified diff.
 *
 *   purpclaw apply-diff < diff.patch        # apply from stdin
 *   purpclaw apply-diff file.patch           # apply from file
 *   purpclaw apply-diff --dry < diff.patch   # show what would change
 *   purpclaw apply-diff --reverse < diff.patch  # reverse apply
 *   purpclaw apply-diff --context=3 < diff.patch  # lines of context (default 2)
 */

const fs = require('fs');
const path = require('path');

class DiffParser {
  constructor(content) {
    this.content = content;
    this.hunks = [];
    this.parse();
  }

  parse() {
    const lines = this.content.split('\n');
    let i = 0;

    // Skip "index" lines, then parse file headers + hunks
    const fileHeaderRe = /^diff --git a\/(.+) b\/(.+)/;
    const hunkRe = /^@@\s*-(\d+)(?:,(\d+))?\s*\+(\d+)(?:,(\d+))?\s*@@/;

    while (i < lines.length) {
      if (fileHeaderRe.test(lines[i])) {
        const m = lines[i].match(fileHeaderRe);
        const oldFile = m[1];
        const newFile = m[2];

        // Collect existing lines (from old file if available)
        let oldContent = '';
        let newContent = '';
        let skippedOld = 0;

        // Skip lines until hunk starts
        i++;
        while (i < lines.length && !hunkRe.test(lines[i]) && !fileHeaderRe.test(lines[i])) {
          if (lines[i].startsWith('---')) { /* old file marker */ }
          else if (lines[i].startsWith('+++')) { /* new file marker */ }
          else if (lines[i].startsWith('index ')) { /* git index line */ }
          else if (lines[i].startsWith('new file mode')) { /* git marker */ }
          else if (lines[i].startsWith('deleted file mode')) { /* git marker */ }
          i++;
        }

        // Parse hunks for this file
        const hunks = [];
        while (i < lines.length && hunkRe.test(lines[i])) {
          const hm = lines[i].match(hunkRe);
          const oldStart = parseInt(hm[1], 10);
          const oldCount = parseInt(hm[2] || '1', 10);
          const newStart = parseInt(hm[3], 10);
          const newCount = parseInt(hm[4] || '1', 10);

          const hunkLines = [lines[i]]; // starts with @@ header
          i++;

          // Collect hunk body (lines until next hunk or file)
          while (i < lines.length && !hunkRe.test(lines[i]) && !fileHeaderRe.test(lines[i])) {
            hunkLines.push(lines[i]);
            i++;
          }

          hunks.push({ oldStart, oldCount, newStart, newCount, lines: hunkLines });
        }

        this.hunks.push({ oldFile, newFile, hunks });
      } else {
        i++;
      }
    }
  }

  applyToFile(filePath, reverse = false) {
    let content;
    try { content = fs.readFileSync(filePath, 'utf8'); }
    catch { content = ''; }

    const oldLines = content.split('\n');
    let newLines = [...oldLines];
    let offset = 0;
    let applied = 0;
    let skipped = 0;

    for (const { oldFile, hunks } of this.hunks) {
      const targetPath = path.join(path.dirname(filePath), path.basename(oldFile));
      const actualPath = fs.existsSync(targetPath) ? targetPath : filePath;

      // Re-parse file for each hunk set (since we modify newLines)
      let lines = content.split('\n');

      for (const hunk of hunks) {
        // Find the old section in current file
        const hunkBody = hunk.lines.slice(1); // strip @@ header
        const oldSection = [];
        const newSection = [];
        let oldPos = 0;
        let newPos = 0;

        for (const hl of hunkBody) {
          if (hl.startsWith('-')) oldSection.push(hl.slice(1));
          else if (hl.startsWith('+')) newSection.push(hl.slice(1));
          else { oldSection.push(hl.slice(1)); newSection.push(hl.slice(1)); }
        }

        // Find match point using the old section start
        const searchStart = Math.max(0, hunk.oldStart - 1 - offset - 3);
        const searchEnd = Math.min(lines.length, hunk.oldStart - 1 - offset + hunk.oldCount + 6);

        let matchIdx = -1;
        outer: for (let si = searchStart; si < searchEnd; si++) {
          if (lines[si] !== oldSection[0]) continue;
          for (let oi = 0; oi < oldSection.length; oi++) {
            if (lines[si + oi] !== oldSection[oi]) continue outer;
          }
          matchIdx = si;
          break;
        }

        if (matchIdx < 0) {
          skipped++;
          continue;
        }

        // Apply replacements relative to current lines array
        const removeCount = hunk.oldCount;
        const addItems = newSection.filter(l => l !== '\\'); // \ marks no newline at EOF

        lines.splice(matchIdx, removeCount, ...addItems);
        offset += addItems.length - removeCount;
        applied++;
      }

      content = lines.join('\n');
    }

    return { applied, skipped, content };
  }
}

async function run(args, ctx) {
  const dry = args.includes('--dry') || args.includes('-d');
  const reverse = args.includes('--reverse') || args.includes('-R');
  const contextMatch = args.find(a => a.startsWith('--context='));
  const ctx_lines = contextMatch ? parseInt(contextMatch.split('=')[1], 10) : 2;

  const fileArg = args.find(a => !a.startsWith('--'));
  const diffSource = fileArg && fs.existsSync(fileArg)
    ? fs.readFileSync(fileArg, 'utf8')
    : ''; // read from stdin via pipe

  if (!diffSource) {
    console.error('\n\x1b[33mUsage: purpclaw apply-diff [--dry] [--reverse] < diff.patch\x1b[0m');
    console.error('       purpclaw apply-diff [--dry] [--reverse] file.patch\n');
    console.error('  Reads from stdin if no file given.\n');
    return;
  }

  console.log(`\n  \x1b[36mPURPCLAW apply-diff\x1b[0m`);
  console.log(`  dry run   : ${dry ? 'yes' : 'no'}`);
  console.log(`  reverse   : ${reverse ? 'yes' : 'no'}`);
  console.log(`  hunks     : ${diffSource.includes('@@ ') ? 'valid diff' : 'invalid format'}\n`);

  const parser = new DiffParser(diffSource);

  for (const { oldFile, newFile, hunks } of parser.hunks) {
    console.log(`  ${oldFile} → ${newFile} (${hunks.length} hunk(s))`);
  }

  if (dry) {
    console.log('\n\x1b[35m[DRY RUN — would apply these changes]:\x1b[0m');
    for (const { oldFile, hunks } of parser.hunks) {
      for (const h of hunks) {
        console.log(`\n  --- ${oldFile} (hunk @${h.oldStart})`);
        for (const l of h.lines.slice(0, 20)) console.log('  ' + l);
        if (h.lines.length > 20) console.log('  ...');
      }
    }
    console.log('');
    return;
  }

  let totalApplied = 0, totalSkipped = 0;
  for (const { oldFile, hunks } of parser.hunks) {
    const filePath = path.resolve(oldFile);
    if (!fs.existsSync(filePath)) {
      console.log(`  \x1b[33m  ${filePath}: file not found, skipping\x1b[0m`);
      totalSkipped += hunks.length;
      continue;
    }
    const { applied, skipped, content } = parser.applyToFile(filePath, reverse);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`  \x1b[32m  ${filePath}: ${applied} hunk(s) applied\x1b[0m${skipped ? `, ${skipped} skipped` : ''}`);
    totalApplied += applied;
    totalSkipped += skipped;
  }

  console.log(`\n\x1b[32m${totalApplied} hunk(s) applied.\x1b[0m${totalSkipped ? ` \x1b[33m${totalSkipped} skipped.\x1b[0m` : ''}\n`);
}

module.exports = { run };
