#!/usr/bin/env tsx

import { chromium } from 'playwright';

async function testVoiceGame() {
  console.log('🎮 Starting Werewolf AI Voice Game Test...\n');

  const browser = await chromium.launch({
    headless: false, // Show the browser
  });

  const context = await browser.newContext({
    permissions: ['microphone'], // Grant microphone permission
  });

  const page = await context.newPage();

  // Enable console logging
  page.on('console', (msg) => {
    const text = msg.text();
    
    // Color code voice-related logs
    if (text.includes('[SpeakText]') || 
        text.includes('[SpokenTextContext]') || 
        text.includes('[MessageBubble]') || 
        text.includes('[GameContext]')) {
      console.log(`\x1b[36m${text}\x1b[0m`); // Cyan for voice logs
    } else if (text.includes('error') || text.includes('Error')) {
      console.error(`\x1b[31m${text}\x1b[0m`); // Red for errors
    } else {
      console.log(text);
    }
  });

  // Also capture page errors
  page.on('pageerror', (error) => {
    console.error('\x1b[31m[Page Error]\x1b[0m', error.message);
  });

  try {
    console.log('1️⃣ Navigating to game setup page...');
    await page.goto('http://localhost:3099/en/new');
    await page.waitForLoadState('networkidle');

    console.log('2️⃣ Starting a quick 5-player game...');
    // Click on the 5-player quick game option
    const quickGameButton = page.locator('text=Quick Game').first();
    if (await quickGameButton.isVisible()) {
      await quickGameButton.click();
    } else {
      // If quick game button not visible, go to custom settings
      await page.click('text=Skip to custom settings');
      await page.waitForTimeout(1000);
      
      // Enable voice mode
      const voiceCheckbox = page.locator('label:has-text("Enable Voice Mode")').locator('input[type="checkbox"]');
      if (!(await voiceCheckbox.isChecked())) {
        await voiceCheckbox.click();
        console.log('✅ Voice mode enabled!');
      }
      
      // Start the game
      await page.click('button:has-text("Start Game")');
    }

    console.log('3️⃣ Waiting for game to start...');
    
    // Wait for navigation to game page
    await page.waitForURL('**/game/**', { timeout: 60000 });
    console.log('✅ Game started!');

    console.log('\n🎯 Voice game is now running!');
    console.log('👂 Listen for AI characters speaking their messages');
    console.log('🎤 You can use the microphone button to speak');
    console.log('\nVoice logs are shown in \x1b[36mcyan\x1b[0m color');
    console.log('Errors are shown in \x1b[31mred\x1b[0m color');
    console.log('\nPress Ctrl+C to stop the test.\n');

    // Keep the browser open and monitor
    await new Promise(() => {}); // Wait indefinitely
  } catch (error) {
    console.error('❌ Error during test:', error);
  }
}

// Run the test
testVoiceGame().catch(console.error); 