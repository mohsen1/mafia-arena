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
  console.log('Testing image comparison logic...');
  
  // Create test screenshots directory
  await fs.mkdir('./test-screenshots', { recursive: true });
  
  // Take two screenshots with a small delay
  console.log('📸 Taking first screenshot...');
  await execAsync('screencapture -x "./test-screenshots/test1.png"');
  
  console.log('⏱️  Waiting 2 seconds...');
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  console.log('📸 Taking second screenshot...');
  await execAsync('screencapture -x "./test-screenshots/test2.png"');
  
  // Import the automation class to test comparison
  const CursorUnblockAutomation = require('./cursor-unblock-automation.js');
  const automation = new CursorUnblockAutomation();
  
  const similarity = await automation.getImageSimilarity('./test-screenshots/test1.png', './test-screenshots/test2.png');
  console.log(`🔍 Similarity: ${(similarity * 100).toFixed(1)}%`);
  
  const areSimilar = await automation.compareImages('./test-screenshots/test1.png', './test-screenshots/test2.png');
  console.log(`📊 Are images similar? ${areSimilar ? 'Yes' : 'No'}`);
  
  // Cleanup
  await fs.unlink('./test-screenshots/test1.png');
  await fs.unlink('./test-screenshots/test2.png');
  await fs.rmdir('./test-screenshots');
}

async function testSimilarityThreshold() {
  console.log('Testing with different similarity thresholds...');
  
  const thresholds = [0.90, 0.95, 0.98, 0.99];
  
  for (const threshold of thresholds) {
    console.log(`\n🎯 Testing with ${(threshold * 100).toFixed(0)}% similarity threshold`);
    
    const testEnv = { 
      ...process.env, 
      TEST_MODE: 'true',
      SIMILARITY_THRESHOLD: threshold.toString()
    };
    
    console.log(`   📊 This would require ${(threshold * 100).toFixed(0)}% similarity to trigger`);
    
    // You would run the automation here with this threshold
    // For now, just log what would happen
  }
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
      name: 'High Sensitivity Test',
      command: 'SIMILARITY_THRESHOLD=0.90 pnpm automation:test',
      description: 'More sensitive to small changes (90% similarity threshold)'
    },
    {
      name: 'Low Sensitivity Test',
      command: 'SIMILARITY_THRESHOLD=0.99 pnpm automation:test',
      description: 'Less sensitive to small changes (99% similarity threshold)'
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
    console.log('  compare    - Test image comparison logic');
    console.log('  threshold  - Test different similarity thresholds');
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
      await runTest('Image Comparison', testImageComparison);
      break;
    case 'threshold':
      await runTest('Similarity Threshold', testSimilarityThreshold);
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