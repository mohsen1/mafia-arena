#!/usr/bin/env node

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;

const execAsync = promisify(exec);

console.log('🧪 Cursor Automation Test Suite');
console.log('================================\n');

async function runTest(testName, testFunction) {
  console.log(`🔬 Running test: ${testName}`);
  try {
    await testFunction();
    console.log(`✅ Test passed: ${testName}\n`);
  } catch (error) {
    console.log(`❌ Test failed: ${testName} - ${error.message}\n`);
  }
}

async function testQuickMode() {
  console.log('Starting automation in test mode (10-second intervals)...');
  process.env.TEST_MODE = 'true';
  
  const { spawn } = require('child_process');
  const automation = spawn('node', ['cursor-unblock-automation.js'], {
    env: { ...process.env, TEST_MODE: 'true' },
    stdio: 'inherit'
  });
  
  console.log('⏱️  Automation will take screenshots every 10 seconds');
  console.log('🎯 Press "t" + Enter to trigger manual analysis');
  console.log('🛑 Press Ctrl+C to stop');
  
  // Handle cleanup
  process.on('SIGINT', () => {
    console.log('\n🛑 Stopping test automation...');
    automation.kill('SIGINT');
    process.exit(0);
  });
  
  await new Promise(() => {}); // Keep running until interrupted
}

async function testManualTrigger() {
  console.log('Starting automation with manual trigger...');
  
  const { spawn } = require('child_process');
  const automation = spawn('node', ['cursor-unblock-automation.js'], {
    env: { ...process.env, MANUAL_TRIGGER: 'true' },
    stdio: 'inherit'
  });
  
  console.log('🎯 Manual trigger enabled - will analyze on next screenshot');
  console.log('🛑 Press Ctrl+C to stop');
  
  // Handle cleanup
  process.on('SIGINT', () => {
    console.log('\n🛑 Stopping test automation...');
    automation.kill('SIGINT');
    process.exit(0);
  });
  
  await new Promise(() => {}); // Keep running until interrupted
}

async function testImageComparison() {
  console.log('Testing window capture and hash comparison...');
  
  // Create test screenshots directory
  await fs.mkdir('./test-screenshots', { recursive: true });
  
  // Import the automation class to test window capture
  const CursorUnblockAutomation = require('./cursor-unblock-automation.js');
  const automation = new CursorUnblockAutomation();
  
  // Test window ID detection
  console.log('🎯 Testing Cursor window detection...');
  const windowId = await automation.getCursorWindowId();
  if (windowId) {
    console.log(`   ✅ Found Cursor window ID: ${windowId}`);
    
    // Take screenshot of Cursor window
    console.log('📸 Taking Cursor window screenshot...');
    await execAsync(`screencapture -l ${windowId} -x "./test-screenshots/cursor-test.png"`);
    
    // Test hash generation
    const hash = await automation.getImageHash('./test-screenshots/cursor-test.png');
    console.log(`🔍 Screenshot hash: ${hash}`);
    
    // Take another screenshot and compare
    console.log('⏱️  Waiting 2 seconds...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('📸 Taking second Cursor window screenshot...');
    await execAsync(`screencapture -l ${windowId} -x "./test-screenshots/cursor-test2.png"`);
    
    const hash2 = await automation.getImageHash('./test-screenshots/cursor-test2.png');
    console.log(`🔍 Second screenshot hash: ${hash2}`);
    
    console.log(`📊 Are hashes identical? ${hash === hash2 ? 'Yes (stuck state!)' : 'No (different content)'}`);
    
    // Cleanup
    await fs.unlink('./test-screenshots/cursor-test.png');
    await fs.unlink('./test-screenshots/cursor-test2.png');
  } else {
    console.log('   ⚠️  Cursor window not found - make sure Cursor is running and visible');
  }
  
  await fs.rmdir('./test-screenshots');
}



async function createTestScenarios() {
  console.log('Creating test scenarios...');
  
  const scenarios = [
    {
      name: 'Normal Mode',
      command: 'pnpm automation',
      description: 'Standard automation with 3-minute intervals'
    },
    {
      name: 'Quick Test Mode',
      command: 'pnpm automation:test',
      description: 'Screenshots every 10 seconds, manual trigger with "t" + Enter'
    },
    {
      name: 'Manual Trigger Test',
      command: 'pnpm automation:manual',
      description: 'Triggers analysis on next screenshot immediately'
    },
    {
      name: 'Window Detection Test',
      command: 'TEST_MODE=true pnpm automation:test',
      description: 'Test mode with detailed window detection logging'
    },
    {
      name: 'Custom App Name Test',
      command: 'CURSOR_APP_NAME="YourAppName" pnpm automation:test',
      description: 'Test with different Cursor app name'
    }
  ];
  
  console.log('\n📋 Available Test Scenarios:');
  console.log('============================\n');
  
  scenarios.forEach((scenario, index) => {
    console.log(`${index + 1}. ${scenario.name}`);
    console.log(`   Command: ${scenario.command}`);
    console.log(`   Description: ${scenario.description}\n`);
  });
  
  return scenarios;
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage: pnpm automation:test-suite [command]');
    console.log('\nAvailable commands:');
    console.log('  quick      - Run in quick test mode (10-second intervals)');
    console.log('  manual     - Run with manual trigger');
    console.log('  compare    - Test window capture and hash comparison');
    console.log('  scenarios  - Show all available test scenarios');
    console.log('\nExample: pnpm automation:test-suite quick');
    return;
  }
  
  const command = args[0];
  
  switch (command) {
    case 'quick':
      await testQuickMode();
      break;
    case 'manual':
      await testManualTrigger();
      break;
    case 'compare':
      await runTest('Window Capture & Hash Comparison', testImageComparison);
      break;
    case 'scenarios':
      await createTestScenarios();
      break;
    default:
      console.log(`❌ Unknown command: ${command}`);
      console.log('Run without arguments to see available commands');
  }
}

main().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
}); 