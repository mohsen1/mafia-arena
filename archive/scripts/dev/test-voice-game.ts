#!/usr/bin/env tsx

import { chromium } from 'playwright';

async function testVoiceGame() {
  console.log('🎮 Starting Werewolf AI Voice Game Test...\n');

  const browser = await chromium.launch({
    headless: false, // Show the browser
    devtools: true,  // Open devtools to see console logs
  });

  const context = await browser.newContext({
    permissions: ['microphone'], // Grant microphone permission
  });

  const page = await context.newPage();

  // Enable console logging
  page.on('console', (msg: any) => {
    const type = msg.type();
    const text = msg.text();
    
    // Color code based on log type
    if (type === 'error') {
      console.error(`[Browser Error] ${text}`);
    } else if (type === 'warning') {
      console.warn(`[Browser Warning] ${text}`);
    } else if (text.includes('[SpeakText]') || text.includes('[SpokenTextContext]') || text.includes('[MessageBubble]') || text.includes('[GameContext]')) {
      console.log(`\x1b[36m[Voice Log] ${text}\x1b[0m`); // Cyan for voice logs
    } else {
      console.log(`[Browser] ${text}`);
    }
  });

  try {
    console.log('1️⃣ Navigating to game setup page...');
    await page.goto('http://localhost:3099/en/new');
    await page.waitForLoadState('networkidle');

    console.log('2️⃣ Clicking on custom game settings...');
    // Click on "Skip to custom settings"
    await page.click('button:has-text("Skip to custom settings")');
    await page.waitForTimeout(1000);

    console.log('3️⃣ Configuring game settings...');
    
    // Set player count to 5
    const playerCountSlider = await page.locator('input[type="range"]').first();
    await playerCountSlider.fill('5');

    // Ensure "Join as Human Player" is checked
    const joinAsHumanCheckbox = await page.locator('input[type="checkbox"]').first();
    const isChecked = await joinAsHumanCheckbox.isChecked();
    if (!isChecked) {
      await joinAsHumanCheckbox.click();
    }

    // Enable voice mode
    console.log('4️⃣ Enabling voice mode...');
    const voiceCheckbox = await page.locator('text=Enable Voice Mode').locator('..').locator('input[type="checkbox"]');
    const voiceEnabled = await voiceCheckbox.isChecked();
    if (!voiceEnabled) {
      await voiceCheckbox.click();
      console.log('✅ Voice mode enabled!');
    } else {
      console.log('✅ Voice mode already enabled!');
    }

    // Select Groq provider (it's fast and works well)
    console.log('5️⃣ Selecting AI provider...');
    await page.click('button:has-text("groq")');
    await page.waitForTimeout(500);

    console.log('6️⃣ Starting the game...');
    await page.click('button:has-text("Start Game")');

    console.log('7️⃣ Waiting for character generation...');
    await page.waitForURL('**/character-setup', { timeout: 30000 });
    
    // Wait for character generation to complete
    await page.waitForSelector('text=Characters Ready!', { timeout: 120000 });
    console.log('✅ Characters generated!');

    // Wait for game to start
    await page.waitForURL('**/game/**', { timeout: 30000 });
    console.log('✅ Game started!');

    console.log('\n🎯 Voice game is now running! Watch the browser and console for voice logs.\n');
    console.log('Voice logs will appear in cyan color.');
    console.log('You should hear AI characters speaking their messages.');
    console.log('\nPress Ctrl+C to stop the test.\n');

    // Keep the browser open
    await new Promise(() => {}); // Wait indefinitely
  } catch (error) {
    console.error('❌ Error during test:', error);
  }
}

// Run the test
testVoiceGame().catch(console.error); 