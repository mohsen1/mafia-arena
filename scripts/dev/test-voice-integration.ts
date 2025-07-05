#!/usr/bin/env tsx

/**
 * Test voice integration in the game
 */

import { chromium, ConsoleMessage } from '@playwright/test';

async function testVoiceIntegration() {
  console.log('🎮 Testing Werewolf AI Voice Integration...\n');

  const browser = await chromium.launch({ 
    headless: false,
    args: ['--use-fake-ui-for-media-stream'] // Allow audio without permission prompt
  });
  
  const context = await browser.newContext({
    permissions: ['microphone'],
  });
  
  const page = await context.newPage();

  // Enable console logging
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.text().includes('[MessageBubble]') || msg.text().includes('[SpeakText]')) {
      console.log('Browser console:', msg.text());
    }
  });

  try {
    // 1. Test voice test page
    console.log('1️⃣ Testing voice test page...');
    await page.goto('http://localhost:3099/voice-test');
    await page.waitForLoadState('networkidle');
    
    // Click show test messages
    const showButton = await page.locator('button:has-text("Show Test Messages")');
    if (await showButton.isVisible()) {
      await showButton.click();
      console.log('✅ Voice test page loaded, messages shown');
      
      // Wait for SpeakText components
      await page.waitForTimeout(2000);
      
      // Check if SpeakText is rendered
      const speakTextElements = await page.locator('[class*="SpeakText"]').count();
      console.log(`   Found ${speakTextElements} SpeakText elements`);
    }

    // 2. Test game with voice mode
    console.log('\n2️⃣ Starting new game with voice mode...');
    await page.goto('http://localhost:3099/new');
    await page.waitForLoadState('networkidle');
    
    // Check for voice mode checkbox
    const voiceModeCheckbox = await page.locator('input#voice-mode');
    if (await voiceModeCheckbox.isVisible()) {
      console.log('✅ Voice mode checkbox found');
      
      // Check the voice mode checkbox
      await voiceModeCheckbox.check();
      console.log('✅ Voice mode enabled');
      
      // Start the game
      const startButton = await page.locator('button:has-text("Start Game")');
      await startButton.click();
      console.log('✅ Game started');
      
      // Wait for game to load
      await page.waitForURL(/\/game\//, { timeout: 30000 });
      console.log('✅ Game page loaded');
      
      // Wait for messages to appear
      await page.waitForTimeout(5000);
      
      // Check console logs for voice activity
      const logs = await page.evaluate(() => {
        return window.performance.getEntriesByType('resource')
          .filter(entry => entry.name.includes('/api/speak'))
          .length;
      });
      
      console.log(`\n📊 Voice API calls made: ${logs}`);
      
      // Check if audio toggle is visible
      const audioToggle = await page.locator('button[aria-label*="audio" i], button[aria-label*="mute" i]');
      if (await audioToggle.isVisible()) {
        console.log('✅ Audio toggle button is visible');
      }
      
    } else {
      console.error('❌ Voice mode checkbox not found!');
    }

    console.log('\n✨ Voice integration test complete!');
    console.log('\nTo manually verify:');
    console.log('1. Check if you hear voices speaking the messages');
    console.log('2. Check if words are highlighted as they are spoken');
    console.log('3. Check if the game waits for speech to finish before proceeding');
    
    // Keep browser open for manual verification
    console.log('\n⏸️  Browser will stay open for manual testing. Press Ctrl+C to exit.');
    await new Promise(() => {}); // Keep running

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    // Browser will be closed when script is terminated
  }
}

testVoiceIntegration().catch(console.error); 