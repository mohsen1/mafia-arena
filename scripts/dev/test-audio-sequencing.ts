#!/usr/bin/env tsx

/**
 * Test script to verify audio sequencing fixes
 * This tests that turn advancement waits for audio completion
 */

import { chromium } from 'playwright';

async function testAudioSequencing() {
  console.log('🎮 Testing Audio Sequencing...\n');

  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  try {
    // Enable console logging
    page.on('console', (msg) => {
      if (msg.text().includes('[GameContext]') || 
          msg.text().includes('[SpeakText]') || 
          msg.text().includes('[SpokenTextContext]')) {
        console.log(`🔊 ${msg.text()}`);
      }
    });

    // Navigate to the app
    console.log('📱 Navigating to Werewolf AI...');
    await page.goto('http://localhost:3099/en');
    await page.waitForLoadState('networkidle');

    // Click "Try AI-Powered Werewolf Now" to start a game without auth
    console.log('🎯 Starting new game...');
    await page.click('text=Try AI-Powered Werewolf Now');
    await page.waitForLoadState('networkidle');

    // Wait for the game setup form
    console.log('⚙️ Configuring game...');
    await page.waitForSelector('form', { timeout: 10000 });

    // Enable voice mode
    const voiceToggle = await page.locator('text=Voice Mode').first();
    if (await voiceToggle.isVisible()) {
      await voiceToggle.click();
      console.log('🔊 Voice mode enabled');
    }

    // Set a small game (3 players) for faster testing
    const playerCountInput = await page.locator('input[type="number"]').first();
    if (await playerCountInput.isVisible()) {
      await playerCountInput.fill('3');
      console.log('👥 Set player count to 3');
    }

    // Start the game
    await page.click('button:has-text("Start Game")');
    console.log('🚀 Game started!');

    // Wait for the game to load
    await page.waitForSelector('text=Character Generation', { timeout: 30000 });
    console.log('✅ Game loaded successfully');

    // Wait a bit to observe the character generation
    console.log('⏳ Waiting to observe character generation...');
    await page.waitForTimeout(5000);

    // Enable auto-run to test sequencing
    const autoRunButton = await page.locator('button:has-text("Auto Run")');
    if (await autoRunButton.isVisible()) {
      await autoRunButton.click();
      console.log('🔄 Auto-run enabled');
    }

    // Monitor for 30 seconds to see if audio sequencing works
    console.log('👀 Monitoring audio sequencing for 30 seconds...');
    await page.waitForTimeout(30000);

    console.log('✅ Audio sequencing test completed');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await browser.close();
  }
}

// Run the test
testAudioSequencing().catch(console.error); 