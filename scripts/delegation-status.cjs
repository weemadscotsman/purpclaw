#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { getDelegationStatus } = require('../lib/delegation-status');

const root = path.resolve(__dirname, '..');

function main() {
  const summary = getDelegationStatus({ rootDir: root });
  if (!summary.ok) {
    console.error(summary.error || 'Delegation status failed');
    process.exit(1);
  }

  console.log(JSON.stringify(summary, null, 2));
  if (process.argv.includes('--strict') && summary.waiting > 0) process.exitCode = 2;
}

main();
