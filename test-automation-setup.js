#!/usr/bin/env node

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;

const execAsync = promisify(exec);

async function testSetup() {
  console.log('🧪 Testing Cursor Unblock Automation Setup...\n');
  
  let allTestsPassed = true;
  
  // Test 1: Check Node.js version
  console.log('1. Testing Node.js version...');
  try {
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
    if (majorVersion >= 16) {
      console.log(`   ✅ Node.js ${nodeVersion} (requirement: >= 16.0.0)`);
    } else {
      console.log(`   ❌ Node.js ${nodeVersion} is too old (requirement: >= 16.0.0)`);
      allTestsPassed = false;
    }
  } catch (error) {
    console.log(`   ❌ Failed to check Node.js version: ${error.message}`);
    allTestsPassed = false;
  }
  
  // Test 2: Check if cliclick is installed
  console.log('\n2. Testing cliclick installation...');
  try {
    await execAsync('which cliclick');
    console.log('   ✅ cliclick is installed');
  } catch (error) {
    console.log('   ❌ cliclick is not installed');
    console.log('   💡 Install with: brew install cliclick');
    allTestsPassed = false;
  }
  
  // Test 3: Check if screencapture is available
  console.log('\n3. Testing screencapture availability...');
  try {
    await execAsync('which screencapture');
    console.log('   ✅ screencapture is available');
  } catch (error) {
    console.log('   ❌ screencapture is not available (macOS required)');
    allTestsPassed = false;
  }
  
  // Test 4: Check Gemini API key
  console.log('\n4. Testing Gemini API key...');
  
  // Try to load from .env file first
  try {
    const fs = require('fs');
    const path = require('path');
    const envPath = path.join(__dirname, '.env');
    const envContent = fs.readFileSync(envPath, 'utf8');
    const envLines = envContent.split('\n').filter(line => line.trim() && !line.startsWith('#'));
    
    envLines.forEach(line => {
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length > 0) {
        const value = valueParts.join('=').replace(/^["']|["']$/g, '');
        process.env[key.trim()] = value;
      }
    });
    console.log('   ✅ .env file found and loaded');
  } catch (error) {
    console.log('   ℹ️  No .env file found, checking environment variables');
  }
  
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    if (apiKey.length > 10) {
      console.log('   ✅ Gemini API key is set');
    } else {
      console.log('   ⚠️  Gemini API key seems too short');
      allTestsPassed = false;
    }
  } else {
    console.log('   ❌ Gemini API key is not set');
    console.log('   💡 Set with: cp automation.env.example .env');
    console.log('   💡 Then edit .env and add your GEMINI_API_KEY');
    allTestsPassed = false;
  }
  
  // Test 5: Check if node-fetch is available
  console.log('\n5. Testing node-fetch dependency...');
  try {
    require('node-fetch');
    console.log('   ✅ node-fetch is installed');
  } catch (error) {
    console.log('   ❌ node-fetch is not installed');
    console.log('   💡 Install with: npm install node-fetch@3.3.2');
    allTestsPassed = false;
  }
  
  // Test 6: Test screenshot capture
  console.log('\n6. Testing screenshot capture...');
  try {
    const testDir = './test-screenshots';
    await fs.mkdir(testDir, { recursive: true });
    
    const testFile = `${testDir}/test-screenshot.png`;
    await execAsync(`screencapture -x "${testFile}"`);
    
    const stats = await fs.stat(testFile);
    if (stats.size > 0) {
      console.log('   ✅ Screenshot capture works');
      // Clean up test file
      await fs.unlink(testFile);
      await fs.rmdir(testDir);
    } else {
      console.log('   ❌ Screenshot file is empty');
      allTestsPassed = false;
    }
  } catch (error) {
    console.log(`   ❌ Screenshot capture failed: ${error.message}`);
    console.log('   💡 Grant Terminal screen recording permissions in System Preferences');
    allTestsPassed = false;
  }
  
  // Test 7: Test Cursor app detection
  console.log('\n7. Testing Cursor app detection...');
  try {
    await execAsync('osascript -e \'tell application "System Events" to get name of every process\'');
    console.log('   ✅ Can access running applications');
    
    try {
      const { stdout } = await execAsync('osascript -e \'tell application "System Events" to get name of every process\' | grep -i cursor');
      if (stdout.includes('Cursor')) {
        console.log('   ✅ Cursor app is currently running');
      } else {
        console.log('   ⚠️  Cursor app is not currently running');
        console.log('   💡 Start Cursor to test focusing functionality');
      }
    } catch (error) {
      console.log('   ⚠️  Cursor app is not currently running');
      console.log('   💡 Start Cursor to test focusing functionality');
    }
  } catch (error) {
    console.log(`   ❌ Cannot access running applications: ${error.message}`);
    allTestsPassed = false;
  }
  
  // Test 8: Test basic cliclick functionality
  console.log('\n8. Testing cliclick functionality...');
  try {
    await execAsync('cliclick p:.');
    console.log('   ✅ cliclick can get mouse position');
  } catch (error) {
    console.log(`   ❌ cliclick test failed: ${error.message}`);
    allTestsPassed = false;
  }
  
  // Summary
  console.log('\n' + '='.repeat(50));
  if (allTestsPassed) {
    console.log('🎉 All tests passed! The automation setup is ready.');
    console.log('\n💡 To run the automation:');
    console.log('   pnpm automation           # Normal mode (3-minute intervals)');
    console.log('   pnpm automation:test      # Test mode (10-second intervals)');
    console.log('   pnpm automation:manual    # Manual trigger mode');
  } else {
    console.log('❌ Some tests failed. Please fix the issues above before running the automation.');
  }
  console.log('='.repeat(50));
}

// Run the test
testSetup().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
}); 