#!/usr/bin/env node

/**
 * Quick Authentication Flow Test
 * Tests the complete sign-in flow from UI to API
 */

const BASE_URL = 'http://localhost:3099';

async function testAuthFlow() {
  console.log('🧪 Testing Complete Authentication Flow\n');

  try {
    // Test 1: Check sign-in page loads
    console.log('1. Testing sign-in page...');
    const signInPage = await fetch(`${BASE_URL}/en/auth/signin`);
    if (signInPage.ok) {
      console.log('✅ Sign-in page loads successfully');
    } else {
      console.log('❌ Sign-in page failed to load');
      return;
    }

    // Test 2: Check Melody API endpoints
    console.log('\n2. Testing Melody API endpoints...');

    // Session endpoint
    const sessionResponse = await fetch(`${BASE_URL}/api/auth/melody/session`);
    const sessionData = await sessionResponse.json();
    console.log(`✅ Session endpoint: ${sessionResponse.status} - ${sessionData.authenticated ? 'authenticated' : 'not authenticated'}`);

    // Test 3: Test credential authentication
    console.log('\n3. Testing credential authentication...');
    const authResponse = await fetch(`${BASE_URL}/api/auth/melody`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'credentials',
        email: 'test@example.com',
        password: 'test123'
      })
    });

    if (authResponse.ok) {
      const authData = await authResponse.json();
      console.log('✅ Authentication successful:', authData.user?.email);

      // Check if session cookie was set
      const setCookie = authResponse.headers.get('set-cookie');
      if (setCookie && setCookie.includes('melody-session')) {
        console.log('✅ Session cookie set correctly');
      } else {
        console.log('⚠️  Session cookie not found');
      }

      // Test 4: Test session validation with cookie
      console.log('\n4. Testing session validation...');
      const sessionCheck = await fetch(`${BASE_URL}/api/auth/melody/session`, {
        headers: {
          'Cookie': setCookie || ''
        }
      });

      if (sessionCheck.ok) {
        const sessionCheckData = await sessionCheck.json();
        if (sessionCheckData.authenticated) {
          console.log('✅ Session validation successful');
        } else {
          console.log('⚠️  Session validation failed');
        }
      }

    } else {
      const errorData = await authResponse.json();
      console.log('❌ Authentication failed:', errorData.error);
    }

    console.log('\n🎉 Authentication flow test completed!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testAuthFlow();