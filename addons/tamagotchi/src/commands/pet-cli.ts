#!/usr/bin/env bun

import { CommandProcessor } from './CommandProcessor';

// Join all arguments after the script name to handle commands with parameters
const args = process.argv.slice(2);
const command = args.length > 0 ? args.join(' ') : '/pet-help';

CommandProcessor.processCommand(command).then(result => {
  console.log(result);
  process.exit(0);
}).catch(error => {
  console.error('Error:', error);
  process.exit(1);
});