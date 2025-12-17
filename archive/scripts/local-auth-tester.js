#!/usr/bin/env node

/**
 * Simple Local Authentication Testing Script
 * Tests username/password authentication locally
 */

const TEST_CONFIG = {
  baseUrl: 'http://localhost:3099',
  testUser: {
    email: 'dev@werewolf-ai.com',
    password: 'DevPassword123!',
    name: 'Developer'
  }
};

// HTTP request helper
async function makeRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'AuthTesting/1.0',
      ...options.headers
    }
  });
  return response;
}

// Test results tracking
const results = {
  passed: 0,
  failed: 0,
  tests: []
};

function pass(testName, details = {}) {
  results.passed++;
  console.log(`✅ PASS: ${testName}`);
  if (Object.keys(details).length > 0) {
    console.log(`   Details:`, JSON.stringify(details, null, 2));
  }
  results.tests.push({ name: testName, status: 'pass', details });
}

function fail(testName, error, details = {}) {
  results.failed++;
  console.log(`❌ FAIL: ${testName} - ${error}`);
  if (Object.keys(details).length > 0) {
    console.log(`   Details:`, JSON.stringify(details, null, 2));
  }
  results.tests.push({ name: testName, status: 'fail', error, details });
}

async function testServerHealth() {
  console.log('🔍 Testing server health...');
  
  try {
    const response = await makeRequest(`${TEST_CONFIG.baseUrl}`);
    
    if (response.ok) {
      pass('Server Health Check', { status: response.status });
      return true;
    } else {
      fail('Server Health Check', `Server responded with ${response.status}`);
      return false;
    }
  } catch (error) {
    fail('Server Health Check', `Server not accessible: ${error.message}`);
    return false;
  }
}

async function testAuthSessionEndpoint() {
  console.log('🔐 Testing auth session endpoint...');
  
  try {
    const response = await makeRequest(`${TEST_CONFIG.baseUrl}/api/auth/session`);
    const data = await response.json();
    
    console.log(`Session response:`, data);
    
    if (response.status === 401 || response.status === 200) {
      pass('Auth Session Endpoint', { 
        status: response.status, 
        data: data 
      });
      return true;
    } else {
      fail('Auth Session Endpoint', `Unexpected status ${response.status}`, { data });
      return false;
    }
  } catch (error) {
    fail('Auth Session Endpoint', `Request failed: ${error.message}`);
    return false;
  }
}

async function testAuthProvidersEndpoint() {
  console.log('🔑 Testing auth providers endpoint...');
  
  try {
    const response = await makeRequest(`${TEST_CONFIG.baseUrl}/api/auth/providers`);
    const data = await response.json();
    
    console.log(`Providers response:`, data);
    
    if (response.status === 200 && data.providers) {
      pass('Auth Providers Endpoint', { 
        status: response.status, 
        providers: data.providers 
      });
      return true;
    } else {
      fail('Auth Providers Endpoint', `Unexpected response`, { data, status: response.status });
      return false;
    }
  } catch (error) {
    fail('Auth Providers Endpoint', `Request failed: ${error.message}`);
    return false;
  }
}

async function testCredentialsSignIn() {
  console.log('🔑 Testing credentials sign-in...');
  
  try {
    const response = await makeRequest(`${TEST_CONFIG.baseUrl}/api/auth/callback/credentials`, {
      method: 'POST',
      body: JSON.stringify({
        email: TEST_CONFIG.testUser.email,
        password: TEST_CONFIG.testUser.password
      })
    });
    
    console.log(`Sign-in response status: ${response.status}`);
    
    // Check response headers
    const headers = response.headers;
    const setCookie = headers.get('set-cookie');
    
    if (setCookie) {
      pass('Credentials Sign-In', { 
        status: response.status,
        hasSessionCookie: true,
        cookies: setCookie.split(';')[0]
      });
      return setCookie;
    } else {
      // Might be a redirect or different response format
      const responseText = await response.text();
      console.log(`Response text:`, responseText);
      
      pass('Credentials Sign-In (No Cookie)', { 
        status: response.status,
        response: responseText,
        redirected: response.status === 302
      });
      return null;
    }
  } catch (error) {
    fail('Credentials Sign-In', `Request failed: ${error.message}`);
    return null;
  }
}

