#!/usr/bin/env tsx

/**
 * Quick audio test script
 */

import { chromium } from 'playwright';

async function quickAudioTest() {
  console.log('🎮 Quick Audio Test Starting...\n');

  const browser = await chromium.launch({ 
    headless: false,
    args: ['--autoplay-policy=no-user-gesture-required']
  });
  
  const page = await browser.newPage();
  
  // Enable console logging for audio events
  page.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('[SpokenTextContext]') || 
        text.includes('[SpeakText]') || 
        text.includes('[GameContext]') || 
        text.includes('[MessageBubble]')) {
      console.log(`🔊 ${text}`);
    }
  });

  try {
    console.log('📱 Navigating to app...');
    await page.goto('http://localhost:3099/en');
    await page.waitForLoadState('networkidle');

    console.log('🎯 Going to new game page...');
    await page.goto('http://localhost:3099/en/new');
    await page.waitForLoadState('networkidle');

    // Wait for the page to load completely
    await page.waitForTimeout(2000);

    console.log('⚙️ Looking for custom game settings...');
    
    // Try to find custom settings button
    const customButton = await page.locator('text=Skip to custom settings').first();
    if (await customButton.isVisible({ timeout: 5000 })) {
      console.log('✅ Found custom settings button, clicking...');
      await customButton.click();
      await page.waitForTimeout(2000);
    } else {
      console.log('⚠️ Custom settings button not found, trying direct approach...');
      // Try to find any game start button
      const startButtons = await page.locator('button:has-text("Start")').all();
      if (startButtons.length > 0) {
        console.log(`Found ${startButtons.length} start buttons, clicking first...`);
        await startButtons[0].click();
        await page.waitForTimeout(2000);
      }
    }

    // Look for voice mode toggle
    console.log('🔊 Looking for voice mode toggle...');
    const voiceToggle = await page.locator('text=Voice Mode').first();
    if (await voiceToggle.isVisible({ timeout: 5000 })) {
      console.log('✅ Found voice mode toggle, enabling...');
      await voiceToggle.click();
      await page.waitForTimeout(1000);
    } else {
      console.log('⚠️ Voice mode toggle not found, continuing anyway...');
    }

    // Try to start a game
    console.log('🚀 Looking for start game button...');
    const startGameButton = await page.locator('button:has-text("Start Game")').first();
    if (await startGameButton.isVisible({ timeout: 5000 })) {
      console.log('✅ Found start game button, starting...');
      await startGameButton.click();
      
      console.log('⏳ Waiting for game to load...');
      await page.waitForTimeout(5000);
      
      console.log('👀 Monitoring audio logs for 30 seconds...');
      await page.waitForTimeout(30000);
      
    } else {
      console.log('❌ Start game button not found');
      console.log('📝 Current page content:');
      const pageContent = await page.textContent('body');
      console.log(pageContent?.substring(0, 500) + '...');
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    console.log('🧹 Closing browser...');
    await browser.close();
  }
}

// Run the test
quickAudioTest().catch(console.error); 