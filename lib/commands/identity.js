'use strict';
/**
 * lib/commands/identity.js — purpclaw identity
 *   show    — current identity summary
 *   export  — create portable bundle (signed)
 *   import  — reconstruct from bundle
 *   diff    — show what would change
 *   reset   — start fresh
 *   set     — update a field
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const {
  loadIdentity, saveIdentity, updateIdentity,
  showIdentity, diffIdentity, exportIdentity, importIdentity,
  IDENTITY_PATH,
} = require('../identity');

async function run(args, ctx) {
  const { C, col } = ctx;
  const sub = (args[0] || 'show').toLowerCase();
  const rest = args.slice(1);

  if (sub === 'help' || sub === '--help') {
    console.log(`\n  ${col(C.cyan, '🪪  PURPCLAW PORTABLE IDENTITY')}\n`);
    console.log(`  ${col(C.cyan, 'purpclaw identity show')}              current identity summary`);
    console.log(`  ${col(C.cyan, 'purpclaw identity export <path>')}     create portable bundle`);
    console.log(`  ${col(C.cyan, 'purpclaw identity import <path> [--force]')}  reconstruct from bundle`);
    console.log(`  ${col(C.cyan, 'purpclaw identity diff <path>')}        show what would change`);
    console.log(`  ${col(C.cyan, 'purpclaw identity set <field> <value>')}  update a field (e.g. providers.default ollama)`);
    console.log(`  ${col(C.cyan, 'purpclaw identity reset [--force]')}    start fresh\n`);
    return;
  }

  if (sub === 'show') {
    const s = showIdentity();
    console.log(`\n  ${col(C.cyan, '🪪  PORTABLE IDENTITY')}\n`);
    console.log(`  ${col(C.gray, 'Location:')}  ${IDENTITY_PATH}`);
    console.log('');
    console.log(`  ${col(C.cyan, 'Profile:')}`);
    console.log(`    name:    ${s.profile.name || col(C.gray, '(unset)')}`);
    console.log(`    locale:  ${s.profile.locale}`);
    console.log('');
    console.log(`  ${col(C.cyan, 'Brain:')}`);
    console.log(`    default provider: ${col(C.white, s.providers.default)}`);
    console.log(`    fallback chain:   ${s.providers.fallback.join(' → ')}`);
    console.log('');
    console.log(`  ${col(C.cyan, 'Budget:')}`);
    console.log(`    daily:   ${s.budget.daily.toLocaleString()} tokens`);
    console.log(`    monthly: ${s.budget.monthly.toLocaleString()} tokens`);
    console.log('');
    console.log(`  ${col(C.cyan, 'Agents:')}     ${s.agents.enabled_count} enabled, ${s.agents.favourites.length} favourites`);
    console.log(`  ${col(C.cyan, 'Skills:')}     ${s.skills.enabled_count} enabled`);
    console.log(`  ${col(C.cyan, 'Routing jobs:')}  ${s.routing.join(', ')}`);
    console.log(`  ${col(C.cyan, 'Corrections:')}  ${s.corrections} learned\n`);
    return;
  }

  if (sub === 'export') {
    const dest = rest[0] || path.join(os.homedir(), `purpclaw-identity-${Date.now()}.json`);
    const r = exportIdentity(dest);
    console.log(`  ${col(C.green, '✓')}  Exported to ${col(C.cyan, r.path)}`);
    console.log(`  ${col(C.gray, `Sections: ${r.sections.join(', ')}`)}`);
    console.log('');
    return;
  }

  if (sub === 'import') {
    const src = rest[0];
    if (!src) {
      console.log(`\n  ${col(C.yellow, 'usage:')} purpclaw identity import <path> [--force]\n`);
      return;
    }
    try {
      const r = importIdentity(src, { force: rest.includes('--force') });
      if (!r.changed) {
        console.log(`\n  ${col(C.gray, 'No changes to apply')}\n`);
      } else {
        console.log(`\n  ${col(C.green, '✓')}  Identity imported from ${col(C.cyan, src)}`);
        console.log(`  ${col(C.gray, 'Backup:')}  ${IDENTITY_PATH}.bak\n`);
      }
    } catch (e) {
      console.log(`  ${col(C.red, '✗')}  ${e.message}\n`);
    }
    return;
  }

  if (sub === 'diff') {
    const src = rest[0];
    if (!src || !fs.existsSync(src)) {
      console.log(`\n  ${col(C.yellow, 'usage:')} purpclaw identity diff <path>\n`);
      return;
    }
    const proposed = JSON.parse(fs.readFileSync(src, 'utf8'));
    const d = diffIdentity(proposed);
    const total = Object.keys(d.added).length + Object.keys(d.changed).length + Object.keys(d.removed).length;
    if (total === 0) {
      console.log(`\n  ${col(C.gray, 'No changes would be applied')}\n`);
      return;
    }
    console.log(`\n  ${col(C.cyan, '🪪  IDENTITY DIFF')}  (${total} changes)\n`);
    if (Object.keys(d.added).length > 0) {
      console.log(`  ${col(C.green, '+ Added:')}`);
      for (const k of Object.keys(d.added)) console.log(`    ${k}`);
    }
    if (Object.keys(d.changed).length > 0) {
      console.log(`  ${col(C.yellow, '~ Changed:')}`);
      for (const [k, v] of Object.entries(d.changed)) {
        console.log(`    ${k}`);
        console.log(`        was: ${JSON.stringify(v.from).substring(0, 60)}`);
        console.log(`        now: ${JSON.stringify(v.to).substring(0, 60)}`);
      }
    }
    if (Object.keys(d.removed).length > 0) {
      console.log(`  ${col(C.red, '- Removed:')}`);
      for (const k of Object.keys(d.removed)) console.log(`    ${k}`);
    }
    console.log('');
    return;
  }

  if (sub === 'set') {
    const field = rest[0];
    const value = rest.slice(1).join(' ');
    if (!field || !value) {
      console.log(`\n  ${col(C.yellow, 'usage:')} purpclaw identity set <section.field> <value>\n`);
      return;
    }
    const [section, key] = field.split('.');
    const current = loadIdentity();
    if (!current[section]) {
      console.log(`  ${col(C.yellow, '⚠')}  Unknown section: ${section}\n`);
      return;
    }
    if (typeof current[section][key] === 'number') {
      current[section][key] = parseFloat(value) || value;
    } else if (typeof current[section][key] === 'boolean') {
      current[section][key] = value === 'true';
    } else if (Array.isArray(current[section][key])) {
      current[section][key] = value.split(',').map(s => s.trim());
    } else {
      current[section][key] = value;
    }
    saveIdentity(current);
    console.log(`  ${col(C.green, '✓')}  Set ${field} = ${value}\n`);
    return;
  }

  if (sub === 'reset') {
    const force = rest.includes('--force');
    if (!force) {
      console.log(`\n  ${col(C.yellow, '⚠')}  This will reset your identity to defaults.`);
      console.log(`  ${col(C.gray, 'Add --force to confirm.')}\n`);
      return;
    }
    saveIdentity(require('../identity').defaultIdentity());
    console.log(`  ${col(C.green, '✓')}  Identity reset to defaults\n`);
    return;
  }
}

module.exports = { run };