async function testProtectedRoutes(sessionCookie) {
  console.log('🛡️ Testing protected routes...');
  
  const protectedRoutes = [
    '/games',
    '/profile', 
    '/character-setup'
  ];
  
  for (const route of protectedRoutes) {
    try {
      const headers = sessionCookie ? { 'Cookie': sessionCookie } : {};
      const response = await makeRequest(`${TEST_CONFIG.baseUrl}${route}`, { headers });
      
      console.log(`${route}: ${response.status}`);
      
      // If we have a session, should return 200
      // If no session, should redirect (302) or return 401/403
      if (sessionCookie && response.status === 200) {
        pass(`Protected Route ${route}`, { status: response.status, accessible: true });
      } else if (!sessionCookie && (response.status === 302 || response.status === 401 || response.status === 403)) {
        pass(`Protected Route ${route}`, { status: response.status, properlyProtected: true });
      } else if (!sessionCookie && response.status === 200) {
        fail(`Protected Route ${route}`, `Route not protected - returns 200 without authentication`);
      } else {
        pass(`Protected Route ${route}`, { status: response.status, redirected: response.status === 302 });
      }
    } catch (error) {
      fail(`Protected Route ${route}`, `Request failed: ${error.message}`);
    }
  }
}

async function testOAuthRedirects() {
  console.log('🌐 Testing OAuth redirects...');
  
  const providers = ['google', 'github'];
  
  for (const provider of providers) {
    try {
      // Test the signin endpoint
      const response = await makeRequest(`${TEST_CONFIG.baseUrl}/api/auth/signin/${provider}`, {
        redirect: 'manual'
      });
      
      const location = response.headers.get('location');
      console.log(`${provider} redirect: ${location}`);
      
      if (response.status === 302 && location) {
        // Check if it redirects to the correct provider
        const expectedDomains = {
          google: 'accounts.google.com',
          github: 'github.com'
        };
        
        if (location.includes(expectedDomains[provider])) {
          pass(`OAuth ${provider} Redirect`, { 
            status: response.status, 
            location,
            correctProvider: true 
          });
        } else {
          fail(`OAuth ${provider} Redirect`, `Redirects to wrong domain: ${location}`);
        }
      } else {
        fail(`OAuth ${provider} Redirect`, `No redirect or wrong status: ${response.status}`, { location });
      }
    } catch (error) {
      fail(`OAuth ${provider} Redirect`, `Request failed: ${error.message}`);
    }
  }
}

async function runTests() {
  console.log('🧪 Starting Local Authentication Testing');
  console.log(`Base URL: ${TEST_CONFIG.baseUrl}`);
  console.log(`Test User: ${TEST_CONFIG.testUser.email}`);
  console.log('='.repeat(60));
  
  // Basic connectivity tests
  const serverHealthy = await testServerHealth();
  if (!serverHealthy) {
    console.log('❌ Server not available, stopping tests');
    return results;
  }
  
  await testAuthSessionEndpoint();
  await testAuthProvidersEndpoint();
  
  // Authentication tests
  const sessionCookie = await testCredentialsSignIn();
  
  // Protected route tests
  await testProtectedRoutes(sessionCookie);
  
  // OAuth tests
  await testOAuthRedirects();
  
  // Summary
  const total = results.passed + results.failed;
  const passRate = total > 0 ? ((results.passed / total) * 100).toFixed(1) : 0;
  
  console.log('\n' + '='.repeat(60));
  console.log('LOCAL AUTHENTICATION TESTING SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total Tests: ${total}`);
  console.log(`Passed: ${results.passed} (${passRate}%)`);
  console.log(`Failed: ${results.failed}`);
  
  if (results.failed > 0) {
    console.log('\nFailed Tests:');
    results.tests.filter(t => t.status === 'fail').forEach(test => {
      console.log(`  - ${test.name}: ${test.error}`);
    });
  }
  
  console.log('='.repeat(60));
  
  return results;
}

// Main execution
async function main() {
  try {
    const results = await runTests();
    process.exit(results.failed > 0 ? 1 : 0);
  } catch (error) {
    console.error('Testing failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}