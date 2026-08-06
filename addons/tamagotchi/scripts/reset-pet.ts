#!/usr/bin/env bun
import { StateManager } from '../src/engine/StateManager';
import { config } from '../src/utils/config';
import * as fs from 'fs';

async function resetPet() {
  console.log('🔄 Resetting Claude Code Pet...\n');
  
  const stateManager = new StateManager();
  
  try {
    // Delete existing state file
    if (fs.existsSync(config.stateFile)) {
      fs.unlinkSync(config.stateFile);
      console.log('✅ Deleted existing pet state');
    }
    
    // Delete any pending actions
    if (fs.existsSync(config.actionFile)) {
      fs.unlinkSync(config.actionFile);
      console.log('✅ Cleared pending actions');
    }
    
    // Create a fresh pet
    await stateManager.reset();
    console.log('✅ Created new pet\n');
    
    console.log('🎉 Pet has been reset successfully!');
    console.log('Your new pet is waiting for you in the statusline.');
    
  } catch (error) {
    console.error('❌ Failed to reset pet:', error);
    process.exit(1);
  }
}

resetPet().catch(console.error);